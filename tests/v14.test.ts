// v14 acceptance tests: team spaces for the CEO and Project Control, one field taxonomy for tasks,
// and the Finance & Administration space. Every dispatch is the browser equivalent of calling the API directly.
import { initialState, reducer, flowOf, flowProgress, type State } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { addDays } from '../src/lib/jalali'
import { PERMISSION_MATRIX, ROLE_FA, ROLE_ORDER, assignableRoles, canCreateInternalProject, canManageFlowTask, canSeeAuditEntry, canSeeFinSpace, canSeeTeamSpace, canViewTask, finSpacesOf, listFinTasks } from '../src/lib/policy'
import { finProjectId, finSpaceOf } from '../src/lib/domain'
import { AUDIT_FIELD, FIELD_GROUPS, TASK_FIELDS, fieldsOf, hasField, type FieldKey } from '../src/lib/taskFields'
import type { Task } from '../src/lib/types'

let pass = 0, fail = 0
const results: string[] = []
const ok = (cond: unknown, name: string) => { if (cond) { pass++; results.push(`  ✓ ${name}`) } else { fail++; results.push(`  ✗ ${name}`) } }
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const data = (s: State) => JSON.stringify({ ...s, audit: null, denial: null })
function refused(s: State, user: string, a: A, name: string) {
  const before = as(s, user)
  const after = reducer(before, a)
  ok(after.denial && data(after) === data(before) && after.audit[0]?.kind === 'security', `رد شد و هیچ داده‌ای عوض نشد: ${name}${after.denial ? '' : ' (اجرا شد!)'}`)
  return after
}
function allowed(s: State, user: string, a: A, name: string) {
  const after = reducer(as(s, user), a)
  ok(!after.denial, `مجاز: ${name}${after.denial ? ` — ${after.denial.text}` : ''}`)
  return after
}
const S0 = initialState()
const U = (username: string) => S0.users.find((u) => u.username === username)!
const ceo = U('ceo'), ctl = U('n.rahimi'), office = U('m.tavana'), fin = U('f.sadri'), mgmt = U('b.sepehri'), pm = U('g.afshar'), member = U('s.rezaei'), intLead = U('s.mohammadi'), intMember = U('h.karimi'), inspector = U('y.babaei'), renLead = U('m.rostami')
const due = addDays(TODAY, 10), start = addDays(TODAY, 2)

// ===================== 1. Team spaces =====================
results.push('۱. فضای تیم‌ها برای مدیرعامل و کنترل پروژه')
ok(PERMISSION_MATRIX['teamspace.all'].includes('ceo') && PERMISSION_MATRIX['teamspace.all'].includes('control') && PERMISSION_MATRIX['teamspace.all'].length === 2, 'دسترسی «فضای همه‌ی تیم‌ها» فقط برای مدیرعامل و کنترل پروژه')
ok(S0.teams.every((t) => canSeeTeamSpace(ceo, t.id) && canSeeTeamSpace(ctl, t.id)), `مدیرعامل و کنترل پروژه هر ${S0.teams.length} فضای تیم را می‌بینند`)
ok(S0.teams.filter((t) => canSeeTeamSpace(intLead, t.id)).length === 1 && S0.teams.filter((t) => canSeeTeamSpace(member, t.id)).length === 1 && !canSeeTeamSpace(pm, 'int') && !canSeeTeamSpace(mgmt, 'int'), 'بقیه (سرپرست، عضو، مدیر پروژه، مدیریت) فقط فضای تیم خود را می‌بینند')
const internal = Object.values(S0.tasks).filter((t) => t.kind === 'internal')
ok(internal.every((t) => canViewTask(S0, ctl, t) && canViewTask(S0, ceo, t)), `کنترل پروژه و مدیرعامل همه‌ی ${internal.length} تسک فضای تیم‌ها را با مسئول و پیشرفت می‌بینند`)
ok(internal.every((t) => canManageFlowTask(S0, ctl, t)), 'کنترل پروژه تسک‌های همه‌ی تیم‌ها را پایش و مدیریت می‌کند (ویرایش، ارجاع، بازگشایی)')

