// Permission policy. The reducer calls guard() before every write, so a hidden button is never the only protection:
// a forbidden action dispatched directly (the browser equivalent of calling the API) is refused and logged.
// In the server version this module runs in the service layer unchanged.
import type { State } from './state'
import type { AdminRequest, AuditEntry, Project, Role, Task, TaskKind, User } from './types'
import { FIN_SPACES, finSpaceOf, flowOf, isClosed, isFinTask, isFlowTask, isWorkItem, projectTeams, statusesFor, teamOfTask, type FinSpace } from './domain'
import { dayTotal, MAX_DAY_MINUTES } from './worklog'
import { TODAY } from './seed'
import { diffDays, tehranTime } from './jalali'
import {
  checkLeave, checkOvertime, configFor, dayKey, isHM, isMonthClosed, isPending, leaveDates, MAX_PRESENCE, monthRange, OTHER_CAT_FA, overtimeIndex, presenceOf,
} from './admin'
import { boardOf, checkBoard, checkFields, depthOf, descendants, heightOf, MAX_DEPTH, tasksOf } from './personal'
import { isMdrUrl } from './mdr'

/** System administration belongs to Project Control: the legacy 'sysadmin' role is treated as Control everywhere */
export const ROLE_ORDER: Role[] = ['ceo', 'management', 'office', 'finance', 'control', 'pm', 'lead', 'member', 'inspector']
export const ROLE_FA: Record<Role, string> = {
  sysadmin: 'کنترل پروژه', ceo: 'مدیرعامل', management: 'مدیریت', control: 'کنترل پروژه',
  pm: 'مدیر پروژه', lead: 'سرپرست تیم', member: 'عضو تیم', inspector: 'ناظر / بازرس', office: 'مدیر اداری', finance: 'مدیر مالی',
}

export type Perm =
  | 'users.manage' | 'users.approve' | 'project.define' | 'sync.run' | 'plan.all' | 'status.all'
  | 'statuses.manage' | 'calendar.manage' | 'announce.post' | 'supervision.create' | 'supervision.review.all'
  | 'teamspace.all' | 'actual.edit' | 'audit.view' | 'workload.view' | 'admin.view'
  | 'control.section' | 'points.manage' | 'worklog.manage' | 'worklog.view.all'
  | 'requests.office' | 'requests.ceo' | 'admin.reports' | 'timesheet.view.all' | 'timesheet.edit.all' | 'timesheet.close' | 'leave.direct'
  | 'fin.finance' | 'fin.office'

/** Role × permission matrix (section 6 of the technical report). Scoped rules (PM → own projects, lead → own team) are below. */
// The Project Control section (Workload, Sync, Admin, points report) and everything done there: CEO and Project Control only.
const CONTROL: Role[] = ['ceo', 'control']
const MATRIX: Record<Perm, Role[]> = {
  'control.section': CONTROL,
  'users.manage': CONTROL,
  'users.approve': CONTROL,
  'project.define': CONTROL,
  'sync.run': CONTROL,
  'statuses.manage': CONTROL,
  'calendar.manage': CONTROL,
  'audit.view': CONTROL,
  'workload.view': CONTROL,
  'admin.view': CONTROL,
  'actual.edit': CONTROL,
  'points.manage': CONTROL,
  'worklog.manage': CONTROL,
  'worklog.view.all': ['ceo', 'management', 'control'],
  'plan.all': ['ceo', 'management', 'control'],
  'status.all': ['ceo', 'management', 'control'],
  'announce.post': ['ceo', 'management', 'control'],
  'supervision.create': ['ceo', 'inspector'],
  'supervision.review.all': ['ceo'],
  // CEO and Project Control see, enter and work in every team space; tasks they create still belong to that team
  'teamspace.all': ['ceo', 'control'],
  // Administrative module: requests go Administrative Manager → CEO; reports for CEO, Project Control and the Administrative Manager
  'requests.office': ['office'],
  'requests.ceo': ['ceo'],
  'admin.reports': ['ceo', 'control', 'office'],
  'timesheet.view.all': ['ceo', 'control', 'office'],
  'timesheet.edit.all': ['office'],
  'timesheet.close': ['office'],
  'leave.direct': ['office'],
  // Finance & Administration section, two separate spaces. Nobody else — Project Control and management included — sees them or anything in them.
  'fin.finance': ['ceo', 'finance'],
  'fin.office': ['ceo', 'office'],
}

export const PERMISSION_MATRIX: Readonly<Record<Perm, readonly Role[]>> = MATRIX
export const PERM_FA: Record<Perm, string> = {
  'control.section': 'دیدن بخش کنترل پروژه (Workload، Sync، مدیریت، گزارش امتیازات)', 'points.manage': 'پارامترهای امتیاز، W.F، بازمحاسبه و اصلاح امتیاز',
  'users.manage': 'کاربران، نقش‌ها و تنظیمات سیستم', 'users.approve': 'تأیید درخواست عضویت', 'project.define': 'تعریف و ویرایش پروژه',
  'sync.run': 'Sync و تأیید Sync Review', 'plan.all': 'تخصیص، Estimation و Due (مدیر پروژه: پروژه‌ی خود؛ سرپرست: تیم خود)',
  'status.all': 'تغییر Status همه‌ی تسک‌ها (اعضا: تسک خود و تیم)', 'statuses.manage': 'مدیریت Status Setها', 'calendar.manage': 'تعطیلات رسمی',
  'announce.post': 'ارسال اطلاعیه', 'supervision.create': 'ثبت، ارجاع و بررسی مورد نظارتی', 'supervision.review.all': 'تصمیم درباره‌ی همه‌ی بررسی‌ها',
  'teamspace.all': 'فضای همه‌ی تیم‌ها: دیدن، ساخت تسک و ارجاع به اعضای همان تیم (بقیه: تیم خود)', 'actual.edit': 'اصلاح دستی Actual Start/Finish', 'audit.view': 'مشاهده‌ی AuditLog',
  'workload.view': 'Workload', 'admin.view': 'صفحه‌ی مدیریت',
  'worklog.manage': 'ویرایش و حذف Work Log دیگران (با دلیل)', 'worklog.view.all': 'دیدن Work Log همه (مدیر پروژه: پروژه‌ی خود؛ سرپرست: تیم خود)',
  'requests.office': 'بررسی درخواست‌های اداری (مرحله‌ی اول) و لغو مرخصی تأییدشده', 'requests.ceo': 'تصمیم نهایی درخواست‌های اداری',
  'admin.reports': 'گزارش‌های اداری', 'timesheet.view.all': 'دیدن تایم‌شیت همه', 'timesheet.edit.all': 'اصلاح تایم‌شیت دیگران (با دلیل)',
  'timesheet.close': 'بستن ماه و قواعد تایم‌شیت', 'leave.direct': 'ثبت مستقیم مرخصی (موارد استثنا، با دلیل)',
  'fin.finance': 'فضای مالی: دیدن، ساخت و پیگیری Taskها', 'fin.office': 'فضای اداری (مدیریتی): دیدن، ساخت و پیگیری Taskها',
}

type S = Pick<State, 'users' | 'projects' | 'tasks' | 'statusSets' | 'internalProjects'>

/** Effective role: the legacy System Administrator role acts as Project Control */
export const roleOf = (u: User): Role => (u.role === 'sysadmin' ? 'control' : u.role)
export const has = (u: User | undefined, p: Perm) => !!u && u.status === 'active' && MATRIX[p].includes(roleOf(u))
export const userOf = (state: Pick<State, 'users'>, id: string | null | undefined) => state.users.find((u) => u.id === id && u.status === 'active')
const projectOf = (state: S, id: string): Project | undefined => state.projects.find((p) => p.id === id)
export const isPMOf = (state: S, u: User | undefined, projectId: string) => !!u && u.role === 'pm' && projectOf(state, projectId)?.managerId === u.id

/** Roles a user may give when approving or editing accounts */
/** Roles that open the Finance & Administration space: only the CEO gives them, so nobody can grant themselves that access */
export const FIN_ROLES: readonly Role[] = ['office', 'finance']
export function assignableRoles(me: User | undefined): Role[] {
  if (!me) return []
  if (me.role === 'ceo') return ROLE_ORDER
  if (has(me, 'users.manage')) return ROLE_ORDER.filter((r) => r !== 'ceo' && !FIN_ROLES.includes(r))
  return []
}

