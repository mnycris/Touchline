// Domestic cup brackets in a save: every round's pool, ties and byes, and whether the rounds from the last entry
// onward halve cleanly to a two-club final (no club walking through on byes). npx tsx scripts/qa/cups.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
const w = deserialize(fs.readFileSync(process.argv[2]))
let bad = 0
for (const c of Object.values(w.competitions).filter((x) => x.format === 'cup' && x.season === w.season && !x.intl)) {
  const rows = c.rounds.map((r) => (r.drawn ? `${r.name} ${r.pool?.length}→${(r.pool?.length || 0) - r.fixtures.length / r.legs}` : `${r.name} –`))
  const last = c.rounds[c.rounds.length - 1]
  const issues: string[] = []
  c.rounds.forEach((r, i) => {
    if (!r.drawn || !r.pool) return
    const left = r.pool.length - r.fixtures.length / r.legs
    // later rounds only halve, so an odd count after a round (or going into one) leaves someone walking through on byes
    if (i > 0 && r.pool.length % 2) issues.push(`${r.name} drawn with ${r.pool.length} clubs`)
    else if (i < c.rounds.length - 1 && left > 1 && left % 2) issues.push(`${left} left after the ${r.name}`)
  })
  if (last.drawn && last.pool && last.pool.length !== 2) issues.push(`final has ${last.pool.length} clubs`)
  const user = c.clubs.includes(w.userClubId) ? (c.fixtures.some((id) => { const f = w.fixtures[id]; return f.home === w.userClubId || f.away === w.userClubId }) ? 'you play in it' : 'you are entered, no tie yet') : ''
  if (issues.length) bad++
  console.log(`${c.key.padEnd(8)} ${c.clubs.length} clubs · ${rows.join(' · ')}${user ? ` · ${user}` : ''}${issues.length ? `  ✗ ${issues.join('; ')}` : '  ✓'}`)
}
console.log(bad ? `${bad} cup(s) out of shape` : 'all cups in shape')
