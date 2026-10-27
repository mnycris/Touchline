// Switching tabs on pages whose tab bar sits under a hero (a competition, a player): scrolled well down one tab, the
// next one should open at its own beginning, right under the pinned bar, not at the old scroll position and not back
// above the hero. node scripts/qa/tab-scroll.mjs <save> <out-dir>   (dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-tabscroll'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
const routes = await page.evaluate(() => {
  const w = window.__game.getState().world
  const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(w.userClubId))
  const star = Object.values(w.players).filter((p) => p.clubId === w.userClubId).sort((a, b) => b.ovr - a.ovr)[0]
  return [{ name: 'comp', params: { id: lg.id } }, { name: 'player', params: { id: star.id } }, { name: 'club', params: { id: w.userClubId } }]
})
for (const r of routes) {
  await page.evaluate((r) => window.__game.getState().go(r), r)
  await page.waitForTimeout(1200)
  const tabs = page.locator('.screen .tabs .tab')
  const k = await tabs.count()
  if (k < 2) { console.log(r.name, 'no tabs'); continue }
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 1400 })
  await page.waitForTimeout(400)
  const before = await page.evaluate(() => [...document.querySelectorAll('.screen')].pop().scrollTop)
  await tabs.nth(1).click()
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.screen')].pop()
    const bar = s.querySelector('.tabs')
    const b = bar.getBoundingClientRect(), box = s.getBoundingClientRect()
    return { top: s.scrollTop, barTop: Math.round(b.top - box.top), barBottom: Math.round(b.bottom - box.top) }
  })
  console.log(`${r.name}: scrolled to ${before}, after switching ${after.top} (bar at ${after.barTop}-${after.barBottom}px from the top)`)
  await page.screenshot({ path: `${OUT}/${r.name}.png` })
}
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
