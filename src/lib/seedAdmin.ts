// Sample administrative data: last month (closed) and this month (open) of timesheets, leave / overtime / other requests
// in every state, and the Administrative Manager's month close. Deterministic, built relative to today.
import { addDays, isWeekend, jalaliFa, rangeDays, tehranTime } from './jalali'
import {
  DEFAULT_TIMESHEET_CONFIG, dayKey, hm, hourLeaveMinutes, jMonthKey, leaveDates, monthRange, prevMonthKey, settleDays, toMin,
} from './admin'
import type {
  AdminRequest, AuditEntry, Leave, LeaveDetails, MonthClose, Notification, OtherDetails, RequestStep, Task, TimesheetCalc, TimesheetConfig, TimesheetDay, User, WorkLog,
} from './types'

const EMPTY: TimesheetCalc = { presence: 0, breakMinutes: 0, worked: 0, duty: 0, leave: 0, offDay: false, excess: 0, requested: 0, approved: 0, pending: 0, unpaid: 0, undecided: 0, deficit: 0, configVersion: 0 }
const fa = (s: string) => s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** a Tehran wall-clock moment as ISO (Tehran = UTC+3:30, no DST since 1401) */
const tehranAt = (date: string, minutes: number) => new Date(Date.parse(`${date}T00:00:00.000Z`) + (minutes - 210) * 60000).toISOString()

