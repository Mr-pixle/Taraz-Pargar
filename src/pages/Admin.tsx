import { useMemo, useState } from 'react'
import { ArrowUpLeft, Check, Plus, Trash2, Undo2, UserPen } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { effectiveScope, isWorkItem, parentScopeOf, useFmt, useStore } from '@/lib/store'
import type { Role, StatusCategory, Task, TeamKind } from '@/lib/types'
import { Initials, JalaliDateField, PageHeader, StatusPill } from '@/components/common'
import { NewProjectDialog } from './Projects'
import { USERNAME_RE } from '@/components/Profile'
import { assignableRoles, has, PERM_FA, PERMISSION_MATRIX, ROLE_FA, ROLE_ORDER, type Perm } from '@/lib/policy'
import { MdrButton } from '@/components/MdrLink'

const KIND: Record<TeamKind, string> = { fixed: 'ثابت (همه‌ی پروژه‌ها)', phase1: 'فاز ۱', phase2: 'فاز ۲', revit: 'Revit', other: 'مستقل', supervision: 'نظارت (همه‌ی پروژه‌ها)', management: 'مدیریت' }
const CAT: Record<StatusCategory, string> = { todo: 'To Do', doing: 'In Progress', done: 'Done' }

export function Admin() {
  const { state, can } = useStore()
  const { n } = useFmt()
  const pendingCount = state.users.filter((u) => u.status === 'pending').length
  const users = can.perm('users.approve') || can.perm('users.manage')
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="کنترل پروژه و Admin" title="مدیریت">کاربران و درخواست‌های عضویت، تیم‌ها، پروژه‌ها، Statusها، تعطیلات و مرخصی‌ها، و گزارش تغییرات.</PageHeader>
      <Tabs defaultValue={pendingCount && users ? 'users' : 'status'} dir="rtl">
        <div className="scroll-x thin-scroll -mx-1 px-1">
          <TabsList className="h-auto w-max justify-start gap-0.5">
            {users && <TabsTrigger value="users" className="text-[13px]">کاربران و درخواست‌ها{pendingCount > 0 && <span className="num ms-1.5 rounded-full bg-azure px-1.5 text-[10.5px] font-semibold text-white">{n(pendingCount)}</span>}</TabsTrigger>}
            <TabsTrigger value="status" className="text-[13px]">Statusها</TabsTrigger>
            <TabsTrigger value="teams" className="text-[13px]">تیم‌ها و کاربران</TabsTrigger>
            <TabsTrigger value="projects" className="text-[13px]">پروژه‌ها</TabsTrigger>
            <TabsTrigger value="calendar" className="text-[13px]">تعطیلات و مرخصی</TabsTrigger>
            {can.perm('audit.view') && <TabsTrigger value="audit" className="text-[13px]">AuditLog</TabsTrigger>}
            <TabsTrigger value="roles" className="text-[13px]">نقش‌ها و دسترسی</TabsTrigger>
            <TabsTrigger value="decisions" className="text-[13px]">تصمیم‌ها و فرض‌ها</TabsTrigger>
          </TabsList>
        </div>
        {users && <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>}
        <TabsContent value="status" className="mt-4"><StatusAdmin /></TabsContent>
        <TabsContent value="teams" className="mt-4"><TeamsAdmin /></TabsContent>
        <TabsContent value="projects" className="mt-4"><ProjectsAdmin /></TabsContent>
        <TabsContent value="calendar" className="mt-4"><CalendarAdmin /></TabsContent>
        {can.perm('audit.view') && <TabsContent value="audit" className="mt-4"><AuditAdmin /></TabsContent>}
        <TabsContent value="roles" className="mt-4"><RolesMatrix /></TabsContent>
        <TabsContent value="decisions" className="mt-4"><Decisions /></TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------- Statuses ----------------
function StatusAdmin() {
  const store = useStore()
  const { state, dispatch, can } = store
  const { n } = useFmt()
  const [pid, setPid] = useState(state.projects[0].id)
  const [scope, setScope] = useState<string>(pid)
  const nodes = useMemo(() => Object.values(state.tasks).filter((t) => t.projectId === pid && (t.kind === 'phase' || t.kind === 'stage' || t.kind === 'group')).sort((a, b) => a.order - b.order), [state.tasks, pid])
  const own = !!state.statusSets[scope]
  const eff = scope === 'office' || scope === pid ? (state.statusSets[scope] ? scope : 'office') : effectiveScope(state, state.tasks[scope])
  const list = state.statusSets[eff]
  const parent = parentScopeOf(state, scope)
  const usage = (statusId: string) => Object.values(state.tasks).filter((t) => isWorkItem(t) && t.statusId === statusId && effectiveScope(state, t) === scope).length
  const scopeName = (k: string) => (k === 'office' ? 'پیش‌فرض دفتر' : store.projectById[k] ? `پروژه‌ی ${store.projectById[k].name}` : state.tasks[k]?.name ?? k)
  const [del, setDel] = useState<{ id: string; moveTo: string } | null>(null)

  const ScopeBtn = ({ k, label, level, t }: { k: string; label: string; level: number; t?: Task }) => (
    <button onClick={() => { setScope(k); setDel(null) }} className={cn('flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-[13px] hover:bg-accent', scope === k && 'bg-azure-soft text-azure-ink')} style={{ paddingInlineStart: 8 + level * 14 }}>
      <span className="min-w-0 truncate">{t && <span className="me-1.5 text-[10.5px] text-muted-foreground">{t.kind === 'phase' ? 'Phase' : t.kind === 'stage' ? 'Stage' : 'Group'}</span>}{label}</span>
      {state.statusSets[k] ? <span className="shrink-0 rounded bg-foreground px-1.5 text-[10px] font-medium text-background">Override</span> : <span className="shrink-0 text-[10.5px] text-muted-foreground">ارث‌بری</span>}
    </button>
  )
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="glass-card p-3">
        <Label htmlFor="st-project" className="eyebrow">پروژه</Label>
        <Select value={pid} onValueChange={(v) => { setPid(v); setScope(v) }}>
          <SelectTrigger id="st-project" className="mt-1 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{state.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="mt-3 flex max-h-[520px] flex-col gap-0.5 overflow-y-auto thin-scroll">
          <ScopeBtn k="office" label="پیش‌فرض دفتر" level={0} />
          <ScopeBtn k={pid} label={store.projectById[pid].name} level={1} />
          {nodes.map((t) => <ScopeBtn key={t.id} k={t.id} label={t.name} level={t.kind === 'phase' ? 2 : t.kind === 'stage' ? 3 : 4} t={t} />)}
        </div>
      </div>
      <div className="min-w-0 glass-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <div className="font-semibold">{scopeName(scope)}</div>
            <div className="text-[12px] text-muted-foreground">
              {scope === 'office' ? 'همه‌ی پروژه‌ها از این فهرست شروع می‌کنند.' : own ? `Override شده؛ زیرمجموعه‌ها از همین فهرست ارث می‌برند.` : `از «${scopeName(eff)}» ارث می‌برد.`}
            </div>
          </div>
          {can.perm('statuses.manage') && scope !== 'office' && (own
            ? <Button variant="outline" size="sm" onClick={() => { dispatch({ type: 'statusInherit', scope }); toast.success('به ارث‌بری برگشت', { description: `تسک‌هایی که Status آن‌ها در فهرست «${scopeName(parent ?? 'office')}» نبود، به Status هم‌دسته منتقل شدند.` }) }}><Undo2 className="h-3.5 w-3.5" /> بازگشت به ارث‌بری</Button>
            : <Button size="sm" onClick={() => dispatch({ type: 'statusOverride', scope })}>Override این بخش</Button>)}
        </div>
        <div className="divide-y">
          {list.map((s) => {
            const editable = can.perm('statuses.manage') && (own || scope === 'office')
            const used = editable ? usage(s.id) : 0
            return (
              <div key={s.id} className="px-4 py-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_150px_110px_auto]">
                  {editable ? (
                    <Input id={`st-name-${s.id}`} value={s.name} className="h-8" onChange={(e) => dispatch({ type: 'statusUpdate', scope, id: s.id, patch: { name: e.target.value } })} />
                  ) : <div><StatusPill status={s} /></div>}
                  {editable ? (
                    <Select value={s.category} onValueChange={(v) => dispatch({ type: 'statusUpdate', scope, id: s.id, patch: { category: v as StatusCategory } })}>
                      <SelectTrigger id={`st-cat-${s.id}`} className="hidden h-8 sm:flex"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(CAT) as StatusCategory[]).map((c) => <SelectItem key={c} value={c}>{CAT[c]}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span className="hidden text-[12px] text-muted-foreground sm:inline">{CAT[s.category]}</span>}
                  {editable ? (
                    <div className="hidden items-center gap-1 sm:flex"><Input id={`st-pg-${s.id}`} type="number" min={0} max={100} value={s.progress} className="num h-8" onChange={(e) => dispatch({ type: 'statusUpdate', scope, id: s.id, patch: { progress: Math.max(0, Math.min(100, Number(e.target.value))) } })} /><span className="text-muted-foreground">٪</span></div>
                  ) : <span className="num hidden text-[12px] sm:inline">{n(s.progress)}٪</span>}
                  {editable ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="حذف Status" onClick={() => {
                      if (list.length <= 1) { toast.error('حداقل یک Status لازم است.'); return }
                      if (used) setDel({ id: s.id, moveTo: list.find((x) => x.id !== s.id)!.id })
                      else { dispatch({ type: 'statusDelete', scope, id: s.id }); toast.success(`«${s.name}» حذف شد`) }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  ) : <span />}
                </div>
                {del?.id === s.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12.5px]">
                    <span><span className="num font-semibold">{n(used)}</span> تسک این Status را دارند. برای حذف، آن‌ها را منتقل کنید به:</span>
                    <Select value={del.moveTo} onValueChange={(v) => setDel({ ...del, moveTo: v })}>
                      <SelectTrigger id="st-move" className="h-8 w-[170px] bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>{list.filter((x) => x.id !== s.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="destructive" onClick={() => { dispatch({ type: 'statusDelete', scope, id: s.id, moveTo: del.moveTo }); setDel(null); toast.success(`${n(used)} تسک منتقل و «${s.name}» حذف شد`) }}>انتقال و حذف</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDel(null)}>انصراف</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {can.perm('statuses.manage') && (own || scope === 'office') && (
          <div className="border-t px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'statusAdd', scope, status: { id: `st-${Date.now().toString(36)}`, name: 'Status جدید', category: 'doing', progress: 50 } })}><Plus className="h-3.5 w-3.5" /> افزودن Status</Button>
          </div>
        )}
        <p className="border-t px-4 py-3 text-[12px] text-muted-foreground">هر Status یک Category (To Do / In Progress / Done) و یک درصد Progress دارد. Progress تسک از Status آن می‌آید. حذف Status مورداستفاده فقط با انتقال تسک‌ها مجاز است.</p>
      </div>
    </div>
  )
}

// ---------------- Users & sign-up requests ----------------
function UsersAdmin() {
  const { state, dispatch, me, teamById, can } = useStore()
  const { time, n } = useFmt()
  const roles = assignableRoles(me)
  const pending = state.users.filter((u) => u.status === 'pending')
  const [pick, setPick] = useState<Record<string, { teamId: string; role: Role }>>({})
  const [q, setQ] = useState('')
  const [nu, setNu] = useState({ name: '', username: '', password: '', teamId: 'p1a', role: 'member' as Role })
  const others = state.users.filter((u) => u.status !== 'pending' && (!q || u.name.includes(q) || u.username.includes(q.toLowerCase())))
  const STATUS: Record<string, { l: string; c: string }> = { active: { l: 'فعال', c: 'bg-leaf-soft text-leaf-ink' }, disabled: { l: 'غیرفعال', c: 'bg-secondary text-muted-foreground' }, rejected: { l: 'ردشده', c: 'bg-danger-soft text-destructive' }, pending: { l: 'در انتظار', c: 'bg-azure-soft text-azure-ink' } }
  const create = () => {
    const username = nu.username.trim().toLowerCase()
    if (!nu.name.trim()) { toast.error('نام کامل را وارد کنید.'); return }
    if (!USERNAME_RE.test(username)) { toast.error('نام کاربری معتبر نیست؛ مثل s.ahmadi'); return }
    if (state.users.some((x) => x.username === username)) { toast.error(`نام کاربری ${username} قبلاً گرفته شده است.`); return }
    if (nu.password.length < 6) { toast.error('رمز عبور باید دست‌کم ۶ نویسه باشد.'); return }
    dispatch({ type: 'addUser', user: { id: `u-new-${Date.now().toString(36)}`, name: nu.name.trim(), username, password: nu.password, teamId: nu.teamId, role: nu.role, capacity: 8, status: 'active', createdAt: new Date().toISOString() } })
    setNu({ ...nu, name: '', username: '', password: '' })
    toast.success(`کاربر ${username} تعریف و فعال شد`)
  }
  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden glass-card">
        <div className="border-b bg-foreground/[0.03] px-4 py-3">
          <div className="font-semibold">درخواست‌های عضویت <span className="num text-muted-foreground">({n(pending.length)})</span></div>
          <div className="text-[12px] text-muted-foreground">کاربر با نام کاربری، نام کامل و رمز عبور ثبت‌نام می‌کند (بدون ایمیل). با تأیید شما و تعیین تیم و نقش، به سایت دسترسی پیدا می‌کند.</div>
        </div>
        {pending.length === 0 ? <div className="px-4 py-5 text-[12.5px] text-muted-foreground">درخواستی در انتظار نیست.</div> : (
          <ul className="divide-y">
            {pending.map((u) => {
              const sel = pick[u.id] ?? { teamId: '', role: 'member' as Role }
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Initials user={u} size={32} />
                  <div className="min-w-[160px] flex-1">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-[11.5px] text-muted-foreground"><bdi className="mono">@{u.username}</bdi>، درخواست {time(u.createdAt)}</div>
                  </div>
                  <Select value={sel.teamId ?? ''} onValueChange={(v) => setPick({ ...pick, [u.id]: { ...sel, teamId: v } })}>
                    <SelectTrigger id={`rq-team-${u.id}`} className="h-9 w-[160px]"><SelectValue placeholder="تیم را انتخاب کنید" /></SelectTrigger>
                    <SelectContent>{state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={sel.role} onValueChange={(v) => setPick({ ...pick, [u.id]: { ...sel, role: v as Role } })}>
                    <SelectTrigger id={`rq-role-${u.id}`} className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_FA[r]}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => { if (!sel.teamId) { toast.error('برای تأیید، تیم کاربر را انتخاب کنید.'); return } dispatch({ type: 'approveUser', id: u.id, teamId: sel.teamId, role: sel.role }); toast.success(`حساب ${u.username} تأیید شد`, { description: `عضو تیم ${teamById[sel.teamId]?.name} شد و حالا می‌تواند وارد شود.` }) }}><Check className="h-3.5 w-3.5" /> تأیید</Button>
                    <Button size="sm" variant="ghost" onClick={() => { dispatch({ type: 'rejectUser', id: u.id }); toast(`درخواست ${u.username} رد شد`) }}>رد</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {has(me, 'users.manage') && <section className="glass-card">
        <div className="border-b px-4 py-3"><div className="font-semibold">تعریف کاربر</div><div className="text-[12px] text-muted-foreground">کاربری که مدیر یا کنترل پروژه مستقیم تعریف می‌کند، بدون مرحله‌ی تأیید فعال می‌شود.</div></div>
        <form className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto] lg:items-end" onSubmit={(e) => { e.preventDefault(); create() }}>
          <div><Label htmlFor="nu-name" className="eyebrow">نام کامل</Label><Input id="nu-name" className="mt-1 h-9" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></div>
          <div><Label htmlFor="nu-user" className="eyebrow">نام کاربری</Label><Input id="nu-user" dir="ltr" className="mono mt-1 h-9" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} placeholder="s.ahmadi" /></div>
          <div><Label htmlFor="nu-pass" className="eyebrow">رمز اولیه</Label><Input id="nu-pass" type="password" autoComplete="new-password" className="mt-1 h-9" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></div>
          <div><Label htmlFor="nu-team" className="eyebrow">تیم</Label><Select value={nu.teamId} onValueChange={(v) => setNu({ ...nu, teamId: v })}><SelectTrigger id="nu-team" className="mt-1 h-9"><SelectValue /></SelectTrigger><SelectContent>{state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="nu-role" className="eyebrow">نقش</Label><Select value={nu.role} onValueChange={(v) => setNu({ ...nu, role: v as Role })}><SelectTrigger id="nu-role" className="mt-1 h-9"><SelectValue /></SelectTrigger><SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_FA[r]}</SelectItem>)}</SelectContent></Select></div>
          <Button type="submit" className="h-9"><Plus className="h-4 w-4" /> تعریف</Button>
        </form>
      </section>}

      <section className="overflow-hidden glass-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <span className="font-semibold">همه‌ی کاربران</span>
          <Input id="users-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام یا ID" className="h-8 w-[200px] text-[12.5px]" />
        </div>
        <div className="scroll-x thin-scroll">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="border-b bg-foreground/[0.03] text-[11.5px] text-muted-foreground"><tr>{['نام', 'ID', 'تیم', 'نقش', 'سمت', 'وضعیت', ''].map((h, i) => <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {others.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5"><span className="flex items-center gap-2"><Initials user={u} size={22} />{u.name}</span></td>
                  <td className="px-3 py-1.5"><bdi className="mono text-[12px]">@{u.username}</bdi></td>
                  <td className="px-3 py-1.5 text-muted-foreground">{teamById[u.teamId]?.name ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{ROLE_FA[u.role]}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{u.title ?? '—'}</td>
                  <td className="px-3 py-1.5"><span className={cn('rounded px-1.5 py-0.5 text-[11px]', STATUS[u.status].c)}>{STATUS[u.status].l}</span></td>
                  <td className="px-3 py-1.5 text-end">{can.editUser(u.id) && <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'openProfile', id: u.id })}><UserPen className="h-3.5 w-3.5" /> ویرایش</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---------------- Teams ----------------
function TeamsAdmin() {
  const { state, activeUsers, dispatch } = useStore()
  const { n } = useFmt()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-muted-foreground">هر نفر فقط عضو یک تیم است. ظرفیت پیش‌فرض ۸ ساعت در روز کاری (شنبه تا چهارشنبه). {n(activeUsers.length)} کاربر فعال. برای ویرایش، روی نام هر نفر بزنید.</p>
      <div className="scroll-x thin-scroll glass-card">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead className="border-b bg-foreground/[0.03] text-[11.5px] text-muted-foreground"><tr><th className="px-3 py-2 text-start font-medium">تیم</th><th className="px-3 py-2 text-start font-medium">Kind</th><th className="px-3 py-2 text-start font-medium">اعضا</th><th className="px-3 py-2 text-end font-medium">ظرفیت روزانه</th></tr></thead>
          <tbody>
            {state.teams.map((t) => {
              const ms = activeUsers.filter((u) => u.teamId === t.id)
              return (
                <tr key={t.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{t.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{KIND[t.kind]}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {ms.map((u) => (
                        <button key={u.id} onClick={() => dispatch({ type: 'openProfile', id: u.id })} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pe-2.5 ps-0.5 text-[12px] hover:bg-accent">
                          <Initials user={u} size={20} />{u.name}
                          {u.role !== 'member' && <span className={cn('rounded px-1 text-[10px] font-medium', u.role === 'ceo' ? 'bg-foreground text-background' : 'bg-azure-soft text-azure-ink')}>{ROLE_FA[u.role]}</span>}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-end">{n(ms.reduce((s, u) => s + u.capacity, 0))} ساعت</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Projects ----------------
function ProjectsAdmin() {
  const { state, dispatch, can } = useStore()
  const { time } = useFmt()
  const [open, setOpen] = useState(false)
  const p1 = state.teams.filter((t) => t.kind === 'phase1')
  const p2 = state.teams.filter((t) => t.kind === 'phase2')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground">هر پروژه یک تیم فاز ۱ و یک تیم فاز ۲ دارد. تیم‌های ثابت و Revit به همه‌ی پروژه‌ها متصل‌اند.</p>
        {can.perm('project.define') && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> تعریف پروژه</Button>}
      </div>
      <div className="scroll-x thin-scroll glass-card">
        <table className="w-full min-w-[1000px] border-collapse text-[13px]">
          <thead className="border-b bg-foreground/[0.03] text-[11.5px] text-muted-foreground"><tr>{['Code', 'نام', 'نوع', 'مدیر پروژه', 'تیم فاز ۱', 'تیم فاز ۲', 'MDR / Tab', 'آخرین Sync'].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {state.projects.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="mono px-3 py-2">{p.code}</td>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.type}</td>
                <td className="px-3 py-2">
                  <Select value={p.managerId ?? 'none'} onValueChange={(v) => dispatch({ type: 'projectUpdate', id: p.id, patch: { managerId: v === 'none' ? undefined : v } })} disabled={!can.perm('project.define')}>
                    <SelectTrigger id={`pa-pm-${p.id}`} className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{state.users.filter((u) => u.status === 'active' && u.role === 'pm').map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Select value={p.phase1TeamId} onValueChange={(v) => dispatch({ type: 'projectUpdate', id: p.id, patch: { phase1TeamId: v } })} disabled={!can.perm('project.define')}>
                    <SelectTrigger id={`pa-p1-${p.id}`} className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{p1.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Select value={p.phase2TeamId} onValueChange={(v) => dispatch({ type: 'projectUpdate', id: p.id, patch: { phase2TeamId: v } })} disabled={!can.perm('project.define')}>
                    <SelectTrigger id={`pa-p2-${p.id}`} className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{p2.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="whitespace-nowrap px-3 py-2"><MdrButton project={p} compact /> <span className="mono text-[11px] text-muted-foreground">{p.mdrTab}</span></td>
                <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground">{p.lastSync ? time(p.lastSync) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground">تغییر تیم فاز در این نمونه تخصیص‌های موجود را جابه‌جا نمی‌کند؛ فقط تب‌های تیمی صفحه‌ی پروژه به‌روز می‌شوند.</p>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

// ---------------- Holidays & leaves ----------------
function CalendarAdmin() {
  const { state, dispatch, userById, can } = useStore()
  const { d, n } = useFmt()
  const [hDate, setHDate] = useState<string | undefined>()
  const [hTitle, setHTitle] = useState('')
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="min-w-0 glass-card">
        <div className="border-b px-4 py-3"><div className="font-semibold">تعطیلات رسمی</div><div className="text-[12px] text-muted-foreground">پنجشنبه و جمعه همیشه تعطیل‌اند. تعطیلات قمری را هر سال اینجا وارد کنید.</div></div>
        <ul className="max-h-[360px] divide-y overflow-y-auto thin-scroll">
          {state.holidays.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <span className="num w-24 shrink-0">{d(h.date)}</span><span className="min-w-0 flex-1 truncate">{h.title}</span>
              {can.perm('calendar.manage') && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="حذف" onClick={() => dispatch({ type: 'removeHoliday', id: h.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </li>
          ))}
        </ul>
        {can.perm('calendar.manage') && (
          <form className="flex flex-wrap items-end gap-2 border-t px-4 py-3" onSubmit={(e) => { e.preventDefault(); if (!hDate || !hTitle.trim()) { toast.error('تاریخ و عنوان را وارد کنید.'); return } dispatch({ type: 'addHoliday', holiday: { id: `h-${Date.now()}`, date: hDate, title: hTitle.trim() } }); setHTitle(''); setHDate(undefined); toast.success('تعطیلی اضافه شد', { description: 'ظرفیت آن روز در Workload و اعتبارسنجی صفر می‌شود.' }) }}>
            <div className="w-36"><Label htmlFor="h-date" className="eyebrow">تاریخ</Label><div className="mt-1"><JalaliDateField id="h-date" value={hDate} onChange={setHDate} /></div></div>
            <div className="min-w-[140px] flex-1"><Label htmlFor="h-title" className="eyebrow">عنوان</Label><Input id="h-title" className="mt-1 h-9" value={hTitle} onChange={(e) => setHTitle(e.target.value)} /></div>
            <Button type="submit" className="h-9"><Plus className="h-4 w-4" /> افزودن</Button>
          </form>
        )}
      </div>
      <div className="min-w-0 glass-card">
        <div className="border-b px-4 py-3"><div className="font-semibold">مرخصی‌ها</div><div className="text-[12px] text-muted-foreground">مرخصی از ظرفیت آن روز نفر کم می‌شود. مرخصی‌ها از «درخواست‌های اداری» پس از تأیید نهایی می‌آیند؛ ثبت مستقیم برای موارد استثنا با مدیر اداری است.</div></div>
        <ul className="max-h-[360px] divide-y overflow-y-auto thin-scroll">
          {[...state.leaves].sort((a, b) => a.date.localeCompare(b.date)).map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <span className="num w-24 shrink-0">{d(l.date)}</span>
              <span className="min-w-0 flex-1 truncate">{userById[l.userId]?.name} <span className="text-muted-foreground">، {n(l.hours)} ساعت، {l.requestId ? `درخواست #${n(state.adminRequests.find((r) => r.id === l.requestId)?.no ?? 0)}` : l.by ? 'ثبت مستقیم مدیر اداری' : 'ثبت پیش از ماژول اداری'}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------- Audit ----------------
function AuditAdmin() {
  const { state, userById, dispatch, can } = useStore()
  const { time } = useFmt()
  const [kind, setKind] = useState('all')
  const KINDS: Record<string, string> = { status: 'Status', allocation: 'تخصیص', dates: 'تاریخ', estimation: 'Estimation', sync: 'Sync', admin: 'مدیریت', task: 'تسک', review: 'بررسی', actual: 'تاریخ واقعی', security: 'رد دسترسی', points: 'امتیاز', worklog: 'Work Log', request: 'درخواست اداری', timesheet: 'تایم‌شیت' }
  // lines about tasks the viewer may not open (the Finance & Administration space for Project Control) are not listed
  const list = state.audit.filter((a) => (kind === 'all' || a.kind === kind) && can.seeAudit(a))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger id="audit-kind" className="h-8 w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">همه‌ی تغییرات</SelectItem>{Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground">هر تغییر Status، تخصیص، تاریخ، گردش‌کار و هر تلاش ردشده‌ی بدون دسترسی ثبت می‌شود.</span>
      </div>
      <div className="overflow-hidden glass-card">
        <ul className="divide-y">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="w-24 shrink-0 text-[11.5px] text-muted-foreground">{time(a.at)}</span>
              <span className={cn('rounded px-1.5 py-0.5 text-[11px]', a.kind === 'security' ? 'bg-danger-soft text-destructive' : 'bg-secondary')}>{KINDS[a.kind]}</span>
              <span className="min-w-0 flex-1">{a.text}</span>
              {a.taskId && state.tasks[a.taskId] && can.viewTask(state.tasks[a.taskId]) && <button className="inline-flex items-center gap-1 text-[12px] text-azure hover:underline" onClick={() => dispatch({ type: 'openTask', id: a.taskId! })}>{state.tasks[a.taskId].docNumber ?? state.tasks[a.taskId].name}<ArrowUpLeft className="h-3 w-3" /></button>}
              <span className="text-[12px] text-muted-foreground">{userById[a.userId]?.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------- Decisions log ----------------
const DECISIONS: { tag: 'prompt' | 'demo' | 'open'; text: string }[] = [
  { tag: 'prompt', text: 'تیم Revit همراه کارهای فاز ۲ به پروژه متصل است. در این نمونه، Stage «مدل BIM» به تیم Revit می‌رود.' },
  { tag: 'prompt', text: 'پایگاه داده‌ی اصلی PostgreSQL است. Google Sheet منبع MDR و مقصد ۳ ستون بازنویسی است، نه دیتابیس اصلی.' },
  { tag: 'prompt', text: 'Weight روی سطرهای والد داده شده است. اگر Weight فرزندان خالی بود، وزن والد مساوی تقسیم و در Sync Review گزارش می‌شود.' },
  { tag: 'prompt', text: 'تغییر سطرهای موجود (نام، وزن، طبقه، جابه‌جایی) هم Diff می‌شود و در صف تأیید می‌رود. سطر حذف‌شده فقط علامت «Removed from MDR» می‌گیرد.' },
  { tag: 'prompt', text: 'Due Date همان Plan Issue Date است. Plan Issue Date موجود در MDR فقط مرجع نمایشی است و Sync نمی‌شود.' },
  { tag: 'prompt', text: 'Progress تسک از Status آن می‌آید و Progress والد با Weight وزنی محاسبه می‌شود.' },
  { tag: 'prompt', text: 'R&D مثل کنترل پروژه تیم ثابت (Fixed) است و در همه‌ی پروژه‌ها دخیل است: در صفحه‌ی هر پروژه تب خودش را دارد، تسک پروژه به آن یا اعضایش تخصیص داده می‌شود، اعضایش تسک‌ها و چت همه‌ی پروژه‌ها را می‌بینند و در Workload هم شمرده می‌شود.' },
  { tag: 'demo', text: 'مدیرعامل، مدیر فنی و مدیران پروژه عضو تیم «مدیریت» هستند.' },
  { tag: 'demo', text: 'نقش‌ها جایگزین سه نقش قبلی شد: Admin ← مدیرعامل، Control ← کنترل پروژه، Member ← عضو تیم و سرپرست هر تیم ← سرپرست تیم. مدیر سیستم همان کنترل پروژه است (کاربران، نقش‌ها و تنظیمات). ماتریس در تب «نقش‌ها و دسترسی» است.' },
  { tag: 'demo', text: 'بخش کنترل پروژه (Workload، صف و اجراهای Sync، مدیریت و گزارش امتیازات) فقط برای مدیرعامل و کنترل پروژه است؛ در منو، داشبورد و صفحه‌ی پروژه برای دیگران نمایش داده نمی‌شود و عملیات آن برای دیگران رد و ثبت می‌شود.' },
  { tag: 'demo', text: 'امتیاز: Point = (W.F ÷ Estimation) × ۱۰۰ × نفرساعت تعجیل یا تأخیر؛ نفرساعت = روز کاری (شنبه تا چهارشنبه، بدون تعطیلات) × ۸. مبنا Actual Finish است؛ برای تسک دارای Reviewer، تاریخ تأیید. تسکی که به تیم (نه یک نفر) تخصیص دارد یا Estimation ندارد امتیاز نمی‌گیرد.' },
  { tag: 'demo', text: 'دفتر امتیاز فقط‌افزودنی است: بازگشایی، تغییر Due/Estimation/W.F یا بازمحاسبه یک ردیف برگشت و در صورت نیاز یک ردیف تازه می‌سازد؛ برای هر تسک همیشه حداکثر یک ردیف فعال هست. تغییر پارامترها نسخه‌ی تازه می‌سازد و امتیازهای ثبت‌شده را عوض نمی‌کند.' },
  { tag: 'demo', text: 'امتیاز تسک‌های تمام‌شده‌ی داده‌ی نمونه با نسخه‌ی ۱ پارامترها یک بار هنگام راه‌اندازی محاسبه شد (برچسب «محاسبه‌ی اولیه»). W.F پیش‌فرض بر اساس نوع کار تعیین شد و قابل تغییر است.' },
  { tag: 'demo', text: 'هر عملیات پیش از اجرا با قواعد دسترسی بررسی می‌شود (نه فقط با پنهان کردن دکمه). عملیات ردشده هیچ داده‌ای را تغییر نمی‌دهد و در AuditLog با برچسب «رد دسترسی» ثبت می‌شود.' },
  { tag: 'demo', text: 'Actual Start با اولین رفتن به وضعیت در حال کار، و Actual Finish با رسیدن به وضعیت Done یا تأیید Reviewer ثبت می‌شود. اصلاح دستی فقط با کنترل پروژه یا مدیرعامل و با ذکر دلیل.' },
  { tag: 'demo', text: 'تسکی که Reviewer دارد مستقیم Done نمی‌شود؛ مجری «ارسال برای بررسی» می‌زند و Reviewer تأیید می‌کند یا با دلیل برمی‌گرداند. هر دور بررسی جدا ثبت می‌شود.' },
  { tag: 'demo', text: 'تسک‌های فضای تیم (پروژه‌ی داخلی) در Progress، گزارش و Workload پروژه‌ها حساب نمی‌شوند و فقط اعضای همان تیم و مدیرعامل آن‌ها را می‌بینند.' },
  { tag: 'demo', text: 'Work Log: هر رکورد کاربر، مدت، تاریخ انجام، توضیح و زمان ثبت دارد و پروژه و تیم همان لحظه را هم نگه می‌دارد تا گزارش‌های آینده (هر نفر، هر تیم، هر پروژه) درست بماند. ویرایش مقدار قبلی را در تاریخچه‌ی رکورد نگه می‌دارد و حذف فقط علامت حذف می‌زند.' },
  { tag: 'demo', text: 'ثبت زمان: مسئول، مشارکت‌کنندگان، Reviewer، گزارش‌دهنده و تیم مسئول، فقط برای خودشان و نه برای تاریخ آینده؛ جمع یک نفر در یک روز حداکثر ۲۴ ساعت. هر کس سوابق خودش را می‌بیند؛ مدیرعامل، مدیریت و کنترل پروژه، مدیر همان پروژه و سرپرست همان تیم سوابق همه را. رکورد خود تا بسته شدن تسک قابل ویرایش و حذف است؛ مدیرعامل و کنترل پروژه هر رکوردی را با دلیل.' },
  { tag: 'demo', text: 'Time Progress = Logged Time ÷ Original Estimation × ۱۰۰. Original Estimation اولین Estimation تسک است و عوض نمی‌شود؛ اگر Estimation بعداً تغییر کند، مقدار فعلی کنار آن نمایش داده می‌شود. زیر ۸۰٪ عادی، ۸۰ تا ۱۰۰٪ نزدیک سقف، بیش از ۱۰۰٪ عبور از Estimation. اولین Work Log در صورت زودتر بودن، Actual Start را هم تعیین می‌کند.' },
  { tag: 'open', text: 'پیوست‌ها در این نسخه در حافظه‌ی صفحه نگه داشته می‌شوند (حداکثر ۳ مگابایت برای هر فایل) و با بارگذاری دوباره پاک می‌شوند؛ در نسخه‌ی سروری در فضای ذخیره‌سازی فایل نگه‌داری می‌شوند.' },
  { tag: 'open', text: 'تعطیلات قمری هر سال جابه‌جا می‌شوند. در این نمونه فقط تعطیلات شمسی ثابت و یک تعطیلی آزمایشی وارد شده است.' },
  { tag: 'demo', text: 'تخصیص به یک نفر هم از ظرفیت آن نفر و هم از ظرفیت باقی‌مانده‌ی تیمش کم می‌شود، تا جمع تیمی هیچ‌وقت از ظرفیت بیشتر نشود.' },
  { tag: 'demo', text: 'زیرتسک‌های دستی زیر یک Document در Progress آن سند حساب نمی‌شوند؛ Progress سند از Status خودش است و همان به MDR نوشته می‌شود.' },
  { tag: 'demo', text: 'تسک‌های «Removed from MDR» در Roll-up پیشرفت والد حساب نمی‌شوند.' },
  { tag: 'demo', text: 'چون Statusها در هر بخش می‌توانند فرق کنند، تخته‌ی Kanban برای هر Status Set جدا نمایش داده می‌شود.' },
  { tag: 'demo', text: 'Member فقط Status تسک‌های خودش و تیمش را تغییر می‌دهد. تسک دستی، زیرتسک و تخصیص با کنترل پروژه است.' },
  { tag: 'demo', text: 'تأخیر Write-back دو دقیقه بعد از آخرین تغییر Status، و Sync دوره‌ای هر دو ساعت در روزهای کاری؛ هر دو قابل تنظیم.' },
  { tag: 'demo', text: 'ورود با نام کاربری و رمز، بدون ایمیل. کاربر خودش ثبت‌نام می‌کند و تا تأیید مدیر یا کنترل پروژه (همراه تعیین تیم و نقش) وارد نمی‌شود. این با فرض «ورود با Google» در Prompt جایگزین شد.' },
  { tag: 'open', text: 'سیاست رمز عبور (حداقل طول، بازنشانی رمز فراموش‌شده بدون ایمیل) باید مشخص شود. پیشنهاد: بازنشانی فقط توسط مدیر یا کنترل پروژه از صفحه‌ی پروفایل کاربر.' },
  { tag: 'demo', text: 'هر پروژه یک چت دارد که اعضای تیم‌های همان پروژه (تیم‌های ثابت، فاز ۱، فاز ۲، Revit) و مدیرعامل، مدیریت و مدیر همان پروژه در آن هستند؛ تیم نظارت و اجرا هم عضو چت همه‌ی پروژه‌هاست. رویدادهای Sync، صدور سند و Write-back خودکار در آن ثبت می‌شود.' },
  { tag: 'demo', text: 'اعلان برای: تخصیص، تغییر Status تسک‌های شخص یا تیم، صدور سند (برای کنترل پروژه)، تگ شدن با @ در کامنت یا چت، کامنت تازه روی تسک خود، اطلاعیه‌ی سازمانی، رویدادهای Sync و درخواست یا تأیید حساب. کسی که کاری را انجام می‌دهد، برای کار خودش اعلان نمی‌گیرد.' },
  { tag: 'demo', text: 'همه‌ی ساعت‌ها و «امروز» به وقت تهران (Asia/Tehran) محاسبه و نمایش داده می‌شود، مستقل از ساعت دستگاه کاربر.' },
  { tag: 'demo', text: 'مرخصی‌ای که بعد از برنامه‌ریزی ثبت شود، تخصیص را رد نمی‌کند؛ در Workload به‌صورت «بیش از ظرفیت» دیده می‌شود تا کنترل پروژه بازبرنامه‌ریزی کند.' },
  { tag: 'prompt', text: 'مدیرعامل و کنترل پروژه فضای همه‌ی تیم‌ها را می‌بینند، وارد هر تیم می‌شوند، تسک می‌سازند و به اعضای همان تیم ارجاع می‌دهند. تسک ساخته‌شده در فضای همان تیم ثبت می‌شود و مالکیت تیم عوض نمی‌شود. ساخت «پروژه‌ی داخلی» (ساختار فضای تیم) مثل قبل با سرپرست همان تیم و مدیرعامل است.' },
  { tag: 'prompt', text: 'فیلدهای Task در شش گروه A تا F مرتب شده‌اند (شناسه و طبقه‌بندی، افراد، زمان‌بندی و برآورد، وضعیت و پیشرفت، بررسی و پیوست، گفتگو و تاریخچه). Package و Floor در «شناسه»، Plan Issue Date در «زمان‌بندی»، Weight و W.F و Point در «وضعیت و پیشرفت» و مسئول فقط در «افراد» است. ستون‌های فهرست‌ها، فیلترها و Tooltip Gantt به همین ترتیب و با همین نام‌ها هستند.' },
  { tag: 'prompt', text: 'بخش «فضای مالی و اداری» دو فضای جدا دارد: فضای مالی برای مدیرعامل و مدیر مالی، فضای اداری (مدیریتی) برای مدیرعامل و مدیر اداری؛ هر خواندن و نوشتن در سرویس برای همان فضا بررسی می‌شود و مسئول، Reviewer و مشارکت‌کنندگان هم از افراد همان فضا هستند. مدیرعامل همه‌ی Taskهای هر دو فضا را مدیریت می‌کند و Reviewer پیش‌فرض است؛ مدیر مالی و مدیر اداری Taskهایی را که خودشان ساخته‌اند مدیریت و پیشرفت Taskهای خودشان را ثبت می‌کنند.' },
  { tag: 'prompt', text: 'هر پروژه هنگام تعریف لینک MDR خودش (Google Sheet) را می‌گیرد و بدون آن تعریف نمی‌شود. در صفحه‌ی هر پروژه دکمه‌ی «MDR پروژه» (و کلید میانبر Alt+M) همان MDR را در برگه‌ی تازه باز می‌کند؛ مدیرعامل و کنترل پروژه لینک را ثبت یا عوض می‌کنند. پروژه‌های نمونه MDR واقعی ندارند و لینکشان خالی است تا لینک واقعی ثبت شود.' },
  { tag: 'demo', text: 'Taskهای فضای مالی و فضای اداری Work Log و امتیاز ندارند و در Workload، گزارش امتیازات، گزارش‌های Work Log، درخواست اضافه‌کاری و AuditLog بخش مدیریت (برای کنترل پروژه) نمی‌آیند، چون آن گزارش‌ها را نقش‌های دیگر هم می‌بینند. نقش مدیر اداری و مدیر مالی را فقط مدیرعامل می‌دهد.' },
]
function Decisions() {
  const { n } = useFmt()
  const TAG = { prompt: { l: 'فرض Prompt', c: 'bg-secondary text-foreground' }, demo: { l: 'تصمیم این نمونه', c: 'bg-azure-soft text-azure-ink' }, open: { l: 'نیاز به تصمیم', c: 'bg-foreground text-background' } }
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-[12.5px] text-muted-foreground">معادل docs/decisions-log.md. فرض‌های Prompt و تصمیم‌هایی که در ساخت این نمونه گرفته شد، برای تأیید مدیرعامل.</p>
      <ol className="overflow-hidden glass-card">
        {DECISIONS.map((x, i) => (
          <li key={i} className="flex items-start gap-3 border-b px-4 py-3 text-[13px] last:border-0">
            <span className="num mt-0.5 w-6 shrink-0 text-muted-foreground">{n(i + 1)}</span>
            <span className="min-w-0 flex-1 leading-relaxed">{x.text}</span>
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', TAG[x.tag].c)}>{TAG[x.tag].l}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------- Roles & permissions (read from lib/policy.ts, the same table the reducer enforces) ----------------
function RolesMatrix() {
  const { activeUsers } = useStore()
  const { n } = useFmt()
  const perms = Object.keys(PERM_FA) as Perm[]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-muted-foreground">این جدول مستقیم از همان قواعدی خوانده می‌شود که پیش از هر عملیات بررسی می‌شوند. دسترسی‌های دامنه‌دار (مدیر پروژه در پروژه‌ی خود، سرپرست در تیم خود، عضو در تسک خود و تیم) در متن هر ردیف آمده است.</p>
      <div className="scroll-x thin-scroll glass-card">
        <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
          <thead className="border-b bg-foreground/[0.03] text-[11.5px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">عملیات</th>
              {ROLE_ORDER.map((r) => <th key={r} className="px-2 py-2 text-center font-medium">{ROLE_FA[r]}<div className="num text-[10.5px] font-normal">{n(activeUsers.filter((u) => u.role === r).length)} نفر</div></th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p} className="border-b last:border-0">
                <td className="px-3 py-1.5">{PERM_FA[p]}</td>
                {ROLE_ORDER.map((r) => <td key={r} className="px-2 py-1.5 text-center">{PERMISSION_MATRIX[p].includes(r) ? <Check className="mx-auto h-4 w-4 text-leaf" aria-label="دارد" /> : <span className="text-muted-foreground/50" aria-label="ندارد">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
