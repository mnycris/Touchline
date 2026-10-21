// Engine audit: does what matters in football matter in the engine, and by how much against the noise of one match?
//   npx tsx scripts/qa/lab/audit.ts gradient [n=40]      quality gap → points, xG, goals (full engine and light sim)
//   npx tsx scripts/qa/lab/audit.ts noise [n=300]        one fixture many times: spread of xG, goals, results
//   npx tsx scripts/qa/lab/audit.ts tactics [team] [n]   each setting's effect (with its standard error) vs a spread of sides
//   npx tsx scripts/qa/lab/audit.ts user [n]             the same fixtures with the manager's side as user / as AI
//   npx tsx scripts/qa/lab/audit.ts players [n]          per-90 numbers of named players over many matches
import { freshWorld, play } from '../engine-lab'
import type { MatchResult, TeamTactics, World } from '../../../src/domain/types'
import { DEFAULT_TACTICS } from '../../../src/domain/constants'
import { posRating } from '../../../src/domain/ratings'
import { formationOf } from '../../../src/domain/constants'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { hashString } from '../../../src/domain/rng'
import { A as ATTR } from '../../../src/domain/types'
import type { Fixture } from '../../../src/domain/types'

const args = process.argv.slice(2).filter((x) => !x.startsWith('--'))
const mode = args[0] || 'gradient'
const t0 = Date.now()
const w = freshWorld()
const f2 = (x: number) => x.toFixed(2), pc = (x: number) => Math.round(x * 100) + '%'
const sideInputLab = (id: number, comp: any) => sideInput(w, id, comp, false)
const club = (name: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name))!
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) }
const se = (xs: number[]) => sd(xs) / Math.sqrt(Math.max(1, xs.length))
const pts = (r: MatchResult, us: 0 | 1) => (r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0)

/** The XI's average positional rating as the AI picks it for a league match. */
function xiLevel(w: World, id: number): number {
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(id))
  const s = sideInput(w, id, comp, false)
  const f = formationOf(s.sheet.formation)
  const rs = s.sheet.lineup.map((pid, i) => posRating(w.players[pid], f.slots[i].pos))
  return mean(rs)
}

if (mode === 'gradient') {
  // every pairing of a spread of clubs from the big five leagues, home and away
  const n = Number(args[1] || 40)
  const lg = Object.values(w.competitions).filter((c) => c.format === 'league' && [13, 53, 19, 31, 16].includes(c.leagueId!))
  const rows: { gap: number; full: [number, number, number]; light: [number, number, number] }[] = []
  for (const comp of lg) {
    const ids = [...comp.clubs].sort((a, b) => xiLevel(w, b) - xiLevel(w, a))
    const pick = [ids[0], ids[2], ids[5], ids[9], ids[13], ids[ids.length - 1]]
    for (const h of pick) for (const a of pick) {
      if (h === a) continue
      const gap = xiLevel(w, h) - xiLevel(w, a)
      for (const light of [false, true]) {
        let p = 0, gd = 0, xd = 0
        for (let i = 0; i < n; i++) {
          const { r } = play(w, h, a, 9000 + i, { light, compId: comp.id })
          p += pts(r, 0); gd += r.score[0] - r.score[1]; xd += r.stats[0].xg - r.stats[1].xg
        }
        const row = rows.find((x) => x.gap === gap) || (rows.push({ gap, full: [0, 0, 0], light: [0, 0, 0] }), rows[rows.length - 1])
        row[light ? 'light' : 'full'] = [p / n, gd / n, xd / n]
      }
    }
  }
  // bucket by gap
  const buckets = [-99, -8, -5, -3, -1.5, -0.5, 0.5, 1.5, 3, 5, 8, 99]
  console.log('XI gap (home−away)   n   full: pts  GD    xGD  | light: pts  GD    xGD')
  for (let i = 0; i < buckets.length - 1; i++) {
    const xs = rows.filter((r) => r.gap >= buckets[i] && r.gap < buckets[i + 1])
    if (!xs.length) continue
    const m = (k: 'full' | 'light', j: number) => mean(xs.map((r) => r[k][j]))
    console.log(`${(buckets[i] + '..' + buckets[i + 1]).padEnd(18)} ${String(xs.length).padStart(3)}   ${f2(m('full', 0))} ${f2(m('full', 1)).padStart(5)} ${f2(m('full', 2)).padStart(5)} |   ${f2(m('light', 0))} ${f2(m('light', 1)).padStart(5)} ${f2(m('light', 2)).padStart(5)}`)
  }
  // a least-squares slope: expected home points per XI rating point
  const slope = (k: 'full' | 'light', j: number) => { const x = rows.map((r) => r.gap), y = rows.map((r) => r[k][j]); const mx = mean(x), my = mean(y); return x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0) / x.reduce((a, xi) => a + (xi - mx) ** 2, 0) }
  console.log(`slope per XI point: full pts ${f2(slope('full', 0))} GD ${f2(slope('full', 1))} xGD ${f2(slope('full', 2))} | light pts ${f2(slope('light', 0))} GD ${f2(slope('light', 1))}`)
}

