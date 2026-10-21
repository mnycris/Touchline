// The Season page's competition tiles up close (device pixel ratio 3, then cropped and enlarged), to see their edges.
//   node scripts/qa/tile-zoom.mjs <save> <out-dir>
import fs from 'node:fs'
import { chromium } from 'playwright'
const [save, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://localhost:5173/')
await page.locator('button', { hasText: /Load/ }).first().click()
await page.setInputFiles('input[type=file]', save)
await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
await page.waitForTimeout(500)
await page.locator('.save-row, .card', { hasText: /imported|·/ }).first().click().catch(() => {})
const loadBtn = page.locator('button', { hasText: /^Load$|Continue/ }).first()
if (await loadBtn.count()) await loadBtn.click().catch(() => {})
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
await page.locator('.bottomnav .navitem[aria-label="Season"]').click()
await page.waitForTimeout(900)
const tiles = page.locator('.comp-card .logo-tile')
const n = await tiles.count()
for (let i = 0; i < Math.min(n, 5); i++) {
  const box = await tiles.nth(i).boundingBox()
  if (!box) continue
  await page.screenshot({ path: `${OUT}/tile-${i}.png`, clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } })
}
const info = await page.evaluate(() => [...document.querySelectorAll('.comp-card .logo-tile')].slice(0, 5).map((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { cls: el.className, w: r.width, h: r.height, x: r.x, y: r.y, radius: cs.borderRadius, border: cs.border, overflow: cs.overflow, bg: cs.backgroundImage.slice(0, 60), shadow: cs.boxShadow } }))
console.log(JSON.stringify(info, null, 1))
await browser.close()
