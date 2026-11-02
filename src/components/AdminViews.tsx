// Administrative module — shared pieces: request status, request form and detail, timesheet day.
import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CircleSlash, Clock3, FileText, History, Lock, Send, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { requestSummary, useFmt, useStore, type NewFile, type NewRequest } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { WEEKDAYS, diffDays, weekdayIndex } from '@/lib/jalali'
import {
  checkLeave, checkOvertime, configFor, dayKey, hm, hourLeaveMinutes, isHM, isMonthClosed, isOffDay, isPending, KIND_FA, LEAVE_CAT_FA, leaveDates, OT_FA, OTHER_CAT_FA,
  otState, overtimeAvailable, overtimeIndex, presenceOf, STATUS_FA, type OtState,
} from '@/lib/admin'
import { activeLogs } from '@/lib/worklog'
import type { AdminRequest, AdminRequestKind, AdminRequestStatus, LeaveCategory, OtherCategory, TimesheetDay } from '@/lib/types'
import { Initials, JalaliDateField, Segmented } from './common'
import { FilePicker, fmtSize } from './FlowViews'

/** "۸:۳۰" */
export function useHM() {
  const { digits } = useFmt()
  return (m: number) => digits(hm(m))
}

const STATUS_CLS: Record<AdminRequestStatus, string> = {
  pending_office: 'bg-azure-soft text-azure-ink', pending_ceo: 'bg-azure-soft text-azure-ink', approved: 'bg-leaf-soft text-leaf-ink',
  rejected: 'bg-destructive/10 text-destructive', withdrawn: 'bg-secondary text-muted-foreground', cancelled: 'bg-secondary text-muted-foreground',
}
export function RequestStatusPill({ s, className }: { s: AdminRequestStatus; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium', STATUS_CLS[s], className)}>{STATUS_FA[s]}</span>
}

const OT_CLS: Record<OtState, string> = {
  none: '', undecided: 'bg-[var(--status-warning)]/25 text-foreground ring-1 ring-[var(--status-warning)]', pending: 'bg-azure-soft text-azure-ink',
  approved: 'bg-leaf-soft text-leaf-ink', partial: 'bg-leaf-soft text-leaf-ink ring-1 ring-leaf/40', rejected: 'bg-secondary text-muted-foreground', unpaid: 'bg-secondary text-muted-foreground',
}
export function OtChip({ state, minutes, className }: { state: OtState; minutes: number; className?: string }) {
  const h = useHM()
  if (state === 'none') return null
  return <span className={cn('num inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium', OT_CLS[state], className)} title={OT_FA[state]}>+{h(minutes)}<span className="hidden sm:inline">{OT_FA[state]}</span></span>
}

/** Submitted → Administrative Manager → CEO → result */
export function RequestStepper({ r }: { r: AdminRequest }) {
  const { userById } = useStore()
  const office = r.steps.find((s) => s.stage === 'office')
  const ceo = r.steps.find((s) => s.stage === 'ceo')
  const skippedOffice = r.steps.some((s) => s.stage === 'system') && !office
  const node = (label: string, state: 'done' | 'now' | 'no' | 'idle' | 'skip', who?: string) => (
    <li className="flex min-w-0 items-center gap-1.5">
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
        state === 'done' ? 'bg-leaf text-white' : state === 'now' ? 'bg-azure text-white' : state === 'no' ? 'bg-destructive text-white' : 'bg-secondary text-muted-foreground')}>
        {state === 'done' ? <Check className="h-3 w-3" /> : state === 'no' ? <X className="h-3 w-3" /> : state === 'now' ? <Clock3 className="h-3 w-3" /> : state === 'skip' ? '–' : ''}
      </span>
      <span className={cn('truncate text-[11.5px]', state === 'now' ? 'font-semibold' : state === 'idle' || state === 'skip' ? 'text-muted-foreground' : '')} title={who}>{label}</span>
    </li>
  )
  const ended = ['withdrawn', 'cancelled'].includes(r.status)
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="مراحل درخواست">
      {node('ثبت', 'done', userById[r.userId]?.name)}
      <span className="h-px w-3 bg-border" aria-hidden="true" />
      {node('مدیر اداری', skippedOffice ? 'skip' : office ? (office.decision === 'approve' ? 'done' : 'no') : r.status === 'pending_office' ? 'now' : ended ? 'idle' : 'idle', office ? userById[office.by]?.name : undefined)}
      <span className="h-px w-3 bg-border" aria-hidden="true" />
      {node('مدیرعامل', ceo ? (ceo.decision === 'approve' ? 'done' : 'no') : r.status === 'pending_ceo' ? 'now' : r.status === 'approved' ? 'done' : 'idle', ceo ? userById[ceo.by]?.name : undefined)}
      <span className="h-px w-3 bg-border" aria-hidden="true" />
      {node(r.status === 'approved' ? 'تأیید نهایی' : r.status === 'rejected' ? 'رد' : r.status === 'withdrawn' ? 'پس گرفته شد' : r.status === 'cancelled' ? 'لغو شد' : 'نتیجه', r.status === 'approved' ? 'done' : r.status === 'rejected' ? 'no' : 'idle')}
    </ol>
  )
}

