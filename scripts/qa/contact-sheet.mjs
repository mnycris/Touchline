import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1200, height: 900 } })
await p.goto('file:///tmp/claude-0/check/badges.html')
await p.waitForTimeout(1500)
const h = await p.evaluate(() => document.body.scrollHeight)
for (let i = 0; i * 900 < h; i++) { await p.evaluate(y => window.scrollTo(0, y), i * 900); await p.screenshot({ path: `/tmp/claude-0/check/badges_${i}.png` }) }
await b.close()
