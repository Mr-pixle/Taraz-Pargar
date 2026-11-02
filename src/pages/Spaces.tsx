import { useMemo, useState } from 'react'
import { ArrowUpLeft, FolderPlus, LayoutGrid, List, Lock, Plus, Warehouse } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FLOW_PROGRESS, flowOf, flowProgress, useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import type { InternalProject, Task, TeamKind } from '@/lib/types'
import { Bar, Empty, Initials, JalaliDateField, PageHeader, Segmented } from '@/components/common'
import { CreateFlowTaskDialog, DueText, FlowBoard, FlowList, SupervisionPanel, useFlowFilters } from '@/components/FlowViews'
import { ROLE_FA } from '@/lib/policy'

// ---------------- Supervision & Execution (all projects) ----------------
export function SupervisionPage() {
  const { state, can } = useStore()
  const [pid, setPid] = useState<string>('all')
  const projects = state.projects.filter((p) => can.viewSupervision(p.id))
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="نظارت و اجرا" title="موارد نظارتی پروژه‌ها" actions={
        <Select value={pid} onValueChange={setPid}>
          <SelectTrigger id="sup-filter-project" className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">همه‌ی پروژه‌ها</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
        </Select>
      }>
        ثبت ← ارجاع ← اجرا ← ارسال برای بررسی ← تأیید یا بازگشت برای اصلاح ← بسته. هر دور بررسی با شرح و پیوست ثبت می‌شود و Actual Start/Finish از همین مراحل می‌آید.
      </PageHeader>
      <SupervisionPanel key={pid} projectId={pid === 'all' ? undefined : pid} showProject={pid === 'all'} />
    </div>
  )
}

// ---------------- Team space ----------------
function ipProgress(tasks: Task[]) {
  if (!tasks.length) return 0
  return tasks.reduce((s, t) => s + FLOW_PROGRESS[flowOf(t)], 0) / tasks.length
}

const TEAM_KIND_FA: Record<TeamKind, string> = { fixed: 'تیم ثابت', phase1: 'فاز ۱', phase2: 'فاز ۲', revit: 'Revit', other: 'سایر', supervision: 'نظارت', management: 'مدیریت' }

