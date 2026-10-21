// Touchline shouts: the few things a manager actually calls out during a game, each one a plain instruction that moves
// several of the engine's settings together the way that call would (going for it pushes the line up, sends men into
// the box and quickens the play). Shouts sit on top of the team's set-up and come off again without losing it; the
// full tactics board stays there for anyone who wants the settings one by one. The assistant reads the game (see
// engine/match/analysis.ts) and suggests one, saying why.
import type { Mentality, TeamTactics } from '../domain/types'
import { MENTALITIES } from '../domain/constants'
import type { MatchSim } from '../engine/match/engine'
import { frameAt, observe, spanOf, type Obs } from '../engine/match/analysis'

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
  { id: 'attack', label: 'Go for it', icon: 'arrowUp', does: 'More men forward, quicker, higher', costs: 'Leaves space behind', not: 'protect',
    apply: (t) => ({ ...t, mentality: ment(t, 1), playersInBox: clamp(t.playersInBox + 1, 2, 9), lineHeight: clamp(t.lineHeight + 6, 10, 95), tempo: clamp(t.tempo + 6, 0, 100) }) },
  { id: 'protect', label: 'Keep it tight', icon: 'shield', does: 'Fewer risks, men behind the ball', costs: 'Less going forward', not: 'attack',
    apply: (t) => ({ ...t, mentality: ment(t, -1), playersInBox: clamp(t.playersInBox - 1, 2, 9), lineHeight: clamp(t.lineHeight - 8, 10, 95), tempo: clamp(t.tempo - 6, 0, 100) }) },
  { id: 'press', label: 'Press them', icon: 'press', does: 'Hunt the ball higher up', costs: 'Tiring, and risky if they play through', not: 'drop',
    apply: (t) => ({ ...t, pressing: clamp(t.pressing + 18, 5, 100), lineHeight: clamp(t.lineHeight + 6, 10, 95), defApproach: t.defApproach === 'Deep' ? 'Balanced' : t.defApproach === 'Balanced' ? 'High' : t.defApproach }) },
  { id: 'drop', label: 'Drop off', icon: 'down', does: 'Sit in shape, no space behind', costs: 'Gives them the ball', not: 'press',
    apply: (t) => ({ ...t, pressing: clamp(t.pressing - 18, 5, 100), lineHeight: clamp(t.lineHeight - 10, 10, 95), defApproach: t.defApproach === 'Aggressive' || t.defApproach === 'High' ? 'Balanced' : t.defApproach }) },
  { id: 'keep', label: 'Keep the ball', icon: 'refresh', does: 'Short passes, slower, patient', costs: 'Fewer quick chances', not: 'direct',
    apply: (t) => ({ ...t, tempo: clamp(t.tempo - 14, 0, 100), buildUp: 'Short Passing', chanceCreation: 'Possession' }) },
  { id: 'direct', label: 'Get it forward', icon: 'ffwd', does: 'Quicker and longer, in behind', costs: 'Gives the ball away more', not: 'keep',
    apply: (t) => ({ ...t, tempo: clamp(t.tempo + 14, 0, 100), buildUp: t.buildUp === 'Short Passing' ? 'Balanced' : 'Long Ball', chanceCreation: 'Direct Passing' }) },
  { id: 'wide', label: 'Use the flanks', icon: 'expand', does: 'Stretch them, cross more', costs: 'Fewer men in the middle', not: 'narrow',
    apply: (t) => ({ ...t, width: clamp(t.width + 18, 0, 100) }) },
  { id: 'narrow', label: 'Through the middle', icon: 'target', does: 'Narrow, combine centrally', costs: 'Easier to crowd out', not: 'wide',
    apply: (t) => ({ ...t, width: clamp(t.width - 18, 0, 100) }) },
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

/** The shouts on a live match's side, with the set-up they sit on. */
const live = new WeakMap<MatchSim, Record<number, { base: TeamTactics; on: ShoutId[] }>>()
const same = (a: TeamTactics, b: TeamTactics) => JSON.stringify(a) === JSON.stringify(b)

/** The shouts in force (none, once the set-up has been changed on the full board since). */
export function shoutsOn(sim: MatchSim, side: 0 | 1): { base: TeamTactics; on: ShoutId[] } {
  const cur = sim.sideTactics(side)
  const st = live.get(sim)?.[side]
  if (st && same(applyShouts(st.base, st.on), cur)) return st
  return { base: { ...cur }, on: [] }
}
export function setShouts(sim: MatchSim, side: 0 | 1, base: TeamTactics, on: ShoutId[]) {
  const m = live.get(sim) || {}
  m[side] = { base: { ...base }, on }
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
    if (has('pressOk') || has('tilt') || has('ourCounter') || g.read.lean > 0.2) out.push({ tone: 'good', text: 'It\'s working. Keep doing this.', why: (has('pressOk') || has('tilt') || has('ourCounter'))?.text })
    else out.push({ tone: 'neutral', text: 'An even game. Stick with the plan.', why: 'Nothing standing out either way yet.' })
  }
  return out.slice(0, 2)
}
