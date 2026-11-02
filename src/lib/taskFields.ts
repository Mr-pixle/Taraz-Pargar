// One place that says which section every task field belongs to and what it is called.
// The task page (sections A–F), list columns, filters, cards, the Gantt tip and AuditLog lines all read from here,
// so a field never shows up under a different name or in a different group on another screen.
import type { Task, TaskKind } from './types'

export type FieldGroupId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
export interface FieldGroup { id: FieldGroupId; letter: string; title: string; short: string; about: string }

/** Order = order on the task page and order of columns in every task table */
export const FIELD_GROUPS: readonly FieldGroup[] = [
  { id: 'a', letter: 'A', title: 'شناسه و طبقه‌بندی', short: 'شناسه', about: 'چه کاری است و کجای کار قرار می‌گیرد' },
  { id: 'b', letter: 'B', title: 'افراد', short: 'افراد', about: 'چه کسی انجام می‌دهد، بررسی می‌کند و همراه است' },
  { id: 'c', letter: 'C', title: 'زمان‌بندی و برآورد', short: 'زمان‌بندی', about: 'کی شروع و کی تمام شود، چقدر کار است و به چه وابسته است' },
  { id: 'd', letter: 'D', title: 'وضعیت و پیشرفت', short: 'وضعیت', about: 'کجای کار است: Status، پیشرفت، زمان واقعی و نتیجه' },
  { id: 'e', letter: 'E', title: 'بررسی و پیوست', short: 'بررسی', about: 'دورهای بررسی و فایل‌ها' },
  { id: 'f', letter: 'F', title: 'گفتگو و تاریخچه', short: 'گفتگو', about: 'کامنت‌ها، پیگیری اقدامات و AuditLog' },
]

export type FieldKey =
  | 'name' | 'docNumber' | 'source' | 'project' | 'space' | 'type' | 'priority' | 'pkg' | 'floor' | 'location' | 'internalProjectId' | 'description' | 'subtasks'
  | 'assignee' | 'team' | 'reporter' | 'reviewer' | 'participants'
  | 'estimation' | 'baselineEstimation' | 'start' | 'due' | 'baselineDue' | 'planIssue' | 'dependsOn' | 'allocation'
  | 'status' | 'progress' | 'weight' | 'actualStart' | 'actualFinish' | 'worklog' | 'wf' | 'point'

export interface FieldDef { label: string; group: FieldGroupId; unit?: string }

export const TASK_FIELDS: Record<FieldKey, FieldDef> = {
  // A — identity and classification
  name: { label: 'عنوان', group: 'a' },
  docNumber: { label: 'Doc Number', group: 'a' },
  source: { label: 'منبع', group: 'a' },
  project: { label: 'پروژه', group: 'a' },
  space: { label: 'فضا', group: 'a' },
  type: { label: 'نوع کار', group: 'a' },
  priority: { label: 'اولویت', group: 'a' },
  pkg: { label: 'Package', group: 'a' },
  floor: { label: 'Floor', group: 'a' },
  location: { label: 'محل در کارگاه', group: 'a' },
  internalProjectId: { label: 'پروژه‌ی داخلی', group: 'a' },
  description: { label: 'شرح', group: 'a' },
  subtasks: { label: 'زیرتسک‌ها', group: 'a' },
  // B — people
  assignee: { label: 'مسئول', group: 'b' },
  team: { label: 'تیم', group: 'b' },
  reporter: { label: 'گزارش‌دهنده / سازنده', group: 'b' },
  reviewer: { label: 'Reviewer', group: 'b' },
  participants: { label: 'مشارکت‌کنندگان', group: 'b' },
  // C — schedule and effort
  estimation: { label: 'Estimation', group: 'c', unit: 'نفر-ساعت' },
  baselineEstimation: { label: 'Original Estimation', group: 'c', unit: 'نفر-ساعت' },
  start: { label: 'Start', group: 'c' },
  due: { label: 'Due Date', group: 'c' },
  baselineDue: { label: 'Due اولیه (Baseline)', group: 'c' },
  planIssue: { label: 'Plan Issue Date', group: 'c' },
  dependsOn: { label: 'پیش‌نیازها', group: 'c' },
  allocation: { label: 'Allocation', group: 'c' },
  // D — status and progress
  status: { label: 'Status', group: 'd' },
  progress: { label: 'پیشرفت', group: 'd' },
  weight: { label: 'Weight', group: 'd' },
  actualStart: { label: 'Actual Start', group: 'd' },
  actualFinish: { label: 'Actual Finish', group: 'd' },
  worklog: { label: 'Work Log', group: 'd' },
  wf: { label: 'W.F (ضریب وزن)', group: 'd' },
  point: { label: 'Point', group: 'd' },
}

/** Short label of a field (W.F without its gloss) */
export const L = (k: FieldKey) => (k === 'wf' ? 'W.F' : TASK_FIELDS[k].label)
/** Label with its unit, for form fields: «Estimation (نفر-ساعت)» */
export const LU = (k: FieldKey) => (TASK_FIELDS[k].unit ? `${TASK_FIELDS[k].label} (${TASK_FIELDS[k].unit})` : TASK_FIELDS[k].label)

/** Fields that apply to a kind of task — a field that means nothing for it is not shown at all, rather than shown empty */
export function fieldsOf(kind: TaskKind): Set<FieldKey> {
  const common: FieldKey[] = ['name', 'source', 'priority', 'description', 'assignee', 'reporter', 'reviewer', 'participants', 'start', 'due', 'baselineDue', 'status', 'progress', 'actualStart', 'actualFinish']
  const scored: FieldKey[] = ['estimation', 'baselineEstimation', 'type', 'worklog', 'wf', 'point']
  switch (kind) {
    case 'document': return new Set([...common, ...scored, 'docNumber', 'project', 'pkg', 'floor', 'planIssue', 'weight', 'dependsOn', 'allocation', 'subtasks', 'team'])
    case 'manual': return new Set([...common, ...scored, 'docNumber', 'project', 'pkg', 'floor', 'dependsOn', 'allocation', 'team'])
    case 'supervision': return new Set([...common, ...scored, 'project', 'location'])
    case 'internal': return new Set([...common, ...scored, 'space', 'internalProjectId', 'subtasks'])
    case 'finadmin': return new Set([...common, 'space'])
    default: return new Set(['name', 'description'])
  }
}
export const hasField = (t: Pick<Task, 'kind'>, k: FieldKey) => fieldsOf(t.kind).has(k)

/** AuditLog wording of edited Task properties («ویرایش: اولویت، Due Date») */
export const AUDIT_FIELD: Partial<Record<keyof Task, string>> = {
  name: L('name'), description: L('description'), type: L('type'), priority: L('priority'), location: L('location'), internalProjectId: L('internalProjectId'),
  reporterId: L('reporter'), reviewerId: L('reviewer'), participantIds: L('participants'),
  estimation: L('estimation'), start: L('start'), due: L('due'), dependsOn: L('dependsOn'),
  wf: L('wf'), progressPct: L('progress'), parentId: 'والد',
}
