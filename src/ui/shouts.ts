// Touchline shouts: the few things a manager actually calls out during a game, each one a plain instruction that moves
// several of the engine's settings together the way that call would (going for it pushes the line up, sends men into
// the box and quickens the play). Shouts sit on top of the team's set-up and come off again without losing it; the
// full tactics board stays there for anyone who wants the settings one by one. The assistant reads the game (see
// engine/match/analysis.ts) and suggests one, saying why. What each one says it does and costs is what it was measured
// to do in the match engine (SHOUT_FX in engine/match/responseData.ts), and the touchline shows those numbers.
import type { Mentality, TeamTactics } from '../domain/types'
import { MENTALITIES } from '../domain/constants'
import type { MatchSim } from '../engine/match/engine'
import { frameAt, observe, spanOf, type Obs } from '../engine/match/analysis'
import type { LedgerView } from '../engine/match/ledger'
import { shoutEffect, stateOf, type Effect } from '../engine/match/response'

export type ShoutId = 'attack' | 'protect' | 'press' | 'drop' | 'keep' | 'direct' | 'wide' | 'narrow'

export interface Shout {
  id: ShoutId
  label: string
  icon: string
  /** what it does, in a few words */
  does: string
  /** what it costs: every shout trades something */
  costs: string
  /** the shout it can't be used with */
  not: ShoutId
  apply: (t: TeamTactics) => TeamTactics
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const ment = (t: TeamTactics, d: number): Mentality => MENTALITIES[clamp(MENTALITIES.indexOf(t.mentality) + d, 0, MENTALITIES.length - 1)]

export const SHOUTS: Shout[] = [
  { id: 'attack', label: 'Go for it', icon: 'arrowUp', does: 'More men forward: more chances for you', costs: 'Even more for them on the break', not: 'protect',
    apply: (t) => ({ ...t, mentality: ment(t, 1), playersInBox: clamp(t.playersInBox + 2, 2, 9), lineHeight: clamp(t.lineHeight + 6, 10, 95), tempo: clamp(t.tempo + 8, 0, 100) }) },
  { id: 'protect', label: 'Keep it tight', icon: 'shield', does: 'Men behind the ball: they make far less', costs: 'So do you', not: 'attack',
    apply: (t) => ({ ...t, mentality: ment(t, -1), playersInBox: clamp(t.playersInBox - 1, 2, 9) }) },
  { id: 'press', label: 'Press them', icon: 'press', does: 'Win it higher: more of the ball', costs: 'Tiring: legs go sooner', not: 'drop',
    apply: (t) => ({ ...t, pressing: clamp(t.pressing + 18, 5, 100), lineHeight: clamp(t.lineHeight + 6, 10, 95), defApproach: t.defApproach === 'Deep' ? 'Balanced' : t.defApproach === 'Balanced' ? 'High' : t.defApproach }) },
  { id: 'drop', label: 'Drop off', icon: 'down', does: 'Sit off and save legs', costs: 'They get more of the ball, and more chances', not: 'press',
    apply: (t) => ({ ...t, pressing: clamp(t.pressing - 18, 5, 100), lineHeight: clamp(t.lineHeight - 10, 10, 95), defApproach: t.defApproach === 'Aggressive' || t.defApproach === 'High' ? 'Balanced' : t.defApproach }) },
  { id: 'keep', label: 'Keep the ball', icon: 'refresh', does: 'Slow it down: fewer chances at both ends', costs: 'Yours drop more than theirs', not: 'direct',
    apply: (t) => ({ ...t, tempo: clamp(t.tempo - 14, 0, 100), buildUp: t.buildUp === 'Long Ball' ? 'Balanced' : t.buildUp, chanceCreation: 'Possession' }) },
  { id: 'direct', label: 'Get it forward', icon: 'ffwd', does: 'Quicker and longer, in behind', costs: 'You give the ball away more', not: 'keep',
    apply: (t) => ({ ...t, tempo: clamp(t.tempo + 14, 0, 100), buildUp: t.buildUp === 'Short Passing' ? 'Balanced' : 'Long Ball', chanceCreation: 'Direct Passing' }) },
  { id: 'wide', label: 'Use the flanks', icon: 'expand', does: 'Stretch them, cross more', costs: 'Crosses are rarely clear chances', not: 'narrow',
    apply: (t) => ({ ...t, width: clamp(t.width + 25, 0, 100) }) },
  { id: 'narrow', label: 'Through the middle', icon: 'target', does: 'Narrow, combine centrally', costs: 'Easier to crowd out', not: 'wide',
    apply: (t) => ({ ...t, width: clamp(t.width - 25, 0, 100) }) },
]
export const SHOUT: Record<ShoutId, Shout> = Object.fromEntries(SHOUTS.map((s) => [s.id, s])) as Record<ShoutId, Shout>

/** The set-up with these shouts on it, in the order they were made. */
export function applyShouts(base: TeamTactics, on: ShoutId[]): TeamTactics {
  return on.reduce((t, id) => SHOUT[id].apply(t), { ...base })
}

/** Turn a shout on or off (on, it takes the place of the one it can't be used with). */
export function toggleShout(on: ShoutId[], id: ShoutId): ShoutId[] {
  if (on.includes(id)) return on.filter((x) => x !== id)
  return [...on.filter((x) => x !== SHOUT[id].not), id]
}

/** The shouts on a live match's side, with the set-up they sit on and the minute each was made. */
const live = new WeakMap<MatchSim, Record<number, { base: TeamTactics; on: ShoutId[]; since: Partial<Record<ShoutId, number>> }>>()
export const same = (a: TeamTactics, b: TeamTactics) => JSON.stringify(a) === JSON.stringify(b)

/** The shouts in force (none, once the set-up has been changed on the full board since). */
export function shoutsOn(sim: MatchSim, side: 0 | 1): { base: TeamTactics; on: ShoutId[]; since: Partial<Record<ShoutId, number>> } {
  const cur = sim.sideTactics(side)
  const st = live.get(sim)?.[side]
  if (st && same(applyShouts(st.base, st.on), cur)) return st
  return { base: { ...cur }, on: [], since: {} }
}
/**
 * What the calls in force do from here, for the forecast: each at its measured effect, less the part the rate so far
 * already has in it (it has been played with the call on since it was made, see liveRates' weighting).
 */
export function callsInForce(sim: MatchSim, side: 0 | 1, on: ShoutId[], since: Partial<Record<ShoutId, number>>): Effect {
  const state = stateOf([sim.score[side], sim.score[1 - side]], sim.minute)
  const played = sim.played || sim.minute
  return on.reduce((e, id) => {
    const x = shoutEffect([], [id], state)
    const w = Math.min(1, Math.max(0, sim.minute - (since[id] ?? sim.minute)) / (25 + played))
    return { f: (e.f * x.f) / (1 + (x.f - 1) * w), a: (e.a * x.a) / (1 + (x.a - 1) * w) }
  }, { f: 1, a: 1 })
}

export function setShouts(sim: MatchSim, side: 0 | 1, base: TeamTactics, on: ShoutId[]) {
  const m = live.get(sim) || {}
  const before = m[side]
  const since: Partial<Record<ShoutId, number>> = {}
  for (const id of on) since[id] = before?.on.includes(id) ? before.since[id] ?? sim.minute : sim.minute
  m[side] = { base: { ...base }, on, since }
  live.set(sim, m)
  return applyShouts(base, on)
}

// ------------------------------------------------------------------ the picture, and the assistant's call
export interface Read {
  /** who is on top over the last quarter of an hour: −1 (under the cosh) … 1 (all over them) */
  lean: number
  word: string
  poss: number
  xg: [number, number]
}

export interface Advice { text: string; why?: string; shout?: ShoutId; subs?: boolean; tone: 'good' | 'bad' | 'neutral' }

/** The last fifteen minutes or so, as the bench sees it. */
export function readGame(sim: MatchSim, side: 0 | 1): { read: Read; obs: Obs[] } | undefined {
  const fr = sim.ledgerFrames
  if (fr.length < 3) return undefined
  const b = fr.length - 1
  const a = Math.max(-1, frameAt(fr, Math.max(0, sim.minute - 15)) - 1)
  const span = spanOf(fr, side, a, b)
  const obs = observe({ span, tactics: sim.sideTactics(side), seed: `${sim.minute}`, goals: [0, 0] })
  const us = span.us, them = span.them
  const xgL = Math.tanh(((us.xg - them.xg) / 0.6))
  const possL = clamp((us.poss - 0.5) * 3, -1, 1)
  const tiltL = clamp((us.tilt - them.tilt) * 2, -1, 1)
  const lean = clamp(xgL * 0.5 + possL * 0.25 + tiltL * 0.25, -1, 1)
  const word = lean > 0.45 ? 'All over them' : lean > 0.15 ? 'On top' : lean > -0.15 ? 'Even' : lean > -0.45 ? 'Second best' : 'Under the cosh'
  return { read: { lean, word, poss: us.poss, xg: [us.xg, them.xg] }, obs }
}

/** What the assistant would say now: one call, with the reason, and a shout to make it if there is one. */
export function advise(sim: MatchSim, side: 0 | 1, on: ShoutId[]): Advice[] {
  const out: Advice[] = []
  const lead = side === 0 ? sim.score[0] - sim.score[1] : sim.score[1] - sim.score[0]
  const m = sim.minute
  const g = readGame(sim, side)
  const has = (k: string) => g?.obs.find((o) => o.key === k)
  const say = (a: Advice) => { if (!a.shout || !on.includes(a.shout)) out.push(a) }
  // the score and the clock first
  if (lead < 0 && m >= 60) say({ tone: 'bad', text: m >= 80 ? 'We need a goal now.' : 'Time to chase it.', why: 'More men forward: we\'ll leave space behind, but a draw is no use now.', shout: 'attack' })
  else if (lead > 0 && m >= 75) say({ tone: 'good', text: 'See it out.', why: 'Men behind the ball and no needless risks: make them break us down.', shout: 'protect' })
  // then what the game is showing
  if (has('counter')) say({ tone: 'bad', text: 'They\'re getting in behind us.', why: has('counter')!.text, shout: on.includes('press') ? 'drop' : 'protect' })
  if (has('pressNo')) say({ tone: 'bad', text: 'The press isn\'t working.', why: 'They\'re passing round it, and it costs us legs. Sit in shape instead.', shout: 'drop' })
  if (has('pressed')) say({ tone: 'bad', text: 'Their press is hurting us.', why: 'We\'re losing it in our own third. Going longer takes it out of the game.', shout: 'direct' })
  if (has('sterile')) say({ tone: 'neutral', text: 'Lots of the ball, nothing at the end.', why: 'Quicker, more direct play will get us in behind them.', shout: 'direct' })
  else if (has('dry') && lead <= 0) say({ tone: 'neutral', text: 'We\'re not creating anything.', why: has('dry')!.text, shout: 'attack' })
  if (has('tiltThem')) say({ tone: 'bad', text: 'We\'re pinned back.', why: 'Keeping the ball when we win it gives us a breather and them less of it.', shout: 'keep' })
  // tired legs
  const tired = sim.liveRatings(side).filter((r) => r.on && r.pos !== 'GK' && r.energy < 55).length
  if (tired >= 2 && m >= 55 && sim.subsLeft(side) > 0) say({ tone: 'neutral', text: `${tired} of ours are running on empty.`, why: 'Fresh legs now keep the level up in the last half hour.', subs: true })
  if (!out.length && g) {
    if (has('pressOk') || has('tilt') || has('ourCounter') || g.read.lean > 0.2) out.push({ tone: 'good', text: lead < 0 ? 'We\'re the better side. Keep at it.' : 'It\'s working. Keep doing this.', why: (has('pressOk') || has('tilt') || has('ourCounter'))?.text })
    else if (g.read.lean < -0.2) out.push({ tone: 'bad', text: lead < 0 ? 'They\'re on top, and ahead.' : lead > 0 ? 'We\'re ahead, but they\'re on top.' : 'They\'re on top.', why: 'Nothing obvious to fix yet: see below what each shout would do from here before changing anything.' })
    else if (lead < 0) out.push({ tone: 'neutral', text: 'Behind, but there\'s time.', why: 'The game is even: the chances will come. Push too soon and they get more.' })
    else out.push({ tone: 'neutral', text: lead > 0 ? 'Ahead in an even game.' : 'An even game. Stick with the plan.', why: 'Nothing standing out either way yet.' })
  }
  return out.slice(0, 2)
}

// ------------------------------------------------------------------ what a call has done since
/** One thing a call is meant to change (or the price it was expected to cost), before it and since, per 15 minutes. */
export interface VerdictRow { label: string; before?: number; after: number; fmt: 'n1' | 'n2' | 'pct'; better: boolean | null; cost?: boolean }
export interface Verdict { since: number; mins: number; rows: VerdictRow[]; word: string; tone: 'good' | 'bad' | 'neutral'; text: string }

type Aim = { label: string; fmt: VerdictRow['fmt']; want: 1 | -1; get: (u: LedgerView, t: LedgerView) => number; rate?: boolean; cost?: boolean }
const xgOf = (v: LedgerView, ...hows: string[]) => hows.reduce((a, h) => a + (v.by[h]?.[1] || 0), 0)
/** What each call is for (the first rows), and what it was always going to cost (the last). */
const AIMS: Record<ShoutId, Aim[]> = {
  attack: [{ label: 'Our xG', fmt: 'n2', want: 1, get: (u) => u.xg }, { label: 'Into their box', fmt: 'n1', want: 1, get: (u) => u.boxEntries }, { label: 'Counters against us', fmt: 'n1', want: -1, cost: true, get: (_, t) => t.counters }],
  protect: [{ label: 'Their xG', fmt: 'n2', want: -1, get: (_, t) => t.xg }, { label: 'Into our box', fmt: 'n1', want: -1, get: (_, t) => t.boxEntries }, { label: 'Our xG', fmt: 'n2', want: 1, cost: true, get: (u) => u.xg }],
  press: [{ label: 'Won in their third', fmt: 'n1', want: 1, get: (u) => u.wonHigh }, { label: 'Their possession', fmt: 'pct', want: -1, rate: true, get: (_, t) => t.poss }, { label: 'Counters against us', fmt: 'n1', want: -1, cost: true, get: (_, t) => t.counters }],
  drop: [{ label: 'Their chances in behind', fmt: 'n2', want: -1, get: (_, t) => xgOf(t, 'through', 'counter') }, { label: 'Their xG', fmt: 'n2', want: -1, get: (_, t) => t.xg }, { label: 'Our possession', fmt: 'pct', want: 1, rate: true, cost: true, get: (u) => u.poss }],
  keep: [{ label: 'Our possession', fmt: 'pct', want: 1, rate: true, get: (u) => u.poss }, { label: 'Their xG', fmt: 'n2', want: -1, get: (_, t) => t.xg }, { label: 'Our shots', fmt: 'n1', want: 1, cost: true, get: (u) => u.shots }],
  direct: [{ label: 'Into their third', fmt: 'n1', want: 1, get: (u) => u.entries }, { label: 'Our shots', fmt: 'n1', want: 1, get: (u) => u.shots }, { label: 'Our possession', fmt: 'pct', want: 1, rate: true, cost: true, get: (u) => u.poss }],
  wide: [{ label: 'Our crosses', fmt: 'n1', want: 1, get: (u) => u.crosses }, { label: 'Our xG', fmt: 'n2', want: 1, get: (u) => u.xg }],
  narrow: [{ label: 'Into their third through the middle', fmt: 'n1', want: 1, get: (u) => u.entryLanes[1] }, { label: 'Our xG', fmt: 'n2', want: 1, get: (u) => u.xg }],
}

/**
 * What a call has done since it was made: the things it is meant to change, in the stretch since against the quarter
 * of an hour before (per 15 minutes), and its price. A verdict only once there has been time to tell, and only on a
 * change bigger than a stretch that short varies by anyway.
 */
export function verdictOf(sim: MatchSim, side: 0 | 1, id: ShoutId, since: number): Verdict {
  const fr = sim.ledgerFrames
  const mins = Math.max(0, sim.minute - since)
  const empty: Verdict = { since, mins, rows: [], word: 'Just called', tone: 'neutral', text: 'Give it a few minutes to take hold.' }
  if (fr.length < 2) return empty
  const cut = Math.max(-1, frameAt(fr, since) - 1)
  const b = fr.length - 1
  const a0 = Math.max(-1, frameAt(fr, Math.max(0, since - 15)) - 1)
  const after = cut < b ? spanOf(fr, side, cut, b) : undefined
  const before = cut - a0 >= 5 ? spanOf(fr, side, a0, cut) : undefined
  if (!after) return empty
  const per15 = (v: number, m: number, rate?: boolean) => (rate ? v : (v * 15) / Math.max(1, m))
  const rows: VerdictRow[] = AIMS[id].map((x) => {
    const va = per15(x.get(after.us, after.them), after.minutes, x.rate)
    const vb = before ? per15(x.get(before.us, before.them), before.minutes, x.rate) : undefined
    // clear: bigger than a stretch this short varies by (counts read as Poisson, xG as tenths of a goal)
    let better: boolean | null = null
    if (vb !== undefined && after.minutes >= 6) {
      const d = va - vb
      const sc = x.fmt === 'n2' ? 10 : 1
      const noise = x.rate ? 0.06 + 0.35 / Math.sqrt(Math.min(after.minutes, before!.minutes)) : 1.6 * Math.sqrt((Math.max(va, 0.3) * sc / after.minutes + Math.max(vb, 0.3) * sc / before!.minutes) * 15) / sc
      if (Math.abs(d) > noise) better = d * x.want > 0
    }
    return { label: x.label, before: vb, after: va, fmt: x.fmt, better, cost: x.cost }
  })
  if (mins < 6) return { ...empty, rows, word: 'Just called', text: 'Give it a few minutes to take hold.' }
  const aims = rows.filter((r) => !r.cost)
  const good = aims.filter((r) => r.better === true).length, bad = aims.filter((r) => r.better === false).length
  const cost = rows.find((r) => r.cost)
  if (good && !bad) return { since, mins, rows, word: 'Working', tone: 'good', text: cost?.better === false ? `Doing its job, and paying the price for it: ${cost.label.toLowerCase()} ${cost.fmt === 'pct' ? 'down' : 'up'}.` : 'Doing what you asked of them.' }
  if (bad && !good) return { since, mins, rows, word: 'Not working', tone: 'bad', text: 'The opposite of what you wanted so far. Think about calling it off.' }
  if (good && bad) return { since, mins, rows, word: 'Mixed', tone: 'neutral', text: 'Some of it is working, some of it isn\'t.' }
  return { since, mins, rows, word: 'No clear change yet', tone: 'neutral', text: `${mins} minutes in, nothing has moved beyond the usual ups and downs.` }
}
