// Phase 1 acceptance tests for the domain layer (reducer + permission policy).
// Every dispatch here is the browser equivalent of calling the API directly, bypassing the UI.
import { initialState, reducer, isWorkItem, flowOf, statusOf, statusesFor, type State } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { ROLE_ORDER, canViewTask } from '../src/lib/policy'
import { channelMembers, projectTeams } from '../src/lib/domain'
import type { Task } from '../src/lib/types'

let pass = 0, fail = 0
const results: string[] = []
function ok(cond: unknown, name: string) {
  if (cond) { pass++; results.push(`  ✓ ${name}`) } else { fail++; results.push(`  ✗ ${name}`) }
}
type A = Parameters<typeof reducer>[1]
const as = (s: State, id: string): State => ({ ...s, session: id, denial: null })
const run = (s: State, a: A) => reducer(s, a)
/** Data part of the state: everything a refused action must leave untouched */
const data = (s: State) => JSON.stringify({ ...s, audit: null, denial: null })
function refused(s: State, user: string, a: A, name: string) {
  const before = as(s, user)
  const after = run(before, a)
  ok(after.denial && data(after) === data(before) && after.audit[0]?.kind === 'security', `رد شد و هیچ داده‌ای عوض نشد: ${name}`)
  return after
}
function allowed(s: State, user: string, a: A, name: string) {
  const after = run(as(s, user), a)
  ok(!after.denial, `مجاز: ${name}${after.denial ? ` — ${after.denial.text}` : ''}`)
  return after
}

const S0 = initialState()
const users = S0.users
const tasks = Object.values(S0.tasks)

results.push('Seed و نقش‌ها')
ok(ROLE_ORDER.every((r) => users.some((u) => u.role === r && u.status === 'active')), 'هر ۷ نقش دست‌کم یک کاربر فعال دارد (مدیر سیستم = کنترل پروژه)')
ok(S0.projects.every((p) => p.managerId && users.find((u) => u.id === p.managerId)?.role === 'pm'), 'هر پروژه مدیر پروژه (نقش pm) دارد')
ok(users.find((u) => u.username === 'ceo')?.role === 'ceo' && users.filter((u) => u.teamId === 'ctl').every((u) => u.role === 'control'), 'مهاجرت نقش: Admin ← مدیرعامل، Control ← کنترل پروژه')
ok(tasks.filter(isWorkItem).every((t) => !t.due || t.baselineDue === t.due), 'baselineDue همه‌ی تسک‌های برنامه‌ریزی‌شده برابر Due فعلی است')

