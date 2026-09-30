// Match editor (Edit Mode) on a small phone: simple and advanced modes, scrolling to every section, adding moments.
// node scripts/qa/editor-ui.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-editor'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file, { width: 375, height: 667 })
let n = 0
const shot = async (name, wait = 450) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const fx = await page.evaluate(() => {
  const G = window.__game
  G.getState().mutate((w) => { w.meta.editMode = true })
  const w = G.getState().world
  const f = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && f.date >= w.date && w.competitions[f.compId]?.key === 'L13').sort((a, b) => a.date.localeCompare(b.date))[0]
  return { id: f.id, home: w.clubs[f.home].short, away: w.clubs[f.away].short }
})
// open the fixture sheet through the fixtures list of the competition
await page.evaluate((id) => { const G = window.__game; const f = G.getState().world.fixtures[id]; G.getState().go({ name: 'comp', params: { id: f.compId } }) }, fx.id)
await page.waitForTimeout(600)
await page.locator('.tabs button', { hasText: 'Fixtures' }).first().click()
await page.waitForTimeout(500)
await page.locator('.fixture-row', { hasText: fx.home }).filter({ hasText: fx.away }).first().click()
await page.waitForTimeout(500)
await page.locator('button', { hasText: /Edit match/ }).first().click()
await shot('simple', 700)
await page.locator('.sheet .seg button', { hasText: 'Open' }).first().click()
await page.locator('.sheet .seg button', { hasText: 'Heated' }).first().click()
await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.scrollTop = 9999 })
await shot('simple-end', 400)
await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.scrollTop = 0 })
await page.locator('.sheet .seg button', { hasText: 'Advanced' }).first().click()
await shot('advanced', 500)
await page.locator('.sc-bdot').nth(1).click()
await page.locator('.sheet .chip', { hasText: 'Randomize' }).click()
await shot('randomized', 400)
// a goal on AUTO
await page.locator('.sheet .chip', { hasText: /^\s*Goal$/ }).first().click().catch(async () => { await page.locator('.sheet .sc-add .chip').first().click() })
await shot('goal-form', 450)
await page.locator('.sc-evform .btn.ed-apply').click()
// a penalty with a red card for the foul
await page.locator('.sheet .sc-add .chip', { hasText: 'Penalty' }).click()
await shot('pen-open', 400)
console.log(await page.evaluate(() => [...document.querySelectorAll('.sc-evform .seg button')].map((b) => b.textContent).join('|')))
await page.locator('.sc-evform .seg button', { hasText: /^Red$/i }).click()
await page.locator('.sc-evform .sc-pt').nth(3).click()
await shot('pen-form', 450)
await page.locator('.sc-evform .btn.ed-apply').click()
await shot('moments', 450)
// tap a minute value: the keypad
await page.locator('.sheet .sc-add .chip', { hasText: 'Yellow card' }).click()
await page.locator('.sc-evform .stepper-v').first().click()
await shot('minute-pad', 450)
await page.locator('.np-quick .chip', { hasText: "75'" }).click().catch(() => {})
await page.waitForTimeout(300)
await page.locator('.sc-evform .btn.ed-apply').click()
// line-ups, then scroll the one sheet to its very end
const lu = page.locator('.sheet section', { hasText: 'Line-ups' }).locator('.chip').last()
await lu.click()
await page.waitForTimeout(300)
const info = await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.scrollTop = s.scrollHeight; const b = [...s.querySelectorAll('button')].find((x) => /Use this line-up/.test(x.textContent)); const r = b.getBoundingClientRect(); const f = s.querySelector('.sc-foot').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), footTop: Math.round(f.top), nested: [...s.querySelectorAll('*')].filter((e) => { const st = getComputedStyle(e); return /auto|scroll/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 2 }).length } })
console.log('line-up save button vs footer', info)
await shot('lineup-end', 400)
console.log(JSON.stringify({ errors }))
await browser.close()
