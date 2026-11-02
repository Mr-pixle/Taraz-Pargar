/** Roles. Every write is checked against lib/policy.ts inside the reducer, not only by hiding buttons. office = Administrative (internal) Manager, finance = Financial Manager */
export type Role = 'sysadmin' | 'ceo' | 'management' | 'control' | 'pm' | 'lead' | 'member' | 'inspector' | 'office' | 'finance'
export type TeamKind = 'fixed' | 'phase1' | 'phase2' | 'revit' | 'other' | 'supervision' | 'management'
/**
 * supervision = site/execution item of a project; internal = task in a team's own space (never in project reports);
 * finadmin = task of the Finance & Administration space (CEO, Administrative Manager and Financial Manager only)
 */
export type TaskKind = 'phase' | 'stage' | 'group' | 'doctype' | 'document' | 'manual' | 'supervision' | 'internal' | 'finadmin'
export type StatusCategory = 'todo' | 'doing' | 'done'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskType = 'design' | 'documentation' | 'coordination' | 'modeling' | 'render' | 'presentation' | 'research' | 'supervision' | 'admin' | 'other'
/** Workflow of supervision and internal tasks: Create → Assign → Execution → Submit for Review → Approve / Rework → Close */
export type FlowState = 'open' | 'assigned' | 'in_progress' | 'in_review' | 'rework' | 'closed'

export interface Team { id: string; name: string; kind: TeamKind }
export type AccountStatus = 'active' | 'pending' | 'rejected' | 'disabled'
export interface User {
  id: string; name: string; username: string; teamId: string; role: Role; capacity: number; title?: string
  status: AccountStatus
  /** demo build only; the server keeps a scrypt hash in its own table and never sends it to a browser */
  password?: string; phone?: string; bio?: string; createdAt: string
  /** profile photo as a small square data URL */
  avatar?: string
}

export interface Project {
  id: string; code: string; name: string; type: string
  phase1TeamId: string; phase2TeamId: string
  /** Project Manager (role pm) — scope of the PM's permissions */
  managerId?: string
  mdrUrl: string; mdrTab: string; lastSync?: string
}

export interface Task {
  id: string; projectId: string; parentId: string | null; kind: TaskKind
  name: string; order: number
  docNumber?: string; floor?: string; weight?: number | null; weightDerived?: boolean
  pkg?: string; planIssue?: string; mdrRow?: number
  /** Identity of the row in the project's MDR (Document Number, or Document Number + name when the number repeats; phase › stage › group › doc type codes for summary rows) */
  mdrKey?: string
  /** SubTask (Design) / SubTask (Render) of the MDR row, for reference */
  mdrSubtasks?: string[]
  statusId?: string; estimation?: number; start?: string; due?: string
  assigneeUserId?: string; assigneeTeamId?: string
  source: 'mdr' | 'manual'; removedFromMdr?: boolean
  // ---- Phase 1 fields (all optional, so existing tasks stay valid) ----
  description?: string; type?: TaskType; priority?: Priority
  reporterId?: string; reviewerId?: string; participantIds?: string[]
  /** Weight Factor for scoring (Phase 3); 1 when empty */
  wf?: number
  /** Finish-to-Start predecessors */
  dependsOn?: string[]
  /** First Due Date ever set; never changes afterwards */
  baselineDue?: string
  /** Original Estimation: the first Estimation ever set (person-hours); never changes afterwards */
  baselineEstimation?: number
  actualStart?: string; actualFinish?: string
  /** Flow of supervision / internal tasks */
  flow?: FlowState
  /** internal tasks: owning team and optional internal project */
  teamSpaceId?: string; internalProjectId?: string
  /** supervision: where on site */
  location?: string
  /** finadmin: progress set by hand (0–100); the other kinds take progress from their Status or flow state */
  progressPct?: number
  createdBy?: string; createdAt?: string
}

export interface InternalProject {
  id: string; teamId: string; name: string; description?: string
  status: 'active' | 'paused' | 'done'; start?: string; due?: string
  createdBy: string; createdAt: string
}

export interface ReviewRound {
  id: string; taskId: string; round: number
  submittedBy: string; submittedAt: string; note: string
  decision?: 'approve' | 'rework'; decidedBy?: string; decidedAt?: string; decisionNote?: string
}

/** Files are kept as data URLs in this browser version; the server version stores them in object storage */
export interface Attachment {
  id: string; taskId: string; roundId?: string
  name: string; mime: string; size: number; dataUrl: string
  uploadedBy: string; uploadedAt: string
}

export interface Status { id: string; name: string; category: StatusCategory; progress: number }