if (mode === 'noise') {
  const n = Number(args[1] || 300)
  for (const [h, a] of (process.env.PAIRS ? process.env.PAIRS.split(';').map((x) => x.split(',')) : [['Arsenal', 'Brighton'], ['Man City', 'Burnley'], ['Brighton', 'Fulham'], ['Real Madrid', 'Elche'], ['Elche', 'Real Madrid'], ['Barça', 'Getafe']])) {
    const H = club(h), A = club(a)
    const xg: number[][] = [[], []], g: number[][] = [[], []], res = [0, 0, 0]
    let xgWin = 0, xgWinN = 0
    for (let i = 0; i < n; i++) {
      const { r } = play(w, H.id, A.id, 20000 + i)
      for (const s of [0, 1]) { xg[s].push(r.stats[s].xg); g[s].push(r.score[s]) }
      res[r.score[0] > r.score[1] ? 0 : r.score[0] === r.score[1] ? 1 : 2]++
      const dx = r.stats[0].xg - r.stats[1].xg
      if (Math.abs(dx) >= 0.5) { xgWinN++; if ((dx > 0 && r.score[0] > r.score[1]) || (dx < 0 && r.score[1] > r.score[0])) xgWin++ }
    }
    const xd = xg[0].map((x, i) => x - xg[1][i]), gdd = g[0].map((x, i) => x - g[1][i])
    console.log(`${h} (${f2(xiLevel(w, H.id))}) v ${a} (${f2(xiLevel(w, A.id))}): W/D/L ${pc(res[0] / n)}/${pc(res[1] / n)}/${pc(res[2] / n)} · xG ${f2(mean(xg[0]))}±${f2(sd(xg[0]))} – ${f2(mean(xg[1]))}±${f2(sd(xg[1]))} · xGD sd ${f2(sd(xd))} · GD ${f2(mean(gdd))} sd ${f2(sd(gdd))} · side with ≥0.5 more xG wins ${pc(xgWin / Math.max(1, xgWinN))} (${xgWinN})`)
  }
}

if (mode === 'tactics') {
  const T = club(args[1] || 'Arsenal')
  const n = Number(args[2] || 6)
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Brighton', 'Fulham', 'Everton', 'Wolves', 'Burnley', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  const base = T.sheets.find((s) => s.id === T.activeSheet)!.tactics
  const variants: [string, Partial<TeamTactics>][] = [
    ['as AI sets', {}], ['default', { ...DEFAULT_TACTICS }],
    ['ment UD', { mentality: 'Ultra Defensive' }], ['ment Def', { mentality: 'Defensive' }], ['ment Att', { mentality: 'Attacking' }], ['ment UA', { mentality: 'Ultra Attacking' }],
    ['tempo 20', { tempo: 20 }], ['tempo 85', { tempo: 85 }], ['width 20', { width: 20 }], ['width 85', { width: 85 }],
    ['line 25', { lineHeight: 25 }], ['line 80', { lineHeight: 80 }], ['press 15', { pressing: 15 }], ['press 90', { pressing: 90 }],
    ['def Deep', { defApproach: 'Deep' }], ['def High', { defApproach: 'High' }], ['def Aggr', { defApproach: 'Aggressive' }],
    ['build Short', { buildUp: 'Short Passing' }], ['build Long', { buildUp: 'Long Ball' }], ['build Counter', { buildUp: 'Counter' }],
    ['cc Possession', { chanceCreation: 'Possession' }], ['cc Direct', { chanceCreation: 'Direct Passing' }], ['cc Runs', { chanceCreation: 'Forward Runs' }],
    ['box 3', { playersInBox: 3 }], ['box 8', { playersInBox: 8 }],
  ]
  console.log(`${T.name} (base ${JSON.stringify(base)})\n${opps.length} opponents × ${n} seeds × home/away; paired with "as AI sets" (same seeds)\n`)
  console.log('variant          pts   Δpts±se      xG    ΔxG±se       xGA   ΔxGA±se      poss shots')
  let ref: number[][] | undefined
  for (const [label, patch] of variants) {
    const P: number[] = [], X: number[] = [], XA: number[] = [], PO: number[] = [], SH: number[] = []
    for (let k = 0; k < n; k++) for (const o of opps) for (const home of [true, false]) {
      const { r } = play(w, home ? T.id : o.id, home ? o.id : T.id, 3000 + k * 17, { patch: { ...patch }, patchSide: home ? 0 : 1 })
      const us = home ? 0 : 1
      P.push(pts(r, us)); X.push(r.stats[us].xg); XA.push(r.stats[1 - us].xg); PO.push(r.stats[us].possession); SH.push(r.stats[us].shots)
    }
    if (!ref) ref = [P, X, XA]
    const d = (a: number[], b: number[]) => a.map((x, i) => x - b[i])
    const dp = d(P, ref[0]), dx = d(X, ref[1]), dxa = d(XA, ref[2])
    console.log(`${label.padEnd(15)} ${f2(mean(P))}  ${(f2(mean(dp)) + '±' + f2(se(dp))).padStart(11)}   ${f2(mean(X))}  ${(f2(mean(dx)) + '±' + f2(se(dx))).padStart(11)}   ${f2(mean(XA))}  ${(f2(mean(dxa)) + '±' + f2(se(dxa))).padStart(11)}   ${Math.round(mean(PO))}%  ${mean(SH).toFixed(1)}`)
  }
}