// ---------- scoped checks ----------
/** Sync is part of the Project Control section: CEO and Project Control only (projectId kept for a future per-project rule) */
export function canSyncProject(_state: S, u: User | undefined, _projectId: string) { return has(u, 'sync.run') }
export function canCreateProjectTask(state: S, u: User | undefined, projectId: string) { return has(u, 'plan.all') || isPMOf(state, u, projectId) }

export function canViewSupervisionOf(state: S, u: User | undefined, projectId: string) {
  if (!u) return false
  if (has(u, 'plan.all') || u.role === 'inspector' || isPMOf(state, u, projectId)) return true
  const p = projectOf(state, projectId)
  return !!p && projectTeams(p).includes(u.teamId)
}
export function canSeeTeamSpace(u: User | undefined, teamId: string) { return !!u && (u.teamId === teamId || has(u, 'teamspace.all')) }
/** Internal projects shape a team's own space: its lead (or Control / inspector inside their own team) and the CEO */
export function canCreateInternalProject(u: User | undefined, teamId: string) {
  return !!u && u.status === 'active' && (roleOf(u) === 'ceo' || (u.teamId === teamId && ['lead', 'control', 'inspector'].includes(roleOf(u))))
}
const FIN_PERM: Record<FinSpace, Perm> = { finance: 'fin.finance', office: 'fin.office' }
/** One space of the Finance & Administration section (finance: CEO + Financial Manager, office: CEO + Administrative Manager); without a space: any of them */
export const canSeeFinSpace = (u: User | undefined, space?: FinSpace) => (space ? has(u, FIN_PERM[space]) : FIN_SPACES.some((s) => has(u, FIN_PERM[s])))
/** Spaces of the section a user may open, in display order */
export const finSpacesOf = (u: User | undefined) => FIN_SPACES.filter((s) => canSeeFinSpace(u, s))

export function canViewTask(state: S, u: User | undefined, t: Task) {
  if (!u) return false
  if (t.kind === 'internal') return canSeeTeamSpace(u, t.teamSpaceId ?? '') || t.assigneeUserId === u.id || t.reviewerId === u.id
  if (t.kind === 'supervision') return canViewSupervisionOf(state, u, t.projectId) || [t.assigneeUserId, t.reporterId, t.reviewerId, ...(t.participantIds ?? [])].includes(u.id)
  // no exception for people named on the task: losing the role closes the space
  if (t.kind === 'finadmin') { const sp = finSpaceOf(t); return !!sp && canSeeFinSpace(u, sp) }
  return true
}

/** Edit A/B/C of a supervision or internal task and (re)assign it */
export function canManageFlowTask(_state: S, u: User | undefined, t: Task) {
  if (!u) return false
  if (t.kind === 'supervision') return u.role === 'ceo' || u.role === 'inspector' || t.reporterId === u.id
  if (t.kind === 'internal') return has(u, 'teamspace.all') || (u.teamId === t.teamSpaceId && (['lead', 'control', 'inspector'].includes(roleOf(u)) || t.createdBy === u.id))
  // coordinated by the CEO: the CEO manages every task of the space, the others the tasks they created
  if (t.kind === 'finadmin') { const sp = finSpaceOf(t); return !!sp && canSeeFinSpace(u, sp) && (roleOf(u) === 'ceo' || t.createdBy === u.id) }
  return false
}

/** Assignment, Estimation, Start/Due of a project work item */
export function canPlanTask(state: S, u: User | undefined, t: Task) {
  if (!u) return false
  if (isFlowTask(t)) return canManageFlowTask(state, u, t)
  if (!isWorkItem(t)) return false
  if (has(u, 'plan.all') || isPMOf(state, u, t.projectId)) return true
  return u.role === 'lead' && teamOfTask(state, t) === u.teamId
}
/** Lead may only hand a task to their own team or its members */
export function canAssignTo(state: S, u: User | undefined, t: Task, res: { kind: 'user' | 'team'; id: string } | null) {
  if (!u) return false
  if (has(u, 'plan.all') || isPMOf(state, u, t.projectId) || isFlowTask(t)) return true
  if (u.role !== 'lead') return false
  if (!res) return false
  return res.kind === 'team' ? res.id === u.teamId : state.users.find((x) => x.id === res.id)?.teamId === u.teamId
}

export function canEditStatus(state: S, u: User | undefined, t: Task) {
  if (!u || !isWorkItem(t)) return false
  if (has(u, 'status.all') || isPMOf(state, u, t.projectId)) return true
  if (u.role === 'inspector') return false
  return t.assigneeUserId === u.id || teamOfTask(state, t) === u.teamId
}

// ---------- time tracking ----------
/** People who did or reviewed the work log their own time: assignee, participants, reviewer, reporter, and the responsible team */
export function canLogTime(state: S, u: User | undefined, t: Task) {
  // Work Log reports are read by management and Project Control, so the finance & admin space keeps no Work Log
  if (!u || isFinTask(t) || !(isWorkItem(t) || isFlowTask(t)) || !canViewTask(state, u, t)) return false
  if ([t.assigneeUserId, t.reviewerId, t.reporterId, ...(t.participantIds ?? [])].includes(u.id)) return true
  if (t.assigneeTeamId && t.assigneeTeamId === u.teamId) return true
  return t.kind === 'internal' && t.teamSpaceId === u.teamId
}
/** See everyone's records on a task (others see only their own; the totals are visible to all who see the task) */
export function canSeeAllLogs(state: S, u: User | undefined, t: Task) {
  if (!u) return false
  if (has(u, 'worklog.view.all') || isPMOf(state, u, t.projectId)) return true
  if (roleOf(u) === 'lead' && (teamOfTask(state, t) === u.teamId || t.teamSpaceId === u.teamId)) return true
  return isFlowTask(t) && canManageFlowTask(state, u, t)
}
/** Own records while the task is open; CEO and Project Control on any record, with a reason when it is not theirs */
export function canEditLog(state: S, u: User | undefined, log: { userId: string }, t: Task) {
  if (!u) return false
  if (has(u, 'worklog.manage')) return true
  return log.userId === u.id && !isClosed(state, t)
}

/** Who decides a submitted review: the named Reviewer, or the CEO; never the person who did the work */
export function canDecideReview(state: S, u: User | undefined, t: Task) {
  if (!u || t.assigneeUserId === u.id) return false
  if (t.reviewerId === u.id || has(u, 'supervision.review.all')) return true
  if ((t.kind === 'internal' || t.kind === 'finadmin') && !t.reviewerId) return canManageFlowTask(state, u, t)
  return false
}
/** The person (or team) doing the work, as opposed to planners and reviewers */
export function isExecutor(state: S, u: User | undefined, t: Task) {
  if (!u) return false
  if (isFlowTask(t)) return t.assigneeUserId === u.id
  return t.assigneeUserId === u.id || (!!t.assigneeTeamId && teamOfTask(state, t) === u.teamId)
}

export function canCreateTaskOfKind(state: S, u: User | undefined, kind: TaskKind, t: Task) {
  if (!u) return false
  if (kind === 'supervision') return has(u, 'supervision.create')
  if (kind === 'internal') return canSeeTeamSpace(u, t.teamSpaceId ?? '') && (!t.internalProjectId || state.internalProjects.some((p) => p.id === t.internalProjectId && p.teamId === t.teamSpaceId))
  if (kind === 'manual') return canCreateProjectTask(state, u, t.projectId)
  if (kind === 'finadmin') { const sp = finSpaceOf(t); return !!sp && canSeeFinSpace(u, sp) && !t.teamSpaceId }
  return false
}

/** Assignee, Reviewer and participants of a finance & admin task must be people of its own space */
const finPerson = (state: S, t: Pick<Task, 'kind' | 'projectId'>, id: string | undefined) => { const sp = finSpaceOf(t); return !id || (!!sp && canSeeFinSpace(userOf(state, id), sp)) }

