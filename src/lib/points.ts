// Point engine — pure functions shared by the reducer, the seed and the UI (moves to the server unchanged).
// Point = (W.F / Estimation) × multiplier × (early or late person-hours); hours = working days × hoursPerDay.
import { addDays, isWeekend } from './jalali'
import type { PointCalc, PointConfig, PointEntry, Task } from './types'

export const DEFAULT_POINT_CONFIG: Omit<PointConfig, 'by' | 'at'> = {
  version: 1, multiplier: 100, hoursPerDay: 8, earlyFactor: 1, lateFactor: 1, cap: null,
  reason: 'فرمول پایه: (W.F ÷ Estimation) × ۱۰۰ × نفرساعت تعجیل یا تأخیر؛ روز کاری × ۸ ساعت',
}

/** Working days d with from < d ≤ to (Saturday–Wednesday, official holidays excluded) */
export function workdaysBetween(from: string, to: string, holidays: Set<string>): number {
  let n = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isWeekend(d) && !holidays.has(d)) n++
  return n
}

export type CalcResult = { ok: true; userId: string; points: number; calc: PointCalc } | { ok: false; reason: string }

export function calcPoint(t: Task, completedOn: string, cfg: PointConfig, holidays: Set<string>): CalcResult {
  if (!t.assigneeUserId) return { ok: false, reason: t.assigneeTeamId ? 'به تیم تخصیص داده شده، نه به یک نفر' : 'مسئول ندارد' }
  if (!t.estimation || t.estimation <= 0) return { ok: false, reason: 'Estimation ندارد' }
  if (!t.due) return { ok: false, reason: 'Due Date ندارد' }
  const wf = t.wf ?? 1
  const direction = completedOn < t.due ? 'early' : completedOn > t.due ? 'late' : 'ontime'
  const workdays = direction === 'early' ? workdaysBetween(completedOn, t.due, holidays) : direction === 'late' ? workdaysBetween(t.due, completedOn, holidays) : 0
  const dir = workdays === 0 ? 'ontime' : direction
  const hours = workdays * cfg.hoursPerDay
  const factor = dir === 'early' ? cfg.earlyFactor : dir === 'late' ? -cfg.lateFactor : 0
  let raw = (wf / t.estimation) * cfg.multiplier * hours * factor
  let capped = false
  if (cfg.cap != null && Math.abs(raw) > cfg.cap) { raw = Math.sign(raw) * cfg.cap; capped = true }
  const points = Math.round(raw * 10) / 10 || 0
  return {
    ok: true, userId: t.assigneeUserId, points,
    calc: { wf, estimation: t.estimation, due: t.due, completedOn, workdays, hours, direction: dir, multiplier: cfg.multiplier, hoursPerDay: cfg.hoursPerDay, factor: Math.abs(factor), capped, configVersion: cfg.version },
  }
}

export const activeAward = (entries: PointEntry[], taskId: string) => entries.find((e) => e.taskId === taskId && e.kind === 'task' && !e.reversedBy)

type SettleCtx = { reason: string; actorId: string; now: string; today: string; force?: boolean; newId: () => string }
export type SettleResult = { entries: PointEntry[]; added: PointEntry[]; skipped?: string }

/**
 * Brings the ledger in line with the task: at most one active row per task.
 * Same inputs → nothing happens (idempotent). Different inputs, reopened task or forced recalculation → reversal (+ new row).
 */
