import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Crosshair, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { flowProgress, isClosed, isFlowTask, isWorkItem, statusOf, useFmt, useStore } from '@/lib/store'
import { L } from '@/lib/taskFields'
import { TODAY } from '@/lib/seed'
import { J_MONTHS, addDays, diffDays, startOfJMonth, startOfWeek, toJalali } from '@/lib/jalali'
import { buildGantt, type GanttInput, type GanttRow } from '@/lib/gantt'
import { timeTracking } from '@/lib/worklog'
import type { Task } from '@/lib/types'
import { Empty, Segmented } from './common'

type Scale = 'day' | 'week' | 'month'
const PX: Record<Scale, number> = { day: 30, week: 10, month: 3.2 }
const ROW = 30
const HEAD = 46
const OVERSCAN = 10

/**
 * Read-only Gantt. Time runs right to left; rows are rendered only while they are on screen,
 * so a project with thousands of tasks scrolls as smoothly as a small one.
 */
export function GanttView({ tasks, extras }: { tasks: Task[]; extras?: GanttInput['extras'] }) {
  const { state, dispatch, roll } = useStore()
  const { d, n, digits } = useFmt()
  const [scale, setScale] = useState<Scale>('week')
  const [showUnscheduled, setShowUnscheduled] = useState(false)
  const [showExtras, setShowExtras] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [allOpen, setAllOpen] = useState(tasks.length <= 40)
  const [tip, setTip] = useState<{ row: GanttRow; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, left: 0, h: 600, w: 900 })

  const progressOf = (t: Task) => (isFlowTask(t) ? flowProgress(t) : isWorkItem(t) ? statusOf(state, t)?.progress ?? 0 : roll[t.id]?.progress ?? 0)
  const model = useMemo(() => buildGantt({
    leaves: tasks, tasks: state.tasks, projects: state.projects, progressOf, closedOf: (t) => isClosed(state, t),
    extras: showExtras ? extras : undefined, showUnscheduled, open, allOpen, today: TODAY,
  }), [tasks, state.tasks, state.projects, state.statusSets, extras, showExtras, showUnscheduled, open, allOpen, roll]) // eslint-disable-line react-hooks/exhaustive-deps

  // time axis
  const px = PX[scale]
  const range = model.range
  const origin = range ? (scale === 'month' ? startOfJMonth(addDays(range.start, -7)) : startOfWeek(addDays(range.start, -7))) : TODAY
  const last = range ? addDays(range.end, scale === 'day' ? 10 : 28) : TODAY
  const days = diffDays(last, origin) + 1
  const timeW = Math.round(days * px)
  const nameW = view.w < 640 ? 150 : 300
  const off = (iso: string) => diffDays(iso, origin) * px
  const span = (a: string, b: string) => (diffDays(b, a) + 1) * px

  const months = useMemo(() => {
    const out: { start: string; label: string; year: number }[] = []
    for (let m = startOfJMonth(origin); m <= last; m = startOfJMonth(addDays(m, 40))) out.push({ start: m < origin ? origin : m, label: J_MONTHS[toJalali(m).jm - 1], year: toJalali(m).jy })
    return out
  }, [origin, last])
  const holidays = useMemo(() => state.holidays.map((h) => h.date).filter((x) => x >= origin && x <= last), [state.holidays, origin, last])

  // viewport tracking for row virtualisation
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setView((v) => ({ ...v, h: el.clientHeight, w: el.clientWidth }))
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const raf = useRef(0)
  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    // RTL: scrollLeft is 0 at the inline start and negative towards the end, so -scrollLeft is the scrolled distance
    raf.current = requestAnimationFrame(() => { const el = box.current; if (el) setView((v) => (v.top === el.scrollTop && v.left === -el.scrollLeft ? v : { ...v, top: el.scrollTop, left: -el.scrollLeft })) })
    if (tip) setTip(null)
  }
  const todayRef = useRef<HTMLDivElement>(null)
  const toToday = () => {
    const el = box.current, t = todayRef.current
    if (!el || !t) return
    const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect()
    const visibleTimeline = r.width - nameW
    el.scrollBy({ left: tr.left - (r.left + visibleTimeline * 0.65) })
  }
  useEffect(() => { toToday() }, [scale, !!range, nameW]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = model.rows
  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN)
  const lastRow = Math.min(rows.length - 1, Math.ceil((view.top + view.h) / ROW) + OVERSCAN)
  const bodyH = rows.length * ROW
  const height = Math.min(640, HEAD + bodyH + 2)

  // a bar outside the visible part of the timeline gets a small arrow at that edge, which scrolls to it
  const winStart = view.left, winEnd = view.left + view.w - nameW
  const extentOf = (r: GanttRow): [number, number] | null => {
    const ds = [r.plan?.start, r.plan?.end, r.milestone, r.actual?.start, r.actual?.end, r.late?.end].filter((x): x is string => !!x).sort()
    if (!ds.length) return null
    return [off(ds[0]), off(ds[ds.length - 1]) + px]
  }
  const scrollToBar = (a: number) => box.current?.scrollTo({ left: -Math.max(0, a - 24), behavior: 'smooth' })

  const toggle = (r: GanttRow) => setOpen((o) => ({ ...o, [r.key]: !r.open }))
  const openRow = (r: GanttRow) => { if (r.task) dispatch({ type: 'openTask', id: r.task.id }); else toggle(r) }

  if (!rows.length && !model.hiddenUnscheduled) return <Empty title="تسکی برای نمایش در Gantt نیست" />
  // Thursdays and Fridays: shaded at day scale, a lighter tint at week scale (too thin to read at month scale)
  const weekendBg = scale === 'month' ? undefined
    : `repeating-linear-gradient(to left, transparent 0 ${5 * px}px, hsl(var(--foreground) / ${scale === 'day' ? 0.05 : 0.025}) ${5 * px}px ${7 * px}px)`
  const todayX = off(TODAY) + px / 2

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={scale} onChange={setScale} options={[{ value: 'day', label: 'روز' }, { value: 'week', label: 'هفته' }, { value: 'month', label: 'ماه' }]} />
        <button type="button" onClick={toToday} className="key key-surface inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px]"><Crosshair className="h-3.5 w-3.5" /> امروز</button>
        <button type="button" onClick={() => { setAllOpen(true); setOpen({}) }} className="key key-ghost inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px]"><ChevronsUpDown className="h-3.5 w-3.5" /> باز کردن همه</button>
        <button type="button" onClick={() => { setAllOpen(false); setOpen({}) }} className="key key-ghost inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px]"><ChevronsDownUp className="h-3.5 w-3.5" /> بستن همه</button>
        {extras && extras.tasks.length > 0 && (
          <button type="button" aria-pressed={showExtras} aria-label={`گروه ${extras.label} در Gantt`} onClick={() => setShowExtras(!showExtras)} className={cn('key inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px]', showExtras ? 'key-surface' : 'key-ghost text-muted-foreground')}>
            {showExtras ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {extras.label}
          </button>
        )}
        {(model.hiddenUnscheduled > 0 || showUnscheduled) && (
          <button type="button" aria-pressed={showUnscheduled} onClick={() => setShowUnscheduled(!showUnscheduled)} className={cn('key inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px]', showUnscheduled ? 'key-surface' : 'key-ghost text-muted-foreground')}>
            {showUnscheduled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showUnscheduled ? 'پنهان کردن زمان‌بندی‌نشده‌ها' : `${n(model.hiddenUnscheduled)} تسک زمان‌بندی‌نشده پنهان است`}
          </button>
        )}
        <span className="num ms-auto text-[11.5px] text-muted-foreground">{n(rows.length)} ردیف</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground" aria-label="راهنمای Gantt">
        <span className="inline-flex items-center gap-1.5"><span className="relative h-2.5 w-7 overflow-hidden rounded-[3px] border" style={{ background: 'hsl(var(--azure) / 0.2)', borderColor: 'hsl(var(--azure) / 0.55)' }}><span className="absolute inset-y-0 start-0 w-3" style={{ background: 'var(--chart-pos)' }} /></span>برنامه‌ی فعلی (Start تا Due) و پیشرفت Status</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-7 rounded-full bg-foreground/55" />واقعی (تا امروز اگر تمام نشده)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full" style={{ background: 'var(--status-critical)' }} />بعد از Due (دیرکرد)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-foreground/70" />Due اولیه</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 rounded-[1px]" style={{ background: 'var(--chart-pos)' }} />فقط Due</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-foreground/50" />پیش‌نیاز (قرمز: شروع قبل از پایان پیش‌نیاز)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px]" style={{ background: 'var(--chart-pos)' }} />امروز</span>
      </div>

      <div ref={box} onScroll={onScroll} className="thin-scroll relative w-full overflow-auto rounded-xl border bg-glass-solid" style={{ height }} role="grid" aria-rowcount={rows.length} aria-label="Gantt">
        <div className="relative" style={{ width: nameW + timeW }}>
          {/* header */}
          <div className="sticky top-0 z-30 flex border-b bg-glass-solid" style={{ height: HEAD, width: nameW + timeW }}>
            <div className="sticky start-0 z-40 flex items-end border-e bg-glass-solid px-3 pb-1.5 text-[11.5px] font-medium text-muted-foreground" style={{ width: nameW }}>تسک</div>
            <div className="relative" style={{ width: timeW }}>
              {(scale === 'month' ? months.filter((m, i) => i === 0 || m.year !== months[i - 1].year) : months).map((m, i, arr) => {
                const end = arr[i + 1]?.start ?? addDays(last, 1)
                return (
                  <div key={m.start} className="absolute top-0 flex h-[22px] items-center overflow-hidden border-s px-1.5 text-[11px] font-medium" style={{ insetInlineStart: off(m.start), width: diffDays(end, m.start) * px }}>
                    <span className="num truncate">{scale === 'month' ? digits(m.year) : `${m.label} ${digits(m.year)}`}</span>
                  </div>
                )
              })}
              <div className="absolute inset-x-0 top-[22px] h-[24px] border-t">
                {scale === 'month' && months.map((m, i) => (
                  <div key={m.start} className="absolute top-0 flex h-full items-center overflow-hidden border-s px-1 text-[10.5px] text-muted-foreground" style={{ insetInlineStart: off(m.start), width: diffDays(months[i + 1]?.start ?? addDays(last, 1), m.start) * px }}><span className="truncate">{m.label}</span></div>
                ))}
                {scale === 'week' && Array.from({ length: Math.ceil(days / 7) }, (_, i) => addDays(origin, i * 7)).map((w) => (
                  <div key={w} className="num absolute top-0 flex h-full items-center justify-center border-s text-[10.5px] text-muted-foreground" style={{ insetInlineStart: off(w), width: 7 * px }} title={`هفته‌ی ${d(w)}`}>{digits(toJalali(w).jd)}</div>
                ))}
                {scale === 'day' && Array.from({ length: days }, (_, i) => addDays(origin, i)).map((x) => {
                  const wd = diffDays(x, origin) % 7
                  return <div key={x} className={cn('num absolute top-0 flex h-full items-center justify-center border-s text-[10.5px]', wd >= 5 || holidays.includes(x) ? 'text-muted-foreground/60' : 'text-muted-foreground', x === TODAY && 'font-bold text-azure')} style={{ insetInlineStart: off(x), width: px }}>{digits(toJalali(x).jd)}</div>
                })}
              </div>
            </div>
          </div>

          {/* body */}
          <div className="relative" style={{ height: bodyH }}>
            <div className="pointer-events-none absolute top-0" style={{ insetInlineStart: nameW, width: timeW, height: bodyH, background: weekendBg }} aria-hidden="true">
              {holidays.map((h) => <div key={h} className="absolute inset-y-0" style={{ insetInlineStart: off(h), width: px, background: 'hsl(var(--foreground) / 0.06)' }} />)}
              <div ref={todayRef} className="absolute inset-y-0 w-[2px]" style={{ insetInlineStart: todayX - 1, background: 'var(--chart-pos)', opacity: 0.8 }} />
            </div>
            <Links model={model} first={first} last={lastRow} nameW={nameW} timeW={timeW} off={off} px={px} />
            {rows.slice(first, lastRow + 1).map((r, k) => {
              const i = first + k
              return (
                <div key={r.key} role="row" aria-rowindex={i + 1} className="group absolute flex hover:bg-foreground/[0.03]" style={{ top: i * ROW, height: ROW, width: nameW + timeW }}>
                  <div className={cn('sticky start-0 z-20 flex items-center gap-1 border-e bg-glass-solid pe-2 text-[12.5px] group-hover:bg-glass-solid', r.kind !== 'task' && 'font-semibold')} style={{ width: nameW, paddingInlineStart: 6 + r.level * 14 }}>
                    {r.hasChildren ? (
                      <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => toggle(r)} aria-label={r.open ? 'بستن' : 'باز کردن'} aria-expanded={r.open}>
                        {r.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                      </button>
                    ) : <span className="w-[18px] shrink-0" />}
                    <button type="button" className="min-w-0 truncate text-start hover:text-azure" onClick={() => openRow(r)} title={r.label}>{r.label}</button>
                    {r.unscheduled && <span className="ms-auto shrink-0 rounded bg-secondary px-1 text-[10px] text-muted-foreground">زمان‌بندی نشده</span>}
                    {r.overdueNotStarted && <AlertTriangle className="ms-auto h-3.5 w-3.5 shrink-0 text-destructive" aria-label="شروع‌نشده و گذشته از Due" />}
                  </div>
                  <div className="relative cursor-pointer" style={{ width: timeW }} onClick={() => openRow(r)}
                    onPointerMove={(e) => setTip({ row: r, x: e.clientX, y: e.clientY })} onPointerLeave={() => setTip(null)}>
                    <Bars r={r} off={off} span={span} px={px} />
                    <EdgeHint ext={extentOf(r)} winStart={winStart} winEnd={winEnd} go={scrollToBar} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {tip && <Tip r={tip.row} x={tip.x} y={tip.y} />}
    </div>
  )
}

function EdgeHint({ ext, winStart, winEnd, go }: { ext: [number, number] | null; winStart: number; winEnd: number; go: (a: number) => void }) {
  if (!ext || winEnd <= winStart) return null
  const [a, b] = ext
  const before = b <= winStart + 2, after = a >= winEnd - 2
  if (!before && !after) return null
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); go(a) }} aria-label={before ? 'نوار این ردیف در گذشته است؛ نمایش' : 'نوار این ردیف در آینده است؛ نمایش'}
      className="absolute top-[6px] z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-glass-solid text-muted-foreground shadow-sm hover:text-azure"
      style={{ insetInlineStart: before ? winStart + 4 : winEnd - 22 }}>
      {before ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
    </button>
  )
}

