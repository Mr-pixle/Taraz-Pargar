import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { statusOf, useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import { WEEKDAYS_SHORT, addDays, isWeekend, startOfWeek, toJalali, weekdayIndex } from '@/lib/jalali'
import { Bar, Initials, PageHeader, Segmented } from '@/components/common'
import type { User } from '@/lib/types'

export function Workload() {
  const store = useStore()
  const { state } = store
  const { d } = useFmt()
  const [mode, setMode] = useState<'person' | 'team'>('person')
  const [week0, setWeek0] = useState(startOfWeek(TODAY))
  const [team, setTeam] = useState('all')
  const planner = useMemo(() => store.planner(), [state.allocations, state.leaves, state.holidays, state.users]) // eslint-disable-line react-hooks/exhaustive-deps
  const span = mode === 'person' ? 14 : 56
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="کنترل پروژه" title="Workload" actions={
        <Segmented value={mode} onChange={setMode} options={[{ value: 'person', label: 'نفر × روز' }, { value: 'team', label: 'تیم × هفته' }]} />
      }>
        ظرفیت هر نفر ۸ ساعت در روز کاری، منهای مرخصی و تعطیلی؛ در برابر Allocationهای روزبه‌روز. تسک تیمی از ظرفیت مجموع اعضای تیم کم می‌شود.
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeek0(addDays(week0, -7))} aria-label="هفته‌ی قبل"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setWeek0(startOfWeek(TODAY))}>این هفته</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeek0(addDays(week0, 7))} aria-label="هفته‌ی بعد"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="num ms-2 text-[13px] font-medium">{d(week0)} تا {d(addDays(week0, span - 1))}</span>
        </div>
        {mode === 'person' && (
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger id="wl-team" className="h-8 w-[170px] text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه‌ی تیم‌ها</SelectItem>
              {state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {mode === 'person' ? <PersonGrid week0={week0} team={team} planner={planner} /> : <TeamGrid week0={week0} planner={planner} />}
          <Legend />
        </div>
        <UnassignedPool />
      </div>
    </div>
  )
}

type Planner = ReturnType<ReturnType<typeof useStore>['planner']>

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-azure/70" /> تخصیص‌یافته</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-leaf-soft ring-1 ring-leaf/30" /> ظرفیت آزاد</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-danger-soft ring-1 ring-destructive/40" /> بیش از ظرفیت (مثلاً مرخصی ثبت‌شده بعد از برنامه‌ریزی)</span>
      <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm ring-1 ring-border" /> تعطیل / مرخصی کامل</span>
    </div>
  )
}

function CellDetail({ user, date }: { user: User; date: string }) {
  const { state, dispatch } = useStore()
  const { n, dLong } = useFmt()
  const allocs = state.allocations.filter((a) => a.userId === user.id && a.date === date)
  const leave = state.leaves.filter((l) => l.userId === user.id && l.date === date)
  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <div className="font-semibold">{user.name}، {dLong(date)}</div>
      {leave.map((l) => <div key={l.id} className="rounded bg-secondary px-2 py-1">مرخصی {n(l.hours)} ساعت{l.note ? ` — ${l.note}` : ''}</div>)}
      {allocs.length === 0 ? <div className="text-muted-foreground">Allocation ندارد.</div> : allocs.map((a) => {
        const t = state.tasks[a.taskId]
        return (
          <button key={a.taskId} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-start hover:bg-accent" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
            <span className="min-w-0 truncate">{t.name}</span><span className="num shrink-0 text-muted-foreground">{n(a.hours, 1)}h</span>
          </button>
        )
      })}
    </div>
  )
}

