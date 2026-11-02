// Personal tasks acceptance tests: isolation from organisational data, owner-only access, hierarchy, statuses.
import { initialState, reducer, type State } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { addDays } from '../src/lib/jalali'
import { boardOf, childrenOf, flatten, isDone, subProgress, tasksOf } from '../src/lib/personal'

let pass = 0, fail = 0
const out: string[] = []
const ok = (c: unknown, name: string) => { if (c) { pass++; out.push(`  ✓ ${name}`) } else { fail++; out.push(`  ✗ ${name}`) } }
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const personal = (s: State) => JSON.stringify({ t: s.personalTasks, b: s.personalBoards })
/** everything an organisational screen, plan or report can read */
const org = (s: State) => JSON.stringify({ ...s, personalTasks: null, personalBoards: null, denial: null, session: null })
const refused = (s: State, u: string, a: A, name: string) => { const b = as(s, u), r = reducer(b, a); ok(r.denial && personal(r) === personal(b), `رد شد بدون تغییر داده: ${name}${r.denial ? '' : ' (پذیرفته شد!)'}`); return r }
const allowed = (s: State, u: string, a: A, name: string) => { const r = reducer(as(s, u), a); ok(!r.denial, `مجاز: ${name}${r.denial ? ` — ${r.denial.text}` : ''}`); return r }
const newest = (s: State, u: string) => tasksOf(s.personalTasks, u).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0]

const S0 = initialState()
const id = (u: string) => S0.users.find((x) => x.username === u)!.id
const me = id('s.rezaei'), other = id('h.sadeghi'), ceo = id('ceo'), control = id('n.rahimi'), office = id('m.tavana')

out.push('داده‌ی جدا')
ok(Object.keys(S0.personalTasks).every((k) => !(k in S0.tasks)) && Object.values(S0.tasks).every((t) => !('ownerId' in t)), 'کارهای شخصی در ساختار جدایی از Taskهای پروژه نگه داشته می‌شوند')
ok(tasksOf(S0.personalTasks, me).length > 5 && tasksOf(S0.personalTasks, me).every((t) => t.ownerId === me), 'نمونه‌ی کارهای شخصی s.rezaei')
ok(boardOf(S0.personalBoards, other).statuses.map((s) => s.name).join('،') === 'برای انجام،در حال انجام،انجام شد', 'کاربر تازه با سه Status پیش‌فرض شروع می‌کند')

