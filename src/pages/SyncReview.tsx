import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, FileSpreadsheet, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useFmt, useStore } from '@/lib/store'
import type { SyncItem } from '@/lib/types'
import { Empty, PageHeader, Segmented } from '@/components/common'

const KIND: Record<SyncItem['kind'], { label: string; cls: string }> = {
  new: { label: 'جدید', cls: 'bg-azure-soft text-azure-ink' },
  changed: { label: 'تغییر', cls: 'bg-secondary text-foreground ring-1 ring-border' },
  removed: { label: 'حذف از MDR', cls: 'bg-danger-soft text-destructive' },
}
const FIELD: Record<string, string> = { name: 'Sheets Name', weight: 'Weight', floor: 'Floor', parent: 'جابه‌جایی (Parent)', package: 'Package' }
const ROWKIND: Record<string, string> = { doctype: 'Doc Type', document: 'Document', group: 'Group', stage: 'Stage', phase: 'Phase' }

export function SyncReview() {
  const store = useStore()
  const { state, dispatch, projectById, can } = store
  const { n } = useFmt()
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const items = state.syncItems.filter((x) => (tab === 'pending' ? x.state === 'pending' : x.state !== 'pending'))
  const groups = useMemo(() => {
    const m = new Map<string, { projectId: string; branch: string[]; items: SyncItem[] }>()
    for (const it of items) {
      const k = `${it.projectId}|${it.branch.join('›')}`
      if (!m.has(k)) m.set(k, { projectId: it.projectId, branch: it.branch, items: [] })
      m.get(k)!.items.push(it)
    }
    return [...m.entries()]
  }, [items])
  const toggle = (ids: string[], on: boolean) => setSel((s) => { const x = new Set(s); ids.forEach((id) => (on ? x.add(id) : x.delete(id))); return x })
  const act = (ids: string[], approve: boolean) => {
    if (!ids.length) return
    dispatch({ type: 'review', ids, approve })
    setSel(new Set())
    toast.success(approve ? `${n(ids.length)} ردیف تأیید شد` : `${n(ids.length)} ردیف رد شد`, {
      description: approve ? 'تسک‌های جدید در استخر Unassigned قرار گرفتند؛ تغییرات روی تسک‌ها اعمال شد.' : 'این ردیف‌ها در اجرای بعدی Sync دوباره پیشنهاد نمی‌شوند مگر MDR تغییر کند.',
    })
  }
  const pendingCount = state.syncItems.filter((x) => x.state === 'pending').length

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader eyebrow="Sync با MDR" title="صف Sync Review" actions={
        <Segmented value={tab} onChange={(v) => { setTab(v); setSel(new Set()) }} options={[
          { value: 'pending', label: <>در انتظار <span className="num">{n(pendingCount)}</span></> },
          { value: 'done', label: 'بررسی‌شده' },
        ]} />
      }>
        سطرهای جدید MDR مستقیم تسک نمی‌شوند. کنترل پروژه هر شاخه را یک‌جا تأیید می‌کند. سطر حذف‌شده فقط علامت «Removed from MDR» می‌گیرد.
      </PageHeader>

      {groups.length === 0 ? (
        <Empty icon={<CheckCheck className="h-6 w-6" />} title={tab === 'pending' ? 'صف خالی است' : 'هنوز ردیفی بررسی نشده'} hint={tab === 'pending' ? 'همه‌ی تغییرات MDR بررسی شده‌اند. اجرای بعدی Sync موارد تازه را اینجا می‌آورد.' : undefined} />
      ) : groups.map(([key, g]) => {
        const ids = g.items.map((x) => x.id)
        const all = ids.every((id) => sel.has(id))
        const some = ids.some((id) => sel.has(id))
        const counts = { new: g.items.filter((x) => x.kind === 'new').length, changed: g.items.filter((x) => x.kind === 'changed').length, removed: g.items.filter((x) => x.kind === 'removed').length }
        return (
          <section key={key} className="overflow-hidden glass-card">
            <header className="flex flex-wrap items-center gap-3 border-b bg-foreground/[0.03] px-4 py-2.5">
              {tab === 'pending' && can.syncProject(g.projectId) && <Checkbox id={`br-${key}`} checked={all ? true : some ? 'indeterminate' : false} onCheckedChange={(v) => toggle(ids, !!v)} aria-label="انتخاب کل شاخه" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><FileSpreadsheet className="h-3.5 w-3.5" /> {projectById[g.projectId]?.name}</div>
                <div className="truncate font-semibold">{g.branch.join(' › ')}</div>
              </div>
              <div className="num flex gap-3 text-[12px] text-muted-foreground">
                {counts.new > 0 && <span>{n(counts.new)} جدید</span>}
                {counts.changed > 0 && <span>{n(counts.changed)} تغییر</span>}
                {counts.removed > 0 && <span>{n(counts.removed)} حذف</span>}
              </div>
              {tab === 'pending' && can.syncProject(g.projectId) && (
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => act(ids, true)}><Check className="h-3.5 w-3.5" /> تأیید شاخه</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(ids, false)}>رد</Button>
                </div>
              )}
            </header>
            <ul className="divide-y">
              {g.items.map((it) => {
                const t = it.task ?? (it.taskId ? state.tasks[it.taskId] : undefined)
                const isChildOfNew = it.task?.parentId && g.items.some((x) => x.task?.id === it.task?.parentId)
                return (
                  <li key={it.id} className={cn('flex items-start gap-3 px-4 py-2.5', sel.has(it.id) && 'bg-azure-soft/40')}>
                    {tab === 'pending' && can.syncProject(g.projectId) && <Checkbox id={`it-${it.id}`} className="mt-1" checked={sel.has(it.id)} onCheckedChange={(v) => toggle([it.id], !!v)} aria-label="انتخاب ردیف" />}
                    <div className={cn('min-w-0 flex-1', isChildOfNew && 'ps-5')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', KIND[it.kind].cls)}>{KIND[it.kind].label}</span>
                        <span className="text-[11px] text-muted-foreground">{ROWKIND[t?.kind ?? ''] ?? ''}، ردیف <span className="num">{n(it.row)}</span></span>
                        {t?.docNumber && <span className="mono text-[11.5px] text-muted-foreground">{t.docNumber}</span>}
                        {it.state !== 'pending' && <span className={cn('rounded px-1.5 py-0.5 text-[11px]', it.state === 'approved' ? 'bg-leaf-soft text-leaf-ink' : 'bg-secondary text-muted-foreground')}>{it.state === 'approved' ? 'تأیید شد' : 'رد شد'}</span>}
                      </div>
                      <div className="mt-0.5 font-medium">{t?.name}</div>
                      {it.kind === 'new' && t?.kind === 'document' && (
                        <div className="num mt-0.5 flex flex-wrap gap-x-4 text-[12px] text-muted-foreground"><span>Floor: <bdi className="mono text-foreground">{t.floor}</bdi></span><span>Weight: <bdi className="text-foreground">{t.weight != null ? n(t.weight, 2) : '—'}</bdi></span><span>Package: <bdi className="mono text-foreground">{t.pkg}</bdi></span></div>
                      )}
                      {it.changes?.map((c, i) => (
                        <div key={i} className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                          <span className="text-muted-foreground">{FIELD[c.field]}:</span>
                          <span className="rounded bg-danger-soft px-1 text-muted-foreground line-through decoration-destructive/60">{c.from || '—'}</span>
                          <span className="text-muted-foreground">←</span>
                          <span className="rounded bg-leaf-soft px-1 text-leaf-ink">{c.to}</span>
                        </div>
                      ))}
                      {it.kind === 'removed' && <div className="mt-1 text-[12.5px] text-muted-foreground">این سطر دیگر در MDR نیست. با تأیید، تسک حذف نمی‌شود و فقط علامت «Removed from MDR» می‌گیرد.</div>}
                      {it.warnings?.map((w, i) => (
                        <div key={i} className="mt-1.5 flex items-start gap-1.5 rounded bg-azure-soft px-2 py-1 text-[12px] text-azure-ink"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</div>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 py-3">
            <span className="num text-[13px]">{n(sel.size)} ردیف انتخاب شده</span>
            <div className="flex gap-2">
              <Button onClick={() => act([...sel], true)}><Check className="h-4 w-4" /> تأیید انتخاب‌شده‌ها</Button>
              <Button variant="outline" onClick={() => act([...sel], false)}><X className="h-4 w-4" /> رد</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
