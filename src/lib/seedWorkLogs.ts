// Sample Work Logs: time spent on tasks that have started, spread over working days, sometimes with a second contributor.
import { addDays, isWeekend } from './jalali'
import { isFlowTask, isWorkItem } from './domain'
import type { AuditEntry, Task, TaskType, User, WorkLog } from './types'

const NOTES: Partial<Record<TaskType, string[]>> & { other: string[] } = {
  documentation: ['ترسیم پلان و اندازه‌گذاری', 'اصلاح طبق کامنت‌های بررسی داخلی', 'هماهنگی با نقشه‌های سازه', 'تکمیل جزئیات و جدول نازک‌کاری', 'آماده‌سازی شیت برای صدور'],
  modeling: ['مدل‌سازی دیوارها و بازشوها', 'رفع Clash با تأسیسات', 'به‌روزرسانی Familyها', 'استخراج نقشه از مدل'],
  design: ['بررسی گزینه‌های طراحی', 'طراحی جزئیات', 'جلسه با تیم و اعمال نظرات', 'تهیه‌ی اسکیس و مدل اولیه'],
  render: ['تنظیم نور و متریال', 'رندر نهایی و پست‌پروداکشن', 'آماده‌سازی صحنه'],
  presentation: ['چیدمان شیت‌های ارائه', 'تهیه‌ی دیاگرام‌ها', 'ویرایش متن و تصاویر'],
  supervision: ['بازدید کارگاه و عکاسی', 'تهیه‌ی جزئیات اصلاحی', 'هماهنگی با پیمانکار'],
  research: ['مطالعه‌ی منابع', 'تحلیل نمونه‌ها', 'تهیه‌ی گزارش'],
  admin: ['به‌روزرسانی جدول‌ها', 'جمع‌آوری اطلاعات تیم‌ها', 'تهیه‌ی گزارش'],
  other: ['انجام کار', 'پیگیری و هماهنگی'],
}

export function seedWorkLogs(tasks: Record<string, Task>, users: User[], holidays: string[], today: string) {
  let s = 2026
  const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const hol = new Set(holidays)
  const workdays = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d) && !hol.has(d)) out.push(d); return out }
  const teamOf = (id: string) => users.find((u) => u.id === id)?.teamId ?? ''
  const day = new Map<string, number>()
  const logs: WorkLog[] = []
  const audit: AuditEntry[] = []
  let k = 1

  // Original Estimation of existing tasks = the Estimation they already have
  for (const t of Object.values(tasks)) if (t.estimation && t.baselineEstimation == null) t.baselineEstimation = t.estimation

  const started = Object.values(tasks).filter((t) => (isWorkItem(t) || isFlowTask(t)) && t.actualStart && t.assigneeUserId && t.estimation).sort((a, b) => a.order - b.order)
  for (const t of started) {
    const end = t.actualFinish ?? today
    const days = workdays(t.actualStart!, end < t.actualStart! ? t.actualStart! : end)
    if (!days.length) continue
    const plannedDays = t.start && t.due ? Math.max(1, workdays(t.start, t.due).length) : days.length
    const share = t.actualFinish ? 1 : Math.min(1.15, days.length / plannedDays)
    // most tasks land near the estimate, some run over, some under
    const r = rand()
    const factor = r < 0.15 ? 1.15 + rand() * 0.3 : r < 0.35 ? 0.85 + rand() * 0.15 : 0.6 + rand() * 0.3
    let target = Math.round((t.estimation! * share * factor * 60) / 15) * 15
    if (target < 30) continue
    // a teammate helps on about one task in six
    const mate = rand() < 0.17 ? users.find((u) => u.status === 'active' && u.capacity > 0 && u.teamId === teamOf(t.assigneeUserId!) && u.id !== t.assigneeUserId && u.id !== t.reviewerId) : undefined
    if (mate && !(t.participantIds ?? []).includes(mate.id)) t.participantIds = [...(t.participantIds ?? []), mate.id]
    const notes = NOTES[t.type ?? 'other'] ?? NOTES.other
    let guard = 0
    while (target > 0 && guard++ < 60) {
      const who = mate && rand() < 0.3 ? mate.id : t.assigneeUserId!
      const d = days[Math.floor(rand() * days.length)]
      const used = day.get(`${who}|${d}`) ?? 0
      const chunk = Math.min(target, (1 + Math.floor(rand() * 16)) * 15 + 30, 9 * 60 - used)
      if (chunk < 15) continue
      day.set(`${who}|${d}`, used + chunk)
      target -= chunk
      const hour = 9 + Math.floor(rand() * 8)
      logs.push({
        id: `w-s${k++}`, taskId: t.id, userId: who, minutes: chunk, workDate: d, description: notes[Math.floor(rand() * notes.length)],
        createdAt: `${d}T${String(hour + 2).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00.000Z`,
        projectId: t.projectId, teamId: teamOf(who), source: 'manual',
      })
    }
  }
  // one corrected and one deleted record, so the history of changes is visible
  const edited = logs.find((l) => l.userId === 'u-p2a-2')
  if (edited) {
    edited.revisions = [{ at: edited.createdAt, by: edited.userId, minutes: edited.minutes + 60, workDate: edited.workDate, description: edited.description, reason: undefined }]
    edited.updatedAt = edited.createdAt; edited.updatedBy = edited.userId
  }
  const removed = logs.find((l) => l.userId === 'u-p1a-3')
  if (removed) {
    removed.deletedAt = `${removed.workDate}T13:00:00.000Z`; removed.deletedBy = 'u-ctl-1'; removed.deleteReason = 'ثبت تکراری همان روز'
    audit.push({ id: `a-w${k++}`, at: removed.deletedAt, userId: 'u-ctl-1', taskId: removed.taskId, kind: 'worklog', text: `حذف Work Log ${users.find((u) => u.id === removed.userId)?.name} (رکورد نگه داشته شد) — دلیل: ثبت تکراری همان روز` })
  }
  return { logs, audit }
}