// ---------- read side ----------
// In the server version these are the list endpoints; here every page reads through them, so a user without access
// gets an empty answer — not just a hidden tab.
/** Tasks of the Finance & Administration section: only the spaces the user may open (one space when asked for) */
export function listFinTasks(state: S, u: User | undefined, space?: FinSpace): Task[] {
  const mine = finSpacesOf(u).filter((s) => !space || s === space)
  if (!mine.length) return []
  return Object.values(state.tasks).filter((t) => isFinTask(t) && mine.includes(finSpaceOf(t)!))
}
/** AuditLog lines a user may read: lines about a task they cannot see are left out (Admin › AuditLog included) */
export function canSeeAuditEntry(state: S, u: User | undefined, a: AuditEntry) {
  const t = a.taskId ? state.tasks[a.taskId] : undefined
  return !t || !isFinTask(t) || canViewTask(state, u, t)
}

// ---------- the guard ----------
type AnyAction = { type: string; [k: string]: unknown }
const MAX_FILE = 3 * 1024 * 1024
const MAX_FILES = 8

const ID = /^[A-Za-z0-9][\w:.|~@-]{0,95}$/
/** A new record must bring a well-formed id that is not taken yet (two people creating at the same moment never overwrite each other) */
function newIdError(state: State, a: AnyAction): string | null {
  const taken = (list: { id: string }[], id: string) => list.some((x) => x.id === id)
  const check = (id: unknown, exists: (id: string) => boolean) => (typeof id !== 'string' || !ID.test(id) ? 'شناسه‌ی رکورد نامعتبر است.' : exists(id) ? 'رکوردی با همین شناسه هست؛ دوباره امتحان کنید.' : null)
  switch (a.type) {
    case 'addTask': case 'createFlowTask': return check((a.task as Task)?.id, (id) => !!state.tasks[id])
    case 'internalProjectAdd': return check((a.project as { id: string })?.id, (id) => taken(state.internalProjects, id))
    case 'addHoliday': return check((a.holiday as { id: string })?.id, (id) => taken(state.holidays, id))
    case 'addLeave': return check((a.leave as { id: string })?.id, (id) => taken(state.leaves, id))
    case 'addUser': return check((a.user as User)?.id, (id) => taken(state.users, id)) ?? (state.users.some((u) => u.username === (a.user as User).username) ? 'این نام کاربری قبلاً گرفته شده است.' : null)
    case 'statusAdd': return check((a.status as { id: string })?.id, (id) => (state.statusSets[String(a.scope)] ?? []).some((x) => x.id === id))
    case 'projectAdd': return check((a.project as Project)?.id, (id) => taken(state.projects, id))
  }
  return null
}