export interface Allocation { taskId: string; userId?: string; teamId: string; date: string; hours: number }
export interface Holiday { id: string; date: string; title: string }
/** Capacity-reducing leave used by the planner. Rows from an approved request carry requestId; direct entries by the Administrative Manager carry by + note (reason). */
export interface Leave { id: string; userId: string; date: string; hours: number; note?: string; requestId?: string; by?: string; at?: string }

export type SyncItemKind = 'new' | 'changed' | 'removed'
export interface FieldChange { field: 'name' | 'weight' | 'floor' | 'parent' | 'package'; from: string; to: string; toParentId?: string; /** weight: shared equally because the MDR row has no Weight of its own */ derived?: boolean }
export interface SyncItem {
  id: string; projectId: string; runId: string; kind: SyncItemKind
  branch: string[] // Phase › Stage › Group names, for batch approval
  row: number
  task?: Task // for 'new'
  taskId?: string // for changed / removed
  changes?: FieldChange[]
  warnings?: string[]
  state: 'pending' | 'approved' | 'rejected'
}

export type SyncTrigger = 'manual' | 'scheduled' | 'writeback'
export type RunState = 'success' | 'partial' | 'failed' | 'retrying' | 'running'
export interface SyncRun {
  id: string; projectId: string | 'all'; trigger: SyncTrigger; at: string; durationSec: number
  state: RunState; rowsRead: number; diffs: { new: number; changed: number; removed: number }
  cellsWritten: number; log: { level: 'info' | 'warn' | 'error'; text: string }[]
}

export interface WriteBackItem { taskId: string; statusName: string; progress: number; date: string; queuedAt: number }
/** Reference columns refreshed on every Sync without review (row moves, Plan Issue Date, SubTasks) */
export interface MdrRefresh { taskId: string; mdrRow: number; planIssue?: string; mdrSubtasks?: string[] }

export interface AuditEntry {
  id: string; at: string; userId: string; taskId?: string
  kind: 'status' | 'allocation' | 'dates' | 'estimation' | 'sync' | 'admin' | 'review' | 'actual' | 'security' | 'task' | 'points' | 'worklog' | 'request' | 'timesheet'
  text: string
}

export type NotifKind = 'assign' | 'status' | 'mention' | 'comment' | 'sync' | 'announce' | 'account' | 'due' | 'plan' | 'review' | 'points' | 'worklog' | 'request' | 'timesheet'
export type NotifLink =
  | { type: 'task'; id: string }
  | { type: 'project'; id: string }
  | { type: 'chat'; channelId: string }
  | { type: 'page'; page: string }
export interface Notification {
  id: string; userId: string; at: string; kind: NotifKind; title: string; body?: string
  actorId?: string; link?: NotifLink; read: boolean
}

export interface Comment { id: string; taskId: string; userId: string; at: string; text: string; mentions: string[] }

/** Channel ids: 'general', 'announce', or `project:<projectId>` */
export interface ChatMessage {
  id: string; channelId: string; userId: string | null; at: string; text: string; mentions: string[]
  system?: boolean; link?: NotifLink
}

// ---------- points ----------
/** Versioned scoring parameters. A new version applies to new calculations only; recorded points keep the version they used. */
export interface PointConfig {
  version: number
  /** the 100 in Point = (W.F / Estimation) × 100 × hours */
  multiplier: number
  /** hours per working day used to turn a working-day difference into person-hours */
  hoursPerDay: number
  /** extra weights for early and late (1 = the formula as defined) */
  earlyFactor: number; lateFactor: number
  /** optional ceiling for one task's point, either sign; null = no ceiling */
  cap: number | null
  reason: string; by: string; at: string
}

export interface PointCalc {
  wf: number; estimation: number; due: string; completedOn: string
  workdays: number; hours: number; direction: 'early' | 'late' | 'ontime'
  multiplier: number; hoursPerDay: number; factor: number; capped: boolean; configVersion: number
}

/** Append-only ledger. A correction never edits a row: it adds a reversal and, if needed, a new row. */
export interface PointEntry {
  id: string; userId: string; taskId?: string
  kind: 'task' | 'reversal' | 'adjust'
  points: number
  /** business date: completion date for task rows, decision date for reversals and adjustments */
  date: string
  at: string; actorId: string; reason: string
  calc?: PointCalc
  reverses?: string; reversedBy?: string
}

// ---------- time tracking ----------
/**
 * Time spent on a task. Never hard-deleted: edits keep the previous values in `revisions`, deletes set `deletedAt`.
 * projectId and teamId are snapshots taken when the record is created, so reports per project and team stay correct
 * even if a person later moves to another team.
 */
