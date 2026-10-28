// A league season team by team: goals against xG at both ends, shots, possession and points, and the top scorers'
// goals against their xG. Tells a side that creates too much from one that finishes too well.
//   npx tsx scripts/qa/lab/season-profile.ts [leagueId=53] [seed=7] [top=8]
import fs from 'node:fs'
import { createWorld } from '../../../src/data/createWorld'
import type { RawDb } from '../../../src/data/rawTypes'
import { Rng } from '../../../src/domain/rng'
import { applyMatchResult, createSim } from '../../../src/engine/world/matchRunner'
import { sortTable } from '../../../src/engine/competitions/tables'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const leagueId = Number(process.argv[2] || 53)
const seed = Number(process.argv[3] || 7)
const top = Number(process.argv[4] || 8)
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, {
  clubId: arsenal,
  manager: { firstName: 'Test', lastName: 'Manager', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
  seed,
})
const comp = w.competitions[`L${leagueId}-2026`]
const rng = new Rng(seed)
type T = { gf: number; ga: number; xgf: number; xga: number; sh: number; sha: number; poss: number; n: number; big: number }
const team: Record<number, T> = {}
const pl: Record<number, { g: number; xg: number; sh: number; mins: number; pen: number; dr: number; drOk: number; kp: number; bt: number; tch: number }> = {}
for (const id of comp.fixtures) {
  const f = w.fixtures[id]
  const r = createSim(w, f, false).runToEnd()
  applyMatchResult(w, f, r, rng)
  for (const s of [0, 1] as const) {
    const c = s === 0 ? f.home : f.away
    const t = (team[c] ||= { gf: 0, ga: 0, xgf: 0, xga: 0, sh: 0, sha: 0, poss: 0, n: 0, big: 0 })
    t.gf += r.score[s]; t.ga += r.score[1 - s]; t.xgf += r.stats[s].xg; t.xga += r.stats[1 - s].xg
    t.sh += r.stats[s].shots; t.sha += r.stats[1 - s].shots; t.poss += r.stats[s].possession; t.n++
    if (r.score[s] - r.score[1 - s] >= 3) t.big++
  }
  for (const x of r.players) {
    const q = (pl[x.id] ||= { g: 0, xg: 0, sh: 0, mins: 0, pen: 0, dr: 0, drOk: 0, kp: 0, bt: 0, tch: 0 })
    const xx = x as typeof x & { dribbles?: number; dribblesOk?: number; boxTouches?: number; touches?: number }
    q.g += x.goals; q.xg += x.xg || 0; q.sh += x.shots; q.mins += x.mins; q.dr += xx.dribbles || 0; q.drOk += xx.dribblesOk || 0; q.kp += x.keyPasses || 0; q.bt += xx.boxTouches || 0; q.tch += xx.touches || 0
  }
  for (const e of r.events) if (e.type === 'penGoal' && e.player && pl[e.player]) pl[e.player].pen++
  for (const pid of r.players.map((x) => x.id)) { const p = w.players[pid]; p.fitness = Math.min(100, p.fitness + 30); if (p.injury && rng.next() < 0.3) p.injury = undefined }
}
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2)
console.log(`${comp.name} seed ${seed}`)
console.log('club                        pts   GF  xGF  (GF/xGF)   GA  xGA  shots  against  poss  3+wins')
for (const row of sortTable(w, comp)) {
  const t = team[row.clubId], c = w.clubs[row.clubId]
  console.log(`${c.name.slice(0, 26).padEnd(26)} ${String(row.pts).padStart(4)} ${String(t.gf).padStart(4)} ${f1(t.xgf).padStart(5)}  (${f2(t.gf / t.xgf)})  ${String(t.ga).padStart(4)} ${f1(t.xga).padStart(5)}  ${f1(t.sh / t.n).padStart(5)}  ${f1(t.sha / t.n).padStart(6)}  ${f1(t.poss / t.n).padStart(5)}  ${t.big}`)
}
const all = Object.values(team)
const G = all.reduce((a, t) => a + t.gf, 0), X = all.reduce((a, t) => a + t.xgf, 0)
console.log(`league goals/xG ${f2(G / X)}`)
const sc = Object.entries(pl).sort((a, b) => b[1].g - a[1].g).slice(0, top)
console.log('\ntop scorers: goals (pens) / xG / shots · per 90: goals, shots, xG, dribbles (won %), key passes, box touches, touches')
for (const [id, q] of sc) {
  const p = w.players[Number(id)], n90 = q.mins / 90
  console.log(`  ${p.name.padEnd(22)} ${(w.clubs[p.clubId]?.short || '').padEnd(12)} ${String(q.g).padStart(3)} (${q.pen}) / ${f1(q.xg).padStart(5)} / ${String(q.sh).padStart(4)} · ${f2(q.g / n90)} ${f1(q.sh / n90)} ${f2(q.xg / n90)} ${f1(q.dr / n90)} (${Math.round((q.drOk / Math.max(1, q.dr)) * 100)}%) ${f1(q.kp / n90)} ${f1(q.bt / n90)} ${Math.round(q.tch / n90)}  ovr ${p.ovr} ${p.positions[0]}`)
}
