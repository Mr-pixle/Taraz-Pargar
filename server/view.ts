// What one signed-in person may read. Every response is cut from the full state by these rules, so a record the person
// may not see never leaves the server — hiding it in the browser is not what protects it.
import { COLLECTIONS, SHAPES, entriesOf, type Collection, type Delta } from '../src/lib/collections'
import { channelMembers } from '../src/lib/domain'
import { canSeeAllLogs, canSeeAuditEntry, canSeeRequest, canSeeTeamSpace, canSeeTimesheetOf, canViewTask, has } from '../src/lib/policy'
import type { State } from '../src/lib/state'
import type { AuditEntry, Leave, Task, User, WorkLog } from '../src/lib/types'

type Entries = Partial<Record<Collection, [string, unknown][]>>

// Redacted copies are cached per source object, so an unchanged record keeps its identity and is not sent again
const cache = <T extends object>(fn: (x: T) => T) => {
  const m = new WeakMap<T, T>()
  return (x: T) => { let y = m.get(x); if (!y) { y = fn(x); m.set(x, y) } return y }
}
const publicUser = cache<User>(({ password: _p, ...u }) => u as User)
/** Someone else's Work Log: the time counts in totals, the text and its history stay with its owner and managers */
const redactedLog = cache<WorkLog>((l) => ({ ...l, description: '', revisions: undefined, deleteReason: undefined }))
const noteless = cache<Leave>(({ note: _n, ...l }) => l as Leave)

export function viewOf(state: State, me: User): Entries {
  const task = (id: string | undefined) => (id ? state.tasks[id] : undefined)
  const sees = new Map<string, boolean>()
  const seeTask = (t: Task | undefined) => {
    if (!t) return false
    let v = sees.get(t.id)
    if (v === undefined) { v = canViewTask(state, me, t); sees.set(t.id, v) }
    return v
  }
  const seeTaskId = (id: string | undefined) => seeTask(task(id))
  const approver = has(me, 'users.approve') || has(me, 'users.manage')
  const control = has(me, 'control.section')
  const points = has(me, 'points.manage')
  const allLeaves = has(me, 'timesheet.view.all')
  const channels = new Map<string, boolean>()
  const inChannel = (ch: string) => { let v = channels.get(ch); if (v === undefined) { v = channelMembers(state, ch).includes(me.id); channels.set(ch, v) } return v }
  const auditOk = (a: AuditEntry) => {
    const t = task(a.taskId)
    if (!canSeeAuditEntry(state, me, a)) return false
    if (!t) return has(me, 'audit.view')
    if (!seeTask(t)) return false
    // lines that carry someone's Work Log text or points follow the same rule as the Work Log and the points
    if (a.kind === 'worklog') return a.userId === me.id || canSeeAllLogs(state, me, t)
    if (a.kind === 'points') return points || t.assigneeUserId === me.id
    return true
  }
  const out: Entries = {}
  for (const c of COLLECTIONS) {
    const all = entriesOf(c, state[c])
    let list: [string, unknown][]
    switch (c) {
      case 'users': list = all.filter(([, u]) => approver || ['active', 'disabled'].includes((u as User).status) || (u as User).id === me.id).map(([k, u]) => [k, publicUser(u as User)]); break
      case 'tasks': list = all.filter(([, t]) => seeTask(t as Task)); break
      case 'allocations': list = all.filter(([k]) => seeTaskId(k)); break
      case 'comments': case 'reviewRounds': case 'attachments': list = all.filter(([, x]) => seeTaskId((x as { taskId: string }).taskId)); break
      case 'messages': list = all.filter(([, m]) => inChannel((m as { channelId: string }).channelId)); break
      case 'notifications': list = all.filter(([, n]) => (n as { userId: string }).userId === me.id); break
      case 'lastRead': list = all.filter(([k]) => k.startsWith(`${me.id}|`)); break
      case 'internalProjects': list = all.filter(([, p]) => canSeeTeamSpace(me, (p as { teamId: string }).teamId)); break
      case 'pointEntries': list = all.filter(([, e]) => points || (e as { userId: string }).userId === me.id); break
      case 'workLogs': list = all.filter(([, l]) => seeTaskId((l as WorkLog).taskId)).map(([k, l]) => {
        const log = l as WorkLog
        return [k, log.userId === me.id || canSeeAllLogs(state, me, state.tasks[log.taskId]) ? log : redactedLog(log)]
      }); break
      case 'adminRequests': list = all.filter(([, r]) => canSeeRequest(me, r as State['adminRequests'][number])); break
      case 'timesheets': list = all.filter(([, d]) => canSeeTimesheetOf(me, (d as { userId: string }).userId)); break
      case 'personalTasks': list = all.filter(([, t]) => (t as { ownerId: string }).ownerId === me.id); break
      case 'personalBoards': list = all.filter(([k]) => k === me.id); break
      case 'leaves': list = all.map(([k, l]) => [k, allLeaves || (l as Leave).userId === me.id ? l : noteless(l as Leave)]); break
      case 'syncItems': case 'syncRuns': case 'writeQueue': list = control ? all : []; break
      case 'audit': list = all.filter(([, a]) => auditOk(a as AuditEntry)); break
      default: list = all // teams, projects, statusSets, holidays, configs, monthCloses
    }
    out[c] = list
  }
  return out
}

const same = (c: Collection, a: unknown, b: unknown) => {
  if (a === b) return true
  if (SHAPES[c].type !== 'grouped') return false
  const x = a as unknown[], y = b as unknown[]
  return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i])
}

export type Sent = Map<Collection, Map<string, unknown>>
export const sentOf = (v: Entries): Sent => new Map(COLLECTIONS.map((c) => [c, new Map(v[c] ?? [])]))

/** Only what changed for this person since the view they already have (including records that left their view) */
export function deltaOf(prev: Sent, next: Entries): Delta {
  const d: Delta = { set: {}, del: {} }
  for (const c of COLLECTIONS) {
    const before = prev.get(c) ?? new Map()
    const now = next[c] ?? []
    const set = now.filter(([k, v]) => !before.has(k) || !same(c, before.get(k), v))
    const keys = new Set(now.map(([k]) => k))
    const del = [...before.keys()].filter((k) => !keys.has(k))
    if (set.length) d.set[c] = set
    if (del.length) d.del[c] = del
  }
  return d
}
