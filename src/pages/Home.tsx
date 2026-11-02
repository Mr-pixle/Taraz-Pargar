import { useMemo, useState } from 'react'
import { Camera, Inbox, MessagesSquare, Phone, UserPen } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { projectTeams, statusOf, useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { WEEKDAYS, addDays, startOfWeek, weekdayIndex } from '@/lib/jalali'
import type { StatusCategory, Task } from '@/lib/types'
import { TaskViews } from '@/components/TaskViews'
import { Bar, Empty, Initials, PageHeader, ProgressRing, Segmented, StatusPill } from '@/components/common'
import { ROLE_FA, has } from '@/lib/policy'
import { TimesheetTodayCard } from '@/pages/AdminModule'
import { MyFlowWork } from '@/components/FlowViews'
import { cn } from '@/lib/utils'
import { useProjectProgress } from './Projects'

function Stat({ label, value, sub, children, tone }: { label: string; value: string; sub?: string; children?: React.ReactNode; tone?: 'danger' | 'azure' }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className={cn('num mt-0.5 text-[22px] font-bold leading-tight', tone === 'danger' && 'text-destructive', tone === 'azure' && 'text-azure')}>{value}</div>
      {sub && <div className="text-[12px] text-muted-foreground">{sub}</div>}
      {children}
    </div>
  )
}

function UserCard() {
  const { me, teamById, dispatch, myNotifs, workItems, state } = useStore()
  const { n, dLong } = useFmt()
  const open = workItems.filter((t) => t.assigneeUserId === me.id && statusOf(state, t)?.category !== 'done').length
  return (
    <section className="flex flex-col glass-card">
      <div className="flex items-start gap-3 border-b p-4">
        <button onClick={() => dispatch({ type: 'openProfile', id: me.id })} className="group relative shrink-0 rounded-full" aria-label="تغییر تصویر پروفایل" title="تغییر تصویر پروفایل">
          <Initials user={me} size={56} />
          <span className="absolute -bottom-0.5 -end-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background"><Camera className="h-3 w-3" /></span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold">{me.name}</div>
          <bdi className="mono block text-[12px] text-muted-foreground">@{me.username}</bdi>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', me.role === 'ceo' || me.role === 'sysadmin' ? 'bg-foreground text-background' : ['control', 'management', 'pm', 'inspector'].includes(me.role) ? 'bg-azure-soft text-azure-ink' : 'bg-secondary')}>{ROLE_FA[me.role]}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => dispatch({ type: 'openProfile', id: me.id })} aria-label="ویرایش پروفایل"><UserPen className="h-4 w-4" /></Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-4 text-[13px]">
        <div><dt className="eyebrow">تیم</dt><dd className="font-medium">{teamById[me.teamId]?.name ?? '—'}</dd></div>
        <div><dt className="eyebrow">سمت</dt><dd className="font-medium">{me.title ?? '—'}</dd></div>
        <div><dt className="eyebrow">تماس</dt><dd className="num inline-flex items-center gap-1 font-medium"><Phone className="h-3 w-3 text-muted-foreground" />{me.phone ? me.phone.replace(/\d+/g, (x) => n(Number(x))) : '—'}</dd></div>
        <div><dt className="eyebrow">ظرفیت روزانه</dt><dd className="num font-medium">{n(me.capacity)} ساعت</dd></div>
        <div><dt className="eyebrow">کارهای باز</dt><dd className="num font-medium">{n(open)}</dd></div>
        <div><dt className="eyebrow">عضو از</dt><dd className="num font-medium">{dLong(me.createdAt.slice(0, 10))}</dd></div>
        {me.bio && <div className="col-span-2"><dt className="eyebrow">درباره</dt><dd className="text-muted-foreground">{me.bio}</dd></div>}
      </dl>
      <div className="mt-auto flex items-center justify-between border-t px-4 py-2.5 text-[12.5px]">
        <button className="text-azure hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'notifications' } })}><span className="num">{n(myNotifs.filter((x) => !x.read).length)}</span> اعلان خوانده‌نشده</button>
        <button className="text-muted-foreground hover:text-foreground" onClick={() => dispatch({ type: 'openProfile', id: me.id })}>ویرایش پروفایل</button>
      </div>
    </section>
  )
}