/** One line per request, for lists and the inbox */
export function RequestRow({ r, onOpen, showUser }: { r: AdminRequest; onOpen: () => void; showUser?: boolean }) {
  const { state, userById } = useStore()
  const { time, digits } = useFmt()
  const holidays = useMemo(() => new Set(state.holidays.map((h) => h.date)), [state.holidays])
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1.5 border-b px-4 py-3 text-start last:border-0 hover:bg-foreground/[0.035]">
      <span className="flex w-full flex-wrap items-center gap-2">
        <span className="num text-[11.5px] text-muted-foreground">#{digits(r.no)}</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium">{KIND_FA[r.kind]}</span>
        {showUser && <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"><Initials user={userById[r.userId]} size={20} />{userById[r.userId]?.name}</span>}
        <span className="min-w-0 flex-1 truncate text-[13px]">{requestSummary(r, holidays)}</span>
        <RequestStatusPill s={r.status} />
      </span>
      <span className="flex w-full flex-wrap items-center justify-between gap-2">
        <RequestStepper r={r} />
        <span className="text-[11px] text-muted-foreground">ثبت {time(r.createdAt)}</span>
      </span>
    </button>
  )
}

// ---------- new request ----------
export interface RequestPreset { kind?: AdminRequestKind; date?: string; minutes?: number; taskIds?: string[] }

