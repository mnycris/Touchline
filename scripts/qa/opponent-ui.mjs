// Match preview prediction and the opponent scouting report. node scripts/qa/opponent-ui.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-opp'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
const fid = await page.evaluate(() => { const w = window.__game.getState().world; return Object.values(w.fixtures).filter((f) => f.userInvolved && !f.played && f.date >= w.date).sort((a, b) => a.date.localeCompare(b.date))[0]?.id })
await page.evaluate((id) => window.__game.getState().go({ name: 'prematch', params: { id } }), fid)
await shot('preview', 900)
await scroll(280); await shot('preview-pred', 400)
await scroll(0)
await page.locator('.md-act', { hasText: 'Opponent' }).click()
await shot('report', 900)
for (const y of [650, 1300, 2000, 2700, 3400]) { await scroll(y); await shot(`report-${y}`, 350) }
await page.evaluate(() => window.__game.getState().back())
await shot('back', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
