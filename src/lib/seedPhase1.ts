// Phase 1 sample data: supervision items, team spaces, review rounds and the new task fields on existing tasks.
import { addDays, isWeekend } from './jalali'
import { isClosed, isFlowTask, isWorkItem, statusOf } from './domain'
import { DEFAULT_POINT_CONFIG, settleTask } from './points'
import type { State } from './state'
import type { Attachment, AuditEntry, ChatMessage, Comment, FlowState, InternalProject, Notification, PointConfig, PointEntry, Priority, ReviewRound, Status, Task, TaskType, User } from './types'

type N = Omit<Notification, 'id'>

function addWorkdays(iso: string, n: number) {
  let d = iso
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  while (isWeekend(d)) d = addDays(d, step)
  while (left > 0) { d = addDays(d, step); if (!isWeekend(d)) left-- }
  return d
}

/** A small hand-drawn-style site sketch, so sample attachments open as real images */
function sketch(title: string, mark: 'crack' | 'level' | 'detail' | 'sheet'): string {
  const marks = {
    crack: "<path d='M250 70l-14 30 12 18-16 34 10 22' stroke='#dc2626' stroke-width='3' fill='none'/>",
    level: "<path d='M70 200h340' stroke='#2563eb' stroke-width='2' stroke-dasharray='8 6'/><text x='420' y='196' font-size='13' fill='#2563eb'>-3.20</text><text x='420' y='222' font-size='13' fill='#dc2626'>-3.27</text>",
    detail: "<rect x='230' y='80' width='90' height='120' fill='none' stroke='#16a34a' stroke-width='3'/><path d='M230 140h90' stroke='#16a34a' stroke-width='2'/>",
    sheet: "<rect x='300' y='210' width='130' height='44' fill='none' stroke='#1f2937'/><text x='365' y='238' font-size='14' text-anchor='middle' fill='#1f2937'>A-512 rev2</text>",
  }[mark]
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300' viewBox='0 0 480 300'><rect width='480' height='300' fill='#f5f6f8'/><g stroke='#94a3b8' stroke-width='1'><path d='M0 60h480M0 120h480M0 180h480M0 240h480M80 0v300M160 0v300M240 0v300M320 0v300M400 0v300'/></g><g stroke='#1f2937' stroke-width='2.5' fill='none'><rect x='60' y='40' width='360' height='190'/><path d='M60 120h120M300 120h120M180 40v190'/></g>${marks}<text x='240' y='282' font-family='Tahoma,sans-serif' font-size='15' text-anchor='middle' fill='#334155'>${title}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function seedPhase1(tasks: Record<string, Task>, ago: (min: number) => string, ctx: { users: User[]; statusSets: Record<string, Status[]>; today: string; holidays: string[] }) {
  const { today } = ctx
  const st = { tasks, statusSets: ctx.statusSets } as Pick<State, 'tasks' | 'statusSets'>
  const audit: AuditEntry[] = []
  const notifications: N[] = []
  const messages: ChatMessage[] = []
  const comments: Comment[] = []
  const reviewRounds: ReviewRound[] = []
  const attachments: Attachment[] = []
  let k = 1
  const teamOfUser = (id?: string) => ctx.users.find((u) => u.id === id)?.teamId
  const nameOf = (id?: string) => ctx.users.find((u) => u.id === id)?.name ?? ''

  // ---------- new fields on existing project work items ----------
  const TYPE_BY_TEAM: Record<string, TaskType> = { ren: 'render', prs: 'presentation', int: 'design', ctl: 'admin', rvt: 'modeling' }
  for (const t of Object.values(tasks)) {
    if (!isWorkItem(t)) continue
    if (t.due) t.baselineDue = t.due
    const team = teamOfUser(t.assigneeUserId) ?? t.assigneeTeamId
    t.type = t.kind === 'document' ? (team === 'rvt' ? 'modeling' : 'documentation') : (TYPE_BY_TEAM[team ?? ''] ?? 'design')
    t.priority = t.due && t.due <= addWorkdays(today, 2) ? 'high' : 'normal'
    if (t.kind === 'manual') t.reporterId = 'u-ctl-1'
    const cat = statusOf(st, t)?.category
    if (cat === 'doing' || cat === 'done') t.actualStart = t.start && t.start <= today ? t.start : addWorkdays(today, -1)
    if (cat === 'done') {
      const f = t.due && t.due < today ? addWorkdays(t.due, (t.order % 3) - 1) : today
      t.actualFinish = f > today ? today : f < t.actualStart! ? t.actualStart : f
    }
  }

  // Phase 2 lead reviews the documents of team members on BBT; one is waiting for review
  const reviewables = Object.values(tasks).filter((t) => isWorkItem(t) && t.projectId === 'BBT' && teamOfUser(t.assigneeUserId) === 'p2a' && t.assigneeUserId !== 'u-p2a-1' && statusOf(st, t)?.category !== 'done').slice(0, 4)
  reviewables.forEach((t, i) => {
    t.reviewerId = 'u-p2a-1'
    if (i === 0 && statusOf(st, t)?.category === 'doing') {
      t.flow = 'in_review'
      reviewRounds.push({ id: `r-s${k++}`, taskId: t.id, round: 1, submittedBy: t.assigneeUserId!, submittedAt: ago(120), note: 'نسخه‌ی کامل با اصلاحات جلسه‌ی هماهنگی برای بررسی آماده است.' })
      audit.push({ id: `a-p${k++}`, at: ago(120), userId: t.assigneeUserId!, taskId: t.id, kind: 'review', text: 'ارسال برای بررسی (دور ۱): نسخه‌ی کامل با اصلاحات جلسه‌ی هماهنگی برای بررسی آماده است.' })
      notifications.push({ userId: 'u-p2a-1', at: ago(120), kind: 'review', title: `«${t.name}» برای بررسی ارسال شد (دور ۱)`, body: 'نسخه‌ی کامل با اصلاحات جلسه‌ی هماهنگی برای بررسی آماده است.', actorId: t.assigneeUserId, link: { type: 'task', id: t.id }, read: false })
    }
  })

  // ---------- supervision & execution ----------
  type Sup = {
    id: string; projectId: string; name: string; location: string; priority: Priority; reporter: string; assignee?: string
    flow: FlowState; due: number; est: number; started?: number; finished?: number; created: number
    rounds?: { note: string; at: number; decision?: 'approve' | 'rework'; decisionNote?: string; decidedAt?: number; file?: [string, 'crack' | 'level' | 'detail' | 'sheet'] }[]
    photo?: [string, 'crack' | 'level' | 'detail' | 'sheet']; description: string
  }
  const SUP: Sup[] = [
    {
      id: 'SUP-BBT-1', projectId: 'BBT', name: 'ترک دیوار جداکننده‌ی لابی همکف', location: 'همکف، لابی — محور B/3', priority: 'high', reporter: 'u-sup-1', assignee: 'u-p2a-2',
      flow: 'in_review', due: 2, est: 6, started: -4, created: 60 * 24 * 6, photo: ['ترک قطری دیوار لابی — بازدید کارگاه', 'crack'],
      description: 'در بازدید کارگاه ترک قطری در دیوار بلوکی جداکننده‌ی لابی و راهروی آسانسور دیده شد. جزئیات ترمیم و اتصال دیوار به ستون لازم است.',
      rounds: [
        { note: 'جزئیات ترمیم با مش و ملات پلیمری تهیه شد؛ نقشه‌ی اصلاحی پیوست است.', at: 60 * 48, decision: 'rework', decisionNote: 'اتصال دیوار به ستون و محل درز انبساط در جزئیات دیده نمی‌شود؛ آن‌ها را هم اضافه کنید.', decidedAt: 60 * 30, file: ['جزئیات ترمیم — دور ۱', 'detail'] },
        { note: 'اتصال دیوار به ستون و درز انبساط به شیت A-512 اضافه شد.', at: 90, file: ['شیت A-512 ویرایش ۲', 'sheet'] },
      ],
    },
    {
      id: 'SUP-BBT-2', projectId: 'BBT', name: 'اختلاف تراز کف پارکینگ B1 با نقشه', location: 'زیرزمین اول، رمپ ورودی', priority: 'urgent', reporter: 'u-sup-2', assignee: 'u-rvt-2',
      flow: 'in_progress', due: 1, est: 8, started: -1, created: 60 * 26, photo: ['اختلاف تراز ۷ سانتی‌متری کف B1', 'level'],
      description: 'تراز اجراشده‌ی کف پارکینگ B1 در محدوده‌ی رمپ ۷ سانتی‌متر پایین‌تر از نقشه است. مدل و مقطع رمپ باید با وضع موجود تطبیق داده شود.',
    },
    {
      id: 'SUP-BBT-3', projectId: 'BBT', name: 'جزئیات نصب نمای سنگ طبقه اول', location: 'نمای جنوبی، طبقه اول', priority: 'normal', reporter: 'u-sup-1',
      flow: 'open', due: 6, est: 10, created: 60 * 3,
      description: 'پیمانکار نما جزئیات اسکوپ و انکر سنگ طبقه اول را درخواست کرده است.',
    },
    {
      id: 'SUP-SHS-1', projectId: 'SHS', name: 'جابه‌جایی داکت تأسیسات طبقه دوم', location: 'طبقه دوم، هسته‌ی شرقی', priority: 'high', reporter: 'u-sup-3', assignee: 'u-p2c-2',
      flow: 'assigned', due: 4, est: 10, created: 60 * 20,
      description: 'داکت تأسیسات با تیر سازه برخورد دارد؛ جانمایی تازه‌ی داکت و اصلاح پلان معماری لازم است.',
    },
    {
      id: 'SUP-SHS-2', projectId: 'SHS', name: 'کنترل ارتفاع سقف کاذب راهروی طبقه اول', location: 'طبقه اول، راهروی اصلی', priority: 'normal', reporter: 'u-sup-3', assignee: 'u-p2c-3',
      flow: 'closed', due: -2, est: 4, started: -8, finished: -3, created: 60 * 24 * 12,
      description: 'ارتفاع آزاد زیر سقف کاذب پس از عبور کانال‌ها باید با نقشه کنترل شود.',
      rounds: [{ note: 'ارتفاع آزاد ۲٫۷۰ متر تأیید شد؛ مقطع اصلاحی پیوست است.', at: 60 * 24 * 4, decision: 'approve', decisionNote: 'مطابق نقشه است. بسته شد.', decidedAt: 60 * 24 * 3, file: ['مقطع راهرو — کنترل ارتفاع', 'level'] }],
    },
    {
      id: 'SUP-KSH-1', projectId: 'KSH', name: 'آب‌بندی و شیب‌بندی بام ساختمان اصلی', location: 'بام، ساختمان اصلی', priority: 'high', reporter: 'u-sup-2', assignee: 'u-p1c-2',
      flow: 'rework', due: 3, est: 12, started: -3, created: 60 * 24 * 5,
      description: 'جزئیات آب‌بندی بام و شیب‌بندی به سمت کف‌شوی‌ها برای اجرا لازم است.',
      rounds: [{ note: 'جزئیات آب‌بندی با ایزوگام دولایه آماده شد.', at: 60 * 24, decision: 'rework', decisionNote: 'شیب‌بندی به سمت کف‌شوی‌ها و جزئیات دور کف‌شوی دیده نمی‌شود.', decidedAt: 60 * 6, file: ['جزئیات آب‌بندی بام — دور ۱', 'detail'] }],
    },
    {
      id: 'SUP-LVS-1', projectId: 'LVS', name: 'تطبیق شیب رمپ ورودی با نقشه‌ی اجرایی', location: 'ورودی سواره', priority: 'normal', reporter: 'u-sup-1', assignee: 'u-p1d-2',
      flow: 'in_progress', due: 5, est: 6, started: -2, created: 60 * 24 * 3,
      description: 'شیب اجراشده‌ی رمپ ۱۶٪ است؛ نقشه ۱۴٪ را نشان می‌دهد. گزینه‌ی اصلاح طول رمپ بررسی شود.',
    },
  ]
  SUP.forEach((x, i) => {
    const t: Task = {
      id: x.id, projectId: x.projectId, parentId: null, kind: 'supervision', name: x.name, order: 50000 + i, source: 'manual',
      description: x.description, location: x.location, priority: x.priority, type: 'supervision',
      reporterId: x.reporter, reviewerId: x.reporter, assigneeUserId: x.assignee, flow: x.flow,
      estimation: x.est, start: x.started != null ? addWorkdays(today, x.started) : undefined, due: addWorkdays(today, x.due), baselineDue: addWorkdays(today, x.due),
      actualStart: x.started != null ? addWorkdays(today, x.started) : undefined, actualFinish: x.finished != null ? addWorkdays(today, x.finished) : undefined,
      createdBy: x.reporter, createdAt: ago(x.created),
    }
    tasks[t.id] = t
    if (x.photo) attachments.push({ id: `f-s${k++}`, taskId: t.id, name: `${x.photo[0]}.svg`, mime: 'image/svg+xml', size: 0, dataUrl: sketch(x.photo[0], x.photo[1]), uploadedBy: x.reporter, uploadedAt: ago(x.created) })
    audit.push({ id: `a-p${k++}`, at: ago(x.created), userId: x.reporter, taskId: t.id, kind: 'task', text: `مورد نظارتی ساخته شد${x.assignee ? `؛ ارجاع به ${nameOf(x.assignee)}` : ''}${x.photo ? '؛ ۱ پیوست' : ''}` })
    messages.push({ id: `m-p${k++}`, channelId: `project:${x.projectId}`, userId: null, system: true, at: ago(x.created), text: `${nameOf(x.reporter)} مورد نظارتی «${x.name}» را ثبت کرد${x.assignee ? ` و به ${nameOf(x.assignee)} ارجاع داد` : ''}.`, mentions: [], link: { type: 'task', id: t.id } })
    if (x.assignee) notifications.push({ userId: x.assignee, at: ago(x.created), kind: 'assign', title: `مورد نظارتی «${x.name}» به شما ارجاع شد`, body: x.location, actorId: x.reporter, link: { type: 'task', id: t.id }, read: x.flow !== 'assigned' })
    ;(x.rounds ?? []).forEach((r, ri) => {
      const id = `r-s${k++}`
      reviewRounds.push({ id, taskId: t.id, round: ri + 1, submittedBy: x.assignee!, submittedAt: ago(r.at), note: r.note, decision: r.decision, decidedBy: r.decision ? x.reporter : undefined, decidedAt: r.decidedAt ? ago(r.decidedAt) : undefined, decisionNote: r.decisionNote })
      if (r.file) attachments.push({ id: `f-s${k++}`, taskId: t.id, roundId: id, name: `${r.file[0]}.svg`, mime: 'image/svg+xml', size: 0, dataUrl: sketch(r.file[0], r.file[1]), uploadedBy: x.assignee!, uploadedAt: ago(r.at) })
      audit.push({ id: `a-p${k++}`, at: ago(r.at), userId: x.assignee!, taskId: t.id, kind: 'review', text: `در حال اجرا ← در انتظار بررسی: ${r.note}` })
      if (r.decision) {
        audit.push({ id: `a-p${k++}`, at: ago(r.decidedAt!), userId: x.reporter, taskId: t.id, kind: 'review', text: `در انتظار بررسی ← ${r.decision === 'approve' ? 'بسته‌شده' : 'بازگشت برای اصلاح'}: ${r.decisionNote}` })
        notifications.push({ userId: x.assignee!, at: ago(r.decidedAt!), kind: 'review', title: r.decision === 'approve' ? `«${x.name}» تأیید و بسته شد` : `«${x.name}» برای اصلاح برگشت`, body: r.decisionNote, actorId: x.reporter, link: { type: 'task', id: t.id }, read: ri < (x.rounds!.length - 1) || x.flow === 'closed' })
      } else {
        notifications.push({ userId: x.reporter, at: ago(r.at), kind: 'review', title: `«${x.name}» برای بررسی ارسال شد (دور ${ri + 1})`, body: r.note, actorId: x.assignee, link: { type: 'task', id: t.id }, read: false })
      }
    })
  })
  for (const a of attachments) a.size = Math.round(a.dataUrl.length * 0.75)
  comments.push({ id: 'c-p1', taskId: 'SUP-BBT-1', userId: 'u-p2a-2', at: ago(80), text: '@y.babaei شیت A-512 با جزئیات اتصال به ستون پیوست دور دوم است. اگر لازم است فردا در کارگاه هماهنگ کنیم.', mentions: ['u-sup-1'] })
  notifications.push({ userId: 'u-sup-1', at: ago(80), kind: 'mention', title: 'ساناز رضایی شما را در کامنت «ترک دیوار جداکننده‌ی لابی همکف» تگ کرد', body: comments[0].text, actorId: 'u-p2a-2', link: { type: 'task', id: 'SUP-BBT-1' }, read: false })

  // ---------- team spaces ----------
  const internalProjects: InternalProject[] = [
    { id: 'IP-int-1', teamId: 'int', name: 'کتابخانه‌ی متریال دفتر', description: 'دسته‌بندی، عکاسی و کدگذاری نمونه‌های متریال برای استفاده در همه‌ی پروژه‌ها.', status: 'active', start: addWorkdays(today, -10), due: addWorkdays(today, 15), createdBy: 'u-int-1', createdAt: ago(60 * 24 * 14) },
    { id: 'IP-rvt-1', teamId: 'rvt', name: 'استاندارد Familyهای Revit دفتر', description: 'Familyهای پرکاربرد با پارامترهای یکسان برای همه‌ی پروژه‌ها.', status: 'active', start: addWorkdays(today, -6), due: addWorkdays(today, 20), createdBy: 'u-rvt-1', createdAt: ago(60 * 24 * 9) },
    { id: 'IP-rd-1', teamId: 'rd', name: 'پژوهش نمای دوپوسته در اقلیم شمال', status: 'active', start: addWorkdays(today, -15), due: addWorkdays(today, 30), createdBy: 'u-rd-1', createdAt: ago(60 * 24 * 20) },
    { id: 'IP-ren-1', teamId: 'ren', name: 'کتابخانه‌ی Asset رندر', status: 'active', createdBy: 'u-ren-1', createdAt: ago(60 * 24 * 7) },
    { id: 'IP-ctl-1', teamId: 'ctl', name: 'روال گزارش پیشرفت ماهانه', status: 'active', due: addWorkdays(today, 8), createdBy: 'u-ctl-1', createdAt: ago(60 * 24 * 5) },
    { id: 'IP-sup-1', teamId: 'sup', name: 'چک‌لیست‌های بازدید کارگاه', status: 'active', createdBy: 'u-sup-1', createdAt: ago(60 * 24 * 10) },
  ]
  type In = { id: string; team: string; ip?: string; parent?: string; name: string; assignee?: string; reviewer?: string; flow: FlowState; due?: number; est?: number; started?: number; finished?: number; type: TaskType; by: string; review?: string }
  const IN: In[] = [
    { id: 'IN-int-1', team: 'int', ip: 'IP-int-1', name: 'دسته‌بندی نمونه‌های سنگ و کاشی', assignee: 'u-int-2', reviewer: 'u-int-1', flow: 'in_progress', due: 5, est: 12, started: -3, type: 'research', by: 'u-int-1' },
    { id: 'IN-int-1a', team: 'int', ip: 'IP-int-1', parent: 'IN-int-1', name: 'عکاسی نمونه‌ها', assignee: 'u-int-3', flow: 'closed', due: -1, est: 4, started: -3, finished: -1, type: 'design', by: 'u-int-2' },
    { id: 'IN-int-1b', team: 'int', ip: 'IP-int-1', parent: 'IN-int-1', name: 'برچسب‌گذاری و کدگذاری', assignee: 'u-int-4', flow: 'assigned', due: 4, est: 6, type: 'admin', by: 'u-int-2' },
    { id: 'IN-int-2', team: 'int', ip: 'IP-int-1', name: 'به‌روزرسانی قالب متریال‌بورد', assignee: 'u-int-3', flow: 'assigned', due: 8, est: 8, type: 'design', by: 'u-int-1' },
    { id: 'IN-rvt-1', team: 'rvt', ip: 'IP-rvt-1', name: 'Family درب و پنجره‌ی استاندارد', assignee: 'u-rvt-2', reviewer: 'u-rvt-1', flow: 'in_review', due: 3, est: 16, started: -5, type: 'modeling', by: 'u-rvt-1', review: 'Familyهای درب تک‌لنگه، دولنگه و پنجره‌ی کشویی با پارامترهای مشترک ساخته شد.' },
    { id: 'IN-rvt-2', team: 'rvt', ip: 'IP-rvt-1', name: 'قالب شیت‌ها و Title Block', flow: 'open', due: 12, est: 10, type: 'modeling', by: 'u-rvt-1' },
    { id: 'IN-rd-1', team: 'rd', ip: 'IP-rd-1', name: 'مرور نمونه‌های اجراشده', assignee: 'u-rd-2', flow: 'in_progress', due: 7, est: 20, started: -6, type: 'research', by: 'u-rd-1' },
    { id: 'IN-rd-2', team: 'rd', ip: 'IP-rd-1', name: 'شبیه‌سازی انرژی نمونه‌ی پایه', assignee: 'u-rd-3', flow: 'assigned', due: 14, est: 24, type: 'research', by: 'u-rd-1' },
    { id: 'IN-ren-1', team: 'ren', ip: 'IP-ren-1', name: 'مدل‌های سبک گیاه و مبلمان', assignee: 'u-ren-3', flow: 'assigned', due: 9, est: 10, type: 'render', by: 'u-ren-1' },
    { id: 'IN-ctl-1', team: 'ctl', ip: 'IP-ctl-1', name: 'قالب گزارش پیشرفت ماهانه', assignee: 'u-ctl-3', reviewer: 'u-ctl-1', flow: 'in_progress', due: 4, est: 6, started: -2, type: 'admin', by: 'u-ctl-1' },
    { id: 'IN-sup-1', team: 'sup', ip: 'IP-sup-1', name: 'چک‌لیست بازدید نازک‌کاری', assignee: 'u-sup-2', flow: 'closed', due: -3, est: 5, started: -7, finished: -4, type: 'supervision', by: 'u-sup-1' },
    { id: 'IN-p1a-1', team: 'p1a', name: 'جلسه‌ی آموزش داخلی Grasshopper', assignee: 'u-p1a-2', flow: 'assigned', due: 6, est: 4, type: 'research', by: 'u-p1a-1' },
  ]
  IN.forEach((x, i) => {
    tasks[x.id] = {
      id: x.id, projectId: `team:${x.team}`, parentId: x.parent ?? null, kind: 'internal', name: x.name, order: 60000 + i, source: 'manual',
      teamSpaceId: x.team, internalProjectId: x.ip, assigneeUserId: x.assignee, reviewerId: x.reviewer, reporterId: x.by, flow: x.flow, type: x.type, priority: 'normal',
      estimation: x.est, due: x.due != null ? addWorkdays(today, x.due) : undefined, baselineDue: x.due != null ? addWorkdays(today, x.due) : undefined,
      actualStart: x.started != null ? addWorkdays(today, x.started) : undefined, actualFinish: x.finished != null ? addWorkdays(today, x.finished) : undefined,
      createdBy: x.by, createdAt: ago(60 * 24 * (8 - (i % 5))),
    }
    audit.push({ id: `a-p${k++}`, at: ago(60 * 24 * (8 - (i % 5))), userId: x.by, taskId: x.id, kind: 'task', text: `تسک تیم ساخته شد${x.assignee ? `؛ ارجاع به ${nameOf(x.assignee)}` : ''}` })
    if (x.review) {
      reviewRounds.push({ id: `r-s${k++}`, taskId: x.id, round: 1, submittedBy: x.assignee!, submittedAt: ago(150), note: x.review })
      notifications.push({ userId: x.reviewer!, at: ago(150), kind: 'review', title: `«${x.name}» برای بررسی ارسال شد (دور ۱)`, body: x.review, actorId: x.assignee, link: { type: 'task', id: x.id }, read: false })
    }
  })

  // ---------- points: version 1 of the parameters, W.F by type of work, and the first calculation for tasks already finished ----------
  const WF: Partial<Record<TaskType, number>> = { modeling: 1.2, design: 1.1, documentation: 1, research: 1, supervision: 1.3, render: 0.9, presentation: 0.8, admin: 0.7 }
  for (const t of Object.values(tasks)) if ((isWorkItem(t) || isFlowTask(t)) && t.wf == null) t.wf = WF[t.type ?? 'other'] ?? 1
  const pointConfigs: PointConfig[] = [{ ...DEFAULT_POINT_CONFIG, by: 'u-ctl-1', at: ago(60 * 24 * 40) }]
  let pointEntries: PointEntry[] = []
  const holidaySet = new Set(ctx.holidays)
  const finished = Object.values(tasks).filter((t) => (isWorkItem(t) || isFlowTask(t)) && t.actualFinish && isClosed(st, t)).sort((a, b) => a.actualFinish!.localeCompare(b.actualFinish!))
  for (const t of finished) {
    pointEntries = settleTask(pointEntries, t, true, pointConfigs[0], holidaySet, {
      reason: 'محاسبه‌ی اولیه هنگام راه‌اندازی امتیازدهی', actorId: 'system', now: `${t.actualFinish}T11:00:00.000Z`, today: t.actualFinish!, newId: () => `p-s${k++}`,
    }).entries
  }
  pointEntries.push({ id: `p-s${k++}`, userId: 'u-rvt-2', kind: 'adjust', points: 40, date: addWorkdays(today, -3), at: ago(60 * 24 * 4), actorId: 'u-ctl-1', reason: 'پوشش فوری مدل‌سازی پارکینگ BBT خارج از برنامه، به درخواست مدیر پروژه' })
  audit.push({ id: `a-p${k++}`, at: ago(60 * 24 * 4), userId: 'u-ctl-1', kind: 'points', text: 'اصلاح دستی امتیاز دلارام ایزدی: +40 — پوشش فوری مدل‌سازی پارکینگ BBT خارج از برنامه، به درخواست مدیر پروژه' })

  return { audit, notifications, messages, comments, reviewRounds, attachments, internalProjects, pointConfigs, pointEntries }
}
