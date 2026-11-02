import { useMemo, useState } from 'react'
import { Briefcase, CalendarDays, ChevronLeft, ChevronRight, Landmark, List, Lock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FIN_SPACE_FA, flowOf, flowProgress, useFmt, useStore } from '@/lib/store'
import type { FinSpace } from '@/lib/domain'
import { canSeeFinSpace, finSpacesOf, listFinTasks } from '@/lib/policy'
import { TODAY } from '@/lib/seed'
import { J_MONTHS, WEEKDAYS, WEEKDAYS_SHORT, addDays, addJMonths, diffDays, isWeekend, jMonthLength, startOfJMonth, toJalali, weekdayIndex } from '@/lib/jalali'
import { L } from '@/lib/taskFields'
import type { Task } from '@/lib/types'
import { Bar, Empty, Initials, PageHeader, Segmented } from '@/components/common'
import { CreateFlowTaskDialog, DueText, FlowList, FlowPill, PriorityChip, useFlowFilters } from '@/components/FlowViews'

/**
 * Finance & Administration section: two separate spaces. Finance (CEO + Financial Manager) and Administrative / management
 * (CEO + Administrative Manager). The page reads tasks only through listFinTasks (the service-side read) for one space at a time:
 * a space the user may not open returns nothing, and every write is checked again by the reducer guard.
 */
const SPACE_ABOUT: Record<FinSpace, string> = {
  finance: 'Taskهای مالی دفتر: حساب‌ها، مالیات، مطالبات، بودجه و نقدینگی. فقط مدیرعامل و مدیر مالی این فضا را می‌بینند.',
  office: 'Taskهای اداری و مدیریتی دفتر: قراردادها، بیمه، پروانه‌ها، خرید و آیین‌نامه‌ها. فقط مدیرعامل و مدیر اداری این فضا را می‌بینند.',
}
export function FinAdminPage() {
  const { state, me, dispatch } = useStore()
  const spaces = finSpacesOf(me)
  const asked = state.nav.space
  const space: FinSpace | undefined = asked ?? spaces[0]
  if (!spaces.length) return <Empty icon={<Lock className="h-6 w-6" />} title="فضای مالی و اداری فقط برای مدیرعامل، مدیر مالی و مدیر اداری است" />
  if (!space || !canSeeFinSpace(me, space)) return <Empty icon={<Lock className="h-6 w-6" />} title={space === 'finance' ? 'فضای مالی فقط برای مدیرعامل و مدیر مالی است' : 'فضای اداری فقط برای مدیرعامل و مدیر اداری است'} hint={spaces.length ? `شما به ${spaces.map((x) => FIN_SPACE_FA[x]).join(' و ')} دسترسی دارید.` : undefined} />
  return (
    <div className="flex flex-col gap-5">
      {spaces.length > 1 && (
        <div role="tablist" aria-label="فضاهای بخش مالی و اداری" className="glass-seg inline-flex w-max gap-0.5 !rounded-full p-0.5">
          {spaces.map((x) => (
            <button key={x} role="tab" id={`fin-tab-${x}`} aria-selected={x === space} onClick={() => dispatch({ type: 'nav', nav: { page: 'finadmin', space: x } })}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors', x === space ? 'bg-background font-semibold text-foreground shadow-sm [&_svg]:text-azure' : 'text-muted-foreground hover:text-foreground')}>
              {x === 'finance' ? <Landmark className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}{FIN_SPACE_FA[x]}
            </button>
          ))}
        </div>
      )}
      <SpaceView key={space} space={space} />
    </div>
  )
}

