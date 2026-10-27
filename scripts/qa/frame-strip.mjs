// Lay screenshots side by side, scaled to 300px wide: node scripts/qa/frame-strip.mjs <out> <top> <height> <png...>
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
const [out, top, height, ...files] = process.argv.slice(2)
const W = 300, H = Math.round(Number(height) * W / 780)
const html = path.join(path.dirname(out), '_strip.html')
fs.writeFileSync(html, `<body style="margin:0;background:#222;display:flex;gap:8px;padding:8px">${files.map((f) => `<div style="width:${W}px;height:${H}px;overflow:hidden;position:relative"><img src="file://${f}" style="position:absolute;top:${-Number(top) * W / 780}px;left:0;width:${W}px"></div>`).join('')}</body>`)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: files.length * (W + 8) + 8, height: H + 16 } })
await page.goto('file://' + html)
await page.waitForTimeout(600)
await page.screenshot({ path: out })
await browser.close()
