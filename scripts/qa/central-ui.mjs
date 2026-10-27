// Central's top: the next-match card (after FotMob's live card) and the competition pager, at rest, half-way through a
// swipe (the dots trading places) and settled on the next page; then every page in turn.
// node scripts/qa/central-ui.mjs <save> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-central'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
let n = 0
const shot = async (name, wait = 400, clip) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, ...(clip ? { clip } : {}) }) }
await page.waitForTimeout(1200)
await shot('central', 300)
const info = await page.evaluate(() => {
  const w = window.__game.getState().world
  const dots = [...document.querySelectorAll('.cpg-dot')].map((d) => `${d.getAttribute('aria-label')}${d.getAttribute('aria-selected') === 'true' ? '*' : ''}`)
  const nf = Object.values(w.fixtures).filter((f) => !f.played && (f.home === w.userClubId || f.away === w.userClubId)).sort((a, b) => a.date.localeCompare(b.date))[0]
  return { dots, next: nf && w.competitions[nf.compId]?.name }
})
console.log('dots', info.dots.join(' · '), '| next match in', info.next)
// the pager in view
await page.evaluate(() => document.querySelector('.cpg')?.scrollIntoView({ block: 'center' }))
const box = await page.evaluate(() => { const r = document.querySelector('.cpg').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 }
await shot('pager', 400, clip)
const pages = info.dots.length
// half-way to the next page, then settled
const w0 = await page.evaluate(() => { const t = document.querySelector('.cpg-track'); return { at: Math.round(t.scrollLeft / t.clientWidth), w: t.clientWidth } })
const to = w0.at + 1 < pages ? w0.at + 1 : w0.at - 1
await page.evaluate(([x]) => { const t = document.querySelector('.cpg-track'); t.style.scrollSnapType = 'none'; t.scrollLeft = x }, [Math.round((w0.at + to) / 2 * w0.w)])
await shot('half-way', 250, clip)
await page.evaluate(([x]) => { const t = document.querySelector('.cpg-track'); t.style.scrollSnapType = ''; t.scrollTo({ left: x, behavior: 'smooth' }) }, [to * w0.w])
await shot('settled', 900, clip)
// a real touch swipe back (the browser's own scrolling and snapping)
const cy = box.y + box.height / 2
const cdp = await page.context().newCDPSession(page)
await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + box.width / 2), y: Math.round(cy), xDistance: to > w0.at ? 260 : -260, yDistance: 0, speed: 900, gestureSourceType: 'touch' })
await shot('swiped-back', 900, clip)
console.log('after swipe', await page.evaluate(() => { const t = document.querySelector('.cpg-track'); return `${(t.scrollLeft / t.clientWidth).toFixed(2)} · ${[...document.querySelectorAll('.cpg-dot')].map((d) => d.getAttribute('aria-selected') === 'true' ? '●' : '·').join('')}` }))
// every page
for (let i = 0; i < pages; i++) {
  await page.evaluate(([i]) => { const t = document.querySelector('.cpg-track'); t.scrollLeft = i * t.clientWidth }, [i])
  await shot(`page-${i + 1}`, 450, clip)
}
// the match card on its own, larger
const mc = await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.screen')?.scrollTo(0, 0); const r = document.querySelector('.nm').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
await shot('match-card', 400, { x: Math.max(0, mc.x - 8), y: Math.max(0, mc.y - 8), width: mc.width + 16, height: mc.height + 16 })
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
