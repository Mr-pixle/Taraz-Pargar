// v15 end-to-end checks (Playwright, Chromium): Finance space and Administrative space as two separate spaces,
// and every value sitting exactly under its own label/heading with the v14 field layout, in every task kind and table.
const { chromium } = require('playwright')
const path = require('path')
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots') + '/'
require('fs').mkdirSync(SHOTS, { recursive: true })
const PAGE = process.env.PAGE || 'file://' + path.resolve(__dirname, '../dist/preview.html')
let pass = 0, fail = 0
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }

// Right (or left) edge of every label's text vs. its value's text; and of every table header vs. its cells
const MEASURE = `(() => {
  const rect = (el) => { const g = document.createRange(); g.selectNodeContents(el); return g.getBoundingClientRect() }
  window.__labelGaps = (root) => {
    const out = []
    for (const dd of root.querySelectorAll('dd')) {
      const dt = dd.previousElementSibling
      if (!dt || dt.tagName !== 'DT') continue
      const a = rect(dt), b = rect(dd)
      if (!a.width || !b.width) continue
      out.push({ label: dt.textContent.trim(), gap: Math.round(Math.abs(a.right - b.right)) })
    }
    return out
  }
  window.__columnGaps = (table, rows = 6) => {
    const ths = [...table.querySelectorAll('thead tr:last-child th')]
    const out = []
    const trs = [...table.querySelectorAll('tbody tr')].slice(0, rows)
    ths.forEach((th, i) => {
      const a = rect(th); if (!a.width) return
      const al = getComputedStyle(th).textAlign
      const rtl = getComputedStyle(th).direction === 'rtl'
      const byLeft = rtl ? (al === 'end' || al === 'left') : !(al === 'end' || al === 'right')
      let worst = 0
      for (const tr of trs) {
        const td = tr.children[i + (tr.children.length - ths.length)]; if (!td) continue
        const b = rect(td); if (!b.width) continue
        worst = Math.max(worst, Math.round(Math.abs(byLeft ? a.left - b.left : a.right - b.right)))
      }
      out.push({ label: th.textContent.trim(), gap: worst })
    })
    return out
  }
})()`

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (hash = '', scheme = 'light', vp = { width: 1366, height: 900 }) => {
    const p = await b.newPage({ viewport: vp, colorScheme: scheme })
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(PAGE + hash); await p.waitForTimeout(300)
    await p.evaluate(MEASURE)
    return p
  }
  const login = async (p, u) => {
    if (await p.getByLabel('پروفایل', { exact: true }).count()) { await p.getByLabel('پروفایل', { exact: true }).click(); await p.getByRole('menuitem', { name: 'خروج' }).click(); await p.waitForTimeout(150) }
    await p.fill('#li-user', u); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(450)
  }
  const nav = (p, name) => p.locator('aside nav').getByRole('button', { name }).first().click().then(() => p.waitForTimeout(350))
  // label of each menu item without its badge number
  const navHas = async (p, name) => (await p.locator('aside nav button > span.flex-1').allInnerTexts()).map((x) => x.trim()).includes(name)
  const bad = (gaps) => gaps.filter((g) => g.gap > 2)
  const fmt = (gaps) => gaps.map((g) => `${g.label}:${g.gap}px`).join('، ')

  // ---------------- 1-2. Two separate spaces ----------------
  console.log('۱ و ۲. فضای مالی و فضای اداری — جدا')
  let p = await open()
  await login(p, 'ceo')
  ok(await navHas(p, 'فضای مالی و اداری'), 'مدیرعامل: «فضای مالی و اداری» در منو')
  await nav(p, 'فضای مالی و اداری')
  const tabs = (await p.locator('[role=tablist][aria-label="فضاهای بخش مالی و اداری"] [role=tab]').allInnerTexts()).map((x) => x.trim())
  ok(tabs.join('|') === 'فضای مالی|فضای اداری (مدیریتی)', `مدیرعامل هر دو فضا را دارد: ${tabs.join(' و ')}`)
  ok(await p.locator('h1:has-text("فضای مالی")').count() && await p.locator('[data-space="finance"] [data-person]').count() === 2, 'فضای مالی: کارت مدیرعامل و مدیر مالی')
  const finRows = await p.locator('[data-space="finance"] table tbody tr').allInnerTexts()
  ok(finRows.length === 5 && finRows.some((x) => x.includes('بستن حساب‌های فصل پاییز')) && !finRows.some((x) => x.includes('تمدید قرارداد اجاره')), `فضای مالی فقط Taskهای مالی (${finRows.length})`)
  await p.locator('#fin-tab-office').click(); await p.waitForTimeout(300)
  const offRows = await p.locator('[data-space="office"] table tbody tr').allInnerTexts()
  ok(await p.locator('h1:has-text("فضای اداری (مدیریتی)")').count() && offRows.length === 5 && offRows.some((x) => x.includes('تمدید قرارداد اجاره')) && !offRows.some((x) => x.includes('بستن حساب‌ها')), `فضای اداری فقط Taskهای اداری (${offRows.length})`)
  ok(await p.locator('[data-space="office"] [data-person="m.tavana"]').count() && !(await p.locator('[data-space="office"] [data-person="f.sadri"]').count()), 'فضای اداری: کارت مدیرعامل و مدیر اداری (بدون مدیر مالی)')
  await p.getByRole('button', { name: 'Task تازه' }).click(); await p.waitForTimeout(250)
  ok((await p.getByRole('dialog').innerText()).includes('فضای اداری (مدیریتی)'), 'فرم Task تازه در فضای اداری ثبت می‌کند')
  await p.locator('#fa-assignee').click()
  const offPool = (await p.getByRole('option').allInnerTexts()).map((x) => x.trim()).filter((x) => x && x !== 'بعداً ارجاع می‌دهم')
  ok(offPool.length === 1 && offPool[0].includes('مریم توانا'), `مسئول Task اداری فقط از افراد فضای اداری: ${offPool.join('، ')}`)
  await p.getByRole('option', { name: 'مریم توانا' }).click()
  await p.fill('#fa-name', 'آزمون v15: تمدید قرارداد خدمات نظافت')
  await p.getByRole('button', { name: 'ثبت Task' }).click(); await p.waitForTimeout(300)
  ok(await p.locator('[data-space="office"] tr', { hasText: 'آزمون v15: تمدید قرارداد خدمات نظافت' }).count(), 'Task در فضای اداری ثبت شد')
  await p.locator('#fin-tab-finance').click(); await p.waitForTimeout(250)
  ok(!(await p.locator('tr', { hasText: 'آزمون v15: تمدید قرارداد خدمات نظافت' }).count()), 'و در فضای مالی دیده نمی‌شود')
  await login(p, 'm.tavana')
  ok(await navHas(p, 'فضای اداری') && !(await navHas(p, 'فضای مالی و اداری')) && !(await navHas(p, 'فضای مالی')), 'مدیر اداری: «فضای اداری» در منو')
  await nav(p, 'فضای اداری')
  ok(!(await p.locator('[role=tablist][aria-label="فضاهای بخش مالی و اداری"]').count()) && await p.locator('h1:has-text("فضای اداری (مدیریتی)")').count(), 'مدیر اداری فقط فضای اداری را می‌بیند')
  ok(await p.locator('tr', { hasText: 'آزمون v15: تمدید قرارداد خدمات نظافت' }).count() && !(await p.locator('text=بستن حساب‌های فصل پاییز').count()), 'Task تازه‌ی مدیرعامل را می‌بیند؛ هیچ Task مالی نمی‌بیند')
  await login(p, 'f.sadri')
  ok(await navHas(p, 'فضای مالی') && !(await navHas(p, 'فضای اداری')), 'مدیر مالی: «فضای مالی» در منو')
  await nav(p, 'فضای مالی')
  ok(await p.locator('h1:has-text("فضای مالی")').count() && !(await p.locator('text=تمدید قرارداد اجاره').count()) && !(await p.locator('text=آزمون v15').count()), 'مدیر مالی فقط فضای مالی را می‌بیند')
  await p.close()
  for (const [u, hash, msg] of [['m.tavana', '#finadmin-finance', 'فضای مالی فقط برای مدیرعامل و مدیر مالی است'], ['f.sadri', '#finadmin-office', 'فضای اداری فقط برای مدیرعامل و مدیر اداری است'], ['n.rahimi', '#finadmin-finance', 'فضای مالی و اداری فقط برای مدیرعامل'], ['b.sepehri', '#finadmin-office', 'فضای مالی و اداری فقط برای مدیرعامل']]) {
    p = await open(hash)
    await login(p, u)
    ok(await p.locator(`text=${msg}`).count() && !(await p.locator('table').count()), `${u} با آدرس مستقیم ${hash} به آن فضا نمی‌رسد`)
    await p.close()
  }

  // ---------------- 3. v14 field layout, every value under its label ----------------
  console.log('۳. چیدمان فیلدها و تراز هر مقدار زیر عنوان خودش')
  p = await open('#project-bbt')
  await login(p, 'n.rahimi')
  await p.getByRole('tab', { name: 'لیست' }).first().click(); await p.waitForTimeout(300)
  const listGaps = await p.evaluate(() => window.__columnGaps(document.querySelector('main table')))
  ok(!bad(listGaps).length, `فهرست تسک‌های پروژه: هر مقدار زیر سرستون خودش (${fmt(listGaps)})`)
  const checkDrawer = async (kind, expect) => {
    const sec = async (id) => (await p.locator(`#sec-${id}`).count()) ? await p.locator(`#sec-${id}`).innerText() : ''
    const titles = await p.locator('#task-drawer-scroll section h3').allInnerTexts()
    ok(titles.map((x) => x.replace(/^[A-F]\s*/, '').trim()).join('|') === 'شناسه و طبقه‌بندی|افراد|زمان‌بندی و برآورد|وضعیت و پیشرفت|بررسی و پیوست|گفتگو و تاریخچه', `${kind}: شش بخش با همان نام‌ها و ترتیب نسخه‌ی ۱۴`)
    const [A, B, C, D] = [await sec('a'), await sec('b'), await sec('c'), await sec('d')]
    for (const [where, txt, list] of [['A', A, expect.a ?? []], ['C', C, expect.c ?? []], ['D', D, expect.d ?? []]]) {
      ok(list.every((x) => txt.includes(x)), `${kind}: ${list.join('، ') || '—'} در بخش ${where}`)
    }
    ok(['Package', 'Floor'].every((x) => !C.includes(x) && !D.includes(x)) && !A.includes('Weight') && !A.includes('Plan Issue Date') && (B.match(/مسئول/g) ?? []).length >= 1 && !C.includes('مسئول (تیم یا نفر)'), `${kind}: هیچ فیلدی بیرون از بخش خودش یا تکراری نیست`)
    const gaps = await p.evaluate(() => window.__labelGaps(document.getElementById('task-drawer-scroll')))
    ok(gaps.length >= (expect.pairs ?? 3) && !bad(gaps).length, `${kind}: ${gaps.length} مقدار، هر کدام دقیقاً زیر عنوان خودش (${fmt(gaps)})`)
    await p.screenshot({ path: SHOTS + `v15-drawer-${expect.shot}.png` })
    await p.keyboard.press('Escape'); await p.waitForTimeout(250)
  }
  await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(450)
  await checkDrawer('سند MDR', { a: ['Doc Number', 'منبع', 'Package', 'Floor'], c: ['Estimation', 'Start', 'Due Date', 'Plan Issue Date'], d: ['Weight', 'W.F', 'Actual Start'], pairs: 9, shot: 'doc' })
  await p.fill('main input[id$="-q"]', 'رندر داخلی لابی'); await p.waitForTimeout(250)
  await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(450)
  await checkDrawer('زیرتسک دستی', { a: ['Doc Number', 'منبع', 'Package', 'Floor', 'دستی'], c: ['Estimation', 'Start', 'Due Date'], d: ['W.F', 'Actual Start'], pairs: 7, shot: 'manual' })
  await nav(p, 'نظارت و اجرا')
  await p.getByRole('tab', { name: 'فهرست' }).click(); await p.waitForTimeout(250)
  const supGaps = await p.evaluate(() => window.__columnGaps(document.querySelector('main table')))
  ok(!bad(supGaps).length, `فهرست موارد نظارتی: تراز سرستون‌ها (${fmt(supGaps)})`)
  await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(450)
  await checkDrawer('مورد نظارتی', { a: ['منبع', 'نظارت و اجرا', 'محل در کارگاه'], c: ['Estimation', 'Start', 'Due Date'], d: ['W.F', 'Actual Start'], pairs: 4, shot: 'sup' })
  await nav(p, 'فضای تیم')
  const tsoGaps = await p.evaluate(() => window.__columnGaps(document.querySelector('main table')))
  ok(!bad(tsoGaps).length, `پایش تسک‌های همه‌ی تیم‌ها: تراز سرستون‌ها (${fmt(tsoGaps)})`)
  await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(450)
  await checkDrawer('تسک تیم', { a: ['منبع', 'فضای تیم', 'پروژه‌ی داخلی'], c: ['Estimation', 'Start', 'Due Date'], d: ['W.F', 'Actual Start'], pairs: 4, shot: 'internal' })
  await nav(p, 'مدیریت')
  const userGaps = await p.evaluate(() => window.__columnGaps(document.querySelector('main table'), 10))
  ok(!bad(userGaps).length, `جدول کاربران (نام کاربری لاتین): تراز سرستون‌ها (${fmt(userGaps)})`)
  await nav(p, 'اجراهای Sync')
  const sheet = await p.evaluate(() => { const t = [...document.querySelectorAll('main table')].find((x) => x.innerText.includes('Plan Issue Date')); return t ? window.__columnGaps(t, 8) : null })
  ok(sheet && !bad(sheet).length, `پیش‌نمایش ستون‌های MDR: Floor و Package و Document Number زیر سرستون خودشان (${sheet ? fmt(bad(sheet)) || 'همه ۰–۲px' : 'جدول پیدا نشد'})`)
  await p.close()
  p = await open('#finadmin-finance')
  await login(p, 'f.sadri')
  const faGaps = await p.evaluate(() => window.__columnGaps(document.querySelector('main table')))
  ok(!bad(faGaps).length, `فهرست فضای مالی: تراز سرستون‌ها (${fmt(faGaps)})`)
  await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(450)
  await checkDrawer('Task مالی', { a: ['منبع', 'فضای مالی'], c: ['Start', 'Due Date'], d: ['پیشرفت', 'Actual Start'], pairs: 4, shot: 'fin' })
  await p.close()
  // dark + mobile: same alignment
  const m = await open('#project-bbt', 'dark', { width: 390, height: 844 })
  await login(m, 'n.rahimi')
  await m.getByRole('tab', { name: 'لیست' }).first().click(); await m.waitForTimeout(300)
  await m.locator('main table tbody tr').first().click(); await m.waitForTimeout(450)
  const mg = await m.evaluate(() => window.__labelGaps(document.getElementById('task-drawer-scroll')))
  ok(mg.length >= 9 && !bad(mg).length, `موبایل و تم تاریک: هر مقدار زیر عنوان خودش (${mg.length} مقدار)`)
  await m.screenshot({ path: SHOTS + 'v15-drawer-mobile-dark.png' })
  await m.close()

  ok(errs.length === 0, `بدون خطای صفحه${errs.length ? `: ${errs.join(' | ')}` : ''}`)
  await b.close()
  console.log(`\n${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})()
