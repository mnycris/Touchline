// ASCII snapshot of both teams' positions with the ball at a given spot, for one defending setup.
// npx tsx scripts/qa/lab/shape-dump.ts [ballX=75] [ballY=50] [patchJSON]
import { freshWorld, play } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { buildSheet } from '../../../src/engine/match/selection'
const [bx = '75', by = '50', patch = '{}'] = process.argv.slice(2)
const w = freshWorld()
const c = (n: string) => Object.values(w.clubs).find((x) => x.short === n || x.name.includes(n))!
const H = c(process.env.ATT || 'Arsenal'), A = c(process.env.DEF || 'Brentford')
const comp = Object.values(w.competitions).find((x) => x.format === 'league' && x.clubs.includes(H.id) && x.clubs.includes(A.id)) || Object.values(w.competitions).find((x) => x.format === 'league' && x.clubs.includes(H.id))
const f: any = { id: 'dump', compId: comp!.id, home: H.id, away: A.id, date: '2026-10-10', played: false }
const ctx = matchContext(w, f, false)
const home = sideInput(w, H.id, comp, false), away = sideInput(w, A.id, comp, false)
if (process.env.FORM) { const b = buildSheet(w, H, process.env.FORM, home.sheet.tactics, { comp }); home.sheet = { ...home.sheet, formation: b.formation, lineup: b.lineup, bench: b.bench, roles: b.roles }; for (const id of b.lineup) home.players[id] = w.players[id] }
away.sheet = { ...away.sheet, tactics: { ...away.sheet.tactics, ...JSON.parse(patch) } }
const sim: any = new MatchSim(home, away, ctx, 5)
sim.ps = 0; sim.b = { x: Number(bx), y: Number(by) }; sim.car = null; sim.dis = 0
sim.layout()
const W = 70, Hh = 22
const grid = Array.from({ length: Hh }, () => Array(W).fill('·'))
const put = (x: number, y: number, ch: string) => { const gx = Math.round(x / 100 * (W - 1)), gy = Math.round(y / 100 * (Hh - 1)); grid[gy][gx] = ch }
for (const l of sim.sides[0].on) put(l.at.x, l.at.y, l.pos === 'GK' ? 'G' : 'o')
for (const l of sim.sides[1].on) put(l.at.x, l.at.y, l.pos === 'GK' ? 'K' : 'x')
put(sim.b.x, sim.b.y, '●')
console.log(`attack → (o = ${H.short} on the ball, x = ${A.short} ${patch})  last line x≈${sim.lineCache.toFixed(1)}`)
console.log(grid.map((r) => r.join('')).join('\n'))
const xs = sim.sides[1].on.filter((l: any) => l.pos !== 'GK').map((l: any) => +(100 - l.at.x).toFixed(0)).sort((a: number, b: number) => a - b)
console.log('defenders depth from own goal (units):', xs.join(' '), '| within 22 units of goal:', xs.filter((x: number) => x <= 22).length)
import { playerSpot } from '../../../src/engine/match/pitch'
for (const l of sim.sides[1].on) {
  const sl = sim.sides[1].slots[l.slot]
  const p = playerSpot(sl.x, sl.y, l.pos, l.rs, sim.sides[1].shape, false, { x: 100 - Number(bx), y: 100 - Number(by) })
  console.log(l.pos.padEnd(4), 'slot', sl.x, sl.y, 'spot', p.x.toFixed(1), p.y.toFixed(1), '| at', (100 - l.at.x).toFixed(1), 'jx', l.jx.toFixed(1))
}
