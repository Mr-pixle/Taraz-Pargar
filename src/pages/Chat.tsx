import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpLeft, Bell, Hash, Info, Lock, Megaphone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { channelMembers, useFmt, useStore } from '@/lib/store'
import { tehranISO } from '@/lib/jalali'
import type { ChatMessage } from '@/lib/types'
import { Empty, Initials, PageHeader } from '@/components/common'
import { MentionInput, RichText } from '@/components/Mention'
import { NotifItem, useOpenLink } from './Notifications'

export function channelName(store: ReturnType<typeof useStore>, id: string) {
  if (id === 'general') return 'گفتگوی عمومی'
  if (id === 'announce') return 'اطلاعیه‌های سازمانی'
  const p = store.projectById[id.replace('project:', '')]
  return p ? p.name : id
}

export function ChatPage({ kind }: { kind: 'project' | 'general' }) {
  const store = useStore()
  const { state, dispatch, myChannels, unreadIn, me, can, userById, teamById, projectById, myNotifs } = store
  const { n } = useFmt()
  const channels = myChannels.filter((c) => (kind === 'project' ? c.startsWith('project:') : !c.startsWith('project:')))
  const current = state.nav.channelId && channels.includes(state.nav.channelId) ? state.nav.channelId : channels[0]
  const messages = useMemo(() => state.messages.filter((m) => m.channelId === current).sort((a, b) => a.at.localeCompare(b.at)), [state.messages, current])
  const members = useMemo(() => (current ? channelMembers(state, current) : []), [state, current])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { if (current) dispatch({ type: 'readChannel', channelId: current }) }, [current, messages.length, dispatch])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [current, messages.length])
  const byTeam = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const id of members) { const t = userById[id]?.teamId ?? ''; m.set(t, [...(m.get(t) ?? []), id]) }
    return [...m.entries()]
  }, [members, userById])
  const go = (id: string) => dispatch({ type: 'nav', nav: { page: kind === 'project' ? 'pchat' : 'chat', channelId: id } })

  if (!current) return <Empty icon={<Lock className="h-6 w-6" />} title="هنوز عضو چت پروژه‌ای نیستید" hint="اعضای تیم‌های هر پروژه (تیم‌های ثابت، تیم فاز ۱، تیم فاز ۲ و Revit) به چت همان پروژه دسترسی دارند." />
  const canPost = current !== 'announce' || can.perm('announce.post')
  const project = current.startsWith('project:') ? projectById[current.slice(8)] : undefined
  const send = () => {
    const text = (draft[current] ?? '').trim()
    if (!text) return
    dispatch({ type: 'sendMessage', channelId: current, text })
    setDraft((d) => ({ ...d, [current]: '' }))
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={kind === 'project' ? 'گفتگو' : 'سازمان'} title={kind === 'project' ? 'چت پروژه' : 'چت عمومی'}>
        {kind === 'project' ? 'هر پروژه یک کانال برای اعضای تیم‌های همان پروژه دارد. رویدادهای مهم پروژه (Sync، صدور سند، Write-back) هم خودکار اینجا ثبت می‌شود.' : 'گفتگوی عمومی دفتر و اطلاعیه‌های سازمانی. اطلاعیه‌ها را مدیر و کنترل پروژه منتشر می‌کنند و برای همه اعلان می‌شود.'}
      </PageHeader>

      <div className="lg:hidden">
        <Select value={current} onValueChange={go}>
          <SelectTrigger id="chat-channel" className="h-10"><SelectValue /></SelectTrigger>
          <SelectContent>{channels.map((c) => <SelectItem key={c} value={c}>{channelName(store, c)}{unreadIn(c) ? ` (${n(unreadIn(c))} تازه)` : ''}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid min-h-[560px] grid-cols-1 overflow-hidden glass-card lg:h-[calc(100vh-240px)] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_260px]">
        <nav className="hidden flex-col border-e bg-foreground/[0.03] lg:flex" aria-label="کانال‌ها">
          <div className="eyebrow px-4 pb-1.5 pt-4">{kind === 'project' ? 'پروژه‌های من' : 'کانال‌ها'}</div>
          <div className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-3 thin-scroll">
            {channels.map((c) => {
              const u = unreadIn(c)
              const Icon = c === 'announce' ? Megaphone : Hash
              return (
                <button key={c} onClick={() => go(c)} className={cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-start text-[13px]', c === current ? 'bg-background font-semibold shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{channelName(store, c)}</span>
                  {c.startsWith('project:') && <span className="mono text-[10px] text-muted-foreground">{c.slice(8)}</span>}
                  {u > 0 && c !== current && <span className="num rounded-full bg-azure px-1.5 text-[10.5px] font-semibold text-white">{n(u)}</span>}
                </button>
              )
            })}
          </div>
        </nav>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-semibold">{current === 'announce' ? <Megaphone className="h-4 w-4" /> : <Hash className="h-4 w-4" />}{channelName(store, current)}</div>
              <div className="num text-[11.5px] text-muted-foreground">{n(members.length)} عضو{project ? `، ${project.code}، ${project.type}` : ''}</div>
            </div>
            {project && <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'nav', nav: { page: 'project', projectId: project.id } })}>صفحه‌ی پروژه <ArrowUpLeft className="h-3.5 w-3.5" /></Button>}
          </header>
          <div className="min-h-[320px] flex-1 overflow-y-auto px-4 py-3 thin-scroll">
            {messages.length === 0 && <div className="py-10 text-center text-[13px] text-muted-foreground">هنوز پیامی نیست. اولین پیام را بفرستید.</div>}
            <MessageList messages={messages} />
            <div ref={bottom} />
          </div>
          <div className="border-t p-3">
            {canPost ? (
              <MentionInput id={`chat-input-${current}`} value={draft[current] ?? ''} onChange={(v) => setDraft((d) => ({ ...d, [current]: v }))} onSubmit={send} memberIds={members}
                placeholder={current === 'announce' ? 'متن اطلاعیه برای همه‌ی اعضای دفتر…' : `پیام به ${channelName(store, current)}…`} submitLabel={current === 'announce' ? 'انتشار' : 'ارسال'} />
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-foreground/[0.03] px-3 py-2.5 text-[12.5px] text-muted-foreground"><Lock className="h-3.5 w-3.5" /> فقط مدیرعامل، مدیریت، کنترل پروژه و مدیر سیستم اطلاعیه منتشر می‌کنند. برای گفتگو از «گفتگوی عمومی» استفاده کنید.</div>
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col border-s xl:flex">
          {kind === 'general' && (
            <div className="border-b">
              <div className="flex items-center justify-between px-4 pb-1 pt-3"><span className="flex items-center gap-1.5 text-[13px] font-semibold"><Bell className="h-3.5 w-3.5" /> اعلان‌های اخیر من</span>
                <button className="text-[11.5px] text-azure hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'notifications' } })}>همه</button></div>
              <div className="max-h-[260px] divide-y overflow-y-auto thin-scroll">{myNotifs.slice(0, 4).map((x) => <NotifItem key={x.id} n={x} compact />)}</div>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[13px] font-semibold"><Users className="h-3.5 w-3.5" /> اعضا</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 thin-scroll">
            {byTeam.map(([tid, ids]) => (
              <div key={tid} className="mt-2">
                <div className="px-2 text-[11px] text-muted-foreground">{teamById[tid]?.name ?? '—'}</div>
                {ids.map((id) => {
                  const u = userById[id]
                  return (
                    <button key={id} onClick={() => can.editUser(id) && dispatch({ type: 'openProfile', id })} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-start text-[12.5px]', can.editUser(id) ? 'hover:bg-accent' : 'cursor-default')}>
                      <Initials user={u} size={22} /><span className="min-w-0 flex-1 truncate">{u.name}{id === me.id && <span className="text-muted-foreground"> (شما)</span>}</span>
                      <bdi className="mono text-[10.5px] text-muted-foreground">@{u.username}</bdi>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function MessageList({ messages }: { messages: ChatMessage[] }) {
  const { userById, me } = useStore()
  const { clock, dayLabel } = useFmt()
  const open = useOpenLink()
  let lastDay = ''
  let prev: ChatMessage | undefined
  return (
    <div className="flex flex-col">
      {messages.map((m) => {
        const day = tehranISO(new Date(m.at))
        const sep = day !== lastDay
        lastDay = day
        const grouped = !sep && prev && !prev.system && !m.system && prev.userId === m.userId && new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60000
        prev = m
        const u = m.userId ? userById[m.userId] : undefined
        return (
          <div key={m.id}>
            {sep && (
              <div className="my-3 flex items-center gap-3 text-[11.5px] text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{dayLabel(m.at)}</span><span className="h-px flex-1 bg-border" /></div>
            )}
            {m.system ? (
              <div className="my-1.5 flex items-start gap-2 rounded-md bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1"><RichText text={m.text} /></span>
                {m.link && <button className="shrink-0 text-azure hover:underline" onClick={() => open(m.link)}>مشاهده</button>}
                <span className="num shrink-0 text-[11px]">{clock(m.at)}</span>
              </div>
            ) : (
              <div className={cn('group flex gap-3 rounded-md px-1 hover:bg-foreground/[0.035]/70', grouped ? 'py-0.5' : 'mt-2 py-1', m.mentions.includes(me.id) && 'bg-azure-soft/40')}>
                <div className="w-8 shrink-0">{!grouped && <Initials user={u} size={32} />}</div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-semibold">{u?.name}</span>
                      <bdi className="mono text-[11px] text-muted-foreground">@{u?.username}</bdi>
                      <span className="num text-[11px] text-muted-foreground">{clock(m.at)}</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words text-[13.5px] leading-7"><RichText text={m.text} /></div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
