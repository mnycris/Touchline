// Fits the prediction model's goal curve to simulated results (Poisson likelihood, coordinate search): the base rate at
// each end, the rise per rating point of edge, and the edge beyond which more of it counts for less (see MISMATCH in
// src/engine/match/engine.ts).
// npx tsx scripts/qa/predict-fit.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { predictFixture } from '../../src/engine/match/predict'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 400)
const rows: { d: number; a: number; b: number }[] = []
for (const seed of [5, 17]) {
  const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed })
  const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19', 'L31', 'L16', 'L14', 'L10', 'L308'].includes(w.competitions[f.compId]?.key || '') && !f.userInvolved).slice(0, N / 2)
  for (const f of fx) {
    const p = predictFixture(w, f)
    // recover the raw strength difference (without home advantage) from the model's own inputs
    const eff = (o: typeof p.home) => o.xi + o.form * 1.6 - Math.max(0, 88 - o.fitness) * 0.12
    const r = simulateFixture(w, f, true)
    rows.push({ d: eff(p.home) - eff(p.away), a: r.score[0], b: r.score[1] })
  }
}
const lf: number[] = [0]
for (let i = 1; i <= 12; i++) lf[i] = lf[i - 1] + Math.log(i)
type M = { bh: number; ba: number; k: number; knee: number; s: number }
const edge = (m: M, d: number) => (Math.abs(d) > m.knee ? Math.sign(d) * (m.knee + (Math.abs(d) - m.knee) * m.s) : d)
const ll = (m: M) => {
  let s = 0
  for (const r of rows) {
    const e = edge(m, r.d), lh = m.bh * Math.exp(e * m.k), la = m.ba * Math.exp(-e * m.k)
    s += r.a * Math.log(lh) - lh - lf[Math.min(12, r.a)] + r.b * Math.log(la) - la - lf[Math.min(12, r.b)]
  }
  return s
}
const grid: Record<keyof M, [number, number, number]> = { bh: [1, 1.8, 0.01], ba: [0.8, 1.6, 0.01], k: [0.01, 0.12, 0.001], knee: [3, 20, 0.5], s: [0.2, 1, 0.05] }
// the curve src/engine/match/predict.ts uses (it has no knee: on league football the knee doesn't earn its place)
const now: M = { bh: 1.42, ba: 1.16, k: 0.046, knee: 99, s: 1 }
/** Coordinate search over the given parameters, from a starting curve. */
function fit(from: M, keys: (keyof M)[]): [M, number] {
  let best = from, cur = ll(best)
  for (let pass = 0; pass < 6; pass++) {
    for (const key of keys) {
      const [lo, hi, st] = grid[key]
      for (let v = lo; v <= hi + 1e-9; v += st) {
        const t = { ...best, [key]: v }
        const x = ll(t)
        if (x > cur) { cur = x; best = t }
      }
    }
  }
  return [best, cur]
}
// (from a knee out of reach and half weight beyond it, so that both have something to move from)
const [best, cur] = fit({ ...now, knee: 20, s: 0.5 }, ['bh', 'ba', 'k', 'knee', 's'])
const [plain, plainLl] = fit(now, ['bh', 'ba', 'k'])
const m = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length
console.log(`${rows.length} matches · mean |diff| ${m((r) => Math.abs(r.d)).toFixed(2)} · goals ${m((r) => r.a).toFixed(2)}–${m((r) => r.b).toFixed(2)}`)
console.log(`best: home base ${best.bh.toFixed(2)}, away base ${best.ba.toFixed(2)}, k ${best.k.toFixed(3)} per rating point, beyond ${best.knee.toFixed(1)} points x${best.s.toFixed(2)} (log-likelihood ${cur.toFixed(1)})`)
console.log(`without the knee: home base ${plain.bh.toFixed(2)}, away base ${plain.ba.toFixed(2)}, k ${plain.k.toFixed(3)} (log-likelihood ${plainLl.toFixed(1)}); the curve in use now ${ll(now).toFixed(1)}`)
