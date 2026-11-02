// MDR Sync: reading the office's fixed MDR template, identity of rows, weights, the Sync Review diff, re-runs,
// rejected proposals, rows that come back, and the write-back of the three internal columns.
import { initialState, reducer, type State } from '../src/lib/state'
import { MdrError, colLetter, diffMdr, jalaliCell, parseJalali, parseMdr, parseWeight, planWriteBack, sheetIdOf, todoStatusFor, type MdrSheet } from '../src/lib/mdrSync'
import { rollupMap } from '../src/lib/state'
import { HEADERS, N, R, rowOf, sampleMdr } from './fixtures/mdr'
import type { SyncRun, Task } from '../src/lib/types'

let pass = 0, fail = 0
const out: string[] = []
const ok = (c: unknown, name: string) => { if (c) { pass++; out.push(`  ✓ ${name}`) } else { fail++; out.push(`  ✗ ${name}`) } }
const head = (s: string) => out.push(s)

head('خواندن قالب MDR')
const V = sampleMdr()
const sh = parseMdr(V)
ok(sh.headerRow === 2 && sh.title === 'Sample Tower' && sh.buildingType === 'Residential', 'سطر هدر (۲)، نام پروژه و نوع ساختمان از سطر ۱')
ok(sh.columns.docNumber === 2 && sh.columns.lastDate === 32 && sh.columns.lastStatus === 33 && sh.columns.progress === 34 && colLetter(sh.columns.lastDate!) === 'AG' && colLetter(sh.columns.progress!) === 'AI', 'ستون‌ها با نام هدر پیدا شدند (ستون‌های internal = AG، AH، AI)')
const count = (l: string) => sh.rows.filter((r) => r.level === l).length
ok(sh.rowsRead === 33 && count('phase') === 3 && count('stage') === 3 && count('group') === 6 && count('doctype') === 7 && count('document') === 14, `۳۳ سطر داده: ۳ Phase، ۳ Stage، ۶ summary، ۷ Docs، ۱۴ سند (${sh.rowsRead})`)
ok(sh.lastDataRow === 35 && !sh.rows.some((r) => ['UG05', 'GF00', 'Code'].includes(r.docNumber ?? r.name)), 'جدول‌های راهنمای زیر MDR (طبقات، کد وضعیت) سطر MDR حساب نمی‌شوند')
const byNo = (n: string, name?: string) => sh.rows.find((r) => r.docNumber === n && (!name || r.name === name))!
const byName = (name: string) => sh.rows.find((r) => r.name === name)!
ok(byNo(N.ug01).path.join(' › ') === 'Phase I › Concept Design › CD Plans › Architectural Plans CD', 'سلسله‌مراتب از جایگاه سطر: Phase › Stage › summary › Docs')
ok(byName('Estimation').level === 'group' && byName('Estimation').path.join('/') === 'Phase II/Design Development', 'summary با Parent 4 خالی (مثل MDR واقعی) سر جایش می‌نشیند')
ok(byNo(N.est2).path[3] === 'Architectural Estimation' && byNo(N.est2).warnings.some((w) => w.includes('Parent 1') && w.includes('جایگاه سطر ملاک است')), 'Parent 1 ناهماهنگ با جایگاه: هشدار، و جایگاه سطر ملاک است')
ok(byNo(N.ug01).subtasks.join('|') === 'ترسیم پلان|اندازه گذاری|ارائه' && byNo(N.render, 'Balcony Render').subtasks.join('|') === 'مدل سازی|رندر', 'SubTask (Design) و SubTask (Render) جدا شدند')
ok(byNo(N.ug01).floor === '1ST Basement' && byNo(N.render, 'Balcony Render').pkg === 'Package 1', 'Floor و Package')
ok(byNo(N.index).planIssue === parseJalali('1405-02-05') && parseJalali('1405-02-05') === '2026-04-25' && byNo(N.ws1).planIssue === undefined && byNo(N.ws1).warnings.some((w) => w.includes('1405-13-40')), 'Plan Issue Date شمسی خوانده شد؛ تاریخ نامعتبر هشدار می‌گیرد')
ok(byNo(N.index).internal.date === '1405-02-10' && byNo(N.index).internal.progress === '0.00%', 'مقدار فعلی ستون‌های internal خوانده می‌شود')

