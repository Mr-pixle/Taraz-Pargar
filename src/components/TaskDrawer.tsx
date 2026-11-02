import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, CheckCircle2, CornerDownLeft, FileSpreadsheet, History, Link2, Lock, MapPin, MessageSquare, Pencil, Play, Plus, RotateCcw, Send, Sparkles, Trophy, Undo2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ancestors, currentPointConfig, effectiveScope, FIN_SPACE_FA, finSpaceOf, flowOf, flowProgress, isClosed, isFinTask, isFlowTask, isWorkItem, projectTeams, statusesFor, statusOf, useFmt, useStore, WRITEBACK_DELAY_SEC, type NewFile } from '@/lib/store'
import { activeAward, calcFormula, calcPoint, calcSentence } from '@/lib/points'
import { canSeeFinSpace } from '@/lib/policy'
import { FIELD_GROUPS, hasField, L, LU, TASK_FIELDS, type FieldGroupId } from '@/lib/taskFields'
import { deltaCls, useSigned } from './PointsViews'
import { WorkLogPanel } from './WorkLogPanel'
import { toAllocations, type Resource } from '@/lib/planning'
import { TODAY } from '@/lib/seed'
import type { FlowState, Priority, Task, TaskType, User } from '@/lib/types'
import { Initials, JalaliDateField, ProgressRing, StatusPill } from './common'
import { MentionInput, RichText } from './Mention'
import { AttachmentList, FilePicker, FlowPill, PRIORITY_FA, PriorityChip, TYPE_FA, UserSelect } from './FlowViews'

const KIND_FA: Record<string, string> = { phase: 'Phase', stage: 'Stage', group: 'Group', doctype: 'Doc Type', document: 'Document', manual: 'تسک دستی', supervision: 'مورد نظارتی', internal: 'تسک تیم', finadmin: 'Task مالی و اداری' }
/** Sections A–F come from lib/taskFields.ts: the same groups order every task table and filter bar */
const SECTIONS = FIELD_GROUPS
type SecId = FieldGroupId

export function TaskDrawer() {
  const { state, dispatch, can } = useStore()
  const t = state.openTaskId ? state.tasks[state.openTaskId] : undefined
  const visible = !!t && can.viewTask(t)
  return (
    <Sheet open={visible} onOpenChange={(o) => !o && dispatch({ type: 'openTask', id: null })}>
      <SheetContent side="left" className="w-full overflow-y-auto p-0 sm:max-w-[600px]" dir="rtl" id="task-drawer-scroll">
        {t && visible && <DrawerBody key={t.id} t={t} />}
      </SheetContent>
    </Sheet>
  )
}