out.push('ساخت و سلسله‌مراتب')
let s = allowed(S0, other, { type: 'ptCreate', task: { title: 'خرید کتاب', priority: 'high', start: TODAY, due: addDays(TODAY, 3) } }, 'ساخت کار شخصی')
const t1 = newest(s, other)
ok(t1.ownerId === other && t1.statusId === boardOf(s.personalBoards, other).defaultStatusId && t1.parentId === null, 'مالک، Status پیش‌فرض و سطح اول')
ok(org(s) === org(S0), 'هیچ داده‌ی سازمانی تغییر نکرد (Task، برنامه، تقویم، AuditLog، اعلان‌ها، Workload)')
s = allowed(s, other, { type: 'ptCreate', task: { title: 'انتخاب فهرست', parentId: t1.id } }, 'Subtask')
const t2 = newest(s, other)
s = allowed(s, other, { type: 'ptCreate', task: { title: 'جست‌وجوی ناشر', parentId: t2.id } }, 'Subtask سطح سوم')
const t3 = newest(s, other)
refused(s, other, { type: 'ptCreate', task: { title: 'سطح چهارم', parentId: t3.id } }, 'بیش از سه سطح')
s = allowed(s, other, { type: 'ptCreate', task: { title: 'سفارش', parentId: t1.id } }, 'Subtask دوم')
const t4 = newest(s, other)
ok(childrenOf(tasksOf(s.personalTasks, other), t1.id).map((x) => x.id).join() === [t2.id, t4.id].join(), 'ترتیب Subtaskها')
s = allowed(s, other, { type: 'ptMove', id: t4.id, parentId: t1.id, index: 0 }, 'جابه‌جایی Subtask به اول فهرست')
ok(childrenOf(tasksOf(s.personalTasks, other), t1.id)[0].id === t4.id, 'ترتیب تازه ذخیره شد')
refused(s, other, { type: 'ptMove', id: t1.id, parentId: t3.id, index: 0 }, 'بردن Task زیر Subtask خودش')
s = allowed(s, other, { type: 'ptMove', id: t3.id, parentId: null, index: 0 }, 'تبدیل Subtask به Task اصلی')
ok(s.personalTasks[t3.id].parentId === null && flatten(tasksOf(s.personalTasks, other))[0].t.id === t3.id, 'Task اصلی تازه در اول فهرست')
refused(s, other, { type: 'ptUpdate', id: t1.id, patch: { due: addDays(TODAY, -5) } }, 'موعد پیش از شروع')
refused(s, other, { type: 'ptUpdate', id: t1.id, patch: { title: '  ' } }, 'عنوان خالی')
const board = boardOf(s.personalBoards, other)
const done = board.statuses.find((x) => x.done)!.id
s = allowed(s, other, { type: 'ptUpdate', id: t2.id, patch: { statusId: done } }, 'تکمیل Subtask')
ok(!!s.personalTasks[t2.id].completedAt && isDone(board, s.personalTasks[t2.id]), 'زمان تکمیل ثبت شد')
ok(JSON.stringify(subProgress(board, tasksOf(s.personalTasks, other), t1.id)) === JSON.stringify({ done: 1, total: 2 }), 'پیشرفت Subtaskها: ۱ از ۲')
s = allowed(s, other, { type: 'ptUpdate', id: t2.id, patch: { statusId: board.defaultStatusId } }, 'بازگرداندن به باز')
ok(!s.personalTasks[t2.id].completedAt, 'زمان تکمیل پاک شد')
s = allowed(s, other, { type: 'ptUpdate', id: t1.id, patch: { start: addDays(TODAY, 2), due: addDays(TODAY, 6) } }, 'تغییر تاریخ (مثل کشیدن نوار در Timeline)')
ok(s.personalTasks[t1.id].start === addDays(TODAY, 2) && s.personalTasks[t1.id].due === addDays(TODAY, 6), 'تاریخ‌ها ذخیره شد')
const before = Object.keys(s.personalTasks).length
s = allowed(s, other, { type: 'ptDelete', id: t1.id }, 'حذف Task با Subtaskها')
ok(Object.keys(s.personalTasks).length === before - 3 && !s.personalTasks[t2.id] && !s.personalTasks[t4.id], 'Task و همه‌ی Subtaskهایش حذف شد')
ok(org(s) === org(S0), 'پس از همه‌ی این کارها، داده‌ی سازمانی همان است')

out.push('تفکیک کاربران')
const mine = tasksOf(S0.personalTasks, me)[0]
for (const [u, label] of [[other, 'همکار'], [ceo, 'مدیرعامل'], [control, 'کنترل پروژه'], [office, 'مدیر اداری']] as const) {
  refused(S0, u, { type: 'ptUpdate', id: mine.id, patch: { title: 'x' } }, `${label} کار شخصی دیگری را ویرایش کند`)
}
refused(S0, ceo, { type: 'ptDelete', id: mine.id }, 'مدیرعامل کار شخصی دیگری را حذف کند')
refused(S0, other, { type: 'ptCreate', task: { title: 'x', parentId: mine.id } }, 'Subtask زیر کار شخصی دیگری')
refused(S0, other, { type: 'ptMove', id: mine.id, parentId: null, index: 0 }, 'جابه‌جایی کار دیگری')
const r1 = reducer(as(S0, other), { type: 'ptUpdate', id: mine.id, patch: { title: 'x' } })
const r2 = reducer(as(S0, other), { type: 'ptUpdate', id: 'pt-nope', patch: { title: 'x' } })
ok(r1.denial?.text === r2.denial?.text, 'پاسخ برای «مال دیگری» و «ناموجود» یکی است (وجود کار دیگران لو نمی‌رود)')
ok(!r1.audit[0].text.includes(mine.title), 'عنوان کار شخصی در AuditLog نمی‌آید')
const st0 = boardOf(S0.personalBoards, me).statuses
let s2 = allowed(S0, other, { type: 'psSave', statuses: [...boardOf(S0.personalBoards, other).statuses, { id: 'ps-x', name: 'متوقف', color: '#d6453f', done: false }], defaultStatusId: 'ps-todo' }, 'همکار Status خودش را اضافه می‌کند')
ok(JSON.stringify(boardOf(s2.personalBoards, me).statuses) === JSON.stringify(st0), 'Statusهای دیگران تغییر نکرد')

