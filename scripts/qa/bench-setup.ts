import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { aiMatchSheet } from '../../src/engine/match/selection'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: club, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 })
const clubs = Object.values(w.clubs).slice(0, 400)
const t = Date.now()
for (let r = 0; r < 3; r++) for (const c of clubs) aiMatchSheet(w, c, w.competitions[`L${c.leagueId}-2026`])
console.log(`aiMatchSheet ${((Date.now() - t) / (clubs.length * 3)).toFixed(3)} ms`)
