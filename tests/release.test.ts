// Release checks: the MDR link of each project (shortcut on the project page) and project definition rules.
import { initialState, reducer, type State } from '../src/lib/store'
import { isMdrUrl, mdrHref } from '../src/lib/mdr'
import type { Project } from '../src/lib/types'

let pass = 0, fail = 0
const results: string[] = []
const ok = (cond: unknown, name: string) => { if (cond) { pass++; results.push(`  ✓ ${name}`) } else { fail++; results.push(`  ✗ ${name}`) } }
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const data = (s: State) => JSON.stringify({ ...s, audit: null, denial: null })
function refused(s: State, user: string, a: A, name: string) {
  const before = as(s, user)
  const after = reducer(before, a)
  ok(after.denial && data(after) === data(before) && after.audit[0]?.kind === 'security', `رد شد و هیچ داده‌ای عوض نشد: ${name}${after.denial ? ` («${after.denial.text}»)` : ' (اجرا شد!)'}`)
  return after
}
function allowed(s: State, user: string, a: A, name: string) {
  const after = reducer(as(s, user), a)
  ok(!after.denial, `مجاز: ${name}${after.denial ? ` — ${after.denial.text}` : ''}`)
  return after
}
const S0 = initialState()
const U = (username: string) => S0.users.find((u) => u.username === username)!
const ceo = U('ceo'), ctl = U('n.rahimi'), pm = U('g.afshar'), member = U('s.rezaei'), mgmt = U('b.sepehri')
const SHEET = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEF/edit#gid=1834'

results.push('لینک MDR')
ok(mdrHref(SHEET) === SHEET, 'لینک کامل Google Sheet همان‌طور می‌ماند (با برگه‌ی gid)')
ok(mdrHref('docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit') === 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'لینک بدون https کامل می‌شود')
ok(mdrHref('http://docs.google.com/spreadsheets/u/0/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit')?.startsWith('https://'), 'http به https تبدیل می‌شود')
ok(['', '   ', 'docs.google.com/spreadsheets/d/…/BBT-MDR', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'https://example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'javascript:alert(1)', 'https://docs.google.com.evil.io/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'https://docs.google.com/spreadsheets/d/short'].every((x) => !isMdrUrl(x)), 'متن خالی، نمونه‌ی ناقص، Google Doc، دامنه‌ی دیگر، javascript: و شناسه‌ی کوتاه پذیرفته نمی‌شوند')
ok(S0.projects.every((p) => p.mdrUrl === '' && p.mdrTab), 'پروژه‌های نمونه لینک MDR واقعی ندارند (خالی، نه یک لینک ساختگی)')

results.push('ثبت و ویرایش لینک MDR')
let s = allowed(S0, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { mdrUrl: SHEET, mdrTab: 'MDR' } }, 'کنترل پروژه لینک MDR پروژه‌ی BBT را ثبت می‌کند')
ok(s.projects.find((p) => p.id === 'BBT')!.mdrUrl === SHEET && mdrHref(s.projects.find((p) => p.id === 'BBT')!.mdrUrl) === SHEET, 'لینک ذخیره شد و همان لینک باز می‌شود')
ok(s.projects.filter((p) => p.id !== 'BBT').every((p) => p.mdrUrl === ''), 'لینک فقط برای همان پروژه ثبت شد (هر پروژه MDR خودش را دارد)')
s = allowed(s, ceo.id, { type: 'projectUpdate', id: 'RNX', patch: { mdrUrl: SHEET.replace('1834', '77') } }, 'مدیرعامل لینک MDR پروژه‌ی دیگری را ثبت می‌کند')
refused(s, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { mdrUrl: 'https://example.com/x' } }, 'لینک غیر Google Sheet')
refused(s, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { mdrUrl: '' } }, 'پاک کردن لینک ثبت‌شده با متن خالی')
refused(s, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { mdrTab: '  ' } }, 'نام برگه‌ی خالی')
for (const [u, why] of [[pm, 'مدیر پروژه'], [member, 'عضو تیم'], [mgmt, 'مدیریت']] as const) refused(S0, u.id, { type: 'projectUpdate', id: 'BBT', patch: { mdrUrl: SHEET } }, `ثبت لینک MDR توسط ${why}`)
refused(S0, ctl.id, { type: 'projectUpdate', id: 'NOPE', patch: { mdrUrl: SHEET } }, 'پروژه‌ای که وجود ندارد')
refused(S0, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { code: 'XYZ' } as Partial<Project> }, 'عوض کردن کد پروژه')
refused(S0, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { managerId: member.id } }, 'مدیر پروژه‌ای که نقش مدیر پروژه ندارد')
allowed(S0, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { lastSync: new Date().toISOString() } }, 'به‌روزرسانی زمان Sync مثل قبل')
allowed(S0, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { phase1TeamId: 'p1b' } }, 'تغییر تیم فاز ۱ مثل قبل')
refused(S0, ctl.id, { type: 'projectUpdate', id: 'BBT', patch: { phase1TeamId: 'p2a' } }, 'تیم فاز ۲ به‌جای تیم فاز ۱')

results.push('تعریف پروژه با MDR خودش')
const np = (extra: Partial<Project> = {}): Project => ({ id: 'TJR', code: 'TJR', name: 'مجتمع مسکونی تجریش', type: 'مسکونی', phase1TeamId: 'p1d', phase2TeamId: 'p2b', mdrUrl: SHEET, mdrTab: 'MDR', ...extra })
s = allowed(S0, ctl.id, { type: 'projectAdd', project: np() }, 'تعریف پروژه با لینک MDR خودش')
ok(s.projects.some((p) => p.id === 'TJR' && p.mdrUrl === SHEET) && s.audit[0].text.includes('TJR'), 'پروژه با لینک MDR ذخیره و در AuditLog ثبت شد')
refused(S0, ctl.id, { type: 'projectAdd', project: np({ mdrUrl: '' }) }, 'تعریف پروژه بدون MDR')
refused(S0, ctl.id, { type: 'projectAdd', project: np({ mdrUrl: 'docs.google.com/spreadsheets/d/…' }) }, 'تعریف پروژه با لینک ناقص')
refused(S0, ctl.id, { type: 'projectAdd', project: np({ id: 'BBT', code: 'BBT' }) }, 'کد تکراری')
refused(S0, ctl.id, { type: 'projectAdd', project: np({ id: 'تج', code: 'تج' }) }, 'کد غیر لاتین')
refused(S0, ctl.id, { type: 'projectAdd', project: np({ name: ' ' }) }, 'بدون نام')
refused(S0, ctl.id, { type: 'projectAdd', project: np({ phase1TeamId: 'int' }) }, 'تیم فاز ۱ نامعتبر')
refused(S0, member.id, { type: 'projectAdd', project: np() }, 'تعریف پروژه توسط عضو تیم')

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