const intTask = (id: string, extra: Partial<Task> = {}): Task => ({ id, projectId: 'team:int', parentId: null, kind: 'internal', name: 'به‌روزرسانی کتابخانه‌ی جزئیات', order: 99, source: 'manual', teamSpaceId: 'int', priority: 'high', assigneeUserId: intMember.id, reviewerId: intLead.id, start, due, estimation: 6, description: 'از فضای کلی تیم‌ها', ...extra })
let s = allowed(S0, ctl.id, { type: 'createFlowTask', task: intTask('IN-V14-1') }, 'کنترل پروژه در فضای تیم طراحی داخلی تسک می‌سازد و به عضو همان تیم ارجاع می‌دهد')
const made = s.tasks['IN-V14-1']
ok(made && made.teamSpaceId === 'int' && made.projectId === 'team:int' && made.kind === 'internal', 'تسک در فضای همان تیم ثبت شد (مالکیت تیم عوض نشد)')
ok(made.priority === 'high' && made.due === due && made.start === start && made.estimation === 6 && made.assigneeUserId === intMember.id && made.reviewerId === intLead.id && made.flow === 'assigned' && made.createdBy === ctl.id, 'اولویت، مسئول، Reviewer، Start، Due و Estimation درست ذخیره شد')
ok(s.notifications.some((n) => n.userId === intMember.id && n.kind === 'assign' && n.link?.type === 'task' && n.link.id === 'IN-V14-1'), 'مسئول از تیم طراحی داخلی اعلان ارجاع گرفت')
ok(canManageFlowTask(s, intLead, made) && canViewTask(s, intLead, made) && canViewTask(s, intMember, made), 'سرپرست و اعضای تیم مثل هر تسک دیگر تیم آن را می‌بینند و سرپرست مدیریتش می‌کند')
s = allowed(s, ceo.id, { type: 'createFlowTask', task: intTask('IN-V14-2', { teamSpaceId: 'ren', projectId: 'team:ren', assigneeUserId: renLead.id, reviewerId: undefined }) }, 'مدیرعامل در فضای تیم رندر تسک می‌سازد')
refused(s, ctl.id, { type: 'createFlowTask', task: intTask('IN-V14-3', { assigneeUserId: U('m.rostami').id }) }, 'ارجاع تسک تیم طراحی داخلی به عضو تیم دیگر')
refused(s, ctl.id, { type: 'flow', taskId: 'IN-V14-1', op: 'assign', assigneeId: member.id }, 'ارجاع دوباره به کسی بیرون از تیم')
s = allowed(s, ctl.id, { type: 'flow', taskId: 'IN-V14-1', op: 'assign', assigneeId: U('p.abbasi').id }, 'ارجاع دوباره به عضو دیگر همان تیم')
s = allowed(s, ctl.id, { type: 'updateTask', taskId: 'IN-V14-1', patch: { priority: 'urgent', due: addDays(due, 3) } }, 'کنترل پروژه اولویت و Due را عوض می‌کند')
ok(s.tasks['IN-V14-1'].priority === 'urgent' && s.tasks['IN-V14-1'].due === addDays(due, 3), 'تغییر اولویت و Due ثبت شد')
refused(S0, member.id, { type: 'createFlowTask', task: intTask('IN-V14-4', { assigneeUserId: undefined }) }, 'عضو تیم دیگر در فضای این تیم تسک بسازد')
refused(S0, pm.id, { type: 'createFlowTask', task: intTask('IN-V14-5', { assigneeUserId: undefined }) }, 'مدیر پروژه در فضای تیم تسک بسازد')
ok(!canCreateInternalProject(ctl, 'int') && canCreateInternalProject(ctl, 'ctl') && canCreateInternalProject(ceo, 'int') && canCreateInternalProject(intLead, 'int'), 'ساختار فضای تیم (پروژه‌ی داخلی) مثل قبل: سرپرست همان تیم و مدیرعامل؛ کنترل پروژه فقط در تیم خود')
refused(S0, ctl.id, { type: 'internalProjectAdd', project: { id: 'IP-v14', teamId: 'int', name: 'x', status: 'active', createdBy: ctl.id, createdAt: '' } }, 'کنترل پروژه در تیم دیگر پروژه‌ی داخلی بسازد')

