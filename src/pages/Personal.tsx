// «کارهای شخصی» — a private task list per person, with its own statuses, Kanban and Timeline.
// Separate from projects by design: it reads only the signed-in person's personal tasks.
import { useMemo, useState } from 'react'
import { CalendarClock, ChartGantt, Columns3, GripVertical, ListChecks, Lock, Plus, Search, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { addDays } from '@/lib/jalali'
import { ancestorsOf, isDone, statusOfTask, subProgress } from '@/lib/personal'
import type { PersonalTask } from '@/lib/types'
import { PageHeader, Segmented } from '@/components/common'
import { PriorityChip } from '@/components/FlowViews'
import { NewPersonalTaskDialog, PersonalTaskDialog, StatusChip, StatusManagerDialog, useMine } from '@/components/PersonalViews'
import { PersonalTimeline } from '@/components/PersonalTimeline'

export function PersonalPage() {
  const { board, list } = useMine()
  const { n } = useFmt()
  const [view, setView] = useState<'kanban' | 'timeline'>('kanban')
  const [q, setQ] = useState('')
  const [withSubs, setWithSubs] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState<{ statusId?: string } | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const filtered = useMemo(() => {
    const s = q.trim()
    if (!s) return list
    // a match keeps its ancestors, so the hierarchy stays readable
    const hit = new Set(list.filter((t) => t.title.includes(s) || (t.description ?? '').includes(s)).map((t) => t.id))
    for (const t of list) if (hit.has(t.id)) { let p = t.parentId; while (p) { hit.add(p); p = list.find((x) => x.id === p)?.parentId ?? null } }
    return list.filter((t) => hit.has(t.id))
  }, [list, q])
  const open = list.filter((t) => !isDone(board, t))
  const overdue = open.filter((t) => t.due && t.due < TODAY).length
  const today = open.filter((t) => t.due === TODAY).length
  const week = open.filter((t) => t.due && t.due > TODAY && t.due <= addDays(TODAY, 7)).length

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="کار" title="کارهای شخصی"
        actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setStatusOpen(true)}><Settings2 className="h-4 w-4" /> Statusها</Button><Button onClick={() => setNewOpen({})}><Plus className="h-4 w-4" /> کار تازه</Button></div>}>
        <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> فهرست خصوصی شما.</span> هیچ‌کس دیگر، حتی مدیران، آن را نمی‌بیند و در برنامه‌ریزی، تقویم کاری، Workload و گزارش‌های سازمانی شمرده نمی‌شود.
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="خلاصه">
        {[['باز', open.length, ''], ['گذشته از موعد', overdue, overdue ? 'text-destructive' : ''], ['موعد امروز', today, today ? 'text-azure-ink' : ''], ['هفت روز آینده', week, '']].map(([k, v, c]) => (
          <div key={k as string} className="glass-card px-3 py-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className={cn('num text-[18px] font-bold', c as string)}>{n(v as number)}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented compact value={view} onChange={setView} options={[{ value: 'kanban', label: 'Kanban', icon: <Columns3 className="h-3.5 w-3.5" /> }, { value: 'timeline', label: 'Timeline', icon: <ChartGantt className="h-3.5 w-3.5" /> }]} />
        <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="pt-search" aria-label="جست‌وجو در کارهای شخصی" className="h-9 ps-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو…" />
        </div>
        {view === 'kanban' && <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px]"><Checkbox checked={withSubs} onCheckedChange={(v) => setWithSubs(!!v)} />Subtaskها هم کارت شوند</label>}
      </div>

      {list.length === 0 ? (
        <section className="glass-card flex flex-col items-center gap-3 px-4 py-10 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground" />
          <div className="text-[15px] font-semibold">هنوز کار شخصی‌ای ندارید</div>
          <p className="max-w-md text-[12.5px] text-muted-foreground">کارهای خودتان را — از مطالعه و دوره تا کارهای روزمره — اینجا بنویسید، Subtask بسازید و با Kanban و Timeline دنبالشان کنید. Statusها را هم هر طور بخواهید تنظیم کنید.</p>
          <Button onClick={() => setNewOpen({})}><Plus className="h-4 w-4" /> اولین کار</Button>
        </section>
      ) : view === 'kanban'
        ? <PersonalKanban tasks={filtered.filter((t) => withSubs || !t.parentId)} showParent={withSubs} onOpen={setOpenId} onAdd={(statusId) => setNewOpen({ statusId })} />
        : <PersonalTimeline tasks={filtered} onOpen={setOpenId} />}

      <PersonalTaskDialog id={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />
      <NewPersonalTaskDialog open={!!newOpen} onOpenChange={(o) => { if (!o) setNewOpen(null) }} preset={newOpen ?? undefined} />
      <StatusManagerDialog open={statusOpen} onOpenChange={setStatusOpen} />
    </div>
  )
}

function PersonalKanban({ tasks, showParent, onOpen, onAdd }: { tasks: PersonalTask[]; showParent: boolean; onOpen: (id: string) => void; onAdd: (statusId: string) => void }) {
  const { dispatch } = useStore()
  const { board, list, all } = useMine()
  const { n, d } = useFmt()
  const [over, setOver] = useState<string | null>(null)
  const [quick, setQuick] = useState<{ statusId: string; title: string } | null>(null)
  const sorted = useMemo(() => [...tasks].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.order - b.order), [tasks])
  const drop = (id: string, statusId: string) => {
    const t = all[id]
    if (!t || t.statusId === statusId) return
    dispatch({ type: 'ptUpdate', id, patch: { statusId } })
  }
  const addQuick = () => {
    if (!quick?.title.trim()) { setQuick(null); return }
    dispatch({ type: 'ptCreate', task: { title: quick.title, statusId: quick.statusId } })
    toast.success('کار شخصی ساخته شد')
    setQuick({ ...quick, title: '' })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="scroll-x thin-scroll -mx-1 px-1 pb-2">
        <div className="flex gap-3" style={{ minWidth: board.statuses.length * 262 }}>
          {board.statuses.map((s) => {
            const col = sorted.filter((t) => statusOfTask(board, t).id === s.id)
            return (
              <div key={s.id} data-status={s.id} role="list" aria-label={`ستون ${s.name}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id) }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); drop(e.dataTransfer.getData('text/plain'), s.id) }}
                className={cn('glass-well flex w-[258px] shrink-0 flex-col transition-[background-color,box-shadow] duration-150', over === s.id && 'border-azure bg-azure-soft')}>
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <StatusChip s={s} />
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{s.id === board.defaultStatusId && <span>پیش‌فرض</span>}<span className="num font-semibold text-foreground">{n(col.length)}</span></span>
                </div>
                <div className="flex max-h-[560px] min-h-[120px] flex-col gap-2 overflow-y-auto p-2 thin-scroll">
                  {col.map((t) => {
                    const p = subProgress(board, list, t.id)
                    const late = !s.done && t.due && t.due < TODAY
                    const anc = showParent ? ancestorsOf(all, t) : []
                    return (
                      <div key={t.id} role="listitem" draggable tabIndex={0} data-ptask={t.id}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
                        onClick={() => onOpen(t.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t.id) }}
                        className="glass-item is-interactive group cursor-pointer p-3 text-[12.5px] hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing">
                        {anc.length > 0 && <div className="mb-1 truncate text-[10.5px] text-muted-foreground">{anc.map((a) => a.title).join(' › ')}</div>}
                        <div className="flex items-start justify-between gap-2">
                          <div className={cn('min-w-0 font-medium leading-snug', s.done && 'text-muted-foreground line-through')}>{t.title}</div>
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                        </div>
                        {t.description && <p className="mt-1 line-clamp-2 text-[11.5px] text-muted-foreground">{t.description}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <PriorityChip p={t.priority} />
                          {p.total > 0 && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground" title="Subtaskهای تکمیل‌شده">
                              <ListChecks className="h-3.5 w-3.5" /><span className="num">{n(p.done)}/{n(p.total)}</span>
                              <span className="h-1 w-10 overflow-hidden rounded-full bg-secondary"><span className="block h-full bg-leaf" style={{ width: `${(p.done / p.total) * 100}%` }} /></span>
                            </span>
                          )}
                          {(t.start || t.due) && <span className={cn('num ms-auto inline-flex items-center gap-1', late ? 'font-semibold text-destructive' : 'text-muted-foreground')}><CalendarClock className="h-3 w-3" />{t.start && t.due && t.start !== t.due ? `${d(t.start).slice(5)} تا ${d(t.due).slice(5)}` : d(t.due ?? t.start).slice(5)}</span>}
                        </div>
                      </div>
                    )
                  })}
                  {quick?.statusId === s.id ? (
                    <Input autoFocus aria-label={`کار تازه در ${s.name}`} className="h-9" value={quick.title} placeholder="عنوان… (Enter)" onChange={(e) => setQuick({ ...quick, title: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') addQuick(); if (e.key === 'Escape') setQuick(null) }} onBlur={() => { if (!quick.title.trim()) setQuick(null) }} />
                  ) : (
                    <button type="button" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground" onClick={() => setQuick({ statusId: s.id, title: '' })} onDoubleClick={() => onAdd(s.id)}>
                      <Plus className="h-3.5 w-3.5" /> افزودن
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">کارت را بکشید و در ستون دیگر رها کنید تا Status آن عوض شود. روی موبایل، کارت را باز کنید و Status را انتخاب کنید.</p>
    </div>
  )
}
