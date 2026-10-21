// The engine's realism report: one run, every target the 4.2 engine work is held to.
//   npx tsx scripts/qa/lab/report.ts [season|tactics|all] [--n=4]
// season:  a season of the Premier League and LaLiga (full engine): results, team numbers, who scores and creates,
//          named players per 90, how concentrated goals and assists are, by position and by role
// tactics: what each instruction does for a mid-table side and an underdog, against a spread of opponents, paired by
//          seed (difference ± its standard error), with the opponent's shots and xG per shot
import { freshWorld, play } from '../engine-lab'
import type { MatchResult, TeamTactics } from '../../../src/domain/types'
import { MatchSim } from '../../../src/engine/match/engine'

const what = process.argv[2] || 'all'
const N = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) || 4)
const t0 = Date.now()
const w = freshWorld()
const f2 = (x: number) => x.toFixed(2), f1 = (x: number) => x.toFixed(1), pc = (x: number) => Math.round(x * 100) + '%'
const club = (name: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name))!
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) }
const se = (xs: number[]) => sd(xs) / Math.sqrt(Math.max(1, xs.length))
const pts = (r: MatchResult, us: 0 | 1) => (r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0)
const G = (pos: string) => (pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : ['LM', 'RM', 'LW', 'RW'].includes(pos) ? 'W' : 'ST')

