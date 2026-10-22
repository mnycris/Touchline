// What a change of set-up does, as the match engine plays it. Each shout, attitude, style of play and setting was tried
// over many thousands of matches, each played out from the same moment with and without it (scripts/qa/option-fit.ts,
// merged into responseData.ts): these are the multipliers it put on the rate of chances (xG) for and against from then
// on. With the score and the minutes left, the chance of each result follows (the rest of the match's goals as
// independent Poisson counts). It is what the engine does on average, not a guess; effects within the noise were
// shrunk to nothing, so a change the engine doesn't reliably make shows as "little change".
import type { TeamTactics } from '../../domain/types'
import { DEFAULT_TACTICS, VISION_TACTICS } from '../../domain/constants'
import type { MatchSim } from './engine'
import { KICKOFF_FX, SCORE_FX, SETTING_FX, SHOUT_FX } from './responseData'

export type GameState = 'kickoff' | 'losing' | 'level' | 'winning'
/** Multipliers on the rate of chances for (f) and against (a). */
export interface Effect { f: number; a: number }

type Pair = [number, number]
const NUMS = ['pressing', 'lineHeight', 'width', 'tempo', 'playersInBox'] as const
const CHOICES = ['defApproach', 'buildUp', 'chanceCreation'] as const

/** The usual set-up the prediction's expectations stand for (what a side's own set-up is measured against). */
export const NEUTRAL: TeamTactics = DEFAULT_TACTICS

/**
 * A set-up's standing on the rate of chances [for, against] (logs), against the usual one: each setting's own measured
 * effect, summed (settings), anchored on what whole styles of play were measured to do (styleFix), and its attitude's.
 */
function level(t: TeamTactics): Pair {
  const s = settings(t), c = styleFix(t), m = KICKOFF_FX[`attitude:${t.mentality}`] || [0, 0]
  return [s[0] + c[0] + m[0], s[1] + c[1] + m[1]]
}

/**
 * Each setting's own measured effect, summed: a slider counts from the usual value at its measured rate up or down (so
 * going there and back cancels out), a choice by what it was measured to do.
 */
function settings(t: TeamTactics): Pair {
  let lf = 0, la = 0
  const add = (b: Pair | undefined, k = 1) => { if (b) { lf += b[0] * k; la += b[1] * k } }
  for (const k of NUMS) {
    const d = (t[k] as number) - (NEUTRAL[k] as number)
    if (d) add(SETTING_FX[`${k}${d > 0 ? '+' : '-'}`], Math.abs(d))
  }
  for (const k of CHOICES) add(SETTING_FX[`${k}=${t[k]}`])
  add(SETTING_FX[`offsideTrap=${t.offsideTrap ? 'on' : 'off'}`])
  return [lf, la]
}

/** The styles of play as set-ups (what the team sheet's presets set, on the usual set-up). */
const STYLES = Object.keys(VISION_TACTICS).map((name) => ({ name, t: { ...NEUTRAL, ...VISION_TACTICS[name] } as TeamTactics }))
/** How far apart two set-ups are, setting by setting (a choice that differs counts one, 25 points of a slider one). */
function apart(a: TeamTactics, b: TeamTactics): number {
  let d = 0
  for (const k of ['lineHeight', 'width', 'tempo', 'pressing'] as const) d += ((a[k] - b[k]) / 25) ** 2
  d += ((a.playersInBox - b.playersInBox) / 2) ** 2
  for (const k of CHOICES) if (a[k] !== b[k]) d += 1
  return d
}
/**
 * Settings work together, so summed one by one they miss what a whole style does (a deep block and the long ball make a
 * counter-attacking side, not the sum of the two). Each style of play was measured whole (KICKOFF_FX): its gap to the
 * sum is carried to set-ups near it, weighted by how near, so a style shows exactly what it was measured to do and a
 * set-up between styles moves smoothly from one to the next.
 */
function styleFix(t: TeamTactics): Pair {
  const bal = KICKOFF_FX['style:Balanced']
  if (!bal) return [0, 0]
  let wf = 0, wa = 0, ws = 0
  for (const st of STYLES) {
    const m = KICKOFF_FX[`style:${st.name}`]
    if (!m) continue
    const s = settings(st.t)
    const w = 1 / (apart(t, st.t) + 0.04)
    wf += w * (m[0] - bal[0] - s[0]); wa += w * (m[1] - bal[1] - s[1]); ws += w
  }
  return ws ? [wf / ws, wa / ws] : [0, 0]
}

/** Each setting was measured on its own: summed, a whole new set-up is kept within what whole set-ups were seen to do. */
const CAP = 0.45
const toEffect = (lf: number, la: number): Effect => ({ f: Math.exp(clampN(lf, -CAP, CAP)), a: Math.exp(clampN(la, -CAP, CAP)) })

