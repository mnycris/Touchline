// The assistant's read of different squads: the way of playing each one suits and why, so the advice can be checked
// against what is known about the teams (a pressing side, a counter-attacking one, a possession one, a direct one).
//   npx tsx scripts/qa/team-advice.ts <save> [club short names...]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { buildSheet, mainSheet } from '../../src/engine/match/selection'
import { recommendedStyle, standingOf, styleFits } from '../../src/ui/teamAdvice'
import { DEFAULT_TACTICS } from '../../src/domain/constants'

const [file, ...names] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
migrateSave(w)
const want = names.length ? names : ['Arsenal', 'Man City', 'Liverpool', 'Real Madrid', 'Barça', 'Bayern', 'Leverkusen', 'Atlético', 'Inter', 'Burnley', 'Brentford', 'Everton', 'Crystal Palace', 'Palace', 'Ipswich', 'Sunderland', 'Getafe', 'Union Berlin']
for (const n of want) {
  const c = Object.values(w.clubs).find((x) => (x.short === n || x.name === n) && !x.national)
  if (!c) continue
  const s = c.id === w.userClubId ? mainSheet(c) : buildSheet(w, c, c.sheets?.[0]?.formation || '4-3-3 Holding', DEFAULT_TACTICS)
  const fits = styleFits(w, s)
  const rec = recommendedStyle(fits, standingOf(w, c.id)).fit
  console.log(`${c.short.padEnd(14)} ${standingOf(w, c.id).toFixed(2)} → ${rec.name.padEnd(15)} ${fits.filter((f) => f.name !== 'Balanced').map((f) => `${f.name.slice(0, 9)} ${f.score.toFixed(2)}`).join(' | ')}`)
  console.log(`${''.padEnd(17)}${rec.why}${rec.weak ? `  [gap: ${rec.weak}]` : ''}`)
}
