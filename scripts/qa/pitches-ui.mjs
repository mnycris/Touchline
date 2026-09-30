// Every pitch surface in one run: tactics board, match-day line-ups, live pitch, manage (subs + shape).
// Needs the dev server: node scripts/qa/pitches-ui.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-pitches'; fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(2).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.evaluate(() => window.__game.getState().go({ name: 'tactics' }))
await shot('tactics', 800)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 420 })
await shot('tactics-2')
await page.evaluate(() => window.__game.getState().back?.())
for (let i = 0; i < 20; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForSelector('text=Play match', { timeout: 20000 })
await page.locator('.tab', { hasText: 'Line-ups' }).first().click().catch(() => {})
await shot('matchday-lineups', 600)
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.getByText('To half-time').click()
await page.waitForTimeout(700)
await shot('live-ht')
await page.locator('.match-controls button', { hasText: /manage/i }).first().click()
await shot('manage-subs', 600)
await page.getByText('Shape').click()
await shot('manage-shape', 500)
console.log(JSON.stringify({ errors }))
await browser.close()
