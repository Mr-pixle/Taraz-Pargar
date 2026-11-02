// Work Log acceptance tests: who may log, see, edit and delete; totals, thresholds, history and report aggregation.
import { initialState, reducer, isWorkItem, statusesFor, statusOf, type State } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { addDays } from '../src/lib/jalali'
import { activeLogs, aggregate, timeState, timeTracking } from '../src/lib/worklog'
import { canSeeAllLogs } from '../src/lib/policy'
import type { Task } from '../src/lib/types'

let pass = 0, fail = 0
const out: string[] = []
const ok = (c: unknown, name: string) => { if (c) { pass++; out.push(`  ✓ ${name}`) } else { fail++; out.push(`  ✗ ${name}`) } }
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const data = (s: State) => JSON.stringify({ ...s, audit: null, denial: null })
const refused = (s: State, u: string, a: A, name: string) => { const b = as(s, u), r = reducer(b, a); ok(r.denial && data(r) === data(b), `رد شد بدون تغییر داده: ${name}`); return r }
const allowed = (s: State, u: string, a: A, name: string) => { const r = reducer(as(s, u), a); ok(!r.denial, `مجاز: ${name}${r.denial ? ` — ${r.denial.text}` : ''}`); return r }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

const S0 = initialState()
const users = S0.users
const tasks = Object.values(S0.tasks)
const control = 'u-ctl-1', ceo = 'u-rd-1', mgmt = 'u-mgt-1'
const open = (t: Task) => statusOf(S0, t)?.category !== 'done'

out.push('داده و مهاجرت')
ok(tasks.filter((t) => t.estimation).every((t) => t.baselineEstimation === t.estimation), 'Original Estimation همه‌ی تسک‌های موجود = Estimation فعلی')
ok(S0.workLogs.length > 100 && S0.workLogs.every((l) => l.projectId && l.teamId && l.userId && l.minutes > 0), `${S0.workLogs.length} رکورد نمونه با پروژه و تیمِ لحظه‌ی ثبت`)
ok(S0.workLogs.some((l) => l.deletedAt) && S0.workLogs.some((l) => l.revisions?.length), 'نمونه‌ی رکورد حذف‌شده (نگه‌داری‌شده) و ویرایش‌شده')
const perUserDay = new Map<string, number>()
for (const l of activeLogs(S0.workLogs)) perUserDay.set(`${l.userId}|${l.workDate}`, (perUserDay.get(`${l.userId}|${l.workDate}`) ?? 0) + l.minutes)
ok([...perUserDay.values()].every((m) => m <= 24 * 60), 'هیچ نفری در یک روز بیش از ۲۴ ساعت ثبت ندارد')

out.push('آستانه‌ها')
ok(timeState(79.9) === 'normal' && timeState(80) === 'near' && timeState(100) === 'near' && timeState(100.1) === 'over' && timeState(null) === 'none', 'زیر ۸۰ عادی، ۸۰ تا ۱۰۰ نزدیک سقف، بالای ۱۰۰ عبور')

