// The browser side of the server version. The server holds the office's data; this store keeps the part the signed-in
// person may see, sends every change to /api/action and shows it at once (optimistically), then takes the server's
// answer as the truth. A refusal from the server undoes the change and shows its reason.
import { COLLECTIONS, applyDelta, fromView, type Collection, type Data, type Delta } from './collections'
import { reducer, type Action, type State } from './state'

/** The page was served by the Taraz server (it adds this meta tag); the single-file demo has none */
export const SERVER_MODE = typeof document !== 'undefined' && !!document.querySelector('meta[name="taraz-server"]')

export interface ServerInfo { google?: { configured: boolean; email: string | null }; syncEveryHours?: number; writebackDelaySec?: number }
export type Phase = 'loading' | 'anon' | 'in' | 'offline'

/** Actions that only change what this browser shows; they never go to the server */
const UI_ONLY = new Set(['nav', 'openTask', 'openProfile', 'setDigits', 'setTheme'])
type Ui = Pick<State, 'persianDigits' | 'nav' | 'openTaskId' | 'profileUserId' | 'theme' | 'profileTab' | 'denial'>

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({})) as { error?: string; denial?: string }
  if (!res.ok) throw new ApiError(res.status, data.denial ?? data.error ?? `خطای سرور (${res.status})`)
  return data as T
}

const emptyData = (): Data => Object.fromEntries(COLLECTIONS.map((c) => [c, c === 'tasks' || c === 'statusSets' || c === 'lastRead' || c === 'timesheets' || c === 'personalTasks' || c === 'personalBoards' ? {} : []])) as unknown as Data

export class RemoteStore {
  phase: Phase = 'loading'
  info: ServerInfo = {}
  private data: Data = emptyData()
  private ui: Ui
  private me: string | null = null
  private pending: { id: number; action: Action }[] = []
  private view: State
  private token = ''
  private readonly client = Math.random().toString(36).slice(2, 12)
  private listeners = new Set<() => void>()
  private sending: Promise<unknown> = Promise.resolve()
  private seq = 0
  private events: EventSource | null = null
  private loadTimer: ReturnType<typeof setTimeout> | null = null
  private loading: Promise<void> | null = null
  private again = false

  constructor(ui: Ui) {
    this.ui = ui
    this.view = this.compose()
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  snapshot = () => this.view
  private emit() { for (const l of this.listeners) l() }

  /** The displayed state: the server's data, this browser's UI choices, then the changes still on their way */
  private compose(): State {
    let s: State = { ...this.data, ...this.ui, session: this.phase === 'in' ? this.me : null }
    for (const p of this.pending) s = { ...reducer(s, p.action), denial: s.denial }
    return s
  }
  private refresh() { this.view = this.compose(); this.emit() }

  async boot() {
    try {
      const s = await api<{ me: { id: string } | null; server: ServerInfo }>('/api/session')
      this.info = s.server ?? {}
      if (!s.me) { this.phase = 'anon'; this.refresh(); return }
      this.me = s.me.id
      await this.load(true)
      this.phase = 'in'
      this.listen()
      this.refresh()
    } catch {
      this.phase = 'offline'
      this.refresh()
      setTimeout(() => { void this.boot() }, 5000)
    }
  }

  async login(username: string, password: string) {
    await api('/api/auth/login', { username, password })
    this.phase = 'loading'
    this.refresh()
    await this.boot()
  }
  async logout() {
    await api('/api/auth/logout', {}).catch(() => {})
    this.events?.close(); this.events = null
    this.me = null; this.token = ''; this.pending = []; this.data = emptyData()
    this.ui = { ...this.ui, nav: { page: 'home' }, openTaskId: null, profileUserId: null }
    this.phase = 'anon'
    this.refresh()
  }

  /** Reads what changed since the last read (the whole view the first time, or after the server restarted) */
  load(full = false): Promise<void> {
    if (this.loading) { this.again = true; return this.loading }
    this.loading = (async () => {
      try {
        const q = new URLSearchParams({ client: this.client, ...(full || !this.token ? {} : { base: this.token }) })
        const r = await api<{ me: string; token: string; full: boolean; data?: Record<Collection, [string, unknown][]>; delta?: Delta; server: ServerInfo }>(`/api/state?${q}`)
        this.token = r.token
        this.me = r.me
        this.info = r.server ?? this.info
        if (r.full && r.data) {
          const d = {} as Record<Collection, unknown>
          for (const c of COLLECTIONS) d[c] = fromView(c, r.data[c] ?? [])
          this.data = d as unknown as Data
        } else if (r.delta) this.data = applyDelta(this.data, r.delta)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { await this.logout(); return }
        throw e
      } finally {
        this.loading = null
      }
      this.refresh()
      if (this.again) { this.again = false; await this.load() }
    })()
    return this.loading
  }

  /** The server announces every new version; the browser then reads only the delta */
  private listen() {
    this.events?.close()
    const es = new EventSource('/api/events')
    es.addEventListener('v', () => {
      if (this.loadTimer) clearTimeout(this.loadTimer)
      this.loadTimer = setTimeout(() => { void this.load().catch(() => {}) }, 120)
    })
    this.events = es
  }

  dispatch = (a: Action) => {
    if (UI_ONLY.has(a.type)) {
      const s = reducer({ ...this.view }, a)
      this.ui = { persianDigits: s.persianDigits, nav: s.nav, openTaskId: s.openTaskId, profileUserId: s.profileUserId, theme: s.theme, profileTab: s.profileTab, denial: s.denial }
      this.refresh()
      return
    }
    if (a.type === 'logout') { void this.logout(); return }
    if (a.type === 'login' || a.type === 'register') return
    // the same permission check as the server, so an obvious refusal is shown without a round trip
    const local = reducer(this.view, a)
    if (local.denial) { this.ui = { ...this.ui, denial: local.denial }; this.refresh(); return }
    const id = ++this.seq
    this.pending.push({ id, action: a })
    this.refresh()
    this.sending = this.sending.then(async () => {
      try {
        await api('/api/action', { action: a })
        await this.load()
      } catch (e) {
        const text = e instanceof ApiError ? e.message : 'اتصال به سرور برقرار نشد؛ تغییر ثبت نشد.'
        this.ui = { ...this.ui, denial: { id: Date.now(), text } }
        await this.load().catch(() => {})
      } finally {
        this.pending = this.pending.filter((p) => p.id !== id)
        this.refresh()
      }
    })
  }

  /** Waits until every change sent so far has been answered */
  settled() { return this.sending }
}
