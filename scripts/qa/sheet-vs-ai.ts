// The manager's team sheet as a career starts it, beside the sheet the AI picks for the same club and match: who plays
// where, in what role, and the squad's best players by position. npx tsx scripts/qa/sheet-vs-ai.ts <club>
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { aiMatchSheet } from '../../src/engine/match/selection'
import { matchUp } from '../../src/engine/world/matchRunner'
import { formationOf } from '../../src/domain/constants'
import { rosterOf } from '../../src/engine/world/roster'
const CLUB = process.argv[2] || 'Barcelona'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
const club = w.clubs[w.userClubId]
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fx = comp.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id).sort((a, b) => a.date.localeCompare(b.date))[0]
const show = (label: string, s: { formation: string; lineup: number[]; bench: number[]; roles: { role: string }[]; tactics: object }) => {
  const f = formationOf(s.formation)
  console.log(`${label}: ${s.formation}`)
  console.log('  ' + s.lineup.map((id, i) => { const p = w.players[id]; return `${f.slots[i].label} ${p.name.split(' ').pop()} ${p.ovr}${p.positions[0] !== f.slots[i].pos ? `(${p.positions.join('/')})` : ''} ${s.roles[i]?.role || ''}` }).join(' · '))
  console.log('  bench: ' + s.bench.map((id) => `${w.players[id].name.split(' ').pop()} ${w.players[id].ovr} ${w.players[id].positions[0]}`).join(', '))
  console.log('  tactics: ' + JSON.stringify(s.tactics))
}
show('yours', club.sheets[0] as never)
const us = fx.home === club.id ? 0 : 1
w.userClubId = -1 as never
show(`AI v ${w.clubs[us ? fx.home : fx.away].short}`, aiMatchSheet(w, club, comp, matchUp(fx, us as 0 | 1)) as never)
console.log('squad by OVR: ' + [...rosterOf(w, club.id)].sort((a, b) => b.ovr - a.ovr).slice(0, 26).map((p) => `${p.name.split(' ').pop()} ${p.ovr} ${p.positions.join('/')}`).join(', '))