if (mode === 'user') {
  // the same fixtures, the manager's side played by the user's rules (no AI mentality changes, assistant subs on, as Quick Sim)
  const n = Number(args[1] || 8)
  const T = club('Arsenal')
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Brighton', 'Fulham', 'Everton', 'Burnley'].map(club)
  for (const [label, user, diff] of [['as AI', false, 'Professional'], ['as user (Professional)', true, 'Professional'], ['as user (World Class)', true, 'World Class'], ['as user (Legendary)', true, 'Legendary']] as const) {
    const P: number[] = [], X: number[] = [], XA: number[] = []
    for (let k = 0; k < n; k++) for (const o of opps) for (const home of [true, false]) {
      const hid = home ? T.id : o.id, aid = home ? o.id : T.id
      const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(T.id))!
      const f: Fixture = { id: `lab:${hid}:${aid}:${k}`, compId: comp.id, home: hid, away: aid, date: '2026-10-10', played: false } as Fixture
      const prev = w.settings.difficulty
      w.settings.difficulty = diff
      const ctx = matchContext(w, f, false)
      w.settings.difficulty = prev
      const us = home ? 0 : 1
      ctx.userSide = user ? us : -1
      ctx.assistantSubs = true
      const hs = sideInput(w, hid, comp, false), as = sideInput(w, aid, comp, false)
      if (user) (us === 0 ? hs : as).controlledByUser = true
      const r = new MatchSim(hs, as, ctx, hashString(`${k}:${hid}:${aid}`)).runToEnd()
      P.push(pts(r, us)); X.push(r.stats[us].xg); XA.push(r.stats[1 - us].xg)
    }
    console.log(`${label.padEnd(24)} pts ${f2(mean(P))}±${f2(se(P))}  xG ${f2(mean(X))}  xGA ${f2(mean(XA))}`)
  }
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`)

if (mode === 'players') {
  // a season (or several) of the big leagues through the full engine: who scores, who assists, how concentrated it is
  const seasons = Number(args[1] || 1)
  const leagues = (process.env.LEAGUES || '13,53').split(',').map(Number)
  const named = (process.env.NAMES || 'Lamine Yamal,Raphinha,R. Lewandowski,M. Salah,B. Saka,M. Ødegaard,C. Palmer,E. Haaland,K. Mbappé,Vini Jr.,J. Bellingham,Pedri,D. Rice,V. van Dijk,W. Saliba,Nico Williams,T. Alexander-Arnold,Bruno Fernandes,V. Gyökeres,A. Isak,Ferran Torres,Dani Olmo').split(',')
  const P: Record<number, { g: number; a: number; sh: number; xg: number; kp: number; xa: number; mins: number; apps: number; pos: Record<string, number>; cross: number; drib: number; touch: number; box: number }> = {}
  const team: Record<number, number> = {}
  for (let s = 0; s < seasons; s++) for (const lid of leagues) {
    const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
    for (const fid of comp.fixtures) {
      const f = w.fixtures[fid]
      const { r } = play(w, f.home, f.away, 177 + s * 1000, { compId: comp.id })
      team[f.home] = (team[f.home] || 0) + r.score[0]; team[f.away] = (team[f.away] || 0) + r.score[1]
      for (const p of r.players as any[]) {
        const q = (P[p.id] ||= { g: 0, a: 0, sh: 0, xg: 0, kp: 0, xa: 0, mins: 0, apps: 0, pos: {}, cross: 0, drib: 0, touch: 0, box: 0 })
        q.g += p.goals; q.a += p.assists; q.sh += p.shots; q.xg += p.xg; q.kp += p.keyPasses; q.xa += p.xa || 0; q.mins += p.mins; if (p.mins) q.apps++
        q.pos[p.pos] = (q.pos[p.pos] || 0) + p.mins; q.cross += p.crosses || 0; q.drib += p.dribbles || 0; q.touch += p.touches || 0; q.box += p.boxTouches || 0
      }
    }
  }
  const per = (x: number, m: number) => (m ? (x / m) * 90 : 0).toFixed(2)
  const line = (id: number) => {
    const q = P[id], p = w.players[id]
    const pos = Object.entries(q.pos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${Math.round((v / q.mins) * 100)}`).join('/')
    return `${(p.name + ' (' + w.clubs[p.clubId!]?.short + ', ' + p.positions[0] + ')').padEnd(34)} ${String(q.apps).padStart(3)} apps ${pos.padEnd(14)} G ${String(q.g).padStart(3)} A ${String(q.a).padStart(3)} | /90 sh ${per(q.sh, q.mins)} xG ${per(q.xg, q.mins)} G ${per(q.g, q.mins)} kp ${per(q.kp, q.mins)} xA ${per(q.xa, q.mins)} A ${per(q.a, q.mins)} cross ${per(q.cross, q.mins)} drib ${per(q.drib, q.mins)} boxT ${per(q.box, q.mins)} touch ${per(q.touch, q.mins)}`
  }
  console.log(`${seasons} season(s), leagues ${leagues.join(',')}\n`)
  for (const nm of named) {
    const p = Object.values(w.players).find((x) => x.name === nm || x.shortName === nm)
    if (!p || !P[p.id]) { console.log(`${nm}: not found / no minutes`); continue }
    console.log(line(p.id))
  }
  // concentration: each team's top scorer and top assister share of its goals
  const shares: number[] = [], ashares: number[] = []
  for (const [cid, g] of Object.entries(team)) {
    const mine = Object.entries(P).filter(([id]) => w.players[+id]?.clubId === +cid)
    if (!g || !mine.length) continue
    shares.push(Math.max(...mine.map(([, q]) => q.g)) / g)
    ashares.push(Math.max(...mine.map(([, q]) => q.a)) / g)
  }
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)
  console.log(`\nteam top scorer share of team goals: median ${pc(sorted(shares)[shares.length >> 1])} max ${pc(Math.max(...shares))} · top assister share: median ${pc(sorted(ashares)[ashares.length >> 1])} max ${pc(Math.max(...ashares))}`)
  const top = (k: 'g' | 'a') => Object.entries(P).sort((a, b) => b[1][k] - a[1][k]).slice(0, 12).map(([id]) => line(+id))
  console.log('\ntop scorers\n' + top('g').join('\n'))
  console.log('\ntop assisters\n' + top('a').join('\n'))
}

