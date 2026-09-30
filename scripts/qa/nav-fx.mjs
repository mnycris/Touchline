// Screen transition stills: forward, back, tab switch, overlay open over overlay, overlay close; each paused at a
// few points of its animation. node scripts/qa/nav-fx.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/nav-fx'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world
  const p = Object.values(w.players).find((x) => x.clubId === w.userClubId && x.ovr >= 80)
  const played = Object.values(w.fixtures).filter((f) => f.played && f.result && (f.home === w.userClubId || f.away === w.userClubId)).sort((a, b) => b.date.localeCompare(a.date))[0]
  return { p: p.id, played: played.id }
})
async function frames(name, act) {
  // hold the snapshot in place and freeze every animation at a point, to look at the motion frame by frame
  await page.evaluate(() => { const st = window.setTimeout; window.__st = st; window.setTimeout = (f, ms, ...a) => st(f, ms >= 200 && ms <= 360 ? 60000 : ms, ...a) })
  await page.evaluate(act, ids)
  await page.waitForTimeout(40)
  for (const t of [40, 110, 180]) {
    await page.evaluate((t) => { for (const a of document.getAnimations()) { const d = a.effect?.getTiming?.(); if (d && d.iterations === Infinity) continue; a.pause(); a.currentTime = t } }, t)
    await page.screenshot({ path: `${OUT}/${name}-${t}.png` })
  }
  await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish() } catch { a.play() } } window.setTimeout = window.__st; document.querySelectorAll('.ghost').forEach((g) => g.remove()) })
  await page.waitForTimeout(300)
}
await page.evaluate(() => { const g = window.__game.getState(); g.setTab('squad') })
await page.waitForTimeout(900)
await page.evaluate(() => { const s = document.querySelector('.app > .layer .screen'); s.scrollTop = 500 })
await page.waitForTimeout(200)
await frames('1-fwd', (ids) => window.__game.getState().go({ name: 'player', params: { id: ids.p } }))
await frames('2-back', () => window.__game.getState().back())
await frames('3-tab', () => window.__game.getState().setTab('season'))
await frames('4-open', (ids) => window.__game.getState().open({ name: 'postmatch', params: { id: ids.played } }))
await frames('5-openover', (ids) => window.__game.getState().go({ name: 'player', params: { id: ids.p } }))
await frames('6-close', () => window.__game.getState().back())
await frames('7-closeall', () => window.__game.getState().closeAll())
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
