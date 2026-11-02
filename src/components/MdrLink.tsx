import { useEffect, useState } from 'react'
import { ExternalLink, FileSpreadsheet, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { MDR_URL_HINT, mdrHref } from '@/lib/mdr'
import type { Project } from '@/lib/types'

/** Keyboard shortcut of the project page that opens its MDR */
export const MDR_SHORTCUT = 'Alt+M'

function openMdr(href: string) {
  const w = window.open(href, '_blank', 'noopener,noreferrer')
  if (!w) toast.error('مرورگر باز کردن برگه‌ی تازه را بست', { description: 'روی دکمه‌ی «MDR پروژه» کلیک کنید یا اجازه‌ی Pop-up را بدهید.' })
}

/** Alt+M (⌥M) on a project page opens that project's MDR; ignored while typing */
export function useMdrShortcut(project: Project | undefined) {
  useEffect(() => {
    if (!project) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== 'KeyM') return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      const href = mdrHref(project.mdrUrl)
      if (href) openMdr(href)
      else toast.error(`لینک MDR پروژه‌ی ${project.code} ثبت نشده است`, { description: 'کنترل پروژه یا مدیرعامل آن را از دکمه‌ی «ثبت لینک MDR» ثبت می‌کند.' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [project])
}

/** Shortcut to the project's own MDR (Google Sheet), opened in a new tab */
export function MdrButton({ project, compact }: { project: Project; compact?: boolean }) {
  const { can } = useStore()
  const [edit, setEdit] = useState(false)
  const href = mdrHref(project.mdrUrl)
  const manage = can.perm('project.define')
  return (
    <span className="inline-flex items-center gap-1">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" id={`mdr-link-${project.id}`}
          aria-label={`باز کردن MDR پروژه‌ی ${project.name} در Google Sheets (برگه‌ی تازه، ${MDR_SHORTCUT})`} title={`MDR — برگه‌ی ${project.mdrTab} (${MDR_SHORTCUT})`}
          className={cn('key key-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background/70 font-medium text-foreground transition-colors hover:bg-background', compact ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]')}>
          <FileSpreadsheet className="h-4 w-4 text-leaf" />MDR پروژه<ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          {!compact && <kbd className="mono ms-0.5 hidden rounded border bg-secondary px-1 text-[10px] text-muted-foreground lg:inline">{MDR_SHORTCUT}</kbd>}
        </a>
      ) : manage ? (
        <Button variant="outline" size={compact ? 'sm' : 'default'} className={compact ? 'h-8' : ''} onClick={() => setEdit(true)} id={`mdr-set-${project.id}`}>
          <FileSpreadsheet className="h-4 w-4" /> ثبت لینک MDR
        </Button>
      ) : (
        <span role="note" className={cn('inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 text-muted-foreground', compact ? 'h-8 text-[12px]' : 'h-9 text-[12.5px]')} title="کنترل پروژه یا مدیرعامل لینک MDR را ثبت می‌کند.">
          <FileSpreadsheet className="h-4 w-4" /> لینک MDR ثبت نشده
        </span>
      )}
      {href && manage && (
        <button type="button" onClick={() => setEdit(true)} aria-label={`ویرایش لینک MDR پروژه‌ی ${project.name}`} className="rounded-full p-1.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {edit && <MdrDialog project={project} open onOpenChange={setEdit} />}
    </span>
  )
}

export function MdrDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { dispatch } = useStore()
  const [url, setUrl] = useState(mdrHref(project.mdrUrl) ?? '')
  const [tab, setTab] = useState(project.mdrTab || 'MDR')
  const valid = mdrHref(url)
  const save = () => {
    if (!valid) { toast.error('این لینک Google Sheet نیست.', { description: MDR_URL_HINT }); return }
    if (!tab.trim()) { toast.error('نام برگه‌ی MDR را وارد کنید.'); return }
    dispatch({ type: 'projectUpdate', id: project.id, patch: { mdrUrl: valid, mdrTab: tab.trim() } })
    onOpenChange(false)
    toast.success(`لینک MDR پروژه‌ی ${project.code} ثبت شد`, { description: `از صفحه‌ی پروژه با دکمه‌ی «MDR پروژه» یا ${MDR_SHORTCUT} باز می‌شود.` })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader className="pe-8 text-start">
          <DialogTitle>لینک MDR — {project.name}</DialogTitle>
          <DialogDescription>هر پروژه MDR خودش را دارد و Taskهای پروژه از همین Google Sheet وارد سامانه می‌شوند.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div>
            <Label htmlFor="mdr-url" className="eyebrow">لینک MDR (Google Sheet)</Label>
            <Input id="mdr-url" dir="ltr" className="mono mt-1 h-9 text-[12px]" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-invalid={!!url && !valid} />
          </div>
          <div><Label htmlFor="mdr-tab" className="eyebrow">Tab</Label><Input id="mdr-tab" dir="ltr" className="mono mt-1 h-9" value={tab} onChange={(e) => setTab(e.target.value)} /></div>
        </div>
        <p className={cn('text-[11.5px]', url && !valid ? 'text-destructive' : 'text-muted-foreground')}>{url && !valid ? 'این لینک Google Sheet نیست. ' : ''}{MDR_URL_HINT}</p>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={save} disabled={!valid}>ثبت لینک</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
