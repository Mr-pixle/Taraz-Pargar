// Administrative module acceptance tests: request workflow, timesheet rules, overtime settlement, month close, access.
import { initialState, reducer, type State } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { addDays, isWeekend } from '../src/lib/jalali'
import {
  approverStats, computeDay, configFor, dayKey, DEFAULT_TIMESHEET_CONFIG, isMonthClosed, jMonthKey, monthRange, overtimeIndex, overtimeSummary, prevMonthKey, toCSV,
} from '../src/lib/admin'
import { canSeeRequest, canSeeTimesheetOf } from '../src/lib/policy'
import type { AdminRequest, TimesheetConfig } from '../src/lib/types'

let pass = 0, fail = 0
const out: string[] = []
const ok = (c: unknown, name: string) => { if (c) { pass++; out.push(`  ✓ ${name}`) } else { fail++; out.push(`  ✗ ${name}`) } }
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const data = (s: State) => JSON.stringify({ ...s, audit: null, denial: null })
const refused = (s: State, u: string, a: A, name: string) => { const b = as(s, u), r = reducer(b, a); ok(r.denial && data(r) === data(b), `رد شد بدون تغییر داده: ${name}${r.denial ? '' : ' (پذیرفته شد!)'}`); return r }
const allowed = (s: State, u: string, a: A, name: string) => { const r = reducer(as(s, u), a); ok(!r.denial, `مجاز: ${name}${r.denial ? ` — ${r.denial.text}` : ''}`); return r }
const last = (s: State) => s.adminRequests[s.adminRequests.length - 1]

const S0 = initialState()
const byName = (u: string) => S0.users.find((x) => x.username === u)!.id
const office = byName('m.tavana'), ceo = byName('ceo'), control = byName('n.rahimi'), member = byName('s.rezaei'), lead = byName('m.karami'), pm = byName('g.afshar')
const other = byName('h.sadeghi')
const hol = new Set(S0.holidays.map((h) => h.date))
const cfg = configFor(S0.timesheetConfigs, TODAY)
const ctx = (extra: Partial<Parameters<typeof computeDay>[1]> = {}) => ({ cfg, holidays: new Set<string>(), leaveMinutes: 0, requests: [] as AdminRequest[], closed: false, ...extra })
const SAT = (() => { let d = '2026-10-24'; while (isWeekend(d)) d = addDays(d, 1); return d })() // a Saturday
const THU = addDays(SAT, 5)