// ===================== 2. Field taxonomy =====================
results.push('۲. سامان‌دهی فیلدهای Task')
ok(FIELD_GROUPS.map((g) => g.letter).join('') === 'ABCDEF' && new Set(FIELD_GROUPS.map((g) => g.title)).size === 6, 'شش گروه A تا F با عنوان یکتا')
const groupOf = (k: FieldKey) => TASK_FIELDS[k].group
ok(['docNumber', 'source', 'type', 'priority', 'pkg', 'floor', 'location', 'internalProjectId', 'description'].every((k) => groupOf(k as FieldKey) === 'a'), 'Package، Floor، Doc Number، نوع کار، اولویت و محل در «شناسه و طبقه‌بندی» (A)')
ok(['assignee', 'reporter', 'reviewer', 'participants'].every((k) => groupOf(k as FieldKey) === 'b'), 'مسئول، گزارش‌دهنده، Reviewer و مشارکت‌کنندگان در «افراد» (B)')
ok(['estimation', 'baselineEstimation', 'start', 'due', 'baselineDue', 'planIssue', 'dependsOn', 'allocation'].every((k) => groupOf(k as FieldKey) === 'c'), 'Estimation، Start، Due، Plan Issue Date و پیش‌نیازها در «زمان‌بندی و برآورد» (C)')
ok(['status', 'progress', 'weight', 'actualStart', 'actualFinish', 'worklog', 'wf', 'point'].every((k) => groupOf(k as FieldKey) === 'd'), 'Status، پیشرفت، Weight، زمان واقعی، Work Log، W.F و Point در «وضعیت و پیشرفت» (D)')
const labels = Object.values(TASK_FIELDS).map((f) => f.label)
ok(new Set(labels).size === labels.length, `هیچ دو فیلدی یک نام ندارند (${labels.length} فیلد)`)
ok(Object.values(AUDIT_FIELD).every((l) => labels.some((x) => x === l || x.startsWith(`${l} `)) || l === 'والد'), 'نام فیلدها در AuditLog همان نام‌های صفحه‌ی تسک است')
const doc = Object.values(S0.tasks).find((t) => t.kind === 'document' && t.pkg && t.floor)!
ok(hasField(doc, 'pkg') && hasField(doc, 'floor') && hasField(doc, 'planIssue') && hasField(doc, 'weight') && hasField(doc, 'point'), 'سند MDR: Package، Floor، Plan Issue Date، Weight و Point دارد')
ok(!hasField({ kind: 'supervision' }, 'pkg') && hasField({ kind: 'supervision' }, 'location') && !hasField({ kind: 'internal' }, 'location'), 'فیلدی که برای نوعی معنا ندارد نشان داده نمی‌شود (محل فقط برای نظارت، Package فقط برای اسناد)')
ok(['worklog', 'point', 'wf', 'estimation', 'pkg', 'type'].every((k) => !fieldsOf('finadmin').has(k as FieldKey)) && ['assignee', 'priority', 'start', 'due', 'status', 'progress', 'description'].every((k) => fieldsOf('finadmin').has(k as FieldKey)), 'Task مالی و اداری فقط فیلدهای مرتبط با خودش را دارد')
s = allowed(S0, ctl.id, { type: 'updateTask', taskId: 'IN-int-1', patch: { priority: 'urgent' } }, 'ویرایش اولویت تسک تیم')
ok(s.audit[0].text === `ویرایش: ${TASK_FIELDS.priority.label}`, `خط AuditLog با نام یکسان فیلد: «${s.audit[0].text}»`)

