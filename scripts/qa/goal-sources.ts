// Where a season's goals come from on the full match engine: each kind of goal (a pass, a break, a dribble, a corner, a
// through ball, a cross ...) by the position of the player who made it and of the player who scored it.
//   npx tsx scripts/qa/goal-sources.ts [leagueId=13] [matches=300]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: {} as any }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 } as any)
const role = (x: string) => (x === 'GK' ? 'GK' : x === 'CB' ? 'CB' : /B$/.test(x) ? 'FB' : x === 'CDM' ? 'DM' : x === 'CM' ? 'CM' : x === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(x) ? 'W' : 'ST')
const comp = w.competitions[`L${process.argv[2] || 13}-2026`]
const M: Record<string, Record<string, number>> = {}, S: Record<string, Record<string, number>> = {}
let G = 0
for (const id of comp.fixtures.slice(0, Number(process.argv[3] || 300))) {
  const r = createSim(w, w.fixtures[id], false, true).runToEnd()
  for (const e of r.events) {
    if (e.type !== 'goal') continue
    G++
    const how = (e as any).how || '?'
    const sc = r.players.find((p) => p.id === e.player)
    const as = e.player2 ? r.players.find((p) => p.id === e.player2) : undefined
    const ar = as ? role(as.pos) : '-'
    ;(M[how] ||= {})[ar] = (M[how][ar] || 0) + 1
    ;(S[how] ||= {})[sc ? role(sc.pos) : '?'] = ((S[how] ||= {})[sc ? role(sc.pos) : '?'] || 0) + 1
  }
}
const R = ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB', 'GK', '-']
console.log(`${G} open-play/set goals. Rows: how; columns: ASSIST by role (- = unassisted)`)
console.log('how        n   ' + R.map((r) => r.padStart(4)).join(''))
for (const [how, m] of Object.entries(M).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y) - Object.values(a[1]).reduce((x, y) => x + y))) {
  const n = Object.values(m).reduce((x, y) => x + y)
  console.log(`${how.padEnd(9)} ${String(n).padStart(4)}  ` + R.map((r) => String(m[r] || 0).padStart(4)).join(''))
}
console.log('\nScorer role by how')
for (const [how, m] of Object.entries(S)) console.log(`${how.padEnd(9)} ` + R.slice(0, 8).map((r) => String(m[r] || 0).padStart(4)).join(''))