out.push('قاعده‌ی روز: ۸ ساعت کار خالص + ۳۰ دقیقه استراحت')
let c = computeDay({ date: SAT, checkIn: '08:00', checkOut: '16:30', breakMinutes: 30 }, ctx())
ok(c.worked === 480 && c.duty === 480 && c.excess === 0 && c.deficit === 0, '۰۸:۰۰ تا ۱۶:۳۰ با ۳۰ دقیقه استراحت = ۸ ساعت خالص، بدون اضافه‌کاری')
c = computeDay({ date: SAT, checkIn: '08:00', checkOut: '18:00', breakMinutes: 30 }, ctx())
ok(c.worked === 570 && c.excess === 90 && c.undecided === 90 && c.unpaid === 0, 'یک‌ونیم ساعت بیشتر = اضافه‌کاری ۱:۳۰، بدون تعیین تکلیف')
c = computeDay({ date: SAT, checkIn: '08:00', checkOut: '16:30', breakMinutes: 0 }, ctx())
ok(c.breakMinutes === 30 && c.worked === 480, 'استراحت کمتر از ۳۰ دقیقه در روز کاری، ۳۰ دقیقه حساب می‌شود')
c = computeDay({ date: SAT, checkIn: '08:00', checkOut: '17:00', breakMinutes: 60 }, ctx())
ok(c.breakMinutes === 60 && c.worked === 480 && c.excess === 0, 'استراحت طولانی‌تر همان‌قدر کسر می‌شود')
c = computeDay({ date: SAT, checkIn: '09:00', checkOut: '16:00', breakMinutes: 30 }, ctx())
ok(c.deficit === 90 && c.excess === 0, 'کسر کارکرد فقط شمرده می‌شود (۱:۳۰)')
c = computeDay({ date: THU, checkIn: '10:00', checkOut: '13:00', breakMinutes: 0 }, ctx())
ok(c.offDay && c.duty === 0 && c.excess === 180, 'پنجشنبه: موظف صفر، همه‌ی کار اضافه‌کاری')
c = computeDay({ date: SAT, checkIn: '08:00', checkOut: '14:30', breakMinutes: 30 }, ctx({ leaveMinutes: 120 }))
ok(c.duty === 360 && c.excess === 0, 'مرخصی ساعتی ۲ ساعت، موظف را ۶ ساعت می‌کند')
c = computeDay({ date: SAT, checkIn: '22:00', checkOut: '02:00', breakMinutes: 0 }, ctx())
ok(c.presence === 240, 'خروج بعد از نیمه‌شب')
c = computeDay({ date: SAT, checkIn: '08:00', breakMinutes: 30 }, ctx())
ok(c.worked === 0 && c.excess === 0 && c.deficit === 0, 'روز باز (بدون خروج) هنوز حساب نمی‌شود')
const req = (status: AdminRequest['status'], minutes: number, approvedMinutes?: number) => ({ id: 'x', no: 1, userId: 'u', kind: 'overtime', status, createdAt: '', stageSince: '', description: '', files: [], steps: [], overtime: { date: SAT, minutes, taskIds: [], source: 'timesheet', approvedMinutes } }) as AdminRequest
const day90 = { date: SAT, checkIn: '08:00', checkOut: '18:00', breakMinutes: 30 }
c = computeDay(day90, ctx({ requests: [req('pending_office', 60)] }))
ok(c.pending === 60 && c.unpaid === 30 && c.undecided === 0 && c.requested === 60, 'درخواست ۱ ساعت از ۱:۳۰: یک ساعت در انتظار، باقی بدون پرداخت')
c = computeDay(day90, ctx({ requests: [req('approved', 90, 45)] }))
ok(c.approved === 45 && c.unpaid === 45, 'تأیید بخشی (۴۵ دقیقه): باقی بدون پرداخت')
c = computeDay(day90, ctx({ requests: [req('rejected', 90)] }))
ok(c.approved === 0 && c.unpaid === 90 && c.requested === 90, 'رد درخواست: همه بدون پرداخت، مقدار درخواستی جدا نگه داشته می‌شود')
c = computeDay({ ...day90, otChoice: 'unpaid' }, ctx())
ok(c.unpaid === 90 && c.undecided === 0, 'انتخاب «بدون پرداخت»')
c = computeDay(day90, ctx({ closed: true }))
ok(c.unpaid === 90 && c.undecided === 0, 'با بستن ماه، بدون تعیین تکلیف ← بدون پرداخت')
c = computeDay(day90, ctx({ requests: [req('approved', 240, 240)] }))
ok(c.approved === 90, 'اضافه‌کاری از پیش: قابل پرداخت = کمترِ تأییدشده و واقعی')

