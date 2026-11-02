import { useMemo, useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, History, Pencil, Timer, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { dayTotal, logsOfTask, MAX_DAY_MINUTES, parseDuration, timeTracking, type TimeState } from '@/lib/worklog'
import type { Task, WorkLog } from '@/lib/types'
import { Initials, JalaliDateField } from './common'
import { useSigned } from './PointsViews'

const STATE_META: Record<Exclude<TimeState, 'none'>, { label: string; color: string; icon: typeof CheckCircle2; text: string }> = {
  normal: { label: 'عادی', color: 'var(--chart-pos)', icon: CheckCircle2, text: 'text-azure-ink' },
  near: { label: 'نزدیک سقف Estimation', color: 'var(--status-warning)', icon: AlertTriangle, text: 'text-foreground' },
  over: { label: 'عبور از Estimation', color: 'var(--status-critical)', icon: AlertOctagon, text: 'text-destructive' },
}

export function useDuration() {
  const { n } = useFmt()
  return (m: number) => {
    const h = Math.floor(m / 60), r = m % 60
    return h && r ? `${n(h)} ساعت و ${n(r)} دقیقه` : h ? `${n(h)} ساعت` : `${n(r)} دقیقه`
  }
}

/** Time spent vs Estimation for one task: the bar scales to the larger of 100 % and the actual use, so overrun stays visible */
export function TimeProgressBar({ progress, state }: { progress: number; state: Exclude<TimeState, 'none'> }) {
  const { n } = useFmt()
  const scale = Math.max(100, progress)
  const m = STATE_META[state]
  const Icon = m.icon
  return (
    <div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(scale)} aria-valuenow={Math.round(progress)} aria-label={`مصرف زمان: ${Math.round(progress)}٪، ${m.label}`}>
        <div className="absolute inset-y-0 start-0 rounded-full transition-[width] duration-300" style={{ width: `${(Math.min(progress, scale) / scale) * 100}%`, background: m.color }} />
        {[80, 100].map((x) => <span key={x} className="absolute inset-y-0 w-[2px] bg-background" style={{ insetInlineStart: `calc(${(x / scale) * 100}% - 1px)` }} />)}
      </div>
      <div className="relative mt-1 h-4 text-[10.5px] text-muted-foreground">
        {[80, 100].map((x) => <span key={x} className="num absolute" style={{ insetInlineStart: `${(x / scale) * 100}%`, transform: 'translateX(50%)' }}>{n(x)}٪</span>)}
      </div>
      <div className={cn('mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium', m.text)}><Icon className="h-4 w-4" style={{ color: m.color }} />{m.label}</div>
    </div>
  )
}

