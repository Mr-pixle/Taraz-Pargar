// Point system end-to-end checks (Playwright, Chromium)
const { chromium } = require('playwright')
const path = require('path')
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots') + '/'
require('fs').mkdirSync(SHOTS, { recursive: true })
const PAGE = process.env.PAGE || 'file://' + path.resolve(__dirname, '../dist/preview.html')
let pass = 0, fail = 0
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (hash = '', scheme = 'light', vp = { width: 1366, height: 900 }) => {
    const p = await b.newPage({ viewport: vp, colorScheme: scheme })
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(PAGE + hash); await p.waitForTimeout(300)
    return p
  }
  const login = async (p, u) => { await p.fill('#li-user', u); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(400) }
  const nav = async (p, name) => { await p.locator('aside nav').getByRole('button', { name }).first().click(); await p.waitForTimeout(300) }

  console.log('امتیازات من')
  let p = await open()
  await login(p, 'sh.hosseini')
  await p.getByLabel('پروفایل', { exact: true }).click(); await p.getByRole('menuitem', { name: 'امتیازات من' }).click(); await p.waitForTimeout(300)
  const dlg = p.getByRole('dialog')
  ok(await dlg.locator('text=امتیاز خالص').count() && await dlg.locator('text=کسب‌شده (زودتر از موعد)').count() && await dlg.locator('text=کسرشده (تأخیر)').count() && await dlg.locator('text=امتیاز کل').count(), 'چهار شاخص: کل، کسب‌شده، کسرشده، خالص')
  ok(await dlg.locator('tbody tr').count() >= 2, 'تاریخچه‌ی امتیازات ردیف دارد')
  ok(await dlg.locator('svg[role=img], [role=img] svg').count(), 'نمودار روند امتیاز خالص')
  await p.screenshot({ path: SHOTS + 'pt-mypoints.png' })
  // open a task from history → its Point block is visible to the assignee
  const taskBtn = dlg.locator('tbody button').first()
  if (await taskBtn.count()) {
    await taskBtn.click(); await p.waitForTimeout(500)
    ok(await p.locator('#task-point >> text=تأثیر روی امتیاز شما').count(), 'مسئول تسک، Point آن را در صفحه‌ی تسک می‌بیند')
    ok(!(await p.locator('#task-point >> text=بازمحاسبه').count()), 'دکمه‌ی بازمحاسبه برای مسئول نیست')
    ok(await p.locator('#c-wf').isDisabled(), 'W.F برای مسئول غیرفعال است')
    await p.keyboard.press('Escape')
  }
  ok(!(await p.locator('aside nav').getByRole('button', { name: 'گزارش امتیازات' }).count()), 'عضو تیم «گزارش امتیازات» را در منو ندارد')
  await p.close()

  console.log('دسترسی مستقیم با آدرس')
  p = await open('#points')
  await login(p, 'g.afshar')
  ok(await p.locator('text=این بخش فقط برای مدیرعامل و کنترل پروژه است').count(), 'مدیر پروژه با آدرس مستقیم #points به گزارش نمی‌رسد')
  ok(!(await p.locator('table').count()), 'هیچ جدول امتیازی نمایش داده نشد')
  await p.close()
  p = await open('#workload')
  await login(p, 'b.sepehri')
  ok(await p.locator('text=این بخش فقط برای مدیرعامل و کنترل پروژه است').count(), 'مدیریت با آدرس مستقیم #workload به Workload نمی‌رسد')
  ok(!(await p.locator('text=در صف Sync Review').count()), 'شاخص Sync Review در خانه‌ی مدیریت نیست')
  await p.close()

  console.log('گزارش امتیازات (کنترل پروژه)')
  p = await open()
  await login(p, 'n.rahimi')
  await nav(p, 'گزارش امتیازات')
  const rows = await p.locator('section:has-text("رتبه‌بندی") tbody tr').count()
  ok(rows >= 5, `رتبه‌بندی ${rows} نفر`)
  ok(await p.locator('svg[aria-label*="کسب‌شده"]').count(), 'نمودار روند کسب‌شده/کسرشده')
  await p.screenshot({ path: SHOTS + 'pt-report.png', fullPage: false })
  await p.locator('#pt-team').click(); await p.getByRole('option', { name: 'Revit' }).click(); await p.waitForTimeout(200)
  const revit = await p.locator('section:has-text("رتبه‌بندی") tbody tr').allInnerTexts()
  ok(revit.length > 0 && revit.every((r) => r.includes('Revit')), 'فیلتر واحد فقط اعضای Revit را نشان داد')
  await p.locator('section:has-text("رتبه‌بندی") tbody tr').first().click(); await p.waitForTimeout(200)
  ok((await p.locator('#pt-user').innerText()).trim() !== 'همه‌ی کاربران', 'کلیک روی ردیف، فیلتر کاربر را گذاشت')
  await p.getByRole('tab', { name: 'جدول' }).click(); await p.waitForTimeout(150)
  ok(await p.locator('th:text-is("هفته‌ی")').count(), 'نمای جدولی روند')
  await p.getByRole('tab', { name: 'ماهانه' }).click(); await p.waitForTimeout(150)
  ok(await p.locator('th:text-is("ماه")').count(), 'روند ماهانه')
  await p.getByRole('button', { name: 'پاک کردن فیلترها' }).click(); await p.waitForTimeout(150)
  // manual adjustment
  await p.locator('#adj-user').click(); await p.getByRole('option', { name: 'آیدین شکوهی' }).click()
  await p.fill('#adj-points', '15'); await p.getByRole('button', { name: 'ثبت اصلاح' }).click(); await p.waitForTimeout(200)
  ok((await p.locator('[data-sonner-toast]').allInnerTexts()).join(' ').includes('دلیل'), 'اصلاح بدون دلیل رد شد')
  await p.fill('#adj-reason', 'هماهنگی فوری با پیمانکار نما'); await p.getByRole('button', { name: 'ثبت اصلاح' }).click(); await p.waitForTimeout(250)
  ok(await p.locator('text=هماهنگی فوری با پیمانکار نما').count(), 'اصلاح ثبت شد و در تاریخچه آمد')
  // new parameter version
  await p.fill('#cfg-cap', '300'); await p.fill('#cfg-reason', 'سقف برای تسک‌های خیلی کوچک'); await p.getByRole('button', { name: 'ثبت نسخه‌ی تازه' }).click(); await p.waitForTimeout(200)
  ok(await p.locator('text=نسخه‌ی ۲').count(), 'نسخه‌ی ۲ پارامترها ثبت شد')
  // a finished task: full detail for control
  await p.locator('section:has-text("تاریخچه‌ی تغییرات امتیاز") tbody button').first().click(); await p.waitForTimeout(500)
  ok(await p.locator('#task-point >> text=بازمحاسبه').count(), 'کنترل پروژه جزئیات Point و بازمحاسبه را می‌بیند')
  ok(await p.locator('#task-point >> text=نسخه‌ی ۱').count(), 'تسک قدیمی نسخه‌ی پارامترهای خودش را نشان می‌دهد')
  await p.locator('#task-point').scrollIntoViewIfNeeded()
  await p.screenshot({ path: SHOTS + 'pt-drawer.png' })
  await p.keyboard.press('Escape'); await p.close()

  console.log('تم تاریک و موبایل')
  p = await open('', 'dark')
  await login(p, 'ceo'); await nav(p, 'گزارش امتیازات')
  await p.screenshot({ path: SHOTS + 'pt-report-dark.png' })
  await p.close()
  p = await open('', 'light', { width: 390, height: 844 })
  await login(p, 'd.izadi')
  await p.getByLabel('پروفایل', { exact: true }).click(); await p.getByRole('menuitem', { name: 'امتیازات من' }).click(); await p.waitForTimeout(300)
  ok(await p.getByRole('dialog').locator('text=اصلاح مدیریتی').count(), 'اصلاح مدیریتی با دلیل در تاریخچه‌ی کاربر دیده می‌شود')
  const over = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
  ok(over <= 0, `بدون اسکرول افقی صفحه در موبایل (${over})`)
  await p.screenshot({ path: SHOTS + 'pt-m-mypoints.png' })
  await p.close()

  ok(errs.length === 0, 'بدون خطای صفحه')
  if (errs.length) console.log(errs.join('\n'))
  console.log(`\n${pass} passed, ${fail} failed`)
  await b.close(); process.exit(fail ? 1 : 0)
})()
