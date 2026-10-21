// Engine lab: reproducible match-engine experiments from a fresh world, read from the engine's own tactical ledger.
//
//   npx tsx scripts/qa/engine-lab.ts tactics [team=Brentford] [rounds=2]   one setting changed at a time, vs a spread of opponents
//   npx tsx scripts/qa/engine-lab.ts formations [team=Brentford] [rounds=2] every formation with the club's AI tactics
//   npx tsx scripts/qa/engine-lab.ts matrix [n=60]                          strong/weak pairings across leagues: scores, upsets, draws
//   npx tsx scripts/qa/engine-lab.ts dist [leagues=13,53] [--light]         a season per league: scorers, assists, keepers, stoppage time
//
// Every number is an average per match for the side under test unless it says otherwise.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { Fixture, MatchResult, TeamTactics, World } from '../../src/domain/types'
import { DEFAULT_TACTICS, FORMATIONS, VISION_TACTICS } from '../../src/domain/constants'
import { buildSheet } from '../../src/engine/match/selection'
import { MatchSim } from '../../src/engine/match/engine'
import { quickSim } from '../../src/engine/match/quick'
import { matchContext, matchUp, sideInput } from '../../src/engine/world/matchRunner'
import { viewOf, type LedgerView } from '../../src/engine/match/ledger'
import { hashString } from '../../src/domain/rng'

const [mode = 'tactics', a1, a2] = process.argv.slice(2).filter((x) => !x.startsWith('--'))
const light = process.argv.includes('--light')

export function freshWorld(seed = 11): World {
  const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
  const ars = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
  return createWorld(raw, {
    clubId: ars,
    manager: { firstName: 'Lab', lastName: 'Manager', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
    settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
    seed,
  })
}

const club = (w: World, name: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name || c.name.includes(name)))!

/** One match between two clubs in a league setting, AI sheets on both sides (optionally a tactics patch for `test`). */
export function play(w: World, homeId: number, awayId: number, seed: number, opts: { patch?: Partial<TeamTactics>; patchSide?: 0 | 1; detail?: boolean; light?: boolean; compId?: string; formation?: string } = {}) {
  const comp = Object.values(w.competitions).find((c) => c.id === opts.compId) || Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(homeId))
  const f: Fixture = { id: `lab:${homeId}:${awayId}:${seed}`, compId: comp?.id || '', home: homeId, away: awayId, date: '2026-10-10', played: false } as Fixture
  const ctx = matchContext(w, f, !!opts.detail)
  ctx.userSide = -1
  // each AI side sets up for this opponent and venue, as in the game (see contextTactics)
  const home = sideInput(w, homeId, comp, false, undefined, f.id, matchUp(f, 0))
  const away = sideInput(w, awayId, comp, false, undefined, f.id, matchUp(f, 1))
  if (opts.formation) {
    const s = opts.patchSide === 1 ? away : home
    const b = buildSheet(w, w.clubs[s.clubId], opts.formation, s.sheet.tactics, { comp })
    s.sheet = { ...s.sheet, formation: b.formation, lineup: b.lineup, bench: b.bench, roles: b.roles }
    for (const id of [...b.lineup, ...b.bench]) s.players[id] = w.players[id]
  }
  if (opts.patch) {
    const s = opts.patchSide === 1 ? away : home
    s.sheet = { ...s.sheet, tactics: { ...s.sheet.tactics, ...opts.patch } as TeamTactics }
  }
  const sd = hashString(`${seed}:${homeId}:${awayId}`)
  if (opts.light) return { r: quickSim(home, away, ctx, sd), sim: undefined }
  const sim = new MatchSim(home, away, ctx, sd)
  const r = sim.runToEnd()
  return { r, sim }
}

interface Acc { n: number; v: Record<string, number>; gf: number; ga: number; pts: number; xga: number; oppShotsCounter: number; oppXgCounter: number }
const acc = (): Acc => ({ n: 0, v: {}, gf: 0, ga: 0, pts: 0, xga: 0, oppShotsCounter: 0, oppXgCounter: 0 })
function addView(a: Acc, v: LedgerView, o: LedgerView, r: MatchResult, us: 0 | 1) {
  a.n++
  const put = (k: string, x: number) => { a.v[k] = (a.v[k] || 0) + x }
  for (const [k, x] of Object.entries(v)) if (typeof x === 'number') put(k, x)
  v.entryLanes.forEach((x, i) => put('lane' + i, x))
  for (const [k, [n, xg]] of Object.entries(v.by)) { put('by.' + k, n); put('byxg.' + k, xg) }
  a.gf += r.score[us]; a.ga += r.score[1 - us]
  a.pts += r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0
  a.xga += o.xg
  a.oppShotsCounter += o.by.counter?.[0] || 0
  a.oppXgCounter += o.by.counter?.[1] || 0
  put('oppPoss', o.poss); put('oppSpell', o.spell); put('oppEntries', o.entries); put('oppShots', o.shots); put('oppWonHigh', o.wonHigh); put('oppQuick', o.quickWon)
}
const avg = (a: Acc, k: string) => (a.v[k] || 0) / Math.max(1, a.n)
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2), pc = (x: number) => Math.round(x * 100) + '%'

