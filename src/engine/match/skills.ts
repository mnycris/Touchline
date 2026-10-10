// The match engine's composite skills: PlayStyle bonuses (shared with MatchSim) and the same weighted blends of a
// player's attributes that MatchSim uses for a race in behind, an aerial duel, keeping the ball under a press and so
// on, read from his raw attributes (without the day's fatigue, form or position familiarity), for reports that compare
// players the way a match would.
import type { Player } from '../../domain/types'
import { A } from '../../domain/types'

export const PS_KEYS = ['Chip shot', 'Power shot', 'Precision header', 'Acrobatic', 'Gamechanger', 'Enforcer', 'Finesse shot', 'Low driven shot', 'Rapid', 'First touch',
  'Incisive pass', 'Inventive', 'Quick step', 'Long ball pass', 'Tiki taka', 'Intercept', 'Technical', 'Press proven', 'Slide tackle', 'Relentless', 'Injury prone',
  'Whipped pass', 'Aerial fortress', 'Bruiser', 'Trickster', 'Far throw', 'Far reach', 'Jockey', 'Block', 'Pinged pass', 'Anticipate', 'Long throw', 'Dead ball',
  'Deflector', 'Footwork', 'Rush out', 'Cross claimer']

/** PlayStyle bonuses per composite skill, in attribute points (PlayStyle = 3, PlayStyle+ = 6). */
export interface PB { passS: number; passL: number; thru: number; crs: number; ctrl: number; secure: number; drib: number; pace: number; tackle: number; jockey: number; intc: number; aer: number; press: number; fin: number; lsh: number; hfin: number; vol: number; fk: number; gkStop: number; gkClaim: number; gkSweep: number; chip: number; block: number; deflect: number; relentless: number }
export function psBonus(ps: Record<string, number>): PB {
  const g = (k: string) => ps[k] || 0
  return {
    passS: g('Tiki taka'), passL: Math.max(g('Long ball pass'), g('Pinged pass')), thru: g('Incisive pass') + g('Inventive') * 0.5, crs: g('Whipped pass'),
    ctrl: g('First touch'), secure: g('Press proven') + g('Enforcer') * 0.5, drib: Math.max(g('Technical'), g('Trickster'), g('Quick step') * 0.7),
    pace: g('Rapid') + g('Quick step') * 0.5, tackle: Math.max(g('Slide tackle'), g('Anticipate')) + g('Bruiser') * 0.4, jockey: g('Jockey') + g('Anticipate') * 0.5,
    intc: g('Intercept') + g('Anticipate') * 0.5, aer: g('Aerial fortress'), press: g('Relentless') * 0.5,
    fin: Math.max(g('Low driven shot'), g('Finesse shot') * 0.7), lsh: Math.max(g('Power shot'), g('Finesse shot'), g('Gamechanger') * 0.7),
    hfin: g('Precision header'), vol: g('Acrobatic'), fk: g('Dead ball'), gkStop: g('Far reach') + g('Footwork') * 0.7, gkClaim: g('Cross claimer'), gkSweep: g('Rush out'),
    chip: g('Chip shot'), block: g('Block'), deflect: g('Deflector'), relentless: g('Relentless'),
  }
}

/** A player's PlayStyles as the engine weighs them: 3 for a PlayStyle, 6 for a PlayStyle+. */
export function psMap(p: Player): Record<string, number> {
  const ps: Record<string, number> = {}
  for (const k of p.playstyles || []) if (PS_KEYS.includes(k)) ps[k] = 3
  for (const k of p.playstylesPlus || []) if (PS_KEYS.includes(k)) ps[k] = 6
  return ps
}

export interface Skills { pace: number; aer: number; secure: number; drib: number; jockey: number; press: number; tackle: number }
/** MatchSim.pace, aer, secure, drib, jockey, pressS and tackleS on raw attributes, PlayStyles included. */
export function skillsOf(p: Player): Skills {
  const a = p.attrs, pb = psBonus(psMap(p))
  return {
    pace: a[A.sprintSpeed] * 0.55 + a[A.acceleration] * 0.45 + pb.pace,
    aer: a[A.heading] * 0.35 + a[A.jumping] * 0.35 + a[A.strength] * 0.2 + a[A.reactions] * 0.1 + ((p.height || 181) - 181) * 0.55 + pb.aer,
    secure: a[A.ballControl] * 0.3 + a[A.composure] * 0.25 + a[A.strength] * 0.15 + a[A.balance] * 0.15 + a[A.agility] * 0.15 + pb.secure,
    drib: a[A.dribbling] * 0.4 + a[A.agility] * 0.15 + a[A.balance] * 0.1 + a[A.ballControl] * 0.15 + a[A.acceleration] * 0.2 + ((p.skillMoves || 3) - 3) * 1.5 + pb.drib,
    jockey: a[A.defAwareness] * 0.3 + a[A.standingTackle] * 0.3 + a[A.acceleration] * 0.15 + a[A.agility] * 0.15 + a[A.reactions] * 0.1 + pb.jockey,
    press: a[A.stamina] * 0.3 + a[A.aggression] * 0.25 + a[A.reactions] * 0.2 + a[A.acceleration] * 0.15 + a[A.defAwareness] * 0.1 + pb.press,
    tackle: a[A.standingTackle] * 0.35 + a[A.defAwareness] * 0.3 + a[A.slidingTackle] * 0.1 + a[A.reactions] * 0.1 + a[A.acceleration] * 0.1 + a[A.strength] * 0.05 + pb.tackle,
  }
}