// ---------- permission bypass ----------
results.push('دور زدن دسترسی (dispatch مستقیم)')
const member = 'u-p1a-3', lead = 'u-p1a-1', inspector = 'u-sup-2', control = 'u-ctl-1', pmA = 'u-mgt-2', ceo = 'u-rd-1'
const otherTask = tasks.find((t) => isWorkItem(t) && t.assigneeUserId && users.find((u) => u.id === t.assigneeUserId)?.teamId === 'p2b')!
refused(S0, member, { type: 'savePlan', taskId: otherTask.id, assignee: { kind: 'user', id: member }, estimation: 4, start: TODAY, due: TODAY, allocations: [] }, 'عضو تیم تسک دیگران را برنامه‌ریزی کند')
refused(S0, member, { type: 'updateTask', taskId: otherTask.id, patch: { due: '2030-01-01' } }, 'تغییر مستقیم Due از مسیر ویرایش تسک')
refused(S0, control, { type: 'updateTask', taskId: otherTask.id, patch: { due: '2030-01-01' } }, 'حتی کنترل پروژه نمی‌تواند Due را از مسیر ویرایش تسک عوض کند')
refused(S0, inspector, { type: 'setStatus', taskId: otherTask.id, statusId: 'st-design' }, 'ناظر Status تسک پروژه را عوض کند')
refused(S0, member, { type: 'updateUser', id: member, patch: { role: 'ceo' } }, 'کاربر نقش خودش را بالا ببرد')
refused(S0, member, { type: 'updateUser', id: 'u-p1a-2', patch: { name: 'x' } }, 'عضو پروفایل همکار را ویرایش کند')
refused(S0, control, { type: 'approveUser', id: 'u-req-1', teamId: 'p1a', role: 'ceo' }, 'کنترل پروژه هنگام تأیید عضویت نقش مدیرعامل بدهد')
allowed(S0, control, { type: 'approveUser', id: 'u-req-1', teamId: 'p1a', role: 'member' }, 'کنترل پروژه عضویت را با نقش عضو تأیید کند')
refused(S0, control, { type: 'updateUser', id: ceo, patch: { name: 'x' } }, 'کنترل پروژه حساب مدیرعامل را ویرایش کند')
allowed(S0, control, { type: 'updateUser', id: member, patch: { phone: 'x' } }, 'کنترل پروژه (مدیر سیستم) پروفایل کاربر را ویرایش کند')
refused(S0, member, { type: 'openTask', id: 'IN-rvt-1' }, 'عضو تیم دیگر تسک داخلی Revit را باز کند')
allowed(S0, 'u-rvt-3', { type: 'openTask', id: 'IN-rvt-1' }, 'عضو تیم Revit تسک داخلی تیم خود را باز کند')
allowed(S0, ceo, { type: 'openTask', id: 'IN-rvt-1' }, 'مدیرعامل فضای همه‌ی تیم‌ها را می‌بیند')
refused(S0, member, { type: 'addComment', taskId: 'IN-rvt-1', text: 'سلام' }, 'کامنت روی تسک داخلی تیم دیگر')
refused(S0, member, { type: 'createFlowTask', task: { id: 'X1', projectId: 'BBT', parentId: null, kind: 'supervision', name: 'x', order: 1, source: 'manual' } }, 'غیرناظر مورد نظارتی بسازد')
refused(S0, member, { type: 'createFlowTask', task: { id: 'X2', projectId: 'team:rvt', parentId: null, kind: 'internal', name: 'x', order: 1, source: 'manual', teamSpaceId: 'rvt' } }, 'ساخت تسک در فضای تیم دیگر')
refused(S0, member, { type: 'sendMessage', channelId: 'announce', text: 'x' }, 'عضو تیم اطلاعیه‌ی سازمانی بفرستد')
refused(S0, pmA, { type: 'addRun', run: { id: 'r', projectId: 'RNX', trigger: 'manual', at: '', durationSec: 0, state: 'running', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [] } }, 'مدیر پروژه Sync پروژه‌ی دیگری را اجرا کند')
refused(S0, pmA, { type: 'addRun', run: { id: 'r', projectId: 'BBT', trigger: 'manual', at: '', durationSec: 0, state: 'running', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [] } }, 'مدیر پروژه حتی Sync پروژه‌ی خودش را (بخش کنترل پروژه)')
allowed(S0, control, { type: 'addRun', run: { id: 'r', projectId: 'BBT', trigger: 'manual', at: '', durationSec: 0, state: 'running', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [] } }, 'کنترل پروژه Sync اجرا کند')
refused(S0, member, { type: 'setActual', taskId: otherTask.id, actualStart: TODAY, reason: 'x' }, 'عضو تیم تاریخ واقعی را دستی عوض کند')
refused(S0, control, { type: 'setActual', taskId: otherTask.id, actualStart: TODAY, reason: '' }, 'اصلاح تاریخ واقعی بدون دلیل')
refused(S0, member, { type: 'statusAdd', scope: 'office', status: { id: 'x', name: 'x', category: 'doing', progress: 10 } }, 'عضو تیم Status Set را تغییر دهد')

refused(S0, inspector, { type: 'createFlowTask', task: { id: 'X3', projectId: 'RNX', parentId: null, kind: 'supervision', name: 'x', order: 1, source: 'manual', assigneeUserId: 'u-p1a-2' } }, 'ارجاع مورد نظارتی به کسی خارج از تیم‌های همان پروژه')
refused(S0, 'u-p2a-1', { type: 'updateTask', taskId: 'SUP-BBT-1', patch: { reviewerId: 'u-sup-2' } }, 'عوض کردن Reviewer وسط دور بررسی')
refused(S0, control, { type: 'updateTask', taskId: otherTask.id, patch: { name: 'نام دیگر' } }, 'تغییر نام سند MDR خارج از Sync')

// lead: own team only
const openOf = (t: Task) => statusOf(S0, t)?.category !== 'done'
const leadTeamTask = tasks.find((t) => isWorkItem(t) && openOf(t) && t.assigneeTeamId === 'p1a') ?? tasks.find((t) => isWorkItem(t) && openOf(t) && users.find((u) => u.id === t.assigneeUserId)?.teamId === 'p1a')!
refused(S0, lead, { type: 'savePlan', taskId: leadTeamTask.id, assignee: { kind: 'user', id: 'u-p2a-2' }, estimation: 4, allocations: [] }, 'سرپرست تسک را به عضو تیم دیگر بدهد')
allowed(S0, lead, { type: 'savePlan', taskId: leadTeamTask.id, assignee: { kind: 'user', id: 'u-p1a-3' }, estimation: leadTeamTask.estimation, start: leadTeamTask.start, due: leadTeamTask.due, allocations: [] }, 'سرپرست تسک تیم خود را به عضو همان تیم بدهد')

