// Administrative module pages: my requests, timesheet, approver inbox, administrative reports.
import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck2, ChevronLeft, ChevronRight, Download, Inbox, LogIn, LogOut, Lock, Plus, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { requestSummary, useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { J_MONTHS, WEEKDAYS, WEEKDAYS_SHORT, addDays, rangeDays, tehranTime, toJalali, weekdayIndex } from '@/lib/jalali'
import {
  approverStats, configFor, dayKey, hm, isMonthClosed, isOffDay, isPending, jMonthKey, KIND_FA, leaveDates, monthRange, nextMonthKey, OT_FA, otState, overtimeIndex, overtimeSummary,
  prevMonthKey, STATUS_FA, toCSV, workSummary, type Bucket,
} from '@/lib/admin'
import type { AdminRequest, AdminRequestKind, AdminRequestStatus, TimesheetDay } from '@/lib/types'
import { Empty, Initials, JalaliDateField, PageHeader, Segmented } from '@/components/common'
import { UserSelect } from '@/components/FlowViews'
import { DayDialog, NewRequestDialog, OtChip, RequestDialog, RequestRow, RequestStatusPill, useHM, type RequestPreset } from '@/components/AdminViews'

// ---------- file export (the viewer confirms each save) ----------
type DownloadsNs = { save: (r: { filename: string; data: string }) => Promise<unknown> } | null
let downloadsNs: Promise<DownloadsNs> | null = null
async function saveCSV(filename: string, csv: string) {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude
  if (c?.use) {
    downloadsNs ??= c.use('downloads') as Promise<DownloadsNs>
    const dl = await downloadsNs
    if (!dl) { toast.error('ذخیره‌ی فایل در این نما در دسترس نیست.'); return }
    try { await dl.save({ filename, data: csv }) } catch (e) {
      const code = (e as { code?: string }).code
      if (code !== 'declined') toast.error(code === 'rate_limited' ? 'یک درخواست ذخیره باز است؛ کمی بعد دوباره امتحان کنید.' : 'فایل ذخیره نشد.')
    }
    return
  }
  // opened outside Claude (local preview): an ordinary browser download
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
function CsvButton({ name, head, rows }: { name: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <Button variant="outline" size="sm" className="h-8" disabled={!rows.length} onClick={() => saveCSV(`${name}-${TODAY}.csv`, toCSV(head, rows))}>
      <Download className="h-3.5 w-3.5" /> Excel (CSV)
    </Button>
  )
}

// ---------- my requests ----------
export function RequestsPage() {
  const { state, me } = useStore()
  const { n } = useFmt()
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')
  const [newOpen, setNewOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(state.nav.requestId ?? null)
  const mine = state.adminRequests.filter((r) => r.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const list = mine.filter((r) => filter === 'all' || (filter === 'open' ? isPending(r) : !isPending(r)))
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="اداری" title="درخواست‌های من" actions={<Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> درخواست تازه</Button>}>
        مرخصی، اضافه‌کاری و سایر درخواست‌ها. هر درخواست اول به کارتابل مدیر اداری و بعد به کارتابل مدیرعامل می‌رود؛ نتیجه‌ی هر مرحله با اعلان به شما می‌رسد.
      </PageHeader>
      <Segmented value={filter} onChange={setFilter} options={[
        { value: 'all', label: `همه (${n(mine.length)})` }, { value: 'open', label: `در جریان (${n(mine.filter(isPending).length)})` }, { value: 'done', label: 'پایان‌یافته' },
      ]} />
      <section className="overflow-hidden glass-card">
        {list.length ? list.map((r) => <RequestRow key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)
          : <div className="p-4"><Empty title={mine.length ? 'درخواستی با این فیلتر نیست' : 'هنوز درخواستی ثبت نکرده‌اید'} hint="از دکمه‌ی «درخواست تازه» یا از تقویم تایم‌شیت شروع کنید." /></div>}
      </section>
      <NewRequestDialog open={newOpen} onOpenChange={setNewOpen} />
      <RequestDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

// ---------- approver inbox ----------
export function InboxPage() {
  const { state, me, can } = useStore()
  const { n } = useFmt()
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [openId, setOpenId] = useState<string | null>(null)
  const pending = state.adminRequests.filter((r) => can.decideRequest(r)).sort((a, b) => a.stageSince.localeCompare(b.stageSince))
  const done = state.adminRequests.filter((r) => r.steps.some((s) => (s.stage === 'office' || s.stage === 'ceo' || s.stage === 'cancel') && s.by === me.id))
    .sort((a, b) => b.stageSince.localeCompare(a.stageSince))
  const stage = can.perm('requests.office') ? 'مدیر اداری' : 'مدیرعامل'
  const list = tab === 'pending' ? pending : done
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="اداری" title="کارتابل">
        درخواست‌هایی که منتظر تصمیم {stage} هستند. {can.perm('requests.office') ? 'تأیید شما درخواست را به کارتابل مدیرعامل می‌برد؛ رد، فرایند را تمام می‌کند.' : 'تصمیم شما نهایی است و به درخواست‌دهنده اعلام می‌شود.'} قدیمی‌ترین درخواست اول است.
      </PageHeader>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: `در انتظار شما (${n(pending.length)})` }, { value: 'done', label: `رسیدگی‌شده (${n(done.length)})` }]} />
      <section className="overflow-hidden glass-card">
        {list.length ? list.map((r) => <RequestRow key={r.id} r={r} showUser onOpen={() => setOpenId(r.id)} />)
          : <div className="p-4"><Empty icon={<Inbox className="h-6 w-6" />} title={tab === 'pending' ? 'کارتابل خالی است' : 'هنوز درخواستی را بررسی نکرده‌اید'} /></div>}
      </section>
      <RequestDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

// ---------- timesheet ----------
export function TimesheetPage() {
  const { state, dispatch, me, can, activeUsers } = useStore()
  const { digits, n, dLong } = useFmt()
  const h = useHM()
  const viewAll = can.perm('timesheet.view.all')
  const [userId, setUserId] = useState(state.nav.userId && can.seeTimesheet(state.nav.userId) ? state.nav.userId : me.id)
  const [month, setMonth] = useState(jMonthKey(state.nav.date ?? TODAY))
  const [dayOpen, setDayOpen] = useState<string | null>(state.nav.date ?? null)
  const [preset, setPreset] = useState<RequestPreset | undefined>()
  const [reqOpen, setReqOpen] = useState(false)
  const self = userId === me.id
  const holidays = useMemo(() => new Set(state.holidays.map((x) => x.date)), [state.holidays])
  const { from, to } = monthRange(month)
  const closed = state.monthCloses.find((c) => c.month === month)
  const days = useMemo(() => {
    const m = new Map<string, TimesheetDay>()
    for (const d of Object.values(state.timesheets)) if (d.userId === userId && d.date >= from && d.date <= to) m.set(d.date, d)
    return m
  }, [state.timesheets, userId, from, to])
  const leaves = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of state.leaves) if (l.userId === userId && l.date >= from && l.date <= to) m.set(l.date, (m.get(l.date) ?? 0) + l.hours)
    return m
  }, [state.leaves, userId, from, to])
  const ot = useMemo(() => overtimeIndex(state.adminRequests), [state.adminRequests])
  const today = state.timesheets[dayKey(me.id, TODAY)]
  const undecided = Object.values(state.timesheets).filter((d) => d.userId === me.id && d.calc.undecided > 0).sort((a, b) => b.date.localeCompare(a.date))
  const list = [...days.values()]
  const sum = (f: (d: TimesheetDay) => number) => list.reduce((s, d) => s + f(d), 0)
  const workdaysSoFar = rangeDays(from, to < TODAY ? to : addDays(TODAY, -1)).filter((d) => !isOffDay(d, holidays))
  const missing = workdaysSoFar.filter((d) => !days.has(d) && (leaves.get(d) ?? 0) < 8).length
  const j = toJalali(from)
  const lead = weekdayIndex(from)
  const cells: (string | null)[] = [...Array(lead).fill(null), ...rangeDays(from, to)]
  const openRequest = (p: RequestPreset) => { setPreset(p); setDayOpen(null); setReqOpen(true) }

  if (!can.seeTimesheet(userId)) return <Empty title="تایم‌شیت هر کس فقط برای خودش دیده می‌شود" />
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="اداری" title="تایم‌شیت"
        actions={viewAll ? <div className="w-[220px]"><UserSelect id="ts-user" value={userId} onChange={(v) => setUserId(v ?? me.id)} users={activeUsers} grouped /></div> : undefined}>
        هر روز کاری ۸ ساعت کار خالص به‌علاوه‌ی دست‌کم ۳۰ دقیقه استراحت و ناهار است. کار بیشتر از آن اضافه‌کاری است و باید تعیین تکلیف شود: درخواست اضافه‌کاری یا بدون پرداخت. در پنجشنبه، جمعه و تعطیلات همه‌ی کار اضافه‌کاری است.
      </PageHeader>

      {self && (
        <section className="glass-card flex flex-wrap items-center gap-3 p-4" aria-label="امروز">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">امروز، {WEEKDAYS[weekdayIndex(TODAY)]} {dLong(TODAY)}</div>
            <div className="mt-0.5 text-[14px] font-semibold">
              {!today?.checkIn ? 'ورود امروز ثبت نشده است' : !today.checkOut ? <>از <span className="num">{digits(today.checkIn)}</span> در دفتر هستید</> : <>ورود <span className="num">{digits(today.checkIn)}</span>، خروج <span className="num">{digits(today.checkOut)}</span>، کار خالص <span className="num">{h(today.calc.worked)}</span></>}
            </div>
          </div>
          {!today?.checkIn && <Button onClick={() => { dispatch({ type: 'tsPunch', kind: 'in' }); toast.success(`ورود ${digits(tehranTime())} ثبت شد`) }}><LogIn className="h-4 w-4" /> ثبت ورود</Button>}
          {today?.checkIn && !today.checkOut && <Button onClick={() => { dispatch({ type: 'tsPunch', kind: 'out' }); toast.success(`خروج ${digits(tehranTime())} ثبت شد`) }}><LogOut className="h-4 w-4" /> ثبت خروج</Button>}
          <Button variant="ghost" onClick={() => setDayOpen(TODAY)}>ویرایش دستی</Button>
        </section>
      )}

      {self && undecided.length > 0 && (
        <section className="glass-card p-4 ring-1 ring-[var(--status-warning)]" aria-label="اضافه‌کاری بدون تعیین تکلیف">
          <h2 className="flex items-center gap-1.5 text-[14px] font-bold"><AlertTriangle className="h-4 w-4" style={{ color: 'var(--status-warning)' }} /> {n(undecided.length)} روز اضافه‌کاری تعیین تکلیف نشده است</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">برای هر روز درخواست اضافه‌کاری ثبت کنید یا آن را بدون پرداخت بگذارید. با بستن ماه، باقی‌مانده بدون پرداخت ثبت می‌شود.</p>
          <ul className="mt-2 flex flex-col divide-y">
            {undecided.slice(0, 8).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <button type="button" className="num text-[13px] hover:text-azure" onClick={() => { setMonth(jMonthKey(d.date)); setDayOpen(d.date) }}>{WEEKDAYS[weekdayIndex(d.date)]} {dLong(d.date)}</button>
                <span className="num rounded-full bg-[var(--status-warning)]/25 px-2 text-[12px] font-semibold">{h(d.calc.undecided)}</span>
                <span className="ms-auto flex gap-1.5">
                  <Button size="sm" className="h-7" onClick={() => openRequest({ kind: 'overtime', date: d.date, minutes: d.calc.undecided, taskIds: [...new Set(state.workLogs.filter((l) => !l.deletedAt && l.userId === me.id && l.workDate === d.date).map((l) => l.taskId))] })}>درخواست اضافه‌کاری</Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { dispatch({ type: 'tsUnpaid', date: d.date }); toast.success('بدون پرداخت ثبت شد') }}>بدون پرداخت</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className="key key-ghost rounded-full p-1.5" onClick={() => setMonth(prevMonthKey(month))} aria-label="ماه قبل"><ChevronRight className="h-4 w-4" /></button>
          <h2 className="num min-w-[110px] text-center text-[15px] font-bold">{J_MONTHS[j.jm - 1]} {digits(j.jy)}</h2>
          <button type="button" className="key key-ghost rounded-full p-1.5" onClick={() => setMonth(nextMonthKey(month))} aria-label="ماه بعد" disabled={from > TODAY}><ChevronLeft className="h-4 w-4" /></button>
          {month !== jMonthKey(TODAY) && <Button variant="ghost" size="sm" className="h-7" onClick={() => setMonth(jMonthKey(TODAY))}>این ماه</Button>}
          {closed && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11.5px]"><Lock className="h-3 w-3" /> بسته شده</span>}
          {!self && <span className="ms-auto text-[12.5px] font-medium">{state.users.find((u) => u.id === userId)?.name}</span>}
        </div>
        <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ['کار خالص', h(sum((d) => d.calc.worked))], ['موظف', h(sum((d) => d.calc.duty))], ['اضافه‌کاری', h(sum((d) => d.calc.excess))], ['تأییدشده', h(sum((d) => d.calc.approved))],
            ['در انتظار', h(sum((d) => d.calc.pending))], ['بدون پرداخت', h(sum((d) => d.calc.unpaid))], ['بدون تعیین تکلیف', h(sum((d) => d.calc.undecided))], ['کسر کارکرد', h(sum((d) => d.calc.deficit))],
          ].map(([k, v]) => <div key={k} className="rounded-lg bg-background/50 px-2.5 py-1.5"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="num text-[15px] font-semibold">{v}</dd></div>)}
        </dl>
        {missing > 0 && <p className="mb-2 text-[12px] text-muted-foreground">{n(missing)} روز کاری گذشته‌ی این ماه بدون ثبت ورود و خروج است.</p>}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground" aria-hidden="true">
          {WEEKDAYS_SHORT.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="تقویم تایم‌شیت">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />
            const d = days.get(c)
            const off = isOffDay(c, holidays)
            const lv = leaves.get(c) ?? 0
            const st = d ? otState(d.calc, ot.get(d.id) ?? []) : 'none'
            const future = c > TODAY
            return (
              <button key={c} type="button" role="gridcell" onClick={() => setDayOpen(c)} disabled={future && !self}
                aria-label={`${WEEKDAYS[weekdayIndex(c)]} ${dLong(c)}${d?.checkIn ? `، ورود ${d.checkIn}` : ''}${d?.checkOut ? `، خروج ${d.checkOut}، کار خالص ${hm(d.calc.worked)}` : ''}${lv ? '، مرخصی' : ''}${st !== 'none' ? `، اضافه‌کاری ${OT_FA[st]}` : ''}`}
                className={cn('flex min-h-[54px] flex-col items-stretch gap-0.5 rounded-lg border p-1 text-start text-[11px] transition-colors hover:border-azure/50 sm:min-h-[88px] sm:p-1.5',
                  off ? 'bg-foreground/[0.04]' : 'bg-background/50', c === TODAY && 'ring-2 ring-azure', future && 'opacity-60')}>
                <span className="flex items-center justify-between gap-1">
                  <span className={cn('num text-[12px] font-semibold', off && 'text-muted-foreground')}>{digits(toJalali(c).jd)}</span>
                  {lv > 0 && <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-leaf sm:hidden" aria-hidden="true" />
                    <span className="hidden rounded bg-leaf-soft px-1 text-[10px] text-leaf-ink sm:inline">{lv >= 8 ? 'مرخصی' : <span className="num">م {h(Math.round(lv * 60))}</span>}</span>
                  </>}
                </span>
                {d?.checkIn && <span className="num hidden truncate text-muted-foreground sm:block" dir="ltr">{digits(d.checkIn)}–{digits(d.checkOut ?? '…')}</span>}
                {d?.checkOut && <span className="num hidden font-medium sm:block">{h(d.calc.worked)}</span>}
                {st !== 'none' && <OtChip state={st} minutes={d!.calc.excess} className="self-start" />}
                {d && d.calc.deficit > 0 && <span className="num hidden text-destructive sm:block">−{h(d.calc.deficit)}</span>}
                {!d && !off && !future && lv < 8 && <span className="hidden text-muted-foreground/70 sm:block">ثبت نشده</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground" aria-label="راهنما">
          {(['undecided', 'pending', 'approved', 'unpaid'] as const).map((s) => <span key={s} className="inline-flex items-center gap-1.5"><OtChip state={s} minutes={60} />{OT_FA[s]}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="rounded bg-leaf-soft px-1 text-[10px] text-leaf-ink">مرخصی</span> مرخصی تأییدشده</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-foreground/[0.08]" /> پنجشنبه، جمعه و تعطیلات</span>
        </div>
      </section>

      <DayDialog userId={userId} date={dayOpen} onClose={() => setDayOpen(null)} onRequest={openRequest} />
      <NewRequestDialog open={reqOpen} onOpenChange={setReqOpen} preset={preset} />
    </div>
  )
}

// ---------- administrative reports ----------
type Tab = 'attendance' | 'hours' | 'overtime' | 'requests' | 'handling' | 'ops'
const REQ_KIND_ALL = 'all'

export function AdminReportsPage() {
  const { state, can, activeUsers, teamById, userById } = useStore()
  const { d, digits, n, time } = useFmt()
  const h = useHM()
  const [tab, setTab] = useState<Tab>('attendance')
  const [f, setF] = useState({ team: 'all', user: 'all', from: monthRange(jMonthKey(TODAY)).from as string | undefined, to: TODAY as string | undefined, kind: REQ_KIND_ALL as AdminRequestKind | 'all', status: 'all' as AdminRequestStatus | 'all' })
  const [by, setBy] = useState<Bucket>('week')
  const [limit, setLimit] = useState(200)
  const [openId, setOpenId] = useState<string | null>(null)
  const [dayOpen, setDayOpen] = useState<{ userId: string; date: string } | null>(null)
  const holidays = useMemo(() => new Set(state.holidays.map((x) => x.date)), [state.holidays])
  if (!can.perm('admin.reports')) return <Empty icon={<Lock className="h-6 w-6" />} title="گزارش‌های اداری فقط برای مدیرعامل، کنترل پروژه و مدیر اداری است" />

  const userOk = (uid: string) => (f.user === 'all' || uid === f.user) && (f.team === 'all' || userById[uid]?.teamId === f.team)
  const dateOk = (x: string) => (!f.from || x >= f.from) && (!f.to || x <= f.to)
  const days = Object.values(state.timesheets).filter((x) => userOk(x.userId) && dateOk(x.date)).sort((a, b) => b.date.localeCompare(a.date) || (userById[a.userId]?.name ?? '').localeCompare(userById[b.userId]?.name ?? ''))
  const ot = overtimeIndex(state.adminRequests)
  const reqDate = (r: AdminRequest) => r.overtime?.date ?? r.leave?.from ?? r.other?.date ?? r.createdAt.slice(0, 10)
  const reqs = state.adminRequests.filter((r) => userOk(r.userId) && dateOk(reqDate(r)) && (f.kind === 'all' || r.kind === f.kind) && (f.status === 'all' || r.status === f.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const name = (uid: string) => userById[uid]?.name ?? ''
  const tabs: { value: Tab; label: string }[] = [
    { value: 'attendance', label: 'ورود و خروج' }, { value: 'hours', label: 'ساعات کارکرد' }, { value: 'overtime', label: 'اضافه‌کاری' },
    { value: 'requests', label: 'درخواست‌ها' }, { value: 'handling', label: 'رسیدگی' }, ...(can.perm('timesheet.close') ? [{ value: 'ops' as Tab, label: 'عملیات اداری' }] : []),
  ]
  const th = (labels: string[]) => <thead className="border-b bg-foreground/[0.03] text-[11px] text-muted-foreground"><tr>{labels.map((x) => <th key={x} className="whitespace-nowrap px-3 py-2 text-start font-medium">{x}</th>)}</tr></thead>
  const td = 'whitespace-nowrap px-3 py-1.5'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="اداری" title="گزارش‌های اداری">
        ورود و خروج، ساعات کارکرد، اضافه‌کاری و درخواست‌های اداری همه‌ی کاربران. فقط مدیرعامل، کنترل پروژه و مدیر اداری این بخش را می‌بینند. ماه‌های بسته‌شده همان ارقامی را نشان می‌دهند که هنگام بستن ثبت شد.
      </PageHeader>
      <div className="flex flex-wrap items-end gap-2" role="group" aria-label="فیلترها">
        <div><Label htmlFor="ar-team" className="eyebrow">واحد</Label>
          <Select value={f.team} onValueChange={(v) => setF({ ...f, team: v, user: 'all' })}><SelectTrigger id="ar-team" className="mt-1 h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">همه‌ی واحدها</SelectItem>{state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="ar-user" className="eyebrow">کاربر</Label>
          <Select value={f.user} onValueChange={(v) => setF({ ...f, user: v })}><SelectTrigger id="ar-user" className="mt-1 h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="all">همه‌ی کاربران</SelectItem>{activeUsers.filter((u) => f.team === 'all' || u.teamId === f.team).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="ar-from" className="eyebrow">از</Label><div className="mt-1 w-[140px]"><JalaliDateField id="ar-from" value={f.from} onChange={(v) => setF({ ...f, from: v })} placeholder="ابتدا" /></div></div>
        <div><Label htmlFor="ar-to" className="eyebrow">تا</Label><div className="mt-1 w-[140px]"><JalaliDateField id="ar-to" value={f.to} onChange={(v) => setF({ ...f, to: v })} placeholder="امروز" /></div></div>
        {(tab === 'requests' || tab === 'handling') && <>
          <div><Label htmlFor="ar-kind" className="eyebrow">نوع درخواست</Label>
            <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as AdminRequestKind | 'all' })}><SelectTrigger id="ar-kind" className="mt-1 h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">همه</SelectItem>{(Object.keys(KIND_FA) as AdminRequestKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_FA[k]}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="ar-status" className="eyebrow">وضعیت</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as AdminRequestStatus | 'all' })}><SelectTrigger id="ar-status" className="mt-1 h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">همه</SelectItem>{(Object.keys(STATUS_FA) as AdminRequestStatus[]).map((k) => <SelectItem key={k} value={k}>{STATUS_FA[k]}</SelectItem>)}</SelectContent></Select></div>
        </>}
      </div>
      <Segmented value={tab} onChange={(v) => { setTab(v); setLimit(200) }} compact options={tabs} />

      {tab === 'attendance' && (
        <section className="overflow-hidden glass-card">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <h2 className="text-[14px] font-bold">ورود و خروج روزانه</h2><span className="num text-[12px] text-muted-foreground">{n(days.length)} روز ثبت‌شده</span>
            <span className="ms-auto"><CsvButton name="attendance" head={['تاریخ', 'کاربر', 'واحد', 'ورود', 'خروج', 'استراحت', 'کار خالص', 'موظف', 'اضافه‌کاری', 'وضعیت اضافه‌کاری', 'کسر', 'توضیح']}
              rows={days.map((x) => [d(x.date), name(x.userId), teamById[userById[x.userId]?.teamId ?? '']?.name ?? '', x.checkIn ?? '', x.checkOut ?? '', hm(x.calc.breakMinutes), hm(x.calc.worked), hm(x.calc.duty), hm(x.calc.excess), OT_FA[otState(x.calc, ot.get(x.id) ?? [])], hm(x.calc.deficit), x.note ?? ''])} /></span>
          </header>
          {days.length ? (
            <div className="scroll-x thin-scroll"><table className="w-full min-w-[920px] text-[12.5px]">
              {th(['تاریخ', 'کاربر', 'ورود', 'خروج', 'استراحت', 'کار خالص', 'موظف', 'اضافه‌کاری', 'کسر', 'توضیح'])}
              <tbody>{days.slice(0, limit).map((x) => (
                <tr key={x.id} className="cursor-pointer border-b last:border-0 hover:bg-foreground/[0.035]" onClick={() => setDayOpen({ userId: x.userId, date: x.date })}>
                  <td className={cn(td, 'num')}>{WEEKDAYS_SHORT[weekdayIndex(x.date)]} {d(x.date)}</td>
                  <td className={td}><span className="flex items-center gap-1.5"><Initials user={userById[x.userId]} size={20} />{name(x.userId)}</span></td>
                  <td className={cn(td, 'num')}>{digits(x.checkIn ?? '—')}</td><td className={cn(td, 'num')}>{digits(x.checkOut ?? '—')}</td>
                  <td className={cn(td, 'num')}>{h(x.calc.breakMinutes)}</td><td className={cn(td, 'num font-medium')}>{h(x.calc.worked)}</td><td className={cn(td, 'num text-muted-foreground')}>{h(x.calc.duty)}</td>
                  <td className={td}><OtChip state={otState(x.calc, ot.get(x.id) ?? [])} minutes={x.calc.excess} /></td>
                  <td className={cn(td, 'num', x.calc.deficit && 'text-destructive')}>{x.calc.deficit ? h(x.calc.deficit) : '—'}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground">{x.note}</td>
                </tr>))}</tbody>
            </table></div>
          ) : <div className="p-4"><Empty title="روزی با این فیلترها ثبت نشده است" /></div>}
          {days.length > limit && <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit(limit + 300)}>نمایش {n(Math.min(300, days.length - limit))} ردیف دیگر</Button></div>}
        </section>
      )}

      {tab === 'hours' && (() => {
        const rows = workSummary(days, by)
        const label = (k: string) => (by === 'month' ? `${J_MONTHS[Number(k.slice(5)) - 1]} ${digits(k.slice(0, 4))}` : by === 'week' ? `هفته‌ی ${d(k)}` : `${WEEKDAYS_SHORT[weekdayIndex(k)]} ${d(k)}`)
        return (
          <section className="overflow-hidden glass-card">
            <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <h2 className="text-[14px] font-bold">ساعات کارکرد</h2>
              <Segmented size="sm" value={by} onChange={setBy} options={[{ value: 'day', label: 'روزانه' }, { value: 'week', label: 'هفتگی' }, { value: 'month', label: 'ماهانه' }]} />
              <span className="ms-auto"><CsvButton name={`hours-${by}`} head={['دوره', 'کاربر', 'روز حضور', 'کار خالص', 'موظف', 'کسر', 'اضافه‌کاری', 'مرخصی']}
                rows={rows.map((r) => [by === 'month' ? r.key : d(r.key), name(r.userId), r.days, hm(r.worked), hm(r.duty), hm(r.deficit), hm(r.excess), hm(r.leave)])} /></span>
            </header>
            {rows.length ? (
              <div className="scroll-x thin-scroll"><table className="w-full min-w-[760px] text-[12.5px]">
                {th(['دوره', 'کاربر', 'روز حضور', 'کار خالص', 'موظف', 'کسر کارکرد', 'اضافه‌کاری', 'مرخصی'])}
                <tbody>{rows.slice(0, limit).map((r) => (
                  <tr key={`${r.userId}|${r.key}`} className="border-b last:border-0">
                    <td className={cn(td, 'num')}>{label(r.key)}</td><td className={td}>{name(r.userId)}</td><td className={cn(td, 'num')}>{n(r.days)}</td>
                    <td className={cn(td, 'num font-medium')}>{h(r.worked)}</td><td className={cn(td, 'num text-muted-foreground')}>{h(r.duty)}</td>
                    <td className={cn(td, 'num', r.deficit && 'text-destructive')}>{r.deficit ? h(r.deficit) : '—'}</td><td className={cn(td, 'num')}>{r.excess ? h(r.excess) : '—'}</td><td className={cn(td, 'num')}>{r.leave ? h(r.leave) : '—'}</td>
                  </tr>))}</tbody>
              </table></div>
            ) : <div className="p-4"><Empty title="داده‌ای با این فیلترها نیست" /></div>}
            {rows.length > limit && <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit(limit + 300)}>نمایش ردیف‌های بیشتر</Button></div>}
          </section>
        )
      })()}

      {tab === 'overtime' && (() => {
        const rows = overtimeSummary(days)
        const t = rows.reduce((a, r) => ({ excess: a.excess + r.excess, approved: a.approved + r.approved, pending: a.pending + r.pending, unpaid: a.unpaid + r.unpaid, undecided: a.undecided + r.undecided, offDay: a.offDay + r.offDay, requested: a.requested + r.requested }), { excess: 0, approved: 0, pending: 0, unpaid: 0, undecided: 0, offDay: 0, requested: 0 })
        return (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[['کل اضافه‌کاری', t.excess], ['درخواستی', t.requested], ['تأییدشده و قابل پرداخت', t.approved], ['در انتظار بررسی', t.pending], ['بدون پرداخت', t.unpaid], ['بدون تعیین تکلیف', t.undecided], ['در روز تعطیل', t.offDay]]
                .map(([k, v]) => <div key={k as string} className="glass-card px-3 py-2"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="num text-[17px] font-bold">{h(v as number)}</dd></div>)}
            </dl>
            <section className="overflow-hidden glass-card">
              <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                <h2 className="text-[14px] font-bold">اضافه‌کاری هر کاربر</h2>
                <span className="text-[12px] text-muted-foreground">کارکرد واقعی، درخواستی، تأییدشده و بدون پرداخت جدا نگه داشته می‌شوند</span>
                <span className="ms-auto"><CsvButton name="overtime" head={['کاربر', 'واحد', 'روزها', 'کل', 'روز تعطیل', 'درخواستی', 'تأییدشده (قابل پرداخت)', 'در انتظار', 'بدون پرداخت', 'بدون تعیین تکلیف']}
                  rows={rows.map((r) => [name(r.userId), teamById[userById[r.userId]?.teamId ?? '']?.name ?? '', r.days, hm(r.excess), hm(r.offDay), hm(r.requested), hm(r.approved), hm(r.pending), hm(r.unpaid), hm(r.undecided)])} /></span>
              </header>
              {rows.length ? (
                <div className="scroll-x thin-scroll"><table className="w-full min-w-[880px] text-[12.5px]">
                  {th(['کاربر', 'روزها', 'کل', 'روز تعطیل', 'درخواستی', 'تأییدشده (قابل پرداخت)', 'در انتظار', 'بدون پرداخت', 'بدون تعیین تکلیف'])}
                  <tbody>{rows.map((r) => (
                    <tr key={r.userId} className="cursor-pointer border-b last:border-0 hover:bg-foreground/[0.035]" onClick={() => setF({ ...f, user: r.userId })} title="فیلتر روی این کاربر">
                      <td className={td}><span className="flex items-center gap-1.5"><Initials user={userById[r.userId]} size={20} />{name(r.userId)}</span></td>
                      <td className={cn(td, 'num')}>{n(r.days)}</td><td className={cn(td, 'num font-semibold')}>{h(r.excess)}</td><td className={cn(td, 'num')}>{r.offDay ? h(r.offDay) : '—'}</td>
                      <td className={cn(td, 'num')}>{r.requested ? h(r.requested) : '—'}</td><td className={cn(td, 'num font-medium text-leaf-ink')}>{r.approved ? h(r.approved) : '—'}</td><td className={cn(td, 'num')}>{r.pending ? h(r.pending) : '—'}</td>
                      <td className={cn(td, 'num text-muted-foreground')}>{r.unpaid ? h(r.unpaid) : '—'}</td><td className={cn(td, 'num')}>{r.undecided ? h(r.undecided) : '—'}</td>
                    </tr>))}</tbody>
                </table></div>
              ) : <div className="p-4"><Empty title="اضافه‌کاری‌ای در این بازه نیست" /></div>}
            </section>
          </>
        )
      })()}

      {tab === 'requests' && (() => {
        const counts = (Object.keys(STATUS_FA) as AdminRequestStatus[]).map((s) => [s, reqs.filter((r) => r.status === s).length] as const)
        return (
          <>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_FA) as AdminRequestKind[]).filter((k) => f.kind === 'all' || f.kind === k).map((k) => {
                const list = reqs.filter((r) => r.kind === k)
                return <div key={k} className="glass-card px-3 py-2 text-[12px]"><div className="text-[13px] font-semibold">{KIND_FA[k]} <span className="num text-muted-foreground">({n(list.length)})</span></div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">{(Object.keys(STATUS_FA) as AdminRequestStatus[]).map((s) => { const c = list.filter((r) => r.status === s).length; return c ? <span key={s}>{STATUS_FA[s]}: <b className="num text-foreground">{n(c)}</b></span> : null })}</div></div>
              })}
            </div>
            <section className="overflow-hidden glass-card">
              <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                <h2 className="text-[14px] font-bold">درخواست‌ها</h2><span className="num text-[12px] text-muted-foreground">{counts.filter(([, c]) => c).map(([s, c]) => `${STATUS_FA[s]} ${digits(c)}`).join('، ')}</span>
                <span className="ms-auto"><CsvButton name="requests" head={['شماره', 'نوع', 'کاربر', 'شرح', 'تاریخ ثبت', 'وضعیت', 'مدیر اداری', 'مدیرعامل', 'توضیح']}
                  rows={reqs.map((r) => { const o = r.steps.find((s) => s.stage === 'office'), c = r.steps.find((s) => s.stage === 'ceo'); return [r.no, KIND_FA[r.kind], name(r.userId), requestSummary(r, holidays), d(r.createdAt.slice(0, 10)), STATUS_FA[r.status], o ? `${o.decision === 'approve' ? 'تأیید' : 'رد'} ${d(o.at.slice(0, 10))}` : '', c ? `${c.decision === 'approve' ? 'تأیید' : 'رد'} ${d(c.at.slice(0, 10))}` : '', r.description] })} /></span>
              </header>
              {reqs.length ? (
                <div className="scroll-x thin-scroll"><table className="w-full min-w-[820px] text-[12.5px]">
                  {th(['#', 'نوع', 'کاربر', 'شرح', 'ثبت', 'وضعیت'])}
                  <tbody>{reqs.slice(0, limit).map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-foreground/[0.035]" onClick={() => setOpenId(r.id)}>
                      <td className={cn(td, 'num text-muted-foreground')}>{digits(r.no)}</td><td className={td}>{KIND_FA[r.kind]}</td><td className={td}>{name(r.userId)}</td>
                      <td className="max-w-[320px] truncate px-3 py-1.5">{requestSummary(r, holidays)}</td><td className={cn(td, 'text-muted-foreground')}>{time(r.createdAt)}</td><td className={td}><RequestStatusPill s={r.status} /></td>
                    </tr>))}</tbody>
                </table></div>
              ) : <div className="p-4"><Empty title="درخواستی با این فیلترها نیست" /></div>}
            </section>
          </>
        )
      })()}

      {tab === 'handling' && (() => {
        const st = approverStats(reqs, new Date().toISOString())
        const waiting = reqs.filter(isPending).sort((a, b) => a.stageSince.localeCompare(b.stageSince))
        const hrs = (x: number | null) => (x == null ? '—' : x < 24 ? `${n(x, 1)} ساعت` : `${n(x / 24, 1)} روز`)
        return (
          <section className="overflow-hidden glass-card">
            <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <h2 className="text-[14px] font-bold">عملکرد رسیدگی مدیر اداری و مدیرعامل</h2>
              <span className="ms-auto"><CsvButton name="handling" head={['مرحله', 'رسیدگی‌شده', 'تأیید', 'رد', 'میانگین زمان پاسخ (ساعت)', 'در انتظار', 'قدیمی‌ترین انتظار (ساعت)']}
                rows={st.map((s) => [s.stage === 'office' ? 'مدیر اداری' : 'مدیرعامل', s.handled, s.approved, s.rejected, s.avgHours == null ? '' : s.avgHours.toFixed(1), s.pending, s.oldestHours == null ? '' : s.oldestHours.toFixed(1)])} /></span>
            </header>
            <div className="scroll-x thin-scroll"><table className="w-full min-w-[720px] text-[12.5px]">
              {th(['مرحله', 'رسیدگی‌شده', 'تأیید', 'رد', 'میانگین زمان پاسخ', 'اکنون در انتظار', 'قدیمی‌ترین انتظار'])}
              <tbody>{st.map((s) => (
                <tr key={s.stage} className="border-b last:border-0">
                  <td className={cn(td, 'font-medium')}>{s.stage === 'office' ? 'مدیر اداری' : 'مدیرعامل'}</td><td className={cn(td, 'num')}>{n(s.handled)}</td><td className={cn(td, 'num')}>{n(s.approved)}</td><td className={cn(td, 'num')}>{n(s.rejected)}</td>
                  <td className={cn(td, 'num')}>{hrs(s.avgHours)}</td><td className={cn(td, 'num', s.pending && 'font-semibold')}>{n(s.pending)}</td><td className={cn(td, 'num', (s.oldestHours ?? 0) > 72 && 'text-destructive')}>{hrs(s.oldestHours)}</td>
                </tr>))}</tbody>
            </table></div>
            <h3 className="border-t px-4 pb-1 pt-3 text-[13px] font-semibold">در کارتابل‌ها</h3>
            {waiting.length ? waiting.map((r) => (
              <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-2 border-t px-4 py-2 text-start text-[12.5px] hover:bg-foreground/[0.035]">
                <span className="num text-muted-foreground">#{digits(r.no)}</span>{KIND_FA[r.kind]}<span>{name(r.userId)}</span><RequestStatusPill s={r.status} /><span className="ms-auto text-muted-foreground">منتظر از {time(r.stageSince)}</span>
              </button>
            )) : <p className="px-4 pb-3 text-[12.5px] text-muted-foreground">درخواستی در انتظار نیست.</p>}
          </section>
        )
      })()}

      {tab === 'ops' && <OfficeOps />}

      <RequestDialog id={openId} onClose={() => setOpenId(null)} />
      {dayOpen && <DayDialog userId={dayOpen.userId} date={dayOpen.date} onClose={() => setDayOpen(null)} onRequest={() => undefined} />}
    </div>
  )
}

