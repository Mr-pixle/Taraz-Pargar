import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, Minus, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFmt, useStore, currentPointConfig } from '@/lib/store'
import { addDays, startOfJMonth, startOfWeek } from '@/lib/jalali'
import { calcFormula, calcSentence, effectiveEntries, summarize, type PointSummary } from '@/lib/points'
import type { PointEntry } from '@/lib/types'
import { Empty } from './common'

// ---------- helpers ----------
export function useSigned() {
  const { n } = useFmt()
  // isolated left-to-right run, so the sign stays in front of the number inside right-to-left text
  return (x: number, frac = 1) => `\u2066${x > 0 ? `+${n(x, frac)}` : x < 0 ? `−${n(-x, frac)}` : n(0)}\u2069`
}
/** Text-token colour for a signed delta: success ink up, destructive ink down (always paired with a sign and a word) */
export const deltaCls = (x: number) => (x > 0 ? 'text-leaf-ink' : x < 0 ? 'text-destructive' : 'text-muted-foreground')

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el); setW(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

// ---------- summary tiles ----------
export function PointTiles({ s, compact }: { s: PointSummary; compact?: boolean }) {
  const { n } = useFmt()
  const sg = useSigned()
  const tiles = [
    { label: 'امتیاز کل', value: n(s.total, 1), hint: 'همه‌ی امتیازهای کسب‌شده، به‌اضافه‌ی اصلاح مثبت مدیریتی' },
    { label: 'کسب‌شده (زودتر از موعد)', value: sg(s.earned), cls: deltaCls(s.earned), hint: `${n(s.early)} تسک زودتر از موعد` },
    { label: 'کسرشده (تأخیر)', value: s.deducted ? sg(-s.deducted) : n(0), cls: deltaCls(-s.deducted), hint: `${n(s.late)} تسک با تأخیر` },
    { label: 'امتیاز خالص', value: sg(s.net), cls: cn('text-foreground'), hint: s.adjustPlus || s.adjustMinus ? `با اصلاح مدیریتی ${sg(s.adjustPlus - s.adjustMinus)}` : `${n(s.ontime)} تسک سر موعد` },
  ]
  return (
    <div className={cn('grid grid-cols-2 overflow-hidden glass-card', compact ? 'sm:grid-cols-4' : 'lg:grid-cols-4')}>
      {tiles.map((t, i) => (
        <div key={t.label} className={cn('glass-divider min-w-0 border-b border-s px-4 py-3 [&:nth-child(2n+1)]:border-s-0', compact ? 'sm:border-b-0 sm:[&:nth-child(2n+1)]:border-s sm:first:border-s-0' : 'lg:border-b-0 lg:[&:nth-child(2n+1)]:border-s lg:first:border-s-0')} title={t.hint}>
          <div className="eyebrow">{t.label}</div>
          <div className={cn('num mt-0.5 text-[22px] font-bold leading-tight', t.cls, i === 3 && 'text-[24px]')}>{t.value}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">{t.hint}</div>
        </div>
      ))}
    </div>
  )
}

// ---------- cumulative net line (single series, crosshair tooltip) ----------
export function CumulativeLine({ rows, height = 150 }: { rows: PointEntry[]; height?: number }) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const { dShort, d, n } = useFmt()
  const sg = useSigned()
  const [hover, setHover] = useState<number | null>(null)
  const series = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const e of effectiveEntries(rows)) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.points)
    let acc = 0
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, delta]) => ({ date, delta, value: Math.round((acc += delta) * 10) / 10 }))
  }, [rows])
  if (series.length < 2) return <p className="text-[12px] text-muted-foreground">برای نمودار روند، دست‌کم دو روز امتیاز لازم است.</p>
  const pad = { t: 10, b: 22, s: 44, e: 10 }
  const pw = Math.max(10, w - pad.s - pad.e), ph = height - pad.t - pad.b
  const lo = Math.min(0, ...series.map((p) => p.value)), hi = Math.max(0, ...series.map((p) => p.value))
  const span = hi - lo || 1
  const t0 = new Date(series[0].date).getTime(), t1 = new Date(series[series.length - 1].date).getTime()
  // RTL: oldest point on the right, newest on the left
  const x = (date: string) => pad.e + pw - ((new Date(date).getTime() - t0) / (t1 - t0 || 1)) * pw
  const y = (v: number) => pad.t + ((hi - v) / span) * ph
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const h = hover != null ? series[hover] : null
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const px = e.clientX - r.left + pad.e
    let best = 0, bd = Infinity
    series.forEach((p, i) => { const dd = Math.abs(x(p.date) - px); if (dd < bd) { bd = dd; best = i } })
    setHover(best)
  }
  return (
    <div ref={ref} className="relative" role="img" aria-label={`روند امتیاز خالص از ${d(series[0].date)} تا ${d(series[series.length - 1].date)}؛ اکنون ${sg(series[series.length - 1].value)}`}>
      <svg width={w} height={height} className="block overflow-visible" style={{ direction: 'ltr' }}>
        {[hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={pad.e} x2={pad.e + pw} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'hsl(var(--foreground) / 0.28)' : 'hsl(var(--foreground) / 0.08)'} strokeWidth={1} />
            <text x={w - 4} y={y(v) + 4} textAnchor="end" className="num fill-muted-foreground text-[10.5px]">{sg(v, 0)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--chart-pos)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(series[series.length - 1].date)} cy={y(series[series.length - 1].value)} r={4} fill="var(--chart-pos)" stroke="hsl(var(--background))" strokeWidth={2} />
        <text x={x(series[0].date)} y={height - 6} textAnchor="end" className="num fill-muted-foreground text-[10.5px]">{dShort(series[0].date)}</text>
        <text x={x(series[series.length - 1].date)} y={height - 6} textAnchor="start" className="num fill-muted-foreground text-[10.5px]">{dShort(series[series.length - 1].date)}</text>
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.date)} x2={x(h.date)} y1={pad.t} y2={pad.t + ph} stroke="hsl(var(--foreground) / 0.3)" strokeDasharray="3 3" />
            <circle cx={x(h.date)} cy={y(h.value)} r={5} fill="var(--chart-pos)" stroke="hsl(var(--background))" strokeWidth={2} />
          </g>
        )}
        <rect x={pad.e} y={0} width={pw} height={height} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {h && (
        <div className="glass-pop pointer-events-none absolute top-0 z-10 rounded-lg px-2.5 py-1.5 text-[11.5px]" style={{ left: Math.min(Math.max(0, x(h.date) - 70), w - 150) }}>
          <div className="num font-semibold">{d(h.date)}</div>
          <div className="num">خالص: {sg(h.value)}</div>
          <div className="num text-muted-foreground">تغییر آن روز: {sg(h.delta)}</div>
        </div>
      )}
      <span className="sr-only">{n(series.length)} نقطه</span>
    </div>
  )
}

