// Tactical practice: a training match between the manager's side, playing a practice copy of its tactics, and a
// sparring side of a chosen strength and style. It runs through the real match engine with fresh legs on both sides
// and no injuries, and nothing comes back to the career: no results, tables, player statistics, fitness or morale.
// The report afterwards is read off what actually happened in that simulation.
import type { Competition, Fixture, TeamMatchStats, TeamTactics, World } from '../../domain/types'
import { MatchSim, type SideInput } from '../match/engine'
import { viewOf } from '../match/ledger'
import { matchContext, sideInput } from './matchRunner'

/** The manager's current league competition, for the match rules and the choice of sparring sides. */
function leagueOf(w: World, clubId: number): Competition | undefined {
  return Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(clubId))
}

export type PracticeStyle = 'balanced' | 'deep' | 'press' | 'counter' | 'possession'
export type PracticeLevel = 'weaker' | 'similar' | 'stronger'

/** How the sparring side plays: settings it uses on top of its own manager's sheet. */
export const PRACTICE_STYLES: { id: PracticeStyle; label: string; desc: string; tactics: Partial<TeamTactics> }[] = [
  { id: 'balanced', label: 'Balanced', desc: 'A neutral side: mid block, measured passing', tactics: { mentality: 'Balanced', defApproach: 'Balanced', lineHeight: 50, pressing: 50, tempo: 55, width: 55, buildUp: 'Balanced', chanceCreation: 'Balanced' } },
  { id: 'deep', label: 'Deep block', desc: 'Sits in its own half and makes you break it down', tactics: { mentality: 'Defensive', defApproach: 'Deep', lineHeight: 28, pressing: 30, tempo: 45, width: 45, buildUp: 'Long Ball', chanceCreation: 'Direct Passing' } },
  { id: 'press', label: 'High press', desc: 'Presses your build-up and squeezes up', tactics: { mentality: 'Attacking', defApproach: 'Aggressive', lineHeight: 74, pressing: 85, tempo: 70, width: 55, buildUp: 'Balanced', chanceCreation: 'Forward Runs' } },
  { id: 'counter', label: 'Counter-attack', desc: 'Lets you have it, then breaks fast', tactics: { mentality: 'Defensive', defApproach: 'Deep', lineHeight: 35, pressing: 40, tempo: 78, width: 52, buildUp: 'Counter', chanceCreation: 'Direct Passing' } },
  { id: 'possession', label: 'Possession side', desc: 'Keeps the ball and makes you chase', tactics: { mentality: 'Balanced', defApproach: 'High', lineHeight: 66, pressing: 65, tempo: 42, width: 58, buildUp: 'Short Passing', chanceCreation: 'Possession' } },
]

export const PRACTICE_LEVELS: { id: PracticeLevel; label: string }[] = [
  { id: 'weaker', label: 'Weaker' }, { id: 'similar', label: 'Similar' }, { id: 'stronger', label: 'Stronger' },
]

/** A sparring side from the manager's league (or, failing that, anywhere) whose squad is about the level asked for. */
export function practiceOpponent(w: World, level: PracticeLevel): number {
  const me = w.clubs[w.userClubId]
  const target = me.squadAvg + (level === 'weaker' ? -5 : level === 'stronger' ? 4 : 0)
  const lg = leagueOf(w, me.id)
  const pool = (lg?.clubs.length ? lg.clubs : Object.keys(w.clubs).map(Number)).map((id) => w.clubs[id]).filter((c) => c && c.id !== me.id && !c.national)
  const best = [...pool].sort((a, b) => Math.abs(a.squadAvg - target) - Math.abs(b.squadAvg - target))[0]
  return best?.id ?? pool[0].id
}

/** Fresh legs for a training match: the players' own quality and form, none of the season's tiredness. */
function fresh(s: SideInput): SideInput {
  const players: SideInput['players'] = {}
  for (const [id, p] of Object.entries(s.players)) players[Number(id)] = { ...p, fitness: 100 }
  return { ...s, players }
}

export interface Practice { sim: MatchSim; fixture: Fixture; opponent: number }

