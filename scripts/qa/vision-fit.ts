// Does a way of playing beat its squad? League seasons on the full engine, then each club's points against what its
// squad strength predicts (a straight line through all clubs), averaged by its manager's vision.
//   npx tsx scripts/qa/vision-fit.ts [seed] [leagues e.g. 13,53,19,31,16]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { Rng } from '../../src/domain/rng'
import { applyMatchResult, createSim } from '../../src/engine/world/matchRunner'
import { sortTable } from '../../src/engine/competitions/tables'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const seed = Number(process.argv[2] || 7)
const leagues = (process.argv[3] || '13,53,19,31,16').split(',').map(Number)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: {} as any }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' }, seed } as any)
const rng = new Rng(seed)
const rows: { club: string; vision: string; avg: number; ppg: number; gd: number }[] = []
for (const id of leagues) {
  const comp = w.competitions[`L${id}-2026`]
  if (!comp) continue
  for (const fid of comp.fixtures) {
    const f = w.fixtures[fid]
    applyMatchResult(w, f, createSim(w, f, false).runToEnd(), rng)
    for (const p of Object.values(w.players)) if (p.clubId === f.home || p.clubId === f.away) { p.fitness = Math.min(100, p.fitness + 30); p.injury = undefined }
  }
  const table = sortTable(w, comp) as any[]
  for (const r of table) {
    const c = w.clubs[r.clubId]
    rows.push({ club: c.short, vision: w.managers[c.managerId]?.vision || '?', avg: c.squadAvg, ppg: r.pts / Math.max(1, r.p), gd: (r.gf - r.ga) / Math.max(1, r.p) })
  }
}
// least squares points per game on squad strength
const n = rows.length, mx = rows.reduce((a, r) => a + r.avg, 0) / n, my = rows.reduce((a, r) => a + r.ppg, 0) / n
const b = rows.reduce((a, r) => a + (r.avg - mx) * (r.ppg - my), 0) / rows.reduce((a, r) => a + (r.avg - mx) ** 2, 0)
const res = (r: (typeof rows)[number]) => r.ppg - (my + b * (r.avg - mx))
console.log(`${n} clubs · points per game rise ${b.toFixed(3)} per squad point`)
const byV: Record<string, number[]> = {}
for (const r of rows) (byV[r.vision] ||= []).push(res(r))
for (const [v, xs] of Object.entries(byV).sort((a, b2) => b2[1].length - a[1].length)) console.log(`${v.padEnd(16)} ${String(xs.length).padStart(3)} clubs · over/under expected: ${(xs.reduce((a, x) => a + x, 0) / xs.length * 38).toFixed(1).padStart(5)} points a season`)
