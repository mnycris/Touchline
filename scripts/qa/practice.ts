// Tactical practice: run practice matches with the manager's tactics against each sparring style, print the report,
// and check the career is untouched afterwards. npx tsx scripts/qa/practice.ts <save>
import fs from 'node:fs'
import crypto from 'node:crypto'
import { deserialize } from '../../src/services/saves'
import { createPractice, practiceOpponent, practiceReport, PRACTICE_STYLES, howLabel } from '../../src/engine/world/practice'
const w = deserialize(fs.readFileSync(process.argv[2]))
const hash = () => crypto.createHash('sha1').update(JSON.stringify(w)).digest('hex')
const before = hash()
const club = w.clubs[w.userClubId]
const tactics = { ...club.sheets.find((s) => s.id === club.activeSheet)!.tactics }
const opp = practiceOpponent(w, 'similar')
console.log(`${club.name} (${club.squadAvg}) vs ${w.clubs[opp].name} (${w.clubs[opp].squadAvg})`)
for (const st of PRACTICE_STYLES) {
  const t0 = Date.now()
  const sims = Array.from({ length: 10 }, (_, i) => { const { sim } = createPractice(w, tactics, opp, st.id, 1234 + i); sim.runToEnd(); return sim })
  const r = practiceReport(sims)
  const S = r.stats[0]
  console.log(`\n${st.label.padEnd(16)} ${r.record.join('-')} (W-D-L) avg ${r.score[0]}-${r.score[1]} · poss ${S.possession}% · shots ${S.shots} (xG ${S.xg.toFixed(2)}) v ${r.stats[1].shots} (${r.stats[1].xg.toFixed(2)}) · thirds ${r.thirds.join('/')} · entries ${r.entries} L/C/R ${r.lanes.join('/')} · won ${r.won.join('/')} · move ${r.moveLength} · fwd ${r.forward}% long ${r.longShare}% · energy ${r.energy} · ${Date.now() - t0}ms`)
  console.log('  chances: ' + r.chances.map((c) => `${howLabel(c.how)} ${c.shots}/${c.xg.toFixed(2)}`).join(', ') + ' | against: ' + r.against.map((c) => `${howLabel(c.how)} ${c.shots}/${c.xg.toFixed(2)}`).join(', '))
  console.log('  hub ' + (r.hub ? `${w.players[r.hub.id].name} ${r.hub.touches}` : '-') + ' · creator ' + (r.creator ? `${w.players[r.creator.id].name} ${r.creator.keyPasses}` : '-') + ' · shooter ' + (r.shooter ? `${w.players[r.shooter.id].name} ${r.shooter.shots}` : '-'))
  for (const n of r.notes) console.log('  • ' + n)
}
console.log(`\ncareer untouched: ${hash() === before ? 'yes' : 'NO — the world changed'}`)
