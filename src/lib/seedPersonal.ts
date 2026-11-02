// Sample personal lists for a few demo accounts. Everyone else starts with an empty list and the three default statuses.
import { addDays } from './jalali'
import { defaultBoard, PALETTE } from './personal'
import type { PersonalBoard, PersonalTask, Priority, User } from './types'

type Seed = { title: string; status: string; priority?: Priority; start?: number; due?: number; description?: string; subs?: Seed[] }

export function seedPersonal(users: User[], today: string) {
  const tasks: Record<string, PersonalTask> = {}
  const boards: Record<string, PersonalBoard> = {}
  let k = 0
  const at = new Date(Date.parse(`${today}T05:00:00.000Z`) - 3 * 86400000).toISOString()
  const add = (owner: string, b: PersonalBoard, list: Seed[], parentId: string | null) => {
    list.forEach((x, i) => {
      const st = b.statuses.find((s) => s.name === x.status) ?? b.statuses[0]
      const t: PersonalTask = {
        id: `pt-s${++k}`, ownerId: owner, parentId, title: x.title, description: x.description, statusId: st.id, priority: x.priority ?? 'normal',
        start: x.start != null ? addDays(today, x.start) : undefined, due: x.due != null ? addDays(today, x.due) : undefined,
        order: i + 1, createdAt: at, updatedAt: at, completedAt: st.done ? at : undefined,
      }
      tasks[t.id] = t
      if (x.subs) add(owner, b, x.subs, t.id)
    })
  }
  const by = (u: string) => users.find((x) => x.username === u)

  // a member who made her own workflow
  const sr = by('s.rezaei')
  if (sr) {
    const b: PersonalBoard = {
      userId: sr.id, defaultStatusId: 'ps-todo',
      statuses: [
        { id: 'ps-idea', name: 'ایده', color: PALETTE[7], done: false },
        { id: 'ps-todo', name: 'برای انجام', color: PALETTE[0], done: false },
        { id: 'ps-doing', name: 'در حال انجام', color: PALETTE[1], done: false },
        { id: 'ps-wait', name: 'منتظر دیگران', color: PALETTE[4], done: false },
        { id: 'ps-done', name: 'انجام شد', color: PALETTE[3], done: true },
      ],
    }
    boards[sr.id] = b
    add(sr.id, b, [
      { title: 'آمادگی آزمون LEED Green Associate', status: 'در حال انجام', priority: 'high', start: -10, due: 25, description: 'برای آزمون اسفند', subs: [
        { title: 'مطالعه‌ی فصل‌های ۱ تا ۳', status: 'انجام شد', start: -10, due: -3 },
        { title: 'مطالعه‌ی فصل‌های ۴ تا ۶', status: 'در حال انجام', start: -2, due: 8 },
        { title: 'آزمون آزمایشی', status: 'برای انجام', start: 15, due: 20 },
        { title: 'ثبت‌نام آزمون', status: 'منتظر دیگران', due: 5 },
      ] },
      { title: 'به‌روزرسانی رزومه و نمونه‌کار', status: 'برای انجام', start: 2, due: 12, subs: [
        { title: 'انتخاب پروژه‌ها', status: 'برای انجام', start: 2, due: 4 },
        { title: 'رندرهای تازه', status: 'برای انجام', start: 5, due: 10, subs: [{ title: 'نمای اصلی بابلسر', status: 'برای انجام', start: 5, due: 7 }] },
      ] },
      { title: 'کتاب «زبان الگو»', status: 'ایده', priority: 'low' },
      { title: 'تمدید گواهینامه‌ی رانندگی', status: 'منتظر دیگران', priority: 'urgent', due: 2 },
      { title: 'خرید هدیه‌ی تولد', status: 'انجام شد', due: -1 },
    ], null)
  }
  // project control keeps a short personal list with the default statuses
  const nr = by('n.rahimi')
  if (nr) {
    const b = defaultBoard(nr.id)
    boards[nr.id] = b
    add(nr.id, b, [
      { title: 'دوره‌ی Primavera P6', status: 'در حال انجام', start: -5, due: 20, subs: [
        { title: 'جلسه‌ی ۳', status: 'انجام شد', start: -5, due: -5 },
        { title: 'جلسه‌ی ۴', status: 'برای انجام', start: 2, due: 2 },
      ] },
      { title: 'مرتب کردن پوشه‌ی دانلودها', status: 'برای انجام', priority: 'low', due: 6 },
    ], null)
  }
  return { personalTasks: tasks, personalBoards: boards }
}