if (mode === 'anatomy') {
  // one season of a league through the full engine with the engine's calibration counters on
  const lid = Number(args[1] || 13)
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
  MatchSim.dbg = {}
  const T: Record<string, number> = {}
  let n = 0
  for (const fid of comp.fixtures) {
    const f = w.fixtures[fid]
    const { r } = play(w, f.home, f.away, 277, { compId: comp.id })
    n++
    for (const s of [0, 1]) for (const [k, v] of Object.entries(r.stats[s])) if (typeof v === 'number') T[k] = (T[k] || 0) + v / 2
  }
  const D = MatchSim.dbg!
  MatchSim.dbg = null
  const per = (k: string) => (D[k] || 0) / n / 2
  console.log(`${n} matches · per team per match:`)
  console.log(Object.entries(T).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' · '))
  // shots and goals by position group and how
  const groups = ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB']
  const hows = [...new Set(Object.keys(D).filter((k) => k.startsWith('gshot.')).map((k) => k.split('.')[2]))]
  console.log('\nshots per team-match by group × how (goals in brackets)')
  console.log('     ' + hows.map((h) => h.padStart(13)).join(''))
  for (const g of groups) console.log(g.padEnd(5) + hows.map((h) => `${per(`gshot.${g}.${h}`).toFixed(2)} (${per(`goal.${g}.${h}`).toFixed(2)})`.padStart(13)).join('') + `  = ${hows.reduce((a, h) => a + per(`gshot.${g}.${h}`), 0).toFixed(2)} (${hows.reduce((a, h) => a + per(`goal.${g}.${h}`), 0).toFixed(2)})`)
  console.log('\ndecision shares (of decisions): ' + ['carry', 'drib', 'cross', 'cut', 'clear'].map((k) => `${k} ${pc((D['w.' + k] || 0) / (D.decide || 1))}`).join(' · '))
  const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']
  console.log('passes per team-match: ' + kinds.map((k) => `${k} ${per('pass.' + k).toFixed(1)} (${pc((D['passL.' + k] || 0) / Math.max(1, D['pass.' + k] || 0))})`).join(' · '))
  console.log('shot rate by zone (x/10): ' + [6, 7, 8, 9].map((z) => `${z}0s: shoots ${pc((D['sp' + z] || 0) / Math.max(1, D['sc' + z] || 0))} of ${per('sc' + z).toFixed(1)} chances, xg0 ${((D['sx' + z] || 0) / Math.max(1, D['sc' + z] || 0)).toFixed(3)}`).join(' · '))
  console.log('actions per team-match', per('acts').toFixed(0), '· decisions', per('decide').toFixed(0), '· carries', per('carry').toFixed(1), '· challenges', per('challenge').toFixed(1))
}

if (mode === 'assists') {
  // goals with their assist: the route (how) × the assister's slot group, and the scorer's group, from the events
  const lid = Number(args[1] || 13)
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
  const G = (pos: string) => (pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : ['LM', 'RM'].includes(pos) ? 'WM' : ['LW', 'RW'].includes(pos) ? 'W' : 'ST')
  const A: Record<string, number> = {}, S: Record<string, number> = {}
  const roleA: Record<string, [number, number, number]> = {}
  let goals = 0, n = 0
  for (const fid of comp.fixtures) {
    const f = w.fixtures[fid]
    const { r, sim } = play(w, f.home, f.away, 377, { compId: comp.id, detail: true })
    n++
    const pos = new Map(r.players.map((p) => [p.id, p.pos]))
    const roles = new Map<number, string>()
    for (const s of [0, 1] as const) sim!.liveRatings(s).forEach((l) => roles.set(l.id, `${G(l.pos)}:${l.role || '-'}`))
    for (const p of r.players) { const k = roles.get(p.id) || G(p.pos); const t = (roleA[k] ||= [0, 0, 0]); t[0] += p.goals; t[1] += p.assists; t[2] += p.mins / 90 }
    for (const e of r.events) {
      if (e.type !== 'goal') continue
      goals++
      const sg = G(pos.get(e.player!) || 'ST')
      S[`${sg}.${e.how}`] = (S[`${sg}.${e.how}`] || 0) + 1
      const ag = e.player2 ? G(pos.get(e.player2) || 'ST') : 'none'
      A[`${ag}.${e.how}`] = (A[`${ag}.${e.how}`] || 0) + 1
    }
  }
  const hows = ['pass', 'cross', 'cutback', 'through', 'corner', 'counter', 'solo', 'long', 'box', 'freekick', 'rebound', 'error']
  const groups = ['ST', 'W', 'WM', 'AM', 'CM', 'DM', 'FB', 'CB', 'none']
  const table = (M: Record<string, number>, title: string) => {
    console.log(`\n${title} (share of ${goals} open-play+set-piece goals)`)
    console.log('      ' + hows.map((h) => h.padStart(8)).join('') + '   total')
    for (const g of groups) {
      const row = hows.map((h) => M[`${g}.${h}`] || 0)
      const tot = Object.entries(M).filter(([k]) => k.startsWith(g + '.')).reduce((a, [, v]) => a + v, 0)
      if (!tot) continue
      console.log(g.padEnd(6) + row.map((v) => (v ? pc(v / goals) : '·').padStart(8)).join('') + pc(tot / goals).padStart(8))
    }
  }
  table(A, 'assister group × route')
  table(S, 'scorer group × route')
  console.log('\nper 90 by slot group:role (min 30 x 90 min)')
  for (const [k, [g, a, m]] of Object.entries(roleA).filter(([, v]) => v[2] >= 30).sort((x, y) => (y[1][1] / y[1][2]) - (x[1][1] / x[1][2]))) console.log(`${k.padEnd(28)} G/90 ${(g / m).toFixed(2)} A/90 ${(a / m).toFixed(2)}  (${Math.round(m)} x90)`)
}

