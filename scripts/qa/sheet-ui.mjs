// The team sheet as the manager works with it: Tactics → each tab, top and scrolled, then a match's Manage panel
// (line-up and substitutes). For out-of-position marks, scroll memory between tabs and swaps.
// node scripts/qa/sheet-ui.mjs <save> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-sheet'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scrollTo = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
const scrollTop = () => page.evaluate(() => [...document.querySelectorAll('.screen')].pop()?.scrollTop ?? -1)
await page.evaluate(() => window.__game.getState().go({ name: 'tactics' }))
await shot('tactics-overview', 900)
// scroll memory: scroll the first tab down, switch, and see where the next tab opens
const tabs = page.locator('.screen .tabs .tab')
const names = await tabs.allInnerTexts()
for (let i = 0; i < names.length; i++) {
  await tabs.nth(i).click()
  await page.waitForTimeout(500)
  const opened = await scrollTop()
  await shot(`tab-${i}-${names[i].trim()}-opens-at-${opened}`)
  await scrollTo(700)
  await shot(`tab-${i}-${names[i].trim()}-scrolled`)
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
