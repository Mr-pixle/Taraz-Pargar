// Pure domain selectors shared by the reducer, the permission policy and the UI.
// No React here: this module moves to the server unchanged in the backend version.
import type { State } from './state'
import type { FlowState, Project, Status, Task, User } from './types'

export function ancestors(tasks: Record<string, Task>, t: Task): Task[] {
  const out: Task[] = []
  let p = t.parentId ? tasks[t.parentId] : undefined
  while (p) { out.push(p); p = p.parentId ? tasks[p.parentId] : undefined }
  return out
}

/** Nearest scope that defines a Status set: section (Group/Stage/Phase) → project → office default */
export function effectiveScope(state: Pick<State, 'tasks' | 'statusSets'>, t: Task | { id: string; projectId: string; parentId: string | null }) {
  const chain: string[] = []
  if ('kind' in t && (t.kind === 'phase' || t.kind === 'stage' || t.kind === 'group')) chain.push(t.id)
  let p = t.parentId ? state.tasks[t.parentId] : undefined
  while (p) { chain.push(p.id); p = p.parentId ? state.tasks[p.parentId] : undefined }
  for (const id of chain) if (state.statusSets[id]) return id
  if (state.statusSets[t.projectId]) return t.projectId
  return 'office'
}
export function parentScopeOf(state: Pick<State, 'tasks' | 'statusSets'>, scope: string) {
  if (scope === 'office') return null
  const t = state.tasks[scope]
  if (!t) return 'office'
  let p = t.parentId ? state.tasks[t.parentId] : undefined
  while (p) { if (state.statusSets[p.id]) return p.id; p = p.parentId ? state.tasks[p.parentId] : undefined }
  return state.statusSets[t.projectId] ? t.projectId : 'office'
}
export function statusesFor(state: Pick<State, 'tasks' | 'statusSets'>, t: Task) {
  return state.statusSets[effectiveScope(state, t)]
}
export function statusOf(state: Pick<State, 'tasks' | 'statusSets'>, t: Task): Status | undefined {
  const set = statusesFor(state, t)
  return set.find((s) => s.id === t.statusId) ?? set[0]
}
/** Project work items (MDR documents and manual tasks) — the only tasks in project roll-ups and reports */
export const isWorkItem = (t: Task) => t.kind === 'document' || t.kind === 'manual'
/** Tasks that follow the Create → Assign → Execution → Review → Close flow */
export const isFlowTask = (t: Task) => t.kind === 'supervision' || t.kind === 'internal' || t.kind === 'finadmin'
/**
 * Finance & Administration section: two separate spaces, each with its own projectId. Never part of projects, team spaces,
 * Workload, points or Work Log. finance = Finance space (CEO + Financial Manager); office = Administrative (management) space (CEO + Administrative Manager).
 */
export type FinSpace = 'finance' | 'office'
export const FIN_SPACES: readonly FinSpace[] = ['finance', 'office']
export const FIN_SPACE_FA: Record<FinSpace, string> = { finance: 'فضای مالی', office: 'فضای اداری (مدیریتی)' }
export const finProjectId = (s: FinSpace) => `finadmin:${s}`
export const isFinTask = (t: Task) => t.kind === 'finadmin'
/** Space of a finance & admin task (undefined for any other task, or a task without a valid space) */
export const finSpaceOf = (t: Pick<Task, 'kind' | 'projectId'>): FinSpace | undefined =>
  t.kind !== 'finadmin' ? undefined : FIN_SPACES.find((s) => finProjectId(s) === t.projectId)
export const activeOf = (users: User[]) => users.filter((u) => u.status === 'active')

/** Teams that work on a project: fixed teams, its Phase 1 and Phase 2 teams, Revit and Supervision */
/** Teams of a project: the fixed teams (Project Control, R&D, Interior, Presentation, Render) work on every project */
export function projectTeams(p: Project) { return ['ctl', 'rd', 'int', 'prs', 'ren', p.phase1TeamId, p.phase2TeamId, 'rvt', 'sup'] }

/** Roles that see every project channel without being in a project team */
const CHANNEL_ALL: User['role'][] = ['ceo', 'management']

export function channelMembers(state: Pick<State, 'users' | 'projects'>, channelId: string): string[] {
  const act = activeOf(state.users)
  if (!channelId.startsWith('project:')) return act.map((u) => u.id)
  const p = state.projects.find((x) => `project:${x.id}` === channelId)
  if (!p) return []
  const teams = new Set(projectTeams(p))
  return act.filter((u) => teams.has(u.teamId) || CHANNEL_ALL.includes(u.role) || p.managerId === u.id).map((u) => u.id)
}

export function parseMentions(text: string, users: User[]) {
  const ids = new Set<string>()
  for (const m of text.matchAll(/@([a-z0-9._-]+)/gi)) {
    const u = users.find((x) => x.status === 'active' && x.username.toLowerCase() === m[1].toLowerCase())
    if (u) ids.add(u.id)
  }
  return [...ids]
}

/** Team responsible for a task: the assignee's team, or the assigned team */
export function teamOfTask(state: Pick<State, 'users'>, t: Task): string | null {
  if (t.assigneeUserId) return state.users.find((u) => u.id === t.assigneeUserId)?.teamId ?? null
  return t.assigneeTeamId ?? null
}

// ---------- flow (supervision and internal tasks) ----------
export const FLOW_ORDER: FlowState[] = ['open', 'assigned', 'in_progress', 'in_review', 'rework', 'closed']
export const FLOW_FA: Record<FlowState, string> = {
  open: 'ثبت‌شده', assigned: 'ارجاع‌شده', in_progress: 'در حال اجرا', in_review: 'در انتظار بررسی', rework: 'بازگشت برای اصلاح', closed: 'بسته‌شده',
}
/** Progress shown for a flow state (used by roll-ups of internal projects) */
export const FLOW_PROGRESS: Record<FlowState, number> = { open: 0, assigned: 0, in_progress: 40, in_review: 80, rework: 50, closed: 100 }
export const flowOf = (t: Task): FlowState => t.flow ?? (t.assigneeUserId ? 'assigned' : 'open')
/** Progress of a flow task: closed = 100; a finance & admin task uses the percentage its people set, the others the fixed value of their flow state */
export const flowProgress = (t: Task) => {
  const f = flowOf(t)
  if (f === 'closed') return 100
  return isFinTask(t) && t.progressPct != null ? t.progressPct : FLOW_PROGRESS[f]
}
/** One progress figure for every leaf task: Status for project work items, flow for the rest */
export const taskProgress = (state: Pick<State, 'tasks' | 'statusSets'>, t: Task) => (isFlowTask(t) ? flowProgress(t) : isWorkItem(t) ? statusOf(state, t)?.progress ?? 0 : 0)
export const isClosed = (state: Pick<State, 'tasks' | 'statusSets'>, t: Task) =>
  isFlowTask(t) ? flowOf(t) === 'closed' : isWorkItem(t) ? statusOf(state, t)?.category === 'done' : false
