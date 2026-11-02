// Sample data (نمونه) — teams, 40 users, 6 projects built from the shared MDR template, statuses, schedule and sync history.
import { addDays, fromJalali, isWeekend, diffDays, jalaliFa, tehranISO } from './jalali'
import { createPlanner, toAllocations, type Resource } from './planning'
import type {
  Allocation, Attachment, AuditEntry, ChatMessage, Comment, Holiday, InternalProject, Leave, Notification, PointConfig, PointEntry, Project, ReviewRound, Role, WorkLog, Status, SyncItem, SyncRun, Task, Team, User, AdminRequest, TimesheetDay, TimesheetConfig, MonthClose, PersonalTask, PersonalBoard,
} from './types'
import { seedPhase1 } from './seedPhase1'
import { seedWorkLogs } from './seedWorkLogs'
import { seedAdmin } from './seedAdmin'
import { seedPersonal } from './seedPersonal'
import { seedFinAdmin } from './seedFinAdmin'

/** Today in Tehran (Asia/Tehran), regardless of the viewer's own time zone. A live binding: long-running processes call refreshToday() so it rolls over at midnight. */
export let TODAY = tehranISO(new Date())
/** Re-reads the Tehran date; returns true when the day changed */
export function refreshToday(now: Date = new Date()) {
  const t = tehranISO(now)
  if (t === TODAY) return false
  TODAY = t
  return true
}
export const DEMO_PASSWORD = 'pargar1405'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(1405)
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))

export function addWorkdays(iso: string, n: number) {
  let d = iso
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  while (isWeekend(d)) d = addDays(d, 1)
  while (left > 0) {
    d = addDays(d, step)
    if (!isWeekend(d)) left--
  }
  return d
}

// ---------------- Teams & users ----------------
export const TEAMS: Team[] = [
  { id: 'ctl', name: 'کنترل پروژه', kind: 'fixed' },
  { id: 'int', name: 'طراحی داخلی', kind: 'fixed' },
  { id: 'prs', name: 'ارائه', kind: 'fixed' },
  { id: 'ren', name: 'رندر', kind: 'fixed' },
  { id: 'p1a', name: 'فاز ۱ – الف', kind: 'phase1' },
  { id: 'p1b', name: 'فاز ۱ – ب', kind: 'phase1' },
  { id: 'p1c', name: 'فاز ۱ – پ', kind: 'phase1' },
  { id: 'p1d', name: 'فاز ۱ – ت', kind: 'phase1' },
  { id: 'p2a', name: 'فاز ۲ – الف', kind: 'phase2' },
  { id: 'p2b', name: 'فاز ۲ – ب', kind: 'phase2' },
  { id: 'p2c', name: 'فاز ۲ – پ', kind: 'phase2' },
  { id: 'rvt', name: 'Revit', kind: 'revit' },
  { id: 'rd', name: 'R&D', kind: 'fixed' },
  { id: 'sup', name: 'نظارت و اجرا', kind: 'supervision' },
  { id: 'mgt', name: 'مدیریت', kind: 'management' },
]

const PEOPLE: Record<string, string[]> = {
  ctl: ['نگار رحیمی', 'امید کاظمی', 'مریم صالحی'],
  rd: ['مدیرعامل', 'کیان فرهادی', 'ترانه یزدانی'],
  int: ['سارا محمدی', 'آرش نیک‌نام', 'هستی کریمی', 'پویا عباسی'],
  prs: ['نازنین شریفی', 'رضا قاسمی', 'الهام جعفری'],
  ren: ['میلاد رستمی', 'بهاره نوری', 'سینا اکبری'],
  p1a: ['علی مرادی', 'شیما حسینی', 'نیما طاهری'],
  p1b: ['پریسا امیری', 'حامد صادقی', 'یاسمن بهرامی'],
  p1c: ['مهدی زارعی', 'لیلا فتحی', 'کاوه مختاری'],
  p1d: ['فرناز اسدی', 'بابک منصوری', 'رها عسگری'],
  p2a: ['محسن کرمی', 'ساناز رضایی', 'آیدین شکوهی'],
  p2b: ['مینا سلطانی', 'فرهاد نادری', 'آتنا پاکزاد'],
  p2c: ['سعید جلالی', 'نسترن وکیلی', 'پدرام خسروی'],
  rvt: ['امیر توکلی', 'دلارام ایزدی', 'شهاب ملکی'],
  sup: ['یوسف بابایی', 'نیلوفر قربانی', 'جواد حیدری'],
  mgt: ['بهرام سپهری', 'گلاره افشار', 'آرمان راد', 'مریم توانا', 'فرزانه صدری'],
}

const USERNAMES: Record<string, string[]> = {
  ctl: ['n.rahimi', 'o.kazemi', 'm.salehi'],
  rd: ['ceo', 'k.farhadi', 't.yazdani'],
  int: ['s.mohammadi', 'a.niknam', 'h.karimi', 'p.abbasi'],
  prs: ['n.sharifi', 'r.ghasemi', 'e.jafari'],
  ren: ['m.rostami', 'b.noori', 's.akbari'],
  p1a: ['a.moradi', 'sh.hosseini', 'n.taheri'],
  p1b: ['p.amiri', 'h.sadeghi', 'y.bahrami'],
  p1c: ['m.zarei', 'l.fathi', 'k.mokhtari'],
  p1d: ['f.asadi', 'b.mansouri', 'r.asgari'],
  p2a: ['m.karami', 's.rezaei', 'a.shokouhi'],
  p2b: ['m.soltani', 'f.naderi', 'a.pakzad'],
  p2c: ['s.jalali', 'n.vakili', 'p.khosravi'],
  rvt: ['a.tavakoli', 'd.izadi', 'sh.maleki'],
  sup: ['y.babaei', 'n.ghorbani', 'j.heidari'],
  mgt: ['b.sepehri', 'g.afshar', 'a.rad', 'm.tavana', 'f.sadri'],
}
const TEAM_TITLE: Record<string, string> = { ctl: 'کارشناس کنترل پروژه', rd: 'پژوهشگر', int: 'طراح داخلی', prs: 'طراح ارائه', ren: 'طراح رندر', rvt: 'مدل‌ساز BIM', sup: 'ناظر کارگاه' }
const MGT: Record<string, { role: Role; title: string; capacity: number }> = {
  'b.sepehri': { role: 'management', title: 'مدیر فنی', capacity: 8 },
  'g.afshar': { role: 'pm', title: 'مدیر پروژه', capacity: 8 },
  'a.rad': { role: 'pm', title: 'مدیر پروژه', capacity: 8 },
  'm.tavana': { role: 'office', title: 'مدیر اداری (مدیر داخلی)', capacity: 8 },
  'f.sadri': { role: 'finance', title: 'مدیر مالی', capacity: 8 },
}
/** Role migration of the earlier three roles: Admin → CEO, Control → Project Control, Member → Team Member (team heads → Team Leader) */
function roleOf(teamId: string, name: string, username: string, i: number): Role {
  if (MGT[username]) return MGT[username].role
  if (name === 'مدیرعامل') return 'ceo'
  if (teamId === 'ctl') return 'control'
  if (teamId === 'sup') return 'inspector'
  if (i === 0 && teamId !== 'rd') return 'lead'
  return 'member'
}

