// End-to-end smoke run of the main flows on a phone viewport. Screenshots go to $OUT.
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = process.env.URL || 'http://localhost:4173/'
const OUT = process.env.OUT || '/tmp/opus-shots'
fs.mkdirSync(OUT, { recursive: true })
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CONNECTION|ERR_FAILED|403/.test(m.text())) errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const click = async (text, opts = {}) => { await page.getByText(text, { exact: opts.exact ?? false }).first().click({ timeout: opts.timeout ?? 8000 }) }

const step = process.env.STEP || 'all'
await page.goto(URL)
await page.waitForTimeout(1200)
await shot('menu')
await click('New Career')
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Alex')
await page.fill('input[placeholder="Last name"]', 'Morgan')
await shot('manager')
await click('Hair', { exact: true })
await shot('manager-hair')
await click('Continue')
await shot('leagues')
await click('Premier League')
await shot('clubs')
await page.locator('.nc-club').filter({ hasText: process.env.CLUB || 'Villa' }).first().click()
await shot('inspect')
await page.getByRole('button', { name: /Take the job/ }).click()
await shot('settings')
await click('Continue')
await shot('confirm')
await click('Sign the contract')
const t0 = Date.now()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
console.log('career created in', Date.now() - t0, 'ms')
await shot('hub')
if (step === 'hub') { console.log(errors.join('\n')); await browser.close(); process.exit(0) }
// advance to first match
for (let i = 0; i < 12; i++) {
  const txt = await page.locator('.continue-btn').innerText()
  if (/Match Day/i.test(txt)) break
  await page.locator('.continue-btn').click()
  await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
  await page.waitForTimeout(300)
  // close any prematch overlay that opened automatically
  if (await page.getByText('Play match').count()) break
}
await shot('after-advance')
if (!(await page.getByText('Play match').count())) await page.locator('.continue-btn').click()
await page.waitForSelector('text=Play match', { timeout: 20000 })
await shot('prematch')
await click('Line-ups')
await shot('prematch-lineups')
await click('Play match')
await page.waitForTimeout(6000)
await shot('live-6s')
await page.getByRole('button', { name: '4×' }).click()
await page.waitForTimeout(5000)
await shot('live-4x')
await click('Stats', { exact: true })
await shot('live-stats')
await click('Ratings', { exact: true })
await shot('live-ratings')
await page.locator('.ctl-btn.manage').click()
await shot('manage-subs')
await page.locator('.seg button', { hasText: 'Tactics' }).click()
await shot('manage-tactics')
await page.locator('.sheet .iconbtn').click()
await click('Sim to End')
await page.waitForTimeout(800)
await shot('fulltime')
await click('Continue')
await page.waitForTimeout(800)
await shot('postmatch')
await page.locator('.btn.primary', { hasText: 'Continue' }).click()
await page.waitForTimeout(500)
await shot('hub-after-match')
// tabs
for (const [tab, name] of [['Squad', 'squad'], ['Transfers', 'transfers'], ['Academy', 'academy'], ['Season', 'season']]) {
  await page.locator('.navitem', { hasText: tab }).click()
  await page.waitForTimeout(400)
  await shot(name)
}
await page.locator('.navitem', { hasText: 'Squad' }).click()
await page.locator('.squad-row').first().click()
await shot('player')
await page.mouse.wheel(0, 900)
await shot('player-attrs')
await page.locator('.iconbtn[aria-label="Back"]').click()
await click('Team Sheet')
await shot('tactics')
await page.locator('.navitem', { hasText: 'Season' }).click()
await page.locator('.comp-card').first().click()
await shot('table')
await page.locator('.navitem', { hasText: 'Central' }).click()
await page.locator('.iconbtn[aria-label="Inbox"]').click()
await shot('inbox')
console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()
