import { useMemo, useState } from 'react'
import { History, SlidersHorizontal, Table2, BarChart3, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { currentPointConfig, useFmt, useStore } from '@/lib/store'
import { effectiveEntries, summarize } from '@/lib/points'
import type { PointEntry } from '@/lib/types'
import { Empty, Initials, JalaliDateField, PageHeader, Segmented } from '@/components/common'
import { bucketize, deltaCls, DivergingColumns, PointHistory, PointTiles, useSigned } from '@/components/PointsViews'

/** Points report — Project Control section (CEO and Project Control only; the page and every action here are guarded) */
export function PointsReport() {
  const { state, can, activeUsers, teamById, dispatch } = useStore()
  const { n, d } = useFmt()
  const sg = useSigned()
  const [f, setF] = useState({ project: 'all', team: 'all', user: 'all', from: undefined as string | undefined, to: undefined as string | undefined })
  const [by, setBy] = useState<'week' | 'month'>('week')
  const [asTable, setAsTable] = useState(false)
  if (!can.perm('points.manage')) return <Empty title="این بخش فقط برای مدیرعامل و کنترل پروژه است" />

  const inScope = (e: PointEntry) => {
    const u = state.users.find((x) => x.id === e.userId)
    if (f.team !== 'all' && u?.teamId !== f.team) return false
    if (f.user !== 'all' && e.userId !== f.user) return false
    if (f.from && e.date < f.from) return false
    if (f.to && e.date > f.to) return false
    if (f.project !== 'all') { const t = e.taskId ? state.tasks[e.taskId] : undefined; if (!t || t.projectId !== f.project) return false }
    return true
  }
  const rows = state.pointEntries.filter(inScope)
  const total = summarize(rows)
  const buckets = bucketize(rows, by)
  const users = [...new Set(effectiveEntries(rows).map((e) => e.userId))]
  const ranking = users.map((id) => ({ u: state.users.find((x) => x.id === id)!, s: summarize(rows.filter((e) => e.userId === id)) }))
    .filter((r) => r.u).sort((a, b) => b.s.net - a.s.net)
  const maxAbs = Math.max(1, ...ranking.map((r) => Math.abs(r.s.net)))
  const silent = activeUsers.filter((u) => u.capacity > 0 && (f.team === 'all' || u.teamId === f.team) && (f.user === 'all' || u.id === f.user) && !users.includes(u.id)).length
  const filtered = f.project !== 'all' || f.team !== 'all' || f.user !== 'all' || !!f.from || !!f.to

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="کنترل پروژه" title="گزارش امتیازات">
        Point = (W.F ÷ Estimation) × {n(currentPointConfig(state).multiplier)} × نفرساعت تعجیل یا تأخیر. اتمام زودتر از Due امتیاز مثبت، تأخیر امتیاز منفی و اتمام سر موعد صفر است. ثبت خودکار، بدون تکرار؛ هر اصلاح یک ردیف برگشت و یک ردیف تازه می‌سازد.
      </PageHeader>

      <div className="flex flex-wrap items-end gap-2" role="group" aria-label="فیلترها">
        <div><Label htmlFor="pt-project" className="eyebrow">پروژه</Label>
          <Select value={f.project} onValueChange={(v) => setF({ ...f, project: v })}><SelectTrigger id="pt-project" className="mt-1 h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">همه (با کارهای تیم)</SelectItem>{state.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="pt-team" className="eyebrow">واحد</Label>
          <Select value={f.team} onValueChange={(v) => setF({ ...f, team: v, user: 'all' })}><SelectTrigger id="pt-team" className="mt-1 h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">همه‌ی واحدها</SelectItem>{state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="pt-user" className="eyebrow">کاربر</Label>
          <Select value={f.user} onValueChange={(v) => setF({ ...f, user: v })}><SelectTrigger id="pt-user" className="mt-1 h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="all">همه‌ی کاربران</SelectItem>{activeUsers.filter((u) => f.team === 'all' || u.teamId === f.team).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="pt-from" className="eyebrow">از</Label><div className="mt-1 w-[140px]"><JalaliDateField id="pt-from" value={f.from} onChange={(v) => setF({ ...f, from: v })} placeholder="ابتدا" /></div></div>
        <div><Label htmlFor="pt-to" className="eyebrow">تا</Label><div className="mt-1 w-[140px]"><JalaliDateField id="pt-to" value={f.to} onChange={(v) => setF({ ...f, to: v })} placeholder="امروز" /></div></div>
        {filtered && <Button variant="ghost" className="h-9" onClick={() => setF({ project: 'all', team: 'all', user: 'all', from: undefined, to: undefined })}>پاک کردن فیلترها</Button>}
      </div>

      <PointTiles s={total} />
      <div className="-mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
        <span>زودتر از موعد: <b className="num text-foreground">{n(total.early)}</b> تسک</span>
        <span>سر موعد: <b className="num text-foreground">{n(total.ontime)}</b></span>
        <span>با تأخیر: <b className="num text-foreground">{n(total.late)}</b></span>
        <span>میانگین تعجیل یا تأخیر: <b className={cn('num', deltaCls(total.avgHours ?? 0))}>{total.avgHours == null ? '—' : `${n(Math.abs(total.avgHours), 1)} ساعت ${total.avgHours > 0 ? 'زودتر' : total.avgHours < 0 ? 'دیرتر' : ''}`}</b></span>
      </div>

      <section className="glass-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-bold">روند امتیازات</h2>
          <span className="text-[12px] text-muted-foreground">{f.user !== 'all' ? state.users.find((u) => u.id === f.user)?.name : f.team !== 'all' ? `واحد ${teamById[f.team]?.name}` : 'همه‌ی کاربران'}</span>
          <div className="ms-auto flex items-center gap-2">
            <Segmented size="sm" value={by} onChange={setBy} options={[{ value: 'week', label: 'هفتگی' }, { value: 'month', label: 'ماهانه' }]} />
            <Segmented size="sm" value={asTable ? 'table' : 'chart'} onChange={(v) => setAsTable(v === 'table')} options={[{ value: 'chart', label: 'نمودار', icon: <BarChart3 className="h-3.5 w-3.5" /> }, { value: 'table', label: 'جدول', icon: <Table2 className="h-3.5 w-3.5" /> }]} />
          </div>
        </div>
        {asTable ? (
          <div className="scroll-x thin-scroll"><table className="w-full min-w-[420px] text-[12.5px]">
            <thead className="border-b text-[11px] text-muted-foreground"><tr>{[by === 'week' ? 'هفته‌ی' : 'ماه', 'کسب‌شده', 'کسرشده', 'خالص', 'تسک'].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{[...buckets].reverse().map((b) => <tr key={b.key} className="border-b last:border-0"><td className="num px-2 py-1.5">{d(b.start)}</td><td className="num px-2 py-1.5">{sg(b.plus)}</td><td className="num px-2 py-1.5">{b.minus ? sg(-b.minus) : n(0)}</td><td className={cn('num px-2 py-1.5 font-semibold', deltaCls(b.plus - b.minus))}>{sg(b.plus - b.minus)}</td><td className="num px-2 py-1.5">{n(b.tasks)}</td></tr>)}</tbody>
          </table></div>
        ) : <DivergingColumns buckets={buckets} by={by} />}
      </section>

      <section className="overflow-hidden glass-card">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <h2 className="text-[14px] font-bold">رتبه‌بندی بر اساس امتیاز خالص</h2>
          <span className="num text-[12px] text-muted-foreground">{n(ranking.length)} نفر{silent ? `، ${n(silent)} نفر بدون امتیاز در این بازه` : ''}</span>
        </header>
        {ranking.length === 0 ? <div className="p-4"><Empty title="امتیازی با این فیلترها نیست" /></div> : (
          <div className="scroll-x thin-scroll">
            <table className="w-full min-w-[960px] text-[12.5px]">
              <thead className="border-b bg-foreground/[0.03] text-[11px] text-muted-foreground">
                <tr>{['#', 'کاربر', 'واحد', 'امتیاز خالص', 'کسب‌شده', 'کسرشده', 'اصلاح', 'زودتر', 'سر موعد', 'دیرتر', 'میانگین (ساعت)'].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const w = (Math.abs(r.s.net) / maxAbs) * 50
                  return (
                    <tr key={r.u.id} className="cursor-pointer border-b last:border-0 hover:bg-foreground/[0.035]" onClick={() => setF({ ...f, user: r.u.id })} title="نمایش روند و تاریخچه‌ی این کاربر">
                      <td className="num px-3 py-2 text-muted-foreground">{n(i + 1)}</td>
                      <td className="px-3 py-2"><span className="flex items-center gap-2 whitespace-nowrap"><Initials user={r.u} size={22} />{r.u.name}</span></td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{teamById[r.u.teamId]?.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={cn('num w-14 shrink-0 font-semibold', deltaCls(r.s.net))}>{sg(r.s.net)}</span>
                          <span className="relative h-2.5 w-28 shrink-0" aria-hidden="true">
                            <span className="absolute inset-y-0 start-1/2 w-px bg-foreground/25" />
                            <span className="absolute inset-y-0 rounded-[3px]" style={r.s.net >= 0 ? { insetInlineEnd: '50%', width: `${w}%`, background: 'var(--chart-pos)' } : { insetInlineStart: '50%', width: `${w}%`, background: 'var(--chart-neg)' }} />
                          </span>
                        </div>
                      </td>
                      <td className="num px-3 py-2">{sg(r.s.earned)}</td>
                      <td className="num px-3 py-2">{r.s.deducted ? sg(-r.s.deducted) : n(0)}</td>
                      <td className="num px-3 py-2 text-muted-foreground">{r.s.adjustPlus || r.s.adjustMinus ? sg(r.s.adjustPlus - r.s.adjustMinus) : '—'}</td>
                      <td className="num px-3 py-2">{n(r.s.early)}</td>
                      <td className="num px-3 py-2">{n(r.s.ontime)}</td>
                      <td className="num px-3 py-2">{n(r.s.late)}</td>
                      <td className={cn('num px-3 py-2', deltaCls(r.s.avgHours ?? 0))}>{r.s.avgHours == null ? '—' : sg(r.s.avgHours)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-2 text-[11.5px] text-muted-foreground">نوار وسط‌چین: امتیاز خالص نسبت به بیشترین مقدار این فهرست (راست: مثبت، چپ: منفی). میانگین ساعت مثبت یعنی زودتر از موعد. برای دیدن روند و تاریخچه‌ی یک نفر، ردیف او را بزنید.</p>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold"><History className="h-4 w-4" /> تاریخچه‌ی تغییرات امتیاز</h2>
        <PointHistory rows={rows} showUser onOpenTask={(id) => dispatch({ type: 'openTask', id })} limit={40} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConfigPanel />
        <AdjustPanel defaultUser={f.user !== 'all' ? f.user : undefined} />
      </div>
    </div>
  )
}

function ConfigPanel() {
  const { state, dispatch, userById } = useStore()
  const { n, time } = useFmt()
  const cur = currentPointConfig(state)
  const [c, setC] = useState({ multiplier: String(cur.multiplier), hoursPerDay: String(cur.hoursPerDay), earlyFactor: String(cur.earlyFactor), lateFactor: String(cur.lateFactor), cap: cur.cap == null ? '' : String(cur.cap), reason: '' })
  const save = () => {
    if (!c.reason.trim()) { toast.error('دلیل تغییر پارامترها را بنویسید.'); return }
    const config = { multiplier: Number(c.multiplier), hoursPerDay: Number(c.hoursPerDay), earlyFactor: Number(c.earlyFactor), lateFactor: Number(c.lateFactor), cap: c.cap.trim() ? Number(c.cap) : null }
    dispatch({ type: 'pointConfig', config, reason: c.reason })
    setC({ ...c, reason: '' })
    toast.success('نسخه‌ی تازه‌ی پارامترها ثبت شد', { description: 'فقط محاسبه‌های بعدی از آن استفاده می‌کنند؛ امتیازهای ثبت‌شده عوض نمی‌شوند.' })
  }
  const field = (k: 'multiplier' | 'hoursPerDay' | 'earlyFactor' | 'lateFactor' | 'cap', label: string, hint?: string) => (
    <div><Label htmlFor={`cfg-${k}`} className="eyebrow">{label}</Label><Input id={`cfg-${k}`} type="number" inputMode="decimal" step="any" className="num mt-1 h-9" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder={hint} /></div>
  )
  return (
    <section className="glass-card p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-[14px] font-bold"><SlidersHorizontal className="h-4 w-4" /> پارامترهای امتیازدهی <span className="num text-[12px] font-normal text-muted-foreground">نسخه‌ی {n(cur.version)}</span></h2>
      <p className="mb-3 text-[12px] text-muted-foreground">هر تغییر نسخه‌ی تازه می‌سازد و فقط روی محاسبه‌های بعدی اثر دارد. برای اعمال روی یک تسک تمام‌شده، در صفحه‌ی همان تسک «بازمحاسبه» بزنید.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field('multiplier', 'ضریب پایه (۱۰۰)')}
        {field('hoursPerDay', 'ساعت هر روز کاری')}
        {field('cap', 'سقف هر تسک', 'بدون سقف')}
        {field('earlyFactor', 'وزن تعجیل')}
        {field('lateFactor', 'وزن تأخیر')}
        <div className="col-span-2 sm:col-span-3"><Label htmlFor="cfg-reason" className="eyebrow">دلیل تغییر (الزامی)</Label><Input id="cfg-reason" className="mt-1 h-9" value={c.reason} onChange={(e) => setC({ ...c, reason: e.target.value })} /></div>
      </div>
      <Button className="mt-3" onClick={save}>ثبت نسخه‌ی تازه</Button>
      <ol className="mt-4 flex flex-col gap-1.5 border-t pt-3 text-[12px]">
        {[...state.pointConfigs].reverse().map((v) => (
          <li key={v.version} className="flex flex-wrap gap-x-2"><b className="num">نسخه‌ی {n(v.version)}</b><span className="num text-muted-foreground">×{n(v.multiplier)}، {n(v.hoursPerDay)} ساعت، تعجیل ×{n(v.earlyFactor, 2)}، تأخیر ×{n(v.lateFactor, 2)}{v.cap != null ? `، سقف ${n(v.cap)}` : ''}</span><span className="text-muted-foreground">— {v.reason}، {userById[v.by]?.name ?? 'سامانه'}، {time(v.at)}</span></li>
        ))}
      </ol>
    </section>
  )
}

function AdjustPanel({ defaultUser }: { defaultUser?: string }) {
  const { state, dispatch, activeUsers, me } = useStore()
  const [a, setA] = useState({ user: defaultUser ?? '', points: '', reason: '' })
  const userId = a.user || defaultUser || ''
  const adjustments = useMemo(() => state.pointEntries.filter((e) => e.kind === 'adjust'), [state.pointEntries])
  const submit = () => {
    if (!userId) { toast.error('کاربر را انتخاب کنید.'); return }
    if (!Number(a.points)) { toast.error('مقدار امتیاز را وارد کنید (مثبت یا منفی).'); return }
    if (!a.reason.trim()) { toast.error('دلیل اصلاح را بنویسید.'); return }
    dispatch({ type: 'pointAdjust', userId, points: Number(a.points), reason: a.reason })
    setA({ user: userId, points: '', reason: '' })
    toast.success('اصلاح امتیاز ثبت شد', { description: 'کاربر اعلان گرفت و ردیف در تاریخچه آمد.' })
  }
  return (
    <section className="glass-card p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-[14px] font-bold"><UserCog className="h-4 w-4" /> اصلاح دستی امتیاز</h2>
      <p className="mb-3 text-[12px] text-muted-foreground">برای موارد خارج از فرمول (مثلاً کار فوری بیرون از برنامه). با دلیل ثبت می‌شود، به کاربر اعلام می‌شود و پاک‌شدنی نیست؛ اصلاح بعدی فقط با ردیف تازه.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1"><Label htmlFor="adj-user" className="eyebrow">کاربر</Label>
          <Select value={userId ?? ''} onValueChange={(v) => setA({ ...a, user: v })}><SelectTrigger id="adj-user" className="mt-1 h-9"><SelectValue placeholder="انتخاب کاربر" /></SelectTrigger>
            <SelectContent className="max-h-72">{activeUsers.filter((u) => u.id !== me.id).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="col-span-2 sm:col-span-1"><Label htmlFor="adj-points" className="eyebrow">امتیاز (مثبت یا منفی)</Label><Input id="adj-points" type="number" step="any" inputMode="decimal" className="num mt-1 h-9" value={a.points} onChange={(e) => setA({ ...a, points: e.target.value })} placeholder="مثلاً 25 یا -10" /></div>
        <div className="col-span-2"><Label htmlFor="adj-reason" className="eyebrow">دلیل (الزامی)</Label><Input id="adj-reason" className="mt-1 h-9" value={a.reason} onChange={(e) => setA({ ...a, reason: e.target.value })} /></div>
      </div>
      <Button className="mt-3" onClick={submit}>ثبت اصلاح</Button>
      {adjustments.length > 0 && <div className="mt-4 border-t pt-3"><PointHistory rows={adjustments} showUser limit={5} /></div>}
    </section>
  )
}
