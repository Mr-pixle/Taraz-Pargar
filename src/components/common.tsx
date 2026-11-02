import { useState, type ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useLiquidDrop } from '@/lib/useLiquidDrop'
import { useFmt, useStore } from '@/lib/store'
import type { Status, Task, User } from '@/lib/types'
import { J_MONTHS, WEEKDAYS_SHORT, addDays, addJMonths, fromJalali, isWeekend, jMonthLength, startOfJMonth, toJalali, weekdayIndex } from '@/lib/jalali'
import { TODAY } from '@/lib/seed'

/** Mark of «تراز»: a ring drawn with a compass (پرگار) holding a level vial and its bubble */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="62 13.4" strokeLinecap="round" transform="rotate(-58 16 16)" />
      <rect x="7.5" y="13.2" width="17" height="5.6" rx="2.8" fill="none" stroke="hsl(var(--azure))" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="1.7" fill="hsl(var(--leaf))" />
      <path d="M13 13.2v-1.6M19 13.2v-1.6" stroke="hsl(var(--azure))" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function ProgressRing({ value, size = 28, stroke = 3, label = true, className }: { value: number; size?: number; stroke?: number; label?: boolean; className?: string }) {
  const { n } = useFmt()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  const done = v >= 99.5
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} title={`${Math.round(v)}٪`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? 'hsl(var(--leaf))' : 'hsl(var(--azure))'} strokeWidth={stroke}
          strokeDasharray={`${(c * v) / 100} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .4s ease' }} />
      </svg>
      {label && size >= 34 && <span className="num absolute text-[10px] font-semibold">{n(Math.round(v))}</span>}
    </span>
  )
}

export function Bar({ value, className, tone }: { value: number; className?: string; tone?: 'azure' | 'leaf' | 'danger' }) {
  const v = Math.max(0, Math.min(100, value))
  const t = tone ?? (v >= 99.5 ? 'leaf' : 'azure')
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <div className={cn('h-full rounded-full', t === 'leaf' ? 'bg-leaf' : t === 'danger' ? 'bg-destructive' : 'bg-azure')} style={{ width: `${v}%` }} />
    </div>
  )
}

export function StatusPill({ status, className }: { status?: Status; className?: string }) {
  if (!status) return null
  const cls =
    status.category === 'done' ? 'bg-leaf-soft text-leaf-ink border-transparent'
      : status.category === 'doing' ? 'bg-azure-soft text-azure-ink border-transparent'
        : 'bg-background/70 text-muted-foreground border-border'
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5', cls, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', status.category === 'done' ? 'bg-leaf' : status.category === 'doing' ? 'bg-azure' : 'bg-muted-foreground/50')} />
      {status.name}
    </span>
  )
}

/** Profile photo, or the person's initials when they have not uploaded one */
export function Initials({ user, size = 24 }: { user?: User; size?: number }) {
  if (!user) return null
  if (user.avatar) {
    return <img src={user.avatar} alt={user.name} title={user.name} width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-border" style={{ width: size, height: size }} />
  }
  const parts = user.name.split(' ')
  const ini = parts.length > 1 ? parts[0][0] + '‌' + parts[1][0] : parts[0].slice(0, 2)
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground ring-1 ring-border"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }} title={user.name}>
      {ini}
    </span>
  )
}

export function Assignee({ task, compact }: { task: Task; compact?: boolean }) {
  const { userById, teamById } = useStore()
  if (task.assigneeUserId) {
    const u = userById[task.assigneeUserId]
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5', compact && 'text-[11.5px]')}>
        <Initials user={u} size={compact ? 20 : 24} />
        <span className="truncate">{u?.name}</span>
      </span>
    )
  }
  if (task.assigneeTeamId) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
        <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50"><Users className="h-3 w-3" /></span>
        <span className={cn('truncate', compact && 'text-[11.5px]')}>تیم {teamById[task.assigneeTeamId]?.name}</span>
      </span>
    )
  }
  return <span className="whitespace-nowrap text-xs text-muted-foreground">بدون تخصیص</span>
}

export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="glass-well flex flex-col items-center gap-2 border-dashed border-foreground/15 px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div className="font-medium">{title}</div>
      {hint && <div className="max-w-md text-sm text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
        {children && <div className="mt-1.5 text-sm text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Drawing-sheet title block: label / value cells separated by hairlines */
export function TitleBlock({ cells }: { cells: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="glass-card grid grid-cols-2 overflow-hidden sm:grid-cols-4 xl:grid-cols-7">
      {cells.map((c, i) => (
        <div key={i} className="glass-divider min-w-0 border-b border-s px-3.5 py-3 [&:nth-child(2n+1)]:border-s-0 sm:[&:nth-child(2n+1)]:border-s sm:[&:nth-child(4n+1)]:border-s-0 xl:[&:nth-child(4n+1)]:border-s xl:[&:nth-child(7n+1)]:border-s-0">
          <dt className="eyebrow">{c.label}</dt>
          <dd className={cn('mt-0.5 truncate text-[13.5px] font-medium', c.mono && 'mono text-[12.5px]')}>{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Segmented control with a liquid drop that slides to the chosen option */
/** compact: on phones, options with an icon show only the icon (the label stays for screen readers), except the chosen one */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', compact }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; size?: 'sm' | 'md'; compact?: boolean }) {
  const drop = useLiquidDrop<HTMLDivElement>('x', '[data-drop-active="true"]')
  return (
    <div ref={drop.ref} className="glass-seg relative inline-flex gap-0.5 !rounded-full" role="tablist">
      <span aria-hidden="true" className={cn('drop', !drop.animate && 'no-anim')} style={drop.style} />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} data-drop-active={value === o.value} onClick={() => onChange(o.value)} title={compact && typeof o.label === 'string' ? o.label : undefined}
          className={cn('relative z-[1] inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.96] [transition-property:color,transform]',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'font-semibold text-foreground [&_svg]:text-azure' : 'text-muted-foreground hover:text-foreground')}>
          {o.icon}{compact && o.icon && value !== o.value ? <span className="sr-only sm:not-sr-only">{o.label}</span> : o.label}
        </button>
      ))}
    </div>
  )
}

export function JalaliDateField({ id, value, onChange, disabled, placeholder = 'انتخاب تاریخ' }: { id?: string; value?: string; onChange: (iso?: string) => void; disabled?: boolean; placeholder?: string }) {
  const { d, digits } = useFmt()
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => startOfJMonth(value ?? TODAY))
  const j = toJalali(month)
  const len = jMonthLength(j.jy, j.jm)
  const lead = weekdayIndex(month)
  const holidays = new Set(state.holidays.map((h) => h.date))
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => fromJalali(j.jy, j.jm, i + 1))]
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMonth(startOfJMonth(value ?? TODAY)) }}>
      <PopoverTrigger asChild>
        <button id={id} type="button" disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-background/75 px-3 text-sm shadow-[inset_0_1px_2px_hsl(222_40%_20%/0.05)] transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 focus-visible:border-azure focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-azure/15 data-[state=open]:border-azure data-[state=open]:ring-4 data-[state=open]:ring-azure/15 disabled:cursor-not-allowed disabled:opacity-55">
          <span className={cn('num', !value && 'text-muted-foreground')}>{value ? d(value) : placeholder}</span>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[272px] p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setMonth(addJMonths(month, -1))} aria-label="ماه قبل"><ChevronRight className="h-4 w-4" /></button>
          <div className="text-sm font-semibold">{J_MONTHS[j.jm - 1]} {digits(j.jy)}</div>
          <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setMonth(addJMonths(month, 1))} aria-label="ماه بعد"><ChevronLeft className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
          {WEEKDAYS_SHORT.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />
            const off = isWeekend(c) || holidays.has(c)
            const sel = c === value
            return (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }}
                className={cn('num h-8 rounded text-[13px] transition-colors',
                  sel ? 'bg-primary text-primary-foreground' : off ? 'text-muted-foreground/60 hover:bg-accent' : 'hover:bg-accent',
                  c === TODAY && !sel && 'ring-1 ring-azure')}>
                {digits(toJalali(c).jd)}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
          <button type="button" className="text-azure hover:underline" onClick={() => { onChange(TODAY); setOpen(false) }}>امروز</button>
          {value && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { onChange(undefined); setOpen(false) }}>پاک کردن</button>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function dayAfter(iso: string) { return addDays(iso, 1) }