function PersonGrid({ week0, team, planner }: { week0: string; team: string; planner: Planner }) {
  const { state, activeUsers } = useStore()
  const { n, digits } = useFmt()
  const days = Array.from({ length: 14 }, (_, i) => addDays(week0, i))
  const holidays = new Set(state.holidays.map((h) => h.date))
  const teams = state.teams.filter((t) => team === 'all' || t.id === team)
  const leaveSet = new Set(state.leaves.map((l) => `${l.userId}|${l.date}`))
  return (
    <div className="scroll-x thin-scroll glass-card">
      <table className="w-full min-w-[860px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b bg-foreground/[0.03]">
            <th className="sticky start-0 z-10 w-[180px] bg-foreground/[0.03] px-3 py-2 text-start text-[11.5px] font-medium text-muted-foreground">نفر</th>
            {days.map((dd) => {
              const off = isWeekend(dd) || holidays.has(dd)
              const wi = weekdayIndex(dd)
              return (
                <th key={dd} className={cn('px-0.5 py-1.5 text-center font-medium', off ? 'w-7 text-muted-foreground/70' : 'min-w-[50px]', dd === TODAY && 'text-azure')} title={holidays.has(dd) ? state.holidays.find((h) => h.date === dd)?.title : undefined}>
                  <div className="text-[10.5px]">{WEEKDAYS_SHORT[wi]}</div>
                  <div className="num text-[12px]">{digits(toJalali(dd).jd)}</div>
                </th>
              )
            })}
            <th className="px-3 py-2 text-end text-[11.5px] font-medium text-muted-foreground">جمع</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((tm) => {
            const members = activeUsers.filter((u) => u.teamId === tm.id)
            const tCap = days.reduce((s, dd) => s + planner.capacity({ kind: 'team', id: tm.id }, dd), 0)
            const tUsed = days.reduce((s, dd) => s + planner.used({ kind: 'team', id: tm.id }, dd), 0)
            const teamLevel = days.reduce((s, dd) => s + planner.used({ kind: 'team', id: tm.id }, dd) - members.reduce((x, u) => x + planner.used({ kind: 'user', id: u.id }, dd), 0), 0)
            return [
              <tr key={tm.id} className="border-b bg-foreground/[0.025]">
                <td className="sticky start-0 z-10 bg-glass-solid px-3 py-1.5 font-semibold" colSpan={1}>{tm.name}</td>
                <td colSpan={days.length} className="px-2 py-1.5 text-[11.5px] text-muted-foreground">
                  {teamLevel > 0.01 && <>تسک‌های تیمی (تخصیص به کل تیم): <span className="num">{n(teamLevel, 1)}</span> ساعت</>}
                </td>
                <td className="num px-3 py-1.5 text-end text-[11.5px]">{n(Math.round(tCap ? (tUsed / tCap) * 100 : 0))}٪</td>
              </tr>,
              ...members.map((u) => {
                const cap = days.reduce((s, dd) => s + planner.capacity({ kind: 'user', id: u.id }, dd), 0)
                const used = days.reduce((s, dd) => s + planner.used({ kind: 'user', id: u.id }, dd), 0)
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="sticky start-0 z-10 bg-glass-solid px-3 py-1">
                      <div className="flex items-center gap-2"><Initials user={u} size={22} /><span className="truncate">{u.name}</span></div>
                    </td>
                    {days.map((dd) => {
                      const c = planner.capacity({ kind: 'user', id: u.id }, dd)
                      const us = planner.used({ kind: 'user', id: u.id }, dd)
                      const off = isWeekend(dd) || holidays.has(dd)
                      if (off) return <td key={dd} className="hatch border-s bg-foreground/[0.03]" />
                      const hasLeave = leaveSet.has(`${u.id}|${dd}`)
                      const over = us > c + 0.01
                      const ratio = c ? Math.min(1, us / c) : us ? 1 : 0
                      return (
                        <td key={dd} className={cn('border-s p-0.5', dd === TODAY && 'bg-azure-soft/40')}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className={cn('relative flex h-9 w-full items-end overflow-hidden rounded-[4px] text-[11px]',
                                over ? 'bg-danger-soft ring-1 ring-destructive/50' : c === 0 ? 'hatch bg-foreground/[0.03]' : us === 0 ? 'bg-leaf-soft/45' : 'bg-secondary')}
                                aria-label={`${u.name}: ${us} از ${c} ساعت`}>
                                {!over && c > 0 && <span className="absolute inset-x-0 bottom-0 bg-azure/70" style={{ height: `${ratio * 100}%` }} />}
                                <span className={cn('num relative z-[1] w-full pb-0.5 text-center font-medium', over ? 'text-destructive' : ratio > 0.55 ? 'text-white' : 'text-foreground')}>
                                  {over ? `+${n(us - c, 1)}` : us ? n(us, 1) : c < 8 && hasLeave ? 'م' : ''}
                                </span>
                                {hasLeave && c > 0 && <span className="absolute end-0.5 top-0.5 z-[1] h-1.5 w-1.5 rounded-full bg-foreground" title="مرخصی" />}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-3" align="center"><CellDetail user={u} date={dd} /></PopoverContent>
                          </Popover>
                        </td>
                      )
                    })}
                    <td className="num whitespace-nowrap px-3 py-1 text-end text-[11.5px] text-muted-foreground">{n(used, 1)}/{n(cap)}</td>
                  </tr>
                )
              }),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function TeamGrid({ week0, planner }: { week0: string; planner: Planner }) {
  const { state, activeUsers } = useStore()
  const { n, d } = useFmt()
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(week0, i * 7))
  return (
    <div className="scroll-x thin-scroll glass-card">
      <table className="w-full min-w-[820px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b bg-foreground/[0.03]">
            <th className="sticky start-0 z-10 w-[150px] bg-foreground/[0.03] px-3 py-2 text-start text-[11.5px] font-medium text-muted-foreground">تیم</th>
            {weeks.map((w) => <th key={w} className="num min-w-[84px] px-2 py-2 text-start text-[11.5px] font-medium text-muted-foreground">هفته‌ی {d(w).slice(5)}</th>)}
          </tr>
        </thead>
        <tbody>
          {state.teams.map((tm) => (
            <tr key={tm.id} className="border-b last:border-0">
              <td className="sticky start-0 z-10 bg-glass-solid px-3 py-2 font-medium">{tm.name}<div className="num text-[11px] font-normal text-muted-foreground">{n(activeUsers.filter((u) => u.teamId === tm.id).length)} نفر</div></td>
              {weeks.map((w) => {
                let cap = 0, used = 0
                for (let i = 0; i < 7; i++) { const dd = addDays(w, i); cap += planner.capacity({ kind: 'team', id: tm.id }, dd); used += planner.used({ kind: 'team', id: tm.id }, dd) }
                const p = cap ? (used / cap) * 100 : 0
                return (
                  <td key={w} className={cn('border-s px-2 py-2', p > 100 && 'bg-danger-soft')}>
                    <div className={cn('num font-semibold', p > 100 && 'text-destructive', p === 0 && 'text-muted-foreground')}>{n(Math.round(p))}٪</div>
                    <Bar value={p} className="my-1" tone={p > 100 ? 'danger' : undefined} />
                    <div className="num text-[10.5px] text-muted-foreground">{n(used, 0)}/{n(cap)}h</div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnassignedPool() {
  const { state, dispatch, workItems, projectById } = useStore()
  const { n } = useFmt()
  const [pid, setPid] = useState('all')
  const pool = workItems.filter((t) => !t.assigneeUserId && !t.assigneeTeamId && statusOf(state, t)?.category !== 'done' && !t.removedFromMdr && (pid === 'all' || t.projectId === pid))
  const est = pool.reduce((s, t) => s + (t.estimation ?? 0), 0)
  return (
    <aside className="flex max-h-[720px] min-w-0 flex-col overflow-hidden glass-card">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold"><Inbox className="h-4 w-4" /> استخر Unassigned</div>
          <span className="num rounded-full bg-secondary px-2 text-[12px]">{n(pool.length)}</span>
        </div>
        <div className="num mt-0.5 text-[12px] text-muted-foreground">{n(est)} نفر-ساعت Estimation‌شده؛ {n(pool.filter((t) => !t.estimation).length)} تسک بدون Estimation</div>
        <Select value={pid} onValueChange={setPid}>
          <SelectTrigger id="pool-project" className="mt-2 h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه‌ی پروژه‌ها</SelectItem>
            {state.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <ul className="thin-scroll flex-1 divide-y overflow-y-auto">
        {pool.slice(0, 120).map((t) => (
          <li key={t.id}>
            <button className="flex w-full items-center gap-2 px-4 py-2 text-start text-[12.5px] hover:bg-foreground/[0.035]" onClick={() => dispatch({ type: 'openTask', id: t.id })}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">{projectById[t.projectId]?.name}{t.docNumber && <>، <span className="mono">{t.docNumber}</span></>}</div>
              </div>
              <span className="num shrink-0 text-[11.5px] text-muted-foreground">{t.estimation ? `${n(t.estimation)}h` : '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