head('شناسه‌ی سطرها')
const balcony = byNo(N.render, 'Balcony Render'), hall = byNo(N.render, 'Multipurpose Hall Render')
ok(balcony.key !== hall.key && balcony.key === `${N.render}|balcony render` && balcony.warnings.some((w) => w.includes('تکراری')) && sh.warnings.some((w) => w.includes('تکراری')), 'Document Number تکراری: شماره + نام شناسه است و هشدار داده می‌شود')
const ws = sh.rows.filter((r) => r.name === 'Wall Section A')
ok(ws.length === 3 && new Set(ws.map((r) => r.key)).size === 3 && ws.every((r) => r.key === r.docNumber), 'نام یکسان با شماره‌های متفاوت: سه سند جدا')
ok(byName('CD Plans').key.endsWith('/g#100') && byName('Architectural Plans CD').key.endsWith('/d#110'), 'summary و Docs با کد Serial Number شناخته می‌شوند (تغییر نام، سطر تازه نمی‌سازد)')
ok(byName('Estimation').key.endsWith('/g:estimation'), 'summary بدون کد با نامش شناخته می‌شود')

head('Weight')
ok(parseWeight('0.25%').value === 0.25 && parseWeight('39.00%').value === 39 && parseWeight('').value === null && parseWeight('#DIV/0!').error && parseWeight('abc').error && parseWeight('۲٫۵%').value === 2.5, 'خواندن Weight: درصد، خالی، خطای فرمول، ارقام فارسی')
ok(byName('Phase I').w === 39 && !byName('Phase I').derived && byName('CD Renders').w === 4.25, 'همه‌ی هم‌سطح‌ها Weight دارند: همان Weight')
const plans = sh.rows.filter((r) => r.path[3] === 'Architectural Plans CD')
ok(plans.length === 4 && plans.every((r) => r.w === 1 && r.derived && r.warnings.some((w) => w.includes('فقط برای 1 از 4'))), 'فقط سطر اول Weight دارد (الگوی MDR): ۴٪ والد به تساوی میان ۴ سند (۱٪) + هشدار')
ok(byNo(N.urban).w === 0 && byNo(N.urban).derived && !byNo(N.urban).warnings.length, 'هیچ هم‌سطحی Weight ندارد: سهم مساوی از والد، بدون هشدار')
ok(ws.every((r) => r.w === 1 && r.derived) && byNo(N.ws3).warnings.some((w) => w.includes('#DIV/0!')), 'سلول #DIV/0!: هشدار و تقسیم مساوی')
ok(byName('Estimation').w === 30.375 && byName('Sections').w === 30.375, 'summary بدون Weight کنار summary با Weight: تقسیم مساوی ۶۰٫۷۵٪')

head('ساختار نادرست')
const err = (f: () => unknown) => { try { f(); return '' } catch (e) { return e instanceof MdrError ? e.message : `!${String(e)}` } }
ok(err(() => parseMdr([['a'], ['b']])).includes('سطر هدر'), 'بدون سطر هدر: خطای روشن')
ok(err(() => parseMdr([[], HEADERS.filter((h) => h !== 'Weight' && h !== 'Progress (internal)')])).includes('weight') && err(() => parseMdr([[], HEADERS.filter((h) => h !== 'Progress (internal)')])).includes('progress (internal)'), 'ستون لازم نیست: نام همان ستون گفته می‌شود')
ok(err(() => parseMdr([[], HEADERS, [], []])).includes('سطر داده'), 'MDR خالی: خطای روشن')
// a column inserted before "Document Number" (people add columns): columns are found by name
const shifted = V.map((r, i) => (i === 0 ? r : [r[0] ?? '', i === 1 ? 'Note' : '', ...r.slice(1)]))
const sh2 = parseMdr(shifted)
ok(sh2.rows.length === 33 && sh2.columns.docNumber === 3 && colLetter(sh2.columns.lastDate!) === 'AH' && sh2.rows.every((r, i) => r.key === sh.rows[i].key), 'ستون تازه پیش از Document Number: همان سطرها و همان شناسه‌ها؛ ستون‌های internal جابه‌جا پیدا شدند')
ok(parseMdr(V.map((r, i) => (i === 1 ? r.map((h) => (h === 'To Clickup' ? 'To Jira' : h)) : r))).rows.length === 33, 'قالب نوریان («To Jira» به‌جای «To Clickup») هم خوانده می‌شود')