/** Administrative Manager only: month close, direct leave entry (exceptions), timesheet rules */
function OfficeOps() {
  const { state, dispatch, activeUsers, userById } = useStore()
  const { d, digits, n, time } = useFmt()
  const h = useHM()
  const holidays = useMemo(() => new Set(state.holidays.map((x) => x.date)), [state.holidays])
  const firstDay = Object.values(state.timesheets).reduce((m, x) => (x.date < m ? x.date : m), TODAY)
  const months: string[] = []
  for (let k = jMonthKey(firstDay); monthRange(k).to < TODAY; k = nextMonthKey(k)) months.push(k)
  const [lv, setLv] = useState({ user: undefined as string | undefined, date: undefined as string | undefined, hours: '8', note: '' })
  const cfg = configFor(state.timesheetConfigs, TODAY)
  const [c, setC] = useState({ duty: String(cfg.dutyNetMinutes / 60), brk: String(cfg.minBreakMinutes), edit: String(cfg.editDays), from: addDays(TODAY, 1) as string | undefined, reason: '' })
  const direct = state.leaves.filter((l) => !l.requestId && l.by).sort((a, b) => b.date.localeCompare(a.date))
  const monthLabel = (k: string) => `${J_MONTHS[Number(k.slice(5)) - 1]} ${digits(k.slice(0, 4))}`

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="glass-card p-4 lg:col-span-2">
        <h2 className="flex items-center gap-1.5 text-[14px] font-bold"><CalendarCheck2 className="h-4 w-4" /> بستن ماه</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">بعد از بستن، هیچ عددی از آن ماه تغییر نمی‌کند و اضافه‌کاری‌های بدون تعیین تکلیف بدون پرداخت ثبت می‌شوند. ماهی را می‌توان بست که تمام شده و درخواست مرخصی یا اضافه‌کاری‌اش در کارتابل نمانده باشد.</p>
        <ul className="mt-2 flex flex-col divide-y">
          {months.map((k) => {
            const closed = state.monthCloses.find((m) => m.month === k)
            const { from, to } = monthRange(k)
            const md = Object.values(state.timesheets).filter((x) => x.date >= from && x.date <= to)
            const und = md.reduce((s, x) => s + x.calc.undecided, 0)
            const pend = state.adminRequests.filter((r) => isPending(r) && ((r.overtime && r.overtime.date >= from && r.overtime.date <= to) || (r.leave && leaveDates(r.leave, holidays).some((x) => x >= from && x <= to)))).length
            return (
              <li key={k} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <span className="num min-w-[100px] font-semibold">{monthLabel(k)}</span>
                {closed ? <span className="text-muted-foreground"><Lock className="me-1 inline h-3 w-3" />بسته شد، {userById[closed.by]?.name}، {time(closed.at)}؛ {h(closed.unpaidMinutes)} بدون تعیین تکلیف، بدون پرداخت شد</span>
                  : <>
                    <span className="text-muted-foreground">{n(md.length)} روز ثبت‌شده، {h(und)} بدون تعیین تکلیف{pend ? `، ${n(pend)} درخواست در کارتابل` : ''}</span>
                    <Button size="sm" className="ms-auto h-7" disabled={pend > 0} onClick={() => { dispatch({ type: 'monthClose', month: k }); toast.success(`ماه ${monthLabel(k)} بسته شد`) }}>بستن ماه</Button>
                  </>}
              </li>
            )
          })}
          {!months.length && <li className="py-2 text-[12.5px] text-muted-foreground">ماه تمام‌شده‌ای نیست.</li>}
        </ul>
      </section>

      <section className="glass-card p-4">
        <h2 className="text-[14px] font-bold">ثبت مستقیم مرخصی</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">فقط برای موارد استثنا (مثلاً مرخصی استعلاجی که بعداً اطلاع داده شده). روال عادی، درخواست مرخصی خود کارکنان است. دلیل الزامی است و در AuditLog می‌ماند.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="col-span-2"><Label htmlFor="dl-user" className="eyebrow">کاربر</Label><UserSelect id="dl-user" value={lv.user} onChange={(v) => setLv({ ...lv, user: v })} users={activeUsers} grouped noneLabel="انتخاب کاربر" /></div>
          <div><Label htmlFor="dl-date" className="eyebrow">روز</Label><div className="mt-1"><JalaliDateField id="dl-date" value={lv.date} onChange={(v) => setLv({ ...lv, date: v })} /></div></div>
          <div><Label htmlFor="dl-hours" className="eyebrow">ساعت (۸ = روز کامل)</Label><Input id="dl-hours" type="number" min={0.5} max={8} step={0.5} dir="ltr" className="num mt-1 h-9" value={lv.hours} onChange={(e) => setLv({ ...lv, hours: e.target.value })} /></div>
          <div className="col-span-2"><Label htmlFor="dl-note" className="eyebrow">دلیل</Label><Input id="dl-note" className="mt-1 h-9" value={lv.note} onChange={(e) => setLv({ ...lv, note: e.target.value })} /></div>
          <Button className="col-span-2 sm:col-span-1" onClick={() => {
            if (!lv.user || !lv.date) { toast.error('کاربر و روز را انتخاب کنید.'); return }
            if (!lv.note.trim()) { toast.error('دلیل ثبت مستقیم را بنویسید.'); return }
            if (isMonthClosed(state.monthCloses, lv.date)) { toast.error('ماه این تاریخ بسته شده است.'); return }
            dispatch({ type: 'addLeave', leave: { id: `l-d${Date.now().toString(36)}`, userId: lv.user, date: lv.date, hours: Number(lv.hours), note: lv.note } })
            setLv({ ...lv, date: undefined, note: '' }); toast.success('مرخصی ثبت شد')
          }}>ثبت</Button>
        </div>
        {direct.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y border-t text-[12.5px]">
            {direct.slice(0, 12).map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1.5">
                <span className="num">{d(l.date)}</span><span>{userById[l.userId]?.name}</span><span className="num text-muted-foreground">{n(l.hours, 1)} ساعت</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.note}</span>
                {!isMonthClosed(state.monthCloses, l.date) && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="حذف" onClick={() => dispatch({ type: 'removeLeave', id: l.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-bold"><Settings2 className="h-4 w-4" /> قواعد تایم‌شیت</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">نسخه‌ی فعلی {digits(cfg.version)}: کار خالص {h(cfg.dutyNetMinutes)}، استراحت دست‌کم {digits(cfg.minBreakMinutes)} دقیقه، مهلت ثبت و اصلاح {digits(cfg.editDays)} روز. نسخه‌ی تازه از تاریخ خودش اعمال می‌شود و روزهای گذشته جابه‌جا نمی‌شوند.</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div><Label htmlFor="tc-duty" className="eyebrow">کار خالص (ساعت)</Label><Input id="tc-duty" type="number" step={0.25} dir="ltr" className="num mt-1 h-9" value={c.duty} onChange={(e) => setC({ ...c, duty: e.target.value })} /></div>
          <div><Label htmlFor="tc-brk" className="eyebrow">استراحت (دقیقه)</Label><Input id="tc-brk" type="number" step={5} dir="ltr" className="num mt-1 h-9" value={c.brk} onChange={(e) => setC({ ...c, brk: e.target.value })} /></div>
          <div><Label htmlFor="tc-edit" className="eyebrow">مهلت اصلاح (روز)</Label><Input id="tc-edit" type="number" dir="ltr" className="num mt-1 h-9" value={c.edit} onChange={(e) => setC({ ...c, edit: e.target.value })} /></div>
          <div><Label htmlFor="tc-from" className="eyebrow">از تاریخ</Label><div className="mt-1"><JalaliDateField id="tc-from" value={c.from} onChange={(v) => setC({ ...c, from: v })} /></div></div>
          <div className="col-span-2"><Label htmlFor="tc-reason" className="eyebrow">دلیل</Label><Input id="tc-reason" className="mt-1 h-9" value={c.reason} onChange={(e) => setC({ ...c, reason: e.target.value })} /></div>
        </div>
        <Button className="mt-2" variant="outline" onClick={() => {
          const duty = Math.round(Number(c.duty) * 60), brk = Number(c.brk), edit = Number(c.edit)
          if (!(duty >= 60 && duty <= 720) || !Number.isInteger(brk) || !Number.isInteger(edit)) { toast.error('مقادیر را بررسی کنید.'); return }
          if (!c.from || c.from < TODAY) { toast.error('قاعده‌ی تازه از امروز یا بعد از آن اعمال می‌شود.'); return }
          if (!c.reason.trim()) { toast.error('دلیل تغییر را بنویسید.'); return }
          dispatch({ type: 'tsConfig', config: { dutyNetMinutes: duty, minBreakMinutes: brk, editDays: edit, from: c.from }, reason: c.reason })
          setC({ ...c, reason: '' }); toast.success('قواعد تازه ثبت شد')
        }}>ثبت نسخه‌ی تازه</Button>
        {state.timesheetConfigs.length > 1 && (
          <ul className="mt-3 flex flex-col gap-1 border-t pt-2 text-[12px] text-muted-foreground">
            {[...state.timesheetConfigs].reverse().map((x) => <li key={x.version} className="num">نسخه‌ی {digits(x.version)} از {d(x.from)}: {h(x.dutyNetMinutes)} + {digits(x.minBreakMinutes)} دقیقه — {x.reason}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Home card: today's check-in/out and overtime still waiting for a choice */
export function TimesheetTodayCard() {
  const { state, dispatch, me } = useStore()
  const { digits, n } = useFmt()
  const h = useHM()
  const today = state.timesheets[dayKey(me.id, TODAY)]
  const undecided = Object.values(state.timesheets).filter((x) => x.userId === me.id && x.calc.undecided > 0)
  const pendingMine = state.adminRequests.filter((r) => r.userId === me.id && isPending(r)).length
  return (
    <section className="glass-card flex flex-wrap items-center gap-3 px-4 py-3" aria-label="تایم‌شیت امروز">
      <div className="min-w-0 flex-1 text-[13px]">
        <span className="eyebrow me-2">تایم‌شیت امروز</span>
        {!today?.checkIn ? 'ورود ثبت نشده' : !today.checkOut ? <>ورود <span className="num">{digits(today.checkIn)}</span></> : <>کار خالص <span className="num">{h(today.calc.worked)}</span></>}
        {undecided.length > 0 && <button type="button" className="ms-3 inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'timesheet' } })}><AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--status-warning)' }} />{n(undecided.length)} روز اضافه‌کاری بدون تعیین تکلیف</button>}
        {pendingMine > 0 && <button type="button" className="ms-3 text-[12.5px] text-muted-foreground hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'requests' } })}>{n(pendingMine)} درخواست در جریان</button>}
      </div>
      {!today?.checkIn && <Button size="sm" onClick={() => { dispatch({ type: 'tsPunch', kind: 'in' }); toast.success(`ورود ${digits(tehranTime())} ثبت شد`) }}><LogIn className="h-4 w-4" /> ثبت ورود</Button>}
      {today?.checkIn && !today.checkOut && <Button size="sm" variant="outline" onClick={() => { dispatch({ type: 'tsPunch', kind: 'out' }); toast.success(`خروج ${digits(tehranTime())} ثبت شد`) }}><LogOut className="h-4 w-4" /> ثبت خروج</Button>}
    </section>
  )
}