// ---------- supervision cycle ----------
results.push('چرخه‌ی کامل نظارت و اجرا با یک بازگشت')
let s = allowed(S0, inspector, { type: 'createFlowTask', task: { id: 'SUP-T', projectId: 'BBT', parentId: null, kind: 'supervision', name: 'نشت آب سقف پارکینگ', order: 1, source: 'manual', assigneeUserId: 'u-p2a-3', due: TODAY, location: 'B1' }, files: [{ name: 'a.png', mime: 'image/png', size: 100, dataUrl: 'data:image/png;base64,AA==' }] }, 'ناظر مورد نظارتی با پیوست می‌سازد')
let t = s.tasks['SUP-T']
ok(t.flow === 'assigned' && t.reviewerId === inspector && t.reporterId === inspector, 'وضعیت «ارجاع‌شده»، Reviewer و گزارش‌دهنده = ناظر')
ok(s.notifications.some((n) => n.userId === 'u-p2a-3' && n.link?.type === 'task' && n.link.id === 'SUP-T'), 'مجری اعلان ارجاع گرفت')
ok(s.attachments.some((a) => a.taskId === 'SUP-T'), 'پیوست ثبت شد')
s = refused(s, 'u-p2a-2', { type: 'flow', taskId: 'SUP-T', op: 'start' }, 'غیرمجری کار را شروع کند')
s = allowed(s, 'u-p2a-3', { type: 'flow', taskId: 'SUP-T', op: 'start' }, 'مجری کار را شروع می‌کند')
ok(s.tasks['SUP-T'].flow === 'in_progress' && s.tasks['SUP-T'].actualStart === TODAY, 'در حال اجرا و Actual Start = امروز')
s = refused(s, 'u-p2a-3', { type: 'flow', taskId: 'SUP-T', op: 'submit', note: '' }, 'ارسال بدون شرح')
s = allowed(s, 'u-p2a-3', { type: 'flow', taskId: 'SUP-T', op: 'submit', note: 'جزئیات آب‌بندی آماده شد', files: [{ name: 'd.pdf', mime: 'application/pdf', size: 10, dataUrl: 'data:application/pdf;base64,AA==' }] }, 'مجری برای بررسی می‌فرستد (دور ۱)')
ok(s.tasks['SUP-T'].flow === 'in_review' && s.reviewRounds.filter((r) => r.taskId === 'SUP-T').length === 1, 'در انتظار بررسی، یک دور ثبت شد')
s = refused(s, 'u-p2a-3', { type: 'flow', taskId: 'SUP-T', op: 'approve' }, 'مجری کار خودش را تأیید کند')
s = refused(s, 'u-sup-3', { type: 'flow', taskId: 'SUP-T', op: 'approve' }, 'ناظری که Reviewer نیست تأیید کند')
s = refused(s, inspector, { type: 'flow', taskId: 'SUP-T', op: 'rework', note: '' }, 'بازگشت بدون دلیل')
s = allowed(s, inspector, { type: 'flow', taskId: 'SUP-T', op: 'rework', note: 'شیب‌بندی دیده نمی‌شود' }, 'Reviewer برای اصلاح برمی‌گرداند')
ok(s.tasks['SUP-T'].flow === 'rework' && s.reviewRounds.find((r) => r.taskId === 'SUP-T' && r.round === 1)?.decision === 'rework', 'وضعیت «بازگشت برای اصلاح» و تصمیم دور ۱ ثبت شد')
s = allowed(s, 'u-p2a-3', { type: 'flow', taskId: 'SUP-T', op: 'submit', note: 'شیب‌بندی اضافه شد' }, 'مجری دوباره می‌فرستد (دور ۲)')
s = allowed(s, inspector, { type: 'flow', taskId: 'SUP-T', op: 'approve', note: 'تأیید' }, 'Reviewer تأیید می‌کند')
t = s.tasks['SUP-T']
ok(t.flow === 'closed' && t.actualFinish === TODAY && s.reviewRounds.filter((r) => r.taskId === 'SUP-T').map((r) => r.decision).join(',') === 'rework,approve', 'بسته شد، Actual Finish = امروز، دو دور: بازگشت و تأیید')
ok(s.audit.filter((a) => a.taskId === 'SUP-T' && a.kind === 'review').length >= 4, 'همه‌ی انتقال‌ها در AuditLog آمده‌اند')
s = allowed(s, inspector, { type: 'flow', taskId: 'SUP-T', op: 'reopen', note: 'نشت دوباره دیده شد' }, 'بازگشایی با دلیل')
ok(s.tasks['SUP-T'].flow === 'rework' && !s.tasks['SUP-T'].actualFinish, 'بعد از بازگشایی Actual Finish پاک شد')