function Bars({ r, off, span, px }: { r: GanttRow; off: (iso: string) => number; span: (a: string, b: string) => number; px: number }) {
  const summary = r.kind !== 'task'
  const hasActual = !!r.actual
  if (summary) {
    return (
      <>
        {r.plan && (
          <div data-bar="summary" className="absolute top-[9px] h-[7px] rounded-[2px] bg-foreground/70" style={{ insetInlineStart: off(r.plan.start), width: span(r.plan.start, r.plan.end) }}>
            {r.progress > 0 && <div className="absolute inset-y-0 start-0 rounded-[2px]" style={{ width: `${Math.min(100, r.progress)}%`, background: 'var(--chart-pos)' }} />}
          </div>
        )}
        {r.actual && <div className="absolute top-[20px] h-[3px] rounded-full bg-foreground/40" style={{ insetInlineStart: off(r.actual.start), width: span(r.actual.start, r.actual.end) }} />}
      </>
    )
  }
  return (
    <>
      {r.plan && (
        <div data-bar="plan" className="absolute overflow-hidden rounded-[4px] border" style={{
          top: hasActual ? 5 : 9, height: hasActual ? 11 : 12, insetInlineStart: off(r.plan.start), width: span(r.plan.start, r.plan.end),
          background: 'hsl(var(--azure) / 0.2)', borderColor: r.overdueNotStarted ? 'var(--status-critical)' : 'hsl(var(--azure) / 0.55)',
        }}>
          {r.progress > 0 && <div className="absolute inset-y-0 start-0" style={{ width: `${Math.min(100, r.progress)}%`, background: 'var(--chart-pos)' }} />}
        </div>
      )}
      {r.milestone && <div data-bar="milestone" className="absolute top-[10px] h-[10px] w-[10px] rotate-45 rounded-[1px]" style={{ insetInlineStart: off(r.milestone) + px / 2 - 5, background: r.overdueNotStarted ? 'var(--status-critical)' : 'var(--chart-pos)' }} />}
      {r.actual && <div data-bar="actual" className="absolute top-[19px] h-[6px] rounded-full bg-foreground/55" style={{ insetInlineStart: off(r.actual.start), width: span(r.actual.start, r.actual.end) }} />}
      {r.late && <div data-bar="late" className="absolute top-[19px] h-[6px] rounded-full" style={{ insetInlineStart: off(r.late.start), width: span(r.late.start, r.late.end), background: 'var(--status-critical)' }} />}
      {r.baselineDue && <div data-bar="baseline" className="absolute top-[3px] h-[24px] w-[2px] rounded-full bg-foreground/70" style={{ insetInlineStart: off(r.baselineDue) + px - 1 }} title="Due اولیه" />}
    </>
  )
}

