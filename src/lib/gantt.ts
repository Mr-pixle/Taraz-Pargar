// Gantt row model — pure, so it can be tested on its own and later reused by the server and the combined Gantt.
// Uses only fields the tasks already have: start / due (current plan), actualStart / actualFinish, baselineDue, dependsOn.
import { addDays } from './jalali'
import type { Task } from './types'

export type GanttRowKind = 'project' | 'summary' | 'task' | 'group'
export interface Span { start: string; end: string }
export interface GanttRow {
  key: string
  level: number
  kind: GanttRowKind
  label: string
  task?: Task
  hasChildren: boolean
  open: boolean
  /** current plan (Start → Due); for summaries the span of their children */
  plan: Span | null
  /** Due without Start */
  milestone: string | null
  /** Actual Start → Actual Finish, or → today while the task is still running */
  actual: (Span & { ongoing: boolean }) | null
  /** the part of the actual bar after the Due Date */
  late: Span | null
  progress: number
  /** original Due, only when it differs from the current Due */
  baselineDue: string | null
  overdueNotStarted: boolean
  unscheduled: boolean
}
export interface GanttLink { from: number; to: number; fromId: string; toId: string; violated: boolean }
export interface GanttModel { rows: GanttRow[]; links: GanttLink[]; range: Span | null; hiddenUnscheduled: number; leafCount: number }

export interface GanttInput {
  /** tasks to show (already filtered by the view) */
  leaves: Task[]
  /** every task, to find their parents */
  tasks: Record<string, Task>
  projects: { id: string; name: string; code: string }[]
  progressOf: (t: Task) => number
  closedOf: (t: Task) => boolean
  /** optional extra group (supervision items of the project) */
  extras?: { key: string; label: string; tasks: Task[] }
  showUnscheduled: boolean
  /** explicit open/closed state per row key; missing keys fall back to the default */
  open: Record<string, boolean>
  /** default: projects, Phases and Stages open; everything open when there are only a few tasks */
  allOpen?: boolean
  today: string
}

const minD = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b)
const maxD = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/** Bars of one task, from its own fields only */
export function leafBars(t: Task, closed: boolean, today: string) {
  const plan = t.start && t.due ? { start: t.start <= t.due ? t.start : t.due, end: t.due >= t.start ? t.due : t.start } : null
  const milestone = !plan ? (t.due ?? t.start ?? null) : null
  let actual: GanttRow['actual'] = null
  if (t.actualStart) {
    const ongoing = !t.actualFinish && !closed
    const end = t.actualFinish ?? (ongoing ? (today > t.actualStart ? today : t.actualStart) : t.actualStart)
    actual = { start: t.actualStart, end, ongoing }
  }
  const finish = t.actualFinish ?? (actual?.ongoing ? today : null)
  const late = t.due && actual && finish && finish > t.due ? { start: addDays(t.due, 1) > actual.start ? addDays(t.due, 1) : actual.start, end: finish } : null
  const overdueNotStarted = !t.actualStart && !!t.due && t.due < today && !closed
  return { plan, milestone, actual, late, overdueNotStarted, unscheduled: !plan && !milestone && !actual }
}

