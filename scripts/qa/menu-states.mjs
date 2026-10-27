// The main menu as a player meets it: the first launch (no careers), then with careers saved (imported), the Load
// list, a career's checkpoints, Settings, and Data & Credits; and the menu's entrance frame by frame.
// node scripts/qa/menu-states.mjs <out-dir> <save.touchline> [<save2.touchline>]   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
const [OUT = '/tmp/opus-menu', ...SAVES] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|wikipedia/.test(m.text())) errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const hold = async (name, times = [60, 200, 400, 800]) => {
  for (const t of times) {
    await page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t } }, t)
    await page.waitForTimeout(50)
    await page.screenshot({ path: `${OUT}/${name}-${String(t).padStart(3, '0')}.png` })
  }
  await page.evaluate(() => { for (const a of document.getAnimations()) a.play() })
}
await page.goto('http://localhost:5173/')
await hold('enter-fresh')
await shot('fresh', 1500)
// careers saved: imported through Load
for (const f of SAVES) {
  await page.locator('button', { hasText: /^\s*Load/ }).first().click()
  await page.waitForTimeout(400)
  await page.setInputFiles('input[type=file]', f)
  await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
  await page.waitForTimeout(600)
  await page.locator('[aria-label="Back"], .iconbtn').first().click()
  await page.waitForTimeout(600)
}
if (SAVES.length) {
  await page.reload()
  await hold('enter-saves')
  await shot('saves', 1500)
  await page.locator('button', { hasText: /^\s*Load/ }).first().click()
  await shot('load', 900)
  await page.locator('.save-actions .btn', { hasText: 'Checkpoints' }).first().click()
  await shot('load-checkpoints', 900)
  await page.locator('[aria-label="Back"], .iconbtn').first().click()
  await page.waitForTimeout(500)
}
await page.locator('button', { hasText: /Settings/ }).first().click()
await shot('settings', 900)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 900 })
await shot('settings-2', 400)
await page.locator('[aria-label="Back"], .iconbtn').first().click()
await page.waitForTimeout(500)
await page.getByText(/Data sources & credits/).click()
await shot('about', 900)
await page.locator('[aria-label="Back"], .iconbtn').first().click()
await shot('back-home', 700)
// pressing Continue: the career loading
if (SAVES.length) {
  await page.locator('.continue-card').click()
  await shot('continue-pressed', 120)
  await page.waitForSelector('.continue-btn', { timeout: 90000 })
  await shot('continued', 900)
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
