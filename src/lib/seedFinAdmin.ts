// Sample data of the Finance & Administration section: the Finance space (CEO + Financial Manager) and the Administrative space
// (CEO + Administrative Manager)
// in every flow state, with comments (follow-up of actions), one review round and their AuditLog lines.
// Added after the other seeds, so nothing here reaches Work Log, points, plans or project data.
import { addDays, isWeekend } from './jalali'
import { finProjectId, type FinSpace } from './domain'
import type { AuditEntry, Comment, FlowState, Notification, Priority, ReviewRound, Task, User } from './types'

type N = Omit<Notification, 'id'>
const work = (iso: string, n: number) => {
  let d = iso
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) { d = addDays(d, step); if (!isWeekend(d)) left-- }
  return d
}

export function seedFinAdmin(users: User[], today: string, ago: (min: number) => string) {
  const ceo = users.find((u) => u.role === 'ceo')!.id
  const office = users.find((u) => u.role === 'office')!.id
  const finance = users.find((u) => u.role === 'finance')!.id
  const tasks: Record<string, Task> = {}
  const audit: AuditEntry[] = []
  const comments: Comment[] = []
  const reviewRounds: ReviewRound[] = []
  const notifications: N[] = []
  let k = 1
  const rows: { sp: FinSpace; name: string; desc: string; by: string; to?: string; rev?: string; flow: FlowState; pr: Priority; s: number; d: number; pct?: number; parts?: string[] }[] = [
    { sp: 'finance', name: 'بستن حساب‌های فصل پاییز و تراز آزمایشی', desc: 'تطبیق دفاتر، ثبت اسناد اصلاحی و تهیه‌ی تراز آزمایشی برای جلسه‌ی مدیریت.', by: ceo, to: finance, rev: ceo, flow: 'in_progress', pr: 'high', s: -6, d: 4, pct: 55 },
    { sp: 'office', name: 'تمدید قرارداد اجاره‌ی دفتر', desc: 'مذاکره با موجر، بررسی بند افزایش اجاره و آماده‌سازی متن تمدید برای امضای مدیرعامل.', by: ceo, to: office, rev: ceo, flow: 'in_review', pr: 'urgent', s: -9, d: 1, pct: 90 },
    { sp: 'finance', name: 'پیگیری مطالبات پروژه‌ی برج بابلسر (صورت‌وضعیت ۶)', desc: 'ارسال صورت‌وضعیت، پیگیری تأیید کارفرما و برنامه‌ی دریافت.', by: finance, to: finance, rev: ceo, flow: 'in_progress', pr: 'high', s: -3, d: 6, pct: 30, parts: [ceo] },
    { sp: 'office', name: 'بیمه‌ی تکمیلی کارکنان — مقایسه‌ی پیشنهادها', desc: 'سه پیشنهاد بیمه‌ی تکمیلی را از نظر پوشش و هزینه مقایسه و جمع‌بندی کنید.', by: office, to: office, rev: ceo, flow: 'assigned', pr: 'normal', s: 2, d: 12 },
    { sp: 'finance', name: 'تسویه‌ی مالیات بر ارزش افزوده‌ی فصل تابستان', desc: 'تهیه‌ی اظهارنامه و پرداخت پیش از مهلت قانونی.', by: ceo, to: finance, rev: ceo, flow: 'rework', pr: 'urgent', s: -12, d: -1, pct: 70 },
    { sp: 'office', name: 'خرید و نصب دستگاه کپی طبقه‌ی دوم', desc: 'استعلام سه فروشنده، تأیید فنی و هماهنگی نصب.', by: office, to: office, flow: 'closed', pr: 'low', s: -20, d: -8 },
    { sp: 'finance', name: 'بودجه‌ی پیشنهادی سال ۱۴۰۶', desc: 'پیش‌نویس بودجه‌ی هزینه‌های جاری، حقوق و سرمایه‌ای برای تصویب مدیرعامل.', by: ceo, to: finance, rev: ceo, flow: 'assigned', pr: 'high', s: 5, d: 25 },
    { sp: 'office', name: 'آیین‌نامه‌ی مأموریت و هزینه‌ی سفر', desc: 'بازنگری سقف هزینه‌ها و روال تسویه‌ی مأموریت‌های کارگاهی.', by: office, flow: 'open', pr: 'normal', s: 8, d: 20 },
    { sp: 'finance', name: 'جلسه‌ی ماهانه‌ی نقدینگی با مدیرعامل', desc: 'گزارش جریان نقدی، مانده‌ی حساب‌ها و پرداخت‌های پیش رو.', by: ceo, to: ceo, flow: 'in_progress', pr: 'normal', s: 0, d: 3, pct: 20 },
    { sp: 'office', name: 'تمدید پروانه‌ی اشتغال دفتر در سازمان نظام مهندسی', desc: 'جمع‌آوری مدارک، پرداخت عوارض و پیگیری صدور پروانه‌ی تمدیدشده.', by: ceo, to: office, rev: ceo, flow: 'in_progress', pr: 'high', s: -4, d: 9, pct: 40 },
  ]
  rows.forEach((r, i) => {
    const id = `FA-${i + 1}`
    const start = work(today, r.s)
    const due = work(today, r.d)
    const createdAt = ago(60 * 24 * (14 - Math.min(i, 12)) + i * 37)
    const t: Task = {
      id, projectId: finProjectId(r.sp), parentId: null, kind: 'finadmin', name: r.name, order: i + 1, source: 'manual',
      description: r.desc, priority: r.pr, type: 'admin', reporterId: r.by, createdBy: r.by, createdAt,
      assigneeUserId: r.to, reviewerId: r.rev && r.rev !== r.to ? r.rev : undefined, participantIds: r.parts,
      start, due, baselineDue: r.flow === 'rework' ? work(due, -2) : due, flow: r.flow, progressPct: r.pct,
    }
    if (['in_progress', 'in_review', 'rework', 'closed'].includes(r.flow)) t.actualStart = start <= today ? start : today
    if (r.flow === 'closed') t.actualFinish = due
    tasks[id] = t
    const name = (uid?: string) => users.find((u) => u.id === uid)?.name ?? ''
    audit.push({ id: `a-fa${k++}`, at: createdAt, userId: r.by, taskId: id, kind: 'task', text: `${r.sp === 'office' ? 'Task اداری' : 'Task مالی'} ساخته شد${r.to ? `؛ ارجاع به ${name(r.to)}` : ''}` })
    if (r.pct != null) audit.push({ id: `a-fa${k++}`, at: ago(60 * (30 - i)), userId: r.to ?? r.by, taskId: id, kind: 'task', text: `پیشرفت: ${Math.max(0, r.pct - 20)}٪ ← ${r.pct}٪` })
  })
  // follow-up of actions
  const c = (taskId: string, userId: string, min: number, text: string) => comments.push({ id: `c-fa${k++}`, taskId, userId, at: ago(min), text, mentions: text.includes('@ceo') ? [ceo] : [] })
  c('FA-1', finance, 60 * 20, 'اسناد اصلاحی مهر و آبان ثبت شد؛ تطبیق بانک‌ها مانده است.')
  c('FA-1', ceo, 60 * 6, 'تراز را تا پیش از جلسه‌ی پنجشنبه برسانید.')
  c('FA-2', office, 60 * 26, 'موجر با افزایش ۲۵٪ موافقت کرد؛ بند تمدید خودکار هم اضافه شد. @ceo')
  c('FA-3', finance, 60 * 9, 'صورت‌وضعیت ارسال شد؛ کارفرما تا آخر هفته پاسخ می‌دهد.')
  c('FA-5', ceo, 60 * 30, 'ردیف خرید خدمات با دفاتر مطابقت ندارد؛ اصلاح و دوباره ارسال شود.')
  c('FA-9', ceo, 60 * 3, 'گزارش جریان نقدی را به‌صورت هفتگی هم ببینیم.')
  // the lease is waiting for the CEO's decision; VAT came back once
  reviewRounds.push({ id: 'r-fa1', taskId: 'FA-2', round: 1, submittedBy: office, submittedAt: ago(60 * 26), note: 'متن تمدید با بند افزایش ۲۵٪ و تمدید خودکار آماده‌ی امضاست.' })
  reviewRounds.push({ id: 'r-fa2', taskId: 'FA-5', round: 1, submittedBy: finance, submittedAt: ago(60 * 48), note: 'اظهارنامه آماده است.', decision: 'rework', decidedBy: ceo, decidedAt: ago(60 * 30), decisionNote: 'ردیف خرید خدمات با دفاتر مطابقت ندارد.' })
  audit.push({ id: `a-fa${k++}`, at: ago(60 * 26), userId: office, taskId: 'FA-2', kind: 'review', text: 'در حال اجرا ← در انتظار بررسی: متن تمدید آماده است' })
  audit.push({ id: `a-fa${k++}`, at: ago(60 * 30), userId: ceo, taskId: 'FA-5', kind: 'review', text: 'در انتظار بررسی ← بازگشت برای اصلاح: ردیف خرید خدمات با دفاتر مطابقت ندارد.' })
  notifications.push({ userId: ceo, at: ago(60 * 26), kind: 'review', title: '«تمدید قرارداد اجاره‌ی دفتر» برای بررسی ارسال شد (دور 1)', body: 'متن تمدید آماده‌ی امضاست.', actorId: office, link: { type: 'task', id: 'FA-2' }, read: false })
  notifications.push({ userId: finance, at: ago(60 * 30), kind: 'review', title: '«تسویه‌ی مالیات بر ارزش افزوده‌ی فصل تابستان» برای اصلاح برگشت', body: 'ردیف خرید خدمات با دفاتر مطابقت ندارد.', actorId: ceo, link: { type: 'task', id: 'FA-5' }, read: false })
  return { tasks, audit, comments, reviewRounds, notifications }
}
