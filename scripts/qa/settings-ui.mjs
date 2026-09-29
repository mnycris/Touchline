// New-career settings step (followed leagues) and in-career Settings. Dev server: npx vite --port 5173 --strictPort
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-settings'
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
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(1).click()
await page.getByRole('button', { name: /^Manage/ }).click()
await page.waitForTimeout(500)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen, .scroll')].pop(); if (s) s.scrollTop = 99999 })
await shot('newcareer-settings')
await page.locator('.dlp-t', { hasText: 'Eredivisie' }).first().click().catch(() => {})
await page.locator('.dlp-t', { hasText: 'Serie A' }).first().click().catch(() => {})
await shot('newcareer-toggled')
await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
const s = await page.evaluate(() => window.__game.getState().world.settings.deepLeagues)
console.log('deepLeagues saved:', JSON.stringify(s))
await page.evaluate(() => window.__game.getState().open({ name: 'settings' }))
await page.waitForTimeout(600)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 1500 })
await shot('career-settings')
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 99999 })
await shot('career-settings-2')
console.log(JSON.stringify({ errors }))
await browser.close()
