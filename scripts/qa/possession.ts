// Possession by club over a league season (every match in the full engine, AI against AI), against the club's
// strength and how it is told to play. Real reference (2022-25): the elite possession sides keep 60-68% of the ball
// (Barcelona, City, Bayern, PSG ~63-68%), the bottom sides 38-42%.
// npx tsx scripts/qa/possession.ts [league key, L53 = LaLiga] [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'

const KEY = process.argv[2] || 'L53'
const N = Number(process.argv[3] || 380)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.key?.startsWith(KEY))!
const fxs = comp.fixtures.map((id) => w.fixtures[id]).slice(0, N)
const by: Record<number, { n: number; poss: number; passes: number; acc: number; str: number; style: string }> = {}
for (const f of fxs) {
  const sim: any = createSim(w, f, false, false)
  const r = sim.runToEnd()
  for (const i of [0, 1]) {
    const s = sim.sides[i]
    const e = (by[s.input.clubId] ||= { n: 0, poss: 0, passes: 0, acc: 0, str: 0, style: `${s.tactics.buildUp}/${s.tactics.chanceCreation}/${s.tactics.defApproach}` })
    e.n++; e.poss += r.stats[i].possession; e.passes += r.stats[i].passes; e.acc += r.stats[i].passAcc
    e.str += s.lps.filter((l: any) => l.st.started).reduce((a: number, l: any) => a + l.p.ovr, 0) / 11
  }
}
console.log(`${comp.name}: ${fxs.length} matches`)
for (const [id, e] of Object.entries(by).sort((a, b) => b[1].poss / b[1].n - a[1].poss / a[1].n)) {
  console.log(`  ${w.clubs[Number(id)].name.padEnd(28)} XI ${(e.str / e.n).toFixed(1)} · possession ${(e.poss / e.n).toFixed(1)}% · passes ${(e.passes / e.n).toFixed(0)} (${(e.acc / e.n).toFixed(0)}%) · ${e.style}`)
}