out.push('داده‌ی نمونه')
ok(S0.users.find((u) => u.id === office)?.role === 'office', 'حساب نمونه‌ی مدیر اداری (m.tavana)')
const prevKey = prevMonthKey(jMonthKey(TODAY))
ok(S0.monthCloses.some((m) => m.month === prevKey), 'ماه گذشته بسته شده است')
const days0 = Object.values(S0.timesheets)
ok(days0.filter((d) => isMonthClosed(S0.monthCloses, d.date)).every((d) => d.calc.undecided === 0), 'در ماه بسته، اضافه‌کاری بدون تعیین تکلیف نمانده')
const statuses = new Set(S0.adminRequests.map((r) => r.status))
ok(['pending_office', 'pending_ceo', 'approved', 'rejected', 'withdrawn'].every((x) => statuses.has(x as AdminRequest['status'])), 'درخواست‌ها در همه‌ی وضعیت‌ها')
ok(S0.adminRequests.filter((r) => r.kind === 'leave' && r.status === 'approved').every((r) => r.leaveIds?.length && r.leaveIds.every((id) => S0.leaves.some((l) => l.id === id && l.requestId === r.id))), 'مرخصی تأییدشده در جدول مرخصی‌ها (برای Workload) هست')
const ot = overtimeIndex(S0.adminRequests)
const recomputed = days0.filter((d) => !isMonthClosed(S0.monthCloses, d.date)).every((d) => {
  const lv = Math.round(S0.leaves.filter((l) => l.userId === d.userId && l.date === d.date).reduce((t, l) => t + l.hours, 0) * 60)
  const x = computeDay(d, { cfg: configFor(S0.timesheetConfigs, d.date), holidays: hol, leaveMinutes: lv, requests: ot.get(d.id) ?? [], closed: false })
  return JSON.stringify(x) === JSON.stringify(d.calc)
})
ok(recomputed, 'ارقام ذخیره‌شده‌ی همه‌ی روزهای ماه باز با محاسبه‌ی دوباره یکی است')
const logged = new Map<string, number>()
for (const l of S0.workLogs) if (!l.deletedAt) logged.set(dayKey(l.userId, l.workDate), (logged.get(dayKey(l.userId, l.workDate)) ?? 0) + l.minutes)
ok(days0.filter((d) => d.checkOut).every((d) => (logged.get(d.id) ?? 0) <= d.calc.worked), 'Work Log هیچ روزی از کارکرد تایم‌شیت بیشتر نیست')

out.push('گردش کار درخواست')
// timesheet and request tests run on a copy with every month open, so they do not depend on today's date
const S1: State = { ...S0, monthCloses: [] }
const futureWork = (n: number) => { let d = addDays(TODAY, 1), k = 0; while (true) { if (!isWeekend(d) && !hol.has(d)) { if (k === n) return d; k++ } d = addDays(d, 1) } }
const fd = futureWork(20)
const leaveA: A = { type: 'reqCreate', req: { kind: 'leave', description: 'کار شخصی', leave: { mode: 'day', category: 'annual', from: fd, to: fd } } }
let s = allowed(S1, other, leaveA, 'عضو تیم درخواست مرخصی ثبت می‌کند')
let r = last(s)
ok(r.status === 'pending_office' && r.userId === other, 'درخواست به کارتابل مدیر اداری رفت')
ok(s.notifications.some((n) => n.userId === office && n.kind === 'request'), 'مدیر اداری اعلان گرفت')
ok(s.audit[0].kind === 'request', 'ثبت در AuditLog')
refused(s, other, leaveA, 'مرخصی تکراری برای همان روز')
refused(s, other, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'درخواست‌دهنده درخواست خودش را تأیید کند')
refused(s, ceo, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'مدیرعامل پیش از مدیر اداری تصمیم بگیرد')
refused(s, lead, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'سرپرست تیم تصمیم بگیرد')
refused(s, control, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'کنترل پروژه تصمیم بگیرد')
refused(s, office, { type: 'reqDecide', id: r.id, decision: 'reject' }, 'رد بدون دلیل')
refused(s, member, { type: 'reqWithdraw', id: r.id }, 'دیگری درخواست را پس بگیرد')
s = allowed(s, office, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'مدیر اداری تأیید می‌کند')
r = s.adminRequests.find((x) => x.id === r.id)!
ok(r.status === 'pending_ceo' && r.steps.some((st) => st.stage === 'office' && st.by === office && st.decision === 'approve'), 'به کارتابل مدیرعامل رفت و تصمیم با نام و زمان ثبت شد')
ok(s.notifications.some((n) => n.userId === ceo && n.kind === 'request') && s.notifications.some((n) => n.userId === other && n.title.includes('تأیید مدیر اداری')), 'مدیرعامل و درخواست‌دهنده اعلان گرفتند')
refused(s, other, { type: 'reqWithdraw', id: r.id }, 'پس گرفتن بعد از تصمیم مدیر اداری')
refused(s, office, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'مدیر اداری دوباره تصمیم بگیرد')
s = allowed(s, ceo, { type: 'reqDecide', id: r.id, decision: 'approve', note: 'موافقم' }, 'مدیرعامل تأیید نهایی می‌کند')
r = s.adminRequests.find((x) => x.id === r.id)!
ok(r.status === 'approved' && s.leaves.some((l) => l.requestId === r.id && l.date === fd && l.hours === 8), 'تأیید نهایی، مرخصی را در جدول مرخصی‌ها (ظرفیت Workload) ثبت کرد')
ok(s.leaves.filter((l) => l.requestId === r.id).every((l) => !l.note?.includes('استحقاقی')), 'نوع و دلیل مرخصی در جدول برنامه‌ریزی نیست')
ok(s.notifications.some((n) => n.userId === other && n.title.includes('تأیید شد')), 'نتیجه‌ی نهایی به درخواست‌دهنده اعلام شد')
refused(s, ceo, { type: 'reqCancel', id: r.id, note: 'x' }, 'لغو مرخصی تأییدشده توسط غیر مدیر اداری')
refused(s, office, { type: 'reqCancel', id: r.id, note: '' }, 'لغو بدون دلیل')
let s2 = allowed(s, office, { type: 'reqCancel', id: r.id, note: 'پروژه‌ی فوری' }, 'مدیر اداری مرخصی تأییدشده را با دلیل لغو می‌کند')
ok(s2.adminRequests.find((x) => x.id === r.id)!.status === 'cancelled' && !s2.leaves.some((l) => l.requestId === r.id), 'ردیف‌های مرخصی برداشته شد و درخواست با سابقه‌اش ماند')

