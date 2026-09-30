// Main menu background frames (fluid colour drift) and a squad/player morale check. node scripts/qa/menu-bg.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-menu'; fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.waitForTimeout(2500)
for (let i = 0; i < 3; i++) { await page.screenshot({ path: `${OUT}/0${i + 1}-menu.png` }); await page.waitForTimeout(9000) }
console.log(JSON.stringify({ errors }))
await browser.close()
