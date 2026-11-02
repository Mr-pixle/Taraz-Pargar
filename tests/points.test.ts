// Point system acceptance tests: formula, automation, idempotency, reversals, permissions and the Project Control boundary.
import { initialState, reducer, isWorkItem, statusesFor, statusOf, currentPointConfig, type State } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { addDays, isWeekend } from '../src/lib/jalali'
import { activeAward, calcPoint, summarize, workdaysBetween } from '../src/lib/points'
import { has } from '../src/lib/policy'
import type { PointConfig, Task } from '../src/lib/types'

let pass = 0, fail = 0
const out: string[] = []
const ok = (c: unknown, name: string) => { if (c) { pass++; out.push(`  ✓ ${name}`) } else { fail++; out.push(`  ✗ ${name}`) } }
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const data = (s: State) => JSON.stringify({ ...s, audit: null, denial: null })
const refused = (s: State, u: string, a: A, name: string) => { const b = as(s, u), r = reducer(b, a); ok(r.denial && data(r) === data(b), `رد شد بدون تغییر داده: ${name}`); return r }
const allowed = (s: State, u: string, a: A, name: string) => { const r = reducer(as(s, u), a); ok(!r.denial, `مجاز: ${name}${r.denial ? ` — ${r.denial.text}` : ''}`); return r }
const wd = (from: string, n: number) => { let d = from, k = Math.abs(n); const step = n >= 0 ? 1 : -1; while (k > 0) { d = addDays(d, step); if (!isWeekend(d)) k-- } return d }
const near = (a: number, b: number) => Math.abs(a - b) < 0.05

const S0 = initialState()
const cfg = currentPointConfig(S0)
const none = new Set<string>()
const control = 'u-ctl-1', ceo = 'u-rd-1', member = 'u-p1a-3', lead = 'u-p1a-1', pm = 'u-mgt-2', mgmt = 'u-mgt-1', inspector = 'u-sup-1'

out.push('فرمول')
const base: Task = { id: 'T', projectId: 'BBT', parentId: null, kind: 'manual', name: 't', order: 0, source: 'manual', assigneeUserId: member, estimation: 16, wf: 1, due: '2026-11-04' } // a Wednesday
const c1 = calcPoint(base, '2026-11-02', cfg, none) // Monday → 2 working days early
ok(c1.ok && c1.calc.workdays === 2 && c1.calc.hours === 16 && c1.points === 100, 'دو روز کاری زودتر، W.F=1، Estimation=16 ← +100 = (1÷16)×100×16')
const c2 = calcPoint(base, '2026-11-09', cfg, none) // next Monday: Sat, Sun, Mon = 3 working days late (Thu/Fri skipped)
ok(c2.ok && c2.calc.workdays === 3 && c2.points === -150, 'سه روز کاری دیرتر (پنجشنبه و جمعه حساب نمی‌شود) ← −150')
const c3 = calcPoint(base, '2026-11-04', cfg, none)
ok(c3.ok && c3.points === 0 && c3.calc.direction === 'ontime', 'سر موعد ← صفر')
const c4 = calcPoint({ ...base, wf: 1.5, estimation: 40 }, '2026-11-03', cfg, none)
ok(c4.ok && near(c4.points, (1.5 / 40) * 100 * 8), 'W.F=1.5، Estimation=40، یک روز زودتر ← +30')
ok(workdaysBetween('2026-11-02', '2026-11-04', new Set(['2026-11-03'])) === 1, 'تعطیلی رسمی از روزهای کاری کم می‌شود')
const c5 = calcPoint({ ...base, assigneeUserId: undefined, assigneeTeamId: 'p1a' }, '2026-11-02', cfg, none)
ok(!c5.ok, 'تسک تخصیص‌یافته به تیم امتیاز فردی نمی‌گیرد')
ok(!calcPoint({ ...base, estimation: undefined }, '2026-11-02', cfg, none).ok, 'بدون Estimation امتیازی محاسبه نمی‌شود')
const capped = calcPoint(base, '2026-11-30', { ...cfg, cap: 200 } as PointConfig, none)
ok(capped.ok && capped.points === -200 && capped.calc.capped, 'سقف اختیاری هر تسک اعمال می‌شود')

