// Scouting hub: five places, hire, replace, release. node scripts/qa/scouts-ui.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-scouts'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.evaluate(() => window.__game.getState().go({ name: 'scouting' }))
await shot('hub', 800)
await page.locator('button', { hasText: /Hire scout/ }).click()
await shot('hire', 500)
await page.locator('.sheet .btn', { hasText: 'Hire' }).first().click()
await page.waitForTimeout(500)
await page.locator('button', { hasText: /Hire scout/ }).click()
await page.locator('.sheet .btn', { hasText: 'Hire' }).first().click()
await shot('two-more', 600)
await page.locator('.sct-meta .btn', { hasText: 'Replace' }).first().click()
await shot('replace', 500)
await page.locator('.sheet .btn', { hasText: 'Bring in' }).first().click()
await page.waitForTimeout(400)
await page.locator('.sct-meta .btn', { hasText: 'Release' }).last().click()
await shot('release', 500)
await page.locator('.sheet .btn', { hasText: 'Release' }).last().click()
await shot('after', 600)
const st = await page.evaluate(() => { const w = window.__game.getState().world; return { scouts: w.scouts.map((s) => s.name), pool: w.scoutPool.length } })
console.log(st)
console.log(JSON.stringify({ errors }))
await browser.close()
