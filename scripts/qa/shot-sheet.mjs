// Several screenshots on one sheet, each under its file name, in rows (for frames of an animation, crops, variants).
// node scripts/qa/shot-sheet.mjs <out.png> [--cols=N] [--w=PX] <img> <img> ...
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
const args = process.argv.slice(2)
const out = args.shift()
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const imgs = args.filter((a) => !a.startsWith('--'))
const cols = Number(opt.cols || 1), w = Number(opt.w || 390)
const html = path.join(path.dirname(out), `_sheet_${path.basename(out)}.html`)
const cell = (f) => `<div style="width:${w}px"><div style="font:600 13px system-ui;color:#ccc;padding:3px 2px">${path.basename(f)}</div><img src="file://${path.resolve(f)}" style="width:${w}px;display:block;border-radius:4px"></div>`
fs.writeFileSync(html, `<body style="margin:0;background:#2a2a2a;padding:10px;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:12px;width:max-content">${imgs.map(cell).join('')}</body>`)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: cols * (w + 12) + 20, height: 400 } })
await page.goto('file://' + html)
await page.waitForTimeout(400)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
fs.unlinkSync(html)
