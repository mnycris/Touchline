// Calibration of the pre-match prediction against simulated results. npx tsx scripts/qa/predict.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { predictFixture } from '../../src/engine/match/predict'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 200)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 5 })
const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19', 'L31', 'L16'].includes(w.competitions[f.compId]?.key || '') && !f.userInvolved).slice(0, N)
let brier = 0, gH = 0, gA = 0, xH = 0, xA = 0, hit = 0
const bins: Record<string, [number, number]> = {}
for (const f of fx) {
  const p = predictFixture(w, f)
  const r = simulateFixture(w, f, true)
  const [a, b] = r.score
  const o = a > b ? [1, 0, 0] : a === b ? [0, 1, 0] : [0, 0, 1]
  brier += (p.pHome - o[0]) ** 2 + (p.pDraw - o[1]) ** 2 + (p.pAway - o[2]) ** 2
  gH += a; gA += b; xH += p.home.xg; xA += p.away.xg
  const fav = p.pHome >= p.pAway ? 0 : 2
  if (o[fav]) hit++
  const k = (Math.floor(p.pHome * 10) / 10).toFixed(1)
  bins[k] = [(bins[k]?.[0] || 0) + o[0], (bins[k]?.[1] || 0) + 1]
}
console.log(`${fx.length} matches · goals home ${(gH / fx.length).toFixed(2)} (pred ${(xH / fx.length).toFixed(2)}) away ${(gA / fx.length).toFixed(2)} (pred ${(xA / fx.length).toFixed(2)})`)
console.log(`Brier ${(brier / fx.length).toFixed(3)} (always 45/27/28 ≈ 0.64) · favourite wins ${(hit / fx.length * 100).toFixed(0)}%`)
console.log('home-win calibration:', Object.entries(bins).sort().map(([k, [w_, n]]) => `${k}: ${(w_ / n * 100).toFixed(0)}% of ${n}`).join(' | '))