/** Returns a reason when the signed-in user may not perform the action, or null when it is allowed */
export function guard(state: State, a: AnyAction): string | null {
  const me = userOf(state, state.session)
  const tOf = (id: unknown) => state.tasks[String(id)]
  switch (a.type) {
    // public / session / per-viewer UI state
    case 'login': {
      const u = state.users.find((x) => x.id === a.id)
      return u && u.status === 'active' ? null : 'این حساب فعال نیست.'
    }
    case 'register': {
      if (state.session) return 'با حساب فعال نمی‌توان درخواست عضویت تازه ثبت کرد.'
      const u = a.user as User
      if (!u || typeof u.id !== 'string' || !ID.test(u.id) || state.users.some((x) => x.id === u.id)) return 'شناسه‌ی حساب نامعتبر است.'
      if (state.users.some((x) => x.username === u.username)) return 'این نام کاربری قبلاً گرفته شده است.'
      return u.status === 'pending' && u.role === 'member' ? null : 'حساب تازه فقط با وضعیت «در انتظار تأیید» ساخته می‌شود.'
    }
    case 'logout': case 'setDigits': case 'setTheme': case 'nav': case 'readNotifs': case 'readChannel': case 'openProfile':
      return null
    // jobs that the system runs on its own (write-back timer, run bookkeeping)
    case 'updateRun': case 'flushWriteBack': return null
    // the server's own Sync and Write-back jobs: only the system (no signed-in user) may record their results
    case 'sysRunStart': case 'sysSyncResult': case 'sysWriteBack': return state.session ? 'این کار را فقط خود سامانه (Sync و Write-back) انجام می‌دهد.' : null
  }
  if (!me) return 'برای این کار باید وارد شوید.'
  const idErr = newIdError(state, a)
  if (idErr) return idErr
  switch (a.type) {
    case 'openTask': {
      if (a.id == null) return null
      const t = tOf(a.id)
      return !t ? 'این تسک وجود ندارد.' : canViewTask(state, me, t) ? null : 'به این تسک دسترسی ندارید.'
    }
    case 'approveUser': return has(me, 'users.approve') && assignableRoles(me).includes(a.role as Role) ? null : 'تأیید عضویت با این نقش برای شما مجاز نیست.'
    case 'rejectUser': return has(me, 'users.approve') ? null : 'رد عضویت فقط برای مدیر سیستم، مدیرعامل و کنترل پروژه است.'
    case 'addUser': {
      const u = a.user as User
      return has(me, 'users.manage') && assignableRoles(me).includes(u.role) ? null : 'تعریف کاربر با این نقش برای شما مجاز نیست.'
    }
    case 'updateUser': {
      const patch = a.patch as Partial<User>
      const self = a.id === me.id
      const sensitive = (['role', 'teamId', 'status', 'capacity'] as const).filter((k) => k in patch)
      if ('username' in patch && (typeof patch.username !== 'string' || !/^[a-z0-9._-]{3,24}$/.test(patch.username))) return 'نام کاربری باید ۳ تا ۲۴ حرف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط باشد.'
      if ('username' in patch && state.users.some((x) => x.id !== a.id && x.username === patch.username)) return `نام کاربری ${patch.username} قبلاً گرفته شده است.`
      if ('name' in patch && !String(patch.name ?? '').trim()) return 'نام کامل را وارد کنید.'
      if (!self && !has(me, 'users.manage')) return 'ویرایش پروفایل دیگران فقط برای مدیر سیستم و مدیرعامل است.'
      if (self && sensitive.length && !has(me, 'users.manage')) return 'نقش، تیم و وضعیت حساب خودتان را نمی‌توانید تغییر دهید.'
      const target = state.users.find((x) => x.id === a.id)
      if (patch.role && patch.role !== target?.role && !assignableRoles(me).includes(patch.role)) return FIN_ROLES.includes(patch.role) ? 'نقش مدیر اداری و مدیر مالی (دسترسی فضای مالی و اداری) را فقط مدیرعامل می‌دهد.' : 'دادن این نقش برای شما مجاز نیست.'
      if (target?.role === 'ceo' && me.role !== 'ceo' && !self) return 'حساب مدیرعامل را فقط خود مدیرعامل ویرایش می‌کند.'
      return null
    }
    case 'setStatus': {
      const t = tOf(a.taskId)
      if (!t || !canEditStatus(state, me, t)) return 'تغییر Status این تسک برای شما مجاز نیست.'
      const to = statusesFor(state, t).find((s) => s.id === a.statusId)
      if (to?.category === 'done' && t.reviewerId) return 'این تسک Reviewer دارد؛ برای بستن آن «ارسال برای بررسی» بزنید تا Reviewer تأیید کند.'
      if (t.flow === 'in_review') return 'این تسک در انتظار بررسی است؛ تا تصمیم Reviewer، Status عوض نمی‌شود.'
      return null
    }
    case 'savePlan': {
      const t = tOf(a.taskId)
      if (!t || !isWorkItem(t) || !canPlanTask(state, me, t)) return 'برنامه‌ریزی این تسک برای شما مجاز نیست.'
      const res = a.assignee as { kind: 'user' | 'team'; id: string } | null
      if (!canAssignTo(state, me, t, res)) return 'سرپرست تیم فقط می‌تواند به تیم خودش یا اعضای آن تخصیص دهد.'
      // after completion, Due / Estimation / assignee feed the point already recorded: CEO and Project Control only
      const resUser = res?.kind === 'user' ? res.id : undefined
      const resTeam = res?.kind === 'team' ? res.id : undefined
      const changed = a.due !== t.due || a.estimation !== t.estimation || resUser !== t.assigneeUserId || resTeam !== t.assigneeTeamId
      if (isClosed(state, t) && changed && !has(me, 'points.manage')) return 'برنامه‌ی تسک تمام‌شده فقط با مدیرعامل یا کنترل پروژه تغییر می‌کند (امتیاز آن ثبت شده است).'
      return null
    }
    case 'addTask': {
      const t = a.task as Task
      if (t.kind !== 'manual') return 'فقط تسک دستی از این مسیر ساخته می‌شود.'
      if (t.parentId && state.tasks[t.parentId]?.kind === 'document') {
        const parent = state.tasks[t.parentId]
        return canPlanTask(state, me, parent) || canCreateProjectTask(state, me, t.projectId) ? null : 'ساخت زیرتسک برای شما مجاز نیست.'
      }
      return canCreateProjectTask(state, me, t.projectId) ? null : 'ساخت تسک در این پروژه برای شما مجاز نیست.'
    }
    case 'createFlowTask': {
      const t = a.task as Task
      if (t.kind !== 'supervision' && t.kind !== 'internal' && t.kind !== 'finadmin') return 'نوع تسک نامعتبر است.'
      if (t.kind === 'finadmin') {
        const sp = finSpaceOf(t)
        if (!sp || t.teamSpaceId) return 'Task مالی و اداری فقط در فضای مالی یا فضای اداری ثبت می‌شود.'
        if (!canSeeFinSpace(me, sp)) return sp === 'finance' ? 'فضای مالی فقط برای مدیرعامل و مدیر مالی است.' : 'فضای اداری فقط برای مدیرعامل و مدیر اداری است.'
        if (!finPerson(state, t, t.assigneeUserId) || !finPerson(state, t, t.reviewerId) || (t.participantIds ?? []).some((id) => !finPerson(state, t, id))) return 'مسئول، Reviewer و مشارکت‌کنندگان باید از افراد همین فضا باشند.'
        if (t.progressPct != null && !(Number.isInteger(t.progressPct) && t.progressPct >= 0 && t.progressPct <= 100)) return 'درصد پیشرفت باید عددی بین ۰ تا ۱۰۰ باشد.'
      }
      if (t.progressPct != null && t.kind !== 'finadmin') return 'درصد پیشرفت این تسک از مرحله‌ی گردش‌کار می‌آید.'
      if (!String(t.name ?? '').trim()) return 'عنوان را وارد کنید.'
      if (t.start && t.due && t.due < t.start) return 'Due Date نمی‌تواند قبل از Start باشد.'
      if (t.parentId) {
        const parent = state.tasks[t.parentId]
        if (!parent || parent.kind !== t.kind || !canViewTask(state, me, parent)) return 'تسک والد معتبر نیست.'
      }
      const proj = state.projects.find((p) => p.id === t.projectId)
      if (t.kind === 'supervision' && !proj) return 'پروژه پیدا نشد.'
      if (t.assigneeUserId) {
        const target = userOf(state, t.assigneeUserId)
        if (!target) return 'مجری انتخاب‌شده فعال نیست.'
        if (t.kind === 'internal' && target.teamId !== t.teamSpaceId) return 'تسک داخلی فقط به اعضای همان تیم ارجاع می‌شود.'
        if (t.kind === 'supervision' && proj && !projectTeams(proj).includes(target.teamId)) return 'مجری باید از تیم‌های همین پروژه باشد.'
      }
      if (t.reviewerId && t.reviewerId === t.assigneeUserId) return 'Reviewer نمی‌تواند مجری همان تسک باشد.'
      return canCreateTaskOfKind(state, me, t.kind, t) ? null : t.kind === 'supervision' ? 'ثبت مورد نظارتی فقط برای ناظر و مدیرعامل است.' : t.kind === 'finadmin' ? 'Task مالی و اداری فقط در فضای خودش و توسط افراد همان فضا ثبت می‌شود.' : 'فقط اعضای همین تیم (و مدیرعامل و کنترل پروژه) در فضای تیم تسک می‌سازند.'
    }
    case 'updateTask': {
      const t = tOf(a.taskId)
      if (!t || !canViewTask(state, me, t)) return 'به این تسک دسترسی ندارید.'
      const patch = a.patch as Partial<Task>
      const keys = Object.keys(patch)
      if ('progressPct' in patch) {
        if (!isFinTask(t)) return 'درصد پیشرفت این تسک از Status یا مرحله‌ی گردش‌کار می‌آید.'
        if (patch.progressPct == null || !(Number.isInteger(patch.progressPct) && patch.progressPct >= 0 && patch.progressPct <= 100)) return 'درصد پیشرفت باید عددی بین ۰ تا ۱۰۰ باشد.'
        if (flowOf(t) === 'closed' || flowOf(t) === 'in_review') return 'پیشرفت تسک بسته یا در انتظار بررسی تغییر نمی‌کند.'
        // the person doing the work reports progress; the rest of the task stays with its managers
        if (keys.length === 1 && (t.assigneeUserId === me.id || canManageFlowTask(state, me, t))) return null
      }
      if ('wf' in patch) {
        if (isFinTask(t)) return 'Taskهای فضای مالی و اداری امتیاز ندارند.'
        if (!has(me, 'points.manage')) return 'W.F از پارامترهای امتیاز است و فقط مدیرعامل و کنترل پروژه آن را تعیین می‌کنند.'
        if (patch.wf != null && !(patch.wf >= 0.1 && patch.wf <= 5)) return 'W.F باید بین ۰٫۱ و ۵ باشد.'
      }
      if (!isFinTask(t) && isClosed(state, t) && keys.some((k) => ['due', 'estimation'].includes(k)) && !has(me, 'points.manage')) return 'Due و Estimation تسک تمام‌شده فقط با مدیرعامل یا کنترل پروژه تغییر می‌کند.'
      if ('reviewerId' in patch && t.flow === 'in_review') return 'تا تصمیم درباره‌ی دور فعلی، Reviewer عوض نمی‌شود.'
      if ('reviewerId' in patch && patch.reviewerId && patch.reviewerId === t.assigneeUserId) return 'Reviewer نمی‌تواند مجری همان تسک باشد.'
      if (isWorkItem(t)) {
        if (t.source === 'mdr' && 'name' in patch) return 'نام سند از MDR می‌آید و فقط با Sync عوض می‌شود.'
        if (keys.some((k) => ['due', 'start', 'estimation', 'assigneeUserId', 'assigneeTeamId', 'baselineDue', 'baselineEstimation', 'actualStart', 'actualFinish', 'statusId', 'flow', 'projectId', 'kind'].includes(k)))
          return 'این فیلدها فقط از مسیر برنامه‌ریزی، Status یا اصلاح تاریخ واقعی تغییر می‌کنند.'
        return canPlanTask(state, me, t) ? null : 'ویرایش مشخصات این تسک برای شما مجاز نیست.'
      }
      if (keys.some((k) => ['flow', 'baselineDue', 'baselineEstimation', 'actualStart', 'actualFinish', 'projectId', 'kind', 'teamSpaceId', 'assigneeUserId'].includes(k)))
        return 'وضعیت، ارجاع و تاریخ واقعی فقط از مسیر گردش‌کار تغییر می‌کند.'
      if ('internalProjectId' in patch && patch.internalProjectId && !state.internalProjects.some((p) => p.id === patch.internalProjectId && p.teamId === t.teamSpaceId)) return 'پروژه‌ی داخلی متعلق به این تیم نیست.'
      if (isFinTask(t) && (!finPerson(state, t, patch.reviewerId) || (patch.participantIds ?? []).some((id) => !finPerson(state, t, id)))) return 'Reviewer و مشارکت‌کنندگان باید از افراد همین فضا باشند.'
      if ('name' in patch && !String(patch.name ?? '').trim()) return 'عنوان خالی است.'
      return canManageFlowTask(state, me, t) ? null : 'ویرایش این تسک برای شما مجاز نیست.'
    }
    case 'flow': {
      const t = tOf(a.taskId)
      if (!t || !canViewTask(state, me, t)) return 'به این تسک دسترسی ندارید.'
      const op = a.op as string
      const f = flowOf(t)
      const note = String(a.note ?? '').trim()
      if (isWorkItem(t)) {
        // review overlay of project work items
        if (op === 'submit') {
          if (!t.reviewerId) return 'برای این تسک Reviewer تعیین نشده است.'
          if (t.flow === 'in_review') return 'این تسک همین حالا در انتظار بررسی است.'
          return canEditStatus(state, me, t) && !(t.reviewerId === me.id) ? (note ? null : 'شرح کار انجام‌شده لازم است.') : 'ارسال برای بررسی فقط برای مسئول یا تیم مسئول است.'
        }
        if (op === 'approve' || op === 'rework') {
          if (t.flow !== 'in_review') return 'تسک در انتظار بررسی نیست.'
          if (op === 'rework' && !note) return 'دلیل بازگشت برای اصلاح لازم است.'
          return canDecideReview(state, me, t) ? null : 'فقط Reviewer این تسک یا مدیرعامل تصمیم می‌گیرد.'
        }
        return 'این عملیات برای تسک پروژه معتبر نیست.'
      }
      switch (op) {
        case 'assign': {
          if (f === 'closed' || f === 'in_review') return 'در این مرحله نمی‌توان ارجاع را عوض کرد.'
          const target = userOf(state, a.assigneeId as string)
          if (!target) return 'کاربر انتخاب‌شده فعال نیست.'
          if (t.kind === 'internal' && target.teamId !== t.teamSpaceId) return 'تسک داخلی فقط به اعضای همان تیم ارجاع می‌شود.'
          if (isFinTask(t) && !finPerson(state, t, target.id)) return finSpaceOf(t) === 'finance' ? 'Task فضای مالی فقط به مدیرعامل یا مدیر مالی ارجاع می‌شود.' : 'Task فضای اداری فقط به مدیرعامل یا مدیر اداری ارجاع می‌شود.'
          const proj = state.projects.find((p) => p.id === t.projectId)
          if (t.kind === 'supervision' && proj && !projectTeams(proj).includes(target.teamId)) return 'مجری باید از تیم‌های همین پروژه باشد.'
          if (target.id === t.reviewerId) return 'Reviewer نمی‌تواند مجری همان تسک باشد.'
          return canManageFlowTask(state, me, t) ? null : 'ارجاع این تسک برای شما مجاز نیست.'
        }
        case 'start':
          if (f !== 'assigned' && f !== 'rework') return 'تسک در مرحله‌ی شروع نیست.'
          return t.assigneeUserId === me.id ? null : 'فقط مجری تسک کار را شروع می‌کند.'
        case 'submit':
          if (f !== 'in_progress' && f !== 'rework') return 'برای ارسال، تسک باید در حال اجرا یا برگشتی باشد.'
          if (t.assigneeUserId !== me.id) return 'فقط مجری تسک برای بررسی ارسال می‌کند.'
          if (!t.reviewerId && t.kind === 'supervision') return 'مورد نظارتی Reviewer ندارد.'
          return note ? null : 'شرح کار انجام‌شده لازم است.'
        case 'complete':
          if ((t.kind !== 'internal' && t.kind !== 'finadmin') || t.reviewerId) return 'این تسک باید برای بررسی ارسال شود.'
          if (f !== 'in_progress' && f !== 'rework') return 'تسک در حال اجرا نیست.'
          return t.assigneeUserId === me.id || canManageFlowTask(state, me, t) ? null : 'بستن این تسک برای شما مجاز نیست.'
        case 'approve': case 'rework':
          if (f !== 'in_review') return 'تسک در انتظار بررسی نیست.'
          if (op === 'rework' && !note) return 'دلیل بازگشت برای اصلاح لازم است.'
          return canDecideReview(state, me, t) ? null : 'فقط Reviewer این تسک یا مدیرعامل تصمیم می‌گیرد.'
        case 'reopen':
          if (f !== 'closed') return 'فقط تسک بسته‌شده دوباره باز می‌شود.'
          if (!note) return 'دلیل بازگشایی لازم است.'
          return canDecideReview(state, me, t) || canManageFlowTask(state, me, t) ? null : 'بازگشایی این تسک برای شما مجاز نیست.'
      }
      return 'عملیات نامعتبر است.'
    }
    case 'addAttachments': {
      const t = tOf(a.taskId)
      if (!t || !canViewTask(state, me, t)) return 'به این تسک دسترسی ندارید.'
      const files = (a.files as { size: number }[]) ?? []
      if (!files.length) return 'فایلی انتخاب نشده است.'
      if (files.length > MAX_FILES) return `حداکثر ${MAX_FILES} فایل در هر بار.`
      if (files.some((f) => f.size > MAX_FILE)) return 'حجم هر فایل حداکثر ۳ مگابایت است.'
      const involved = [t.assigneeUserId, t.reporterId, t.reviewerId, ...(t.participantIds ?? [])].includes(me.id)
      return involved || canPlanTask(state, me, t) || canEditStatus(state, me, t) ? null : 'افزودن پیوست فقط برای افراد همین تسک است.'
    }
    case 'setActual': {
      const t = tOf(a.taskId)
      if (!t) return 'تسک پیدا نشد.'
      if (!canViewTask(state, me, t)) return 'به این تسک دسترسی ندارید.'
      if (!String(a.reason ?? '').trim()) return 'دلیل اصلاح تاریخ واقعی لازم است.'
      if (a.actualStart && a.actualFinish && String(a.actualFinish) < String(a.actualStart)) return 'Actual Finish نمی‌تواند قبل از Actual Start باشد.'
      return has(me, 'actual.edit') ? null : 'اصلاح دستی تاریخ واقعی فقط برای کنترل پروژه و مدیرعامل است.'
    }
    // ---------- work log ----------
    case 'logWork': case 'editWorkLog': case 'deleteWorkLog': {
      const log = a.type === 'logWork' ? undefined : state.workLogs.find((l) => l.id === a.id)
      if (a.type !== 'logWork' && (!log || log.deletedAt)) return 'این رکورد Work Log وجود ندارد.'
      const t = tOf(a.type === 'logWork' ? (a.log as { taskId: string }).taskId : log!.taskId)
      if (!t) return 'تسک پیدا نشد.'
      if (!canViewTask(state, me, t)) return 'به این تسک دسترسی ندارید.'
      if (isFinTask(t)) return 'Taskهای فضای مالی و اداری Work Log ندارند.'
      if (a.type === 'logWork') { if (!canLogTime(state, me, t)) return 'ثبت زمان روی این تسک فقط برای مسئول، مشارکت‌کنندگان، Reviewer و تیم مسئول است.' }
      else {
        if (!canEditLog(state, me, log!, t)) return log!.userId === me.id ? 'تسک بسته شده است؛ اصلاح Work Log آن با کنترل پروژه است.' : 'ویرایش یا حذف Work Log دیگران فقط برای مدیرعامل و کنترل پروژه است.'
        if (log!.userId !== me.id && !String(a.reason ?? '').trim()) return 'برای تغییر Work Log دیگران دلیل لازم است.'
      }
      if (a.type === 'deleteWorkLog') return null
      const v = (a.type === 'logWork' ? a.log : { ...log, ...(a.patch as object) }) as { minutes: number; workDate: string; description: string }
      if (!Number.isInteger(v.minutes) || v.minutes < 1 || v.minutes > MAX_DAY_MINUTES) return 'مدت‌زمان باید بین ۱ دقیقه و ۲۴ ساعت باشد.'
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.workDate)) || v.workDate > TODAY) return 'تاریخ انجام کار نمی‌تواند در آینده باشد.'
      if (String(v.description ?? '').trim().length < 2) return 'توضیح فعالیت لازم است.'
      const owner = a.type === 'logWork' ? me.id : log!.userId
      if (dayTotal(state.workLogs, owner, v.workDate, log?.id) + v.minutes > MAX_DAY_MINUTES) return 'جمع زمان ثبت‌شده‌ی این نفر در این روز از ۲۴ ساعت بیشتر می‌شود.'
      return null
    }
    // ---------- points ----------
    case 'pointRecalc': {
      const t = tOf(a.taskId)
      if (!t) return 'تسک پیدا نشد.'
      if (!canViewTask(state, me, t)) return 'به این تسک دسترسی ندارید.'
      if (isFinTask(t)) return 'Taskهای فضای مالی و اداری امتیاز ندارند.'
      return has(me, 'points.manage') ? null : 'بازمحاسبه‌ی امتیاز فقط برای مدیرعامل و کنترل پروژه است.'
    }
    case 'pointAdjust': {
      if (!has(me, 'points.manage')) return 'اصلاح امتیاز فقط برای مدیرعامل و کنترل پروژه است.'
      if (a.taskId && state.tasks[String(a.taskId)] && (!canViewTask(state, me, state.tasks[String(a.taskId)]) || isFinTask(state.tasks[String(a.taskId)]))) return 'این تسک امتیاز ندارد یا در دسترس شما نیست.'
      const pts = Number(a.points)
      if (!Number.isFinite(pts) || pts === 0) return 'مقدار امتیاز باید عددی غیر صفر باشد.'
      if (Math.abs(pts) > 100000) return 'مقدار امتیاز خارج از محدوده است.'
      if (!String(a.reason ?? '').trim()) return 'دلیل اصلاح امتیاز لازم است.'
      if (!userOf(state, a.userId as string)) return 'کاربر فعال نیست.'
      if (a.userId === me.id) return 'امتیاز خودتان را نمی‌توانید اصلاح کنید.'
      return null
    }
    case 'pointConfig': {
      if (!has(me, 'points.manage')) return 'پارامترهای امتیازدهی فقط با مدیرعامل و کنترل پروژه تغییر می‌کند.'
      const c = a.config as { multiplier: number; hoursPerDay: number; earlyFactor: number; lateFactor: number; cap: number | null }
      const okNum = (x: number, lo: number, hi: number) => Number.isFinite(x) && x >= lo && x <= hi
      if (!okNum(c.multiplier, 1, 10000) || !okNum(c.hoursPerDay, 1, 24) || !okNum(c.earlyFactor, 0, 10) || !okNum(c.lateFactor, 0, 10)) return 'یکی از پارامترها خارج از محدوده است.'
      if (c.cap != null && !okNum(c.cap, 1, 100000)) return 'سقف امتیاز هر تسک باید عددی مثبت باشد.'
      if (!String(a.reason ?? '').trim()) return 'دلیل تغییر پارامترها لازم است.'
      return null
    }
    case 'internalProjectAdd': {
      const ip = a.project as { teamId: string }
      return canCreateInternalProject(me, ip.teamId) ? null : 'ساخت پروژه‌ی داخلی فقط برای سرپرست همان تیم (یا مدیرعامل) است.'
    }
    case 'internalProjectUpdate': {
      const ip = state.internalProjects.find((p) => p.id === a.id)
      return ip && canCreateInternalProject(me, ip.teamId) ? null : 'ویرایش این پروژه‌ی داخلی برای شما مجاز نیست.'
    }
    case 'addComment': {
      const t = tOf(a.taskId)
      return t && canViewTask(state, me, t) ? null : 'به این تسک دسترسی ندارید.'
    }
    case 'sendMessage': {
      const ch = String(a.channelId)
      if (ch === 'announce' && !has(me, 'announce.post')) return 'ارسال اطلاعیه فقط برای مدیریت، کنترل پروژه و مدیر سیستم است.'
      if (ch.startsWith('project:')) {
        const p = state.projects.find((x) => `project:${x.id}` === ch)
        if (!p) return 'کانال پیدا نشد.'
        const member = projectTeams(p).includes(me.teamId) || ['ceo', 'management'].includes(me.role) || p.managerId === me.id
        return member ? null : 'عضو این پروژه نیستید.'
      }
      return null
    }
    case 'review': {
      const ids = new Set(a.ids as string[])
      const projects = new Set(state.syncItems.filter((x) => ids.has(x.id)).map((x) => x.projectId))
      return [...projects].every((pid) => canSyncProject(state, me, pid)) ? null : 'تأیید Sync Review برای این پروژه مجاز نیست.'
    }
    case 'addRun': {
      const run = a.run as { projectId: string }
      return run.projectId === 'all' ? (has(me, 'sync.run') ? null : 'Sync همه‌ی پروژه‌ها مجاز نیست.') : canSyncProject(state, me, run.projectId) ? null : 'Sync این پروژه برای شما مجاز نیست.'
    }
    case 'addHoliday': case 'removeHoliday':
      return has(me, 'calendar.manage') ? null : 'ثبت تعطیلات رسمی فقط برای کنترل پروژه و مدیرعامل است.'
    case 'addLeave': case 'removeLeave': case 'reqCreate': case 'reqDecide': case 'reqWithdraw': case 'reqCancel':
    case 'tsSave': case 'tsPunch': case 'tsUnpaid': case 'monthClose': case 'tsConfig':
      return guardAdmin(state, me, a)
    case 'ptCreate': case 'ptUpdate': case 'ptDelete': case 'ptMove': case 'psSave':
      return guardPersonal(state, me, a)
    case 'statusAdd': case 'statusUpdate': case 'statusDelete': case 'statusOverride': case 'statusInherit':
      return has(me, 'statuses.manage') ? null : 'مدیریت Statusها فقط برای کنترل پروژه و مدیرعامل است.'
    case 'projectAdd': case 'projectUpdate': {
      if (!has(me, 'project.define')) return 'تعریف و ویرایش پروژه فقط برای مدیرعامل و کنترل پروژه است.'
      const p = (a.type === 'projectAdd' ? a.project : a.patch) as Partial<Project>
      if (a.type === 'projectAdd') {
        const code = String(p.code ?? '')
        // the office codes projects by number (458, 386, 320) or by Latin letters (BBT)
        if (!/^[A-Z0-9]{2,8}$/.test(code) || p.id !== code) return 'کد پروژه ۲ تا ۸ نویسه از حروف بزرگ لاتین یا عدد است (مثل 458 یا BBT).'
        if (state.projects.some((x) => x.id === code)) return `کد ${code} قبلاً استفاده شده است.`
        if (!String(p.name ?? '').trim()) return 'نام پروژه را وارد کنید.'
        // every project is defined with its own MDR: the tasks come from it
        if (!isMdrUrl(p.mdrUrl)) return 'لینک MDR (Google Sheet) خود این پروژه لازم است.'
      } else {
        if (!state.projects.some((x) => x.id === a.id)) return 'پروژه پیدا نشد.'
        if ('id' in p || 'code' in p) return 'کد پروژه بعد از تعریف عوض نمی‌شود.'
        if ('mdrUrl' in p && !isMdrUrl(p.mdrUrl)) return 'لینک MDR باید لینک Google Sheet خود MDR این پروژه باشد.'
        if ('name' in p && !String(p.name ?? '').trim()) return 'نام پروژه خالی است.'
      }
      if (('phase1TeamId' in p || a.type === 'projectAdd') && !state.teams.some((t) => t.id === p.phase1TeamId && t.kind === 'phase1')) return 'تیم فاز ۱ را انتخاب کنید.'
      if (('phase2TeamId' in p || a.type === 'projectAdd') && !state.teams.some((t) => t.id === p.phase2TeamId && t.kind === 'phase2')) return 'تیم فاز ۲ را انتخاب کنید.'
      if ('mdrTab' in p && !String(p.mdrTab ?? '').trim()) return 'نام برگه‌ی (Tab) MDR لازم است.'
      if (p.managerId && userOf(state, p.managerId)?.role !== 'pm') return 'مدیر پروژه باید کاربر فعالی با نقش مدیر پروژه باشد.'
      return null
    }
  }
  return 'عملیات ناشناخته.'
}