head('Sync Review در سامانه')
const S0 = initialState()
const U = (u: string) => S0.users.find((x) => x.username === u)!
const ctl = U('n.rahimi'), ceo = U('ceo'), member = U('s.rezaei')
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/12u_wTnmS2EuL4yAveE4yFUNTFjEsl4F0k55Yq1pvtuQ/edit?gid=984903047#gid=984903047'
let s = reducer({ ...S0, session: ctl.id }, { type: 'projectAdd', project: { id: '900', code: '900', name: 'برج نمونه', type: 'مسکونی', phase1TeamId: 'p1a', phase2TeamId: 'p2a', mdrUrl: SHEET_URL, mdrTab: 'MDR' } })
ok(!s.denial && s.projects.some((p) => p.id === '900'), 'کد پروژه‌ی عددی (مثل 458) پذیرفته می‌شود')
let k = 0
function sync(st: State, values: string[][]) {
  k++
  const sheet = parseMdr(values)
  const runId = `run-t${k}`
  const run: SyncRun = { id: runId, projectId: '900', trigger: 'manual', at: new Date().toISOString(), durationSec: 0, state: 'running', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [] }
  let n = reducer({ ...st, session: null }, { type: 'sysRunStart', run })
  let i = 0
  const d = diffMdr({ projectId: '900', tasks: n.tasks, sheet, runId, todoStatusId: todoStatusFor(n, '900'), previous: n.syncItems.filter((x) => x.projectId === '900'), newItemId: () => `si-t${k}-${i++}` })
  n = reducer(n, { type: 'sysSyncResult', projectId: '900', runId, run: { state: 'success', rowsRead: sheet.rowsRead }, items: d.items, refresh: d.refresh, at: new Date().toISOString(), replacePending: true, by: ctl.id })
  return { s: n, d, sheet }
}
const pend = (st: State) => st.syncItems.filter((x) => x.projectId === '900' && x.state === 'pending')
let r1 = sync(s, V)
ok(r1.d.items.length === 33 && r1.d.items.every((x) => x.kind === 'new') && pend(r1.s).length === 33, 'اولین Sync: ۳۳ ردیف جدید در صف Sync Review (هیچ تسکی بی‌تأیید ساخته نشد)')
ok(!Object.values(r1.s.tasks).some((t) => t.projectId === '900'), 'تا تأیید کنترل پروژه، تسکی ساخته نمی‌شود')
ok(r1.s.syncRuns[0].id === 'run-t1' && r1.s.syncRuns[0].state === 'success' && r1.s.projects.find((p) => p.id === '900')!.lastSync, 'اجرای Sync و زمان آخرین Sync ثبت شد')
ok(r1.s.notifications.some((x) => x.userId === ctl.id && x.title.includes('33 ردیف')) && r1.s.audit[0].kind === 'sync' && r1.s.audit[0].userId === ctl.id, 'کنترل پروژه اعلان گرفت و AuditLog به نام اجراکننده ثبت شد')
const first = r1.d.items.map((x) => x.task!.id)
const r1b = sync(s, V)
ok(JSON.stringify(r1b.d.items.map((x) => x.task!.id)) === JSON.stringify(first), 'شناسه‌ی تسک‌ها در هر اجرا یکی است (قطعی، نه تصادفی)')
ok(first.includes(`900:${N.ug01}`) && r1.d.items.find((x) => x.task!.docNumber === N.ug01)!.task!.parentId === r1.d.items.find((x) => x.task!.name === 'Architectural Plans CD')!.task!.id, 'شناسه‌ی سند از Document Number؛ والد همان ردیف Docs')
// re-running before review replaces the pending proposals instead of adding duplicates
r1 = sync(r1.s, V)
ok(pend(r1.s).length === 33 && r1.s.syncItems.filter((x) => x.projectId === '900').length === 33, 'Sync دوباره پیش از بررسی: صف تکراری نمی‌شود (Idempotent)')
// approve only one document: its doc type, group, stage and phase come with it
const one = pend(r1.s).find((x) => x.task?.docNumber === N.index)!
s = reducer({ ...r1.s, session: member.id }, { type: 'review', ids: [one.id], approve: true })
ok(s.denial && !Object.values(s.tasks).some((t) => t.projectId === '900'), 'عضو تیم نمی‌تواند Sync Review را تأیید کند')
s = reducer({ ...r1.s, session: ctl.id }, { type: 'review', ids: [one.id], approve: true })
const made = Object.values(s.tasks).filter((t) => t.projectId === '900')
ok(made.length === 5 && made.map((t) => t.kind).sort().join(',') === 'doctype,document,group,phase,stage', 'تأیید یک سند، شاخه‌ی بالادستش را هم می‌سازد (Phase › Stage › summary › Docs)')
s = reducer({ ...s, session: ctl.id }, { type: 'review', ids: pend(s).map((x) => x.id), approve: true })
const T = (no: string) => Object.values(s.tasks).find((t) => t.projectId === '900' && t.docNumber === no)!
ok(Object.values(s.tasks).filter((t) => t.projectId === '900').length === 33 && !pend(s).length, 'تأیید همه: ۳۳ تسک')
ok(T(N.ug01).statusId === 'st-todo' && !T(N.ug01).assigneeUserId && T(N.ug01).mdrRow === rowOf(V, N.ug01) && T(N.ug01).order === T(N.ug01).mdrRow && T(N.ug01).floor === '1ST Basement' && T(N.ug01).weight === 1 && T(N.ug01).weightDerived, 'سند تازه: Status اول، Unassigned، ردیف MDR، Floor، Weight مشتق')
ok(T(N.ug01).mdrSubtasks?.length === 3 && T(N.index).planIssue === '2026-04-25', 'SubTaskها و Plan Issue Date روی تسک')
const roll = rollupMap(s)
const phaseI = Object.values(s.tasks).find((t) => t.projectId === '900' && t.kind === 'phase' && t.name === 'Phase I')!
ok(roll.roll[phaseI.id].items === 6 && roll.roll[phaseI.id].progress === 0, 'Roll-up پروژه روی تسک‌های MDR کار می‌کند')