if (mode === 'against') {
  // what the opponent's shots look like against each defensive set-up of `team` (home), from the engine's counters
  const T = club(args[1] || 'Brighton')
  const n = Number(args[2] || 4)
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Fulham', 'Everton', 'Wolves', 'Burnley', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  const variants: [string, Partial<TeamTactics>][] = [['as AI sets', {}], ['ment UD', { mentality: 'Ultra Defensive' }], ['park', { mentality: 'Defensive', buildUp: 'Long Ball', defApproach: 'Deep', lineHeight: 22, width: 38, tempo: 40, pressing: 25, chanceCreation: 'Direct Passing', playersInBox: 3 }], ['high', { defApproach: 'High', lineHeight: 80, pressing: 80 }], ['ment UA', { mentality: 'Ultra Attacking' }]]
  console.log('variant       opp shots by distance bucket (x≥): count / xG per shot / crowd')
  for (const [label, patch] of variants) {
    MatchSim.dbg = {}
    let m = 0
    for (let k = 0; k < n; k++) for (const o of opps) { play(w, T.id, o.id, 4000 + k * 13, { patch: { ...patch }, patchSide: 0 }); m++ }
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    const cells = [65, 70, 75, 80, 85, 90, 95].map((x) => { const c = (D[`s1.shotx${x}`] || 0) / m; return `${x}: ${c.toFixed(1)}/${((D[`s1.sxg${x}`] || 0) / Math.max(1, D[`s1.shotx${x}`] || 0)).toFixed(2)}/${((D[`s1.scr${x}`] || 0) / Math.max(1, D[`s1.shotx${x}`] || 0)).toFixed(1)}` })
    const tot = [60, 65, 70, 75, 80, 85, 90, 95].reduce((a, x) => a + (D[`s1.shotx${x}`] || 0), 0) / m
    const box = ['box', 'pass', 'cutback', 'cross'].map((h) => `${h} ${((D[`s1.shot.${h}`] || 0) / m).toFixed(1)}`).join(' ')
    const sn = D['s1.shotN'] || 1
    console.log(`${label.padEnd(12)} at shot: defenders in box ${(D['s1.shotDB'] / sn).toFixed(1)} attackers in box ${(D['s1.shotAB'] / sn).toFixed(1)} within 3m ${(D['s1.shotNear'] / sn).toFixed(2)} cone ${(D['s1.shotCrowd'] / sn).toFixed(2)}`)
    console.log(`${label.padEnd(12)} ${tot.toFixed(1)} shots | ${cells.join('  ')} | ${box} | p80 ${((D['p80'] || 0) / m).toFixed(1)} ok ${pc((D['p80P'] || 0) / Math.max(1, D['p80'] || 0))} boxPass ${((D['boxPass'] || 0) / m).toFixed(1)} ok ${pc((D['boxPassP'] || 0) / Math.max(1, D['boxPass'] || 0))}`)
  }
}

if (mode === 'commit') {
  // does the instruction change the numbers forward and back? attackers in the box at our shots, men behind the ball
  // when we lose it, how exposed that leaves us, and how often the other side breaks
  const T = club(args[1] || 'Burnley')
  const n = Number(args[2] || 3)
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Fulham', 'Everton', 'Wolves', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  for (const [label, patch] of [['as AI', {}], ['box 2', { playersInBox: 2 }], ['box 8', { playersInBox: 8 }], ['ment UD', { mentality: 'Ultra Defensive' }], ['ment UA', { mentality: 'Ultra Attacking' }]] as [string, Partial<TeamTactics>][]) {
    MatchSim.dbg = {}
    let m = 0, ctr = 0, ctrA = 0, cs = 0, csA = 0, cx = 0, cxA = 0
    for (let k = 0; k < n; k++) for (const o of opps) {
      const { sim } = play(w, T.id, o.id, 5100 + k * 7, { patch: { ...patch }, patchSide: 0 })
      m++
      ctr += sim!.ledger(0).counters; ctrA += sim!.ledger(1).counters
      cs += sim!.ledger(0).by.counter?.[0] || 0; csA += sim!.ledger(1).by.counter?.[0] || 0
      cx += sim!.ledger(0).by.counter?.[1] || 0; cxA += sim!.ledger(1).by.counter?.[1] || 0
    }
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    const q = (k: string, d: string) => ((D[k] || 0) / Math.max(1, D[d] || 0)).toFixed(2)
    console.log(`${label.padEnd(8)} attackers in box at our shots ${q('s0.shotAB', 's0.shotN')} · behind ball at our losses ${q('s0.behind', 's0.loss')} expo ${q('s0.expo', 's0.loss')} · counters us ${(ctr / m).toFixed(1)} (${(cs / m).toFixed(1)} shots ${(cx / m).toFixed(2)} xG) · them ${(ctrA / m).toFixed(1)} (${(csA / m).toFixed(1)} shots ${(cxA / m).toFixed(2)} xG)`)
  }
}