/** Set up a practice match: the manager's main team sheet with `tactics`, against `opponent` playing `style`. */
export function createPractice(w: World, tactics: TeamTactics, opponent: number, style: PracticeStyle, seed: number): Practice {
  const me = w.userClubId
  const lg = leagueOf(w, me)
  const fixture: Fixture = {
    id: `practice:${seed}`, compId: lg?.id || '', roundName: 'Practice match', date: w.date, time: '11:00', home: me, away: opponent,
    played: false, neutral: true, venue: `${w.clubs[me].name} training ground`,
  }
  const ctx = matchContext(w, fixture, true)
  // a training match: no crowd, nothing at stake, no extra time, nobody hurt, both sides at their own level
  Object.assign(ctx, { attendance: 0, importance: 1, derby: undefined, final: false, knockout: false, extraTime: false, penaltiesOnly: false, injuryRate: 0, userSide: 0, aiBoost: 1, assistantSubs: true, compName: 'Practice' })
  const ours = sideInput(w, me, lg, true)
  const home = fresh({ ...ours, sheet: { ...ours.sheet, tactics: { ...tactics } } })
  const theirs = sideInput(w, opponent, lg, false)
  const st = PRACTICE_STYLES.find((s) => s.id === style) || PRACTICE_STYLES[0]
  const away = fresh({ ...theirs, controlledByUser: false, sheet: { ...theirs.sheet, tactics: { ...theirs.sheet.tactics, ...st.tactics } } })
  return { sim: new MatchSim(home, away, ctx, seed), fixture, opponent }
}

// ============================================================================ what happened

export interface PracticeReport {
  /** matches the report covers (one watched, or several run at once), and their record */
  n: number
  score: [number, number]
  record: [number, number, number]
  /** average team numbers per match: ours, then theirs */
  stats: [TeamMatchStats, TeamMatchStats]
  /** share of our actions in each third of the pitch (territory) */
  thirds: [number, number, number]
  /** our moves into the final third per match, and the share down the left, through the middle and down the right */
  entries: number
  lanes: [number, number, number]
  /** where we won the ball back per match: our third, midfield, their third */
  won: [number, number, number]
  /** passes per spell on the ball, and the share of passes played forward 15m or more, and of long balls */
  moveLength: number
  forward: number
  longShare: number
  /** our shots and xG per match by how the chance came, and theirs */
  chances: { how: string; shots: number; xg: number }[]
  against: { how: string; shots: number; xg: number }[]
  /** our starters' average energy at the end */
  energy: number
  /** the most involved players, and who made and took the chances (per match) */
  hub?: { id: number; touches: number }
  creator?: { id: number; keyPasses: number }
  shooter?: { id: number; shots: number; xg: number }
  notes: string[]
}

const HOW: Record<string, string> = {
  pass: 'Build-up play', through: 'Through balls', cross: 'Crosses', cutback: 'Cut-backs', solo: 'Dribbles and cut-ins', counter: 'Counter-attacks',
  box: 'Loose balls in the box', long: 'Long shots', corner: 'Corners', freekick: 'Free kicks', throw: 'Long throws', rebound: 'Rebounds', error: 'Mistakes', pen: 'Penalties',
}
export const howLabel = (h: string) => HOW[h] || 'Other'

const SHOTS = new Set(['goal', 'penGoal', 'save', 'miss', 'woodwork', 'chance', 'penMiss'])
const STAT_KEYS = ['possession', 'shots', 'sot', 'xg', 'passes', 'passAcc', 'corners', 'fouls', 'offsides', 'crosses', 'tackles', 'interceptions'] as const

