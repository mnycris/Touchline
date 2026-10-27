// The XI, positions and roles a club's sheet gets in each formation (buildSheet, as the landscape and Auto Pick use it),
// with the formation's slot coordinates. npx tsx scripts/qa/shape-sheets.ts <club> <formation...>
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { buildSheet } from '../../src/engine/match/selection'
import { formationOf } from '../../src/domain/constants'
const [CLUB = 'Barcelona', ...FS] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
const club = w.clubs[w.userClubId]
const base = club.sheets[0]
for (const fm of FS.length ? FS : ['4-3-3 Holding', '4-1-4-1']) {
  const s = fm === base.formation ? base : buildSheet(w, club, fm, { ...base.tactics }, { flexible: false })
  const f = formationOf(s.formation)
  console.log(`${fm}${fm === base.formation ? ' (the career sheet)' : ''}`)
  console.log('  ' + s.lineup.map((id, i) => `${f.slots[i].label}@${f.slots[i].x},${f.slots[i].y} ${w.players[id].name.split(' ').pop()} [${s.roles[i]?.role}${s.roles[i]?.focus ? '/' + s.roles[i].focus : ''}]`).join('\n  '))
}
