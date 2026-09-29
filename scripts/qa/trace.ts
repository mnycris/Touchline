// Prints the first minutes of one match action by action (team frame of the acting side).
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: club, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 })
const comp = w.competitions[`L${Number(process.argv[2] || 13)}-2026`]
MatchSim.trace = []
const f = w.fixtures[comp.fixtures[Number(process.argv[3] || 0)]]
const sim = createSim(w, f, true)
sim.runToEnd()
console.log(w.clubs[f.home].name, 'v', w.clubs[f.away].name)
console.log(MatchSim.trace.slice(0, Number(process.argv[4] || 150)).join('\n'))