export function NewRequestDialog({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: RequestPreset }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="grid-cols-[minmax(0,1fr)] sm:max-w-lg">
        {open && <NewRequestForm preset={preset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function NewRequestForm({ preset, onDone }: { preset?: RequestPreset; onDone: () => void }) {
  const { state, dispatch, me, workItems } = useStore()
  const { digits, n, d } = useFmt()
  const h = useHM()
  const holidays = useMemo(() => new Set(state.holidays.map((x) => x.date)), [state.holidays])
  const [kind, setKind] = useState<AdminRequestKind>(preset?.kind ?? 'leave')
  const [lv, setLv] = useState({ mode: 'day' as 'day' | 'hour', category: 'annual' as LeaveCategory, from: preset?.date, to: preset?.date, start: '14:00', end: '16:00' })
  const [ot, setOt] = useState({ date: preset?.date, h: String(Math.floor((preset?.minutes ?? 60) / 60)), m: String((preset?.minutes ?? 0) % 60), taskIds: preset?.taskIds ?? [] as string[] })
  const [oth, setOth] = useState({ title: '', category: 'certificate' as OtherCategory, date: undefined as string | undefined })
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<NewFile[]>([])
  const cfg = configFor(state.timesheetConfigs, TODAY)
  const otDay = ot.date ? state.timesheets[dayKey(me.id, ot.date)] : undefined
  const otReqs = ot.date ? overtimeIndex(state.adminRequests).get(dayKey(me.id, ot.date)) ?? [] : []
  const minutes = (Number(ot.h) || 0) * 60 + (Number(ot.m) || 0)
  // tasks to pick: the ones logged that day first, then my open tasks
  const taskChoices = useMemo(() => {
    const logged = ot.date ? [...new Set(activeLogs(state.workLogs).filter((l) => l.userId === me.id && l.workDate === ot.date).map((l) => l.taskId))] : []
    const mine = workItems.filter((t) => t.assigneeUserId === me.id && !t.actualFinish).map((t) => t.id)
    const flow = Object.values(state.tasks).filter((t) => (t.kind === 'supervision' || t.kind === 'internal') && t.assigneeUserId === me.id && t.flow !== 'closed').map((t) => t.id)
    return [...new Set([...logged, ...ot.taskIds, ...mine, ...flow])].slice(0, 14).map((id) => state.tasks[id]).filter(Boolean)
  }, [ot.date, ot.taskIds, state.workLogs, state.tasks, workItems, me.id])
  const leaveDays = lv.from ? leaveDates({ mode: lv.mode, from: lv.from, to: lv.mode === 'hour' ? lv.from : lv.to ?? lv.from }, holidays) : []

  const submit = () => {
    let req: NewRequest
    if (kind === 'leave') {
      const leave = { mode: lv.mode, category: lv.category, from: lv.from ?? '', to: lv.mode === 'hour' ? lv.from ?? '' : lv.to ?? lv.from ?? '', ...(lv.mode === 'hour' ? { startTime: lv.start, endTime: lv.end } : {}) }
      const err = checkLeave(leave, { holidays, today: TODAY, cfg, closes: state.monthCloses, existing: state.leaves, pending: state.adminRequests, userId: me.id })
      if (err) { toast.error(err); return }
      req = { kind, description: desc, leave }
    } else if (kind === 'overtime') {
      const err = checkOvertime({ date: ot.date, minutes }, { today: TODAY, closes: state.monthCloses, day: otDay, requests: otReqs })
      if (err) { toast.error(err); return }
      req = { kind, description: desc, overtime: { date: ot.date!, minutes, taskIds: ot.taskIds } }
    } else {
      if (!oth.title.trim()) { toast.error('عنوان درخواست را بنویسید.'); return }
      req = { kind, description: desc, other: { title: oth.title, category: oth.category, date: oth.date } }
    }
    const no = Math.max(0, ...state.adminRequests.map((x) => x.no)) + 1
    dispatch({ type: 'reqCreate', req, files })
    toast.success(`درخواست ${KIND_FA[kind]} #${digits(no)} ثبت شد`, { description: me.role === 'ceo' ? 'درخواست مدیرعامل بدون مرحله‌ی تأیید ثبت شد.' : me.role === 'office' ? 'به کارتابل مدیرعامل رفت.' : 'به کارتابل مدیر اداری رفت.' })
    onDone()
  }

  return (
    <>
      <DialogHeader className="pe-8 text-start">
        <DialogTitle>درخواست اداری تازه</DialogTitle>
        <DialogDescription>اول مدیر اداری بررسی می‌کند و بعد مدیرعامل تصمیم نهایی را می‌گیرد. نتیجه را از همین‌جا و اعلان‌ها پیگیری کنید.</DialogDescription>
      </DialogHeader>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'leave', label: 'مرخصی' }, { value: 'overtime', label: 'اضافه‌کاری' }, { value: 'other', label: 'سایر' }]} />

      {kind === 'leave' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={lv.mode} onChange={(v) => setLv({ ...lv, mode: v })} options={[{ value: 'day', label: 'روزانه' }, { value: 'hour', label: 'ساعتی' }]} />
            <Select value={lv.category} onValueChange={(v) => setLv({ ...lv, category: v as LeaveCategory })}>
              <SelectTrigger id="rq-cat" aria-label="دسته‌ی مرخصی" className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(LEAVE_CAT_FA) as LeaveCategory[]).map((k) => <SelectItem key={k} value={k}>{LEAVE_CAT_FA[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {lv.mode === 'day' ? (
            <>
              <div><Label htmlFor="rq-from" className="eyebrow">از</Label><div className="mt-1"><JalaliDateField id="rq-from" value={lv.from} onChange={(v) => setLv({ ...lv, from: v, to: !lv.to || (v && lv.to < v) ? v : lv.to })} /></div></div>
              <div><Label htmlFor="rq-to" className="eyebrow">تا</Label><div className="mt-1"><JalaliDateField id="rq-to" value={lv.to} onChange={(v) => setLv({ ...lv, to: v })} /></div></div>
            </>
          ) : (
            <>
              <div className="col-span-2"><Label htmlFor="rq-from" className="eyebrow">روز</Label><div className="mt-1"><JalaliDateField id="rq-from" value={lv.from} onChange={(v) => setLv({ ...lv, from: v, to: v })} /></div></div>
              <div><Label htmlFor="rq-start" className="eyebrow">از ساعت</Label><Input id="rq-start" type="time" dir="ltr" className="num mt-1 h-9" value={lv.start} onChange={(e) => setLv({ ...lv, start: e.target.value })} /></div>
              <div><Label htmlFor="rq-end" className="eyebrow">تا ساعت</Label><Input id="rq-end" type="time" dir="ltr" className="num mt-1 h-9" value={lv.end} onChange={(e) => setLv({ ...lv, end: e.target.value })} /></div>
            </>
          )}
          <p className="col-span-2 text-[12px] text-muted-foreground">
            {lv.mode === 'hour' ? (isHM(lv.start) && isHM(lv.end) ? `مدت: ${h(hourLeaveMinutes({ startTime: lv.start, endTime: lv.end }))} — ساعت موظف آن روز همین‌قدر کم می‌شود.` : '')
              : lv.from ? `${n(leaveDays.length)} روز کاری (پنجشنبه، جمعه و تعطیلات شمرده نمی‌شوند).` : 'بازه‌ی مرخصی را انتخاب کنید.'}
          </p>
        </div>
      )}

      {kind === 'overtime' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="rq-ot-date" className="eyebrow">روز</Label><div className="mt-1"><JalaliDateField id="rq-ot-date" value={ot.date} onChange={(v) => setOt({ ...ot, date: v })} /></div></div>
          <div><Label htmlFor="rq-ot-h" className="eyebrow">ساعت</Label><Input id="rq-ot-h" type="number" min={0} max={12} dir="ltr" className="num mt-1 h-9" value={ot.h} onChange={(e) => setOt({ ...ot, h: e.target.value })} /></div>
          <div><Label htmlFor="rq-ot-m" className="eyebrow">دقیقه</Label><Input id="rq-ot-m" type="number" min={0} max={59} step={5} dir="ltr" className="num mt-1 h-9" value={ot.m} onChange={(e) => setOt({ ...ot, m: e.target.value })} /></div>
          <p className="col-span-2 rounded-lg bg-secondary/70 px-3 py-2 text-[12px] leading-relaxed">
            {!ot.date ? 'روز اضافه‌کاری را انتخاب کنید.'
              : otDay?.checkOut ? <>کار خالص {d(ot.date)}: <b className="num">{h(otDay.calc.worked)}</b>، اضافه‌کاری <b className="num">{h(otDay.calc.excess)}</b>، قابل درخواست <b className="num">{h(overtimeAvailable(otDay.calc, otReqs))}</b>.</>
                : <>اضافه‌کاری از پیش. بعد از ثبت تایم‌شیت آن روز، مقدار قابل پرداخت حداکثر به اندازه‌ی اضافه‌کاری واقعی است.</>}
          </p>
          <fieldset className="col-span-2">
            <legend className="eyebrow mb-1">تسک‌های این اضافه‌کاری</legend>
            {taskChoices.length ? (
              <div className="thin-scroll flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                {taskChoices.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                    <Checkbox checked={ot.taskIds.includes(t.id)} onCheckedChange={(v) => setOt({ ...ot, taskIds: v ? [...ot.taskIds, t.id] : ot.taskIds.filter((x) => x !== t.id) })} />
                    <span className="truncate">{t.docNumber ? <span className="mono me-1 text-[11px] text-muted-foreground">{t.docNumber}</span> : null}{t.name}</span>
                  </label>
                ))}
              </div>
            ) : <p className="text-[12px] text-muted-foreground">تسک بازی به شما واگذار نشده است؛ کار انجام‌شده را در توضیحات بنویسید.</p>}
          </fieldset>
        </div>
      )}

      {kind === 'other' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="rq-title" className="eyebrow">عنوان</Label><Input id="rq-title" className="mt-1" value={oth.title} onChange={(e) => setOth({ ...oth, title: e.target.value })} placeholder="مثلاً: گواهی اشتغال به کار" /></div>
          <div><Label htmlFor="rq-ocat" className="eyebrow">دسته</Label>
            <Select value={oth.category} onValueChange={(v) => setOth({ ...oth, category: v as OtherCategory })}>
              <SelectTrigger id="rq-ocat" className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(OTHER_CAT_FA) as OtherCategory[]).map((k) => <SelectItem key={k} value={k}>{OTHER_CAT_FA[k]}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label htmlFor="rq-odate" className="eyebrow">تاریخ (اختیاری)</Label><div className="mt-1"><JalaliDateField id="rq-odate" value={oth.date} onChange={(v) => setOth({ ...oth, date: v })} /></div></div>
        </div>
      )}

      <div><Label htmlFor="rq-desc" className="eyebrow">توضیحات</Label><Textarea id="rq-desc" className="mt-1 min-h-[64px]" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <FilePicker id="rq-files" files={files} onChange={setFiles} label="پیوست (مثلاً گواهی پزشک)" />
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit}><Send className="h-4 w-4" /> ثبت درخواست</Button>
        <Button variant="ghost" onClick={onDone}>انصراف</Button>
      </DialogFooter>
    </>
  )
}

