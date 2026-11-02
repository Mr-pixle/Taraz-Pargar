// Pure application state: types, actions and the guarded reducer. Shared by the browser and the server — no React, DOM or storage here.
import { buildSeed, TODAY } from './seed'
import type { Resource } from './planning'
import { J_MONTHS, jalaliFa, tehranTime, toJalali } from './jalali'
import type {
  Allocation, Attachment, AuditEntry, ChatMessage, Comment, FlowState, Holiday, InternalProject, Leave, Notification, NotifLink, PointConfig, PointEntry, Project, ReviewRound, WorkLog, Role, Status, SyncItem, SyncRun, Task, Team, User, WriteBackItem, MdrRefresh,
  AdminRequest, LeaveDetails, MonthClose, OtherDetails, RequestStep, TimesheetCalc, TimesheetConfig, TimesheetDay,
  PersonalBoard, PersonalStatus, PersonalTask, Priority,
} from './types'
import { boardOf, descendants, nextOrder, tasksOf } from './personal'
import {
  configFor, dayKey, hm, hourLeaveMinutes, isOffDay, KIND_FA, LEAVE_CAT_FA, leaveDates, monthRange, settleDays, STATUS_FA,
} from './admin'
import { activeOf, channelMembers, effectiveScope, finSpaceOf, flowOf, isClosed, isFinTask, isFlowTask, isWorkItem, parentScopeOf, parseMentions, statusesFor, statusOf, FIN_SPACE_FA, FLOW_FA, type FinSpace } from './domain'
import { AUDIT_FIELD } from './taskFields'
import { calcSentence, settleTask } from './points'
import { canViewTask, guard } from './policy'

export type Page = 'home' | 'projects' | 'project' | 'workload' | 'review' | 'runs' | 'admin' | 'notifications' | 'pchat' | 'chat' | 'team' | 'supervision' | 'points'
  | 'requests' | 'timesheet' | 'inbox' | 'adminreports' | 'personal' | 'finadmin'
/** Pages of the Project Control section: CEO and Project Control only */
export const CONTROL_PAGES: Page[] = ['workload', 'review', 'runs', 'points', 'admin']
export interface Nav { page: Page; projectId?: string; channelId?: string; teamId?: string; date?: string; userId?: string; requestId?: string; space?: FinSpace }

export interface State {
  teams: Team[]; users: User[]; projects: Project[]; tasks: Record<string, Task>
  statusSets: Record<string, Status[]>; allocations: Allocation[]; holidays: Holiday[]; leaves: Leave[]
  syncItems: SyncItem[]; syncRuns: SyncRun[]; audit: AuditEntry[]; writeQueue: WriteBackItem[]
  comments: Comment[]; messages: ChatMessage[]; notifications: Notification[]; lastRead: Record<string, string>
  session: string | null; persianDigits: boolean; nav: Nav; openTaskId: string | null; profileUserId: string | null
  theme: ThemeChoice
  internalProjects: InternalProject[]; reviewRounds: ReviewRound[]; attachments: Attachment[]
  pointEntries: PointEntry[]; pointConfigs: PointConfig[]
  workLogs: WorkLog[]
  adminRequests: AdminRequest[]; timesheets: Record<string, TimesheetDay>; timesheetConfigs: TimesheetConfig[]; monthCloses: MonthClose[]
  /** private to each person; never read by projects, plans, calendars or reports */
  personalTasks: Record<string, PersonalTask>; personalBoards: Record<string, PersonalBoard>
  profileTab: 'profile' | 'points'
  /** Last refused action — shown as a toast; the refusal itself is also in the AuditLog */
  denial: { id: number; text: string } | null
}

export type NewFile = { name: string; mime: string; size: number; dataUrl: string }
export type FlowOp = 'assign' | 'start' | 'submit' | 'complete' | 'approve' | 'rework' | 'reopen'

export type ThemeChoice = 'system' | 'light' | 'dark'

export const WRITEBACK_DELAY_SEC = 120

export type Action =
  | { type: 'login'; id: string }
  | { type: 'logout' }
  | { type: 'register'; user: User }
  | { type: 'approveUser'; id: string; teamId: string; role: Role }
  | { type: 'rejectUser'; id: string }
  | { type: 'addUser'; user: User }
  | { type: 'updateUser'; id: string; patch: Partial<User> }
  | { type: 'openProfile'; id: string | null; tab?: 'profile' | 'points' }
  | { type: 'setDigits'; on: boolean }
  | { type: 'setTheme'; theme: ThemeChoice }
  | { type: 'nav'; nav: Nav }
  | { type: 'openTask'; id: string | null }
  | { type: 'setStatus'; taskId: string; statusId: string }
  | { type: 'savePlan'; taskId: string; assignee: Resource | null; estimation?: number; start?: string; due?: string; allocations: Allocation[] }
  | { type: 'addTask'; task: Task }
  | { type: 'addComment'; taskId: string; text: string }
  | { type: 'sendMessage'; channelId: string; text: string }
  | { type: 'readNotifs'; ids?: string[] }
  | { type: 'readChannel'; channelId: string }
  | { type: 'review'; ids: string[]; approve: boolean }
  | { type: 'addRun'; run: SyncRun }
  | { type: 'updateRun'; id: string; patch: Partial<SyncRun> }
  | { type: 'flushWriteBack' }
  // ---------- jobs of the server itself (session = null); a browser can never send these ----------
  | { type: 'sysRunStart'; run: SyncRun }
  | { type: 'sysSyncResult'; projectId: string; runId: string; run: Partial<SyncRun>; items: SyncItem[]; refresh: MdrRefresh[]; at: string; replacePending: boolean; by?: string }
  | { type: 'sysWriteBack'; runs: SyncRun[]; settled: { taskId: string; queuedAt: number }[]; rows: { taskId: string; mdrRow: number }[] }
  | { type: 'addHoliday'; holiday: Holiday } | { type: 'removeHoliday'; id: string }
  | { type: 'addLeave'; leave: Leave } | { type: 'removeLeave'; id: string }
  | { type: 'statusAdd'; scope: string; status: Status }
  | { type: 'statusUpdate'; scope: string; id: string; patch: Partial<Status> }
  | { type: 'statusDelete'; scope: string; id: string; moveTo?: string }
  | { type: 'statusOverride'; scope: string }
  | { type: 'statusInherit'; scope: string }
  | { type: 'projectAdd'; project: Project }
  | { type: 'projectUpdate'; id: string; patch: Partial<Project> }
  | { type: 'createFlowTask'; task: Task; files?: NewFile[] }
  | { type: 'flow'; taskId: string; op: FlowOp; assigneeId?: string; note?: string; files?: NewFile[] }
  | { type: 'updateTask'; taskId: string; patch: Partial<Task> }
  | { type: 'addAttachments'; taskId: string; files: NewFile[] }
  | { type: 'setActual'; taskId: string; actualStart?: string; actualFinish?: string; reason: string }
  | { type: 'internalProjectAdd'; project: InternalProject }
  | { type: 'internalProjectUpdate'; id: string; patch: Partial<InternalProject> }
  | { type: 'logWork'; log: { taskId: string; minutes: number; workDate: string; description: string } }
  | { type: 'editWorkLog'; id: string; patch: { minutes: number; workDate: string; description: string }; reason?: string }
  | { type: 'deleteWorkLog'; id: string; reason?: string }
  | { type: 'pointRecalc'; taskId: string }
  | { type: 'pointAdjust'; userId: string; points: number; reason: string; taskId?: string }
  | { type: 'pointConfig'; config: Pick<PointConfig, 'multiplier' | 'hoursPerDay' | 'earlyFactor' | 'lateFactor' | 'cap'>; reason: string }
  | { type: 'reqCreate'; req: NewRequest; files?: NewFile[] }
  | { type: 'reqDecide'; id: string; decision: 'approve' | 'reject'; note?: string; minutes?: number }
  | { type: 'reqWithdraw'; id: string }
  | { type: 'reqCancel'; id: string; note: string }
  | { type: 'tsSave'; userId: string; date: string; checkIn?: string; checkOut?: string; breakMinutes: number; note?: string; reason?: string }
  | { type: 'tsPunch'; kind: 'in' | 'out' }
  | { type: 'tsUnpaid'; date: string }
  | { type: 'monthClose'; month: string }
  | { type: 'tsConfig'; config: Pick<TimesheetConfig, 'dutyNetMinutes' | 'minBreakMinutes' | 'editDays' | 'from'>; reason: string }
  | { type: 'ptCreate'; task: { title: string; description?: string; parentId?: string | null; statusId?: string; priority?: Priority; start?: string; due?: string } }
  | { type: 'ptUpdate'; id: string; patch: Partial<Pick<PersonalTask, 'title' | 'description' | 'statusId' | 'priority' | 'start' | 'due'>> }
  | { type: 'ptDelete'; id: string }
  | { type: 'ptMove'; id: string; parentId: string | null; index: number }
  | { type: 'psSave'; statuses: PersonalStatus[]; defaultStatusId: string; remap?: Record<string, string> }

export type NewRequest =
  | { kind: 'leave'; description: string; leave: LeaveDetails }
  | { kind: 'overtime'; description: string; overtime: { date: string; minutes: number; taskIds: string[] } }
  | { kind: 'other'; description: string; other: OtherDetails }

let seq = 100
/** Prefix of ids made by this process. The server sets a fresh one at every start, so ids never repeat across restarts. */
let idBase = ''
export function setIdBase(base: string) { idBase = base }
const nowIso = () => new Date().toISOString()

// ---------- pure selectors (lib/domain.ts) and permissions (lib/policy.ts) ----------
export { ancestors, effectiveScope, parentScopeOf, statusesFor, statusOf, isWorkItem, isFlowTask, isFinTask, finSpaceOf, finProjectId, FIN_SPACES, FIN_SPACE_FA, activeOf, projectTeams, channelMembers, parseMentions, teamOfTask, flowOf, flowProgress, taskProgress, isClosed, FLOW_FA, FLOW_ORDER, FLOW_PROGRESS } from './domain'

