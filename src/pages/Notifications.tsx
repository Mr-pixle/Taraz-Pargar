import { useMemo, useState } from 'react'
import { AtSign, Bell, CalendarClock, ClipboardCheck, Clock3, Inbox, Timer, Trophy, CheckCheck, FileSpreadsheet, Megaphone, MessageSquare, RefreshCw, UserCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFmt, useStore } from '@/lib/store'
import type { NotifKind, NotifLink, Notification } from '@/lib/types'
import { Empty, PageHeader, Segmented } from '@/components/common'
import { RichText } from '@/components/Mention'
import type { Page } from '@/lib/store'

export const NOTIF_META: Record<NotifKind, { label: string; icon: typeof Bell }> = {
  assign: { label: 'تخصیص', icon: UserPlus },
  status: { label: 'Status', icon: RefreshCw },
  mention: { label: 'تگ شدن', icon: AtSign },
  comment: { label: 'کامنت', icon: MessageSquare },
  sync: { label: 'Sync و MDR', icon: FileSpreadsheet },
  announce: { label: 'اطلاعیه', icon: Megaphone },
  account: { label: 'حساب کاربری', icon: UserCheck },
  due: { label: 'موعد', icon: CalendarClock },
  plan: { label: 'برنامه‌ریزی', icon: CalendarClock },
  review: { label: 'بررسی و تأیید', icon: ClipboardCheck },
  points: { label: 'امتیاز', icon: Trophy },
  worklog: { label: 'Work Log', icon: Timer },
  request: { label: 'درخواست اداری', icon: Inbox },
  timesheet: { label: 'تایم‌شیت', icon: Clock3 },
}

export function useOpenLink() {
  const { dispatch, me, can } = useStore()
  return (link?: NotifLink) => {
    if (!link) return
    if (link.type === 'page' && link.page === 'mypoints') { dispatch({ type: 'openProfile', id: me.id, tab: 'points' }); return }
    if (link.type === 'page' && !can.page(link.page as Page)) { toast(link.page === 'inbox' ? 'کارتابل فقط برای مدیر اداری و مدیرعامل است' : link.page === 'adminreports' ? 'گزارش‌های اداری فقط برای مدیرعامل، کنترل پروژه و مدیر اداری است' : 'این بخش فقط برای مدیرعامل و کنترل پروژه است'); return }
    if (link.type === 'task') dispatch({ type: 'openTask', id: link.id })
    else if (link.type === 'project') dispatch({ type: 'nav', nav: { page: 'project', projectId: link.id } })
    else if (link.type === 'page' && link.page === 'team') dispatch({ type: 'nav', nav: { page: 'team' } })
    else if (link.type === 'chat') dispatch({ type: 'nav', nav: link.channelId.startsWith('project:') ? { page: 'pchat', channelId: link.channelId } : { page: 'chat', channelId: link.channelId } })
    else dispatch({ type: 'nav', nav: { page: link.page as Page } })
  }
}

export function NotifItem({ n, compact, onDone }: { n: Notification; compact?: boolean; onDone?: () => void }) {
  const { dispatch, userById } = useStore()
  const { time, clock } = useFmt()
  const open = useOpenLink()
  const M = NOTIF_META[n.kind]
  const Icon = M.icon
  return (
    <button onClick={() => { dispatch({ type: 'readNotifs', ids: [n.id] }); open(n.link); onDone?.() }}
      className={cn('flex w-full items-start gap-3 px-4 text-start hover:bg-foreground/[0.035]', compact ? 'py-2.5' : 'py-3', !n.read && 'bg-azure-soft/35')}>
      <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1', n.kind === 'mention' || n.kind === 'assign' ? 'bg-azure-soft text-azure-ink ring-azure/30' : n.kind === 'account' ? 'bg-leaf-soft text-leaf-ink ring-leaf/30' : 'bg-secondary text-foreground ring-border')}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[13px] leading-snug', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</span>
        {n.body && <span className={cn('mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground', compact && 'line-clamp-2')}><RichText text={n.body} /></span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span>{M.label}</span>
          {n.actorId && userById[n.actorId] && <span>{userById[n.actorId].name}</span>}
          <span className="num">{time(n.at)}، ساعت {clock(n.at)}</span>
        </span>
      </span>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-azure" aria-label="خوانده‌نشده" />}
    </button>
  )
}

export function Notifications() {
  const { myNotifs, unread, dispatch } = useStore()
  const { n } = useFmt()
  const [tab, setTab] = useState<'all' | 'unread' | 'mention'>('all')
  const [kind, setKind] = useState<NotifKind | 'any'>('any')
  const list = useMemo(() => myNotifs.filter((x) => (tab === 'unread' ? !x.read : tab === 'mention' ? x.kind === 'mention' : true) && (kind === 'any' || x.kind === kind)), [myNotifs, tab, kind])
  const kinds = [...new Set(myNotifs.map((x) => x.kind))]
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="اعلان‌ها" title="اعلان‌های من" actions={<Button variant="outline" onClick={() => dispatch({ type: 'readNotifs' })} disabled={!unread}><CheckCheck className="h-4 w-4" /> همه خوانده شد</Button>}>
        هر تخصیص، تغییر Status، تگ شدن با @، اطلاعیه، رویداد Sync و تأیید حساب اینجا ثبت می‌شود.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'all', label: <>همه <span className="num">{n(myNotifs.length)}</span></> },
          { value: 'unread', label: <>خوانده‌نشده <span className="num">{n(unread)}</span></> },
          { value: 'mention', label: 'تگ‌ها (@)' },
        ]} />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setKind('any')} className={cn('rounded-full border px-2.5 py-1 text-[12px]', kind === 'any' ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>همه‌ی انواع</button>
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', kind === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{NOTIF_META[k].label}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <Empty icon={<Bell className="h-6 w-6" />} title="اعلانی نیست" hint="وقتی تسکی به شما تخصیص داده شود یا کسی شما را تگ کند، اینجا می‌بینید." /> : (
        <div className="divide-y overflow-hidden glass-card">{list.map((x) => <NotifItem key={x.id} n={x} />)}</div>
      )}
    </div>
  )
}