function tacticsSweep(w: World, teamName: string, rounds: number) {
  const T = club(w, teamName)
  const opps = (process.env.OPPS ? process.env.OPPS.split(',') : ['Arsenal', 'Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Brighton', 'Fulham', 'Everton', 'Wolves', 'Burnley', 'Sunderland'])
    .map((n) => club(w, n)).filter((c) => c && c.id !== T.id)
  const variants: [string, Partial<TeamTactics>][] = [
    ['as AI sets', {}], ['balanced', { ...DEFAULT_TACTICS }],
    ['mentality UD', { mentality: 'Ultra Defensive' }], ['mentality D', { mentality: 'Defensive' }], ['mentality A', { mentality: 'Attacking' }], ['mentality UA', { mentality: 'Ultra Attacking' }],
    ['tempo 20', { tempo: 20 }], ['tempo 85', { tempo: 85 }], ['width 20', { width: 20 }], ['width 85', { width: 85 }],
    ['line 25', { lineHeight: 25 }], ['line 80', { lineHeight: 80 }], ['press 20', { pressing: 20 }], ['press 85', { pressing: 85 }],
    ['def Deep', { defApproach: 'Deep' }], ['def High', { defApproach: 'High' }], ['def Aggressive', { defApproach: 'Aggressive' }],
    ['build Short', { buildUp: 'Short Passing' }], ['build Long', { buildUp: 'Long Ball' }], ['build Counter', { buildUp: 'Counter' }],
    ['chance Possession', { chanceCreation: 'Possession' }], ['chance Direct', { chanceCreation: 'Direct Passing' }], ['chance Runs', { chanceCreation: 'Forward Runs' }],
    ['box 3', { playersInBox: 3 }], ['box 8', { playersInBox: 8 }], ['offside trap', { offsideTrap: true }],
    ...Object.entries(VISION_TACTICS).filter(([k]) => k !== 'Balanced').map(([k, v]) => ['preset ' + k, v] as [string, Partial<TeamTactics>]),
  ]
  const only = process.env.ONLY ? process.env.ONLY.split(',') : undefined
  const list = only ? variants.filter(([l]) => only.some((o) => l.includes(o))) : variants
  const detail = !!process.env.DETAIL
  console.log(`${T.name} (${T.squadAvg}) vs ${opps.length} opponents × ${rounds} rounds × home/away\n`)
  console.log('variant              poss  spell pass%  fwd%  long% reach tilt  lostOwn wonHigh quick ctr  shots  xG   xGA  ctrA  pts   goals')
  for (const [label, patch] of list) {
    const a = acc()
    const oppBy: Record<string, [number, number]> = {}
    let oppXgSum = 0, oppShotN = 0, oppBig = 0
    for (let k = 0; k < rounds; k++) for (const o of opps) for (const home of [true, false]) {
      const { r, sim } = play(w, home ? T.id : o.id, home ? o.id : T.id, 1000 + k * 31, { patch: { ...patch }, patchSide: home ? 0 : 1 })
      const us = home ? 0 : 1
      const ov = viewOf(sim!.ledger(1 - us as 0 | 1), sim!.ledger(us), 90)
      addView(a, viewOf(sim!.ledger(us), sim!.ledger(1 - us as 0 | 1), 90), ov, r, us)
      for (const [k, [n, x]] of Object.entries(ov.by)) { const t = (oppBy[k] ||= [0, 0]); t[0] += n; t[1] += x }
      oppXgSum += ov.xg; oppShotN += ov.shots; oppBig += r.stats[1 - us].bigChances || 0
    }
    console.log(`${label.padEnd(20)} ${pc(avg(a, 'poss')).padStart(4)}  ${f1(avg(a, 'spell')).padStart(4)}  ${pc(avg(a, 'passAcc')).padStart(4)}  ${pc(avg(a, 'fwdShare')).padStart(4)}  ${pc(avg(a, 'longShare')).padStart(4)}  ${pc(avg(a, 'reach')).padStart(4)} ${pc(avg(a, 'tilt')).padStart(4)}  ${f1(avg(a, 'lostOwn')).padStart(5)}   ${f1(avg(a, 'wonHigh')).padStart(5)}  ${f1(avg(a, 'quickWon')).padStart(4)} ${f1(avg(a, 'counters')).padStart(4)}  ${f1(avg(a, 'shots')).padStart(4)}  ${f2(avg(a, 'xg'))} ${f2(a.xga / a.n)} ${f1(a.oppShotsCounter / a.n).padStart(4)}  ${f2(a.pts / a.n)}  ${f2(a.gf / a.n)}-${f2(a.ga / a.n)}`)
    if (detail) {
      const mix = Object.entries(oppBy).sort((x, y) => y[1][1] - x[1][1]).slice(0, 5).map(([k, [n, x]]) => `${k} ${f1(n / a.n)}/${f2(x / a.n)}`).join(' ')
      const ourMix = Object.keys(a.v).filter((k) => k.startsWith('byxg.')).map((k) => [k.slice(5), avg(a, 'by.' + k.slice(5)), avg(a, k)] as [string, number, number]).sort((x, y) => y[2] - x[2]).slice(0, 5).map(([k, n, x]) => `${k} ${f1(n)}/${f2(x)}`).join(' ')
      console.log(`   opp: poss ${pc(avg(a, 'oppPoss'))} spell ${f1(avg(a, 'oppSpell'))} entries ${f1(avg(a, 'oppEntries'))} shots ${f1(oppShotN / a.n)} xG/shot ${f2(oppXgSum / Math.max(1, oppShotN))} big ${f1(oppBig / a.n)} wonHigh ${f1(avg(a, 'oppWonHigh'))} | ${mix}`)
      console.log(`   us : entries ${f1(avg(a, 'entries'))} L/C/R ${f1(avg(a, 'lane0'))}/${f1(avg(a, 'lane1'))}/${f1(avg(a, 'lane2'))} box ${f1(avg(a, 'boxEntries'))} crosses ${f1(avg(a, 'crosses'))} carries ${f1(avg(a, 'progCarries'))} drib ${f1(avg(a, 'dribbles'))} lostPressed ${f1(avg(a, 'lostPressed'))} lostMid ${f1(avg(a, 'lostMid'))} lostFinal ${f1(avg(a, 'lostFinal'))} | ${ourMix}`)
    }
  }
}