if (what === 'season' || what === 'all') {
  type Q = { g: number; a: number; sh: number; xg: number; kp: number; mins: number; cross: number; drib: number; box: number; touch: number; pos: Record<string, number> }
  const P: Record<number, Q> = {}
  const team: Record<number, number> = {}
  const T: Record<string, number> = {}
  let n = 0, goals = 0, hw = 0, dr = 0, nil = 0, og = 0, pen = 0, assisted = 0
  const goalsBy: Record<string, number> = {}, astBy: Record<string, number> = {}, roleG: Record<string, [number, number, number]> = {}
  for (const lid of [13, 53]) {
    const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
    for (const fid of comp.fixtures) {
      const f = w.fixtures[fid]
      const { r, sim } = play(w, f.home, f.away, 177, { compId: comp.id, detail: true })
      n++
      goals += r.score[0] + r.score[1]
      if (r.score[0] > r.score[1]) hw++; else if (r.score[0] === r.score[1]) dr++
      if (!r.score[0] && !r.score[1]) nil++
      team[f.home] = (team[f.home] || 0) + r.score[0]; team[f.away] = (team[f.away] || 0) + r.score[1]
      for (const s of [0, 1] as const) for (const [k, v] of Object.entries(r.stats[s])) if (typeof v === 'number') T[k] = (T[k] || 0) + v / 2
      const pos = new Map(r.players.map((p) => [p.id, p.pos]))
      const role = new Map<number, string>()
      for (const s of [0, 1] as const) sim!.liveRatings(s).forEach((l) => role.set(l.id, `${G(l.pos)}:${l.role || '-'}`))
      for (const p of r.players as any[]) {
        const q = (P[p.id] ||= { g: 0, a: 0, sh: 0, xg: 0, kp: 0, mins: 0, cross: 0, drib: 0, box: 0, touch: 0, pos: {} })
        q.g += p.goals; q.a += p.assists; q.sh += p.shots; q.xg += p.xg; q.kp += p.keyPasses; q.mins += p.mins
        q.cross += p.crosses || 0; q.drib += p.dribbles || 0; q.box += p.boxTouches || 0; q.touch += p.touches || 0
        q.pos[p.pos] = (q.pos[p.pos] || 0) + p.mins
        const rk = role.get(p.id) || G(p.pos)
        const t = (roleG[rk] ||= [0, 0, 0]); t[0] += p.goals; t[1] += p.assists; t[2] += p.mins / 90
      }
      for (const e of r.events) {
        if (e.type === 'owngoal') { og++; continue }
        if (e.type === 'penGoal') { pen++; continue }
        if (e.type !== 'goal') continue
        goalsBy[G(pos.get(e.player!) || 'ST')] = (goalsBy[G(pos.get(e.player!) || 'ST')] || 0) + 1
        if (e.player2) { assisted++; astBy[G(pos.get(e.player2) || 'ST')] = (astBy[G(pos.get(e.player2) || 'ST')] || 0) + 1 }
      }
    }
  }
  console.log(`SEASON PL+LaLiga, ${n} matches`)
  console.log(`goals/match ${f2(goals / n)} (real 2.7-3.0) · home win ${pc(hw / n)} (44-46%) · draws ${pc(dr / n)} (24-27%) · 0-0 ${pc(nil / n)} (7-8%) · pens ${pc(pen / goals)} (8-11%) · OG ${pc(og / goals)} (3%) · assisted ${pc(assisted / Math.max(1, goals - pen - og))} of open/set goals (70-80%)`)
  console.log('per team per match: ' + ['possession', 'shots', 'sot', 'xg', 'passes', 'passAcc', 'corners', 'crosses', 'crossesOk', 'dribbles', 'dribblesOk', 'boxTouches', 'tackles', 'interceptions', 'fouls', 'yellows', 'offsides', 'bigChances'].map((k) => `${k} ${f1((T[k] || 0) / n)}`).join(' · '))
  const tg = Object.values(goalsBy).reduce((a, b) => a + b, 0), ta = Object.values(astBy).reduce((a, b) => a + b, 0)
  console.log(`non-pen goals by slot: ${['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB'].map((g) => `${g} ${pc((goalsBy[g] || 0) / tg)}`).join(' · ')}   (real ~ ST 36 W 20 AM 9 CM 12 DM 4 FB 6 CB 9)`)
  console.log(`assists by slot:       ${['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB'].map((g) => `${g} ${pc((astBy[g] || 0) / ta)}`).join(' · ')}   (real ~ ST 13 W 25 AM 13 CM 18 DM 6 FB 18 CB 5)`)
  const shares: number[] = [], ash: number[] = []
  for (const [cid, g] of Object.entries(team)) {
    const mine = Object.entries(P).filter(([id]) => w.players[+id]?.clubId === +cid)
    if (!g || !mine.length) continue
    shares.push(Math.max(...mine.map(([, q]) => q.g)) / g); ash.push(Math.max(...mine.map(([, q]) => q.a)) / g)
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]
  console.log(`team's top scorer share: median ${pc(med(shares))} max ${pc(Math.max(...shares))} (real ~30% / 45%) · top assister share: median ${pc(med(ash))} max ${pc(Math.max(...ash))} (real ~15% / 28%)`)
  const per = (x: number, m: number) => f2(m ? (x / m) * 90 : 0)
  const line = (id: number) => {
    const q = P[id], p = w.players[id]
    const pos = Object.entries(q.pos).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    return `${(p.name + ' (' + (w.clubs[p.clubId!]?.short || '') + ' ' + pos + ')').padEnd(32)} G ${String(q.g).padStart(2)} A ${String(q.a).padStart(2)} | /90 sh ${per(q.sh, q.mins)} xG ${per(q.xg, q.mins)} kp ${per(q.kp, q.mins)} cross ${per(q.cross, q.mins)} drib ${per(q.drib, q.mins)} boxT ${per(q.box, q.mins)} touch ${per(q.touch, q.mins).padStart(6)}`
  }
  const top = (k: 'g' | 'a') => Object.entries(P).sort((a, b) => b[1][k] - a[1][k]).slice(0, 6).map(([id]) => '  ' + line(+id))
  console.log('top scorers (real league best 22-36):\n' + top('g').join('\n'))
  console.log('top assisters (real league best 12-20):\n' + top('a').join('\n'))
  const named = ['Lamine Yamal', 'Raphinha', 'B. Saka', 'M. Ødegaard', 'E. Haaland', 'K. Mbappé', 'Vini Jr.', 'J. Bellingham', 'Pedri', 'D. Rice', 'V. van Dijk', 'Nico Williams', 'Bruno Fernandes', 'C. Palmer']
  console.log('named players (real /90: elite W sh 3-3.5 xG .3-.5 kp 2-3 cross 3-5 drib 5-7 boxT 6-8 touch 50-65; elite ST sh 3.5-4 xG .7-.9 touch 25-35; creator CM kp 2.5-3.5 touch 70-90):')
  for (const nm of named) { const p = Object.values(w.players).find((x) => x.name === nm); if (p && P[p.id]?.mins) console.log('  ' + line(p.id)) }
  console.log('by slot:role, per 90 (≥60 x90): ' + Object.entries(roleG).filter(([, v]) => v[2] >= 60 && !v[0].toString().startsWith('GK')).sort((a, b) => b[1][0] / b[1][2] - a[1][0] / a[1][2]).map(([k, [g, a, m]]) => `${k} ${f2(g / m)}G ${f2(a / m)}A`).join(' · '))
}

