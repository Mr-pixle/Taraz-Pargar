// HTTP API and the web app. Every request is checked on the server: the signed-in person comes from an HttpOnly
// session cookie, reads are cut to what that person may see (view.ts), and writes go through the guarded reducer.
import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { COLLECTIONS, type Collection } from '../src/lib/collections'
import { canSeeRequest, canSyncProject, canViewTask, has } from '../src/lib/policy'
import type { Action } from '../src/lib/state'
import type { User } from '../src/lib/types'
import {
  clearCookie, clearFailures, createSession, dropSession, dropSessionsOf, parseCookies, passwordHashOf, passwordProblem,
  recordFailure, sessionCookie, sessionUser, setPassword, throttled, verifyPassword, COOKIE,
} from './auth'
import type { Core } from './core'
import type { Db } from './db'
import type { Jobs } from './jobs'
import { filesOf, prepare, Rejected } from './sanitize'
import { deltaOf, sentOf, viewOf, type Sent } from './view'

export interface AppConfig {
  core: Core; jobs: Jobs; db: Db
  staticDir: string | null
  secureCookies: boolean
  syncEveryHours: number; writebackDelaySec: number; schedule: boolean
  version: string
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

const MAX_FILE = 3 * 1024 * 1024
const MAX_FILES = 8
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': data.length, ...headers })
  res.end(data)
}

async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const type = String(req.headers['content-type'] ?? '')
  if (!type.startsWith('application/json')) throw new HttpError(415, 'درخواست باید JSON باشد.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > limit) throw new HttpError(413, 'حجم درخواست بیش از حد مجاز است.')
    chunks.push(c as Buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw new HttpError(400, 'JSON نامعتبر است.') }
}

const publicUser = ({ password: _p, ...u }: User) => u