s = allowed(S1, other, { type: 'reqCreate', req: { kind: 'other', description: '', other: { title: 'گواهی اشتغال', category: 'certificate' } } }, 'درخواست «سایر»')
r = last(s)
s2 = allowed(s, office, { type: 'reqDecide', id: r.id, decision: 'reject', note: 'ناقص است' }, 'رد مدیر اداری با دلیل')
ok(s2.adminRequests.find((x) => x.id === r.id)!.status === 'rejected' && s2.notifications.some((n) => n.userId === other && n.title.includes('رد شد')), 'رد، فرایند را تمام کرد و به کاربر اعلام شد')
refused(s2, ceo, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'تصمیم درباره‌ی درخواست ردشده')
s2 = allowed(s, other, { type: 'reqWithdraw', id: r.id }, 'پس گرفتن پیش از اولین تصمیم')
ok(s2.adminRequests.find((x) => x.id === r.id)!.status === 'withdrawn', 'وضعیت «پس گرفته شد»')

s = allowed(S1, office, { type: 'reqCreate', req: { kind: 'other', description: '', other: { title: 'تجهیزات', category: 'equipment' } } }, 'درخواست خود مدیر اداری')
ok(last(s).status === 'pending_ceo', 'درخواست مدیر اداری مستقیم به مدیرعامل رفت')
refused(s, office, { type: 'reqDecide', id: last(s).id, decision: 'approve' }, 'مدیر اداری درخواست خودش را تأیید کند')
s = allowed(S1, ceo, { type: 'reqCreate', req: { kind: 'leave', description: '', leave: { mode: 'day', category: 'annual', from: fd, to: fd } } }, 'درخواست مدیرعامل')
ok(last(s).status === 'approved' && s.leaves.some((l) => l.requestId === last(s).id), 'درخواست مدیرعامل بدون تأیید ثبت شد')
refused(S1, other, { type: 'reqCreate', req: { kind: 'leave', description: '', leave: { mode: 'day', category: 'annual', from: THU, to: addDays(THU, 1) } } }, 'مرخصی فقط روی پنجشنبه و جمعه')
refused(S1, other, { type: 'reqCreate', req: { kind: 'leave', description: '', leave: { mode: 'hour', category: 'annual', from: fd, to: fd, startTime: '08:00', endTime: '17:00' } } }, 'مرخصی ساعتی به اندازه‌ی یک روز')
s = allowed(S1, other, { type: 'reqCreate', req: { kind: 'leave', description: '', leave: { mode: 'hour', category: 'annual', from: fd, to: fd, startTime: '14:00', endTime: '16:00' } } }, 'مرخصی ساعتی ۲ ساعت')

