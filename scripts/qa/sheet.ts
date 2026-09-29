// Prints the AI team sheets of named clubs.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { aiMatchSheet } from '../../src/engine/match/selection'
import { posRating } from '../../src/domain/ratings'
import { formationOf } from '../../src/domain/constants'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: club, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 7 })
for (const name of process.argv.slice(2)) {
  const c = Object.values(w.clubs).find((x) => x.name === name)!
  const comp = w.competitions[`L${c.leagueId}-2026`]
  const sh = aiMatchSheet(w, c, comp)
  console.log(`\n${c.name} ${sh.formation}`, JSON.stringify(sh.tactics), 'mgr', w.managers[c.managerId]?.vision)
  sh.lineup.forEach((id, i) => { const p = w.players[id]; console.log(`  ${i} ${sh.roles[i]?.role?.padEnd(22)} ${sh.roles[i]?.focus?.padEnd(9)} ${p.name.padEnd(24)} ${p.positions.join('/')} ovr ${p.ovr} at-slot ${posRating(p, formationOf(sh.formation).slots[i].pos)}`) })
}