// ===================== 3. Finance & Administration space =====================
results.push('۳. فضای مالی و فضای اداری — دو فضای جدا')
ok(ROLE_FA.finance === 'مدیر مالی' && ROLE_ORDER.includes('finance') && fin.role === 'finance' && fin.status === 'active', 'نقش «مدیر مالی» و کاربر فعال آن (f.sadri)')
ok(PERMISSION_MATRIX['fin.finance'].join() === 'ceo,finance' && PERMISSION_MATRIX['fin.office'].join() === 'ceo,office', 'فضای مالی: مدیرعامل و مدیر مالی — فضای اداری: مدیرعامل و مدیر اداری')
const finAll = Object.values(S0.tasks).filter((t) => t.kind === 'finadmin')
const finT = finAll.filter((t) => finSpaceOf(t) === 'finance'), offT = finAll.filter((t) => finSpaceOf(t) === 'office')
ok(finT.length >= 5 && offT.length >= 5 && finT.length + offT.length === finAll.length, `هر Task دقیقاً در یک فضا است (مالی ${finT.length}، اداری ${offT.length})`)
ok(listFinTasks(S0, ceo).length === finAll.length && listFinTasks(S0, ceo, 'finance').length === finT.length && listFinTasks(S0, ceo, 'office').length === offT.length && JSON.stringify(finSpacesOf(ceo)) === '["finance","office"]', 'مدیرعامل هر دو فضا را از سرویس می‌گیرد')
ok(listFinTasks(S0, fin).length === finT.length && listFinTasks(S0, fin, 'office').length === 0 && JSON.stringify(finSpacesOf(fin)) === '["finance"]', 'مدیر مالی فقط فضای مالی را می‌گیرد؛ درخواست فضای اداری خالی برمی‌گردد')
ok(listFinTasks(S0, office).length === offT.length && listFinTasks(S0, office, 'finance').length === 0 && JSON.stringify(finSpacesOf(office)) === '["office"]', 'مدیر اداری فقط فضای اداری را می‌گیرد؛ درخواست فضای مالی خالی برمی‌گردد')
ok(finT.every((t) => canViewTask(S0, fin, t) && !canViewTask(S0, office, t)) && offT.every((t) => canViewTask(S0, office, t) && !canViewTask(S0, fin, t)) && finAll.every((t) => canViewTask(S0, ceo, t)), 'دیدن هر Task: مدیرعامل همه، مدیر مالی فقط مالی، مدیر اداری فقط اداری')
const outsiders = S0.users.filter((u) => u.status === 'active' && !['ceo', 'office', 'finance'].includes(u.role))
ok(outsiders.length > 30 && outsiders.every((u) => !canSeeFinSpace(u) && listFinTasks(S0, u).length === 0 && finAll.every((t) => !canViewTask(S0, u, t))), `هیچ‌کدام از ${outsiders.length} کاربر دیگر چیزی از هیچ‌کدام از دو فضا نمی‌گیرند`)
ok(finAll.every((t) => !t.teamSpaceId && !S0.allocations.some((a) => a.taskId === t.id) && !S0.workLogs.some((l) => l.taskId === t.id) && !S0.pointEntries.some((e) => e.taskId === t.id)), 'Taskهای دو فضا در پروژه‌ها، فضای تیم‌ها، Allocation، Work Log و امتیازها نیستند')
for (const u of [ctl, mgmt, member, inspector, office]) refused(S0, u.id, { type: 'openTask', id: 'FA-1' }, `باز کردن مستقیم Task مالی FA-1 با شناسه (${ROLE_FA[u.role]})`)
for (const u of [ctl, member, fin]) refused(S0, u.id, { type: 'openTask', id: 'FA-2' }, `باز کردن مستقیم Task اداری FA-2 با شناسه (${ROLE_FA[u.role]})`)
allowed(S0, fin.id, { type: 'openTask', id: 'FA-1' }, 'مدیر مالی Task مالی را باز می‌کند')
allowed(S0, office.id, { type: 'openTask', id: 'FA-2' }, 'مدیر اداری Task اداری را باز می‌کند')
allowed(S0, ceo.id, { type: 'openTask', id: 'FA-2' }, 'مدیرعامل Task اداری را باز می‌کند')
ok(S0.audit.filter((a) => a.taskId && S0.tasks[a.taskId]?.kind === 'finadmin').every((a) => !canSeeAuditEntry(S0, ctl, a) && canSeeAuditEntry(S0, ceo, a)), 'خطوط AuditLog دو فضا برای کنترل پروژه در بخش مدیریت نمی‌آید؛ برای مدیرعامل می‌آید')
ok(S0.audit.filter((a) => a.taskId && finSpaceOf(S0.tasks[a.taskId] ?? { kind: 'manual', projectId: '' }) === 'office').every((a) => !canSeeAuditEntry(S0, fin, a)), 'خطوط AuditLog فضای اداری برای مدیر مالی هم نمی‌آید')

