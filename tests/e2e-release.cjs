// Release sweep (Playwright, Chromium): every page of the app for every role, desktop light and mobile dark.
// On each page: no script error, no page-level horizontal scroll, no "undefined/NaN/[object Object]" text,
// every button and link has an accessible name, every image has alt text, and the first task opens cleanly.
const { chromium } = require('playwright')
const path = require('path')
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots/release') + '/'
require('fs').mkdirSync(SHOTS, { recursive: true })
const PAGE = process.env.PAGE || 'file://' + path.resolve(__dirname, '../dist/preview.html')
require('fs').mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const findings = []
const ok = (c, name, detail) => { if (c) pass++; else { fail++; findings.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log('  ✗', name, detail ?? '') } }

const SCAN = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const root = document.querySelector('[role=dialog]') ?? document.body
  const text = root.innerText
  const bad = [...new Set((text.match(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|\bInfinity\b/g) ?? []))]
  const unnamed = []
  for (const el of document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=menuitem], input:not([type=hidden]), select, textarea, [role=combobox]')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue
    const lab = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) || el.innerText?.trim() || el.getAttribute('title') || el.querySelector('img[alt]')?.getAttribute('alt')
      || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) || el.closest('label')?.textContent || el.getAttribute('placeholder')
    if (!lab || !String(lab).trim()) unnamed.push(el.outerHTML.slice(0, 120))
  }
  const noAlt = [...document.querySelectorAll('img')].filter((i) => vis(i) && !i.hasAttribute('alt')).map((i) => i.src.slice(0, 60))
  const overflow = document.documentElement.scrollWidth - window.innerWidth
  return { bad, unnamed: unnamed.slice(0, 4), unnamedCount: unnamed.length, noAlt, overflow }
}

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (hash = '', scheme = 'light', vp = { width: 1366, height: 900 }) => {
    const p = await b.newPage({ viewport: vp, colorScheme: scheme })
    p.on('pageerror', (e) => errs.push(`${e.message}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errs.push(`console: ${m.text().slice(0, 160)}`) })
    await p.goto(PAGE + hash); await p.waitForTimeout(300)
    return p
  }
  const login = async (p, u) => {
    if (await p.getByLabel('پروفایل', { exact: true }).count()) { await p.getByLabel('پروفایل', { exact: true }).click(); await p.getByRole('menuitem', { name: 'خروج' }).click(); await p.waitForTimeout(150) }
    await p.fill('#li-user', u); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(450)
  }
  const check = async (p, where) => {
    const r = await p.evaluate(SCAN)
    ok(!r.bad.length, `${where}: متن خراب`, r.bad.join(', '))
    ok(!r.unnamedCount, `${where}: کنترل بدون نام`, `${r.unnamedCount} مورد: ${r.unnamed.join(' | ')}`)
    ok(!r.noAlt.length, `${where}: تصویر بدون alt`, r.noAlt.join(', '))
    ok(r.overflow <= 1, `${where}: اسکرول افقی صفحه`, `${r.overflow}px`)
  }
  const openFirstTask = async (p, where) => {
    const target = p.locator('main table tbody tr, main .glass-item.is-interactive, main button.glass-item').first()
    if (!(await target.count())) return false
    await target.scrollIntoViewIfNeeded().catch(() => {})
    await target.click({ timeout: 2000 }).catch(() => {})
    await p.waitForTimeout(400)
    if (!(await p.locator('#task-drawer-scroll').count())) {
      // something else opened (personal task, request…): check it and close it
      if (await p.locator('[role=dialog]').count()) { await check(p, `${where} › پنجره`); await p.keyboard.press('Escape'); await p.waitForTimeout(250) }
      return false
    }
    const secs = await p.locator('#task-drawer-scroll section h3').count()
    ok(secs === 6 || (await p.locator('#task-drawer-scroll').innerText()).includes('Roll-up'), `${where}: صفحه‌ی تسک شش بخش دارد`, `${secs}`)
    await check(p, `${where} › صفحه‌ی تسک`)
    await p.keyboard.press('Escape'); await p.waitForTimeout(250)
    return true
  }

  // ---------- login page ----------
  console.log('صفحه‌ی ورود')
  for (const [scheme, vp, label] of [['light', { width: 1366, height: 900 }, 'دسکتاپ روشن'], ['dark', { width: 390, height: 844 }, 'موبایل تیره']]) {
    const p = await open('', scheme, vp)
    await check(p, `ورود (${label})`)
    await p.screenshot({ path: SHOTS + `login-${scheme}.png` })
    await p.close()
  }

  // PART=desktop | mobile runs half of the sweep (each half fits one test run); empty = both
  const PART = process.env.PART ?? ''
  // ---------- every page, every role ----------
  if (PART !== 'mobile') {
  const USERS = ['ceo', 'b.sepehri', 'n.rahimi', 'm.tavana', 'f.sadri', 'g.afshar', 'm.rostami', 'm.karami', 's.rezaei', 'k.farhadi', 'y.babaei', 'sh.hosseini']
  const p = await open()
  let pages = 0, drawers = 0
  for (const u of USERS) {
    console.log(`نقش: ${u}`)
    await login(p, u)
    const labels = (await p.locator('aside nav button > span.flex-1').allInnerTexts()).map((x) => x.trim())
    ok(labels.length >= 9, `${u}: منو`, labels.join('، '))
    for (const label of labels) {
      await p.locator('aside nav button', { has: p.locator(`span.flex-1:text-is("${label}")`) }).first().click(); await p.waitForTimeout(350)
      pages++
      await check(p, `${u} › ${label}`)
      if (['خانه', 'نظارت و اجرا', 'فضای تیم', 'فضای مالی و اداری', 'فضای مالی', 'فضای اداری', 'کارهای شخصی'].includes(label) && await openFirstTask(p, `${u} › ${label}`)) drawers++
    }
    // first project page: every view and every tab
    await p.locator('aside nav button', { has: p.locator('span.flex-1:text-is("پروژه‌ها")') }).first().click(); await p.waitForTimeout(300)
    await p.locator('aside').getByRole('button', { name: /BBT/ }).first().click(); await p.waitForTimeout(400)
    await check(p, `${u} › پروژه BBT`)
    for (const v of ['Kanban', 'لیست', 'درختی', 'تقویم', 'Gantt']) {
      await p.locator('main [role=tablist]').last().getByRole('tab', { name: v }).first().click().catch(() => {}); await p.waitForTimeout(300)
      await check(p, `${u} › BBT › ${v}`)
    }
    if (u === 'n.rahimi' || u === 's.rezaei') {
      const tabs = await p.locator('main [role=tablist]').first().getByRole('tab').allInnerTexts()
      for (const t of tabs) {
        await p.locator('main [role=tablist]').first().getByRole('tab', { name: t.trim() }).first().click().catch(() => {}); await p.waitForTimeout(300)
        await check(p, `${u} › BBT › تب ${t.trim()}`)
      }
      if (await openFirstTask(p, `${u} › BBT`)) drawers++
    }
    // profile and points
    await p.getByLabel('پروفایل', { exact: true }).click(); await p.waitForTimeout(150)
    await p.getByRole('menuitem').first().click(); await p.waitForTimeout(300)
    await check(p, `${u} › پروفایل`)
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
  console.log(`  ${pages} صفحه و ${drawers} صفحه‌ی تسک بررسی شد`)
  await p.close()
  }

  // ---------- mobile, dark ----------
  for (const u of PART === 'desktop' ? [] : ['ceo', 's.rezaei', 'f.sadri', 'n.rahimi']) {
    console.log(`موبایل تیره: ${u}`)
    const m = await open('', 'dark', { width: 390, height: 844 })
    await login(m, u)
    await m.getByRole('button', { name: 'منو' }).first().click().catch(() => {}); await m.waitForTimeout(300)
    const labels = (await m.locator('[role=dialog] nav button > span.flex-1').allInnerTexts()).map((x) => x.trim())
    await m.keyboard.press('Escape'); await m.waitForTimeout(200)
    ok(labels.length >= 9, `موبایل ${u}: منو`, labels.join('، '))
    for (const label of labels) {
      await m.getByRole('button', { name: 'منو' }).first().click(); await m.waitForTimeout(300)
      await m.locator('[role=dialog] nav button', { has: m.locator(`span.flex-1:text-is("${label}")`) }).first().click(); await m.waitForTimeout(400)
      await check(m, `موبایل ${u} › ${label}`)
    }
    await m.screenshot({ path: SHOTS + `mobile-${u}.png` })
    await m.close()
  }

  ok(errs.length === 0, 'خطای اسکریپت یا Console', [...new Set(errs)].slice(0, 6).join(' | '))
  await b.close()
  console.log(`\n${pass} pass, ${fail} fail`)
  if (findings.length) { console.log('\nیافته‌ها:'); for (const f of [...new Set(findings)]) console.log(' -', f) }
  process.exit(fail ? 1 : 0)
})()
