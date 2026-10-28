// Fits the light simulation's goal curve (src/engine/match/quick.ts) to the action engine: big-five league seasons played
// on the full engine, each side's XI strength read the way the light model reads it, and a Poisson likelihood for the
// base rate, the home edge, the gradient each way and the gap beyond which a bigger gap counts for less.
// npx tsx scripts/qa/quick-fit.ts [seeds e.g. 5,17]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { Rng } from '../../src/domain/rng'
import { applyMatchResult, createSim } from '../../src/engine/world/matchRunner'
import { xiStrength } from '../../src/engine/match/quick'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const seeds = (process.argv[2] || '5,17').split(',').map(Number)
const rows: { g: number; a: number; b: number }[] = []
for (const seed of seeds) {
  const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed })
  const rng = new Rng(seed)
  for (const lid of [13, 53, 19, 31, 16]) {
    for (const id of w.competitions[`L${lid}-2026`].fixtures) {
      const f = w.fixtures[id]
      if (f.userInvolved) continue
      const sim = createSim(w, f, false)
      const g = xiStrength(sim.home) - xiStrength(sim.away)
      const r = sim.runToEnd()
      applyMatchResult(w, f, r, rng)
      rows.push({ g, a: r.score[0], b: r.score[1] })
      for (const x of r.players) { const p = w.players[x.id]; p.fitness = Math.min(100, p.fitness + 30); if (p.injury && rng.next() < 0.3) p.injury = undefined }
    }
  }
}
const lf: number[] = [0]
for (let i = 1; i <= 12; i++) lf[i] = lf[i - 1] + Math.log(i)
type M = { base: number; home: number; kp: number; kn: number; knee: number; s: number }
const curve = (m: M, g: number) => { const c = Math.abs(g) > m.knee ? Math.sign(g) * (m.knee + (Math.abs(g) - m.knee) * m.s) : g; return c >= 0 ? m.kp * c : m.kn * c }
const ll = (m: M) => {
  let s = 0
  for (const r of rows) {
    const lh = m.base * Math.exp(curve(m, r.g + m.home)), la = m.base * Math.exp(curve(m, -r.g - m.home))
    s += r.a * Math.log(lh) - lh - lf[Math.min(12, r.a)] + r.b * Math.log(la) - la - lf[Math.min(12, r.b)]
  }
  return s
}
// coordinate search, each parameter over a grid around where it stands
const grid: Record<keyof M, [number, number, number]> = { base: [1.1, 1.6, 0.005], home: [0, 4, 0.1], kp: [0.02, 0.09, 0.001], kn: [0.02, 0.1, 0.001], knee: [3, 20, 0.5], s: [0.2, 1, 0.05] }
// (from the curve in use, with a knee out of reach and half weight beyond it, so that both have something to move from)
let m: M = { base: 1.38, home: 1.9, kp: 0.041, kn: 0.051, knee: 20, s: 0.5 }
let cur = ll(m)
for (let pass = 0; pass < 6; pass++) {
  for (const k of Object.keys(grid) as (keyof M)[]) {
    const [lo, hi, st] = grid[k]
    for (let v = lo; v <= hi + 1e-9; v += st) {
      const t = { ...m, [k]: v }
      const x = ll(t)
      if (x > cur) { cur = x; m = t }
    }
  }
}
const mean = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length
console.log(`${rows.length} matches · mean |gap| ${mean((r) => Math.abs(r.g)).toFixed(2)} · goals ${mean((r) => r.a).toFixed(2)}–${mean((r) => r.b).toFixed(2)}`)
console.log(`best: base ${m.base.toFixed(3)}, home ${m.home.toFixed(2)}, gradient ${m.kp.toFixed(3)} up / ${m.kn.toFixed(3)} down, beyond ${m.knee.toFixed(1)} points x${m.s.toFixed(2)} (log-likelihood ${cur.toFixed(1)})`)
// (as src/engine/match/quick.ts has it)
const was: M = { base: 1.38, home: 1.9, kp: 0.041, kn: 0.051, knee: 14, s: 0.6 }
console.log(`the curve in use now: log-likelihood ${ll(was).toFixed(1)}`)
// by gap band: goals for each side as played against the fitted curve
for (const [lo, hi] of [[-99, -10], [-10, -6], [-6, -3], [-3, 0], [0, 3], [3, 6], [6, 10], [10, 99]]) {
  const b = rows.filter((r) => r.g >= lo && r.g < hi)
  if (!b.length) continue
  const ga = b.reduce((s, r) => s + r.a, 0) / b.length, gb = b.reduce((s, r) => s + r.b, 0) / b.length
  const fa = b.reduce((s, r) => s + m.base * Math.exp(curve(m, r.g + m.home)), 0) / b.length, fb = b.reduce((s, r) => s + m.base * Math.exp(curve(m, -r.g - m.home)), 0) / b.length
  console.log(`  gap ${String(lo).padStart(3)}..${String(hi).padEnd(3)} n ${String(b.length).padStart(4)}  home ${ga.toFixed(2)} (fit ${fa.toFixed(2)})  away ${gb.toFixed(2)} (fit ${fb.toFixed(2)})`)
}
