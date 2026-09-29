// One club's season in the engine, with its chance creation broken down by position and chance type.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const name = process.argv[2] || 'Liverpool'
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: arsenal, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 })
const club = Object.values(w.clubs).find((c) => c.name === name)!
const comp = w.competitions[`L${club.leagueId}-2026`]
const fx = comp.fixtures.map((id) => w.fixtures[id]).filter((f) => f.home === club.id || f.away === club.id)
const per: Record<string, number> = {}
let n = 0, gf = 0, shots = 0
const shooters: Record<number, { s: number; g: number; xg: number }> = {}
for (const f of fx) {
  MatchSim.dbg = {}
  const r = createSim(w, f, false).runToEnd()
  const side = f.home === club.id ? 0 : 1
  n++; gf += r.score[side]; shots += r.stats[side].shots
  for (const [k, v] of Object.entries(MatchSim.dbg)) if (k.startsWith(`s${side}.shot.`)) per[k.slice(3)] = (per[k.slice(3)] || 0) + v
  for (const p of r.players) if (p.side === side) { const x = (shooters[p.id] ||= { s: 0, g: 0, xg: 0 }); x.s += p.shots; x.g += p.goals; x.xg += p.xg }
}
console.log(`${name}: ${n} games, ${(gf / n).toFixed(2)} goals/g, ${(shots / n).toFixed(1)} shots/g`)
console.log('shots by how:', Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.slice(5)} ${(v / n).toFixed(2)}`).join('  '))
console.log('shooters:', Object.entries(shooters).sort((a, b) => b[1].s - a[1].s).slice(0, 7).map(([id, x]) => `${w.players[+id].name} ${w.players[+id].positions[0]} ${(x.s / n).toFixed(1)}sh ${x.g}g xg${x.xg.toFixed(1)}`).join(' | '))