// ---------- diverging columns: earned above zero, deducted below, per week or month ----------
export type Bucket = { key: string; start: string; plus: number; minus: number; tasks: number }
export function bucketize(rows: PointEntry[], by: 'week' | 'month'): Bucket[] {
  const m = new Map<string, Bucket>()
  for (const e of effectiveEntries(rows)) {
    const k = by === 'week' ? startOfWeek(e.date) : startOfJMonth(e.date)
    const b = m.get(k) ?? { key: k, start: k, plus: 0, minus: 0, tasks: 0 }
    if (e.points > 0) b.plus += e.points; else b.minus -= e.points
    if (e.kind === 'task') b.tasks++
    m.set(k, b)
  }
  const list = [...m.values()].sort((a, b) => a.start.localeCompare(b.start))
  if (!list.length) return []
  // fill empty periods so time spacing stays honest
  const out: Bucket[] = []
  for (let k = list[0].start; k <= list[list.length - 1].start; k = by === 'week' ? addDays(k, 7) : startOfJMonth(addDays(k, 40))) out.push(m.get(k) ?? { key: k, start: k, plus: 0, minus: 0, tasks: 0 })
  return out.map((b) => ({ ...b, plus: Math.round(b.plus * 10) / 10, minus: Math.round(b.minus * 10) / 10 }))
}

