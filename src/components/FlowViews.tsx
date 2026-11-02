import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownUp, ClipboardCheck, Download, FileText, Inbox, LayoutGrid, List, MapPin, MessageSquareReply, Paperclip, Plus, Rows3, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FIN_SPACE_FA, FLOW_FA, FLOW_ORDER, finProjectId, finSpaceOf, flowOf, flowProgress, projectTeams, useFmt, useStore, type NewFile } from '@/lib/store'
import type { FinSpace } from '@/lib/domain'
import { TODAY } from '@/lib/seed'
import { addDays, startOfWeek } from '@/lib/jalali'
import { canSeeFinSpace } from '@/lib/policy'
import { L, LU } from '@/lib/taskFields'
import type { Attachment, FlowState, Priority, Task, TaskType, User } from '@/lib/types'
import { Empty, Initials, JalaliDateField, ProgressRing, Segmented } from './common'

export const PRIORITY_FA: Record<Priority, string> = { low: 'کم', normal: 'عادی', high: 'زیاد', urgent: 'فوری' }
export const PRIORITY_RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 }
export const TYPE_FA: Record<TaskType, string> = {
  design: 'طراحی', documentation: 'نقشه و مستندسازی', coordination: 'هماهنگی', modeling: 'مدل‌سازی BIM', render: 'رندر',
  presentation: 'ارائه', research: 'پژوهش', supervision: 'نظارت', admin: 'اداری و کنترل', other: 'سایر',
}
export const MAX_FILE_MB = 3

export function PriorityChip({ p, className }: { p?: Priority; className?: string }) {
  const v = p ?? 'normal'
  if (v === 'normal') return null
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-semibold leading-5',
      v === 'urgent' ? 'bg-destructive text-white' : v === 'high' ? 'bg-danger-soft text-destructive' : 'bg-secondary text-muted-foreground', className)}>
      {PRIORITY_FA[v]}
    </span>
  )
}

const FLOW_CLS: Record<FlowState, { pill: string; dot: string }> = {
  open: { pill: 'border-border bg-background/70 text-muted-foreground', dot: 'bg-muted-foreground/50' },
  assigned: { pill: 'border-azure/30 bg-background/70 text-foreground', dot: 'bg-azure/60' },
  in_progress: { pill: 'border-transparent bg-azure-soft text-azure-ink', dot: 'bg-azure' },
  in_review: { pill: 'border-transparent bg-azure text-white', dot: 'bg-white' },
  rework: { pill: 'border-transparent bg-danger-soft text-destructive', dot: 'bg-destructive' },
  closed: { pill: 'border-transparent bg-leaf-soft text-leaf-ink', dot: 'bg-leaf' },
}
export function FlowPill({ state, className }: { state: FlowState; className?: string }) {
  const c = FLOW_CLS[state]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5', c.pill, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />{FLOW_FA[state]}
    </span>
  )
}

/** Due date that turns red when it has passed and the task is still open */
export function DueText({ due, done, className }: { due?: string; done?: boolean; className?: string }) {
  const { d } = useFmt()
  if (!due) return <span className={cn('text-muted-foreground', className)}>—</span>
  const late = !done && due < TODAY
  return <span className={cn('num', late && 'font-semibold text-destructive', className)} title={late ? 'گذشته از موعد' : undefined}>{d(due)}</span>
}

// ---------- files ----------
export async function readFiles(list: FileList | File[] | null): Promise<NewFile[]> {
  const out: NewFile[] = []
  for (const f of Array.from(list ?? [])) {
    if (f.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`«${f.name}» بزرگ‌تر از ${MAX_FILE_MB} مگابایت است.`); continue }
    const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) })
    out.push({ name: f.name, mime: f.type || 'application/octet-stream', size: f.size, dataUrl })
  }
  return out
}
export function fmtSize(b: number) { return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB` }

/** Pick files and keep them until the form is submitted */
export function FilePicker({ id, files, onChange, label = 'پیوست فایل' }: { id: string; files: NewFile[]; onChange: (f: NewFile[]) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const { digits } = useFmt()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input ref={ref} id={id} type="file" multiple className="sr-only" tabIndex={-1} aria-label={label} onChange={async (e) => { const f = await readFiles(e.target.files); onChange([...files, ...f]); e.target.value = '' }} />
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => ref.current?.click()}><Paperclip className="h-3.5 w-3.5" /> {label}</Button>
      {files.map((f, i) => (
        <span key={i} className="inline-flex max-w-[220px] items-center gap-1 rounded-full border bg-background/60 py-0.5 pe-1 ps-2 text-[11.5px]">
          <span className="truncate">{f.name}</span><span className="num shrink-0 text-muted-foreground">{digits(fmtSize(f.size))}</span>
          <button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`حذف ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      {!files.length && <span className="text-[11.5px] text-muted-foreground">تا {digits(MAX_FILE_MB)} مگابایت برای هر فایل</span>}
    </div>
  )
}

