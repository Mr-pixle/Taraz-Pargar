import { useEffect, useState } from 'react'
import { CheckCircle2, LogIn, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getRemote, useFmt, useStore } from '@/lib/store'
import { api, ApiError, SERVER_MODE } from '@/lib/remote'
import { DEMO_PASSWORD } from '@/lib/seed'
import { ROLE_FA } from '@/lib/policy'
import { Logo, Segmented, Initials } from '@/components/common'
import { USERNAME_RE } from '@/components/Profile'
import { TehranClock, ThemeToggle } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { LANDING_SLIDES } from '@/assets/landingSlides'

/** One sample account per role */
const DEMO = [
  { username: 'ceo', hint: 'همه‌ی بخش‌ها' },
  { username: 'b.sepehri', hint: 'همه‌ی پروژه‌ها' },
  { username: 'n.rahimi', hint: 'برنامه‌ریزی، Sync، کاربران' },
  { username: 'm.tavana', hint: 'کارتابل درخواست‌ها، فضای اداری' },
  { username: 'f.sadri', hint: 'فضای مالی' },
  { username: 'g.afshar', hint: 'BBT، LVS، PSD' },
  { username: 'm.karami', hint: 'فاز ۲ – الف' },
  { username: 's.rezaei', hint: 'فاز ۲ – الف' },
  { username: 'y.babaei', hint: 'نظارت و اجرا' },
  { username: 'sh.hosseini', hint: 'فاز ۱ – الف' },
]

const SLIDE_MS = 7000

/** Full-bleed project photographs behind the glass, cross-fading; a theme-aware wash keeps the cards legible */
function LandingBackdrop({ index }: { index: number }) {
  return (
    <div className="fixed inset-0 overflow-hidden" aria-hidden="true">
      {LANDING_SLIDES.map((s, i) => (
        <div key={i} className="landing-slide" data-active={i === index}>
          <img src={s.src} alt="" decoding="async" style={{ objectPosition: s.focus }} />
        </div>
      ))}
      <div className="landing-shade absolute inset-0" />
      <div className="landing-dim absolute inset-0" />
      <div className="landing-wash absolute inset-0" />
    </div>
  )
}

