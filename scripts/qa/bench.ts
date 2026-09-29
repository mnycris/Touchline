// Pure engine speed: builds the sims first, then times only the simulation.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: club, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 })
const comp = w.competitions['L13-2026']
const N = Number(process.argv[2] || 120)
const ids = comp.fixtures.slice(0, N)
const t0 = Date.now()
const sims = ids.map((id) => createSim(w, w.fixtures[id], false))
const t1 = Date.now()
for (const s of sims) s.runToEnd()
const t2 = Date.now()
console.log(`setup ${((t1 - t0) / N).toFixed(2)} ms/match, engine ${((t2 - t1) / N).toFixed(2)} ms/match`)
