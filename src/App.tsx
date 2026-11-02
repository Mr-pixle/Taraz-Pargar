import { useState } from 'react'
import { DirectionProvider } from '@radix-ui/react-direction'
import { Toaster } from 'sonner'
import { Bell, ClipboardCheck, Clock3, ListTodo, FileBarChart2, FilePen, FolderKanban, Gauge, GitPullRequestArrow, History, House, Inbox, Landmark, Lock, MessagesSquare, Settings2, Trophy, UsersRound, Warehouse } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useLiquidDrop } from '@/lib/useLiquidDrop'
import { StoreProvider, useFmt, useStore, type Page } from '@/lib/store'
import { SERVER_MODE } from '@/lib/remote'
import { finSpacesOf } from '@/lib/policy'
import { Empty, Logo } from '@/components/common'
import { TaskDrawer } from '@/components/TaskDrawer'
import { ProfileDialog } from '@/components/Profile'
import { TopBar } from '@/components/TopBar'
import { Home } from '@/pages/Home'
import { ProjectPage, Projects } from '@/pages/Projects'
import { Workload } from '@/pages/Workload'
import { SyncReview } from '@/pages/SyncReview'
import { SyncRuns } from '@/pages/SyncRuns'
import { Admin } from '@/pages/Admin'
import { Notifications } from '@/pages/Notifications'
import { ChatPage } from '@/pages/Chat'
import { Auth } from '@/pages/Auth'
import { SupervisionPage, TeamSpace } from '@/pages/Spaces'
import { PointsReport } from '@/pages/Points'
import { AdminReportsPage, InboxPage, RequestsPage, TimesheetPage } from '@/pages/AdminModule'
import { PersonalPage } from '@/pages/Personal'
import { FinAdminPage } from '@/pages/FinAdmin'