// ---------- administrative module ----------
/** Own timesheet always; everybody's for the CEO, Project Control and the Administrative Manager */
export const canSeeTimesheetOf = (u: User | undefined, userId: string) => !!u && (u.id === userId || has(u, 'timesheet.view.all'))
/** Own requests; the approvers and the report roles see all of them */
export const canSeeRequest = (u: User | undefined, r: AdminRequest) => !!u && (r.userId === u.id || has(u, 'requests.office') || has(u, 'requests.ceo') || has(u, 'admin.reports'))
/** The approver step a pending request is waiting for */
export const canDecideRequest = (u: User | undefined, r: AdminRequest) =>
  !!u && r.userId !== u.id && ((r.status === 'pending_office' && has(u, 'requests.office')) || (r.status === 'pending_ceo' && has(u, 'requests.ceo')))
const ISO = /^\d{4}-\d{2}-\d{2}$/

function guardAdmin(state: State, me: User, a: AnyAction): string | null {
  const closes = state.monthCloses
  const holidays = new Set(state.holidays.map((h) => h.date))
  const reqOf = (id: unknown) => state.adminRequests.find((r) => r.id === id)
  switch (a.type) {
    case 'addLeave': {
      if (!has(me, 'leave.direct')) return 'ثبت مستقیم مرخصی فقط با مدیر اداری است؛ دیگران از «درخواست‌های اداری» مرخصی می‌گیرند.'
      const l = a.leave as { userId?: string; date?: string; hours?: number; note?: string }
      const u = userOf(state, l?.userId)
      if (!u) return 'کاربر پیدا نشد.'
      if (!l.date || !ISO.test(l.date)) return 'تاریخ مرخصی را انتخاب کنید.'
      if (isMonthClosed(closes, l.date)) return 'ماه این تاریخ بسته شده است.'
      if (!(Number(l.hours) > 0 && Number(l.hours) <= u.capacity)) return `مقدار مرخصی باید بین صفر و ${u.capacity} ساعت باشد.`
      if (!String(l.note ?? '').trim()) return 'دلیل ثبت مستقیم را بنویسید.'
      return null
    }
    case 'removeLeave': {
      if (!has(me, 'leave.direct')) return 'حذف مرخصی فقط با مدیر اداری است.'
      const l = state.leaves.find((x) => x.id === a.id)
      if (!l) return 'این مرخصی پیدا نشد.'
      if (l.requestId) return 'این مرخصی از یک درخواست تأییدشده آمده است؛ آن را از خود درخواست لغو کنید.'
      return isMonthClosed(closes, l.date) ? 'ماه این تاریخ بسته شده است.' : null
    }
    case 'reqCreate': {
      const r = a.req as { kind?: string; description?: string; leave?: never; overtime?: { date?: string; minutes?: number; taskIds?: string[] }; other?: { title?: string; category?: string; date?: string } }
      const files = (a.files ?? []) as { size: number }[]
      if (files.length > MAX_FILES) return `حداکثر ${MAX_FILES} فایل در هر بار.`
      if (files.some((f) => f.size > MAX_FILE)) return 'حجم هر فایل حداکثر ۳ مگابایت است.'
      if (String(r?.description ?? '').length > 2000) return 'توضیحات طولانی است.'
      if (r?.kind === 'leave') {
        return checkLeave(r.leave, { holidays, today: TODAY, cfg: configFor(state.timesheetConfigs, TODAY), closes, existing: state.leaves, pending: state.adminRequests, userId: me.id })
      }
      if (r?.kind === 'overtime') {
        const o = r.overtime
        const date = String(o?.date ?? '')
        if (!ISO.test(date)) return 'تاریخ اضافه‌کاری را انتخاب کنید.'
        const err = checkOvertime(o, { today: TODAY, closes, day: state.timesheets[dayKey(me.id, date)], requests: overtimeIndex(state.adminRequests).get(dayKey(me.id, date)) ?? [] })
        if (err) return err
        const ids = Array.isArray(o?.taskIds) ? o!.taskIds : []
        if (ids.length > 20) return 'حداکثر ۲۰ تسک.'
        if (ids.some((id) => !state.tasks[id] || !canViewTask(state, me, state.tasks[id]))) return 'یکی از تسک‌های انتخاب‌شده در دسترس شما نیست.'
        // the request is read by the approvers and the report roles (Project Control included): no finance & admin task in it
        if (ids.some((id) => isFinTask(state.tasks[id]))) return 'Taskهای فضای مالی و اداری در درخواست اضافه‌کاری فهرست نمی‌شوند.'
        return null
      }
      if (r?.kind === 'other') {
        const o = r.other
        if (!String(o?.title ?? '').trim()) return 'عنوان درخواست را بنویسید.'
        if (String(o?.title).length > 120) return 'عنوان طولانی است.'
        if (!o?.category || !(o.category in OTHER_CAT_FA)) return 'دسته‌ی درخواست را انتخاب کنید.'
        if (o.date && !ISO.test(o.date)) return 'تاریخ نامعتبر است.'
        return null
      }
      return 'نوع درخواست را انتخاب کنید.'
    }
    case 'reqDecide': {
      const r = reqOf(a.id)
      if (!r) return 'درخواست پیدا نشد.'
      if (!isPending(r)) return 'این درخواست دیگر در کارتابل نیست.'
      if (r.userId === me.id) return 'درخواست خودتان را نمی‌توانید تأیید یا رد کنید.'
      if (!canDecideRequest(me, r)) return r.status === 'pending_office' ? 'این مرحله با مدیر اداری است.' : 'تصمیم نهایی با مدیرعامل است.'
      if (a.decision !== 'approve' && a.decision !== 'reject') return 'تصمیم نامعتبر است.'
      if (a.decision === 'reject' && !String(a.note ?? '').trim()) return 'دلیل رد را بنویسید.'
      if (a.decision === 'approve' && r.kind === 'overtime' && a.minutes != null) {
        const cap = [...r.steps].reverse().find((s) => s.stage === 'office' && s.minutes != null)?.minutes ?? r.overtime!.minutes
        if (!Number.isInteger(a.minutes) || Number(a.minutes) <= 0) return 'مقدار تأییدی را وارد کنید.'
        if (Number(a.minutes) > cap) return 'مقدار تأییدی نمی‌تواند از مقدار درخواستی یا تأیید مرحله‌ی قبل بیشتر باشد.'
      }
      if (a.decision === 'approve' && r.kind === 'leave' && r.leave) {
        const dates = leaveDates(r.leave, holidays)
        if (dates.some((d) => isMonthClosed(closes, d))) return 'ماه این مرخصی بسته شده است.'
      }
      return null
    }
    case 'reqWithdraw': {
      const r = reqOf(a.id)
      if (!r) return 'درخواست پیدا نشد.'
      if (r.userId !== me.id) return 'فقط درخواست‌دهنده می‌تواند درخواست را پس بگیرد.'
      if (!isPending(r) || r.steps.some((s) => s.stage === 'office' || s.stage === 'ceo')) return 'بعد از اولین تصمیم، درخواست را نمی‌توان پس گرفت.'
      return null
    }
    case 'reqCancel': {
      const r = reqOf(a.id)
      if (!r) return 'درخواست پیدا نشد.'
      if (!has(me, 'requests.office')) return 'لغو مرخصی تأییدشده فقط با مدیر اداری است.'
      if (r.kind !== 'leave' || r.status !== 'approved') return 'فقط مرخصی تأییدشده را می‌توان لغو کرد.'
      if (!String(a.note ?? '').trim()) return 'دلیل لغو را بنویسید.'
      const dates = state.leaves.filter((l) => l.requestId === r.id).map((l) => l.date)
      return dates.some((d) => isMonthClosed(closes, d)) ? 'ماه این مرخصی بسته شده است.' : null
    }
    case 'tsSave': {
      const uid = String(a.userId), date = String(a.date)
      const self = uid === me.id
      if (!userOf(state, uid)) return 'کاربر پیدا نشد.'
      if (!self && !has(me, 'timesheet.edit.all')) return 'ثبت و اصلاح تایم‌شیت دیگران فقط با مدیر اداری است.'
      if (!self && !String(a.reason ?? '').trim()) return 'دلیل اصلاح را بنویسید.'
      if (!ISO.test(date)) return 'تاریخ نامعتبر است.'
      if (date > TODAY) return 'تایم‌شیت روزهای آینده را نمی‌توان ثبت کرد.'
      if (isMonthClosed(closes, date)) return 'ماه این روز بسته شده است.'
      const cfg = configFor(state.timesheetConfigs, date)
      if (self && diffDays(TODAY, date) > cfg.editDays) return `فقط ${cfg.editDays} روز گذشته را می‌توانید ثبت یا اصلاح کنید؛ برای روزهای قدیمی‌تر به مدیر اداری بگویید.`
      const reqs = overtimeIndex(state.adminRequests).get(dayKey(uid, date)) ?? []
      if (self && reqs.some((r) => isPending(r) || r.status === 'approved')) return 'اضافه‌کاری این روز در جریان یا تأییدشده است؛ این روز قفل است.'
      const ci = a.checkIn as string | undefined, co = a.checkOut as string | undefined
      if (ci != null && ci !== '' && !isHM(ci)) return 'ساعت ورود نامعتبر است.'
      if (co != null && co !== '' && !isHM(co)) return 'ساعت خروج نامعتبر است.'
      if (!ci && co) return 'اول ساعت ورود را وارد کنید.'
      const presence = presenceOf(ci, co)
      if (presence > MAX_PRESENCE) return 'فاصله‌ی ورود تا خروج بیش از ۲۰ ساعت است؛ ساعت‌ها را بررسی کنید.'
      const br = a.breakMinutes
      if (!Number.isInteger(br) || Number(br) < 0 || Number(br) > Math.max(presence, 0) + (co ? 0 : 1440)) return 'مدت استراحت نامعتبر است.'
      if (co && Number(br) >= presence) return 'مدت استراحت از کل حضور بیشتر است.'
      if (date === TODAY) {
        const now = tehranTime()
        if (ci && ci > now) return 'ساعت ورود هنوز نرسیده است.'
        if (co && ci && co > ci && co > now) return 'ساعت خروج هنوز نرسیده است.'
        if (co && ci && co <= ci) return 'خروج بعد از نیمه‌شب امروز هنوز نرسیده است.'
      }
      if (String(a.note ?? '').length > 500) return 'توضیح طولانی است.'
      return null
    }
    case 'tsPunch': {
      const d = state.timesheets[dayKey(me.id, TODAY)]
      if (a.kind === 'in') return d?.checkIn ? 'ورود امروز ثبت شده است.' : null
      if (a.kind === 'out') return !d?.checkIn ? 'اول ورود را ثبت کنید.' : d.checkOut ? 'خروج امروز ثبت شده است.' : tehranTime() <= d.checkIn ? 'هنوز از ساعت ورود شما زمانی نگذشته است.' : null
      return 'عملیات نامعتبر است.'
    }
    case 'tsUnpaid': {
      const d = state.timesheets[dayKey(me.id, String(a.date))]
      if (!d) return 'این روز در تایم‌شیت شما ثبت نشده است.'
      if (isMonthClosed(closes, d.date)) return 'ماه این روز بسته شده است.'
      return d.calc.undecided > 0 ? null : 'این روز اضافه‌کاری بدون تعیین تکلیف ندارد.'
    }
    case 'monthClose': {
      if (!has(me, 'timesheet.close')) return 'بستن ماه فقط با مدیر اداری است.'
      const key = String(a.month)
      if (!/^\d{4}-\d{2}$/.test(key)) return 'ماه نامعتبر است.'
      if (closes.some((c) => c.month === key)) return 'این ماه پیش‌تر بسته شده است.'
      const { from, to } = monthRange(key)
      if (to >= TODAY) return 'ماه را بعد از پایانش می‌توان بست.'
      const touching = state.adminRequests.filter((r) => isPending(r) && (
        (r.kind === 'overtime' && r.overtime && r.overtime.date >= from && r.overtime.date <= to)
        || (r.kind === 'leave' && r.leave && leaveDates(r.leave, holidays).some((d) => d >= from && d <= to))))
      return touching.length ? `${touching.length} درخواست مرخصی یا اضافه‌کاری این ماه هنوز در کارتابل است؛ اول آن‌ها را تعیین تکلیف کنید.` : null
    }
    case 'tsConfig': {
      if (!has(me, 'timesheet.close')) return 'قواعد تایم‌شیت فقط با مدیر اداری است.'
      const c = a.config as { dutyNetMinutes?: number; minBreakMinutes?: number; editDays?: number; from?: string }
      if (!Number.isInteger(c?.dutyNetMinutes) || c.dutyNetMinutes! < 60 || c.dutyNetMinutes! > 720) return 'کار خالص روزانه باید بین ۱ تا ۱۲ ساعت باشد.'
      if (!Number.isInteger(c.minBreakMinutes) || c.minBreakMinutes! < 0 || c.minBreakMinutes! > 180) return 'استراحت باید بین ۰ تا ۱۸۰ دقیقه باشد.'
      if (!Number.isInteger(c.editDays) || c.editDays! < 0 || c.editDays! > 31) return 'مهلت اصلاح باید بین ۰ تا ۳۱ روز باشد.'
      if (!c.from || !ISO.test(c.from) || c.from < TODAY) return 'قاعده‌ی تازه از امروز یا بعد از آن اعمال می‌شود؛ روزهای گذشته جابه‌جا نمی‌شوند.'
      return String(a.reason ?? '').trim() ? null : 'دلیل تغییر را بنویسید.'
    }
  }
  return 'عملیات ناشناخته.'
}