export function rollupMap(state: Pick<State, 'tasks' | 'statusSets'>) {
  const kids: Record<string, Task[]> = {}
  for (const t of Object.values(state.tasks)) {
    const key = t.parentId ?? `root:${t.projectId}`
    ;(kids[key] ??= []).push(t)
  }
  for (const k of Object.keys(kids)) kids[k].sort((a, b) => a.order - b.order)
  type R = { progress: number; est: number; start?: string; due?: string; items: number; done: number; unassigned: number }
  const memo: Record<string, R> = {}
  const calc = (t: Task): R => {
    if (memo[t.id]) return memo[t.id]
    if (isWorkItem(t)) {
      const s = statusOf(state, t)
      const r: R = { progress: s?.progress ?? 0, est: t.estimation ?? 0, start: t.start, due: t.due, items: 1, done: s?.category === 'done' ? 1 : 0, unassigned: !t.assigneeUserId && !t.assigneeTeamId ? 1 : 0 }
      return (memo[t.id] = r)
    }
    const ch = (kids[t.id] ?? []).filter((c) => !c.removedFromMdr)
    let wsum = 0, psum = 0, plain = 0
    const r: R = { progress: 0, est: 0, items: 0, done: 0, unassigned: 0 }
    for (const c of ch) {
      const cr = calc(c)
      const w = c.weight ?? 1
      wsum += w; psum += w * cr.progress; plain += cr.progress
      r.est += cr.est; r.items += cr.items; r.done += cr.done; r.unassigned += cr.unassigned
      if (cr.start && (!r.start || cr.start < r.start)) r.start = cr.start
      if (cr.due && (!r.due || cr.due > r.due)) r.due = cr.due
    }
    // MDR weights are shares of the whole project; when every child of a row weighs 0 the row still shows its children's mean
    r.progress = wsum ? psum / wsum : ch.length ? plain / ch.length : 0
    return (memo[t.id] = r)
  }
  for (const t of Object.values(state.tasks)) calc(t)
  return { kids, roll: memo }
}

// ---------- reducer helpers ----------
const actor = (state: State) => state.session ?? 'system'
const nameOf = (state: State, id?: string | null) => state.users.find((u) => u.id === id)?.name ?? 'سامانه'
function auditOf(state: State, kind: AuditEntry['kind'], text: string, taskId?: string): AuditEntry {
  return { id: `a-${idBase}${seq++}`, at: nowIso(), userId: actor(state), taskId, kind, text }
}
/** One notification per recipient; the person who acted is never notified of their own action */
function notify(state: State, recipients: (string | undefined)[], n: Omit<Notification, 'id' | 'userId' | 'read' | 'at'>): Notification[] {
  const active = new Set(activeOf(state.users).map((u) => u.id))
  return [...new Set(recipients)].filter((id): id is string => !!id && id !== state.session && active.has(id))
    .map((userId) => ({ id: `n-${idBase}${seq++}`, userId, at: nowIso(), read: false, actorId: state.session ?? undefined, ...n }))
}
const teamMembers = (state: State, teamId?: string) => activeOf(state.users).filter((u) => u.teamId === teamId).map((u) => u.id)
/** Project Control desk: receives Sync, account and issue notifications */
const controlIds = (state: State) => activeOf(state.users).filter((u) => u.role === 'control' || u.role === 'ceo').map((u) => u.id)
const recipientsOfTask = (state: State, t: Task) => (t.assigneeUserId ? [t.assigneeUserId] : t.assigneeTeamId ? teamMembers(state, t.assigneeTeamId) : [])
function sysMsg(channelId: string, text: string, link?: NotifLink): ChatMessage {
  return { id: `m-${idBase}${seq++}`, channelId, userId: null, system: true, at: nowIso(), text, mentions: [], link }
}

/** 150 → «2:30» (h:mm) for AuditLog lines */
export const fmtMinutes = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const FIELD_FA = AUDIT_FIELD
/** What a flow task is called in notifications and AuditLog lines */
const flowLabel = (t: Task) => (t.kind === 'supervision' ? 'مورد نظارتی' : t.kind === 'internal' ? 'تسک تیم' : t.kind === 'finadmin' ? (finSpaceOf(t) === 'office' ? 'Task اداری' : 'Task مالی') : 'تسک')
/** The CEO coordinates the Finance & Administration space */
const ceoIds = (state: State) => activeOf(state.users).filter((u) => u.role === 'ceo').map((u) => u.id)
function mkAttachment(state: State, taskId: string, f: NewFile, roundId?: string): Attachment {
  return { id: `f-${idBase}${seq++}`, taskId, roundId, name: f.name, mime: f.mime, size: f.size, dataUrl: f.dataUrl, uploadedBy: actor(state), uploadedAt: nowIso() }
}

/** Create → Assign → Execution → Submit for Review → Approve / Rework → Close; for project work items the review overlays the Status Set */
function applyFlow(state: State, a: Extract<Action, { type: 'flow' }>): State {
  const t = state.tasks[a.taskId]
  const me = actor(state)
  const note = (a.note ?? '').trim()
  const link: NotifLink = { type: 'task', id: t.id }
  const label = flowLabel(t)
  const prevRounds = state.reviewRounds.filter((r) => r.taskId === t.id)
  const openRound = [...prevRounds].reverse().find((r) => !r.decision)
  const audit: AuditEntry[] = []
  let nt: Task = { ...t }
  let next: State = state
  let rounds = state.reviewRounds
  let files: Attachment[] = []
  let n: Notification[] = []
  const setFlow = (f: FlowState | undefined) => { if (f && isFlowTask(t)) audit.push(auditOf(state, 'review', `${FLOW_FA[flowOf(t)]} ← ${FLOW_FA[f]}${note ? `: ${note}` : ''}`, t.id)); nt.flow = f }
  const decide = (decision: 'approve' | 'rework') => {
    if (openRound) rounds = rounds.map((r) => (r.id === openRound.id ? { ...r, decision, decidedBy: me, decidedAt: nowIso(), decisionNote: note || undefined } : r))
  }
  switch (a.op) {
    case 'assign': {
      nt.assigneeUserId = a.assigneeId
      setFlow(flowOf(t) === 'rework' ? 'rework' : flowOf(t) === 'in_progress' ? 'in_progress' : 'assigned')
      audit.push(auditOf(state, 'allocation', `ارجاع به ${nameOf(state, a.assigneeId)}`, t.id))
      n = notify(state, [a.assigneeId], { kind: 'assign', title: `${label} «${t.name}» به شما ارجاع شد`, body: note || undefined, link })
      break
    }
    case 'start': {
      setFlow('in_progress')
      if (!t.actualStart) { nt.actualStart = TODAY; audit.push(auditOf(state, 'actual', `Actual Start ثبت شد: ${jalaliFa(TODAY)}`, t.id)) }
      n = notify(state, [t.reviewerId ?? t.reporterId], { kind: 'status', title: `${nameOf(state, me)} کار «${t.name}» را ${flowOf(t) === 'rework' ? 'برای اصلاح' : ''} شروع کرد`, link })
      break
    }
    case 'submit': {
      const round: ReviewRound = { id: `r-${idBase}${seq++}`, taskId: t.id, round: prevRounds.length + 1, submittedBy: me, submittedAt: nowIso(), note }
      rounds = [...rounds, round]
      files = (a.files ?? []).map((f) => mkAttachment(state, t.id, f, round.id))
      if (!t.actualStart) { nt.actualStart = TODAY; audit.push(auditOf(state, 'actual', `Actual Start ثبت شد: ${jalaliFa(TODAY)}`, t.id)) }
      setFlow('in_review')
      if (!isFlowTask(t)) audit.push(auditOf(state, 'review', `ارسال برای بررسی (دور ${round.round}): ${note}`, t.id))
      const deciders = t.reviewerId ? [t.reviewerId] : activeOf(state.users).filter((u) => u.teamId === t.teamSpaceId && u.role === 'lead').map((u) => u.id)
      n = notify(state, deciders, { kind: 'review', title: `«${t.name}» برای بررسی ارسال شد (دور ${round.round})`, body: note, link })
      break
    }
    case 'complete': {
      setFlow('closed')
      nt.actualStart = t.actualStart ?? TODAY
      nt.actualFinish = TODAY
      audit.push(auditOf(state, 'actual', `Actual Finish ثبت شد: ${jalaliFa(TODAY)}`, t.id))
      n = notify(state, [t.reporterId, t.createdBy, ...(isFinTask(t) ? ceoIds(state) : [])], { kind: 'status', title: `${label} «${t.name}» بسته شد`, body: note || undefined, link })
      break
    }
    case 'approve': {
      decide('approve')
      if (isWorkItem(t)) {
        const done = statusesFor(state, t).find((x) => x.category === 'done')
        nt.flow = undefined
        next = apply({ ...state, tasks: { ...state.tasks, [t.id]: nt } }, { type: 'setStatus', taskId: t.id, statusId: done?.id ?? t.statusId ?? '' })
        nt = next.tasks[t.id]
        audit.push(auditOf(state, 'review', `تأیید Reviewer (دور ${openRound?.round ?? 1})${note ? `: ${note}` : ''}`, t.id))
      } else {
        setFlow('closed')
        nt.actualStart = t.actualStart ?? TODAY
        nt.actualFinish = TODAY
        audit.push(auditOf(state, 'actual', `Actual Finish ثبت شد: ${jalaliFa(TODAY)}`, t.id))
      }
      n = notify(state, [t.assigneeUserId, t.reporterId], { kind: 'review', title: `«${t.name}» تأیید و بسته شد`, body: note || undefined, link })
      break
    }
    case 'rework': {
      decide('rework')
      if (isWorkItem(t)) {
        const fix = statusesFor(state, t).find((x) => x.category === 'doing' && x.name.includes('اصلاح'))
        nt.flow = 'rework'
        if (fix && fix.id !== t.statusId) { next = apply({ ...state, tasks: { ...state.tasks, [t.id]: nt } }, { type: 'setStatus', taskId: t.id, statusId: fix.id }); nt = next.tasks[t.id] }
        audit.push(auditOf(state, 'review', `بازگشت برای اصلاح (دور ${openRound?.round ?? 1}): ${note}`, t.id))
      } else setFlow('rework')
      n = notify(state, t.assigneeUserId ? [t.assigneeUserId] : recipientsOfTask(state, t), { kind: 'review', title: `«${t.name}» برای اصلاح برگشت`, body: note, link })
      break
    }
    case 'reopen': {
      setFlow('rework')
      nt.actualFinish = undefined
      audit.push(auditOf(state, 'actual', 'تسک دوباره باز شد؛ Actual Finish پاک شد', t.id))
      n = notify(state, [t.assigneeUserId], { kind: 'review', title: `«${t.name}» دوباره باز شد`, body: note, link })
      break
    }
  }
  const msgs = t.kind === 'supervision' && (a.op === 'approve' || a.op === 'rework') ? [sysMsg(`project:${t.projectId}`, `مورد نظارتی «${t.name}» ${a.op === 'approve' ? 'تأیید و بسته شد' : 'برای اصلاح برگشت'}.`, link)] : []
  return {
    ...next, tasks: { ...next.tasks, [t.id]: nt }, reviewRounds: rounds, attachments: [...next.attachments, ...files],
    notifications: [...n, ...next.notifications], messages: [...next.messages, ...msgs], audit: [...audit, ...next.audit],
  }
}

