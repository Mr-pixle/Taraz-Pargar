// Time tracking — pure functions shared by the reducer, the UI, the seed and future management reports.
import type { Task, WorkLog } from './types'

export const MAX_DAY_MINUTES = 24 * 60
export const activeLogs = (logs: WorkLog[]) => logs.filter((l) => !l.deletedAt)
export const sumMinutes = (logs: WorkLog[]) => activeLogs(logs).reduce((s, l) => s + l.minutes, 0)
export const logsOfTask = (logs: WorkLog[], taskId: string) => logs.filter((l) => l.taskId === taskId)

/** Minutes a person already logged on a day, across all tasks (optionally ignoring one record being edited) */
export const dayTotal = (logs: WorkLog[], userId: string, workDate: string, exceptId?: string) =>
  activeLogs(logs).filter((l) => l.userId === userId && l.workDate === workDate && l.id !== exceptId).reduce((s, l) => s + l.minutes, 0)

export type TimeState = 'none' | 'normal' | 'near' | 'over'
export interface TimeTracking {
  /** Original Estimation in hours (first Estimation ever set) */
  original: number | null
  /** current Estimation in hours, when it was revised after the original */
  current: number | null
  logged: number
  remaining: number | null
  /** Time Progress (%) = Logged ÷ Original Estimation × 100 */
  progress: number | null
  /** Logged − Original Estimation (hours); positive = over the estimate */
  variance: number | null
  state: TimeState
  byUser: { userId: string; minutes: number }[]
  records: number
}

/** Thresholds: under 80 % normal, 80–100 % near the estimate, over 100 % over the estimate */
export function timeState(progress: number | null): TimeState {
  if (progress == null) return 'none'
  return progress > 100 ? 'over' : progress >= 80 ? 'near' : 'normal'
}

export function timeTracking(t: Task, logs: WorkLog[]): TimeTracking {
  const mine = activeLogs(logsOfTask(logs, t.id))
  const minutes = mine.reduce((s, l) => s + l.minutes, 0)
  const logged = minutes / 60
  const original = t.baselineEstimation ?? t.estimation ?? null
  const current = t.estimation != null && original != null && t.estimation !== original ? t.estimation : null
  const progress = original ? (logged / original) * 100 : null
  const by = new Map<string, number>()
  for (const l of mine) by.set(l.userId, (by.get(l.userId) ?? 0) + l.minutes)
  return {
    original, current, logged,
    remaining: original != null ? Math.max(0, original - logged) : null,
    progress, variance: original != null ? logged - original : null, state: timeState(progress),
    byUser: [...by.entries()].map(([userId, m]) => ({ userId, minutes: m })).sort((a, b) => b.minutes - a.minutes),
    records: mine.length,
  }
}

/** Management reports (per user, team or project, optionally in a date range) — minutes per key */
export function aggregate(logs: WorkLog[], by: 'user' | 'team' | 'project' | 'task', range?: { from?: string; to?: string }) {
  const out = new Map<string, number>()
  for (const l of activeLogs(logs)) {
    if (range?.from && l.workDate < range.from) continue
    if (range?.to && l.workDate > range.to) continue
    const k = by === 'user' ? l.userId : by === 'team' ? l.teamId : by === 'project' ? l.projectId : l.taskId
    out.set(k, (out.get(k) ?? 0) + l.minutes)
  }
  return out
}

/** Hours and minutes fields → total minutes; null when empty, negative or not a number */
export function parseDuration(hours: string, minutes: string): number | null {
  const h = Number(hours || 0), m = Number(minutes || 0)
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return null
  const total = Math.round(h * 60 + m)
  return total > 0 ? total : null
}
