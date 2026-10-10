// Print the AI match sheet a club would pick: formation, tactics, the XI by slot with natural positions and ratings.
// npx tsx scripts/qa/lab/sheet.ts Chelsea "Aston Villa"
import { freshWorld } from '../engine-lab'
import { sideInput } from '../../../src/engine/world/matchRunner'
import { posRating } from '../../../src/domain/ratings'
const w = freshWorld()
for (const name of process.argv.slice(2)) {
  const c = Object.values(w.clubs).find((x) => !x.national && (x.short === name || x.name.includes(name)))!
  const comp = Object.values(w.competitions).find((x) => x.format === 'league' && x.clubs.includes(c.id))
  const s = sideInput(w, c.id, comp, false)
  const t = s.sheet.tactics
  console.log(`\n${c.name} (${c.squadAvg}) ${s.sheet.formation}  ${JSON.stringify(t)}`)
  s.sheet.lineup.forEach((id, i) => {
    const p = s.players[id]
    const r = s.sheet.roles?.[i]
    const slotPos = (s as any).slots?.[i]?.pos
    console.log(`  ${String(i).padStart(2)} ${p.name.padEnd(26)} ovr ${p.ovr} nat ${p.positions.join('/').padEnd(12)} role ${r?.role || '-'} ${r?.focus || ''}`)
  })
}