/** Read practice matches off the simulations: the action log of every minute, the shots and the players. */
export function practiceReport(sims: MatchSim[], us: 0 | 1 = 0): PracticeReport {
  const n = sims.length
  const toUs = (x: number, y: number) => (us === 0 ? { x, y } : { x: 100 - x, y: 100 - y })
  const thirds = [0, 0, 0], lanes = [0, 0, 0], won = [0, 0, 0]
  let acts = 0, entries = 0, passes = 0, fwd = 0, long = 0, spells = 0, spellPasses = 0, energy = 0, starters = 0
  const record: [number, number, number] = [0, 0, 0], goals: [number, number] = [0, 0]
  const stats = [{} as Record<string, number>, {} as Record<string, number>]
  const shots = [new Map<string, { how: string; shots: number; xg: number }>(), new Map<string, { how: string; shots: number; xg: number }>()]
  const people = new Map<number, { touches: number; keyPasses: number; shots: number; xg: number }>()
  for (const sim of sims) {
    const res = sim.result()
    goals[0] += res.score[us]; goals[1] += res.score[1 - us]
    record[res.score[us] > res.score[1 - us] ? 0 : res.score[us] === res.score[1 - us] ? 1 : 2]++
    for (const i of [0, 1] as const) for (const k of STAT_KEYS) stats[i][k] = (stats[i][k] || 0) + ((res.stats[i === 0 ? us : 1 - us] as unknown as Record<string, number>)[k] || 0)
    let inSpell = false
    for (const f of sim.timeline) {
      for (const a of f.acts || []) {
        if (a.s !== us) { inSpell = false; continue }
        const p0 = toUs(a.x0, a.y0), p1 = toUs(a.x1, a.y1)
        acts++
        thirds[p0.x < 33.3 ? 0 : p0.x < 66.7 ? 1 : 2]++
        if (a.ok && (a.k === 'pass' || a.k === 'long' || a.k === 'through' || a.k === 'carry' || a.k === 'drib') && p0.x < 66.7 && p1.x >= 66.7) {
          entries++
          lanes[p1.y < 33.3 ? 0 : p1.y < 66.7 ? 1 : 2]++
        }
        if (a.k === 'pass' || a.k === 'long' || a.k === 'through' || a.k === 'cross') {
          passes++
          if (p1.x - p0.x >= 15) fwd++
          if (a.k === 'long') long++
          if (a.ok) { if (!inSpell) { spells++; inSpell = true } spellPasses++ }
        }
        if ((a.k === 'tackle' || a.k === 'int' || a.k === 'rec' || a.k === 'claim') && a.ok) won[p0.x < 33.3 ? 0 : p0.x < 66.7 ? 1 : 2]++
      }
    }
    for (const e of res.events) {
      if (!SHOTS.has(e.type) || (e.xg == null && !e.type.startsWith('pen'))) continue
      const how = e.type.startsWith('pen') ? 'pen' : e.how || 'pass'
      const m = shots[e.side === us ? 0 : 1]
      const o = m.get(how) || { how, shots: 0, xg: 0 }
      o.shots++; o.xg += e.xg || 0
      m.set(how, o)
    }
    for (const p of res.players) {
      if (p.side !== us || p.pos === 'GK') continue
      if (p.started) { energy += p.energy ?? 100; starters++ }
      const o = people.get(p.id) || { touches: 0, keyPasses: 0, shots: 0, xg: 0 }
      o.touches += p.touches ?? 0; o.keyPasses += p.keyPasses; o.shots += p.shots; o.xg += p.xg
      people.set(p.id, o)
    }
  }
  const pct = (v: number, t: number) => (t ? Math.round((v / t) * 100) : 0)
  const per = (v: number) => Math.round((v / n) * 10) / 10
  const avgStats = stats.map((x) => Object.fromEntries(STAT_KEYS.map((k) => [k, k === 'xg' ? Math.round((x[k] / n) * 100) / 100 : Math.round(x[k] / n)]))) as unknown as [TeamMatchStats, TeamMatchStats]
  const list = (m: Map<string, { how: string; shots: number; xg: number }>) => [...m.values()].map((o) => ({ how: o.how, shots: per(o.shots), xg: Math.round((o.xg / n) * 100) / 100 })).sort((a, b) => b.xg - a.xg)
  const top = (v: (o: { touches: number; keyPasses: number; shots: number; xg: number }) => number) => [...people.entries()].sort((a, b) => v(b[1]) - v(a[1]))[0]
  const hub = top((o) => o.touches), creator = top((o) => o.keyPasses), shooter = top((o) => o.shots)
  const r: PracticeReport = {
    n, score: [per(goals[0]), per(goals[1])], record, stats: avgStats,
    thirds: [pct(thirds[0], acts), pct(thirds[1], acts), pct(thirds[2], acts)],
    entries: per(entries), lanes: [pct(lanes[0], entries), pct(lanes[1], entries), pct(lanes[2], entries)],
    won: [per(won[0]), per(won[1]), per(won[2])], moveLength: spells ? Math.round((spellPasses / spells) * 10) / 10 : 0,
    forward: pct(fwd, passes), longShare: pct(long, passes), chances: list(shots[0]), against: list(shots[1]),
    energy: starters ? Math.round(energy / starters) : 100,
    hub: hub && hub[1].touches ? { id: hub[0], touches: per(hub[1].touches) } : undefined,
    creator: creator && creator[1].keyPasses ? { id: creator[0], keyPasses: per(creator[1].keyPasses) } : undefined,
    shooter: shooter && shooter[1].shots ? { id: shooter[0], shots: per(shooter[1].shots), xg: Math.round((shooter[1].xg / n) * 100) / 100 } : undefined,
    notes: [],
  }
  r.notes = observations(r)
  return r
}