function Section({ id, aside, children }: { id: SecId; aside?: React.ReactNode; children: React.ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!
  return (
    <section id={`sec-${id}`} className="scroll-mt-14 border-b px-5 py-4" aria-labelledby={`sec-${id}-h`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id={`sec-${id}-h`} className="flex items-center gap-2 text-[13px] font-semibold" title={s.about}>
          <span className="mono inline-flex h-5 w-5 items-center justify-center rounded-md bg-foreground text-[10.5px] font-bold text-background" aria-hidden="true">{s.letter}</span>{s.title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
const LockNote = ({ text }: { text: string }) => <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground"><Lock className="h-3 w-3" /> {text}</span>
const jump = (id: SecId) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
/** Read-only value in the same label/value form everywhere on the task page */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}><dt className="eyebrow">{label}</dt><dd className="mt-0.5 truncate text-[13px]">{children}</dd></div>
}

function DrawerBody({ t }: { t: Task }) {
  const store = useStore()
  const { state, projectById, teamById, dispatch } = store
  const path = ancestors(state.tasks, t).reverse()
  const project = projectById[t.projectId]
  const leaf = isWorkItem(t) || isFlowTask(t)
  const ip = t.internalProjectId ? state.internalProjects.find((p) => p.id === t.internalProjectId) : undefined
  const flowShown: FlowState | null = isFlowTask(t) ? flowOf(t) : t.flow === 'in_review' || t.flow === 'rework' ? t.flow : null
  const close = () => dispatch({ type: 'openTask', id: null })
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-foreground/[0.03] px-5 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {t.kind === 'internal' ? (
            <button className="hover:text-foreground hover:underline" onClick={() => { close(); dispatch({ type: 'nav', nav: { page: 'team', teamId: t.teamSpaceId } }) }}>فضای تیم {teamById[t.teamSpaceId ?? '']?.name}</button>
          ) : isFinTask(t) ? (
            <button className="hover:text-foreground hover:underline" onClick={() => { close(); dispatch({ type: 'nav', nav: { page: 'finadmin', space: finSpaceOf(t) } }) }}>فضای مالی و اداری › {FIN_SPACE_FA[finSpaceOf(t) ?? 'finance']}</button>
          ) : (
            <button className="hover:text-foreground hover:underline" onClick={() => { close(); dispatch({ type: 'nav', nav: { page: 'project', projectId: t.projectId } }) }}>{project?.name}</button>
          )}
          {t.kind === 'supervision' && <span>› نظارت و اجرا</span>}
          {ip && <span>› {ip.name}</span>}
          {path.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5"><span>›</span>
              <button className="hover:text-foreground hover:underline" onClick={() => dispatch({ type: 'openTask', id: p.id })}>{p.name}</button>
            </span>
          ))}
        </div>
        <SheetTitle className="mt-2 pe-8 text-lg font-bold leading-snug">{t.name}</SheetTitle>
        <SheetDescription asChild>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded border bg-background px-1.5 py-0.5">{isFinTask(t) ? (finSpaceOf(t) === 'office' ? 'Task اداری' : 'Task مالی') : KIND_FA[t.kind]}</span>
            {!isFlowTask(t) && (
              <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', t.source === 'mdr' ? 'bg-azure-soft text-azure-ink' : 'bg-secondary text-secondary-foreground')}>
                {t.source === 'mdr' ? <><FileSpreadsheet className="h-3 w-3" /> از MDR</> : 'دستی'}
              </span>
            )}
            {t.docNumber && <span className="mono text-foreground">{t.docNumber}</span>}
            {flowShown && <FlowPill state={flowShown} />}
            <PriorityChip p={t.priority} />
            {t.removedFromMdr && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-destructive">Removed from MDR — حذف خودکار انجام نشد</span>}
          </div>
        </SheetDescription>
        {leaf && (
          <nav className="glass-seg mt-3 flex w-max max-w-full gap-0.5 overflow-x-auto !rounded-full p-0.5 thin-scroll" aria-label="بخش‌های تسک">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" onClick={() => jump(s.id)} title={s.title} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <span className="mono font-bold text-foreground">{s.letter}</span><span className="hidden sm:inline">{s.short}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
      {leaf ? (isWorkItem(t) ? <WorkItemSections t={t} /> : <FlowSections t={t} />) : (
        <>
          <ParentBody t={t} />
          <div className="px-5 py-4"><CommentsSection t={t} /><AuditSection t={t} /></div>
        </>
      )}
    </div>
  )
}

/** Project work items: assignment and schedule are one plan (capacity is checked on both), shared by sections B and C */
function WorkItemSections({ t }: { t: Task }) {
  const plan = usePlan(t)
  return (
    <>
      <SectionA t={t} />
      <SectionB t={t} plan={plan} />
      <PlanningSection t={t} plan={plan} />
      <SectionD t={t} />
      <SectionE t={t} />
      <Section id="f"><CommentsSection t={t} /><AuditSection t={t} /></Section>
    </>
  )
}
function FlowSections({ t }: { t: Task }) {
  return (
    <>
      <SectionA t={t} />
      <SectionB t={t} />
      <FlowPlanningSection t={t} />
      <SectionD t={t} />
      <SectionE t={t} />
      <Section id="f"><CommentsSection t={t} /><AuditSection t={t} /></Section>
    </>
  )
}

// ---------------- parents (Phase / Stage / Group / Doc Type) ----------------
function ParentBody({ t }: { t: Task }) {
  const store = useStore()
  const { state, roll, kids, dispatch } = store
  const { n, d, pct } = useFmt()
  const r = roll[t.id]
  const ch = kids[t.id] ?? []
  const scope = effectiveScope(state, t)
  const own = !!state.statusSets[t.id]
  const canOverride = t.kind === 'phase' || t.kind === 'stage' || t.kind === 'group'
  return (
    <>
      <section className="border-b px-5 py-4">
        <h3 className="mb-3 text-[13px] font-semibold">Roll-up از زیرمجموعه‌ها</h3>
        <div className="flex items-center gap-4">
          <ProgressRing value={r?.progress ?? 0} size={64} stroke={5} />
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div><div className="eyebrow">Progress وزنی</div><div className="num font-semibold">{pct(r?.progress ?? 0)}</div></div>
            <div><div className="eyebrow">صادرشده</div><div className="num font-semibold">{n(r?.done ?? 0)} از {n(r?.items ?? 0)}</div></div>
            <div><div className="eyebrow">Estimation</div><div className="num font-semibold">{n(r?.est ?? 0)} نفر-ساعت</div></div>
            <div><div className="eyebrow">بازه</div><div className="num font-semibold">{d(r?.start)} ← {d(r?.due)}</div></div>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">تسک‌های والد قابل تخصیص و Estimation نیستند؛ Progress، Estimation و بازه‌ی زمانی از Documentها و تسک‌های دستی زیرمجموعه جمع می‌شود. Progress والد با Weight هر فرزند وزن‌دهی می‌شود.</p>
        {(r?.unassigned ?? 0) > 0 && <p className="mt-2 text-[12px]"><span className="num font-semibold">{n(r.unassigned)}</span> تسک این شاخه در استخر Unassigned است.</p>}
      </section>
      {canOverride && (
        <section className="border-b px-5 py-4">
          <h3 className="mb-3 text-[13px] font-semibold">Status Set این بخش</h3>
          <div className="flex flex-wrap items-center gap-1.5">{state.statusSets[scope].map((s) => <StatusPill key={s.id} status={s} />)}</div>
          <p className="mt-2 text-[12px] text-muted-foreground">{own ? 'این بخش Status Set خودش را دارد (Override) و زیرمجموعه‌ها از آن ارث می‌برند.' : 'از بخش یا پروژه‌ی بالاتر ارث می‌برد.'} مدیریت در «مدیریت › Statusها».</p>
        </section>
      )}
      <section className="border-b px-5 py-4">
        <h3 className="mb-3 text-[13px] font-semibold">زیرمجموعه‌ها ({n(ch.length)})</h3>
        <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-background/45">
          {ch.map((c) => {
            const cr = roll[c.id]
            return (
              <button key={c.id} className={cn('flex items-center gap-2 px-3 py-2 text-start text-[13px] hover:bg-foreground/[0.035]', c.removedFromMdr && 'opacity-60')} onClick={() => dispatch({ type: 'openTask', id: c.id })}>
                <ProgressRing value={cr?.progress ?? 0} size={18} stroke={2.5} label={false} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.weight != null && <span className={cn('num text-[11px]', c.weightDerived ? 'text-azure' : 'text-muted-foreground')}>وزن {n(c.weight, 1)}{c.weightDerived ? '*' : ''}</span>}
                {isWorkItem(c) && <StatusPill status={statusOf(state, c)} />}
              </button>
            )
          })}
        </div>
        {ch.some((c) => c.weightDerived) && <p className="mt-2 text-[11.5px] text-muted-foreground">* Weight این سندها در MDR خالی بود؛ وزن والد به‌طور مساوی تقسیم شد.</p>}
      </section>
    </>
  )
}

// ---------------- A. Identity and classification ----------------
function IdentityList({ t }: { t: Task }) {
  const { state, teamById } = useStore()
  const { n } = useFmt()
  const source = isWorkItem(t) ? (t.source === 'mdr' ? `MDR — ردیف ${n(t.mdrRow ?? 0)}` : 'دستی')
    : t.kind === 'supervision' ? 'نظارت و اجرا' : t.kind === 'internal' ? `فضای تیم ${teamById[t.teamSpaceId ?? '']?.name ?? ''}` : FIN_SPACE_FA[finSpaceOf(t) ?? 'finance']
  const parent = t.kind === 'manual' && t.parentId ? state.tasks[t.parentId] : undefined
  // a manual subtask is classified like the document it belongs to
  const pkg = t.pkg ?? parent?.pkg
  const floor = t.floor ?? parent?.floor
  return (
    <div className="mb-3 rounded-xl border bg-background/45 p-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {hasField(t, 'docNumber') && <Field label={L('docNumber')}><span className="mono">{t.docNumber ?? parent?.docNumber ?? '—'}</span></Field>}
        <Field label={L('source')}>{source}</Field>
        {hasField(t, 'pkg') && <Field label={L('pkg')}><span className="mono">{pkg ?? '—'}</span></Field>}
        {hasField(t, 'floor') && <Field label={L('floor')}><span className="mono">{floor && floor !== '—' ? floor : '—'}</span></Field>}
      </dl>
      {t.source === 'mdr' && <p className="mt-2 text-[11px] text-muted-foreground">این مقادیر از MDR می‌آیند و فقط با Sync تغییر می‌کنند.</p>}
      {parent && <p className="mt-2 text-[11px] text-muted-foreground">زیرتسک سند «{parent.name}»؛ Package و Floor از همان سند است.</p>}
    </div>
  )
}

function SectionA({ t }: { t: Task }) {
  const { state, dispatch, can, kids } = useStore()
  const { n } = useFmt()
  const editable = isFlowTask(t) ? can.manageFlow(t) : can.planTask(t)
  const init = { name: t.name, description: t.description ?? '', type: t.type ?? 'other', priority: t.priority ?? 'normal', location: t.location ?? '', ip: t.internalProjectId ?? 'none' }
  const [f, setF] = useState(init)
  const dirty = JSON.stringify(f) !== JSON.stringify(init)
  const save = () => {
    if (!f.name.trim()) { toast.error('عنوان خالی است.'); return }
    const patch: Partial<Task> = { description: f.description.trim() || undefined, priority: f.priority as Priority }
    if (hasField(t, 'type')) patch.type = f.type as TaskType
    if (isFlowTask(t)) Object.assign(patch, { name: f.name.trim(), location: t.kind === 'supervision' ? f.location.trim() || undefined : undefined })
    if (t.kind === 'internal' && !t.parentId) patch.internalProjectId = f.ip === 'none' ? undefined : f.ip
    dispatch({ type: 'updateTask', taskId: t.id, patch })
    toast.success('مشخصات تسک ذخیره شد')
  }
  const sub = t.kind === 'document' ? (kids[t.id] ?? []).filter((c) => c.kind === 'manual') : t.kind === 'internal' ? Object.values(state.tasks).filter((c) => c.parentId === t.id) : []
  const [subName, setSubName] = useState('')
  const canAddSub = t.kind === 'document' ? (can.planTask(t) || can.createProjectTask(t.projectId)) : t.kind === 'internal' && !t.parentId ? can.seeTeam(t.teamSpaceId ?? '') : false
  const addSub = () => {
    if (!subName.trim()) return
    if (t.kind === 'document') {
      const statuses = statusesFor(state, t)
      dispatch({ type: 'addTask', task: { id: `M-${t.projectId}-${Date.now().toString(36)}`, projectId: t.projectId, parentId: t.id, kind: 'manual', name: subName.trim(), source: 'manual', order: t.order + 0.5, statusId: statuses[0].id } })
    } else {
      dispatch({ type: 'createFlowTask', task: { id: `IN-${Date.now().toString(36).toUpperCase()}`, projectId: t.projectId, parentId: t.id, kind: 'internal', name: subName.trim(), source: 'manual', order: t.order + 0.5, teamSpaceId: t.teamSpaceId, internalProjectId: t.internalProjectId, priority: 'normal', type: t.type } })
    }
    setSubName('')
    toast.success('زیرتسک ساخته شد', { description: 'برای ارجاع و برنامه‌ریزی، آن را باز کنید.' })
  }
  return (
    <Section id="a" aside={!editable ? <LockNote text="فقط خواندنی" /> : undefined}>
      <IdentityList t={t} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isFlowTask(t) && <div className="sm:col-span-2"><Label htmlFor="a-name" className="eyebrow">{L('name')}</Label><Input id="a-name" className="mt-1 h-9" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!editable} /></div>}
        {hasField(t, 'type') && (
          <div>
            <Label htmlFor="a-type" className="eyebrow">{L('type')}</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as TaskType })} disabled={!editable}>
              <SelectTrigger id="a-type" className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(TYPE_FA) as TaskType[]).map((k) => <SelectItem key={k} value={k}>{TYPE_FA[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="a-prio" className="eyebrow">{L('priority')}</Label>
          <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v as Priority })} disabled={!editable}>
            <SelectTrigger id="a-prio" className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(PRIORITY_FA) as Priority[]).map((k) => <SelectItem key={k} value={k}>{PRIORITY_FA[k]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {t.kind === 'supervision' && <div className="sm:col-span-2"><Label htmlFor="a-loc" className="eyebrow inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {L('location')}</Label><Input id="a-loc" className="mt-1 h-9" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} disabled={!editable} /></div>}
        {t.kind === 'internal' && !t.parentId && (
          <div className="sm:col-span-2">
            <Label htmlFor="a-ip" className="eyebrow">{L('internalProjectId')}</Label>
            <Select value={f.ip} onValueChange={(v) => setF({ ...f, ip: v })} disabled={!editable}>
              <SelectTrigger id="a-ip" className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">بدون پروژه‌ی داخلی</SelectItem>{state.internalProjects.filter((p) => p.teamId === t.teamSpaceId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="sm:col-span-2"><Label htmlFor="a-desc" className="eyebrow">{L('description')}</Label><Textarea id="a-desc" className="mt-1 min-h-[64px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={!editable} placeholder={editable ? 'شرح کار، محدوده و نکته‌های تحویل' : 'شرحی ثبت نشده'} /></div>
      </div>
      {editable && dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setF(init)}>بازگردانی</Button>
          <Button size="sm" onClick={save}>ذخیره‌ی مشخصات</Button>
        </div>
      )}

      {hasField(t, 'subtasks') && !(t.kind === 'internal' && t.parentId) && (
        <div className="mt-4">
          <div className="eyebrow mb-2">{L('subtasks')} ({n(sub.length)})</div>
          {!!t.mdrSubtasks?.length && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px]" id="mdr-subtasks">
              <span className="text-muted-foreground">مراحل کار در MDR:</span>
              {t.mdrSubtasks.map((x) => <span key={x} className="rounded-full border bg-background/60 px-2 py-0.5">{x}</span>)}
            </div>
          )}
          {sub.length > 0 && (
            <div className="mb-2 flex flex-col divide-y overflow-hidden rounded-xl border bg-background/45">
              {sub.map((c) => (
                <button key={c.id} className="flex items-center gap-2 px-3 py-2 text-start text-[13px] hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'openTask', id: c.id })}>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {isFlowTask(c) ? <FlowPill state={flowOf(c)} /> : <StatusPill status={statusOf(state, c)} />}
                </button>
              ))}
            </div>
          )}
          {canAddSub ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addSub() }}>
              <Input id="drawer-subtask" value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="مثلاً: رندر، ارائه، طراحی جزئیات" className="h-9" />
              <Button type="submit" variant="outline" className="h-9"><Plus className="h-4 w-4" /> افزودن</Button>
            </form>
          ) : <p className="text-[12px] text-muted-foreground">زیرتسک را برنامه‌ریز همین تسک می‌سازد.</p>}
        </div>
      )}
    </Section>
  )
}

