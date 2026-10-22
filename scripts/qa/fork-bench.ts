// Can a live match be copied and played out from where it stands, quickly? (the forecast's premise)
// npx tsx scripts/qa/fork-bench.ts [runs]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'
import { Rng } from '../../src/domain/rng'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 60)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const f = Object.values(w.fixtures).filter((x) => x.userInvolved && w.competitions[x.compId]?.key?.startsWith('L13')).sort((a, b) => a.date.localeCompare(b.date))[0]
const sim: any = createSim(w, f, true)
while (!sim.finished && sim.minute < 60) sim.step()
console.log('at', sim.minute, "'", sim.score, 'timeline', sim.timeline.length, 'frames', sim.ledgerFrames.length)
function fork(src: any, seed: number) {
  const keep = { timeline: src.timeline, ledgerFrames: src.ledgerFrames, events: src.events, acts: src.acts, changes: src.changes }
  src.timeline = []; src.ledgerFrames = []; src.acts = []
  let c: any
  try { c = structuredClone(src) } finally { Object.assign(src, keep) }
  Object.setPrototypeOf(c, MatchSim.prototype)
  for (const s of c.sides) Object.setPrototypeOf(s, Object.getPrototypeOf(src.sides[0]))
  c.rng = new Rng(seed); c.vrng = new Rng(seed ^ 0x5bd1e995); c.crng = new Rng(seed ^ 0x27d4eb2f)
  c.detail = false; c.ctx = { ...c.ctx, commentary: false }
  return c
}
let t = performance.now()
const c0 = fork(sim, 1)
console.log('one fork', (performance.now() - t).toFixed(1), 'ms')
t = performance.now()
const res = { w: 0, d: 0, l: 0, gf: 0, ga: 0 }
for (let i = 0; i < N; i++) {
  const c = fork(sim, 1000 + i)
  while (!c.finished) c.step()
  const us = 0
  const d = c.score[us] - c.score[1 - us]
  if (d > 0) res.w++; else if (d < 0) res.l++; else res.d++
  res.gf += c.score[us] - sim.score[us]; res.ga += c.score[1 - us] - sim.score[1 - us]
}
const dt = performance.now() - t
console.log(`${N} forks to full time: ${dt.toFixed(0)} ms (${(dt / N).toFixed(1)} ms each)  W/D/L ${res.w}/${res.d}/${res.l}  goals from here ${(res.gf / N).toFixed(2)}-${(res.ga / N).toFixed(2)}`)
// the original is untouched and still runs
while (!sim.finished) sim.step()
console.log('original finished', sim.score, 'timeline', sim.timeline.length)