type NavItem = { page: Page; label: string; icon: typeof House; restricted?: boolean }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'کار', items: [
    { page: 'home', label: 'خانه', icon: House },
    { page: 'notifications', label: 'اعلان‌ها', icon: Bell },
    { page: 'projects', label: 'پروژه‌ها', icon: FolderKanban },
    { page: 'supervision', label: 'نظارت و اجرا', icon: ClipboardCheck },
    { page: 'team', label: 'فضای تیم', icon: Warehouse },
    { page: 'personal', label: 'کارهای شخصی', icon: ListTodo },
  ] },
  { group: 'اداری', items: [
    { page: 'requests', label: 'درخواست‌های من', icon: FilePen },
    { page: 'timesheet', label: 'تایم‌شیت', icon: Clock3 },
    { page: 'inbox', label: 'کارتابل', icon: Inbox, restricted: true },
    { page: 'adminreports', label: 'گزارش‌های اداری', icon: FileBarChart2, restricted: true },
    { page: 'finadmin', label: 'فضای مالی و اداری', icon: Landmark, restricted: true },
  ] },
  { group: 'گفتگو', items: [
    { page: 'pchat', label: 'چت پروژه', icon: MessagesSquare },
    { page: 'chat', label: 'چت عمومی', icon: UsersRound },
  ] },
  { group: 'کنترل پروژه', items: [
    { page: 'workload', label: 'Workload', icon: Gauge, restricted: true },
    { page: 'review', label: 'صف Sync Review', icon: GitPullRequestArrow, restricted: true },
    { page: 'runs', label: 'اجراهای Sync', icon: History, restricted: true },
    { page: 'points', label: 'گزارش امتیازات', icon: Trophy, restricted: true },
    { page: 'admin', label: 'مدیریت', icon: Settings2, restricted: true },
  ] },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state, dispatch, can, unread, myChannels, unreadIn, me } = useStore()
  const { n } = useFmt()
  const pending = state.syncItems.filter((x) => x.state === 'pending').length
  const requests = state.users.filter((u) => u.status === 'pending').length
  const current = state.nav.page === 'project' ? 'projects' : state.nav.page
  // CEO and Project Control land on the overview of all team spaces; everyone else on their own team
  const go = (page: Page) => dispatch({ type: 'nav', nav: page === 'team' && !can.perm('teamspace.all') ? { page, teamId: me.teamId } : { page } })
  const drop = useLiquidDrop<HTMLElement>('y', '[data-drop-active="true"]')
  const badgeOf = (p: Page) => p === 'notifications' ? unread
    : p === 'review' ? pending
      : p === 'runs' ? state.writeQueue.length
        : p === 'admin' ? requests
          : p === 'pchat' ? myChannels.filter((c) => c.startsWith('project:')).reduce((s, c) => s + unreadIn(c), 0)
            : p === 'chat' ? unreadIn('general') + unreadIn('announce')
              : p === 'supervision' ? Object.values(state.tasks).filter((t) => t.kind === 'supervision' && ((t.assigneeUserId === me.id && ['assigned', 'rework'].includes(t.flow ?? '')) || (t.reviewerId === me.id && t.flow === 'in_review'))).length
                : p === 'team' ? Object.values(state.tasks).filter((t) => t.kind === 'internal' && ((t.assigneeUserId === me.id && ['assigned', 'rework'].includes(t.flow ?? '')) || (t.reviewerId === me.id && t.flow === 'in_review'))).length
                  : p === 'inbox' ? state.adminRequests.filter((r) => can.decideRequest(r)).length
                    : p === 'timesheet' ? Object.values(state.timesheets).filter((d) => d.userId === me.id && d.calc.undecided > 0).length
                      : p === 'finadmin' ? Object.values(state.tasks).filter((t) => t.kind === 'finadmin' && can.viewTask(t) && ((t.assigneeUserId === me.id && ['assigned', 'rework'].includes(t.flow ?? '')) || (t.reviewerId === me.id && t.flow === 'in_review'))).length : 0
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <Logo className="h-8 w-8 text-foreground" />
        <div className="leading-tight">
          <div className="text-[18px] font-extrabold tracking-tight">تراز</div>
          <div className="text-[11px] text-muted-foreground">سامانه‌ی کار و ظرفیت پرگار</div>
        </div>
      </div>
      {/* nav and projects scroll on short screens so the footer stays reachable */}
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pb-3">
      <nav ref={drop.ref} className="relative flex flex-col gap-3 px-2" aria-label="ناوبری اصلی">
        <span aria-hidden="true" className={cn('drop', !drop.animate && 'no-anim')} style={drop.style} />
        {NAV.map((g) => {
          const items = g.items.filter((x) => !x.restricted || can.page(x.page))
          if (!items.length) return null
          return (
            <div key={g.group} className="flex flex-col gap-0.5">
              <div className="eyebrow px-2.5 pb-0.5">{g.group}</div>
              {items.map((x) => {
                const Icon = x.icon
                const badge = badgeOf(x.page)
                // the section is named after the spaces this person may open: both for the CEO, one for each manager
                const fin = x.page === 'finadmin' ? finSpacesOf(me) : []
                const label = x.page !== 'finadmin' || fin.length !== 1 ? x.label : fin[0] === 'finance' ? 'فضای مالی' : 'فضای اداری'
                return (
                  <button key={x.page} onClick={() => { go(x.page); onNavigate?.() }}
                    aria-current={current === x.page ? 'page' : undefined}
                    data-drop-active={current === x.page}
                    className={cn('relative z-[1] flex items-center gap-2.5 rounded-full px-3 py-[7px] text-[13.5px] transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]',
                      current === x.page ? 'font-semibold text-foreground [&>svg]:text-azure' : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground')}>
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-start">{label}</span>
                    {badge > 0 && <span className="num rounded-full bg-azure px-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25)]">{n(badge)}</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="mt-5 px-4">
        <div className="eyebrow mb-1.5">پروژه‌ها</div>
        <div className="flex flex-col">
          {state.projects.map((p) => (
            <button key={p.id} onClick={() => { dispatch({ type: 'nav', nav: { page: 'project', projectId: p.id } }); onNavigate?.() }}
              className={cn('flex items-center gap-2 rounded-lg px-1.5 py-1 text-start text-[12.5px] transition-colors hover:bg-foreground/[0.06]', state.nav.page === 'project' && state.nav.projectId === p.id ? 'bg-foreground/[0.06] font-semibold text-foreground' : 'text-muted-foreground')}>
              <span className="mono w-8 shrink-0 text-[10.5px]">{p.code}</span><span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
      </div>
      <div className="glass-divider shrink-0 border-t px-4 py-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="fa-digits" className="text-[12.5px]">ارقام فارسی</Label>
          <Switch id="fa-digits" checked={state.persianDigits} onCheckedChange={(v) => dispatch({ type: 'setDigits', on: v })} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{SERVER_MODE
          ? 'همه‌ی تغییرها روی سرور تراز ثبت و برای همه‌ی همکاران هم‌زمان به‌روز می‌شود.'
          : 'نسخه‌ی نمایشی با داده‌ی نمونه. تغییرات، پیام‌ها، پیوست‌ها و حساب‌ها فقط در همین صفحه می‌ماند و با بارگذاری دوباره به حالت اول برمی‌گردد.'}</p>
      </div>
    </div>
  )
}

function Main() {
  const { state, can } = useStore()
  const p = state.nav.page
  if (!can.page(p)) {
    if (p === 'inbox') return <Empty icon={<Lock className="h-6 w-6" />} title="کارتابل فقط برای مدیر اداری و مدیرعامل است" hint="درخواست‌های خودتان را از «درخواست‌های من» پیگیری کنید." />
    if (p === 'adminreports') return <Empty icon={<Lock className="h-6 w-6" />} title="گزارش‌های اداری فقط برای مدیرعامل، کنترل پروژه و مدیر اداری است" hint="تایم‌شیت و درخواست‌های خودتان را از بخش «اداری» ببینید." />
    if (p === 'finadmin') return <Empty icon={<Lock className="h-6 w-6" />} title="فضای مالی و اداری فقط برای مدیرعامل، مدیر مالی (فضای مالی) و مدیر اداری (فضای اداری) است" hint="این بخش و Taskهای آن برای نقش شما در دسترس نیست." />
    return <Empty icon={<Lock className="h-6 w-6" />} title="این بخش فقط برای مدیرعامل و کنترل پروژه است" hint="Workload، Sync، مدیریت و گزارش امتیازات در بخش کنترل پروژه هستند. امتیازات خودتان را از منوی پروفایل › امتیازات من ببینید." />
  }
  switch (p) {
    case 'home': return <Home />
    case 'notifications': return <Notifications />
    case 'projects': return <Projects />
    case 'project': return <ProjectPage projectId={state.nav.projectId ?? ''} />
    case 'pchat': return <ChatPage kind="project" />
    case 'chat': return <ChatPage kind="general" />
    case 'workload': return <Workload />
    case 'review': return <SyncReview />
    case 'runs': return <SyncRuns />
    case 'admin': return <Admin />
    case 'supervision': return <SupervisionPage />
    case 'team': return <TeamSpace teamId={state.nav.teamId} />
    case 'points': return <PointsReport />
    case 'requests': return <RequestsPage />
    case 'timesheet': return <TimesheetPage />
    case 'inbox': return <InboxPage />
    case 'adminreports': return <AdminReportsPage />
    case 'personal': return <PersonalPage />
    case 'finadmin': return <FinAdminPage />
  }
}

function Shell() {
  const [menu, setMenu] = useState(false)
  const { state } = useStore()
  if (!state.session) return <Auth />
  return (
    <div className="flex min-h-full">
      <div className="hidden w-[256px] shrink-0 lg:block">
        <aside className="glass-card glass-sheen thin-scroll sticky top-3 ms-3 mt-3 h-[calc(100vh-24px)] overflow-y-auto" aria-label="منوی کناری">
          <SidebarContent />
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenu(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 py-6 lg:py-8" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }} key={`${state.nav.page}-${state.nav.projectId ?? ''}-${state.nav.teamId ?? ''}`}>
          <div className="page-enter lg:px-4"><Main /></div>
        </main>
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="right" className="w-[280px] p-0" dir="rtl" style={{ paddingRight: 'env(safe-area-inset-right, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <SheetTitle className="sr-only">منو</SheetTitle>
          <SidebarContent onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>
      <TaskDrawer />
      <ProfileDialog />
    </div>
  )
}

function ThemedToaster() {
  const { state } = useStore()
  return (
    <Toaster dir="rtl" position="bottom-left" theme={state.theme} toastOptions={{
      style: {
        fontFamily: 'Vazirmatn, Tahoma, sans-serif',
        background: 'var(--glass-bg-strong)',
        color: 'hsl(var(--foreground))',
        border: '1px solid var(--glass-border)',
        borderRadius: 16,
        boxShadow: 'inset 0 1px 0 var(--glass-highlight), 0 0 0 1px var(--glass-edge), var(--glass-shadow-pop)',
        backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
        WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
      },
    }} />
  )
}

export default function App() {
  return (
    <DirectionProvider dir="rtl">
      <StoreProvider>
        <Shell />
        <ThemedToaster />
      </StoreProvider>
    </DirectionProvider>
  )
}