out.push('ثبت')
const t = tasks.find((x) => isWorkItem(x) && open(x) && x.assigneeUserId && x.estimation && !x.reviewerId && !(x.participantIds ?? []).length && !S0.workLogs.some((l) => l.taskId === x.id))!
const owner = t.assigneeUserId!
const stranger = users.find((u) => u.status === 'active' && u.role === 'member' && u.teamId !== users.find((x) => x.id === owner)!.teamId)!.id
const log = (minutes: number, workDate = TODAY, description = 'ترسیم پلان') => ({ type: 'logWork' as const, log: { taskId: t.id, minutes, workDate, description } })
refused(S0, stranger, log(60), 'کسی که در تسک نقشی ندارد')
refused(S0, owner, log(60, addDays(TODAY, 1)), 'تاریخ آینده')
refused(S0, owner, log(0), 'مدت صفر')
refused(S0, owner, log(60, TODAY, ' '), 'بدون توضیح')
let s = allowed(S0, owner, log(150), 'مسئول ۲:۳۰ ثبت می‌کند')
const first = s.workLogs[s.workLogs.length - 1]
ok(first.userId === owner && first.taskId === t.id && first.minutes === 150 && first.workDate === TODAY && first.createdAt && first.projectId === t.projectId, 'رکورد به کاربر ثبت‌کننده و تسک متصل است و زمان ثبت دارد')
ok(s.audit.some((a) => a.kind === 'worklog' && a.taskId === t.id), 'در AuditLog آمد')
ok(s.tasks[t.id].actualStart === TODAY || (t.actualStart != null && t.actualStart <= TODAY), 'اولین Work Log در صورت نبودن، Actual Start را تعیین کرد')
s = allowed(s, owner, log(90, addDays(TODAY, -1)), 'رکورد دوم برای همان تسک')
// a participant from another team logs too
s = allowed(s, control, { type: 'updateTask', taskId: t.id, patch: { participantIds: [stranger] } }, 'افزودن مشارکت‌کننده')
s = allowed(s, stranger, log(60), 'مشارکت‌کننده زمان خودش را ثبت می‌کند')
let tt = timeTracking(s.tasks[t.id], s.workLogs)
ok(near(tt.logged, 5) && tt.byUser.length === 2 && tt.byUser.find((b) => b.userId === owner)!.minutes === 240, 'جمع چند کاربر درست تجمیع شد (۲:۳۰ + ۱:۳۰ + ۱:۰۰ = ۵ ساعت)')
ok(near(tt.progress!, (5 / tt.original!) * 100) && near(tt.remaining!, Math.max(0, tt.original! - 5)) && near(tt.variance!, 5 - tt.original!), 'Time Progress، Remaining و اختلاف از روی فرمول')
refused(s, owner, { type: 'logWork', log: { taskId: t.id, minutes: 22 * 60, workDate: TODAY, description: 'x y' } }, 'جمع یک روز بیش از ۲۴ ساعت')

out.push('ویرایش و حذف')
const ownLog = s.workLogs.find((l) => l.taskId === t.id && l.userId === owner && l.minutes === 150)!
const otherLog = s.workLogs.find((l) => l.taskId === t.id && l.userId === stranger)!
refused(s, owner, { type: 'editWorkLog', id: otherLog.id, patch: { minutes: 30, workDate: TODAY, description: 'x y' } }, 'ویرایش رکورد دیگری توسط عضو')
refused(s, owner, { type: 'deleteWorkLog', id: otherLog.id }, 'حذف رکورد دیگری توسط عضو')
s = allowed(s, owner, { type: 'editWorkLog', id: ownLog.id, patch: { minutes: 120, workDate: TODAY, description: 'ترسیم پلان و اندازه‌گذاری' } }, 'ویرایش رکورد خود')
const e1 = s.workLogs.find((l) => l.id === ownLog.id)!
ok(e1.minutes === 120 && e1.revisions?.[0].minutes === 150, 'مقدار قبلی در تاریخچه‌ی رکورد ماند')
refused(s, control, { type: 'editWorkLog', id: otherLog.id, patch: { minutes: 30, workDate: TODAY, description: 'x y' } }, 'کنترل پروژه بدون دلیل')
s = allowed(s, control, { type: 'editWorkLog', id: otherLog.id, patch: { minutes: 30, workDate: TODAY, description: 'هماهنگی' }, reason: 'ساعت اشتباه وارد شده بود' }, 'کنترل پروژه با دلیل')
ok(s.notifications.some((n) => n.userId === stranger && n.kind === 'worklog'), 'صاحب رکورد از ویرایش باخبر شد')
s = allowed(s, owner, { type: 'deleteWorkLog', id: ownLog.id }, 'حذف رکورد خود')
tt = timeTracking(s.tasks[t.id], s.workLogs)
ok(near(tt.logged, 2) && s.workLogs.find((l) => l.id === ownLog.id)?.deletedAt, 'حذف از جمع کم کرد (۱:۳۰ + ۰:۳۰) و رکورد نگه داشته شد')
refused(s, owner, { type: 'editWorkLog', id: ownLog.id, patch: { minutes: 30, workDate: TODAY, description: 'x y' } }, 'ویرایش رکورد حذف‌شده')

