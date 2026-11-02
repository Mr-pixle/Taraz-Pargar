// v16 end-to-end checks (Playwright, Chromium): MDR shortcut on every project page (button + Alt+M),
// registering each project's own MDR link, and defining a project with its MDR.
const { chromium } = require('playwright')
const path = require('path')
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots') + '/'
require('fs').mkdirSync(SHOTS, { recursive: true })
const PAGE = process.env.PAGE || 'file://' + path.resolve(__dirname, '../dist/preview.html')
let pass = 0, fail = 0
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }
const BBT_MDR = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEF/edit#gid=1834'
const TJR_MDR = 'https://docs.google.com/spreadsheets/d/1TjRtJrTjRtJrTjRtJrTjRtJrTjRtJr0000000000/edit'

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } })
  // the sandbox has no route to Google: answer the MDR requests locally so the new tab can be inspected
  await ctx.route('https://docs.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>MDR</title>MDR' }))
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message))
  const login = async (u) => {
    if (await p.getByLabel('پروفایل', { exact: true }).count()) { await p.getByLabel('پروفایل', { exact: true }).click(); await p.getByRole('menuitem', { name: 'خروج' }).click(); await p.waitForTimeout(150) }
    await p.fill('#li-user', u); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(450)
  }
  const goProject = async (code) => { await p.locator('aside').getByRole('button', { name: new RegExp(code) }).first().click(); await p.waitForTimeout(350) }
  const toastHas = async (text) => (await p.locator('[data-sonner-toast]', { hasText: text }).count()) > 0
  await p.goto(PAGE); await p.waitForTimeout(300)

  console.log('ثبت لینک MDR (کنترل پروژه)')
  await login('n.rahimi')
  await goProject('BBT')
  ok(await p.locator('#mdr-set-BBT').count() && !(await p.locator('#mdr-link-BBT').count()), 'پروژه‌ی بدون لینک: دکمه‌ی «ثبت لینک MDR» برای کنترل پروژه')
  await p.click('#mdr-set-BBT'); await p.waitForTimeout(250)
  await p.fill('#mdr-url', 'https://example.com/sheet')
  ok(await p.getByRole('button', { name: 'ثبت لینک' }).isDisabled() && (await p.getByRole('dialog').innerText()).includes('این لینک Google Sheet نیست'), 'لینک غیر Google Sheet پذیرفته نمی‌شود')
  await p.fill('#mdr-url', BBT_MDR)
  await p.getByRole('button', { name: 'ثبت لینک' }).click(); await p.waitForTimeout(300)
  const a = p.locator('#mdr-link-BBT')
  ok(await a.count() && await a.getAttribute('href') === BBT_MDR && await a.getAttribute('target') === '_blank' && (await a.getAttribute('rel')).includes('noopener'), 'دکمه‌ی «MDR پروژه» به لینک MDR همین پروژه وصل شد (برگه‌ی تازه)')
  ok((await a.innerText()).includes('MDR پروژه') && (await a.getAttribute('aria-label')).includes('Alt+M'), 'میانبر Alt+M روی دکمه نوشته شده است')
  await p.screenshot({ path: SHOTS + 'v16-e2e-project.png', clip: { x: 0, y: 0, width: 1366, height: 340 } })
  const [tab1] = await Promise.all([ctx.waitForEvent('page'), a.click()])
  await tab1.waitForLoadState().catch(() => {})
  ok(tab1.url() === BBT_MDR, `کلیک: MDR در برگه‌ی تازه باز شد (${tab1.url().slice(0, 60)}…)`)
  await tab1.close()
  const [tab2] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('Alt+KeyM')])
  await tab2.waitForLoadState().catch(() => {})
  ok(tab2.url() === BBT_MDR, 'کلید میانبر Alt+M همان MDR را باز می‌کند')
  await tab2.close()
  await p.locator('main input[id$="-q"]').first().click()
  let extra = null
  ctx.once('page', (pg) => { extra = pg })
  await p.keyboard.press('Alt+KeyM'); await p.waitForTimeout(500)
  ok(!extra, 'هنگام تایپ در یک فیلد، Alt+M کاری نمی‌کند')
  await p.locator('main h1').click()

  console.log('هر پروژه MDR خودش')
  await goProject('RNX')
  ok(await p.locator('#mdr-set-RNX').count() && !(await p.locator('#mdr-link-RNX').count()) && !(await p.locator('#mdr-link-BBT').count()), 'پروژه‌ی رونیکس لینک BBT را نشان نمی‌دهد')
  await p.keyboard.press('Alt+KeyM'); await p.waitForTimeout(300)
  ok(await toastHas('لینک MDR پروژه‌ی RNX ثبت نشده است'), 'Alt+M در پروژه‌ی بدون لینک پیام روشن می‌دهد و چیزی باز نمی‌کند')

  console.log('دیگر نقش‌ها')
  await login('s.rezaei')
  await goProject('BBT')
  ok(await p.locator('#mdr-link-BBT').getAttribute('href') === BBT_MDR && !(await p.getByRole('button', { name: /ویرایش لینک MDR/ }).count()), 'عضو تیم دکمه‌ی MDR را دارد ولی لینک را ویرایش نمی‌کند')
  await goProject('RNX')
  ok(await p.locator('main [role=note]', { hasText: 'لینک MDR ثبت نشده' }).count() && !(await p.locator('#mdr-set-RNX').count()), 'پروژه‌ی بدون لینک برای عضو: «لینک MDR ثبت نشده» (بدون دکمه‌ی ثبت)')

  console.log('تعریف پروژه با MDR خودش')
  await login('n.rahimi')
  await p.locator('aside nav').getByRole('button', { name: 'پروژه‌ها' }).click(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'تعریف پروژه' }).click(); await p.waitForTimeout(250)
  await p.fill('#np-code', 'TJR'); await p.fill('#np-name', 'مجتمع مسکونی تجریش')
  await p.getByRole('dialog').getByRole('button', { name: 'تعریف پروژه' }).click(); await p.waitForTimeout(300)
  ok(await toastHas('لینک MDR خود این پروژه را وارد کنید') && await p.getByRole('dialog').count(), 'بدون لینک MDR پروژه تعریف نمی‌شود')
  await p.fill('#np-url', TJR_MDR)
  await p.getByRole('dialog').getByRole('button', { name: 'تعریف پروژه' }).click(); await p.waitForTimeout(350)
  ok(await toastHas('پروژه‌ی TJR تعریف شد'), 'پروژه با لینک MDR خودش تعریف شد')
  await goProject('TJR')
  ok(await p.locator('h1:has-text("مجتمع مسکونی تجریش")').count() && await p.locator('#mdr-link-TJR').getAttribute('href') === TJR_MDR, 'صفحه‌ی پروژه‌ی تازه با دکمه‌ی MDR همان پروژه')
  await p.locator('aside nav').getByRole('button', { name: 'مدیریت' }).click(); await p.waitForTimeout(300)
  await p.getByRole('tab', { name: 'پروژه‌ها' }).click(); await p.waitForTimeout(250)
  ok(await p.locator('#mdr-link-BBT').count() && await p.locator('#mdr-link-TJR').count() && await p.locator('#mdr-set-RNX').count(), 'جدول پروژه‌ها در مدیریت: لینک MDR هر پروژه یا دکمه‌ی ثبت آن')

  console.log('موبایل')
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
  m.on('pageerror', (e) => errs.push(e.message))
  await m.goto(PAGE + '#project-bbt'); await m.waitForTimeout(300)
  await m.fill('#li-user', 'n.rahimi'); await m.fill('#li-pass', 'pargar1405'); await m.click('button[type=submit]'); await m.waitForTimeout(450)
  // the server version keeps the link registered above; the demo page starts fresh
  ok(await m.locator('#mdr-set-BBT, #mdr-link-BBT').first().isVisible() && await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'سرصفحه‌ی پروژه در موبایل بدون اسکرول افقی')
  await m.close()

  ok(errs.length === 0, `بدون خطای صفحه${errs.length ? `: ${errs.join(' | ')}` : ''}`)
  await b.close()
  console.log(`\n${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})()
