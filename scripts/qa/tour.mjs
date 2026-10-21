// A photographic tour of the main screens in a saved career, for a polish pass: each screen top, and a screen further
// down. Needs the dev server: node scripts/qa/tour.mjs <save> <out-dir>   (env W sets the width)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-tour'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE, { width: Number(process.env.W || 390) })
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world
  const ps = Object.values(w.players).filter((p) => p.clubId === w.userClubId).sort((a, b) => b.ovr - a.ovr)
  const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(w.userClubId))
  return { p: ps[0].id, p2: ps[ps.length - 1].id, club: w.userClubId, other: lg.clubs.find((c) => c !== w.userClubId), comp: lg.id }
})
const shots = [
  ['central', { tab: 'central' }], ['squad', { tab: 'squad' }], ['transfers', { tab: 'transfers' }], ['academy', { tab: 'academy' }], ['season', { tab: 'season' }],
  ['player', { name: 'player', params: { id: ids.p } }], ['player-young', { name: 'player', params: { id: ids.p2 } }],
  ['club', { name: 'club', params: { id: ids.other } }], ['comp', { name: 'comp', params: { id: ids.comp } }],
  ['calendar', { name: 'calendar' }], ['news', { name: 'news' }], ['inbox', { name: 'inbox' }], ['office', { name: 'office' }],
  ['manager', { name: 'manager' }], ['tactics', { name: 'tactics' }], ['training', { name: 'training' }], ['contracts', { name: 'contracts' }],
  ['squadStatus', { name: 'squadStatus' }], ['scouting', { name: 'scouting' }], ['prematch', { name: 'prematch' }],
]
for (const [label, r] of shots) {
  await page.evaluate((r) => { const g = window.__game.getState(); g.closeAll(); if (r.tab) g.setTab(r.tab); else { g.setTab('central'); g.go(r) } }, r)
  await page.waitForTimeout(1300)
  await page.screenshot({ path: `${OUT}/${label}-0.png` })
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 760 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${label}-1.png` })
}
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
