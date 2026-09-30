// Menu background: four frames 3 s apart, to judge whether the drift is perceptible. node scripts/qa/menu-motion.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-menu-motion'; fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://localhost:5173/')
await page.waitForTimeout(2000)
for (let i = 0; i < 4; i++) { await page.screenshot({ path: `${OUT}/0${i + 1}-menu.png`, clip: { x: 0, y: 0, width: 390, height: 460 } }); await page.waitForTimeout(3000) }
await browser.close()