out.push('تایم‌شیت')
const recent = (() => { for (let i = 1; i <= 6; i++) { const d = addDays(TODAY, -i); if (!isWeekend(d) && !hol.has(d) && !(ot.get(dayKey(other, d)) ?? []).length) return d } return '' })()
ok(!!recent, `روز کاری آزمایشی در ۷ روز گذشته (${recent})`)
const save = (uid: string, date: string, ci: string, co: string, br = 30, reason?: string): A => ({ type: 'tsSave', userId: uid, date, checkIn: ci, checkOut: co, breakMinutes: br, reason })
s = allowed(S1, other, save(other, recent, '08:00', '18:30'), 'ثبت ورود و خروج روز گذشته')
let d = s.timesheets[dayKey(other, recent)]
ok(d.calc.worked === 600 && d.calc.excess === 120 && d.calc.undecided === 120, 'کارکرد و اضافه‌کاری خودکار حساب شد (۱۰ ساعت، ۲ ساعت اضافه)')
ok(s.notifications.some((n) => n.userId === other && n.kind === 'timesheet' && n.title.includes('اضافه‌کاری')), 'اعلان تعیین تکلیف اضافه‌کاری برای خود کاربر')
refused(S1, other, save(other, addDays(TODAY, -12), '08:00', '16:30'), 'ثبت روز قدیمی‌تر از ۷ روز توسط خود کاربر')
refused(S1, other, save(other, addDays(TODAY, 1), '08:00', '16:30'), 'ثبت روز آینده')
refused(S1, member, save(other, recent, '08:00', '16:30'), 'عضو تیم تایم‌شیت دیگری را تغییر دهد')
refused(S1, control, save(other, recent, '08:00', '16:30', 30, 'اصلاح'), 'کنترل پروژه تایم‌شیت دیگری را تغییر دهد')
refused(S1, office, save(other, recent, '08:00', '16:30'), 'مدیر اداری بدون دلیل اصلاح کند')
refused(S1, other, save(other, recent, '08:00', '08:10', 30), 'استراحت بیشتر از حضور')
refused(S1, other, { type: 'tsSave', userId: other, date: recent, checkOut: '16:00', breakMinutes: 30 }, 'خروج بدون ورود')
const free = d.calc.excess
refused(s, other, { type: 'reqCreate', req: { kind: 'overtime', description: '', overtime: { date: recent, minutes: free + 15, taskIds: [] } } }, 'درخواست اضافه‌کاری بیشتر از کارکرد واقعی')
refused(s, other, { type: 'reqCreate', req: { kind: 'overtime', description: '', overtime: { date: recent, minutes: 60, taskIds: ['NOPE'] } } }, 'تسک ناموجود در درخواست اضافه‌کاری')
s2 = allowed(s, other, { type: 'tsUnpaid', date: recent }, 'انتخاب بدون پرداخت')
ok(s2.timesheets[dayKey(other, recent)].calc.unpaid === 120, 'دو ساعت بدون پرداخت ثبت شد')
s = allowed(s, other, { type: 'reqCreate', req: { kind: 'overtime', description: 'تکمیل شیت‌ها', overtime: { date: recent, minutes: 90, taskIds: [] } } }, 'درخواست ۱:۳۰ از ۲ ساعت')
r = last(s)
d = s.timesheets[dayKey(other, recent)]
ok(r.overtime!.source === 'timesheet' && d.calc.pending === 90 && d.calc.unpaid === 30 && d.calc.requested === 90, 'یک‌ونیم ساعت در انتظار، نیم ساعت باقی‌مانده بدون پرداخت')
refused(s, other, save(other, recent, '08:00', '19:00'), 'اصلاح روزی که اضافه‌کاری‌اش در جریان است (قفل)')
refused(s, office, { type: 'reqDecide', id: r.id, decision: 'approve', minutes: 120 }, 'تأیید بیش از مقدار درخواستی')
s = allowed(s, office, { type: 'reqDecide', id: r.id, decision: 'approve', minutes: 60 }, 'مدیر اداری ۱ ساعت را تأیید می‌کند')
refused(s, ceo, { type: 'reqDecide', id: r.id, decision: 'approve', minutes: 90 }, 'مدیرعامل بیش از تأیید مرحله‌ی قبل')
s = allowed(s, ceo, { type: 'reqDecide', id: r.id, decision: 'approve' }, 'مدیرعامل تأیید نهایی می‌کند')
d = s.timesheets[dayKey(other, recent)]
ok(s.adminRequests.find((x) => x.id === r.id)!.overtime!.approvedMinutes === 60 && d.calc.approved === 60 && d.calc.unpaid === 60 && d.calc.pending === 0, 'تأییدشده ۱ ساعت؛ باقی (۱ ساعت) بدون پرداخت؛ کارکرد، درخواستی، تأییدشده و بدون پرداخت جدا')
s2 = allowed(s, office, save(other, recent, '08:00', '18:00', 30, 'خروج اشتباه ثبت شده بود'), 'مدیر اداری با دلیل اصلاح می‌کند')
d = s2.timesheets[dayKey(other, recent)]
const rv = d.revisions[d.revisions.length - 1]
ok(d.revisions.length >= 1 && rv.checkOut === '18:30' && rv.reason === 'خروج اشتباه ثبت شده بود' && rv.by === other, 'مقدار قبلی، ثبت‌کننده‌ی قبلی و دلیل در سابقه‌ی تغییرات ماند')
ok(d.calc.approved === 60 && d.calc.unpaid === 30, 'بعد از اصلاح، ارقام دوباره حساب شد')
ok(s2.notifications.some((n) => n.userId === other && n.kind === 'timesheet' && n.title.includes('اصلاح')), 'کاربر از اصلاح باخبر شد')
const adv = futureWork(2)
s2 = allowed(S1, other, { type: 'reqCreate', req: { kind: 'overtime', description: 'مناقصه', overtime: { date: adv, minutes: 180, taskIds: [] } } }, 'اضافه‌کاری از پیش')
ok(last(s2).overtime!.source === 'advance', 'نوع «از پیش» ثبت شد')
refused(S1, other, { type: 'reqCreate', req: { kind: 'overtime', description: '', overtime: { date: adv, minutes: 13 * 60, taskIds: [] } } }, 'اضافه‌کاری از پیش بیش از ۱۲ ساعت')
const blank = (() => { for (let i = 1; i <= 6; i++) { const x = addDays(TODAY, -i); if (!S1.timesheets[dayKey(other, x)]) return x } return '' })()
if (blank) refused(S1, other, { type: 'reqCreate', req: { kind: 'overtime', description: '', overtime: { date: blank, minutes: 60, taskIds: [] } } }, 'اضافه‌کاری روز گذشته‌ی بدون تایم‌شیت')

