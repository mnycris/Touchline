// Tactics Lab interactions: change setup B, read the shape with A as rings, run the A v B comparison.
// node scripts/qa/lab-ui2.mjs <save> <out>
import { openSave } from './load-save.mjs'
import fs from 'node:fs'
const [file, OUT = '/tmp/lab-ui2'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scr = (y) => page.evaluate((y) => { [...document.querySelectorAll('.screen')].pop().scrollTop = y }, y)
await page.evaluate(() => window.__game.getState().open({ name: 'practice' }))
await page.waitForTimeout(900)
// B: Gegenpress preset
await page.locator('.tp-card', { hasText: 'Gegenpress' }).click()
await shot('preset-sheet', 700)
await page.locator('.sheet button.btn.primary').click()
await page.waitForTimeout(400)
await scr(0)
await shot('shape-rings', 900)
await page.locator('.lab-phases .chip', { hasText: 'Their build-up' }).click()
await shot('shape-press', 900)
await page.locator('.seg button, .seg-btn', { hasText: 'With the ball' }).first().click().catch(() => page.getByText('With the ball').first().click())
await shot('shape-with', 900)
await page.locator('.md-footer .btn.primary').click()
await page.waitForFunction(() => !!document.querySelector('.lab-cmp'), null, { timeout: 120000 })
await scr(0)
await page.evaluate(() => { const el = document.querySelector('.lab-cmp'); el && el.scrollIntoView({ block: 'start' }) })
await shot('compare', 700)
await page.evaluate(() => { [...document.querySelectorAll('.screen')].pop().scrollTop += 640 })
await shot('compare-2', 500)
// a guide sheet
await scr(100000)
await page.locator('.md-footer').evaluate((el) => el.style.display = 'none')
await page.locator('.lab-edit-h button').click()
await page.waitForTimeout(400)
await page.locator('.tb-info').nth(2).click()
await shot('guide', 700)
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
