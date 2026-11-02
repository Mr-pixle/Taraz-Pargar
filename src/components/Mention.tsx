import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AtSign, SendHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { Initials } from './common'

/** Textarea that suggests members after typing "@" and inserts their username (ID). */
export function MentionInput({ id, value, onChange, onSubmit, memberIds, placeholder, disabled, submitLabel = 'ارسال', rows = 2 }: {
  id: string; value: string; onChange: (v: string) => void; onSubmit: () => void; memberIds?: string[]
  placeholder?: string; disabled?: boolean; submitLabel?: string; rows?: number
}) {
  const { activeUsers, teamById } = useStore()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [hi, setHi] = useState(0)
  const [closed, setClosed] = useState(false)
  const pool = useMemo(() => (memberIds ? activeUsers.filter((u) => memberIds.includes(u.id)) : activeUsers), [activeUsers, memberIds])
  const token = useMemo(() => {
    const m = value.slice(0, caret).match(/(^|\s)@([a-z0-9._-]*)$/i)
    return m ? { q: m[2].toLowerCase(), start: caret - m[2].length - 1 } : null
  }, [value, caret])
  const matches = useMemo(() => {
    if (!token) return []
    return pool.filter((u) => u.username.toLowerCase().includes(token.q) || u.name.includes(token.q)).slice(0, 6)
  }, [token, pool])
  const open = !!token && matches.length > 0 && !closed

  const pick = (username: string) => {
    if (!token) return
    const next = `${value.slice(0, token.start)}@${username} ${value.slice(caret)}`
    onChange(next)
    const pos = token.start + username.length + 2
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); setCaret(pos) })
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[Math.min(hi, matches.length - 1)].username); return }
      if (e.key === 'Escape') { setClosed(true); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (value.trim()) onSubmit() }
  }
  const insertAt = () => {
    const el = ref.current
    const pos = el?.selectionStart ?? value.length
    const before = value.slice(0, pos)
    const pre = before && !/\s$/.test(before) ? ' @' : '@'
    onChange(before + pre + value.slice(pos))
    const np = pos + pre.length
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(np, np); setCaret(np); setClosed(false) })
  }

  return (
    <div className="relative">
      {open && (
        <div className="glass-pop absolute bottom-full start-0 z-30 mb-1.5 w-72 overflow-hidden rounded-xl" role="listbox" aria-label="اعضا">
          <div className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">تگ کردن عضو با ID — Enter برای انتخاب</div>
          {matches.map((u, i) => (
            <button key={u.id} type="button" role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(u.username) }} onMouseEnter={() => setHi(i)}
              className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-start text-[13px]', i === hi && 'bg-foreground/[0.07]')}>
              <Initials user={u} size={22} />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="mono text-[11px] text-muted-foreground">@{u.username}</span>
              <span className="hidden text-[10.5px] text-muted-foreground sm:inline">{teamById[u.teamId]?.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className={cn('flex items-end gap-2 rounded-xl border border-input bg-background/80 p-1.5 shadow-[inset_0_1px_2px_hsl(222_40%_20%/0.05)] transition-[border-color,box-shadow] duration-150 focus-within:border-azure focus-within:ring-4 focus-within:ring-azure/15', disabled && 'opacity-60')}>
        <button type="button" onClick={insertAt} disabled={disabled} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground" aria-label="تگ کردن عضو" title="تگ کردن عضو با @">
          <AtSign className="h-4 w-4" />
        </button>
        <textarea id={id} ref={ref} rows={rows} value={value} disabled={disabled} placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart ?? 0); setClosed(false); setHi(0) }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={onKey}
          className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-1 py-1.5 text-[13.5px] leading-6 outline-none placeholder:text-muted-foreground" />
        <button type="button" aria-label={submitLabel} onClick={() => value.trim() && onSubmit()} disabled={disabled || !value.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.16),0_6px_16px_-8px_hsl(222_40%_10%/0.45)] transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40">
          <SendHorizontal className="h-4 w-4 -scale-x-100" /> <span className="hidden sm:inline">{submitLabel}</span>
        </button>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">برای تگ کردن، @ و ID عضو را بنویسید. شماره‌ی سند را با # بنویسید تا لینک شود. Enter ارسال، Shift+Enter خط جدید.</div>
    </div>
  )
}

/** Renders @username as member chips and #DOC-NUMBER as task links */
export function RichText({ text }: { text: string }) {
  const { activeUsers, state, dispatch } = useStore()
  const parts = text.split(/(@[a-z0-9._-]+|#[A-Z]{3}-[A-Z0-9-]+)/gi)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('@')) {
          const u = activeUsers.find((x) => x.username.toLowerCase() === p.slice(1).toLowerCase())
          if (u) return <bdi key={i} className="rounded bg-azure-soft px-1 font-medium text-azure-ink" title={u.name}>@{u.username}</bdi>
        }
        if (p.startsWith('#')) {
          const t = state.tasks[p.slice(1)]
          if (t) return <button key={i} type="button" onClick={() => dispatch({ type: 'openTask', id: t.id })} className="mono rounded bg-secondary px-1 text-[12px] text-foreground ring-1 ring-border hover:ring-foreground/40" title={t.name}>{p}</button>
        }
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}