// ---------------- B. People ----------------
function PersonLine({ label, user, empty = '—' }: { label: string; user?: User; empty?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex h-9 items-center gap-2 text-[13px]">{user ? <><Initials user={user} size={24} /><span className="truncate">{user.name}</span></> : <span className="text-muted-foreground">{empty}</span>}</div>
    </div>
  )
}

function SectionB({ t, plan }: { t: Task; plan?: Plan }) {
  const { state, dispatch, can, userById, activeUsers } = useStore()
  const flow = isFlowTask(t)
  const manage = flow ? can.manageFlow(t) : can.planTask(t)
  const f = flowOf(t)
  const [assignee, setAssignee] = useState<string | undefined>(t.assigneeUserId)
  const project = state.projects.find((p) => p.id === t.projectId)
  // the people a task can be given to are those of the space it lives in
  const executors = t.kind === 'internal' ? activeUsers.filter((u) => u.teamId === t.teamSpaceId) : isFinTask(t) ? activeUsers.filter((u) => canSeeFinSpace(u, finSpaceOf(t))) : project ? activeUsers.filter((u) => projectTeams(project).includes(u.teamId)) : activeUsers
  const reviewerPool = t.kind === 'supervision' ? activeUsers.filter((u) => u.role === 'inspector' || u.role === 'ceo') : t.kind === 'internal' || isFinTask(t) ? executors : activeUsers
  const reviewLocked = t.flow === 'in_review'
  const setReviewer = (id?: string) => {
    if (id && id === t.assigneeUserId) { toast.error('Reviewer نمی‌تواند مسئول همین تسک باشد.'); return }
    if (t.kind === 'supervision' && !id) { toast.error('مورد نظارتی باید Reviewer داشته باشد.'); return }
    dispatch({ type: 'updateTask', taskId: t.id, patch: { reviewerId: id } })
    toast.success(id ? `Reviewer: ${userById[id]?.name}` : 'Reviewer برداشته شد')
  }
  const parts = t.participantIds ?? []
  const addPart = (id?: string) => { if (id && !parts.includes(id)) dispatch({ type: 'updateTask', taskId: t.id, patch: { participantIds: [...parts, id] } }) }
  const removePart = (id: string) => dispatch({ type: 'updateTask', taskId: t.id, patch: { participantIds: parts.filter((x) => x !== id) } })
  const assignNow = () => {
    if (!assignee) return
    dispatch({ type: 'flow', taskId: t.id, op: 'assign', assigneeId: assignee })
    toast.success(`ارجاع به ${userById[assignee]?.name}`, { description: `${L('assignee')} اعلان گرفت.` })
  }
  const lockText = !flow ? 'تعیین افراد با برنامه‌ریز' : isFinTask(t) ? 'ارجاع با مدیرعامل یا سازنده‌ی Task' : 'ارجاع با ناظر یا سرپرست'
  return (
    <Section id="b" aside={!manage ? <LockNote text={lockText} /> : undefined}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {flow ? (
          <div className="sm:col-span-2">
            <Label htmlFor="b-assignee" className="eyebrow">{L('assignee')}</Label>
            <div className="flex gap-2">
              <div className="flex-1"><UserSelect id="b-assignee" value={assignee} onChange={setAssignee} users={executors.filter((u) => u.id !== t.reviewerId)} grouped={t.kind === 'supervision'} noneLabel={`بدون ${L('assignee')}`} disabled={!manage || f === 'closed' || f === 'in_review'} /></div>
              {manage && assignee && assignee !== t.assigneeUserId && f !== 'closed' && f !== 'in_review' && <Button className="mt-1 h-9" onClick={assignNow}><Send className="h-4 w-4" /> ارجاع</Button>}
            </div>
          </div>
        ) : plan && <ResourceField t={t} plan={plan} />}
        <PersonLine label={L('reporter')} user={userById[t.reporterId ?? t.createdBy ?? '']} empty={t.source === 'mdr' ? 'MDR' : '—'} />
        <div>
          <Label htmlFor="b-reviewer" className="eyebrow">{L('reviewer')}</Label>
          <UserSelect id="b-reviewer" value={t.reviewerId} onChange={setReviewer} users={reviewerPool.filter((u) => u.id !== t.assigneeUserId)} noneLabel={t.kind === 'supervision' ? undefined : 'بدون Reviewer'} disabled={!manage || reviewLocked} />
        </div>
        <div className="sm:col-span-2">
          <div className="eyebrow">{L('participants')}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {parts.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 py-0.5 pe-1 ps-0.5 text-[12px]">
                <Initials user={userById[id]} size={20} />{userById[id]?.name}
                {manage && <button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`حذف ${userById[id]?.name}`} onClick={() => removePart(id)}><X className="h-3 w-3" /></button>}
              </span>
            ))}
            {!parts.length && !manage && <span className="text-[12px] text-muted-foreground">—</span>}
            {manage && (
              <Select value="" onValueChange={(v) => addPart(v)}>
                <SelectTrigger id="b-add-part" className="h-8 w-[170px] text-[12px]"><SelectValue placeholder="+ افزودن نفر" /></SelectTrigger>
                <SelectContent className="max-h-72">{executors.filter((u) => !parts.includes(u.id) && u.id !== t.assigneeUserId).map((u) => <SelectItem key={u.id} value={u.id}><span className="inline-flex items-center gap-2"><Initials user={u} size={18} />{u.name}</span></SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

/** Responsible person or team of a project work item. It is part of the plan: capacity is checked against the dates in section C. */
function ResourceField({ t, plan }: { t: Task; plan: Plan }) {
  const store = useStore()
  const { userById, teamById } = store
  const { res, setRes, canPlan, leadOnly, teamsOrdered, resDirty, validation, save } = plan
  return (
    <div className="sm:col-span-2">
      <Label htmlFor="drawer-assignee" className="eyebrow">{L('assignee')} (تیم یا نفر)</Label>
      {canPlan ? (
        <Select value={resourceKey(res)} onValueChange={(v) => setRes(parseKey(v))}>
          <SelectTrigger id="drawer-assignee" className="mt-1 h-9"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            {!leadOnly && <SelectItem value="none">بدون تخصیص (Unassigned)</SelectItem>}
            {teamsOrdered.map((tm) => (
              <SelectGroup key={tm.id}>
                <SelectLabel className="text-[11px] text-muted-foreground">{tm.name}</SelectLabel>
                <SelectItem value={`team:${tm.id}`}><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> کل تیم {tm.name}</span></SelectItem>
                {store.activeUsers.filter((u) => u.teamId === tm.id && u.capacity > 0).map((u) => <SelectItem key={u.id} value={`user:${u.id}`}><span className="inline-flex items-center gap-2"><Initials user={u} size={20} />{u.name}</span></SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div id="drawer-assignee" className="mt-1 flex h-9 items-center gap-2 text-[13px]">
          {t.assigneeUserId ? <><Initials user={userById[t.assigneeUserId]} size={24} />{userById[t.assigneeUserId]?.name}</>
            : t.assigneeTeamId ? <><Users className="h-4 w-4" /> تیم {teamById[t.assigneeTeamId]?.name}</> : <span className="text-muted-foreground">بدون تخصیص (Unassigned)</span>}
        </div>
      )}
      {resDirty && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
          {validation && !validation.ok
            ? <button type="button" className="inline-flex items-center gap-1 font-medium text-destructive hover:underline" onClick={() => jump('c')}><AlertTriangle className="h-3.5 w-3.5" /> با Start و Due فعلی تخصیص بیش از حد می‌شود — بخش C</button>
            : <span className="text-muted-foreground">تخصیص تازه با ظرفیت بازه‌ی Start تا Due (بخش C) سنجیده می‌شود.</span>}
          <Button size="sm" className="h-7" onClick={save}>ذخیره‌ی تخصیص</Button>
        </div>
      )}
    </div>
  )
}

// ---------------- C. Schedule and effort (project work items) ----------------
function resourceKey(r: Resource | null) { return r ? `${r.kind}:${r.id}` : 'none' }
function parseKey(k: string): Resource | null {
  if (k === 'none') return null
  const [kind, id] = k.split(':')
  return { kind: kind as 'user' | 'team', id }
}

type Plan = ReturnType<typeof usePlan>
/** Draft of the plan of a work item: who (section B), how much and when (section C). One save, one capacity check. */
function usePlan(t: Task) {
  const store = useStore()
  const { state, dispatch, can, userById, teamById, projectById, me } = store
  const { n, d } = useFmt()
  const canPlan = can.planTask(t)
  const leadOnly = canPlan && me.role === 'lead' && !can.perm('plan.all')
  const initialRes: Resource | null = t.assigneeUserId ? { kind: 'user', id: t.assigneeUserId } : t.assigneeTeamId ? { kind: 'team', id: t.assigneeTeamId } : null
  const [res, setRes] = useState<Resource | null>(initialRes)
  const [est, setEst] = useState<string>(t.estimation ? String(t.estimation) : '')
  const [start, setStart] = useState<string | undefined>(t.start)
  const [due, setDue] = useState<string | undefined>(t.due)
  const estN = Number(est)
  const resDirty = resourceKey(res) !== resourceKey(initialRes)
  const dirty = resDirty || (t.estimation ?? '') !== (est ? estN : '') || t.start !== start || t.due !== due
  const planner = useMemo(() => store.planner(t.id), [state.allocations, state.leaves, state.holidays, t.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const validation = useMemo(() => {
    if (!res || !start || !due || !estN) return null
    return planner.validate(res, start, due, estN)
  }, [planner, res, start, due, estN])
  const resName = res ? (res.kind === 'user' ? userById[res.id]?.name : `تیم ${teamById[res.id]?.name}`) : ''
  const project = projectById[t.projectId]
  const relatedTeams = [project.phase1TeamId, project.phase2TeamId, 'rvt', 'ctl', 'rd', 'int', 'prs', 'ren']
  const teamsOrdered = [...state.teams].filter((tm) => !leadOnly || tm.id === me.teamId).sort((a, b) => (relatedTeams.indexOf(a.id) === -1 ? 99 : relatedTeams.indexOf(a.id)) - (relatedTeams.indexOf(b.id) === -1 ? 99 : relatedTeams.indexOf(b.id)))
  const suggest = () => {
    if (!res || !start || !estN) { toast.error('برای پیشنهاد Due Date، مسئول (بخش B)، Start و Estimation را وارد کنید.'); return }
    const sd = planner.suggestDue(res, start, estN)
    if (!sd) { toast.error('در افق برنامه‌ریزی ظرفیت آزاد کافی پیدا نشد.'); return }
    setDue(sd)
    toast.success(`Due Date پیشنهادی: ${d(sd)}`, { description: `نزدیک‌ترین تاریخی که ${n(estN)} نفر-ساعت در ظرفیت آزاد ${resName} جا می‌شود.` })
  }
  const save = () => {
    if (start && due && due < start) { toast.error('Due Date قبل از Start است.'); return }
    if (res && start && due && estN) {
      const v = planner.validate(res, start, due, estN)
      if (!v.ok) { toast.error('ذخیره انجام نشد: تخصیص بیش از حد', { description: 'جزئیات را در بخش C ببینید و Due Date، Start یا مسئول را تغییر دهید.' }); jump('c'); return }
      const teamId = res.kind === 'team' ? res.id : userById[res.id].teamId
      dispatch({ type: 'savePlan', taskId: t.id, assignee: res, estimation: estN, start, due, allocations: toAllocations(t.id, res, teamId, v.days) })
    } else {
      dispatch({ type: 'savePlan', taskId: t.id, assignee: res, estimation: estN || undefined, start, due, allocations: [] })
    }
    toast.success('برنامه‌ریزی ذخیره شد', { description: res ? undefined : 'تسک در استخر Unassigned کنترل پروژه ماند.' })
  }
  const reset = () => { setRes(initialRes); setEst(t.estimation ? String(t.estimation) : ''); setStart(t.start); setDue(t.due) }
  return { res, setRes, est, setEst, estN, start, setStart, due, setDue, dirty, resDirty, validation, resName, suggest, save, reset, canPlan, leadOnly, teamsOrdered }
}

function PlanningSection({ t, plan }: { t: Task; plan: Plan }) {
  const { state, dispatch } = useStore()
  const { n, d, dShort, h } = useFmt()
  const { canPlan, leadOnly, est, setEst, estN, start, setStart, due, setDue, validation, resName, res, suggest, save, reset, dirty } = plan
  const deps = (t.dependsOn ?? []).map((id) => state.tasks[id]).filter(Boolean)
  const depOptions = useMemo(() => Object.values(state.tasks).filter((x) => isWorkItem(x) && x.projectId === t.projectId && x.id !== t.id && !(t.dependsOn ?? []).includes(x.id) && !(x.dependsOn ?? []).includes(t.id)).sort((a, b) => a.order - b.order).slice(0, 200), [state.tasks, t])
  const openDeps = deps.filter((x) => statusOf(state, x)?.category !== 'done')
  return (
    <Section id="c" aside={!canPlan ? <LockNote text="کنترل پروژه، مدیر پروژه یا سرپرست تیم" /> : leadOnly ? <span className="text-[11.5px] text-muted-foreground">سرپرست: فقط داخل تیم خود</span> : undefined}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="drawer-est" className="eyebrow">{LU('estimation')}</Label>
          <Input id="drawer-est" type="number" min={0} step={0.5} inputMode="decimal" className="num mt-1 h-9" value={est} onChange={(e) => setEst(e.target.value)} disabled={!canPlan} />
          {t.baselineEstimation != null && <div className="mt-1 text-[11px] text-muted-foreground">{L('baselineEstimation')}: <span className="num">{n(t.baselineEstimation)}</span>{t.estimation != null && t.baselineEstimation !== t.estimation && <span className="text-destructive"> — تغییر کرده</span>}</div>}
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" className="h-9 w-full" onClick={suggest} disabled={!canPlan}><Sparkles className="h-4 w-4 text-azure" /> پیشنهاد Due Date</Button>
        </div>
        <div>
          <Label htmlFor="drawer-start" className="eyebrow">{L('start')}</Label>
          <div className="mt-1"><JalaliDateField id="drawer-start" value={start} onChange={setStart} disabled={!canPlan} /></div>
        </div>
        <div>
          <Label htmlFor="drawer-due" className="eyebrow">{L('due')}</Label>
          <div className="mt-1"><JalaliDateField id="drawer-due" value={due} onChange={setDue} disabled={!canPlan} /></div>
          {t.baselineDue && <div className="mt-1 text-[11px] text-muted-foreground">{L('baselineDue')}: <span className="num">{d(t.baselineDue)}</span>{t.due && t.baselineDue !== t.due && <span className="text-destructive"> — تغییر کرده</span>}</div>}
        </div>
        {hasField(t, 'planIssue') && (
          <dl className="sm:col-span-2"><Field label={`${L('planIssue')} (MDR)`}><span className="num">{d(t.planIssue)}</span></Field></dl>
        )}
      </div>

      {validation && validation.ok && (
        <div className="mt-4 rounded-xl border border-leaf/30 bg-leaf-soft px-3 py-2.5 text-[12.5px] text-leaf-ink">
          <div className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4" /> در ظرفیت جا می‌شود</div>
          <div className="num mt-0.5">ساعات آزاد {resName} بین Start و Due: {h(validation.free)} — Estimation: {h(estN)}</div>
        </div>
      )}
      {validation && !validation.ok && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-danger-soft px-3 py-2.5 text-[12.5px]" role="alert">
          <div className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> تخصیص بیش از حد</div>
          {validation.reason === 'range' ? <div className="mt-1">Due Date قبل از Start است.</div> : (
            <div className="num mt-1 leading-relaxed">
              {resName} بین {d(start)} تا {d(due)} فقط {h(validation.free)} ساعت آزاد دارد؛ <b>{h(validation.excess)} مازاد</b> نسبت به Estimation.
              {validation.fullDays.length > 0 && <> روزهای پر: {validation.fullDays.slice(0, 6).map((x) => dShort(x)).join('، ')}{validation.fullDays.length > 6 ? ' …' : ''}.</>}
              <div className="mt-1 text-muted-foreground">Due Date را عقب ببرید، Start را جلو بیاورید یا تسک را به نفر/تیم دیگری بدهید (بخش B). دکمه‌ی «پیشنهاد Due Date» نزدیک‌ترین تاریخ ممکن را پیدا می‌کند.</div>
            </div>
          )}
        </div>
      )}
      {res && (!start || !estN) && canPlan && <p className="mt-3 text-[12px] text-muted-foreground">برای ساختن Allocation روزبه‌روز، Start و Estimation لازم است.</p>}
      {!res && canPlan && <p className="mt-3 text-[12px] text-muted-foreground">مسئول در بخش B تعیین می‌شود؛ Allocation روزبه‌روز با همان مسئول ساخته می‌شود.</p>}
      {validation && validation.days.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow mb-2">{L('allocation')} روزبه‌روز (پر کردن از Start)</div>
          <div className="scroll-x thin-scroll">
            <div className="flex items-end gap-1 pb-1">
              {validation.days.map((x) => (
                <div key={x.date} className="flex w-9 shrink-0 flex-col items-center gap-1">
                  <span className="num text-[10px] text-muted-foreground">{n(x.hours, 1)}</span>
                  <div className="flex h-14 w-full items-end rounded-sm bg-secondary"><div className={cn('w-full rounded-sm', validation.ok ? 'bg-azure' : 'bg-destructive/70')} style={{ height: `${Math.min(100, (x.hours / (x.capacity || 8)) * 100)}%` }} /></div>
                  <span className="num text-[10px] text-muted-foreground">{dShort(x.date).split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {canPlan && (
        <div className="mt-4 flex items-center justify-end gap-2">
          {dirty && <Button variant="ghost" onClick={reset}>بازگردانی</Button>}
          <Button onClick={save} disabled={!dirty}>ذخیره‌ی برنامه‌ریزی</Button>
        </div>
      )}
      <AllocationSummary t={t} />

      <div className="mt-4 min-w-0 border-t pt-4">
        <div className="eyebrow">{L('dependsOn')} (Finish-to-Start)</div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {deps.map((x) => (
            <div key={x.id} className="flex items-center gap-2 rounded-lg border bg-background/45 px-2 py-1 text-[12.5px]">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <button className="min-w-0 flex-1 truncate text-start hover:underline" onClick={() => dispatch({ type: 'openTask', id: x.id })}>{x.docNumber ?? x.name}</button>
              <StatusPill status={statusOf(state, x)} />
              {canPlan && <button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label="حذف پیش‌نیاز" onClick={() => dispatch({ type: 'updateTask', taskId: t.id, patch: { dependsOn: (t.dependsOn ?? []).filter((y) => y !== x.id) } })}><X className="h-3 w-3" /></button>}
            </div>
          ))}
          {!deps.length && <span className="text-[12px] text-muted-foreground">پیش‌نیازی ثبت نشده.</span>}
          {canPlan && (
            <Select value="" onValueChange={(v) => dispatch({ type: 'updateTask', taskId: t.id, patch: { dependsOn: [...(t.dependsOn ?? []), v] } })}>
              <SelectTrigger id="c-add-dep" className="h-8 text-[12px]"><SelectValue placeholder="+ افزودن پیش‌نیاز از همین پروژه" /></SelectTrigger>
              <SelectContent className="max-h-72">{depOptions.map((x) => <SelectItem key={x.id} value={x.id}>{x.docNumber ? `${x.docNumber} — ` : ''}{x.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        {openDeps.length > 0 && <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {n(openDeps.length)} پیش‌نیاز هنوز تمام نشده است.</p>}
      </div>
    </Section>
  )
}

function AllocationSummary({ t }: { t: Task }) {
  const { state } = useStore()
  const { n } = useFmt()
  const total = state.allocations.filter((a) => a.taskId === t.id).reduce((s, a) => s + a.hours, 0)
  if (!total) return null
  return <div className="pt-3 text-[12px] text-muted-foreground">مجموع {L('allocation')} ذخیره‌شده: <span className="num font-medium text-foreground">{n(total, 1)}</span> نفر-ساعت</div>
}

// ---------------- C. Schedule (supervision / team / finance & admin) ----------------
function FlowPlanningSection({ t }: { t: Task }) {
  const { dispatch, can } = useStore()
  const { d, n } = useFmt()
  const manage = can.manageFlow(t)
  const withEst = hasField(t, 'estimation')
  const [est, setEst] = useState(t.estimation ? String(t.estimation) : '')
  const [start, setStart] = useState(t.start)
  const [due, setDue] = useState(t.due)
  const dirty = (withEst && (t.estimation ?? '') !== (est ? Number(est) : '')) || start !== t.start || due !== t.due
  const save = () => {
    if (start && due && due < start) { toast.error('Due Date قبل از Start است.'); return }
    dispatch({ type: 'updateTask', taskId: t.id, patch: withEst ? { estimation: Number(est) || undefined, start, due } : { start, due } })
    toast.success('برنامه‌ی تسک ذخیره شد')
  }
  return (
    <Section id="c" aside={!manage ? <LockNote text="فقط خواندنی" /> : undefined}>
      <div className={cn('grid grid-cols-1 gap-3', withEst ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {withEst && (
          <div>
            <Label htmlFor="fc-est" className="eyebrow">{LU('estimation')}</Label><Input id="fc-est" type="number" min={0} step={0.5} inputMode="decimal" className="num mt-1 h-9" value={est} onChange={(e) => setEst(e.target.value)} disabled={!manage} />
            {t.baselineEstimation != null && t.baselineEstimation !== t.estimation && <div className="mt-1 text-[11px] text-muted-foreground">{L('baselineEstimation')}: <span className="num">{n(t.baselineEstimation)}</span></div>}
          </div>
        )}
        <div><Label htmlFor="fc-start" className="eyebrow">{L('start')}</Label><div className="mt-1"><JalaliDateField id="fc-start" value={start} onChange={setStart} disabled={!manage} /></div></div>
        <div><Label htmlFor="fc-due" className="eyebrow">{L('due')}</Label><div className="mt-1"><JalaliDateField id="fc-due" value={due} onChange={setDue} disabled={!manage} /></div></div>
      </div>
      {t.baselineDue && <p className="mt-2 text-[11.5px] text-muted-foreground">{L('baselineDue')}: <span className="num">{d(t.baselineDue)}</span>{t.due && t.baselineDue !== t.due && <span className="text-destructive"> — تغییر کرده</span>}</p>}
      <p className="mt-1 text-[11.5px] text-muted-foreground">{isFinTask(t) ? 'Taskهای فضای مالی و فضای اداری در Workload، Work Log، امتیازدهی و گزارش‌های پروژه حساب نمی‌شوند.' : t.kind === 'internal' ? 'تسک تیم در Workload پروژه‌ها Allocation نمی‌گیرد؛ زمان صرف‌شده با Work Log (بخش D) ثبت می‌شود.' : 'زمان واقعی صرف‌شده با Work Log (بخش D) ثبت می‌شود.'}</p>
      {manage && dirty && <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => { setEst(t.estimation ? String(t.estimation) : ''); setStart(t.start); setDue(t.due) }}>بازگردانی</Button><Button size="sm" onClick={save}>ذخیره</Button></div>}
    </Section>
  )
}

// ---------------- D. Status, flow and actual dates ----------------
const STEPS: { key: FlowState[]; label: string }[] = [
  { key: ['open'], label: 'ثبت' }, { key: ['assigned'], label: 'ارجاع' }, { key: ['in_progress', 'rework'], label: 'اجرا' }, { key: ['in_review'], label: 'بررسی' }, { key: ['closed'], label: 'بسته' },
]
function FlowStepper({ f }: { f: FlowState }) {
  const at = STEPS.findIndex((s) => s.key.includes(f))
  return (
    <ol className="flex items-center gap-1" aria-label="مراحل گردش‌کار">
      {STEPS.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1" aria-current={i === at ? 'step' : undefined}>
          <span className={cn('flex h-6 min-w-0 flex-1 items-center justify-center rounded-full px-1.5 text-[11px] font-medium',
            i < at ? 'bg-leaf-soft text-leaf-ink' : i === at ? (f === 'rework' ? 'bg-destructive text-white' : f === 'closed' ? 'bg-leaf text-white' : 'bg-azure text-white') : 'bg-secondary text-muted-foreground')}>
            <span className="truncate">{i === at && f === 'rework' ? 'اصلاح' : s.label}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function ActualDates({ t }: { t: Task }) {
  const { dispatch, can } = useStore()
  const { d, n } = useFmt()
  const [edit, setEdit] = useState(false)
  const [a, setA] = useState({ s: t.actualStart, f: t.actualFinish, reason: '' })
  const late = t.actualFinish && t.due && t.actualFinish > t.due
  const save = () => {
    if (!a.reason.trim()) { toast.error('دلیل اصلاح را بنویسید.'); return }
    if (a.s && a.f && a.f < a.s) { toast.error('Actual Finish قبل از Actual Start است.'); return }
    dispatch({ type: 'setActual', taskId: t.id, actualStart: a.s, actualFinish: a.f, reason: a.reason.trim() })
    setEdit(false)
    toast.success('تاریخ واقعی اصلاح شد', { description: 'با دلیل در تاریخچه ثبت شد.' })
  }
  const daysLate = t.actualFinish && t.due ? Math.round((new Date(t.actualFinish).getTime() - new Date(t.due).getTime()) / 86400000) : 0
  return (
    <div className="mt-4 rounded-xl border bg-background/45 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">زمان واقعی</span>
        {can.perm('actual.edit') && !edit && <Button size="sm" variant="ghost" className="h-7" onClick={() => { setA({ s: t.actualStart, f: t.actualFinish, reason: '' }); setEdit(true) }}><Pencil className="h-3.5 w-3.5" /> اصلاح</Button>}
      </div>
      {!edit ? (
        <dl className="mt-1.5 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
          <div><dt className="eyebrow">Actual Start</dt><dd className="num font-medium">{d(t.actualStart)}</dd></div>
          <div><dt className="eyebrow">Actual Finish</dt><dd className={cn('num font-medium', late && 'text-destructive')}>{d(t.actualFinish)}</dd></div>
          <div className="col-span-2 sm:col-span-1"><dt className="eyebrow">نسبت به Due</dt><dd className="text-[12.5px]">{!t.actualFinish ? (t.due && t.due < TODAY ? <span className="font-semibold text-destructive">گذشته از موعد</span> : <span className="text-muted-foreground">باز</span>) : daysLate > 0 ? <span className="num text-destructive">{n(daysLate)} روز دیرتر</span> : daysLate < 0 ? <span className="num text-leaf-ink">{n(-daysLate)} روز زودتر</span> : 'سر موعد'}</dd></div>
        </dl>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><Label htmlFor="act-s" className="eyebrow">Actual Start</Label><div className="mt-1"><JalaliDateField id="act-s" value={a.s} onChange={(v) => setA({ ...a, s: v })} /></div></div>
          <div><Label htmlFor="act-f" className="eyebrow">Actual Finish</Label><div className="mt-1"><JalaliDateField id="act-f" value={a.f} onChange={(v) => setA({ ...a, f: v })} /></div></div>
          <div className="sm:col-span-2"><Label htmlFor="act-r" className="eyebrow">دلیل اصلاح (الزامی)</Label><Input id="act-r" className="mt-1 h-9" value={a.reason} onChange={(e) => setA({ ...a, reason: e.target.value })} placeholder="مثلاً: کار پیش از ثبت در سامانه شروع شده بود" /></div>
          <div className="flex gap-2 sm:col-span-2"><Button size="sm" onClick={save}>ثبت اصلاح</Button><Button size="sm" variant="ghost" onClick={() => setEdit(false)}>انصراف</Button></div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">خودکار: Start با اولین شروع کار، Finish با بسته شدن یا تأیید Reviewer. اصلاح دستی فقط کنترل پروژه و مدیرعامل، با دلیل.</p>
    </div>
  )
}

function SectionD({ t }: { t: Task }) {
  const { state, dispatch, can } = useStore()
  const { n, pct } = useFmt()
  const [reason, setReason] = useState('')
  if (isWorkItem(t)) {
    const statuses = statusesFor(state, t)
    const s = statusOf(state, t)
    const scope = effectiveScope(state, t)
    const editStatus = can.editStatus(t) && t.flow !== 'in_review'
    const queued = state.writeQueue.find((w) => w.taskId === t.id)
    const options = t.reviewerId ? statuses.filter((x) => x.category !== 'done' || x.id === s?.id) : statuses
    return (
      <Section id="d" aside={!can.editStatus(t) ? <LockNote text="فقط مسئول، تیم مسئول یا برنامه‌ریز" /> : t.flow === 'in_review' ? <LockNote text="در انتظار تصمیم Reviewer" /> : undefined}>
        <div className="flex items-center gap-3">
          <ProgressRing value={s?.progress ?? 0} size={44} stroke={4} />
          <div className="flex-1">
            <Label htmlFor="drawer-status" className="sr-only">{L('status')}</Label>
            <Select value={s?.id} onValueChange={(v) => { dispatch({ type: 'setStatus', taskId: t.id, statusId: v }); toast.success('Status تغییر کرد', { description: t.source === 'mdr' ? `Write-back به MDR با تأخیر ${n(WRITEBACK_DELAY_SEC / 60)} دقیقه انجام می‌شود.` : undefined }) }} disabled={!editStatus}>
              <SelectTrigger id="drawer-status" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{options.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} ({pct(x.progress)})</SelectItem>)}</SelectContent>
            </Select>
            <div className="mt-1.5 text-[11.5px] text-muted-foreground">
              Status Set: {scope === 'office' ? 'پیش‌فرض دفتر' : state.tasks[scope] ? `Override در «${state.tasks[scope].name}»` : 'سطح پروژه'}، {L('progress')} از Status می‌آید
              {t.reviewerId && <> — Status نهایی فقط با تأیید Reviewer (بخش E)</>}
            </div>
          </div>
        </div>
        {hasField(t, 'weight') && (
          <dl className="mt-3 rounded-xl border bg-background/45 px-3 py-2">
            <Field label={`${L('weight')} در Roll-up والد (MDR)`}>
              <span className="num">{t.weight != null ? n(t.weight, 2) : '—'}</span>{t.weightDerived && <span className="ms-1 text-[11px] text-azure">تقسیم مساوی (در MDR خالی بود)</span>}
            </Field>
          </dl>
        )}
        {queued && <div className="mt-3 flex items-center gap-2 rounded-md bg-azure-soft px-3 py-2 text-[12px] text-azure-ink"><CornerDownLeft className="h-3.5 w-3.5" /> در صف Write-back: Last Status «{queued.statusName}» و Progress {pct(queued.progress)}</div>}
        <ActualDates t={t} />
        <WorkLogPanel t={t} />
        <PointArea t={t} />
      </Section>
    )
  }
  const f = flowOf(t)
  const executor = can.executor(t)
  const decide = can.decideReview(t)
  const manage = can.manageFlow(t)
  const selfClose = (t.kind === 'internal' || isFinTask(t)) && !t.reviewerId
  return (
    <Section id="d">
      <FlowStepper f={f} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {executor && (f === 'assigned' || f === 'rework') && <Button onClick={() => { dispatch({ type: 'flow', taskId: t.id, op: 'start' }); toast.success(f === 'rework' ? 'اصلاح شروع شد' : 'کار شروع شد', { description: t.actualStart ? undefined : 'Actual Start ثبت شد.' }) }}><Play className="h-4 w-4" /> {f === 'rework' ? 'شروع اصلاح' : 'شروع کار'}</Button>}
        {executor && (f === 'in_progress' || f === 'rework') && (t.reviewerId || t.kind === 'supervision') && <Button variant="outline" onClick={() => jump('e')}><ArrowDown className="h-4 w-4" /> ارسال برای بررسی</Button>}
        {(executor || manage) && selfClose && (f === 'in_progress' || f === 'rework') && <Button onClick={() => { dispatch({ type: 'flow', taskId: t.id, op: 'complete' }); toast.success('کار بسته شد', { description: 'Actual Finish ثبت شد.' }) }}><CheckCircle2 className="h-4 w-4" /> بستن کار</Button>}
        {f === 'in_review' && decide && <Button variant="outline" onClick={() => jump('e')}><ArrowDown className="h-4 w-4" /> تصمیم درباره‌ی بررسی</Button>}
        {f === 'open' && manage && <span className="text-[12px] text-muted-foreground">برای شروع گردش‌کار، در بخش B مسئول را انتخاب و «ارجاع» بزنید.</span>}
        {f === 'assigned' && !executor && <span className="text-[12px] text-muted-foreground">منتظر شروع کار توسط مسئول.</span>}
        {f === 'in_review' && !decide && <span className="text-[12px] text-muted-foreground">منتظر تصمیم Reviewer.</span>}
      </div>
      {f === 'closed' && (decide || manage) && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) { toast.error('دلیل بازگشایی را بنویسید.'); return } dispatch({ type: 'flow', taskId: t.id, op: 'reopen', note: reason.trim() }); setReason(''); toast('تسک دوباره باز شد', { description: 'Actual Finish پاک شد و مسئول اعلان گرفت.' }) }}>
          <Input id="d-reopen" className="h-9" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل بازگشایی" />
          <Button type="submit" variant="outline" className="h-9"><RotateCcw className="h-4 w-4" /> بازگشایی</Button>
        </form>
      )}
      <FlowProgress t={t} />
      <ActualDates t={t} />
      {hasField(t, 'worklog') && <WorkLogPanel t={t} />}
      {hasField(t, 'point') && <PointArea t={t} />}
    </Section>
  )
}

/** Progress of a flow task. Finance & admin tasks take a percentage from the person doing the work (or the managers of the task). */
function FlowProgress({ t }: { t: Task }) {
  const { dispatch, can, me } = useStore()
  const { pct, n } = useFmt()
  const f = flowOf(t)
  const value = flowProgress(t)
  const manual = isFinTask(t)
  const canEdit = manual && f !== 'closed' && f !== 'in_review' && (t.assigneeUserId === me.id || can.manageFlow(t))
  const [v, setV] = useState(t.progressPct ?? 0)
  const save = () => { dispatch({ type: 'updateTask', taskId: t.id, patch: { progressPct: v } }); toast.success(`پیشرفت: ${pct(v)}`, { description: 'در تاریخچه‌ی Task ثبت شد.' }) }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-background/45 p-3">
      <ProgressRing value={canEdit ? v : value} size={40} stroke={4} />
      <div className="min-w-0 flex-1">
        <Label htmlFor="d-progress" className="eyebrow">{L('progress')}</Label>
        {canEdit ? (
          <div className="mt-1 flex items-center gap-2">
            <input id="d-progress" type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} className="h-2 min-w-0 flex-1 accent-[hsl(var(--azure))]" aria-valuetext={pct(v)} />
            <span className="num w-10 shrink-0 text-end text-[12.5px] font-semibold">{n(v)}٪</span>
            {v !== (t.progressPct ?? 0) && <Button size="sm" className="h-8" onClick={save}>ثبت پیشرفت</Button>}
          </div>
        ) : (
          <div className="num mt-0.5 text-[13px] font-semibold">{pct(value)}</div>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">{manual ? (f === 'closed' ? 'Task بسته شده است.' : f === 'in_review' ? 'تا تصمیم Reviewer ثابت می‌ماند.' : 'درصد پیشرفت را مسئول Task (یا مدیرعامل و سازنده‌ی آن) ثبت می‌کند؛ با بسته شدن ۱۰۰٪ می‌شود.') : 'از مرحله‌ی گردش‌کار می‌آید.'}</p>
      </div>
    </div>
  )
}

/** W.F and Point: the scoring parameters and their result, in one place */
function PointArea({ t }: { t: Task }) {
  const { dispatch, can } = useStore()
  const canWf = can.perm('points.manage')
  const [wf, setWf] = useState(t.wf != null ? String(t.wf) : '1')
  const saveWf = () => {
    const v = Number(wf)
    if (!(v >= 0.1 && v <= 5)) { toast.error('W.F باید بین ۰٫۱ و ۵ باشد.'); return }
    dispatch({ type: 'updateTask', taskId: t.id, patch: { wf: v } })
    toast.success('W.F ذخیره شد', { description: 'اگر تسک تمام شده باشد، امتیاز آن با W.F تازه دوباره محاسبه شد.' })
  }
  return (
    <>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-[150px]">
          <Label htmlFor="c-wf" className="eyebrow">{TASK_FIELDS.wf.label}</Label>
          <div className="mt-1 flex gap-1.5">
            <Input id="c-wf" type="number" min={0.1} max={5} step={0.1} inputMode="decimal" className="num h-9" value={wf} onChange={(e) => setWf(e.target.value)} disabled={!canWf} />
            {canWf && Number(wf) !== (t.wf ?? 1) && <Button size="sm" variant="outline" className="h-9" onClick={saveWf}>ثبت</Button>}
          </div>
        </div>
        <p className="pb-2 text-[11px] text-muted-foreground">{canWf ? 'پارامتر امتیاز این تسک' : 'پارامتر امتیاز؛ با مدیرعامل و کنترل پروژه'}</p>
      </div>
      <TaskPointBlock t={t} />
    </>
  )
}

// ---------------- D. Point of the task ----------------
/** The assignee sees how the task affects their own points; CEO and Project Control see the full calculation and can act on it */
function TaskPointBlock({ t }: { t: Task }) {
  const { state, dispatch, can, me, userById } = useStore()
  const { n } = useFmt()
  const sg = useSigned()
  const manage = can.perm('points.manage')
  if (!manage && t.assigneeUserId !== me.id) return null
  const cfg = currentPointConfig(state)
  const holidays = new Set(state.holidays.map((h) => h.date))
  const active = activeAward(state.pointEntries, t.id)
  const history = state.pointEntries.filter((e) => e.taskId === t.id)
  const closed = isClosed(state, t)
  const preview = !closed ? calcPoint(t, TODAY, cfg, holidays) : null
  const stale = active && active.calc!.configVersion !== cfg.version
  const who = t.assigneeUserId && t.assigneeUserId !== me.id ? userById[t.assigneeUserId]?.name : null
  return (
    <div className="mt-3 rounded-xl border bg-background/45 p-3" id="task-point">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Point{who ? ` — ${who}` : ' — تأثیر روی امتیاز شما'}</span>
        {manage && closed && <Button size="sm" variant="ghost" className="h-7" onClick={() => { dispatch({ type: 'pointRecalc', taskId: t.id }); toast(stale ? 'با پارامترهای تازه بازمحاسبه شد' : 'امتیاز به‌روز است؛ تغییری لازم نبود') }}><RotateCcw className="h-3.5 w-3.5" /> بازمحاسبه</Button>}
      </div>
      {active ? (
        <div className="mt-1.5">
          <div className={cn('num text-[22px] font-bold leading-tight', deltaCls(active.points))}>{sg(active.points)}</div>
          <div className="text-[12.5px]">{calcSentence(active.calc!, (x) => n(x))}{active.calc!.direction === 'ontime' ? ' — امتیاز مثبت یا منفی ندارد' : ''}</div>
          <div className="num mt-0.5 text-[11.5px] text-muted-foreground" dir="ltr" style={{ textAlign: 'right' }}>{calcFormula(active.calc!, active.points, (x, f) => n(x, f ?? 0))}</div>
          {manage && stale && <p className="mt-1 text-[11.5px] text-muted-foreground">با پارامترهای نسخه‌ی {n(active.calc!.configVersion)} ثبت شده؛ نسخه‌ی فعلی {n(cfg.version)} است.</p>}
        </div>
      ) : closed ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{(() => { const r = t.actualFinish ? calcPoint(t, t.actualFinish, cfg, holidays) : null; return r && !r.ok ? `امتیازی ثبت نشد: ${r.reason}.` : 'امتیازی ثبت نشده است.' })()}</p>
      ) : preview && preview.ok ? (
        <div className="mt-1.5 text-[12.5px]">
          <span className="text-muted-foreground">اگر امروز تمام شود: </span><b className={cn('num', deltaCls(preview.points))}>{sg(preview.points)}</b>
          <span className="text-muted-foreground"> ({calcSentence(preview.calc, (x) => n(x))})</span>
          <div className="text-[11.5px] text-muted-foreground">با اتمام تسک{t.reviewerId ? ' (تأیید Reviewer)' : ''} خودکار ثبت می‌شود.</div>
        </div>
      ) : <p className="mt-1.5 text-[12.5px] text-muted-foreground">برای محاسبه‌ی Point {preview && !preview.ok ? preview.reason.replace('ندارد', 'لازم است') : 'Estimation و Due لازم است'}.</p>}
      {manage && history.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-[11.5px] text-muted-foreground">
          {[...history].reverse().map((e) => <li key={e.id} className="flex gap-2"><span className={cn('num w-12 shrink-0 font-semibold', e.reversedBy ? 'line-through' : deltaCls(e.points))}>{sg(e.points)}</span><span className="min-w-0 flex-1 truncate">{e.kind === 'reversal' ? 'برگشت' : e.kind === 'adjust' ? 'اصلاح' : 'ثبت'} — {e.reason}</span></li>)}
        </ul>
      )}
    </div>
  )
}

// ---------------- E. Review rounds & attachments ----------------
function SectionE({ t }: { t: Task }) {
  const { state, dispatch, can, userById, me } = useStore()
  const { time, clock, n } = useFmt()
  const rounds = state.reviewRounds.filter((r) => r.taskId === t.id).sort((a, b) => a.round - b.round)
  const files = state.attachments.filter((a) => a.taskId === t.id)
  const loose = files.filter((f) => !f.roundId)
  const f = flowOf(t)
  const [note, setNote] = useState('')
  const [rfiles, setRfiles] = useState<NewFile[]>([])
  const [decision, setDecision] = useState('')
  const [extra, setExtra] = useState<NewFile[]>([])
  const work = isWorkItem(t)
  const done = work && statusOf(state, t)?.category === 'done'
  const canSubmit = work
    ? !!t.reviewerId && can.editStatus(t) && t.reviewerId !== me.id && t.flow !== 'in_review' && !done
    : can.executor(t) && (f === 'in_progress' || f === 'rework') && (!!t.reviewerId || t.kind === 'supervision' || t.kind === 'internal')
  const canDecide = (work ? t.flow === 'in_review' : f === 'in_review') && can.decideReview(t)
  const involved = [t.assigneeUserId, t.reporterId, t.reviewerId, ...(t.participantIds ?? [])].includes(me.id)
  const canAttach = involved || can.planTask(t) || can.editStatus(t) || can.manageFlow(t)
  const submit = () => {
    if (!note.trim()) { toast.error('شرح کار انجام‌شده را بنویسید.'); return }
    dispatch({ type: 'flow', taskId: t.id, op: 'submit', note: note.trim(), files: rfiles })
    setNote(''); setRfiles([])
    toast.success('برای بررسی ارسال شد', { description: 'Reviewer اعلان گرفت.' })
  }
  const decideNow = (op: 'approve' | 'rework') => {
    if (op === 'rework' && !decision.trim()) { toast.error('دلیل بازگشت برای اصلاح را بنویسید.'); return }
    dispatch({ type: 'flow', taskId: t.id, op, note: decision.trim() || undefined })
    setDecision('')
    toast.success(op === 'approve' ? 'تأیید شد و تسک بسته شد' : 'برای اصلاح برگشت', { description: op === 'approve' ? 'Actual Finish ثبت شد.' : 'مجری اعلان گرفت.' })
  }
  return (
    <Section id="e">
      {work && !t.reviewerId && <p className="mb-3 text-[12px] text-muted-foreground">این تسک Reviewer ندارد و با رسیدن به Status نهایی بسته می‌شود. برای مرحله‌ی بررسی، در بخش B یک Reviewer تعیین کنید.</p>}
      {rounds.length > 0 && (
        <ol className="mb-4 flex flex-col gap-3 border-s ps-4">
          {rounds.map((r) => {
            const rf = files.filter((x) => x.roundId === r.id)
            return (
              <li key={r.id} className="relative">
                <span className={cn('absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background', r.decision === 'approve' ? 'bg-leaf' : r.decision === 'rework' ? 'bg-destructive' : 'bg-azure')} />
                <div className="text-[12px] text-muted-foreground"><b className="text-foreground">دور {n(r.round)}</b> — {userById[r.submittedBy]?.name}، {time(r.submittedAt)}، {clock(r.submittedAt)}</div>
                <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-6">{r.note}</div>
                {rf.length > 0 && <div className="mt-2"><AttachmentList items={rf} /></div>}
                {r.decision ? (
                  <div className={cn('mt-2 rounded-lg px-3 py-2 text-[12.5px]', r.decision === 'approve' ? 'bg-leaf-soft text-leaf-ink' : 'bg-danger-soft text-destructive')}>
                    <b>{r.decision === 'approve' ? 'تأیید' : 'بازگشت برای اصلاح'}</b> — {userById[r.decidedBy ?? '']?.name}، {time(r.decidedAt ?? '')}
                    {r.decisionNote && <div className="mt-0.5 text-foreground">{r.decisionNote}</div>}
                  </div>
                ) : <div className="mt-2 inline-flex rounded-full bg-azure px-2 py-0.5 text-[11.5px] text-white">در انتظار تصمیم {userById[t.reviewerId ?? '']?.name ?? 'Reviewer'}</div>}
              </li>
            )
          })}
        </ol>
      )}
      {canDecide && (
        <div className="mb-4 rounded-xl border border-azure/40 bg-azure-soft/40 p-3">
          <Label htmlFor="e-decision" className="eyebrow">تصمیم Reviewer</Label>
          <Textarea id="e-decision" className="mt-1 min-h-[60px]" value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="برای بازگشت، دلیل و موارد اصلاح را بنویسید؛ برای تأیید اختیاری است" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => decideNow('approve')}><CheckCircle2 className="h-4 w-4" /> تأیید و بستن</Button>
            <Button variant="outline" onClick={() => decideNow('rework')}><Undo2 className="h-4 w-4" /> بازگشت برای اصلاح</Button>
          </div>
        </div>
      )}
      {canSubmit && (
        <div className="mb-4 rounded-xl border bg-background/45 p-3">
          <Label htmlFor="e-note" className="eyebrow">ارسال برای بررسی{rounds.length ? ` (دور ${n(rounds.length + 1)})` : ''}</Label>
          <Textarea id="e-note" className="mt-1 min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="چه کاری انجام شد؟ اگر دور قبل برگشت خورده، اصلاحات را بنویسید." />
          <div className="mt-2"><FilePicker id="e-files" files={rfiles} onChange={setRfiles} /></div>
          <div className="mt-2"><Button onClick={submit}><Send className="h-4 w-4" /> ارسال برای بررسی</Button></div>
          {t.kind === 'internal' && !t.reviewerId && <p className="mt-1.5 text-[11.5px] text-muted-foreground">Reviewer تعیین نشده؛ سرپرست تیم بررسی می‌کند. برای بستن بدون بررسی، «بستن کار» در بخش D.</p>}
        </div>
      )}
      <div className="eyebrow mb-2">پیوست‌های تسک ({n(loose.length)})</div>
      <AttachmentList items={loose} empty="پیوستی نیست." />
      {canAttach && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilePicker id="e-extra" files={extra} onChange={setExtra} label="انتخاب فایل" />
          {extra.length > 0 && <Button size="sm" className="h-8" onClick={() => { dispatch({ type: 'addAttachments', taskId: t.id, files: extra }); setExtra([]); toast.success('پیوست اضافه شد') }}>افزودن {n(extra.length)} پیوست</Button>}
        </div>
      )}
    </Section>
  )
}

// ---------------- F. Discussion & history ----------------
function CommentsSection({ t }: { t: Task }) {
  const { state, dispatch, userById, me } = useStore()
  const { time, clock } = useFmt()
  const [text, setText] = useState('')
  const list = state.comments.filter((c) => c.taskId === t.id).sort((a, b) => a.at.localeCompare(b.at))
  const send = () => {
    if (!text.trim()) return
    dispatch({ type: 'addComment', taskId: t.id, text: text.trim() })
    const tagged = (text.match(/@[a-z0-9._-]+/gi) ?? []).length
    setText('')
    toast.success('کامنت ثبت شد', { description: tagged ? 'اعضای تگ‌شده اعلان می‌گیرند.' : undefined })
  }
  return (
    <div>
      <h4 className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold"><MessageSquare className="h-4 w-4" /> کامنت‌ها</h4>
      {list.length > 0 && (
        <ul className="mb-3 flex flex-col gap-3">
          {list.map((c) => {
            const u = userById[c.userId]
            return (
              <li key={c.id} className={cn('flex gap-2.5 rounded-lg p-1.5', c.mentions.includes(me.id) && 'bg-azure-soft/40')}>
                <Initials user={u} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]"><span className="font-semibold">{u?.name}</span><bdi className="mono text-[11px] text-muted-foreground">@{u?.username}</bdi><span className="num text-[11px] text-muted-foreground">{time(c.at)}، {clock(c.at)}</span></div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-6"><RichText text={c.text} /></div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <MentionInput id={`comment-${t.id}`} value={text} onChange={setText} onSubmit={send} placeholder="کامنت بنویسید؛ برای اعلان به همکار، @ID او را بنویسید" submitLabel="ثبت" />
    </div>
  )
}

function AuditSection({ t }: { t: Task }) {
  const { state, userById } = useStore()
  const fmt = useFmt()
  const entries = state.audit.filter((a) => a.taskId === t.id)
  const [, force] = useState(0)
  useEffect(() => { const h = setInterval(() => force((x) => x + 1), 30000); return () => clearInterval(h) }, [])
  return (
    <div className="mt-5">
      <h4 className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold"><History className="h-4 w-4" /> تاریخچه (AuditLog)</h4>
      {entries.length === 0 ? <p className="text-[12px] text-muted-foreground">هنوز تغییری ثبت نشده است.</p> : (
        <ol className="flex flex-col gap-2.5 border-s ps-4">
          {entries.map((e) => (
            <li key={e.id} className="relative text-[12.5px]">
              <span className={cn('absolute -start-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-background', e.kind === 'security' ? 'bg-destructive' : e.kind === 'review' ? 'bg-leaf' : 'bg-azure')} />
              <div>{e.text}</div>
              <div className="text-[11px] text-muted-foreground">{userById[e.userId]?.name ?? 'سامانه'}، {fmt.time(e.at)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}


