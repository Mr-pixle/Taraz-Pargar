// Personal tasks — pure rules. This is a separate, private system: it reads and writes only `personalTasks` and
// `personalBoards`, never project tasks, plans, leaves, points or Work Logs, so nothing here can reach a report.
import type { PersonalBoard, PersonalStatus, PersonalTask, Priority } from './types'

/** Status colours: each one is readable as a dot or tinted chip in both themes, and the name is always shown with it */
export const PALETTE = ['#8a8f98', '#1b57d5', '#0f8a80', '#2f8f46', '#c98a06', '#e0662f', '#d6453f', '#7c4dff', '#c03b86'] as const
export const MAX_STATUSES = 12
export const MAX_DEPTH = 3

export function defaultBoard(userId: string): PersonalBoard {
  return {
    userId, defaultStatusId: 'ps-todo',
    statuses: [
      { id: 'ps-todo', name: 'برای انجام', color: PALETTE[0], done: false },
      { id: 'ps-doing', name: 'در حال انجام', color: PALETTE[1], done: false },
      { id: 'ps-done', name: 'انجام شد', color: PALETTE[3], done: true },
    ],
  }
}
/** A person's board; people who never changed it get the three default statuses */
export const boardOf = (boards: Record<string, PersonalBoard>, userId: string) => boards[userId] ?? defaultBoard(userId)
/** Only the owner's tasks — the single read path the UI uses */
export const tasksOf = (all: Record<string, PersonalTask>, userId: string) => Object.values(all).filter((t) => t.ownerId === userId)

export const statusOfTask = (b: PersonalBoard, t: PersonalTask): PersonalStatus => b.statuses.find((s) => s.id === t.statusId) ?? b.statuses.find((s) => s.id === b.defaultStatusId) ?? b.statuses[0]
export const isDone = (b: PersonalBoard, t: PersonalTask) => statusOfTask(b, t).done
export const firstDone = (b: PersonalBoard) => b.statuses.find((s) => s.done)!

export function childrenOf(list: PersonalTask[], parentId: string | null) {
  return list.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order)
}
export function descendants(list: PersonalTask[], id: string): PersonalTask[] {
  const out: PersonalTask[] = []
  const walk = (pid: string) => { for (const c of list.filter((t) => t.parentId === pid)) { out.push(c); walk(c.id) } }
  walk(id)
  return out
}
export function ancestorsOf(all: Record<string, PersonalTask>, t: PersonalTask) {
  const out: PersonalTask[] = []
  let p = t.parentId ? all[t.parentId] : undefined
  while (p && out.length < 20) { out.unshift(p); p = p.parentId ? all[p.parentId] : undefined }
  return out
}
export const depthOf = (all: Record<string, PersonalTask>, t: PersonalTask) => ancestorsOf(all, t).length
/** height of the subtree under a task (0 = no subtasks) */
export function heightOf(list: PersonalTask[], id: string): number {
  const kids = list.filter((t) => t.parentId === id)
  return kids.length ? 1 + Math.max(...kids.map((k) => heightOf(list, k.id))) : 0
}
/** Depth-first order: each task followed by its subtasks */
export function flatten(list: PersonalTask[], open?: (id: string) => boolean) {
  const rows: { t: PersonalTask; level: number; hasKids: boolean }[] = []
  const walk = (pid: string | null, level: number) => {
    for (const t of childrenOf(list, pid)) {
      const hasKids = list.some((x) => x.parentId === t.id)
      rows.push({ t, level, hasKids })
      if (hasKids && (!open || open(t.id))) walk(t.id, level + 1)
    }
  }
  walk(null, 0)
  return rows
}
/** Completion of the subtasks directly under a task */
export function subProgress(b: PersonalBoard, list: PersonalTask[], id: string) {
  const kids = list.filter((t) => t.parentId === id)
  return { done: kids.filter((k) => isDone(b, k)).length, total: kids.length }
}
/** Dates of the subtasks of a task, to show how they sit against it on the timeline */
export function childSpan(list: PersonalTask[], id: string) {
  let start: string | null = null, end: string | null = null
  for (const c of descendants(list, id)) {
    const s = c.start ?? c.due, e = c.due ?? c.start
    if (s && (!start || s < start)) start = s
    if (e && (!end || e > end)) end = e
  }
  return start && end ? { start, end } : null
}
export const nextOrder = (list: PersonalTask[], ownerId: string, parentId: string | null) =>
  Math.max(0, ...list.filter((t) => t.ownerId === ownerId && t.parentId === parentId).map((t) => t.order)) + 1

// ---------- validation ----------
const ISO = /^\d{4}-\d{2}-\d{2}$/
const HEX = /^#[0-9a-fA-F]{6}$/
export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent']

export function checkFields(f: { title?: string; description?: string; priority?: string; start?: string; due?: string }, partial = false): string | null {
  if (!partial || f.title !== undefined) {
    if (!String(f.title ?? '').trim()) return 'عنوان را بنویسید.'
    if (String(f.title).length > 200) return 'عنوان طولانی است.'
  }
  if (f.description !== undefined && String(f.description).length > 4000) return 'توضیحات طولانی است.'
  if (f.priority !== undefined && !PRIORITIES.includes(f.priority as Priority)) return 'اولویت نامعتبر است.'
  if (f.start && !ISO.test(f.start)) return 'تاریخ شروع نامعتبر است.'
  if (f.due && !ISO.test(f.due)) return 'موعد نامعتبر است.'
  if (f.start && f.due && f.due < f.start) return 'موعد نمی‌تواند پیش از شروع باشد.'
  return null
}

/** A status list is valid when names are unique, at least one status means "done" and the default is one of them */
export function checkBoard(statuses: PersonalStatus[], defaultStatusId: string): string | null {
  if (!Array.isArray(statuses) || !statuses.length) return 'دست‌کم یک Status لازم است.'
  if (statuses.length > MAX_STATUSES) return `حداکثر ${MAX_STATUSES} Status.`
  const names = new Set<string>()
  for (const s of statuses) {
    const n = String(s?.name ?? '').trim()
    if (!n) return 'نام همه‌ی Statusها را بنویسید.'
    if (n.length > 30) return 'نام Status حداکثر ۳۰ نویسه است.'
    if (names.has(n)) return `نام «${n}» تکراری است.`
    names.add(n)
    if (!HEX.test(String(s.color))) return 'رنگ نامعتبر است.'
    if (!s.id || typeof s.id !== 'string') return 'Status نامعتبر است.'
  }
  if (new Set(statuses.map((s) => s.id)).size !== statuses.length) return 'Status تکراری است.'
  if (!statuses.some((s) => s.done)) return 'دست‌کم یک Status باید «تکمیل‌شده» باشد.'
  if (!statuses.some((s) => !s.done)) return 'دست‌کم یک Status باید باز (تکمیل‌نشده) باشد.'
  if (!statuses.some((s) => s.id === defaultStatusId)) return 'Status پیش‌فرض را انتخاب کنید.'
  return null
}