export const USERS: User[] = Object.entries(PEOPLE).flatMap(([teamId, names]) =>
  names.map((name, i) => ({
    id: `u-${teamId}-${i + 1}`,
    name,
    username: USERNAMES[teamId][i],
    teamId,
    role: roleOf(teamId, name, USERNAMES[teamId][i], i),
    capacity: MGT[USERNAMES[teamId][i]]?.capacity ?? 8,
    title: MGT[USERNAMES[teamId][i]]?.title ?? (name === 'مدیرعامل' ? 'مدیرعامل' : teamId === 'sup' && i === 0 ? 'سرپرست نظارت' : i === 0 && teamId !== 'rd' ? 'سرپرست تیم' : TEAM_TITLE[teamId] ?? 'معمار'),
    status: 'active',
    password: DEMO_PASSWORD,
    phone: `داخلی ${100 + Object.keys(PEOPLE).indexOf(teamId) * 10 + i}`,
    createdAt: '2026-09-23T06:30:00.000Z',
  } as User)),
).map((u) => (u.username === 'ceo' ? { ...u, teamId: 'mgt' } : u))

// ---------------- Projects ----------------
// mdrUrl is empty: the sample projects have no real MDR sheet; Project Control registers each project's own link (Google Sheet)
export const PROJECTS: Project[] = [
  { id: 'BBT', code: 'BBT', managerId: 'u-mgt-2', name: 'برج مسکونی بابلسر', type: 'مسکونی بلندمرتبه', phase1TeamId: 'p1a', phase2TeamId: 'p2a', mdrUrl: '', mdrTab: 'MDR' },
  { id: 'RNX', code: 'RNX', managerId: 'u-mgt-3', name: 'رونیکس ۲', type: 'اداری', phase1TeamId: 'p1b', phase2TeamId: 'p2b', mdrUrl: '', mdrTab: 'MDR' },
  { id: 'SHS', code: 'SHS', managerId: 'u-mgt-3', name: 'شهید شوشتری', type: 'اداری', phase1TeamId: 'p1c', phase2TeamId: 'p2c', mdrUrl: '', mdrTab: 'MDR' },
  { id: 'LVS', code: 'LVS', managerId: 'u-mgt-2', name: 'ویلای لواسان', type: 'ویلایی', phase1TeamId: 'p1d', phase2TeamId: 'p2a', mdrUrl: '', mdrTab: 'MDR' },
  { id: 'PSD', code: 'PSD', managerId: 'u-mgt-2', name: 'مجتمع تجاری پاسداران', type: 'تجاری', phase1TeamId: 'p1a', phase2TeamId: 'p2b', mdrUrl: '', mdrTab: 'MDR' },
  { id: 'KSH', code: 'KSH', managerId: 'u-mgt-3', name: 'هتل ساحلی کیش', type: 'هتل', phase1TeamId: 'p1c', phase2TeamId: 'p2c', mdrUrl: '', mdrTab: 'MDR' },
]

const FLOORS: Record<string, string[]> = {
  BBT: ['B1', 'GF', '01', 'TYP', '15', 'RF'],
  RNX: ['B2', 'B1', 'GF', '01', '02', '03'],
  SHS: ['B1', 'GF', '01', '02', 'RF'],
  LVS: ['B1', 'GF', '01', 'RF'],
  PSD: ['B2', 'B1', 'GF', '01', '02'],
  KSH: ['GF', '01', '02', '03', 'RF'],
}
export const FLOOR_LABEL: Record<string, string> = {
  B3: 'زیرزمین سوم', B2: 'زیرزمین دوم', B1: 'زیرزمین اول', GF: 'همکف', '01': 'طبقه اول', '02': 'طبقه دوم',
  '03': 'طبقه سوم', TYP: 'طبقات تیپ', '15': 'طبقه پانزدهم', RF: 'بام',
}

// ---------------- Statuses ----------------
export const OFFICE_STATUSES: Status[] = [
  { id: 'st-todo', name: 'شروع نشده', category: 'todo', progress: 0 },
  { id: 'st-design', name: 'در حال طراحی', category: 'doing', progress: 25 },
  { id: 'st-review', name: 'بررسی داخلی', category: 'doing', progress: 60 },
  { id: 'st-fix', name: 'اصلاحات', category: 'doing', progress: 75 },
  { id: 'st-client', name: 'ارسال برای کارفرما', category: 'doing', progress: 90 },
  { id: 'st-issued', name: 'صادر شد', category: 'done', progress: 100 },
]
const BIM_STATUSES: Status[] = [
  { id: 'st-todo', name: 'شروع نشده', category: 'todo', progress: 0 },
  { id: 'st-bim-model', name: 'مدل‌سازی', category: 'doing', progress: 35 },
  { id: 'st-bim-clash', name: 'هماهنگی (Clash)', category: 'doing', progress: 70 },
  { id: 'st-bim-deliver', name: 'تحویل مدل', category: 'done', progress: 100 },
]

// ---------------- MDR template ----------------
type DocSpec = { code: string; name: string; perFloor?: boolean; items?: { key: string; label: string }[]; est: [number, number]; noWeight?: boolean; weight: number }
type GroupSpec = { code: string; name: string; weight: number; docs: DocSpec[] }
type StageSpec = { code: string; name: string; weight: number; pkg: string; groups: GroupSpec[]; revit?: boolean }
type PhaseSpec = { no: 1 | 2; name: string; weight: number; stages: StageSpec[] }