head('Sync بعدی: فقط تغییرها')
let r2 = sync(s, V)
ok(r2.d.items.length === 0 && r2.d.unchanged === 33 && !r2.d.refresh.length, 'بدون تغییر در MDR: هیچ ردیفی در صف نیست')
// people edit the MDR: a row inserted at the top, a rename, a weight, a floor, a package, a move, a removal, a new document
const V2 = sampleMdr()
const at = (no: string, name?: string) => V2.findIndex((r) => r[2] === no && (!name || r[7] === name))
V2[at(N.ag02)][7] = '2ND Floor Plan CD'
V2[at(N.render, 'Balcony Render')][18] = '1.50%'
V2[at(N.render, 'Balcony Render')][19] = 'Package 2'
V2[at(N.ag01)][17] = 'Mezzanine Floor'
V2.splice(at(N.ws3), 1)
// "Structural Estimation" gets its own Docs row: it moves under it
V2.splice(at(N.est2), 0, R({ A: '900', I: 'Phase II', G: 'Structural Estimation', K: 'Design Development', M: 'Estimation', N: 'Estimation', R: 'General', S: '0.00%', AD: '740' }))
V2.splice(at(N.gf00) + 1, 0, R({ A: '900', I: 'Phase I', C: '900-PRG-EN-CD-ARC-DWG-MZ00-1100251', H: 'Mezzanine Architectural Plans CD', K: 'Concept Design', M: 'CD Plans', O: 'Architectural Plans CD', R: 'Mezzanine Floor' }))
V2.splice(2, 0, R({ A: '900', H: '' }))
r2 = sync(s, V2)
const kinds = (kind: string) => r2.d.items.filter((x) => x.kind === kind)
const changed = (no: string, name?: string) => kinds('changed').find((x) => s.tasks[x.taskId!].docNumber === no && (!name || s.tasks[x.taskId!].name === name))
ok(changed(N.ag02)?.changes?.some((c) => c.field === 'name' && c.to === '2ND Floor Plan CD'), 'تغییر نام سند → ردیف «تغییر»')
ok(changed(N.render, 'Balcony Render')?.changes?.map((c) => c.field).sort().join(',') === 'package,weight' && changed(N.render, 'Balcony Render')?.changes?.find((c) => c.field === 'weight')?.to === '1.5', 'تغییر Weight و Package')
ok(changed(N.ag01)?.changes?.find((c) => c.field === 'floor')?.to === 'Mezzanine Floor', 'تغییر Floor')
ok(changed(N.ag01)?.changes?.find((c) => c.field === 'weight')?.to === '0.8' && changed(N.ug01)?.changes?.find((c) => c.field === 'weight')?.derived, 'سند تازه زیر همان Docs: سهم مساوی دوباره حساب شد (۴٪ ÷ ۵)')
const moved = changed(N.est2)
const newDocs = kinds('new').map((x) => x.task!)
ok(moved?.changes?.some((c) => c.field === 'parent' && c.to === 'Structural Estimation' && newDocs.some((t) => t.id === c.toParentId)), 'جابه‌جایی سند زیر Docs تازه → تغییر والد به ردیف جدید')
ok(newDocs.length === 2 && newDocs.some((t) => t.kind === 'doctype' && t.name === 'Structural Estimation') && newDocs.some((t) => t.docNumber?.endsWith('1100251')), 'ردیف‌های تازه‌ی MDR → ردیف «جدید»')
ok(kinds('removed').length === 1 && s.tasks[kinds('removed')[0].taskId!].docNumber === N.ws3, 'سند حذف‌شده از MDR → ردیف «حذف»')
// the row inserted at the top moved every row by one: that is a reference refresh, not a change to review
ok(r2.d.refresh.length >= 30 && !kinds('changed').some((x) => x.changes?.some((c) => c.field === 'parent') && s.tasks[x.taskId!].docNumber !== N.est2), 'سطر اضافه بالای MDR: ردیف‌ها بدون Sync Review به‌روز می‌شوند')
ok(r2.s.tasks[`900:${N.index}`].mdrRow === rowOf(V2, N.index) && r2.s.tasks[`900:${N.index}`].mdrRow === rowOf(V, N.index) + 1, 'شماره‌ی ردیف MDR تسک‌ها جابه‌جا شد')
// approve the move: its new parent is created first
s = reducer({ ...r2.s, session: ctl.id }, { type: 'review', ids: [moved!.id], approve: true })
const est2 = Object.values(s.tasks).find((t) => t.docNumber === N.est2)!
ok(s.tasks[est2.parentId!]?.name === 'Structural Estimation' && s.tasks[est2.parentId!]?.kind === 'doctype', 'تأیید جابه‌جایی، Docs تازه را هم می‌سازد')
// reject the rest: the same proposals do not come back while the MDR stays as it is
const rest = pend(s).filter((x) => x.kind !== 'removed')
s = reducer({ ...s, session: ctl.id }, { type: 'review', ids: rest.map((x) => x.id), approve: false })
const r3 = sync(s, V2)
ok(r3.d.items.length === 1 && r3.d.items[0].kind === 'removed' && r3.d.skippedRejected === rest.length, `پیشنهاد ردشده تا وقتی MDR همان است دوباره نمی‌آید (${r3.d.skippedRejected} مورد)`)
const V3 = V2.map((r) => [...r])
V3[V3.findIndex((r) => r[2] === N.ag02)][7] = '2ND Floor Plans CD'
ok(sync(s, V3).d.items.some((x) => x.kind === 'changed' && x.changes?.[0].to === '2ND Floor Plans CD'), 'اگر همان سطر MDR دوباره تغییر کند، دوباره پیشنهاد می‌شود')