out.push('ثبت ورود و خروج')
const noToday: State = { ...S1, timesheets: Object.fromEntries(Object.entries(S1.timesheets).filter(([k]) => k !== dayKey(member, TODAY))) }
s = allowed(noToday, member, { type: 'tsPunch', kind: 'in' }, 'ثبت ورود الان')
ok(!!s.timesheets[dayKey(member, TODAY)]?.checkIn, 'ساعت ورود با ساعت تهران ثبت شد')
refused(s, member, { type: 'tsPunch', kind: 'in' }, 'ورود دوباره')
const early: State = { ...s, timesheets: { ...s.timesheets, [dayKey(member, TODAY)]: { ...s.timesheets[dayKey(member, TODAY)], checkIn: '00:00' } } }
s = allowed(early, member, { type: 'tsPunch', kind: 'out' }, 'ثبت خروج')
refused(s, member, { type: 'tsPunch', kind: 'out' }, 'خروج دوباره')

out.push('بستن ماه')
const prev = monthRange(prevKey)
refused(S1, other, { type: 'monthClose', month: prevKey }, 'بستن ماه توسط کاربر عادی')
refused(S1, control, { type: 'monthClose', month: prevKey }, 'بستن ماه توسط کنترل پروژه')
refused(S1, office, { type: 'monthClose', month: jMonthKey(TODAY) }, 'بستن ماهی که تمام نشده')
const pDay = (() => { for (let x = prev.from; x <= prev.to; x = addDays(x, 1)) if (!isWeekend(x) && !hol.has(x) && !(ot.get(dayKey(other, x)) ?? []).length) return x; return prev.from })()
s = allowed(S1, office, save(other, pDay, '08:00', '19:00', 30, 'ثبت جاافتاده'), 'مدیر اداری روز ماه قبل را ثبت می‌کند')
ok(s.timesheets[dayKey(other, pDay)].calc.undecided === 150, 'اضافه‌کاری ۲:۳۰ بدون تعیین تکلیف')
s2 = allowed(s, other, { type: 'reqCreate', req: { kind: 'overtime', description: '', overtime: { date: pDay, minutes: 60, taskIds: [] } } }, 'درخواست اضافه‌کاری همان روز')
refused(s2, office, { type: 'monthClose', month: prevKey }, 'بستن ماه با درخواست در کارتابل')
s = allowed(s, office, { type: 'monthClose', month: prevKey }, 'مدیر اداری ماه گذشته را می‌بندد')
d = s.timesheets[dayKey(other, pDay)]
ok(d.calc.undecided === 0 && d.calc.unpaid === 150 && s.monthCloses[0].unpaidMinutes >= 150, 'بدون تعیین تکلیف‌ها بدون پرداخت شد')
ok(s.notifications.some((n) => n.userId === other && n.title.includes('بسته شد')), 'به کاربر اعلام شد')
refused(s, office, save(other, pDay, '08:00', '16:30', 30, 'x'), 'تغییر تایم‌شیت ماه بسته')
refused(s, other, { type: 'reqCreate', req: { kind: 'overtime', description: '', overtime: { date: pDay, minutes: 60, taskIds: [] } } }, 'درخواست برای ماه بسته')
refused(s, office, { type: 'monthClose', month: prevKey }, 'بستن دوباره')
s2 = allowed(s, control, { type: 'addHoliday', holiday: { id: 'h-t', date: pDay, title: 'آزمون' } }, 'افزودن تعطیلی در ماه بسته')
ok(JSON.stringify(s2.timesheets[dayKey(other, pDay)].calc) === JSON.stringify(d.calc), 'ارقام ماه بسته عوض نشد')