function Links({ model, first, last, nameW, timeW, off, px }: { model: ReturnType<typeof buildGantt>; first: number; last: number; nameW: number; timeW: number; off: (iso: string) => number; px: number }) {
  const lo = first - 40, hi = last + 40
  const shown = model.links.filter((l) => (l.from >= lo && l.from <= hi) || (l.to >= lo && l.to <= hi))
  if (!shown.length) return null
  const endOf = (r: GanttRow) => r.plan?.end ?? r.milestone
  const startOf = (r: GanttRow) => r.plan?.start ?? r.milestone
  return (
    <svg className="pointer-events-none absolute top-0 z-[5] overflow-visible" style={{ insetInlineStart: nameW, width: timeW, height: model.rows.length * ROW }} aria-hidden="true">
      <defs>
        {['n', 'v'].map((k) => (
          <marker key={k} id={`gantt-arrow-${k}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" fill={k === 'v' ? 'var(--status-critical)' : 'hsl(var(--foreground) / 0.55)'} />
          </marker>
        ))}
      </defs>
      {shown.map((l) => {
        const a = model.rows[l.from], b = model.rows[l.to]
        const e = endOf(a), s = startOf(b)
        if (!e || !s) return null
        const x1 = timeW - (off(e) + px), x2 = timeW - off(s)
        const y1 = l.from * ROW + ROW / 2, y2 = l.to * ROW + ROW / 2
        const color = l.violated ? 'var(--status-critical)' : 'hsl(var(--foreground) / 0.45)'
        return <path data-violated={l.violated ? 'true' : 'false'} key={`${l.fromId}-${l.toId}`} d={`M${x1},${y1} h-8 V${y2} H${x2}`} fill="none" stroke={color} strokeWidth={1.5} markerEnd={`url(#gantt-arrow-${l.violated ? 'v' : 'n'})`} />
      })}
    </svg>
  )
}

function Tip({ r, x, y }: { r: GanttRow; x: number; y: number }) {
  const { state, userById } = useStore()
  const { d, n, pct } = useFmt()
  const t = r.task
  const lateDays = r.late ? diffDays(r.late.end, r.late.start) + 1 : 0
  const s = t && isWorkItem(t) ? statusOf(state, t) : undefined
  const tt = t && (isWorkItem(t) || isFlowTask(t)) ? timeTracking(t, state.workLogs) : null
  const preds = (t?.dependsOn ?? []).map((id) => state.tasks[id]).filter(Boolean)
  const left = Math.min(x + 14, window.innerWidth - 300)
  const top = Math.min(y + 16, window.innerHeight - 220)
  return (
    <div className="glass-pop pointer-events-none fixed z-50 w-[280px] rounded-xl px-3 py-2 text-[12px]" style={{ left, top }} role="tooltip">
      <div className="font-semibold leading-5">{r.label}</div>
      {t?.docNumber && <div className="mono text-[11px] text-muted-foreground">{t.docNumber}</div>}
      {/* same field groups as the task page: B people → C schedule → D status and progress */}
      <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
        {t?.assigneeUserId && <><dt className="text-muted-foreground">{L('assignee')}</dt><dd>{userById[t.assigneeUserId]?.name}</dd></>}
        <dt className="text-muted-foreground">برنامه</dt><dd className="num">{r.plan ? `${d(r.plan.start)} ← ${d(r.plan.end)}` : r.milestone ? `Due ${d(r.milestone)}` : 'زمان‌بندی نشده'}</dd>
        {r.baselineDue && <><dt className="text-muted-foreground">{L('baselineDue')}</dt><dd className="num">{d(r.baselineDue)}</dd></>}
        {preds.length > 0 && <><dt className="text-muted-foreground">{L('dependsOn')}</dt><dd>{preds.map((p) => p.docNumber ?? p.name).join('، ')}</dd></>}
        <dt className="text-muted-foreground">{L('progress')}</dt><dd className="num">{s ? `${s.name} (${pct(s.progress)})` : pct(r.progress)}</dd>
        <dt className="text-muted-foreground">واقعی</dt><dd className="num">{r.actual ? `${d(r.actual.start)} ← ${r.actual.ongoing ? 'در جریان' : d(r.actual.end)}` : 'شروع نشده'}</dd>
        {lateDays > 0 && <><dt className="text-muted-foreground">دیرکرد</dt><dd className="num font-medium text-destructive">{n(lateDays)} روز بعد از Due</dd></>}
        {r.overdueNotStarted && <><dt className="text-muted-foreground">هشدار</dt><dd className="font-medium text-destructive">شروع نشده و گذشته از Due</dd></>}
        {tt && tt.logged > 0 && <><dt className="text-muted-foreground">{L('worklog')}</dt><dd className="num">{n(tt.logged, 1)} ساعت{tt.original ? ` از ${n(tt.original, 1)} (${pct(tt.progress ?? 0)})` : ''}</dd></>}
      </dl>
    </div>
  )
}