out.push('محاسبه‌ی اولیه‌ی داده‌ی نمونه')
const finished = Object.values(S0.tasks).filter((t) => (isWorkItem(t) || t.kind === 'supervision' || t.kind === 'internal') && t.actualFinish && t.assigneeUserId && t.estimation && t.due && (t.flow === 'closed' || statusOf(S0, t)?.category === 'done'))
ok(finished.length > 5 && finished.every((t) => S0.pointEntries.filter((e) => e.taskId === t.id && e.kind === 'task' && !e.reversedBy).length === 1), `هر تسک تمام‌شده دقیقاً یک ردیف فعال دارد (${finished.length} تسک)`)
ok(S0.pointEntries.every((e) => e.kind !== 'task' || near(e.points, calcPoint(S0.tasks[e.taskId!], e.calc!.completedOn, cfg, new Set(S0.holidays.map((h) => h.date))).ok ? (calcPoint(S0.tasks[e.taskId!], e.calc!.completedOn, cfg, new Set(S0.holidays.map((h) => h.date))) as { points: number }).points : NaN)), 'همه‌ی ردیف‌های اولیه با فرمول یکی است')
const sumAll = S0.pointEntries.reduce((x, e) => x + e.points, 0)
const users = [...new Set(S0.pointEntries.map((e) => e.userId))]
ok(near(users.reduce((x, u) => x + summarize(S0.pointEntries.filter((e) => e.userId === u)).net, 0), sumAll), 'جمع امتیاز خالص کاربران = جمع کل دفتر امتیاز')
const s1 = summarize(S0.pointEntries.filter((e) => e.userId === 'u-rvt-2'))
ok(near(s1.net, s1.earned - s1.deducted + s1.adjustPlus - s1.adjustMinus) && near(s1.total, s1.earned + s1.adjustPlus), 'خالص = کسب‌شده − کسرشده ± اصلاح؛ کل = کسب‌شده + اصلاح مثبت')

out.push('اتوماسیون، بدون تکرار، برگشت')
const t0 = Object.values(S0.tasks).find((t) => isWorkItem(t) && !t.reviewerId && t.assigneeUserId && t.estimation && t.due && t.due > TODAY && statusOf(S0, t)?.category !== 'done')!
const set = statusesFor(S0, t0)
const done = set.find((x) => x.category === 'done')!, doing = set.find((x) => x.category === 'doing')!
let s = allowed(S0, control, { type: 'setStatus', taskId: t0.id, statusId: done.id }, 'اتمام تسک')
const a1 = activeAward(s.pointEntries, t0.id)
const exp = calcPoint({ ...t0, actualFinish: TODAY }, TODAY, cfg, new Set(s.holidays.map((h) => h.date)))
ok(a1 && exp.ok && a1.points === exp.points && a1.points > 0 && a1.userId === t0.assigneeUserId, `امتیاز مثبت خودکار به مسئول تسک رسید (${a1?.points})`)
ok(s.notifications.some((n) => n.userId === t0.assigneeUserId && n.kind === 'points'), 'مسئول اعلان امتیاز گرفت')
ok(s.audit.some((x) => x.kind === 'points' && x.taskId === t0.id), 'در AuditLog ثبت شد')
const again = reducer(as(s, control), { type: 'pointRecalc', taskId: t0.id })
ok(again.pointEntries.length === s.pointEntries.length, 'بازمحاسبه با ورودی و پارامتر یکسان ردیف تکراری نمی‌سازد')
const dup = reducer(as(s, control), { type: 'setStatus', taskId: t0.id, statusId: done.id })
ok(dup.pointEntries.length === s.pointEntries.length, 'ثبت دوباره‌ی همان Status امتیاز تکراری نمی‌سازد')
s = allowed(s, control, { type: 'setStatus', taskId: t0.id, statusId: doing.id }, 'بازگشایی تسک')
ok(!activeAward(s.pointEntries, t0.id) && s.pointEntries.some((e) => e.kind === 'reversal' && e.reverses === a1!.id && e.points === -a1!.points), 'بازگشایی یک ردیف برگشت با همان مقدار منفی ساخت')
s = allowed(s, control, { type: 'setStatus', taskId: t0.id, statusId: done.id }, 'اتمام دوباره')
const net = s.pointEntries.filter((e) => e.taskId === t0.id).reduce((x, e) => x + e.points, 0)
ok(near(net, a1!.points) && s.pointEntries.filter((e) => e.taskId === t0.id && e.kind === 'task' && !e.reversedBy).length === 1, 'بعد از بازگشایی و اتمام دوباره فقط یک امتیاز فعال؛ جمع بدون تکرار')

