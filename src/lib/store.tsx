import { createContext, useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore, type ReactNode } from 'react'
import { toast } from 'sonner'
import { buildSeed, refreshToday, TODAY } from './seed'
import { J_MONTHS, WEEKDAYS, tehranISO, tehranTime, toJalali, weekdayIndex } from './jalali'
import { activeOf, channelMembers, isWorkItem } from './domain'
import type { AdminRequest, AuditEntry, Task, User, WorkLog } from './types'
import { RemoteStore, SERVER_MODE } from './remote'
import { createPlanner } from './planning'
import {
  canCreateInternalProject, canCreateProjectTask, canDecideReview, canEditLog, canLogTime, canSeeAllLogs, canEditStatus, canManageFlowTask, canPlanTask, canSeeTeamSpace, canSyncProject, canViewSupervisionOf, canViewTask, has, isExecutor, type Perm,
  canDecideRequest, canSeeRequest, canSeeTimesheetOf, canSeeAuditEntry, canSeeFinSpace,
} from './policy'
import { CONTROL_PAGES, WRITEBACK_DELAY_SEC, reducer, rollupMap, type Action, type Nav, type Page, type State, type ThemeChoice } from './state'
import type { FinSpace } from './domain'

export * from './state'

const THEME_KEY = 'pargar-theme'
// The viewer may already set data-theme on <html>; remember it so "system" can hand control back
const HOST_THEME = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null

const HASH_PAGES: Page[] = ['home', 'projects', 'workload', 'review', 'runs', 'admin', 'notifications', 'supervision', 'team', 'points', 'requests', 'timesheet', 'inbox', 'adminreports', 'personal', 'finadmin']
/** What this browser shows (page, theme, digits): restored from the address and local storage */
function initialUi(): Pick<State, 'persianDigits' | 'nav' | 'openTaskId' | 'profileUserId' | 'theme' | 'profileTab' | 'denial'> {
  let nav: Nav = { page: 'home' }
  try {
    const h = location.hash.replace('#', '')
    if ((HASH_PAGES as string[]).includes(h)) nav = { page: h as Page }
    else if (h === 'finadmin-finance' || h === 'finadmin-office') nav = { page: 'finadmin', space: h.slice(9) as FinSpace }
    else if (h === 'project-chat') nav = { page: 'pchat' }
    else if (h === 'chat') nav = { page: 'chat' }
    else if (h.startsWith('project-')) nav = { page: 'project', projectId: h.slice(8).toUpperCase() }
    else if (h.startsWith('team-')) nav = { page: 'team', teamId: h.slice(5) }
  } catch { /* ignore */ }
  let theme: ThemeChoice = 'system'
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') theme = t } catch { /* storage unavailable */ }
  return { persianDigits: true, nav, openTaskId: null, profileUserId: null, profileTab: 'profile', theme, denial: null }
}
function init(): State {
  return { ...buildSeed(), writeQueue: [], lastRead: {}, session: null, ...initialUi() }
}

// ---------- where the state lives: this page (demo) or the Taraz server ----------
let remote: RemoteStore | null = null
/** The connection to the server (server version only) */
export function getRemote() {
  if (!remote) { remote = new RemoteStore(initialUi()); void remote.boot() }
  return remote
}
function useRemoteSource(): [State, (a: Action) => void] {
  const r = getRemote()
  const state = useSyncExternalStore(r.subscribe, r.snapshot)
  return [state, r.dispatch]
}
const useLocalSource = (): [State, (a: Action) => void] => useReducer(reducer, undefined, init)
const useSource = SERVER_MODE ? useRemoteSource : useLocalSource
/** Signed-out placeholder so the sign-in page can render before any user is loaded */
const GUEST: User = { id: '', name: '', username: '', teamId: '', role: 'member', capacity: 0, status: 'pending', createdAt: '' }

// ---------- context ----------
const Ctx = createContext<ReturnType<typeof useStoreValue> | null>(null)

