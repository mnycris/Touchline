// Frame-by-frame capture of the live 2D pitch. node scripts/qa/pitch-frames.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-frames'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.nc-club').nth(0).click()
await page.getByRole('button', { name: /Take the job/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Sign the contract').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.waitForTimeout(6000)
const lp = page.locator('.lp-wrap')
for (let i = 0; i < 16; i++) { await lp.screenshot({ path: `${OUT}/f${String(i).padStart(2, '0')}.png` }); await page.waitForTimeout(250) }
await browser.close()
console.log('ok')
