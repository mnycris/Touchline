// TOTW, club overview and half-time assistant notes. node scripts/qa/mini-features.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const back = async () => { const b = page.locator('.topbar .iconbtn[aria-label="Back"]'); if (await b.count()) await b.last().click(); await page.waitForTimeout(250) }
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.nc-club').nth(5).click()
await page.getByRole('button', { name: /Take the job/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Sign the contract').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
let played = 0
for (let i = 0; i < 30 && played < 3; i++) {
  if (await page.getByText('Play match').count()) {
    if (played === 2) break
    await page.getByText('Quick sim').click(); await page.waitForSelector('text=Full-time', { timeout: 30000 }); await page.locator('.md-footer .btn.primary').click(); await page.waitForTimeout(300); played++; continue
  }
  const b = page.locator('.continue-btn'); if (!(await b.count())) { await back(); continue }
  await b.click(); await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
// live to half-time for assistant notes
if (await page.getByText('Play match').count()) {
  await page.getByText('Play match').click(); await page.waitForSelector('.lp', { timeout: 20000 })
  await page.getByText('To half-time').click(); await page.waitForTimeout(800)
  await page.evaluate(() => { const b = document.querySelector('.match-body'); if (b) b.scrollTop = 0 })
  await shot('halftime-notes')
  await page.getByText('Sim to end').click(); await page.getByText('Full-time · Continue').click(); await page.locator('.md-footer .btn.primary').click()
}
await page.locator('.navitem', { hasText: 'Season' }).click()
await page.locator('.screen .card.tap').first().click()
await page.locator('.tab', { hasText: 'Stats' }).first().click()
await shot('totw')
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 700 })
await shot('totw-2')
await page.locator('.tab', { hasText: 'Table' }).first().click()
await page.locator('.tbl tbody tr').nth(1).click()
await shot('club-overview')
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 800 })
await shot('club-overview-2')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
