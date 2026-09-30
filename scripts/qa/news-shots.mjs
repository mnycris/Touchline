// News page from a save: feed filters and articles. node scripts/qa/news-shots.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-news'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
await page.evaluate(() => window.__game.getState().go({ name: 'news' }))
await shot('top', 900)
for (const y of [700, 1500, 2400]) { await scroll(y); await shot(`top-${y}`, 350) }
await scroll(0)
for (const f of ['My Club', 'World', 'Transfers', 'Results']) {
  await page.locator('.chip', { hasText: f }).first().click()
  await shot(f.replace(' ', ''), 600)
}
const kinds = await page.evaluate(() => { const w = window.__game.getState().world; const seen = {}; for (const x of w.news) if (!seen[x.kind]) seen[x.kind] = x.id; return seen })
console.log(Object.keys(kinds).join(','))
for (const [k, id] of Object.entries(kinds).slice(0, 8)) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'article', params: { id } }), id)
  await shot(`art-${k}`, 700)
}
console.log(JSON.stringify({ errors }))
await browser.close()
