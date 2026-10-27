// Quick visual snapshot helper: node scripts/qa/shots.mjs <out-dir> [club-index] [league]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-quick'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:4173/')
await page.waitForTimeout(2500)
await shot('menu')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await shot('manager-custom')
await page.locator('.seg button', { hasText: 'Real manager' }).click()
await page.waitForTimeout(400)
await shot('manager-real')
await page.locator('.li.tap').nth(2).click()
await shot('manager-real-picked')
await page.getByText('Continue').first().click(); await page.getByText(process.argv[4] || 'Premier League').first().click(); await page.locator('.nc-club').nth(Number(process.argv[3] || 4)).click()
await page.getByRole('button', { name: /Take the job/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Sign the contract').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await shot('hub')
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 600 })
await shot('hub-scrolled')
await page.locator('.navitem', { hasText: 'Squad' }).click()
await shot('squad')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
