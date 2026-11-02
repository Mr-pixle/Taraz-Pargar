// Server version, end to end over HTTP against a real PostgreSQL and a stand-in for Google Sheets:
// sign-in and passwords, what each role can read, what a forged request can (not) do, files, persistence across a
// restart, the delta protocol, and the MDR Sync / Write-back jobs.
// Needs PostgreSQL: TEST_PG (admin URL, default postgres://taraz@127.0.0.1:54329/postgres).
import pg from 'pg'
import { startServer } from '../server/main'
import { COLLECTIONS, applyDelta, fromView, type Collection, type Delta } from '../src/lib/collections'
import { startFakeSheets } from './fakeSheets'
import { N, R, rowOf, sampleMdr } from './fixtures/mdr'
import type { State } from '../src/lib/state'
import type { Task } from '../src/lib/types'

let pass = 0, fail = 0
const ok = (c: unknown, name: string) => { if (c) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}`) } }
const head = (s: string) => console.log(s)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ADMIN = process.env.TEST_PG ?? 'postgres://taraz@127.0.0.1:54329/postgres'

async function freshDb(name: string) {
  const c = new pg.Client({ connectionString: ADMIN })
  await c.connect()
  await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  await c.query(`CREATE DATABASE ${name}`)
  await c.end()
  return ADMIN.replace(/\/[^/]*$/, `/${name}`)
}

type View = Pick<State, Collection>
class Client {
  cookie = ''
  token = ''
  client = Math.random().toString(36).slice(2)
  view: View | null = null
  base: string
  constructor(base: string) { this.base = base }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(this.base + path, {
      method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.getSetCookie?.() ?? []
    for (const c of set) { const v = c.split(';')[0]; this.cookie = v.endsWith('=') ? '' : v }
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: res.status, body: json, text, headers: res.headers }
  }
  login(username: string, password = 'pargar1405') { return this.req('POST', '/api/auth/login', { username, password }) }
  act(action: unknown) { return this.req('POST', '/api/action', { action }) }
  async state(full = false) {
    const r = await this.req('GET', `/api/state?client=${this.client}${full || !this.token ? '' : `&base=${this.token}`}`)
    if (r.status !== 200) throw new Error(`state ${r.status}`)
    this.token = String(r.body.token)
    if (r.body.full) {
      const d = {} as Record<Collection, unknown>
      for (const c of COLLECTIONS) d[c] = fromView(c, (r.body.data as Record<Collection, [string, unknown][]>)[c] ?? [])
      this.view = d as unknown as View
    } else this.view = applyDelta(this.view!, r.body.delta as Delta)
    return { view: this.view!, full: !!r.body.full, delta: r.body.delta as Delta | undefined, server: r.body.server as Record<string, unknown> }
  }
}

;(async () => {
  const fake = await startFakeSheets()
  const env = (db: string, extra: Record<string, string> = {}) => ({
    DATABASE_URL: db, GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(fake.serviceAccount), SHEETS_API_BASE: fake.url,
    TARAZ_WRITEBACK_DELAY_SEC: '1', TARAZ_SYNC_SCHEDULE: 'off', TARAZ_STATIC_DIR: '/nonexistent', ...extra,
  }) as NodeJS.ProcessEnv
  const quiet = () => {}

  // ---------------- production bootstrap ----------------
  head('راه‌اندازی روی پایگاه داده‌ی خالی')
  const prodUrl = await freshDb('taraz_test_prod')
  let refused = ''
  await startServer({ env: { DATABASE_URL: prodUrl }, port: 0, log: quiet }).catch((e) => { refused = String(e.message) })
  ok(refused.includes('TARAZ_ADMIN_USERNAME'), 'پایگاه خالی بدون حساب مدیرعامل راه نمی‌افتد (پیام روشن)')
  let srv = await startServer({ env: env(prodUrl, { TARAZ_ADMIN_USERNAME: 'Boss', TARAZ_ADMIN_PASSWORD: 'Strong-pass-1405', TARAZ_ADMIN_NAME: 'مدیرعامل پرگار' }), port: 0, log: quiet })
  let base = `http://127.0.0.1:${srv.port}`
  const c0 = new Client(base)
  ok((await c0.login('boss', 'wrong-password')).status === 401, 'رمز اشتباه: ۴۰۱')
  ok((await c0.login('boss', 'Strong-pass-1405')).status === 200 && c0.cookie.startsWith('taraz_sid='), 'ورود مدیرعامل: کوکی نشست')
  const login0 = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'Strong-pass-1405' }) })
  const cookieHeader = login0.headers.getSetCookie()[0]
  ok(/HttpOnly/.test(cookieHeader) && /SameSite=Lax/.test(cookieHeader), 'کوکی نشست HttpOnly و SameSite=Lax است')
  let st = await c0.state()
  ok(st.view.users.length === 1 && st.view.users[0].role === 'ceo' && st.view.teams.length === 15 && !st.view.projects.length && Object.keys(st.view.statusSets).includes('office'), 'شروع واقعی: فقط حساب مدیرعامل، تیم‌ها و Status Set؛ بدون داده‌ی نمونه')
  ok(!('password' in st.view.users[0]), 'رمز در پاسخ API نیست')
  const pdb = new pg.Client({ connectionString: prodUrl }); await pdb.connect()
  const hash = (await pdb.query('SELECT hash FROM credentials')).rows[0]?.hash as string
  const usersRow = JSON.stringify((await pdb.query("SELECT data FROM entities WHERE kind = 'users'")).rows)
  ok(hash?.startsWith('scrypt$') && !hash.includes('Strong-pass') && !usersRow.includes('Strong-pass') && !usersRow.includes('"password"'), 'رمز در پایگاه داده فقط هش scrypt است (نه متن رمز)')
  ok(st.server && (st.server as { google?: { email?: string } }).google?.email === fake.serviceAccount.client_email, 'کنترل پروژه ایمیل حساب سرویس Google را می‌بیند (برای اشتراک MDR)')
  await pdb.end()
  await srv.close()

  // ---------------- sample data ----------------
  const url = await freshDb('taraz_test')
  srv = await startServer({ env: env(url, { TARAZ_SEED: 'demo' }), port: 0, log: quiet })
  base = `http://127.0.0.1:${srv.port}`
  const as = async (u: string) => { const c = new Client(base); const r = await c.login(u); if (r.status !== 200) throw new Error(`login ${u}: ${r.status}`); return c }

  head('ورود، ثبت‌نام و رمز')
  const anon = new Client(base)
  ok((await anon.req('GET', '/api/state')).status === 401 && (await anon.act({ type: 'readNotifs' })).status === 401, 'بدون ورود: خواندن و نوشتن ۴۰۱')
  ok((await anon.login('r.hashemi')).status === 403 && String((await anon.login('r.hashemi')).body.error).includes('تأیید نشده'), 'حساب در انتظار تأیید وارد نمی‌شود (پس از رمز درست)')
  const reg = await anon.req('POST', '/api/auth/register', { name: 'سپیده احمدی', username: 's.ahmadi', password: 'abc12345' })
  ok(reg.status === 200 && (await anon.req('POST', '/api/auth/register', { name: 'x', username: 's.ahmadi', password: 'abc12345' })).status === 409, 'ثبت‌نام؛ نام کاربری تکراری پذیرفته نمی‌شود')
  ok((await anon.login('s.ahmadi', 'abc12345')).status === 403, 'حساب تازه تا تأیید وارد نمی‌شود')
  const ctl = await as('n.rahimi')
  const ctlView = (await ctl.state()).view
  const sa = ctlView.users.find((u) => u.username === 's.ahmadi')!
  ok(sa && sa.status === 'pending' && sa.role === 'member', 'کنترل پروژه درخواست عضویت را می‌بیند')
  ok((await ctl.act({ type: 'approveUser', id: sa.id, teamId: 'prs', role: 'member' })).status === 200, 'تأیید عضویت')
  const sah = new Client(base)
  ok((await sah.login('s.ahmadi', 'abc12345')).status === 200, 'کاربر تأییدشده وارد می‌شود')
  ok((await sah.req('POST', '/api/me/password', { current: 'wrong', next: 'newpass99' })).status === 403, 'تغییر رمز با رمز فعلی اشتباه رد می‌شود')
  const other = new Client(base); await other.login('s.ahmadi', 'abc12345')
  ok((await sah.req('POST', '/api/me/password', { current: 'abc12345', next: 'newpass99' })).status === 200, 'تغییر رمز')
  ok((await other.req('GET', '/api/state')).status === 401, 'تغییر رمز نشست‌های دیگر همان کاربر را می‌بندد')
  ok((await new Client(base).login('s.ahmadi', 'abc12345')).status === 401 && (await new Client(base).login('s.ahmadi', 'newpass99')).status === 200, 'رمز قبلی دیگر کار نمی‌کند؛ رمز تازه کار می‌کند')
  const member = await as('s.rezaei')
  const memberId = (await member.req('GET', '/api/session')).body.me as { id: string }
  ok((await member.req('POST', `/api/users/${sa.id}/password`, { password: 'hacked123' })).status === 403, 'عضو تیم رمز دیگران را بازنشانی نمی‌کند')
  const ceo = await as('ceo')
  ok((await ceo.req('POST', `/api/users/${sa.id}/password`, { password: 'reset-1405' })).status === 200 && (await new Client(base).login('s.ahmadi', 'reset-1405')).status === 200, 'مدیرعامل رمز را بازنشانی می‌کند')
  const brute = new Client(base)
  for (let i = 0; i < 8; i++) await brute.login('m.karami', `x${i}`)
  ok((await brute.login('m.karami')).status === 429, 'پس از ۸ تلاش ناموفق، ورود همان نام کاربری موقتاً بسته می‌شود')

  head('آنچه هر نقش می‌خواند (سرور، نه پنهان‌سازی)')
  const mv = (await member.state()).view
  const allTasks = Object.values((await ceo.state()).view.tasks)
  const fin = allTasks.filter((t) => t.kind === 'finadmin')
  ok(fin.length === 10 && !Object.values(mv.tasks).some((t) => t.kind === 'finadmin'), 'عضو تیم هیچ Task فضای مالی و اداری دریافت نمی‌کند (مدیرعامل ۱۰ تا)')
  const fs = (await (await as('f.sadri')).state()).view, mt = (await (await as('m.tavana')).state()).view
  const spaceOf = (t: Task) => t.projectId.split(':')[1]
  ok(Object.values(fs.tasks).filter((t) => t.kind === 'finadmin').every((t) => spaceOf(t) === 'finance') && Object.values(fs.tasks).some((t) => t.kind === 'finadmin'), 'مدیر مالی فقط Taskهای فضای مالی')
  ok(Object.values(mt.tasks).filter((t) => t.kind === 'finadmin').every((t) => spaceOf(t) === 'office') && Object.values(mt.tasks).some((t) => t.kind === 'finadmin'), 'مدیر اداری فقط Taskهای فضای اداری')
  ok(Object.values(mv.personalTasks).every((t) => t.ownerId === memberId.id) && Object.keys(mv.personalBoards).every((k) => k === memberId.id), 'کارهای شخصی: فقط مال خودش')
  ok(mv.notifications.every((n) => n.userId === memberId.id) && Object.values(mv.timesheets).every((d) => d.userId === memberId.id) && mv.adminRequests.every((r) => r.userId === memberId.id), 'اعلان، تایم‌شیت و درخواست اداری: فقط مال خودش')
  ok(!mv.syncItems.length && !mv.syncRuns.length && mv.users.every((u) => u.status !== 'pending' && !('password' in u)), 'صف Sync و حساب‌های در انتظار تأیید برای عضو تیم فرستاده نمی‌شود؛ هیچ رمزی فرستاده نمی‌شود')
  const othersLogs = mv.workLogs.filter((l) => l.userId !== memberId.id)
  ok(othersLogs.length > 0 && othersLogs.every((l) => l.description === '' && !l.revisions), 'Work Log دیگران: فقط زمان (برای جمع)، بدون شرح')
  ok(mv.audit.every((a) => a.taskId && mv.tasks[a.taskId]) && mv.audit.length > 0, 'AuditLog: فقط سطرهای تسک‌هایی که می‌بیند')
  ok(mv.leaves.filter((l) => l.userId !== memberId.id).every((l) => !l.note), 'یادداشت مرخصی دیگران فرستاده نمی‌شود')

  head('درخواست جعلی مستقیم به API')
  const finTask = fin.find((t) => spaceOf(t) === 'finance')!
  let r = await member.act({ type: 'updateTask', taskId: finTask.id, patch: { name: 'hack' } })
  ok(r.status === 403 && (await ceo.state()).view.tasks[finTask.id].name === finTask.name, 'ویرایش Task مالی توسط عضو تیم: ۴۰۳، بدون تغییر')
  ok((await ceo.state()).view.audit.some((a) => a.kind === 'security' && a.userId === memberId.id), 'تلاش ردشده در AuditLog امنیتی ثبت شد')
  r = await member.act({ type: 'sysSyncResult', projectId: 'BBT', runId: 'x', run: {}, items: [], refresh: [], at: '', replacePending: true })
  ok(r.status === 403 && String(r.body.denial).includes('مرورگر'), 'ثبت نتیجه‌ی Sync از مرورگر: ۴۰۳')
  ok((await ctl.act({ type: 'flushWriteBack' })).status === 403 && (await ctl.act({ type: 'addRun', run: {} })).status === 403, 'اجرای ساختگی Write-back / Sync از مرورگر پذیرفته نمی‌شود (حتی برای کنترل پروژه)')
  ok((await member.act({ type: 'addUser', user: { id: 'u-x', name: 'x', username: 'xx.yy', password: 'abcdef', teamId: 'p1a', role: 'ceo' } })).status === 403, 'ساخت کاربر مدیرعامل توسط عضو: ۴۰۳')
  const doc = Object.values(mv.tasks).find((t) => t.kind === 'document' && t.docNumber && t.assigneeUserId === memberId.id)!
  r = await member.act({ type: 'updateTask', taskId: doc.id, patch: { docNumber: 'FAKE-1' } })
  ok(r.status === 403 && String(r.body.denial).includes('docNumber'), 'جعل Document Number (مقصد Write-back): ۴۰۳')
  ok((await member.act({ type: 'updateUser', id: memberId.id, patch: { password: 'x' } })).status === 403, 'تغییر رمز از مسیر updateUser: ۴۰۳')
  ok((await member.act({ type: 'updateUser', id: memberId.id, patch: { role: 'ceo' } })).status === 403, 'ارتقای نقش خود: ۴۰۳')
  ok((await member.req('POST', '/api/action', { action: { type: 'readNotifs' } }, { origin: 'https://evil.example' })).status === 403, 'درخواست از مبدأ دیگر (CSRF): ۴۰۳')
  const sup = await as('y.babaei')
  r = await sup.act({ type: 'createFlowTask', task: { id: 'SUP-FORGE1', kind: 'supervision', name: 'بازدید', projectId: 'BBT', parentId: null, source: 'mdr', order: 1, reporterId: 'u-ctl-1', due: '2027-01-01', actualFinish: '2020-01-01' } })
  const forged = (await ceo.state()).view.tasks['SUP-FORGE1']
  ok(r.status === 200 && forged.source === 'manual' && forged.reporterId !== 'u-ctl-1' && !forged.actualFinish, 'فیلدهای جعلی (source، reporterId، Actual Finish) را سرور خودش تعیین می‌کند')
  ok((await sup.act({ type: 'createFlowTask', task: { id: 'SUP-FORGE1', kind: 'supervision', name: 'دوباره', projectId: 'BBT', parentId: null, order: 1, due: '2027-01-01' } })).status === 403 && (await ceo.state()).view.tasks['SUP-FORGE1'].name === 'بازدید', 'شناسه‌ی تکراری روی تسک دیگر نمی‌نویسد')

  head('پیوست‌ها')
  const png = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64')
  r = await member.act({ type: 'addAttachments', taskId: doc.id, files: [{ name: 'plan.png', mime: 'image/png', size: 14, dataUrl: png }] })
  const att = (await member.state()).view.attachments.find((a) => a.name === 'plan.png')!
  ok(r.status === 200 && att.dataUrl.startsWith('/api/files/fl-'), 'پیوست روی سرور ذخیره شد؛ در داده فقط آدرس آن است')
  const got = await member.req('GET', att.dataUrl)
  ok(got.status === 200 && got.text === 'fake-png-bytes' && got.headers.get('content-type') === 'image/png', 'دریافت پیوست با همان محتوا')
  const fr = await (await as('f.sadri')).act({ type: 'addAttachments', taskId: finTask.id, files: [{ name: 'invoice.pdf', mime: 'application/pdf', size: 3, dataUrl: 'data:application/pdf;base64,' + Buffer.from('pdf').toString('base64') }] })
  const inv = (await ceo.state()).view.attachments.find((a) => a.name === 'invoice.pdf')!
  ok(fr.status === 200 && (await member.req('GET', inv.dataUrl)).status === 404 && (await ceo.req('GET', inv.dataUrl)).status === 200, 'پیوست Task مالی: عضو تیم با آدرس مستقیم هم نمی‌گیرد (۴۰۴)، مدیرعامل می‌گیرد')
  const html = await member.act({ type: 'addAttachments', taskId: doc.id, files: [{ name: 'x.html', mime: 'text/html', size: 20, dataUrl: 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') }] })
  const xh = (await member.state()).view.attachments.find((a) => a.name === 'x.html')!
  const xr = await member.req('GET', xh.dataUrl)
  ok(html.status === 200 && xr.headers.get('content-type') === 'application/octet-stream' && /attachment/.test(xr.headers.get('content-disposition') ?? ''), 'فایل HTML فقط دانلود می‌شود، در مرورگر اجرا نمی‌شود')

  head('تغییرها فقط به‌صورت Delta')
  const before = await member.state(true)
  await ctl.act({ type: 'addComment', taskId: doc.id, text: `بررسی شد @s.rezaei` })
  const d1 = await member.state()
  const setKeys = Object.keys(d1.delta?.set ?? {})
  ok(!d1.full && setKeys.includes('comments') && setKeys.includes('notifications') && !setKeys.includes('tasks') && !setKeys.includes('users'), `فقط مجموعه‌های تغییرکرده فرستاده شد (${setKeys.join('، ')})`)
  const fresh = await new Client(base).login('s.rezaei').then(async () => 0).catch(() => 0)
  void fresh
  const full = new Client(base); full.cookie = member.cookie
  const fv = (await full.state(true)).view
  ok(JSON.stringify(COLLECTIONS.map((c) => fv[c])) === JSON.stringify(COLLECTIONS.map((c) => d1.view[c])), 'Delta روی داده‌ی قبلی = نمای کامل تازه')
  ok(before.view.comments.length + 1 === d1.view.comments.length, 'کامنت تازه رسید')

  head('ماندگاری پس از راه‌اندازی دوباره')
  const statuses = (await ceo.state()).view.statusSets.office
  await member.act({ type: 'setStatus', taskId: doc.id, statusId: statuses.find((s) => s.category === 'doing')!.id })
  await sleep(1500) // let the Write-back timer of that change run first
  const beforeRestart = (await ceo.state(true)).view
  await srv.close()
  srv = await startServer({ env: env(url), port: 0, log: quiet })
  base = `http://127.0.0.1:${srv.port}`
  const ceo2 = new Client(base); ceo2.cookie = ceo.cookie
  const afterRestart = (await ceo2.state(true)).view
  // arrays keep their order; records are compared by key
  const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? v : Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b))))
  const differs = COLLECTIONS.filter((c) => norm(afterRestart[c]) !== norm(beforeRestart[c]))
  ok(!differs.length, `همه‌ی داده‌ها (به همان ترتیب) پس از راه‌اندازی دوباره همان است؛ نشست هم معتبر ماند${differs.length ? ` — متفاوت: ${differs.join('، ')}` : ''}`)
  const member2 = new Client(base); member2.cookie = member.cookie
  await member2.act({ type: 'addComment', taskId: doc.id, text: 'پس از راه‌اندازی دوباره' })
  const ids = (await ceo2.state(true)).view.comments.map((c) => c.id)
  ok(new Set(ids).size === ids.length && ids.length === beforeRestart.comments.length + 1, 'شناسه‌های تازه با شناسه‌های قبل از راه‌اندازی برخورد ندارند')

  head('Sync با MDR (Google Sheets)')
  const SID = '1SampleTowerMdrSpreadsheetId0123456789ab'
  fake.sheets.set(SID, { tab: 'MDR', values: sampleMdr() })
  const ctl2 = new Client(base); ctl2.cookie = ctl.cookie
  r = await ctl2.act({ type: 'projectAdd', project: { id: '900', code: '900', name: 'برج نمونه', type: 'مسکونی', phase1TeamId: 'p1a', phase2TeamId: 'p2a', mdrUrl: `https://docs.google.com/spreadsheets/d/${SID}/edit?gid=984903047#gid=984903047`, mdrTab: 'MDR', lastSync: '2020-01-01' } })
  ok(r.status === 200 && !(await ctl2.state()).view.projects.find((p) => p.id === '900')!.lastSync, 'تعریف پروژه با کد عددی و لینک MDR (زمان Sync را مرورگر نمی‌تواند جعل کند)')
  ok((await member2.req('POST', '/api/projects/900/sync', {})).status === 403, 'عضو تیم Sync اجرا نمی‌کند')
  r = await ctl2.req('POST', '/api/projects/900/sync', {})
  const run = (r.body.runs as { state: string; rowsRead: number; diffs: { new: number }; log: { text: string }[] }[])[0]
  ok(r.status === 200 && run.state === 'partial' && run.rowsRead === 33 && run.diffs.new === 33 && fake.tokens >= 1, `Sync واقعی: ۳۳ سطر از Google Sheets خوانده شد، ۳۳ ردیف جدید (${run.state})`)
  ok(run.log.some((l) => l.text.includes('AG') && l.text.includes('AI')) && run.log.some((l) => l.text.includes('ردیف') && l.text.includes('Parent 1')), 'گزارش اجرا: ستون‌های Write-back و هشدارهای سطری')
  let cv = (await ctl2.state()).view
  const pending = cv.syncItems.filter((x) => x.projectId === '900' && x.state === 'pending')
  ok(pending.length === 33 && !Object.values(cv.tasks).some((t) => t.projectId === '900') && cv.projects.find((p) => p.id === '900')!.lastSync, 'ردیف‌ها در صف Sync Review؛ تسکی بی‌تأیید ساخته نشد')
  r = await ctl2.act({ type: 'review', ids: pending.map((x) => x.id), approve: true })
  cv = (await ctl2.state()).view
  const ug = Object.values(cv.tasks).find((t) => t.docNumber === N.ug01)!
  ok(r.status === 200 && Object.values(cv.tasks).filter((t) => t.projectId === '900').length === 33 && ug.mdrRow === rowOf(sampleMdr(), N.ug01), 'تأیید Sync Review: ۳۳ تسک با ردیف MDR')
  r = await ctl2.req('POST', '/api/projects/900/sync', {})
  ok((r.body.runs as { diffs: { new: number; changed: number; removed: number } }[])[0].diffs.new === 0 && (await ctl2.state()).view.syncItems.filter((x) => x.projectId === '900' && x.state === 'pending').length === 0, 'Sync دوباره بدون تغییر MDR: صف خالی')

  head('Write-back به MDR')
  const grid0 = JSON.stringify(fake.sheets.get(SID)!.values)
  const p2a = (await ceo2.state()).view.users.find((u) => u.username === 's.rezaei')!
  await ctl2.act({ type: 'savePlan', taskId: ug.id, assignee: { kind: 'user', id: p2a.id }, estimation: 8, allocations: [] })
  const doing = statuses.find((s) => s.category === 'doing')!
  r = await member2.act({ type: 'setStatus', taskId: ug.id, statusId: doing.id })
  ok(r.status === 200 && (await ctl2.state()).view.writeQueue.some((w) => w.taskId === ug.id), 'تغییر Status: سند در صف Write-back')
  await sleep(1800)
  const row = rowOf(sampleMdr(), N.ug01)
  const g = fake.sheets.get(SID)!.values
  ok(g[row - 1][32] && /^14\d\d-\d\d-\d\d$/.test(g[row - 1][32]) && g[row - 1][33] === doing.name && g[row - 1][34] === `${doing.progress}%`, `پس از تأخیر: AG/AH/AI ردیف ${row} = تاریخ شمسی، «${doing.name}»، ${doing.progress}%`)
  const diffCells: string[] = []
  const g0 = JSON.parse(grid0) as string[][]
  for (let i = 0; i < Math.max(g.length, g0.length); i++) for (let j = 0; j < Math.max(g[i]?.length ?? 0, g0[i]?.length ?? 0); j++) if ((g[i]?.[j] ?? '') !== (g0[i]?.[j] ?? '')) diffCells.push(`${i + 1}:${j}`)
  ok(diffCells.length === 3 && diffCells.every((x) => ['32', '33', '34'].includes(x.split(':')[1])), `فقط ۳ سلول internal در MDR عوض شد (${diffCells.join(' ')})`)
  ok(fake.writes.some((w) => w.input === 'RAW') && fake.writes.some((w) => w.input === 'USER_ENTERED' && w.data[0].values[0][0].endsWith('%')), 'تاریخ و Status به‌صورت متن (RAW)، Progress به‌صورت درصد (USER_ENTERED)')
  cv = (await ctl2.state()).view
  ok(!cv.writeQueue.length && cv.syncRuns.some((x) => x.trigger === 'writeback' && x.projectId === '900' && x.state === 'success' && x.cellsWritten === 3), 'صف خالی شد و اجرای Write-back واقعی ثبت شد')
  // someone inserts two rows at the top of the MDR: the document moves, and the next write lands on its new row
  const vals = fake.sheets.get(SID)!.values
  vals.splice(2, 0, R({ A: '900' }), R({ A: '900' }))
  const done = statuses.find((s) => s.category === 'doing' && s.id !== doing.id)!
  await member2.act({ type: 'setStatus', taskId: ug.id, statusId: done.id })
  await sleep(1800)
  ok(vals[row + 1][33] === done.name && vals[row - 1][33] !== done.name, 'سطر اضافه بالای MDR: Write-back ردیف جابه‌جاشده‌ی همان سند را پیدا کرد')
  ok((await ctl2.state()).view.tasks[ug.id].mdrRow === row + 2, 'شماره‌ی ردیف MDR تسک به‌روز شد')

  head('خطاهای Google')
  fake.failNext = 1
  await member2.act({ type: 'setStatus', taskId: ug.id, statusId: doing.id })
  await sleep(1800)
  cv = (await ctl2.state()).view
  ok(cv.writeQueue.some((w) => w.taskId === ug.id) && cv.syncRuns.some((x) => x.trigger === 'writeback' && x.state === 'failed' && x.log.some((l) => l.text.includes('503'))), 'Google در دسترس نیست: اجرای ناموفق ثبت شد و سند در صف ماند (Retry)')
  ok((await ctl2.req('POST', '/api/writeback/flush', {})).status === 200 && !(await ctl2.state()).view.writeQueue.length, 'ارسال دوباره (دکمه‌ی «ارسال اکنون») صف را خالی کرد')
  fake.sheets.get(SID)!.denied = true
  r = await ctl2.req('POST', '/api/projects/900/sync', {})
  const denied = (r.body.runs as { state: string; log: { level: string; text: string }[] }[])[0]
  ok(denied.state === 'failed' && denied.log.some((l) => l.level === 'error' && l.text.includes(fake.serviceAccount.client_email)), 'MDR به حساب سرویس داده نشده: Sync ناموفق با راهنمای اشتراک')
  ok((await ctl2.state()).view.syncItems.filter((x) => x.projectId === '900' && x.state === 'pending').length === 0, 'Sync ناموفق صف Sync Review را دست نمی‌زند')
  fake.sheets.get(SID)!.denied = false
  await ctl2.act({ type: 'projectUpdate', id: '900', patch: { mdrTab: 'Sheet9' } })
  r = await ctl2.req('POST', '/api/projects/900/sync', {})
  ok((r.body.runs as { log: { text: string }[] }[])[0].log.some((l) => l.text.includes('Tab')), 'Tab اشتباه: پیام روشن')

  await srv.close()
  await fake.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
