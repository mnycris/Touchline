// Out of position where the manager meets it: a save's first team with one player in each degree of it (a position he
// can play, out of position, unsuited), on the team sheet, in the match-day line-ups (both teams) and in Manage during
// the live match, each cropped. node scripts/qa/oop-contexts.mjs <save on or before a match day> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-oop-contexts'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
// one of each degree: for levels 1, 2 and 3, a squad player not in the XI who would be that far from his game in some
// XI slot, put there
const made = await page.evaluate(async () => {
  const { suitability } = await import('/src/domain/ratings.ts')
  const { formationOf } = await import('/src/domain/constants.ts')
  const g = window.__game.getState(), w = g.world, club = w.clubs[w.userClubId]
  const s = club.sheets.find((x) => x.id === club.activeSheet) || club.sheets[0]
  const f = formationOf(s.formation)
  const squad = Object.values(w.players).filter((p) => p.clubId === club.id && !p.academy && !p.injury && !p.suspensions.length)
  const out = []
  const used = new Set()
  for (const lv of [1, 2, 3]) {
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
  return out
})
console.log(made.join('\n'))
await page.evaluate(() => { const s = window.__game.getState(); s.closeAll(); s.go({ name: 'tactics' }) })
await page.waitForTimeout(1200)
const crop = async (sel, name) => {
  const el = page.locator(sel).first()
  if (!(await el.count())) return console.log(`${name}: ${sel} not found`)
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  const b = await el.boundingBox()
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: b.x, y: Math.max(0, b.y), width: b.width, height: Math.min(b.height, 760) } })
}
await crop('.fl-pitch', '1-team-sheet')
// the match day's line-ups, both teams
await page.evaluate(() => { const s = window.__game.getState(); s.closeAll(); s.open({ name: 'prematch' }) })
await page.waitForTimeout(1200)
await page.locator('.tab', { hasText: /Line-ups/i }).first().click().catch(() => {})
await page.waitForTimeout(900)
await crop('.overlay .fl-pitch', '2-matchday-lineups')
// one of them tapped: his sheet, with why the position costs him
const moved = page.locator('.overlay .fl-pl:has(.fl-oop)').first()
if (await moved.count()) {
  await moved.scrollIntoViewIfNeeded()
  await moved.click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/2b-player-sheet.png` })
  await page.locator('.sheet [aria-label="Close"]').first().click().catch(() => {})
  await page.waitForTimeout(500)
}
// the live match, Manage
await page.getByRole('button', { name: /Play match|Kick off/ }).first().click().catch(() => {})
await page.waitForTimeout(1500)
const manage = page.getByRole('button', { name: /Manage/ }).first()
if (await manage.count()) {
  await manage.click()
  await page.waitForTimeout(700)
  await page.locator('.seg button', { hasText: /^Subs/ }).first().click().catch(() => {})
  await page.waitForTimeout(800)
  await crop('.sheet .fl-pitch, .fl-pitch', '3-live-manage')
} else console.log('no live match to manage from here')
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