results.push('۳. ساخت، ویرایش، ارجاع و پیگیری در هر فضا')
const fa = (id: string, extra: Partial<Task> = {}): Task => ({ id, projectId: finProjectId('finance'), parentId: null, kind: 'finadmin', name: 'تسویه‌ی فاکتور مشاور حقوقی', order: 50, source: 'manual', description: 'بررسی و پرداخت', priority: 'high', assigneeUserId: fin.id, reviewerId: ceo.id, start, due, ...extra })
const ofa = (id: string, extra: Partial<Task> = {}): Task => fa(id, { projectId: finProjectId('office'), name: 'تمدید بیمه‌ی مسئولیت دفتر', assigneeUserId: office.id, ...extra })
s = allowed(S0, ceo.id, { type: 'createFlowTask', task: fa('FA-T1') }, 'مدیرعامل در فضای مالی Task می‌سازد و به مدیر مالی ارجاع می‌دهد')
const t1 = s.tasks['FA-T1']
ok(finSpaceOf(t1) === 'finance' && t1.name === 'تسویه‌ی فاکتور مشاور حقوقی' && t1.description === 'بررسی و پرداخت' && t1.priority === 'high' && t1.start === start && t1.due === due && t1.assigneeUserId === fin.id && t1.reviewerId === ceo.id && t1.flow === 'assigned' && t1.createdBy === ceo.id, 'در فضای مالی با عنوان، شرح، اولویت، Start، Due، مسئول و Reviewer ذخیره شد')
ok(s.notifications.some((n) => n.userId === fin.id && n.kind === 'assign') && !s.notifications.some((n) => n.link?.type === 'task' && n.link.id === 'FA-T1' && !canSeeFinSpace(S0.users.find((u) => u.id === n.userId), 'finance')), 'مسئول اعلان گرفت و هیچ اعلانی به بیرون از فضای مالی (حتی مدیر اداری) نرفت')
s = allowed(s, office.id, { type: 'createFlowTask', task: ofa('FA-T3') }, 'مدیر اداری در فضای اداری Task می‌سازد')
ok(finSpaceOf(s.tasks['FA-T3']) === 'office' && s.notifications.some((n) => n.userId === ceo.id && n.title.includes('فضای اداری')), 'در فضای اداری ثبت شد و مدیرعامل اعلان Task تازه گرفت')
refused(S0, office.id, { type: 'createFlowTask', task: fa('FA-X0', { assigneeUserId: ceo.id }) }, 'مدیر اداری در فضای مالی Task بسازد')
refused(S0, fin.id, { type: 'createFlowTask', task: ofa('FA-X0b', { assigneeUserId: ceo.id }) }, 'مدیر مالی در فضای اداری Task بسازد')
for (const [u, why] of [[ctl, 'کنترل پروژه'], [mgmt, 'مدیریت'], [member, 'عضو تیم']] as const) refused(S0, u.id, { type: 'createFlowTask', task: fa(`FA-X-${u.id}`) }, `ساخت Task مالی توسط ${why}`)
refused(S0, ceo.id, { type: 'createFlowTask', task: fa('FA-X1', { assigneeUserId: office.id }) }, 'ارجاع Task مالی به مدیر اداری (بیرون از فضای مالی)')
refused(S0, ceo.id, { type: 'createFlowTask', task: ofa('FA-X1b', { assigneeUserId: fin.id }) }, 'ارجاع Task اداری به مدیر مالی (بیرون از فضای اداری)')
refused(S0, fin.id, { type: 'createFlowTask', task: fa('FA-X2', { reviewerId: office.id }) }, 'Reviewer بیرون از فضای مالی')
refused(S0, fin.id, { type: 'createFlowTask', task: fa('FA-X3', { participantIds: [office.id] }) }, 'مشارکت‌کننده بیرون از فضای مالی')
refused(S0, fin.id, { type: 'createFlowTask', task: fa('FA-X4', { projectId: 'finadmin' }) }, 'Task بدون فضای معتبر')
refused(S0, fin.id, { type: 'createFlowTask', task: fa('FA-X4b', { projectId: 'BBT' }) }, 'ثبت Task مالی در پروژه')
refused(S0, fin.id, { type: 'createFlowTask', task: fa('FA-X5', { teamSpaceId: 'int' }) }, 'ثبت Task مالی در فضای یک تیم')
refused(S0, fin.id, { type: 'createFlowTask', task: fa('FA-X6', { start: due, due: start }) }, 'Due قبل از Start')
refused(S0, ctl.id, { type: 'createFlowTask', task: { ...fa('IN-X7'), kind: 'internal', projectId: 'team:ctl', teamSpaceId: 'ctl', assigneeUserId: undefined, reviewerId: undefined, progressPct: 50 } as Task }, 'درصد پیشرفت دستی روی تسک غیر مالی (هنگام ساخت)')
refused(s, ceo.id, { type: 'updateTask', taskId: 'FA-T1', patch: { projectId: finProjectId('office') } as Partial<Task> }, 'جابه‌جا کردن Task مالی به فضای اداری')
refused(s, office.id, { type: 'updateTask', taskId: 'FA-T1', patch: { priority: 'low' } }, 'مدیر اداری Task فضای مالی را ویرایش کند')
refused(s, fin.id, { type: 'addComment', taskId: 'FA-T3', text: 'x' }, 'مدیر مالی روی Task فضای اداری کامنت بگذارد')

