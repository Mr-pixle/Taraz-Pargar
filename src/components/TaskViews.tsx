import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDownUp, CalendarDays, ChartGantt, ChevronDown, ChevronLeft, ChevronRight, Columns3, GripVertical, List, ListTree, Lock, Search, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { effectiveScope, isWorkItem, statusOf, useFmt, useStore } from '@/lib/store'
import type { Task } from '@/lib/types'
import { TODAY } from '@/lib/seed'
import { J_MONTHS, WEEKDAYS, WEEKDAYS_SHORT, addDays, addJMonths, fromJalali, isWeekend, jMonthLength, startOfJMonth, startOfWeek, toJalali, weekdayIndex } from '@/lib/jalali'
import { Assignee, Empty, ProgressRing, Segmented, StatusPill } from './common'
import { L } from '@/lib/taskFields'
import { GanttView } from './GanttView'
import type { GanttInput } from '@/lib/gantt'

export type ViewKind = 'kanban' | 'list' | 'tree' | 'calendar' | 'gantt'

const ALL = '__all'

function FilterSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className={cn('h-8 w-auto min-w-[112px] max-w-[190px] gap-1 text-[12.5px]', value !== ALL && 'border-azure/60 bg-azure-soft text-azure-ink')}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={ALL}>همه</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function TaskViews({ tasks, idPrefix, defaultView = 'list', hideProject, hideTeam, treeDepth = 2, extraToolbar, ganttExtras }: {
  tasks: Task[]; idPrefix: string; defaultView?: ViewKind; hideProject?: boolean; hideTeam?: boolean; treeDepth?: number; extraToolbar?: ReactNode
  /** extra group shown only in the Gantt view (supervision items of the project) */
  ganttExtras?: GanttInput['extras']
}) {
  const store = useStore()
  const { state, userById, teamById, projectById, teamOf } = store
  const fmt = useFmt()
  const [view, setView] = useState<ViewKind>(defaultView)
  const [q, setQ] = useState('')
  const [f, setF] = useState({ assignee: ALL, due: ALL, status: ALL, project: ALL, team: ALL, pkg: ALL, floor: ALL })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  // a manual subtask is classified like its document (Package and Floor), everywhere it is listed or filtered
  const parentOf = (t: Task) => (t.kind === 'manual' && t.parentId ? state.tasks[t.parentId] : undefined)
  const pkgOf = (t: Task) => t.pkg ?? parentOf(t)?.pkg
  const floorOf = (t: Task) => { const x = t.floor ?? parentOf(t)?.floor; return x && x !== '—' ? x : undefined }

  const opts = useMemo(() => {
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])]
    return {
      assignee: uniq(tasks.map((t) => t.assigneeUserId)).map((id) => ({ value: id, label: userById[id]?.name ?? id })).sort((a, b) => a.label.localeCompare(b.label, 'fa')),
      status: uniq(tasks.map((t) => statusOf(state, t)?.name)).map((n) => ({ value: n, label: n })),
      project: uniq(tasks.map((t) => t.projectId)).map((id) => ({ value: id, label: projectById[id]?.name ?? id })),
      team: uniq(tasks.map((t) => teamOf(t) ?? undefined)).map((id) => ({ value: id, label: teamById[id]?.name ?? id })),
      pkg: uniq(tasks.map((t) => pkgOf(t))).sort().map((p) => ({ value: p, label: p })),
      floor: uniq(tasks.map((t) => floorOf(t))).map((x) => ({ value: x, label: x })),
    }
  }, [tasks, state, userById, teamById, projectById, teamOf])

  const filtered = useMemo(() => {
    const week0 = startOfWeek(TODAY)
    const qq = q.trim().toLowerCase()
    return tasks.filter((t) => {
      const s = statusOf(state, t)
      if (qq && !(t.name.toLowerCase().includes(qq) || t.docNumber?.toLowerCase().includes(qq))) return false
      if (f.assignee !== ALL && t.assigneeUserId !== f.assignee) return false
      if (f.status !== ALL && s?.name !== f.status) return false
      if (f.project !== ALL && t.projectId !== f.project) return false
      if (f.team !== ALL && teamOf(t) !== f.team) return false
      if (f.pkg !== ALL && pkgOf(t) !== f.pkg) return false
      if (f.floor !== ALL && floorOf(t) !== f.floor) return false
      if (f.due === 'overdue' && !(t.due && t.due < TODAY && s?.category !== 'done')) return false
      if (f.due === 'week' && !(t.due && t.due >= week0 && t.due <= addDays(week0, 6))) return false
      if (f.due === 'next2' && !(t.due && t.due >= TODAY && t.due <= addDays(TODAY, 14))) return false
      if (f.due === 'none' && t.due) return false
      if (f.due === 'unassigned' && (t.assigneeUserId || t.assigneeTeamId)) return false
      return true
    })
  }, [tasks, q, f, state, teamOf])

  const active = Object.values(f).filter((v) => v !== ALL).length + (q ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented compact value={view} onChange={setView} options={[
          { value: 'kanban', label: 'Kanban', icon: <Columns3 className="h-3.5 w-3.5" /> },
          { value: 'list', label: 'لیست', icon: <List className="h-3.5 w-3.5" /> },
          { value: 'tree', label: 'درختی', icon: <ListTree className="h-3.5 w-3.5" /> },
          { value: 'calendar', label: 'تقویم', icon: <CalendarDays className="h-3.5 w-3.5" /> },
          { value: 'gantt', label: 'Gantt', icon: <ChartGantt className="h-3.5 w-3.5" /> },
        ]} />
        <div className="flex items-center gap-2">
          {extraToolbar}
          <span className="num text-xs text-muted-foreground">{fmt.n(filtered.length)} تسک</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input id={`${idPrefix}-q`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در نام یا شماره‌ی سند" className="h-8 w-[210px] ps-8 text-[12.5px]" />
        </div>
        {/* same order as the field groups of the task page: A identity → B people → C schedule → D status */}
        {!hideProject && opts.project.length > 1 && <FilterSelect id={`${idPrefix}-f-project`} label={L('project')} value={f.project} onChange={set('project')} options={opts.project} />}
        <FilterSelect id={`${idPrefix}-f-pkg`} label={L('pkg')} value={f.pkg} onChange={set('pkg')} options={opts.pkg} />
        <FilterSelect id={`${idPrefix}-f-floor`} label={L('floor')} value={f.floor} onChange={set('floor')} options={opts.floor} />
        <FilterSelect id={`${idPrefix}-f-assignee`} label={L('assignee')} value={f.assignee} onChange={set('assignee')} options={opts.assignee} />
        {!hideTeam && opts.team.length > 1 && <FilterSelect id={`${idPrefix}-f-team`} label={L('team')} value={f.team} onChange={set('team')} options={opts.team} />}
        <FilterSelect id={`${idPrefix}-f-due`} label={L('due')} value={f.due} onChange={set('due')} options={[
          { value: 'overdue', label: 'گذشته از موعد' }, { value: 'week', label: 'این هفته' }, { value: 'next2', label: 'دو هفته‌ی آینده' }, { value: 'none', label: `بدون ${L('due')}` }, { value: 'unassigned', label: 'بدون تخصیص' },
        ]} />
        <FilterSelect id={`${idPrefix}-f-status`} label={L('status')} value={f.status} onChange={set('status')} options={opts.status} />
        {active > 0 && (
          <button className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => { setQ(''); setF({ assignee: ALL, due: ALL, status: ALL, project: ALL, team: ALL, pkg: ALL, floor: ALL }) }}>
            <X className="h-3.5 w-3.5" /> پاک کردن فیلترها
          </button>
        )}
      </div>
      {filtered.length === 0 && !(view === 'gantt' && ganttExtras?.tasks.length) ? (
        tasks.length === 0
          ? <Empty title="هنوز تسکی اینجا نیست" hint="تسک‌های پروژه با Sync از MDR همان پروژه (پس از تأیید در صف Sync Review) یا به‌صورت تسک دستی وارد می‌شوند." />
          : <Empty title="تسکی با این فیلترها پیدا نشد" hint="فیلترها را کم کنید یا تب دیگری را باز کنید." />
      ) : view === 'gantt' ? <GanttView tasks={filtered} extras={ganttExtras && { ...ganttExtras, tasks: ganttExtras.tasks.filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())) }} />
        : view === 'list' ? <ListView tasks={filtered} hideProject={hideProject} />
        : view === 'kanban' ? <KanbanView tasks={filtered} />
          : view === 'tree' ? <TreeView tasks={filtered} depth={treeDepth} />
            : <CalendarView tasks={filtered} idPrefix={idPrefix} />}
    </div>
  )
}