function formationSweep(w: World, teamName: string, rounds: number) {
  const T = club(w, teamName)
  const opps = ['Arsenal', 'Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Brighton', 'Fulham', 'Everton', 'Wolves', 'Burnley', 'Sunderland']
    .map((n) => club(w, n)).filter((c) => c && c.id !== T.id)
  const only = process.env.ONLY ? process.env.ONLY.split(',') : undefined
  console.log(`${T.name} (${T.squadAvg}) by formation (AI tactics) vs ${opps.length} opponents × ${rounds} rounds × home/away\n`)
  console.log('formation            poss  spell pass%  reach entries L/C/R          box  shots  xG   xGA  pts   goals')
  for (const fm of FORMATIONS) {
    if (only && !only.some((o) => fm.id.includes(o))) continue
    const a = acc()
    for (let k = 0; k < rounds; k++) for (const o of opps) for (const home of [true, false]) {
      const { r, sim } = play(w, home ? T.id : o.id, home ? o.id : T.id, 1000 + k * 31, { formation: fm.id, patchSide: home ? 0 : 1 })
      const us = home ? 0 : 1
      addView(a, viewOf(sim!.ledger(us), sim!.ledger(1 - us as 0 | 1), 90), viewOf(sim!.ledger(1 - us as 0 | 1), sim!.ledger(us), 90), r, us)
    }
    console.log(`${fm.id.padEnd(20)} ${pc(avg(a, 'poss')).padStart(4)}  ${f1(avg(a, 'spell')).padStart(4)}  ${pc(avg(a, 'passAcc')).padStart(4)}  ${pc(avg(a, 'reach')).padStart(4)}  ${f1(avg(a, 'entries')).padStart(5)}  ${f1(avg(a, 'lane0'))}/${f1(avg(a, 'lane1'))}/${f1(avg(a, 'lane2'))}`.padEnd(70) + `${f1(avg(a, 'boxEntries')).padStart(4)}  ${f1(avg(a, 'shots')).padStart(4)}  ${f2(avg(a, 'xg'))} ${f2(a.xga / a.n)}  ${f2(a.pts / a.n)}  ${f2(a.gf / a.n)}-${f2(a.ga / a.n)}`)
  }
}

