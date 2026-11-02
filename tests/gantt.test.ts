// Gantt row model tests: bars from existing fields only, summaries, defaults, unscheduled, FS links, and size.
import { initialState, isWorkItem, isClosed, statusOf, FLOW_PROGRESS, flowOf } from '../src/lib/store'
import { TODAY } from '../src/lib/seed'
import { addDays } from '../src/lib/jalali'
import { buildGantt, leafBars } from '../src/lib/gantt'
import type { Task } from '../src/lib/types'

let pass = 0, fail = 0
const out: string[] = []
const ok = (c: unknown, name: string) => { if (c) { pass++; out.push(`  ✓ ${name}`) } else { fail++; out.push(`  ✗ ${name}`) } }
const S = initialState()
const T = (p: Partial<Task>): Task => ({ id: 'x', projectId: 'P', parentId: null, kind: 'manual', name: 'x', order: 0, source: 'manual', ...p })

out.push('نوارهای یک تسک')
const d0 = TODAY
let b = leafBars(T({ start: addDays(d0, 2), due: addDays(d0, 9) }), false, d0)
ok(b.plan?.start === addDays(d0, 2) && b.plan.end === addDays(d0, 9) && !b.actual && !b.late, 'فقط برنامه‌ی فعلی (Start → Due)')
b = leafBars(T({ start: addDays(d0, -5), due: addDays(d0, 5), actualStart: addDays(d0, -4) }), false, d0)
ok(b.actual?.start === addDays(d0, -4) && b.actual.end === d0 && b.actual.ongoing && !b.late, 'شروع‌شده و تمام‌نشده: نوار واقعی تا امروز')
b = leafBars(T({ start: addDays(d0, -10), due: addDays(d0, -3), actualStart: addDays(d0, -9) }), false, d0)
ok(b.late?.start === addDays(d0, -2) && b.late.end === d0, 'در حال انجام و گذشته از Due: بخش دیرکرد از روز بعد Due تا امروز')
b = leafBars(T({ start: addDays(d0, -10), due: addDays(d0, -5), actualStart: addDays(d0, -10), actualFinish: addDays(d0, -2) }), true, d0)
ok(b.actual?.end === addDays(d0, -2) && !b.actual.ongoing && b.late?.end === addDays(d0, -2), 'دیر تمام‌شده: بخش دیرکرد تا Actual Finish')
b = leafBars(T({ start: addDays(d0, -10), due: addDays(d0, -5), actualStart: addDays(d0, -10), actualFinish: addDays(d0, -6) }), true, d0)
ok(!b.late, 'زودتر تمام‌شده: دیرکرد ندارد')
b = leafBars(T({ start: addDays(d0, -10), due: addDays(d0, -1) }), false, d0)
ok(b.overdueNotStarted, 'شروع‌نشده و گذشته از Due علامت می‌خورد')
ok(leafBars(T({ due: addDays(d0, 3) }), false, d0).milestone === addDays(d0, 3), 'فقط Due: نقطه‌ی پایان (milestone)')
ok(leafBars(T({}), false, d0).unscheduled, 'بدون تاریخ: زمان‌بندی‌نشده')

out.push('پروژه‌ی BBT')
const prog = (t: Task) => (t.kind === 'supervision' || t.kind === 'internal' ? FLOW_PROGRESS[flowOf(t)] : isWorkItem(t) ? statusOf(S, t)?.progress ?? 0 : 0)
const base = { tasks: S.tasks, projects: S.projects, progressOf: prog, closedOf: (t: Task) => isClosed(S, t), showUnscheduled: false, open: {}, today: TODAY }
const bbt = Object.values(S.tasks).filter((t) => isWorkItem(t) && t.projectId === 'BBT')
let m = buildGantt({ ...base, leaves: bbt })
ok(m.rows.length > 0 && m.rows.every((r) => r.level <= 2) && m.rows.some((r) => r.task?.kind === 'phase') && m.rows.some((r) => r.task?.kind === 'group'), 'پیش‌فرض: Phase و Stage باز، Groupها بسته')
ok(!m.rows.some((r) => r.task?.kind === 'document'), 'تسک‌های سطح سند تا باز کردن Group دیده نمی‌شوند')
const phase = m.rows.find((r) => r.task?.kind === 'phase')!
const under = bbt.filter((t) => { let p = t.parentId ? S.tasks[t.parentId] : undefined; while (p) { if (p.id === phase.task!.id) return true; p = p.parentId ? S.tasks[p.parentId] : undefined } return false }).filter((t) => t.start && t.due)
ok(phase.plan?.start === under.map((t) => t.start!).sort()[0] && phase.plan?.end === under.map((t) => t.due!).sort().reverse()[0], 'نوار خلاصه‌ی Phase = کمترین Start تا بیشترین Due فرزندان')
const all = buildGantt({ ...base, leaves: bbt, allOpen: true })
ok(all.rows.filter((r) => r.kind === 'task').length === bbt.filter((t) => !leafBars(t, isClosed(S, t), TODAY).unscheduled).length, 'با باز کردن همه، همه‌ی تسک‌های زمان‌بندی‌شده ردیف دارند')
const docRow = all.rows.find((r) => r.task?.kind === 'document' && r.task.start)!
ok(docRow.plan?.start === docRow.task!.start && docRow.plan?.end === docRow.task!.due, 'ردیف سند تاریخ‌های خودش را نشان می‌دهد')
const closed = buildGantt({ ...base, leaves: bbt, allOpen: true, open: { [phase.key]: false } })
ok(closed.rows.length < all.rows.length && closed.rows.find((r) => r.key === phase.key)?.open === false, 'بستن یک Phase زیرمجموعه‌اش را پنهان می‌کند')