function SpaceView({ space }: { space: FinSpace }) {
  const { state, me, activeUsers } = useStore()
  const { n, pct } = useFmt()
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [open, setOpen] = useState(false)
  const tasks = useMemo(() => listFinTasks(state, me, space).sort((a, b) => a.order - b.order), [state, me, space])
  const { filtered, bar } = useFlowFilters(tasks, 'fa')
  const people = activeUsers.filter((u) => canSeeFinSpace(u, space))
  const late = (t: Task) => flowOf(t) !== 'closed' && !!t.due && t.due < TODAY
  const openTasks = tasks.filter((t) => flowOf(t) !== 'closed')
  return (
    <div className="flex flex-col gap-5" data-space={space}>
      <PageHeader eyebrow="فضای مالی و اداری" title={FIN_SPACE_FA[space]} actions={
        <>
          <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'فهرست', icon: <List className="h-3.5 w-3.5" /> }, { value: 'calendar', label: 'تقویم', icon: <CalendarDays className="h-3.5 w-3.5" /> }]} />
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Task تازه</Button>
        </>
      }>
        {SPACE_ABOUT[space]} هماهنگی و نظارت با مدیرعامل است؛ دسترسی در سطح سرویس هم بررسی می‌شود و Taskهای این فضا در هیچ گزارش، Workload، Work Log یا امتیازدهی دیگری نمی‌آیند.
      </PageHeader>

      <section aria-label="کار هر نفر" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="glass-card flex flex-col gap-2 p-4">
          <div className="eyebrow">کل {FIN_SPACE_FA[space]}</div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-[11px] text-muted-foreground">باز</dt><dd className="num text-[18px] font-bold">{n(openTasks.length)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">در بررسی</dt><dd className="num text-[18px] font-bold text-azure">{n(openTasks.filter((t) => flowOf(t) === 'in_review').length)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">دیرکرد</dt><dd className={cn('num text-[18px] font-bold', openTasks.some(late) && 'text-destructive')}>{n(openTasks.filter(late).length)}</dd></div>
          </dl>
        </div>
        {people.map((u) => {
          const mine = openTasks.filter((t) => t.assigneeUserId === u.id)
          const avg = mine.length ? mine.reduce((s, t) => s + flowProgress(t), 0) / mine.length : 0
          const toDecide = openTasks.filter((t) => t.flow === 'in_review' && t.reviewerId === u.id).length
          return (
            <div key={u.id} className="glass-card flex flex-col gap-2 p-4" data-person={u.username}>
              <div className="flex items-center gap-2">
                <Initials user={u} size={28} />
                <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold">{u.name}</div><div className="text-[11px] text-muted-foreground">{u.title}</div></div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                <span>باز <b className="num text-foreground">{n(mine.length)}</b></span>
                <span>دیرکرد <b className={cn('num', mine.some(late) ? 'text-destructive' : 'text-foreground')}>{n(mine.filter(late).length)}</b></span>
                {toDecide > 0 && <span>منتظر تصمیم <b className="num text-azure">{n(toDecide)}</b></span>}
              </div>
              <div className="flex items-center gap-2"><Bar value={avg} /><span className="num w-9 shrink-0 text-end text-[11.5px]">{pct(avg)}</span></div>
            </div>
          )
        })}
      </section>

      <div className="flex flex-col gap-3">
        {bar}
        {tasks.length === 0 ? <Empty icon={<Landmark className="h-6 w-6" />} title="هنوز Taskی در این فضا نیست" hint="با «Task تازه» کار را ثبت و ارجاع دهید." />
          : view === 'list' ? (filtered.length ? <FlowList tasks={filtered} estimation={false} /> : <Empty title="Taskی با این فیلترها نیست" />)
            : <SpanCalendar tasks={filtered} idPrefix="fa" />}
      </div>
      {open && <CreateFlowTaskDialog kind="finadmin" finSpace={space} open onOpenChange={setOpen} />}
    </div>
  )
}

// ---------------- Calendar by Start and Due ----------------
type Span = { t: Task; s: string; e: string }
const spanOf = (t: Task): Span | null => {
  const s = t.start ?? t.due, e = t.due ?? t.start
  if (!s || !e) return null
  return e < s ? { t, s: e, e: s } : { t, s, e }
}
const MAX_LANES = 5

