// Calibration harness: simulates a full league season with the match engine and reports realism metrics.
// Run: npx tsx scripts/qa/calibrate.ts [leagueId=13] [seed] [--quiet]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { Rng } from '../../src/domain/rng'
import { applyMatchResult, createSim } from '../../src/engine/world/matchRunner'
import { sortTable } from '../../src/engine/competitions/tables'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const leagueId = Number(process.argv[2] || 13)
const seed = Number(process.argv[3] || 7)
const quiet = process.argv.includes('--quiet')
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const t0 = Date.now()
const w = createWorld(raw, {
  clubId: arsenal,
  manager: { firstName: 'Test', lastName: 'Manager', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
  seed,
})
if (!quiet) console.log('world created in', Date.now() - t0, 'ms')
const comp = w.competitions[`L${leagueId}-2026`]
const rng = new Rng(seed)
let n = 0, goals = 0, hw = 0, dr = 0, aw = 0, inj = 0, pens = 0, penGoals = 0, ogs = 0, bip = 0
const sum: Record<string, number> = {}
const add = (k: string, v: number) => { sum[k] = (sum[k] || 0) + (v || 0) }
const poss: number[] = [], passes: number[] = [], acc: number[] = []
const ratings: number[] = [], motmR: number[] = [], byPos: Record<string, number[]> = {}, scorerR: number[] = [], zeroGoalFw: number[] = []
const scoreDist: Record<string, number> = {}
const margin: number[] = [0, 0, 0, 0, 0, 0]
let team5 = 0, team4 = 0
const pStat: Record<string, Record<string, number>> = {}
const pCount: Record<string, number> = {}
const posG = (p: string) => (p === 'GK' ? 'GK' : p === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(p) ? 'FB' : p === 'CDM' ? 'DM' : p === 'CM' ? 'CM' : p === 'CAM' ? 'AM' : ['LM', 'RM', 'LW', 'RW'].includes(p) ? 'W' : 'ST')
const t1 = Date.now()
for (const id of comp.fixtures) {
  const f = w.fixtures[id]
  const sim = createSim(w, f, false)
  const r = sim.runToEnd()
  bip += ((sim as any).sides[0].possSec + (sim as any).sides[1].possSec) / 60
  const res = applyMatchResult(w, f, r, rng)
  inj += res.injuries.length
  n++
  const [h, a] = r.score
  goals += h + a
  if (h > a) hw++; else if (h === a) dr++; else aw++
  margin[Math.min(5, Math.abs(h - a))]++
  if (h >= 5) team5++
  if (a >= 5) team5++
  if (h >= 4) team4++
  if (a >= 4) team4++
  for (const s of r.stats) for (const [k, v] of Object.entries(s)) if (typeof v === 'number') add(k, v)
  poss.push(r.stats[0].possession)
  for (const s of r.stats) { passes.push(s.passes); acc.push(s.passAcc) }
  for (const x of r.players) {
    if (x.mins >= 60) {
      const g = posG(x.pos)
      pCount[g] = (pCount[g] || 0) + 1
      const ps = (pStat[g] ||= {})
      for (const [k, v] of Object.entries(x)) if (typeof v === 'number' && k !== 'id' && k !== 'side') ps[k] = (ps[k] || 0) + v
    }
    if (x.mins < 30) continue
    ratings.push(x.rating)
    const g = posG(x.pos)
    ;(byPos[g] ||= []).push(x.rating)
    if (x.goals) scorerR.push(x.rating)
    else if (g === 'ST' && x.mins >= 60) zeroGoalFw.push(x.rating)
  }
  const m = r.players.find((x) => x.id === r.motm); if (m) motmR.push(m.rating)
  pens += r.events.filter((e) => e.type === 'penGoal' || e.type === 'penMiss').length
  add('subs', r.events.filter((e) => e.type === 'sub').length)
  penGoals += r.events.filter((e) => e.type === 'penGoal').length
  ogs += r.events.filter((e) => e.type === 'owngoal').length
  const k = `${Math.min(h, 5)}-${Math.min(a, 5)}`
  scoreDist[k] = (scoreDist[k] || 0) + 1
  for (const pid of r.players.map((x) => x.id)) { const p = w.players[pid]; p.fitness = Math.min(100, p.fitness + 30); if (p.injury && Math.random() < 0.3) p.injury = undefined }
}
const dt = Date.now() - t1
const per = (k: string) => (sum[k] / n / 2).toFixed(1)
console.log(`${n} matches in ${dt} ms (${(dt / n).toFixed(2)} ms/match); ball in play ${(bip / n).toFixed(1)} min`)
console.log(`goals/m ${(goals / n).toFixed(2)}  H/D/A ${(hw / n * 100).toFixed(0)}/${(dr / n * 100).toFixed(0)}/${(aw / n * 100).toFixed(0)}%  margins 0:${pc(margin[0])} 1:${pc(margin[1])} 2:${pc(margin[2])} 3:${pc(margin[3])} 4:${pc(margin[4])} 5+:${pc(margin[5])}  team≥4 ${(team4 / n / 2 * 100).toFixed(1)}% team≥5 ${(team5 / n / 2 * 100).toFixed(1)}%`)
console.log(`per team: shots ${per('shots')} sot ${per('sot')} xG ${(sum.xg / n / 2).toFixed(2)} bigCh ${per('bigChances')} corners ${per('corners')} fouls ${per('fouls')} yellows ${per('yellows')} reds ${(sum.reds / n).toFixed(2)}/m offsides ${per('offsides')} saves ${per('saves')}`)
console.log(`per team: tackles ${per('tackles')} int ${per('interceptions')} clear ${per('clearances')} blocks ${per('blocks')} crosses ${per('crosses')} (ok ${per('crossesOk')}) dribbles ${per('dribbles')} (ok ${per('dribblesOk')}) aerialsWon ${per('aerialsWon')} duelsWon ${per('duelsWon')} longBalls ${per('longBalls')} boxTouches ${per('boxTouches')} touches ${per('touches')} throwIns ${per('throwIns')} goalKicks ${per('goalKicks')} recov ${per('recoveries')}`)
console.log(`subs/team ${(sum.subs / n / 2).toFixed(1)}`)
console.log(`pens/m ${(pens / n).toFixed(2)} (scored ${(penGoals / Math.max(1, pens) * 100).toFixed(0)}%) own goals/m ${(ogs / n).toFixed(3)} injuries/m ${(inj / n).toFixed(2)}`)
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]
console.log(`ratings mean ${avg(ratings).toFixed(2)} sd ${Math.sqrt(avg(ratings.map((x) => (x - avg(ratings)) ** 2))).toFixed(2)} p5 ${q(ratings, 0.05)} p50 ${q(ratings, 0.5)} p95 ${q(ratings, 0.95)} max ${Math.max(...ratings)} min ${Math.min(...ratings)}`)
console.log('by pos', Object.entries(byPos).map(([k, v]) => `${k} ${avg(v).toFixed(2)}/${Math.sqrt(avg(v.map((x) => (x - avg(v)) ** 2))).toFixed(2)}`).join('  '), `| scorers ${avg(scorerR).toFixed(2)} | ST no goal ${avg(zeroGoalFw).toFixed(2)} | MOTM ${avg(motmR).toFixed(2)} (p10 ${q(motmR, 0.1)} p90 ${q(motmR, 0.9)})`)
console.log(`team passes ${avg(passes).toFixed(0)} (p10 ${q(passes, 0.1)} p90 ${q(passes, 0.9)}) acc ${avg(acc).toFixed(1)}% (p10 ${q(acc, 0.1)} p90 ${q(acc, 0.9)})`)
poss.sort((a, b) => a - b)
console.log('home possession p10/p50/p90', poss[Math.floor(n * 0.1)], poss[Math.floor(n * 0.5)], poss[Math.floor(n * 0.9)])
console.log('common scores', Object.entries(scoreDist).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '))
{
  const gs: Record<string, number> = {}
  let tot = 0
  for (const g of Object.keys(pStat)) { gs[g] = pStat[g].goals || 0; tot += gs[g] }
  console.log('goal share (60+ min players):', Object.entries(gs).map(([g, v]) => `${g} ${(v / tot * 100).toFixed(0)}%`).join(' '))
}
const keys = ['touches', 'passes', 'passesCompleted', 'keyPasses', 'shots', 'goals', 'assists', 'tackles', 'interceptions', 'clearances', 'blocks', 'recoveries', 'aerials', 'aerialsWon', 'dribbles', 'dribblesOk', 'crosses', 'longBalls', 'possLost', 'fouls', 'saves', 'energy']
console.log('\nper 60+ min player by group:')
console.log('     ' + keys.map((k) => k.slice(0, 6).padStart(7)).join(''))
for (const g of ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST']) {
  if (!pStat[g]) continue
  console.log(g.padEnd(5) + keys.map((k) => ((pStat[g][k] || 0) / pCount[g]).toFixed(k === 'goals' || k === 'assists' || k === 'keyPasses' || k === 'saves' ? 2 : 1).padStart(7)).join(''))
}
if (!quiet) {
  const table = sortTable(w, comp)
  console.log('\nFinal table:')
  table.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${w.clubs[r.clubId].name.padEnd(26)} ${String(r.p).padStart(2)} ${r.w}-${r.d}-${r.l} ${r.gf}:${r.ga} ${r.pts} (avg ${w.clubs[r.clubId].squadAvg})`))
  const scorers = Object.values(w.players).filter((p) => p.season[comp.id]?.goals).sort((a, b) => b.season[comp.id].goals - a.season[comp.id].goals).slice(0, 10)
  console.log('\nTop scorers:', scorers.map((p) => `${p.name} (${w.clubs[p.clubId]?.short}) ${p.season[comp.id].goals}`).join(', '))
  const assists = Object.values(w.players).filter((p) => p.season[comp.id]?.assists).sort((a, b) => b.season[comp.id].assists - a.season[comp.id].assists).slice(0, 6)
  console.log('Top assists:', assists.map((p) => `${p.name} ${p.season[comp.id].assists}`).join(', '))
  const rated = Object.values(w.players).filter((p) => (p.season[comp.id]?.rated || 0) >= 20).sort((a, b) => b.season[comp.id].ratingSum / b.season[comp.id].rated - a.season[comp.id].ratingSum / a.season[comp.id].rated).slice(0, 8)
  console.log('Best avg ratings:', rated.map((p) => `${p.name} ${(p.season[comp.id].ratingSum / p.season[comp.id].rated).toFixed(2)}`).join(', '))
}
function pc(v: number) { return `${(v / n * 100).toFixed(0)}%` }
