// Fits the prediction model's goal curve to simulated results (Poisson likelihood grid search).
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
const lf = (k: number) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s }
let best = { ll: -Infinity, bh: 0, ba: 0, k: 0 }
for (let bh = 1.1; bh <= 1.7; bh += 0.02) for (let ba = 0.9; ba <= 1.5; ba += 0.02) for (let k = 0.01; k <= 0.12; k += 0.004) {
  let ll = 0
  for (const r of rows) {
    const lh = bh * Math.exp(r.d * k), la = ba * Math.exp(-r.d * k)
    ll += r.a * Math.log(lh) - lh - lf(r.a) + r.b * Math.log(la) - la - lf(r.b)
  }
  if (ll > best.ll) best = { ll, bh, ba, k }
}
const m = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length
console.log(`${rows.length} matches · mean |diff| ${m((r) => Math.abs(r.d)).toFixed(2)} · goals ${m((r) => r.a).toFixed(2)}–${m((r) => r.b).toFixed(2)}`)
console.log(`best: home base ${best.bh.toFixed(2)}, away base ${best.ba.toFixed(2)}, k ${best.k.toFixed(3)} per rating point`)
