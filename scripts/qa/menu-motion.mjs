// The main menu's motion frame by frame (every animation held at the same moment): opening Load, and coming back.
// node scripts/qa/menu-motion.mjs <out-dir> <save.touchline>   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
const [OUT = '/tmp/opus-menu-motion', SAVE] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const hold = async (name, times = [40, 140, 280, 500]) => {
  for (const t of times) {
    await page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t } }, t)
    await page.waitForTimeout(50)
    await page.screenshot({ path: `${OUT}/${name}-${String(t).padStart(3, '0')}.png` })
  }
  await page.evaluate(() => { for (const a of document.getAnimations()) a.play() })
}
await page.goto('http://localhost:5173/')
await page.waitForTimeout(1500)
if (SAVE) {
  await page.locator('button', { hasText: /^\s*Load/ }).first().click()
  await page.setInputFiles('input[type=file]', SAVE)
  await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
  await page.locator('[aria-label="Back"]').first().click()
  await page.waitForTimeout(1500)
}
await page.locator('button', { hasText: /^\s*Load/ }).first().click()
await hold('open-load')
await page.waitForTimeout(600)
await page.locator('[aria-label="Back"]').first().click()
await hold('back-home')
await browser.close()
console.log('done')