// ---------- personal tasks ----------
// Owner only, for every role: nobody — the CEO and Project Control included — reads or changes another person's personal tasks.
// An id that is not yours gets the same answer as an id that does not exist, so nothing about other people's lists leaks.
const NOT_YOURS = 'این کار شخصی در دسترس شما نیست.'
function guardPersonal(state: State, me: User, a: AnyAction): string | null {
  const own = (id: unknown) => { const t = state.personalTasks[String(id)]; return t && t.ownerId === me.id ? t : undefined }
  const board = boardOf(state.personalBoards, me.id)
  switch (a.type) {
    case 'ptCreate': {
      const f = (a.task ?? {}) as { title?: string; description?: string; priority?: string; start?: string; due?: string; parentId?: string | null; statusId?: string }
      const err = checkFields({ ...f, priority: f.priority ?? 'normal' })
      if (err) return err
      if (f.statusId && !board.statuses.some((x) => x.id === f.statusId)) return 'Status نامعتبر است.'
      if (f.parentId) {
        const p = own(f.parentId)
        if (!p) return NOT_YOURS
        if (depthOf(state.personalTasks, p) + 1 >= MAX_DEPTH) return `حداکثر ${MAX_DEPTH} سطح Task و Subtask.`
      }
      return tasksOf(state.personalTasks, me.id).length >= 2000 ? 'تعداد کارهای شخصی به سقف رسیده است.' : null
    }
    case 'ptUpdate': {
      const t = own(a.id)
      if (!t) return NOT_YOURS
      const patch = (a.patch ?? {}) as Record<string, unknown>
      const allowed = ['title', 'description', 'statusId', 'priority', 'start', 'due']
      if (Object.keys(patch).some((k) => !allowed.includes(k))) return 'این فیلد قابل تغییر نیست.'
      if (patch.statusId !== undefined && !board.statuses.some((x) => x.id === patch.statusId)) return 'Status نامعتبر است.'
      const merged = { ...t, ...patch } as { title: string; description?: string; priority: string; start?: string; due?: string }
      return checkFields(merged)
    }
    case 'ptDelete': return own(a.id) ? null : NOT_YOURS
    case 'ptMove': {
      const t = own(a.id)
      if (!t) return NOT_YOURS
      const pid = (a.parentId ?? null) as string | null
      if (pid) {
        const p = own(pid)
        if (!p) return NOT_YOURS
        if (pid === t.id || descendants(tasksOf(state.personalTasks, me.id), t.id).some((d) => d.id === pid)) return 'یک Task را نمی‌توان زیر Subtaskهای خودش برد.'
        if (depthOf(state.personalTasks, p) + 1 + heightOf(tasksOf(state.personalTasks, me.id), t.id) >= MAX_DEPTH) return `حداکثر ${MAX_DEPTH} سطح Task و Subtask.`
      }
      return Number.isInteger(a.index) && Number(a.index) >= 0 ? null : 'جای تازه نامعتبر است.'
    }
    case 'psSave': {
      const statuses = a.statuses as Parameters<typeof checkBoard>[0]
      const err = checkBoard(statuses, String(a.defaultStatusId))
      if (err) return err
      const keep = new Set(statuses.map((x) => x.id))
      const remap = (a.remap ?? {}) as Record<string, string>
      const mine = tasksOf(state.personalTasks, me.id)
      for (const old of board.statuses) if (!keep.has(old.id) && mine.some((t) => t.statusId === old.id) && !keep.has(remap[old.id])) return `برای کارهای Status «${old.name}» یک Status تازه انتخاب کنید.`
      return null
    }
  }
  return 'عملیات ناشناخته.'
}