export function createApp(cfg: AppConfig) {
  const { core, jobs, db } = cfg
  // what each open tab already has, so the next read sends only what changed
  const views = new Map<string, { token: string; sent: Sent; at: number }>()
  let indexHtml: string | null = null

  const serverInfo = (me: User) => (has(me, 'control.section') ? {
    google: { configured: !!jobs.googleEmail, email: jobs.googleEmail }, syncEveryHours: cfg.schedule ? cfg.syncEveryHours : 0, writebackDelaySec: cfg.writebackDelaySec,
  } : {})

  async function auth(req: IncomingMessage) {
    const token = parseCookies(req.headers.cookie)[COOKIE]
    const s = await sessionUser(db, token)
    if (!s) return null
    const me = core.state.users.find((u) => u.id === s.userId)
    if (!me || me.status !== 'active') return null
    return { me, key: s.key, token: token! }
  }
  async function need(req: IncomingMessage) {
    const a = await auth(req)
    if (!a) throw new HttpError(401, 'برای این کار باید وارد شوید.')
    return a
  }
  const ip = (req: IncomingMessage) => String(req.socket.remoteAddress ?? '')

  /** Files of an action are stored with it in one transaction; the state keeps only their URL */
  function takeFiles(action: Action) {
    const files = filesOf(action)
    if (!files) return { action, rows: [] as { id: string; name: string; mime: string; size: number; data: Buffer }[] }
    if (files.length > MAX_FILES) throw new Rejected(`حداکثر ${MAX_FILES} فایل در هر بار.`)
    const rows: { id: string; name: string; mime: string; size: number; data: Buffer }[] = []
    const out = files.map((f) => {
      const m = /^data:([\w.+-]+\/[\w.+-]+)?(;[^,]*)?;base64,([A-Za-z0-9+/=\s]*)$/.exec(String(f?.dataUrl ?? ''))
      if (!m) throw new Rejected('فایل نامعتبر است.')
      const data = Buffer.from(m[3], 'base64')
      if (data.length > MAX_FILE) throw new Rejected('حجم هر فایل حداکثر ۳ مگابایت است.')
      const id = `fl-${randomBytes(12).toString('base64url')}`
      const name = String(f.name ?? 'file').slice(0, 200)
      const mime = String(m[1] ?? f.mime ?? 'application/octet-stream').slice(0, 100)
      rows.push({ id, name, mime, size: data.length, data })
      return { name, mime, size: data.length, dataUrl: `/api/files/${id}` }
    })
    return { action: { ...action, files: out } as Action, rows }
  }

  async function onAction(req: IncomingMessage, res: ServerResponse) {
    const { me } = await need(req)
    const body = await readBody(req, 40 * 1024 * 1024) as { action?: unknown }
    let prepared
    try {
      prepared = prepare(body.action, me, core.state.tasks)
      const f = takeFiles(prepared.action)
      prepared = { ...prepared, action: f.action, files: f.rows }
    } catch (e) {
      if (!(e instanceof Rejected)) throw e
      // not something the app sends: recorded as a security event
      await core.audit({ userId: me.id, kind: 'security', text: `درخواست ردشده (${String((body.action as { type?: unknown })?.type ?? '?').slice(0, 40)}): ${e.message}` })
      return send(res, 403, { ok: false, denial: e.message })
    }
    const { action, newPassword, files } = prepared
    const out = await core.dispatch(me.id, action, async (c) => {
      for (const f of files) await c.query('INSERT INTO files (id, name, mime, size, data, owner) VALUES ($1, $2, $3, $4, $5, $6)', [f.id, f.name, f.mime, f.size, f.data, me.id])
      if (newPassword) await setPassword(c, newPassword.userId, newPassword.password)
      // an account that is disabled or rejected is signed out everywhere at once
      const a = action as { type: string; id?: string; patch?: Partial<User> }
      if (a.type === 'updateUser' && a.patch?.status && a.patch.status !== 'active') await dropSessionsOf(c, String(a.id))
    })
    if (out.denial) return send(res, 403, { ok: false, denial: out.denial })
    send(res, 200, { ok: true, v: core.version })
  }

  async function onState(req: IncomingMessage, res: ServerResponse, url: URL) {
    const { me, key } = await need(req)
    const client = (url.searchParams.get('client') ?? '').slice(0, 64)
    const base = url.searchParams.get('base') ?? ''
    const view = viewOf(core.state, me)
    const k = `${key}:${client}`
    const prev = client ? views.get(k) : undefined
    const token = randomBytes(9).toString('base64url')
    if (client) {
      views.set(k, { token, sent: sentOf(view), at: Date.now() })
      if (views.size > 1000) for (const [x, v] of [...views].sort((a, b) => a[1].at - b[1].at).slice(0, 200)) { views.delete(x); void v }
    }
    const common = { me: me.id, token, v: core.version, server: serverInfo(me) }
    if (prev && base && prev.token === base) return send(res, 200, { ...common, full: false, delta: deltaOf(prev.sent, view) })
    const data: Partial<Record<Collection, [string, unknown][]>> = {}
    for (const c of COLLECTIONS) data[c] = view[c]
    send(res, 200, { ...common, full: true, data })
  }

  function onEvents(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write(`retry: 3000\n\nevent: v\ndata: ${core.version}\n\n`)
    const off = core.subscribe((v) => res.write(`event: v\ndata: ${v}\n\n`))
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
    req.on('close', () => { off(); clearInterval(ping) })
  }

  async function onLogin(req: IncomingMessage, res: ServerResponse) {
    const body = await readBody(req, 16 * 1024) as { username?: unknown; password?: unknown }
    const username = String(body.username ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const keys = [`login:${ip(req)}:${username}`, `login-ip:${ip(req)}`]
    if (throttled(keys[0], 8) || throttled(keys[1], 40)) return send(res, 429, { ok: false, error: 'تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه‌ی دیگر دوباره امتحان کنید.' })
    const u = core.state.users.find((x) => x.username === username)
    const okPw = await verifyPassword(password, u ? await passwordHashOf(db, u.id) : undefined)
    if (!u || !okPw) { keys.forEach(recordFailure); return send(res, 401, { ok: false, error: 'نام کاربری یا رمز عبور درست نیست.' }) }
    clearFailures(keys[0])
    if (u.status === 'pending') return send(res, 403, { ok: false, error: 'حساب شما هنوز تأیید نشده است. پس از تأیید کنترل پروژه می‌توانید وارد شوید.' })
    if (u.status !== 'active') return send(res, 403, { ok: false, error: 'این حساب فعال نیست.' })
    const token = await createSession(db, u.id)
    send(res, 200, { ok: true, me: u.id }, { 'set-cookie': sessionCookie(token, cfg.secureCookies) })
  }

  async function onRegister(req: IncomingMessage, res: ServerResponse) {
    const body = await readBody(req, 16 * 1024) as { name?: unknown; username?: unknown; password?: unknown }
    const key = `register:${ip(req)}`
    if (throttled(key, 6)) return send(res, 429, { ok: false, error: 'درخواست عضویت زیادی از این دستگاه ثبت شد؛ کمی بعد دوباره امتحان کنید.' })
    const name = String(body.name ?? '').trim().slice(0, 80)
    const username = String(body.username ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    if (!name) return send(res, 400, { ok: false, error: 'نام کامل را وارد کنید.' })
    if (!/^[a-z0-9._-]{3,24}$/.test(username)) return send(res, 400, { ok: false, error: 'نام کاربری باید ۳ تا ۲۴ حرف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط باشد.' })
    const pw = passwordProblem(password)
    if (pw) return send(res, 400, { ok: false, error: pw })
    if (core.state.users.some((u) => u.username === username)) return send(res, 409, { ok: false, error: `نام کاربری ${username} قبلاً گرفته شده است.` })
    recordFailure(key)
    const user: User = { id: `u-${randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}`, name, username, teamId: '', role: 'member', capacity: 8, status: 'pending', createdAt: new Date().toISOString() }
    const out = await core.dispatch(null, { type: 'register', user }, async (c) => { await setPassword(c, user.id, password) })
    if (out.denial) return send(res, 409, { ok: false, error: out.denial })
    send(res, 200, { ok: true })
  }

  async function onOwnPassword(req: IncomingMessage, res: ServerResponse) {
    const { me, token } = await need(req)
    const body = await readBody(req, 16 * 1024) as { current?: unknown; next?: unknown }
    const key = `pw:${me.id}`
    if (throttled(key, 8)) return send(res, 429, { ok: false, error: 'تلاش‌های ناموفق زیاد بود؛ کمی بعد دوباره امتحان کنید.' })
    if (!(await verifyPassword(String(body.current ?? ''), await passwordHashOf(db, me.id)))) { recordFailure(key); return send(res, 403, { ok: false, error: 'رمز فعلی درست نیست.' }) }
    const p = passwordProblem(body.next)
    if (p) return send(res, 400, { ok: false, error: p })
    await setPassword(db, me.id, String(body.next))
    await dropSessionsOf(db, me.id, token)
    clearFailures(key)
    send(res, 200, { ok: true })
  }

  async function onResetPassword(req: IncomingMessage, res: ServerResponse, id: string) {
    const { me } = await need(req)
    const body = await readBody(req, 16 * 1024) as { password?: unknown }
    const target = core.state.users.find((u) => u.id === id)
    if (!target) return send(res, 404, { ok: false, error: 'کاربر پیدا نشد.' })
    if (target.id === me.id) return send(res, 400, { ok: false, error: 'رمز خودتان را از «تغییر رمز» با رمز فعلی عوض کنید.' })
    if (!has(me, 'users.manage')) { await core.audit({ userId: me.id, kind: 'security', text: `رد دسترسی: بازنشانی رمز ${target.username}` }); return send(res, 403, { ok: false, error: 'بازنشانی رمز دیگران فقط برای مدیر سیستم و مدیرعامل است.' }) }
    if (target.role === 'ceo' && me.role !== 'ceo') return send(res, 403, { ok: false, error: 'رمز مدیرعامل را فقط خود مدیرعامل عوض می‌کند.' })
    const p = passwordProblem(body.password)
    if (p) return send(res, 400, { ok: false, error: p })
    await setPassword(db, target.id, String(body.password))
    await dropSessionsOf(db, target.id)
    await core.audit({ userId: me.id, kind: 'admin', text: `رمز عبور ${target.username} بازنشانی شد` })
    send(res, 200, { ok: true })
  }

  async function onFile(req: IncomingMessage, res: ServerResponse, id: string) {
    const { me } = await need(req)
    const url = `/api/files/${id}`
    const s = core.state
    const att = s.attachments.find((a) => a.dataUrl === url)
    const reqOf = att ? undefined : s.adminRequests.find((r) => r.files.some((f) => f.dataUrl === url))
    const allowed = att ? !!s.tasks[att.taskId] && canViewTask(s, me, s.tasks[att.taskId]) : reqOf ? canSeeRequest(me, reqOf) : false
    if (!allowed) return send(res, 404, { ok: false, error: 'فایل پیدا نشد.' })
    const r = await db.query<{ name: string; mime: string; data: Buffer }>('SELECT name, mime, data FROM files WHERE id = $1', [id])
    const f = r.rows[0]
    if (!f) return send(res, 404, { ok: false, error: 'فایل پیدا نشد.' })
    const inline = INLINE.has(f.mime)
    res.writeHead(200, {
      'content-type': inline ? f.mime : 'application/octet-stream', 'content-length': f.data.length,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'cache-control': 'private, max-age=3600', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    })
    res.end(f.data)
  }

  async function onSync(req: IncomingMessage, res: ServerResponse, projectId: string | null) {
    const { me } = await need(req)
    if (projectId) {
      const p = core.state.projects.find((x) => x.id === projectId)
      if (!p) return send(res, 404, { ok: false, error: 'پروژه پیدا نشد.' })
      if (!canSyncProject(core.state, me, projectId)) { await core.audit({ userId: me.id, kind: 'security', text: `رد دسترسی: Sync پروژه‌ی ${projectId}` }); return send(res, 403, { ok: false, denial: 'Sync این پروژه برای شما مجاز نیست.' }) }
      if (!p.mdrUrl) return send(res, 400, { ok: false, error: 'لینک MDR این پروژه ثبت نشده است.' })
      const run = await jobs.syncProject(projectId, 'manual', me.id)
      return send(res, 200, { ok: true, runs: [run] })
    }
    if (!has(me, 'sync.run')) { await core.audit({ userId: me.id, kind: 'security', text: 'رد دسترسی: Sync همه‌ی پروژه‌ها' }); return send(res, 403, { ok: false, denial: 'Sync همه‌ی پروژه‌ها مجاز نیست.' }) }
    send(res, 200, { ok: true, runs: await jobs.syncAll('manual', me.id) })
  }

  async function onFlush(req: IncomingMessage, res: ServerResponse) {
    const { me } = await need(req)
    if (!has(me, 'sync.run')) return send(res, 403, { ok: false, denial: 'ارسال صف Write-back فقط برای کنترل پروژه و مدیرعامل است.' })
    send(res, 200, { ok: true, runs: await jobs.flushWriteBack(true) })
  }

  async function onStatic(res: ServerResponse, url: URL) {
    if (!cfg.staticDir) return send(res, 404, { ok: false, error: 'not found' })
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const file = path.resolve(cfg.staticDir, rel || 'index.html')
    if (!file.startsWith(path.resolve(cfg.staticDir) + path.sep) && file !== path.resolve(cfg.staticDir)) return send(res, 404, { ok: false })
    const st = await stat(file).catch(() => null)
    const isFile = !!st?.isFile() && !file.endsWith('preview.html')
    if (!isFile || path.basename(file) === 'index.html') {
      // the app itself (and every client-side route) with the server-mode marker
      if (!indexHtml) {
        const raw = await readFile(path.join(cfg.staticDir, 'index.html'), 'utf8')
        const fonts = existsSync(path.join(cfg.staticDir, 'fonts', 'fonts.css')) ? '<link rel="stylesheet" href="/fonts/fonts.css">' : ''
        indexHtml = raw.replace(/<html[^>]*>/i, (m) => `${m}<meta name="taraz-server" content="${cfg.version}">${fonts}`)
      }
      const data = Buffer.from(indexHtml)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'content-security-policy': CSP, 'content-length': data.length })
      return res.end(data)
    }
    const data = await readFile(file)
    const hashed = /\.[0-9a-f]{8,}\.(js|css)$/.test(file)
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache', 'content-length': data.length })
    res.end(data)
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'same-origin')
    res.setHeader('x-frame-options', 'SAMEORIGIN')
    const url = new URL(req.url ?? '/', 'http://local')
    const p = url.pathname
    try {
      if (p.startsWith('/api/')) {
        // cross-site form posts never reach a handler (the session cookie is also SameSite=Lax)
        const origin = req.headers.origin
        if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'درخواست از مبدأ دیگری پذیرفته نمی‌شود.')
        const m = req.method
        if (m === 'GET' && p === '/api/health') return send(res, 200, { ok: true, version: cfg.version, google: !!jobs.googleEmail, v: core.version })
        if (m === 'GET' && p === '/api/session') {
          const a = await auth(req)
          return send(res, 200, { me: a ? publicUser(a.me) : null, server: a ? serverInfo(a.me) : {} })
        }
        if (m === 'POST' && p === '/api/auth/login') return await onLogin(req, res)
        if (m === 'POST' && p === '/api/auth/register') return await onRegister(req, res)
        if (m === 'POST' && p === '/api/auth/logout') {
          await dropSession(db, parseCookies(req.headers.cookie)[COOKIE])
          return send(res, 200, { ok: true }, { 'set-cookie': clearCookie(cfg.secureCookies) })
        }
        if (m === 'GET' && p === '/api/state') return await onState(req, res, url)
        if (m === 'GET' && p === '/api/events') { await need(req); return onEvents(req, res) }
        if (m === 'POST' && p === '/api/action') return await onAction(req, res)
        if (m === 'POST' && p === '/api/me/password') return await onOwnPassword(req, res)
        let r = /^\/api\/users\/([^/]+)\/password$/.exec(p)
        if (m === 'POST' && r) return await onResetPassword(req, res, decodeURIComponent(r[1]))
        r = /^\/api\/files\/(fl-[A-Za-z0-9_-]+)$/.exec(p)
        if (m === 'GET' && r) return await onFile(req, res, r[1])
        r = /^\/api\/projects\/([^/]+)\/sync$/.exec(p)
        if (m === 'POST' && r) return await onSync(req, res, decodeURIComponent(r[1]))
        if (m === 'POST' && p === '/api/sync/all') return await onSync(req, res, null)
        if (m === 'POST' && p === '/api/writeback/flush') return await onFlush(req, res)
        throw new HttpError(404, 'مسیر پیدا نشد.')
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed')
      return await onStatic(res, url)
    } catch (e) {
      if (res.headersSent) { res.end(); return }
      if (e instanceof HttpError) return send(res, e.status, { ok: false, error: e.message })
      console.error('[http]', req.method, p, e)
      send(res, 500, { ok: false, error: 'خطای داخلی سرور؛ تغییری ثبت نشد.' })
    }
  }
}