/** Plain observations from the numbers: what stood out, without grading the tactic. */
function observations(r: PracticeReport): string[] {
  const [S, T] = r.stats
  const pm = r.n > 1 ? ' a match' : ''
  const out: string[] = []
  if (S.possession >= 60) out.push(`You had the ball ${S.possession}% of the time${r.moveLength >= 5 ? `, in spells of about ${r.moveLength} passes` : ''}.`)
  else if (S.possession <= 42) out.push(`They had most of the ball (${100 - S.possession}%); your spells on it averaged ${r.moveLength} passes.`)
  if (S.possession >= 56 && S.shots <= 10) out.push(`Plenty of the ball but only ${S.shots} shots${pm}: possession that rarely turned into chances.`)
  if (r.thirds[0] >= 38) out.push(`${r.thirds[0]}% of your play was in your own third: the ball spent a lot of time at the back.`)
  else if (r.thirds[2] >= 30) out.push(`${r.thirds[2]}% of your play was in their third: you pinned them back.`)
  const lane = r.lanes.indexOf(Math.max(...r.lanes))
  if (r.entries >= 8 && r.lanes[lane] >= 45) out.push(`${r.lanes[lane]}% of your moves into the final third went ${['down the left', 'through the middle', 'down the right'][lane]}.`)
  else if (r.entries >= 8 && Math.max(...r.lanes) - Math.min(...r.lanes) <= 15) out.push('Attacks were spread evenly across the left, the middle and the right.')
  if (r.won[2] >= 8) out.push(`Your press won the ball back ${r.won[2]} times${pm} in their third.`)
  else if (r.won[0] >= Math.max(10, r.won[2] * 3)) out.push(`Most of your ball winning came in your own third (${r.won[0]} times${pm}): they got close before you won it.`)
  if (r.longShare >= 15) out.push(`${r.longShare}% of your passes were long balls.`)
  else if (r.forward <= 13 && S.passes >= 300) out.push(`Only ${r.forward}% of passes went forward 15m or more: patient, sideways circulation.`)
  const best = r.chances.find((c) => c.how !== 'pen')
  if (best && best.shots >= 2) out.push(`Your best chances came from ${howLabel(best.how).toLowerCase()} (${best.shots} shots, ${best.xg.toFixed(2)} xG${pm}).`)
  const threat = r.against.find((c) => c.how !== 'pen')
  if (threat && threat.xg >= 0.4) out.push(`Their main threat: ${howLabel(threat.how).toLowerCase()} (${threat.shots} shots, ${threat.xg.toFixed(2)} xG${pm}).`)
  if (T.xg >= S.xg + 0.5) out.push(`They created more than you (xG ${T.xg.toFixed(2)} to ${S.xg.toFixed(2)}${pm}).`)
  if ((S.crosses ?? 0) >= 22) out.push(`You crossed ${S.crosses} times${pm}.`)
  if (S.offsides >= 4) out.push(`Caught offside ${S.offsides} times${pm}: runs in behind against their line.`)
  if (r.energy <= 60) out.push(`Your starters finished with ${r.energy}% energy: this way of playing is tiring.`)
  return out.slice(0, 6)
}