const ELEV = [{ key: 'N', label: 'نمای شمالی' }, { key: 'S', label: 'نمای جنوبی' }, { key: 'E', label: 'نمای شرقی' }, { key: 'W', label: 'نمای غربی' }]

const TEMPLATE: PhaseSpec[] = [
  {
    no: 1, name: 'فاز ۱ — طراحی پایه', weight: 40, stages: [
      {
        code: '1', name: 'مطالعات و طرح مفهومی', weight: 35, pkg: 'PKG-01', groups: [
          {
            code: 'AR', name: 'معماری', weight: 100, docs: [
              { code: 'PL', name: 'پلان طبقات', perFloor: true, est: [14, 24], weight: 50 },
              { code: 'EL', name: 'نماها', items: ELEV, est: [10, 16], weight: 30 },
              { code: 'SC', name: 'مقاطع', items: [{ key: 'A', label: 'مقطع A-A' }, { key: 'B', label: 'مقطع B-B' }], est: [8, 12], weight: 20 },
            ],
          },
        ],
      },
      {
        code: '2', name: 'طرح پایه', weight: 65, pkg: 'PKG-02', groups: [
          {
            code: 'AR', name: 'معماری', weight: 70, docs: [
              { code: 'PL', name: 'پلان طبقات', perFloor: true, est: [18, 32], weight: 60 },
              { code: 'ES', name: 'نما و مقطع', items: [{ key: '1', label: 'نمای اصلی' }, { key: '2', label: 'نمای جانبی' }, { key: '3', label: 'مقطع طولی' }], est: [12, 20], weight: 40 },
            ],
          },
          {
            code: 'CO', name: 'هماهنگی', weight: 30, docs: [
              { code: 'CO', name: 'نقشه‌های هماهنگی', items: [{ key: 'ST', label: 'پلان هماهنگی سازه' }, { key: 'MP', label: 'پلان هماهنگی تأسیسات' }], est: [10, 16], weight: 100 },
            ],
          },
        ],
      },
    ],
  },
  {
    no: 2, name: 'فاز ۲ — نقشه‌های اجرایی', weight: 60, stages: [
      {
        code: '1', name: 'نقشه‌های اجرایی', weight: 70, pkg: 'PKG-03', groups: [
          {
            code: 'PL', name: 'پلان‌ها', weight: 55, docs: [
              { code: 'AP', name: 'پلان معماری اجرایی', perFloor: true, est: [24, 40], weight: 45 },
              { code: 'CL', name: 'پلان سقف کاذب', perFloor: true, est: [12, 20], weight: 25, noWeight: true },
              { code: 'FL', name: 'پلان کف‌سازی', perFloor: true, est: [8, 14], weight: 30 },
            ],
          },
          {
            code: 'DT', name: 'جزئیات', weight: 45, docs: [
              { code: 'DS', name: 'جزئیات پله و رمپ', items: [{ key: '1', label: 'جزئیات پله اصلی' }, { key: '2', label: 'جزئیات رمپ پارکینگ' }], est: [12, 20], weight: 40 },
              { code: 'DF', name: 'جزئیات نما', items: [{ key: '1', label: 'جزئیات اتصال نما' }, { key: '2', label: 'جزئیات پنجره' }, { key: '3', label: 'جزئیات جان‌پناه' }], est: [10, 18], weight: 60 },
            ],
          },
        ],
      },
      {
        code: '2', name: 'مدل BIM', weight: 30, pkg: 'PKG-04', revit: true, groups: [
          {
            code: 'RV', name: 'Revit', weight: 100, docs: [
              { code: 'BM', name: 'مدل معماری', perFloor: true, est: [20, 32], weight: 100 },
            ],
          },
        ],
      },
    ],
  },
]

// Workday offset from today where each stage starts; null = not planned yet (tasks wait in the Unassigned pool)
const STAGE_START: Record<string, Record<string, number | null>> = {
  BBT: { '1.1': -96, '1.2': -74, '2.1': -10, '2.2': -3 },
  RNX: { '1.1': -52, '1.2': -5, '2.1': null, '2.2': null },
  SHS: { '1.1': -120, '1.2': -96, '2.1': -12, '2.2': 2 },
  LVS: { '1.1': -3, '1.2': null, '2.1': null, '2.2': null },
  PSD: { '1.1': -70, '1.2': -4, '2.1': 6, '2.2': null },
  KSH: { '1.1': 1, '1.2': null, '2.1': null, '2.2': null },
}

const MANUAL: { team: string; name: string; est: number; offset: number }[] = [
  { team: 'ren', name: 'رندر نمای اصلی', est: 24, offset: -2 },
  { team: 'ren', name: 'رندر فضای لابی', est: 16, offset: 4 },
  { team: 'prs', name: 'شیت‌های ارائه طرح پایه', est: 20, offset: -1 },
  { team: 'int', name: 'طراحی لابی و ورودی', est: 40, offset: -4 },
  { team: 'int', name: 'مبلمان واحد نمونه', est: 24, offset: 6 },
  { team: 'ctl', name: 'به‌روزرسانی برنامه زمان‌بندی', est: 6, offset: 0 },
  { team: 'ctl', name: 'گزارش پیشرفت ماهانه', est: 4, offset: 5 },
  { team: 'int', name: 'طراحی داخلی واحد تیپ', est: 32, offset: 1 },
  { team: 'int', name: 'متریال‌بورد نما و فضاهای عمومی', est: 16, offset: 3 },
  { team: 'ren', name: 'انیمیشن معرفی پروژه', est: 30, offset: 2 },
  { team: 'prs', name: 'دفترچه‌ی ارائه به کارفرما', est: 18, offset: 2 },
  { team: 'ctl', name: 'برآورد نفر-ساعت فاز ۲', est: 8, offset: 1 },
]
const MANUAL_BY_PROJECT: Record<string, number[]> = {
  BBT: [0, 1, 3, 5, 6, 7], RNX: [2, 5, 6, 8, 11], SHS: [0, 4, 5, 10], LVS: [3, 5, 9], PSD: [1, 2, 6, 7], KSH: [5, 11, 8],
}