if (mode === 'touches') {
  // touches, passes received, shots and dribbles per 90 by slot group: how the ball is shared around a side
  const lid = Number(args[1] || 13)
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
  const G2 = (pos: string) => (pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : ['LM', 'RM'].includes(pos) ? 'WM' : ['LW', 'RW'].includes(pos) ? 'W' : pos === 'CF' ? 'CF' : 'ST')
  const A: Record<string, Record<string, number>> = {}
  let i = 0
  for (const fid of comp.fixtures) {
    if (i++ % 2) continue
    const f = w.fixtures[fid]
    const { r } = play(w, f.home, f.away, 477, { compId: comp.id, detail: true })
    for (const p of r.players as any[]) {
      if (!p.mins) continue
      const g = G2(p.pos), t = (A[g] ||= {})
      for (const k of ['touches', 'passes', 'shots', 'dribbles', 'crosses', 'boxTouches', 'keyPasses', 'tackles', 'interceptions']) t[k] = (t[k] || 0) + (p[k] || 0)
      t.m = (t.m || 0) + p.mins / 90
    }
  }
  console.log('group   x90   touch  passes  shots  drib  cross  boxT   kp   tackles  int   (real big-5 /90: GK 35 · CB 70 · FB 65 · DM 70 · CM 65 · AM 55 · W 48 · ST 32 touches)')
  for (const g of ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WM', 'W', 'CF', 'ST']) {
    const t = A[g]; if (!t) continue
    const p = (k: string) => (t[k] / t.m).toFixed(1).padStart(6)
    console.log(`${g.padEnd(5)} ${Math.round(t.m).toString().padStart(5)} ${p('touches')} ${p('passes')} ${p('shots')} ${p('dribbles')} ${p('crosses')} ${p('boxTouches')} ${p('keyPasses')} ${p('tackles')} ${p('interceptions')}`)
  }
}

if (mode === 'ft') {
  // the opponent's actions in our final third against each set-up: how many, and what becomes of them
  const T = club(args[1] || 'Brighton')
  const n = Number(args[2] || 3)
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Fulham', 'Everton', 'Wolves', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  const park = { mentality: 'Defensive', buildUp: 'Long Ball', defApproach: 'Deep', lineHeight: 22, width: 38, tempo: 40, pressing: 25, chanceCreation: 'Direct Passing', playersInBox: 3 } as Partial<TeamTactics>
  for (const [label, patch] of [['AI', {}], ['park', park], ['UD', { mentality: 'Ultra Defensive' }], ['line 25', { lineHeight: 25 }]] as [string, Partial<TeamTactics>][]) {
    MatchSim.dbg = {}
    let m = 0
    for (let k = 0; k < n; k++) for (const o of opps) { play(w, T.id, o.id, 6100 + k * 7, { patch: { ...patch }, patchSide: 0 }); m++ }
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    const acts = [7, 8, 9].reduce((a, z) => a + (D[`s1.zx${z}`] || 0), 0)
    const lost = [7, 8, 9].reduce((a, z) => a + (D[`s1.lost${z}`] || 0), 0)
    const shots = [70, 75, 80, 85, 90, 95].reduce((a, x) => a + (D[`s1.shotx${x}`] || 0), 0)
    const pr = [7, 8, 9].reduce((a, z) => a + (D[`s1.prz${z}`] || 0), 0)
    console.log(`${label.padEnd(8)} opp decisions in our third ${(acts / m).toFixed(1)} · lost there ${(lost / m).toFixed(1)} (${pc(lost / acts)}) · shots ${(shots / m).toFixed(1)} (${pc(shots / acts)} of decisions) · pressure ${(pr / acts).toFixed(2)} · decisions 60-70 ${((D['s1.zx6'] || 0) / m).toFixed(1)}`)
  }
}

if (mode === 'behind') {
  // the opponent's balls in behind against each line height of ours: how many, how many arrive, races won, shots
  const T = club(args[1] || 'Brighton')
  const n = Number(args[2] || 3)
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Fulham', 'Everton', 'Wolves', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  for (const [label, patch] of [['line 25', { lineHeight: 25, defApproach: 'Deep' }], ['line 50', { lineHeight: 50, defApproach: 'Balanced' }], ['line 80', { lineHeight: 80, defApproach: 'High' }], ['line 80 press', { lineHeight: 80, defApproach: 'Aggressive', pressing: 85 }]] as [string, Partial<TeamTactics>][]) {
    MatchSim.dbg = {}
    let m = 0, thr = 0, thrX = 0, ctr = 0, ctrX = 0
    for (let k = 0; k < n; k++) for (const o of opps) {
      const { sim } = play(w, T.id, o.id, 6300 + k * 7, { patch: { ...patch }, patchSide: 0 })
      m++
      const L = sim!.ledger(1)
      thr += L.by.through?.[0] || 0; thrX += L.by.through?.[1] || 0; ctr += L.by.counter?.[0] || 0; ctrX += L.by.counter?.[1] || 0
    }
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    const q = (k: string) => ((D[k] || 0) / m).toFixed(2)
    console.log(`${label.padEnd(14)} opp through balls ${q('s1.pass.through')} (arrive ${pc((D['s1.passL.through'] || 0) / Math.max(1, D['s1.pass.through'] || 0))}) · races won ${q('s1.ro.win')} · 1v1 ${q('s1.ro.1v1')} · swept ${q('s1.ro.sweep')} · shots after ${q('s1.ro.shot')} · offside ${q('s1.offside')} · through-ball shots ${(thr / m).toFixed(2)} xG ${(thrX / m).toFixed(2)} · counter shots ${(ctr / m).toFixed(2)} xG ${(ctrX / m).toFixed(2)}`)
  }
}