out.push('تغییر Due و پارامترها')
const newDue = wd(TODAY, -2)
refused(s, lead, { type: 'savePlan', taskId: t0.id, assignee: { kind: 'user', id: t0.assigneeUserId! }, estimation: t0.estimation, start: t0.start, due: newDue, allocations: [] }, 'تغییر Due تسک تمام‌شده توسط غیرکنترل')
s = allowed(s, control, { type: 'savePlan', taskId: t0.id, assignee: { kind: 'user', id: t0.assigneeUserId! }, estimation: t0.estimation, start: t0.start, due: newDue, allocations: [] }, 'کنترل پروژه Due تسک تمام‌شده را عوض می‌کند')
const a2 = activeAward(s.pointEntries, t0.id)!
ok(a2.calc!.due === newDue && a2.points < 0 && a2.calc!.workdays === 2, `امتیاز با Due تازه دوباره محاسبه شد (${a2.points}، تأخیر ۲ روز کاری)`)
refused(s, lead, { type: 'updateTask', taskId: t0.id, patch: { wf: 2 } }, 'غیرکنترل W.F را عوض کند')
s = allowed(s, ceo, { type: 'updateTask', taskId: t0.id, patch: { wf: 2 } }, 'مدیرعامل W.F را عوض می‌کند')
ok(near(activeAward(s.pointEntries, t0.id)!.points, a2.points * 2 / (t0.wf ?? 1)), 'امتیاز با W.F تازه به نسبت تغییر کرد')
const before = s.pointEntries.length
refused(s, member, { type: 'pointConfig', config: { multiplier: 200, hoursPerDay: 8, earlyFactor: 1, lateFactor: 1, cap: null }, reason: 'x' }, 'عضو تیم پارامترها را عوض کند')
s = allowed(s, control, { type: 'pointConfig', config: { multiplier: 200, hoursPerDay: 8, earlyFactor: 1, lateFactor: 1, cap: null }, reason: 'آزمون' }, 'کنترل پروژه نسخه‌ی ۲ پارامترها را ثبت می‌کند')
ok(s.pointEntries.length === before && currentPointConfig(s).version === 2, 'نسخه‌ی تازه امتیازهای ثبت‌شده را تغییر نداد')
const p2 = activeAward(s.pointEntries, t0.id)!.points
s = allowed(s, control, { type: 'pointRecalc', taskId: t0.id }, 'بازمحاسبه با نسخه‌ی ۲')
ok(near(activeAward(s.pointEntries, t0.id)!.points, p2 * 2) && activeAward(s.pointEntries, t0.id)!.calc!.configVersion === 2, 'بازمحاسبه‌ی صریح نسخه‌ی تازه را اعمال کرد')