head('حذف و بازگشت')
s = r3.s
const rm = pend(s).find((x) => x.kind === 'removed')!
const ws3id = rm.taskId!
s = reducer({ ...s, session: ctl.id }, { type: 'savePlan', taskId: ws3id, assignee: { kind: 'user', id: member.id }, estimation: 6, start: undefined, due: undefined, allocations: [] })
s = reducer({ ...s, session: ctl.id }, { type: 'review', ids: [rm.id], approve: true })
ok(s.tasks[ws3id].removedFromMdr && s.tasks[ws3id].assigneeUserId === member.id, 'تأیید حذف: تسک پاک نمی‌شود، «Removed from MDR» می‌گیرد و تخصیصش می‌ماند')
const r4 = sync(s, V)
const back = r4.d.items.find((x) => x.kind === 'new' && x.task!.id === ws3id)
ok(back && back.warnings?.some((w) => w.includes('دوباره در MDR')), 'سند دوباره در MDR: پیشنهاد بازگشت همان تسک')
s = reducer({ ...r4.s, session: ctl.id }, { type: 'review', ids: [back!.id], approve: true })
ok(!s.tasks[ws3id].removedFromMdr && s.tasks[ws3id].assigneeUserId === member.id && s.tasks[ws3id].estimation === 6, 'بازگشت با همان سابقه و برنامه')