function matrix(w: World, n: number) {
  const pairs: [string, string, string][] = [
    ['strong v strong', 'Arsenal', 'Man City'], ['strong v strong', 'Liverpool', 'Chelsea'],
    ['strong v weak', 'Arsenal', 'Burnley'], ['strong v weak', 'Man City', 'Sunderland'], ['weak v strong', 'Burnley', 'Liverpool'],
    ['weak v weak', 'Burnley', 'Sunderland'], ['mid v mid', 'Brighton', 'Fulham'],
    ['LaLiga top', 'Real Madrid', 'Barcelona'], ['LaLiga s v w', 'Barcelona', 'Elche'],
    ['Bundesliga s v w', 'Bayern', 'Heidenheim'], ['Serie A mid', 'Lazio', 'Torino'],
  ]
  console.log('pairing              home v away                 home  draw  away  goals  hxG  axG  hposs  ≥3 margin  0-0')
  for (const [label, h, aw] of pairs) {
    const H = club(w, h), Aw = club(w, aw)
    if (!H || !Aw) { console.log(label, 'missing', h, aw); continue }
    let hw = 0, d = 0, awn = 0, g = 0, hx = 0, ax = 0, hp = 0, big = 0, nil = 0
    for (let i = 0; i < n; i++) {
      const { r } = play(w, H.id, Aw.id, 5000 + i)
      const [a, b] = r.score
      if (a > b) hw++; else if (a === b) d++; else awn++
      g += a + b; hx += r.stats[0].xg; ax += r.stats[1].xg; hp += r.stats[0].possession
      if (Math.abs(a - b) >= 3) big++
      if (a + b === 0) nil++
    }
    console.log(`${label.padEnd(20)} ${(H.short + ' (' + H.squadAvg + ') v ' + Aw.short + ' (' + Aw.squadAvg + ')').padEnd(28)} ${pc(hw / n).padStart(4)}  ${pc(d / n).padStart(4)}  ${pc(awn / n).padStart(4)}  ${f2(g / n)}  ${f2(hx / n)} ${f2(ax / n)}  ${Math.round(hp / n)}%   ${pc(big / n).padStart(4)}     ${pc(nil / n)}`)
  }
}

