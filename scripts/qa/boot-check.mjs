// Loads a URL, reports page errors and whether the app rendered. node scripts/qa/boot-check.mjs <url> [shot]
import { chromium } from 'playwright'
const url = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
page.on('requestfailed', (r) => errs.push('failed: ' + r.url()))
await page.goto(url)
await page.waitForTimeout(4000)
const txt = await page.evaluate(() => document.body.innerText.slice(0, 200))
console.log('TEXT:', JSON.stringify(txt))
if (process.argv[3]) await page.screenshot({ path: process.argv[3] })
console.log(errs.slice(0, 15).join('\n') || 'no errors')
await browser.close()