// ---------------- List ----------------
type SortKey = 'order' | 'due' | 'name' | 'status' | 'est'
export function ListView({ tasks, hideProject }: { tasks: Task[]; hideProject?: boolean }) {
  const { state, dispatch, projectById } = useStore()
  // a manual subtask is classified like its document (same as section A of the task page)
  const parentOf = (t: Task) => (t.kind === 'manual' && t.parentId ? state.tasks[t.parentId] : undefined)
  const pkgOf = (t: Task) => t.pkg ?? parentOf(t)?.pkg
  const floorOf = (t: Task) => { const f = t.floor ?? parentOf(t)?.floor; return f && f !== '—' ? f : undefined }
  const { d, n, pct } = useFmt()
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'order', dir: 1 })
  const [limit, setLimit] = useState(120)
  const rows = useMemo(() => {
    const val = (t: Task) => {
      if (sort.k === 'due') return t.due ?? '9999'
      if (sort.k === 'name') return t.name
      if (sort.k === 'status') return statusOf(state, t)?.progress ?? 0
      if (sort.k === 'est') return t.estimation ?? -1
      return t.order
    }
    return [...tasks].sort((a, b) => {
      const x = val(a), y = val(b)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fa')) * sort.dir
    })
  }, [tasks, sort, state])
  const Th = ({ k, children, className }: { k?: SortKey; children: ReactNode; className?: string }) => (
    <th className={cn('whitespace-nowrap px-3 py-2 text-start text-[11.5px] font-medium text-muted-foreground', className)}>
      {k ? (
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
          {children}<ArrowDownUp className={cn('h-3 w-3', sort.k === k ? 'text-azure' : 'opacity-40')} />
        </button>
      ) : children}
    </th>
  )
  return (
    <div className="scroll-x thin-scroll glass-card">
      <table className="w-full min-w-[920px] border-collapse text-[13px]">
        <thead className="border-b bg-foreground/[0.03]">
          {/* columns follow the field groups: A identity → B people → C schedule → D status */}
          <tr>
            <Th k="name">سند / تسک</Th>
            {!hideProject && <Th>{L('project')}</Th>}
            <Th>{L('pkg')}</Th>
            <Th>{L('floor')}</Th>
            <Th>{L('assignee')}</Th>
            <Th k="est" className="text-end">{L('estimation')}</Th>
            <Th>{L('start')}</Th>
            <Th k="due">{L('due')}</Th>
            <Th k="status">{L('status')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((t) => {
            const s = statusOf(state, t)
            const overdue = t.due && t.due < TODAY && s?.category !== 'done'
            return (
              <tr key={t.id} className="cursor-pointer border-b last:border-0 hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
                <td className="max-w-[340px] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ProgressRing value={s?.progress ?? 0} size={18} stroke={2.5} label={false} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                        {t.docNumber ? <span className="mono">{t.docNumber}</span> : <span>دستی</span>}
                        {t.removedFromMdr && <span className="rounded bg-danger-soft px-1 text-destructive">Removed from MDR</span>}
                      </div>
                    </div>
                  </div>
                </td>
                {!hideProject && <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{projectById[t.projectId]?.name}</td>}
                <td className="px-3 py-2 text-[12px] text-muted-foreground"><span className="mono">{pkgOf(t) ?? '—'}</span></td>
                <td className="px-3 py-2 text-[12px] text-muted-foreground"><span className="mono">{floorOf(t) ?? '—'}</span></td>
                <td className="max-w-[160px] px-3 py-2"><Assignee task={t} /></td>
                <td className="num px-3 py-2 text-end">{t.estimation ? n(t.estimation) : '—'}</td>
                <td className="num whitespace-nowrap px-3 py-2 text-muted-foreground">{d(t.start)}</td>
                <td className={cn('num whitespace-nowrap px-3 py-2', overdue && 'font-semibold text-destructive')}>{d(t.due)}</td>
                <td className="whitespace-nowrap px-3 py-2"><StatusPill status={s} /> <span className="num ms-1 text-[11px] text-muted-foreground">{pct(s?.progress ?? 0)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="border-t p-2 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 200)}>نمایش {n(Math.min(200, rows.length - limit))} ردیف دیگر</Button>
        </div>
      )}
    </div>
  )
}

// ---------------- Kanban ----------------
function scopeLabel(store: ReturnType<typeof useStore>, scope: string) {
  if (scope === 'office') return 'پیش‌فرض دفتر'
  const p = store.projectById[scope]
  if (p) return `${p.name} (سطح پروژه)`
  const t = store.state.tasks[scope]
  return t ? `${store.projectById[t.projectId]?.name} › ${t.name}` : scope
}

export function KanbanView({ tasks }: { tasks: Task[] }) {
  const store = useStore()
  const { state, dispatch, can } = store
  const { n, d } = useFmt()
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      const k = effectiveScope(state, t)
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [tasks, state])
  const [scopeSel, setScopeSel] = useState<string | null>(null)
  const scope = scopeSel && groups.find((g) => g[0] === scopeSel) ? scopeSel : groups[0]?.[0]
  const list = groups.find((g) => g[0] === scope)?.[1] ?? []
  const statuses = state.statusSets[scope ?? 'office'] ?? []
  const [over, setOver] = useState<string | null>(null)
  const hidden = tasks.length - list.length
  return (
    <div className="flex flex-col gap-2">
      {groups.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted-foreground">Status Set:</span>
          <Select value={scope} onValueChange={setScopeSel}>
            <SelectTrigger id="kanban-scope" className="h-8 w-auto min-w-[200px] text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {groups.map(([k, l]) => <SelectItem key={k} value={k}>{scopeLabel(store, k)} — {n(l.length)} تسک</SelectItem>)}
            </SelectContent>
          </Select>
          {hidden > 0 && <span className="text-muted-foreground">{n(hidden)} تسک با Status Set دیگر در این تخته نیستند.</span>}
        </div>
      )}
      <div className="scroll-x thin-scroll -mx-1 px-1 pb-2">
        <div className="flex gap-3" style={{ minWidth: statuses.length * 252 }}>
          {statuses.map((s) => {
            const col = list.filter((t) => (statusOf(state, t)?.id ?? statuses[0].id) === s.id)
            return (
              <div key={s.id}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id) }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault(); setOver(null)
                  const id = e.dataTransfer.getData('text/plain')
                  const t = state.tasks[id]
                  if (t && can.editStatus(t)) dispatch({ type: 'setStatus', taskId: id, statusId: s.id })
                }}
                className={cn('glass-well flex w-[248px] shrink-0 flex-col transition-[background-color,box-shadow] duration-150', over === s.id && 'border-azure bg-azure-soft')}>
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <StatusPill status={s} />
                  <span className="num flex items-center gap-2 text-xs"><span className="font-semibold">{n(col.length)}</span><span className="text-muted-foreground">{n(s.progress)}٪</span></span>
                </div>
                <div className="flex max-h-[560px] min-h-[120px] flex-col gap-2 overflow-y-auto p-2 thin-scroll">
                  {col.slice(0, 60).map((t) => {
                    const editable = can.editStatus(t)
                    const overdue = t.due && t.due < TODAY && s.category !== 'done'
                    return (
                      <div key={t.id} draggable={editable}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
                        onClick={() => dispatch({ type: 'openTask', id: t.id })}
                        className={cn('glass-item is-interactive group cursor-pointer p-3 text-[12.5px] hover:border-foreground/30', editable && 'active:cursor-grabbing')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 font-medium leading-snug">{t.name}</div>
                          {editable ? <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" /> : <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-label="فقط مسئول یا تیم مسئول می‌تواند Status را تغییر دهد" />}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {t.docNumber ? <span className="mono truncate">{t.docNumber}</span> : <span>تسک دستی</span>}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Assignee task={t} compact />
                          <div className="flex shrink-0 items-center gap-2 text-[11px]">
                            {t.estimation ? <span className="num text-muted-foreground">{n(t.estimation)}h</span> : null}
                            <span className={cn('num', overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{t.due ? d(t.due).slice(5) : '—'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {col.length > 60 && <div className="py-1 text-center text-[11px] text-muted-foreground">و {n(col.length - 60)} تسک دیگر — از فیلترها استفاده کنید</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">کارت را بکشید و در ستون Status جدید رها کنید. روی موبایل، کارت را باز کنید و Status را از فهرست انتخاب کنید.</p>
    </div>
  )
}

// ---------------- Tree ----------------
const KIND_LABEL: Record<string, string> = { project: 'پروژه', phase: 'Phase', stage: 'Stage', group: 'Group', doctype: 'Doc Type', document: 'Document', manual: 'دستی' }

export function TreeView({ tasks, depth = 2 }: { tasks: Task[]; depth?: number }) {
  const store = useStore()
  const { state, dispatch, kids, roll } = store
  const { n, d } = useFmt()
  // keep only the branches that lead to the filtered work items
  const visible = useMemo(() => {
    const v = new Set<string>()
    for (const t of tasks) {
      v.add(t.id)
      let p = t.parentId ? state.tasks[t.parentId] : undefined
      while (p) { v.add(p.id); p = p.parentId ? state.tasks[p.parentId] : undefined }
      v.add(`root:${t.projectId}`)
    }
    return v
  }, [tasks, state.tasks])
  const projects = state.projects.filter((p) => visible.has(`root:${p.id}`))
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (id: string, level: number) => open[id] ?? level < depth
  const toggle = (id: string, level: number) => setOpen((o) => ({ ...o, [id]: !isOpen(id, level) }))

  const Row = ({ t, level }: { t: Task; level: number }) => {
    const ch = (kids[t.id] ?? []).filter((c) => visible.has(c.id))
    const r = roll[t.id]
    const work = isWorkItem(t)
    const s = work ? statusOf(state, t) : undefined
    const opened = isOpen(t.id, level)
    return (
      <>
        <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-2 py-1.5 hover:bg-foreground/[0.035] sm:grid-cols-[minmax(0,1fr)_110px_150px_120px]', t.removedFromMdr && 'opacity-60')}>
          <div className="flex min-w-0 items-center gap-1.5" style={{ paddingInlineStart: level * 18 }}>
            {ch.length ? (
              <button className="rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => toggle(t.id, level)} aria-label={opened ? 'بستن' : 'باز کردن'}>
                {opened ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-[18px]" />}
            <ProgressRing value={r?.progress ?? 0} size={18} stroke={2.5} label={false} />
            <button className="min-w-0 truncate text-start hover:text-azure" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
              <span className={cn(work ? 'font-normal' : 'font-semibold', t.kind === 'phase' && 'text-[13.5px]')}>{t.name}</span>
            </button>
            <span className="hidden shrink-0 rounded border px-1 text-[10px] text-muted-foreground md:inline">{KIND_LABEL[t.kind]}</span>
            {t.docNumber && <span className="mono hidden shrink-0 text-[11px] text-muted-foreground lg:inline">{t.docNumber}</span>}
            {t.weight != null && !work && <span className="num hidden shrink-0 text-[11px] text-muted-foreground xl:inline">وزن {n(t.weight, 1)}</span>}
          </div>
          <div className="num hidden text-[12px] text-muted-foreground sm:block">{(r?.est ?? 0) > 0 ? `${n(r.est)} نفر-ساعت` : '—'}</div>
          <div className="num text-[12px] text-muted-foreground">{r?.start || r?.due ? `${d(r.start)} ← ${d(r.due)}` : <span className="text-[11px]">{work ? <Assignee task={t} /> : '—'}</span>}</div>
          <div className="hidden sm:block">{work ? <StatusPill status={s} /> : <span className="num text-[12px] text-muted-foreground">{n(r?.done ?? 0)}/{n(r?.items ?? 0)} صادر</span>}</div>
        </div>
        {opened && ch.map((c) => <Row key={c.id} t={c} level={level + 1} />)}
      </>
    )
  }

  return (
    <div className="overflow-hidden glass-card">
      <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px_120px] gap-3 border-b bg-foreground/[0.03] px-2 py-2 text-[11.5px] font-medium text-muted-foreground sm:grid">
        <div>بخش‌های MDR (Parent/Child)</div><div>{L('estimation')}</div><div>بازه‌ی زمانی</div><div>{L('status')} / صادرشده</div>
      </div>
      {projects.map((p) => {
        const roots = (kids[`root:${p.id}`] ?? []).filter((c) => visible.has(c.id))
        const id = `root:${p.id}`
        const opened = isOpen(id, 0)
        const phases = roots.filter((x) => x.kind === 'phase')
        const wsum = phases.reduce((s, x) => s + (x.weight ?? 1), 0)
        const prog = wsum ? phases.reduce((s, x) => s + (x.weight ?? 1) * (roll[x.id]?.progress ?? 0), 0) / wsum : 0
        return (
          <div key={p.id}>
            <div className="flex items-center gap-2 border-b bg-foreground/[0.025] px-2 py-2">
              <button className="rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => toggle(id, 0)} aria-label="باز/بسته">
                {opened ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <ProgressRing value={prog} size={22} stroke={3} label={false} />
              <button className="font-bold hover:text-azure hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'project', projectId: p.id } })}>{p.name}</button>
              <span className="mono text-[11px] text-muted-foreground">{p.code}</span>
              <span className="num ms-auto text-[12px] text-muted-foreground">{n(Math.round(prog))}٪</span>
            </div>
            {opened && roots.map((t) => <Row key={t.id} t={t} level={1} />)}
          </div>
        )
      })}
    </div>
  )
}

// ---------------- Calendar ----------------
export function CalendarView({ tasks, idPrefix }: { tasks: Task[]; idPrefix: string }) {
  const { state, dispatch } = useStore()
  const { digits, n } = useFmt()
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(TODAY)
  const ids = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const holidays = useMemo(() => new Map(state.holidays.map((h) => [h.date, h.title])), [state.holidays])
  const allocByDay = useMemo(() => {
    const m = new Map<string, { task: Task; hours: number }[]>()
    for (const a of state.allocations) {
      if (!ids.has(a.taskId)) continue
      const list = m.get(a.date) ?? []
      const ex = list.find((x) => x.task.id === a.taskId)
      if (ex) ex.hours += a.hours
      else list.push({ task: state.tasks[a.taskId], hours: a.hours })
      m.set(a.date, list)
    }
    return m
  }, [state.allocations, state.tasks, ids])
  const dueByDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) if (t.due) m.set(t.due, [...(m.get(t.due) ?? []), t])
    return m
  }, [tasks])

  const week0 = startOfWeek(anchor)
  const month0 = startOfJMonth(anchor)
  const jm = toJalali(month0)
  const title = mode === 'week'
    ? `${digits(toJalali(week0).jd)} ${J_MONTHS[toJalali(week0).jm - 1]} تا ${digits(toJalali(addDays(week0, 6)).jd)} ${J_MONTHS[toJalali(addDays(week0, 6)).jm - 1]} ${digits(toJalali(addDays(week0, 6)).jy)}`
    : `${J_MONTHS[jm.jm - 1]} ${digits(jm.jy)}`
  const move = (k: number) => setAnchor(mode === 'week' ? addDays(week0, 7 * k) : addJMonths(month0, k))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => move(-1)} aria-label="قبلی"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(TODAY)}>امروز</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => move(1)} aria-label="بعدی"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="ms-2 font-semibold">{title}</div>
        </div>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'week', label: 'هفتگی' }, { value: 'month', label: 'ماهانه' }]} />
      </div>
      {mode === 'week' ? (
        <div className="grid grid-cols-1 overflow-hidden glass-card sm:grid-cols-7" id={`${idPrefix}-week`}>
          {Array.from({ length: 7 }, (_, i) => addDays(week0, i)).map((day, i) => {
            const off = isWeekend(day) || holidays.has(day)
            const items = allocByDay.get(day) ?? []
            const dues = dueByDay.get(day) ?? []
            const total = items.reduce((s, x) => s + x.hours, 0)
            return (
              <div key={day} className={cn('min-h-[120px] border-b p-2 sm:min-h-[360px] sm:border-b-0 sm:border-s sm:first:border-s-0', off && 'hatch bg-foreground/[0.03]', day === TODAY && 'bg-azure-soft/60')}>
                <div className="mb-2 flex items-baseline justify-between gap-1">
                  <div>
                    <div className={cn('text-[12px] font-medium', off ? 'text-muted-foreground' : '')}>{WEEKDAYS[i]}</div>
                    <div className={cn('num text-lg font-bold leading-none', day === TODAY && 'text-azure')}>{digits(toJalali(day).jd)}</div>
                  </div>
                  {total > 0 && <span className="num text-[11px] text-muted-foreground">{n(total, 1)}h</span>}
                </div>
                {holidays.has(day) && <div className="mb-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">{holidays.get(day)}</div>}
                {isWeekend(day) && !items.length && <div className="text-[11px] text-muted-foreground">تعطیل</div>}
                <div className="flex flex-col gap-1">
                  {items.slice(0, 8).map(({ task, hours }) => {
                    const s = statusOf(state, task)
                    return (
                      <button key={task.id} onClick={() => dispatch({ type: 'openTask', id: task.id })}
                        className={cn('flex w-full items-center justify-between gap-1 rounded border-s-2 bg-card px-1.5 py-1 text-start text-[11.5px] leading-tight shadow-sm ring-1 ring-border hover:ring-foreground/30',
                          s?.category === 'done' ? 'border-s-leaf' : 'border-s-azure')}>
                        <span className="min-w-0 truncate">{task.name}</span>
                        <span className="num shrink-0 text-muted-foreground">{n(hours, 1)}h</span>
                      </button>
                    )
                  })}
                  {items.length > 8 && <div className="text-[11px] text-muted-foreground">+{n(items.length - 8)} مورد</div>}
                  {dues.map((t) => (
                    <button key={`due-${t.id}`} onClick={() => dispatch({ type: 'openTask', id: t.id })} className="flex items-center gap-1 text-start text-[11px] text-foreground hover:text-azure">
                      <span className="h-2 w-2 shrink-0 rotate-45 border border-foreground" /> <span className="truncate">موعد: {t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <MonthGrid month0={month0} dueByDay={dueByDay} holidays={holidays} onOpen={(id) => dispatch({ type: 'openTask', id })} />
      )}
      <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-azure" /> ساعات تخصیص‌یافته در آن روز</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 border border-foreground" /> Due Date</span>
        <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm border" /> پنجشنبه، جمعه و تعطیلات</span>
      </div>
    </div>
  )
}

function MonthGrid({ month0, dueByDay, holidays, onOpen }: { month0: string; dueByDay: Map<string, Task[]>; holidays: Map<string, string>; onOpen: (id: string) => void }) {
  const { state } = useStore()
  const { digits, n } = useFmt()
  const j = toJalali(month0)
  const len = jMonthLength(j.jy, j.jm)
  const lead = weekdayIndex(month0)
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => fromJalali(j.jy, j.jm, i + 1))]
  while (cells.length % 7) cells.push(null)
  return (
    <div className="overflow-hidden glass-card">
      <div className="grid grid-cols-7 border-b bg-foreground/[0.03] text-center text-[11.5px] font-medium text-muted-foreground">
        {WEEKDAYS.map((w, i) => <div key={w} className="py-1.5"><span className="hidden sm:inline">{w}</span><span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span></div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="min-h-[64px] border-b border-s bg-foreground/[0.025] [&:nth-child(7n+1)]:border-s-0 sm:min-h-[104px]" />
          const off = isWeekend(c) || holidays.has(c)
          const dues = dueByDay.get(c) ?? []
          return (
            <div key={c} className={cn('min-h-[64px] min-w-0 border-b border-s p-1 [&:nth-child(7n+1)]:border-s-0 sm:min-h-[104px] sm:p-1.5', off && 'hatch bg-foreground/[0.03]', c === TODAY && 'bg-azure-soft/60')}>
              <div className={cn('num text-[12px] font-semibold', c === TODAY && 'text-azure', off && 'text-muted-foreground')}>{digits(toJalali(c).jd)}</div>
              {holidays.has(c) && <div className="hidden truncate text-[10.5px] text-muted-foreground sm:block">{holidays.get(c)}</div>}
              <div className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                {dues.slice(0, 3).map((t) => {
                  const s = statusOf(state, t)
                  return (
                    <button key={t.id} onClick={() => onOpen(t.id)} className={cn('truncate rounded px-1 py-0.5 text-start text-[11px]', s?.category === 'done' ? 'bg-leaf-soft text-leaf-ink' : 'bg-azure-soft text-azure-ink')}>
                      {t.name}
                    </button>
                  )
                })}
                {dues.length > 3 && <span className="text-[10.5px] text-muted-foreground">+{n(dues.length - 3)} مورد دیگر</span>}
              </div>
              {dues.length > 0 && <div className="mt-1 flex gap-0.5 sm:hidden">{dues.slice(0, 4).map((t) => <span key={t.id} className="h-1.5 w-1.5 rounded-full bg-azure" />)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