function dist(w: World, leagues: number[]) {
  const posG = (p: string) => (p === 'GK' ? 'GK' : p === 'CB' ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(p) ? 'FB' : p === 'CDM' ? 'DM' : p === 'CM' ? 'CM' : p === 'CAM' ? 'AM' : ['LM', 'RM', 'LW', 'RW'].includes(p) ? 'W' : 'ST')
  const goalsBy: Record<string, number> = {}, astBy: Record<string, number> = {}
  let goals = 0, assisted = 0, og = 0, pen = 0, matches = 0
  const ply: Record<number, { g: number; a: number; apps: number; pos: string; name: string; club: string }> = {}
  const gk: { r: number; saves: number; conc: number; xgotF: number; cs: boolean }[] = []
  const add1: number[] = [], add2: number[] = []
  const ratings: Record<string, number[]> = {}
  const scores: Record<string, number> = {}
  for (const lid of leagues) {
    const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
    for (const fid of comp.fixtures) {
      const f = w.fixtures[fid]
      const { r, sim } = play(w, f.home, f.away, 77, { light, compId: comp.id })
      matches++
      const k = `${Math.min(r.score[0], 4)}-${Math.min(r.score[1], 4)}`
      scores[k] = (scores[k] || 0) + 1
      if (sim) {
        const tl = sim.timeline
        add1.push(Math.max(0, ...tl.filter((x) => x.m === 45).map((x) => x.add)))
        add2.push(Math.max(0, ...tl.filter((x) => x.m === 90).map((x) => x.add)))
      }
      const byId = new Map(r.players.map((p) => [p.id, p]))
      for (const p of r.players) {
        const q = (ply[p.id] ||= { g: 0, a: 0, apps: 0, pos: posG(p.pos), name: w.players[p.id]?.name || '', club: w.clubs[w.players[p.id]?.clubId || 0]?.short || '' })
        if (p.mins > 0) q.apps++
        if (p.mins >= 60) (ratings[posG(p.pos)] ||= []).push(p.rating)
        if (posG(p.pos) === 'GK' && p.mins >= 85) gk.push({ r: p.rating, saves: p.saves, conc: (p as any).conceded ?? 0, xgotF: (p as any).xgotFaced ?? 0, cs: !((p as any).conceded) })
      }
      for (const e of r.events) {
        if (e.type === 'owngoal') { og++; goals++; continue }
        if (e.type !== 'goal' && e.type !== 'penGoal') continue
        goals++
        if (e.type === 'penGoal') pen++
        const s = byId.get(e.player!)
        if (s) { goalsBy[posG(s.pos)] = (goalsBy[posG(s.pos)] || 0) + 1; ply[e.player!].g++ }
        if (e.player2) { assisted++; const a = byId.get(e.player2); if (a) { astBy[posG(a.pos)] = (astBy[posG(a.pos)] || 0) + 1; ply[e.player2].a++ } }
      }
    }
  }
  const share = (m: Record<string, number>, tot: number) => ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB', 'GK'].map((k) => `${k} ${pc((m[k] || 0) / Math.max(1, tot))}`).join(' · ')
  console.log(`${matches} matches (${light ? 'light sim' : 'full engine'}) · ${f2(goals / matches)} goals/match · penalties ${pc(pen / goals)} · own goals ${pc(og / goals)} · assisted ${pc(assisted / goals)}`)
  console.log('scorers  ', share(goalsBy, goals - og))
  console.log('assisters', share(astBy, assisted))
  const top = Object.values(ply).sort((a, b) => b.g - a.g).slice(0, 8)
  console.log('top scorers', top.map((p) => `${p.name} (${p.club}, ${p.pos}) ${p.g} in ${p.apps}`).join(' | '))
  const topA = Object.values(ply).sort((a, b) => b.a - a.a).slice(0, 8)
  console.log('top assisters', topA.map((p) => `${p.name} (${p.club}, ${p.pos}) ${p.a} in ${p.apps}`).join(' | '))
  const astPer = Object.values(ply).filter((p) => p.apps >= 10).map((p) => p.a / p.apps).sort((a, b) => b - a)
  console.log('assists per app, regulars: top', astPer.slice(0, 5).map(f2).join(' '), '· 99th pct', f2(astPer[Math.floor(astPer.length * 0.01)] || 0))
  const ro = (k: string) => { const r = ratings[k] || []; r.sort((a, b) => a - b); return r.length ? `${k} ${f2(r.reduce((x, y) => x + y, 0) / r.length)} (p10 ${f1(r[Math.floor(r.length * 0.1)])} p90 ${f1(r[Math.floor(r.length * 0.9)])})` : '' }
  console.log('ratings 60+min', ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'].map(ro).join(' · '))
  if (gk.length) {
    const bucket = (f: (g: typeof gk[0]) => boolean) => { const x = gk.filter(f); return x.length ? `${f2(x.reduce((s, g) => s + g.r, 0) / x.length)} (n ${x.length})` : '-' }
    console.log('keepers: clean sheet', bucket((g) => g.cs), '· 1 conceded', bucket((g) => g.conc === 1), '· 3+ conceded', bucket((g) => g.conc >= 3), '· 5+ saves', bucket((g) => g.saves >= 5), '· 0-1 saves & CS', bucket((g) => g.saves <= 1 && g.cs))
    const xgotGap = gk.map((g) => ({ r: g.r, gp: g.xgotF - g.conc }))
    const corr = pearson(xgotGap.map((x) => x.gp), xgotGap.map((x) => x.r))
    console.log('keepers: corr(rating, goals prevented)', f2(corr))
  }
  if (add1.length) {
    const h = (xs: number[]) => { const c: Record<number, number> = {}; for (const x of xs) c[x] = (c[x] || 0) + 1; return Object.entries(c).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${pc(v / xs.length)}`).join(' ') }
    console.log('stoppage 1H', f2(add1.reduce((a, b) => a + b, 0) / add1.length), '|', h(add1))
    console.log('stoppage 2H', f2(add2.reduce((a, b) => a + b, 0) / add2.length), '|', h(add2))
  }
  console.log('scores', Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${pc(v / matches)}`).join(' · '))
}

function pearson(x: number[], y: number[]) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  return sxy / Math.sqrt(sxx * syy || 1)
}

if (process.argv[1]?.includes('engine-lab')) {
  const t0 = Date.now()
  const w = freshWorld()
  if (mode === 'tactics') tacticsSweep(w, a1 || 'Brentford', Number(a2 || 2))
  else if (mode === 'formations') formationSweep(w, a1 || 'Brentford', Number(a2 || 2))
  else if (mode === 'matrix') matrix(w, Number(a1 || 60))
  else if (mode === 'dist') dist(w, (a1 || '13,53').split(',').map(Number))
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
