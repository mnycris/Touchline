// Does the momentum graph show what happened? Over many matches, in ten-minute spells: how closely the graph's average
// follows the difference in chances (xG), shots, entries into the box, and possession; and in the matches the weaker
// side won on xG, whose graph it was. The minute's ingredients are logged once (MatchSim.momLog), so different ways of
// weighing them can be compared on the same matches.
// npx tsx scripts/qa/momentum-check.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'

const N = Number(process.argv[2] || 150)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const comps = Object.values(w.competitions).filter((c) => c.format === 'league' && ['L13', 'L53', 'L19'].some((k) => c.key?.startsWith(k)))
const fxs = comps.flatMap((c) => c.fixtures.map((id) => w.fixtures[id])).filter((f) => f && !f.userInvolved).slice(0, N)
// per match: each minute's ingredients for both sides, what happened each minute, the graph as the engine drew it
type M = { log: number[][]; truth: { xg: number; shots: number; box: number; poss: number }[]; mom: number[]; strong: 0 | 1; xgd: number }
const ms: M[] = []
for (const f of fxs) {
  MatchSim.momLog = []
  const sim: any = createSim(w, f, false, true)
  sim.runToEnd()
  const fr = sim.ledgerFrames as { L: any[] }[]
  const truth = fr.map((x, i) => {
    const p = i ? fr[i - 1].L : null
    const d = (k: string, s: 0 | 1) => x.L[s][k] - (p ? p[s][k] : 0)
    const s0 = d('sec', 0), s1 = d('sec', 1)
    return { xg: d('xg', 0) - d('xg', 1), shots: d('shots', 0) - d('shots', 1), box: d('boxEntries', 0) - d('boxEntries', 1), poss: s0 + s1 ? s0 / (s0 + s1) - 0.5 : 0 }
  })
  const strong = sim.sides[0].lps.reduce((s: number, l: any) => s + l.p.ovr, 0) >= sim.sides[1].lps.reduce((s: number, l: any) => s + l.p.ovr, 0) ? 0 : 1
  ms.push({ log: MatchSim.momLog, truth, mom: sim.timeline.map((x: any) => x.mom), strong, xgd: sim.sides[0].stats.xg - sim.sides[1].stats.xg })
}
MatchSim.momLog = null
const corr = (xs: number[], ys: number[]) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
  return sxy / Math.sqrt(sxx * syy)
}
// ingredients: 0 threat, 1 box entries, 2 final-third entries, 3 secs in box, 4 secs in final third, 5 secs in the
// other half, 6 secs on the ball (home 0-6, away 7-13)
type Wts = { name: string; w: number[]; k: number; carry: number }
function evaluate(t: Wts | 'engine') {
  const spells: { mom: number; xg: number; shots: number; box: number; poss: number }[] = []
  let strongG = 0, ups = 0, upsG = 0, flips = 0, mins = 0
  for (const m of ms) {
    let mom: number[]
    if (t === 'engine') mom = m.mom
    else {
      let s = 0
      mom = m.log.map((r) => {
        const pr = (o: number) => t.w.reduce((a, wi, i) => a + wi * r[o + i], 0)
        s = s * t.carry + Math.tanh((pr(0) - pr(7)) * t.k) * (1 - t.carry)
        return Math.max(-1, Math.min(1, s))
      })
    }
    for (let i = 1; i < mom.length; i++) { mins++; if (Math.sign(mom[i]) !== Math.sign(mom[i - 1])) flips++ }
    for (let a = 0; a + 10 <= Math.min(mom.length, m.truth.length); a += 10) {
      const sl = (k: 'xg' | 'shots' | 'box' | 'poss') => m.truth.slice(a, a + 10).reduce((x, y) => x + y[k], 0)
      spells.push({ mom: mom.slice(a, a + 10).reduce((x, y) => x + y, 0) / 10, xg: sl('xg'), shots: sl('shots'), box: sl('box'), poss: sl('poss') / 10 })
    }
    const avg = mom.reduce((x, y) => x + y, 0) / mom.length
    if ((avg > 0 ? 0 : 1) === m.strong) strongG++
    if ((m.strong === 0 && m.xgd < -0.3) || (m.strong === 1 && m.xgd > 0.3)) { ups++; if ((avg > 0 ? 0 : 1) !== m.strong) upsG++ }
  }
  const c = (k: 'xg' | 'shots' | 'box' | 'poss') => corr(spells.map((x) => x.mom), spells.map((x) => x[k])).toFixed(2)
  const name = t === 'engine' ? 'as the engine draws it' : t.name
  console.log(`${name.padEnd(34)} xG ${c('xg')}  shots ${c('shots')}  box ${c('box')}  poss ${c('poss')} · stronger side's ${Math.round((strongG / ms.length) * 100)}% · upsets read right ${Math.round((upsG / Math.max(1, ups)) * 100)}% of ${ups} · sign flips ${(flips / mins * 90).toFixed(1)}/match`)
}
console.log(`${ms.length} matches`)
evaluate('engine')
const variants: Wts[] = [
  { name: 'current formula (recomputed)', w: [1, 0, 0, 0, 1 / 13, 1 / 40, 1 / 75], k: 1.1, carry: 0.45 },
  { name: 'threat only', w: [1, 0, 0, 0, 0, 0, 0], k: 1.5, carry: 0.5 },
  { name: 'E threat + box', w: [1.4, 0.3, 0.05, 1 / 8, 1 / 40, 0, 0], k: 1.1, carry: 0.55 },
  { name: 'F threat + a little box', w: [1.6, 0.25, 0, 1 / 10, 1 / 50, 0, 0], k: 1.0, carry: 0.6 },
  { name: 'G threat + box time', w: [1.3, 0.2, 0, 1 / 12, 0, 0, 0], k: 1.2, carry: 0.55 },
  { name: 'H threat + final third', w: [1, 0.15, 0, 0, 1 / 60, 0, 0], k: 1.4, carry: 0.5 },
  { name: 'I threat + entries', w: [1.2, 0.25, 0.06, 1 / 14, 1 / 45, 0, 0], k: 1.3, carry: 0.55 },
]
for (const v of variants) evaluate(v)
