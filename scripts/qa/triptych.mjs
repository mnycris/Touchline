// Three screenshots side by side under labels (e.g. before the round | the round's first try | now), for comparing
// versions of a screen. node scripts/qa/triptych.mjs <out.png> <a.png> <b.png> <c.png> [label a] [label b] [label c]
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
const [out, a, b, c, la = 'before', lb = 'first try', lc = 'now'] = process.argv.slice(2)
const W = 390, H = 844
const html = path.join(path.dirname(out), `_tri_${path.basename(out)}.html`)
const col = (f, l) => `<div style="width:${W}px"><div style="font:600 15px system-ui;color:#ddd;padding:4px 2px">${l}</div><img src="file://${path.resolve(f)}" style="width:${W}px;height:${H}px;display:block;border-radius:6px"></div>`
fs.writeFileSync(html, `<body style="margin:0;background:#2a2a2a;display:flex;gap:14px;padding:10px">${col(a, la)}${col(b, lb)}${col(c, lc)}</body>`)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: W * 3 + 48, height: H + 44 } })
await page.goto('file://' + html)
await page.waitForTimeout(400)
await page.screenshot({ path: out })
await browser.close()
fs.unlinkSync(html)