const ACTION_FA: Record<string, string> = {
  setStatus: 'تغییر Status', savePlan: 'برنامه‌ریزی', addTask: 'ساخت تسک', createFlowTask: 'ساخت تسک', flow: 'گردش‌کار', updateTask: 'ویرایش تسک',
  addAttachments: 'افزودن پیوست', setActual: 'اصلاح تاریخ واقعی', approveUser: 'تأیید عضویت', updateUser: 'ویرایش کاربر', openTask: 'مشاهده‌ی تسک',
  logWork: 'ثبت Work Log', editWorkLog: 'ویرایش Work Log', deleteWorkLog: 'حذف Work Log',
  reqCreate: 'ثبت درخواست اداری', reqDecide: 'تصمیم درباره‌ی درخواست', reqWithdraw: 'پس گرفتن درخواست', reqCancel: 'لغو مرخصی', tsSave: 'ثبت تایم‌شیت', tsPunch: 'ثبت ورود/خروج',
  ptCreate: 'کار شخصی', ptUpdate: 'کار شخصی', ptDelete: 'کار شخصی', ptMove: 'کار شخصی', psSave: 'Statusهای شخصی',
  tsUnpaid: 'اضافه‌کاری بدون پرداخت', monthClose: 'بستن ماه', tsConfig: 'قواعد تایم‌شیت', addLeave: 'ثبت مستقیم مرخصی', removeLeave: 'حذف مرخصی', addHoliday: 'ثبت تعطیلی', pointRecalc: 'بازمحاسبه‌ی امتیاز', pointAdjust: 'اصلاح امتیاز', pointConfig: 'پارامترهای امتیاز', review: 'Sync Review', addRun: 'اجرای Sync',
}

/** Every write passes the permission guard first (the browser stand-in for server-side checks). Refusals change nothing but the AuditLog. */
export function reducer(state: State, a: Action): State {
  const denied = guard(state, a as unknown as { type: string })
  if (denied) {
    const t = 'taskId' in a ? (a as { taskId: string }).taskId : a.type === 'openTask' && a.id ? a.id : a.type === 'logWork' ? a.log.taskId
      : a.type === 'editWorkLog' || a.type === 'deleteWorkLog' ? state.workLogs.find((l) => l.id === a.id)?.taskId : undefined
    return { ...state, denial: { id: seq++, text: denied }, audit: [auditOf(state, 'security', `رد دسترسی: ${ACTION_FA[a.type] ?? a.type} — ${denied}`, t && state.tasks[t] ? t : undefined), ...state.audit] }
  }
  const next = apply(state, a)
  if (TIMESHEET_TRIGGERS.has(a.type)) return settleTimesheets(next)
  return POINT_TRIGGERS.has(a.type) && 'taskId' in a ? settlePoints(state, next, (a as { taskId: string }).taskId, a) : next
}

// ---------- points: settled after every action that can change a task's completion, Due, Estimation, W.F or assignee ----------
const POINT_TRIGGERS = new Set(['setStatus', 'savePlan', 'flow', 'updateTask', 'setActual', 'pointRecalc'])
export const currentPointConfig = (s: Pick<State, 'pointConfigs'>) => s.pointConfigs[s.pointConfigs.length - 1]

function settlePoints(prev: State, next: State, taskId: string, a: Action): State {
  const before = prev.tasks[taskId], t = next.tasks[taskId]
  // the Finance & Administration space is not scored: its tasks never reach the points ledger or its reports
  if (!t || isFinTask(t) || !(isWorkItem(t) || isFlowTask(t))) return next
  const cfg = currentPointConfig(next)
  const wasClosed = !!before && isClosed(prev, before), closed = isClosed(next, t)
  const reason = a.type === 'pointRecalc' ? `بازمحاسبه با پارامترهای نسخه‌ی ${cfg.version}`
    : !wasClosed && closed ? (t.reviewerId ? 'اتمام تسک با تأیید Reviewer' : 'اتمام تسک')
      : wasClosed && !closed ? 'بازگشایی تسک'
        : before && before.due !== t.due ? `تغییر Due Date به ${t.due ? jalaliFa(t.due) : '—'}`
          : before && before.estimation !== t.estimation ? 'تغییر Estimation'
            : before && (before.wf ?? 1) !== (t.wf ?? 1) ? `تغییر W.F به ${t.wf ?? 1}`
              : a.type === 'setActual' ? 'اصلاح تاریخ واقعی' : 'به‌روزرسانی'
  const r = settleTask(next.pointEntries, t, closed, cfg, new Set(next.holidays.map((h) => h.date)), {
    reason, actorId: actor(next), now: nowIso(), today: TODAY, force: a.type === 'pointRecalc', newId: () => `p-${idBase}${seq++}`,
  })
  if (!r.added.length) {
    if (!wasClosed && closed && r.skipped) return { ...next, audit: [auditOf(next, 'points', `Point ثبت نشد: ${r.skipped}`, t.id), ...next.audit] }
    return next
  }
  const sign = (x: number) => `${x > 0 ? '+' : ''}${x}`
  const audit = r.added.map((e) => auditOf(next, 'points', e.kind === 'reversal' ? `برگشت امتیاز قبلی (${sign(e.points)}) — ${reason}` : `Point ${sign(e.points)} برای ${nameOf(next, e.userId)} — ${calcSentence(e.calc!, (x) => String(x))}؛ ${reason}`, t.id))
  const award = r.added.find((e) => e.kind === 'task')
  const n = award ? notify(next, [award.userId], { kind: 'points', title: `امتیاز «${t.name}»: ${sign(award.points)}`, body: `${calcSentence(award.calc!, (x) => String(x))} — ${reason}`, link: { type: 'page', page: 'mypoints' } })
    : notify(next, [r.added[0].userId], { kind: 'points', title: `امتیاز «${t.name}» برگشت خورد`, body: reason, link: { type: 'page', page: 'mypoints' } })
  return { ...next, pointEntries: r.entries, audit: [...audit.reverse(), ...next.audit], notifications: [...n, ...next.notifications] }
}


