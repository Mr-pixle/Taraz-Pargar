import { useEffect, useState, type DragEvent } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFmt, useStore } from '@/lib/store'
import { api, ApiError, SERVER_MODE } from '@/lib/remote'
import { assignableRoles, has, ROLE_FA } from '@/lib/policy'
import type { AccountStatus, Role, User } from '@/lib/types'
import { Initials, Segmented } from './common'
import { MyPoints } from './PointsViews'

export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/
const AVATAR_PX = 192
const MAX_MB = 5

/** Center-crops an image file to a square and shrinks it to a small JPEG data URL */
export async function fileToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('decode'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = c.height = AVATAR_PX
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX)
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
    return c.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}
export { ROLE_FA } from '@/lib/policy'
const STATUS_FA: Record<AccountStatus, string> = { active: 'فعال', pending: 'در انتظار تأیید', rejected: 'ردشده', disabled: 'غیرفعال' }

export function ProfileDialog() {
  const { state, dispatch, me } = useStore()
  const u = state.profileUserId ? state.users.find((x) => x.id === state.profileUserId) : undefined
  return (
    <Dialog open={!!u} onOpenChange={(o) => !o && dispatch({ type: 'openProfile', id: null })}>
      <DialogContent dir="rtl" className={cn('max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto', state.profileTab === 'points' ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        {u && <ProfileForm key={u.id} u={u} self={u.id === me.id} />}
      </DialogContent>
    </Dialog>
  )
}

function ProfileForm({ u, self }: { u: User; self: boolean }) {
  const { state, dispatch, me, teamById } = useStore()
  const { dLong } = useFmt()
  const manager = has(me, 'users.manage')
  // own points for everyone; other people's points only for CEO and Project Control
  const canPoints = self || has(me, 'points.manage')
  const roles = assignableRoles(me)
  const [f, setF] = useState({ name: u.name, username: u.username, title: u.title ?? '', phone: u.phone ?? '', bio: u.bio ?? '', teamId: u.teamId, role: u.role, status: u.status })
  const [avatar, setAvatar] = useState<string | undefined>(u.avatar)
  const [dragging, setDragging] = useState(false)
  const takeFile = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('فقط فایل تصویری (JPG، PNG یا WebP) قابل استفاده است.'); return }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`حجم تصویر باید کمتر از ${MAX_MB} مگابایت باشد.`); return }
    try {
      setAvatar(await fileToAvatar(file))
      toast('تصویر آماده است', { description: 'برای اعمال، «ذخیره» را بزنید.' })
    } catch {
      toast.error('این تصویر خوانده نشد. فایل دیگری را امتحان کنید.')
    }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); takeFile(e.dataTransfer.files?.[0]) }
  const [pw, setPw] = useState({ current: '', next: '', again: '' })
  useEffect(() => { setPw({ current: '', next: '', again: '' }) }, [u.id])
  const save = () => {
    const username = f.username.trim().toLowerCase()
    if (!f.name.trim()) { toast.error('نام کامل را وارد کنید.'); return }
    if (!USERNAME_RE.test(username)) { toast.error('نام کاربری باید ۳ تا ۲۴ حرف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط باشد.'); return }
    if (state.users.some((x) => x.id !== u.id && x.username === username)) { toast.error(`نام کاربری ${username} قبلاً گرفته شده است.`); return }
    const patch: Partial<User> = { name: f.name.trim(), username, title: f.title.trim() || undefined, phone: f.phone.trim() || undefined, bio: f.bio.trim() || undefined, avatar }
    if (manager && !self) Object.assign(patch, { teamId: f.teamId, role: f.role, status: f.status })
    const finish = () => {
      dispatch({ type: 'updateUser', id: u.id, patch })
      dispatch({ type: 'openProfile', id: null })
      toast.success(self ? 'پروفایل شما ذخیره شد' : `پروفایل ${patch.name} ذخیره شد`)
    }
    if (pw.next || pw.current) {
      if (!SERVER_MODE && self && pw.current !== u.password) { toast.error('رمز فعلی درست نیست.'); return }
      if (pw.next.length < 6) { toast.error('رمز جدید باید دست‌کم ۶ نویسه باشد.'); return }
      if (pw.next !== pw.again) { toast.error('تکرار رمز جدید با خودش یکی نیست.'); return }
      if (SERVER_MODE) {
        // the server checks the current password against its hash; a reset by a manager ends that person's sessions
        const call = self ? api('/api/me/password', { current: pw.current, next: pw.next }) : api(`/api/users/${encodeURIComponent(u.id)}/password`, { password: pw.next })
        call.then(finish).catch((e) => toast.error(e instanceof ApiError ? e.message : 'اتصال به سرور برقرار نشد.'))
        return
      }
      patch.password = pw.next
    }
    finish()
  }
  return (
    <>
      <DialogHeader className="text-start">
        <div className="flex items-center gap-3">
          <Initials user={{ ...u, name: f.name || u.name, avatar }} size={48} />
          <div className="min-w-0">
            <DialogTitle className="truncate">{self ? 'پروفایل من' : `پروفایل ${u.name}`}</DialogTitle>
            <DialogDescription className="mt-0.5">
              <bdi className="mono">@{u.username}</bdi>، {teamById[u.teamId]?.name ?? 'بدون تیم'}، عضو از {dLong(u.createdAt.slice(0, 10))}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      {canPoints && (
        <Segmented value={state.profileTab} onChange={(v) => dispatch({ type: 'openProfile', id: u.id, tab: v })}
          options={[{ value: 'profile', label: 'پروفایل' }, { value: 'points', label: self ? 'امتیازات من' : 'امتیازات' }]} />
      )}
      {state.profileTab === 'points' && canPoints ? <MyPoints userId={u.id} /> : <>
      <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        className={cn('flex items-center gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.025] p-3 transition-colors', dragging && 'border-azure bg-azure-soft')}>
        <Initials user={{ ...u, name: f.name || u.name, avatar }} size={72} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">تصویر پروفایل</div>
          <div className="text-[11.5px] leading-relaxed text-muted-foreground">JPG، PNG یا WebP تا {MAX_MB} مگابایت. تصویر به‌صورت مربع برش می‌خورد. می‌توانید فایل را روی این کادر بکشید.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <label htmlFor="pf-avatar" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}><ImageUp className="h-3.5 w-3.5" /> {avatar ? 'تغییر تصویر' : 'بارگذاری تصویر'}</label>
            <input id="pf-avatar" type="file" accept="image/*" className="sr-only" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }} />
            {avatar && <Button type="button" variant="ghost" size="sm" onClick={() => setAvatar(undefined)}><Trash2 className="h-3.5 w-3.5" /> حذف تصویر</Button>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label htmlFor="pf-name" className="eyebrow">نام کامل (Full Name)</Label><Input id="pf-name" className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label htmlFor="pf-username" className="eyebrow">نام کاربری (ID)</Label><Input id="pf-username" dir="ltr" className="mono mt-1" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
        <div><Label htmlFor="pf-title" className="eyebrow">سمت</Label><Input id="pf-title" className="mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><Label htmlFor="pf-phone" className="eyebrow">تلفن / داخلی</Label><Input id="pf-phone" className="mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="pf-bio" className="eyebrow">درباره</Label><Textarea id="pf-bio" className="mt-1 min-h-[64px]" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="مهارت‌ها، نرم‌افزارها، حوزه‌ی کار" /></div>
        {manager && !self && (
          <>
            <div>
              <Label htmlFor="pf-team" className="eyebrow">تیم (هر نفر فقط یک تیم)</Label>
              <Select value={f.teamId ?? ''} onValueChange={(v) => setF({ ...f, teamId: v })}><SelectTrigger id="pf-team" className="mt-1"><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{state.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <Label htmlFor="pf-role" className="eyebrow">نقش</Label>
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as Role })} disabled={!roles.includes(f.role)}>
                <SelectTrigger id="pf-role" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{(roles.includes(f.role) ? roles : [f.role]).map((r) => <SelectItem key={r} value={r}>{ROLE_FA[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pf-status" className="eyebrow">وضعیت حساب</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as AccountStatus })}><SelectTrigger id="pf-status" className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{(['active', 'disabled'] as AccountStatus[]).concat(f.status === 'pending' || f.status === 'rejected' ? [f.status] : []).map((s) => <SelectItem key={s} value={s}>{STATUS_FA[s]}</SelectItem>)}</SelectContent></Select>
            </div>
          </>
        )}
      </div>
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.025] p-3">
        <div className="mb-2 text-[13px] font-semibold">{self ? 'تغییر رمز عبور' : 'تعیین رمز تازه برای این کاربر'}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {self && <Input id="pf-pw-current" type="password" autoComplete="current-password" placeholder="رمز فعلی" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}
          <Input id="pf-pw-next" type="password" autoComplete="new-password" placeholder="رمز جدید" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <Input id="pf-pw-again" type="password" autoComplete="new-password" placeholder="تکرار رمز جدید" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">خالی بگذارید تا رمز تغییر نکند.</p>
      </div>
      {!self && !manager && <p className="text-[12px] text-muted-foreground">فقط خود کاربر، مدیرعامل یا کنترل پروژه می‌تواند این پروفایل را ویرایش کند.</p>}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={save}>ذخیره</Button>
        <Button variant="ghost" onClick={() => dispatch({ type: 'openProfile', id: null })}>انصراف</Button>
        <span className="hidden text-[11.5px] text-muted-foreground sm:ms-auto sm:inline">وضعیت: {STATUS_FA[u.status]}</span>
      </DialogFooter>
      </>}
    </>
  )
}
