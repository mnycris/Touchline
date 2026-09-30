// Rescheduled / out-of-sequence fixtures as the manager sees them. node scripts/qa/fixtures-ui.mjs <out-dir> [club]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-fixtures'; fs.mkdirSync(OUT, { recursive: true })
const CLUB = process.argv[3] || 'Real Sociedad'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('LaLiga').first().click()
await page.locator('.club-card', { hasText: CLUB }).first().click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.waitForTimeout(1200)
await page.locator('.navitem[aria-label="Season"]').click()
await page.locator('.tabs button', { hasText: 'Fixtures' }).first().click()
await shot('club-fixtures', 800)
const moved = await page.evaluate(() => { const w = window.__game.getState().world; return Object.values(w.fixtures).filter((f) => f.moved && (f.home === w.userClubId || f.away === w.userClubId)).map((f) => `${f.roundName} ${f.date} ${f.moved.kind} ${f.moved.reason}`) })
console.log(moved)
await page.locator('.fixture-row', { has: page.locator('.fx-moved') }).first().click().catch(() => {})
await shot('moved-sheet', 600)
await page.evaluate(() => { const s = window.__game.getState(); s.closeAll(); const w = s.world; const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(w.userClubId)); s.go({ name: 'comp', params: { id: lg.id } }) })
await page.waitForTimeout(600)
await page.locator('.tabs button', { hasText: 'Fixtures' }).first().click()
for (let i = 0; i < 5; i++) await page.locator('.iconbtn[aria-label="Next"]').first().click()
await shot('md6', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