// ---------- request detail ----------
export function RequestDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { state } = useStore()
  const r = id ? state.adminRequests.find((x) => x.id === id) : undefined
  return (
    <Dialog open={!!r} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent dir="rtl" className="thin-scroll max-h-[88vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl">
        {r && <RequestDetail r={r} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="eyebrow">{label}</dt><dd className="mt-0.5 text-[13px]">{children}</dd></div>
}

function RequestDetail({ r, onClose }: { r: AdminRequest; onClose: () => void }) {
  const { state, dispatch, me, can, userById, teamById } = useStore()
  const { d, dLong, time, clock, digits, n } = useFmt()
  const h = useHM()
  const holidays = useMemo(() => new Set(state.holidays.map((x) => x.date)), [state.holidays])
  const [note, setNote] = useState('')
  const officeMinutes = [...r.steps].reverse().find((s) => s.stage === 'office' && s.minutes != null)?.minutes
  const cap = r.overtime ? officeMinutes ?? r.overtime.minutes : 0
  const [mins, setMins] = useState(String(cap))
  const u = userById[r.userId]
  const canDecide = can.decideRequest(r)
  const canWithdraw = r.userId === me.id && isPending(r) && !r.steps.some((s) => s.stage === 'office' || s.stage === 'ceo')
  const canCancel = can.perm('requests.office') && r.kind === 'leave' && r.status === 'approved'
  const day = r.overtime ? state.timesheets[dayKey(r.userId, r.overtime.date)] : undefined
  const dayLogs = r.overtime ? activeLogs(state.workLogs).filter((l) => l.userId === r.userId && l.workDate === r.overtime!.date) : []
  const stageFa = { submit: 'ثبت درخواست', office: 'مدیر اداری', ceo: 'مدیرعامل', withdraw: 'پس گرفتن', cancel: 'لغو', system: 'سامانه' } as const

  const decide = (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !note.trim()) { toast.error('دلیل رد را بنویسید.'); return }
    const m = Number(mins)
    if (decision === 'approve' && r.kind === 'overtime' && (!Number.isInteger(m) || m <= 0 || m > cap)) { toast.error(`مقدار تأییدی باید بین ۱ و ${digits(cap)} دقیقه باشد.`); return }
    dispatch({ type: 'reqDecide', id: r.id, decision, note: note.trim() || undefined, minutes: decision === 'approve' && r.kind === 'overtime' ? m : undefined })
    toast.success(decision === 'reject' ? 'درخواست رد شد' : r.status === 'pending_office' ? 'تأیید شد و به کارتابل مدیرعامل رفت' : 'تأیید نهایی شد')
    onClose()
  }
  return (
    <>
      <DialogHeader className="pe-8 text-start">
        <DialogTitle className="flex flex-wrap items-center gap-2">درخواست {KIND_FA[r.kind]} <span className="num text-muted-foreground">#{digits(r.no)}</span><RequestStatusPill s={r.status} /></DialogTitle>
        <DialogDescription className="flex items-center gap-2"><Initials user={u} size={20} />{u?.name}، {teamById[u?.teamId ?? '']?.name}، ثبت {time(r.createdAt)}</DialogDescription>
      </DialogHeader>
      <RequestStepper r={r} />
      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-background/40 p-3">
        {r.leave && <>
          <Fact label="نوع">{LEAVE_CAT_FA[r.leave.category]}، {r.leave.mode === 'hour' ? 'ساعتی' : 'روزانه'}</Fact>
          <Fact label="زمان">{r.leave.mode === 'hour' ? <span className="num">{d(r.leave.from)} از {digits(r.leave.startTime ?? '')} تا {digits(r.leave.endTime ?? '')}</span> : <span className="num">{d(r.leave.from)} تا {d(r.leave.to)}</span>}</Fact>
          <Fact label="مدت">{r.leave.mode === 'hour' ? h(hourLeaveMinutes(r.leave)) : `${n(leaveDates(r.leave, holidays).length)} روز کاری`}</Fact>
        </>}
        {r.overtime && <>
          <Fact label="روز"><span className="num">{WEEKDAYS[weekdayIndex(r.overtime.date)]} {dLong(r.overtime.date)}</span></Fact>
          <Fact label="مقدار درخواستی"><span className="num">{h(r.overtime.minutes)}</span>{r.overtime.source === 'advance' ? ' (از پیش)' : ''}</Fact>
          {r.overtime.approvedMinutes != null && <Fact label="تأییدشده"><span className="num">{h(r.overtime.approvedMinutes)}</span></Fact>}
          {day?.checkOut && <Fact label="تایم‌شیت آن روز"><span className="num">{digits(day.checkIn ?? '')} تا {digits(day.checkOut)}، کار خالص {h(day.calc.worked)}، اضافه‌کاری {h(day.calc.excess)}</span></Fact>}
        </>}
        {r.other && <>
          <Fact label="عنوان">{r.other.title}</Fact>
          <Fact label="دسته">{OTHER_CAT_FA[r.other.category]}</Fact>
          {r.other.date && <Fact label="تاریخ"><span className="num">{d(r.other.date)}</span></Fact>}
        </>}
        {r.description && <div className="col-span-2"><Fact label="توضیحات"><span className="whitespace-pre-wrap">{r.description}</span></Fact></div>}
      </dl>
      {r.overtime && (r.overtime.taskIds.length > 0 || dayLogs.length > 0) && (
        <section>
          <h3 className="eyebrow mb-1">تسک‌ها و Work Log آن روز</h3>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {[...new Set([...r.overtime.taskIds, ...dayLogs.map((l) => l.taskId)])].map((tid) => {
              const t = state.tasks[tid]
              const m = dayLogs.filter((l) => l.taskId === tid).reduce((s, l) => s + l.minutes, 0)
              return t ? (
                <li key={tid} className="flex items-center gap-2">
                  {r.overtime!.taskIds.includes(tid) ? <Check className="h-3.5 w-3.5 shrink-0 text-leaf" aria-label="انتخاب‌شده در درخواست" /> : <span className="w-3.5 shrink-0" />}
                  <button type="button" className="min-w-0 truncate text-start hover:text-azure" onClick={() => can.viewTask(t) && dispatch({ type: 'openTask', id: t.id })}>{t.name}</button>
                  {m > 0 && <span className="num ms-auto shrink-0 text-muted-foreground">Work Log {h(m)}</span>}
                </li>
              ) : null
            })}
          </ul>
        </section>
      )}
      {r.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">{r.files.map((f) => <li key={f.id}><a href={f.dataUrl} download={f.name} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] hover:bg-accent"><FileText className="h-3.5 w-3.5" />{f.name}<span className="num text-muted-foreground">{digits(fmtSize(f.size))}</span></a></li>)}</ul>
      )}
      <section>
        <h3 className="eyebrow mb-1.5">سابقه</h3>
        <ol className="flex flex-col gap-2 border-s ps-3">
          {r.steps.map((s, i) => (
            <li key={i} className="relative text-[12.5px]">
              <span className={cn('absolute -start-[17px] top-1 h-2 w-2 rounded-full', s.decision === 'reject' ? 'bg-destructive' : s.decision === 'approve' ? 'bg-leaf' : 'bg-foreground/40')} />
              <span className="font-medium">{stageFa[s.stage]}</span>
              {s.decision && <span className={cn('ms-1.5', s.decision === 'reject' ? 'text-destructive' : 'text-leaf-ink')}>{s.decision === 'approve' ? 'تأیید' : 'رد'}</span>}
              {s.minutes != null && <span className="num ms-1.5">({h(s.minutes)})</span>}
              <span className="ms-1.5 text-muted-foreground">{s.by === 'system' ? 'سامانه' : userById[s.by]?.name}، <span className="num">{d(s.at.slice(0, 10))} ساعت {clock(s.at)}</span></span>
              {s.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{s.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      {canDecide && (
        <section className="rounded-xl border border-azure/30 bg-azure-soft/30 p-3">
          <h3 className="mb-2 text-[13px] font-semibold">{r.status === 'pending_office' ? 'بررسی مدیر اداری' : 'تصمیم نهایی مدیرعامل'}</h3>
          {r.kind === 'overtime' && (
            <div className="mb-2 flex items-center gap-2">
              <Label htmlFor="rq-dec-min" className="text-[12.5px]">مقدار تأییدی (دقیقه)</Label>
              <Input id="rq-dec-min" type="number" min={1} max={cap} dir="ltr" className="num h-8 w-24" value={mins} onChange={(e) => setMins(e.target.value)} />
              <span className="num text-[12px] text-muted-foreground">حداکثر {h(cap)}؛ باقی‌مانده بدون پرداخت می‌شود</span>
            </div>
          )}
          <Textarea id="rq-dec-note" aria-label="توضیح تصمیم" className="min-h-[56px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح (برای رد الزامی است)" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => decide('approve')}><Check className="h-4 w-4" /> {r.status === 'pending_office' ? 'تأیید و ارجاع به مدیرعامل' : 'تأیید نهایی'}</Button>
            <Button variant="outline" className="text-destructive" onClick={() => decide('reject')}><X className="h-4 w-4" /> رد</Button>
          </div>
        </section>
      )}
      {(canWithdraw || canCancel) && (
        <DialogFooter className="gap-2 sm:justify-start">
          {canWithdraw && <Button variant="outline" onClick={() => { dispatch({ type: 'reqWithdraw', id: r.id }); toast.success('درخواست پس گرفته شد'); onClose() }}><Undo2 className="h-4 w-4" /> پس گرفتن درخواست</Button>}
          {canCancel && <CancelLeave r={r} onDone={onClose} />}
        </DialogFooter>
      )}
    </>
  )
}

function CancelLeave({ r, onDone }: { r: AdminRequest; onDone: () => void }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  if (!open) return <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}><CircleSlash className="h-4 w-4" /> لغو مرخصی</Button>
  return (
    <div className="flex w-full flex-col gap-2">
      <Textarea aria-label="دلیل لغو" value={note} onChange={(e) => setNote(e.target.value)} placeholder="دلیل لغو مرخصی تأییدشده" className="min-h-[56px]" />
      <div className="flex gap-2">
        <Button variant="destructive" onClick={() => { if (!note.trim()) { toast.error('دلیل لغو را بنویسید.'); return } dispatch({ type: 'reqCancel', id: r.id, note }); toast.success('مرخصی لغو شد'); onDone() }}>لغو مرخصی</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button>
      </div>
    </div>
  )
}

// ---------- timesheet day ----------
export function DayDialog({ userId, date, onClose, onRequest }: { userId: string; date: string | null; onClose: () => void; onRequest: (p: RequestPreset) => void }) {
  return (
    <Dialog open={!!date} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent dir="rtl" className="thin-scroll max-h-[88vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl">
        {date && <DayDetail key={`${userId}|${date}`} userId={userId} date={date} onClose={onClose} onRequest={onRequest} />}
      </DialogContent>
    </Dialog>
  )
}

/** Why this person cannot edit this day (null = can edit) */
export function dayLock(state: ReturnType<typeof useStore>['state'], meId: string, canEditAll: boolean, userId: string, date: string): string | null {
  if (date > TODAY) return 'روز آینده'
  if (isMonthClosed(state.monthCloses, date)) return 'ماه این روز بسته شده است.'
  if (userId !== meId) return canEditAll ? null : 'فقط مدیر اداری تایم‌شیت دیگران را اصلاح می‌کند.'
  const cfg = configFor(state.timesheetConfigs, date)
  if (diffDays(TODAY, date) > cfg.editDays) return `فقط ${cfg.editDays} روز گذشته قابل ثبت است؛ برای این روز به مدیر اداری بگویید.`
  const reqs = overtimeIndex(state.adminRequests).get(dayKey(userId, date)) ?? []
  if (reqs.some((r) => isPending(r) || r.status === 'approved')) return 'اضافه‌کاری این روز در جریان یا تأییدشده است؛ روز قفل است.'
  return null
}

function Figure({ label, v, tone }: { label: string; v: number; tone?: string }) {
  const h = useHM()
  return <div className="rounded-lg bg-background/50 px-2.5 py-1.5"><div className="text-[11px] text-muted-foreground">{label}</div><div className={cn('num text-[14px] font-semibold', tone)}>{h(v)}</div></div>
}

function DayDetail({ userId, date, onClose, onRequest }: { userId: string; date: string; onClose: () => void; onRequest: (p: RequestPreset) => void }) {
  const { state, dispatch, me, can, userById } = useStore()
  const { dLong, d, digits, clock, n } = useFmt()
  const h = useHM()
  const holidays = useMemo(() => new Set(state.holidays.map((x) => x.date)), [state.holidays])
  const day: TimesheetDay | undefined = state.timesheets[dayKey(userId, date)]
  const cfg = configFor(state.timesheetConfigs, date)
  const off = isOffDay(date, holidays)
  const holiday = state.holidays.find((x) => x.date === date)
  const leaves = state.leaves.filter((l) => l.userId === userId && l.date === date)
  const reqs = state.adminRequests.filter((r) => r.userId === userId && ((r.overtime?.date === date) || (r.leave && leaveDates(r.leave, holidays).includes(date))))
  const otReqs = reqs.filter((r) => r.kind === 'overtime')
  const logs = activeLogs(state.workLogs).filter((l) => l.userId === userId && l.workDate === date)
  const logTotal = logs.reduce((s, l) => s + l.minutes, 0)
  const self = userId === me.id
  const lock = dayLock(state, me.id, can.perm('timesheet.edit.all'), userId, date)
  const closed = isMonthClosed(state.monthCloses, date)
  const [f, setF] = useState({ in: day?.checkIn ?? '', out: day?.checkOut ?? '', br: String(day?.breakMinutes ?? (off ? 0 : cfg.minBreakMinutes)), note: day?.note ?? '', reason: '' })
  const [showHist, setShowHist] = useState(false)
  const st = day ? otState(day.calc, otReqs) : 'none'
  const presence = presenceOf(f.in || undefined, f.out || undefined)

  const save = () => {
    const br = Number(f.br)
    if (f.in && !isHM(f.in)) { toast.error('ساعت ورود نامعتبر است.'); return }
    if (f.out && !isHM(f.out)) { toast.error('ساعت خروج نامعتبر است.'); return }
    if (!f.in && f.out) { toast.error('اول ساعت ورود را وارد کنید.'); return }
    if (!Number.isInteger(br) || br < 0 || (f.out && br >= presence)) { toast.error('مدت استراحت نامعتبر است.'); return }
    if (!self && !f.reason.trim()) { toast.error('دلیل اصلاح را بنویسید.'); return }
    dispatch({ type: 'tsSave', userId, date, checkIn: f.in || undefined, checkOut: f.out || undefined, breakMinutes: br, note: f.note, reason: self ? undefined : f.reason })
    toast.success('تایم‌شیت ذخیره شد')
  }
  return (
    <>
      <DialogHeader className="pe-8 text-start">
        <DialogTitle className="num">{WEEKDAYS[weekdayIndex(date)]} {dLong(date)}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          {!self && <span>{userById[userId]?.name}</span>}
          <span className={cn('rounded px-1.5 py-0.5 text-[11px]', off ? 'bg-secondary' : 'bg-azure-soft text-azure-ink')}>{holiday ? `تعطیل: ${holiday.title}` : off ? 'پنجشنبه / جمعه (بدون ساعت موظف)' : `روز کاری؛ موظف ${h(day?.calc.duty ?? Math.max(0, cfg.dutyNetMinutes - Math.round(leaves.reduce((s, l) => s + l.hours, 0) * 60)))} کار خالص`}</span>
          {leaves.map((l) => <span key={l.id} className="rounded bg-leaf-soft px-1.5 py-0.5 text-[11px] text-leaf-ink">{l.hours >= 8 ? 'مرخصی روزانه' : `مرخصی ${h(Math.round(l.hours * 60))}`}</span>)}
          {closed && <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px]"><Lock className="h-3 w-3" /> ماه بسته</span>}
        </DialogDescription>
      </DialogHeader>

      {day && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Figure label="حضور" v={day.calc.presence} />
          <Figure label="استراحت" v={day.calc.breakMinutes} />
          <Figure label="کار خالص" v={day.calc.worked} />
          <Figure label="موظف" v={day.calc.duty} />
          <Figure label="اضافه‌کاری" v={day.calc.excess} tone={day.calc.excess ? 'text-azure-ink' : undefined} />
          <Figure label="کسر کارکرد" v={day.calc.deficit} tone={day.calc.deficit ? 'text-destructive' : undefined} />
        </div>
      )}
      {day && day.calc.excess > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-[12px]">
          <OtChip state={st} minutes={day.calc.excess} />
          <span>درخواستی: <b className="num">{h(day.calc.requested)}</b></span>
          <span>تأییدشده: <b className="num">{h(day.calc.approved)}</b></span>
          <span>در انتظار: <b className="num">{h(day.calc.pending)}</b></span>
          <span>بدون پرداخت: <b className="num">{h(day.calc.unpaid)}</b></span>
          {day.calc.undecided > 0 && <span>بدون تعیین تکلیف: <b className="num">{h(day.calc.undecided)}</b></span>}
        </div>
      )}
      {self && day && day.calc.undecided > 0 && !closed && (
        <section className="rounded-xl p-3 ring-1 ring-[var(--status-warning)]" style={{ background: 'color-mix(in srgb, var(--status-warning) 12%, transparent)' }}>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold"><AlertTriangle className="h-4 w-4" style={{ color: 'var(--status-warning)' }} /> {h(day.calc.undecided)} اضافه‌کاری این روز تعیین تکلیف نشده است</p>
          <p className="mt-1 text-[12px] text-muted-foreground">اگر درخواست نکنید، با بستن ماه بدون پرداخت ثبت می‌شود.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onRequest({ kind: 'overtime', date, minutes: overtimeAvailable(day.calc, otReqs), taskIds: [...new Set(logs.map((l) => l.taskId))] })}>درخواست اضافه‌کاری</Button>
            <Button size="sm" variant="outline" onClick={() => { dispatch({ type: 'tsUnpaid', date }); toast.success('بدون پرداخت ثبت شد') }}>بدون پرداخت بماند</Button>
          </div>
        </section>
      )}

      {!lock ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><Label htmlFor="ts-in" className="eyebrow">ورود</Label><Input id="ts-in" type="time" dir="ltr" className="num mt-1 h-9" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></div>
          <div><Label htmlFor="ts-out" className="eyebrow">خروج</Label><Input id="ts-out" type="time" dir="ltr" className="num mt-1 h-9" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></div>
          <div><Label htmlFor="ts-break" className="eyebrow">استراحت (دقیقه)</Label><Input id="ts-break" type="number" min={0} step={5} dir="ltr" className="num mt-1 h-9" value={f.br} onChange={(e) => setF({ ...f, br: e.target.value })} /></div>
          <div className="flex items-end text-[11.5px] leading-snug text-muted-foreground">{off ? 'روز تعطیل: استراحت همان مقدار واردشده' : `دست‌کم ${digits(cfg.minBreakMinutes)} دقیقه کسر می‌شود`}</div>
          <div className="col-span-2 sm:col-span-4"><Label htmlFor="ts-note" className="eyebrow">توضیح روز</Label><Input id="ts-note" className="mt-1 h-9" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          {!self && <div className="col-span-2 sm:col-span-4"><Label htmlFor="ts-reason" className="eyebrow">دلیل اصلاح (الزامی)</Label><Input id="ts-reason" className="mt-1 h-9" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>}
          <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
            <Button onClick={save}>ذخیره</Button>
            {f.in && f.out && <span className="num text-[12px] text-muted-foreground">حضور {h(presence)}</span>}
          </div>
        </section>
      ) : day ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {digits(day.checkIn ?? '—')} تا {digits(day.checkOut ?? '—')}، استراحت {n(day.breakMinutes)} دقیقه{day.note ? `، ${day.note}` : ''} — {lock}</p>
      ) : <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Lock className="h-3.5 w-3.5" /> برای این روز چیزی ثبت نشده است. {lock}</p>}

      {(logs.length > 0 || (day?.checkOut && logTotal > (day?.calc.worked ?? 0))) && (
        <section>
          <h3 className="eyebrow mb-1">Work Log این روز <span className="num">({h(logTotal)})</span></h3>
          {day?.checkOut && logTotal > day.calc.worked && <p className="mb-1 flex items-center gap-1.5 text-[12px] text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> جمع Work Log از کار خالص تایم‌شیت بیشتر است.</p>}
          {leaves.some((l) => l.hours >= 8) && logs.length > 0 && <p className="mb-1 flex items-center gap-1.5 text-[12px] text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> این روز مرخصی کامل است ولی Work Log دارد.</p>}
          <ul className="flex flex-col gap-0.5 text-[12.5px]">
            {logs.map((l) => { const t = state.tasks[l.taskId]; return <li key={l.id} className="flex items-center gap-2"><button type="button" className="min-w-0 truncate text-start hover:text-azure" onClick={() => t && can.viewTask(t) && dispatch({ type: 'openTask', id: t.id })}>{t?.name}</button><span className="num ms-auto shrink-0 text-muted-foreground">{h(l.minutes)}</span></li> })}
          </ul>
        </section>
      )}
      {reqs.length > 0 && (
        <section>
          <h3 className="eyebrow mb-1">درخواست‌های این روز</h3>
          <ul className="flex flex-col gap-1 text-[12.5px]">{reqs.map((r) => <li key={r.id} className="flex items-center gap-2"><span className="num text-muted-foreground">#{digits(r.no)}</span>{KIND_FA[r.kind]}{r.overtime && <span className="num">{h(r.overtime.minutes)}</span>}<RequestStatusPill s={r.status} className="ms-auto" /></li>)}</ul>
        </section>
      )}
      {self && !off && !closed && !leaves.length && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => onRequest({ kind: 'leave', date })}>درخواست مرخصی برای این روز</Button>
      )}
      {day && day.revisions.length > 0 && (
        <section>
          <button type="button" className="eyebrow inline-flex items-center gap-1 hover:text-foreground" onClick={() => setShowHist(!showHist)} aria-expanded={showHist}><History className="h-3.5 w-3.5" /> سابقه‌ی تغییرات ({digits(day.revisions.length)})</button>
          {showHist && (
            <ul className="mt-1 flex flex-col gap-1 text-[12px] text-muted-foreground">
              {[...day.revisions].reverse().map((v, i) => <li key={i} className="num">{d(v.at.slice(0, 10))} {clock(v.at)}، {userById[v.by]?.name}: {digits(v.checkIn ?? '—')} تا {digits(v.checkOut ?? '—')}، استراحت {digits(v.breakMinutes)}{v.reason ? ` — اصلاح بعدی: ${v.reason}` : ''}</li>)}
            </ul>
          )}
        </section>
      )}
      <DialogFooter className="sm:justify-start"><Button variant="ghost" onClick={onClose}>بستن</Button></DialogFooter>
    </>
  )
}
