// Goalkeeper match ratings against the rest of the team and against what happened to him: by goals conceded, by how
// much he had to do (shots on target, the xG on target he faced) and by goals prevented (xGOT faced − conceded).
// Full engine (as your own matches are played) and the quick engine (the rest of the world).
// npx tsx scripts/qa/gk-ratings.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
import { RGROUP } from '../../src/engine/match/rating'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 240)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19', 'L31', 'L16'].includes(w.competitions[f.compId]?.key || '')).slice(0, N)
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
type Row = { r: number; ga: number; sv: number; xgot: number; res: number }
function report(name: string, gk: Row[], out: Record<string, number[]>) {
  console.log(`\n== ${name}: ${gk.length} keepers (90 min)`)
  console.log('mean rating by group:', Object.entries(out).map(([g, a]) => `${g} ${mean(a).toFixed(2)}`).join(' · '), `· GK ${mean(gk.map((x) => x.r)).toFixed(2)}`)
  const by = (k: (x: Row) => string, label: string) => {
    const m = new Map<string, Row[]>()
    for (const x of gk) (m.get(k(x)) || m.set(k(x), []).get(k(x))!).push(x)
    console.log(label)
    for (const [key, a] of [...m.entries()].sort()) console.log(`  ${key.padEnd(10)} n=${String(a.length).padStart(4)}  rating ${mean(a.map((x) => x.r)).toFixed(2)}  (min ${Math.min(...a.map((x) => x.r)).toFixed(1)}, max ${Math.max(...a.map((x) => x.r)).toFixed(1)})  saves ${mean(a.map((x) => x.sv)).toFixed(1)}`)
  }
  by((x) => `${Math.min(x.ga, 4)}${x.ga >= 4 ? '+' : ''} conc`, 'by goals conceded:')
  by((x) => { const p = x.xgot - x.ga; return p >= 1 ? 'a +1' : p >= 0.3 ? 'b +0.3' : p > -0.3 ? 'c ~0' : p > -1 ? 'd -0.3' : 'e -1' }, 'by goals prevented (xGOT faced - conceded):')
  by((x) => (x.res > 0 ? 'win' : x.res < 0 ? 'loss' : 'draw'), 'by result:')
  const hi = gk.filter((x) => x.r >= 7.5).length / gk.length, lo = gk.filter((x) => x.r < 6.3).length / gk.length
  console.log(`share >= 7.5: ${(hi * 100).toFixed(0)}%   share < 6.3: ${(lo * 100).toFixed(0)}%`)
}
for (const mode of ['full', 'quick'] as const) {
  const gk: Row[] = []
  const out: Record<string, number[]> = {}
  for (const f of fx) {
    if (mode === 'full') {
      const sim: any = createSim(w, f, false, true)
      const res = sim.runToEnd()
      for (const s of sim.sides) for (const l of s.lps) {
        if (l.st.mins < 88) continue
        const ga = res.score[1 - s.idx], gf = res.score[s.idx]
        if (l.pos === 'GK') gk.push({ r: l.st.rating, ga, sv: l.st.saves, xgot: l.st.xgotFaced || 0, res: Math.sign(gf - ga) })
        else (out[RGROUP[l.pos as keyof typeof RGROUP]] ||= []).push(l.st.rating)
      }
    } else {
      const res: any = simulateFixture(w, f, false)
      for (const p of res.players || []) {
        if (p.mins < 88) continue
        const ga = res.score[1 - p.side], gf = res.score[p.side]
        if (p.pos === 'GK') gk.push({ r: p.rating, ga, sv: p.saves, xgot: p.xgotFaced || 0, res: Math.sign(gf - ga) })
        else (out[RGROUP[p.pos as keyof typeof RGROUP]] ||= []).push(p.rating)
      }
    }
  }
  report(mode, gk, out)
}