function MyProjects() {
  const store = useStore()
  const { state, me, workItems, teamOf, teamById, dispatch, unreadIn } = store
  const { n, d } = useFmt()
  const progress = useProjectProgress()
  const rows = useMemo(() => state.projects.map((p) => {
    const mine = workItems.filter((t) => t.projectId === p.id && (t.assigneeUserId === me.id || (t.assigneeTeamId && t.assigneeTeamId === me.teamId)))
    const teamTasks = workItems.filter((t) => t.projectId === p.id && teamOf(t) === me.teamId)
    const commented = state.comments.some((c) => c.userId === me.id && state.tasks[c.taskId]?.projectId === p.id)
    const related = projectTeams(p).includes(me.teamId)
    const active = mine.length > 0 || teamTasks.length > 0 || commented || has(me, 'plan.all') || p.managerId === me.id
    const open = mine.filter((t) => statusOf(state, t)?.category !== 'done')
    const next = open.filter((t) => t.due && t.due >= TODAY).sort((a, b) => a.due!.localeCompare(b.due!))[0]
    return { p, mine, open, next, related, active, team: teamTasks.length }
  }).filter((r) => r.active), [state, workItems, me, teamOf])
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">پروژه‌های من</h2>
        <span className="text-[12px] text-muted-foreground">{has(me, 'plan.all') ? 'به‌عنوان مدیریت یا کنترل پروژه، همه‌ی پروژه‌ها' : me.role === 'pm' ? 'پروژه‌هایی که مدیر آن هستید یا در آن کار دارید' : 'پروژه‌هایی که شما یا تیمتان در آن کار دارید'}</span>
      </div>
      {rows.length === 0 ? <Empty title="هنوز در پروژه‌ای کاری ندارید" hint="وقتی کنترل پروژه تسکی به شما یا تیمتان بدهد، پروژه اینجا دیده می‌شود." /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {rows.map(({ p, open, next, team, related }) => (
            <div key={p.id} className="glass-item is-interactive flex flex-col overflow-hidden rounded-2xl">
              <button className="flex items-center gap-3 p-3 text-start hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'nav', nav: { page: 'project', projectId: p.id } })}>
                <ProgressRing value={progress(p.id).total} size={40} stroke={3.5} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-[11.5px] text-muted-foreground"><span className="mono">{p.code}</span>، {p.type}</div>
                </div>
              </button>
              <div className="grid grid-cols-3 gap-2 border-t px-3 py-2 text-[12px]">
                <div><div className="eyebrow">کارهای باز من</div><div className="num font-semibold">{n(open.length)}</div></div>
                <div><div className="eyebrow">تسک‌های تیم</div><div className="num font-semibold">{n(team)}</div></div>
                <div><div className="eyebrow">موعد بعدی</div><div className="num font-semibold">{next ? d(next.due).slice(5) : '—'}</div></div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t px-3 py-2 text-[12px]">
                <span className="truncate text-muted-foreground">{related ? `از طریق تیم ${teamById[me.teamId]?.name}` : 'نظارت'}</span>
                <button className="inline-flex items-center gap-1 text-azure hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'pchat', channelId: `project:${p.id}` } })}>
                  <MessagesSquare className="h-3.5 w-3.5" /> چت پروژه{unreadIn(`project:${p.id}`) ? <span className="num rounded-full bg-azure px-1.5 text-[10.5px] text-white">{n(unreadIn(`project:${p.id}`))}</span> : null}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const CAT_LABEL: Record<StatusCategory, string> = { todo: 'To Do', doing: 'In Progress', done: 'Done' }
const CAT_VAR: Record<StatusCategory, string> = { todo: 'var(--chart-todo)', doing: 'var(--chart-doing)', done: 'var(--chart-done)' }

function StatusMix({ tasks }: { tasks: Task[] }) {
  const { state } = useStore()
  const { n, pct } = useFmt()
  const counts: Record<StatusCategory, number> = { todo: 0, doing: 0, done: 0 }
  for (const t of tasks) counts[statusOf(state, t)?.category ?? 'todo']++
  const total = tasks.length || 1
  const cats = (['done', 'doing', 'todo'] as StatusCategory[]).filter((c) => counts[c] > 0)
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px]" role="img" aria-label={cats.map((c) => `${CAT_LABEL[c]}: ${counts[c]}`).join('، ')}>
        {cats.map((c, i) => (
          <div key={c} className={cn('group relative h-full', i === 0 && 'rounded-s', i === cats.length - 1 && 'rounded-e')} style={{ width: `${(counts[c] / total) * 100}%`, background: CAT_VAR[c], minWidth: 4 }}>
            <span className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-background group-hover:block rtl:translate-x-1/2">
              {CAT_LABEL[c]}: {n(counts[c])} تسک ({pct((counts[c] / total) * 100)})
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['done', 'doing', 'todo'] as StatusCategory[]).map((c) => (
          <div key={c} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT_VAR[c] }} />{CAT_LABEL[c]}</div>
            <div className="num text-[18px] font-bold leading-tight">{n(counts[c])}</div>
            <div className="num text-[11px] text-muted-foreground">{pct((counts[c] / total) * 100)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskDashboard() {
  const store = useStore()
  const { state, me, workItems, activeUsers, teamById, dispatch, planner, teamOf } = store
  const { n, dShort, h } = useFmt()
  const [scope, setScope] = useState<'me' | 'team' | 'office'>(has(me, 'plan.all') ? 'office' : 'me')
  const [teamFilter, setTeamFilter] = useState('all')
  const scoped = useMemo(() => workItems.filter((t) => !t.removedFromMdr && (scope === 'me' ? t.assigneeUserId === me.id : scope === 'team' ? teamOf(t) === me.teamId : true)), [workItems, scope, me, teamOf])
  const open = scoped.filter((t) => statusOf(state, t)?.category !== 'done')
  const overdue = open.filter((t) => t.due && t.due < TODAY)
  const upcoming = open.filter((t) => t.due && t.due >= TODAY && t.due <= addDays(TODAY, 10)).sort((a, b) => a.due!.localeCompare(b.due!))
  const week0 = startOfWeek(TODAY)
  const p = useMemo(() => planner(), [state.allocations, state.leaves, state.holidays, state.users]) // eslint-disable-line react-hooks/exhaustive-deps
  const people = useMemo(() => {
    const base = scope === 'office' ? activeUsers.filter((u) => teamFilter === 'all' || u.teamId === teamFilter) : activeUsers.filter((u) => u.teamId === me.teamId)
    return base.map((u) => {
      const tasks = workItems.filter((t) => t.assigneeUserId === u.id)
      const op = tasks.filter((t) => statusOf(state, t)?.category !== 'done')
      let cap = 0, used = 0
      for (let i = 0; i < 7; i++) { const d = addDays(week0, i); cap += p.capacity({ kind: 'user', id: u.id }, d); used += p.used({ kind: 'user', id: u.id }, d) }
      return { u, open: op.length, doing: op.filter((t) => statusOf(state, t)?.category === 'doing').length, overdue: op.filter((t) => t.due && t.due < TODAY).length, cap, used }
    }).sort((a, b) => b.used / (b.cap || 1) - a.used / (a.cap || 1))
  }, [scope, teamFilter, activeUsers, me.teamId, workItems, state, p, week0])
  const [showAll, setShowAll] = useState(false)

  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">داشبورد وظایف</h2>
        <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: 'me', label: 'کارهای من' }, { value: 'team', label: 'تیم من' }, { value: 'office', label: 'کل دفتر' }]} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="glass-card p-4">
          <div className="mb-3 flex items-baseline justify-between"><span className="text-[13px] font-semibold">وضعیت {n(scoped.length)} تسک</span><span className="text-[11.5px] text-muted-foreground">بر اساس Category هر Status</span></div>
          {scoped.length ? <StatusMix tasks={scoped} /> : <p className="text-[12.5px] text-muted-foreground">تسکی در این دامنه نیست.</p>}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-[12px]">
            <div><div className="eyebrow">گذشته از موعد</div><div className={cn('num text-[16px] font-bold', overdue.length && 'text-destructive')}>{n(overdue.length)}</div></div>
            <div><div className="eyebrow">موعد ۱۰ روز آینده</div><div className="num text-[16px] font-bold">{n(upcoming.length)}</div></div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col glass-card">
          <div className="border-b px-4 py-2.5 text-[13px] font-semibold">موعدهای پیش رو</div>
          {upcoming.length === 0 ? <p className="px-4 py-4 text-[12.5px] text-muted-foreground">در ۱۰ روز آینده موعدی نیست.</p> : (
            <ul className="max-h-[300px] divide-y overflow-y-auto thin-scroll">
              {upcoming.slice(0, 12).map((t) => (
                <li key={t.id}>
                  <button className="flex w-full items-center gap-3 px-4 py-2 text-start hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
                    <span className="num w-14 shrink-0 text-[12px] font-semibold">{t.due === TODAY ? 'امروز' : dShort(t.due!)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px]">{t.name}</span><span className="block truncate text-[11px] text-muted-foreground">{store.projectById[t.projectId]?.name}</span></span>
                    <span className="hidden shrink-0 sm:block"><StatusPill status={statusOf(state, t)} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex min-w-0 flex-col glass-card lg:col-span-2 2xl:col-span-1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <span className="text-[13px] font-semibold">وظایف اعضا{scope !== 'office' ? `، تیم ${teamById[me.teamId]?.name}` : ''}</span>
            {scope === 'office' && (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger id="dash-team" className="h-7 w-[150px] text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">همه‌ی تیم‌ها</SelectItem>{state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="scroll-x thin-scroll">
            <table className="w-full min-w-[440px] text-[12.5px]">
              <thead className="text-[11px] text-muted-foreground"><tr className="border-b"><th className="px-4 py-1.5 text-start font-medium">نفر</th><th className="px-2 py-1.5 text-end font-medium">باز</th><th className="px-2 py-1.5 text-end font-medium">در جریان</th><th className="px-2 py-1.5 text-end font-medium">دیرکرد</th><th className="w-[130px] px-4 py-1.5 text-start font-medium">بار این هفته</th></tr></thead>
              <tbody>
                {(showAll ? people : people.slice(0, 8)).map(({ u, open: o, doing, overdue: od, cap, used }) => {
                  const ratio = cap ? (used / cap) * 100 : 0
                  return (
                    <tr key={u.id} className={cn('border-b last:border-0', u.id === me.id && 'bg-azure-soft/30')}>
                      <td className="px-4 py-1.5"><span className="flex items-center gap-2"><Initials user={u} size={20} /><span className="truncate">{u.name}</span>{scope === 'office' && <span className="hidden text-[11px] text-muted-foreground md:inline">{teamById[u.teamId]?.name}</span>}</span></td>
                      <td className="num px-2 py-1.5 text-end">{n(o)}</td>
                      <td className="num px-2 py-1.5 text-end">{n(doing)}</td>
                      <td className={cn('num px-2 py-1.5 text-end', od > 0 && 'font-semibold text-destructive')}>{n(od)}</td>
                      <td className="px-4 py-1.5" title={`${h(used)} از ${h(cap)}`}><div className="flex items-center gap-2"><Bar value={ratio} tone={ratio > 100 ? 'danger' : undefined} /><span className="num w-9 shrink-0 text-end text-[11px] text-muted-foreground">{n(Math.round(ratio))}٪</span></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {people.length > 8 && <button className="mt-auto border-t px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setShowAll(!showAll)}>{showAll ? 'نمایش کمتر' : `نمایش همه (${n(people.length)} نفر)`}</button>}
        </div>
      </div>
    </section>
  )
}

export function Home() {
  const store = useStore()
  const { state, me, workItems, planner, activeUsers } = store
  const { n, dLong } = useFmt()
  const myTasks = useMemo(() => workItems.filter((t) => t.assigneeUserId === me.id), [workItems, me.id])
  const week0 = startOfWeek(TODAY)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week0, i))

  const stats = useMemo(() => {
    const open = (list: typeof workItems) => list.filter((t) => statusOf(state, t)?.category !== 'done')
    const p = planner()
    if (!has(me, 'plan.all')) {
      const o = open(myTasks)
      const cap = weekDays.reduce((s, d) => s + p.capacity({ kind: 'user', id: me.id }, d), 0)
      const used = weekDays.reduce((s, d) => s + p.used({ kind: 'user', id: me.id }, d), 0)
      return {
        a: { label: 'کارهای باز من', value: n(o.length) },
        b: { label: 'موعد این هفته', value: n(o.filter((t) => t.due && t.due >= week0 && t.due <= addDays(week0, 6)).length) },
        c: { label: 'گذشته از موعد', value: n(o.filter((t) => t.due && t.due < TODAY).length), alert: o.some((t) => t.due && t.due < TODAY) },
        load: { used, cap, label: 'بار من در این هفته' },
      }
    }
    const o = open(workItems)
    const cap = activeUsers.reduce((s, u) => s + weekDays.reduce((x, d) => x + p.capacity({ kind: 'user', id: u.id }, d), 0), 0)
    const used = state.teams.reduce((s, tm) => s + weekDays.reduce((x, d) => x + p.used({ kind: 'team', id: tm.id }, d), 0), 0)
    const pending = state.syncItems.filter((x) => x.state === 'pending').length
    const late = o.filter((t) => t.due && t.due < TODAY).length
    // Sync Review belongs to the Project Control section: shown only to the CEO and Project Control
    return {
      a: { label: 'تسک‌های باز دفتر', value: n(o.length) },
      b: { label: 'استخر Unassigned', value: n(o.filter((t) => !t.assigneeUserId && !t.assigneeTeamId).length) },
      c: has(me, 'control.section') ? { label: 'در صف Sync Review', value: n(pending), alert: pending > 0 } : { label: 'گذشته از موعد دفتر', value: n(late), alert: late > 0 },
      load: { used, cap, label: 'بار کل دفتر در این هفته' },
    }
  }, [state, workItems, myTasks, me, n, week0, planner, weekDays, activeUsers])

  const pct = stats.load.cap ? (stats.load.used / stats.load.cap) * 100 : 0
  const teamOrder = [...state.teams].sort((a, b) => (a.id === me.teamId ? -1 : b.id === me.teamId ? 1 : 0))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`${WEEKDAYS[weekdayIndex(TODAY)]} ${dLong(TODAY)}`} title={me.name === 'مدیرعامل' ? 'سلام، مدیرعامل' : `سلام، ${me.name.split(' ')[0]}`}
        actions={<Button variant="outline" onClick={() => store.dispatch({ type: 'openProfile', id: me.id })}><UserPen className="h-4 w-4" /> ویرایش پروفایل</Button>}>
        خلاصه‌ی کارها، پروژه‌ها و وظایف شما
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <UserCard />
        <div className="flex min-w-0 flex-col gap-5">
          <TimesheetTodayCard />
          <div className="grid grid-cols-2 divide-x divide-x-reverse overflow-hidden glass-card lg:grid-cols-4 [&>*]:border-b lg:[&>*]:border-b-0">
            <Stat {...stats.a} />
            <Stat {...stats.b} tone={!has(me, 'plan.all') ? 'azure' : undefined} />
            <Stat label={stats.c.label} value={stats.c.value} tone={stats.c.alert ? (!has(me, 'plan.all') ? 'danger' : 'azure') : undefined} />
            <Stat label={stats.load.label} value={`${n(Math.round(pct))}٪`} sub={`${n(stats.load.used, 1)} از ${n(stats.load.cap)} نفر-ساعت`}>
              <Bar value={pct} className="mt-1.5" tone={pct > 100 ? 'danger' : undefined} />
            </Stat>
          </div>
          <MyProjects />
        </div>
      </div>

      <MyFlowWork />

      <TaskDashboard />

      <section>
        <h2 className="mb-2 text-[15px] font-bold">کارها</h2>
        <Tabs defaultValue="mine" dir="rtl">
          <div className="scroll-x thin-scroll -mx-1 px-1">
            <TabsList className="h-auto w-max justify-start gap-0.5">
              <TabsTrigger value="mine" className="text-[13px]">کارهای من <span className="num ms-1.5 text-[11px] text-muted-foreground">{n(myTasks.length)}</span></TabsTrigger>
              {teamOrder.map((tm) => (
                <TabsTrigger key={tm.id} value={tm.id} className="text-[13px]">
                  {tm.name}{tm.id === me.teamId && <span className="ms-1.5 h-1.5 w-1.5 rounded-full bg-azure" aria-label="تیم من" />}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="mine" className="mt-4">
            {myTasks.length ? <TaskViews tasks={myTasks} idPrefix="home-mine" defaultView="list" hideTeam />
              : <Empty icon={<Inbox className="h-6 w-6" />} title="تسکی به نام شما تخصیص داده نشده" hint={has(me, 'plan.all') ? 'همه‌ی نماها را می‌بینید. از تب تیم‌ها یا صفحه‌ی پروژه‌ها شروع کنید.' : 'کنترل پروژه تسک‌ها را به نفر یا تیم تخصیص می‌دهد. تسک‌های تیمتان در تب تیم دیده می‌شود.'} />}
          </TabsContent>
          {teamOrder.map((tm) => (
            <TabsContent key={tm.id} value={tm.id} className="mt-4">
              <TeamTab teamId={tm.id} />
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  )
}

function TeamTab({ teamId }: { teamId: string }) {
  const { workItems, teamOf, teamById } = useStore()
  const list = useMemo(() => workItems.filter((t) => teamOf(t) === teamId), [workItems, teamOf, teamId])
  if (!list.length) return <Empty title={`تیم ${teamById[teamId]?.name} فعلاً تسکی ندارد`} hint={teamById[teamId]?.kind === 'other' ? 'این تیم به پروژه‌ها متصل نیست؛ تسک‌های دستی آن از صفحه‌ی پروژه ساخته می‌شود.' : 'تسک‌ها بعد از تخصیص توسط کنترل پروژه اینجا دیده می‌شوند.'} />
  return <TaskViews tasks={list} idPrefix={`home-${teamId}`} defaultView="kanban" hideTeam />
}