// ---------- administrative module: requests and timesheets ----------
export const EMPTY_CALC: TimesheetCalc = { presence: 0, breakMinutes: 0, worked: 0, duty: 0, leave: 0, offDay: false, excess: 0, requested: 0, approved: 0, pending: 0, unpaid: 0, undecided: 0, deficit: 0, configVersion: 0 }
const faDigits = (s: string) => s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const roleIds = (state: State, role: Role) => activeOf(state.users).filter((u) => u.role === role).map((u) => u.id)
export function requestSummary(r: AdminRequest, holidays: Set<string>) {
  if (r.kind === 'leave' && r.leave) {
    const l = r.leave
    return l.mode === 'hour'
      ? `${LEAVE_CAT_FA[l.category]}، ساعتی ${jalaliFa(l.from)} از ${faDigits(l.startTime ?? '')} تا ${faDigits(l.endTime ?? '')}`
      : `${LEAVE_CAT_FA[l.category]}، ${faDigits(String(leaveDates(l, holidays).length))} روز کاری از ${jalaliFa(l.from)} تا ${jalaliFa(l.to)}`
  }
  if (r.kind === 'overtime' && r.overtime) return `${faDigits(hm(r.overtime.minutes))} در ${jalaliFa(r.overtime.date)}${r.overtime.source === 'advance' ? ' (از پیش)' : ''}`
  return r.other?.title ?? ''
}
/** Leave rows for the planner, one per working day; full days take the person's daily capacity */
function leaveRowsOf(state: State, r: AdminRequest): Leave[] {
  const u = state.users.find((x) => x.id === r.userId)
  const holidays = new Set(state.holidays.map((h) => h.date))
  const l = r.leave!
  const hours = l.mode === 'hour' ? Math.round((hourLeaveMinutes(l) / 60) * 100) / 100 : u?.capacity ?? 8
  return leaveDates(l, holidays).map((date, i) => ({ id: `l-r${r.no}-${i + 1}`, userId: r.userId, date, hours, note: l.mode === 'hour' ? 'مرخصی ساعتی' : 'مرخصی', requestId: r.id, at: nowIso() }))
}
function applyRequestCreate(state: State, a: Extract<Action, { type: 'reqCreate' }>): State {
  const me = state.users.find((u) => u.id === state.session)!
  const at = nowIso()
  const no = Math.max(0, ...state.adminRequests.map((r) => r.no)) + 1
  const steps: RequestStep[] = [{ stage: 'submit', by: me.id, at }]
  let status: AdminRequest['status'] = 'pending_office'
  const office = roleIds(state, 'office').filter((id) => id !== me.id)
  if (me.role === 'ceo') { status = 'approved'; steps.push({ stage: 'system', by: me.id, at, decision: 'approve', note: 'درخواست مدیرعامل بدون مرحله‌ی تأیید ثبت شد' }) }
  else if (me.role === 'office' || !office.length) { status = 'pending_ceo'; steps.push({ stage: 'system', by: 'system', at, note: me.role === 'office' ? 'درخواست مدیر اداری مستقیم به کارتابل مدیرعامل رفت' : 'مدیر اداری فعالی نیست؛ درخواست مستقیم به مدیرعامل رفت' }) }
  const q = a.req
  const r: AdminRequest = {
    id: `rq-${idBase}${seq++}`, no, userId: me.id, kind: q.kind, status, createdAt: at, stageSince: at, description: q.description.trim(), steps,
    files: (a.files ?? []).map((f) => ({ id: `rf-${idBase}${seq++}`, name: f.name, mime: f.mime, size: f.size, dataUrl: f.dataUrl, uploadedAt: at })),
  }
  if (q.kind === 'leave') r.leave = { ...q.leave, to: q.leave.mode === 'hour' ? q.leave.from : q.leave.to }
  if (q.kind === 'other') r.other = { ...q.other, title: q.other.title.trim() }
  if (q.kind === 'overtime') {
    const day = state.timesheets[dayKey(me.id, q.overtime.date)]
    r.overtime = { date: q.overtime.date, minutes: q.overtime.minutes, taskIds: [...new Set(q.overtime.taskIds)], source: day?.checkOut ? 'timesheet' : 'advance' }
    if (status === 'approved') r.overtime.approvedMinutes = q.overtime.minutes
  }
  let leaves = state.leaves
  if (status === 'approved' && r.kind === 'leave') { const rows = leaveRowsOf(state, r); r.leaveIds = rows.map((x) => x.id); leaves = [...leaves, ...rows] }
  const holidays = new Set(state.holidays.map((h) => h.date))
  const sum = requestSummary(r, holidays)
  const deciders = status === 'pending_office' ? office : status === 'pending_ceo' ? roleIds(state, 'ceo') : []
  const n = notify(state, deciders, { kind: 'request', title: `درخواست ${KIND_FA[r.kind]} از ${me.name}`, body: sum, link: { type: 'page', page: 'inbox' } })
  return {
    ...state, adminRequests: [...state.adminRequests, r], leaves, notifications: [...n, ...state.notifications],
    audit: [auditOf(state, 'request', `درخواست ${KIND_FA[r.kind]} #${no} ثبت شد (${STATUS_FA[status]}) — ${sum}`), ...state.audit],
  }
}
function applyRequestDecide(state: State, a: Extract<Action, { type: 'reqDecide' }>): State {
  const r = state.adminRequests.find((x) => x.id === a.id)!
  const me = actor(state)
  const at = nowIso()
  const stage = r.status === 'pending_office' ? 'office' : 'ceo'
  const note = a.note?.trim() || undefined
  const prevMinutes = r.overtime ? [...r.steps].reverse().find((s) => s.stage === 'office' && s.minutes != null)?.minutes ?? r.overtime.minutes : undefined
  const minutes = r.kind === 'overtime' && a.decision === 'approve' ? a.minutes ?? prevMinutes : undefined
  const step: RequestStep = { stage, by: me, at, decision: a.decision, note, minutes }
  const holidays = new Set(state.holidays.map((h) => h.date))
  const sum = requestSummary(r, holidays)
  const label = `${KIND_FA[r.kind]} #${r.no}`
  let next: AdminRequest = { ...r, steps: [...r.steps, step], stageSince: at }
  let leaves = state.leaves
  let n: Notification[]
  if (a.decision === 'reject') {
    next.status = 'rejected'
    n = notify(state, [r.userId], { kind: 'request', title: `درخواست ${label} شما رد شد`, body: `${stage === 'office' ? 'مدیر اداری' : 'مدیرعامل'}: ${note}`, link: { type: 'page', page: 'requests' } })
  } else if (stage === 'office') {
    next.status = 'pending_ceo'
    n = [
      ...notify(state, [r.userId], { kind: 'request', title: `درخواست ${label} شما تأیید مدیر اداری را گرفت`, body: 'برای تصمیم نهایی در کارتابل مدیرعامل است.', link: { type: 'page', page: 'requests' } }),
      ...notify(state, roleIds(state, 'ceo').filter((id) => id !== r.userId), { kind: 'request', title: `درخواست ${KIND_FA[r.kind]} از ${nameOf(state, r.userId)}`, body: `${sum} — تأیید مدیر اداری`, link: { type: 'page', page: 'inbox' } }),
    ]
  } else {
    next.status = 'approved'
    if (next.overtime) next.overtime = { ...next.overtime, approvedMinutes: minutes }
    if (r.kind === 'leave') { const rows = leaveRowsOf(state, next); next.leaveIds = rows.map((x) => x.id); leaves = [...leaves, ...rows] }
    const part = r.kind === 'overtime' && minutes != null && minutes < r.overtime!.minutes ? ` (${faDigits(hm(minutes))} از ${faDigits(hm(r.overtime!.minutes))})` : ''
    n = notify(state, [r.userId], { kind: 'request', title: `درخواست ${label} شما تأیید شد${part}`, body: sum, link: { type: 'page', page: 'requests' } })
  }
  const what = a.decision === 'approve' ? `تأیید ${stage === 'office' ? 'مدیر اداری' : 'نهایی مدیرعامل'}${minutes != null ? ` (${hm(minutes)})` : ''}` : `رد ${stage === 'office' ? 'مدیر اداری' : 'مدیرعامل'}`
  return {
    ...state, adminRequests: state.adminRequests.map((x) => (x.id === r.id ? next : x)), leaves, notifications: [...n, ...state.notifications],
    audit: [auditOf(state, 'request', `${what}: درخواست ${label} ${nameOf(state, r.userId)} — ${sum}${note ? ` — ${note}` : ''}`), ...state.audit],
  }
}
/** Recalculate open-month timesheet days after any change that can move them; a day that newly shows undecided overtime prompts its owner */
const TIMESHEET_TRIGGERS = new Set(['tsSave', 'tsPunch', 'tsUnpaid', 'reqCreate', 'reqDecide', 'reqWithdraw', 'reqCancel', 'addLeave', 'removeLeave', 'addHoliday', 'removeHoliday', 'tsConfig', 'monthClose'])
function settleTimesheets(state: State): State {
  const r = settleDays({ days: state.timesheets, requests: state.adminRequests, leaves: state.leaves, holidays: state.holidays.map((h) => h.date), configs: state.timesheetConfigs, closes: state.monthCloses })
  if (!r.changed.length) return state
  const n: Notification[] = r.changed.filter((c) => c.prev.calc.undecided === 0 && c.next.calc.undecided > 0).map((c) => ({
    id: `n-${idBase}${seq++}`, userId: c.next.userId, at: nowIso(), read: false, kind: 'timesheet' as const,
    title: `اضافه‌کاری ${faDigits(hm(c.next.calc.undecided))} در ${jalaliFa(c.next.date)}`,
    body: 'کار خالص این روز از ساعت موظف بیشتر شد. درخواست اضافه‌کاری ثبت کنید یا آن را بدون پرداخت بگذارید.',
    link: { type: 'page', page: 'timesheet' },
  }))
  return { ...state, timesheets: r.days, notifications: n.length ? [...n, ...state.notifications] : state.notifications }
}


// ---------- personal tasks (owner only; checked in lib/policy.ts) ----------
type PersonalAction = Extract<Action, { type: 'ptCreate' | 'ptUpdate' | 'ptDelete' | 'ptMove' | 'psSave' }>
function applyPersonal(state: State, a: PersonalAction): State {
  const me = actor(state)
  const at = nowIso()
  const board = boardOf(state.personalBoards, me)
  const doneIds = (b: PersonalBoard) => new Set(b.statuses.filter((x) => x.done).map((x) => x.id))
  const boards = state.personalBoards[me] ? state.personalBoards : { ...state.personalBoards, [me]: board }
  const all = state.personalTasks
  switch (a.type) {
    case 'ptCreate': {
      const f = a.task
      const statusId = f.statusId ?? board.defaultStatusId
      const t: PersonalTask = {
        id: `pt-${idBase}${seq++}`, ownerId: me, parentId: f.parentId ?? null, title: f.title.trim(), description: f.description?.trim() || undefined,
        statusId, priority: f.priority ?? 'normal', start: f.start || undefined, due: f.due || undefined,
        order: nextOrder(Object.values(all), me, f.parentId ?? null), createdAt: at, updatedAt: at, completedAt: doneIds(board).has(statusId) ? at : undefined,
      }
      return { ...state, personalBoards: boards, personalTasks: { ...all, [t.id]: t } }
    }
    case 'ptUpdate': {
      const t = all[a.id]
      const p = { ...a.patch }
      if (p.title !== undefined) p.title = p.title.trim()
      if (p.description !== undefined) p.description = p.description.trim() || undefined
      if (p.start === '') p.start = undefined
      if (p.due === '') p.due = undefined
      const next: PersonalTask = { ...t, ...p, updatedAt: at }
      if (p.statusId !== undefined && p.statusId !== t.statusId) {
        const done = doneIds(board).has(p.statusId), was = doneIds(board).has(t.statusId)
        if (done && !was) next.completedAt = at
        if (!done) next.completedAt = undefined
      }
      return { ...state, personalBoards: boards, personalTasks: { ...all, [t.id]: next } }
    }
    case 'ptDelete': {
      const gone = new Set([a.id, ...descendants(tasksOf(all, me), a.id).map((x) => x.id)])
      return { ...state, personalTasks: Object.fromEntries(Object.entries(all).filter(([id]) => !gone.has(id))) }
    }
    case 'ptMove': {
      const t = all[a.id]
      const siblings = tasksOf(all, me).filter((x) => x.parentId === a.parentId && x.id !== t.id).sort((x, y) => x.order - y.order)
      siblings.splice(Math.min(a.index, siblings.length), 0, { ...t, parentId: a.parentId })
      const next = { ...all }
      siblings.forEach((x, i) => { next[x.id] = { ...next[x.id], parentId: a.parentId, order: i + 1, ...(x.id === t.id ? { updatedAt: at } : {}) } })
      return { ...state, personalTasks: next }
    }
    case 'psSave': {
      const nb: PersonalBoard = { userId: me, statuses: a.statuses.map((x) => ({ id: x.id, name: x.name.trim(), color: x.color, done: !!x.done })), defaultStatusId: a.defaultStatusId }
      const keep = new Set(nb.statuses.map((x) => x.id))
      const done = doneIds(nb)
      const next = { ...all }
      for (const t of tasksOf(all, me)) {
        const statusId = keep.has(t.statusId) ? t.statusId : a.remap?.[t.statusId] ?? nb.defaultStatusId
        const isDoneNow = done.has(statusId)
        if (statusId !== t.statusId || isDoneNow !== !!t.completedAt) next[t.id] = { ...t, statusId, completedAt: isDoneNow ? t.completedAt ?? at : undefined, updatedAt: at }
      }
      return { ...state, personalBoards: { ...state.personalBoards, [me]: nb }, personalTasks: next }
    }
  }
}