if (mode === 'own') {
  // our play in our own half by mentality: how much of it, how pressed, what we do with it
  const T = club(args[1] || 'Brighton')
  const n = Number(args[2] || 3)
  const opps = ['Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Fulham', 'Everton', 'Wolves', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  for (const [label, patch] of [['UD', { mentality: 'Ultra Defensive' }], ['Def', { mentality: 'Defensive' }], ['AI', {}], ['UA', { mentality: 'Ultra Attacking' }]] as [string, Partial<TeamTactics>][]) {
    MatchSim.dbg = {}
    let m = 0, poss = 0, spell = 0
    for (let k = 0; k < n; k++) for (const o of opps) { const { r, sim } = play(w, T.id, o.id, 6500 + k * 7, { patch: { ...patch }, patchSide: 0 }); m++; poss += r.stats[0].possession; spell += sim!.ledger(0).passes / Math.max(1, sim!.ledger(0).spells) }
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    const z = (k: string, zs: number[]) => zs.reduce((a, i) => a + (D[`s0.${k}${i}`] || 0), 0)
    const own = z('zx', [0, 1, 2, 3, 4]), pr = z('prz', [0, 1, 2, 3, 4]), lost = z('lost', [0, 1, 2, 3, 4])
    const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through']
    console.log(`${label.padEnd(4)} poss ${Math.round(poss / m)}% passes/spell ${(spell / m).toFixed(1)} · decisions in own half ${(own / m).toFixed(0)} pressure ${(pr / own).toFixed(2)} lost ${(lost / m).toFixed(1)} · passes ${kinds.map((k) => `${k} ${((D[`s0.pass.${k}`] || 0) / m).toFixed(0)}`).join(' ')} · final-third decisions ${(z('zx', [7, 8, 9]) / m).toFixed(0)}`)
  }
}

if (mode === 'roles') {
  // per 90 by slot group and role: shots, xG, box touches, crosses, dribbles, key passes, goals, assists
  const lid = Number(args[1] || 13)
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
  const G2 = (pos: string) => (pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : ['LM', 'RM', 'LW', 'RW'].includes(pos) ? 'W' : 'ST')
  const A: Record<string, Record<string, number>> = {}
  for (const fid of comp.fixtures) {
    const f = w.fixtures[fid]
    const { r, sim } = play(w, f.home, f.away, 577, { compId: comp.id, detail: true })
    const role = new Map<number, string>()
    for (const s of [0, 1] as const) sim!.liveRatings(s).forEach((l) => role.set(l.id, `${G2(l.pos)}:${l.role || '-'}`))
    for (const p of r.players as any[]) {
      if (!p.mins) continue
      const k = role.get(p.id) || G2(p.pos), t = (A[k] ||= {})
      for (const x of ['shots', 'xg', 'boxTouches', 'crosses', 'dribbles', 'keyPasses', 'goals', 'assists', 'touches']) t[x] = (t[x] || 0) + (p[x] || 0)
      t.m = (t.m || 0) + p.mins / 90
    }
  }
  console.log('slot:role                   x90   touch  shots    xG   boxT  cross  drib    kp     G     A')
  for (const [k, t] of Object.entries(A).filter(([, t]) => t.m >= 40).sort((a, b) => a[0].localeCompare(b[0]))) {
    const p = (x: string, d = 2) => (t[x] / t.m).toFixed(d).padStart(6)
    console.log(`${k.padEnd(26)} ${Math.round(t.m).toString().padStart(5)} ${p('touches', 0)} ${p('shots')} ${p('xg')} ${p('boxTouches', 1)} ${p('crosses', 1)} ${p('dribbles', 1)} ${p('keyPasses')} ${p('goals')} ${p('assists')}`)
  }
}

if (mode === 'quality') {
  // the quality of chances conceded by each set-up: big chances, close-range shots, shots by route
  const T = club(args[1] || 'Burnley')
  const n = Number(args[2] || 4)
  const opps = ['Man City', 'Liverpool', 'Arsenal', 'Chelsea', 'Newcastle', 'Aston Villa', 'Brighton', 'Fulham', 'Everton', 'Wolves', 'Sunderland', 'Leeds'].map(club).filter((c) => c && c.id !== T.id)
  const park = { mentality: 'Defensive', buildUp: 'Long Ball', defApproach: 'Deep', lineHeight: 22, width: 38, tempo: 40, pressing: 25, chanceCreation: 'Direct Passing', playersInBox: 3 } as Partial<TeamTactics>
  for (const [label, patch] of [['AI', {}], ['UD', { mentality: 'Ultra Defensive' }], ['park', park], ['high', { defApproach: 'High', lineHeight: 80, pressing: 75 }], ['UA', { mentality: 'Ultra Attacking' }]] as [string, Partial<TeamTactics>][]) {
    let m = 0, big = 0, close = 0, shots = 0, xg = 0
    const by: Record<string, [number, number]> = {}
    for (let k = 0; k < n; k++) for (const o of opps) for (const home of [true, false]) {
      const { r } = play(w, home ? T.id : o.id, home ? o.id : T.id, 7100 + k * 11, { patch: { ...patch }, patchSide: home ? 0 : 1, detail: true })
      const them = home ? 1 : 0
      m++
      for (const e of r.events) {
        if (e.side !== them || e.xg == null || !['goal', 'save', 'miss', 'woodwork', 'chance'].includes(e.type)) continue
        shots++; xg += e.xg
        if (e.xg >= 0.3) big++
        const lx = e.loc ? (them === 0 ? e.loc[0] : 100 - e.loc[0]) : 0
        if (lx >= 90) close++
        const t = (by[e.how || '?'] ||= [0, 0]); t[0]++; t[1] += e.xg
      }
    }
    const top = Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([k, [s, x]]) => `${k} ${(s / m).toFixed(1)}/${(x / m).toFixed(2)}`).join(' ')
    console.log(`${label.padEnd(5)} opp shots ${(shots / m).toFixed(1)} xG ${(xg / m).toFixed(2)} (${(xg / shots).toFixed(3)}/shot) · big chances ${(big / m).toFixed(2)} · inside 10m ${(close / m).toFixed(1)} · ${top}`)
  }
}