// ---------- review overlay on project work items ----------
results.push('بررسی تسک پروژه (Reviewer روی Status Set)')
const rt = tasks.find((x) => isWorkItem(x) && x.reviewerId && x.flow !== 'in_review' && statusOf(S0, x)?.category === 'doing') ?? tasks.find((x) => isWorkItem(x) && x.reviewerId && x.flow !== 'in_review')!
const doneId = statusesFor(S0, rt).find((x) => x.category === 'done')!.id
refused(S0, rt.assigneeUserId!, { type: 'setStatus', taskId: rt.id, statusId: doneId }, 'مجری تسکِ دارای Reviewer را مستقیم Done کند')
s = allowed(S0, rt.assigneeUserId!, { type: 'flow', taskId: rt.id, op: 'submit', note: 'آماده' }, 'مجری برای بررسی می‌فرستد')
s = refused(s, rt.assigneeUserId!, { type: 'setStatus', taskId: rt.id, statusId: statusesFor(S0, rt)[1].id }, 'تغییر Status در زمان انتظار بررسی')
s = allowed(s, rt.reviewerId!, { type: 'flow', taskId: rt.id, op: 'approve' }, 'Reviewer تأیید می‌کند')
ok(statusOf(s, s.tasks[rt.id])?.category === 'done' && s.tasks[rt.id].actualFinish === TODAY && !s.tasks[rt.id].flow, 'Status نهایی، Actual Finish = امروز')
ok(rt.source !== 'mdr' || s.writeQueue.some((w) => w.taskId === rt.id), 'تأیید سند MDR در صف Write-back رفت')

// ---------- actual dates & baseline on project items ----------
results.push('Actual Start/Finish و Baseline')
const fresh = tasks.find((x) => isWorkItem(x) && !x.reviewerId && statusOf(S0, x)?.category === 'todo' && x.assigneeUserId && !x.actualStart)!
const setOf = statusesFor(S0, fresh)
s = allowed(S0, control, { type: 'setStatus', taskId: fresh.id, statusId: setOf.find((x) => x.category === 'doing')!.id }, 'شروع کار')
ok(s.tasks[fresh.id].actualStart === TODAY, 'Actual Start خودکار ثبت شد')
s = allowed(s, control, { type: 'setStatus', taskId: fresh.id, statusId: setOf.find((x) => x.category === 'done')!.id }, 'پایان کار')
ok(s.tasks[fresh.id].actualFinish === TODAY, 'Actual Finish خودکار ثبت شد')
s = allowed(s, control, { type: 'setStatus', taskId: fresh.id, statusId: setOf.find((x) => x.category === 'doing')!.id }, 'بازگشت از Done')
ok(!s.tasks[fresh.id].actualFinish && s.tasks[fresh.id].actualStart === TODAY, 'Actual Finish پاک شد و Actual Start ماند')
const unplanned = tasks.find((x) => isWorkItem(x) && !x.due)!
s = allowed(S0, control, { type: 'savePlan', taskId: unplanned.id, assignee: null, start: TODAY, due: TODAY, allocations: [] }, 'اولین Due')
s = allowed(s, control, { type: 'savePlan', taskId: unplanned.id, assignee: null, start: TODAY, due: '2099-01-01', allocations: [] }, 'تغییر Due')
ok(s.tasks[unplanned.id].baselineDue === TODAY, 'Baseline بعد از تغییر Due ثابت ماند')

