// How much does each touchline shout change a match from where it stands, and can a handful of replays tell? For a few
// of the user's matches, stopped at a few minutes: every option (no change, each shout) is played out to full time many
// times on the same luck (common seeds), measuring the rest of the match's xG for and against. The "truth" uses all
// runs; the estimate uses the first few, as a phone could afford. W/D/L comes from the current score and the rest of
// the match's xG (independent Poisson).
// npx tsx scripts/qa/forecast-lab.ts [truth-runs] [estimate-runs]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { SHOUTS, applyShouts } from '../../src/ui/shouts'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const NT = Number(process.argv[2] || 160), NE = Number(process.argv[3] || 24)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const fxs = Object.values(w.fixtures).filter((x) => x.userInvolved && w.competitions[x.compId]?.key?.startsWith('L13')).sort((a, b) => a.date.localeCompare(b.date)).slice(0, Number(process.env.FX || 3))

const fork = (src: any, seed: number) => src.fork(seed)
const pois = (l: number, k: number) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p }
function wdl(score: [number, number], lf: number, la: number) {
  let W = 0, D = 0, L = 0
  for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) {
    const p = pois(lf, a) * pois(la, b), d = score[0] + a - score[1] - b
    if (d > 0) W += p; else if (d < 0) L += p; else D += p
  }
  return [W, D, L].map((x) => Math.round(x * 100))
}
const opts = [{ id: 'none', label: 'no change' }, ...SHOUTS.map((s) => ({ id: s.id, label: s.label }))]
const MINS = (process.env.MINS || '30,65').split(',').map(Number)
for (const f of fxs) for (const M of MINS) {
  const sim: any = createSim(w, f, true)
  const us: 0 | 1 = f.home === w.userClubId ? 0 : 1
  while (!sim.finished && sim.minute < M) sim.step()
  const sc: [number, number] = [sim.score[us], sim.score[1 - us]]
  const xg0 = [sim.sides[us].stats.xg, sim.sides[1 - us].stats.xg]
  console.log(`\n${w.clubs[f.home].short} v ${w.clubs[f.away].short} at ${sim.minute}' (us ${us === 0 ? 'home' : 'away'}) score ${sc[0]}-${sc[1]}`)
  const t0 = performance.now()
  const rows: { id: string; xf: number[]; xa: number[]; res: number[] }[] = []
  for (const o of opts) {
    const xf: number[] = [], xa: number[] = [], res: number[] = []
    for (let i = 0; i < NT; i++) {
      const c = fork(sim, 7919 * (i + 1))
      if (o.id !== 'none') c.setTactics(us, applyShouts(c.sideTactics(us), [o.id as any]), false)
      while (!c.finished) c.step()
      xf.push(c.sides[us].stats.xg - xg0[0]); xa.push(c.sides[1 - us].stats.xg - xg0[1])
      res.push(Math.sign((c.score[us] - c.score[1 - us])))
    }
    rows.push({ id: o.id, xf, xa, res })
  }
  const ms = (performance.now() - t0) / (opts.length * NT)
  const mean = (a: number[], n = a.length) => a.slice(0, n).reduce((x, y) => x + y, 0) / n
  const base = rows[0]
  const bT = wdl(sc, mean(base.xf), mean(base.xa)), bE = wdl(sc, mean(base.xf, NE), mean(base.xa, NE))
  console.log(`  ${ms.toFixed(1)} ms per run · baseline W/D/L truth ${bT.join('/')} (counted ${['1', '0', '-1'].map((k) => Math.round(base.res.filter((x) => String(x) === k).length / NT * 100)).join('/')}) · estimate(${NE}) ${bE.join('/')}`)
  for (const r of rows.slice(1)) {
    const tF = mean(r.xf) - mean(base.xf), tA = mean(r.xa) - mean(base.xa)
    const eF = mean(r.xf, NE) - mean(base.xf, NE), eA = mean(r.xa, NE) - mean(base.xa, NE)
    const wT = wdl(sc, mean(r.xf), mean(r.xa)), wE = wdl(sc, mean(r.xf, NE), mean(r.xa, NE))
    console.log(`  ${r.id.padEnd(7)} xG for ${tF >= 0 ? '+' : ''}${tF.toFixed(2)} (est ${eF >= 0 ? '+' : ''}${eF.toFixed(2)})  against ${tA >= 0 ? '+' : ''}${tA.toFixed(2)} (est ${eA >= 0 ? '+' : ''}${eA.toFixed(2)})   win ${wT[0] - bT[0] >= 0 ? '+' : ''}${wT[0] - bT[0]} (est ${wE[0] - bE[0] >= 0 ? '+' : ''}${wE[0] - bE[0]})  lose ${wT[2] - bT[2] >= 0 ? '+' : ''}${wT[2] - bT[2]} (est ${wE[2] - bE[2] >= 0 ? '+' : ''}${wE[2] - bE[2]})`)
  }
}
