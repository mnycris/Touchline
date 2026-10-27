// Cut a region out of a screenshot: node scripts/qa/crop-shot.mjs <png> <out> <x> <y> <w> <h> (device pixels)
import { chromium } from 'playwright'
const [file, out, x, y, w, h] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 780, height: 1688 } })
await page.goto('file://' + file)
await page.waitForTimeout(300)
await page.screenshot({ path: out, clip: { x: Number(x), y: Number(y), width: Number(w), height: Number(h) } })
await browser.close()
