// Actions a browser may send, and the fields of them the server decides itself. The reducer's guard then checks the
// permission of the signed-in user exactly as before; this layer only stops forged or system-only input.
import type { Action } from '../src/lib/state'
import type { Task, User } from '../src/lib/types'

/** Every action a signed-in person can trigger from the app. Sign-in/up, passwords, UI-only state and the system's own
 * Sync and Write-back jobs are not in this list: they have their own endpoints or never come from a browser. */
export const CLIENT_ACTIONS = new Set([
  'approveUser', 'rejectUser', 'addUser', 'updateUser',
  'setStatus', 'savePlan', 'addTask', 'addComment', 'sendMessage', 'readNotifs', 'readChannel', 'review',
  'addHoliday', 'removeHoliday', 'addLeave', 'removeLeave',
  'statusAdd', 'statusUpdate', 'statusDelete', 'statusOverride', 'statusInherit',
  'projectAdd', 'projectUpdate', 'createFlowTask', 'flow', 'updateTask', 'addAttachments', 'setActual',
  'internalProjectAdd', 'internalProjectUpdate', 'logWork', 'editWorkLog', 'deleteWorkLog',
  'pointRecalc', 'pointAdjust', 'pointConfig',
  'reqCreate', 'reqDecide', 'reqWithdraw', 'reqCancel', 'tsSave', 'tsPunch', 'tsUnpaid', 'monthClose', 'tsConfig',
  'ptCreate', 'ptUpdate', 'ptDelete', 'ptMove', 'psSave',
])

export class Rejected extends Error {}