out.push('زمان‌بندی‌نشده‌ها')
const rnx = Object.values(S.tasks).filter((t) => isWorkItem(t) && t.projectId === 'RNX')
const noDates = rnx.filter((t) => !t.start && !t.due && !t.actualStart).length
m = buildGantt({ ...base, leaves: rnx, allOpen: true })
ok(m.hiddenUnscheduled === noDates && noDates > 0 && !m.rows.some((r) => r.unscheduled), `پنهان با شمارش (${noDates} تسک RNX)`)
m = buildGantt({ ...base, leaves: rnx, allOpen: true, showUnscheduled: true })
ok(m.rows.filter((r) => r.unscheduled).length === noDates && m.hiddenUnscheduled === 0, 'با کلید نمایش، ردیف بدون نوار می‌گیرند')

out.push('موارد نظارتی')
const sup = Object.values(S.tasks).filter((t) => t.kind === 'supervision' && t.projectId === 'BBT')
m = buildGantt({ ...base, leaves: bbt, extras: { key: 'sup', label: 'نظارت و اجرا', tasks: sup } })
const g = m.rows.findIndex((r) => r.key === 'sup')
ok(g >= 0 && m.rows[g].kind === 'group' && m.rows.slice(g + 1).every((r) => r.task?.kind === 'supervision') && m.rows.length - g - 1 === sup.length, 'گروه جدا «نظارت و اجرا» با همه‌ی موارد پروژه')

out.push('پیش‌نیازها (Finish-to-Start)')
const leavesAll = bbt.filter((t) => t.start && t.due)
const [p1, p2] = leavesAll.slice(0, 2)
const tasks2 = { ...S.tasks, [p2.id]: { ...p2, dependsOn: [p1.id] } }
m = buildGantt({ ...base, tasks: tasks2, leaves: leavesAll.map((t) => tasks2[t.id]), allOpen: true })
const link = m.links.find((l) => l.fromId === p1.id && l.toId === p2.id)
const s2 = tasks2[p2.id].actualStart ?? tasks2[p2.id].start!, f1 = p1.actualFinish ?? p1.due!
ok(link && m.rows[link.from].task!.id === p1.id && m.rows[link.to].task!.id === p2.id, 'پیکان بین دو ردیف ساخته شد')
ok(link && link.violated === s2 < f1, `هشدار نقض فقط وقتی شروع پسین قبل از پایان پیشین است (${s2} / ${f1})`)
const tasks3 = { ...tasks2, [p2.id]: { ...tasks2[p2.id], start: addDays(f1, 1), actualStart: undefined } }
m = buildGantt({ ...base, tasks: tasks3, leaves: leavesAll.map((t) => tasks3[t.id]), allOpen: true })
ok(m.links.find((l) => l.toId === p2.id)?.violated === false, 'شروع بعد از پایان پیشین: بدون هشدار')

out.push('حجم')
const many: Record<string, Task> = {}
const leaves: Task[] = []
for (let ph = 0; ph < 4; ph++) {
  const P = T({ id: `ph${ph}`, kind: 'phase', name: `فاز ${ph}`, order: ph * 1e6 }); many[P.id] = P
  for (let st = 0; st < 10; st++) {
    const ST = T({ id: `st${ph}-${st}`, kind: 'stage', parentId: P.id, order: P.order + st * 1e4 }); many[ST.id] = ST
    for (let gr = 0; gr < 10; gr++) {
      const G = T({ id: `g${ph}-${st}-${gr}`, kind: 'group', parentId: ST.id, order: ST.order + gr * 100 }); many[G.id] = G
      for (let k = 0; k < 50; k++) {
        const s0 = addDays(TODAY, -100 + ((ph * 31 + st * 7 + gr * 3 + k) % 200))
        const L = T({ id: `d${ph}-${st}-${gr}-${k}`, kind: 'document', parentId: G.id, order: G.order + k, start: s0, due: addDays(s0, 5 + (k % 9)), actualStart: k % 3 ? s0 : undefined })
        many[L.id] = L; leaves.push(L)
      }
    }
  }
}
let t0 = performance.now()
const big = buildGantt({ ...base, tasks: many, projects: [{ id: 'P', name: 'p', code: 'P' }], leaves, allOpen: true })
const ms = performance.now() - t0
ok(leaves.length === 20000 && big.rows.length === 20000 + 4 + 40 + 400 && ms < 1500, `۲۰٬۰۰۰ تسک: ${big.rows.length} ردیف در ${Math.round(ms)} میلی‌ثانیه`)
t0 = performance.now()
const folded = buildGantt({ ...base, tasks: many, projects: [{ id: 'P', name: 'p', code: 'P' }], leaves })
ok(folded.rows.length === 4 + 40 + 400 && performance.now() - t0 < 1500, `پیش‌فرض بسته: ${folded.rows.length} ردیف`)

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
