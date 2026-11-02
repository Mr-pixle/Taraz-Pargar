// The persisted collections of the state and how they are keyed and ordered. Shared by the server (PostgreSQL rows,
// per-user views, deltas) and the browser (merging a delta into what it already has).
import type { State } from './state'

export const COLLECTIONS = [
  'teams', 'users', 'projects', 'tasks', 'statusSets', 'allocations', 'holidays', 'leaves',
  'syncItems', 'syncRuns', 'audit', 'writeQueue', 'comments', 'messages', 'notifications', 'lastRead',
  'internalProjects', 'reviewRounds', 'attachments', 'pointEntries', 'pointConfigs', 'workLogs',
  'adminRequests', 'timesheets', 'timesheetConfigs', 'monthCloses', 'personalTasks', 'personalBoards',
] as const
export type Collection = (typeof COLLECTIONS)[number]
export type Data = Pick<State, Collection>

type Any = Record<string, unknown>
export type Shape =
  /** Record<string, item>: the record key is the identity */
  | { type: 'record' }
  /** item[]: new items join at the end (append) or at the front (prepend, newest first) */
  | { type: 'array'; key: (x: Any) => string; order: 'append' | 'prepend'; sort?: (a: Any, b: Any) => number }
  /** item[] without an id of their own: stored as one row per group (allocations: per task) */
  | { type: 'grouped'; key: (x: Any) => string }

const id = (x: Any) => String(x.id)
export const SHAPES: Record<Collection, Shape> = {
  teams: { type: 'array', key: id, order: 'append' },
  users: { type: 'array', key: id, order: 'append' },
  projects: { type: 'array', key: id, order: 'append' },
  tasks: { type: 'record' },
  statusSets: { type: 'record' },
  allocations: { type: 'grouped', key: (x) => String(x.taskId) },
  holidays: { type: 'array', key: id, order: 'append', sort: (a, b) => String(a.date).localeCompare(String(b.date)) },
  leaves: { type: 'array', key: id, order: 'append' },
  syncItems: { type: 'array', key: id, order: 'append' },
  syncRuns: { type: 'array', key: id, order: 'prepend' },
  audit: { type: 'array', key: id, order: 'prepend' },
  writeQueue: { type: 'array', key: (x) => String(x.taskId), order: 'append' },
  comments: { type: 'array', key: id, order: 'append' },
  messages: { type: 'array', key: id, order: 'append' },
  notifications: { type: 'array', key: id, order: 'prepend' },
  lastRead: { type: 'record' },
  internalProjects: { type: 'array', key: id, order: 'append' },
  reviewRounds: { type: 'array', key: id, order: 'append' },
  attachments: { type: 'array', key: id, order: 'append' },
  pointEntries: { type: 'array', key: id, order: 'append' },
  pointConfigs: { type: 'array', key: (x) => String(x.version), order: 'append' },
  workLogs: { type: 'array', key: id, order: 'append' },
  adminRequests: { type: 'array', key: id, order: 'append' },
  timesheets: { type: 'record' },
  timesheetConfigs: { type: 'array', key: (x) => String(x.version), order: 'append' },
  monthCloses: { type: 'array', key: (x) => String(x.month), order: 'append' },
  personalTasks: { type: 'record' },
  personalBoards: { type: 'record' },
}

/** Key → item of one collection (allocations: task id → that task's allocations) */
export function entriesOf(c: Collection, value: unknown): [string, unknown][] {
  const s = SHAPES[c]
  if (s.type === 'record') return Object.entries((value ?? {}) as Any)
  const list = (value ?? []) as Any[]
  if (s.type === 'array') return list.map((x) => [s.key(x), x])
  const groups = new Map<string, Any[]>()
  for (const x of list) { const k = s.key(x); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(x) }
  return [...groups]
}

/** Builds a collection back from its entries, given in their stored (insertion) order */
export function fromEntries(c: Collection, entries: [string, unknown][]): unknown {
  const s = SHAPES[c]
  if (s.type === 'record') return Object.fromEntries(entries)
  if (s.type === 'grouped') return entries.flatMap(([, v]) => v as Any[])
  const list = entries.map(([, v]) => v as Any)
  if (s.order === 'prepend') list.reverse()
  if (s.sort) list.sort(s.sort)
  return list
}

/** A change set from the server: items to add or replace (in state order) and keys to drop */
export interface Delta {
  set: Partial<Record<Collection, [string, unknown][]>>
  del: Partial<Record<Collection, string[]>>
}

/** Applies a delta to the collections the browser already has; untouched collections keep their identity */
export function applyDelta<T extends Partial<Data>>(base: T, d: Delta): T {
  const out = { ...base } as Record<string, unknown>
  for (const c of COLLECTIONS) {
    const set = d.set[c], del = d.del[c]
    if (!set?.length && !del?.length) continue
    const s = SHAPES[c]
    const gone = new Set(del ?? [])
    if (s.type === 'record') {
      const rec = { ...(out[c] as Any ?? {}) }
      for (const k of gone) delete rec[k]
      for (const [k, v] of set ?? []) rec[k] = v
      out[c] = rec
      continue
    }
    if (s.type === 'grouped') {
      const groups = new Map(entriesOf(c, out[c]))
      for (const k of gone) groups.delete(k)
      for (const [k, v] of set ?? []) groups.set(k, v)
      out[c] = [...groups.values()].flatMap((v) => v as Any[])
      continue
    }
    const incoming = new Map(set ?? [])
    const list = ((out[c] as Any[]) ?? []).filter((x) => !gone.has(s.key(x))).map((x) => (incoming.has(s.key(x)) ? incoming.get(s.key(x)) as Any : x))
    const have = new Set(list.map(s.key))
    const fresh = (set ?? []).filter(([k]) => !have.has(k)).map(([, v]) => v as Any)
    let next = s.order === 'prepend' ? [...fresh, ...list] : [...list, ...fresh]
    if (s.sort) next = [...next].sort(s.sort)
    out[c] = next
  }
  return out as T
}

/** A full view from the server (entries in state order) back into collections */
export function fromView(c: Collection, entries: [string, unknown][]): unknown {
  const s = SHAPES[c]
  if (s.type === 'record') return Object.fromEntries(entries)
  if (s.type === 'grouped') return entries.flatMap(([, v]) => v as Any[])
  return entries.map(([, v]) => v)
}
