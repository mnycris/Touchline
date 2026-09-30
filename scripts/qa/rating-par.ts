// Calibrates the rating model's positional par: the rating points an average player earns per 90 in each group from
// his work, goals and assists aside (those are what lift a performance above par).
// npx tsx scripts/qa/rating-par.ts [matches]  → prints PAR values to paste into src/engine/match/rating.ts
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { GAIN, RG_LIST, RP, type RG } from '../../src/engine/match/rating'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 200)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19', 'L31', 'L16'].includes(w.competitions[f.compId]?.key || '')).slice(0, N)
const acc: Record<string, number[]> = {}
Object.assign(RP, { goal: 0, goalXgMul: 0, assist: 0 })
for (const f of fx) {
  const sim: any = createSim(w, f, false, true)
  sim.runToEnd()
  for (const s of sim.sides) for (const l of [...s.lps, ...s.bench]) {
    const mins = l.st.mins
    if (mins < 60) continue
    // players who spent (almost) the whole time in one group
    const g = (Object.entries(l.gm as Record<RG, number>).find(([, m]) => m >= mins * 0.9) || [])[0]
    if (g) (acc[g] ||= []).push((l.rp / GAIN[g as RG] / mins) * 90)
  }
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) }
console.log(`${fx.length} matches`)
for (const g of RG_LIST) if (acc[g]) console.log(`${g.padEnd(3)} n=${String(acc[g].length).padStart(4)}  rp/90 mean ${mean(acc[g]).toFixed(3)}  sd ${sd(acc[g]).toFixed(3)}`)
console.log('PAR = {', RG_LIST.map((g) => `${g}: ${mean(acc[g] || [0]).toFixed(2)}`).join(', '), '}')
