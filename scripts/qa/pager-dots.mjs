// Central's competition dots, frame by frame through a swipe: the card at rest, then the track at points between two
// pages (the current dot drawn out towards the next and settling there), each frame cropped to the card's corner and
// enlarged. node scripts/qa/pager-dots.mjs <save> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-pager-dots'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
await page.evaluate(() => { const s = window.__game.getState(); s.closeAll(); s.setTab('central') })
await page.waitForTimeout(900)
await page.evaluate(() => { const c = document.querySelector('.cpg'); c?.scrollIntoView({ block: 'center' }) })
await page.waitForTimeout(500)
const box = await page.locator('.cpg').boundingBox()
await page.screenshot({ path: `${OUT}/card.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 220) } })
const n = await page.locator('.cpg-page').count()
const start = await page.evaluate(() => { const t = document.querySelector('.cpg-track'); return Math.round(t.scrollLeft / t.clientWidth) })
const to = start + 1 < n ? start + 1 : start - 1
console.log(`${n} pages, at ${start}, swiping to ${to}`)
// the dots' corner, at each point of the way (the track turned off its snapping so it holds the point)
await page.evaluate(() => { document.querySelector('.cpg-track').style.scrollSnapType = 'none' })
for (const f of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
  await page.evaluate(([a, b, f]) => { const t = document.querySelector('.cpg-track'); t.scrollLeft = (a + (b - a) * f) * t.clientWidth }, [start, to, f])
  await page.waitForTimeout(120)
  const d = await page.locator('.cpg-dots').boundingBox()
  await page.screenshot({ path: `${OUT}/dots-${String(Math.round(f * 100)).padStart(3, '0')}.png`, clip: { x: d.x - 6, y: d.y - 2, width: d.width + 12, height: d.height + 4 }, scale: 'device' })
}
await page.evaluate(() => { document.querySelector('.cpg-track').style.scrollSnapType = '' })
console.log(errors.join('\n') || 'no errors')
await browser.close()
