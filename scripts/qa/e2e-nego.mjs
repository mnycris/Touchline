// Negotiation room walkthrough: bid, typing indicator, counter, personal terms with the agent.
// node scripts/qa/e2e-nego.mjs <out-dir> [player search]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-nego'
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
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await page.locator('.navitem', { hasText: 'Transfers' }).click()
await page.getByText('Search').first().click()
await page.fill('input[placeholder="Search by name"]', process.argv[3] || 'Mbeumo')
await page.waitForTimeout(600)
await page.locator('.screen .li.tap').first().click()
await page.getByText(/Make Offer|Offer Contract/).first().click()
await shot('room')
await page.getByText('75%').first().click()
await page.getByText('Submit offer').click()
await shot('typing', 900)
await page.waitForTimeout(3200)
await bottom(); await shot('reply-1')
await page.getByText('95%').first().click()
await page.getByText('Submit offer').click()
await page.waitForTimeout(4200)
await bottom(); await shot('reply-2')
if (await page.getByText(/Accept their price/).count()) { await page.getByText(/Accept their price/).click(); await page.waitForTimeout(3500) }
await page.waitForTimeout(3500)
await bottom(); await shot('agent-open')
await page.getByText('Offer contract').click()
await page.waitForTimeout(700)
await bottom(); await shot('agent-typing', 200)
await page.waitForTimeout(3600)
await bottom(); await shot('agent-reply')
if (await page.getByRole('button', { name: 'Match' }).count()) { await page.getByRole('button', { name: 'Match' }).click(); await page.getByText('Offer contract').click(); await page.waitForTimeout(4200) }
await bottom(); await shot('agent-final')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