/** What moving from one set-up to another does to the rate of chances for and against. */
export function effectOf(from: TeamTactics, to: TeamTactics): Effect {
  const a = level(from), b = level(to)
  return toEffect(b[0] - a[0], b[1] - a[1])
}

/** What going from one set of touchline calls to another does, in this game state (each call measured whole). */
export function shoutEffect(from: readonly string[], to: readonly string[], state: GameState): Effect {
  const tab = SHOUT_FX[state === 'kickoff' ? 'level' : state]
  let lf = 0, la = 0
  for (const id of to) if (!from.includes(id)) { lf += tab[id]?.[0] ?? 0; la += tab[id]?.[1] ?? 0 }
  for (const id of from) if (!to.includes(id)) { lf -= tab[id]?.[0] ?? 0; la -= tab[id]?.[1] ?? 0 }
  return toEffect(lf, la)
}

const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const pois = (l: number, k: number) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p }

export interface Outlook {
  /** chance of winning, drawing and losing from here (0..1) */
  w: number
  d: number
  l: number
  /** expected goals for and against in the rest of the match */
  gf: number
  ga: number
}

/** The chance of each result from a score, with the rest of the match's expected goals for and against. */
export function outlookFrom(score: [number, number], gf: number, ga: number): Outlook {
  let w = 0, d = 0, l = 0
  for (let a = 0; a <= 10; a++) {
    const pa = pois(gf, a)
    if (pa < 1e-7 && a > gf) break
    for (let b = 0; b <= 10; b++) {
      const p = pa * pois(ga, b)
      const diff = score[0] + a - score[1] - b
      if (diff > 0) w += p; else if (diff < 0) l += p; else d += p
    }
  }
  const t = w + d + l || 1
  return { w: w / t, d: d / t, l: l / t, gf, ga }
}

/** The game state from the manager's side, for the effect table. */
export const stateOf = (score: [number, number], minute: number): GameState => (minute < 3 ? 'kickoff' : score[0] < score[1] ? 'losing' : score[0] > score[1] ? 'winning' : 'level')

/** Stoppage time a half usually gets in the match engine (first, second), measured (scripts/qa/option-fit.ts). */
const STOPPAGE: [number, number] = [3.4, 5.4]

/**
 * The football still to play in normal time, minute by minute: the clock each is played at (stoppage counts as 45 or
 * 90) and how much of a minute it is (the stoppage still to come, as announced, or as usual, ends in a part-minute).
 */
function clockAhead(sim: MatchSim): [number, number][] {
  const out: [number, number][] = []
  if (sim.phase === 'FT' || sim.phase.startsWith('ET') || sim.phase === 'PENS') return out
  const stoppage = (m: number, x: number) => { for (let i = 0; i < Math.floor(x); i++) out.push([m, 1]); if (x % 1 > 0.01) out.push([m, x % 1]) }
  const ann = Math.max(0, sim.addedPlanned - sim.added)
  const first = sim.phase === 'pre' || sim.phase === '1H' || sim.phase === 'HT'
  if (first && sim.phase !== 'HT') {
    for (let m = Math.max(0, sim.minute) + 1; m <= 45; m++) out.push([m, 1])
    stoppage(45, sim.minute < 45 ? STOPPAGE[0] : ann)
  }
  for (let m = first ? 46 : sim.minute + 1; m <= 90; m++) out.push([m, 1])
  stoppage(90, first || sim.minute < 90 ? STOPPAGE[1] : ann)
  return out
}

/** Minutes of football left in normal time, with the stoppage still to come. */
export const minutesLeft = (sim: MatchSim): number => clockAhead(sim).reduce((s, x) => s + x[1], 0)

/**
 * The rate of chances (xG per minute) for and against, as things stand: the pre-match expectation (xG per 90, from the
 * prediction), worn in by what this match has shown so far, and a man down or up counted in.
 */
export function liveRates(sim: MatchSim, side: 0 | 1, prior90: [number, number]): [number, number] {
  const K = 25
  const played = sim.played ?? Math.max(0, sim.minute + (sim.added || 0))
  const st = sim.liveStats()
  const xf = st[side].xg, xa = st[1 - side].xg
  let rf = ((prior90[0] / 90) * K + xf) / (K + played)
  let ra = ((prior90[1] / 90) * K + xa) / (K + played)
  const reds = (s: 0 | 1) => sim.events.filter((e) => e.side === s && (e.type === 'red' || e.type === 'secondYellow')).length
  const down = reds(side) - reds((1 - side) as 0 | 1)
  if (down > 0) { rf *= Math.pow(0.78, down); ra *= Math.pow(1.3, down) } else if (down < 0) { rf *= Math.pow(1.3, -down); ra *= Math.pow(0.78, -down) }
  return [rf, ra]
}

