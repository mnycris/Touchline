// Prints the live commentary feed of one full-detail match: npx tsx scripts/qa/feed.ts [league] [fixtureIdx]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: club, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 })
const comp = w.competitions[`L${Number(process.argv[2] || 13)}-2026`]
const f = w.fixtures[comp.fixtures[Number(process.argv[3] || 0)]]
const sim = createSim(w, f, true)
const r = sim.runToEnd()
const nm = (id?: number) => (id ? w.players[id]?.name : '')
console.log(w.clubs[f.home].name, r.score.join('-'), w.clubs[f.away].name, '| xG', r.stats[0].xg, '-', r.stats[1].xg, '| poss', r.stats[0].possession, '| shots', r.stats[0].shots, '-', r.stats[1].shots)
for (const e of r.events) console.log(`${String(e.min).padStart(3)}${e.add ? '+' + e.add : '  '} ${e.type.padEnd(12)} ${e.side === -1 ? ' ' : e.side} ${e.text}${e.pen ? ' ' + JSON.stringify(e.pen) : ''}`)
const tl = (sim as any).timeline as any[]
console.log('frames', tl.length, 'acts/frame avg', (tl.reduce((a, f) => a + (f.acts?.length || 0), 0) / tl.length).toFixed(1))
const top = [...r.players].sort((a, b) => b.rating - a.rating).slice(0, 5)
console.log('top ratings:', top.map((p) => `${nm(p.id)} ${p.pos} ${p.rating} (g${p.goals} a${p.assists} tk${p.tackles} int${p.interceptions} kp${p.keyPasses} heat ${p.heat?.length})`).join(' | '))
