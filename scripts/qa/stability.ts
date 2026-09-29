// Multi-seed league stability: points spread per club across independent seasons.
// Run: npx tsx scripts/qa/stability.ts [leagueId=13] [seeds=6]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { Rng } from '../../src/domain/rng'
import { applyMatchResult, simulateFixture } from '../../src/engine/world/matchRunner'
import { sortTable } from '../../src/engine/competitions/tables'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const leagueId = Number(process.argv[2] || 13)
const S = Number(process.argv[3] || 6)
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const pts: Record<string, number[]> = {}, pos: Record<string, number[]> = {}, avg: Record<string, number> = {}
let champs: Record<string, number> = {}
for (let seed = 1; seed <= S; seed++) {
  const w = createWorld(raw, { clubId: arsenal, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: seed * 101 })
  const comp = w.competitions[`L${leagueId}-2026`]
  const rng = new Rng(seed)
  for (const id of comp.fixtures) {
    const f = w.fixtures[id]
    const r = simulateFixture(w, f)
    applyMatchResult(w, f, r, rng)
    for (const pid of r.players.map((x) => x.id)) { const p = w.players[pid]; p.fitness = Math.min(100, p.fitness + 30); if (p.injury && rng.next() < 0.3) p.injury = undefined }
  }
  sortTable(w, comp).forEach((r, i) => { const n = w.clubs[r.clubId].name; (pts[n] ||= []).push(r.pts); (pos[n] ||= []).push(i + 1); avg[n] = w.clubs[r.clubId].squadAvg; if (i === 0) champs[n] = (champs[n] || 0) + 1 })
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const sd = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)))
const names = Object.keys(pts).sort((a, b) => mean(pts[b]) - mean(pts[a]))
console.log('club'.padEnd(26) + 'avg   pts  sd   positions')
for (const n of names) console.log(n.padEnd(26) + String(avg[n]).padEnd(6) + mean(pts[n]).toFixed(0).padStart(3) + sd(pts[n]).toFixed(1).padStart(5) + '   ' + pos[n].join(' '))
console.log('champions:', Object.entries(champs).map(([k, v]) => `${k} ${v}`).join(', '))
// rank correlation between squad average and mean points
const byAvg = [...names].sort((a, b) => avg[b] - avg[a])
const rk = (arr: string[]) => Object.fromEntries(arr.map((n, i) => [n, i]))
const ra = rk(byAvg), rp = rk(names)
const d2 = names.reduce((a, n) => a + (ra[n] - rp[n]) ** 2, 0), m = names.length
console.log('Spearman(squad avg, mean pts):', (1 - (6 * d2) / (m * (m * m - 1))).toFixed(2))
