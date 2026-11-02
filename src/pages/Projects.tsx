import { useMemo, useState } from 'react'
import { ArrowRight, FileSpreadsheet, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { statusesFor, useFmt, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Project, Task } from '@/lib/types'
import { TaskViews, TreeView } from '@/components/TaskViews'
import { Bar, Empty, PageHeader, ProgressRing, Segmented, TitleBlock } from '@/components/common'
import { runManualSync } from './SyncRuns'
import { SupervisionPanel } from '@/components/FlowViews'
import { MdrButton, useMdrShortcut } from '@/components/MdrLink'
import { MDR_URL_HINT, mdrHref } from '@/lib/mdr'

export function useProjectProgress() {
  const { kids, roll } = useStore()
  return (pid: string) => {
    const phases = (kids[`root:${pid}`] ?? []).filter((x) => x.kind === 'phase')
    const w = phases.reduce((s, x) => s + (x.weight ?? 1), 0)
    return { total: w ? phases.reduce((s, x) => s + (x.weight ?? 1) * (roll[x.id]?.progress ?? 0), 0) / w : 0, phases }
  }
}

export function Projects() {
  const store = useStore()
  const { state, dispatch, teamById, roll, workItems, can } = store
  const { n, time } = useFmt()
  const progress = useProjectProgress()
  const [mode, setMode] = useState<'cards' | 'tree'>('cards')
  const [newOpen, setNewOpen] = useState(false)
  const pending = (pid: string) => state.syncItems.filter((x) => x.projectId === pid && x.state === 'pending').length

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="پروژه‌ها" title="پروژه‌های فعال" actions={
        <>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'cards', label: 'فهرست' }, { value: 'tree', label: 'درخت WBS همه' }]} />
          {can.perm('project.define') && <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> تعریف پروژه</Button>}
        </>
      }>
        هر پروژه یک MDR در Google Sheet دارد، با یک قالب مشترک. {n(state.projects.length)} پروژه‌ی نمونه از حدود ۳۰ پروژه‌ی فعال دفتر.
      </PageHeader>

      {mode === 'tree' ? <TreeView tasks={workItems} depth={1} /> : (
        <div className="overflow-hidden glass-card">
          {state.projects.map((p) => {
            const pr = progress(p.id)
            const docs = workItems.filter((t) => t.projectId === p.id)
            const un = docs.filter((t) => !t.assigneeUserId && !t.assigneeTeamId).length
            const pend = pending(p.id)
            return (
              <button key={p.id} onClick={() => dispatch({ type: 'nav', nav: { page: 'project', projectId: p.id } })}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b px-4 py-4 text-start last:border-0 hover:bg-foreground/[0.035] md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <ProgressRing value={pr.total} size={46} stroke={4} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="mono text-[11.5px] text-muted-foreground">{p.code}</span><span className="text-[11.5px] text-muted-foreground">{p.type}</span></div>
                  <div className="truncate text-[15px] font-bold">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground">{teamById[p.phase1TeamId]?.name} / {teamById[p.phase2TeamId]?.name}، Revit</div>
                </div>
                <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                  {pr.phases.map((ph) => (
                    <div key={ph.id} className="flex items-center gap-2 text-[11.5px]">
                      <span className="w-12 shrink-0 text-muted-foreground">{ph.name.split(' — ')[0]}</span>
                      <Bar value={roll[ph.id]?.progress ?? 0} />
                      <span className="num w-9 shrink-0 text-end">{n(Math.round(roll[ph.id]?.progress ?? 0))}٪</span>
                    </div>
                  ))}
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-2 text-[12px] md:col-span-1">
                  <div><div className="eyebrow">سند</div><div className="num font-semibold">{n(docs.length)}</div></div>
                  <div><div className="eyebrow">Unassigned</div><div className="num font-semibold">{n(un)}</div></div>
                  {can.control ? <div><div className="eyebrow">Sync Review</div><div className={pend ? 'num font-semibold text-azure' : 'num font-semibold'}>{n(pend)}</div></div>
                    : <div><div className="eyebrow">انجام‌شده</div><div className="num font-semibold">{n(docs.filter((t) => t.actualFinish).length)}</div></div>}
                </div>
                <div className="col-span-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground md:col-span-1">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {p.lastSync ? time(p.lastSync) : 'هنوز Sync نشده'}
                </div>
              </button>
            )
          })}
        </div>
      )}
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state, dispatch } = useStore()
  const [f, setF] = useState({ code: '', name: '', type: 'مسکونی', p1: 'p1d', p2: 'p2b', url: '', tab: 'MDR' })
  const p1 = state.teams.filter((t) => t.kind === 'phase1')
  const p2 = state.teams.filter((t) => t.kind === 'phase2')
  const submit = () => {
    const code = f.code.trim().toUpperCase()
    if (!code || !f.name.trim()) { toast.error('کد و نام پروژه را وارد کنید.'); return }
    if (!/^[A-Z0-9]{2,8}$/.test(code)) { toast.error('کد پروژه ۲ تا ۸ نویسه از حروف بزرگ لاتین یا عدد است (مثل 458 یا BBT).'); return }
    if (state.projects.some((p) => p.id === code)) { toast.error(`کد ${code} قبلاً استفاده شده است.`); return }
    const mdrUrl = mdrHref(f.url)
    if (!mdrUrl) { toast.error('لینک MDR خود این پروژه را وارد کنید.', { description: MDR_URL_HINT }); return }
    const project: Project = { id: code, code, name: f.name.trim(), type: f.type, phase1TeamId: f.p1, phase2TeamId: f.p2, mdrUrl, mdrTab: f.tab.trim() || 'MDR' }
    dispatch({ type: 'projectAdd', project })
    onOpenChange(false)
    toast.success(`پروژه‌ی ${code} تعریف شد`, { description: 'با اولین Sync، سطرهای MDR به صف Sync Review می‌روند.' })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle>تعریف پروژه</DialogTitle>
          <DialogDescription>هر پروژه MDR خودش را دارد و Taskها از همان MDR وارد می‌شوند. تیم فاز ۱ و تیم فاز ۲ هنگام تعریف پروژه تعیین می‌شوند؛ تیم‌های ثابت و Revit خودکار متصل‌اند.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="np-code" className="eyebrow">کد (Code)</Label><Input id="np-code" className="mono mt-1" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="TJR" /></div>
          <div><Label htmlFor="np-type" className="eyebrow">نوع</Label><Input id="np-type" className="mt-1" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></div>
          <div className="col-span-2"><Label htmlFor="np-name" className="eyebrow">نام پروژه</Label><Input id="np-name" className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً: مجتمع مسکونی تجریش" /></div>
          <div>
            <Label htmlFor="np-p1" className="eyebrow">تیم فاز ۱</Label>
            <Select value={f.p1} onValueChange={(v) => setF({ ...f, p1: v })}><SelectTrigger id="np-p1" className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{p1.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <Label htmlFor="np-p2" className="eyebrow">تیم فاز ۲</Label>
            <Select value={f.p2} onValueChange={(v) => setF({ ...f, p2: v })}><SelectTrigger id="np-p2" className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{p2.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="col-span-2 sm:col-span-1"><Label htmlFor="np-url" className="eyebrow">لینک MDR (Google Sheet)</Label><Input id="np-url" dir="ltr" className="mono mt-1 text-[12px]" aria-invalid={!!f.url && !mdrHref(f.url)} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/…" /></div>
          <div className="col-span-2 sm:col-span-1"><Label htmlFor="np-tab" className="eyebrow">Tab</Label><Input id="np-tab" className="mono mt-1" value={f.tab} onChange={(e) => setF({ ...f, tab: e.target.value })} /></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={submit}>تعریف پروژه</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManualTaskDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const store = useStore()
  const { state, dispatch } = store
  const [name, setName] = useState('')
  const [parent, setParent] = useState('root')
  const nodes = Object.values(state.tasks).filter((t) => t.projectId === projectId && (t.kind === 'phase' || t.kind === 'stage' || t.kind === 'group')).sort((a, b) => a.order - b.order)
  const submit = () => {
    if (!name.trim()) { toast.error('نام تسک را وارد کنید.'); return }
    const id = `M-${projectId}-${Date.now().toString(36)}`
    const task: Task = { id, projectId, parentId: parent === 'root' ? null : parent, kind: 'manual', name: name.trim(), source: 'manual', order: 99999, statusId: 'st-todo' }
    task.statusId = statusesFor(state, task)[0].id
    dispatch({ type: 'addTask', task })
    onOpenChange(false); setName('')
    dispatch({ type: 'openTask', id })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>تسک دستی</DialogTitle>
          <DialogDescription>تسکی که در MDR نیست (مثلاً رندر، ارائه یا طراحی داخلی). بعد از ساخت، تخصیص و Estimation را تعیین کنید.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div><Label htmlFor="mt-name" className="eyebrow">نام</Label><Input id="mt-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: رندر نمای شب" /></div>
          <div>
            <Label htmlFor="mt-parent" className="eyebrow">محل در درخت WBS</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger id="mt-parent" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="root">ریشه‌ی پروژه (خارج از MDR)</SelectItem>
                {nodes.map((t) => <SelectItem key={t.id} value={t.id}>{t.kind === 'phase' ? '' : t.kind === 'stage' ? '— ' : '—— '}{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={submit}>ساخت و باز کردن</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectPage({ projectId }: { projectId: string }) {
  const store = useStore()
  const { state, dispatch, projectById, teamById, workItems, teamOf, can } = store
  const { n, time, pct } = useFmt()
  const p = projectById[projectId]
  const progress = useProjectProgress()
  const [manualOpen, setManualOpen] = useState(false)
  const tasks = useMemo(() => workItems.filter((t) => t.projectId === projectId), [workItems, projectId])
  useMdrShortcut(p)
  if (!p) return <Empty title="این پروژه پیدا نشد" hint="از فهرست پروژه‌ها یکی را انتخاب کنید." />
  const pr = progress(p.id)
  const teamTabs = ['ctl', 'rd', 'int', 'prs', 'ren', p.phase1TeamId, p.phase2TeamId, 'rvt']
  const pool = tasks.filter((t) => !t.assigneeUserId && !t.assigneeTeamId)
  const pend = state.syncItems.filter((x) => x.projectId === p.id && x.state === 'pending').length
  const syncing = state.syncRuns.some((r) => r.state === 'running' && (r.projectId === p.id || r.projectId === 'all'))
  const supOpen = Object.values(state.tasks).filter((t) => t.kind === 'supervision' && t.projectId === p.id && t.flow !== 'closed').length
  const supTasks = Object.values(state.tasks).filter((t) => t.kind === 'supervision' && t.projectId === p.id && can.viewTask(t))
  const supGantt = supTasks.length ? { key: 'sup', label: 'نظارت و اجرا', tasks: supTasks } : undefined
  return (
    <div className="flex flex-col gap-5">
      <div>
        <button className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground" onClick={() => dispatch({ type: 'nav', nav: { page: 'projects' } })}>
          <ArrowRight className="h-3.5 w-3.5" /> پروژه‌ها
        </button>
        <PageHeader eyebrow={`${p.code}، ${p.type}`} title={p.name} actions={(
          <>
            <MdrButton project={p} />
            {can.syncProject(p.id) && <Button variant="outline" onClick={() => runManualSync(store, p.id)} disabled={syncing} aria-busy={syncing}><RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} /> {syncing ? 'در حال Sync…' : 'Sync با MDR'}</Button>}
            {can.createProjectTask(p.id) && <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" /> تسک دستی</Button>}
          </>
        )} />
      </div>
      <TitleBlock cells={[
        { label: 'Progress وزنی', value: <span className="num">{pct(pr.total)}</span> },
        { label: 'مدیر پروژه', value: p.managerId ? store.userById[p.managerId]?.name : '—' },
        { label: 'تیم فاز ۱', value: teamById[p.phase1TeamId]?.name },
        { label: 'تیم فاز ۲', value: teamById[p.phase2TeamId]?.name },
        { label: 'MDR / Tab', value: `${p.mdrTab}`, mono: true },
        { label: 'آخرین Sync', value: p.lastSync ? time(p.lastSync) : '—' },
        can.control
          ? { label: 'در صف Sync Review', value: pend ? <button className="num text-azure hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'review' } })}>{n(pend)} ردیف</button> : <span className="num">{n(0)}</span> }
          : { label: 'تسک‌های پروژه', value: <span className="num">{n(tasks.length)}</span> },
      ]} />
      <Tabs defaultValue="wbs" dir="rtl">
        <div className="scroll-x thin-scroll -mx-1 px-1">
          <TabsList className="h-auto w-max justify-start gap-0.5">
            <TabsTrigger value="wbs" className="text-[13px]">درخت WBS</TabsTrigger>
            {teamTabs.map((id) => <TabsTrigger key={id} value={id} className="text-[13px]">{teamById[id]?.name}</TabsTrigger>)}
            {can.viewSupervision(p.id) && <TabsTrigger value="sup" className="text-[13px]">نظارت و اجرا{supOpen > 0 && <span className="num ms-1.5 rounded-full bg-azure px-1.5 text-[10.5px] font-semibold text-white">{n(supOpen)}</span>}</TabsTrigger>}
            {can.createProjectTask(p.id) && <TabsTrigger value="pool" className="text-[13px]">Unassigned <span className="num ms-1.5 text-[11px] text-muted-foreground">{n(pool.length)}</span></TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="wbs" className="mt-4">
          <TaskViews tasks={tasks} idPrefix={`p-${p.id}-wbs`} defaultView="tree" hideProject treeDepth={4} ganttExtras={supGantt} />
        </TabsContent>
        {teamTabs.map((id) => {
          const list = tasks.filter((t) => teamOf(t) === id)
          return (
            <TabsContent key={id} value={id} className="mt-4">
              {list.length ? <TaskViews tasks={list} idPrefix={`p-${p.id}-${id}`} defaultView="kanban" hideProject hideTeam treeDepth={4} />
                : <Empty title={`تیم ${teamById[id]?.name} در این پروژه تسکی ندارد`} hint="هر تیم فقط تسک‌های تخصیص‌یافته به خودش یا اعضایش را در این پروژه می‌بیند." />}
            </TabsContent>
          )
        })}
        {can.viewSupervision(p.id) && (
          <TabsContent value="sup" className="mt-4"><SupervisionPanel projectId={p.id} /></TabsContent>
        )}
        {can.createProjectTask(p.id) && (
          <TabsContent value="pool" className="mt-4">
            {pool.length ? <TaskViews tasks={pool} idPrefix={`p-${p.id}-pool`} defaultView="list" hideProject treeDepth={4} />
              : <Empty title="همه‌ی تسک‌های این پروژه تخصیص داده شده‌اند" />}
          </TabsContent>
        )}
      </Tabs>
      <ManualTaskDialog projectId={p.id} open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  )
}
