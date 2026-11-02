// Personal timeline: time runs right to left like the project Gantt; bars can be dragged to move a task or resize its dates.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, Crosshair } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { J_MONTHS, addDays, diffDays, startOfWeek, toJalali } from '@/lib/jalali'
import { childSpan, flatten, statusOfTask } from '@/lib/personal'
import type { PersonalTask } from '@/lib/types'
import { Segmented } from './common'
import { useMine } from './PersonalViews'

const PX = { day: 30, week: 11 } as const
const ROW = 36
const HEAD = 46
type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; delta: number }

export function PersonalTimeline({ tasks, onOpen }: { tasks: PersonalTask[]; onOpen: (id: string) => void }) {
  const { state, dispatch } = useStore()
  const { board, list } = useMine()
  const { digits, d } = useFmt()
  const [scale, setScale] = useState<'day' | 'week'>('day')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const todayRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const nameW = w < 640 ? 140 : 240
  const px = PX[scale]
  const shown = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const rows = useMemo(() => flatten(list.filter((t) => shown.has(t.id)), (id) => !closed[id]), [list, shown, closed])
  const holidays = useMemo(() => new Set(state.holidays.map((h) => h.date)), [state.holidays])

  // range: every dated task, plus three weeks around today
  let lo = addDays(TODAY, -7), hi = addDays(TODAY, 21)
  for (const t of tasks) for (const x of [t.start, t.due]) if (x) { if (x < lo) lo = x; if (x > hi) hi = x }
  const origin = startOfWeek(addDays(lo, -3))
  const last = addDays(hi, 10)
  const days = diffDays(last, origin) + 1
  const timeW = days * px
  const off = (iso: string) => diffDays(iso, origin) * px
  const toToday = () => {
    const el = box.current, t = todayRef.current
    if (!el || !t) return
    const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect()
    el.scrollBy({ left: tr.left - (r.left + (r.width - nameW) * 0.6) })
  }
  useEffect(() => { toToday() }, [scale, nameW]) // eslint-disable-line react-hooks/exhaustive-deps

  // dragging: in a right-to-left axis, moving the pointer left means later dates
  const startDrag = (e: RPointerEvent, id: string, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id, mode, x0: e.clientX, delta: 0 })
  }
  const moveDrag = (e: RPointerEvent) => { if (drag) setDrag({ ...drag, delta: Math.round(-(e.clientX - drag.x0) / px) }) }
  const endDrag = () => {
    if (!drag) return
    const t = list.find((x) => x.id === drag.id)
    const { id, delta } = drag
    setDrag(null)
    if (!t) return
    if (!delta) { onOpen(id); return }
    const span = spanOf(t, drag)
    if (!span) return
    if (span.start > span.end) { toast.error('موعد نمی‌تواند پیش از شروع باشد.'); return }
    dispatch({ type: 'ptUpdate', id, patch: t.start ? { start: span.start, due: span.end } : { due: span.end } })
    toast.success(`${t.title}: ${d(span.start)} تا ${d(span.end)}`)
  }
  const spanOf = (t: PersonalTask, dr?: Drag | null) => {
    const s0 = t.start ?? t.due, e0 = t.due ?? t.start
    if (!s0 || !e0) return null
    if (!dr || dr.id !== t.id) return { start: s0, end: e0 }
    if (dr.mode === 'move') return { start: addDays(s0, dr.delta), end: addDays(e0, dr.delta) }
    if (dr.mode === 'start') return { start: addDays(s0, dr.delta), end: e0 }
    return { start: s0, end: addDays(e0, dr.delta) }
  }
  const setOnClick = (e: React.MouseEvent<HTMLDivElement>, t: PersonalTask) => {
    // unscheduled row: click a day to put the task there
    const r = e.currentTarget.getBoundingClientRect()
    const date = addDays(origin, Math.floor((r.right - e.clientX) / px))
    dispatch({ type: 'ptUpdate', id: t.id, patch: { start: date, due: date } })
    toast.success(`«${t.title}» در ${d(date)} گذاشته شد؛ برای تغییر، نوار را بکشید.`)
  }

  const months: { start: string; label: string }[] = []
  for (let m = origin; m <= last;) {
    const j = toJalali(m)
    months.push({ start: m, label: `${J_MONTHS[j.jm - 1]} ${digits(j.jy)}` })
    let n = m; while (n <= last && toJalali(n).jm === j.jm) n = addDays(n, 1)
    m = n
  }
  const weekendBg = `repeating-linear-gradient(to left, transparent 0 ${5 * px}px, hsl(var(--foreground) / ${scale === 'day' ? 0.05 : 0.03}) ${5 * px}px ${7 * px}px)`
  const unscheduled = rows.filter((r) => !r.t.start && !r.t.due).length

  if (!rows.length) return <p className="py-8 text-center text-[13px] text-muted-foreground">کاری برای نمایش نیست.</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={scale} onChange={setScale} options={[{ value: 'day', label: 'روز' }, { value: 'week', label: 'هفته' }]} />
        <button type="button" onClick={toToday} className="key key-surface inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px]"><Crosshair className="h-3.5 w-3.5" /> امروز</button>
        <span className="text-[11.5px] text-muted-foreground">نوار را بکشید تا جابه‌جا شود؛ لبه‌ها را بکشید تا شروع یا موعد تغییر کند.{unscheduled ? ` برای کار بدون تاریخ، روی روز موردنظر در ردیفش بزنید.` : ''}</span>
      </div>
      <div ref={box} className="thin-scroll relative w-full overflow-auto rounded-xl border bg-glass-solid" style={{ maxHeight: 620 }} role="grid" aria-label="Timeline کارهای شخصی" aria-rowcount={rows.length}>
        <div className="relative" style={{ width: nameW + timeW }}>
          <div className="sticky top-0 z-30 flex border-b bg-glass-solid" style={{ height: HEAD }}>
            <div className="sticky start-0 z-40 flex items-end border-e bg-glass-solid px-3 pb-1.5 text-[11.5px] font-medium text-muted-foreground" style={{ width: nameW }}>کار</div>
            <div className="relative" style={{ width: timeW }}>
              {months.map((m, i) => (
                <div key={m.start} className="absolute top-0 flex h-[22px] items-center overflow-hidden border-s px-1.5 text-[11px] font-medium" style={{ insetInlineStart: off(m.start), width: diffDays(months[i + 1]?.start ?? addDays(last, 1), m.start) * px }}><span className="num truncate">{m.label}</span></div>
              ))}
              <div className="absolute inset-x-0 top-[22px] h-[24px] border-t">
                {scale === 'day' ? Array.from({ length: days }, (_, i) => addDays(origin, i)).map((x) => (
                  <div key={x} className={cn('num absolute top-0 flex h-full items-center justify-center border-s text-[10.5px]', x === TODAY ? 'font-bold text-azure' : 'text-muted-foreground')} style={{ insetInlineStart: off(x), width: px }}>{digits(toJalali(x).jd)}</div>
                )) : Array.from({ length: Math.ceil(days / 7) }, (_, i) => addDays(origin, i * 7)).map((x) => (
                  <div key={x} className="num absolute top-0 flex h-full items-center justify-center border-s text-[10.5px] text-muted-foreground" style={{ insetInlineStart: off(x), width: 7 * px }}>{digits(toJalali(x).jd)}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative" style={{ height: rows.length * ROW }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
            <div className="pointer-events-none absolute top-0" style={{ insetInlineStart: nameW, width: timeW, height: rows.length * ROW, background: weekendBg }} aria-hidden="true">
              {[...holidays].filter((h) => h >= origin && h <= last).map((h) => <div key={h} className="absolute inset-y-0" style={{ insetInlineStart: off(h), width: px, background: 'hsl(var(--foreground) / 0.06)' }} />)}
              <div ref={todayRef} className="absolute inset-y-0 w-[2px]" style={{ insetInlineStart: off(TODAY) + px / 2 - 1, background: 'var(--chart-pos)' }} />
            </div>
            {rows.map(({ t, level, hasKids }, i) => {
              const s = statusOfTask(board, t)
              const span = spanOf(t, drag)
              const parent = t.parentId ? list.find((x) => x.id === t.parentId) : undefined
              const pSpan = parent ? spanOf(parent) : null
              const outside = !!(span && pSpan && (span.start < pSpan.start || span.end > pSpan.end))
              const kidsSpan = hasKids ? childSpan(list, t.id) : null
              const overdue = !s.done && !!t.due && t.due < TODAY
              const milestone = !!span && !t.start
              return (
                <div key={t.id} role="row" aria-rowindex={i + 1} className="group absolute flex hover:bg-foreground/[0.03]" style={{ top: i * ROW, height: ROW, width: nameW + timeW }}>
                  <div className="sticky start-0 z-20 flex items-center gap-1 border-e bg-glass-solid pe-2 text-[12.5px]" style={{ width: nameW, paddingInlineStart: 6 + level * 14 }}>
                    {hasKids ? (
                      <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => setClosed({ ...closed, [t.id]: !closed[t.id] })} aria-expanded={!closed[t.id]} aria-label={closed[t.id] ? 'باز کردن' : 'بستن'}>
                        {closed[t.id] ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    ) : <span className="w-[18px] shrink-0" />}
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} title={s.name} />
                    <button type="button" className={cn('min-w-0 truncate text-start hover:text-azure', hasKids && 'font-semibold', s.done && 'text-muted-foreground line-through')} onClick={() => onOpen(t.id)} title={t.title}>{t.title}</button>
                    {!span && <span className="ms-auto shrink-0 rounded bg-secondary px-1 text-[10px] text-muted-foreground">بدون تاریخ</span>}
                  </div>
                  <div className={cn('relative', !span && 'cursor-copy')} style={{ width: timeW }} onClick={!span ? (e) => setOnClick(e, t) : undefined}>
                    {kidsSpan && <div className="absolute top-[29px] h-[3px] rounded-full bg-foreground/25" style={{ insetInlineStart: off(kidsSpan.start), width: (diffDays(kidsSpan.end, kidsSpan.start) + 1) * px }} title="بازه‌ی Subtaskها" />}
                    {span && !milestone && (
                      <div data-pbar={t.id} role="button" tabIndex={0} aria-label={`${t.title}: ${d(span.start)} تا ${d(span.end)}`}
                        onPointerDown={(e) => startDrag(e, t.id, 'move')} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t.id) }}
                        className={cn('absolute top-[7px] flex h-[20px] cursor-grab touch-none select-none items-center overflow-hidden rounded-[6px] border px-1.5 text-[11px] active:cursor-grabbing', drag?.id === t.id && 'ring-2 ring-azure', outside && 'border-dashed')}
                        style={{ insetInlineStart: off(span.start), width: Math.max(px, (diffDays(span.end, span.start) + 1) * px), background: `color-mix(in srgb, ${s.color} ${s.done ? 18 : 32}%, transparent)`, borderColor: overdue ? 'var(--status-critical)' : s.color }}>
                        <span onPointerDown={(e) => startDrag(e, t.id, 'start')} className="absolute inset-y-0 start-0 w-2 cursor-ew-resize" aria-hidden="true" />
                        <span onPointerDown={(e) => startDrag(e, t.id, 'end')} className="absolute inset-y-0 end-0 w-2 cursor-ew-resize" aria-hidden="true" />
                        {s.done && <Check className="me-1 h-3 w-3 shrink-0" />}
                        <span className="pointer-events-none truncate">{(diffDays(span.end, span.start) + 1) * px > 70 ? t.title : ''}</span>
                      </div>
                    )}
                    {span && milestone && (
                      <div data-pbar={t.id} role="button" tabIndex={0} aria-label={`${t.title}: موعد ${d(span.end)}`} onPointerDown={(e) => startDrag(e, t.id, 'end')}
                        className="absolute top-[11px] h-[12px] w-[12px] rotate-45 cursor-grab touch-none rounded-[2px]" style={{ insetInlineStart: off(span.end) + px / 2 - 6, background: overdue ? 'var(--status-critical)' : s.color }} />
                    )}
                    {outside && span && <AlertTriangle className="absolute top-[10px] h-3.5 w-3.5 text-[var(--status-warning)]" style={{ insetInlineStart: off(span.end) + (diffDays(span.end, span.start) + 1) * px + 4 }} aria-label="خارج از بازه‌ی Task اصلی" />}
                    {drag?.id === t.id && span && <span className="num pointer-events-none absolute -top-0.5 z-10 rounded bg-foreground px-1.5 text-[10.5px] text-background" style={{ insetInlineStart: off(span.start) }}>{d(span.start)} – {d(span.end)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground" aria-label="راهنما">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-6 rounded border" style={{ background: 'color-mix(in srgb, #1b57d5 32%, transparent)', borderColor: '#1b57d5' }} />شروع تا موعد (رنگ = Status)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-foreground/60" />فقط موعد</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-6 rounded-full bg-foreground/25" />بازه‌ی Subtaskها</span>
        <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-[var(--status-warning)]" />Subtask بیرون از بازه‌ی Task اصلی</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px]" style={{ background: 'var(--chart-pos)' }} />امروز</span>
      </div>
    </div>
  )
}
