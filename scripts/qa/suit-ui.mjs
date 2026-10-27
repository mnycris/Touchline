// Out-of-position marks on the team sheet: a save's first-team sheet with three players moved out of their positions
// (a winger on the wrong flank, a midfielder at full-back, a defensive midfielder up front), one of them selected.
// node scripts/qa/suit-ui.mjs <save> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-suit'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
await page.evaluate(() => {
  const g = window.__game.getState()
  g.mutate((w) => {
    const club = w.clubs[w.userClubId]
    const s = club.sheets.find((x) => x.id === club.activeSheet) || club.sheets[0]
    const L = s.lineup
    // swap a few players around: 1↔9 (back line ↔ attack), 6↔10, 3↔7
    for (const [a, b] of [[1, 10], [5, 9], [3, 7]]) { const t = L[a]; L[a] = L[b]; L[b] = t }
  }, { save: false })
  g.go({ name: 'tactics' })
})
await page.waitForTimeout(1200)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 560 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/01-sheet.png` })
await page.locator('.fl-pl').nth(1).click().catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/02-selected.png` })
const box = await page.locator('.fl-wrap').first().boundingBox()
if (box) await page.screenshot({ path: `${OUT}/03-zoom.png`, clip: { x: box.x, y: box.y + 40, width: box.width, height: Math.min(520, box.height) } })
console.log(errors.join('\n') || 'no errors')
await browser.close()