/** Team switcher; CEO and Project Control also get the overview of all teams */
function TeamSwitch({ value }: { value: string }) {
  const { state, dispatch, can } = useStore()
  const visibleTeams = state.teams.filter((t) => can.seeTeam(t.id))
  const all = can.perm('teamspace.all')
  if (visibleTeams.length < 2) return null
  return (
    <Select value={value} onValueChange={(v) => dispatch({ type: 'nav', nav: v === 'all' ? { page: 'team' } : { page: 'team', teamId: v } })}>
      <SelectTrigger id="team-switch" className="h-9 w-[190px]" aria-label="فضای تیم"><SelectValue /></SelectTrigger>
      <SelectContent>
        {all && <SelectItem value="all">همه‌ی تیم‌ها (نمای کلی)</SelectItem>}
        {visibleTeams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/** CEO and Project Control: every team space at a glance, a way into each one, and one list to monitor all team tasks */
function TeamsOverview() {
  const { state, dispatch, can, activeUsers } = useStore()
  const { n, pct } = useFmt()
  const [newFor, setNewFor] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'board'>('list')
  const teams = state.teams.filter((t) => can.seeTeam(t.id))
  const all = useMemo(() => Object.values(state.tasks).filter((t) => t.kind === 'internal' && can.viewTask(t)).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9')), [state.tasks, can])
  const { filtered, bar } = useFlowFilters(all, 'tso', { team: true })
  const late = (t: Task) => flowOf(t) !== 'closed' && !!t.due && t.due < TODAY
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="فضای تیم‌ها" title="نمای کلی همه‌ی تیم‌ها" actions={<TeamSwitch value="all" />}>
        مدیرعامل و کنترل پروژه فضای همه‌ی تیم‌ها را می‌بینند، وارد هر تیم می‌شوند و برای اعضای همان تیم تسک می‌سازند. تسکی که از اینجا ساخته می‌شود در فضای همان تیم ثبت می‌شود، به همان تیم تعلق دارد و با قواعد همان تیم مدیریت می‌شود.
      </PageHeader>
      <section aria-label="تیم‌ها" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((tm) => {
          const list = all.filter((t) => t.teamSpaceId === tm.id)
          const open = list.filter((t) => flowOf(t) !== 'closed')
          const members = activeUsers.filter((u) => u.teamId === tm.id)
          const lead = members.find((u) => u.role === 'lead')
          const pr = list.length ? list.reduce((s, t) => s + flowProgress(t), 0) / list.length : 0
          return (
            <article key={tm.id} data-team={tm.id} className="glass-card flex flex-col gap-3 p-4">
              <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold leading-6">تیم {tm.name}</h2>
                  <div className="text-[11.5px] text-muted-foreground">{TEAM_KIND_FA[tm.kind]}، <span className="num">{n(members.length)}</span> عضو{lead ? `، سرپرست: ${lead.name}` : ''}</div>
                </div>
                <div className="flex -space-x-1.5 space-x-reverse">{members.slice(0, 4).map((u) => <Initials key={u.id} user={u} size={24} />)}</div>
              </header>
              <dl className="grid grid-cols-4 gap-2 text-center">
                <div><dt className="eyebrow">باز</dt><dd className="num text-[17px] font-bold">{n(open.length)}</dd></div>
                <div><dt className="eyebrow">در حال اجرا</dt><dd className="num text-[17px] font-bold">{n(open.filter((t) => flowOf(t) === 'in_progress' || flowOf(t) === 'rework').length)}</dd></div>
                <div><dt className="eyebrow">در بررسی</dt><dd className="num text-[17px] font-bold text-azure">{n(open.filter((t) => flowOf(t) === 'in_review').length)}</dd></div>
                <div><dt className="eyebrow">دیرکرد</dt><dd className={cn('num text-[17px] font-bold', open.some(late) && 'text-destructive')}>{n(open.filter(late).length)}</dd></div>
              </dl>
              <div className="flex items-center gap-2"><Bar value={pr} /><span className="num w-9 shrink-0 text-end text-[11.5px]">{pct(pr)}</span></div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-8" aria-label={`ورود به فضای تیم ${tm.name}`} onClick={() => dispatch({ type: 'nav', nav: { page: 'team', teamId: tm.id } })}><ArrowUpLeft className="h-3.5 w-3.5" /> ورود به فضای تیم</Button>
                <Button size="sm" className="h-8" aria-label={`تسک تازه برای تیم ${tm.name}`} onClick={() => setNewFor(tm.id)}><Plus className="h-3.5 w-3.5" /> تسک تازه</Button>
              </div>
            </article>
          )
        })}
      </section>
      <section aria-labelledby="tso-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="tso-h" className="text-[15px] font-semibold">پایش تسک‌های همه‌ی تیم‌ها</h2>
          <span className="num text-[12px] text-muted-foreground">{n(filtered.length)} تسک</span>
          <div className="ms-auto"><Segmented size="sm" value={view} onChange={setView} options={[{ value: 'list', label: 'فهرست', icon: <List className="h-3.5 w-3.5" /> }, { value: 'board', label: 'تخته', icon: <LayoutGrid className="h-3.5 w-3.5" /> }]} /></div>
        </div>
        {bar}
        {filtered.length === 0 ? <Empty title="تسکی با این فیلترها نیست" /> : view === 'list' ? <FlowList tasks={filtered} showProject /> : <FlowBoard tasks={filtered} showProject />}
      </section>
      {newFor && <CreateFlowTaskDialog kind="internal" open onOpenChange={(o) => !o && setNewFor(null)} teamId={newFor} />}
    </div>
  )
}

export function TeamSpace({ teamId: navTeam }: { teamId?: string }) {
  const { me, can } = useStore()
  if (!navTeam && can.perm('teamspace.all')) return <TeamsOverview />
  return <OneTeamSpace teamId={navTeam ?? me.teamId} />
}

function OneTeamSpace({ teamId }: { teamId: string }) {
  const { state, me, can, teamById, activeUsers } = useStore()
  const { n, pct } = useFmt()
  const team = teamById[teamId]
  const [view, setView] = useState<'list' | 'board'>('list')
  const [ipFilter, setIpFilter] = useState<string>('all')
  const [newTask, setNewTask] = useState<{ ip?: string; parent?: string } | null>(null)
  const [newIp, setNewIp] = useState(false)
  const tasks = useMemo(() => Object.values(state.tasks).filter((t) => t.kind === 'internal' && t.teamSpaceId === teamId).sort((a, b) => a.order - b.order), [state.tasks, teamId])
  const ips = state.internalProjects.filter((p) => p.teamId === teamId)
  if (!team) return <Empty title="این تیم پیدا نشد" />
  if (!can.seeTeam(teamId)) return <Empty icon={<Lock className="h-6 w-6" />} title="فضای این تیم فقط برای اعضای آن، مدیرعامل و کنترل پروژه است" hint="هر تیم کارهای داخلی خودش را جدا از پروژه‌ها می‌بیند." />
  const members = activeUsers.filter((u) => u.teamId === teamId)
  const shown = ipFilter === 'all' ? tasks : tasks.filter((t) => (t.internalProjectId ?? 'none') === ipFilter)
  const open = tasks.filter((t) => flowOf(t) !== 'closed')
  const canAddTask = me.teamId === teamId || can.perm('teamspace.all')
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="فضای تیم" title={`تیم ${team.name}`} actions={
        <>
          <TeamSwitch value={teamId} />
          {can.createInternalProject(teamId) && <Button variant="outline" onClick={() => setNewIp(true)}><FolderPlus className="h-4 w-4" /> پروژه‌ی داخلی</Button>}
          {canAddTask && <Button onClick={() => setNewTask({ ip: ipFilter !== 'all' && ipFilter !== 'none' ? ipFilter : undefined })}><Plus className="h-4 w-4" /> تسک تیم</Button>}
        </>
      }>
        کارهای داخلی تیم (آموزش، استانداردسازی، پژوهش و…) جدا از پروژه‌های اصلی. این تسک‌ها در Progress، گزارش و Workload پروژه‌ها حساب نمی‌شوند و فقط اعضای همین تیم، مدیرعامل و کنترل پروژه آن‌ها را می‌بینند.{me.teamId !== teamId && ' تسکی که شما اینجا می‌سازید به همین تیم تعلق دارد و فقط به اعضای همین تیم ارجاع می‌شود.'}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="glass-card flex flex-col gap-3 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="eyebrow">باز</div><div className="num text-[18px] font-bold">{n(open.length)}</div></div>
            <div><div className="eyebrow">در بررسی</div><div className="num text-[18px] font-bold text-azure">{n(tasks.filter((t) => flowOf(t) === 'in_review').length)}</div></div>
            <div><div className="eyebrow">دیرکرد</div><div className={cn('num text-[18px] font-bold', open.some((t) => t.due && t.due < TODAY) && 'text-destructive')}>{n(open.filter((t) => t.due && t.due < TODAY).length)}</div></div>
          </div>
          <div className="glass-divider border-t pt-3">
            <div className="eyebrow mb-2">اعضا ({n(members.length)})</div>
            <ul className="flex flex-col gap-1.5">
              {members.map((u) => (
                <li key={u.id} className="flex items-center gap-2 text-[12.5px]">
                  <Initials user={u} size={24} /><span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.role !== 'member' && <span className="shrink-0 text-[10.5px] text-muted-foreground">{ROLE_FA[u.role]}</span>}
                  <span className="num shrink-0 text-[11px] text-muted-foreground">{n(tasks.filter((t) => t.assigneeUserId === u.id && flowOf(t) !== 'closed').length)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ips.map((p) => {
              const list = tasks.filter((t) => t.internalProjectId === p.id)
              const pr = ipProgress(list)
              return (
                <button key={p.id} onClick={() => setIpFilter(ipFilter === p.id ? 'all' : p.id)} aria-pressed={ipFilter === p.id}
                  className={cn('glass-card flex flex-col gap-2 p-3.5 text-start transition-shadow', ipFilter === p.id && 'ring-2 ring-azure/50')}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-5">{p.name}</span>
                    <span className={cn('shrink-0 rounded-full px-1.5 text-[10.5px] leading-5', p.status === 'done' ? 'bg-leaf-soft text-leaf-ink' : p.status === 'paused' ? 'bg-secondary text-muted-foreground' : 'bg-azure-soft text-azure-ink')}>{p.status === 'done' ? 'تمام‌شده' : p.status === 'paused' ? 'متوقف' : 'فعال'}</span>
                  </div>
                  {p.description && <p className="line-clamp-2 text-[11.5px] text-muted-foreground">{p.description}</p>}
                  <div className="mt-auto flex items-center gap-2"><Bar value={pr} /><span className="num w-9 shrink-0 text-end text-[11.5px]">{pct(pr)}</span></div>
                  <div className="flex items-center justify-between text-[11.5px] text-muted-foreground"><span className="num">{n(list.length)} تسک</span><span>موعد <DueText due={p.due} done={p.status === 'done'} /></span></div>
                </button>
              )
            })}
            {ips.length === 0 && <Empty icon={<Warehouse className="h-6 w-6" />} title="هنوز پروژه‌ی داخلی ندارید" hint="سرپرست تیم پروژه‌ی داخلی می‌سازد؛ تسک‌های بدون پروژه هم مجازند." />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={ipFilter} onValueChange={setIpFilter}>
              <SelectTrigger id="ip-filter" className="h-8 w-[220px] text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه‌ی کارهای تیم</SelectItem>
                {ips.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                <SelectItem value="none">بدون پروژه‌ی داخلی</SelectItem>
              </SelectContent>
            </Select>
            {ipFilter !== 'all' && ipFilter !== 'none' && can.createInternalProject(teamId) && <IpStatus ip={ips.find((p) => p.id === ipFilter)!} />}
            <div className="ms-auto"><Segmented size="sm" value={view} onChange={setView} options={[{ value: 'list', label: 'فهرست', icon: <List className="h-3.5 w-3.5" /> }, { value: 'board', label: 'تخته', icon: <LayoutGrid className="h-3.5 w-3.5" /> }]} /></div>
          </div>
          {shown.length === 0 ? <Empty title="تسکی در این بخش نیست" hint={canAddTask ? 'با «تسک تیم» کار تازه بسازید.' : undefined} />
            : view === 'list' ? <FlowList tasks={shown} nested /> : <FlowBoard tasks={shown} />}
        </div>
      </div>

      {newTask && <CreateFlowTaskDialog kind="internal" open onOpenChange={(o) => !o && setNewTask(null)} teamId={teamId} internalProjectId={newTask.ip} parentId={newTask.parent} />}
      <NewInternalProjectDialog teamId={teamId} open={newIp} onOpenChange={setNewIp} />
    </div>
  )
}

function IpStatus({ ip }: { ip: InternalProject }) {
  const { dispatch } = useStore()
  return (
    <Select value={ip.status} onValueChange={(v) => { dispatch({ type: 'internalProjectUpdate', id: ip.id, patch: { status: v as InternalProject['status'] } }); toast.success('وضعیت پروژه‌ی داخلی به‌روز شد') }}>
      <SelectTrigger id="ip-status" className="h-8 w-[130px] text-[12.5px]" aria-label="وضعیت پروژه‌ی داخلی"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="active">فعال</SelectItem><SelectItem value="paused">متوقف</SelectItem><SelectItem value="done">تمام‌شده</SelectItem></SelectContent>
    </Select>
  )
}

function NewInternalProjectDialog({ teamId, open, onOpenChange }: { teamId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { dispatch, me } = useStore()
  const [f, setF] = useState({ name: '', description: '', start: undefined as string | undefined, due: undefined as string | undefined })
  const submit = () => {
    if (!f.name.trim()) { toast.error('نام پروژه‌ی داخلی را وارد کنید.'); return }
    if (f.start && f.due && f.due < f.start) { toast.error('موعد نمی‌تواند قبل از شروع باشد.'); return }
    dispatch({ type: 'internalProjectAdd', project: { id: `IP-${Date.now().toString(36)}`, teamId, name: f.name.trim(), description: f.description.trim() || undefined, status: 'active', start: f.start, due: f.due, createdBy: me.id, createdAt: new Date().toISOString() } })
    onOpenChange(false); setF({ name: '', description: '', start: undefined, due: undefined })
    toast.success('پروژه‌ی داخلی ساخته شد', { description: 'اعضای تیم اعلان گرفتند.' })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>پروژه‌ی داخلی تیم</DialogTitle>
          <DialogDescription>کار بلندمدت تیم که به پروژه‌ی کارفرما تعلق ندارد؛ تسک‌ها و زیرتسک‌های آن فقط در فضای همین تیم دیده می‌شوند.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="ip-name" className="eyebrow">نام</Label><Input id="ip-name" className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً: کتابخانه‌ی جزئیات اجرایی" /></div>
          <div className="col-span-2"><Label htmlFor="ip-desc" className="eyebrow">شرح</Label><Textarea id="ip-desc" className="mt-1 min-h-[64px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div><Label htmlFor="ip-start" className="eyebrow">شروع</Label><div className="mt-1"><JalaliDateField id="ip-start" value={f.start} onChange={(v) => setF({ ...f, start: v })} /></div></div>
          <div><Label htmlFor="ip-due" className="eyebrow">موعد</Label><div className="mt-1"><JalaliDateField id="ip-due" value={f.due} onChange={(v) => setF({ ...f, due: v })} /></div></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={submit}>ساخت</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
