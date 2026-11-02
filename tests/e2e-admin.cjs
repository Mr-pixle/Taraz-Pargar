// Administrative module end-to-end checks (Playwright, Chromium)
const { chromium } = require('playwright')
const path = require('path')
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots') + '/'
require('fs').mkdirSync(SHOTS, { recursive: true })
const PAGE = process.env.PAGE || 'file://' + path.resolve(__dirname, '../dist/preview.html')
let pass = 0, fail = 0
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }
const num = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^0-9]/g, ''))

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (scheme = 'light', vp = { width: 1366, height: 900 }, hash = '') => {
    const p = await b.newPage({ viewport: vp, colorScheme: scheme, acceptDownloads: true })
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(PAGE + hash); await p.waitForTimeout(300)
    return p
  }
  const login = async (p, u) => {
    if (await p.getByLabel('پروفایل', { exact: true }).count()) { await p.getByLabel('پروفایل', { exact: true }).click(); await p.getByRole('menuitem', { name: 'خروج' }).click(); await p.waitForTimeout(150) }
    await p.fill('#li-user', u); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(400)
  }
  const nav = (p, name) => p.locator('aside nav').getByRole('button', { name }).first().click().then(() => p.waitForTimeout(350))
  const navHas = (p, name) => p.locator('aside nav').getByRole('button', { name }).count()
  const toastHas = async (p, text) => (await p.locator('[data-sonner-toast]', { hasText: text }).count()) > 0

  console.log('عضو تیم')
  const p = await open()
  await login(p, 's.rezaei')
  ok(await navHas(p, 'درخواست‌های من') && await navHas(p, /تایم‌شیت/), 'بخش «اداری» برای همه: درخواست‌ها و تایم‌شیت')
  ok(!(await navHas(p, /کارتابل/)) && !(await navHas(p, 'گزارش‌های اداری')), 'کارتابل و گزارش‌های اداری در منوی عضو نیست')
  const card = p.locator('section[aria-label="تایم‌شیت امروز"]')
  ok(await card.count() === 1, 'کارت تایم‌شیت امروز در خانه')
  await card.getByRole('button', { name: 'ثبت ورود' }).click(); await p.waitForTimeout(300)
  ok((await card.innerText()).includes('ورود') && !(await card.getByRole('button', { name: 'ثبت ورود' }).count()) && await card.getByRole('button', { name: 'ثبت خروج' }).count(), 'ورود امروز با یک کلیک ثبت شد')

  await nav(p, /تایم‌شیت/)
  ok(!(await p.locator('#ts-user').count()), 'عضو انتخاب کاربر دیگر را ندارد')
  ok(await p.locator('[role=grid][aria-label="تقویم تایم‌شیت"] [role=gridcell]').count() >= 29, 'نمای تقویمی ماه')
  const pending = p.locator('section[aria-label="اضافه‌کاری بدون تعیین تکلیف"]')
  ok(await pending.count() === 1, 'یادآوری اضافه‌کاری بدون تعیین تکلیف')
  const undecidedBefore = await pending.locator('li').count()
  await p.screenshot({ path: SHOTS + 'adm-timesheet.png', fullPage: true })
  // open the undecided day from the calendar
  await pending.locator('li button').first().click(); await p.waitForTimeout(350)
  const dlg = p.getByRole('dialog')
  ok(await dlg.locator('text=تعیین تکلیف نشده است').count() === 1, 'جزئیات روز: هشدار تعیین تکلیف')
  ok(await dlg.locator('text=کار خالص').count() && await dlg.locator('text=موظف').count(), 'جزئیات روز: کار خالص و موظف')
  await p.screenshot({ path: SHOTS + 'adm-day.png' })
  await dlg.getByRole('button', { name: 'درخواست اضافه‌کاری' }).click(); await p.waitForTimeout(350)
  const rq = p.getByRole('dialog')
  ok(await rq.getByRole('tab', { name: 'اضافه‌کاری' }).getAttribute('aria-selected') === 'true', 'فرم اضافه‌کاری با همان روز باز شد')
  ok((await rq.innerText()).includes('قابل درخواست'), 'مقدار قابل درخواست از تایم‌شیت')
  await rq.getByRole('button', { name: 'ثبت درخواست' }).click(); await p.waitForTimeout(400)
  ok(await toastHas(p, 'درخواست اضافه‌کاری'), 'درخواست اضافه‌کاری ثبت شد')
  ok(await p.locator('section[aria-label="اضافه‌کاری بدون تعیین تکلیف"] li').count() === undecidedBefore - 1, 'روز از فهرست «بدون تعیین تکلیف» بیرون رفت')

  // leave request straight from a future working day of the calendar
  // the last future Sunday–Tuesday of the month (or of next month), away from leaves already asked for
  const futureSel = '[role=gridcell].opacity-60:not([aria-label*="مرخصی"])'
  const pickable = async () => (await p.locator(futureSel).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).filter((l) => /^(یکشنبه|دوشنبه|سه‌شنبه) /.test(l))
  let labels = await pickable()
  if (labels.length < 3) { await p.getByRole('button', { name: 'ماه بعد' }).click(); await p.waitForTimeout(250); labels = await pickable() }
  for (const l of labels.reverse()) {
    await p.locator(`[role=gridcell][aria-label="${l}"]`).click(); await p.waitForTimeout(300)
    if (await p.getByRole('dialog').getByRole('button', { name: 'درخواست مرخصی برای این روز' }).count()) break
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
  await p.getByRole('dialog').getByRole('button', { name: 'درخواست مرخصی برای این روز' }).click(); await p.waitForTimeout(350)
  ok(await p.getByRole('dialog').getByRole('tab', { name: 'مرخصی' }).getAttribute('aria-selected') === 'true', 'فرم مرخصی از روی تقویم با همان روز باز شد')
  await p.screenshot({ path: SHOTS + 'adm-new-leave.png' })
  await p.getByRole('dialog').getByRole('button', { name: 'ثبت درخواست' }).click(); await p.waitForTimeout(400)
  ok(await toastHas(p, 'درخواست مرخصی'), 'درخواست مرخصی ثبت شد')

  await nav(p, 'درخواست‌های من')
  const rows = p.locator('main section.glass-card > button')
  const firstTwo = (await rows.nth(0).innerText()) + (await rows.nth(1).innerText())
  ok(firstTwo.includes('مرخصی') && firstTwo.includes('اضافه‌کاری') && (firstTwo.match(/در کارتابل مدیر اداری/g) || []).length === 2, 'هر دو درخواست با وضعیت «در کارتابل مدیر اداری»')
  const leaveNo = num((await rows.nth(0).locator('span.num').first().innerText()))
  const otNo = num((await rows.nth(1).locator('span.num').first().innerText()))
  await rows.nth(0).click(); await p.waitForTimeout(300)
  ok(await p.getByRole('dialog').getByRole('list', { name: 'مراحل درخواست' }).count() === 1 && await p.getByRole('dialog').getByRole('button', { name: 'پس گرفتن درخواست' }).count() === 1, 'جزئیات با مراحل و امکان پس گرفتن پیش از تصمیم')
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)

  console.log('مدیر اداری')
  await login(p, 'm.tavana')
  ok(await navHas(p, /کارتابل/) && await navHas(p, 'گزارش‌های اداری'), 'کارتابل و گزارش‌ها در منوی مدیر اداری')
  await nav(p, /کارتابل/)
  const findRow = (n) => p.locator('main section.glass-card > button').filter({ hasText: `#${String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])}` }).first()
  for (const n of [leaveNo, otNo]) {
    await findRow(n).click(); await p.waitForTimeout(300)
    if (n === otNo) ok(await p.locator('#rq-dec-min').count() === 1, 'مدیر اداری مقدار تأییدی اضافه‌کاری را می‌تواند کم کند')
    await p.getByRole('dialog').getByRole('button', { name: 'تأیید و ارجاع به مدیرعامل' }).click(); await p.waitForTimeout(350)
  }
  ok(!(await findRow(leaveNo).count()) && !(await findRow(otNo).count()), 'هر دو درخواست از کارتابل مدیر اداری رفت')
  await nav(p, 'گزارش‌های اداری')
  const tabs = p.locator('main [role=tablist]', { has: p.getByRole('tab', { name: 'ورود و خروج' }) })
  ok(await tabs.getByRole('tab', { name: 'عملیات اداری' }).count() === 1, 'عملیات اداری (بستن ماه، مرخصی مستقیم، قواعد) برای مدیر اداری')
  await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(300)
  ok(await p.locator('#ts-reason').count() === 1, 'مدیر اداری تایم‌شیت دیگران را با «دلیل اصلاح» ویرایش می‌کند')
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.getByRole('button', { name: 'Excel (CSV)' }).first().click()])
  ok(dl && (await dl.suggestedFilename()).endsWith('.csv'), 'خروجی CSV گزارش ورود و خروج')
  for (const t of ['ساعات کارکرد', 'اضافه‌کاری', 'درخواست‌ها', 'رسیدگی']) {
    await tabs.getByRole('tab', { name: t }).click(); await p.waitForTimeout(250)
    ok(await p.locator('main table').count() >= 1, `گزارش «${t}»`)
  }
  await p.screenshot({ path: SHOTS + 'adm-reports.png', fullPage: true })

  console.log('مدیرعامل')
  await login(p, 'ceo')
  await nav(p, /کارتابل/)
  for (const n of [leaveNo, otNo]) {
    await findRow(n).click(); await p.waitForTimeout(300)
    await p.getByRole('dialog').getByRole('button', { name: 'تأیید نهایی' }).click(); await p.waitForTimeout(350)
  }
  ok(!(await findRow(leaveNo).count()) && !(await findRow(otNo).count()), 'تأیید نهایی مدیرعامل')
  await nav(p, 'گزارش‌های اداری')
  ok(await p.getByRole('tab', { name: 'ورود و خروج' }).count() === 1 && !(await p.getByRole('tab', { name: 'عملیات اداری' }).count()), 'عملیات اداری فقط برای مدیر اداری')

  console.log('نتیجه برای عضو')
  await login(p, 's.rezaei')
  await nav(p, 'درخواست‌های من')
  const t2 = (await p.locator('main section.glass-card > button').nth(0).innerText()) + (await p.locator('main section.glass-card > button').nth(1).innerText())
  ok((t2.match(/تأیید نهایی/g) || []).length >= 2, 'هر دو درخواست «تأیید نهایی» شدند')
  await nav(p, 'اعلان‌ها')
  ok(await p.locator('main', { hasText: 'تأیید شد' }).count(), 'اعلان نتیجه به عضو رسید')
  await nav(p, /تایم‌شیت/)
  ok(await p.locator('[role=gridcell][aria-label*="مرخصی"]').count() >= 1, 'مرخصی تأییدشده در تقویم تایم‌شیت')

  console.log('دسترسی مستقیم با URL')
  const q = await open('light', { width: 1366, height: 900 }, '#adminreports')
  await login(q, 's.rezaei')
  ok(await q.locator('main', { hasText: 'گزارش‌های اداری فقط برای مدیرعامل، کنترل پروژه و مدیر اداری است' }).count() === 1, 'باز کردن مستقیم گزارش‌های اداری با URL رد شد')
  await q.close()
  const q2 = await open('light', { width: 1366, height: 900 }, '#inbox')
  await login(q2, 'n.rahimi')
  ok(await q2.locator('main', { hasText: 'کارتابل فقط برای مدیر اداری و مدیرعامل است' }).count() === 1, 'کنترل پروژه کارتابل تصمیم ندارد')
  await nav(q2, 'گزارش‌های اداری')
  ok(await q2.locator('main h1', { hasText: 'گزارش‌های اداری' }).count() === 1, 'کنترل پروژه گزارش‌های اداری را می‌بیند')
  await q2.close()

  console.log('موبایل و تیره')
  const m = await open('dark', { width: 390, height: 844 })
  await login(m, 's.rezaei')
  await m.getByRole('button', { name: 'منو', exact: true }).click(); await m.waitForTimeout(800)
  await m.getByRole('dialog').getByRole('button', { name: /تایم‌شیت/ }).click(); await m.waitForTimeout(500)
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over <= 1, `تایم‌شیت در موبایل اسکرول افقی صفحه ندارد (${over})`)
  await m.screenshot({ path: SHOTS + 'adm-mobile.png', fullPage: true })
  await m.locator('[role=gridcell]').nth(5).click(); await m.waitForTimeout(350)
  const over2 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(over2 <= 1, 'جزئیات روز در موبایل جا می‌شود')
  await m.screenshot({ path: SHOTS + 'adm-mobile-day.png' })
  await m.close()

  ok(errs.length === 0, 'بدون خطای صفحه' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await b.close()
  console.log(`\n${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})()