export function AttachmentList({ items, empty }: { items: Attachment[]; empty?: string }) {
  const { userById } = useStore()
  const { time, digits } = useFmt()
  if (!items.length) return empty ? <p className="text-[12px] text-muted-foreground">{empty}</p> : null
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((f) => (
        <li key={f.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border bg-background/45 p-1.5">
          {f.mime.startsWith('image/')
            ? <a href={f.dataUrl} target="_blank" rel="noreferrer" className="shrink-0"><img src={f.dataUrl} alt={f.name} className="h-12 w-16 rounded-lg border object-cover" /></a>
            : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border bg-secondary"><FileText className="h-5 w-5 text-muted-foreground" /></span>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium" title={f.name}>{f.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{userById[f.uploadedBy]?.name}، {time(f.uploadedAt)}، <span className="num">{digits(fmtSize(f.size))}</span></div>
          </div>
          <a href={f.dataUrl} download={f.name} className="key key-ghost inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-label={`دانلود ${f.name}`}><Download className="h-4 w-4" /></a>
        </li>
      ))}
    </ul>
  )
}

// ---------- people ----------
export function UserSelect({ id, value, onChange, users, placeholder = 'انتخاب کنید', noneLabel, disabled, grouped }: {
  id: string; value?: string; onChange: (id?: string) => void; users: User[]; placeholder?: string; noneLabel?: string; disabled?: boolean; grouped?: boolean
}) {
  const { teamById } = useStore()
  const groups = useMemo(() => {
    if (!grouped) return [{ key: '', label: '', list: users }]
    const m = new Map<string, User[]>()
    for (const u of users) (m.get(u.teamId) ?? m.set(u.teamId, []).get(u.teamId)!).push(u)
    return [...m.entries()].map(([k, list]) => ({ key: k, label: teamById[k]?.name ?? '', list }))
  }, [users, grouped, teamById])
  return (
    <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? undefined : v)} disabled={disabled}>
      <SelectTrigger id={id} className="mt-1 h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-80">
        {noneLabel && <SelectItem value="none">{noneLabel}</SelectItem>}
        {groups.map((g) => (
          <SelectGroup key={g.key}>
            {g.label && <SelectLabel className="text-[11px] text-muted-foreground">{g.label}</SelectLabel>}
            {g.list.map((u) => <SelectItem key={u.id} value={u.id}><span className="inline-flex items-center gap-2"><Initials user={u} size={20} />{u.name}</span></SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---------- cards, board and list ----------
function FlowCard({ t, showProject }: { t: Task; showProject?: boolean }) {
  const { dispatch, userById, projectById, state, teamById } = useStore()
  const { n } = useFmt()
  const f = flowOf(t)
  const rounds = state.reviewRounds.filter((r) => r.taskId === t.id).length
  const files = state.attachments.filter((a) => a.taskId === t.id).length
  const ip = t.internalProjectId ? state.internalProjects.find((p) => p.id === t.internalProjectId) : undefined
  const u = t.assigneeUserId ? userById[t.assigneeUserId] : undefined
  return (
    <button onClick={() => dispatch({ type: 'openTask', id: t.id })} className="glass-item flex w-full flex-col gap-1.5 rounded-xl p-2.5 text-start text-[12.5px] transition-transform active:scale-[0.99]">
      <div className="flex items-start gap-1.5">
        <ProgressRing value={flowProgress(t)} size={16} stroke={2.5} label={false} className="mt-0.5" />
        <span className="min-w-0 flex-1 font-medium leading-5">{t.name}</span>
        <PriorityChip p={t.priority} className="mt-0.5" />
      </div>
      {showProject && t.kind === 'supervision' && <span className="truncate text-[11px] text-muted-foreground"><span className="mono text-[10.5px]">{projectById[t.projectId]?.code}</span> {projectById[t.projectId]?.name}</span>}
      {showProject && t.kind === 'internal' && <span className="truncate text-[11px] text-muted-foreground">تیم {teamById[t.teamSpaceId ?? '']?.name}</span>}
      {t.location && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{t.location}</span></span>}
      {ip && <span className="truncate text-[11px] text-muted-foreground">{ip.name}</span>}
      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
        {u ? <><Initials user={u} size={18} /><span className="truncate">{u.name}</span></> : <span>بدون {L('assignee')}</span>}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {rounds > 0 && <span className="num inline-flex items-center gap-0.5" title="دورهای بررسی"><MessageSquareReply className="h-3 w-3" />{n(rounds)}</span>}
        {files > 0 && <span className="num inline-flex items-center gap-0.5" title="پیوست‌ها"><Paperclip className="h-3 w-3" />{n(files)}</span>}
        <DueText due={t.due} done={f === 'closed'} className="ms-auto" />
      </div>
    </button>
  )
}

export function FlowBoard({ tasks, showProject }: { tasks: Task[]; showProject?: boolean }) {
  const { n } = useFmt()
  return (
    <div className="scroll-x thin-scroll -mx-1 px-1 pb-1">
      <div className="grid min-w-[940px] grid-cols-6 gap-2">
        {FLOW_ORDER.map((f) => {
          const list = tasks.filter((t) => flowOf(t) === f).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
          return (
            <section key={f} className="glass-well flex min-h-[160px] flex-col gap-2 p-2" aria-label={FLOW_FA[f]}>
              <header className="flex items-center justify-between px-1 pt-0.5">
                <FlowPill state={f} />
                <span className="num text-[11.5px] text-muted-foreground">{n(list.length)}</span>
              </header>
              {list.map((t) => <FlowCard key={t.id} t={t} showProject={showProject} />)}
            </section>
          )
        })}
      </div>
    </div>
  )
}

type FlowSort = 'order' | 'name' | 'priority' | 'assignee' | 'est' | 'start' | 'due' | 'status'
type SortState<K> = { k: K; dir: 1 | -1 }
/** Sortable column header: first click ascending, second descending */
export function SortTh<K extends string>({ k, children, sort, setSort, className }: { k: K; children: ReactNode; sort: SortState<K>; setSort: (f: (x: SortState<K>) => SortState<K>) => void; className?: string }) {
  return (
    <th className={cn('whitespace-nowrap px-3 py-2 text-start font-medium', className)} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((x) => ({ k, dir: x.k === k ? (x.dir === 1 ? -1 : 1) : 1 }))}>
        {children}<ArrowDownUp className={cn('h-3 w-3', sort.k === k ? 'text-azure' : 'opacity-40')} />
      </button>
    </th>
  )
}
/**
 * Table of flow tasks (supervision, team, finance & admin). Columns follow the field groups of the task page:
 * A title and priority → B people → C schedule → D status and progress. Every column header sorts.
 */
export function FlowList({ tasks, showProject, nested, estimation = true }: { tasks: Task[]; showProject?: boolean; nested?: boolean; estimation?: boolean }) {
  const { dispatch, userById, projectById, teamById } = useStore()
  const { n, pct } = useFmt()
  const [sort, setSort] = useState<SortState<FlowSort>>({ k: 'order', dir: 1 })
  const val = (t: Task): string | number => {
    switch (sort.k) {
      case 'name': return t.name
      case 'priority': return PRIORITY_RANK[t.priority ?? 'normal']
      case 'assignee': return t.assigneeUserId ? userById[t.assigneeUserId]?.name ?? '' : '\uffff'
      case 'est': return t.estimation ?? -1
      case 'start': return t.start ?? '9999'
      case 'due': return t.due ?? '9999'
      case 'status': return FLOW_ORDER.indexOf(flowOf(t)) * 1000 + flowProgress(t)
      default: return t.order
    }
  }
  const cmp = (a: Task, b: Task) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fa')) * sort.dir }
  const ids = new Set(tasks.map((t) => t.id))
  const roots = (nested ? tasks.filter((t) => !t.parentId || !ids.has(t.parentId)) : tasks).slice().sort(cmp)
  const kids = (id: string) => (nested ? tasks.filter((t) => t.parentId === id).sort(cmp) : [])
  const where = (t: Task) => showProject && t.kind === 'supervision' ? projectById[t.projectId]?.code : showProject && t.kind === 'internal' ? `تیم ${teamById[t.teamSpaceId ?? '']?.name ?? ''}` : ''
  const row = (t: Task, depth: number): React.ReactNode[] => {
    const sub = [where(t), t.location].filter(Boolean).join('، ')
    const f = flowOf(t)
    return [
      <tr key={t.id} className="cursor-pointer border-b last:border-0 hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5" style={{ paddingInlineStart: depth * 18 }}>
            {depth > 0 && <span className="text-muted-foreground">↳</span>}
            <ProgressRing value={flowProgress(t)} size={18} stroke={2.5} label={false} />
            <span className="font-medium">{t.name}</span>
          </div>
          {sub && <div className="text-[11px] text-muted-foreground" style={{ paddingInlineStart: depth * 18 + 24 }}>{sub}</div>}
        </td>
        <td className="px-3 py-2">{(t.priority ?? 'normal') === 'normal' ? <span className="text-[12px] text-muted-foreground">{PRIORITY_FA.normal}</span> : <PriorityChip p={t.priority} />}</td>
        <td className="px-3 py-2">{t.assigneeUserId ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Initials user={userById[t.assigneeUserId]} size={20} />{userById[t.assigneeUserId]?.name}</span> : <span className="text-muted-foreground">—</span>}</td>
        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.reviewerId ? userById[t.reviewerId]?.name : '—'}</td>
        {estimation && <td className="num px-3 py-2 text-muted-foreground">{t.estimation ? n(t.estimation) : '—'}</td>}
        <td className="px-3 py-2"><DueText due={t.start} done /></td>
        <td className="px-3 py-2"><DueText due={t.due} done={f === 'closed'} /></td>
        <td className="whitespace-nowrap px-3 py-2"><FlowPill state={f} /> <span className="num ms-1 text-[11px] text-muted-foreground">{pct(flowProgress(t))}</span></td>
      </tr>,
      ...kids(t.id).flatMap((c) => row(c, depth + 1)),
    ]
  }
  return (
    <div className="scroll-x thin-scroll glass-card">
      <table className="w-full min-w-[860px] text-[13px]">
        <thead className="border-b bg-foreground/[0.03] text-[11.5px] text-muted-foreground">
          <tr>
            <SortTh k="name" sort={sort} setSort={setSort}>{L('name')}</SortTh>
            <SortTh k="priority" sort={sort} setSort={setSort}>{L('priority')}</SortTh>
            <SortTh k="assignee" sort={sort} setSort={setSort}>{L('assignee')}</SortTh>
            <th className="px-3 py-2 text-start font-medium">{L('reviewer')}</th>
            {estimation && <SortTh k="est" sort={sort} setSort={setSort}>{L('estimation')}</SortTh>}
            <SortTh k="start" sort={sort} setSort={setSort}>{L('start')}</SortTh>
            <SortTh k="due" sort={sort} setSort={setSort}>{L('due')}</SortTh>
            <SortTh k="status" sort={sort} setSort={setSort}>{L('status')}</SortTh>
          </tr>
        </thead>
        <tbody>{roots.flatMap((t) => row(t, 0))}</tbody>
      </table>
    </div>
  )
}

// ---------- filters (assignee, status, priority, due) ----------
const ALLF = '__all'
export type FlowFilter = { q: string; assignee: string; status: string; priority: string; due: string; team: string }
const EMPTY_FILTER: FlowFilter = { q: '', assignee: ALLF, status: ALLF, priority: ALLF, due: ALLF, team: ALLF }
function Pick({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className={cn('h-8 w-auto min-w-[112px] max-w-[200px] gap-1 text-[12.5px]', value !== ALLF && 'border-azure/60 bg-azure-soft text-azure-ink')}>
        <span className="text-muted-foreground">{label}:</span><SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72"><SelectItem value={ALLF}>همه</SelectItem>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  )
}
/** Shared filter bar of flow-task lists; the same filtered rows feed every view of the page (list, board, calendar) */
export function useFlowFilters(tasks: Task[], idPrefix: string, opts: { team?: boolean } = {}) {
  const { userById, teamById } = useStore()
  const [f, setF] = useState<FlowFilter>(EMPTY_FILTER)
  const set = (k: keyof FlowFilter) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const people = useMemo(() => [...new Set(tasks.map((t) => t.assigneeUserId).filter(Boolean) as string[])].map((id) => ({ value: id, label: userById[id]?.name ?? id })).sort((a, b) => a.label.localeCompare(b.label, 'fa')), [tasks, userById])
  const teams = useMemo(() => [...new Set(tasks.map((t) => t.teamSpaceId).filter(Boolean) as string[])].map((id) => ({ value: id, label: teamById[id]?.name ?? id })), [tasks, teamById])
  const filtered = useMemo(() => {
    const qq = f.q.trim().toLowerCase()
    const w0 = startOfWeek(TODAY)
    return tasks.filter((t) => {
      const fl = flowOf(t)
      if (qq && !(t.name.toLowerCase().includes(qq) || (t.description ?? '').toLowerCase().includes(qq))) return false
      if (f.assignee === 'none' ? !!t.assigneeUserId : f.assignee !== ALLF && t.assigneeUserId !== f.assignee) return false
      if (f.status === 'open_all' ? fl === 'closed' : f.status !== ALLF && fl !== f.status) return false
      if (f.priority !== ALLF && (t.priority ?? 'normal') !== f.priority) return false
      if (f.team !== ALLF && t.teamSpaceId !== f.team) return false
      if (f.due === 'overdue' && !(t.due && t.due < TODAY && fl !== 'closed')) return false
      if (f.due === 'week' && !(t.due && t.due >= w0 && t.due <= addDays(w0, 6))) return false
      if (f.due === 'next2' && !(t.due && t.due >= TODAY && t.due <= addDays(TODAY, 14))) return false
      if (f.due === 'none' && t.due) return false
      return true
    })
  }, [tasks, f])
  const active = (Object.keys(f) as (keyof FlowFilter)[]).filter((k) => (k === 'q' ? !!f.q : f[k] !== ALLF)).length
  const bar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input id={`${idPrefix}-q`} value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="جستجو در عنوان و شرح" className="h-8 w-[200px] ps-8 text-[12.5px]" />
      </div>
      {opts.team && teams.length > 1 && <Pick id={`${idPrefix}-f-team`} label="تیم" value={f.team} onChange={set('team')} options={teams} />}
      <Pick id={`${idPrefix}-f-priority`} label={L('priority')} value={f.priority} onChange={set('priority')} options={(['urgent', 'high', 'normal', 'low'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_FA[p] }))} />
      <Pick id={`${idPrefix}-f-assignee`} label={L('assignee')} value={f.assignee} onChange={set('assignee')} options={[...people, { value: 'none', label: `بدون ${L('assignee')}` }]} />
      <Pick id={`${idPrefix}-f-due`} label={L('due')} value={f.due} onChange={set('due')} options={[{ value: 'overdue', label: 'گذشته از موعد' }, { value: 'week', label: 'این هفته' }, { value: 'next2', label: 'دو هفته‌ی آینده' }, { value: 'none', label: `بدون ${L('due')}` }]} />
      <Pick id={`${idPrefix}-f-status`} label={L('status')} value={f.status} onChange={set('status')} options={[{ value: 'open_all', label: 'همه‌ی باز' }, ...FLOW_ORDER.map((x) => ({ value: x, label: FLOW_FA[x] }))]} />
      {active > 0 && <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setF(EMPTY_FILTER)}><X className="h-3.5 w-3.5" /> پاک کردن فیلترها</button>}
    </div>
  )
  return { filtered, bar, active, filter: f, setFilter: setF }
}

// ---------- create ----------
export type FlowKind = 'supervision' | 'internal' | 'finadmin'
export function CreateFlowTaskDialog({ kind, open, onOpenChange, projectId, teamId, internalProjectId, parentId, finSpace = 'finance' }: {
  kind: FlowKind; open: boolean; onOpenChange: (o: boolean) => void
  projectId?: string; teamId?: string; internalProjectId?: string; parentId?: string
  /** finadmin: the space the task is created in */
  finSpace?: FinSpace
}) {
  const { state, dispatch, me, activeUsers, can, teamById } = useStore()
  const sup = kind === 'supervision'
  const fin = kind === 'finadmin'
  const ceo = activeUsers.find((u) => u.role === 'ceo')
  const projects = state.projects.filter((p) => can.viewSupervision(p.id))
  const defaultReviewer = sup ? me.id : fin ? ceo?.id : undefined
  const [f, setF] = useState({ name: '', description: '', location: '', priority: 'normal' as Priority, type: (sup ? 'supervision' : 'design') as TaskType, assignee: undefined as string | undefined, reviewer: defaultReviewer, est: '', start: undefined as string | undefined, due: undefined as string | undefined, project: projectId ?? '', ip: internalProjectId ?? 'none' })
  const [files, setFiles] = useState<NewFile[]>([])
  const proj = state.projects.find((p) => p.id === (projectId ?? f.project))
  // people of the space the task belongs to: project teams, the owning team, or the three roles of the finance & admin space
  const pool = sup ? (proj ? activeUsers.filter((u) => projectTeams(proj).includes(u.teamId)) : []) : fin ? activeUsers.filter((u) => canSeeFinSpace(u, finSpace)) : activeUsers.filter((u) => u.teamId === teamId)
  const executors = pool.filter((u) => u.id !== f.reviewer)
  const reviewers = sup ? activeUsers.filter((u) => u.role === 'inspector' || u.role === 'ceo') : pool
  const parent = parentId ? state.tasks[parentId] : undefined
  const outsider = kind === 'internal' && me.teamId !== teamId
  const reset = () => { setF((x) => ({ ...x, name: '', description: '', location: '', assignee: undefined, reviewer: defaultReviewer, est: '', start: undefined, due: undefined })); setFiles([]) }
  const pickAssignee = (v?: string) => setF((x) => ({ ...x, assignee: v, reviewer: fin && v && v === x.reviewer ? undefined : fin && !v ? defaultReviewer : x.reviewer }))
  const submit = () => {
    if (!f.name.trim()) { toast.error('عنوان را وارد کنید.'); return }
    if (sup && !proj) { toast.error('پروژه را انتخاب کنید.'); return }
    if (sup && !f.due) { toast.error('برای مورد نظارتی Due Date لازم است.'); return }
    if (f.assignee && f.assignee === f.reviewer) { toast.error('مسئول و Reviewer نمی‌توانند یک نفر باشند.'); return }
    if (f.start && f.due && f.due < f.start) { toast.error('Due Date نمی‌تواند قبل از Start باشد.'); return }
    const id = `${sup ? 'SUP' : fin ? 'FA' : 'IN'}-${Date.now().toString(36).toUpperCase()}`
    const task: Task = {
      id, kind, name: f.name.trim(), source: 'manual', order: Date.now() / 1e6, parentId: parentId ?? null,
      projectId: sup ? proj!.id : fin ? finProjectId(finSpace) : `team:${teamId}`, description: f.description.trim() || undefined, priority: f.priority, type: fin ? 'admin' : f.type,
      assigneeUserId: f.assignee, reviewerId: f.reviewer, estimation: fin ? undefined : Number(f.est) || undefined, start: f.start, due: f.due,
      ...(sup ? { location: f.location.trim() || undefined } : fin ? {} : { teamSpaceId: teamId, internalProjectId: parent?.internalProjectId ?? (f.ip === 'none' ? undefined : f.ip) }),
    }
    dispatch({ type: 'createFlowTask', task, files })
    onOpenChange(false); reset()
    toast.success(sup ? 'مورد نظارتی ثبت شد' : fin ? `Task در ${FIN_SPACE_FA[finSpace]} ثبت شد` : 'تسک تیم ساخته شد', { description: f.assignee ? `${L('assignee')} اعلان گرفت.` : 'بعداً از صفحه‌ی تسک ارجاع دهید.' })
  }
  const pre = sup ? 'sup' : fin ? 'fa' : 'in'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pe-8 text-start">
          <DialogTitle>{sup ? 'ثبت مورد نظارتی' : fin ? `Task تازه — ${FIN_SPACE_FA[finSpace]}` : parent ? `زیرتسک «${parent.name}»` : `تسک تازه‌ی تیم ${teamById[teamId ?? '']?.name ?? ''}`}</DialogTitle>
          <DialogDescription>{sup ? 'مورد را با محل، عکس و موعد ثبت و به کارشناس ارجاع دهید. بعد از ارسال کار، شما (Reviewer) تأیید یا برای اصلاح برمی‌گردانید.'
            : fin ? `فقط ${finSpace === 'finance' ? 'مدیرعامل و مدیر مالی' : 'مدیرعامل و مدیر اداری'} این Task را می‌بینند. Reviewer پیش‌فرض مدیرعامل است.`
              : outsider ? `این تسک در فضای تیم ${teamById[teamId ?? '']?.name} ثبت می‌شود و به همین تیم تعلق دارد؛ مسئول و Reviewer از اعضای همین تیم انتخاب می‌شوند.` : 'تسک داخلی تیم؛ در Progress و گزارش پروژه‌ها حساب نمی‌شود.'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* A — identity and classification */}
          {sup && !projectId && (
            <div className="sm:col-span-2">
              <Label htmlFor={`${pre}-project`} className="eyebrow">{L('project')}</Label>
              <Select value={f.project ?? ''} onValueChange={(v) => setF({ ...f, project: v, assignee: undefined })}>
                <SelectTrigger id={`${pre}-project`} className="mt-1 h-9"><SelectValue placeholder="انتخاب پروژه" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2"><Label htmlFor={`${pre}-name`} className="eyebrow">{L('name')}</Label><Input id={`${pre}-name`} className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={sup ? 'مثلاً: ترک دیوار لابی همکف' : fin ? (finSpace === 'finance' ? 'مثلاً: تسویه‌ی فاکتور مشاور' : 'مثلاً: تمدید قرارداد بیمه‌ی دفتر') : 'مثلاً: به‌روزرسانی قالب شیت‌ها'} /></div>
          <div className="sm:col-span-2"><Label htmlFor={`${pre}-desc`} className="eyebrow">{L('description')}</Label><Textarea id={`${pre}-desc`} className="mt-1 min-h-[72px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          {sup && <div className="sm:col-span-2"><Label htmlFor={`${pre}-loc`} className="eyebrow">{L('location')}</Label><Input id={`${pre}-loc`} className="mt-1" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="طبقه، محور، فضا" /></div>}
          {kind === 'internal' && !parent && (
            <div>
              <Label htmlFor={`${pre}-ip`} className="eyebrow">{L('internalProjectId')}</Label>
              <Select value={f.ip} onValueChange={(v) => setF({ ...f, ip: v })}>
                <SelectTrigger id={`${pre}-ip`} className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">بدون پروژه‌ی داخلی</SelectItem>{state.internalProjects.filter((p) => p.teamId === teamId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {kind === 'internal' && (
            <div>
              <Label htmlFor={`${pre}-type`} className="eyebrow">{L('type')}</Label>
              <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as TaskType })}>
                <SelectTrigger id={`${pre}-type`} className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TYPE_FA) as TaskType[]).map((k) => <SelectItem key={k} value={k}>{TYPE_FA[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor={`${pre}-prio`} className="eyebrow">{L('priority')}</Label>
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v as Priority })}>
              <SelectTrigger id={`${pre}-prio`} className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(PRIORITY_FA) as Priority[]).map((k) => <SelectItem key={k} value={k}>{PRIORITY_FA[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {/* B — people */}
          <div className={cn(kind !== 'internal' && 'sm:col-start-1')}><Label htmlFor={`${pre}-assignee`} className="eyebrow">{L('assignee')}</Label><UserSelect id={`${pre}-assignee`} value={f.assignee} onChange={pickAssignee} users={executors} noneLabel="بعداً ارجاع می‌دهم" grouped={sup} disabled={sup && !proj} /></div>
          <div><Label htmlFor={`${pre}-reviewer`} className="eyebrow">{L('reviewer')}</Label><UserSelect id={`${pre}-reviewer`} value={f.reviewer} onChange={(v) => setF({ ...f, reviewer: v })} users={reviewers.filter((u) => u.id !== f.assignee)} noneLabel={sup ? undefined : `بدون بررسی (${L('assignee')} می‌بندد)`} /></div>
          {/* C — schedule and effort */}
          {!fin && <div><Label htmlFor={`${pre}-est`} className="eyebrow">{LU('estimation')}</Label><Input id={`${pre}-est`} type="number" min={0} step={0.5} inputMode="decimal" className="num mt-1 h-9" value={f.est} onChange={(e) => setF({ ...f, est: e.target.value })} /></div>}
          <div className={cn(fin && 'sm:col-start-1')}><Label htmlFor={`${pre}-start`} className="eyebrow">{L('start')}</Label><div className="mt-1"><JalaliDateField id={`${pre}-start`} value={f.start} onChange={(v) => setF({ ...f, start: v })} /></div></div>
          <div><Label htmlFor={`${pre}-due`} className="eyebrow">{L('due')}</Label><div className="mt-1"><JalaliDateField id={`${pre}-due`} value={f.due} onChange={(v) => setF({ ...f, due: v })} /></div></div>
          <div className="sm:col-span-2"><Label htmlFor={`${pre}-files`} className="eyebrow">پیوست ({fin ? 'قرارداد، فاکتور، PDF' : 'عکس، نقشه، PDF'})</Label><div className="mt-1"><FilePicker id={`${pre}-files`} files={files} onChange={setFiles} /></div></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={submit}>{sup ? 'ثبت و ارجاع' : fin ? 'ثبت Task' : 'ساخت تسک'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- project tab ----------
export function SupervisionPanel({ projectId, showProject }: { projectId?: string; showProject?: boolean }) {
  const { state, can } = useStore()
  const { n } = useFmt()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [open, setOpen] = useState(false)
  const tasks = useMemo(() => Object.values(state.tasks).filter((t) => t.kind === 'supervision' && (!projectId || t.projectId === projectId) && can.viewTask(t)), [state.tasks, projectId, can])
  const count = (f: FlowState) => tasks.filter((t) => flowOf(t) === f).length
  const late = tasks.filter((t) => flowOf(t) !== 'closed' && t.due && t.due < TODAY).length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="rounded-full border bg-background/60 px-2 py-0.5">باز <b className="num">{n(tasks.length - count('closed'))}</b></span>
          <span className="rounded-full bg-azure px-2 py-0.5 text-white">در انتظار بررسی <b className="num">{n(count('in_review'))}</b></span>
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-destructive">برگشتی <b className="num">{n(count('rework'))}</b></span>
          {late > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-white">گذشته از موعد <b className="num">{n(late)}</b></span>}
          <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-leaf-ink">بسته‌شده <b className="num">{n(count('closed'))}</b></span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'board', label: 'تخته', icon: <LayoutGrid className="h-3.5 w-3.5" /> }, { value: 'list', label: 'فهرست', icon: <List className="h-3.5 w-3.5" /> }]} />
          {can.perm('supervision.create') && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> ثبت مورد نظارتی</Button>}
        </div>
      </div>
      {tasks.length === 0 ? <Empty icon={<ClipboardCheck className="h-6 w-6" />} title="مورد نظارتی ثبت نشده" hint="ناظران تیم نظارت و اجرا موارد کارگاهی را با عکس و محل ثبت و به کارشناس ارجاع می‌دهند." />
        : view === 'board' ? <FlowBoard tasks={tasks} showProject={showProject} /> : <FlowList tasks={tasks} showProject={showProject} />}
      <CreateFlowTaskDialog kind="supervision" open={open} onOpenChange={setOpen} projectId={projectId} />
    </div>
  )
}

// ---------- home ----------
export function MyFlowWork() {
  const { state, me, dispatch, projectById, teamById, can } = useStore()
  const { n } = useFmt()
  const todo = Object.values(state.tasks).filter((t) => (t.kind === 'supervision' || t.kind === 'internal' || t.kind === 'finadmin') && can.viewTask(t) && t.assigneeUserId === me.id && flowOf(t) !== 'closed' && flowOf(t) !== 'in_review')
  const review = Object.values(state.tasks).filter((t) => t.flow === 'in_review' && t.reviewerId === me.id && can.viewTask(t))
  if (!todo.length && !review.length) return null
  const where = (t: Task) => t.kind === 'supervision' ? `نظارت، ${projectById[t.projectId]?.code}` : t.kind === 'internal' ? `فضای تیم ${teamById[t.teamSpaceId ?? '']?.name}` : t.kind === 'finadmin' ? FIN_SPACE_FA[finSpaceOf(t) ?? 'finance'] : projectById[t.projectId]?.code
  const Row = ({ t }: { t: Task }) => (
    <li>
      <button className="flex w-full items-center gap-2 px-3 py-2 text-start text-[13px] hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
        <FlowPill state={flowOf(t)} />
        <span className="min-w-0 flex-1 truncate">{t.name}</span>
        <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:inline">{where(t)}</span>
        <DueText due={t.due} className="shrink-0 text-[12px]" />
      </button>
    </li>
  )
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {[{ title: 'نظارت، کارهای تیم و مالی-اداری، منتظر اقدام من', list: todo, icon: <Rows3 className="h-4 w-4 text-azure" /> }, { title: 'منتظر بررسی من', list: review, icon: <ClipboardCheck className="h-4 w-4 text-azure" /> }].map((b) => (
        <div key={b.title} className="overflow-hidden glass-card">
          <header className="flex items-center gap-2 border-b px-4 py-2.5 font-semibold">{b.icon}{b.title}<span className="num ms-auto text-[12px] font-normal text-muted-foreground">{n(b.list.length)}</span></header>
          {b.list.length ? <ul className="divide-y">{b.list.map((t) => <Row key={t.id} t={t} />)}</ul>
            : <div className="flex items-center gap-2 px-4 py-5 text-[12.5px] text-muted-foreground"><Inbox className="h-4 w-4" /> موردی نیست.</div>}
        </div>
      ))}
    </section>
  )
}
