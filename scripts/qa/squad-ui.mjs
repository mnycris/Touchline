// Squad screen views. Dev server: npx vite --port 5173 --strictPort
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-squad'
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
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(2).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
for (let i = 0; i < 6; i++) { if (await page.getByText('Quick sim').count()) { await page.getByText('Quick sim').click(); await page.waitForTimeout(1500); await page.evaluate(() => window.__game.getState().closeAll()) } else { const b = page.locator('.continue-btn'); if (await b.count()) { await b.click(); await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 }) } } }
await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.clearNewsDrop(); g.setTab('squad') })
await page.waitForTimeout(600)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 330 })
await shot('list')
for (const v of ['Status', 'Stats', 'Deal']) {
  await page.locator('.seg button', { hasText: v }).first().click()
  await page.waitForTimeout(300)
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 330 })
  await shot(v.toLowerCase())
}
await page.locator('.sq-head button', { hasText: 'Wage' }).click().catch(() => {})
await shot('deal-sorted')
console.log(JSON.stringify({ errors }))
await browser.close()
