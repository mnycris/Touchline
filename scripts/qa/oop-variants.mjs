// Out-of-position treatments side by side on a real team sheet: a save's first team with one player out of position
// and one unsuited (found with the game's own suitability), the pitch cropped under each treatment, set as
// html[data-oop] for CSS written against it while trying them. node scripts/qa/oop-variants.mjs <save> <out-dir> a,b,...
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-oop', VARS = 't1'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
console.log((await page.evaluate(async () => {
  const { suitability } = await import('/src/domain/ratings.ts')
  const { formationOf } = await import('/src/domain/constants.ts')
  const g = window.__game.getState(), w = g.world, club = w.clubs[w.userClubId]
  const s = club.sheets.find((x) => x.id === club.activeSheet) || club.sheets[0]
  const f = formationOf(s.formation)
  const squad = Object.values(w.players).filter((p) => p.clubId === club.id && !p.academy && !p.injury && !p.suspensions.length)
  const out = [], used = new Set()
  for (const lv of [2, 3]) {
    let done = false
    for (let i = 1; i < 11 && !done; i++) {
      if (used.has(i)) continue
      for (const p of squad) {
        if (s.lineup.includes(p.id) || s.bench.includes(p.id)) continue
        if (suitability(p, f.slots[i].pos).level === lv) { out.push(`${p.name} (${p.positions[0]}) at ${f.slots[i].pos}: level ${lv}`); s.lineup[i] = p.id; used.add(i); done = true; break }
      }
    }
  }
  g.mutate(() => {}, { save: false })
  g.closeAll(); g.go({ name: 'tactics' })
  return out
})).join('\n'))
await page.waitForTimeout(1300)
const pitch = page.locator('.fl-pitch').first()
await pitch.scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
for (const v of VARS.split(',')) {
  await page.evaluate((v) => { document.documentElement.dataset.oop = v }, v)
  await page.waitForTimeout(300)
  const b = await pitch.boundingBox()
  await page.screenshot({ path: `${OUT}/${v}.png`, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 620) } })
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