// ============================================================================ the shape view

/** Moments the shape view can show, as the ball position in our frame (0 own goal → 100 theirs). */
export const SHAPE_PHASES: { id: string; inPoss: boolean; label: string; ball: { x: number; y: number } }[] = [
  { id: 'build', inPoss: true, label: 'Building up', ball: { x: 20, y: 40 } },
  { id: 'mid', inPoss: true, label: 'Through midfield', ball: { x: 50, y: 58 } },
  { id: 'final', inPoss: true, label: 'In their third', ball: { x: 76, y: 30 } },
  { id: 'press', inPoss: false, label: 'Their build-up', ball: { x: 80, y: 58 } },
  { id: 'block', inPoss: false, label: 'Ball in midfield', ball: { x: 52, y: 42 } },
  { id: 'box', inPoss: false, label: 'Near our box', ball: { x: 24, y: 66 } },
]

export interface ShapeDot { side: 0 | 1; id: number; pos: string; gk: boolean; x: number; y: number }

/** Where both sides stand at a moment, from the match engine's own layout (our side is 0, attacking left to right). */
export function practiceShape(w: World, tactics: TeamTactics, opponent: number, style: PracticeStyle, phase: string): { dots: ShapeDot[]; ball: { x: number; y: number }; inPoss: boolean } {
  const ph = SHAPE_PHASES.find((p) => p.id === phase) || SHAPE_PHASES[1]
  const { sim } = createPractice(w, tactics, opponent, style, 1)
  return { dots: sim.shapeAt(0, ph.inPoss, ph.ball), ball: ph.ball, inPoss: ph.inPoss }
}

/** Plain measurements of a shape, in metres. */
export function shapeFacts(dots: ShapeDot[], ball: { x: number; y: number }, inPoss: boolean): { label: string; value: string }[] {
  const us = dots.filter((d) => d.side === 0 && !d.gk)
  if (!us.length) return []
  const ys = us.map((d) => d.y), xs = us.map((d) => d.x).sort((a, b) => a - b)
  const width = Math.round((Math.max(...ys) - Math.min(...ys)) * 0.68)
  const back = xs[0], front = xs[xs.length - 1]
  if (inPoss) {
    const ahead = us.filter((d) => d.x > ball.x + 2).length
    const behind = us.filter((d) => d.x < ball.x - 10).length
    // their back line (the four deepest) and the line in front of it (the next three or four), in our frame
    const them = dots.filter((d) => d.side === 1 && !d.gk).map((d) => d.x).sort((a, b) => b - a)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    const lineB = avg(them.slice(0, 4)), lineM = avg(them.slice(4, 8))
    const pocket = us.filter((d) => d.x > lineM + 1 && d.x < lineB - 1).length
    const out = [{ label: 'Width', value: `${width}m` }, { label: 'Ahead of the ball', value: `${ahead}` }, { label: 'Between their lines', value: `${pocket}` }]
    if (ball.x > 60) out.push({ label: 'Staying back', value: `${behind}` })
    return out
  }
  // the gap between the back line and the next line up (the deepest four, then the next three)
  const mids = xs.slice(4, 7)
  const gap = mids.length ? Math.round((mids.reduce((a, b) => a + b, 0) / mids.length - xs.slice(0, 4).reduce((a, b) => a + b, 0) / Math.min(4, xs.length)) * 1.05) : 0
  const behind = us.filter((d) => d.x < ball.x).length
  return [
    { label: 'Line from goal', value: `${Math.round(back * 1.05)}m` },
    { label: 'Between the lines', value: `${Math.max(0, gap)}m` },
    { label: 'Block depth', value: `${Math.round((front - back) * 1.05)}m` },
    { label: 'Goal-side of the ball', value: `${behind}` },
  ]
}

