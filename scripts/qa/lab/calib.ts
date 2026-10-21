// Quick calibration read-out: one Premier League season through the full engine, the numbers that the shot and
// chance balance is tuned to.  npx tsx scripts/qa/lab/calib.ts [league=13] [seed=277]
import { freshWorld, play } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
const lid = Number(process.argv[2] || 13), seed = Number(process.argv[3] || 277)
const w = freshWorld()
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
const G = (pos: string) => (pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : ['LM', 'RM', 'LW', 'RW'].includes(pos) ? 'W' : 'ST')
MatchSim.dbg = {}
let n = 0, goals = 0, dr = 0, nil = 0, hw = 0, sh = 0, xg = 0, sot = 0
const gb: Record<string, number> = {}, team: Record<number, number> = {}, P: Record<number, number> = {}
for (const fid of comp.fixtures) {
  const f = w.fixtures[fid]
  const { r } = play(w, f.home, f.away, seed, { compId: comp.id })
  n++; goals += r.score[0] + r.score[1]
  if (r.score[0] === r.score[1]) dr++; if (!r.score[0] && !r.score[1]) nil++; if (r.score[0] > r.score[1]) hw++
  sh += r.stats[0].shots + r.stats[1].shots; xg += r.stats[0].xg + r.stats[1].xg; sot += r.stats[0].sot + r.stats[1].sot
  team[f.home] = (team[f.home] || 0) + r.score[0]; team[f.away] = (team[f.away] || 0) + r.score[1]
  for (const p of r.players) { if (p.goals) P[p.id] = (P[p.id] || 0) + p.goals; if (p.goals && p.pos) gb[G(p.pos)] = (gb[G(p.pos)] || 0) + p.goals }
}
const D = MatchSim.dbg!
MatchSim.dbg = null
const out = [60, 65, 70, 75, 80].reduce((a, x) => a + (D[`s0.shotx${x}`] || 0) + (D[`s1.shotx${x}`] || 0), 0)
const all = [55, 60, 65, 70, 75, 80, 85, 90, 95].reduce((a, x) => a + (D[`s0.shotx${x}`] || 0) + (D[`s1.shotx${x}`] || 0), 0)
const tg = Object.values(gb).reduce((a, b) => a + b, 0)
const shares: number[] = []
for (const [cid, g] of Object.entries(team)) { const mine = Object.entries(P).filter(([id]) => w.players[+id]?.clubId === +cid).map(([, v]) => v); if (g && mine.length) shares.push(Math.max(...mine) / g) }
shares.sort((a, b) => a - b)
const top = Object.entries(P).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, g]) => `${w.players[+id].name} ${g}`).join(', ')
const pc = (x: number) => Math.round(x * 100) + '%'
console.log(`goals ${(goals / n).toFixed(2)} · draws ${pc(dr / n)} · 0-0 ${pc(nil / n)} · home ${pc(hw / n)} · shots/team ${(sh / n / 2).toFixed(1)} sot ${(sot / n / 2).toFixed(1)} xG ${(xg / n / 2).toFixed(2)} xG/shot ${(xg / sh).toFixed(3)} · outside box ${pc(out / Math.max(1, all))}`)
console.log(`goals by slot: ${['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB'].map((g) => `${g} ${pc((gb[g] || 0) / tg)}`).join(' ')} · top scorer share median ${pc(shares[shares.length >> 1])} max ${pc(shares[shares.length - 1])} · ${top}`)