s = allowed(s, fin.id, { type: 'createFlowTask', task: fa('FA-T4', { name: 'پیگیری چک‌های برگشتی' }) }, 'مدیر مالی Task خودش را می‌سازد')
s = allowed(s, fin.id, { type: 'updateTask', taskId: 'FA-T4', patch: { priority: 'urgent', due: addDays(due, 2), description: 'تماس با بانک و کارفرما' } }, 'سازنده (مدیر مالی) اولویت، Due و شرح را ویرایش می‌کند')
ok(s.tasks['FA-T4'].priority === 'urgent' && s.tasks['FA-T4'].due === addDays(due, 2) && s.audit[0].taskId === 'FA-T4', 'ویرایش ذخیره و در تاریخچه ثبت شد')
refused(s, fin.id, { type: 'updateTask', taskId: 'FA-T1', patch: { priority: 'low' } }, 'مسئول (نه سازنده و نه مدیرعامل) مشخصات Task را عوض کند')
s = allowed(s, ceo.id, { type: 'updateTask', taskId: 'FA-T4', patch: { priority: 'high' } }, 'مدیرعامل همه‌ی Taskهای هر دو فضا را مدیریت می‌کند')
refused(s, ctl.id, { type: 'updateTask', taskId: 'FA-T1', patch: { priority: 'low' } }, 'ویرایش با فراخوانی مستقیم توسط کنترل پروژه')
refused(s, ceo.id, { type: 'flow', taskId: 'FA-T1', op: 'assign', assigneeId: office.id }, 'ارجاع دوباره‌ی Task مالی به مدیر اداری')
refused(s, ceo.id, { type: 'flow', taskId: 'FA-T1', op: 'assign', assigneeId: ctl.id }, 'ارجاع دوباره به کنترل پروژه')
refused(s, office.id, { type: 'flow', taskId: 'FA-T1', op: 'start' }, 'شروع کار توسط کسی جز مسئول')
s = allowed(s, fin.id, { type: 'flow', taskId: 'FA-T1', op: 'start' }, 'مسئول کار را شروع می‌کند')
ok(flowOf(s.tasks['FA-T1']) === 'in_progress' && s.tasks['FA-T1'].actualStart === TODAY, 'وضعیت «در حال اجرا» و Actual Start ثبت شد')
s = allowed(s, fin.id, { type: 'updateTask', taskId: 'FA-T1', patch: { progressPct: 40 } }, 'مسئول درصد پیشرفت را ۴۰٪ ثبت می‌کند')
ok(flowProgress(s.tasks['FA-T1']) === 40 && s.audit[0].text === 'پیشرفت: 0٪ ← 40٪', `پیشرفت ۴۰٪ و خط تاریخچه «${s.audit[0].text}»`)
refused(s, fin.id, { type: 'updateTask', taskId: 'FA-T1', patch: { progressPct: 120 } }, 'پیشرفت بیش از ۱۰۰')
refused(s, fin.id, { type: 'updateTask', taskId: 'FA-T1', patch: { progressPct: 12.5 } }, 'پیشرفت غیرصحیح')
refused(S0, office.id, { type: 'updateTask', taskId: 'FA-10', patch: { participantIds: [fin.id] } }, 'افزودن مدیر مالی به Task اداری')
refused(S0, intMember.id, { type: 'updateTask', taskId: 'IN-int-1b', patch: { progressPct: 50 } }, 'پیشرفت دستی روی تسک تیم (از مرحله‌ی گردش‌کار می‌آید)')
s = allowed(s, fin.id, { type: 'addComment', taskId: 'FA-T1', text: 'فاکتور رسید؛ @ceo لطفاً تأیید پرداخت. @m.tavana @n.rahimi' }, 'ثبت توضیح و پیگیری اقدام (کامنت)')
ok(s.comments.some((c) => c.taskId === 'FA-T1') && s.notifications.some((n) => n.userId === ceo.id && n.kind === 'mention' && n.link?.type === 'task' && n.link.id === 'FA-T1') && !s.notifications.some((n) => (n.userId === ctl.id || n.userId === office.id) && n.link?.type === 'task' && n.link.id === 'FA-T1'), 'منشن مدیرعامل اعلان شد؛ منشن مدیر اداری و کنترل پروژه هیچ اعلان و متنی به آن‌ها نرساند')
refused(s, ctl.id, { type: 'addComment', taskId: 'FA-T1', text: 'x' }, 'کامنت روی Task مالی توسط کنترل پروژه')
refused(s, fin.id, { type: 'logWork', log: { taskId: 'FA-T1', minutes: 60, workDate: TODAY, description: 'کار' } }, 'Work Log روی Task مالی (حتی توسط مسئول)')
refused(s, ceo.id, { type: 'pointRecalc', taskId: 'FA-T1' }, 'بازمحاسبه‌ی امتیاز Task مالی')
refused(s, ctl.id, { type: 'setActual', taskId: 'FA-T1', actualStart: TODAY, reason: 'x' }, 'اصلاح تاریخ واقعی Task مالی توسط کنترل پروژه')
refused(s, office.id, { type: 'addAttachments', taskId: 'FA-T1', files: [{ name: 'a.pdf', mime: 'application/pdf', size: 10, dataUrl: 'data:,' }] }, 'پیوست روی Task مالی توسط مدیر اداری')
refused(s, ceo.id, { type: 'updateTask', taskId: 'FA-T1', patch: { wf: 2 } }, 'W.F روی Task مالی')
refused(s, fin.id, { type: 'flow', taskId: 'FA-T1', op: 'submit' }, 'ارسال برای بررسی بدون شرح')
s = allowed(s, fin.id, { type: 'flow', taskId: 'FA-T1', op: 'submit', note: 'فاکتور بررسی شد و آماده‌ی پرداخت است.' }, 'مسئول برای بررسی مدیرعامل ارسال می‌کند')
refused(s, fin.id, { type: 'updateTask', taskId: 'FA-T1', patch: { progressPct: 90 } }, 'تغییر پیشرفت در انتظار بررسی')
ok(s.notifications.some((n) => n.userId === ceo.id && n.kind === 'review'), 'مدیرعامل (Reviewer) اعلان بررسی گرفت')
refused(s, office.id, { type: 'flow', taskId: 'FA-T1', op: 'approve' }, 'تأیید توسط کسی جز Reviewer یا مدیرعامل')
const pointsBefore = s.pointEntries.length
s = allowed(s, ceo.id, { type: 'flow', taskId: 'FA-T1', op: 'approve', note: 'تأیید' }, 'مدیرعامل تأیید می‌کند و Task بسته می‌شود')
ok(flowOf(s.tasks['FA-T1']) === 'closed' && flowProgress(s.tasks['FA-T1']) === 100 && s.tasks['FA-T1'].actualFinish === TODAY, 'بسته شد، پیشرفت ۱۰۰٪ و Actual Finish ثبت شد')
ok(s.pointEntries.length === pointsBefore, 'بستن Task مالی هیچ امتیازی ثبت نکرد')
ok(s.audit.filter((a) => a.taskId === 'FA-T1').length >= 6, `تاریخچه‌ی کامل Task (${s.audit.filter((a) => a.taskId === 'FA-T1').length} خط)`)
s = allowed(s, office.id, { type: 'flow', taskId: 'FA-T3', op: 'start' }, 'مدیر اداری Task اداری خودش را شروع می‌کند')
s = allowed(s, office.id, { type: 'flow', taskId: 'FA-T3', op: 'submit', note: 'بیمه‌نامه تمدید شد.' }, 'و برای مدیرعامل ارسال می‌کند')
s = allowed(s, ceo.id, { type: 'flow', taskId: 'FA-T3', op: 'rework', note: 'سقف پوشش را بالاتر ببرید.' }, 'مدیرعامل برای اصلاح برمی‌گرداند')
ok(flowOf(s.tasks['FA-T3']) === 'rework' && s.notifications.some((n) => n.userId === office.id && n.kind === 'review'), 'Task اداری برای اصلاح برگشت و مدیر اداری اعلان گرفت')
s = allowed(s, ceo.id, { type: 'createFlowTask', task: fa('FA-T2', { assigneeUserId: ceo.id, reviewerId: undefined }) }, 'مدیرعامل Task خودش را بدون Reviewer می‌سازد')
s = allowed(s, ceo.id, { type: 'flow', taskId: 'FA-T2', op: 'start' }, 'شروع')
s = allowed(s, ceo.id, { type: 'flow', taskId: 'FA-T2', op: 'complete' }, 'بستن بدون بررسی (Reviewer ندارد)')
refused(s, ceo.id, { type: 'reqCreate', req: { kind: 'overtime', description: 'x', overtime: { date: addDays(TODAY, -1), minutes: 60, taskIds: ['FA-T2'] } } }, 'فهرست کردن Task مالی در درخواست اضافه‌کاری (که کنترل پروژه هم می‌بیند)')