function useStoreValue() {
  const [state, dispatch] = useSource()
  const derived = useMemo(() => rollupMap(state), [state.tasks, state.statusSets])
  const activeUsers = useMemo(() => activeOf(state.users), [state.users])
  const me = state.users.find((u) => u.id === state.session) ?? state.users[0] ?? GUEST
  const teamById = useMemo(() => Object.fromEntries(state.teams.map((t) => [t.id, t])), [state.teams])
  const userById = useMemo(() => Object.fromEntries(state.users.map((u) => [u.id, u])), [state.users])
  const projectById = useMemo(() => Object.fromEntries(state.projects.map((p) => [p.id, p])), [state.projects])

  const planner = (excludeTaskId?: string) =>
    createPlanner({ users: activeUsers, holidays: state.holidays.map((h) => h.date), leaves: state.leaves, allocations: state.allocations }, excludeTaskId)

  const teamOf = (t: Task) => (t.assigneeUserId ? userById[t.assigneeUserId]?.teamId : t.assigneeTeamId) ?? null
  // UI mirrors of lib/policy.ts — the reducer enforces the same rules again on every write
  const pageAllowed = (p: Page) => p === 'inbox' ? has(me, 'requests.office') || has(me, 'requests.ceo') : p === 'adminreports' ? has(me, 'admin.reports') : p === 'finadmin' ? canSeeFinSpace(me) : !CONTROL_PAGES.includes(p) || has(me, 'control.section')
  const can = {
    /** has planning rights somewhere (PM: own projects, lead: own team) */
    plan: has(me, 'plan.all') || me.role === 'pm' || me.role === 'lead',
    control: has(me, 'control.section'),
    logTime: (t: Task) => canLogTime(state, me, t),
    seeAllLogs: (t: Task) => canSeeAllLogs(state, me, t),
    editLog: (log: WorkLog, t: Task) => canEditLog(state, me, log, t),
    admin: has(me, 'admin.view'),
    perm: (p: Perm) => has(me, p),
    page: pageAllowed,
    planTask: (t: Task) => canPlanTask(state, me, t),
    editStatus: (t: Task) => canEditStatus(state, me, t),
    editUser: (id: string) => id === me.id || has(me, 'users.manage'),
    viewTask: (t: Task) => canViewTask(state, me, t),
    syncProject: (pid: string) => canSyncProject(state, me, pid),
    createProjectTask: (pid: string) => canCreateProjectTask(state, me, pid),
    manageFlow: (t: Task) => canManageFlowTask(state, me, t),
    decideReview: (t: Task) => canDecideReview(state, me, t),
    executor: (t: Task) => isExecutor(state, me, t),
    seeTeam: (teamId: string) => canSeeTeamSpace(me, teamId),
    createInternalProject: (teamId: string) => canCreateInternalProject(me, teamId),
    viewSupervision: (pid: string) => canViewSupervisionOf(state, me, pid),
    seeTimesheet: (userId: string) => canSeeTimesheetOf(me, userId),
    seeRequest: (r: AdminRequest) => canSeeRequest(me, r),
    decideRequest: (r: AdminRequest) => canDecideRequest(me, r),
    seeFin: canSeeFinSpace(me),
    seeAudit: (a: AuditEntry) => canSeeAuditEntry(state, me, a),
  }
  const workItems = useMemo(() => Object.values(state.tasks).filter(isWorkItem).sort((a, b) => a.order - b.order), [state.tasks])
  const myNotifs = useMemo(() => state.notifications.filter((n) => n.userId === state.session).sort((a, b) => b.at.localeCompare(a.at)), [state.notifications, state.session])
  const unread = myNotifs.filter((n) => !n.read).length
  const myChannels = useMemo(() => {
    const ids = ['general', 'announce', ...state.projects.map((p) => `project:${p.id}`)]
    return ids.filter((c) => channelMembers(state, c).includes(me.id))
  }, [state.projects, state.users, me.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const unreadIn = (channelId: string) => {
    const last = state.lastRead[`${me.id}|${channelId}`] ?? ''
    return state.messages.filter((m) => m.channelId === channelId && m.at > last && m.userId !== me.id).length
  }

  return { state, dispatch, ...derived, me, activeUsers, teamById, userById, projectById, planner, teamOf, can, workItems, myNotifs, unread, myChannels, unreadIn }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue()
  const { state, dispatch } = value
  // "today" rolls over at midnight (Tehran) even when the page stays open for days
  const [, setDay] = useState(TODAY)
  useEffect(() => { const h = setInterval(() => { if (refreshToday()) setDay(TODAY) }, 60_000); return () => clearInterval(h) }, [])
  useEffect(() => {
    // the server version writes back from the server; this timer is the browser-only demo's stand-in
    if (SERVER_MODE || !state.writeQueue.length) return
    const last = Math.max(...state.writeQueue.map((w) => w.queuedAt))
    const ms = Math.max(0, last + WRITEBACK_DELAY_SEC * 1000 - Date.now())
    const h = setTimeout(() => {
      dispatch({ type: 'flushWriteBack' })
      toast.success('Write-back انجام شد', { description: 'Last Status، Progress و Last Status Date در MDR به‌روز شد.' })
    }, ms)
    return () => clearTimeout(h)
  }, [state.writeQueue, dispatch])
  useEffect(() => {
    const root = document.documentElement
    if (state.theme === 'system') { if (HOST_THEME) root.setAttribute('data-theme', HOST_THEME); else root.removeAttribute('data-theme') }
    else root.setAttribute('data-theme', state.theme)
    try { if (state.theme === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, state.theme) } catch { /* storage unavailable */ }
  }, [state.theme])
  useEffect(() => {
    if (state.denial) toast.error('اجازه‌ی این کار را ندارید', { description: state.denial.text })
  }, [state.denial?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = state.nav.page
    const token = p === 'project' ? `project-${state.nav.projectId?.toLowerCase()}` : p === 'pchat' ? 'project-chat' : p === 'team' && state.nav.teamId ? `team-${state.nav.teamId}` : p === 'finadmin' && state.nav.space ? `finadmin-${state.nav.space}` : p
    try { history.replaceState(null, '', `#${token}`) } catch { /* ignore */ }
  }, [state.nav])
  const phase = SERVER_MODE ? getRemote().phase : 'in'
  if (phase === 'loading' || phase === 'offline') {
    return (
      <div role="status" className="flex min-h-full items-center justify-center p-6 text-center text-[14px] text-muted-foreground">
        {phase === 'loading' ? 'در حال اتصال به سرور تراز…' : 'سرور تراز در دسترس نیست؛ چند ثانیه‌ی دیگر دوباره تلاش می‌شود.'}
      </div>
    )
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider missing')
  return v
}

// ---------- formatting (all clock times in Asia/Tehran) ----------
const FA = '۰۱۲۳۴۵۶۷۸۹'
export function useFmt() {
  const { state } = useStore()
  const on = state.persianDigits
  const digits = (s: string | number) => (on ? String(s).replace(/[0-9]/g, (d) => FA[+d]) : String(s))
  const n = (x: number, frac = 0) => {
    const s = x.toLocaleString('en-US', { maximumFractionDigits: frac, minimumFractionDigits: 0 })
    return on ? digits(s.replace(/,/g, '٬').replace('.', '٫')) : s
  }
  const d = (iso?: string) => {
    if (!iso) return '—'
    const j = toJalali(iso)
    return digits(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`)
  }
  const dLong = (iso: string) => {
    const j = toJalali(iso)
    return `${digits(j.jd)} ${J_MONTHS[j.jm - 1]} ${digits(j.jy)}`
  }
  const dShort = (iso: string) => {
    const j = toJalali(iso)
    return `${digits(j.jd)} ${J_MONTHS[j.jm - 1]}`
  }
  /** Clock time of a timestamp in Tehran */
  const clock = (ts: string | Date) => digits(tehranTime(typeof ts === 'string' ? new Date(ts) : ts))
  /** Day label of a timestamp in Tehran: امروز / دیروز / weekday + date */
  const dayLabel = (ts: string) => {
    const day = tehranISO(new Date(ts))
    if (day === tehranISO()) return 'امروز'
    if (day === tehranISO(new Date(Date.now() - 86400000))) return 'دیروز'
    return `${WEEKDAYS[weekdayIndex(day)]} ${dLong(day)}`
  }
  const time = (isoTs: string) => {
    const t = new Date(isoTs)
    const mins = Math.round((Date.now() - t.getTime()) / 60000)
    if (mins < 1) return 'همین حالا'
    if (mins < 60) return `${digits(mins)} دقیقه پیش`
    if (mins < 60 * 24) return `${digits(Math.round(mins / 60))} ساعت پیش`
    return `${digits(Math.round(mins / 1440))} روز پیش`
  }
  return { digits, n, d, dLong, dShort, clock, dayLabel, time, pct: (x: number) => `${n(Math.round(x))}٪`, h: (x: number) => `${n(x, 1)} ساعت` }
}