// ============================================================================ comparing two setups

/** One practice match, as the numbers a comparison is made on (ours unless it says against). */
export interface PracticeSample {
  pts: number; gf: number; ga: number; xg: number; xga: number; shots: number; shotsA: number; sot: number; poss: number; passAcc: number; spell: number
  entries: number; box: number; wonHigh: number; counters: number; countersA: number; bigA: number; energy: number
  by: Record<string, [number, number]>; byA: Record<string, [number, number]>
}

export function practiceSample(sim: MatchSim, us: 0 | 1 = 0): PracticeSample {
  const res = sim.result()
  const them = (1 - us) as 0 | 1
  const v = viewOf(sim.ledger(us), sim.ledger(them), 90), o = viewOf(sim.ledger(them), sim.ledger(us), 90)
  const S = res.stats[us], T = res.stats[them]
  const st = res.players.filter((p) => p.side === us && p.started && p.pos !== 'GK')
  const gf = res.score[us], ga = res.score[them]
  return {
    pts: gf > ga ? 3 : gf === ga ? 1 : 0, gf, ga, xg: S.xg, xga: T.xg, shots: S.shots, shotsA: T.shots, sot: S.sot, poss: S.possession, passAcc: S.passAcc,
    spell: v.spell, entries: v.entries, box: v.boxEntries, wonHigh: v.wonHigh, counters: v.by.counter?.[0] || 0, countersA: o.by.counter?.[0] || 0,
    bigA: T.bigChances || 0, energy: st.length ? st.reduce((a, p) => a + (p.energy ?? 100), 0) / st.length : 100, by: v.by, byA: o.by,
  }
}

export type Verdict = 'clear' | 'slight' | 'noise'
export interface CompareRow { key: keyof PracticeSample; label: string; a: number; b: number; diff: number; verdict: Verdict; good?: boolean; fmt: (x: number) => string }

const f0 = (x: number) => `${Math.round(x)}`, f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1), f2 = (x: number) => x.toFixed(2), pc = (x: number) => `${Math.round(x)}%`
/** What is compared, and which way is better for us (undefined: neither, it is a matter of style). */
export const COMPARE: { key: keyof PracticeSample; label: string; fmt: (x: number) => string; better?: 1 | -1 }[] = [
  { key: 'pts', label: 'Points a match', fmt: f2, better: 1 },
  { key: 'gf', label: 'Goals for', fmt: f1, better: 1 },
  { key: 'ga', label: 'Goals against', fmt: f1, better: -1 },
  { key: 'xg', label: 'Expected goals', fmt: f2, better: 1 },
  { key: 'xga', label: 'Expected goals against', fmt: f2, better: -1 },
  { key: 'shots', label: 'Shots', fmt: f1, better: 1 },
  { key: 'shotsA', label: 'Shots against', fmt: f1, better: -1 },
  { key: 'poss', label: 'Possession', fmt: pc },
  { key: 'passAcc', label: 'Pass accuracy', fmt: pc },
  { key: 'spell', label: 'Passes a spell', fmt: f1 },
  { key: 'entries', label: 'Moves into the final third', fmt: f1, better: 1 },
  { key: 'box', label: 'Entries into the box', fmt: f1, better: 1 },
  { key: 'wonHigh', label: 'Ball won in their third', fmt: f1 },
  { key: 'countersA', label: 'Counter-attack shots against', fmt: f1, better: -1 },
  { key: 'energy', label: 'Energy at the end', fmt: pc, better: 1 },
]

/**
 * A against B over paired matches (match i of each was played with the same seed against the same side, so the
 * difference is the tactics plus what they changed). A difference counts as clear when it is at least twice its
 * standard error, slight at once; anything smaller is what ten different games would show anyway.
 */