/** Month calendar: each task is a bar from its Start to its Due (a single day when only one of them is set) */
export function SpanCalendar({ tasks, idPrefix }: { tasks: Task[]; idPrefix: string }) {
  const { state, dispatch, userById } = useStore()
  const { digits, d, n } = useFmt()
  const [anchor, setAnchor] = useState(TODAY)
  const month0 = startOfJMonth(anchor)
  const j = toJalali(month0)
  const len = jMonthLength(j.jy, j.jm)
  const monthEnd = addDays(month0, len - 1)
  const first = addDays(month0, -weekdayIndex(month0))
  const weeks = Array.from({ length: Math.ceil((weekdayIndex(month0) + len) / 7) }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)))
  const holidays = useMemo(() => new Map(state.holidays.map((h) => [h.date, h.title])), [state.holidays])
  const spans = useMemo(() => tasks.map(spanOf).filter((x): x is Span => !!x).sort((a, b) => a.s.localeCompare(b.s) || b.e.localeCompare(a.e)), [tasks])
  const undated = tasks.filter((t) => !spanOf(t))
  const inMonth = spans.filter((x) => x.s <= monthEnd && x.e >= month0).sort((a, b) => a.e.localeCompare(b.e))
  const open = (id: string) => dispatch({ type: 'openTask', id })
  const tone = (t: Task) => {
    const f = flowOf(t)
    if (f === 'closed') return 'bg-leaf-soft text-leaf-ink'
    if (f === 'in_review') return 'bg-azure text-white'
    if (f === 'rework') return 'bg-danger-soft text-destructive'
    return 'bg-azure-soft text-azure-ink'
  }
  return (
    <div className="flex flex-col gap-3" id={`${idPrefix}-cal`}>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(addJMonths(month0, -1))} aria-label="ماه قبل"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(TODAY)}>امروز</Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(addJMonths(month0, 1))} aria-label="ماه بعد"><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="ms-2 font-semibold" aria-live="polite">{J_MONTHS[j.jm - 1]} {digits(j.jy)}</h2>
        <span className="num ms-auto text-[12px] text-muted-foreground">{n(inMonth.length)} Task در این ماه</span>
      </div>
      <div className="overflow-hidden glass-card" role="grid" aria-label={`تقویم ${J_MONTHS[j.jm - 1]} ${digits(j.jy)}`}>
        <div className="grid grid-cols-7 border-b bg-foreground/[0.03] text-center text-[11.5px] font-medium text-muted-foreground" role="row">
          {WEEKDAYS.map((w, i) => <div key={w} className="py-1.5" role="columnheader"><span className="hidden sm:inline">{w}</span><span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span></div>)}
        </div>
        {weeks.map((days) => {
          const w0 = days[0], w6 = days[6]
          const lanes: number[] = []
          const placed: { x: Span; lane: number; c1: number; c2: number }[] = []
          for (const x of spans) {
            if (x.s > w6 || x.e < w0) continue
            const c1 = diffDays(x.s > w0 ? x.s : w0, w0) + 1
            const c2 = diffDays(x.e < w6 ? x.e : w6, w0) + 2
            let lane = lanes.findIndex((end) => end <= c1)
            if (lane === -1) { lane = lanes.length; lanes.push(c2) } else lanes[lane] = c2
            placed.push({ x, lane, c1, c2 })
          }
          const shown = placed.filter((p) => p.lane < MAX_LANES)
          const hidden = placed.length - shown.length
          const rows = Math.min(lanes.length, MAX_LANES)
          return (
            <div key={w0} role="row" className="relative grid grid-cols-7 border-b last:border-b-0" style={{ gridTemplateRows: `26px repeat(${rows}, 24px) minmax(${hidden ? 20 : 10}px, 1fr)`, minHeight: 92 }}>
              {days.map((day, i) => {
                const off = isWeekend(day) || holidays.has(day)
                const other = day < month0 || day > monthEnd
                return (
                  <div key={day} role="gridcell" aria-label={`${digits(toJalali(day).jd)} ${J_MONTHS[toJalali(day).jm - 1]}`} className={cn('border-s p-1 [&:first-child]:border-s-0', off && 'hatch bg-foreground/[0.03]', day === TODAY && 'bg-azure-soft/60', other && 'opacity-45')} style={{ gridColumn: i + 1, gridRow: '1 / -1' }}>
                    <div className={cn('num text-[12px] font-semibold', day === TODAY && 'text-azure', off && 'text-muted-foreground')}>{digits(toJalali(day).jd)}</div>
                    {holidays.has(day) && <div className="hidden truncate text-[10px] text-muted-foreground lg:block">{holidays.get(day)}</div>}
                  </div>
                )
              })}
              {shown.map(({ x, lane, c1, c2 }) => {
                const cutStart = x.s < w0, cutEnd = x.e > w6
                const dueHere = !!x.t.due && x.t.due >= w0 && x.t.due <= w6
                const lateBar = flowOf(x.t) !== 'closed' && !!x.t.due && x.t.due < TODAY
                const label = `${x.t.name} — ${L('start')} ${d(x.t.start)}، ${L('due')} ${d(x.t.due)}، ${userById[x.t.assigneeUserId ?? '']?.name ?? `بدون ${L('assignee')}`}`
                return (
                  <button key={x.t.id} type="button" onClick={() => open(x.t.id)} title={label} aria-label={label} data-task={x.t.id}
                    className={cn('relative z-[1] mx-0.5 flex min-w-0 items-center gap-1 overflow-hidden px-1.5 text-start text-[11px] font-medium leading-none shadow-sm transition-[filter] hover:brightness-95', tone(x.t),
                      cutStart ? 'rounded-s-none' : 'rounded-s-md', cutEnd ? 'rounded-e-none' : 'rounded-e-md', lateBar && 'ring-1 ring-destructive')}
                    style={{ gridColumn: `${c1} / ${c2}`, gridRow: lane + 2, marginBlock: 2 }}>
                    {cutStart && <span aria-hidden="true">›</span>}
                    {x.t.priority === 'urgent' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{x.t.name}</span>
                    {dueHere && !cutEnd && <span className="h-1.5 w-1.5 shrink-0 rotate-45 border border-current" aria-hidden="true" />}
                    {cutEnd && <span aria-hidden="true">‹</span>}
                  </button>
                )
              })}
              {hidden > 0 && <div className="z-[1] self-end px-1.5 pb-1 text-[10.5px] text-muted-foreground" style={{ gridColumn: '1 / -1', gridRow: rows + 2 }}>+{n(hidden)} Task دیگر در این هفته — از فهرست یا فیلترها ببینید</div>}
            </div>
          )
        })}
      </div>
      {/* small screens: the same tasks as an agenda, ordered by Due */}
      <ul className="flex flex-col divide-y overflow-hidden glass-card sm:hidden" aria-label="Taskهای این ماه">
        {inMonth.map((x) => (
          <li key={x.t.id}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start text-[12.5px]" onClick={() => open(x.t.id)}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.t.name}</span><span className="num text-[11px] text-muted-foreground">{d(x.t.start)} ← <DueText due={x.t.due} done={flowOf(x.t) === 'closed'} /></span></span>
              <PriorityChip p={x.t.priority} /><FlowPill state={flowOf(x.t)} />
            </button>
          </li>
        ))}
        {!inMonth.length && <li className="px-3 py-4 text-center text-[12px] text-muted-foreground">در این ماه Taskی نیست.</li>}
      </ul>
      {undated.length > 0 && (
        <div className="text-[12px] text-muted-foreground">
          بدون {L('start')} و {L('due')}: {undated.map((t, i) => <span key={t.id}>{i > 0 && '، '}<button type="button" className="text-foreground hover:text-azure hover:underline" onClick={() => open(t.id)}>{t.name}</button></span>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded bg-azure-soft" /> از {L('start')} تا {L('due')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 border border-foreground" /> {L('due')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded bg-azure" /> در انتظار بررسی</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded bg-leaf-soft" /> بسته‌شده</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded ring-1 ring-destructive" /> گذشته از موعد</span>
        <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm border" /> پنجشنبه، جمعه و تعطیلات</span>
      </div>
    </div>
  )
}
