// Match day → live match → full-time walkthrough with screenshots.
// node scripts/qa/e2e-matchday.mjs <out-dir> [league] [clubIdx]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-matchday'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText(process.argv[3] || 'Premier League').first().click(); await page.locator('.nc-club').nth(Number(process.argv[4] || 1)).click()
await page.getByRole('button', { name: /Take the job/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Sign the contract').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForSelector('text=Play match', { timeout: 20000 })
await shot('md-preview')
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 700 })
await shot('md-preview-2')
await page.locator('.tab', { hasText: 'Line-ups' }).first().click().catch(async () => { await page.getByText('Line-ups').first().click() })
await shot('md-lineups')
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 520 })
await shot('md-lineups-2')
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 0 })
// tap one of our players (home side is on top when we're at home)
const nodes = page.locator('.fl-pl[data-mine]')
if (await nodes.count()) { await nodes.nth(4).click(); await shot('md-pick'); await page.locator('.sheet .li.tap').nth(2).click(); await shot('md-after-swap') }
await page.getByText('H2H').first().click(); await shot('md-h2h')
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await shot('live-kickoff', 1800)
await page.waitForTimeout(4200)
await shot('live-1', 0)
await page.waitForTimeout(700)
await shot('live-2', 0)
// jump to the next goal via next event until a goal card appears (max 25 tries)
for (let i = 0; i < 25; i++) {
  await page.getByText('Next event').click()
  await page.waitForTimeout(900)
  if (await page.locator('.goal-card.is-goal').count()) break
  await page.locator('.ctl-btn.big').click().catch(() => {}) // pause seek
}
await shot('live-goal-card', 500)
await page.waitForTimeout(3500)
await page.locator('.tab', { hasText: 'Line-ups' }).first().click().catch(async () => { await page.getByText('Line-ups').first().click() })
await shot('live-lineups')
await page.locator('.tab', { hasText: 'Stats' }).first().click().catch(async () => { await page.getByText('Stats').first().click() })
await shot('live-stats')
await page.locator('.ctl-btn.manage').click()
await shot('manage-pitch')
await page.locator('.sheet .fl-pl').nth(9).click()
await shot('manage-out-selected')
await page.locator('.sheet .fl-bench-row:not([disabled])').first().click()
await shot('manage-subbed')
await page.locator('.sheet .iconbtn').first().click().catch(() => {})
await page.getByText('Sim to end').click()
await shot('live-ft')
await page.getByText('Full-time · Continue').click()
await shot('post-summary')
await page.getByText('Line-ups').first().click()
await shot('post-lineups')
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 560 })
await shot('post-lineups-2')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