export interface Seed {
  teams: Team[]; users: User[]; projects: Project[]; tasks: Record<string, Task>
  statusSets: Record<string, Status[]>; allocations: Allocation[]; holidays: Holiday[]; leaves: Leave[]
  syncItems: SyncItem[]; syncRuns: SyncRun[]; audit: AuditEntry[]
  comments: Comment[]; messages: ChatMessage[]; notifications: Notification[]
  internalProjects: InternalProject[]; reviewRounds: ReviewRound[]; attachments: Attachment[]
  pointConfigs: PointConfig[]; pointEntries: PointEntry[]; workLogs: WorkLog[]
  adminRequests: AdminRequest[]; timesheets: Record<string, TimesheetDay>; timesheetConfigs: TimesheetConfig[]; monthCloses: MonthClose[]
  personalTasks: Record<string, PersonalTask>; personalBoards: Record<string, PersonalBoard>
}

export function buildSeed(): Seed {
  const tasks: Record<string, Task> = {}
  const order = { n: 0 }
  const add = (t: Omit<Task, 'order'>) => {
    tasks[t.id] = { ...t, order: order.n++ }
    return tasks[t.id]
  }

  // Holidays: fixed official ones of 1405/1406 + one clearly-marked sample inside the coming two weeks
  const holidays: Holiday[] = [
    { id: 'h-sample', date: addWorkdays(TODAY, 7), title: 'تعطیلی نمونه (برای آزمایش اثر تعطیلی)' },
    { id: 'h-1', date: fromJalali(1405, 11, 22), title: 'پیروزی انقلاب اسلامی' },
    { id: 'h-2', date: fromJalali(1405, 12, 29), title: 'ملی شدن صنعت نفت' },
    { id: 'h-3', date: fromJalali(1406, 1, 1), title: 'نوروز' },
    { id: 'h-4', date: fromJalali(1406, 1, 2), title: 'نوروز' },
    { id: 'h-5', date: fromJalali(1406, 1, 3), title: 'نوروز' },
    { id: 'h-6', date: fromJalali(1406, 1, 4), title: 'نوروز' },
    { id: 'h-7', date: fromJalali(1406, 1, 12), title: 'روز جمهوری اسلامی' },
    { id: 'h-8', date: fromJalali(1406, 1, 13), title: 'روز طبیعت' },
  ]
  const leaves: Leave[] = [
    { id: 'l-1', userId: 'u-p1a-2', date: addWorkdays(TODAY, 2), hours: 8, note: 'مرخصی روزانه' },
    { id: 'l-2', userId: 'u-ren-1', date: addWorkdays(TODAY, 5), hours: 8, note: 'مرخصی روزانه' },
    { id: 'l-3', userId: 'u-ren-1', date: addWorkdays(TODAY, 6), hours: 8, note: 'مرخصی روزانه' },
    { id: 'l-4', userId: 'u-p2a-1', date: addWorkdays(TODAY, 1), hours: 4, note: 'مرخصی ساعتی' },
    { id: 'l-5', userId: 'u-ctl-2', date: addWorkdays(TODAY, 3), hours: 8, note: 'مرخصی روزانه' },
  ]

  const statusSets: Record<string, Status[]> = {
    office: OFFICE_STATUSES.map((s) => ({ ...s })),
    RNX: [
      ...OFFICE_STATUSES.slice(0, 2).map((s) => ({ ...s })),
      { id: 'st-rnx-struct', name: 'در انتظار سازه', category: 'doing', progress: 40 },
      ...OFFICE_STATUSES.slice(2).map((s) => ({ ...s })),
    ],
  }

  const allocations: Allocation[] = []
  const planFor = (exclude?: string) => createPlanner({ users: USERS, holidays: holidays.map((h) => h.date), leaves, allocations }, exclude)

  const assignAndPlan = (t: Task, res: Resource, start: string, est: number) => {
    const planner = planFor(t.id)
    const { days, end } = planner.fill(res, start, est)
    const due = addWorkdays(end, between(0, 2))
    const teamId = res.kind === 'team' ? res.id : USERS.find((u) => u.id === res.id)!.teamId
    allocations.push(...toAllocations(t.id, res, teamId, days))
    t.start = start
    t.due = due
    t.estimation = est
    if (res.kind === 'user') t.assigneeUserId = res.id
    else t.assigneeTeamId = res.id
  }

  const statusBySchedule = (t: Task, bim: boolean) => {
    if (!t.start || !t.due) return 'st-todo'
    if (t.start > TODAY) return 'st-todo'
    if (t.due < TODAY) {
      if (bim) return 'st-bim-deliver'
      return diffDays(TODAY, t.due) < 5 && rand() < 0.5 ? 'st-client' : 'st-issued'
    }
    const span = Math.max(1, diffDays(t.due, t.start))
    const f = diffDays(TODAY, t.start) / span
    if (bim) return f < 0.5 ? 'st-bim-model' : 'st-bim-clash'
    if (f < 0.35) return 'st-design'
    if (f < 0.6) return 'st-review'
    if (f < 0.85) return 'st-fix'
    return 'st-client'
  }

  const rowCounter: Record<string, number> = {}

  for (const p of PROJECTS) {
    rowCounter[p.id] = 3 // row 1: project name/type, row 2: headers, data from row 3
    const floors = FLOORS[p.id]
    const members = (team: string) => USERS.filter((u) => u.teamId === team)
    let rr = between(0, 2)
    for (const ph of TEMPLATE) {
      const phId = `${p.code}|P${ph.no}`
      add({ id: phId, projectId: p.id, parentId: null, kind: 'phase', name: ph.name, weight: ph.weight, source: 'mdr', mdrRow: rowCounter[p.id]++ })
      for (const st of ph.stages) {
        const stId = `${phId}|S${st.code}`
        add({ id: stId, projectId: p.id, parentId: phId, kind: 'stage', name: st.name, weight: st.weight, source: 'mdr', mdrRow: rowCounter[p.id]++, pkg: st.pkg })
        const startOff = STAGE_START[p.id][`${ph.no}.${st.code}`]
        const team = st.revit ? 'rvt' : ph.no === 1 ? p.phase1TeamId : p.phase2TeamId
        const bim = !!st.revit && (p.id === 'BBT' || p.id === 'SHS')
        if (bim) statusSets[stId] = BIM_STATUSES.map((s) => ({ ...s }))
        let i = 0
        for (const g of st.groups) {
          const gId = `${stId}|${g.code}`
          add({ id: gId, projectId: p.id, parentId: stId, kind: 'group', name: g.name, weight: g.weight, source: 'mdr', mdrRow: rowCounter[p.id]++ })
          for (const ds of g.docs) {
            const dtId = `${gId}|${ds.code}`
            add({ id: dtId, projectId: p.id, parentId: gId, kind: 'doctype', name: ds.name, weight: ds.weight, source: 'mdr', mdrRow: rowCounter[p.id]++ })
            const items = ds.perFloor
              ? floors.filter((f) => !(ds.code === 'FL' && f === 'RF')).map((f) => ({ key: f, label: `${ds.name} — ${FLOOR_LABEL[f]}`, floor: f }))
              : (ds.items ?? []).map((it) => ({ key: it.key, label: it.label, floor: '—' }))
            for (const it of items) {
              const docNumber = `${p.code}-P${ph.no}${st.code}-${ds.code}-${it.key}`
              const t = add({
                id: docNumber, projectId: p.id, parentId: dtId, kind: 'document', name: it.label, docNumber,
                floor: it.floor, weight: ds.noWeight ? null : Math.round(100 / items.length), pkg: st.pkg,
                source: 'mdr', mdrRow: rowCounter[p.id]++, statusId: 'st-todo',
              })
              const est = between(ds.est[0], ds.est[1])
              if (startOff !== null && startOff !== undefined) {
                const leaveInPool = startOff > -10 && rand() < 0.14
                if (leaveInPool) {
                  t.estimation = rand() < 0.6 ? est : undefined
                } else {
                  const ms = members(team)
                  const res: Resource = rand() < 0.12 ? { kind: 'team', id: team } : { kind: 'user', id: ms[rr++ % ms.length].id }
                  const start = addWorkdays(TODAY, startOff + Math.floor(i * 0.9) + (rand() < 0.3 ? between(0, 2) : 0))
                  assignAndPlan(t, res, start, est)
                }
              } else if (rand() < 0.45) {
                t.estimation = est
              }
              t.statusId = statusBySchedule(t, bim)
              t.planIssue = t.due ? addWorkdays(t.due, between(-2, 3)) : startOff === null ? undefined : addWorkdays(TODAY, 30)
              i++
            }
          }
        }
      }
    }
    // Manual tasks (not in MDR) for the fixed teams
    for (const mi of MANUAL_BY_PROJECT[p.id]) {
      const m = MANUAL[mi]
      const t = add({ id: `M-${p.code}-${mi + 1}`, projectId: p.id, parentId: null, kind: 'manual', name: m.name, source: 'manual', statusId: 'st-todo' })
      const ms = members(m.team)
      assignAndPlan(t, { kind: 'user', id: ms[(mi + p.code.charCodeAt(0)) % ms.length].id }, addWorkdays(TODAY, m.offset + between(-1, 2)), m.est)
      t.statusId = statusBySchedule(t, false)
    }
  }

  // A manual sub-task under a document (sub-tasks are created by hand in this version)
  const parentDoc = tasks['BBT-P21-AP-GF']
  if (parentDoc) {
    const st = add({ id: 'M-BBT-S1', projectId: 'BBT', parentId: parentDoc.id, kind: 'manual', name: 'رندر داخلی لابی همکف', source: 'manual', statusId: 'st-todo' })
    assignAndPlan(st, { kind: 'user', id: 'u-ren-2' }, addWorkdays(TODAY, 1), 12)
    st.statusId = statusBySchedule(st, false)
  }

  // Equal weight split where children have no Weight in the MDR (reported in Sync Review)
  const kids: Record<string, Task[]> = {}
  for (const t of Object.values(tasks)) if (t.parentId) (kids[t.parentId] ??= []).push(t)
  for (const [pid, list] of Object.entries(kids)) {
    const mdrKids = list.filter((k) => k.source === 'mdr')
    if (mdrKids.length && mdrKids.every((k) => k.weight == null)) {
      const w = Math.round(((tasks[pid].weight ?? 100) / mdrKids.length) * 100) / 100
      mdrKids.forEach((k) => { k.weight = w; k.weightDerived = true })
    }
  }

  // A leave registered after planning — shows up as overload on the Workload view
  const lateLeave: Leave = { id: 'l-late', userId: 'u-p2a-2', date: addWorkdays(TODAY, 1), hours: 8, note: 'ثبت‌شده بعد از برنامه‌ریزی' }
  leaves.push(lateLeave)

  // ---------- Sync review queue ----------
  const now = Date.now()
  const ago = (min: number) => new Date(now - min * 60000).toISOString()
  const syncItems: SyncItem[] = []
  let sid = 1
  const bbtRow = rowCounter.BBT
  const newDt: Task = { id: 'BBT|P2|S1|PL|FU', projectId: 'BBT', parentId: 'BBT|P2|S1|PL', kind: 'doctype', name: 'پلان مبلمان', weight: 15, source: 'mdr', order: 9000, mdrRow: bbtRow }
  syncItems.push({ id: `si-${sid++}`, projectId: 'BBT', runId: 'run-6', kind: 'new', branch: ['فاز ۲ — نقشه‌های اجرایی', 'نقشه‌های اجرایی', 'پلان‌ها'], row: bbtRow, task: newDt, state: 'pending' })
  FLOORS.BBT.forEach((f, k) => {
    const dn = `BBT-P21-FU-${f}`
    syncItems.push({
      id: `si-${sid++}`, projectId: 'BBT', runId: 'run-6', kind: 'new', branch: ['فاز ۲ — نقشه‌های اجرایی', 'نقشه‌های اجرایی', 'پلان‌ها'], row: bbtRow + 1 + k,
      task: { id: dn, projectId: 'BBT', parentId: newDt.id, kind: 'document', name: `پلان مبلمان — ${FLOOR_LABEL[f]}`, docNumber: dn, floor: f, weight: Math.round((15 / 6) * 100) / 100, weightDerived: true, pkg: 'PKG-03', source: 'mdr', order: 9001 + k, mdrRow: bbtRow + 1 + k, statusId: 'st-todo' },
      warnings: k === 0 ? ['Weight سندهای این Doc Type در MDR خالی است؛ وزن والد (۱۵) به‌طور مساوی بین ۶ سند تقسیم شد.'] : undefined,
      state: 'pending',
    })
  })
  const chg = (taskId: string, changes: SyncItem['changes'], branch: string[], runId = 'run-6', projectId = 'BBT') => {
    const t = tasks[taskId]
    if (!t) return
    syncItems.push({ id: `si-${sid++}`, projectId, runId, kind: 'changed', branch, row: t.mdrRow ?? 0, taskId, changes, state: 'pending' })
  }
  chg('BBT-P21-AP-15', [{ field: 'name', from: tasks['BBT-P21-AP-15']?.name ?? '', to: 'پلان معماری اجرایی — طبقه پانزدهم (پنت‌هاوس)' }], ['فاز ۲ — نقشه‌های اجرایی', 'نقشه‌های اجرایی', 'پلان‌ها'])
  chg('BBT|P2|S1|PL|CL', [{ field: 'weight', from: '25', to: '30' }], ['فاز ۲ — نقشه‌های اجرایی', 'نقشه‌های اجرایی', 'پلان‌ها'])
  chg('BBT-P21-FL-TYP', [{ field: 'floor', from: 'TYP', to: '02–14' }], ['فاز ۲ — نقشه‌های اجرایی', 'نقشه‌های اجرایی', 'پلان‌ها'])
  chg('BBT-P21-DF-3', [{ field: 'parent', from: 'جزئیات نما', to: 'جزئیات پله و رمپ', toParentId: 'BBT|P2|S1|DT|DS' }], ['فاز ۲ — نقشه‌های اجرایی', 'نقشه‌های اجرایی', 'جزئیات'])
  if (tasks['BBT-P11-SC-B']) syncItems.push({ id: `si-${sid++}`, projectId: 'BBT', runId: 'run-6', kind: 'removed', branch: ['فاز ۱ — طراحی پایه', 'مطالعات و طرح مفهومی', 'معماری'], row: tasks['BBT-P11-SC-B'].mdrRow ?? 0, taskId: 'BBT-P11-SC-B', state: 'pending' })
  const rnxRow = rowCounter.RNX
  ;[['ST2', 'پلان هماهنگی سازه — پارکینگ'], ['FA', 'پلان هماهنگی نما'], ['LS', 'پلان هماهنگی محوطه']].forEach(([k, label], j) => {
    const dn = `RNX-P12-CO-${k}`
    syncItems.push({
      id: `si-${sid++}`, projectId: 'RNX', runId: 'run-4', kind: 'new', branch: ['فاز ۱ — طراحی پایه', 'طرح پایه', 'هماهنگی'], row: rnxRow + j,
      task: { id: dn, projectId: 'RNX', parentId: 'RNX|P1|S2|CO|CO', kind: 'document', name: label, docNumber: dn, floor: '—', weight: 25, pkg: 'PKG-02', source: 'mdr', order: 9100 + j, mdrRow: rnxRow + j, statusId: 'st-todo' },
      state: 'pending',
    })
  })
  chg('RNX-P12-PL-GF', [{ field: 'weight', from: String(tasks['RNX-P12-PL-GF']?.weight ?? ''), to: '20' }, { field: 'package', from: 'PKG-02', to: 'PKG-02B' }], ['فاز ۱ — طراحی پایه', 'طرح پایه', 'معماری'], 'run-4', 'RNX')

  const syncRuns: SyncRun[] = [
    {
      id: 'run-6', projectId: 'BBT', trigger: 'scheduled', at: ago(38), durationSec: 7, state: 'success', rowsRead: rowCounter.BBT - 3 + 7, diffs: { new: 7, changed: 4, removed: 1 }, cellsWritten: 0,
      log: [
        { level: 'info', text: 'batchGet: ۱ درخواست — سطر ۱ (پروژه) و سطر ۲ (هدرها) خوانده شد؛ ستون‌ها با نام هدر پیدا شدند.' },
        { level: 'info', text: '۷ سطر جدید (۱ Doc Type و ۶ Document) به صف Sync Review رفت.' },
        { level: 'warn', text: 'Weight سندهای «پلان مبلمان» خالی است؛ تقسیم مساوی وزن والد انجام و گزارش شد.' },
        { level: 'info', text: '۴ تغییر (نام، وزن، طبقه، جابه‌جایی) و ۱ سطر حذف‌شده در انتظار تأیید است.' },
      ],
    },
    {
      id: 'run-5', projectId: 'BBT', trigger: 'writeback', at: ago(95), durationSec: 3, state: 'success', rowsRead: 4, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 12,
      log: [
        { level: 'info', text: '۴ سند: سطر هدف پیش از نوشتن با Document Number دوباره خوانده شد.' },
        { level: 'warn', text: 'BBT-P21-AP-01 از ردیف ۴۲ به ۴۴ جابه‌جا شده بود؛ ردیف ۴۴ به‌روز شد.' },
        { level: 'info', text: 'batchUpdate: فقط ستون‌های Last Status Date / Last Status / Progress (internal) — ۱۲ سلول.' },
      ],
    },
    {
      id: 'run-4', projectId: 'RNX', trigger: 'scheduled', at: ago(160), durationSec: 9, state: 'partial', rowsRead: rowCounter.RNX - 3 + 3, diffs: { new: 3, changed: 1, removed: 0 }, cellsWritten: 0,
      log: [
        { level: 'info', text: '۳ سطر جدید و ۱ تغییر به صف Sync Review رفت.' },
        { level: 'error', text: `سطر ${rowCounter.RNX + 4}: Document Number تکراری (RNX-P12-PL-01) — سطر نادیده گرفته شد. MDR را اصلاح کنید.` },
      ],
    },
    {
      id: 'run-3', projectId: 'SHS', trigger: 'writeback', at: ago(230), durationSec: 41, state: 'success', rowsRead: 2, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 6,
      log: [
        { level: 'warn', text: 'HTTP 429 (محدودیت نرخ Google Sheets API) — Retry ۱ از ۵ بعد از ۱۵ ثانیه.' },
        { level: 'warn', text: 'HTTP 429 — Retry ۲ از ۵ بعد از ۳۰ ثانیه.' },
        { level: 'info', text: 'تلاش سوم موفق بود؛ ۶ سلول نوشته شد.' },
      ],
    },
    {
      id: 'run-2', projectId: 'all', trigger: 'manual', at: ago(60 * 26), durationSec: 52, state: 'success', rowsRead: 336, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0,
      log: [{ level: 'info', text: 'Sync دستی همه‌ی پروژه‌ها توسط نگار رحیمی؛ تغییری پیدا نشد. اجرای دوباره هیچ تسک تکراری نساخت.' }],
    },
    {
      id: 'run-1', projectId: 'KSH', trigger: 'scheduled', at: ago(60 * 27), durationSec: 2, state: 'failed', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0,
      log: [
        { level: 'error', text: 'HTTP 403: Service Account به این Sheet دسترسی ندارد. Sheet را با ایمیل Service Account به اشتراک بگذارید.' },
        { level: 'info', text: 'بعد از رفع دسترسی، اجرای بعدی زمان‌بندی‌شده موفق بود.' },
      ],
    },
  ]

  const audit: AuditEntry[] = [
    { id: 'a-1', at: ago(15), userId: 'u-p2a-1', taskId: 'BBT-P21-AP-01', kind: 'status', text: 'Status: «بررسی داخلی» ← «اصلاحات»' },
    { id: 'a-2', at: ago(72), userId: 'u-ctl-1', taskId: 'BBT-P21-CL-GF', kind: 'allocation', text: 'تخصیص به تیم فاز ۲ – الف؛ Estimation ۱۶ نفر-ساعت' },
    { id: 'a-3', at: ago(140), userId: 'u-ctl-1', taskId: 'RNX-P12-PL-01', kind: 'dates', text: 'Due Date با «پیشنهاد Due Date» تعیین شد' },
    { id: 'a-4', at: ago(60 * 20), userId: 'u-ctl-2', kind: 'sync', text: 'تأیید دسته‌ای ۱۲ سطر جدید SHS (شاخه‌ی فاز ۲ › مدل BIM)' },
    { id: 'a-5', at: ago(60 * 22), userId: 'u-ren-1', taskId: 'M-BBT-1', kind: 'status', text: 'Status: «شروع نشده» ← «در حال طراحی»' },
  ]

  // ---------- accounts waiting for approval ----------
  const users: User[] = [
    ...USERS,
    { id: 'u-req-1', name: 'رامین هاشمی', username: 'r.hashemi', teamId: '', role: 'member', capacity: 8, status: 'pending', password: DEMO_PASSWORD, createdAt: ago(55) },
    { id: 'u-req-2', name: 'سحر نوروزی', username: 's.nowruzi', teamId: '', role: 'member', capacity: 8, status: 'pending', password: DEMO_PASSWORD, createdAt: ago(60 * 5) },
  ]

  // ---------- comments, chat and notifications ----------
  const comments: Comment[] = [
    { id: 'c-1', taskId: 'BBT-P21-AP-01', userId: 'u-p2a-1', at: ago(60 * 3), text: 'نسخه‌ی اصلاح‌شده‌ی پلان طبقه اول در پوشه‌ی پروژه است. @n.rahimi لطفاً برای بررسی داخلی در برنامه بگذارید.', mentions: ['u-ctl-1'] },
    { id: 'c-2', taskId: 'BBT-P21-AP-01', userId: 'u-ctl-1', at: ago(60 * 2), text: '@m.karami ممنون. بررسی داخلی را برای فردا گذاشتم. @a.tavakoli مدل Revit همین طبقه را هم هماهنگ کن.', mentions: ['u-p2a-1', 'u-rvt-1'] },
    { id: 'c-3', taskId: 'RNX-P12-PL-01', userId: 'u-p1b-2', at: ago(60 * 7), text: 'ابعاد ستون‌های پارکینگ هنوز از سازه نرسیده. @o.kazemi اگر تا شنبه نرسید، Due را جابه‌جا کنیم؟', mentions: ['u-ctl-2'] },
    { id: 'c-4', taskId: 'M-BBT-1', userId: 'u-ren-1', at: ago(60 * 26), text: '@n.sharifi رندر نهایی نمای اصلی تا آخر هفته برای شیت ارائه آماده است.', mentions: ['u-prs-1'] },
  ]
  const messages: ChatMessage[] = [
    { id: 'm-1', channelId: 'announce', userId: 'u-rd-1', at: ago(60 * 30), text: '«تراز»، سامانه‌ی کار و ظرفیت پرگار، به‌صورت آزمایشی راه افتاد. لطفاً پروفایل خود را کامل کنید و کارهای این هفته را در «خانه» ببینید.', mentions: [] },
    { id: 'm-2', channelId: 'announce', userId: 'u-ctl-1', at: ago(60 * 20), text: 'تعطیلی‌های رسمی و مرخصی‌ها را فقط از «مدیریت › تعطیلات و مرخصی» ثبت کنید تا برنامه‌ریزی‌ها با ظرفیت واقعی حساب شود.', mentions: [] },
    { id: 'm-3', channelId: 'general', userId: 'u-rd-2', at: ago(60 * 9), text: 'فایل استاندارد جدید Layerهای Revit در پوشه‌ی مشترک دفتر است. @a.tavakoli @d.izadi لطفاً یک بار مرور کنید.', mentions: ['u-rvt-1', 'u-rvt-2'] },
    { id: 'm-4', channelId: 'general', userId: 'u-int-1', at: ago(60 * 4), text: '@b.noori نمونه‌ی متریال لابی را فردا صبح می‌آورم دفتر.', mentions: ['u-ren-2'] },
    { id: 'm-5', channelId: 'general', userId: 'u-ren-2', at: ago(60 * 3.5), text: 'عالی، من هم تا ظهر هستم.', mentions: [] },
    { id: 'm-6', channelId: 'project:BBT', userId: null, system: true, at: ago(38), text: 'Sync زمان‌بندی‌شده: ۷ سطر جدید، ۴ تغییر و ۱ حذف از MDR در صف Sync Review است.', mentions: [], link: { type: 'page', page: 'review' } },
    { id: 'm-7', channelId: 'project:BBT', userId: 'u-p2a-1', at: ago(60 * 5), text: 'پلان‌های اجرایی B1 و همکف برای بررسی آماده است #BBT-P21-AP-GF #BBT-P21-AP-B1', mentions: [] },
    { id: 'm-8', channelId: 'project:BBT', userId: 'u-ctl-1', at: ago(60 * 4.5), text: '@m.karami @s.rezaei برای هفته‌ی بعد Estimation «پلان مبلمان» را بفرستید تا بعد از تأیید Sync تخصیص بدهم.', mentions: ['u-p2a-1', 'u-p2a-2'] },
    { id: 'm-9', channelId: 'project:RNX', userId: 'u-p1b-2', at: ago(60 * 6), text: '#RNX-P12-PL-01 منتظر اطلاعات سازه است؛ Status را روی «در انتظار سازه» گذاشتیم.', mentions: [] },
    { id: 'm-10', channelId: 'project:SHS', userId: null, system: true, at: ago(225), text: 'Write-back به MDR بعد از دو Retry (HTTP 429) انجام شد؛ ۶ سلول نوشته شد.', mentions: [], link: { type: 'page', page: 'runs' } },
  ]
  const notifications: Notification[] = []
  let nid = 1
  const push = (userId: string, n: Omit<Notification, 'id' | 'userId'>) => notifications.push({ id: `n-s${nid++}`, userId, ...n })
  for (const u of USERS) {
    push(u.id, { at: ago(60 * 30), kind: 'announce', title: 'اطلاعیه‌ی جدید از مدیرعامل', body: '«تراز»، سامانه‌ی کار و ظرفیت پرگار، به‌صورت آزمایشی راه افتاد…', actorId: 'u-rd-1', link: { type: 'chat', channelId: 'announce' }, read: u.id === 'u-rd-1' })
    const mine = Object.values(tasks).filter((t) => t.assigneeUserId === u.id && t.start && t.start >= addDays(TODAY, -4) && t.start <= addDays(TODAY, 6)).slice(0, 3)
    mine.forEach((t, k) => push(u.id, { at: ago(60 * (8 + k * 9)), kind: 'assign', title: `تسک «${t.name}» به شما تخصیص داده شد`, body: t.docNumber, actorId: 'u-ctl-1', link: { type: 'task', id: t.id }, read: k > 0 }))
    const due = Object.values(tasks).filter((t) => t.assigneeUserId === u.id && t.due && t.due >= TODAY && t.due <= addDays(TODAY, 2) && t.statusId !== 'st-issued').slice(0, 2)
    due.forEach((t) => push(u.id, { at: ago(60 * 2), kind: 'due', title: `موعد «${t.name}» نزدیک است`, body: `Due Date: ${jalaliFa(t.due!)}`, link: { type: 'task', id: t.id }, read: false }))
  }
  for (const c of [...comments]) for (const m of c.mentions) push(m, { at: c.at, kind: 'mention', title: `${USERS.find((x) => x.id === c.userId)?.name} شما را در کامنت تگ کرد`, body: c.text, actorId: c.userId, link: { type: 'task', id: c.taskId }, read: false })
  for (const msg of messages) for (const m of msg.mentions) push(m, { at: msg.at, kind: 'mention', title: `${USERS.find((x) => x.id === msg.userId)?.name} شما را در چت تگ کرد`, body: msg.text, actorId: msg.userId ?? undefined, link: { type: 'chat', channelId: msg.channelId }, read: false })
  for (const u of USERS.filter((x) => x.role === 'control' || x.role === 'ceo')) {
    push(u.id, { at: ago(38), kind: 'sync', title: '۱۲ ردیف برج مسکونی بابلسر در صف Sync Review', body: '۷ جدید، ۴ تغییر، ۱ حذف از MDR', link: { type: 'page', page: 'review' }, read: false })
    push(u.id, { at: ago(160), kind: 'sync', title: 'Sync رونیکس ۲ با خطای سطری تمام شد', body: 'Document Number تکراری در MDR', link: { type: 'page', page: 'runs' }, read: true })
    push(u.id, { at: ago(55), kind: 'account', title: 'درخواست عضویت: رامین هاشمی (r.hashemi)', body: 'برای فعال شدن حساب، تیم و نقش را تعیین و تأیید کنید.', link: { type: 'page', page: 'admin' }, read: false })
    push(u.id, { at: ago(60 * 5), kind: 'account', title: 'درخواست عضویت: سحر نوروزی (s.nowruzi)', link: { type: 'page', page: 'admin' }, read: true })
  }
  notifications.sort((a, b) => b.at.localeCompare(a.at))

  const phase1 = seedPhase1(tasks, ago, { users, statusSets, today: TODAY, holidays: holidays.map((h) => h.date) })
  const work = seedWorkLogs(tasks, users, holidays.map((h) => h.date), TODAY)
  for (const n of phase1.notifications) notifications.push({ id: `n-s${nid++}`, ...n })
  const adm = seedAdmin({ users, tasks, workLogs: work.logs, holidays: holidays.map((h) => h.date), leaves, today: TODAY })
  for (const n of adm.notifications) notifications.push({ id: `n-s${nid++}`, ...n })
  leaves.push(...adm.leaves)
  const fin = seedFinAdmin(users, TODAY, ago)
  Object.assign(tasks, fin.tasks)
  for (const n of fin.notifications) notifications.push({ id: `n-s${nid++}`, ...n })
  notifications.sort((a, b) => b.at.localeCompare(a.at))
  return {
    teams: TEAMS, users, projects: PROJECTS.map((p) => ({ ...p, lastSync: ago(38 + PROJECTS.indexOf(p) * 11) })), tasks, statusSets, allocations, holidays, leaves, syncItems, syncRuns,
    audit: [...phase1.audit, ...work.audit, ...adm.audit, ...fin.audit, ...audit].sort((a, b) => b.at.localeCompare(a.at)), comments: [...comments, ...phase1.comments, ...fin.comments], messages: [...messages, ...phase1.messages].sort((a, b) => a.at.localeCompare(b.at)), notifications,
    internalProjects: phase1.internalProjects, reviewRounds: [...phase1.reviewRounds, ...fin.reviewRounds], attachments: phase1.attachments,
    pointConfigs: phase1.pointConfigs, pointEntries: phase1.pointEntries, workLogs: work.logs,
    adminRequests: adm.adminRequests, timesheets: adm.timesheets, timesheetConfigs: adm.timesheetConfigs, monthCloses: adm.monthCloses,
    ...seedPersonal(users, TODAY),
  }
}