export function DivergingColumns({ buckets, by, height = 200 }: { buckets: Bucket[]; by: 'week' | 'month'; height?: number }) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const { dShort, n, d } = useFmt()
  const sg = useSigned()
  const [hover, setHover] = useState<number | null>(null)
  if (!buckets.length) return <Empty title="در این بازه امتیازی ثبت نشده" />
  const pad = { t: 12, b: 24, s: 48, e: 8 }
  const pw = Math.max(10, w - pad.s - pad.e), ph = height - pad.t - pad.b
  const maxP = Math.max(1, ...buckets.map((b) => b.plus)), maxM = Math.max(0, ...buckets.map((b) => b.minus))
  const unit = ph / (maxP + maxM || 1)
  const y0 = pad.t + maxP * unit
  const slot = pw / buckets.length
  const bw = Math.max(4, Math.min(26, slot * 0.6))
  const cx = (i: number) => pad.e + pw - slot * (i + 0.5) // RTL: oldest on the right
  const every = Math.ceil(buckets.length / Math.max(1, Math.floor(pw / 70)))
  const r = 4
  const up = (x: number, top: number, h: number) => (h <= 0 ? '' : h < r ? `M${x},${top + h}v${-h}h${bw}v${h}z` : `M${x},${top + h}V${top + r}q0,${-r} ${r},${-r}h${bw - 2 * r}q${r},0 ${r},${r}V${top + h}z`)
  const down = (x: number, top: number, h: number) => (h <= 0 ? '' : h < r ? `M${x},${top}h${bw}v${h}h${-bw}z` : `M${x},${top}h${bw}V${top + h - r}q0,${r} ${-r},${r}h${-(bw - 2 * r)}q${-r},0 ${-r},${-r}z`)
  const hb = hover != null ? buckets[hover] : null
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} className="block overflow-visible" style={{ direction: 'ltr' }} role="img" aria-label={`امتیاز ${by === 'week' ? 'هفتگی' : 'ماهانه'}: کسب‌شده بالای خط صفر و کسرشده زیر آن`}>
        <line x1={pad.e} x2={pad.e + pw} y1={pad.t} y2={pad.t} stroke="hsl(var(--foreground) / 0.07)" />
        {maxM > 0 && <line x1={pad.e} x2={pad.e + pw} y1={pad.t + ph} y2={pad.t + ph} stroke="hsl(var(--foreground) / 0.07)" />}
        <text x={w - 4} y={pad.t + 4} textAnchor="end" className="num fill-muted-foreground text-[10.5px]">{sg(maxP, 0)}</text>
        {maxM > 0 && <text x={w - 4} y={pad.t + ph + 4} textAnchor="end" className="num fill-muted-foreground text-[10.5px]">{sg(-maxM, 0)}</text>}
        <text x={w - 4} y={y0 + 4} textAnchor="end" className="num fill-muted-foreground text-[10.5px]">{n(0)}</text>
        {buckets.map((b, i) => {
          const x = cx(i) - bw / 2
          return (
            <g key={b.key} opacity={hover == null || hover === i ? 1 : 0.45}>
              <path d={up(x, y0 - 1 - b.plus * unit, b.plus * unit)} fill="var(--chart-pos)" />
              <path d={down(x, y0 + 1, b.minus * unit)} fill="var(--chart-neg)" />
              {i % every === 0 && <text x={cx(i)} y={height - 6} textAnchor="middle" className="num fill-muted-foreground text-[10.5px]">{dShort(b.start)}</text>}
            </g>
          )
        })}
        <line x1={pad.e} x2={pad.e + pw} y1={y0} y2={y0} stroke="hsl(var(--foreground) / 0.3)" />
        {buckets.map((b, i) => <rect key={`h-${b.key}`} x={cx(i) - slot / 2} y={0} width={slot} height={height} fill="transparent" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />)}
      </svg>
      {hb && (
        <div className="glass-pop pointer-events-none absolute top-0 z-10 w-[170px] rounded-lg px-2.5 py-1.5 text-[11.5px]" style={{ left: Math.min(Math.max(0, cx(hover!) - 85), w - 170) }}>
          <div className="num font-semibold">{by === 'week' ? 'هفته‌ی ' : ''}{d(hb.start)}</div>
          <div className="num flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'var(--chart-pos)' }} />کسب‌شده {sg(hb.plus)}</div>
          <div className="num flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'var(--chart-neg)' }} />کسرشده {hb.minus ? sg(-hb.minus) : n(0)}</div>
          <div className="num text-muted-foreground">خالص {sg(hb.plus - hb.minus)}، {n(hb.tasks)} تسک</div>
        </div>
      )}
      <div className="mt-1 flex items-center gap-4 text-[11.5px] text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-pos)' }} />کسب‌شده (زودتر از موعد و اصلاح مثبت)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-neg)' }} />کسرشده (تأخیر و اصلاح منفی)</span>
      </div>
    </div>
  )
}