type O = Record<string, unknown>
const isObj = (x: unknown): x is O => !!x && typeof x === 'object' && !Array.isArray(x)
const pick = (o: O, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]))
const omit = (o: O, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

// Task fields the server owns: provenance, MDR identity and creation stamps
const TASK_SERVER = ['source', 'docNumber', 'mdrKey', 'mdrRow', 'mdrSubtasks', 'removedFromMdr', 'createdBy', 'createdAt', 'baselineDue', 'baselineEstimation', 'actualStart', 'actualFinish', 'flow']
// …and for a task that comes from the MDR, everything the MDR decides
const TASK_FROM_MDR = ['name', 'parentId', 'weight', 'weightDerived', 'floor', 'pkg', 'planIssue', 'order']
const TASK_NEW_FLOW = ['id', 'projectId', 'parentId', 'kind', 'name', 'order', 'description', 'type', 'priority', 'reviewerId', 'participantIds', 'assigneeUserId', 'start', 'due', 'estimation', 'teamSpaceId', 'internalProjectId', 'location', 'progressPct', 'dependsOn']
const TASK_NEW_MANUAL = ['id', 'projectId', 'parentId', 'kind', 'name', 'order', 'statusId', 'description', 'type', 'priority', 'floor', 'pkg']
const USER_PATCH = ['name', 'username', 'title', 'phone', 'bio', 'avatar', 'capacity', 'role', 'teamId', 'status']

export interface Prepared {
  action: Action
  /** a new account's first password, set once the action is accepted */
  newPassword?: { userId: string; password: string }
}

/**
 * Validates the shape of a browser action and replaces the fields only the server may set.
 * `tasks` is the current task table (for "is this an MDR task" checks).
 */
export function prepare(raw: unknown, me: User, tasks: Record<string, Task>): Prepared {
  if (!isObj(raw) || typeof raw.type !== 'string') throw new Rejected('درخواست نامعتبر است.')
  if (!CLIENT_ACTIONS.has(raw.type)) throw new Rejected('این عملیات از مرورگر پذیرفته نمی‌شود.')
  const a = { ...raw } as O
  switch (a.type) {
    case 'addUser': {
      if (!isObj(a.user)) throw new Rejected('مشخصات کاربر نامعتبر است.')
      const u = a.user
      const password = typeof u.password === 'string' ? u.password : ''
      if (password.length < 6 || password.length > 200) throw new Rejected('رمز اولیه باید دست‌کم ۶ نویسه باشد.')
      const user = {
        id: String(u.id ?? ''), name: String(u.name ?? '').trim(), username: String(u.username ?? '').trim().toLowerCase(),
        teamId: String(u.teamId ?? ''), role: u.role, capacity: typeof u.capacity === 'number' && u.capacity > 0 && u.capacity <= 24 ? u.capacity : 8,
        status: 'active', createdAt: new Date().toISOString(), ...(typeof u.title === 'string' ? { title: u.title } : {}),
      }
      if (!user.name || !/^[a-z0-9._-]{3,24}$/.test(user.username)) throw new Rejected('نام و نام کاربری معتبر لازم است.')
      return { action: { ...a, user } as Action, newPassword: { userId: user.id, password } }
    }
    case 'updateUser': {
      if (!isObj(a.patch)) throw new Rejected('درخواست نامعتبر است.')
      if ('password' in a.patch) throw new Rejected('رمز عبور از مسیر «تغییر رمز» عوض می‌شود.')
      const patch = pick(a.patch, USER_PATCH)
      if (typeof patch.avatar === 'string' && (patch.avatar.length > 400_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(patch.avatar))) throw new Rejected('تصویر پروفایل نامعتبر است.')
      return { action: { ...a, patch } as unknown as Action }
    }
    case 'addTask': {
      if (!isObj(a.task)) throw new Rejected('تسک نامعتبر است.')
      return { action: { ...a, task: { ...pick(a.task, TASK_NEW_MANUAL), source: 'manual' } } as unknown as Action }
    }
    case 'createFlowTask': {
      if (!isObj(a.task)) throw new Rejected('تسک نامعتبر است.')
      // the person who creates the task is its reporter; nobody files a task in someone else's name
      return { action: { ...a, task: { ...pick(a.task, TASK_NEW_FLOW), source: 'manual', reporterId: me.id }, files: a.files } as unknown as Action }
    }
    case 'updateTask': {
      if (!isObj(a.patch)) throw new Rejected('درخواست نامعتبر است.')
      const t = tasks[String(a.taskId)]
      const banned = [...TASK_SERVER, 'id', 'reporterId', ...(t?.source === 'mdr' ? TASK_FROM_MDR : [])]
      const forged = Object.keys(a.patch).filter((k) => banned.includes(k) && !['flow', 'actualStart', 'actualFinish', 'baselineDue', 'baselineEstimation', 'name'].includes(k))
      if (forged.length) throw new Rejected(`این فیلدها را فقط سامانه تعیین می‌کند: ${forged.join('، ')}`)
      // flow / actual dates / baselines / MDR name stay in the patch so the guard refuses them with its own reason
      return { action: { ...a, patch: omit(a.patch, ['id']) } as unknown as Action }
    }
    case 'projectAdd': {
      if (!isObj(a.project)) throw new Rejected('پروژه نامعتبر است.')
      const p = pick(a.project, ['id', 'code', 'name', 'type', 'phase1TeamId', 'phase2TeamId', 'managerId', 'mdrUrl', 'mdrTab'])
      return { action: { ...a, project: p } as unknown as Action }
    }
    case 'projectUpdate': {
      if (!isObj(a.patch)) throw new Rejected('درخواست نامعتبر است.')
      // lastSync is the time of the last real Sync: only the Sync job writes it
      const patch = pick(a.patch, ['id', 'code', 'name', 'type', 'phase1TeamId', 'phase2TeamId', 'managerId', 'mdrUrl', 'mdrTab'])
      return { action: { ...a, patch } as unknown as Action }
    }
    case 'internalProjectAdd': {
      if (!isObj(a.project)) throw new Rejected('پروژه‌ی داخلی نامعتبر است.')
      return { action: { ...a, project: { ...pick(a.project, ['id', 'teamId', 'name', 'description', 'status', 'start', 'due']), createdBy: me.id, createdAt: new Date().toISOString() } } as unknown as Action }
    }
    case 'internalProjectUpdate': {
      if (!isObj(a.patch)) throw new Rejected('درخواست نامعتبر است.')
      return { action: { ...a, patch: pick(a.patch, ['name', 'description', 'status', 'start', 'due']) } as unknown as Action }
    }
    case 'addLeave': {
      if (!isObj(a.leave)) throw new Rejected('مرخصی نامعتبر است.')
      return { action: { ...a, leave: pick(a.leave, ['id', 'userId', 'date', 'hours', 'note']) } as unknown as Action }
    }
    case 'addHoliday': {
      if (!isObj(a.holiday)) throw new Rejected('تعطیلی نامعتبر است.')
      return { action: { ...a, holiday: pick(a.holiday, ['id', 'date', 'title']) } as unknown as Action }
    }
  }
  return { action: a as unknown as Action }
}

/** Files carried by an action (attachments, review rounds, request documents) */
export function filesOf(a: Action): { name: string; mime: string; size: number; dataUrl: string }[] | undefined {
  const x = a as { files?: unknown }
  return Array.isArray(x.files) ? (x.files as { name: string; mime: string; size: number; dataUrl: string }[]) : undefined
}