export function WorkLogPanel({ t }: { t: Task }) {
  const { state, dispatch, can, me, userById } = useStore()
  const { n, d, time } = useFmt()
  const dur = useDuration()
  const sg = useSigned()
  const tt = useMemo(() => timeTracking(t, state.workLogs), [t, state.workLogs])
  const seeAll = can.seeAllLogs(t)
  const all = logsOfTask(state.workLogs, t.id)
  const visible = (seeAll ? all : all.filter((l) => l.userId === me.id)).sort((a, b) => b.workDate.localeCompare(a.workDate) || b.createdAt.localeCompare(a.createdAt))
  const live = visible.filter((l) => !l.deletedAt)
  const removed = visible.filter((l) => l.deletedAt)
  const [showAll, setShowAll] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const mineMinutes = live.filter((l) => l.userId === me.id).reduce((s, l) => s + l.minutes, 0)

  // new record
  const [f, setF] = useState({ h: '', m: '0', date: TODAY as string | undefined, desc: '' })
  const submit = () => {
    const minutes = parseDuration(f.h, f.m)
    if (!minutes) { toast.error('مدت‌زمان را وارد کنید.'); return }
    if (!f.date) { toast.error('تاریخ انجام کار را انتخاب کنید.'); return }
    if (f.date > TODAY) { toast.error('تاریخ انجام کار نمی‌تواند در آینده باشد.'); return }
    if (f.desc.trim().length < 2) { toast.error('توضیح فعالیت را بنویسید.'); return }
    if (dayTotal(state.workLogs, me.id, f.date) + minutes > MAX_DAY_MINUTES) { toast.error('جمع زمان ثبت‌شده‌ی شما در این روز از ۲۴ ساعت بیشتر می‌شود.'); return }
    dispatch({ type: 'logWork', log: { taskId: t.id, minutes, workDate: f.date, description: f.desc.trim() } })
    setF({ h: '', m: '0', date: f.date, desc: '' })
    const total = dayTotal(state.workLogs, me.id, f.date) + minutes
    toast.success(`${dur(minutes)} ثبت شد`, { description: total > 10 * 60 ? `جمع ثبت‌شده‌ی شما در این روز ${dur(total)} است.` : 'تحلیل زمان همین حالا به‌روز شد.' })
  }

  const shown = showAll ? live : live.slice(0, 6)
  return (
    <div className="mt-4 rounded-xl border bg-background/45 p-3" id="worklog">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Work Log و مقایسه با Estimation</span>
        <span className="num text-[11.5px] text-muted-foreground">{n(tt.records)} رکورد</span>
      </div>

      {/* analysis */}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
        <div><dt className="eyebrow">Original Estimation</dt><dd className="num font-semibold">{tt.original != null ? `${n(tt.original, 1)} ساعت` : '—'}</dd>{tt.current != null && <dd className="num text-[11px] text-muted-foreground">فعلی: {n(tt.current, 1)} ساعت</dd>}</div>
        <div><dt className="eyebrow">Logged Time</dt><dd className="num font-semibold">{n(tt.logged, 1)} ساعت</dd></div>
        <div><dt className="eyebrow">Remaining Time</dt><dd className="num font-semibold">{tt.remaining != null ? `${n(tt.remaining, 1)} ساعت` : '—'}</dd></div>
        <div><dt className="eyebrow">Time Progress</dt><dd className="num font-semibold">{tt.progress != null ? `${n(tt.progress, 0)}٪` : '—'}</dd></div>
      </dl>
      {tt.progress != null && tt.state !== 'none' ? (
        <div className="mt-3">
          <TimeProgressBar progress={tt.progress} state={tt.state} />
          <p className="num mt-1 text-[12px] text-muted-foreground">
            اختلاف با Estimation: <b className={cn(tt.variance! > 0 ? 'text-destructive' : 'text-foreground')}>{sg(Math.round(tt.variance! * 10) / 10)} ساعت</b>
            {tt.variance! > 0 ? ' بیشتر از برآورد' : tt.variance! < 0 ? ' کمتر از برآورد تا این لحظه' : ' — دقیقاً به اندازه‌ی برآورد'}
          </p>
          <p className="mt-0.5 text-end text-[11px] text-muted-foreground" dir="ltr">Time Progress = Logged Time ÷ Original Estimation × 100</p>
        </div>
      ) : <p className="mt-2 text-[12px] text-muted-foreground">Estimation تعیین نشده است؛ فقط زمان ثبت‌شده جمع می‌شود.</p>}

      {seeAll && tt.byUser.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <div className="eyebrow mb-1.5">به تفکیک افراد</div>
          <ul className="flex flex-col gap-1.5">
            {tt.byUser.map((b) => (
              <li key={b.userId} className="flex items-center gap-2 text-[12.5px]">
                <Initials user={userById[b.userId]} size={20} />
                <span className="w-28 shrink-0 truncate">{userById[b.userId]?.name}</span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full" style={{ width: `${(b.minutes / (tt.logged * 60)) * 100}%`, background: 'var(--chart-pos)' }} /></span>
                <span className="num w-24 shrink-0 text-end">{n(b.minutes / 60, 1)} ساعت</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* new record */}
      {can.logTime(t) ? (
        <form className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-[80px_90px_150px_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div><Label htmlFor="wl-h" className="eyebrow">ساعت</Label><Input id="wl-h" type="number" min={0} max={24} step={1} inputMode="numeric" className="num mt-1 h-9" value={f.h} onChange={(e) => setF({ ...f, h: e.target.value })} placeholder="0" /></div>
          <div><Label htmlFor="wl-m" className="eyebrow">دقیقه</Label>
            <Select value={f.m} onValueChange={(v) => setF({ ...f, m: v })}><SelectTrigger id="wl-m" className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{['0', '15', '30', '45'].map((x) => <SelectItem key={x} value={x}>{n(Number(x))}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2 sm:col-span-1"><Label htmlFor="wl-date" className="eyebrow">تاریخ انجام کار</Label><div className="mt-1"><JalaliDateField id="wl-date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div></div>
          <div className="col-span-2 sm:col-span-1"><Label htmlFor="wl-desc" className="eyebrow">توضیح فعالیت</Label><Input id="wl-desc" className="mt-1 h-9" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="چه کاری انجام شد؟" /></div>
          <Button type="submit" className="col-span-2 h-9 sm:col-span-1">ثبت زمان</Button>
        </form>
      ) : <p className="mt-3 border-t pt-2 text-[11.5px] text-muted-foreground">ثبت زمان روی این تسک برای مسئول، مشارکت‌کنندگان، Reviewer و تیم مسئول است.</p>}

      {/* records */}
      <div className="mt-3 border-t pt-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="eyebrow">{seeAll ? 'سوابق همه‌ی افراد' : 'سوابق شما'}</span>
          {!seeAll && mineMinutes > 0 && <span className="num text-[11.5px] text-muted-foreground">جمع شما: {dur(mineMinutes)}</span>}
        </div>
        {live.length === 0 ? <p className="text-[12px] text-muted-foreground">{seeAll ? 'هنوز زمانی ثبت نشده است.' : 'هنوز زمانی ثبت نکرده‌اید.'}</p> : (
          <ul className="flex flex-col divide-y">
            {shown.map((l) => <LogRow key={l.id} l={l} t={t} showUser={seeAll} />)}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap gap-3">
          {live.length > 6 && <button className="text-[12px] text-azure hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'نمایش کمتر' : `نمایش همه (${n(live.length)})`}</button>}
          {removed.length > 0 && <button className="text-[12px] text-muted-foreground hover:underline" onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? 'پنهان کردن حذف‌شده‌ها' : `${n(removed.length)} رکورد حذف‌شده (نگه‌داری‌شده)`}</button>}
        </div>
        {showDeleted && (
          <ul className="mt-1 flex flex-col gap-1 text-[12px] text-muted-foreground">
            {removed.map((l) => <li key={l.id} className="num"><span className="line-through">{dur(l.minutes)}، {d(l.workDate)}، {l.description}</span> — {userById[l.userId]?.name}؛ حذف توسط {userById[l.deletedBy ?? '']?.name}، {time(l.deletedAt!)}{l.deleteReason ? `؛ دلیل: ${l.deleteReason}` : ''}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

function LogRow({ l, t, showUser }: { l: WorkLog; t: Task; showUser: boolean }) {
  const { state, dispatch, can, me, userById } = useStore()
  const { d, time, clock } = useFmt()
  const dur = useDuration()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const own = l.userId === me.id
  const editable = can.editLog(l, t)
  const [e, setE] = useState({ h: String(Math.floor(l.minutes / 60)), m: String(l.minutes % 60), date: l.workDate as string | undefined, desc: l.description, reason: '' })
  const [showRev, setShowRev] = useState(false)
  const save = () => {
    const minutes = parseDuration(e.h, e.m)
    if (!minutes) { toast.error('مدت‌زمان را وارد کنید.'); return }
    if (!e.date || e.date > TODAY) { toast.error('تاریخ انجام کار نمی‌تواند در آینده باشد.'); return }
    if (e.desc.trim().length < 2) { toast.error('توضیح فعالیت را بنویسید.'); return }
    if (!own && !e.reason.trim()) { toast.error('برای تغییر Work Log دیگران دلیل لازم است.'); return }
    if (dayTotal(state.workLogs, l.userId, e.date, l.id) + minutes > MAX_DAY_MINUTES) { toast.error('جمع زمان این روز از ۲۴ ساعت بیشتر می‌شود.'); return }
    dispatch({ type: 'editWorkLog', id: l.id, patch: { minutes, workDate: e.date, description: e.desc.trim() }, reason: e.reason.trim() || undefined })
    setMode('view')
    toast.success('Work Log ویرایش شد', { description: 'مقدار قبلی در تاریخچه‌ی رکورد نگه داشته شد.' })
  }
  const remove = () => {
    if (!own && !e.reason.trim()) { toast.error('برای حذف Work Log دیگران دلیل لازم است.'); return }
    dispatch({ type: 'deleteWorkLog', id: l.id, reason: e.reason.trim() || undefined })
    toast('Work Log حذف شد', { description: 'از جمع زمان کم شد؛ رکورد برای تاریخچه نگه داشته می‌شود.' })
  }
  if (mode === 'edit') {
    return (
      <li className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-[70px_80px_140px_minmax(0,1fr)]">
        <Input aria-label="ساعت" type="number" min={0} max={24} className="num h-8" value={e.h} onChange={(x) => setE({ ...e, h: x.target.value })} />
        <Input aria-label="دقیقه" type="number" min={0} max={59} className="num h-8" value={e.m} onChange={(x) => setE({ ...e, m: x.target.value })} />
        <div className="col-span-2 sm:col-span-1"><JalaliDateField id={`wl-e-date-${l.id}`} value={e.date} onChange={(v) => setE({ ...e, date: v })} /></div>
        <Input aria-label="توضیح" className="col-span-2 h-8 sm:col-span-1" value={e.desc} onChange={(x) => setE({ ...e, desc: x.target.value })} />
        {!own && <Input aria-label="دلیل" className="col-span-2 h-8 sm:col-span-4" value={e.reason} onChange={(x) => setE({ ...e, reason: x.target.value })} placeholder="دلیل تغییر (الزامی برای رکورد دیگران)" />}
        <div className="col-span-2 flex gap-2 sm:col-span-4"><Button size="sm" className="h-8" onClick={save}>ذخیره</Button><Button size="sm" variant="ghost" className="h-8" onClick={() => setMode('view')}>انصراف</Button></div>
      </li>
    )
  }
  return (
    <li className="py-2 text-[12.5px]">
      <div className="flex items-start gap-2">
        {showUser && <Initials user={userById[l.userId]} size={22} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <b className="num">{dur(l.minutes)}</b>
            <span className="num text-muted-foreground">{d(l.workDate)}</span>
            {showUser && <span className="text-muted-foreground">{userById[l.userId]?.name}</span>}
            {l.revisions?.length ? <button className="inline-flex items-center gap-0.5 rounded bg-secondary px-1 text-[10.5px]" onClick={() => setShowRev(!showRev)}><History className="h-3 w-3" /> ویرایش‌شده</button> : null}
          </div>
          <div className="break-words">{l.description}</div>
          <div className="num text-[11px] text-muted-foreground">ثبت {time(l.createdAt)}، {clock(l.createdAt)}{l.updatedBy && l.updatedBy !== l.userId ? `؛ ویرایش توسط ${userById[l.updatedBy]?.name}` : ''}</div>
          {showRev && (
            <ul className="mt-1 flex flex-col gap-0.5 border-s ps-2 text-[11px] text-muted-foreground">
              {l.revisions!.map((r, i) => <li key={i} className="num">قبلاً: {dur(r.minutes)}، {d(r.workDate)}، {r.description} — {userById[r.by]?.name}، {time(r.at)}{r.reason ? `؛ دلیل: ${r.reason}` : ''}</li>)}
            </ul>
          )}
        </div>
        {editable && mode === 'view' && (
          <div className="flex shrink-0 gap-0.5">
            <button className="key key-ghost inline-flex h-7 w-7 items-center justify-center rounded-full" aria-label="ویرایش رکورد" onClick={() => setMode('edit')}><Pencil className="h-3.5 w-3.5" /></button>
            <button className="key key-ghost inline-flex h-7 w-7 items-center justify-center rounded-full" aria-label="حذف رکورد" onClick={() => setMode('delete')}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
      {mode === 'delete' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-2 py-1.5">
          <span className="text-[12px]">این رکورد از جمع زمان کم می‌شود.</span>
          {!own && <Input aria-label="دلیل حذف" className="h-8 w-48" value={e.reason} onChange={(x) => setE({ ...e, reason: x.target.value })} placeholder="دلیل (الزامی)" />}
          <Button size="sm" variant="destructive" className="h-8" onClick={remove}><Trash2 className="h-3.5 w-3.5" /> حذف</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setMode('view')}><X className="h-3.5 w-3.5" /> انصراف</Button>
        </div>
      )}
    </li>
  )
}