export function seedAdmin(ctx: { users: User[]; tasks: Record<string, Task>; workLogs: WorkLog[]; holidays: string[]; leaves: Leave[]; today: string }) {
  let s = 1405
  const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
  const { today } = ctx
  const now = Date.now()
  const hol = new Set(ctx.holidays)
  const off = (d: string) => isWeekend(d) || hol.has(d)
  const active = ctx.users.filter((u) => u.status === 'active')
  const office = active.find((u) => u.role === 'office')!
  const ceo = active.find((u) => u.role === 'ceo')!
  const prevMonth = prevMonthKey(jMonthKey(today))
  const start = monthRange(prevMonth).from
  const cfg: TimesheetConfig = { ...DEFAULT_TIMESHEET_CONFIG, by: office.id, at: tehranAt(start, 8 * 60) }
  const requests: AdminRequest[] = []
  const leaves: Leave[] = []
  const notifications: Omit<Notification, 'id'>[] = []
  const audit: AuditEntry[] = []
  let no = 0
  const capAt = (iso: string) => (Date.parse(iso) > now - 5 * 60000 ? new Date(now - between(6, 40) * 60000).toISOString() : iso)

  /** a request with its decision trail; times follow each other and never pass "now" */
  const addRequest = (userId: string, kind: AdminRequest['kind'], createdAt: string, body: Partial<AdminRequest>, outcome: 'pending_office' | 'pending_ceo' | 'approved' | 'rejected_office' | 'rejected_ceo' | 'withdrawn', o: { minutes?: number; note?: string } = {}) => {
    const created = capAt(createdAt)
    const steps: RequestStep[] = [{ stage: 'submit', by: userId, at: created }]
    let t = Date.parse(created)
    const later = (hMin: number, hMax: number) => { t = Math.min(now - 3 * 60000, t + between(hMin * 60, hMax * 60) * 60000); return new Date(t).toISOString() }
    if (outcome === 'withdrawn') steps.push({ stage: 'withdraw', by: userId, at: later(1, 5) })
    if (['pending_ceo', 'approved', 'rejected_ceo'].includes(outcome)) steps.push({ stage: 'office', by: office.id, at: later(2, 26), decision: 'approve', minutes: o.minutes })
    if (outcome === 'rejected_office') steps.push({ stage: 'office', by: office.id, at: later(2, 20), decision: 'reject', note: o.note ?? 'با برنامه‌ی تیم هم‌خوان نیست.' })
    if (outcome === 'approved') steps.push({ stage: 'ceo', by: ceo.id, at: later(3, 40), decision: 'approve', minutes: o.minutes })
    if (outcome === 'rejected_ceo') steps.push({ stage: 'ceo', by: ceo.id, at: later(3, 30), decision: 'reject', note: o.note ?? 'در این دوره امکان تأیید نیست.' })
    const status: AdminRequest['status'] = outcome === 'rejected_office' || outcome === 'rejected_ceo' ? 'rejected' : outcome
    const r: AdminRequest = { id: `rq-s${++no}`, no, userId, kind, status, createdAt: created, stageSince: steps[steps.length - 1].at, description: '', files: [], steps, ...body }
    if (r.overtime && status === 'approved') r.overtime = { ...r.overtime, approvedMinutes: o.minutes ?? r.overtime.minutes }
    if (r.overtime && status !== 'approved') for (const st of steps) if (st.stage !== 'office' || st.decision !== 'approve') delete st.minutes
    requests.push(r)
    return r
  }
  const approveLeave = (r: AdminRequest) => {
    const u = ctx.users.find((x) => x.id === r.userId)!
    const l = r.leave!
    const hours = l.mode === 'hour' ? Math.round((hourLeaveMinutes(l) / 60) * 100) / 100 : u.capacity || 8
    const rows = leaveDates(l, hol).map((date, i) => ({ id: `l-r${r.no}-${i + 1}`, userId: r.userId, date, hours, note: l.mode === 'hour' ? 'مرخصی ساعتی' : 'مرخصی', requestId: r.id, at: r.stageSince }))
    r.leaveIds = rows.map((x) => x.id)
    leaves.push(...rows)
  }
  const leaveReq = (userId: string, l: LeaveDetails, outcome: Parameters<typeof addRequest>[4], description: string, daysBefore = 3) => {
    const r = addRequest(userId, 'leave', tehranAt(addDays(l.from, -daysBefore), between(9 * 60, 16 * 60)), { leave: l, description }, outcome)
    if (r.status === 'approved') approveLeave(r)
    return r
  }

  // ---- leave requests: past ones shape the timesheets, future ones wait in the cartables ----
  const workers = active.filter((u) => u.role !== 'ceo' && u.role !== 'office')
  const wd = (from: string, n: number) => { let d = from; let k = 0; while (true) { if (!off(d)) { if (k === n) return d; k++ } d = addDays(d, 1) } }
  const pastDays = rangeDays(start, addDays(today, -1)).filter((d) => !off(d))
  for (let i = 0; i < 9 && pastDays.length > 4; i++) {
    const u = workers[(i * 7 + 3) % workers.length]
    const from = pastDays[between(0, pastDays.length - 3)]
    const long = rand() < 0.35
    const l: LeaveDetails = rand() < 0.3
      ? { mode: 'hour', category: 'annual', from, to: from, startTime: '14:00', endTime: pick(['16:00', '16:30', '17:00']) }
      : { mode: 'day', category: rand() < 0.25 ? 'sick' : 'annual', from, to: long ? wd(from, 2) : from }
    leaveReq(u.id, l, i === 4 ? 'rejected_office' : 'approved', l.category === 'sick' ? 'سرماخوردگی' : 'کار شخصی', l.category === 'sick' ? -1 : 3)
  }
  const sRezaei = active.find((u) => u.username === 's.rezaei')
  const future = (n: number) => wd(addDays(today, 1), n)
  if (sRezaei) leaveReq(sRezaei.id, { mode: 'day', category: 'annual', from: future(4), to: future(5) }, 'pending_office', 'سفر خانوادگی', 2)
  leaveReq(workers[5].id, { mode: 'day', category: 'annual', from: future(6), to: future(8) }, 'pending_ceo', 'مراسم خانوادگی', 2)
  leaveReq(workers[11].id, { mode: 'hour', category: 'annual', from: future(1), to: future(1), startTime: '09:00', endTime: '11:00' }, 'pending_office', 'مراجعه به اداره', 1)
  leaveReq(workers[17].id, { mode: 'day', category: 'unpaid', from: future(9), to: future(12) }, 'rejected_ceo', 'سفر', 3)
  leaveReq(workers[23].id, { mode: 'day', category: 'annual', from: future(3), to: future(3) }, 'withdrawn', 'کار بانکی', 1)
  leaveReq(workers[2].id, { mode: 'day', category: 'annual', from: future(2), to: future(2) }, 'approved', 'کار شخصی', 3)

  // ---- timesheets ----
  const logged = new Map<string, number>()
  for (const l of ctx.workLogs) if (!l.deletedAt) logged.set(dayKey(l.userId, l.workDate), (logged.get(dayKey(l.userId, l.workDate)) ?? 0) + l.minutes)
  const leaveMin = new Map<string, number>()
  for (const l of [...ctx.leaves, ...leaves]) leaveMin.set(dayKey(l.userId, l.date), (leaveMin.get(dayKey(l.userId, l.date)) ?? 0) + Math.round(l.hours * 60))
  const days: Record<string, TimesheetDay> = {}
  const nowHM = toMin(tehranTime())
  for (const u of active) {
    for (const date of rangeDays(start, today)) {
      const k = dayKey(u.id, date)
      const lv = leaveMin.get(k) ?? 0
      const isOff = off(date)
      const isToday = date === today
      if (u.username === 's.rezaei' && isToday) continue // left free for the "check in" demo
      if (isOff) { if (rand() > 0.05 || isToday) continue }
      else if (lv >= cfg.dutyNetMinutes || rand() < 0.04) continue
      const inAt = isOff ? between(9 * 60, 10 * 60 + 30) : lv && lv < 300 && rand() < 0.5 ? between(7 * 60 + 45, 8 * 60 + 30) : between(7 * 60 + 40, 9 * 60 + 10)
      if (isToday && inAt + 10 > nowHM) continue
      const duty = isOff ? 0 : Math.max(0, cfg.dutyNetMinutes - lv)
      const br = isOff ? 0 : rand() < 0.85 ? 30 : rand() < 0.65 ? 45 : 60
      const r = rand()
      let net = isOff ? between(24, 60) * 5 : r < 0.55 ? duty - between(0, 4) * 5 : r < 0.75 ? duty - between(4, 18) * 5 : duty + between(6, 36) * 5
      net = Math.max(net, (logged.get(k) ?? 0) + (net > duty ? 0 : between(0, 3) * 5))
      const day: TimesheetDay = { id: k, userId: u.id, date, checkIn: clock(inAt), breakMinutes: br, calc: EMPTY, updatedAt: tehranAt(date, inAt), updatedBy: u.id, revisions: [] }
      if (!isToday) { day.checkOut = clock(inAt + br + net); day.updatedAt = tehranAt(date, inAt + br + net) }
      if (!isToday && rand() < 0.04) day.note = pick(['جلسه‌ی کارفرما در کارگاه', 'بازدید پروژه', 'کار از بیرون دفتر'])
      days[k] = day
    }
  }
  // the demo member worked longer on her last working day and has not decided about it yet
  const lastDay = Object.values(days).filter((d) => d.userId === sRezaei?.id && d.checkOut && !off(d.date) && d.date >= addDays(today, -3)).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (lastDay) lastDay.checkOut = clock(toMin(lastDay.checkIn!) + lastDay.breakMinutes + Math.max(Math.max(0, cfg.dutyNetMinutes - (leaveMin.get(lastDay.id) ?? 0)) + 50, (logged.get(lastDay.id) ?? 0) + 10))
  // one corrected day, so the change history has an example
  const sample = Object.values(days).find((d) => d.userId === sRezaei?.id && d.checkOut && d.date >= addDays(today, -6))
  if (sample) sample.revisions.push({ at: sample.updatedAt, by: sample.userId, checkIn: sample.checkIn, checkOut: clock(toMin(sample.checkOut!) - 40), breakMinutes: sample.breakMinutes })

  // first pass: figures before any overtime decision
  const configs = [cfg]
  let settled = settleDays({ days, requests, leaves: [...ctx.leaves, ...leaves], holidays: ctx.holidays, configs, closes: [] }).days

  // ---- overtime decisions ----
  const taskIdsOf = (userId: string, date: string) => {
    const ids = [...new Set(ctx.workLogs.filter((l) => !l.deletedAt && l.userId === userId && l.workDate === date).map((l) => l.taskId))]
    if (ids.length) return ids.slice(0, 3)
    const own = Object.values(ctx.tasks).find((t) => t.assigneeUserId === userId && !t.actualFinish)
    return own ? [own.id] : []
  }
  const prev = monthRange(prevMonth)
  for (const d of Object.values(settled).sort((a, b) => a.date.localeCompare(b.date))) {
    const ex = d.calc.excess
    if (!ex) continue
    const age = Math.round((Date.parse(today) - Date.parse(d.date)) / 86400000)
    const inPrev = d.date <= prev.to
    const r = rand()
    const isMember = d.userId === sRezaei?.id
    if (d.id === lastDay?.id) continue // the demo member's last working day waits for her choice
    if (!inPrev && age <= 3 && !(isMember && age === 3)) continue // recent days: still waiting for the person's choice
    if (r < (inPrev ? 0.58 : 0.45) || (isMember && age >= 3)) {
      const minutes = rand() < 0.12 ? Math.max(15, ex - 30) : ex
      const outcome = inPrev
        ? (rand() < 0.72 ? 'approved' : rand() < 0.5 ? 'rejected_office' : 'rejected_ceo')
        : isMember ? pick(['approved', 'pending_office'] as const) : pick(['pending_office', 'pending_office', 'pending_ceo', 'approved', 'approved', 'rejected_office'] as const)
      const partial = outcome === 'approved' && rand() < 0.15 ? Math.max(15, minutes - between(2, 6) * 10) : undefined
      addRequest(d.userId, 'overtime', d.updatedAt ? new Date(Date.parse(d.updatedAt) + between(5, 60) * 60000).toISOString() : tehranAt(d.date, 18 * 60),
        { overtime: { date: d.date, minutes, taskIds: taskIdsOf(d.userId, d.date), source: 'timesheet' }, description: d.calc.offDay ? 'تحویل فوری مدارک' : pick(['تکمیل شیت‌ها برای صدور', 'هماهنگی با مشاور سازه', 'آماده‌سازی جلسه‌ی کارفرما', 'رفع کامنت‌های بررسی']) },
        outcome, { minutes: partial ?? minutes, note: outcome.startsWith('rejected') ? 'اضافه‌کاری از پیش هماهنگ نشده بود.' : undefined })
    } else if (r < (inPrev ? 0.8 : 0.7)) {
      d.otChoice = 'unpaid'
    }
  }
  // an overtime asked in advance for next week
  addRequest(workers[8].id, 'overtime', new Date(now - 90 * 60000).toISOString(), { overtime: { date: future(2), minutes: 180, taskIds: taskIdsOf(workers[8].id, addDays(today, -1)), source: 'advance' }, description: 'تحویل مدارک مناقصه' }, 'pending_office')

  // ---- other requests ----
  const other = (userId: string, o: OtherDetails, outcome: Parameters<typeof addRequest>[4], description: string, hoursAgo: number) =>
    addRequest(userId, 'other', new Date(now - hoursAgo * 3600000).toISOString(), { other: o, description }, outcome)
  other(workers[1].id, { title: 'گواهی اشتغال به کار', category: 'certificate' }, 'approved', 'برای ارائه به بانک', 24 * 9)
  other(workers[9].id, { title: 'مانیتور دوم', category: 'equipment' }, 'pending_office', 'برای کار با مدل‌های Revit', 20)
  if (sRezaei) other(sRezaei.id, { title: 'مأموریت بازدید کارگاه بابلسر', category: 'mission', date: future(3) }, 'pending_ceo', 'بازدید مرحله‌ی سفت‌کاری با مدیر پروژه', 30)
  other(workers[14].id, { title: 'مساعده', category: 'advance_pay' }, 'rejected_ceo', 'هزینه‌ی درمان', 24 * 12)
  other(workers[20].id, { title: 'دسترسی به سرور فایل پروژه‌ی رونیکس', category: 'other' }, 'approved', '', 24 * 4)

  // requests are numbered in the order they were made
  requests.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((r, i) => {
    const oldNo = r.no
    r.no = i + 1
    if (r.leaveIds) {
      const ids = r.leaveIds.map((x) => x.replace(`l-r${oldNo}-`, `l-r${r.no}-`))
      for (const l of leaves) if (l.requestId === r.id) l.id = l.id.replace(`l-r${oldNo}-`, `l-r${r.no}-`)
      r.leaveIds = ids
    }
  })

  // ---- close last month, then settle this month ----
  const allLeaves = [...ctx.leaves, ...leaves]
  const open = settleDays({ days: settled, requests, leaves: allLeaves, holidays: ctx.holidays, configs, closes: [] }).days
  // what was still undecided in last month becomes unpaid when the month is closed
  const leftover = Object.values(open).filter((d) => d.date <= prev.to && d.calc.undecided > 0).reduce((t, d) => t + d.calc.undecided, 0)
  const closing = settleDays({ days: open, requests, leaves: allLeaves, holidays: ctx.holidays, configs, closes: [], closing: prevMonth }).days
  const close: MonthClose = { month: prevMonth, from: prev.from, to: prev.to, by: office.id, at: tehranAt(addDays(prev.to, 2), 10 * 60), unpaidMinutes: leftover }
  settled = settleDays({ days: closing, requests, leaves: allLeaves, holidays: ctx.holidays, configs, closes: [close] }).days
  audit.push({ id: 'a-ts-close', at: close.at, userId: office.id, kind: 'timesheet', text: `ماه ${fa(prevMonth.replace('-', '/'))} بسته شد؛ ${fa(hm(close.unpaidMinutes))} اضافه‌کاری بدون تعیین تکلیف، بدون پرداخت ثبت شد` })

  // prompts for the overtime still waiting for a choice, and inbox notices for the approvers
  for (const d of Object.values(settled)) if (d.calc.undecided > 0) {
    notifications.push({ userId: d.userId, at: d.updatedAt, read: false, kind: 'timesheet', title: `اضافه‌کاری ${fa(hm(d.calc.undecided))} در ${jalaliFa(d.date)}`, body: 'کار خالص این روز از ساعت موظف بیشتر شد. درخواست اضافه‌کاری ثبت کنید یا آن را بدون پرداخت بگذارید.', link: { type: 'page', page: 'timesheet' } })
  }
  for (const r of requests) if (r.status === 'pending_office' || r.status === 'pending_ceo') {
    const to = r.status === 'pending_office' ? office.id : ceo.id
    notifications.push({ userId: to, at: r.stageSince, read: false, kind: 'request', title: `درخواست ${r.kind === 'leave' ? 'مرخصی' : r.kind === 'overtime' ? 'اضافه‌کاری' : 'سایر'} از ${ctx.users.find((u) => u.id === r.userId)?.name}`, link: { type: 'page', page: 'inbox' } })
  }
  return { adminRequests: requests, timesheets: settled, timesheetConfigs: configs, monthCloses: [close], leaves, notifications, audit }
}