results.push('۳. نقش‌هایی که فضاها را باز می‌کنند')
ok(!assignableRoles(ctl).includes('finance') && !assignableRoles(ctl).includes('office') && assignableRoles(ceo).includes('finance'), 'نقش مدیر اداری و مدیر مالی را فقط مدیرعامل می‌دهد')
refused(S0, ctl.id, { type: 'updateUser', id: member.id, patch: { role: 'finance' } }, 'کنترل پروژه به یک عضو نقش مدیر مالی بدهد')
refused(S0, ctl.id, { type: 'updateUser', id: ctl.id, patch: { role: 'office' } }, 'کنترل پروژه به خودش نقش مدیر اداری بدهد')
allowed(S0, ctl.id, { type: 'updateUser', id: office.id, patch: { phone: 'داخلی ۱۹۹', role: 'office' } }, 'کنترل پروژه مثل قبل پروفایل مدیر اداری را ویرایش می‌کند (نقش بدون تغییر)')
s = allowed(S0, ceo.id, { type: 'updateUser', id: member.id, patch: { role: 'finance' } }, 'مدیرعامل نقش مدیر مالی می‌دهد')
const mem = (st: State) => st.users.find((u) => u.id === member.id)
ok(listFinTasks(s, mem(s)).length === finT.length && listFinTasks(s, mem(s), 'office').length === 0, 'با نقش مدیر مالی فقط فضای مالی باز می‌شود')
s = allowed(s, ceo.id, { type: 'updateUser', id: member.id, patch: { role: 'member' } }, 'و با برداشتن نقش')
ok(listFinTasks(s, mem(s)).length === 0 && !canViewTask(s, mem(s), s.tasks['FA-1']), 'دسترسی بلافاصله بسته می‌شود (حتی به Taskی که قبلاً دیده بود)')

results.push('سازگاری با داده‌ها و دسترسی‌های قبلی')
const kinds = (st: State) => Object.values(st.tasks).filter((t) => t.kind !== 'finadmin').length
ok(kinds(S0) === Object.values(S0.tasks).length - finAll.length && S0.internalProjects.length >= 4 && S0.workLogs.length > 100 && S0.pointEntries.length > 10, 'تسک‌ها، پروژه‌های داخلی، Work Log و امتیازهای قبلی سر جایشان هستند')
ok(Object.values(S0.tasks).filter((t) => t.kind === 'supervision').every((t) => canViewTask(S0, inspector, t)), 'ناظر مثل قبل همه‌ی موارد نظارتی را می‌بیند')
ok(PERMISSION_MATRIX['control.section'].join() === 'ceo,control' && PERMISSION_MATRIX['admin.reports'].join() === 'ceo,control,office', 'بقیه‌ی ماتریس دسترسی دست نخورده است')

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
