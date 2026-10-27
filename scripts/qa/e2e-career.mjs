// Career systems smoke test: save/reload, transfers & negotiation, calendar, conversations, press.
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = process.env.URL || 'http://localhost:4173/'
const OUT = process.env.OUT || '/tmp/opus-shots2'
fs.mkdirSync(OUT, { recursive: true })
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`))
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CONNECTION|ERR_FAILED|403/.test(m.text())) errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const click = async (text, opts = {}) => { await page.getByText(text, { exact: opts.exact ?? false }).first().click({ timeout: opts.timeout ?? 8000 }) }
const nav = async (tab) => { await page.locator('.navitem', { hasText: tab }).click(); await page.waitForTimeout(300) }

await page.goto(URL)
await page.waitForTimeout(800)
await click('New Career')
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Sam')
await page.fill('input[placeholder="Last name"]', 'Rivera')
await click('Continue')
await click(process.env.LEAGUE || 'LALIGA EA SPORTS')
await page.locator('.club-card').nth(Number(process.env.CLUBIDX || 5)).click()
await page.getByRole('button', { name: /^Manage/ }).click()
await click('Continue')
await click('Start Career')
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await shot('hub')
// --- transfers: search expiring contracts and bid
await nav('Transfers')
await click('Search', { exact: true })
await page.waitForTimeout(500)
await click('Expiring')
await page.waitForTimeout(500)
await shot('search-expiring')
const rows = page.locator('.screen .card.list .li')
const count = await rows.count()
console.log('expiring results', count)
await rows.nth(Math.min(8, count - 1)).click()
await page.waitForTimeout(400)
await shot('target-profile')
const offerBtn = page.getByRole('button', { name: /Make Offer|Offer Contract|Continue talks/ })
if (await offerBtn.isEnabled()) {
  await offerBtn.click()
  await page.waitForTimeout(400)
  await shot('negotiation')
  await page.locator('.chip', { hasText: '100%' }).click().catch(() => {})
  await click('Submit Offer')
  await page.waitForTimeout(700)
  await shot('negotiation-response')
  if (await page.getByText('Personal terms').count()) {
    await click('Offer contract')
    await page.waitForTimeout(600)
    await shot('contract-response')
  } else if (await page.getByText(/Accept counter/).count()) {
    await page.getByText(/Accept counter/).click()
    await page.waitForTimeout(600)
    await shot('counter-accepted')
  }
  await page.locator('.overlay .topbar .iconbtn[aria-label="Back"]').click()
} else console.log('seller unwilling')
// --- calendar advance to date
await nav('Central')
await page.locator('.cal-strip').click()
await page.waitForTimeout(400)
await shot('calendar')
const cells = page.locator('.cal-cell:not(.past)')
await cells.nth(10).click()
await shot('calendar-selected')
const t0 = Date.now()
const adv = page.getByRole('button', { name: /Advance to/ })
if (await adv.count()) {
  await adv.click()
  await page.waitForTimeout(500)
  await page.waitForFunction(() => !document.querySelector('.btn.club:disabled'), null, { timeout: 120000 })
  console.log('advance-to-date took', Date.now() - t0, 'ms')
}
await shot('calendar-after')
// back to hub
await page.locator('.topbar .iconbtn[aria-label="Back"]').first().click().catch(() => {})
await nav('Central')
await page.locator('.navitem', { hasText: 'Central' }).click()
await page.waitForTimeout(300)
// advance timing
const t1 = Date.now()
await page.locator('.continue-btn').click()
await page.waitForTimeout(300)
await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 180000 })
const dateTxt = await page.locator('.topbar .tiny').first().innerText()
console.log('advance took', Date.now() - t1, 'ms →', dateTxt)
await shot('after-advance')
// close overlay if prematch opened
if (await page.getByText('Play match').count()) { await click('Quick sim'); await page.waitForTimeout(800); await shot('quicksim-result'); await page.locator('.btn.primary', { hasText: 'Continue' }).click() }
// inbox conversation if any
await page.locator('.iconbtn[aria-label="Inbox"]').click()
await page.waitForTimeout(300)
await shot('inbox')
const conv = page.locator('.msg-row', { hasText: /development|playing time|contract|transfer request|wants a word/i }).first()
if (await conv.count()) {
  await conv.click(); await page.waitForTimeout(300); await shot('message')
  const respond = page.getByRole('button', { name: 'Respond' })
  if (await respond.count()) { await respond.click(); await page.waitForTimeout(300); await shot('conversation'); await page.locator('.btn.answer').first().click(); await page.waitForTimeout(400); await shot('conversation-done') }
}
// --- save & reload
await page.goto(URL)
await page.waitForTimeout(1500)
await shot('menu-continue')
await page.locator('.continue-card').click()
await page.waitForSelector('.continue-btn', { timeout: 30000 })
await shot('reloaded-hub')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
