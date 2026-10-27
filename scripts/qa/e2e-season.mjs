// Plays a whole season in the browser via Quick Sim and captures the season review.
import { chromium } from 'playwright'
import fs from 'node:fs'
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = process.env.OUT || '/tmp/opus-shots3'
fs.mkdirSync(OUT, { recursive: true })
const exe = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`))
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CONNECTION|ERR_FAILED|403/.test(m.text())) errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto(URL)
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Kai')
await page.fill('input[placeholder="Last name"]', 'Lund')
await page.getByText('Continue').first().click()
await page.getByText(process.env.LEAGUE || 'Premier League').first().click()
await page.locator('.club-card').nth(Number(process.env.CLUBIDX || 0)).click()
await page.getByRole('button', { name: /^Manage/ }).click()
await page.getByText('Continue').first().click()
await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
const t0 = Date.now()
let matches = 0, advances = 0, advMs = 0, maxAdv = 0
for (let i = 0; i < 400; i++) {
  if (await page.getByText('Season Review').count()) break
  if (await page.getByText('Play match').count()) {
    await page.getByText('Quick sim').click()
    await page.waitForSelector('text=Full-time', { timeout: 20000 })
    matches++
    if (matches % 10 === 1) await shot(`result-${matches}`)
    await page.locator('.btn.primary', { hasText: 'Continue' }).click()
    continue
  }
  // any other overlay (jobs, message) — close it
  const ovBack = page.locator('.overlay .topbar .iconbtn[aria-label="Back"]')
  if (await ovBack.count()) { await ovBack.first().click(); continue }
  const btn = page.locator('.continue-btn')
  if (!(await btn.count())) { await page.locator('.navitem', { hasText: 'Central' }).click(); await page.locator('.navitem', { hasText: 'Central' }).click(); continue }
  const txt = await btn.innerText()
  const a0 = Date.now()
  await btn.click()
  if (/Match Day/i.test(txt)) continue
  await page.waitForTimeout(150)
  await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 240000 })
  const d = Date.now() - a0
  advances++; advMs += d; maxAdv = Math.max(maxAdv, d)
}
console.log(`season: ${matches} matches, ${advances} advances, avg advance ${Math.round(advMs / Math.max(1, advances))}ms, max ${maxAdv}ms, total ${Math.round((Date.now() - t0) / 1000)}s`)
await shot('season-review')
await page.mouse.wheel(0, 700)
await shot('season-review-2')
if (await page.getByText(/^Start 20/).count()) { await page.getByText(/^Start 20/).click(); await page.waitForTimeout(500) }
await shot('new-season-hub')
await page.locator('.navitem', { hasText: 'Season' }).click()
await shot('new-season-comps')
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no errors')
await browser.close()
