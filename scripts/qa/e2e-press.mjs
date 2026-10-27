// Press conference walkthrough (pre-match and post-match). node scripts/qa/e2e-press.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-press'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 300) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const bottom = () => page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = s.scrollHeight })
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(2).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForSelector('text=Play match', { timeout: 20000 })
await page.locator('.md-act', { hasText: 'Press' }).click()
await shot('press-typing', 700)
for (let q = 0; q < 6; q++) {
  await page.waitForSelector('.btn.answer', { timeout: 8000 }).catch(() => {})
  if (!(await page.locator('.btn.answer').count())) break
  await bottom(); await shot(`press-q${q + 1}`, 200)
  await page.locator('.btn.answer').first().click()
  await page.waitForTimeout(400)
}
await bottom(); await shot('press-summary', 600)
await page.getByText('Done').click()
await page.getByText('Quick sim').click()
await page.waitForSelector('text=Full-time', { timeout: 30000 })
await page.locator('.md-footer .btn', { hasText: 'Press' }).click()
for (let q = 0; q < 6; q++) {
  await page.waitForSelector('.btn.answer', { timeout: 8000 }).catch(() => {})
  if (!(await page.locator('.btn.answer').count())) break
  await bottom(); await shot(`post-q${q + 1}`, 200)
  await page.locator('.btn.answer').nth(1).click()
  await page.waitForTimeout(400)
}
await bottom(); await shot('post-summary', 600)
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