// ---------- ledger history ----------
export function PointHistory({ rows, showUser, onOpenTask, limit }: { rows: PointEntry[]; showUser?: boolean; onOpenTask?: (id: string) => void; limit?: number }) {
  const { state, userById, can } = useStore()
  const fmt = useFmt()
  const { d, n } = fmt
  const sg = useSigned()
  const ordered = useMemo(() => {
    const asc = [...rows].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    let bal = 0
    return asc.map((e) => ({ e, bal: Math.round((bal += e.points) * 10) / 10 })).reverse()
  }, [rows])
  if (!rows.length) return <Empty title="هنوز امتیازی ثبت نشده" hint="با اتمام هر تسک، امتیاز آن به‌طور خودکار اینجا ثبت می‌شود." />
  const shown = limit ? ordered.slice(0, limit) : ordered
  return (
    <div className="scroll-x thin-scroll overflow-hidden rounded-xl border">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead className="border-b bg-foreground/[0.03] text-[11px] text-muted-foreground">
          <tr>{['تاریخ', ...(showUser ? ['کاربر'] : []), 'تسک', 'علت و محاسبه', 'امتیاز', 'مانده'].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {shown.map(({ e, bal }) => {
            const t = e.taskId ? state.tasks[e.taskId] : undefined
            const reversed = !!e.reversedBy
            return (
              <tr key={e.id} className={cn('border-b align-top last:border-0', reversed && 'text-muted-foreground')}>
                <td className="num whitespace-nowrap px-3 py-2">{d(e.date)}</td>
                {showUser && <td className="whitespace-nowrap px-3 py-2">{userById[e.userId]?.name}</td>}
                <td className="max-w-[200px] px-3 py-2">
                  {t ? (onOpenTask && can.viewTask(t) ? <button className="text-start hover:underline" onClick={() => onOpenTask(t.id)}>{t.docNumber ?? t.name}</button> : <span>{t.docNumber ?? t.name}</span>) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {e.kind === 'reversal' ? <Undo2 className="h-3.5 w-3.5 shrink-0" /> : e.kind === 'adjust' ? <Info className="h-3.5 w-3.5 shrink-0" /> : e.points > 0 ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-leaf-ink" /> : e.points < 0 ? <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <Minus className="h-3.5 w-3.5 shrink-0" />}
                    <span>{e.kind === 'reversal' ? 'برگشت امتیاز قبلی' : e.kind === 'adjust' ? 'اصلاح مدیریتی' : calcSentence(e.calc!, (x) => n(x))}</span>
                    {reversed && <span className="rounded bg-secondary px-1 text-[10.5px]">برگشت‌خورده</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{e.reason}{e.kind === 'adjust' ? ` — ${userById[e.actorId]?.name ?? ''}` : ''}</div>
                  {e.calc && <div className="num mt-0.5 text-[11px] text-muted-foreground" dir="ltr" style={{ textAlign: 'right' }}>{calcFormula(e.calc, e.points, (x, f) => n(x, f ?? 0))}</div>}
                </td>
                <td className={cn('num whitespace-nowrap px-3 py-2 font-semibold', !reversed && deltaCls(e.points), reversed && 'line-through')}>{sg(e.points)}</td>
                <td className="num whitespace-nowrap px-3 py-2">{sg(bal)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {limit && ordered.length > limit && <div className="border-t px-3 py-2 text-[11.5px] text-muted-foreground">{n(ordered.length - limit)} ردیف قدیمی‌تر</div>}
    </div>
  )
}

// ---------- My Points (profile tab) ----------
export function MyPoints({ userId }: { userId: string }) {
  const { state, dispatch, me } = useStore()
  const { n } = useFmt()
  const rows = useMemo(() => state.pointEntries.filter((e) => e.userId === userId), [state.pointEntries, userId])
  const s = summarize(rows)
  const cfg = currentPointConfig(state)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PointTiles s={s} compact />
      <section className="glass-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">روند امتیاز خالص</span><span className="text-[11.5px] text-muted-foreground">{n(s.tasks)} تسک امتیازدار</span></div>
        <CumulativeLine rows={rows} />
      </section>
      <section>
        <div className="mb-2 text-[13px] font-semibold">تاریخچه‌ی امتیازات</div>
        <PointHistory rows={rows} onOpenTask={(id) => { dispatch({ type: 'openProfile', id: null }); dispatch({ type: 'openTask', id }) }} />
      </section>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Point = (W.F ÷ Estimation) × {n(cfg.multiplier)} × نفرساعت تعجیل یا تأخیر؛ هر روز کاری {n(cfg.hoursPerDay)} ساعت (شنبه تا چهارشنبه، بدون تعطیلات). مبنا تاریخ اتمام (برای تسک‌های دارای Reviewer، تاریخ تأیید) در برابر Due Date است. سر موعد امتیازی ندارد. بازگشایی تسک امتیاز آن را برمی‌گرداند و با اتمام دوباره، از نو محاسبه می‌شود.
        {userId !== me.id && ' (نمایش برای مدیرعامل یا کنترل پروژه)'}
      </p>
    </div>
  )
}