if (what === 'tactics' || what === 'all') {
  const variants: [string, Partial<TeamTactics>][] = [
    ['as AI sets', {}], ['ment UD', { mentality: 'Ultra Defensive' }], ['ment Def', { mentality: 'Defensive' }], ['ment Att', { mentality: 'Attacking' }], ['ment UA', { mentality: 'Ultra Attacking' }],
    ['park the bus', { mentality: 'Defensive', buildUp: 'Long Ball', defApproach: 'Deep', lineHeight: 22, width: 38, tempo: 40, pressing: 25, chanceCreation: 'Direct Passing', playersInBox: 3 }],
    ['mid block', { mentality: 'Balanced', defApproach: 'Balanced', lineHeight: 50, pressing: 50 }],
    ['high press', { mentality: 'Attacking', defApproach: 'Aggressive', lineHeight: 76, pressing: 85 }],
    ['line 25', { lineHeight: 25 }], ['line 80', { lineHeight: 80 }], ['press 15', { pressing: 15 }], ['press 90', { pressing: 90 }],
    ['tempo 20', { tempo: 20 }], ['tempo 85', { tempo: 85 }], ['width 20', { width: 20 }], ['width 85', { width: 85 }],
    ['build Short', { buildUp: 'Short Passing' }], ['build Long', { buildUp: 'Long Ball' }], ['build Counter', { buildUp: 'Counter' }],
  ]
  const ELITE = ['Man City', 'Liverpool', 'Arsenal', 'Chelsea']
  for (const team of (process.env.TEAMS || 'Brighton,Burnley').split(',')) {
    const T = club(team)
    const opps = ['Man City', 'Liverpool', 'Arsenal', 'Chelsea', 'Newcastle', 'Aston Villa', 'Fulham', 'Everton', 'Wolves', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
    console.log(`\nTACTICS ${T.name}: ${opps.length} opponents × ${N} seeds × home/away, paired with "as AI sets" (Δ against the elite four | against the rest)`)
    console.log('variant          pts  xG   xGA  | elite: Δpts  ΔxG   ΔxGA  | rest: Δpts  ΔxG   ΔxGA  | poss  sh  shA  xG/shA ctrA')
    let ref: Record<string, number[]> | undefined
    for (const [label, patch] of variants) {
      const R: Record<string, number[]> = { P: [], X: [], XA: [], E: [], PO: [], SH: [], SA: [], CA: [] }
      for (let k = 0; k < N; k++) for (const o of opps) for (const home of [true, false]) {
        const { r, sim } = play(w, home ? T.id : o.id, home ? o.id : T.id, 3000 + k * 17, { patch: { ...patch }, patchSide: home ? 0 : 1 })
        const us = home ? 0 : 1
        R.P.push(pts(r, us)); R.X.push(r.stats[us].xg); R.XA.push(r.stats[1 - us].xg); R.E.push(ELITE.includes(o.short) || ELITE.includes(o.name) ? 1 : 0)
        R.PO.push(r.stats[us].possession); R.SH.push(r.stats[us].shots); R.SA.push(r.stats[1 - us].shots); R.CA.push(sim!.ledger(1 - us as 0 | 1).by.counter?.[0] || 0)
      }
      if (!ref) ref = R
      const d = (k: string, e: number) => R[k].map((x, i) => x - ref![k][i]).filter((_, i) => R.E[i] === e)
      const s = (xs: number[]) => (mean(xs) >= 0 ? '+' : '') + f2(mean(xs))
      const pe = (k: string, e: number) => s(d(k, e)).padStart(6)
      console.log(`${label.padEnd(15)} ${f2(mean(R.P))} ${f2(mean(R.X))} ${f2(mean(R.XA))} |      ${pe('P', 1)} ${pe('X', 1)} ${pe('XA', 1)} |      ${pe('P', 0)} ${pe('X', 0)} ${pe('XA', 0)} |  ${Math.round(mean(R.PO))}% ${f1(mean(R.SH)).padStart(4)} ${f1(mean(R.SA)).padStart(4)}  ${f2(mean(R.XA) / Math.max(0.1, mean(R.SA)))}  ${f1(mean(R.CA))}`)
    }
    console.log(`(standard error of a Δ: about ±0.20 pts and ±0.09 xG against the elite, ±0.15 pts and ±0.06 xG against the rest at --n=${N})`)
  }
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`)
void MatchSim
