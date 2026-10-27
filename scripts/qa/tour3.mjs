// Broad screenshot tour of the main screens. node scripts/qa/tour3.mjs <out-dir> [league] [clubIdx]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-tour3'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const back = async () => { const b = page.locator('.topbar .iconbtn[aria-label="Back"]'); if (await b.count()) await b.last().click(); await page.waitForTimeout(250) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = y }, y)
const step = async (name, fn) => { try { await fn() } catch (e) { errors.push(`step ${name}: ${e.message.split('\n')[0]}`) } }
const nav = (t) => page.locator('.navitem', { hasText: t }).click()
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText(process.argv[3] || 'Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[4] || 3)).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
// play a few weeks so stats/tables fill up
for (let i = 0; i < 5; i++) {
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  if (/Match Day/i.test(t) || await page.getByText('Play match').count()) {
    if (!(await page.getByText('Play match').count())) await b.click()
    await page.getByText('Quick sim').click(); await page.waitForSelector('text=Full-time', { timeout: 30000 }); await page.locator('.md-footer .btn.primary').click(); await page.waitForTimeout(300)
    continue
  }
  await b.click(); await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
if (await page.getByText('Play match').count()) { await page.getByText('Quick sim').click(); await page.waitForSelector('text=Full-time', { timeout: 30000 }); await page.locator('.md-footer .btn.primary').click(); await page.waitForTimeout(400) }
await shot('hub')
await scroll(700); await shot('hub-2')
await step('squad', async () => { await nav('Squad'); await shot('squad'); await page.locator('.seg button', { hasText: 'Status' }).first().click(); await shot('squad-status'); await page.locator('.seg button', { hasText: 'Stats' }).first().click(); await shot('squad-stats'); await page.locator('.seg button', { hasText: 'List' }).first().click() })
await step('player', async () => { await page.locator('.screen .squad-row, .screen .li.tap').nth(10).click(); await shot('player'); await scroll(600); await shot('player-2'); await page.locator('.tab', { hasText: 'Stats' }).first().click(); await shot('player-stats'); await page.locator('.tab', { hasText: 'Career' }).first().click(); await shot('player-career'); await back() })
await step('clubProfile', async () => { await nav('Season'); await page.locator('.screen .card.tap').first().click(); await page.locator('.tbl tbody tr').nth(0).click(); await shot('club-profile'); await scroll(600); await shot('club-profile-2'); await back(); await back() })
await step('transfers', async () => { await nav('Transfers'); await shot('transfers'); await scroll(600); await shot('transfers-2') })
await step('academy', async () => { await nav('Academy'); await shot('academy') })
await step('season', async () => { await nav('Season'); await shot('season'); await page.locator('.screen .card.tap').first().click(); await shot('comp'); await page.locator('.tab', { hasText: 'Fixtures' }).first().click(); await shot('comp-fixtures'); await page.locator('.tab', { hasText: 'Stats' }).first().click(); await shot('comp-stats'); await back() })
await step('club', async () => { await nav('Central'); await page.locator('.hero .md-team, .hero button').first().click().catch(() => {}); await shot('club-or-opponent'); await back() })
await step('office', async () => { await nav('Central'); await page.locator('.mini-btn, .card.tap', { hasText: 'Office' }).first().click(); await shot('office'); await scroll(700); await shot('office-2'); await back() })
await step('inbox', async () => { await page.locator('.topbar .iconbtn').first().click(); await shot('inbox'); await back() })
await step('news', async () => { await page.locator('.card', { hasText: 'Football News' }).first().click(); await shot('news'); await back() })
await step('calendar', async () => { await page.locator('.mini-btn, .card.tap', { hasText: 'Calendar' }).first().click(); await shot('calendar'); await back() })
await step('tactics', async () => { await page.locator('.mini-btn, .card.tap', { hasText: 'Tactics' }).first().click(); await shot('tactics'); await page.locator('.tab', { hasText: 'Tactics' }).first().click(); await shot('tactics-2'); await back() })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
