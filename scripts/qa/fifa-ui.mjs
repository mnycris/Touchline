// World ranking on the nation profile and the full table. node scripts/qa/fifa-ui.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-fifa'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const id = await page.evaluate(() => { const w = window.__game.getState().world; return w.intl.nt['England'] })
await page.evaluate((id) => window.__game.getState().go({ name: 'club', params: { id } }), id)
await shot('nation', 900)
await page.locator('.fr-card').click()
await shot('table', 900)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 900 })
await shot('table-down', 400)
await page.locator('.chip', { hasText: 'CAF' }).first().click()
await shot('caf', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
