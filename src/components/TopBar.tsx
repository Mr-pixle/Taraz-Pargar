import { useEffect, useState } from 'react'
import { Bell, Check, Clock, LogOut, Menu, MessagesSquare, Monitor, Moon, Sun, Trophy, UserPen } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useFmt, useStore, type ThemeChoice } from '@/lib/store'
import { WEEKDAYS, tehranISO, weekdayIndex } from '@/lib/jalali'
import { NotifItem } from '@/pages/Notifications'
import { Initials, Logo } from './common'
import { ROLE_FA } from './Profile'

/** Live date and time in Tehran (Asia/Tehran), whatever the viewer's own time zone is */
export function TehranClock({ compact }: { compact?: boolean }) {
  const { clock, dLong } = useFmt()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const h = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(h) }, [])
  const day = tehranISO(now)
  if (compact) return <span className="num inline-flex items-center gap-1 whitespace-nowrap"><Clock className="h-3.5 w-3.5" />{clock(now)} تهران</span>
  return (
    <span className="num inline-flex items-center gap-1.5 whitespace-nowrap" title="به وقت تهران">
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="hidden md:inline">{WEEKDAYS[weekdayIndex(day)]} {dLong(day)}،</span>
      <span className="font-semibold text-foreground">{clock(now)}</span>
      <span className="text-muted-foreground">به وقت تهران</span>
    </span>
  )
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'روشن', icon: Sun },
  { value: 'dark', label: 'تاریک', icon: Moon },
  { value: 'system', label: 'مطابق سیستم', icon: Monitor },
]

/** Light / dark / follow-system switch */
export function ThemeToggle() {
  const { state, dispatch } = useStore()
  const current = THEMES.find((t) => t.value === state.theme) ?? THEMES[2]
  const Icon = current.icon
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="key key-surface inline-flex h-9 w-9 items-center justify-center rounded-full" aria-label={`تم: ${current.label}`} title={`تم: ${current.label}`}>
          <Icon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[11.5px] font-normal text-muted-foreground">تم نمایش</DropdownMenuLabel>
        {THEMES.map((t) => {
          const I = t.icon
          return (
            <DropdownMenuItem key={t.value} onSelect={() => dispatch({ type: 'setTheme', theme: t.value })}>
              <I className="h-4 w-4" /> <span className="flex-1">{t.label}</span>{state.theme === t.value && <Check className="h-4 w-4 text-azure" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Bellbox() {
  const { myNotifs, unread, dispatch } = useStore()
  const { n } = useFmt()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="key key-surface relative inline-flex h-9 w-9 items-center justify-center rounded-full" aria-label={`اعلان‌ها، ${unread} خوانده‌نشده`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="num absolute -end-1.5 -top-1.5 min-w-[18px] rounded-full bg-azure px-1 text-center text-[10.5px] font-bold leading-[18px] text-white ring-2 ring-background">{n(Math.min(unread, 99))}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="font-semibold">اعلان‌ها</span>
          <button className="text-[12px] text-azure hover:underline disabled:opacity-40" disabled={!unread} onClick={() => dispatch({ type: 'readNotifs' })}>همه خوانده شد</button>
        </div>
        <div className="max-h-[420px] divide-y overflow-y-auto thin-scroll">
          {myNotifs.length === 0 ? <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">اعلانی ندارید.</div>
            : myNotifs.slice(0, 8).map((x) => <NotifItem key={x.id} n={x} compact onDone={() => setOpen(false)} />)}
        </div>
        <button className="glass-divider w-full border-t px-4 py-2.5 text-[13px] font-medium text-azure transition-colors hover:bg-foreground/[0.04]" onClick={() => { setOpen(false); dispatch({ type: 'nav', nav: { page: 'notifications' } }) }}>
          مشاهده‌ی همه‌ی اعلان‌ها{myNotifs.length > 8 ? ` (${n(myNotifs.length)})` : ''}
        </button>
      </PopoverContent>
    </Popover>
  )
}

function ProfileMenu() {
  const { me, dispatch, teamById } = useStore()
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="key key-surface inline-flex h-9 items-center gap-2 rounded-full pe-3 ps-1" aria-label="پروفایل">
          <Initials user={me} size={28} />
          <span className="hidden max-w-[120px] truncate text-[13px] font-medium sm:inline">{me.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="font-semibold">{me.name}</div>
          <div className="text-[11.5px] text-muted-foreground"><bdi className="mono">@{me.username}</bdi>، {teamById[me.teamId]?.name}</div>
          <div className="text-[11.5px] text-muted-foreground">{ROLE_FA[me.role]}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => dispatch({ type: 'openProfile', id: me.id })}><UserPen className="h-4 w-4" /> ویرایش پروفایل</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => dispatch({ type: 'openProfile', id: me.id, tab: 'points' })}><Trophy className="h-4 w-4" /> امتیازات من</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => dispatch({ type: 'nav', nav: { page: 'notifications' } })}><Bell className="h-4 w-4" /> اعلان‌های من</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => dispatch({ type: 'logout' })} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4" /> خروج</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { dispatch, myChannels, unreadIn, state } = useStore()
  const { n } = useFmt()
  const chatUnread = myChannels.reduce((s, c) => s + unreadIn(c), 0)
  return (
    <header className="glass-bar sticky z-20" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 lg:px-4" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        <button className="key key-surface inline-flex h-9 w-9 items-center justify-center rounded-full lg:hidden" onClick={onMenu} aria-label="منو"><Menu className="h-4 w-4" /></button>
        <div className="flex items-center gap-2 lg:hidden"><Logo className="h-7 w-7" /><span className="hidden font-extrabold min-[380px]:inline">تراز</span></div>
        <div className="ms-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="hidden sm:inline-flex"><TehranClock /></span>
          <span className="sm:hidden"><TehranClock compact /></span>
          <button onClick={() => dispatch({ type: 'nav', nav: { page: 'chat' } })} className={cn('key key-surface relative inline-flex h-9 w-9 items-center justify-center rounded-full', (state.nav.page === 'chat' || state.nav.page === 'pchat') && 'ring-2 ring-azure/40')} aria-label="چت‌ها">
            <MessagesSquare className="h-4 w-4" />
            {chatUnread > 0 && <span className="num absolute -end-1.5 -top-1.5 min-w-[18px] rounded-full bg-foreground px-1 text-center text-[10.5px] font-bold leading-[18px] text-background ring-2 ring-background">{n(Math.min(chatUnread, 99))}</span>}
          </button>
          <ThemeToggle />
          <span className="text-foreground"><Bellbox /></span>
          <span className="text-foreground"><ProfileMenu /></span>
        </div>
      </div>
    </header>
  )
}