out.push('بعد از بسته شدن تسک')
const doneId = statusesFor(S0, t).find((x) => x.category === 'done')!.id
s = allowed(s, control, { type: 'setStatus', taskId: t.id, statusId: doneId }, 'بستن تسک')
const live = s.workLogs.find((l) => l.taskId === t.id && l.userId === owner && !l.deletedAt)!
refused(s, owner, { type: 'editWorkLog', id: live.id, patch: { minutes: 30, workDate: live.workDate, description: 'x y' } }, 'عضو رکورد خودش را بعد از بسته شدن تسک')
allowed(s, ceo, { type: 'deleteWorkLog', id: live.id, reason: 'تکراری' }, 'مدیرعامل با دلیل')
allowed(s, owner, log(30), 'ثبت زمان فراموش‌شده بعد از بسته شدن (کار واقعاً انجام شده)')

out.push('دیدن سوابق دیگران')
const u = (id: string) => users.find((x) => x.id === id)
const proj = S0.projects.find((p) => p.id === t.projectId)!
const lead = users.find((x) => x.role === 'lead' && x.teamId === u(owner)!.teamId)
ok(canSeeAllLogs(S0, u(control), t) && canSeeAllLogs(S0, u(mgmt), t) && canSeeAllLogs(S0, u(proj.managerId!), t), 'کنترل پروژه، مدیریت و مدیر همان پروژه سوابق همه را می‌بینند')
ok(!lead || canSeeAllLogs(S0, lead, t), 'سرپرست تیم مسئول سوابق همه را می‌بیند')
ok(!canSeeAllLogs(S0, u(stranger), t) && !canSeeAllLogs(S0, u(owner)?.role === 'member' ? u(owner) : u(stranger), t), 'عضو تیم فقط سوابق خودش را می‌بیند')
const otherPm = users.find((x) => x.role === 'pm' && x.id !== proj.managerId)!
ok(!canSeeAllLogs(S0, otherPm, t), 'مدیر پروژه‌ی دیگر سوابق همه را نمی‌بیند')

out.push('Original Estimation')
const t2 = tasks.find((x) => isWorkItem(x) && open(x) && x.estimation && x.start && x.due && x.assigneeUserId)!
s = allowed(S0, control, { type: 'savePlan', taskId: t2.id, assignee: { kind: 'user', id: t2.assigneeUserId! }, estimation: t2.estimation! + 10, start: t2.start, due: t2.due, allocations: [] }, 'تغییر Estimation')
const tt2 = timeTracking(s.tasks[t2.id], s.workLogs)
ok(tt2.original === t2.estimation && tt2.current === t2.estimation! + 10, 'Original Estimation ثابت ماند و Estimation فعلی جدا نمایش داده می‌شود')
refused(S0, control, { type: 'updateTask', taskId: t2.id, patch: { baselineEstimation: 1 } }, 'دستکاری مستقیم Original Estimation')

out.push('گزارش‌های آینده')
const byProject = aggregate(S0.workLogs, 'project'), byTeam = aggregate(S0.workLogs, 'team'), byUser = aggregate(S0.workLogs, 'user')
const total = activeLogs(S0.workLogs).reduce((x, l) => x + l.minutes, 0)
const sum = (m: Map<string, number>) => [...m.values()].reduce((x, v) => x + v, 0)
ok(sum(byProject) === total && sum(byTeam) === total && sum(byUser) === total, 'جمع به تفکیک پروژه، تیم و نفر برابر جمع کل (بدون رکوردهای حذف‌شده)')
const week = aggregate(S0.workLogs, 'user', { from: addDays(TODAY, -7), to: TODAY })
ok(sum(week) <= total, 'فیلتر بازه‌ی زمانی')

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
