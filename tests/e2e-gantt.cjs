// Gantt end-to-end checks (Playwright, Chromium)
const { chromium } = require('playwright')
const path = require('path')
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots') + '/'
require('fs').mkdirSync(SHOTS, { recursive: true })
const PAGE = process.env.PAGE || 'file://' + path.resolve(__dirname, '../dist/preview.html')
let pass = 0, fail = 0
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }
const num = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^0-9.]/g, ''))

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (scheme = 'light', vp = { width: 1366, height: 900 }) => {
    const p = await b.newPage({ viewport: vp, colorScheme: scheme })
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(PAGE); await p.waitForTimeout(300)
    return p
  }
  const login = async (p, u) => { await p.fill('#li-user', u); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(400) }
  const grid = (p) => p.locator('[role=grid][aria-label=Gantt]')
  const rowCount = async (p) => Number(await grid(p).getAttribute('aria-rowcount'))
  const domRows = (p) => grid(p).locator('[role=row]').count()
  const scrollGrid = (p, fn) => grid(p).evaluate(fn).then(() => p.waitForTimeout(150))

  console.log('کنترل پروژه — پروژه‌ی BBT')
  let p = await open()
  await login(p, 'n.rahimi')
  await p.locator('aside >> text=برج مسکونی بابلسر').first().click(); await p.waitForTimeout(400)
  const viewTabs = p.locator('[role=tabpanel] [role=tablist]').first()
  ok(await p.getByRole('tab', { name: 'Gantt' }).count() === 1, 'گزینه‌ی Gantt کنار نماهای دیگر هست')
  ok(await p.getByRole('tab', { name: 'درختی' }).getAttribute('aria-selected') === 'true', 'نمای پیش‌فرض همان «درختی» مانده است')
  await p.getByRole('tab', { name: 'Gantt' }).click(); await p.waitForTimeout(500)
  ok(await grid(p).count() === 1, 'Gantt باز شد')
  const folded = await rowCount(p)
  ok(await grid(p).locator('[role=row]:has-text("فاز ۱")').count() && await grid(p).locator('[role=row]:has-text("طرح پایه")').count(), 'Phase و Stage به‌طور پیش‌فرض باز هستند')

  // time runs right to left: the task-name column is on the right
  const nameBox = await grid(p).locator('[role=row]').first().locator('div').first().boundingBox()
  const gridBox = await grid(p).boundingBox()
  ok(nameBox.x + nameBox.width > gridBox.x + gridBox.width - 4, 'ستون نام تسک سمت راست است')
  // today line is inside the visible part on open
  const today = await grid(p).evaluate((el) => {
    const t = [...el.querySelectorAll('[aria-hidden=true] > div')].find((d) => d.style.background.includes('chart-pos'))
    const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect()
    return tr.left > r.left && tr.right < r.right
  })
  ok(today, 'خط امروز هنگام باز شدن دیده می‌شود')

  // expand everything → virtualised rows
  await p.getByRole('button', { name: 'باز کردن همه' }).click(); await p.waitForTimeout(300)
  const all = await rowCount(p)
  ok(all > folded, `«باز کردن همه» ردیف‌ها را بیشتر کرد (${folded} ← ${all})`)
  const d0 = await domRows(p)
  ok(d0 < all && d0 <= 45, `فقط ردیف‌های روی صفحه در DOM هستند (${d0} از ${all})`)
  await scrollGrid(p, (el) => { el.scrollTop = el.scrollHeight / 2 })
  const mid = await grid(p).locator('[role=row]').evaluateAll((rs) => rs.map((r) => Number(r.getAttribute('aria-rowindex'))))
  ok(Math.min(...mid) > 1 && (await domRows(p)) <= 45, `با اسکرول، ردیف‌های میانی بارگذاری شدند (از ${Math.min(...mid)} تا ${Math.max(...mid)})`)
  await scrollGrid(p, (el) => { el.scrollTop = el.scrollHeight })
  const end = await grid(p).locator('[role=row]').evaluateAll((rs) => rs.map((r) => Number(r.getAttribute('aria-rowindex'))))
  ok(Math.max(...end) === all && (await domRows(p)) <= 45, 'آخرین ردیف هم با اسکرول بارگذاری شد و تعداد DOM کم ماند')
  await scrollGrid(p, (el) => { el.scrollTop = 0 })

  // collapse all + toggle one branch
  await p.getByRole('button', { name: 'بستن همه' }).click(); await p.waitForTimeout(250)
  ok(await rowCount(p) === folded, '«بستن همه» به حالت پیش‌فرض برگشت')
  const firstPhase = grid(p).locator('[role=row]').first()
  await firstPhase.getByRole('button', { name: 'بستن' }).click(); await p.waitForTimeout(200)
  const shut = await rowCount(p)
  ok(shut < folded, 'بستن یک Phase زیرشاخه‌هایش را پنهان کرد')
  await firstPhase.getByRole('button', { name: 'باز کردن' }).click(); await p.waitForTimeout(200)
  ok(await rowCount(p) === folded, 'باز کردن دوباره‌ی همان Phase')

  // supervision group
  const supBtn = p.getByRole('button', { name: 'گروه نظارت و اجرا در Gantt' })
  ok(await supBtn.getAttribute('aria-pressed') === 'true', 'گروه «نظارت و اجرا» پیش‌فرض نمایش داده می‌شود')
  await scrollGrid(p, (el) => { el.scrollTop = el.scrollHeight })
  ok(await grid(p).locator('[role=row]:has-text("نظارت و اجرا")').count() === 1, 'ردیف گروه نظارت و اجرا در Gantt پروژه هست')
  const withSup = await rowCount(p)
  await supBtn.click(); await p.waitForTimeout(200)
  ok(await rowCount(p) < withSup && !(await grid(p).locator('[role=row]:has-text("نظارت و اجرا")').count()), 'گروه نظارت و اجرا پنهان شد')
  await supBtn.click(); await p.waitForTimeout(200)
  await scrollGrid(p, (el) => { el.scrollTop = 0 })

  // unscheduled tasks
  const unBtn = p.getByRole('button', { name: /زمان‌بندی‌نشده پنهان است/ })
  const hidden = num(await unBtn.innerText())
  ok(hidden > 0, `${hidden} تسک بدون تاریخ پنهان و شمارش شده است`)
  await p.getByRole('button', { name: 'باز کردن همه' }).click(); await p.waitForTimeout(200)
  const beforeUn = await rowCount(p)
  await unBtn.click(); await p.waitForTimeout(250)
  ok(await rowCount(p) === beforeUn + hidden, 'نمایش زمان‌بندی‌نشده‌ها همان تعداد ردیف اضافه کرد')
  await p.getByRole('button', { name: 'پنهان کردن زمان‌بندی‌نشده‌ها' }).click(); await p.waitForTimeout(200)
  ok(await rowCount(p) === beforeUn, 'دوباره پنهان شدند')

  // scales
  const width = () => grid(p).evaluate((el) => el.firstElementChild.getBoundingClientRect().width)
  const wWeek = await width()
  await p.getByRole('tab', { name: 'روز' }).click(); await p.waitForTimeout(300)
  const wDay = await width()
  await p.screenshot({ path: SHOTS + 'gantt-day.png' })
  await p.getByRole('tab', { name: 'ماه' }).click(); await p.waitForTimeout(300)
  const wMonth = await width()
  await p.screenshot({ path: SHOTS + 'gantt-month.png' })
  ok(wDay > wWeek && wWeek > wMonth, 'مقیاس روز / هفته / ماه عرض محور زمان را تغییر می‌دهد')
  ok(await grid(p).locator('text=آبان').count() > 0, 'ماه‌های شمسی در سرستون')
  await p.getByRole('tab', { name: 'هفته' }).click(); await p.waitForTimeout(300)

  // a bar outside the visible window gets an edge arrow that scrolls to it
  const hint = grid(p).getByRole('button', { name: /نوار این ردیف در گذشته است/ }).first()
  ok(await hint.count() === 1, 'برای نوارهای خارج از دید، فلش لبه نمایش داده می‌شود')
  const hintRow = await hint.evaluate((el) => el.closest('[role=row]').getAttribute('aria-rowindex'))
  const sl0 = await grid(p).evaluate((el) => el.scrollLeft)
  await hint.click(); await p.waitForTimeout(700)
  const sl1 = await grid(p).evaluate((el) => el.scrollLeft)
  ok(sl1 !== sl0 && !(await grid(p).locator(`[role=row][aria-rowindex="${hintRow}"] button[aria-label*="نوار این ردیف"]`).count()), 'فلش، محور زمان را تا نوار آن ردیف جابه‌جا کرد')
  await p.getByRole('button', { name: 'امروز' }).click(); await p.waitForTimeout(500)

  // hover details
  const bar = grid(p).locator('[data-bar=plan]').first()
  await bar.hover(); await p.waitForTimeout(150)
  const tip = p.locator('[role=tooltip]')
  ok(await tip.count() === 1 && (await tip.innerText()).includes('برنامه') && (await tip.innerText()).includes('پیشرفت'), 'جزئیات با نگه داشتن نشانگر روی نوار')
  await p.screenshot({ path: SHOTS + 'gantt-week.png' })

  // view-only: clicking a bar opens the task page
  const barRow = await bar.evaluate((el) => el.closest('[role=row]').getAttribute('aria-rowindex'))
  const before = await rowCount(p)
  await bar.click(); await p.waitForTimeout(500)
  ok(await p.locator('#task-drawer-scroll').count() === 1, 'کلیک روی نوار صفحه‌ی تسک را باز کرد')
  ok(await rowCount(p) === before, 'Gantt فقط نمایشی است (کلیک چیزی را تغییر نداد)')
  const succName = (await p.locator('#task-drawer-scroll h2').first().innerText()).trim()

  // dependency entered by hand in section C shows as a link
  ok(await grid(p).locator('svg path[data-violated]').count() === 0, 'پیش از ثبت، پیوند پیش‌نیازی وجود ندارد')
  await p.locator('#c-add-dep').scrollIntoViewIfNeeded()
  await p.locator('#c-add-dep').click(); await p.waitForTimeout(200)
  await p.getByRole('option').first().click(); await p.waitForTimeout(250)
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  const links = grid(p).locator('svg path[data-violated]')
  ok(await links.count() === 1, `پیش‌نیاز ثبت‌شده در بخش C به‌صورت فلش در Gantt آمد («${succName}»)`)
  const v = await links.first().getAttribute('data-violated')
  const stroke = await links.first().getAttribute('stroke')
  ok((v === 'true') === stroke.includes('status-critical'), `رنگ پیوند با وضعیت هم‌خوان است (${v === 'true' ? 'قرمز: شروع قبل از پایان پیش‌نیاز' : 'عادی'})`)
  ok(await grid(p).locator(`[role=row][aria-rowindex="${barRow}"]`).count() === 1, 'ردیف تسک بعد از بستن صفحه سر جایش است')
  await p.close()

  console.log('عضو — کارهای من')
  p = await open()
  await login(p, 's.rezaei')
  await p.getByRole('tab', { name: 'Gantt' }).first().click(); await p.waitForTimeout(400)
  ok(await grid(p).count() === 1, 'Gantt در «کارهای من» هم هست')
  const projRows = await grid(p).locator('[role=row]').evaluateAll((rs) => rs.filter((r) => / — /.test(r.innerText)).length)
  ok(projRows >= 1, 'کارهای چند پروژه زیر سرگروه پروژه')
  ok(!(await p.locator('#c-add-dep').count()), 'هیچ کنترل ویرایشی در Gantt نیست')
  await p.close()

  console.log('تیره و موبایل')
  p = await open('dark')
  await login(p, 'n.rahimi')
  await p.locator('aside >> text=برج مسکونی بابلسر').first().click(); await p.waitForTimeout(400)
  await p.getByRole('tab', { name: 'Gantt' }).click(); await p.waitForTimeout(500)
  await grid(p).scrollIntoViewIfNeeded()
  await p.screenshot({ path: SHOTS + 'gantt-dark.png' })
  ok(await grid(p).count() === 1, 'حالت تیره')
  await p.close()

  p = await open('light', { width: 390, height: 844 })
  await login(p, 'n.rahimi')
  await p.getByRole('button', { name: 'منو', exact: true }).click(); await p.waitForTimeout(800)
  await p.getByRole('dialog').locator('text=برج مسکونی بابلسر').first().click(); await p.waitForTimeout(500)
  await p.getByRole('tab', { name: 'Gantt' }).click(); await p.waitForTimeout(500)
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(overflow <= 1, `در موبایل صفحه اسکرول افقی ندارد (${overflow})`)
  const nw = await grid(p).locator('[role=row]').first().locator('div').first().evaluate((el) => el.getBoundingClientRect().width)
  ok(nw <= 152, 'ستون نام در موبایل باریک‌تر است')
  await grid(p).scrollIntoViewIfNeeded()
  await p.screenshot({ path: SHOTS + 'gantt-mobile.png' })
  await p.close()

  ok(errs.length === 0, 'بدون خطای صفحه' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await b.close()
  console.log(`\n${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})()