/**
 * How the chances come at a score, against the rate so far: a side ahead sits deeper and makes fewer while the side
 * behind throws men forward, the more so the later it is. Multipliers [for, against] by goal difference (−3 … 3, from
 * the side's own view) and minute, measured minute by minute over thousands of matches (scripts/qa/forecast-cal.ts).
 */
export function scoreEffect(gd: number, minute: number): [number, number] {
  const rows = SCORE_FX[String(clampN(gd, -3, 3))]
  if (!rows?.length) return [1, 1]
  if (minute <= rows[0][0]) return [rows[0][1], rows[0][2]]
  for (let i = 1; i < rows.length; i++) {
    const [m1, f1, a1] = rows[i], [m0, f0, a0] = rows[i - 1]
    if (minute <= m1) { const k = (minute - m0) / (m1 - m0); return [f0 + (f1 - f0) * k, a0 + (a1 - a0) * k] }
  }
  const z = rows[rows.length - 1]
  return [z[1], z[2]]
}

/**
 * How sure the rate so far is of a side's real rate today (its spread, as a share): the outlook is averaged over a
 * lower, the expected and a higher rate at each end. Fitted so the forecast's draws and leads match how matches went
 * (scripts/qa/forecast-cal.ts); a single rate makes results look surer than they are.
 */
export const RATE_SPREAD = 0.3
const SPREAD_W = [0.25, 0.5, 0.25]
/** Goals the match engine's chances turn into, per unit of xG (finishing above the average chance, own goals). */
const GOALS_PER_XG = 1.05

/**
 * The outlook from here for a side, with an optional change of set-up applied for the rest of the match: the rest of
 * the match played out minute by minute, the chances at each end at the rate so far moved by the score at that point
 * (scoreEffect), so a lead is sat on and a deficit chased as they come and go.
 */
export function liveOutlook(sim: MatchSim, side: 0 | 1, prior90: [number, number], eff: Effect = { f: 1, a: 1 }): Outlook {
  const [rf, ra] = liveRates(sim, side, prior90)
  const clock = clockAhead(sim)
  const gd = sim.score[side] - sim.score[1 - side]
  // (three points either side of each rate, weighted to the spread: k·√2 with weights ¼ ½ ¼ has a spread of k)
  const k = RATE_SPREAD * Math.SQRT2
  const out: Outlook = { w: 0, d: 0, l: 0, gf: 0, ga: 0 }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const wt = SPREAD_W[i] * SPREAD_W[j]
    const o = playOut(gd, clock, GOALS_PER_XG * rf * eff.f * Math.max(0.2, 1 + (i - 1) * k), GOALS_PER_XG * ra * eff.a * Math.max(0.2, 1 + (j - 1) * k))
    out.w += o.w * wt; out.d += o.d * wt; out.l += o.l * wt; out.gf += o.gf * wt; out.ga += o.ga * wt
  }
  return out
}

/** The rest of a match from a goal difference, minute by minute, at these rates (each moved by the score as it goes). */
function playOut(gd0: number, clock: [number, number][], rf: number, ra: number): Outlook {
  const O = 10, N = 2 * O + 1
  let p = new Float64Array(N)
  p[O + clampN(gd0, -O, O)] = 1
  let gf = 0, ga = 0
  for (const [m, part] of clock) {
    const q = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      if (p[i] < 1e-12) continue
      const [kf, ka] = scoreEffect(i - O, m)
      // (the chance of a goal in a minute is its expected goals: two in one minute are rare enough to leave out)
      const a = Math.min(0.45, rf * kf * part), b = Math.min(0.45, ra * ka * part)
      gf += p[i] * a; ga += p[i] * b
      q[i] += p[i] * (1 - a - b)
      q[Math.min(N - 1, i + 1)] += p[i] * a
      q[Math.max(0, i - 1)] += p[i] * b
    }
    p = q
  }
  let w = 0, l = 0
  for (let i = 0; i < N; i++) { if (i > O) w += p[i]; else if (i < O) l += p[i] }
  return { w, d: p[O], l, gf, ga }
}

/** Before kick-off: the chance of each result with a set-up, from the two sides' expected goals (the prediction's). */
export const prematchOutlook = (xg: [number, number], t: TeamTactics): Outlook => {
  const e = effectOf(NEUTRAL, t)
  return outlookFrom([0, 0], xg[0] * e.f, xg[1] * e.a)
}
