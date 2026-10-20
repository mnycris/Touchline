// The transfer centre with a busy feed: headlines, the list, filters and scopes, the manager's own deals and their
// story pages. node scripts/qa/tc-ui.mjs <save> [outDir]   (dev server on :5173)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-tc'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
const js = (fn, arg) => page.evaluate(fn, arg)
await js(() => window.__game.getState().setTab('transfers'))
await page.waitForTimeout(800)
await scroll(330); await shot('centre-top', 600)
await scroll(900); await shot('centre-list', 400)
// my club
await js(() => [...document.querySelectorAll('.seg button')].find((b) => /My club/.test(b.textContent))?.click())
await scroll(330); await shot('centre-mine', 500)
await scroll(800); await shot('centre-mine-2', 300)
// a story of my own
const id = await js(() => { const w = window.__game.getState().world; return (w.market?.stories || []).find((s) => s.user && s.offerId && s.stage !== 'failed')?.id })
if (id) { await js((id) => window.__game.getState().go({ name: 'story', params: { id } }), id); await shot('my-story', 700); await scroll(500); await shot('my-story-2', 300); await js(() => window.__game.getState().back()) }
// my business
await page.waitForTimeout(400)
await js(() => [...document.querySelectorAll('.tabs .tab, .tabs button')].find((b) => /My Business/.test(b.textContent))?.click())
await scroll(330); await shot('business', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