export function settleTask(entries: PointEntry[], t: Task, closed: boolean, cfg: PointConfig, holidays: Set<string>, ctx: SettleCtx): SettleResult {
  const active = activeAward(entries, t.id)
  const desired = closed && t.actualFinish ? calcPoint(t, t.actualFinish, cfg, holidays) : null
  const want = desired && desired.ok ? desired : null
  if (active && want) {
    const a = active.calc!
    const same = active.userId === want.userId && a.wf === want.calc.wf && a.estimation === want.calc.estimation && a.due === want.calc.due && a.completedOn === want.calc.completedOn
    if (same && (!ctx.force || a.configVersion === cfg.version)) return { entries, added: [] }
  }
  if (!active && !want) return { entries, added: [], skipped: desired && !desired.ok ? desired.reason : undefined }
  let next = entries
  const added: PointEntry[] = []
  if (active) {
    const rev: PointEntry = { id: ctx.newId(), userId: active.userId, taskId: t.id, kind: 'reversal', points: -active.points || 0, date: ctx.today, at: ctx.now, actorId: ctx.actorId, reason: ctx.reason, reverses: active.id }
    next = next.map((e) => (e.id === active.id ? { ...e, reversedBy: rev.id } : e))
    added.push(rev)
  }
  if (want) added.push({ id: ctx.newId(), userId: want.userId, taskId: t.id, kind: 'task', points: want.points, date: want.calc.completedOn, at: ctx.now, actorId: ctx.actorId, reason: ctx.reason, calc: want.calc })
  return { entries: [...next, ...added], added, skipped: desired && !desired.ok ? desired.reason : undefined }
}

/** Rows that make up the current balance: active task rows and adjustments (reversed pairs cancel out) */
export const effectiveEntries = (entries: PointEntry[]) => entries.filter((e) => (e.kind === 'task' && !e.reversedBy) || e.kind === 'adjust')

export interface PointSummary {
  earned: number; deducted: number; adjustPlus: number; adjustMinus: number
  total: number; net: number; early: number; late: number; ontime: number; avgHours: number | null; tasks: number
}
/** total = everything credited (early points + positive adjustments); net = total − deductions */
export function summarize(rows: PointEntry[]): PointSummary {
  const eff = effectiveEntries(rows)
  const s: PointSummary = { earned: 0, deducted: 0, adjustPlus: 0, adjustMinus: 0, total: 0, net: 0, early: 0, late: 0, ontime: 0, avgHours: null, tasks: 0 }
  let hours = 0
  for (const e of eff) {
    if (e.kind === 'adjust') { if (e.points > 0) s.adjustPlus += e.points; else s.adjustMinus -= e.points; continue }
    s.tasks++
    if (e.points > 0) s.earned += e.points
    if (e.points < 0) s.deducted -= e.points
    const c = e.calc!
    if (c.direction === 'early') { s.early++; hours += c.hours } else if (c.direction === 'late') { s.late++; hours -= c.hours } else s.ontime++
  }
  s.total = s.earned + s.adjustPlus
  s.net = s.total - s.deducted - s.adjustMinus
  s.avgHours = s.tasks ? hours / s.tasks : null
  const r = (x: number) => Math.round(x * 10) / 10
  return { ...s, earned: r(s.earned), deducted: r(s.deducted), adjustPlus: r(s.adjustPlus), adjustMinus: r(s.adjustMinus), total: r(s.total), net: r(s.net) }
}

/** Human-readable reason of a calculation, e.g. «۲ روز کاری زودتر = ۱۶ نفرساعت» (digits formatted by the caller) */
export function calcSentence(c: PointCalc, n: (x: number, f?: number) => string) {
  if (c.direction === 'ontime') return 'سر موعد'
  return `${n(c.workdays)} روز کاری ${c.direction === 'early' ? 'زودتر' : 'دیرتر'} = ${n(c.hours)} نفرساعت`
}
export function calcFormula(c: PointCalc, points: number, n: (x: number, f?: number) => string) {
  return `${c.direction === 'late' ? '− ' : ''}(${n(c.wf, 2)} ÷ ${n(c.estimation, 1)}) × ${n(c.multiplier)} × ${n(c.hours)}${c.factor !== 1 && c.direction !== 'ontime' ? ` × ${n(c.factor, 2)}` : ''} = ${points > 0 ? '+' : ''}${n(points, 1)}${c.capped ? ' (سقف)' : ''}`
}