out.push('Statusهای اختصاصی')
const b0 = boardOf(S0.personalBoards, me)
const wait = b0.statuses.find((x) => x.name === 'منتظر دیگران')!
const inWait = tasksOf(S0.personalTasks, me).filter((t) => t.statusId === wait.id).length
ok(inWait > 0, 'کارهایی در Status «منتظر دیگران»')
refused(S0, me, { type: 'psSave', statuses: b0.statuses.filter((x) => x.id !== wait.id), defaultStatusId: b0.defaultStatusId }, 'حذف Status پر بدون انتخاب Status جایگزین')
s = allowed(S0, me, { type: 'psSave', statuses: b0.statuses.filter((x) => x.id !== wait.id), defaultStatusId: b0.defaultStatusId, remap: { [wait.id]: 'ps-doing' } }, 'حذف Status با انتقال کارها')
ok(tasksOf(s.personalTasks, me).filter((t) => t.statusId === 'ps-doing').length === tasksOf(S0.personalTasks, me).filter((t) => t.statusId === 'ps-doing').length + inWait, 'کارها به «در حال انجام» منتقل شد')
refused(S0, me, { type: 'psSave', statuses: b0.statuses.map((x) => ({ ...x, done: false })), defaultStatusId: b0.defaultStatusId }, 'بدون Status تکمیل‌شده')
refused(S0, me, { type: 'psSave', statuses: b0.statuses.map((x) => ({ ...x, name: 'یکسان' })), defaultStatusId: b0.defaultStatusId }, 'نام تکراری')
refused(S0, me, { type: 'psSave', statuses: b0.statuses, defaultStatusId: 'ps-nope' }, 'پیش‌فرض نامعتبر')
const reordered = [...b0.statuses].reverse().map((x) => (x.id === 'ps-idea' ? { ...x, name: 'ایده‌ها', color: '#0f8a80' } : x))
s = allowed(S0, me, { type: 'psSave', statuses: reordered, defaultStatusId: 'ps-idea' }, 'تغییر نام، رنگ، ترتیب و پیش‌فرض')
const b1 = boardOf(s.personalBoards, me)
ok(b1.statuses[0].id === b0.statuses[b0.statuses.length - 1].id && b1.statuses.find((x) => x.id === 'ps-idea')!.name === 'ایده‌ها' && b1.defaultStatusId === 'ps-idea', 'ترتیب، نام، رنگ و پیش‌فرض ذخیره شد')
s = allowed(s, me, { type: 'ptCreate', task: { title: 'کار تازه' } }, 'کار تازه با پیش‌فرض تازه')
ok(newest(s, me).statusId === 'ps-idea', 'کار تازه در Status پیش‌فرض تازه')
const flip = b0.statuses.map((x) => (x.id === 'ps-wait' ? { ...x, done: true } : x))
s = allowed(S0, me, { type: 'psSave', statuses: flip, defaultStatusId: b0.defaultStatusId }, '«منتظر دیگران» تکمیل‌شده حساب شود')
ok(tasksOf(s.personalTasks, me).filter((t) => t.statusId === 'ps-wait').every((t) => !!t.completedAt), 'کارهای آن Status تکمیل‌شده شدند')
ok(org(s) === org(S0), 'تنظیم Statusهای شخصی روی Status Setهای پروژه اثری ندارد')

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
