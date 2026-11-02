// Resource Planning engine — pure functions, no UI / DB dependencies.
// Work week: Saturday–Wednesday, 8h/day by default; Thursday & Friday off; holidays and leaves reduce capacity.
import { addDays, isWeekend } from './jalali'
import type { Allocation, User } from './types'

export type Resource = { kind: 'user'; id: string } | { kind: 'team'; id: string }

export interface PlanInput {
  users: Pick<User, 'id' | 'teamId' | 'capacity'>[]
  holidays: Iterable<string>
  leaves: { userId: string; date: string; hours: number }[]
  allocations: Allocation[]
}

export interface DayPlan { date: string; hours: number; free: number; capacity: number }

export type Validation =
  | { ok: true; days: DayPlan[]; free: number }
  | { ok: false; days: DayPlan[]; free: number; excess: number; fullDays: string[]; reason: 'over' | 'range' }

const r2 = (n: number) => Math.round(n * 100) / 100
const HORIZON = 500

export function createPlanner(input: PlanInput, excludeTaskId?: string) {
  const holidays = new Set(input.holidays)
  const userById = new Map(input.users.map((u) => [u.id, u]))
  const membersOf = new Map<string, string[]>()
  for (const u of input.users) {
    const list = membersOf.get(u.teamId) ?? []
    list.push(u.id)
    membersOf.set(u.teamId, list)
  }
  const leave = new Map<string, number>()
  for (const l of input.leaves) leave.set(`${l.userId}|${l.date}`, (leave.get(`${l.userId}|${l.date}`) ?? 0) + l.hours)
  const usedUser = new Map<string, number>()
  const usedTeam = new Map<string, number>()
  for (const a of input.allocations) {
    if (a.taskId === excludeTaskId) continue
    if (a.userId) usedUser.set(`${a.userId}|${a.date}`, (usedUser.get(`${a.userId}|${a.date}`) ?? 0) + a.hours)
    usedTeam.set(`${a.teamId}|${a.date}`, (usedTeam.get(`${a.teamId}|${a.date}`) ?? 0) + a.hours)
  }

  const isWorkday = (date: string) => !isWeekend(date) && !holidays.has(date)

  const userCapacity = (uid: string, date: string) => {
    if (!isWorkday(date)) return 0
    const u = userById.get(uid)
    if (!u) return 0
    return Math.max(0, u.capacity - (leave.get(`${uid}|${date}`) ?? 0))
  }
  const teamCapacity = (tid: string, date: string) =>
    (membersOf.get(tid) ?? []).reduce((s, uid) => s + userCapacity(uid, date), 0)

  const capacity = (res: Resource, date: string) =>
    res.kind === 'user' ? userCapacity(res.id, date) : teamCapacity(res.id, date)

  const used = (res: Resource, date: string) =>
    res.kind === 'user' ? usedUser.get(`${res.id}|${date}`) ?? 0 : usedTeam.get(`${res.id}|${date}`) ?? 0

  /** Free hours. A person is also limited by what is left in their team's pooled capacity. */
  const free = (res: Resource, date: string) => {
    if (res.kind === 'team') return Math.max(0, r2(teamCapacity(res.id, date) - used(res, date)))
    const own = userCapacity(res.id, date) - used(res, date)
    const u = userById.get(res.id)
    const teamLeft = u ? teamCapacity(u.teamId, date) - (usedTeam.get(`${u.teamId}|${date}`) ?? 0) : own
    return Math.max(0, r2(Math.min(own, teamLeft)))
  }

  /** Fill day by day from start until the hours are used up (or until `due`, if given). */
  const fill = (res: Resource, start: string, hours: number, due?: string) => {
    const days: DayPlan[] = []
    let remaining = hours
    let d = start
    let guard = 0
    const last = due ?? addDays(start, HORIZON)
    while (remaining > 0.001 && d <= last && guard++ < HORIZON + 5) {
      const cap = capacity(res, d)
      const f = free(res, d)
      const h = r2(Math.min(f, remaining))
      if (cap > 0) days.push({ date: d, hours: h, free: f, capacity: cap })
      remaining = r2(remaining - h)
      d = addDays(d, 1)
    }
    const lastWorked = [...days].reverse().find((x) => x.hours > 0)
    return { days, remaining: Math.max(0, remaining), end: lastWorked?.date ?? start }
  }

  const freeBetween = (res: Resource, start: string, due: string) => {
    let s = 0
    for (let d = start; d <= due; d = addDays(d, 1)) s += free(res, d)
    return r2(s)
  }

  /** Free hours between Start and Due must cover the Estimation. */
  const validate = (res: Resource, start: string, due: string, estimation: number): Validation => {
    if (due < start) return { ok: false, days: [], free: 0, excess: estimation, fullDays: [], reason: 'range' }
    const { days, remaining } = fill(res, start, estimation, due)
    const freeSum = freeBetween(res, start, due)
    if (remaining > 0.001) {
      const fullDays: string[] = []
      for (let d = start; d <= due; d = addDays(d, 1)) if (capacity(res, d) > 0 && free(res, d) === 0) fullDays.push(d)
      return { ok: false, days, free: freeSum, excess: r2(remaining), fullDays, reason: 'over' }
    }
    return { ok: true, days: days.filter((x) => x.hours > 0), free: freeSum }
  }

  /** Earliest date by which the hours fit into free capacity. */
  const suggestDue = (res: Resource, start: string, estimation: number) => {
    const { remaining, end } = fill(res, start, estimation)
    return remaining > 0.001 ? null : end
  }

  return { isWorkday, capacity, used, free, fill, validate, suggestDue, freeBetween, teamCapacity, userCapacity }
}

export function toAllocations(taskId: string, res: Resource, teamId: string, days: DayPlan[]): Allocation[] {
  return days
    .filter((d) => d.hours > 0)
    .map((d) => ({ taskId, teamId, userId: res.kind === 'user' ? res.id : undefined, date: d.date, hours: d.hours }))
}
