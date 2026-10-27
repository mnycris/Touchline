// The new-career flow's motion frame by frame (every animation held at the same moment): a step coming in, a club
// opening, the signature being written and the build screen arriving.
// node scripts/qa/new-career-motion.mjs <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
const [OUT = '/tmp/opus-nc-motion'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const TIMES = [40, 140, 280, 500]
const hold = async (name) => {
  for (const t of TIMES) {
    await page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t } }, t)
    await page.waitForTimeout(50)
    await page.screenshot({ path: `${OUT}/${name}-${String(t).padStart(3, '0')}.png` })
  }
  await page.evaluate(() => { for (const a of document.getAnimations()) a.play() })
}
await page.goto('http://localhost:5173/')
await page.waitForTimeout(1200)
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.waitForTimeout(800)
await page.fill('input[placeholder="First name"]', 'Jo')
await page.fill('input[placeholder="Last name"]', 'Silva')
await page.locator('.nc-go').click()
await hold('step')
await page.waitForTimeout(600)
await page.locator('.nc-lg').first().click()
await page.waitForTimeout(900)
await page.locator('.nc-club').nth(4).click()
await hold('open')
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Take the job/ }).click()
await page.waitForTimeout(800)
await page.locator('.nc-go').click()
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Sign the contract/ }).click()
await page.waitForTimeout(30)
await hold('sign')
await page.waitForSelector('.nc-build', { timeout: 5000 })
await hold('build')
await browser.close()
console.log('done')