if (mode === 'matchup') {
  // personnel against instructions: the same opponent with its forwards made quicker or slower, against a high and a
  // deep line; and with its midfield made more or less press-resistant, against a high and a low press
  const T = club(args[1] || 'Brighton')
  const n = Number(args[2] || 16)
  const O = club(args[3] || 'Aston Villa')
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(O.id))
  const s = sideInputLab(O.id, comp)
  const fwd = s.sheet.lineup.map((id) => w.players[id]).filter((p) => ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(p.positions[0]))
  const mid = s.sheet.lineup.map((id) => w.players[id]).filter((p) => ['CM', 'CDM', 'CB', 'CAM'].includes(p.positions[0]))
  const keep = new Map<number, number[]>()
  for (const p of [...fwd, ...mid]) keep.set(p.id, [...p.attrs])
  const restore = () => { for (const p of [...fwd, ...mid]) p.attrs = [...keep.get(p.id)!] as any }
  const shift = (ps: typeof fwd, keys: number[], d: number) => { for (const p of ps) for (const k of keys) p.attrs[k] = Math.max(20, Math.min(99, p.attrs[k] + d)) }
  const run = (patch: Partial<TeamTactics>) => {
    let xga = 0, xg = 0, m = 0
    for (let k = 0; k < n; k++) for (const home of [true, false]) { const { r } = play(w, home ? T.id : O.id, home ? O.id : T.id, 8800 + k * 3, { patch: { ...patch }, patchSide: home ? 0 : 1 }); const us = home ? 0 : 1; xg += r.stats[us].xg; xga += r.stats[1 - us].xg; m++ }
    return [xg / m, xga / m]
  }
  const { A: AT } = { A: (globalThis as any).A_ATTR }
  void AT
  const SP = [ATTR.sprintSpeed, ATTR.acceleration], PR = [ATTR.composure, ATTR.ballControl, ATTR.shortPassing, ATTR.agility]
  for (const [lbl, ps, keys] of [['their forwards\' pace', fwd, SP], ['their press resistance', mid, PR]] as const) {
    for (const d of [-15, 0, 15]) {
      restore(); shift(ps as any, keys as any, d)
      const hi = lbl.includes('pace') ? run({ lineHeight: 82, defApproach: 'High' }) : run({ pressing: 90, defApproach: 'Aggressive' })
      const lo = lbl.includes('pace') ? run({ lineHeight: 30, defApproach: 'Deep' }) : run({ pressing: 20, defApproach: 'Balanced' })
      console.log(`${lbl} ${d >= 0 ? '+' : ''}${d}: ${lbl.includes('pace') ? 'high line' : 'high press'} xG ${hi[0].toFixed(2)} xGA ${hi[1].toFixed(2)} · ${lbl.includes('pace') ? 'deep line' : 'low press'} xG ${lo[0].toFixed(2)} xGA ${lo[1].toFixed(2)} · (high − low) xGD ${((hi[0] - hi[1]) - (lo[0] - lo[1])).toFixed(2)}`)
    }
    restore()
  }
}

if (mode === 'table') {
  // a full league season through the full engine: the final table, goals for and against, xG, top of the scoring list
  const lid = Number(args[1] || 13)
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
  const T: Record<number, { p: number; w: number; d: number; l: number; gf: number; ga: number; xg: number; xga: number; pts: number; poss: number; pp: number }> = {}
  const P: Record<number, number> = {}
  for (const fid of comp.fixtures) {
    const f = w.fixtures[fid]
    const { r } = play(w, f.home, f.away, Number(args[2] || 777), { compId: comp.id })
    for (const [id, s] of [[f.home, 0], [f.away, 1]] as const) {
      const t = (T[id] ||= { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, xg: 0, xga: 0, pts: 0, poss: 0, pp: 0 })
      const gf = r.score[s], ga = r.score[1 - s]
      t.p++; t.gf += gf; t.ga += ga; t.xg += r.stats[s].xg; t.xga += r.stats[1 - s].xg; t.poss += r.stats[s].possession; t.pp += 100 * r.stats[s].passes / Math.max(1, r.stats[0].passes + r.stats[1].passes)
      if (gf > ga) { t.w++; t.pts += 3 } else if (gf === ga) { t.d++; t.pts++ } else t.l++
    }
    for (const p of r.players) if (p.goals) P[p.id] = (P[p.id] || 0) + p.goals
  }
  const rows = Object.entries(T).sort((a, b) => b[1].pts - a[1].pts || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga))
  rows.forEach(([id, t], i) => console.log(`${String(i + 1).padStart(2)} ${(w.clubs[+id].short).padEnd(16)} ${String(t.w).padStart(2)}-${String(t.d).padStart(2)}-${String(t.l).padStart(2)}  ${String(t.gf).padStart(3)}:${String(t.ga).padEnd(3)} ${String(t.pts).padStart(3)} pts · xG ${t.xg.toFixed(0)}:${t.xga.toFixed(0)} · poss ${Math.round(t.poss / t.p)}% (passes ${Math.round(t.pp / t.p)}%) · XI ${xiLevel(w, +id).toFixed(1)}`))
  console.log('top scorers: ' + Object.entries(P).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, g]) => `${w.players[+id].name} ${g}`).join(', '))
}