export function compareSetups(A: PracticeSample[], B: PracticeSample[]): CompareRow[] {
  const n = Math.min(A.length, B.length)
  return COMPARE.map(({ key, label, fmt, better }) => {
    const a = A.slice(0, n).map((s) => s[key] as number), b = B.slice(0, n).map((s) => s[key] as number)
    const d = b.map((x, i) => x - a[i])
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
    const md = mean(d)
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / Math.max(1, n - 1))
    const se = sd / Math.sqrt(Math.max(1, n))
    const verdict: Verdict = n < 3 ? 'noise' : Math.abs(md) >= 2 * se && Math.abs(md) > 1e-9 ? 'clear' : Math.abs(md) >= se && Math.abs(md) > 1e-9 ? 'slight' : 'noise'
    return { key, label, a: mean(a), b: mean(b), diff: md, verdict, good: better ? md * better > 0 : undefined, fmt }
  })
}

/** Where the chances came from in each setup, per match, for the sources that mattered. */
export function compareSources(A: PracticeSample[], B: PracticeSample[], against = false): { how: string; a: [number, number]; b: [number, number] }[] {
  const sum = (xs: PracticeSample[]) => {
    const t: Record<string, [number, number]> = {}
    for (const s of xs) for (const [k, [n, x]] of Object.entries(against ? s.byA : s.by)) { const e = (t[k] ||= [0, 0]); e[0] += n / xs.length; e[1] += x / xs.length }
    return t
  }
  const a = sum(A), b = sum(B)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((how) => ({ how, a: a[how] || [0, 0], b: b[how] || [0, 0] }))
    .filter((r) => r.a[1] + r.b[1] >= 0.06).sort((x, y) => Math.max(y.a[1], y.b[1]) - Math.max(x.a[1], x.b[1])).slice(0, 6)
}

/** What changed, in a few plain lines, only from differences that cleared the noise. */
export function compareNotes(rows: CompareRow[], src: ReturnType<typeof compareSources>, srcA: ReturnType<typeof compareSources>): string[] {
  const out: string[] = []
  const r = (k: keyof PracticeSample) => rows.find((x) => x.key === k)!
  const clear = (k: keyof PracticeSample) => r(k).verdict === 'clear'
  const up = (k: keyof PracticeSample) => r(k).diff > 0
  if (clear('xg') && clear('xga') && up('xg') === up('xga')) out.push(up('xg') ? 'B opens the game up: more chances at both ends.' : 'B closes the game down: fewer chances at both ends.')
  else {
    if (clear('xg')) out.push(`B ${up('xg') ? 'creates more' : 'creates less'}: ${r('xg').fmt(r('xg').a)} → ${r('xg').fmt(r('xg').b)} xG a match.`)
    if (clear('xga')) out.push(`B ${up('xga') ? 'concedes more' : 'concedes less'}: ${r('xga').fmt(r('xga').a)} → ${r('xga').fmt(r('xga').b)} xG against.`)
  }
  if (clear('poss')) out.push(`${up('poss') ? 'More' : 'Less'} of the ball with B (${pc(r('poss').a)} → ${pc(r('poss').b)}).`)
  if (clear('wonHigh')) out.push(`B wins the ball back in their third ${up('wonHigh') ? 'more' : 'less'} often.`)
  if (clear('countersA')) out.push(`B ${up('countersA') ? 'leaves you more exposed' : 'is less exposed'} on the break.`)
  if (clear('energy') && !up('energy')) out.push('B is more tiring.')
  const grew = src.map((s) => ({ s, d: s.b[1] - s.a[1] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0]
  if (grew && Math.abs(grew.d) >= 0.12) out.push(`The biggest change in your chances: ${howLabel(grew.s.how).toLowerCase()} (${grew.s.a[1].toFixed(2)} → ${grew.s.b[1].toFixed(2)} xG).`)
  const grewA = srcA.map((s) => ({ s, d: s.b[1] - s.a[1] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0]
  if (grewA && Math.abs(grewA.d) >= 0.12) out.push(`And in theirs: ${howLabel(grewA.s.how).toLowerCase()} (${grewA.s.a[1].toFixed(2)} → ${grewA.s.b[1].toFixed(2)} xG).`)
  if (!out.length) out.push('No difference cleared the noise of these matches: the two setups play out much the same against this side.')
  return out.slice(0, 5)
}