out.push('قواعد نسخه‌دار و مرخصی مستقیم')
const cfgA = (from: string): A => ({ type: 'tsConfig', config: { dutyNetMinutes: 7 * 60 + 30, minBreakMinutes: 30, editDays: 7, from }, reason: 'آزمون' })
refused(S1, office, cfgA(addDays(TODAY, -3)), 'قاعده‌ی تازه برای روزهای گذشته')
refused(S1, control, cfgA(TODAY), 'تغییر قاعده توسط کنترل پروژه')
s = allowed(S0, office, cfgA(addDays(TODAY, 1)), 'قاعده‌ی تازه از فردا')
ok(s.timesheetConfigs.length === 2 && configFor(s.timesheetConfigs, addDays(TODAY, 1)).dutyNetMinutes === 450 && configFor(s.timesheetConfigs, TODAY).dutyNetMinutes === 480, 'نسخه‌ی ۲ فقط از تاریخش اعمال می‌شود')
ok(JSON.stringify(Object.values(s.timesheets).map((x) => x.calc)) === JSON.stringify(Object.values(S0.timesheets).map((x) => x.calc)), 'ارقام روزهای گذشته جابه‌جا نشد')
const leaveRow = { id: 'l-x', userId: other, date: fd, hours: 8 }
refused(S1, control, { type: 'addLeave', leave: { ...leaveRow, note: 'x' } }, 'ثبت مستقیم مرخصی توسط کنترل پروژه (منتقل شد)')
refused(S1, office, { type: 'addLeave', leave: leaveRow }, 'ثبت مستقیم بدون دلیل')
s = allowed(S1, office, { type: 'addLeave', leave: { ...leaveRow, note: 'استعلاجی ثبت‌نشده' } }, 'ثبت مستقیم با دلیل')
ok(s.leaves.some((l) => l.id === 'l-x' && l.by === office), 'ثبت‌کننده روی ردیف ماند')
const fromReq = S0.leaves.find((l) => l.requestId)
if (fromReq) refused(S1, office, { type: 'removeLeave', id: fromReq.id }, 'حذف مستقیم مرخصیِ آمده از درخواست')