head('Write-back')
const sheet2: MdrSheet = parseMdr(V2)
const plan = planWriteBack(sheet2, 'MDR', [
  { task: s.tasks[`900:${N.ug01}`], statusName: 'در حال طراحی', progress: 25, date: '2026-11-02' },
  { task: Object.values(s.tasks).find((t) => t.name === 'Multipurpose Hall Render')!, statusName: 'صادر شد', progress: 100, date: '2026-11-02' },
  { task: { ...s.tasks[`900:${N.ug01}`], id: 'x', mdrKey: '900-NOT-IN-MDR', docNumber: '900-NOT-IN-MDR' } as Task, statusName: 'x', progress: 1, date: '2026-11-02' },
])
const rowUg = rowOf(V2, N.ug01), rowHall = V2.findIndex((r) => r[7] === 'Multipurpose Hall Render') + 1
ok(plan.found.length === 2 && plan.missing.length === 1 && plan.cells === 6, 'دو سند پیدا شد، سندی که در MDR نیست جدا گزارش شد؛ ۶ سلول')
ok(plan.raw.map((x) => x.range).join(' ') === `'MDR'!AG${rowUg} 'MDR'!AH${rowUg} 'MDR'!AG${rowHall} 'MDR'!AH${rowHall}` && plan.entered.map((x) => x.range).join(' ') === `'MDR'!AI${rowUg} 'MDR'!AI${rowHall}`, 'فقط سه ستون internal همان ردیف (ردیف دوباره با Document Number پیدا شد)')
ok(plan.raw[0].values[0][0] === '1405-08-11' && jalaliCell('2026-11-02') === '1405-08-11' && plan.raw[1].values[0][0] === 'در حال طراحی' && plan.entered[0].values[0][0] === '25%', 'تاریخ شمسی MDR، نام Status و Progress درصدی')
ok(rowHall !== V2.findIndex((r) => r[7] === 'Balcony Render') + 1, 'Document Number تکراری: ردیف درست با نام سند پیدا شد')
ok(planWriteBack(sheet2, "Bob's MDR", [{ task: s.tasks[`900:${N.ug01}`], statusName: 'a', progress: 0, date: '2026-11-02' }]).raw[0].range.startsWith("'Bob''s MDR'!"), 'نام Tab با کوتیشن درست نوشته می‌شود')

head('امنیت')
for (const u of [ceo, ctl, member]) {
  const t = reducer({ ...S0, session: u.id }, { type: 'sysSyncResult', projectId: 'BBT', runId: 'x', run: {}, items: [], refresh: [], at: '', replacePending: true })
  ok(t.denial && t.audit[0].kind === 'security', `نتیجه‌ی Sync را حتی ${u.username} از مرورگر نمی‌تواند ثبت کند`)
}
ok(reducer({ ...S0, session: ctl.id }, { type: 'sysWriteBack', runs: [], settled: [], rows: [] }).denial, 'نتیجه‌ی Write-back فقط از سامانه')
ok(!reducer({ ...S0, session: null }, { type: 'sysRunStart', run: { ...r1.s.syncRuns[0], id: 'sys' } }).denial, 'خود سامانه (بدون کاربر) اجرای Sync را ثبت می‌کند')

head('لینک‌های MDR پروژه‌ها')
ok(sheetIdOf('https://docs.google.com/spreadsheets/d/12u_wTnmS2EuL4yAveE4yFUNTFjEsl4F0k55Yq1pvtuQ/edit?gid=984903047#gid=984903047') === '12u_wTnmS2EuL4yAveE4yFUNTFjEsl4F0k55Yq1pvtuQ'
  && sheetIdOf('https://docs.google.com/spreadsheets/d/1J16MZtfc2irM2W3NB4Ki-oFh56RZA8pU0El6Do5eLfs/edit?gid=984903047') === '1J16MZtfc2irM2W3NB4Ki-oFh56RZA8pU0El6Do5eLfs'
  && sheetIdOf('https://docs.google.com/spreadsheets/u/1/d/1-gQwm6wRDkcsEJileNSEsb1KNRpreS1MV7P_EfMraqM/edit') === '1-gQwm6wRDkcsEJileNSEsb1KNRpreS1MV7P_EfMraqM', 'شناسه‌ی Google Sheet از لینک MDR بابلسر، درروس و نوریان')

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