export interface WorkLog {
  id: string; taskId: string; userId: string
  minutes: number
  /** day the work was done (Tehran date) */
  workDate: string
  description: string
  createdAt: string
  projectId: string; teamId: string
  source: 'manual' | 'timer'
  updatedAt?: string; updatedBy?: string
  revisions?: { at: string; by: string; minutes: number; workDate: string; description: string; reason?: string }[]
  deletedAt?: string; deletedBy?: string; deleteReason?: string
}

// ---------- administrative module ----------
export type AdminRequestKind = 'leave' | 'overtime' | 'other'
/** pending_office → pending_ceo → approved; a rejection at either step ends the request */
export type AdminRequestStatus = 'pending_office' | 'pending_ceo' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled'
export type LeaveCategory = 'annual' | 'sick' | 'unpaid'
export type OtherCategory = 'mission' | 'certificate' | 'advance_pay' | 'equipment' | 'other'
/** day: whole working days from..to; hour: one day (from = to) between startTime and endTime */
export interface LeaveDetails { mode: 'day' | 'hour'; category: LeaveCategory; from: string; to: string; startTime?: string; endTime?: string }
/** source: timesheet = after the day (from the overtime prompt), advance = asked before the day */
export interface OvertimeDetails { date: string; minutes: number; taskIds: string[]; source: 'timesheet' | 'advance'; approvedMinutes?: number }
export interface OtherDetails { title: string; category: OtherCategory; date?: string }
export interface RequestFile { id: string; name: string; mime: string; size: number; dataUrl: string; uploadedAt: string }
export interface RequestStep {
  stage: 'submit' | 'office' | 'ceo' | 'withdraw' | 'cancel' | 'system'
  by: string; at: string
  decision?: 'approve' | 'reject'
  note?: string
  /** overtime: minutes approved at this step */
  minutes?: number
}
export interface AdminRequest {
  id: string
  /** running number shown to people */
  no: number
  userId: string; kind: AdminRequestKind; status: AdminRequestStatus
  createdAt: string
  /** when the request reached its current step — response-time reports */
  stageSince: string
  description: string
  leave?: LeaveDetails; overtime?: OvertimeDetails; other?: OtherDetails
  files: RequestFile[]
  steps: RequestStep[]
  /** Leave rows written on final approval (removed again if the leave is cancelled) */
  leaveIds?: string[]
}

/**
 * Stored daily figures in minutes. They are recalculated by one function after every related change and frozen once the
 * month is closed, so reports read exactly what payroll saw. Worked, requested, approved and unpaid overtime are kept apart.
 */
export interface TimesheetCalc {
  presence: number; breakMinutes: number; worked: number
  /** required net work: 8 h on working days minus leave, 0 on Thursday, Friday and holidays */
  duty: number; leave: number; offDay: boolean
  excess: number; requested: number; approved: number; pending: number; unpaid: number; undecided: number
  deficit: number
  configVersion: number
}
export interface TimesheetDay {
  /** `${userId}|${date}` */
  id: string; userId: string; date: string
  /** "HH:MM" Tehran; a check-out earlier than the check-in means after midnight */
  checkIn?: string; checkOut?: string
  breakMinutes: number
  note?: string
  /** the person chose not to request overtime for this day */
  otChoice?: 'unpaid'
  calc: TimesheetCalc
  updatedAt: string; updatedBy: string
  revisions: { at: string; by: string; checkIn?: string; checkOut?: string; breakMinutes: number; note?: string; reason?: string }[]
}
/** Versioned rules; a new version applies from its date on, earlier days keep their figures */
export interface TimesheetConfig {
  version: number; from: string
  /** required net work per working day (minutes) */
  dutyNetMinutes: number
  /** break deducted at least on working days (lunch and rest) */
  minBreakMinutes: number
  /** how many past days a person may still enter or correct */
  editDays: number
  reason: string; by: string; at: string
}
/** A closed Jalali month: nothing in it changes any more */
export interface MonthClose { month: string; from: string; to: string; by: string; at: string; unpaidMinutes: number }

// ---------- personal tasks ----------
// A separate, private task system: never part of `tasks`, plans, calendars, reports or the AuditLog.
export interface PersonalStatus { id: string; name: string; color: string; done: boolean }
/** One per person: their own status workflow; order of `statuses` = column order */
export interface PersonalBoard { userId: string; statuses: PersonalStatus[]; defaultStatusId: string }
export interface PersonalTask {
  id: string; ownerId: string; parentId: string | null
  title: string; description?: string
  statusId: string; priority: Priority
  start?: string; due?: string
  /** position among its siblings */
  order: number
  createdAt: string; updatedAt: string
  /** set when the task enters a done status, cleared when it leaves it */
  completedAt?: string
}