function apply(state: State, a: Action): State {
  switch (a.type) {
    case 'login': return { ...state, session: a.id, nav: state.nav.page ? state.nav : { page: 'home' } }
    case 'logout': return { ...state, session: null, openTaskId: null, profileUserId: null, nav: { page: 'home' } }
    case 'register': {
      const n = notify({ ...state, session: null }, controlIds(state), { kind: 'account', title: `درخواست عضویت: ${a.user.name} (${a.user.username})`, body: 'برای فعال شدن حساب، تیم و نقش را تعیین و تأیید کنید.', link: { type: 'page', page: 'admin' } })
      return { ...state, users: [...state.users, a.user], notifications: [...n, ...state.notifications] }
    }
    case 'approveUser': {
      const u = state.users.find((x) => x.id === a.id)!
      const users = state.users.map((x) => (x.id === a.id ? { ...x, status: 'active' as const, teamId: a.teamId, role: a.role } : x))
      const next = { ...state, users }
      const n: Notification = { id: `n-${idBase}${seq++}`, userId: u.id, at: nowIso(), read: false, kind: 'account', actorId: state.session ?? undefined, title: 'حساب شما تأیید شد', body: `عضو تیم ${state.teams.find((t) => t.id === a.teamId)?.name} شدید. خوش آمدید.`, link: { type: 'page', page: 'home' } }
      return { ...next, notifications: [n, ...state.notifications], messages: [...state.messages, sysMsg('general', `${u.name} (@${u.username}) به سامانه پیوست.`)], audit: [auditOf(state, 'admin', `حساب ${u.username} تأیید شد`), ...state.audit] }
    }
    case 'rejectUser': return { ...state, users: state.users.map((x) => (x.id === a.id ? { ...x, status: 'rejected' as const } : x)), audit: [auditOf(state, 'admin', `درخواست عضویت ${state.users.find((x) => x.id === a.id)?.username} رد شد`), ...state.audit] }
    case 'addUser': return { ...state, users: [...state.users, a.user], audit: [auditOf(state, 'admin', `کاربر ${a.user.username} تعریف شد`), ...state.audit] }
    case 'updateUser': {
      const before = state.users.find((x) => x.id === a.id)
      const changes = before ? (['role', 'teamId', 'status'] as const).filter((k) => k in a.patch && a.patch[k] !== before[k]) : []
      const audit = changes.length && before ? [auditOf(state, 'admin', `حساب ${before.username}: ${changes.map((k) => `${k} «${String(before[k])}» ← «${String(a.patch[k])}»`).join('، ')}`), ...state.audit] : state.audit
      return { ...state, users: state.users.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)), audit }
    }
    case 'openProfile': return { ...state, profileUserId: a.id, profileTab: a.tab ?? 'profile' }
    case 'setDigits': return { ...state, persianDigits: a.on }
    case 'setTheme': return { ...state, theme: a.theme }
    case 'nav': return { ...state, nav: a.nav }
    case 'openTask': return { ...state, openTaskId: a.id }
    case 'setStatus': {
      const t = state.tasks[a.taskId]
      const set = statusesFor(state, t)
      const from = set.find((s) => s.id === t.statusId)
      const to = set.find((s) => s.id === a.statusId)
      if (!to || from?.id === to.id) return state
      const nt: Task = { ...t, statusId: to.id }
      const extra: AuditEntry[] = []
      // Actual Start = first move into work; Actual Finish = reaching a done status (cleared if the task is reopened)
      if (to.category !== 'todo' && !t.actualStart) { nt.actualStart = TODAY; extra.push(auditOf(state, 'actual', `Actual Start ثبت شد: ${jalaliFa(TODAY)}`, t.id)) }
      if (to.category === 'done') { nt.actualFinish = TODAY; nt.flow = undefined; extra.push(auditOf(state, 'actual', `Actual Finish ثبت شد: ${jalaliFa(TODAY)}`, t.id)) }
      else if (from?.category === 'done' && t.actualFinish) { nt.actualFinish = undefined; extra.push(auditOf(state, 'actual', 'تسک دوباره باز شد؛ Actual Finish پاک شد', t.id)) }
      const tasks = { ...state.tasks, [t.id]: nt }
      let writeQueue = state.writeQueue
      if (t.source === 'mdr' && t.docNumber && !t.removedFromMdr) {
        writeQueue = [...state.writeQueue.filter((w) => w.taskId !== t.id), { taskId: t.id, statusName: to.name, progress: to.progress, date: TODAY, queuedAt: Date.now() }]
      }
      const recips = [...recipientsOfTask(state, t), ...(to.category === 'done' ? controlIds(state) : [])]
      const n = notify(state, recips, { kind: 'status', title: `Status «${t.name}»: ${to.name}`, body: `${from?.name ?? '—'} ← ${to.name}، توسط ${nameOf(state, state.session)}`, link: { type: 'task', id: t.id } })
      const msgs = to.category === 'done' ? [sysMsg(`project:${t.projectId}`, `«${t.name}» ${t.docNumber ? `#${t.docNumber} ` : ''}به «${to.name}» رسید.`, { type: 'task', id: t.id })] : []
      return { ...state, tasks, writeQueue, notifications: [...n, ...state.notifications], messages: [...state.messages, ...msgs], audit: [...extra, auditOf(state, 'status', `Status: «${from?.name ?? '—'}» ← «${to.name}»`, t.id), ...state.audit] }
    }
    case 'savePlan': {
      const t = state.tasks[a.taskId]
      const assigneeUserId = a.assignee?.kind === 'user' ? a.assignee.id : undefined
      const assigneeTeamId = a.assignee?.kind === 'team' ? a.assignee.id : undefined
      // baselineDue keeps the first Due Date ever planned; later changes never overwrite it
      const nt: Task = { ...t, assigneeUserId, assigneeTeamId, estimation: a.estimation, start: a.start, due: a.due, baselineDue: t.baselineDue ?? a.due, baselineEstimation: t.baselineEstimation ?? a.estimation }
      const who = assigneeUserId ? nameOf(state, assigneeUserId) : assigneeTeamId ? `تیم ${state.teams.find((x) => x.id === assigneeTeamId)?.name}` : 'Unassigned'
      const entries: AuditEntry[] = []
      let n: Notification[] = []
      const changedAssignee = t.assigneeUserId !== assigneeUserId || t.assigneeTeamId !== assigneeTeamId
      if (changedAssignee || t.estimation !== a.estimation) entries.push(auditOf(state, 'allocation', `تخصیص: ${who}${a.estimation ? `؛ Estimation ${a.estimation} نفر-ساعت` : ''}`, t.id))
      if (t.start !== a.start || t.due !== a.due) entries.push(auditOf(state, 'dates', `Start/Due تغییر کرد`, t.id))
      if (changedAssignee && a.assignee) n = notify(state, recipientsOfTask(state, nt), { kind: 'assign', title: `تسک «${t.name}» به ${assigneeTeamId ? 'تیم شما' : 'شما'} تخصیص داده شد`, body: [t.docNumber, a.estimation ? `${a.estimation} نفر-ساعت` : ''].filter(Boolean).join('، '), link: { type: 'task', id: t.id } })
      else if (!changedAssignee && (t.start !== a.start || t.due !== a.due)) n = notify(state, recipientsOfTask(state, nt), { kind: 'plan', title: `برنامه‌ی «${t.name}» تغییر کرد`, body: 'Start یا Due Date به‌روز شد.', link: { type: 'task', id: t.id } })
      return { ...state, tasks: { ...state.tasks, [t.id]: nt }, allocations: [...state.allocations.filter((x) => x.taskId !== t.id), ...a.allocations], notifications: [...n, ...state.notifications], audit: [...entries, ...state.audit] }
    }
    case 'addTask':
      return { ...state, tasks: { ...state.tasks, [a.task.id]: { ...a.task, createdBy: actor(state), createdAt: nowIso() } }, messages: [...state.messages, sysMsg(`project:${a.task.projectId}`, `${nameOf(state, state.session)} تسک دستی «${a.task.name}» را ساخت.`, { type: 'task', id: a.task.id })], audit: [auditOf(state, 'admin', `تسک دستی «${a.task.name}» ساخته شد`, a.task.id), ...state.audit] }
    case 'addComment': {
      const t = state.tasks[a.taskId]
      // only people who can open the task are notified, so a mention never carries its text to anyone outside it
      const mentions = parseMentions(a.text, state.users).filter((id) => canViewTask(state, state.users.find((u) => u.id === id), t))
      const c: Comment = { id: `c-${idBase}${seq++}`, taskId: a.taskId, userId: actor(state), at: nowIso(), text: a.text, mentions }
      const n = [
        ...notify(state, mentions, { kind: 'mention', title: `${nameOf(state, state.session)} شما را در کامنت «${t.name}» تگ کرد`, body: a.text, link: { type: 'task', id: t.id } }),
        ...notify(state, recipientsOfTask(state, t).filter((x) => !mentions.includes(x)), { kind: 'comment', title: `کامنت تازه روی «${t.name}»`, body: a.text, link: { type: 'task', id: t.id } }),
      ]
      return { ...state, comments: [...state.comments, c], notifications: [...n, ...state.notifications] }
    }
    case 'sendMessage': {
      const members = channelMembers(state, a.channelId)
      const mentions = parseMentions(a.text, state.users).filter((id) => members.includes(id))
      const m: ChatMessage = { id: `m-${idBase}${seq++}`, channelId: a.channelId, userId: actor(state), at: nowIso(), text: a.text, mentions }
      const where = a.channelId === 'general' ? 'چت عمومی' : a.channelId === 'announce' ? 'اطلاعیه‌ها' : `چت ${state.projects.find((p) => `project:${p.id}` === a.channelId)?.name}`
      let n = notify(state, mentions, { kind: 'mention', title: `${nameOf(state, state.session)} شما را در ${where} تگ کرد`, body: a.text, link: { type: 'chat', channelId: a.channelId } })
      if (a.channelId === 'announce') n = [...n, ...notify(state, members.filter((x) => !mentions.includes(x)), { kind: 'announce', title: `اطلاعیه‌ی جدید از ${nameOf(state, state.session)}`, body: a.text, link: { type: 'chat', channelId: 'announce' } })]
      const lastRead = { ...state.lastRead, [`${actor(state)}|${a.channelId}`]: m.at }
      return { ...state, messages: [...state.messages, m], notifications: [...n, ...state.notifications], lastRead }
    }
    case 'readNotifs': {
      const ids = a.ids ? new Set(a.ids) : null
      return { ...state, notifications: state.notifications.map((n) => (n.userId === state.session && (!ids || ids.has(n.id)) && !n.read ? { ...n, read: true } : n)) }
    }
    case 'readChannel': {
      const key = `${actor(state)}|${a.channelId}`
      const last = state.messages.filter((m) => m.channelId === a.channelId).reduce((x, m) => (m.at > x ? m.at : x), '')
      if (!last || state.lastRead[key] >= last) return state
      return { ...state, lastRead: { ...state.lastRead, [key]: last } }
    }
    case 'review': {
      const ids = new Set(a.ids)
      if (a.approve) {
        let grew = true
        while (grew) {
          grew = false
          for (const it of state.syncItems) {
            // a new row needs its new parent; a row moved under a new parent needs that parent too
            const pid = it.task?.parentId ?? it.changes?.find((c) => c.field === 'parent')?.toParentId
            if (!ids.has(it.id) || !pid) continue
            const parentItem = state.syncItems.find((x) => x.kind === 'new' && x.task?.id === pid && x.state === 'pending')
            if (parentItem && !ids.has(parentItem.id)) { ids.add(parentItem.id); grew = true }
          }
        }
      } else {
        let grew = true
        while (grew) {
          grew = false
          for (const it of state.syncItems) {
            if (ids.has(it.id) || it.state !== 'pending' || !it.task?.parentId) continue
            const parentItem = state.syncItems.find((x) => x.task?.id === it.task!.parentId)
            if (parentItem && ids.has(parentItem.id)) { ids.add(it.id); grew = true }
          }
        }
      }
      const tasks = { ...state.tasks }
      let created = 0, changed = 0, removed = 0
      const projectsTouched = new Set<string>()
      const items = state.syncItems.map((it) => {
        if (!ids.has(it.id) || it.state !== 'pending') return it
        projectsTouched.add(it.projectId)
        if (a.approve) {
          if (it.kind === 'new' && it.task) {
            const prev = tasks[it.task.id]
            if (!prev) { tasks[it.task.id] = { ...it.task }; created++ }
            else if (prev.removedFromMdr) {
              // the row is back in the MDR: the same task returns with its history, plan and status
              const m = it.task
              tasks[prev.id] = { ...prev, name: m.name, parentId: m.parentId, weight: m.weight, weightDerived: m.weightDerived, floor: m.floor, pkg: m.pkg, docNumber: m.docNumber, mdrRow: m.mdrRow, mdrKey: m.mdrKey, planIssue: m.planIssue ?? prev.planIssue, order: m.order, removedFromMdr: false }
              created++
            }
          } else if (it.kind === 'changed' && it.taskId && tasks[it.taskId]) {
            const t = { ...tasks[it.taskId] }
            for (const c of it.changes ?? []) {
              if (c.field === 'name') t.name = c.to
              if (c.field === 'weight') { t.weight = c.to === '' ? null : Number(c.to); t.weightDerived = !!c.derived }
              if (c.field === 'floor') t.floor = c.to
              if (c.field === 'package') t.pkg = c.to
              if (c.field === 'parent' && c.toParentId) t.parentId = c.toParentId
            }
            tasks[t.id] = t; changed++
          } else if (it.kind === 'removed' && it.taskId && tasks[it.taskId]) {
            tasks[it.taskId] = { ...tasks[it.taskId], removedFromMdr: true }; removed++
          }
        }
        return { ...it, state: a.approve ? 'approved' as const : 'rejected' as const }
      })
      const text = a.approve
        ? `تأیید Sync Review: ${created} تسک جدید، ${changed} تغییر، ${removed} علامت «Removed from MDR»`
        : `رد ${ids.size} ردیف در Sync Review`
      const n = a.approve ? notify(state, controlIds(state), { kind: 'sync', title: `${nameOf(state, state.session)} ردیف‌های MDR را تأیید کرد`, body: `${created} تسک جدید در استخر Unassigned، ${changed} تغییر، ${removed} حذف`, link: { type: 'page', page: 'review' } }) : []
      const msgs = a.approve ? [...projectsTouched].map((pid) => sysMsg(`project:${pid}`, `Sync Review تأیید شد: ${created} تسک جدید از MDR ساخته شد و ${changed} تغییر اعمال شد.`, { type: 'project', id: pid })) : []
      return { ...state, tasks, syncItems: items, notifications: [...n, ...state.notifications], messages: [...state.messages, ...msgs], audit: [auditOf(state, 'sync', text), ...state.audit] }
    }
    case 'addRun': return { ...state, syncRuns: [a.run, ...state.syncRuns] }
    case 'updateRun': return { ...state, syncRuns: state.syncRuns.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) }
    case 'flushWriteBack': {
      if (!state.writeQueue.length) return state
      const byProject: Record<string, WriteBackItem[]> = {}
      for (const w of state.writeQueue) (byProject[state.tasks[w.taskId].projectId] ??= []).push(w)
      const runs: SyncRun[] = Object.entries(byProject).map(([pid, list], i) => ({
        id: `run-wb-${Date.now()}-${i}`, projectId: pid, trigger: 'writeback', at: nowIso(), durationSec: 2 + list.length,
        state: 'success', rowsRead: list.length, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: list.length * 3,
        log: [
          { level: 'info', text: `${list.length} سند: سطر هدف پیش از نوشتن با Document Number دوباره خوانده شد.` },
          ...list.map((w) => {
            const t = state.tasks[w.taskId]
            return { level: 'info' as const, text: `${t.docNumber} ← ردیف ${t.mdrRow}: Last Status «${w.statusName}»، Progress ${w.progress}٪، Last Status Date ${w.date}` }
          }),
          { level: 'info', text: `batchUpdate: فقط ۳ ستون internal — ${list.length * 3} سلول. هیچ سلول دیگری تغییر نکرد.` },
        ],
      }))
      const msgs = Object.entries(byProject).map(([pid, list]) => sysMsg(`project:${pid}`, `Write-back به MDR: Status ${list.length} سند در ستون‌های internal نوشته شد.`, { type: 'page', page: 'runs' }))
      const n = notify({ ...state, session: null }, controlIds(state), { kind: 'sync', title: 'Write-back به MDR انجام شد', body: `${state.writeQueue.length} سند، ${state.writeQueue.length * 3} سلول`, link: { type: 'page', page: 'runs' } })
      return { ...state, writeQueue: [], syncRuns: [...runs, ...state.syncRuns], messages: [...state.messages, ...msgs], notifications: [...n, ...state.notifications] }
    }
    case 'sysRunStart': return { ...state, syncRuns: [a.run, ...state.syncRuns] }
    case 'sysSyncResult': {
      const p = state.projects.find((x) => x.id === a.projectId)
      const syncRuns = state.syncRuns.map((r) => (r.id === a.runId ? { ...r, ...a.run } : r))
      if (!p) return { ...state, syncRuns }
      const tasks = { ...state.tasks }
      let moved = 0
      for (const f of a.refresh) {
        const t = tasks[f.taskId]
        if (!t || t.projectId !== p.id) continue
        const next = { ...t, mdrRow: f.mdrRow, order: f.mdrRow, planIssue: f.planIssue ?? t.planIssue, mdrSubtasks: f.mdrSubtasks?.length ? f.mdrSubtasks : t.mdrSubtasks }
        if (next.mdrRow !== t.mdrRow || next.order !== t.order || next.planIssue !== t.planIssue || JSON.stringify(next.mdrSubtasks) !== JSON.stringify(t.mdrSubtasks)) { tasks[t.id] = next; moved++ }
      }
      const syncItems = a.replacePending ? [...state.syncItems.filter((x) => !(x.projectId === p.id && x.state === 'pending')), ...a.items] : state.syncItems
      const d = { new: a.items.filter((x) => x.kind === 'new').length, changed: a.items.filter((x) => x.kind === 'changed').length, removed: a.items.filter((x) => x.kind === 'removed').length }
      const ok = a.run.state === 'success' || a.run.state === 'partial'
      const text = ok
        ? `Sync ${p.code}: ${a.run.rowsRead ?? 0} سطر MDR خوانده شد؛ ${d.new} جدید، ${d.changed} تغییر، ${d.removed} حذف در صف Sync Review${moved ? `؛ ${moved} تسک سطر یا Plan Issue تازه گرفت` : ''}`
        : `Sync ${p.code} ناموفق بود: ${a.run.log?.find((l) => l.level === 'error')?.text ?? ''}`
      const items = a.items.length
      const n = !ok || items ? notify({ ...state, session: null }, controlIds(state), {
        kind: 'sync', title: ok ? `${items} ردیف MDR ${p.name} در صف Sync Review` : `Sync ${p.name} ناموفق بود`,
        body: ok ? `${d.new} جدید، ${d.changed} تغییر، ${d.removed} حذف از MDR` : a.run.log?.find((l) => l.level === 'error')?.text, link: { type: 'page', page: ok ? 'review' : 'runs' },
      }) : []
      const msgs = ok && items ? [sysMsg(`project:${p.id}`, `Sync با MDR: ${d.new} ردیف جدید، ${d.changed} تغییر و ${d.removed} حذف برای بررسی کنترل پروژه آماده شد.`, { type: 'page', page: 'review' })] : []
      return {
        ...state, tasks, syncRuns, syncItems, projects: ok ? state.projects.map((x) => (x.id === p.id ? { ...x, lastSync: a.at } : x)) : state.projects,
        notifications: [...n, ...state.notifications], messages: [...state.messages, ...msgs], audit: [{ ...auditOf(state, 'sync', text), userId: a.by ?? 'system' }, ...state.audit],
      }
    }
    case 'sysWriteBack': {
      const done = new Set(a.settled.map((x) => `${x.taskId}@${x.queuedAt}`))
      const writeQueue = state.writeQueue.filter((w) => !done.has(`${w.taskId}@${w.queuedAt}`))
      const tasks = { ...state.tasks }
      for (const r of a.rows) if (tasks[r.taskId] && tasks[r.taskId].mdrRow !== r.mdrRow) tasks[r.taskId] = { ...tasks[r.taskId], mdrRow: r.mdrRow }
      const msgs = a.runs.filter((r) => r.state !== 'failed' && r.cellsWritten && r.projectId !== 'all').map((r) => sysMsg(`project:${r.projectId}`, `Write-back به MDR: Status ${r.cellsWritten / 3} سند در ستون‌های internal نوشته شد.`, { type: 'page', page: 'runs' }))
      const failed = a.runs.filter((r) => r.state === 'failed' || r.state === 'partial')
      const cells = a.runs.reduce((x, r) => x + r.cellsWritten, 0)
      const n = notify({ ...state, session: null }, controlIds(state), failed.length
        ? { kind: 'sync', title: 'Write-back به MDR کامل انجام نشد', body: failed.flatMap((r) => r.log.filter((l) => l.level !== 'info').map((l) => l.text)).slice(0, 2).join(' — '), link: { type: 'page', page: 'runs' } }
        : { kind: 'sync', title: 'Write-back به MDR انجام شد', body: `${cells / 3} سند، ${cells} سلول`, link: { type: 'page', page: 'runs' } })
      return { ...state, tasks, writeQueue, syncRuns: [...a.runs, ...state.syncRuns], messages: [...state.messages, ...msgs], notifications: [...n, ...state.notifications] }
    }
    case 'addHoliday': return { ...state, holidays: [...state.holidays, a.holiday].sort((x, y) => x.date.localeCompare(y.date)), audit: [auditOf(state, 'admin', `تعطیلی «${a.holiday.title}» اضافه شد`), ...state.audit] }
    case 'removeHoliday': return { ...state, holidays: state.holidays.filter((h) => h.id !== a.id) }
    case 'addLeave': {
      // direct entry by the Administrative Manager (exceptions); the reason stays on the row and in the AuditLog
      const leave: Leave = { ...a.leave, note: a.leave.note?.trim(), by: actor(state), at: nowIso() }
      const n = notify(state, [leave.userId], { kind: 'request', title: 'مرخصی شما ثبت شد', body: `${leave.hours >= 8 ? 'روز کامل' : `${leave.hours} ساعت`}، ${jalaliFa(leave.date)}`, link: { type: 'page', page: 'timesheet' } })
      return { ...state, leaves: [...state.leaves, leave], notifications: [...n, ...state.notifications], audit: [auditOf(state, 'request', `ثبت مستقیم مرخصی ${nameOf(state, leave.userId)}: ${leave.hours} ساعت در ${jalaliFa(leave.date)} — ${leave.note}`), ...state.audit] }
    }
    case 'removeLeave': {
      const l = state.leaves.find((x) => x.id === a.id)!
      return { ...state, leaves: state.leaves.filter((x) => x.id !== a.id), audit: [auditOf(state, 'request', `مرخصی ${nameOf(state, l.userId)} در ${jalaliFa(l.date)} حذف شد`), ...state.audit] }
    }
    case 'statusAdd': return { ...state, statusSets: { ...state.statusSets, [a.scope]: [...state.statusSets[a.scope], a.status] } }
    case 'statusUpdate': return { ...state, statusSets: { ...state.statusSets, [a.scope]: state.statusSets[a.scope].map((s) => (s.id === a.id ? { ...s, ...a.patch } : s)) } }
    case 'statusDelete': {
      const tasks = { ...state.tasks }
      if (a.moveTo) for (const t of Object.values(tasks)) if (isWorkItem(t) && t.statusId === a.id && effectiveScope(state, t) === a.scope) tasks[t.id] = { ...t, statusId: a.moveTo }
      return { ...state, tasks, statusSets: { ...state.statusSets, [a.scope]: state.statusSets[a.scope].filter((s) => s.id !== a.id) } }
    }
    case 'statusOverride': {
      const parent = parentScopeOf(state, a.scope) ?? 'office'
      return { ...state, statusSets: { ...state.statusSets, [a.scope]: state.statusSets[parent].map((s) => ({ ...s })) } }
    }
    case 'statusInherit': {
      const sets = { ...state.statusSets }
      delete sets[a.scope]
      const next = { ...state, statusSets: sets }
      const tasks = { ...state.tasks }
      for (const t of Object.values(tasks)) {
        if (!isWorkItem(t)) continue
        const set = statusesFor(next, t)
        if (!set.find((s) => s.id === t.statusId)) {
          const old = state.statusSets[effectiveScope(state, t)]?.find((s) => s.id === t.statusId)
          const target = set.find((s) => s.category === old?.category) ?? set[0]
          tasks[t.id] = { ...t, statusId: target.id }
        }
      }
      return { ...next, tasks }
    }
    case 'projectAdd': return { ...state, projects: [...state.projects, a.project], audit: [auditOf(state, 'admin', `پروژه‌ی ${a.project.code} تعریف شد`), ...state.audit] }
    case 'projectUpdate': return { ...state, projects: state.projects.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) }

    // ---------- Phase 1: supervision, team spaces, review, attachments, actual dates ----------
    case 'createFlowTask': {
      const me = actor(state)
      const t0 = a.task
      const sup = t0.kind === 'supervision'
      const task: Task = {
        ...t0, source: 'manual', createdBy: me, createdAt: nowIso(),
        reporterId: t0.reporterId ?? me,
        reviewerId: sup ? (t0.reviewerId ?? me) : t0.reviewerId,
        flow: t0.assigneeUserId ? 'assigned' : 'open',
        baselineDue: t0.due, baselineEstimation: t0.estimation, priority: t0.priority ?? 'normal', type: t0.type ?? (sup ? 'supervision' : isFinTask(t0) ? 'admin' : 'other'),
      }
      const files = (a.files ?? []).map((f) => mkAttachment(state, task.id, f))
      const label = flowLabel(task)
      const n = [
        ...notify(state, [task.assigneeUserId], { kind: 'assign', title: `${label} «${task.name}» به شما ارجاع شد`, body: [task.location, task.due ? `Due: ${jalaliFa(task.due)}` : ''].filter(Boolean).join('، ') || undefined, link: { type: 'task', id: task.id } }),
        // CEO-centred coordination: the CEO hears of every new task of the space
        ...(isFinTask(task) ? notify(state, ceoIds(state).filter((id) => id !== task.assigneeUserId), { kind: 'plan', title: `Task تازه در ${FIN_SPACE_FA[finSpaceOf(task) ?? 'finance']}: «${task.name}»`, body: task.assigneeUserId ? `مسئول: ${nameOf(state, task.assigneeUserId)}` : 'هنوز ارجاع نشده', link: { type: 'task', id: task.id } }) : []),
      ]
      const msgs = sup ? [sysMsg(`project:${task.projectId}`, `${nameOf(state, me)} مورد نظارتی «${task.name}» را ثبت کرد${task.assigneeUserId ? ` و به ${nameOf(state, task.assigneeUserId)} ارجاع داد` : ''}.`, { type: 'task', id: task.id })] : []
      return {
        ...state, tasks: { ...state.tasks, [task.id]: task }, attachments: [...state.attachments, ...files],
        notifications: [...n, ...state.notifications], messages: [...state.messages, ...msgs],
        audit: [auditOf(state, 'task', `${label} ساخته شد${task.assigneeUserId ? `؛ ارجاع به ${nameOf(state, task.assigneeUserId)}` : ''}${files.length ? `؛ ${files.length} پیوست` : ''}`, task.id), ...state.audit],
      }
    }
    case 'flow': return applyFlow(state, a)
    case 'updateTask': {
      const t = state.tasks[a.taskId]
      const keys = (Object.keys(a.patch) as (keyof Task)[]).filter((k) => JSON.stringify(a.patch[k]) !== JSON.stringify(t[k]))
      if (!keys.length) return state
      const nt: Task = { ...t, ...a.patch }
      if (nt.reviewerId && nt.reviewerId === nt.assigneeUserId) nt.reviewerId = t.reviewerId
      if (nt.baselineEstimation == null && nt.estimation) nt.baselineEstimation = nt.estimation
      if (nt.baselineDue == null && nt.due) nt.baselineDue = nt.due
      const added = (nt.participantIds ?? []).filter((x) => !(t.participantIds ?? []).includes(x))
      const n = [
        ...(nt.reviewerId !== t.reviewerId ? notify(state, [nt.reviewerId], { kind: 'review', title: `Reviewer «${t.name}» شدید`, body: 'پس از ارسال برای بررسی، تأیید یا بازگشت با شماست.', link: { type: 'task', id: t.id } }) : []),
        ...notify(state, added, { kind: 'assign', title: `به «${t.name}» به‌عنوان مشارکت‌کننده اضافه شدید`, link: { type: 'task', id: t.id } }),
      ]
      const text = keys.length === 1 && keys[0] === 'progressPct' ? `پیشرفت: ${t.progressPct ?? 0}٪ ← ${nt.progressPct ?? 0}٪` : `ویرایش: ${keys.map((k) => FIELD_FA[k] ?? k).join('، ')}`
      return { ...state, tasks: { ...state.tasks, [t.id]: nt }, notifications: [...n, ...state.notifications], audit: [auditOf(state, keys.some((k) => k === 'due' || k === 'start') ? 'dates' : 'task', text, t.id), ...state.audit] }
    }
    case 'addAttachments': {
      const files = a.files.map((f) => mkAttachment(state, a.taskId, f))
      return { ...state, attachments: [...state.attachments, ...files], audit: [auditOf(state, 'task', `${files.length} پیوست افزوده شد: ${files.map((f) => f.name).join('، ')}`, a.taskId), ...state.audit] }
    }
    case 'setActual': {
      const t = state.tasks[a.taskId]
      const nt: Task = { ...t, actualStart: a.actualStart, actualFinish: a.actualFinish }
      const txt = `اصلاح دستی تاریخ واقعی: Start ${t.actualStart ? jalaliFa(t.actualStart) : '—'} ← ${a.actualStart ? jalaliFa(a.actualStart) : '—'}، Finish ${t.actualFinish ? jalaliFa(t.actualFinish) : '—'} ← ${a.actualFinish ? jalaliFa(a.actualFinish) : '—'}. دلیل: ${a.reason}`
      return { ...state, tasks: { ...state.tasks, [t.id]: nt }, audit: [auditOf(state, 'actual', txt, t.id), ...state.audit] }
    }
    case 'internalProjectAdd': {
      const ip = { ...a.project, createdBy: actor(state), createdAt: nowIso() }
      const n = notify(state, teamMembers(state, ip.teamId), { kind: 'plan', title: `پروژه‌ی داخلی تازه در تیم: «${ip.name}»`, body: ip.description, link: { type: 'page', page: 'team' } })
      return { ...state, internalProjects: [...state.internalProjects, ip], notifications: [...n, ...state.notifications], audit: [auditOf(state, 'task', `پروژه‌ی داخلی «${ip.name}» در تیم ${state.teams.find((x) => x.id === ip.teamId)?.name} ساخته شد`), ...state.audit] }
    }
    case 'logWork': {
      const t = state.tasks[a.log.taskId]
      const me = actor(state)
      const u = state.users.find((x) => x.id === me)
      const log: WorkLog = {
        id: `w-${idBase}${seq++}`, taskId: t.id, userId: me, minutes: a.log.minutes, workDate: a.log.workDate, description: a.log.description.trim(),
        createdAt: nowIso(), projectId: t.projectId, teamId: u?.teamId ?? '', source: 'manual',
      }
      const audit = [auditOf(state, 'worklog', `Work Log: ${fmtMinutes(log.minutes)} در ${jalaliFa(log.workDate)} — ${log.description}`, t.id)]
      let tasks = state.tasks
      // Actual Start = the earliest of: first Work Log, first move into work
      if (!t.actualStart || log.workDate < t.actualStart) {
        tasks = { ...tasks, [t.id]: { ...t, actualStart: log.workDate } }
        audit.unshift(auditOf(state, 'actual', `Actual Start از اولین Work Log: ${jalaliFa(log.workDate)}`, t.id))
      }
      return { ...state, tasks, workLogs: [...state.workLogs, log], audit: [...audit, ...state.audit] }
    }
    case 'editWorkLog': {
      const log = state.workLogs.find((l) => l.id === a.id)!
      const me = actor(state)
      const next: WorkLog = {
        ...log, minutes: a.patch.minutes, workDate: a.patch.workDate, description: a.patch.description.trim(), updatedAt: nowIso(), updatedBy: me,
        revisions: [...(log.revisions ?? []), { at: nowIso(), by: me, minutes: log.minutes, workDate: log.workDate, description: log.description, reason: a.reason?.trim() || undefined }],
      }
      const n = log.userId !== me ? notify(state, [log.userId], { kind: 'worklog', title: `Work Log شما ویرایش شد`, body: `${fmtMinutes(log.minutes)} ← ${fmtMinutes(next.minutes)}؛ ${a.reason ?? ''}`, link: { type: 'task', id: log.taskId } }) : []
      return {
        ...state, workLogs: state.workLogs.map((l) => (l.id === a.id ? next : l)), notifications: [...n, ...state.notifications],
        audit: [auditOf(state, 'worklog', `ویرایش Work Log ${nameOf(state, log.userId)}: ${fmtMinutes(log.minutes)} در ${jalaliFa(log.workDate)} ← ${fmtMinutes(next.minutes)} در ${jalaliFa(next.workDate)}${a.reason ? ` — دلیل: ${a.reason}` : ''}`, log.taskId), ...state.audit],
      }
    }
    case 'deleteWorkLog': {
      const log = state.workLogs.find((l) => l.id === a.id)!
      const me = actor(state)
      const n = log.userId !== me ? notify(state, [log.userId], { kind: 'worklog', title: 'Work Log شما حذف شد', body: `${fmtMinutes(log.minutes)} در ${jalaliFa(log.workDate)}؛ ${a.reason ?? ''}`, link: { type: 'task', id: log.taskId } }) : []
      return {
        ...state, workLogs: state.workLogs.map((l) => (l.id === a.id ? { ...l, deletedAt: nowIso(), deletedBy: me, deleteReason: a.reason?.trim() || undefined } : l)), notifications: [...n, ...state.notifications],
        audit: [auditOf(state, 'worklog', `حذف Work Log ${nameOf(state, log.userId)}: ${fmtMinutes(log.minutes)} در ${jalaliFa(log.workDate)} (رکورد نگه داشته شد)${a.reason ? ` — دلیل: ${a.reason}` : ''}`, log.taskId), ...state.audit],
      }
    }
    case 'pointRecalc': return state
    case 'pointAdjust': {
      const e: PointEntry = { id: `p-${idBase}${seq++}`, userId: a.userId, taskId: a.taskId, kind: 'adjust', points: Math.round(a.points * 10) / 10, date: TODAY, at: nowIso(), actorId: actor(state), reason: a.reason.trim() }
      const n = notify(state, [a.userId], { kind: 'points', title: `اصلاح امتیاز: ${e.points > 0 ? '+' : ''}${e.points}`, body: e.reason, link: { type: 'page', page: 'mypoints' } })
      return { ...state, pointEntries: [...state.pointEntries, e], notifications: [...n, ...state.notifications], audit: [auditOf(state, 'points', `اصلاح دستی امتیاز ${nameOf(state, a.userId)}: ${e.points > 0 ? '+' : ''}${e.points} — ${e.reason}`, a.taskId), ...state.audit] }
    }
    case 'pointConfig': {
      const prev = currentPointConfig(state)
      const cfg: PointConfig = { ...a.config, version: prev.version + 1, reason: a.reason.trim(), by: actor(state), at: nowIso() }
      return { ...state, pointConfigs: [...state.pointConfigs, cfg], audit: [auditOf(state, 'points', `پارامترهای امتیاز نسخه‌ی ${cfg.version}: ضریب ${cfg.multiplier}، ${cfg.hoursPerDay} ساعت در روز، تعجیل ×${cfg.earlyFactor}، تأخیر ×${cfg.lateFactor}${cfg.cap != null ? `، سقف ${cfg.cap}` : ''} — ${cfg.reason}`), ...state.audit] }
    }
    // personal tasks: private, so no AuditLog lines and no notifications
    case 'ptCreate': case 'ptUpdate': case 'ptDelete': case 'ptMove': case 'psSave': return applyPersonal(state, a)
    case 'reqCreate': return applyRequestCreate(state, a)
    case 'reqDecide': return applyRequestDecide(state, a)
    case 'reqWithdraw': {
      const r = state.adminRequests.find((x) => x.id === a.id)!
      const step: RequestStep = { stage: 'withdraw', by: actor(state), at: nowIso() }
      return { ...state, adminRequests: state.adminRequests.map((x) => (x.id === r.id ? { ...x, status: 'withdrawn', steps: [...x.steps, step] } : x)), audit: [auditOf(state, 'request', `درخواست ${KIND_FA[r.kind]} #${r.no} پس گرفته شد`), ...state.audit] }
    }
    case 'reqCancel': {
      const r = state.adminRequests.find((x) => x.id === a.id)!
      const step: RequestStep = { stage: 'cancel', by: actor(state), at: nowIso(), note: a.note.trim() }
      const n = notify(state, [r.userId], { kind: 'request', title: `مرخصی #${r.no} شما لغو شد`, body: a.note.trim(), link: { type: 'page', page: 'requests' } })
      return {
        ...state, leaves: state.leaves.filter((l) => l.requestId !== r.id),
        adminRequests: state.adminRequests.map((x) => (x.id === r.id ? { ...x, status: 'cancelled', steps: [...x.steps, step] } : x)), notifications: [...n, ...state.notifications],
        audit: [auditOf(state, 'request', `مرخصی تأییدشده‌ی #${r.no} (${nameOf(state, r.userId)}) لغو شد — ${a.note.trim()}`), ...state.audit],
      }
    }
    case 'tsSave': {
      const k = dayKey(a.userId, a.date)
      const prev = state.timesheets[k]
      const me = actor(state)
      const at = nowIso()
      const day: TimesheetDay = {
        id: k, userId: a.userId, date: a.date, checkIn: a.checkIn || undefined, checkOut: a.checkOut || undefined, breakMinutes: a.breakMinutes, note: a.note?.trim() || undefined,
        otChoice: prev?.otChoice, calc: prev?.calc ?? EMPTY_CALC, updatedAt: at, updatedBy: me,
        revisions: prev ? [...prev.revisions, { at: prev.updatedAt, by: prev.updatedBy, checkIn: prev.checkIn, checkOut: prev.checkOut, breakMinutes: prev.breakMinutes, note: prev.note, reason: a.reason?.trim() || undefined }] : [],
      }
      const other = a.userId !== me
      const n = other ? notify(state, [a.userId], { kind: 'timesheet', title: `تایم‌شیت ${jalaliFa(a.date)} شما اصلاح شد`, body: `${nameOf(state, me)}: ${a.reason?.trim() ?? ''}`, link: { type: 'page', page: 'timesheet' } }) : []
      const what = `${a.checkIn ?? '—'} تا ${a.checkOut ?? '—'}، استراحت ${a.breakMinutes} دقیقه`
      return {
        ...state, timesheets: { ...state.timesheets, [k]: day }, notifications: [...n, ...state.notifications],
        audit: [auditOf(state, 'timesheet', `${prev ? 'اصلاح' : 'ثبت'} تایم‌شیت ${other ? nameOf(state, a.userId) + ' ' : ''}${jalaliFa(a.date)}: ${what}${other ? ` — دلیل: ${a.reason?.trim()}` : ''}`), ...state.audit],
      }
    }
    case 'tsPunch': {
      const me = actor(state)
      const k = dayKey(me, TODAY)
      const prev = state.timesheets[k]
      const now = tehranTime()
      const at = nowIso()
      const cfg = configFor(state.timesheetConfigs, TODAY)
      const day: TimesheetDay = a.kind === 'in'
        ? { id: k, userId: me, date: TODAY, checkIn: now, breakMinutes: isOffDay(TODAY, new Set(state.holidays.map((h) => h.date))) ? 0 : cfg.minBreakMinutes, calc: EMPTY_CALC, updatedAt: at, updatedBy: me, revisions: [] }
        : { ...prev!, checkOut: now, updatedAt: at, updatedBy: me }
      return { ...state, timesheets: { ...state.timesheets, [k]: day }, audit: [auditOf(state, 'timesheet', `${a.kind === 'in' ? 'ورود' : 'خروج'} ${now} ثبت شد (${jalaliFa(TODAY)})`), ...state.audit] }
    }
    case 'tsUnpaid': {
      const k = dayKey(actor(state), a.date)
      const d = state.timesheets[k]
      return { ...state, timesheets: { ...state.timesheets, [k]: { ...d, otChoice: 'unpaid' } }, audit: [auditOf(state, 'timesheet', `اضافه‌کاری ${hm(d.calc.undecided)} در ${jalaliFa(a.date)} بدون درخواست ماند (بدون پرداخت)`), ...state.audit] }
    }
    case 'monthClose': {
      const { from, to } = monthRange(a.month)
      const r = settleDays({ days: state.timesheets, requests: state.adminRequests, leaves: state.leaves, holidays: state.holidays.map((h) => h.date), configs: state.timesheetConfigs, closes: state.monthCloses, closing: a.month })
      const converted = r.changed.filter((c) => c.prev.calc.undecided > 0)
      const unpaidMinutes = converted.reduce((s, c) => s + c.prev.calc.undecided, 0)
      const byUser = new Map<string, number>()
      for (const c of converted) byUser.set(c.next.userId, (byUser.get(c.next.userId) ?? 0) + c.prev.calc.undecided)
      const label = `${J_MONTHS[toJalali(from).jm - 1]} ${toJalali(from).jy}`
      const n = [...byUser].flatMap(([uid, m]) => notify(state, [uid], { kind: 'timesheet', title: `ماه ${label} بسته شد`, body: `${faDigits(hm(m))} اضافه‌کاری بدون تعیین تکلیف، بدون پرداخت ثبت شد.`, link: { type: 'page', page: 'timesheet' } }))
      const close: MonthClose = { month: a.month, from, to, by: actor(state), at: nowIso(), unpaidMinutes }
      return {
        ...state, timesheets: r.days, monthCloses: [...state.monthCloses, close], notifications: [...n, ...state.notifications],
        audit: [auditOf(state, 'timesheet', `ماه ${label} بسته شد؛ ${converted.length} روز با ${hm(unpaidMinutes)} اضافه‌کاری بدون تعیین تکلیف، بدون پرداخت ثبت شد`), ...state.audit],
      }
    }
    case 'tsConfig': {
      const prev = state.timesheetConfigs[state.timesheetConfigs.length - 1]
      const cfg: TimesheetConfig = { ...a.config, version: prev.version + 1, reason: a.reason.trim(), by: actor(state), at: nowIso() }
      return { ...state, timesheetConfigs: [...state.timesheetConfigs, cfg], audit: [auditOf(state, 'timesheet', `قواعد تایم‌شیت نسخه‌ی ${cfg.version} از ${jalaliFa(cfg.from)}: کار خالص ${hm(cfg.dutyNetMinutes)}، استراحت ${cfg.minBreakMinutes} دقیقه، مهلت اصلاح ${cfg.editDays} روز — ${cfg.reason}`), ...state.audit] }
    }
    case 'internalProjectUpdate': {
      const ip = state.internalProjects.find((p) => p.id === a.id)!
      return { ...state, internalProjects: state.internalProjects.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)), audit: [auditOf(state, 'task', `پروژه‌ی داخلی «${ip.name}» ویرایش شد`), ...state.audit] }
    }
  }
}

/** Fresh state for tests (no URL or storage) */
export function initialState(): State {
  return { ...buildSeed(), writeQueue: [], lastRead: {}, session: null, persianDigits: true, nav: { page: 'home' }, openTaskId: null, profileUserId: null, profileTab: 'profile', theme: 'system', denial: null }
}