export function buildGantt(inp: GanttInput): GanttModel {
  const { tasks, today } = inp
  const leafBar = new Map<string, ReturnType<typeof leafBars>>()
  let hiddenUnscheduled = 0
  const leaves: Task[] = []
  for (const t of inp.leaves) {
    const b = leafBars(t, inp.closedOf(t), today)
    if (b.unscheduled && !inp.showUnscheduled) { hiddenUnscheduled++; continue }
    leafBar.set(t.id, b)
    leaves.push(t)
  }
  // visible tree = shown tasks and their ancestors
  const visible = new Set<string>()
  for (const t of leaves) {
    visible.add(t.id)
    let p = t.parentId ? tasks[t.parentId] : undefined
    while (p && !visible.has(p.id)) { visible.add(p.id); p = p.parentId ? tasks[p.parentId] : undefined }
  }
  const children = new Map<string, Task[]>()
  for (const id of visible) {
    const t = tasks[id]
    if (!t) continue
    const k = t.parentId && visible.has(t.parentId) ? t.parentId : `root:${t.projectId}`
    ;(children.get(k) ?? children.set(k, []).get(k)!).push(t)
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order)

  // summaries over the whole visible subtree (not only the expanded part), so the range never jumps when expanding
  type Agg = { plan: Span | null; milestone: string | null; actual: GanttRow['actual']; late: Span | null }
  const agg = new Map<string, Agg>()
  const summarize = (t: Task): Agg => {
    const hit = agg.get(t.id)
    if (hit) return hit
    const own = leafBar.get(t.id)
    let a: Agg = own ? { plan: own.plan, milestone: own.milestone, actual: own.actual, late: own.late } : { plan: null, milestone: null, actual: null, late: null }
    for (const c of children.get(t.id) ?? []) {
      const ca = summarize(c)
      const cs = ca.plan?.start ?? ca.milestone, ce = ca.plan?.end ?? ca.milestone
      if (cs && ce) a = { ...a, plan: { start: minD(a.plan?.start ?? null, cs)!, end: maxD(a.plan?.end ?? null, ce)! } }
      if (ca.actual) a = { ...a, actual: { start: minD(a.actual?.start ?? null, ca.actual.start)!, end: maxD(a.actual?.end ?? null, ca.actual.end)!, ongoing: !!(a.actual?.ongoing || ca.actual.ongoing) } }
    }
    if (!own && a.plan) a = { ...a, milestone: null }
    agg.set(t.id, a)
    return a
  }

  const defaultOpen = (key: string, t?: Task) => inp.allOpen || key.startsWith('project:') || key === inp.extras?.key || t?.kind === 'phase' || t?.kind === 'stage'
  const isOpen = (key: string, t?: Task) => inp.open[key] ?? defaultOpen(key, t)
  const rows: GanttRow[] = []

  const pushTask = (t: Task, level: number) => {
    const ch = children.get(t.id) ?? []
    const key = t.id
    const own = leafBar.get(t.id)
    const s = summarize(t)
    const open = ch.length > 0 && isOpen(key, t)
    rows.push({
      key, level, kind: own ? 'task' : 'summary', label: t.name, task: t, hasChildren: ch.length > 0, open,
      // a task row shows its own dates; only summary rows show the span of their children
      plan: own ? own.plan : s.plan, milestone: own ? own.milestone : s.milestone, actual: own ? own.actual : s.actual, late: own?.late ?? null, progress: inp.progressOf(t),
      baselineDue: own && t.baselineDue && t.due && t.baselineDue !== t.due ? t.baselineDue : null,
      overdueNotStarted: own?.overdueNotStarted ?? false, unscheduled: own?.unscheduled ?? false,
    })
    if (open) for (const c of ch) pushTask(c, level + 1)
  }

  const projectIds = [...new Set(leaves.map((t) => t.projectId))]
  const multi = projectIds.length > 1
  for (const p of inp.projects.filter((x) => projectIds.includes(x.id))) {
    const roots = children.get(`root:${p.id}`) ?? []
    if (!multi) { for (const r of roots) pushTask(r, 0); continue }
    const key = `project:${p.id}`
    const open = isOpen(key)
    let plan = null as Span | null, actual = null as GanttRow['actual']
    for (const r of roots) {
      const s = summarize(r)
      const cs = s.plan?.start ?? s.milestone, ce = s.plan?.end ?? s.milestone
      if (cs && ce) plan = { start: minD(plan?.start ?? null, cs)!, end: maxD(plan?.end ?? null, ce)! }
      if (s.actual) actual = { start: minD(actual?.start ?? null, s.actual.start)!, end: maxD(actual?.end ?? null, s.actual.end)!, ongoing: !!(actual?.ongoing || s.actual.ongoing) }
    }
    rows.push({ key, level: 0, kind: 'project', label: `${p.code} — ${p.name}`, hasChildren: roots.length > 0, open, plan, milestone: null, actual, late: null, progress: 0, baselineDue: null, overdueNotStarted: false, unscheduled: false })
    if (open) for (const r of roots) pushTask(r, 1)
  }

  // extra group (supervision items), flat and ordered by Due
  if (inp.extras && inp.extras.tasks.length) {
    const list = [...inp.extras.tasks].filter((t) => {
      const b = leafBars(t, inp.closedOf(t), today)
      if (b.unscheduled && !inp.showUnscheduled) { hiddenUnscheduled++; return false }
      leafBar.set(t.id, b)
      return true
    }).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
    if (list.length) {
      const key = inp.extras.key
      const open = isOpen(key)
      let plan = null as Span | null, actual = null as GanttRow['actual']
      for (const t of list) {
        const b = leafBar.get(t.id)!
        const cs = b.plan?.start ?? b.milestone, ce = b.plan?.end ?? b.milestone
        if (cs && ce) plan = { start: minD(plan?.start ?? null, cs)!, end: maxD(plan?.end ?? null, ce)! }
        if (b.actual) actual = { start: minD(actual?.start ?? null, b.actual.start)!, end: maxD(actual?.end ?? null, b.actual.end)!, ongoing: !!(actual?.ongoing || b.actual.ongoing) }
      }
      rows.push({ key, level: 0, kind: 'group', label: inp.extras.label, hasChildren: true, open, plan, milestone: null, actual, late: null, progress: 0, baselineDue: null, overdueNotStarted: false, unscheduled: false })
      if (open) for (const t of list) {
        const b = leafBar.get(t.id)!
        rows.push({ key: t.id, level: 1, kind: 'task', label: t.name, task: t, hasChildren: false, open: false, ...b, progress: inp.progressOf(t), baselineDue: t.baselineDue && t.due && t.baselineDue !== t.due ? t.baselineDue : null })
      }
    }
  }

  // Finish-to-Start links between rows on screen; red when the successor started before its predecessor finished
  const index = new Map<string, number>()
  rows.forEach((r, i) => { if (r.task) index.set(r.task.id, i) })
  const links: GanttLink[] = []
  rows.forEach((r, i) => {
    for (const pid of r.task?.dependsOn ?? []) {
      const from = index.get(pid)
      const pred = tasks[pid]
      if (from == null || !pred) continue
      const succStart = r.task!.actualStart ?? r.task!.start
      const predFinish = pred.actualFinish ?? pred.due
      links.push({ from, to: i, fromId: pid, toId: r.task!.id, violated: !!(succStart && predFinish && succStart < predFinish) })
    }
  })

  // date range over everything shown (including collapsed rows) plus today
  let start: string | null = today, end: string | null = today
  const take = (b: { plan: Span | null; milestone: string | null; actual: GanttRow['actual']; late: Span | null }, base?: string | null) => {
    start = minD(start, b.plan?.start ?? b.milestone ?? null); end = maxD(end, b.plan?.end ?? b.milestone ?? null)
    if (b.actual) { start = minD(start, b.actual.start); end = maxD(end, b.actual.end) }
    if (b.late) end = maxD(end, b.late.end)
    if (base) { start = minD(start, base); end = maxD(end, base) }
  }
  for (const [id, b] of leafBar) take(b, tasks[id]?.baselineDue ?? null)
  return { rows, links, range: leafBar.size ? { start: start!, end: end! } : null, hiddenUnscheduled, leafCount: leafBar.size }
}
