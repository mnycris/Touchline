// Tactics Lab walkthrough on a save: tactics tab, the lab, shape views, an A/B comparison. node scripts/qa/lab-ui.mjs <save> <out>
import { openSave } from './load-save.mjs'
import fs from 'node:fs'
const [file, OUT = '/tmp/lab-ui'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 450) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.evaluate(() => window.__game.getState().open({ name: 'tactics' }))
await page.waitForTimeout(600)
await page.locator('.tab', { hasText: 'Tactics' }).first().click()
await shot('tactics-tab')
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 900 })
await shot('tactics-tab-2')
await page.evaluate(() => window.__game.getState().open({ name: 'practice' }))
await shot('lab', 900)
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop = 700 })
await shot('lab-2')
if (process.env.STEPS) for (const s of process.env.STEPS.split(';')) { await page.evaluate(s); await shot('step', 1500) }
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