out.push('Reviewer و تسک‌های گردش‌کار')
const rt = Object.values(S0.tasks).find((t) => isWorkItem(t) && t.reviewerId && t.flow === 'in_review' && t.estimation && t.due)!
s = allowed(S0, rt.reviewerId!, { type: 'flow', taskId: rt.id, op: 'approve' }, 'Reviewer تأیید می‌کند')
const ar = activeAward(s.pointEntries, rt.id)!
ok(ar && ar.userId === rt.assigneeUserId && ar.calc!.completedOn === TODAY, 'امتیاز به مجری، با تاریخ تأیید Reviewer')
s = allowed(S0, 'u-p2c-2', { type: 'flow', taskId: 'SUP-SHS-1', op: 'start' }, 'مجری مورد نظارتی را شروع می‌کند')
s = allowed(s, 'u-p2c-2', { type: 'flow', taskId: 'SUP-SHS-1', op: 'submit', note: 'انجام شد' }, 'ارسال')
ok(!activeAward(s.pointEntries, 'SUP-SHS-1'), 'تا تأیید، امتیازی ثبت نمی‌شود')
s = allowed(s, 'u-sup-3', { type: 'flow', taskId: 'SUP-SHS-1', op: 'approve' }, 'ناظر تأیید می‌کند')
ok(activeAward(s.pointEntries, 'SUP-SHS-1')?.userId === 'u-p2c-2', 'مورد نظارتی امتیاز مجری را ثبت کرد')

out.push('اصلاح دستی')
refused(S0, pm, { type: 'pointAdjust', userId: member, points: 10, reason: 'x' }, 'مدیر پروژه امتیاز را اصلاح کند')
refused(S0, control, { type: 'pointAdjust', userId: member, points: 10, reason: '' }, 'اصلاح بدون دلیل')
refused(S0, control, { type: 'pointAdjust', userId: control, points: 10, reason: 'x' }, 'اصلاح امتیاز خود')
s = allowed(S0, control, { type: 'pointAdjust', userId: member, points: -12.5, reason: 'جبران خطای ثبت' }, 'کنترل پروژه امتیاز را با دلیل اصلاح می‌کند')
ok(near(summarize(s.pointEntries.filter((e) => e.userId === member)).net - summarize(S0.pointEntries.filter((e) => e.userId === member)).net, -12.5), 'اصلاح در امتیاز خالص اثر کرد')

out.push('مرز بخش کنترل پروژه')
const u = (id: string) => S0.users.find((x) => x.id === id)
ok(has(u(ceo), 'control.section') && has(u(control), 'control.section'), 'مدیرعامل و کنترل پروژه به بخش دسترسی دارند')
ok([pm, mgmt, lead, member, inspector].every((id) => !has(u(id), 'control.section')), 'مدیر پروژه، مدیریت، سرپرست، عضو و ناظر دسترسی ندارند')
const run = { id: 'r', projectId: 'BBT', trigger: 'manual' as const, at: '', durationSec: 0, state: 'running' as const, rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [] }
refused(S0, mgmt, { type: 'addRun', run }, 'مدیریت Sync اجرا کند')
refused(S0, mgmt, { type: 'review', ids: [S0.syncItems.find((x) => x.state === 'pending')!.id], approve: true }, 'مدیریت Sync Review را تأیید کند')
refused(S0, mgmt, { type: 'addHoliday', holiday: { id: 'h', date: TODAY, title: 'x' } }, 'مدیریت تعطیلی ثبت کند')
refused(S0, pm, { type: 'projectUpdate', id: 'BBT', patch: { name: 'x' } }, 'مدیر پروژه تعریف پروژه را عوض کند')
refused(S0, lead, { type: 'approveUser', id: 'u-req-1', teamId: 'p1a', role: 'member' }, 'سرپرست عضویت را تأیید کند')
allowed(S0, control, { type: 'addUser', user: { id: 'u-x', name: 'x', username: 'x.test', teamId: 'p1a', role: 'member', capacity: 8, status: 'active', password: 'x', createdAt: '' } }, 'کنترل پروژه (مدیر سیستم) کاربر تعریف کند')
refused(S0, control, { type: 'addUser', user: { id: 'u-y', name: 'y', username: 'y.test', teamId: 'p1a', role: 'ceo', capacity: 8, status: 'active', password: 'x', createdAt: '' } }, 'کنترل پروژه نقش مدیرعامل بدهد')

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