export function Auth() {
  const { state, dispatch } = useStore()
  const { digits } = useFmt()
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const h = setInterval(() => setSlide((x) => (x + 1) % LANDING_SLIDES.length), SLIDE_MS)
    return () => clearInterval(h)
  }, [paused])
  const current = LANDING_SLIDES[slide]
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [login, setLogin] = useState({ username: '', password: '' })
  const [err, setErr] = useState('')
  const [reg, setReg] = useState({ name: '', username: '', password: '', again: '' })
  const [regErr, setRegErr] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const doLogin = (username: string, password: string) => {
    if (SERVER_MODE) {
      // the server checks the password (scrypt hash) and opens an HttpOnly session
      setBusy(true)
      getRemote().login(username.trim().toLowerCase(), password)
        .then(() => { setErr(''); toast.success('خوش آمدید') })
        .catch((e) => setErr(e instanceof ApiError ? e.message : 'اتصال به سرور برقرار نشد.'))
        .finally(() => setBusy(false))
      return
    }
    const u = state.users.find((x) => x.username === username.trim().toLowerCase())
    if (!u || u.password !== password) { setErr('نام کاربری یا رمز عبور درست نیست.'); return }
    if (u.status === 'pending') { setErr('حساب شما ساخته شده ولی هنوز تأیید نشده است. پس از تأیید مدیر یا کنترل پروژه می‌توانید وارد شوید.'); return }
    if (u.status === 'rejected') { setErr('درخواست عضویت شما رد شده است. با مدیر یا کنترل پروژه تماس بگیرید.'); return }
    if (u.status === 'disabled') { setErr('این حساب غیرفعال شده است.'); return }
    setErr('')
    dispatch({ type: 'login', id: u.id })
    toast.success(`خوش آمدید، ${u.name}`)
  }
  const doRegister = () => {
    const username = reg.username.trim().toLowerCase()
    if (!reg.name.trim()) return setRegErr('نام کامل را وارد کنید.')
    if (!USERNAME_RE.test(username)) return setRegErr('نام کاربری باید ۳ تا ۲۴ نویسه از حروف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط باشد؛ مثل s.ahmadi')
    if (state.users.some((x) => x.username === username)) return setRegErr(`نام کاربری ${username} قبلاً گرفته شده است.`)
    if (reg.password.length < 6) return setRegErr('رمز عبور باید دست‌کم ۶ نویسه باشد.')
    if (reg.password !== reg.again) return setRegErr('تکرار رمز عبور با خودش یکی نیست.')
    setRegErr('')
    if (SERVER_MODE) {
      setBusy(true)
      api('/api/auth/register', { name: reg.name.trim(), username, password: reg.password })
        .then(() => { setDone(username); setReg({ name: '', username: '', password: '', again: '' }) })
        .catch((e) => setRegErr(e instanceof ApiError ? e.message : 'اتصال به سرور برقرار نشد.'))
        .finally(() => setBusy(false))
      return
    }
    dispatch({ type: 'register', user: { id: `u-new-${Date.now().toString(36)}`, name: reg.name.trim(), username, password: reg.password, teamId: '', role: 'member', capacity: 8, status: 'pending', createdAt: new Date().toISOString() } })
    setDone(username)
    setReg({ name: '', username: '', password: '', again: '' })
  }

  return (
    <div className="relative min-h-full">
      <LandingBackdrop index={slide} />
      <div className="relative z-10 grid min-h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between p-10 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="glass-card flex items-center gap-3 self-start rounded-2xl py-2.5 pe-5 ps-3">
          <Logo className="h-11 w-11" />
          <div><div className="text-[22px] font-extrabold tracking-tight">تراز</div><div className="text-[12px] text-muted-foreground">سامانه‌ی کار و ظرفیت دفتر معماری پرگار</div></div>
        </div>
        <div className="flex flex-col gap-3">
        <div className="glass-card glass-sheen max-w-md rounded-[24px] p-7">
          <div className="eyebrow">تراز · سنجیدنِ کار و ظرفیت</div>
          <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight">هر پروژه، هم‌تراز با ظرفیت تیم</h1>
          <p className="mt-3 text-[14px] leading-7 text-muted-foreground">تسک‌های هر پروژه از MDR می‌آید، کنترل پروژه تخصیص می‌دهد، و هر نفر کارها، اعلان‌ها و گفتگوهای پروژه‌اش را یک‌جا می‌بیند.</p>
        </div>
        <figure className="glass-card flex max-w-md flex-col gap-2 rounded-2xl px-4 py-3 text-[12px] text-muted-foreground" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-label="تصاویر پس‌زمینه">
          <figcaption className="flex items-center justify-between gap-3">
            <span><span className="eyebrow me-1.5">از کارهای پرگار</span><span className="font-semibold text-foreground" aria-live="polite">{current.caption}</span></span>
            <span className="num">{digits(slide + 1)} / {digits(LANDING_SLIDES.length)}</span>
          </figcaption>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="group" aria-label="انتخاب تصویر">
              {LANDING_SLIDES.map((s, i) => (
                <button key={i} type="button" onClick={() => setSlide(i)} aria-label={`تصویر ${digits(i + 1)}: ${s.alt}`} aria-pressed={i === slide}
                  className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300', i === slide ? 'w-6 bg-foreground/80' : 'w-1.5 bg-foreground/30 hover:bg-foreground/50')} />
              ))}
            </div>
            <TehranClock compact />
          </div>
        </figure>
        </div>
      </aside>

      <main className="flex flex-col items-center justify-center gap-4 py-6 lg:py-10" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        {/* phones: the photograph shows above the card, with the brand and the slide dots on glass */}
        <div className="flex h-[30vh] min-h-[180px] w-full max-w-[460px] flex-col justify-between lg:hidden">
          <div className="glass-card flex items-center gap-2 self-start rounded-2xl py-1.5 pe-3 ps-2"><Logo className="h-8 w-8" /><span className="text-lg font-extrabold">تراز</span><span className="text-[11px] text-muted-foreground">پرگار</span></div>
          <div className="glass-card flex items-center justify-between gap-2 self-stretch rounded-xl px-3 py-1.5 text-[11.5px] text-muted-foreground">
            <span className="truncate"><span className="font-medium text-foreground">{current.caption}</span></span>
            <span className="flex shrink-0 items-center gap-1.5" role="group" aria-label="انتخاب تصویر">
              {LANDING_SLIDES.map((s, i) => <button key={i} type="button" onClick={() => setSlide(i)} aria-label={`تصویر ${digits(i + 1)}: ${s.alt}`} aria-pressed={i === slide} className={cn('h-1.5 rounded-full transition-[width] duration-300', i === slide ? 'w-5 bg-foreground/80' : 'w-1.5 bg-foreground/30')} />)}
            </span>
          </div>
        </div>
        <div className="glass-card glass-login w-full max-w-[460px] rounded-[24px] p-5 sm:p-8">
          <div className="mb-4 flex justify-end text-[12px] text-muted-foreground lg:hidden"><TehranClock compact /></div>
          <div className="flex items-center justify-between gap-2">
            <Segmented value={mode} onChange={(v) => { setMode(v); setErr(''); setRegErr(''); setDone(null) }} options={[
              { value: 'login', label: 'ورود', icon: <LogIn className="h-3.5 w-3.5" /> },
              { value: 'register', label: 'ایجاد حساب', icon: <UserPlus className="h-3.5 w-3.5" /> },
            ]} />
            <ThemeToggle />
          </div>

          {mode === 'login' ? (
            <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); doLogin(login.username, login.password) }}>
              <h2 className="text-[20px] font-bold">ورود به سامانه</h2>
              <div><Label htmlFor="li-user" className="eyebrow">نام کاربری (ID)</Label><Input id="li-user" dir="ltr" autoComplete="username" aria-invalid={!!err} className="mono mt-1 h-10" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} placeholder="n.rahimi" /></div>
              <div><Label htmlFor="li-pass" className="eyebrow">رمز عبور</Label><Input id="li-pass" type="password" autoComplete="current-password" aria-invalid={!!err} className="mt-1 h-10" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></div>
              {err && <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{err}</div>}
              <Button type="submit" className="h-10" disabled={busy} aria-busy={busy}>ورود</Button>
              <p className="text-[12px] text-muted-foreground">حساب ندارید؟ <button type="button" className="text-azure hover:underline" onClick={() => setMode('register')}>ایجاد حساب</button> — بدون نیاز به ایمیل، با تأیید مدیر یا کنترل پروژه.</p>
            </form>
          ) : done ? (
            <div className="mt-5 rounded-xl border bg-background/45 p-5">
              <CheckCircle2 className="h-7 w-7 text-leaf" />
              <h2 className="mt-2 text-[18px] font-bold">درخواست شما ثبت شد</h2>
              <p className="mt-1 text-[13px] leading-6 text-muted-foreground">حساب <bdi className="mono text-foreground">@{done}</bdi> ساخته شد و در انتظار تأیید است. بعد از اینکه مدیر یا کنترل پروژه تیم و نقش شما را تعیین و تأیید کند، می‌توانید وارد شوید.</p>
              <p className="mt-3 text-[12px] text-muted-foreground">در این نسخه‌ی نمایشی: با یکی از حساب‌های Admin یا Control زیر وارد شوید و از «مدیریت › کاربران و درخواست‌ها» آن را تأیید کنید.</p>
              <Button variant="outline" className="mt-4" onClick={() => { setMode('login'); setDone(null); setLogin({ username: done, password: '' }) }}>بازگشت به ورود</Button>
            </div>
          ) : (
            <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); doRegister() }}>
              <h2 className="text-[20px] font-bold">ایجاد حساب کاربری</h2>
              <div><Label htmlFor="rg-name" className="eyebrow">نام کامل (Full Name)</Label><Input id="rg-name" autoComplete="name" className="mt-1 h-10" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="مثلاً: سپیده احمدی" /></div>
              <div><Label htmlFor="rg-user" className="eyebrow">نام کاربری (Username)</Label><Input id="rg-user" dir="ltr" autoComplete="username" className="mono mt-1 h-10" value={reg.username} onChange={(e) => setReg({ ...reg, username: e.target.value })} placeholder="s.ahmadi" /><p className="mt-1 text-[11.5px] text-muted-foreground">همین ID برای تگ کردن شما با @ در کامنت‌ها و چت استفاده می‌شود.</p></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor="rg-pass" className="eyebrow">رمز عبور</Label><Input id="rg-pass" type="password" autoComplete="new-password" className="mt-1 h-10" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} /></div>
                <div><Label htmlFor="rg-again" className="eyebrow">تکرار رمز</Label><Input id="rg-again" type="password" autoComplete="new-password" className="mt-1 h-10" value={reg.again} onChange={(e) => setReg({ ...reg, again: e.target.value })} /></div>
              </div>
              {regErr && <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{regErr}</div>}
              <Button type="submit" className="h-10" disabled={busy} aria-busy={busy}>ارسال درخواست عضویت</Button>
              <p className="text-[12px] text-muted-foreground">ایمیل لازم نیست. دسترسی بعد از تأیید مدیر یا کنترل پروژه فعال می‌شود.</p>
            </form>
          )}

          {!SERVER_MODE && <div className="mt-6 overflow-hidden rounded-xl border bg-background/40">
            <div className="border-b px-4 py-2.5">
              <div className="text-[13px] font-semibold">حساب‌های نمونه</div>
              <div className="text-[11.5px] text-muted-foreground">رمز همه: <bdi className="mono text-foreground">{DEMO_PASSWORD}</bdi> — یا روی یکی بزنید تا مستقیم وارد شوید.</div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border">
              {DEMO.map((x, i) => {
                const u = state.users.find((y) => y.username === x.username)!
                return (
                  <button key={x.username} onClick={() => doLogin(x.username, u.password ?? '')} className={cn('flex items-center gap-2 bg-background/80 px-3 py-2.5 text-start hover:bg-background', i === DEMO.length - 1 && DEMO.length % 2 === 1 && 'col-span-2')}>
                    <Initials user={u} size={28} />
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium">{u.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{ROLE_FA[u.role]}</span>، {x.hint}</div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="border-t px-4 py-2 text-[11.5px] text-muted-foreground">حساب <bdi className="mono">r.hashemi</bdi> در انتظار تأیید است؛ ورود با آن پیام انتظار را نشان می‌دهد.</div>
          </div>}
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{SERVER_MODE
            ? 'رمزها فقط به‌صورت هش (scrypt) روی سرور نگه داشته می‌شوند و نشست شما در کوکی HttpOnly است.'
            : 'نسخه‌ی نمایشی: حساب‌ها و رمزها فقط در حافظه‌ی همین صفحه نگه داشته می‌شوند. در نسخه‌ی سروری، رمزها روی سرور با scrypt هش می‌شوند.'}</p>
        </div>
      </main>
      </div>
    </div>
  )
}