// ---------- team space isolation ----------
results.push('جدایی فضای تیم از پروژه‌ها')
s = allowed(S0, 'u-int-3', { type: 'createFlowTask', task: { id: 'IN-T', projectId: 'team:int', parentId: null, kind: 'internal', name: 'تسک داخلی آزمایشی', order: 1, source: 'manual', teamSpaceId: 'int', internalProjectId: 'IP-int-1', assigneeUserId: 'u-int-3' } }, 'عضو تیم در فضای تیم خود تسک می‌سازد')
ok(!isWorkItem(s.tasks['IN-T']) && !s.projects.some((p) => p.id === s.tasks['IN-T'].projectId), 'تسک داخلی جزو تسک‌های پروژه نیست')
ok(Object.values(s.tasks).filter((x) => isWorkItem(x)).length === tasks.filter(isWorkItem).length, 'تعداد تسک‌های پروژه تغییری نکرد')
ok(!s.messages.some((m) => m.channelId.startsWith('project:') && m.link?.type === 'task' && m.link.id === 'IN-T'), 'در چت پروژه‌ها پیامی برای تسک داخلی نیامد')
refused(s, 'u-int-3', { type: 'flow', taskId: 'IN-T', op: 'assign', assigneeId: 'u-p1a-2' }, 'ارجاع تسک داخلی به عضو تیم دیگر')
refused(s, 'u-int-3', { type: 'updateTask', taskId: 'IN-T', patch: { internalProjectId: 'IP-rvt-1' } }, 'انتقال تسک داخلی به پروژه‌ی داخلی تیم دیگر')
s = allowed(s, 'u-int-3', { type: 'flow', taskId: 'IN-T', op: 'start' }, 'شروع تسک داخلی')
s = allowed(s, 'u-int-3', { type: 'flow', taskId: 'IN-T', op: 'complete' }, 'بستن تسک داخلی بدون Reviewer')
ok(flowOf(s.tasks['IN-T']) === 'closed' && s.tasks['IN-T'].actualFinish === TODAY, 'تسک داخلی بسته شد با Actual Finish')
refused(S0, member, { type: 'internalProjectAdd', project: { id: 'IP-x', teamId: 'p1a', name: 'x', status: 'active', createdBy: member, createdAt: '' } }, 'عضو عادی پروژه‌ی داخلی بسازد')
allowed(S0, lead, { type: 'internalProjectAdd', project: { id: 'IP-x', teamId: 'p1a', name: 'x', status: 'active', createdBy: lead, createdAt: '' } }, 'سرپرست پروژه‌ی داخلی تیم خود را بسازد')

// ---------- regression of earlier behaviour ----------
results.push('Regression')
const mine = tasks.find((x) => isWorkItem(x) && x.assigneeUserId === member && !x.reviewerId)
if (mine) {
  const next = statusesFor(S0, mine).find((x) => x.id !== mine.statusId && x.category !== 'done')!
  s = allowed(S0, member, { type: 'setStatus', taskId: mine.id, statusId: next.id }, 'عضو Status تسک خودش را عوض می‌کند (مثل قبل)')
}
s = allowed(S0, member, { type: 'addComment', taskId: otherTask.id, text: '@n.rahimi لطفاً بررسی کنید' }, 'کامنت و تگ روی تسک پروژه')
ok(s.notifications.some((n) => n.userId === 'u-ctl-1' && n.kind === 'mention'), 'اعلان تگ رسید')
s = allowed(S0, member, { type: 'updateUser', id: member, patch: { phone: '123' } }, 'کاربر پروفایل خودش را ویرایش می‌کند')
allowed(S0, control, { type: 'addHoliday', holiday: { id: 'h-x', date: TODAY, title: 'x' } }, 'کنترل پروژه تعطیلی ثبت می‌کند')
ok(run({ ...S0, session: null }, { type: 'login', id: 'u-req-2' }).session === null, 'حساب در انتظار تأیید وارد نمی‌شود')

const seen = new Set<string>()
ok(Object.values(S0.tasks).every((x: Task) => { if (seen.has(x.id)) return false; seen.add(x.id); return true }), 'شناسه‌ی تسک‌ها یکتاست')

// R&D is a fixed team like Project Control: part of every project
const rdTeam = S0.teams.find((x) => x.id === 'rd')!
const rdUser = S0.users.find((u) => u.teamId === 'rd' && u.status === 'active')!
const projTask = Object.values(S0.tasks).find((x: Task) => isWorkItem(x) && x.projectId === S0.projects[0].id)!
ok(rdTeam.kind === 'fixed' && S0.projects.every((p) => projectTeams(p).includes('rd')), 'R&D تیم ثابت است و در همه‌ی پروژه‌ها حضور دارد')
ok(canViewTask(S0, rdUser, projTask) && S0.projects.every((p) => channelMembers(S0, `project:${p.id}`).includes(rdUser.id)), 'اعضای R&D تسک‌ها و چت همه‌ی پروژه‌ها را می‌بینند')
const rdAssign = reducer({ ...S0, session: S0.users.find((u) => u.username === 'n.rahimi')!.id, denial: null }, { type: 'savePlan', taskId: projTask.id, assignee: { kind: 'team', id: 'rd' }, allocations: [] })
ok(!rdAssign.denial && rdAssign.tasks[projTask.id].assigneeTeamId === 'rd', 'تسک پروژه به تیم R&D تخصیص داده می‌شود')

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
