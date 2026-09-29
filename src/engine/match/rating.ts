// Event-driven player ratings (FotMob-like). Every on-ball and defensive action adds rating points valued by the
// position group the player occupied when he performed it, so moving a player mid-match only changes how his *later*
// actions are valued; nothing he already did is re-scored and the number never jumps.
import type { Position } from '../../domain/types'

export type RG = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST'
export const RG_LIST: RG[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST']

export const RGROUP: Record<Position, RG> = {
  GK: 'GK', CB: 'CB', RB: 'FB', LB: 'FB', RWB: 'FB', LWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM', RM: 'W', LM: 'W', RW: 'W', LW: 'W', CF: 'ST', ST: 'ST',
}

export const isDefGroup = (g: RG) => g === 'CB' || g === 'FB'

/** Value of a goal by the group that scored it. Defenders scoring is rarer and weighs more. */
export const GOAL_W: Record<RG, number> = { GK: 1.3, CB: 1.2, FB: 1.15, DM: 1.08, CM: 1.05, AM: 1, W: 1, ST: 0.92 }

/** Rating-point values for actions. Positive = good. Values are per action. */
export const RP = {
  passOwn: 0.0038, passMid: 0.0048, passFinal: 0.0075,
  passFailOwn: -0.024, passFailMid: -0.012, passFailFinal: -0.006,
  progPass: 0.012,
  keyPass: 0.075, bigChanceCreated: 0.15, xaMul: 0.35, assist: 0.5,
  crossOk: 0.035, crossFail: -0.003, longOk: 0.02, longFail: -0.004, throughOk: 0.04,
  sot: 0.06, offTarget: -0.012, offTargetBig: -0.05, blocked: -0.006, bigChanceMissed: -0.3,
  goal: 0.95, goalXgMul: 0.28,
  dribbleOk: 0.05, dribbleFail: -0.022, dispossessed: -0.028, carryProg: 0.008, offside: -0.02,
  foulWon: 0.028, penWon: 0.3, boxTouch: 0.006,
  tackle: 0.08, tackleDef: 0.09, interception: 0.08, clearance: 0.048, clearanceBox: 0.066, block: 0.13, recovery: 0.024,
  duelWon: 0.028, duelLost: -0.022, aerialWon: 0.036, aerialWonDef: 0.066, aerialLost: -0.018, dribbledPast: -0.04,
  /** the opponent's attack died in the final third: shared by the defensive unit on the pitch */
  snuffed: 0.009,
  errorShot: -0.35, errorGoal: -0.85, penConceded: -0.45, ownGoal: -0.7, foul: -0.02,
  yellow: -0.2, secondYellow: -0.9, red: -1.35,
  save: 0.11, saveXgot: 0.95, concededGk: -0.16, concededGkXgot: -0.32, claim: 0.05, punch: 0.028, sweep: 0.04, penSave: 0.7,
  gkDistOk: 0.003, gkDistFail: -0.01,
  concededDef: -0.06, concededDm: -0.03,
}

/** Clean-sheet value (full 90) by group; applied progressively with minutes played. */
export const CLEAN_SHEET: Record<RG, number> = { GK: 0.45, CB: 0.36, FB: 0.3, DM: 0.12, CM: 0.04, AM: 0, W: 0, ST: 0 }

export interface RateInput {
  rp: number
  mins: number
  /** minutes spent in each rating group */
  gm: Partial<Record<RG, number>>
  /** goals conceded by his team while he was on the pitch */
  ga: number
  /** team goal difference while he was on the pitch */
  gd: number
  /** match progress 0..1 (1 at full time) */
  prog: number
  final: boolean
  /** result of the match for his team (only used when final) */
  res: -1 | 0 | 1
}

/**
 * Turn accumulated rating points into a 3–10 rating. Base 6.0; a quiet but tidy 90 minutes lands around 6.6–6.9,
 * a goal is worth ≈ +1, and the scale compresses above 7.4 so 9+ stays special.
 */
export function computeRating(x: RateInput): number {
  let r = 6.0 + x.rp
  const share = (g: RG) => (x.mins ? (x.gm[g] || 0) / x.mins : 0)
  // clean sheet builds up with the minutes he keeps it; nothing if his team conceded while he was on
  if (x.ga === 0 && x.mins > 0) {
    let cs = 0
    for (const g of RG_LIST) cs += CLEAN_SHEET[g] * share(g)
    const minsF = Math.min(1, x.mins / 90)
    r += cs * minsF * (x.final ? (x.mins >= 60 ? 1 : 0.4) : Math.min(1, x.prog * 1.1))
  }
  // team result: a small shared lift/drag, scaled by time on the pitch
  const presence = Math.min(1, x.mins / 90)
  if (x.final) r += (x.res > 0 ? 0.16 : x.res < 0 ? -0.1 : 0.02) * presence
  else r += (x.gd > 0 ? 0.08 : x.gd < 0 ? -0.05 : 0) * presence * x.prog
  if (r > 7.4) r = 7.4 + (r - 7.4) * 0.72
  if (r < 5.8) r = 5.8 - (5.8 - r) * 0.85
  return Math.round(Math.max(3, Math.min(10, r)) * 10) / 10
}
