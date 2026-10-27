// Who passes to whom: one club's league matches, completed passes by the passer's position group and the receiver's,
// where on the pitch the ball goes to each group, and each group's share of the passes received, against the real
// game's (top-flight sides 2022-25, FBref per-90 averages: the centre-backs and the holding midfielder see the most of
// it, the number 10 and the wingers less, the striker least).
// npx tsx scripts/qa/pass-map.ts <club> [matches=30]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'

const CLUB = process.argv[2] || 'Barcelona'
const N = Number(process.argv[3] || 30)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const club = w.clubs[w.userClubId]
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = lg.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
const G = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'] as const
const mat: Record<string, Record<string, number>> = {}
const recvX: Record<string, number[]> = {}
let us: 0 | 1 = 0
const proto = MatchSim.prototype as any
const log0 = proto.log
proto.log = function (k: string, s: 0 | 1, p: any, from: any, to: any, ok: boolean, q?: any) {
  if (s === us && q && ok && (k === 'pass' || k === 'long')) {
    ;(mat[p.g] ||= {})[q.g] = (mat[p.g][q.g] || 0) + 1
    ;(recvX[q.g] ||= []).push(to.x)
  }
  return log0.call(this, k, s, p, from, to, ok, q)
}
const touches: Record<string, { t: number; mins: number }> = {}
let poss = 0
for (let i = 0; i < N; i++) {
  const fx = fxs[i % fxs.length]
  w.meta.seed = 2000 + i
  us = fx.home === club.id ? 0 : 1
  const sim: any = createSim(w, fx, true, true)
  sim.runToEnd()
  poss += sim.sides[us].stats.possession
  for (const l of sim.sides[us].lps) { if (!l.st.mins) continue; const e = (touches[l.g] ||= { t: 0, mins: 0 }); e.t += l.st.touches; e.mins += l.st.mins }
}
console.log(`${club.name}, ${N} league matches as the AI sets them up · possession ${(poss / N).toFixed(0)}%`)
console.log('completed passes a match, passer (rows) to receiver (columns)')
console.log('       ' + G.map((g) => g.padStart(6)).join('') + '   total')
for (const a of G) {
  const row = mat[a] || {}
  const tot = Object.values(row).reduce((x, y) => x + y, 0)
  if (!tot) continue
  console.log(a.padEnd(7) + G.map((g) => ((row[g] || 0) / N).toFixed(1).padStart(6)).join('') + (tot / N).toFixed(1).padStart(8))
}
const recv: Record<string, number> = {}
for (const a of Object.values(mat)) for (const [g, n] of Object.entries(a)) recv[g] = (recv[g] || 0) + n
const all = Object.values(recv).reduce((x, y) => x + y, 0)
console.log('\nreceived, share of the side\'s passes · where (mean x, 0 own goal to 100 theirs) · touches per 90 per player')
for (const g of G) {
  const xs = recvX[g] || []
  const t = touches[g]
  console.log(`  ${g.padEnd(3)} ${String(Math.round(((recv[g] || 0) / all) * 100)).padStart(3)}%  at ${(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(0).padStart(3)}  ·  touches ${t ? ((t.t / t.mins) * 90).toFixed(0) : '-'}`)
}
