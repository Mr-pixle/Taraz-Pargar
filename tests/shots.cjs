const { chromium } = require('playwright')
const path = require('path')
const D = process.env.SHOTS || require('path').resolve(__dirname, '.out/shots') + '/'
require('fs').mkdirSync(D, { recursive: true })
;(async () => {
  const b = await chromium.launch(); const errs = []
  for (const scheme of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme })
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('file://' + path.resolve(__dirname, '../dist/preview.html')); await p.waitForTimeout(300)
    await p.fill('#li-user', 'm.karami'); await p.fill('#li-pass', 'pargar1405'); await p.click('button[type=submit]'); await p.waitForTimeout(500)
    await p.screenshot({ path: D + `p1-${scheme}-home.png`, fullPage: false })
    await p.locator('text=منتظر بررسی من').scrollIntoViewIfNeeded()
    await p.screenshot({ path: D + `p1-${scheme}-home2.png` })
    await p.locator('section:has-text("منتظر بررسی من") li button').first().click(); await p.waitForTimeout(500)
    await p.screenshot({ path: D + `p1-${scheme}-doc-a.png` })
    await p.locator('#sec-c').scrollIntoViewIfNeeded(); await p.waitForTimeout(200)
    await p.screenshot({ path: D + `p1-${scheme}-doc-c.png` })
    await p.locator('#sec-e').scrollIntoViewIfNeeded(); await p.waitForTimeout(200)
    await p.screenshot({ path: D + `p1-${scheme}-doc-e.png` })
    await p.close()
  }
  console.log('errors', errs.length ? errs : 'none'); await b.close()
})()