out.push('دسترسی و حریم شخصی')
const U = (id: string) => S0.users.find((u) => u.id === id)!
ok(canSeeTimesheetOf(U(member), member) && !canSeeTimesheetOf(U(member), other), 'عضو فقط تایم‌شیت خودش را می‌بیند')
ok(!canSeeTimesheetOf(U(lead), other) && !canSeeTimesheetOf(U(pm), other), 'سرپرست تیم و مدیر پروژه تایم‌شیت دیگران را نمی‌بینند')
ok(canSeeTimesheetOf(U(office), other) && canSeeTimesheetOf(U(ceo), other) && canSeeTimesheetOf(U(control), other), 'مدیر اداری، مدیرعامل و کنترل پروژه همه را می‌بینند')
const someReq = S0.adminRequests.find((x) => x.userId !== member && x.userId !== lead)!
ok(!canSeeRequest(U(member), someReq) && !canSeeRequest(U(lead), someReq) && canSeeRequest(U(office), someReq) && canSeeRequest(U(control), someReq), 'درخواست دیگران فقط برای تأییدکننده‌ها و نقش‌های گزارش')

out.push('گزارش‌ها')
const allDays = Object.values(S0.timesheets)
const rows = overtimeSummary(allDays)
const tot = rows.reduce((t, x) => t + x.excess, 0)
ok(tot === allDays.reduce((t, x) => t + x.calc.excess, 0) && rows.every((x) => x.approved + x.pending + x.unpaid + x.undecided === x.excess), 'جمع اضافه‌کاری = تأییدشده + در انتظار + بدون پرداخت + بدون تعیین تکلیف')
const st = approverStats(S0.adminRequests, new Date().toISOString())
ok(st[0].handled > 0 && st[1].handled > 0 && st[0].pending === S0.adminRequests.filter((x) => x.status === 'pending_office').length, 'آمار رسیدگی مدیر اداری و مدیرعامل')
const csv = toCSV(['نام', 'توضیح'], [['الف', 'با "نقل" و ,']])
ok(csv.startsWith('﻿') && csv.includes('"با ""نقل"" و ,"'), 'CSV با BOM و نقل‌قول درست')
ok(DEFAULT_TIMESHEET_CONFIG.dutyNetMinutes === 480 && DEFAULT_TIMESHEET_CONFIG.minBreakMinutes === 30, 'قاعده‌ی اولیه: ۸ ساعت خالص و ۳۰ دقیقه استراحت')
void (null as unknown as TimesheetConfig)

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
