// Personal tasks — shared UI: status chip, task dialog with subtasks, new-task dialog, status manager.
// Reads only the signed-in person's own personal tasks; nothing here touches project data.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useFmt, useStore } from '@/lib/store'
import { TODAY } from '@/lib/seed'
import {
  ancestorsOf, boardOf, checkBoard, checkFields, childrenOf, depthOf, descendants, heightOf, isDone, MAX_DEPTH, MAX_STATUSES, PALETTE, PRIORITIES, statusOfTask, subProgress, tasksOf,
} from '@/lib/personal'
import type { PersonalStatus, PersonalTask, Priority } from '@/lib/types'
import { JalaliDateField } from './common'
import { PRIORITY_FA } from './FlowViews'

/** The signed-in person's own board and tasks — the only way the UI reads personal data */
export function useMine() {
  const { state, me } = useStore()
  const board = boardOf(state.personalBoards, me.id)
  const list = useMemo(() => tasksOf(state.personalTasks, me.id), [state.personalTasks, me.id])
  return { board, list, all: state.personalTasks, meId: me.id }
}

export function StatusChip({ s, className }: { s: PersonalStatus; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium', className)}
      style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${s.color} 45%, transparent)` }}>
      {s.done ? <Check className="h-3 w-3 shrink-0" style={{ color: s.color }} /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />}
      <span className="truncate">{s.name}</span>
    </span>
  )
}

function StatusSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { board } = useMine()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="mt-1 h-9"><SelectValue /></SelectTrigger>
      <SelectContent>{board.statuses.map((s) => <SelectItem key={s.id} value={s.id}><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}{s.done ? ' ✓' : ''}</span></SelectItem>)}</SelectContent>
    </Select>
  )
}
function PrioritySelect({ id, value, onChange }: { id: string; value: Priority; onChange: (v: Priority) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Priority)}>
      <SelectTrigger id={id} className="mt-1 h-9"><SelectValue /></SelectTrigger>
      <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_FA[p]}</SelectItem>)}</SelectContent>
    </Select>
  )
}

// ---------- new task ----------
export function NewPersonalTaskDialog({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: { statusId?: string; parentId?: string | null; start?: string; due?: string } }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        {open && <NewForm preset={preset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
function NewForm({ preset, onDone }: { preset?: { statusId?: string; parentId?: string | null; start?: string; due?: string }; onDone: () => void }) {
  const { dispatch } = useStore()
  const { board, all } = useMine()
  const parent = preset?.parentId ? all[preset.parentId] : undefined
  const [f, setF] = useState({ title: '', description: '', statusId: preset?.statusId ?? board.defaultStatusId, priority: 'normal' as Priority, start: preset?.start, due: preset?.due })
  const submit = () => {
    const err = checkFields(f)
    if (err) { toast.error(err); return }
    dispatch({ type: 'ptCreate', task: { ...f, parentId: preset?.parentId ?? null } })
    toast.success(parent ? 'Subtask ساخته شد' : 'کار شخصی ساخته شد')
    onDone()
  }
  return (
    <>
      <DialogHeader className="pe-8 text-start">
        <DialogTitle>{parent ? 'Subtask تازه' : 'کار شخصی تازه'}</DialogTitle>
        <DialogDescription>{parent ? `زیر «${parent.title}»` : 'فقط خودتان آن را می‌بینید؛ در برنامه‌ریزی، تقویم و گزارش‌های سازمانی شمرده نمی‌شود.'}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label htmlFor="pn-title" className="eyebrow">عنوان</Label><Input id="pn-title" autoFocus className="mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} /></div>
        <div><Label htmlFor="pn-status" className="eyebrow">Status</Label><StatusSelect id="pn-status" value={f.statusId} onChange={(v) => setF({ ...f, statusId: v })} /></div>
        <div><Label htmlFor="pn-pri" className="eyebrow">اولویت</Label><PrioritySelect id="pn-pri" value={f.priority} onChange={(v) => setF({ ...f, priority: v })} /></div>
        <div><Label htmlFor="pn-start" className="eyebrow">شروع</Label><div className="mt-1"><JalaliDateField id="pn-start" value={f.start} onChange={(v) => setF({ ...f, start: v })} /></div></div>
        <div><Label htmlFor="pn-due" className="eyebrow">موعد</Label><div className="mt-1"><JalaliDateField id="pn-due" value={f.due} onChange={(v) => setF({ ...f, due: v })} /></div></div>
        <div className="col-span-2"><Label htmlFor="pn-desc" className="eyebrow">توضیحات</Label><Textarea id="pn-desc" className="mt-1 min-h-[60px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit}><Plus className="h-4 w-4" /> ساخت</Button>
        <Button variant="ghost" onClick={onDone}>انصراف</Button>
      </DialogFooter>
    </>
  )
}

// ---------- task detail ----------
export function PersonalTaskDialog({ id, onOpen, onClose }: { id: string | null; onOpen: (id: string) => void; onClose: () => void }) {
  const { all, meId } = useMine()
  const t = id ? all[id] : undefined
  const mine = t && t.ownerId === meId ? t : undefined
  return (
    <Dialog open={!!mine} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent dir="rtl" onOpenAutoFocus={(e) => e.preventDefault()} className="thin-scroll max-h-[88vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl">
        {mine && <Detail key={mine.id} t={mine} onOpen={onOpen} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Detail({ t, onOpen, onClose }: { t: PersonalTask; onOpen: (id: string) => void; onClose: () => void }) {
  const { dispatch } = useStore()
  const { board, list, all } = useMine()
  const { d, n, time } = useFmt()
  const [title, setTitle] = useState(t.title)
  const [desc, setDesc] = useState(t.description ?? '')
  const [sub, setSub] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const anc = ancestorsOf(all, t)
  const kids = childrenOf(list, t.id)
  const depth = depthOf(all, t)
  const prog = subProgress(board, list, t.id)
  const below = descendants(list, t.id)
  const update = (patch: Partial<PersonalTask>) => {
    const err = checkFields({ ...t, ...patch } as Parameters<typeof checkFields>[0])
    if (err) { toast.error(err); return false }
    dispatch({ type: 'ptUpdate', id: t.id, patch })
    return true
  }
  // where this task may go: no task inside its own subtree, and the result stays within MAX_DEPTH levels
  const blocked = new Set([t.id, ...below.map((x) => x.id)])
  const h = heightOf(list, t.id)
  const parents = list.filter((x) => !blocked.has(x.id) && depthOf(all, x) + 1 + h < MAX_DEPTH)
  const toggle = (k: PersonalTask) => dispatch({ type: 'ptUpdate', id: k.id, patch: { statusId: isDone(board, k) ? board.statuses.find((s) => !s.done && s.id === board.defaultStatusId)?.id ?? board.statuses.find((s) => !s.done)!.id : board.statuses.find((s) => s.done)!.id } })
  const addSub = () => {
    if (!sub.trim()) return
    dispatch({ type: 'ptCreate', task: { title: sub, parentId: t.id } })
    setSub('')
  }
  return (
    <>
      <DialogHeader className="pe-8 text-start">
        {anc.length > 0 && (
          <nav aria-label="مسیر" className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground">
            {anc.map((a) => <span key={a.id} className="inline-flex items-center gap-1"><button type="button" className="hover:text-azure" onClick={() => onOpen(a.id)}>{a.title}</button><ChevronLeft className="h-3 w-3" /></span>)}
          </nav>
        )}
        <DialogTitle className="sr-only">{t.title}</DialogTitle>
        <Input id="pt-title" aria-label="عنوان" className="h-10 border-transparent bg-transparent px-1 text-[17px] font-bold shadow-none hover:border-input focus-visible:border-azure" value={title}
          onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() !== t.title && !update({ title })) setTitle(t.title) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <DialogDescription className="text-[11.5px]">ساخته‌شده {time(t.createdAt)}{t.updatedAt !== t.createdAt ? `، آخرین تغییر ${time(t.updatedAt)}` : ''}{t.completedAt ? `، تکمیل ${time(t.completedAt)}` : ''}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="pt-status" className="eyebrow">Status</Label><StatusSelect id="pt-status" value={statusOfTask(board, t).id} onChange={(v) => update({ statusId: v })} /></div>
        <div><Label htmlFor="pt-pri" className="eyebrow">اولویت</Label><PrioritySelect id="pt-pri" value={t.priority} onChange={(v) => update({ priority: v })} /></div>
        <div><Label htmlFor="pt-start" className="eyebrow">شروع</Label><div className="mt-1"><JalaliDateField id="pt-start" value={t.start} onChange={(v) => update({ start: v ?? '' })} /></div></div>
        <div><Label htmlFor="pt-due" className="eyebrow">موعد</Label><div className="mt-1"><JalaliDateField id="pt-due" value={t.due} onChange={(v) => update({ due: v ?? '' })} /></div></div>
        <div className="col-span-2"><Label htmlFor="pt-desc" className="eyebrow">توضیحات</Label><Textarea id="pt-desc" className="mt-1 min-h-[64px]" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if (desc !== (t.description ?? '')) update({ description: desc }) }} /></div>
        <div className="col-span-2"><Label htmlFor="pt-parent" className="eyebrow">جای این کار</Label>
          <Select value={t.parentId ?? 'root'} onValueChange={(v) => dispatch({ type: 'ptMove', id: t.id, parentId: v === 'root' ? null : v, index: 9999 })}>
            <SelectTrigger id="pt-parent" className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="root">کار اصلی (بدون والد)</SelectItem>
              {parents.map((p) => <SelectItem key={p.id} value={p.id}>{'— '.repeat(depthOf(all, p))}زیر «{p.title}»</SelectItem>)}
            </SelectContent>
          </Select></div>
      </div>

      <section aria-label="Subtaskها">
        <div className="mb-1.5 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold">Subtaskها</h3>
          {prog.total > 0 && <span className="num text-[12px] text-muted-foreground">{n(prog.done)} از {n(prog.total)} تکمیل</span>}
          {prog.total > 0 && <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-leaf" style={{ width: `${(prog.done / prog.total) * 100}%` }} /></span>}
        </div>
        <ul className="flex flex-col divide-y rounded-lg border">
          {kids.map((k, i) => {
            const s = statusOfTask(board, k)
            const kp = subProgress(board, list, k.id)
            return (
              <li key={k.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                <Checkbox checked={s.done} onCheckedChange={() => toggle(k)} aria-label={`تکمیل «${k.title}»`} />
                <button type="button" className={cn('min-w-0 flex-1 truncate text-start hover:text-azure', s.done && 'text-muted-foreground line-through')} onClick={() => onOpen(k.id)}>{k.title}</button>
                {kp.total > 0 && <span className="num shrink-0 text-[11px] text-muted-foreground">{n(kp.done)}/{n(kp.total)}</span>}
                <StatusChip s={s} className="hidden sm:inline-flex" />
                {k.due && <span className={cn('num shrink-0 text-[11.5px]', !s.done && k.due < TODAY ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{d(k.due).slice(5)}</span>}
                <span className="flex shrink-0">
                  <button type="button" className="rounded p-1 hover:bg-accent disabled:opacity-30" disabled={i === 0} aria-label={`بالا بردن «${k.title}»`} onClick={() => dispatch({ type: 'ptMove', id: k.id, parentId: t.id, index: i - 1 })}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded p-1 hover:bg-accent disabled:opacity-30" disabled={i === kids.length - 1} aria-label={`پایین بردن «${k.title}»`} onClick={() => dispatch({ type: 'ptMove', id: k.id, parentId: t.id, index: i + 1 })}><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive" aria-label={`حذف «${k.title}»`} onClick={() => { dispatch({ type: 'ptDelete', id: k.id }); toast.success('Subtask حذف شد') }}><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              </li>
            )
          })}
          {depth + 1 < MAX_DEPTH ? (
            <li className="flex items-center gap-2 px-2 py-1.5">
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input id="pt-sub" aria-label="Subtask تازه" className="h-8 border-transparent bg-transparent px-1 shadow-none" placeholder="Subtask تازه… (Enter)" value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub() }} />
              {sub.trim() && <Button size="sm" className="h-7" onClick={addSub}>افزودن</Button>}
            </li>
          ) : <li className="px-2 py-1.5 text-[12px] text-muted-foreground">حداکثر {n(MAX_DEPTH)} سطح؛ این کار Subtask تازه نمی‌گیرد.</li>}
        </ul>
      </section>

      <DialogFooter className="gap-2 sm:justify-start">
        {!confirmDel ? <Button variant="outline" className="text-destructive" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" /> حذف</Button> : (
          <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {below.length ? `این کار و ${n(below.length)} Subtask آن حذف می‌شوند.` : 'این کار حذف می‌شود.'}
            <Button variant="destructive" size="sm" onClick={() => { dispatch({ type: 'ptDelete', id: t.id }); toast.success('حذف شد'); onClose() }}>حذف</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>انصراف</Button>
          </span>
        )}
        <Button variant="ghost" onClick={onClose}>بستن</Button>
      </DialogFooter>
    </>
  )
}

// ---------- status manager ----------
export function StatusManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="thin-scroll max-h-[88vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        {open && <StatusManager onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function StatusManager({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore()
  const { board, list } = useMine()
  const { n } = useFmt()
  const [rows, setRows] = useState<PersonalStatus[]>(board.statuses)
  const [def, setDef] = useState(board.defaultStatusId)
  const [remap, setRemap] = useState<Record<string, string>>({})
  const [pick, setPick] = useState<string | null>(null)
  const removed = board.statuses.filter((s) => !rows.some((r) => r.id === s.id))
  const count = (id: string) => list.filter((t) => t.statusId === id).length
  const set = (i: number, patch: Partial<PersonalStatus>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i: number, by: number) => { const r = [...rows]; const [x] = r.splice(i, 1); r.splice(i + by, 0, x); setRows(r) }
  const save = () => {
    const err = checkBoard(rows, def)
    if (err) { toast.error(err); return }
    const miss = removed.find((s) => count(s.id) && !rows.some((r) => r.id === remap[s.id]))
    if (miss) { toast.error(`برای کارهای Status «${miss.name}» یک Status تازه انتخاب کنید.`); return }
    dispatch({ type: 'psSave', statuses: rows, defaultStatusId: def, remap })
    toast.success('Statusها ذخیره شد')
    onDone()
  }
  return (
    <>
      <DialogHeader className="pe-8 text-start">
        <DialogTitle>Statusهای من</DialogTitle>
        <DialogDescription>ستون‌های Kanban شخصی شما، به همین ترتیب. فقط برای خودتان است و روی Statusهای پروژه‌ها اثری ندارد. Status پیش‌فرض برای کار تازه است و «تکمیل‌شده» یعنی کار تمام شده.</DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="rounded-xl border bg-background/40 p-2">
            <div className="flex items-center gap-2">
              <button type="button" className="h-7 w-7 shrink-0 rounded-full border-2 border-background shadow ring-1 ring-border" style={{ background: r.color }} aria-label={`رنگ «${r.name}»`} aria-expanded={pick === r.id} onClick={() => setPick(pick === r.id ? null : r.id)} />
              <Input aria-label="نام Status" className="h-8 min-w-0 flex-1" value={r.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={30} />
              <button type="button" className="rounded p-1 hover:bg-accent disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`جابه‌جایی «${r.name}» به قبل`}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1 hover:bg-accent disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`جابه‌جایی «${r.name}» به بعد`}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30" disabled={rows.length <= 1} onClick={() => { setRows(rows.filter((_, j) => j !== i)); if (def === r.id) setDef(rows.find((x) => x.id !== r.id && !x.done)?.id ?? '') }} aria-label={`حذف «${r.name}»`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {pick === r.id && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="رنگ">
                {PALETTE.map((c) => <button key={c} type="button" role="radio" aria-checked={r.color === c} aria-label={c} className={cn('h-6 w-6 rounded-full ring-offset-2 ring-offset-background', r.color === c && 'ring-2 ring-foreground')} style={{ background: c }} onClick={() => { set(i, { color: c }); setPick(null) }} />)}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 ps-9 text-[12px]">
              <label className="inline-flex cursor-pointer items-center gap-1.5"><Checkbox checked={r.done} onCheckedChange={(v) => set(i, { done: !!v })} />تکمیل‌شده</label>
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" name="ps-default" className="accent-[hsl(var(--azure))]" checked={def === r.id} onChange={() => setDef(r.id)} />پیش‌فرض کار تازه {def === r.id && <Star className="h-3 w-3 text-azure" />}</label>
              <span className="num text-muted-foreground">{n(count(r.id))} کار</span>
            </div>
          </li>
        ))}
      </ul>
      {rows.length < MAX_STATUSES && <div><Button variant="outline" size="sm" onClick={() => setRows([...rows, { id: `ps-${Date.now().toString(36)}`, name: '', color: PALETTE[(rows.length * 2) % PALETTE.length], done: false }])}><Plus className="h-4 w-4" /> Status تازه</Button></div>}
      {removed.filter((s) => count(s.id)).map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-[12.5px]">
          <span>{n(count(s.id))} کار در «{s.name}» است؛ منتقل شود به:</span>
          <Select value={remap[s.id] ?? ''} onValueChange={(v) => setRemap({ ...remap, [s.id]: v })}>
            <SelectTrigger aria-label={`Status تازه برای کارهای «${s.name}»`} className="h-8 w-[160px]"><SelectValue placeholder="انتخاب Status" /></SelectTrigger>
            <SelectContent>{rows.filter((x) => x.name.trim()).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ))}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={save}>ذخیره</Button>
        <Button variant="ghost" onClick={onDone}>انصراف</Button>
      </DialogFooter>
    </>
  )
}
