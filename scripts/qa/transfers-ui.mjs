// Transfer hub (needs, deals), search with preset, shortlist. Dev server: npx vite --port 5173 --strictPort
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-transfers'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(9).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
// shortlist a few players and make a bid via store
await page.evaluate(() => {
  const g = window.__game.getState(); const w = g.world
  const ps = Object.values(w.players).filter((p) => p.clubId && p.clubId !== w.userClubId && p.ovr >= 76 && p.ovr <= 80).slice(0, 4)
  w.transfers.shortlist.push(...ps.map((p) => p.id)); g.setTab('transfers')
})
await page.waitForTimeout(700)
await shot('hub')
await page.locator('.tn').first().click()
await shot('search-preset', 700)
await page.evaluate(() => window.__game.getState().back())
await page.locator('.tab', { hasText: 'Shortlist' }).first().click()
await shot('shortlist', 500)
console.log(JSON.stringify({ errors }))
await browser.close()
