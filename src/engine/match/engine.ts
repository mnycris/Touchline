// ============================================================================
// Action-based football simulation.
//
// The ball is always somewhere on the pitch and always with someone (or loose, or out of play). Every few seconds the
// player on the ball makes a decision — pass, carry, take a man on, cross, shoot, clear — shaped by his attributes,
// his role, the team's tactics, where his team-mates and opponents are standing, how hard he is being pressed and the
// state of the game. The outcome of each action is a duel between real attributes (passing vs interceptions, dribbling
// vs tackling, heading vs heading, finishing vs goalkeeping), scaled by fatigue, sharpness, morale, form and position
// familiarity. Stats, ratings, heat maps, momentum and commentary are all recorded from those actions, so what you see
// is what was simulated.
//
// Frames: every side works in its own "team frame" (x 0 → 100 toward the opponent goal, y 0 = its left touchline).
// `this.b` is the ball in the frame of the side in possession. See pitch.ts.
// ============================================================================
import type { MatchEvent, MatchPlayerStats, MatchResult, PenaltyKick, Player, Position, ReplayStep, ShotInfo, TeamMatchStats, TeamSheet, TeamTactics, MatchScript, ScriptEvent } from '../../domain/types'
import { A } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { formationOf, POS_GROUP, type Formation } from '../../domain/constants'
import { posRating } from '../../domain/ratings'
import { BODY_PARTS, callName, line } from './commentary'
import { type Pt, type RoleShift, type ShapeInput, type ShotContext, roleShift, baseXg, chanceXg, encodeHeat, flip, heatIndex, HEAT_H, HEAT_W, inBox, logit, metres, playerSpot, sigmoid, toAbs } from './pitch'
import { computeRating, GAIN, GOAL_W, PAR, RGROUP, RP, type RG } from './rating'

export type Phase = 'pre' | '1H' | 'HT' | '2H' | 'ET1' | 'ETHT' | 'ET2' | 'PENS' | 'FT'

export type ActKind =
  | 'pass' | 'long' | 'through' | 'cross' | 'carry' | 'drib' | 'shot' | 'clear' | 'tackle' | 'int' | 'foul' | 'aerial'
  | 'save' | 'goal' | 'corner' | 'fk' | 'throw' | 'gk' | 'kick' | 'off' | 'pen' | 'block' | 'out' | 'claim' | 'rec'

/** One simulated action in absolute pitch coordinates (home attacks toward x = 100), for the 2D match view. */
export interface Act {
  k: ActKind
  s: 0 | 1 // side that performed it
  p: number // player id
  q?: number // receiver / opponent id
  x0: number; y0: number; x1: number; y1: number
  ok: boolean
  t: number // second of the minute it started
}

/**
 * One simulated minute: who had the ball, where play ended up, how much threat each side carried and the actions that
 * happened. Drives the 2D match view and the FotMob-style momentum graph. x runs 0 (home goal) → 100 (away goal).
 */
export interface MinuteFrame {
  m: number
  add: number
  p: number // home share of the ball this minute
  s: 0 | 1 // side on the ball at the end of the minute
  x: number
  y: number
  k: string // dominant action: play | goal | save | miss | chance | woodwork | corner | freekick | offside | foul | yellow | red ...
  mom: number // -1 (away pressure) .. 1 (home pressure)
  ev: number // index of the first event produced in this minute
  acts?: Act[]
}

export interface LiveRating {
  id: number; rating: number; energy: number; on: boolean; pos: Position; yellow: boolean; red: boolean; injured: boolean; slot: number
  goals: number; assists: number; subOn?: number; subOff?: number; played: boolean
  role?: string
  /** missed a penalty in this match */
  penMissed?: boolean
}

export interface SideInput {
  clubId: number
  name: string
  short: string
  sheet: TeamSheet
  players: Record<number, Player>
  controlledByUser?: boolean
  managerVision?: string
}

export interface MatchContext {
  id: string
  compName: string
  neutral: boolean
  venue: string
  attendance: number
  derby?: string
  final?: boolean
  knockout: boolean
  aggregate?: [number, number] // goals already scored in the tie (home side of this match first)
  extraTime: boolean
  penaltiesOnly: boolean
  importance: number
  strictness: number // referee 0.7..1.3
  injuryRate: number // 1 normal
  commentary: boolean
  userSide?: 0 | 1 | -1
  assistantSubs?: boolean
  aiBoost?: number // difficulty multiplier applied to the side the user is facing
  year?: number // calendar year of the match (ages)
  /** Edit Mode: facts this match must contain; everything else is simulated normally */
  script?: MatchScript
}

// ---------------------------------------------------------------- player model
interface Ext {
  xa: number; touches: number; bcc: number; bcm: number; boxTouches: number
  crosses: number; crossesOk: number; longBalls: number; longBallsOk: number; throughBalls: number
  dribbles: number; dribblesOk: number; duels: number; duelsWon: number; aerials: number; aerialsWon: number
  clearances: number; blocks: number; recoveries: number; foulsWon: number; offsides: number
  possLost: number; dispossessed: number; dribbledPast: number; errors: number
  penWon: number; penConceded: number; ownGoals: number
  conceded: number; xgot: number; xgotFaced: number; claims: number; punches: number; sweeps: number
}
type PStats = MatchPlayerStats & Ext

interface Bias { sh: number; ca: number; dr: number; cr: number; pf: number; rw: number; bx: number; dw: number }

interface LP {
  p: Player
  side: 0 | 1
  slot: number
  pos: Position
  g: RG
  role: string
  focus: string
  energy: number
  on: boolean
  subOn?: number
  subOff?: number
  yellow: boolean
  red: boolean
  injured: boolean
  /** good day / bad day, in attribute points */
  form: number
  /** positional familiarity 0.6..1.02 */
  fam: number
  /** condition multipliers: technical, physical, mental */
  cf: [number, number, number]
  /** flat bonus in attribute points (form + team day + home) */
  fb: number
  rp: number
  /** positional par accumulated with his minutes (see rating.ts PAR) */
  pd: number
  ga: number
  gd: number
  gm: Partial<Record<RG, number>>
  st: PStats
  heat: Float32Array
  jx: number
  jy: number
  at: Pt
  ps: Record<string, number>
  bias: Bias
  rs: RoleShift
  pb: PB
  /** wide player on his "wrong" side (cuts inside onto the stronger foot) */
  inv: boolean
  /** scratch points reused by the layout */
  q1: Pt
  q2: Pt
}

// technical 0 / physical 1 / mental 2
const CLS = new Uint8Array(34)
for (const i of [A.acceleration, A.sprintSpeed, A.agility, A.balance, A.jumping, A.stamina, A.strength]) CLS[i] = 1
for (const i of [A.reactions, A.composure, A.positioning, A.vision, A.defAwareness, A.interceptions, A.aggression, A.gkPositioning]) CLS[i] = 2

const MENT: Record<string, number> = { 'Ultra Defensive': -2, Defensive: -1, Balanced: 0, Attacking: 1, 'Ultra Attacking': 2 }
const WORK: Record<RG, number> = { GK: 0.15, CB: 0.8, FB: 1.06, DM: 0.96, CM: 1.1, AM: 0.96, W: 1.05, ST: 0.95 }

/** Shooting instinct by position (inside the box; weaker from distance). */
const SHOOT: Record<RG, number> = { GK: -2, CB: -0.45, FB: -0.75, DM: -0.3, CM: 0.12, AM: 0.08, W: 0.25, ST: 0 }

/** How much each position gets the ball in general circulation (centre-backs and full-backs see a lot of it). */
const DEMAND: Record<RG, number> = { GK: 1, CB: 1.35, FB: 1.2, DM: 0.95, CM: 0.78, AM: 0.68, W: 0.95, ST: 0.78 }

const LN_DEMAND = Object.fromEntries(Object.entries(DEMAND).map(([k, v]) => [k, Math.log(v)])) as Record<RG, number>

const ZB: Bias = { sh: 0, ca: 0, dr: 0, cr: 0, pf: 0, rw: 0, bx: 0, dw: 0 }
const ROLE_BIAS: Record<string, Partial<Bias>> = {
  'Inside Forward': { sh: 0.18, dr: 0.3, cr: -0.45, bx: 0.25 },
  Winger: { cr: 0.45, dr: 0.3, ca: 0.2 },
  'Wide Playmaker': { pf: 0.2, rw: 0.2, cr: 0.1, sh: -0.1 },
  'Wide Midfielder': { dw: 0.3, cr: 0.15 },
  'Advanced Forward': { sh: 0.12, bx: 0.25, rw: 0.1 },
  Poacher: { sh: 0.18, bx: 0.35, rw: -0.1, dw: -0.4, ca: -0.2 },
  'False 9': { pf: 0.25, rw: 0.25, sh: -0.15, bx: -0.25 },
  'Target Forward': { bx: 0.45, rw: 0.15, dr: -0.3 },
  Playmaker: { pf: 0.2, rw: 0.25 },
  'Shadow Striker': { sh: 0.12, bx: 0.25 },
  'Half-Winger': { sh: 0.1, pf: 0.1 },
  'Classic 10': { pf: 0.3, rw: 0.3, dw: -0.3 },
  'Box-to-Box': { ca: 0.25, dw: 0.2, bx: 0.15 },
  Holding: { pf: -0.25, dw: 0.35, sh: -0.35, ca: -0.2 },
  'Deep-Lying Playmaker': { pf: 0.3, rw: 0.3 },
  'Centre-Half': { ca: -0.4, dw: 0.1, pf: -0.1 },
  Fullback: { cr: 0.1, dw: 0.15 },
  Falseback: { rw: 0.2, pf: 0.1, cr: -0.25 },
  Wingback: { cr: 0.35, ca: 0.2 },
  'Attacking Wingback': { cr: 0.5, ca: 0.3, dw: -0.15, bx: 0.1 },
  Defender: { ca: -0.3 },
  Stopper: { dw: 0.3 },
  'Ball-Playing Defender': { pf: 0.3, ca: 0.2, rw: 0.15 },
  'Ball-Playing Keeper': { pf: 0.2 },
}
const FOCUS_BIAS: Record<string, Partial<Bias>> = {
  Attack: { sh: 0.05, bx: 0.1, dw: -0.15 },
  Defend: { dw: 0.2, bx: -0.2, sh: -0.1, ca: -0.1 },
  'Build-Up': { pf: 0.1, rw: 0.1 },
  Roaming: { ca: 0.1, dr: 0.1, rw: 0.05 },
  Aggressive: { dw: 0.25 },
}

const PS_KEYS = ['Chip shot', 'Power shot', 'Precision header', 'Acrobatic', 'Gamechanger', 'Enforcer', 'Finesse shot', 'Low driven shot', 'Rapid', 'First touch',
  'Incisive pass', 'Inventive', 'Quick step', 'Long ball pass', 'Tiki taka', 'Intercept', 'Technical', 'Press proven', 'Slide tackle', 'Relentless', 'Injury prone',
  'Whipped pass', 'Aerial fortress', 'Bruiser', 'Trickster', 'Far throw', 'Far reach', 'Jockey', 'Block', 'Pinged pass', 'Anticipate', 'Long throw', 'Dead ball',
  'Deflector', 'Footwork', 'Rush out', 'Cross claimer']

/** PlayStyle bonuses per composite skill, in attribute points (PlayStyle = 3, PlayStyle+ = 6). */
interface PB { passS: number; passL: number; thru: number; crs: number; ctrl: number; secure: number; drib: number; pace: number; tackle: number; jockey: number; intc: number; aer: number; press: number; fin: number; lsh: number; hfin: number; vol: number; fk: number; gkStop: number; gkClaim: number; gkSweep: number; chip: number; block: number; deflect: number; relentless: number }
function psBonus(ps: Record<string, number>): PB {
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

function emptyExt(): Ext {
  return {
    xa: 0, touches: 0, bcc: 0, bcm: 0, boxTouches: 0, crosses: 0, crossesOk: 0, longBalls: 0, longBallsOk: 0, throughBalls: 0,
    dribbles: 0, dribblesOk: 0, duels: 0, duelsWon: 0, aerials: 0, aerialsWon: 0, clearances: 0, blocks: 0, recoveries: 0, foulsWon: 0, offsides: 0,
    possLost: 0, dispossessed: 0, dribbledPast: 0, errors: 0, penWon: 0, penConceded: 0, ownGoals: 0, conceded: 0, xgot: 0, xgotFaced: 0, claims: 0, punches: 0, sweeps: 0,
  }
}

type FullTeamStats = Required<TeamMatchStats>
function emptyTeamStats(): FullTeamStats {
  return {
    possession: 50, shots: 0, sot: 0, xg: 0, passes: 0, passAcc: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, saves: 0, bigChances: 0,
    tackles: 0, interceptions: 0, clearances: 0, blocks: 0, crosses: 0, crossesOk: 0, dribbles: 0, dribblesOk: 0, aerialsWon: 0, duelsWon: 0, boxTouches: 0,
    longBalls: 0, throwIns: 0, goalKicks: 0, bigChancesMissed: 0, xgot: 0, recoveries: 0, touches: 0,
  }
}

class Side {
  lps: LP[] = []
  bench: LP[] = []
  on: LP[] = []
  gk?: LP
  tactics: TeamTactics
  formation: string
  slots: Formation['slots']
  subsUsed = 0
  windowsUsed = 0
  aiMentality = 0
  stats = emptyTeamStats()
  possSec = 0
  minSec = 0
  threat = 0
  passesDone = 0
  dayForm = 0
  boost = 1
  home = 0
  shape!: ShapeInput
  /** how directly the side plays: + long, fast and forward; − patient and short */
  dir = 0
  /** natural game-state shift in attitude (leading teams manage the game, trailing teams chase) */
  state = 0
  constructor(public input: SideInput, public idx: 0 | 1) {
    this.tactics = { ...input.sheet.tactics }
    this.formation = input.sheet.formation
    this.slots = formationOf(this.formation).slots
  }
  refresh() {
    this.on = this.lps.filter((l) => l.on)
    this.gk = this.on.find((l) => l.pos === 'GK')
  }
  get name() { return this.input.short }
  get ment() { return MENT[this.tactics.mentality] + this.aiMentality + this.state }
}

type RestartKind = 'kickoff' | 'goalkick' | 'throw' | 'corner' | 'fk' | 'pen' | 'gkhold'
interface Restart { kind: RestartKind; side: 0 | 1; at: Pt; dead: number; taker?: LP; victim?: LP; fouler?: LP }

interface Chain {
  pass?: { from: LP; kind: string; n: number }
  how?: string
  err?: LP
  errN: number
  oneOnOne: boolean
  solo: boolean
  setPiece?: string
}

/** Calibration counters (only filled when a harness sets MatchSim.dbg). */
function dbg(k: string, v = 1) { const d = MatchSim.dbg; if (d) d[k] = (d[k] || 0) + v }

export class MatchSim {
  static dbg: Record<string, number> | null = null
  rng: Rng
  sides: [Side, Side]
  phase: Phase = 'pre'
  minute = 0
  added = 0
  addedPlanned = 0
  score: [number, number] = [0, 0]
  htScore: [number, number] = [0, 0]
  regScore?: [number, number]
  pens?: [number, number]
  events: MatchEvent[] = []
  paused = false
  injuredWaiting: { side: 0 | 1; lp: LP }[] = []
  timeline: MinuteFrame[] = []
  private vrng: Rng
  private crng: Rng
  // ball state
  private ps: 0 | 1 = 0
  private b: Pt = { x: 50, y: 50 }
  private car: LP | null = null
  private pending: Restart | null = null
  private debt = 0
  private dis = 0
  private lossBall: Pt = { x: 50, y: 50 }
  private counter = false
  private chain: Chain = { errN: 0, oneOnOne: false, solo: false }
  private n = 0 // action counter
  private sec = 0
  private acts: Act[] = []
  private notable: { key: string; v: Record<string, any>; w: number } | null = null
  private lastInfo = 0
  private lineCache = 0
  private cR: LP[] = []
  private cW: number[] = []
  private cK: string[] = []
  private cT: Pt[] = []
  private cO: number[] = []
  /** full detail: action log, heat maps and running commentary (live and user-relevant matches) */
  private detail: boolean
  /**
   * Skill reference for this match: skills are judged against the level of the two teams on the pitch, so a League Two
   * game plays like football between equals rather than like two bad Premier League sides. A small part of the absolute
   * level is kept (lower leagues are a little sloppier).
   */
  private ref = 72

  constructor(public home: SideInput, public away: SideInput, public ctx: MatchContext, seed: number) {
    this.rng = new Rng(seed)
    this.vrng = new Rng((seed ^ 0x5bd1e995) >>> 0)
    this.crng = new Rng((seed ^ 0x27d4eb2f) >>> 0)
    this.detail = ctx.commentary
    // Edit Mode "stars": the three best outfield players of a side have a big day
    const st = ctx.script?.stars
    if (st) for (const [k, inp] of [[0, home], [1, away]] as const) {
      if (st !== 'both' && (st === 'home') !== (k === 0)) continue
      inp.sheet.lineup.map((id) => inp.players[id]).filter((p) => p && p.positions[0] !== 'GK').sort((a, b) => b.ovr - a.ovr).slice(0, 3).forEach((p) => this.stars.add(p.id))
    }
    this.sides = [new Side(home, 0), new Side(away, 1)]
    const us = ctx.userSide
    for (const s of this.sides) {
      s.dayForm = clamp(this.rng.normal(0, 2), -4.5, 4.5)
      s.boost = us === 0 || us === 1 ? (s.idx === us ? 1 : ctx.aiBoost ?? 1) : 1
      // Edit Mode balance: one side sharper, the other a little flat
      const bias = ctx.script?.bias || 0
      if (bias) s.boost *= s.idx === 0 ? 1 + 0.045 * bias : 1 - 0.04 * bias
      s.home = ctx.neutral ? 0 : s.idx === 0 ? 1.5 : -0.35
      this.initSide(s)
    }
    const xi = this.sides.flatMap((s) => s.on)
    const lvl = xi.length ? xi.reduce((a, l) => a + l.p.ovr, 0) / xi.length : 79
    this.ref = 72 + (lvl - 79) * 0.85
  }

  // =========================================================== setup
  private mkLP(p: Player, slot: number, pos: Position, role: string, focus: string, side: 0 | 1, on: boolean): LP {
    const st: PStats = {
      id: p.id, side, pos, mins: 0, rating: 6, goals: 0, assists: 0, shots: 0, sot: 0, xg: 0, passes: 0, passesCompleted: 0,
      keyPasses: 0, tackles: 0, interceptions: 0, saves: 0, fouls: 0, yellow: false, red: false, started: on, ...emptyExt(),
    }
    const sd = 1.6 + 2.6 * (1 - clamp(p.hidden.consistency, 1, 99) / 100)
    const told = this.ctx.script?.form?.[p.id] ?? (this.stars.has(p.id) ? 2 : undefined)
    // an Edit Mode performance level replaces the day's random form (a little spread keeps it human)
    const form = told ? clamp(told * 3.6 + this.rng.normal(0, 0.8), -9, 9) : clamp(this.rng.normal(0, sd), -7, 7)
    const ps: Record<string, number> = {}
    for (const k of p.playstyles) if (PS_KEYS.includes(k)) ps[k] = 3
    for (const k of p.playstylesPlus) if (PS_KEYS.includes(k)) ps[k] = 6
    const lp: LP = {
      p, side, slot, pos, g: RGROUP[pos], role, focus, energy: clamp(p.fitness, 20, 100), on, yellow: false, red: false, injured: false,
      form, fam: 1, cf: [1, 1, 1], fb: 0, rp: 0, pd: 0, ga: 0, gd: 0, gm: {}, st, heat: new Float32Array(HEAT_W * HEAT_H), jx: 0, jy: 0, at: { x: 50, y: 50 }, ps, bias: ZB, rs: roleShift(role, pos), pb: psBonus(ps), inv: false, q1: { x: 0, y: 0 }, q2: { x: 0, y: 0 },
    }
    this.placed(lp)
    return lp
  }

  /** Recompute everything that depends on where a player is playing. */
  private placed(lp: LP) {
    lp.g = RGROUP[lp.pos]
    lp.st.pos = lp.pos
    lp.fam = clamp(posRating(lp.p, lp.pos) / Math.max(40, lp.p.ovr), 0.6, 1.02)
    const rb = ROLE_BIAS[lp.role] || {}, fb = FOCUS_BIAS[lp.focus] || {}
    const b: Bias = { ...ZB }
    for (const k of Object.keys(b) as (keyof Bias)[]) b[k] = (rb[k] || 0) + (fb[k] || 0)
    lp.bias = b
    lp.rs = roleShift(lp.role, lp.pos)
    lp.inv = lp.role === 'Inside Forward' || lp.role === 'Half-Winger' || ((lp.pos === 'LW' || lp.pos === 'LM') ? lp.p.foot === 'R' : (lp.pos === 'RW' || lp.pos === 'RM') ? lp.p.foot === 'L' : false) && lp.role !== 'Winger'
    this.cond(lp)
  }

  private initSide(s: Side) {
    const sheet = s.input.sheet
    sheet.lineup.forEach((id, i) => {
      const p = s.input.players[id]
      if (!p || !s.slots[i]) return
      const r = sheet.roles[i] || { role: '', focus: 'Balanced' }
      s.lps.push(this.mkLP(p, i, s.slots[i].pos, r.role, r.focus, s.idx, true))
    })
    sheet.bench.forEach((id) => {
      const p = s.input.players[id]
      if (p) s.bench.push(this.mkLP(p, -1, p.positions[0], '', 'Balanced', s.idx, false))
    })
    s.refresh()
    this.reshape(s)
  }

  /** Condition multipliers from energy, sharpness, morale, occasion and familiarity. */
  private cond(l: LP) {
    const e = l.energy
    const S = this.sides?.[l.side]
    const phyE = e >= 80 ? 1 : 1 - (80 - e) * 0.0033
    const tecE = 1 - Math.max(0, 70 - e) * 0.0025
    const menE = 1 - Math.max(0, 65 - e) * 0.003
    const sharp = clamp(l.p.sharpness, 0, 100) / 100
    const mor = 0.98 + 0.04 * ((clamp(l.p.morale, 0, 100) - 50) / 50)
    const big = this.ctx.importance >= 3 ? 1 + (l.p.hidden.bigMatch - 50) / 1500 : 1
    const famF = 0.82 + 0.18 * l.fam
    const boost = S ? S.boost : 1
    l.cf[0] = tecE * (0.92 + 0.08 * sharp) * mor * boost
    l.cf[1] = phyE * (0.93 + 0.07 * sharp) * boost
    l.cf[2] = menE * mor * big * famF * boost
    l.fb = l.form + (S ? S.dayForm + S.home : 0)
  }

  private reshape(s: Side) {
    const t = s.tactics
    s.dir = (t.buildUp === 'Long Ball' ? 1 : t.buildUp === 'Counter' ? 0.6 : t.buildUp === 'Short Passing' ? -0.5 : 0)
      + (t.chanceCreation === 'Direct Passing' ? 0.6 : t.chanceCreation === 'Forward Runs' ? 0.35 : t.chanceCreation === 'Possession' ? -0.6 : 0)
      + (t.tempo - 50) / 45
    s.shape = { formation: formationOf(s.formation), lineHeight: t.lineHeight, width: t.width, mentality: clamp(s.ment, -2.5, 2.5), pressing: t.pressing }
  }

  // =========================================================== attribute composites (effective points)
  private e(l: LP, i: number) { return l.p.attrs[i] * l.cf[CLS[i]] + l.fb }
  private passS(l: LP) { return this.e(l, A.shortPassing) * 0.5 + this.e(l, A.vision) * 0.15 + this.e(l, A.ballControl) * 0.15 + this.e(l, A.composure) * 0.2 + l.pb.passS }
  private passL(l: LP) { return this.e(l, A.longPassing) * 0.55 + this.e(l, A.vision) * 0.2 + this.e(l, A.curve) * 0.15 + this.e(l, A.composure) * 0.1 + l.pb.passL }
  private thru(l: LP) { return this.e(l, A.vision) * 0.45 + this.e(l, A.shortPassing) * 0.25 + this.e(l, A.longPassing) * 0.15 + this.e(l, A.curve) * 0.15 + l.pb.thru }
  private crs(l: LP) { return this.e(l, A.crossing) * 0.65 + this.e(l, A.curve) * 0.2 + this.e(l, A.vision) * 0.15 + l.pb.crs }
  private ctrl(l: LP) { return this.e(l, A.ballControl) * 0.45 + this.e(l, A.composure) * 0.2 + this.e(l, A.agility) * 0.15 + this.e(l, A.reactions) * 0.1 + this.e(l, A.balance) * 0.1 + l.pb.ctrl }
  private secure(l: LP) { return this.e(l, A.ballControl) * 0.3 + this.e(l, A.composure) * 0.25 + this.e(l, A.strength) * 0.15 + this.e(l, A.balance) * 0.15 + this.e(l, A.agility) * 0.15 + l.pb.secure }
  private drib(l: LP) { return this.e(l, A.dribbling) * 0.4 + this.e(l, A.agility) * 0.15 + this.e(l, A.balance) * 0.1 + this.e(l, A.ballControl) * 0.15 + this.e(l, A.acceleration) * 0.2 + (l.p.skillMoves - 3) * 1.5 + l.pb.drib }
  private pace(l: LP) { return this.e(l, A.sprintSpeed) * 0.55 + this.e(l, A.acceleration) * 0.45 + l.pb.pace }
  private tackleS(l: LP) { return this.e(l, A.standingTackle) * 0.35 + this.e(l, A.defAwareness) * 0.3 + this.e(l, A.slidingTackle) * 0.1 + this.e(l, A.reactions) * 0.1 + this.e(l, A.acceleration) * 0.1 + this.e(l, A.strength) * 0.05 + l.pb.tackle }
  private jockey(l: LP) { return this.e(l, A.defAwareness) * 0.3 + this.e(l, A.standingTackle) * 0.3 + this.e(l, A.acceleration) * 0.15 + this.e(l, A.agility) * 0.15 + this.e(l, A.reactions) * 0.1 + l.pb.jockey }
  private intc(l: LP) { return this.e(l, A.interceptions) * 0.45 + this.e(l, A.defAwareness) * 0.35 + this.e(l, A.reactions) * 0.2 + l.pb.intc }
  private aer(l: LP) { return this.e(l, A.heading) * 0.35 + this.e(l, A.jumping) * 0.35 + this.e(l, A.strength) * 0.2 + this.e(l, A.reactions) * 0.1 + (l.p.height - 181) * 0.55 + l.pb.aer }
  private pressS(l: LP) { return this.e(l, A.stamina) * 0.3 + this.e(l, A.aggression) * 0.25 + this.e(l, A.reactions) * 0.2 + this.e(l, A.acceleration) * 0.15 + this.e(l, A.defAwareness) * 0.1 + l.pb.press }
  private fin(l: LP) { return this.e(l, A.finishing) * 0.5 + this.e(l, A.composure) * 0.2 + this.e(l, A.positioning) * 0.15 + this.e(l, A.reactions) * 0.15 + l.pb.fin }
  private lsh(l: LP) { return this.e(l, A.longShots) * 0.5 + this.e(l, A.shotPower) * 0.3 + this.e(l, A.curve) * 0.1 + this.e(l, A.composure) * 0.1 + l.pb.lsh }
  private hfin(l: LP) { return this.e(l, A.heading) * 0.5 + this.e(l, A.jumping) * 0.2 + this.e(l, A.positioning) * 0.15 + this.e(l, A.strength) * 0.15 + (l.p.height - 181) * 0.3 + l.pb.hfin }
  private vol(l: LP) { return this.e(l, A.volleys) * 0.5 + this.e(l, A.finishing) * 0.3 + this.e(l, A.composure) * 0.2 + l.pb.vol }
  private pk(l: LP) { return this.e(l, A.penalties) * 0.6 + this.e(l, A.composure) * 0.25 + this.e(l, A.shotPower) * 0.15 }
  private fk(l: LP) { return this.e(l, A.fkAccuracy) * 0.55 + this.e(l, A.curve) * 0.3 + this.e(l, A.shotPower) * 0.15 + l.pb.fk }
  private gkStop(l: LP) {
    if (l.pos !== 'GK') return 25 + l.p.attrs[A.reactions] * 0.2
    return this.e(l, A.gkReflexes) * 0.35 + this.e(l, A.gkDiving) * 0.35 + this.e(l, A.gkPositioning) * 0.2 + this.e(l, A.gkHandling) * 0.1 + l.pb.gkStop
  }
  private gkClaim(l: LP) { return this.e(l, A.gkHandling) * 0.45 + this.e(l, A.gkPositioning) * 0.4 + this.e(l, A.reactions) * 0.15 + l.pb.gkClaim }
  private gkDist(l: LP) { return this.e(l, A.gkKicking) * 0.6 + this.e(l, A.shortPassing) * 0.25 + this.e(l, A.composure) * 0.15 }
  private gkSweep(l: LP) { return this.e(l, A.gkPositioning) * 0.4 + this.e(l, A.acceleration) * 0.3 + this.e(l, A.reactions) * 0.3 + l.pb.gkSweep }

  // =========================================================== public controls
  setTactics(side: 0 | 1, t: Partial<TeamTactics>, announce = true) {
    const s = this.sides[side]
    const before = s.tactics.mentality
    s.tactics = { ...s.tactics, ...t }
    this.reshape(s)
    if (announce && this.phase !== 'pre' && this.ctx.commentary) {
      const x = t.mentality && t.mentality !== before ? `${t.mentality.toLowerCase()} mentality` : describeTactic(t)
      if (x) this.push({ min: this.displayMinute(), type: 'tactic', side, text: line(this.crng, 'tactic', { t: s.name, x }) })
    }
  }

  setRole(side: 0 | 1, playerId: number, role: string, focus: string) {
    const lp = this.sides[side].lps.find((l) => l.p.id === playerId)
    if (!lp) return
    lp.role = role
    lp.focus = focus
    this.placed(lp)
  }

  canSub(side: 0 | 1): boolean {
    const s = this.sides[side]
    const max = this.phase === 'ET1' || this.phase === 'ETHT' || this.phase === 'ET2' ? 6 : 5
    return s.subsUsed < max && (s.windowsUsed < (max === 6 ? 4 : 3) || this.phase === 'HT' || this.phase === 'ETHT' || this.phase === 'pre')
  }

  /** A player with a scripted moment still to come stays on (the AI won't take him off). */
  private scriptHolds(id: number): boolean {
    const ev = this.ctx.script?.events
    return !!ev && ev.some((e) => !this.scriptDone.has(e.id) && (e.player === id || e.assist === id))
  }

  substitute(side: 0 | 1, outId: number, inId: number, reason: 'tactical' | 'injury' = 'tactical'): boolean {
    const s = this.sides[side]
    const out = s.lps.find((l) => l.p.id === outId && l.on)
    const bi = s.bench.findIndex((l) => l.p.id === inId)
    if (!out || bi < 0 || !this.canSub(side)) return false
    const inn = s.bench.splice(bi, 1)[0]
    out.on = false
    out.subOff = this.minute
    out.st.subOff = this.minute
    inn.on = true
    inn.slot = out.slot
    inn.pos = out.pos
    inn.role = out.role
    inn.focus = out.focus
    inn.subOn = this.minute
    inn.st.subOn = this.minute
    this.placed(inn)
    s.lps.push(inn)
    s.subsUsed++
    if (!(this.phase === 'HT' || this.phase === 'ETHT' || this.phase === 'pre')) {
      // subs made in the same minute share a window
      const lastSub = [...this.events].reverse().find((e) => e.type === 'sub' && e.side === side)
      if (!lastSub || lastSub.min !== this.displayMinute()) s.windowsUsed++
      this.debt += 20
    }
    s.refresh()
    if (this.car === out) this.car = inn
    this.injuredWaiting = this.injuredWaiting.filter((x) => x.lp !== out)
    const atBreak = this.phase === 'HT' || this.phase === 'ETHT'
    this.push({
      min: atBreak ? (this.phase === 'HT' ? 46 : 106) : this.displayMinute(), add: atBreak ? undefined : this.added || undefined, type: 'sub', side, player: inn.p.id, player2: out.p.id,
      text: line(this.crng, reason === 'injury' ? 'subInjury' : 'sub', { t: s.name, p: callName(inn.p.name), q: callName(out.p.name) }),
    })
    return true
  }

  /** Move players between formation slots (formation change or re-ordering). */
  setFormation(side: 0 | 1, formationId: string, slotOrder?: number[]) {
    const s = this.sides[side]
    const f = formationOf(formationId)
    s.formation = f.id
    s.slots = f.slots
    const on = s.on
    const order = slotOrder ? slotOrder.map((id) => on.find((l) => l.p.id === id)).filter(Boolean) as LP[] : [...on].sort((a, b) => a.slot - b.slot)
    order.forEach((lp, i) => {
      if (!f.slots[i]) return
      lp.slot = i
      lp.pos = f.slots[i].pos
      this.placed(lp)
    })
    this.reshape(s)
    if (this.phase !== 'pre' && this.ctx.commentary) this.push({ min: this.displayMinute(), type: 'tactic', side, text: line(this.crng, 'tactic', { t: s.name, x: f.name }) })
  }

  /** Swap the positions of two players on the pitch (keeps every other slot untouched). */
  swapPositions(side: 0 | 1, a: number, b: number): boolean {
    const s = this.sides[side]
    const P = s.lps.find((l) => l.on && l.p.id === a), Q = s.lps.find((l) => l.on && l.p.id === b)
    if (!P || !Q) return false
    ;[P.slot, Q.slot] = [Q.slot, P.slot]
    ;[P.pos, Q.pos] = [Q.pos, P.pos]
    ;[P.role, Q.role] = [Q.role, P.role]
    ;[P.focus, Q.focus] = [Q.focus, P.focus]
    this.placed(P)
    this.placed(Q)
    return true
  }

  /** Move a player into an empty formation slot (e.g. the one left by a sent-off team-mate). */
  moveToSlot(side: 0 | 1, id: number, slot: number): boolean {
    const s = this.sides[side]
    const P = s.lps.find((l) => l.on && l.p.id === id)
    if (!P || !s.slots[slot] || s.on.some((l) => l.slot === slot)) return false
    P.slot = slot
    P.pos = s.slots[slot].pos
    const r = s.input.sheet.roles[slot]
    if (r) { P.role = r.role; P.focus = r.focus }
    this.placed(P)
    return true
  }

  // =========================================================== flow
  displayMinute(): number {
    return this.minute
  }

  private push(e: MatchEvent) {
    e.score = [...this.score] as [number, number]
    this.events.push(e)
  }

  private ev(type: MatchEvent['type'], side: 0 | 1 | -1, text: string, extra: Partial<MatchEvent> = {}) {
    this.push({ min: this.minute, add: this.added || undefined, type, side, text, ...extra })
  }

  get finished() { return this.phase === 'FT' }

  /** Advance one match minute. Returns events generated during it. */
  step(): MatchEvent[] {
    const start = this.events.length
    if (this.phase === 'FT' || this.paused) return []
    switch (this.phase) {
      case 'pre':
        this.phase = '1H'
        this.minute = 0
        this.push({ min: 0, type: 'kickoff', side: -1, text: this.ctx.commentary ? line(this.crng, this.ctx.final ? 'kickoffFinal' : this.ctx.derby ? 'kickoffDerby' : 'kickoff', this.venueVars()) : '' })
        this.kickoff(this.rng.next() < 0.5 ? 0 : 1)
        return this.events.slice(start)
      case 'HT':
        this.aiHalfTime()
        this.phase = '2H'
        this.minute = 45
        this.added = 0
        this.push({ min: 45, type: 'kickoff', side: -1, text: this.ctx.commentary ? 'The second half is underway.' : '' })
        this.kickoff(this.firstKick === 0 ? 1 : 0)
        return this.events.slice(start)
      case 'ETHT':
        this.phase = 'ET2'
        this.minute = 105
        this.added = 0
        this.push({ min: 105, type: 'kickoff', side: -1, text: 'The second period of extra time begins.' })
        this.kickoff(this.firstKick === 0 ? 1 : 0)
        return this.events.slice(start)
      case 'PENS':
        this.shootout()
        return this.events.slice(start)
    }
    const endMin = this.phase === '1H' ? 45 : this.phase === '2H' ? 90 : this.phase === 'ET1' ? 105 : 120
    if (this.minute < endMin) this.minute++
    else this.added++
    if (this.minute === endMin && this.added === 0) {
      this.addedPlanned = Math.max(this.plannedStoppage(), this.scriptedAdded(endMin))
      if (this.ctx.commentary && this.addedPlanned > 0) this.push({ min: endMin, type: 'info', side: -1, text: line(this.crng, 'added', { x: this.addedPlanned }) })
    }
    const evStart = this.events.length
    this.simMinute()
    this.frame(evStart)
    if (this.minute === endMin && this.added >= this.addedPlanned) this.endPeriod()
    return this.events.slice(start)
  }

  runToEnd(): MatchResult {
    let guard = 0
    while (this.phase !== 'FT' && guard++ < 400) {
      if (this.injuredWaiting.length) this.autoResolveInjuries()
      this.step()
    }
    return this.result()
  }

  private firstKick: 0 | 1 = 0
  private kickoff(side: 0 | 1) {
    if (this.phase === '1H' || this.phase === 'ET1') this.firstKick = side
    this.debt = 0
    this.pending = { kind: 'kickoff', side, at: { x: 50, y: 50 }, dead: 0 }
  }

  private venueVars() {
    return { home: this.home.short, away: this.away.short, venue: this.ctx.venue, att: this.ctx.attendance.toLocaleString('en-GB'), derby: this.ctx.derby, comp: this.ctx.compName }
  }

  private plannedStoppage(): number {
    const ev = this.events.filter((e) => this.inCurrentPeriod(e))
    const goals = ev.filter((e) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal').length
    const subs = ev.filter((e) => e.type === 'sub').length
    const cards = ev.filter((e) => e.type === 'yellow' || e.type === 'red' || e.type === 'secondYellow').length
    const inj = ev.filter((e) => e.type === 'injury').length
    const pens = ev.filter((e) => e.type === 'penalty' || e.type === 'var').length
    const waste = this.sides.some((s) => s.tactics.timeWasting) ? 1.2 : 0
    const base = this.phase === '1H' ? 0.8 : this.phase === '2H' ? 2.2 : 0.4
    const x = base + goals * 0.45 + subs * (this.phase === '2H' ? 0.3 : 0.2) + cards * 0.25 + inj * 0.9 + pens * 0.8 + waste + this.rng.next() * 1.4
    const max = this.phase === '1H' ? 7 : this.phase === '2H' ? 10 : 3
    return clamp(Math.round(x), this.phase === '2H' ? 2 : this.phase === '1H' ? 1 : 0, max)
  }

  private inCurrentPeriod(e: MatchEvent) {
    if (this.phase === '1H') return e.min <= 45
    if (this.phase === '2H') return e.min > 45 && e.min <= 90
    if (this.phase === 'ET1') return e.min > 90 && e.min <= 105
    return e.min > 105
  }

  private endPeriod() {
    const v = { ...this.venueVars(), hs: this.score[0], as: this.score[1] }
    this.pending = null
    if (this.phase === '1H') {
      this.htScore = [...this.score] as [number, number]
      this.phase = 'HT'
      this.push({ min: 45, add: this.added || undefined, type: 'ht', side: -1, text: line(this.crng, 'ht', v) })
      for (const s of this.sides) for (const lp of s.on) { lp.energy = Math.min(100, lp.energy + 4); this.cond(lp) }
      return
    }
    if (this.phase === '2H') {
      if (this.needsDecider()) {
        this.regScore = [...this.score] as [number, number]
        if (this.ctx.penaltiesOnly || !this.ctx.extraTime) {
          this.phase = 'PENS'
          this.push({ min: 90, add: this.added || undefined, type: 'pens', side: -1, text: line(this.crng, 'pens', v) })
        } else {
          this.phase = 'ET1'
          this.push({ min: 90, add: this.added || undefined, type: 'et', side: -1, text: line(this.crng, 'et', v) })
          this.minute = 90
          this.added = 0
          for (const s of this.sides) for (const lp of s.on) { lp.energy = Math.min(100, lp.energy + 2.5); this.cond(lp) }
          this.kickoff(this.rng.next() < 0.5 ? 0 : 1)
        }
        return
      }
      this.finish(v)
      return
    }
    if (this.phase === 'ET1') {
      this.phase = 'ETHT'
      this.push({ min: 105, type: 'ht', side: -1, text: `End of the first period of extra time. ${this.home.short} ${this.score[0]}-${this.score[1]} ${this.away.short}.` })
      return
    }
    if (this.phase === 'ET2') {
      if (this.needsDecider()) {
        this.phase = 'PENS'
        this.push({ min: 120, type: 'pens', side: -1, text: line(this.crng, 'pens', v) })
        return
      }
      this.finish(v)
    }
  }

  private needsDecider(): boolean {
    if (!this.ctx.knockout) return false
    const agg = this.ctx.aggregate || [0, 0]
    return this.score[0] + agg[0] === this.score[1] + agg[1]
  }

  private finish(v: Record<string, any>) {
    this.phase = 'FT'
    const key = this.score[0] === this.score[1] ? 'ftDraw' : 'ft'
    this.push({ min: this.minute, add: this.added || undefined, type: 'ft', side: -1, text: line(this.crng, key, { ...v, hs: this.score[0], as: this.score[1] }) })
    this.finalRatings()
  }

  // =========================================================== the minute
  private simMinute() {
    this.fatigue()
    this.gameState()
    this.aiManage()
    this.acts = []
    this.notable = null
    for (const s of this.sides) { s.minSec = 0; s.threat = 0 }
    let t = this.debt + this.runScript()
    let guard = 0
    while (t < 60 && guard++ < 90) {
      this.sec = t
      t += this.tick()
      if (this.phase === 'FT') break
    }
    this.debt = Math.max(0, t - 60)
    this.injuryCheck()
    this.misconduct()
    this.buildLine()
  }

  private tick(): number {
    if (this.pending) {
      const r = this.pending
      this.pending = null
      return this.restart(r)
    }
    const side = this.ps
    const dt = this.act()
    this.sides[side].possSec += dt
    this.sides[side].minSec += dt
    return dt
  }

  // =========================================================== edit mode scripts
  private forceShot?: 'goal'
  private forceCard?: 'none' | 'yellow' | 'red'
  private stars = new Set<number>()
  private forcePen?: { taker: number; res?: 'goal' | 'saved' | 'miss'; spot?: PenaltyKick['spot']; dive?: 'L' | 'R' | 'C' }
  private scriptDone = new Set<string>()

  /** Edit Mode temper: a calm or heated game (cards and tempers). */
  private temper(): number { const t = this.ctx.script?.temper; return t === -1 ? 0.5 : t === 1 ? 1.7 : 1 }

  /** The period a match minute belongs to. */
  private periodOf(min: number): Phase { return min <= 45 ? '1H' : min <= 90 ? '2H' : min <= 105 ? 'ET1' : 'ET2' }

  /** Stoppage time must be long enough for events scripted into it. */
  private scriptedAdded(endMin: number): number {
    const ev = this.ctx.script?.events || []
    return ev.filter((e) => e.min === endMin && e.add).reduce((m, e) => Math.max(m, e.add || 0), 0)
  }

  /** Goals a side may still score naturally before reaching a scripted final score (undefined: no target). */
  private goalRoom(side: 0 | 1): number | undefined {
    const sc = this.ctx.script
    if (!sc?.score) return undefined
    const due = (sc.events || []).filter((e) => !this.scriptDone.has(e.id) && e.side === side && (e.kind === 'goal' || (e.kind === 'pen' && (e.pen ?? 'goal') === 'goal'))).length
    return sc.score[side] - this.score[side] - due
  }

  private minutesLeft(): number {
    const end = this.phase === '1H' || this.phase === '2H' ? 90 : 120
    return Math.max(0, end - this.minute) + (this.phase === '1H' ? 0 : 1)
  }

  /** Scripted events due this minute, then any late goal still needed for a scripted score. Returns seconds used. */
  private runScript(): number {
    const sc = this.ctx.script
    if (!sc) return 0
    let used = 0
    const rank = (e: ScriptEvent) => (e.kind === 'yellow' || e.kind === 'red' ? 0 : e.kind === 'pen' ? 1 : 2)
    for (const e of [...(sc.events || [])].sort((a, b) => a.min - b.min || (a.add || 0) - (b.add || 0) || rank(a) - rank(b))) {
      if (this.scriptDone.has(e.id) || this.periodOf(e.min) !== this.phase) continue
      const endMin = this.phase === '1H' ? 45 : this.phase === '2H' ? 90 : this.phase === 'ET1' ? 105 : 120
      const due = e.add ? this.minute === endMin && this.added >= e.add : this.minute >= e.min && (this.minute < endMin || this.added === 0 || e.min < endMin)
      if (!due) continue
      this.scriptDone.add(e.id)
      used += e.kind === 'goal' ? this.scriptedGoal(e) : e.kind === 'pen' ? this.scriptedPen(e) : this.scriptedCard(e)
      if (this.phase === 'FT') return used
    }
    // a scripted final score the natural game hasn't reached: late pressure turns into the goal it needs
    if (sc.score && (this.phase === '2H' || this.phase === 'ET2')) {
      const endMin = this.phase === '2H' ? 90 : 120
      for (const side of [0, 1] as const) {
        const room = this.goalRoom(side)
        if (!room || room <= 0) continue
        const left = Math.max(0, endMin - this.minute) + (this.added ? 0 : 2)
        if (left > room * 3 + 1 && !(this.minute === endMin && this.added)) continue
        if (this.rng.next() > (left <= room ? 1 : 0.45)) continue
        const X = this.sides[side]
        const scorer = this.rng.weighted(X.on.filter((l) => l.pos !== 'GK'), (l) => (l.g === 'ST' ? 5 : l.g === 'W' || l.g === 'AM' ? 3 : l.g === 'CM' ? 1.4 : 0.5) * (1 + (this.fin(l) - this.ref) / 60))
        const creators = X.on.filter((l) => l !== scorer && l.pos !== 'GK')
        const assist = creators.length && this.rng.next() < 0.72 ? this.rng.weighted(creators, (l) => 1 + Math.max(0, this.thru(l) - this.ref) / 12) : undefined
        if (scorer) used += this.scriptedGoal({ id: `late-${this.minute}-${side}`, kind: 'goal', side, player: scorer.p.id, assist: assist?.p.id, min: this.minute })
      }
    }
    return used
  }

  /** A scripted player who isn't on yet comes off the bench (if a change is left). */
  private bringOn(X: Side, id: number): LP | undefined {
    const on = X.on.find((l) => l.p.id === id)
    if (on) return on
    const b = X.bench.find((l) => l.p.id === id && !l.red)
    if (!b || !this.canSub(X.idx)) return undefined
    const grp = RGROUP[b.p.positions[0]]
    const out = [...X.on].filter((l) => l.pos !== 'GK').sort((a, c) => (a.g === grp ? 0 : 1) - (c.g === grp ? 0 : 1) || a.energy - c.energy)[0]
    if (!out || !this.substitute(X.idx, out.p.id, id)) return undefined
    return X.on.find((l) => l.p.id === id)
  }

  /** A goal built from a real move: the assist plays it in, the scorer finishes, every stat is counted as usual. */
  private scriptedGoal(e: ScriptEvent): number {
    const X = this.sides[e.side]
    // AUTO scorer (or a scripted one who can't come on): who usually scores, by position and finishing
    const c = (e.player ? this.bringOn(X, e.player) : undefined) || this.rng.weighted(X.on.filter((l) => l.pos !== 'GK'), (l) => (l.g === 'ST' ? 5 : l.g === 'W' || l.g === 'AM' ? 3 : l.g === 'CM' ? 1.4 : 0.5) * (1 + (this.fin(l) - this.ref) / 60))
    if (!c) return 0
    // AUTO assist: the engine's usual creators (most goals have one, not all)
    const a = e.assist === -1
      ? (() => { const cr = X.on.filter((l) => l !== c && l.pos !== 'GK'); return cr.length && this.rng.next() < 0.75 ? this.rng.weighted(cr, (l) => (l.g === 'AM' || l.g === 'W' ? 2.4 : l.g === 'CM' || l.g === 'ST' || l.g === 'FB' ? 1.4 : 0.6) * (1 + Math.max(0, this.thru(l) - this.ref) / 12)) : undefined })()
      : e.assist ? this.bringOn(X, e.assist) : undefined
    this.pending = null
    this.ps = e.side
    this.counter = false
    const y = 34 + this.rng.next() * 32
    const spot = { x: 86 + this.rng.next() * 6, y }
    if (a && a !== c) {
      const from = { x: 72 + this.rng.next() * 10, y: this.rng.next() < 0.5 ? 18 + this.rng.next() * 20 : 62 + this.rng.next() * 20 }
      a.at = { ...from }
      this.b = { ...from }
      this.car = a
      this.touch(a)
      a.st.passes++
      a.st.passesCompleted++
      this.log('pass', e.side, a, from, spot, true, c)
      this.n++
      this.chain.pass = { from: a, kind: 'pass', n: this.n }
    } else this.chain.pass = undefined
    this.b = { ...spot }
    c.at = { ...spot }
    this.car = c
    this.touch(c)
    this.n++
    this.forceShot = 'goal'
    const dt = this.shoot(c, { pressure: 0.3 }, a ? 'pass' : 'solo')
    this.forceShot = undefined
    return dt + 10
  }

  /** A scripted penalty: a foul in the box on the attack, then the kick with the scripted taker and outcome. */
  private scriptedPen(e: ScriptEvent): number {
    const X = this.sides[e.side], Y = this.sides[1 - e.side]
    const taker = this.bringOn(X, e.player) || this.setPieceTaker(X, 'penalty')
    const def = this.rng.weighted(Y.on.filter((l) => l.pos !== 'GK'), (l) => (l.g === 'CB' || l.g === 'FB' ? 3 : l.g === 'DM' ? 1.5 : 0.4))
    if (!taker || !def) return 0
    const victim = this.rng.next() < 0.5 ? taker : this.rng.weighted(X.on.filter((l) => l.pos !== 'GK'), (l) => (l.g === 'ST' || l.g === 'W' || l.g === 'AM' ? 3 : 1))
    this.pending = null
    this.ps = e.side
    this.b = { x: 90 + this.rng.next() * 4, y: 40 + this.rng.next() * 20 }
    this.car = victim
    victim.at = { ...this.b }
    this.forcePen = { taker: taker.p.id, res: e.pen || 'goal', spot: e.spot, dive: e.dive }
    this.forceCard = e.card
    let dt = this.foul(def, victim, 'tackle', this.b)
    this.forceCard = undefined
    const r = this.pending as Restart | null
    if (r && r.kind === 'pen') {
      r.taker = taker
      this.pending = null
      dt += 25 + this.restart({ ...r, dead: 0 })
    }
    this.forcePen = undefined
    return dt + 6
  }

  /** A scripted booking or sending-off, after a foul on the nearest opponent. */
  private scriptedCard(e: ScriptEvent): number {
    const F = this.sides[e.side], V = this.sides[1 - e.side]
    // AUTO: whoever is likeliest to see a card (defensive players, the combative ones)
    const lp = e.player ? F.on.find((l) => l.p.id === e.player) : this.rng.weighted(F.on.filter((l) => !l.red && (e.kind === 'red' || !l.yellow)), (l) => (l.g === 'CB' || l.g === 'DM' ? 2.4 : l.g === 'FB' || l.g === 'CM' ? 1.6 : l.pos === 'GK' ? 0.2 : 1) * Math.pow(this.e(l, A.aggression) / 65, 1.5))
    if (!lp) return 0
    const victim = this.nearestOutfield(V.on, flip(lp.at)).l || V.on[0]
    F.stats.fouls++
    lp.st.fouls++
    this.rp(lp, RP.foul)
    if (victim) { victim.st.foulsWon++; this.rp(victim, RP.foulWon) }
    if (e.kind === 'red') this.sendOff(lp, false)
    else if (lp.yellow) this.sendOff(lp, true)
    else {
      lp.yellow = true
      lp.st.yellow = true
      this.rp(lp, RP.yellow)
      F.stats.yellows++
      this.ev('yellow', F.idx, line(this.crng, 'yellow', { p: callName(lp.p.name) }), { player: lp.p.id, player2: victim?.p.id })
    }
    this.car = null
    this.pending = { kind: 'fk', side: V.idx, at: { x: 35 + this.rng.next() * 30, y: 15 + this.rng.next() * 70 }, dead: 35 + this.rng.next() * 20, victim }
    return 4
  }

  // =========================================================== positions
  private layout() {
    const X = this.sides[this.ps], Y = this.sides[1 - this.ps]
    const b = this.b
    const r = this.rng
    const bf = flip(b)
    const d = this.dis
    const jit = (this.n & 1) === 0
    for (const l of Y.on) {
      if (jit) {
        l.jx = l.jx * 0.55 + (r.next() - 0.5) * 3.4
        l.jy = l.jy * 0.55 + (r.next() - 0.5) * 3.4
      }
      const sl = Y.slots[l.slot] || Y.slots[0]
      const p = playerSpot(sl.x, sl.y, l.pos, l.rs, Y.shape, false, bf, l.jx, l.jy, l.q1)
      if (d > 0.05 && l.pos !== 'GK') {
        const q = playerSpot(sl.x, sl.y, l.pos, l.rs, Y.shape, true, this.lossBall, l.jx, l.jy, l.q2)
        p.x += (q.x - p.x) * d
        p.y += (q.y - p.y) * d
      }
      l.at.x = 100 - p.x
      l.at.y = 100 - p.y
    }
    // Y's last line (deepest outfield defender), in X's frame: attackers hold their runs on it
    let lx = 0
    for (const l of Y.on) if (l.pos !== 'GK' && l.at.x > lx) lx = l.at.x
    this.lineCache = Math.max(lx, b.x)
    // against a high line runners sit on the shoulder of the last man; against a low block they stay in front of it
    const deep = this.lineCache > 84
    const hold = deep ? this.lineCache - 1.5 : this.lineCache + 0.8
    for (const l of X.on) {
      if (jit) {
        l.jx = l.jx * 0.55 + (r.next() - 0.5) * 4
        l.jy = l.jy * 0.55 + (r.next() - 0.5) * 4
      }
      const sl = X.slots[l.slot] || X.slots[0]
      const p = playerSpot(sl.x, sl.y, l.pos, l.rs, X.shape, true, b, l.jx, l.jy, l.q1)
      // strikers play on the last defender, wide forwards not far off it: the outlet is always there
      if (b.x > 30 && (l.g === 'ST' || (l.g === 'W' && b.x > 45 && l.pos !== 'LM' && l.pos !== 'RM'))) {
        const pin = this.lineCache - (l.pos === 'ST' ? 5 : l.pos === 'CF' ? 10 : 11) - (l.role === 'False 9' ? 8 : 0)
        if (p.x < pin) p.x = pin - r.next() * 3
      }
      if (p.x > hold) p.x = hold - r.next() * (deep ? 4 : 2)
      // inverted wingers drift into the half-space in the final third; midfielders make late runs toward the box
      if (l.g === 'W' && l.inv && b.x > 56 && l !== this.car) p.y += (50 - p.y) * 0.3
      if (b.x > 64 && l !== this.car && (l.g === 'CM' || l.g === 'AM' || l.g === 'DM')) {
        const run = l.g === 'AM' ? 0.5 : l.g === 'DM' ? 0.1 : l.role === 'Box-to-Box' || l.bias.bx > 0 ? 0.62 : l.role === 'Deep-Lying Playmaker' || l.role === 'Holding' ? 0.2 : 0.5
        p.x = Math.min(hold - 1, p.x + (b.x - 64) * run * (1 + X.shape.mentality * 0.15))
      }
      l.at.x = p.x
      l.at.y = p.y
    }
    if (this.car) this.car.at = { x: b.x, y: b.y }
    this.mark(X, Y)
    // presence heat
    if (this.detail && this.n % 3 === 0) {
      for (const l of X.on) l.heat[heatIndex(l.at)] += 0.12
      for (const l of Y.on) l.heat[heatIndex(flip(l.at))] += 0.12
    }
  }

  /** Near their own box defenders stop holding zones and pick up the runners, goal-side. */
  private markUsed: LP[] = []
  private mark(X: Side, Y: Side) {
    const used = this.markUsed
    used.length = 0
    // deepest runners first
    for (let pass = 0; pass < 11; pass++) {
      let a: LP | undefined
      for (const l of X.on) if (l !== this.car && l.pos !== 'GK' && l.at.x > 79 && !used.includes(l) && (!a || l.at.x > a.at.x)) a = l
      if (!a) return
      used.push(a)
      let m: LP | undefined, bd = 256
      for (const l of Y.on) {
        if (l.pos === 'GK' || l.at.x <= 66 || used.includes(l)) continue
        const dx = (l.at.x - a.at.x) * 1.05, dy = (l.at.y - a.at.y) * 0.68
        const d = dx * dx + dy * dy
        if (d < bd) { bd = d; m = l }
      }
      if (!m) continue
      used.push(m)
      const k = clamp(0.46 + (this.e(m, A.defAwareness) - this.ref + 12) / 90, 0.3, 0.9)
      const tx = Math.min(98, a.at.x + 1.3), ty = a.at.y + (50 - a.at.y) * 0.1
      m.at.x += (tx - m.at.x) * k
      m.at.y += (ty - m.at.y) * k
    }
  }

  private nearest(list: LP[], p: Pt, skip?: LP): { l?: LP; d: number } {
    let best: LP | undefined, bd = 1e12
    for (const l of list) {
      if (l === skip) continue
      const dx = (l.at.x - p.x) * 1.05, dy = (l.at.y - p.y) * 0.68
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = l }
    }
    return { l: best, d: Math.sqrt(bd) }
  }

  /**
   * Who closes the carrier down: the nearest opponent, but a goal-side defender counts double — chasing from behind
   * applies far less pressure than a man standing in front of you. Returns the effective distance.
   */
  private presser(Y: Side, b: Pt): { l?: LP; d: number } {
    let best: LP | undefined, bd = 1e12
    for (const l of Y.on) {
      if (l.pos === 'GK') continue
      const dx = (l.at.x - b.x) * 1.05, dy = (l.at.y - b.y) * 0.68
      let d = dx * dx + dy * dy
      if (l.at.x < b.x - 1.5) d *= 2.6 // behind the ball
      // near their own goal the back line steps in; up the pitch the forwards lead the press
      if (b.x > 64) d *= l.g === 'CB' || l.g === 'FB' ? 0.62 : l.g === 'DM' ? 0.8 : l.g === 'ST' || l.g === 'W' ? 1.6 : 1
      else if (b.x < 36) d *= l.g === 'ST' ? 1.25 : l.g === 'W' || l.g === 'AM' ? 1 : l.g === 'CB' ? 1.6 : 1
      else d *= l.g === 'ST' ? 1.35 : l.g === 'W' || l.g === 'AM' ? 1.15 : l.g === 'DM' || l.g === 'FB' ? 0.85 : 1
      if (d < bd) { bd = d; best = l }
    }
    return { l: best, d: Math.sqrt(bd) }
  }

  /** Distance (m) from a point to the closest player of a list. */
  private nearestD(list: LP[], p: Pt): number {
    let bd = 1e12
    for (const l of list) {
      const dx = (l.at.x - p.x) * 1.05, dy = (l.at.y - p.y) * 0.68
      const d = dx * dx + dy * dy
      if (d < bd) bd = d
    }
    return Math.sqrt(bd)
  }

  private nearestOutfield(list: LP[], p: Pt): { l?: LP; d: number } {
    let best: LP | undefined, bd = 1e12
    for (const l of list) {
      if (l.pos === 'GK') continue
      const dx = (l.at.x - p.x) * 1.05, dy = (l.at.y - p.y) * 0.68
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = l }
    }
    return { l: best, d: Math.sqrt(bd) }
  }

  /** Closest opponent to the passing lane a→b (distance in metres to the segment). */
  private laneThreat(list: LP[], a: Pt, b: Pt): { l?: LP; d: number } {
    const ax = a.x * 1.05, ay = a.y * 0.68, bx = b.x * 1.05, by = b.y * 0.68
    const vx = bx - ax, vy = by - ay
    const L2 = vx * vx + vy * vy || 1
    let best: LP | undefined, bd = 1e9
    for (const l of list) {
      if (l.pos === 'GK') continue
      const px = l.at.x * 1.05, py = l.at.y * 0.68
      let t = ((px - ax) * vx + (py - ay) * vy) / L2
      if (t < 0.12 || t > 0.92) continue
      t = clamp(t, 0, 1)
      const d = Math.hypot(ax + vx * t - px, ay + vy * t - py)
      if (d < bd) { bd = d; best = l }
    }
    return { l: best, d: bd }
  }

  // =========================================================== bookkeeping helpers
  private rp(l: LP, v: number) { l.rp += v * GAIN[l.g] }
  private touch(l: LP, w = 1) {
    l.st.touches++
    const S = this.sides[l.side]
    S.stats.touches++
    if (this.detail) l.heat[heatIndex(l.side === this.ps ? this.b : flip(this.b))] += w
    if (l.side === this.ps && inBox(this.b)) { l.st.boxTouches++; S.stats.boxTouches++; this.rp(l, RP.boxTouch) }
  }
  static trace: string[] | null = null
  private log(k: ActKind, s: 0 | 1, p: LP, from: Pt, to: Pt, ok: boolean, q?: LP) {
    if (!this.detail && !MatchSim.trace) return
    if (MatchSim.trace) MatchSim.trace.push(`${this.minute}' ${s} ${k.padEnd(7)} ${p.pos.padEnd(3)} ${from.x.toFixed(0).padStart(3)},${from.y.toFixed(0).padStart(3)} -> ${to.x.toFixed(0).padStart(3)},${to.y.toFixed(0).padStart(3)} ${ok ? 'ok' : 'XX'} ${q ? q.pos : ''}`)
    if (this.acts.length >= 40) return
    const a = toAbs(s, from), b = toAbs(s, to)
    this.acts.push({ k, s, p: p.p.id, q: q?.p.id, x0: r1(a.x), y0: r1(a.y), x1: r1(b.x), y1: r1(b.y), ok, t: Math.round(this.sec * 10) / 10 })
  }
  private note(key: string, w: number, v: Record<string, any>) {
    if (!this.detail) return
    if (!this.notable || w > this.notable.w) this.notable = { key, w, v }
  }
  private tempoF(s: Side) {
    const t = s.tactics
    let f = 1.2 - t.tempo / 250
    if (t.buildUp === 'Short Passing' || t.chanceCreation === 'Possession') f *= 1.06
    if (this.timeWasting(s)) f *= 1.15
    if (this.counter) f *= 0.8
    return f
  }
  private timeWasting(s: Side) {
    const lead = s.idx === 0 ? this.score[0] - this.score[1] : this.score[1] - this.score[0]
    return s.tactics.timeWasting && lead > 0 && this.minute > 60
  }

  // =========================================================== possession changes
  /** Side `to` wins the ball: `l` has it at `at` (in `to`'s frame). */
  private turnover(to: 0 | 1, l: LP, at: Pt, opts: { err?: LP; dis?: number } = {}) {
    const old = this.sides[this.ps]
    if (this.b.x > 66) for (const d of this.sides[to].on) if (d.g === 'CB' || d.g === 'FB' || d.g === 'DM' || d.g === 'GK') this.rp(d, RP.snuffed)
    if (MatchSim.dbg) { dbg('lost' + Math.min(9, Math.floor(this.b.x / 10))); dbg(`s${this.ps}.lost${Math.min(9, Math.floor(this.b.x / 10))}`) }
    this.lossBall = { x: this.b.x, y: this.b.y }
    const oldM = old.ment
    // how exposed is the side that lost it: bodies committed forward, line height, where it was lost
    const expo = clamp(0.1 + (this.b.x - 35) / 90 + oldM * 0.08 + (old.tactics.lineHeight - 50) / 220 + (old.tactics.width - 50) / 400, 0, 0.85)
    this.dis = opts.dis ?? expo
    this.ps = to
    this.b = { x: clamp(at.x, 1, 99), y: clamp(at.y, 1, 99) }
    this.car = l
    const T = this.sides[to].tactics
    const wantsCounter = T.buildUp === 'Counter' ? 1.45 : T.chanceCreation === 'Forward Runs' ? 1.2 : T.chanceCreation === 'Direct Passing' ? 1.1 : T.buildUp === 'Short Passing' ? 0.8 : 1
    this.counter = this.dis * wantsCounter > 0.42 && at.x < 62
    this.chain = { errN: this.n, err: opts.err, oneOnOne: false, solo: false }
  }

  /** Ball loose at `at` (current possessor's frame). Nearest players contest it. */
  private loose(at: Pt, bias = 0) {
    const X = this.sides[this.ps], Y = this.sides[1 - this.ps]
    const a = this.nearest(X.on, at), d = this.nearest(Y.on, at)
    if (!a.l || !d.l) return
    const L = bias + (d.d - a.d) * 0.22 + 0.03 * (this.e(a.l, A.reactions) - this.e(d.l, A.reactions))
    if (this.rng.next() < sigmoid(L)) {
      this.b = { x: clamp(at.x, 1, 99), y: clamp(at.y, 1, 99) }
      this.car = a.l
      a.l.st.recoveries++
      X.stats.recoveries++
      this.rp(a.l, RP.recovery)
      this.chain.pass = undefined
      this.log('rec', X.idx, a.l, at, at, true)
    } else {
      d.l.st.recoveries++
      Y.stats.recoveries++
      this.rp(d.l, RP.recovery)
      this.log('rec', Y.idx, d.l, flip(at), flip(at), true)
      this.turnover(Y.idx, d.l, flip(at))
    }
  }

  // =========================================================== the action
  private act(): number {
    const X = this.sides[this.ps], Y = this.sides[1 - this.ps]
    let c = this.car
    if (!c || !c.on) {
      this.layout()
      c = this.nearest(X.on, this.b).l || X.on[0]
      if (!c) return 5
      this.car = c
    }
    this.n++
    dbg('acts')
    this.layout()
    const b = this.b
    c.at = { x: b.x, y: b.y }
    this.touch(c)
    const tf = this.tempoF(X)
    // the side that lost the ball gets back into shape
    this.dis *= 0.7 + (this.counter ? 0.1 : 0)
    if (this.dis < 0.15) { this.dis = 0; this.counter = false }
    if (c === X.gk) return this.gkDistribute(c, tf)
    const nd = this.presser(Y, b)
    const pr = this.pressure(nd.d, Y, b, nd.l)
    const dwell = (0.35 + (1 - pr) * 0.85) * tf
    // --- pressed off the ball
    if (nd.l && pr > 0.3) {
      const lost = this.pressDuel(c, nd.l, pr)
      if (lost >= 0) return dwell + lost
    }
    // --- shoot?
    if (b.x > 62) {
      const ctx: ShotContext = { pressure: pr * 0.8, counter: this.counter, oneOnOne: this.chain.oneOnOne }
      const xg0 = chanceXg(b, ctx)
      if (xg0 >= 0.012) {
        const inside = inBox(b)
        const crowd = this.crowd(Y, b)
        let a = (inside ? -0.98 : -0.64) + 1.5 * Math.log(xg0 / 0.1) + SHOOT[c.g] * (inside ? 1 : 0.6)
        a += inside ? (this.fin(c) - this.ref) / 70 : (this.lsh(c) - this.ref) / 34
        // patient sides pass up half-chances and work the ball into better ones
        a += c.bias.sh + X.ment * 0.12 + (X.tactics.chanceCreation === 'Possession' ? (xg0 < 0.06 ? -0.2 : 0.15) : X.tactics.chanceCreation === 'Direct Passing' ? 0.1 : 0)
        if (X.state < -0.3) a -= 0.35
        if (c.inv && !inside) a += 0.12
        // nobody wants to shoot into a wall of bodies
        a -= crowd * (inside ? 0.12 : 0.2)
        if (this.chain.oneOnOne) a += 1.2
        if (this.rng.next() < sigmoid(a)) return dwell * 0.6 + this.shoot(c, ctx, this.howNow(c, inside))
      }
    }
    // --- choose what to do
    return dwell + this.decide(c, X, Y, pr, tf)
  }

  private howNow(c: LP, inside: boolean): string {
    if (this.chain.setPiece) return this.chain.setPiece
    if (this.chain.err && this.n - this.chain.errN <= 4) return 'error'
    if (this.counter) return 'counter'
    if (this.chain.oneOnOne) return 'through'
    if (this.chain.solo) return 'solo'
    const pa = this.chain.pass
    if (pa && pa.from !== c && this.n - pa.n <= 2) return pa.kind === 'cutback' ? 'cutback' : pa.kind === 'through' ? 'through' : pa.kind === 'cross' ? 'cross' : 'pass'
    return inside ? 'box' : 'long'
  }

  private pressure(d: number, Y: Side, b: Pt, presser?: LP): number {
    const t = Y.tactics
    const zoneF = b.x < 33
      ? 0.45 + t.pressing / 150 + (t.defApproach === 'High' || t.defApproach === 'Aggressive' ? 0.1 : t.defApproach === 'Deep' ? -0.2 : 0)
      : b.x < 62
        ? 0.75 + t.pressing / 400 + (t.defApproach === 'Aggressive' ? 0.06 : t.defApproach === 'Deep' ? -0.06 : 0)
        : 1 + (t.defApproach === 'Deep' ? 0.08 : 0)
    const pq = presser ? clamp(0.86 + (this.pressS(presser) - this.ref + 2) / 220 + presser.bias.dw * 0.1, 0.7, 1.12) : 1
    return clamp(((9.5 - d) / 8.5) * zoneF * pq, 0, 1)
  }

  /** The nearest opponent closes the carrier down and goes in for the ball. */
  private pressDuel(c: LP, d: LP, pr: number): number {
    const Yt = this.sides[d.side].tactics
    const pCh = 0.155 * pr * (1 + d.bias.dw * 0.3) * (Yt.defApproach === 'Aggressive' ? 1.2 : 1) * (inBox(this.b) ? 1.6 : 1)
    if (this.rng.next() >= pCh) return -1
    const X = this.sides[this.ps], Y = this.sides[1 - this.ps]
    c.st.duels++
    d.st.duels++
    dbg('challenge')
    if (this.rng.next() < this.foulProb(d, c, 1)) return 1 + this.foul(d, c, 'press')
    const L = -0.25 + 0.055 * (this.tackleS(d) * 0.55 + this.pressS(d) * 0.45 - this.secure(c)) + (c.g === 'CB' || c.g === 'GK' ? 0.2 : 0)
    if (this.rng.next() >= sigmoid(L)) {
      // shrugs him off
      c.st.duelsWon++
      X.stats.duelsWon++
      this.rp(c, RP.duelWon)
      this.rp(d, RP.duelLost)
      return -1
    }
    c.st.dispossessed++
    c.st.possLost++
    this.rp(c, RP.dispossessed + RP.duelLost)
    d.st.tackles++
    d.st.duelsWon++
    Y.stats.tackles++
    Y.stats.duelsWon++
    this.rp(d, (d.g === 'CB' || d.g === 'FB' ? RP.tackleDef : RP.tackle) + RP.duelWon)
    this.log('tackle', Y.idx, d, flip(this.b), flip(this.b), true, c)
    if (this.b.x < 40 && Y.tactics.pressing > 55) this.note('pressWin', 2, { p: callName(d.p.name), t: Y.name, o: X.name })
    else this.note('tackleLine', 1.2, { p: callName(d.p.name), q: callName(c.p.name) })
    this.turnover(Y.idx, d, flip(this.b))
    return 1.2
  }

  private foulProb(def: LP, att: LP, k: number, at: Pt = this.b) {
    const Y = this.sides[def.side]
    // defenders stay on their feet in their own box
    if (att.side === this.ps && inBox(at)) k *= 0.16
    const agg = this.e(def, A.aggression), tk = this.tackleS(def)
    return clamp(
      0.26 * k * Math.pow(Math.max(20, agg) / 65, 1.3) * (1 + (this.ref - tk) / 90) * (def.energy < 50 ? 1.2 : 1) * (def.yellow ? 0.6 : 1)
      * (Y.tactics.defApproach === 'Aggressive' ? 1.2 : 1) * (this.ctx.derby ? 1.12 : 1) * (1 + (this.drib(att) - this.ref) / 150) * (1 + def.bias.dw * 0.25),
      0.02, 0.45,
    )
  }

  // =========================================================== decisions
  private decide(c: LP, X: Side, Y: Side, pr: number, tf: number): number {
    const b = this.b
    const t = X.tactics
    const ment = X.ment
    const lineX = this.lineCache
    // pass targets
    const dir = X.dir
    const fp = (b.x < 40 ? 0.024 : b.x < 70 ? 0.032 : 0.022) * clamp(1 + 0.25 * dir, 0.85, 1.4) * (this.counter ? 1.3 : 1) + ment * 0.006
      + c.bias.pf * 0.03 + (X.state < 0 ? X.state * 0.01 : X.state * 0.004)
    const longPref = (t.buildUp === 'Long Ball' ? 2.3 : t.buildUp === 'Counter' ? 1.4 : t.buildUp === 'Short Passing' ? 0.45 : 1) * (this.passL(c) / this.ref)
    const thruPref = (t.chanceCreation === 'Direct Passing' ? 1.5 : t.chanceCreation === 'Forward Runs' ? 1.3 : t.chanceCreation === 'Possession' ? 0.7 : 1) * Math.pow(this.thru(c) / this.ref, 2)
    const gamma = clamp(1 + (this.e(c, A.vision) - this.ref + 10) / 55, 0.8, 1.7)
    // candidate receivers, scored in log space (weights are sharpened by the passer's vision)
    const cR = this.cR, cW = this.cW, cK = this.cK, cT = this.cT, cO = this.cO
    let nc = 0
    let wPassSum = 0
    const lnLong = Math.log((b.x < 50 ? 0.7 : 0.2) * longPref) + 0.35 * dir + 0.6 * Math.max(0, -X.shape.mentality) * (b.x < 50 ? 1 : 0)
    const lnSwitch = Math.log(0.07 * (0.6 + t.width / 100) * (this.passL(c) / this.ref))
    const lnThru = Math.log(0.011 * thruPref)
    const longMin = t.buildUp === 'Long Ball' ? 26 : 34
    const patience = Math.max(0, -dir) * 0.11
    // sides sitting deep don't keep the ball at the back: they look long early
    const sitDeep = Math.max(0, -X.shape.mentality) * (dir > 0.3 ? 1 : 0.4) * (b.x < 50 ? 1 : 0)
    const backF = Math.log((b.x < 45 ? 0.8 : b.x > 62 ? 0.4 : 0.6)) - 0.15 * dir - 0.45 * sitDeep
    const lbShort = t.buildUp === 'Long Ball' && b.x < 45
    for (const r of X.on) {
      if (r === c) continue
      if (r === X.gk && !(b.x < 32 && pr > 0.45)) continue
      const d = metres(b, r.at)
      if (d < 5) continue
      const fwd = r.at.x - b.x
      let kind = 'short'
      let to: Pt = r.at
      let lw: number
      const oppR = this.nearestD(Y.on, r.at)
      // patient circulation pulls the block about: possession sides find a free man in the final third more often
      let open = clamp((oppR - 0.4) / 6 + (r.at.x > 60 ? patience : 0), 0.08, 1)
      if (fwd > 8 && r.at.x > lineX - 7 && d < 50 && r.g !== 'CB' && r.g !== 'DM' && lineX < 94) {
        kind = 'through'
        const behind = 100 - lineX
        to = { x: Math.min(95, lineX + 5 + behind * 0.3 + this.rng.next() * 6), y: clamp(r.at.y + (50 - r.at.y) * 0.2, 8, 92) }
        // a run in behind is on only now and then: needs the runner to go, the passer to see it and space to run into
        open = Math.min(0.7, clamp((this.nearestD(Y.on, to) - 0.5) / 7, 0.05, 1))
        const runner = r.g === 'ST' || r.g === 'W' || r.g === 'AM' ? 0 : -1.2
        const pz = this.pace(r) / this.ref
        lw = lnThru + runner + 2 * Math.log(pz) + Math.log(clamp((88 - lineX) / 12, 0.15, 3)) + r.bias.bx
      } else if (d > 30 && Math.abs(r.at.y - b.y) > 40) {
        kind = 'switch'
        lw = lnSwitch
      } else if (d > longMin && fwd > 12) {
        kind = 'long'
        lw = lnLong + (r.g === 'ST' ? Math.log(Math.max(0.3, 1 + (this.aer(r) - this.ref + 2) / 40)) : 0)
      } else {
        kind = fwd < -4 ? 'back' : fwd > 10 ? 'prog' : 'short'
        const z = (d - 16) / 20
        lw = -z * z
        if (lbShort) lw += kind === 'back' ? -0.8 : -0.6
        if (kind === 'back') lw += backF
      }
      // players high up the pitch are moving to get on the ball, so they show for it more than their marking suggests
      if (r.at.x > 62) lw += Math.log(1 + (r.at.x - 62) / 24)
      lw += Math.log(open) + LN_DEMAND[r.g] + (fwd < -30 ? -30 : fwd > 45 ? 45 : fwd) * fp + r.bias.rw
      if (r.bias.bx && inBox(r.at)) lw += Math.log(Math.max(0.3, 1 + r.bias.bx * 0.5))
      if (r === X.gk) lw -= 1.05
      const w = Math.exp(gamma * lw)
      if (!(w > 0)) continue
      cR[nc] = r; cW[nc] = w; cK[nc] = kind; cT[nc] = to; cO[nc] = open
      nc++
      wPassSum += w
    }
    // other options
    const wide = b.y < 24 || b.y > 76
    const cutZone = b.x >= 86 && (b.y < 32 || b.y > 68)
    let nBox = 0
    for (const r of X.on) if (r !== c && r.at.x > 80 && r.at.y > 22 && r.at.y < 78) nBox++
    const aheadSpace = this.spaceAhead(Y, b)
    const zoneF = b.x < 33 ? (c.g === 'CB' ? 0.35 : 0.6) : 1
    const wCarry = 0.42 * Math.pow(1 - pr, 1.5) * clamp(aheadSpace / 14, 0.1, 1.4) * Math.pow(this.drib(c) / this.ref, 1.5) * zoneF
      * (t.chanceCreation === 'Forward Runs' ? 1.3 : 1) * Math.exp(c.bias.ca) * (this.counter ? 1.6 : 1)
    const wDrib = pr > 0.35 && b.x > 35 && c.g !== 'CB' ? 0.12 * pr * Math.pow(this.drib(c) / this.ref, 4) * Math.exp(c.bias.dr) * (b.x > 62 ? 1.4 : 0.55) * (c.g === 'DM' ? 0.4 : 1) : 0
    // crosses come mostly from near the byline; from deeper out a wide player usually keeps the move going
    const wCross = b.x >= 68 && wide && nBox > 0 ? 0.32 * (0.5 + t.width / 100) * clamp(nBox / 2.3, 0.4, 1.6) * Math.pow(this.crs(c) / this.ref, 2) * Math.exp(c.bias.cr * 0.7) * clamp((b.x - 64) / 18, 0.25, 1.5) * (0.6 + t.playersInBox / 12) : 0
    const wCut = cutZone ? 1.1 * (this.e(c, A.vision) / this.ref) : 0
    const wClear = b.x < 22 && pr > 0.5 && c.g !== 'W' && c.g !== 'ST' ? 1.3 * pr * (1.25 - (this.e(c, A.composure) + 72 - this.ref) / 100) * (t.buildUp === 'Long Ball' ? 1.5 : 1) : 0
    const wPass = nc ? 1 : 0
    const tot = wPass + wCarry + wDrib + wCross + wCut + wClear
    if (MatchSim.dbg) { dbg('zx' + Math.min(9, Math.floor(b.x / 10))); if (b.y < 22 || b.y > 78) dbg('zw' + Math.min(9, Math.floor(b.x / 10))); dbg('pr', pr); dbg('decide'); dbg('w.carry', wCarry / tot); dbg('w.drib', wDrib / tot); dbg('w.cross', wCross / tot); dbg('w.cut', wCut / tot); dbg('w.clear', wClear / tot) }
    let u = this.rng.next() * tot
    if ((u -= wClear) < 0) return this.clear(c, X, Y)
    if ((u -= wCross) < 0) return this.cross(c, X, Y, pr, tf)
    if ((u -= wCut) < 0) {
      const tgt = this.cutbackTarget(c, X, Y)
      if (tgt) return this.pass(c, tgt.r, 'cutback', tgt.to, pr, tf, X, Y)
    }
    if ((u -= wDrib) < 0) {
      const def = this.presser(Y, b).l
      if (def) return this.takeOn(c, def, X, Y, tf)
    }
    if ((u -= wCarry) < 0 || !nc) return this.carry(c, X, aheadSpace, tf)
    let v = this.rng.next() * wPassSum
    let pick = nc - 1
    for (let i = 0; i < nc; i++) { v -= cW[i]; if (v <= 0) { pick = i; break } }
    return this.pass(c, cR[pick], cK[pick], cT[pick], pr, tf, X, Y, cO[pick])
  }

  /** Defenders between the ball and the goal (within a narrowing cone to the posts). */
  private crowd(Y: Side, b: Pt): number {
    let n = 0
    const gx = 100
    for (const l of Y.on) {
      if (l.pos === 'GK' || l.at.x <= b.x + 0.5) continue
      const t = (l.at.x - b.x) / (gx - b.x)
      if (t >= 1) continue
      const cy = b.y + (50 - b.y) * t
      const half = (1 - t) * 6 + t * 5.4 // cone from ~4m wide at the ball to the goal mouth
      if (Math.abs(l.at.y - cy) * 0.68 < half * 0.68 + 1.2) n++
    }
    return Math.min(n, 5)
  }

  private spaceAhead(Y: Side, b: Pt): number {
    let best = 40
    for (const l of Y.on) {
      if (l.at.x <= b.x - 1) continue
      if (Math.abs(l.at.y - b.y) > 22) continue
      const d = metres(l.at, b)
      if (d < best) best = d
    }
    return best
  }

  private cutbackTarget(c: LP, X: Side, Y: Side): { r: LP; to: Pt } | undefined {
    let best: LP | undefined, bw = 0
    for (const r of X.on) {
      if (r === c || r === X.gk) continue
      if (r.at.x < 76) continue
      const to = { x: clamp(r.at.x, 82, 92), y: clamp(r.at.y, 36, 64) }
      const open = clamp((this.nearest(Y.on, to).d - 0.5) / 6, 0.05, 1)
      const w = open * (1 + r.bias.bx) * (this.fin(r) / this.ref)
      if (w > bw) { bw = w; best = r }
    }
    if (!best) return undefined
    return { r: best, to: { x: clamp(best.at.x, 82, 92), y: clamp(best.at.y, 36, 64) } }
  }

  // =========================================================== passing
  private pass(c: LP, r: LP, kind: string, to: Pt, pr: number, tf: number, X: Side, Y: Side, open = -1): number {
    const from = { x: this.b.x, y: this.b.y }
    const d = metres(from, to)
    if (open < 0) open = clamp((this.nearest(Y.on, to).d - 0.4) / 6, 0.08, 1)
    const isLong = kind === 'long' || kind === 'switch'
    const skill = isLong ? this.passL(c) : kind === 'through' ? this.thru(c) : kind === 'cutback' ? this.passS(c) * 0.6 + this.crs(c) * 0.4 : this.passS(c)
    const lane = this.laneThreat(Y.on, from, to)
    const base = kind === 'back' ? 3.1 : kind === 'short' ? 2.75 : kind === 'prog' ? 2.2 : kind === 'long' ? 1.05 : kind === 'switch' ? 1.45 : kind === 'through' ? 0.3 + clamp((82 - this.lineCache) / 18, -0.3, 1.2) : 1.1
    const zoneAdj = to.x < 33 ? 0.4 : to.x < 62 ? 0 : inBox(to) ? -0.66 : -0.32
    let L = base + zoneAdj + 0.045 * (skill - this.ref) - 0.028 * Math.max(0, d - 14) - 1.15 * pr - 1.35 * Math.pow(1 - open, 2)
      + 0.02 * (this.ctrl(r) - this.ref) - (X.tactics.tempo - 50) / 160 + (to.x > 62 && !isLong ? Math.max(0, -X.dir) * 0.14 : 0)
    if (lane.l && lane.d < 3.2) L -= (3.2 - lane.d) * 0.32 * (1 + (this.intc(lane.l) - this.ref) / 45)
    c.st.passes++
    X.stats.passes++
    if (MatchSim.dbg) { dbg(`s${X.idx}.pass.${kind}`); dbg(`s${X.idx}.passL.${kind}`, sigmoid(L)); dbg('pass.' + kind); dbg('passL.' + kind, sigmoid(L)); dbg('open.' + kind, open); dbg('prp.' + kind, pr) }
    if (isLong) { c.st.longBalls++; X.stats.longBalls++ }
    if (kind === 'through') c.st.throughBalls++
    // offside
    if ((kind === 'through' || (kind === 'prog' && to.x > this.lineCache - 2)) && to.x > 55) {
      const trap = Y.tactics.offsideTrap ? 1.7 : 1
      const pOff = (kind === 'through' ? 0.2 : 0.05) * trap * clamp(1 - (this.e(r, A.positioning) - this.ref + 7) / 110, 0.55, 1.35) * clamp(Y.tactics.lineHeight / 50, 0.6, 1.6)
      if (this.rng.next() < pOff) {
        r.st.offsides++
        X.stats.offsides++
        this.rp(r, RP.offside)
        this.log('off', X.idx, c, from, to, false, r)
        if (this.ctx.commentary && this.rng.next() < 0.6) this.ev('offside', X.idx, line(this.crng, 'offside', { p: callName(r.p.name) }), { player: r.p.id })
        const gk = Y.gk || Y.on[0]
        this.pending = { kind: 'fk', side: Y.idx, at: flip(to), dead: 12 + this.rng.next() * 10, taker: gk }
        this.car = null
        return 2.5 * tf
      }
    }
    const dur = (isLong ? 1.3 + d / 18 : 0.6 + d / 15) * tf
    if (this.rng.next() < sigmoid(L)) {
      // arrives; long balls into a marked man become an aerial contest
      if (kind === 'long' && r.pos !== 'GK') {
        const m = this.nearestOutfield(Y.on, to)
        if (m.l && m.d < 5) {
          const duel = this.aerial(r, m.l, -0.15, to)
          if (duel === 'foul') return dur
          if (duel === 'lost') {
            c.st.possLost++
            this.rp(c, RP.longFail)
            this.log('long', X.idx, c, from, to, false, r)
            m.l.st.clearances++
            Y.stats.clearances++
            this.rp(m.l, RP.clearance)
            this.loose({ x: clamp(to.x - 12 - this.rng.next() * 10, 5, 95), y: clamp(to.y + (this.rng.next() - 0.5) * 30, 5, 95) }, -0.35)
            return dur
          }
        }
      }
      c.st.passesCompleted++
      X.passesDone++
      this.rp(c, from.x < 33 ? RP.passOwn : from.x < 66 ? RP.passMid : RP.passFinal)
      if (to.x - from.x >= 14 && to.x > 50) this.rp(c, RP.progPass)
      if (isLong) { c.st.longBallsOk++; this.rp(c, RP.longOk) }
      if (kind === 'through') this.rp(c, RP.throughOk)
      this.log(isLong ? 'long' : kind === 'through' ? 'through' : 'pass', X.idx, c, from, to, true, r)
      this.chain.pass = { from: c, kind, n: this.n }
      this.chain.solo = false
      this.chain.setPiece = undefined
      this.b = { x: clamp(to.x + (kind === 'through' ? 0 : this.rng.next() * 2), 1, 99), y: to.y }
      this.car = r
      this.chain.oneOnOne = false
      if (kind === 'switch') this.note('switch', 1, { p: callName(c.p.name), q: callName(r.p.name), t: X.name })
      if (kind === 'through') return dur + this.runOnto(r, X, Y)
      return dur
    }
    // failed
    c.st.possLost++
    this.rp(c, from.x < 33 ? RP.passFailOwn : from.x < 66 ? RP.passFailMid : RP.passFailFinal)
    if (isLong) this.rp(c, RP.longFail)
    const u = this.rng.next()
    // a loose pass under no real pressure in your own third is a genuine mistake
    const err = from.x < 30 && pr < 0.3 && !isLong && this.rng.next() < 0.35 ? c : undefined
    if (to.x > 97.5 || (u < 0.31 && kind !== 'back')) {
      this.log(isLong ? 'long' : 'pass', X.idx, c, from, to, false, r)
      this.out(to)
      return dur
    }
    // a ball in the air is contested where it lands, not picked off near the passer
    const inLane = lane.l && lane.d < 1.8 && !isLong && kind !== 'through' && this.rng.next() < 0.6
    const near = this.presser(Y, to)
    if (!inLane && near.l && u < 0.4 && r.pos !== 'GK') {
      // reaches him, but he is closed down as it arrives
      const dfd = near.l
      r.st.duels++
      dfd.st.duels++
      dbg('recvDuel')
      if (this.rng.next() < this.foulProb(dfd, r, 0.8, to)) {
        this.log(isLong ? 'long' : 'pass', X.idx, c, from, to, true, r)
        this.b = { ...to }
        this.car = r
        return dur + this.foul(dfd, r, 'tackle')
      }
      dfd.st.tackles++
      dfd.st.duelsWon++
      Y.stats.tackles++
      Y.stats.duelsWon++
      this.rp(dfd, (dfd.g === 'CB' || dfd.g === 'FB' ? RP.tackleDef : RP.tackle) + RP.duelWon)
      this.rp(r, RP.duelLost)
      r.st.possLost++
      this.log(isLong ? 'long' : 'pass', X.idx, c, from, to, false, r)
      this.log('tackle', Y.idx, dfd, flip(to), flip(to), true, r)
      this.turnover(Y.idx, dfd, flip(to), { err })
      return dur
    }
    const it = inLane ? lane.l : near.l
    if (it && (inLane || u < 0.45)) {
      it.st.interceptions++
      Y.stats.interceptions++
      this.rp(it, RP.interception)
      const at = lane.l === it ? it.at : to
      this.log(isLong ? 'long' : 'pass', X.idx, c, from, at, false, r)
      this.log('int', Y.idx, it, flip(at), flip(at), true)
      if (at.x < 45) this.note('interceptLine', 1.1, { p: callName(it.p.name), t: Y.name })
      this.turnover(Y.idx, it, flip(at), { err })
      return dur * 0.8
    }
    this.log(isLong ? 'long' : 'pass', X.idx, c, from, to, false, r)
    this.chain.pass = undefined
    this.loose(to, -0.2)
    if (err && this.ps !== X.idx) this.chain.err = err
    return dur
  }

  /** A through ball has been played: can the runner get there before the covering defender or the keeper? */
  private runOnto(r: LP, X: Side, Y: Side): number {
    const cover = this.nearestOutfield(Y.on, this.b)
    const gk = Y.gk
    // keeper sweeps balls played deep behind a high line
    if (gk && this.b.x > 84) {
      const pSweep = sigmoid(-1.1 + 0.05 * (this.gkSweep(gk) - this.pace(r)) + (gk.role === 'Sweeper Keeper' ? 0.5 : 0) + (this.b.x - 90) * 0.15)
      if (this.rng.next() < pSweep) {
        gk.st.sweeps++
        this.rp(gk, RP.sweep)
        this.log('claim', Y.idx, gk, flip(this.b), flip(this.b), true)
        this.turnover(Y.idx, gk, flip(this.b), { dis: 0.2 })
        return 1.5
      }
    }
    const lead = cover.l ? (cover.d - 2) * 0.28 : 2
    const pWin = cover.l ? sigmoid(0.4 + lead + 0.055 * (this.pace(r) - this.pace(cover.l))) : 0.95
    if (this.rng.next() < pWin) {
      this.chain.oneOnOne = this.b.x > 78 && Math.abs(this.b.y - 50) < 26
      this.counter = this.counter || this.b.x > 70
      return 1.2
    }
    // defender gets back: shoulder-to-shoulder duel for the ball
    if (cover.l) {
      r.st.duels++
      cover.l.st.duels++
      if (this.rng.next() < sigmoid(0.2 + 0.04 * (this.tackleS(cover.l) - this.secure(r)))) {
        cover.l.st.duelsWon++
        cover.l.st.tackles++
        Y.stats.tackles++
        Y.stats.duelsWon++
        this.rp(cover.l, RP.tackleDef + RP.duelWon)
        r.st.possLost++
        this.rp(r, RP.duelLost)
        this.log('tackle', Y.idx, cover.l, flip(this.b), flip(this.b), true, r)
        this.turnover(Y.idx, cover.l, flip(this.b), { dis: 0.1 })
        return 1.5
      }
      r.st.duelsWon++
      X.stats.duelsWon++
      this.rp(r, RP.duelWon)
      this.rp(cover.l, RP.duelLost)
    }
    return 1.5
  }

  private carry(c: LP, X: Side, space: number, tf: number): number {
    const from = { x: this.b.x, y: this.b.y }
    const pace = this.pace(c)
    let dx = Math.min(20, (2.5 + Math.min(space, 30) * 0.42) * (0.7 + pace / 260) * (this.counter ? 1.35 : 1), Math.max(1, space / 1.05 - 1.5))
    if (from.x + dx > 96) dx = Math.max(0, 96 - from.x)
    let y = from.y
    const wideRole = c.g === 'W' || c.g === 'FB'
    if ((c.g === 'AM' && from.x > 60) || (c.inv && from.x > 62)) y += (50 - y) * (c.role === 'Inside Forward' ? 0.32 : 0.24)
    else if (wideRole && from.x > 72) y += (y < 50 ? -1 : 1) * this.rng.next() * 4
    else y += (this.rng.next() - 0.5) * 8
    this.b = { x: from.x + dx, y: clamp(y, 2, 98) }
    if (dx >= 10 && this.b.x > 50) { this.rp(c, RP.carryProg); if (dx >= 15) this.note('progCarry', 1, { p: callName(c.p.name), o: this.sides[1 - X.idx].name, t: X.name }) }
    this.log('carry', X.idx, c, from, this.b, true)
    return (0.5 + metres(from, this.b) / 5.6) * Math.max(0.85, tf)
  }

  private takeOn(c: LP, def: LP, X: Side, Y: Side, tf: number): number {
    const from = { x: this.b.x, y: this.b.y }
    c.st.dribbles++
    c.st.duels++
    def.st.duels++
    X.stats.dribbles++
    const L = -0.25 + 0.05 * (this.drib(c) - this.jockey(def)) + (this.counter ? 0.2 : 0)
    if (this.rng.next() < sigmoid(L)) {
      c.st.dribblesOk++
      c.st.duelsWon++
      X.stats.dribblesOk++
      X.stats.duelsWon++
      this.rp(c, RP.dribbleOk + RP.duelWon)
      def.st.dribbledPast++
      this.rp(def, RP.dribbledPast + RP.duelLost)
      this.b = { x: clamp(from.x + 4 + this.rng.next() * 6, 1, 97), y: clamp(from.y + (this.rng.next() - 0.5) * 8 + (c.role === 'Inside Forward' ? (50 - from.y) * 0.15 : 0), 2, 98) }
      this.dis = Math.min(0.9, this.dis + 0.18)
      this.chain.solo = true
      this.log('drib', X.idx, c, from, this.b, true, def)
      if (from.x > 55) this.note('takeOn', 1.6, { p: callName(c.p.name), q: callName(def.p.name), side: sideWord(X.idx === 0 ? from.y : 100 - from.y) })
      return 2.4 * tf
    }
    this.log('drib', X.idx, c, from, from, false, def)
    if (this.rng.next() < this.foulProb(def, c, 1.15)) return 1.5 + this.foul(def, c, 'tackle')
    c.st.possLost++
    this.rp(c, RP.dribbleFail + RP.duelLost)
    def.st.tackles++
    def.st.duelsWon++
    Y.stats.tackles++
    Y.stats.duelsWon++
    this.rp(def, (def.g === 'CB' || def.g === 'FB' ? RP.tackleDef : RP.tackle) + RP.duelWon)
    this.log('tackle', Y.idx, def, flip(from), flip(from), true, c)
    if (this.rng.next() < 0.1) { this.out({ x: from.x, y: from.y < 50 ? 0 : 100 }, true); return 2 }
    this.turnover(Y.idx, def, flip(from))
    return 2 * tf
  }

  private clear(c: LP, X: Side, Y: Side): number {
    const from = { x: this.b.x, y: this.b.y }
    c.st.clearances++
    X.stats.clearances++
    this.rp(c, inBox(flip(from)) ? RP.clearanceBox : RP.clearance)
    const to = { x: clamp(from.x + 30 + this.rng.next() * 25, 30, 80), y: clamp(from.y + (this.rng.next() - 0.5) * 50, 3, 97) }
    this.log('clear', X.idx, c, from, to, true)
    if (this.rng.next() < 0.22) { this.out(to.y < 50 ? { x: to.x, y: 0 } : { x: to.x, y: 100 }, true); return 3.5 }
    this.chain.pass = undefined
    this.loose(to, -0.5)
    return 4
  }

  /** Ball out of play off the side in possession: throw-in, goal kick (or a corner if it was cleared behind). */
  private out(to: Pt, byDefender = false) {
    const X = this.sides[this.ps], Y = this.sides[1 - this.ps]
    if (to.x >= 97.5) {
      // over the opponent's goal line
      this.pending = { kind: 'goalkick', side: Y.idx, at: { x: 5.5, y: 50 }, dead: 19 + this.rng.next() * 12 }
    } else if (byDefender && to.x <= 2.5) {
      this.pending = { kind: 'goalkick', side: Y.idx, at: { x: 5.5, y: 50 }, dead: 19 + this.rng.next() * 12 }
    } else {
      // throw-in to the other side at that spot
      const at = flip({ x: clamp(to.x, 3, 97), y: to.y < 50 ? 0.5 : 99.5 })
      this.pending = { kind: 'throw', side: Y.idx, at, dead: 11 + this.rng.next() * 9 }
      if (byDefender) this.pending = { kind: 'throw', side: X.idx, at: { x: clamp(to.x, 3, 97), y: to.y < 50 ? 0.5 : 99.5 }, dead: 11 + this.rng.next() * 9 }
    }
    this.car = null
  }

  // =========================================================== aerial duel
  private aerial(att: LP, def: LP, attBias: number, spot: Pt): 'won' | 'lost' | 'foul' {
    const A_ = this.sides[att.side], D = this.sides[def.side]
    att.st.aerials++
    def.st.aerials++
    att.st.duels++
    def.st.duels++
    const won = this.rng.next() < sigmoid(attBias + 0.05 * (this.aer(att) - this.aer(def)))
    const w = won ? att : def, l = won ? def : att
    // a push or an arm in the challenge; the loser is usually the one penalised
    if (this.rng.next() < 0.065 * Math.pow(Math.max(20, this.e(l, A.aggression)) / 65, 1.2) * (l.side !== this.ps && inBox(spot) ? 0.25 : 1)) {
      this.foul(l, w, 'aerial', spot)
      return 'foul'
    }
    w.st.aerialsWon++
    w.st.duelsWon++
    ;(won ? A_ : D).stats.aerialsWon++
    ;(won ? A_ : D).stats.duelsWon++
    this.rp(w, (w.g === 'CB' || w.g === 'FB' ? RP.aerialWonDef : RP.aerialWon) + RP.duelWon * 0.5)
    this.rp(l, RP.aerialLost)
    return won ? 'won' : 'lost'
  }

  // =========================================================== crossing
  private cross(c: LP, X: Side, Y: Side, pr: number, tf: number): number {
    const from = { x: this.b.x, y: this.b.y }
    c.st.crosses++
    X.stats.crosses++
    c.st.passes++
    X.stats.passes++
    const gk = Y.gk
    // charged down at source
    const bl = this.nearestOutfield(Y.on, from)
    if (bl.l && this.rng.next() < 0.08 + 0.3 * pr) {
      c.st.possLost++
      this.rp(c, RP.crossFail)
      bl.l.st.blocks++
      bl.l.st.clearances++
      Y.stats.clearances++
      this.rp(bl.l, RP.clearance)
      this.log('cross', X.idx, c, from, from, false)
      if (this.rng.next() < 0.42) this.cornerFor(X.idx)
      else this.loose({ x: from.x - 6 - this.rng.next() * 10, y: from.y + (50 - from.y) * 0.3 }, -0.1)
      return 2.5 * tf
    }
    const low = from.x > 84 || this.rng.next() < 0.28
    const targets = X.on.filter((l) => l !== c && l !== X.gk && l.at.x > 76 && l.at.y > 20 && l.at.y < 80)
    const tgt = targets.length ? this.rng.weighted(targets, (l) => Math.pow((low ? this.fin(l) : this.aer(l)) / 70, 2) * Math.exp(l.bias.bx) * (l.role === 'Target Forward' && !low ? 1.5 : 1) * (l.g === 'W' ? 1.25 : 1)) : undefined
    const spot = { x: 85.5 + this.rng.next() * 8, y: clamp((tgt ? tgt.at.y : 50) + (this.rng.next() - 0.5) * 14, 33, 67) }
    const dur = 2.6 * tf
    const delivery = sigmoid(-0.15 + 0.042 * (this.crs(c) - this.ref) - 0.6 * pr + (low ? 0.2 : 0))
    if (!tgt || this.rng.next() > delivery) {
      c.st.possLost++
      this.rp(c, RP.crossFail)
      this.log('cross', X.idx, c, from, spot, false)
      const u = this.rng.next()
      if (u < 0.22) { this.out({ x: 99, y: spot.y }); return dur }
      if (gk && u < 0.42) return dur + this.gkClaim_(gk, Y, spot, false)
      const m = this.nearestOutfield(Y.on, spot).l
      if (m) {
        m.st.clearances++
        Y.stats.clearances++
        this.rp(m, RP.clearanceBox)
        this.note('crossCleared', 1, { p: callName(m.p.name), q: callName(c.p.name) })
      }
      if (this.rng.next() < 0.33) this.cornerFor(X.idx)
      else this.loose({ x: 62 + this.rng.next() * 16, y: 25 + this.rng.next() * 50 }, -0.45)
      return dur
    }
    // keeper comes for high balls
    if (gk && !low) {
      const pClaim = 0.1 * Math.exp((this.gkClaim(gk) - this.ref) / 22) * (spot.x > 92 ? 1.7 : 1)
      if (this.rng.next() < pClaim) {
        c.st.possLost++
        this.rp(c, RP.crossFail)
        this.log('cross', X.idx, c, from, spot, false)
        return dur + this.gkClaim_(gk, Y, spot, true)
      }
    }
    const mk = this.nearestOutfield(Y.on, spot).l
    const won = !mk ? true : low
      ? this.rng.next() < sigmoid(0.15 + 0.035 * (this.ctrl(tgt) + this.e(tgt, A.positioning) * 0.3 - this.intc(mk) - this.e(mk, A.positioning) * 0.3) / 1.3)
      : this.aerial(tgt, mk, -0.3, spot)
    if (won === 'foul') return dur
    if (won === true || won === 'won') {
      c.st.crossesOk++
      X.stats.crossesOk++
      c.st.passesCompleted++
      this.rp(c, RP.crossOk)
      this.log('cross', X.idx, c, from, spot, true, tgt)
      this.chain.pass = { from: c, kind: 'cross', n: this.n }
      this.b = spot
      this.car = tgt
      tgt.at = { ...spot }
      this.touch(tgt)
      // not every cross that is won turns into an attempt: knock-downs, lay-offs and heavy touches
      if (this.rng.next() > (low ? 0.62 : 0.66)) {
        if (low) return dur
        this.loose({ x: spot.x - 3 - this.rng.next() * 8, y: spot.y + (this.rng.next() - 0.5) * 16 }, -0.1)
        return dur
      }
      this.lastHeader = !low
      const res = this.shoot(tgt, { header: !low, volley: low && this.rng.next() < 0.35, pressure: 0.5, setPiece: !!this.chain.setPiece }, this.chain.setPiece === 'freekick' ? 'cross' : this.chain.setPiece || 'cross')
      this.lastHeader = false
      return dur + res
    }
    c.st.possLost++
    this.rp(c, RP.crossFail)
    this.log('cross', X.idx, c, from, spot, false, tgt)
    if (mk) {
      mk.st.clearances++
      Y.stats.clearances++
      this.rp(mk, RP.clearanceBox)
      this.note('crossCleared', 1, { p: callName(mk.p.name), q: callName(c.p.name) })
      // the rare own goal from a defender under pressure at the near post
      if (this.rng.next() < 0.006) return dur + this.ownGoal(mk, X, Y)
    }
    if (this.rng.next() < 0.36) this.cornerFor(X.idx)
    else this.loose({ x: 64 + this.rng.next() * 14, y: 22 + this.rng.next() * 56 }, -0.4)
    return dur
  }

  private gkClaim_(gk: LP, Y: Side, spot: Pt, clean: boolean): number {
    const punch = !clean || this.rng.next() < 0.25
    if (punch) {
      gk.st.punches++
      this.rp(gk, RP.punch)
      this.log('claim', Y.idx, gk, flip(spot), flip(spot), true)
      this.loose({ x: 66 + this.rng.next() * 12, y: 25 + this.rng.next() * 50 }, -0.3)
      return 1.5
    }
    gk.st.claims++
    this.rp(gk, RP.claim)
    this.log('claim', Y.idx, gk, flip(spot), flip(spot), true)
    this.turnover(Y.idx, gk, flip(spot), { dis: 0.15 })
    this.pending = { kind: 'gkhold', side: Y.idx, at: { x: 8, y: 50 }, dead: 5 + this.rng.next() * 6, taker: gk }
    return 1.5
  }

  // =========================================================== keeper in possession
  private gkDistribute(gk: LP, tf: number): number {
    const X = this.sides[gk.side], Y = this.sides[1 - gk.side]
    const t = X.tactics
    const oppHigh = Y.tactics.pressing / 100 * (Y.tactics.defApproach === 'High' || Y.tactics.defApproach === 'Aggressive' ? 1.3 : Y.tactics.defApproach === 'Deep' ? 0.6 : 1)
    const pShort = clamp((t.buildUp === 'Short Passing' ? 0.85 : t.buildUp === 'Long Ball' ? 0.18 : t.buildUp === 'Counter' ? 0.45 : 0.6) - oppHigh * 0.22 + (gk.role === 'Ball-Playing Keeper' || gk.role === 'Sweeper Keeper' ? 0.12 : 0), 0.08, 0.95)
    const outfield = X.on.filter((l) => l !== gk)
    if (!outfield.length) return 3
    if (this.rng.next() < pShort) {
      const r = this.rng.weighted(outfield, (l) => (l.g === 'CB' ? 3 : l.g === 'FB' ? 2 : l.g === 'DM' ? 1.4 : 0.1) * clamp((this.nearest(Y.on, l.at).d - 1) / 8, 0.05, 1))
      const skill = this.gkDist(gk)
      const nd = this.nearest(Y.on, r.at).d
      const p = sigmoid(2.6 + 0.04 * (skill - this.ref + 2) - 1.2 * clamp((6 - nd) / 6, 0, 1) * oppHigh)
      gk.st.passes++
      X.stats.passes++
      const from = { ...this.b }
      if (this.rng.next() < p) {
        gk.st.passesCompleted++
        X.passesDone++
        this.rp(gk, RP.gkDistOk)
        this.log('pass', X.idx, gk, from, r.at, true, r)
        this.b = { ...r.at }
        this.car = r
        this.chain.pass = undefined
        return (2 + metres(from, r.at) / 14) * tf
      }
      gk.st.possLost++
      this.rp(gk, RP.gkDistFail)
      const it = this.nearestOutfield(Y.on, r.at).l
      this.log('pass', X.idx, gk, from, r.at, false, r)
      if (it) {
        it.st.interceptions++
        Y.stats.interceptions++
        this.rp(it, RP.interception)
        this.turnover(Y.idx, it, flip(r.at), { err: gk, dis: 0.35 })
      }
      return 2.5 * tf
    }
    // long kick toward the forwards
    const tgts = outfield.filter((l) => l.g === 'ST' || l.g === 'W' || l.g === 'AM' || l.g === 'CM')
    const r = tgts.length ? this.rng.weighted(tgts, (l) => (l.g === 'ST' ? 2 : 1) * Math.pow(this.aer(l) / 70, 2)) : outfield[0]
    const to = { x: clamp(r.at.x + this.rng.next() * 8, 45, 75), y: clamp(r.at.y + (this.rng.next() - 0.5) * 16, 10, 90) }
    gk.st.passes++
    gk.st.longBalls++
    X.stats.passes++
    X.stats.longBalls++
    const from = { ...this.b }
    const m = this.nearestOutfield(Y.on, to).l
    const acc = sigmoid(0.9 + 0.035 * (this.e(gk, A.gkKicking) - this.ref + 2))
    if (this.rng.next() > acc) {
      gk.st.possLost++
      this.rp(gk, RP.gkDistFail * 0.5)
      this.log('long', X.idx, gk, from, to, false, r)
      if (this.rng.next() < 0.4) { this.out({ x: to.x, y: to.y < 50 ? 0 : 100 }); return 5 }
      if (m) this.turnover(Y.idx, m, flip(to), { dis: 0.05 })
      return 5
    }
    const duel = m ? this.aerial(r, m, -0.2, to) : 'won'
    if (duel === 'foul') return 5
    if (duel === 'won') {
      gk.st.passesCompleted++
      gk.st.longBallsOk++
      X.passesDone++
      this.rp(gk, RP.gkDistOk)
      this.log('long', X.idx, gk, from, to, true, r)
      // flick-ons and knock-downs land near a team-mate more often than not
      this.b = to
      this.car = r
      this.chain.pass = { from: gk, kind: 'long', n: this.n }
      if (this.rng.next() < 0.45) this.loose({ x: to.x + 6, y: to.y }, 0.1)
      return 5
    }
    gk.st.possLost++
    this.log('long', X.idx, gk, from, to, false, r)
    if (m) { m.st.clearances++; Y.stats.clearances++ }
    this.loose({ x: to.x - 8 - this.rng.next() * 10, y: to.y }, -0.1)
    return 5
  }

  // =========================================================== shooting
  private shoot(c: LP, ctx: ShotContext, how: string): number {
    const X = this.sides[c.side], Y = this.sides[1 - c.side]
    const gk = Y.gk
    const b = { x: this.b.x, y: this.b.y }
    const crowd = ctx.header || ctx.oneOnOne ? 0 : this.crowd(Y, b)
    // chance quality counts the bodies between the ball and the goal, like modern xG models
    const xg = chanceXg(b, ctx) * (1 - 0.055 * crowd)
    const inside = inBox(b)
    if (MatchSim.dbg) { dbg(`gshot.${c.g}.${how}`); dbg('crowd', this.crowd(Y, b)); dbg('shot.' + how); dbg('xg.' + how, xg); dbg(`s${X.idx}.shot.${how}`); dbg(`s${X.idx}.xg.${how}`, xg); dbg(`s${X.idx}.shotx${Math.floor(b.x / 5) * 5}`) }
    c.st.shots++
    c.st.xg += xg
    X.stats.shots++
    X.stats.xg += xg
    X.threat += xg * 2.2
    const big = xg >= 0.3
    if (big) X.stats.bigChances++
    const pa = this.chain.pass
    const passer = pa && pa.from !== c && this.n - pa.n <= 3 && pa.from.side === c.side ? pa.from : undefined
    if (passer) {
      passer.st.keyPasses++
      passer.st.xa += xg
      this.rp(passer, RP.keyPass + RP.xaMul * xg)
      if (big) { passer.st.bcc++; this.rp(passer, RP.bigChanceCreated) }
    }
    let errBy: LP | undefined
    if (this.chain.err && this.n - this.chain.errN <= 5 && this.chain.err.side !== c.side) {
      errBy = this.chain.err
      errBy.st.errors++
      this.rp(errBy, RP.errorShot)
      this.chain.err = undefined
    }
    let sk = ctx.header ? this.hfin(c) : ctx.volley ? this.vol(c) : inside ? this.fin(c) : this.lsh(c)
    const weak = !ctx.header && this.rng.next() < 0.26
    if (weak) sk -= (5 - clamp(c.p.weakFoot, 1, 5)) * 2.8
    // the shot as it will be drawn: which foot (or head), where it went (visual rng: the result is already decided)
    const body: ShotInfo['body'] = ctx.header ? 'H' : (c.p.foot === 'L') !== weak ? 'L' : 'R'
    const shotInfo = (res: ShotInfo['res'], xgotV?: number, by?: LP): ShotInfo => this.placeShot(X, res, { header: !!ctx.header, inside, body, weak, xgot: xgotV, by, gk })
    if (big) sk += (this.e(c, A.composure) - this.ref + 2) * 0.15
    if (ctx.oneOnOne) sk += c.pb.chip * 0.7
    const pr = ctx.pressure || 0
    const pBlock = ctx.header ? 0.04 : ctx.oneOnOne ? 0.03 : ctx.setPiece && how === 'freekick' ? 0.24 : clamp((inside ? 0.06 + 0.2 * pr : 0.12 + 0.22 * pr) + 0.085 * crowd, 0, 0.62)
    const loc: [number, number] = (() => { const a = toAbs(X.idx, b); return [r1(a.x), r1(a.y)] as [number, number] })()
    const v = { p: callName(c.p.name), a: passer ? callName(passer.p.name) : '', t: X.name, o: Y.name, gk: gk ? callName(gk.p.name) : 'the keeper', venue: this.ctx.venue }
    const intro = this.ctx.commentary ? this.intro(how, !!passer, !!ctx.header, v) : ''
    const blocker = this.nearestOutfield(Y.on, b).l
    const goalPt = { x: 100, y: 50 }
    const force = this.forceShot
    if (!force && blocker && this.rng.next() < pBlock * clamp(1 + (this.e(blocker, A.defAwareness) - this.ref) / 80 + blocker.pb.block / 20, 0.6, 1.4)) {
      blocker.st.blocks++
      Y.stats.blocks++
      this.rp(blocker, RP.block)
      this.rp(c, RP.blocked)
      const si = this.detail ? shotInfo('blocked', undefined, blocker) : undefined
      this.log('shot', X.idx, c, b, blocker.at, false)
      this.log('block', Y.idx, blocker, flip(blocker.at), flip(blocker.at), true)
      this.ev('chance', X.idx, `${intro} ${line(this.crng, 'blocked', v)}`.trim(), { player: c.p.id, player2: passer?.p.id, xg: r2(xg), loc, how, shot: si })
      const u = this.rng.next()
      if (u < 0.42) this.cornerFor(X.idx)
      else this.loose({ x: b.x - 6 - this.rng.next() * 12, y: b.y + (this.rng.next() - 0.5) * 20 }, -0.15)
      return 2
    }
    // bodies in the way also narrow the target for shots that get through
    const xgNb = clamp((xg / (1 - pBlock)) * (1 - 0.015 * crowd), 0.005, 0.96)
    const gq = gk ? this.gkStop(gk) : 20
    const Lg = logit(xgNb) + 0.013 * (sk - this.ref) - 0.02 * (gq - this.ref - 4)
    let pGoal = sigmoid(Lg)
    // Edit Mode feel: a tight or open game, and late drama
    const scr = this.ctx.script
    if (scr?.goals && !force) pGoal = clamp(pGoal * (scr.goals === -1 ? 0.6 : scr.goals === 1 ? 1.35 : 1.75), 0, 0.97)
    if (scr?.late && !force && (this.phase === '2H' || this.phase === 'ET2') && this.minute >= 80) pGoal = clamp(pGoal * 2.1, 0, 0.97)
    // Edit Mode final score: no goals past the target, and more clinical finishing while a side is short of it
    const room = force ? undefined : this.goalRoom(X.idx)
    if (room !== undefined) pGoal = room <= 0 ? 0 : 1 - Math.pow(1 - pGoal, clamp(room / Math.max(0.25, this.minutesLeft() * 0.016), 1, 8))
    const pAvg = sigmoid(logit(xgNb) + 0.013 * (sk - this.ref))
    const pOn = clamp(0.26 + xgNb * 0.8 + 0.011 * (sk - this.ref), Math.max(0.16, pAvg + 0.02), 0.97)
    const xgot = clamp(pAvg / pOn, 0.02, 0.98)
    const u = force === 'goal' ? -1 : this.rng.next()
    if (u < pGoal) {
      X.stats.sot++
      c.st.sot++
      c.st.xgot += xgot
      X.stats.xgot += xgot
      if (gk) gk.st.xgotFaced += xgot
      this.rp(c, RP.sot)
      if (!force && (how === 'through' || how === 'counter') && this.rng.next() < 0.035) {
        this.log('shot', X.idx, c, b, goalPt, true)
        c.st.offsides++
        X.stats.offsides++
        this.ev('var', X.idx, `${intro} ${line(this.crng, 'offsideGoal', v)}`.trim(), { player: c.p.id, xg: r2(xg), loc, how })
        this.pending = { kind: 'fk', side: Y.idx, at: { x: 12, y: 50 }, dead: 60 + this.rng.next() * 40, taker: gk }
        this.car = null
        return 2
      }
      // one placement for everything: the shot map, the goal frame and the replay all show this same ball
      const si = this.detail ? shotInfo('goal', xgot) : undefined
      this.log('goal', X.idx, c, b, this.shotEnd(X, si, goalPt), true)
      this.goal(c, passer, how, xg, xgot, intro, loc, errBy, si)
      return 2
    }
    if (u < pOn) {
      X.stats.sot++
      c.st.sot++
      c.st.xgot += xgot
      X.stats.xgot += xgot
      Y.stats.saves++
      this.rp(c, RP.sot)
      if (gk) {
        gk.st.saves++
        gk.st.xgotFaced += xgot
        this.rp(gk, RP.save + RP.saveXgot * xgot)
      }
      if (big) { c.st.bcm++; X.stats.bigChancesMissed++; this.rp(c, RP.bigChanceMissed * 0.6) }
      const si = this.detail ? shotInfo('saved', xgot) : undefined
      const end = this.shotEnd(X, si, { x: 99, y: 50 })
      this.log('shot', X.idx, c, b, { x: 99, y: end.y }, false)
      if (gk) this.log('save', Y.idx, gk, flip({ x: 98.5, y: end.y }), flip({ x: 98.5, y: end.y }), true)
      const key = xgot > 0.45 ? 'saveGreat' : xgot > 0.2 ? 'saveGood' : 'saveEasy'
      this.ev('save', X.idx, `${intro} ${line(this.crng, key, v)}`.trim(), { player: c.p.id, player2: passer?.p.id, xg: r2(xg), big, loc, how, shot: si })
      X.threat += 0.15
      // held, or parried
      const hold = gk ? sigmoid(0.4 + 0.045 * (this.e(gk, A.gkHandling) - this.ref + 2) - xgot * 1.6 + gk.pb.deflect * 0.05) : 0.5
      if (gk && this.rng.next() < hold) {
        this.turnover(Y.idx, gk, { x: 5, y: 50 }, { dis: 0.1 })
        this.pending = { kind: 'gkhold', side: Y.idx, at: { x: 6, y: 50 }, dead: 5 + this.rng.next() * 7, taker: gk }
        return 2
      }
      const r = this.rng.next()
      if (r < 0.4) this.cornerFor(X.idx)
      else if (r < 0.62) {
        // rebound in the six-yard box
        const spot = { x: 92 + this.rng.next() * 4, y: 38 + this.rng.next() * 24 }
        const a = this.nearestOutfield(X.on, spot).l, d = this.nearestOutfield(Y.on, spot).l
        if (a && d && this.rng.next() < sigmoid(-0.4 + 0.04 * (this.e(a, A.reactions) - this.e(d, A.reactions)) + (a.role === 'Poacher' ? 0.4 : 0))) {
          this.b = spot
          this.car = a
          a.at = { ...spot }
          this.touch(a)
          this.chain.pass = undefined
          return 2 + this.shoot(a, { rebound: true, pressure: 0.55 }, 'rebound')
        }
        if (d) { d.st.clearances++; Y.stats.clearances++; this.rp(d, RP.clearanceBox) }
        this.loose({ x: 66 + this.rng.next() * 12, y: 25 + this.rng.next() * 50 }, -0.4)
      } else {
        const d = this.nearestOutfield(Y.on, b).l
        if (d) { d.st.clearances++; Y.stats.clearances++; this.rp(d, RP.clearanceBox); this.loose({ x: 60 + this.rng.next() * 15, y: 20 + this.rng.next() * 60 }, -0.5) }
        else this.out({ x: 99, y: 50 })
      }
      return 2
    }
    // off target
    const wood = this.rng.next() < 0.075
    this.rp(c, big ? RP.offTargetBig : RP.offTarget)
    if (big) { c.st.bcm++; X.stats.bigChancesMissed++; this.rp(c, RP.bigChanceMissed) }
    const si = this.detail ? shotInfo(wood ? 'post' : 'off') : undefined
    this.log('shot', X.idx, c, b, this.shotEnd(X, si, { x: 100, y: 38 }), false)
    this.ev(wood ? 'woodwork' : 'miss', X.idx, `${intro} ${line(this.crng, wood ? 'woodwork' : big ? 'missBig' : 'miss', v)}`.trim(), { player: c.p.id, player2: passer?.p.id, xg: r2(xg), big, loc, how, shot: si })
    X.threat += wood ? 0.3 : 0.05
    if (wood && this.rng.next() < 0.4) this.loose({ x: 88 + this.rng.next() * 6, y: 35 + this.rng.next() * 30 }, 0)
    else this.pending = { kind: 'goalkick', side: Y.idx, at: { x: 5.5, y: 50 }, dead: 19 + this.rng.next() * 12 }
    if (!this.pending) return 2
    this.car = null
    return 2
  }

  /**
   * Where a shot went, decided once (visual rng: the outcome is already settled) and used by everything that shows
   * it: the shot map and its stats, the goal frame, and the replay's action log (see shotEnd).
   */
  private placeShot(X: Side, res: ShotInfo['res'], o: { header?: boolean; inside: boolean; body: ShotInfo['body']; weak?: boolean; xgot?: number; by?: LP; at?: Pt; gk?: LP }): ShotInfo {
    const vr = this.vrng
    let gy: number, gz: number
    if (res === 'goal') { const corner = vr.next() < 0.35 + (o.xgot || 0) * 0.4; gy = (vr.next() < 0.5 ? -1 : 1) * (corner ? 0.62 + vr.next() * 0.33 : vr.next() * 0.7); gz = o.header ? 0.2 + vr.next() * 0.55 : vr.next() < 0.55 ? vr.next() * 0.35 : 0.35 + vr.next() * 0.6 }
    else if (res === 'saved') { gy = (vr.next() - 0.5) * 1.3; gz = vr.next() * 0.8 }
    else if (res === 'post') { const bar = vr.next() < 0.3; gy = bar ? (vr.next() - 0.5) * 1.6 : (vr.next() < 0.5 ? -1 : 1); gz = bar ? 1 : vr.next() * 0.9 }
    else if (res === 'off') { const over = vr.next() < (o.inside ? 0.45 : 0.55); gy = over ? (vr.next() - 0.5) * 1.8 : (vr.next() < 0.5 ? -1 : 1) * (1.08 + vr.next() * 0.9); gz = over ? 1.05 + vr.next() * 0.5 : vr.next() * 0.7 }
    else { gy = (vr.next() - 0.5) * 1.2; gz = vr.next() * 0.4 }
    const blockedAt = res === 'blocked' ? (o.by ? o.by.at : o.at) : undefined
    const e = toAbs(X.idx, blockedAt || { x: 100, y: 50 + clamp(gy, -2.2, 2.2) * 5.4 })
    return { end: [r1(e.x), r1(e.y)], gy: Math.round(gy * 100) / 100, gz: Math.round(gz * 100) / 100, body: o.body, weak: o.weak || undefined, xgot: o.xgot != null ? r2(o.xgot) : undefined, res, gk: o.gk && res !== 'blocked' && res !== 'off' ? o.gk.p.id : undefined, by: o.by?.p.id }
  }
  /** The end of a shot in the shooting side's frame, for the action log. */
  private shotEnd(X: Side, s: ShotInfo | undefined, fallback: Pt): Pt {
    if (!s) return fallback
    if (s.res === 'blocked') { const a = toAbs(X.idx, { x: s.end[0], y: s.end[1] }); return { x: a.x, y: a.y } }
    return { x: 100, y: 50 + clamp(s.gy, -2.2, 2.2) * 5.4 }
  }

  private intro(how: string, assisted: boolean, header: boolean, v: Record<string, any>): string {
    const key = how === 'through' ? (assisted ? 'chanceThrough' : 'chanceOneOnOne')
      : how === 'cross' ? (header ? 'chanceCross' : 'chanceLowCross')
      : how === 'cutback' ? 'chanceCutback'
      : how === 'corner' ? 'chanceCorner'
      : how === 'freekick' ? 'chanceFreekick'
      : how === 'counter' ? 'chanceCounter'
      : how === 'error' ? 'chanceError'
      : how === 'rebound' ? 'chanceRebound'
      : how === 'solo' ? 'chanceDribble'
      : how === 'long' ? 'chanceLong'
      : how === 'pass' && assisted ? 'chancePass'
      : 'chanceBox'
    return line(this.crng, key, v)
  }

  /** The move behind a goal: the scoring side's last possession (and how they won it), from the action log. */
  private goalChain(side: 0 | 1): ReplayStep[] | undefined {
    if (!this.detail) return undefined
    const recent: Act[] = []
    for (const f of this.timeline.slice(-2)) if (f.acts) recent.push(...f.acts)
    recent.push(...this.acts)
    if (!recent.length) return undefined
    // walk back to where this possession began
    let i = recent.length - 1
    while (i > 0 && recent[i - 1].s === side) i--
    const start = Math.max(0, i - 1, recent.length - 14)
    return recent.slice(start).map((a) => ({ k: a.k, s: a.s, p: a.p, q: a.q, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, ok: a.ok }))
  }

  private goal(c: LP, passer: LP | undefined, how: string, xg: number, xgot: number, intro: string, loc: [number, number], errBy?: LP, shot?: ShotInfo) {
    const X = this.sides[c.side], Y = this.sides[1 - c.side]
    const gk = Y.gk
    if (MatchSim.dbg) { dbg(`goal.${c.g}.${how}`); dbg(`goal.${c.g}`) }
    this.score[X.idx]++
    X.stats.sot = X.stats.sot // already counted
    c.st.goals++
    this.rp(c, RP.goal * GOAL_W[c.g] + RP.goalXgMul * (0.5 - Math.min(xg, 0.8)))
    if (passer) { passer.st.assists++; this.rp(passer, RP.assist * (passer.g === 'CB' || passer.g === 'FB' ? 1.1 : 1)) }
    if (errBy) this.rp(errBy, RP.errorGoal - RP.errorShot)
    this.conceded(Y, xgot)
    X.threat += 1.2
    const lead = this.score[X.idx] - this.score[Y.idx]
    let text = ''
    if (this.ctx.commentary) {
      const v = { p: callName(c.p.name), a: passer ? callName(passer.p.name) : '', t: X.name, gk: gk ? callName(gk.p.name) : '', venue: this.ctx.venue }
      const key = how === 'freekick' ? 'goalFK' : how === 'cross' || how === 'corner' ? (this.lastHeader ? 'goalHeader' : 'goalTap') : how === 'long' ? 'goalLong'
        : how === 'solo' ? (passer ? 'goal' : 'goalSolo') : how === 'counter' ? 'goalCounter' : how === 'cutback' || how === 'rebound' ? 'goalTap' : 'goal'
      const ctxLine = lead === 0 ? line(this.crng, 'equaliser', { t: X.name }) : lead === 1 ? line(this.crng, 'lead', { t: X.name }) : ''
      const late = this.minute >= 85 && Math.abs(lead) <= 1 ? line(this.crng, 'late', v) : ''
      const hat = c.st.goals === 3 ? line(this.crng, 'hattrick', v) : c.st.goals === 2 && this.crng.next() < 0.5 ? line(this.crng, 'brace', v) : ''
      text = [intro, line(this.crng, key, v), ctxLine, late, hat].filter(Boolean).join(' ')
    }
    this.push({ min: this.minute, add: this.added || undefined, type: 'goal', side: X.idx, player: c.p.id, player2: passer?.p.id, xg: r2(xg), big: true, text, loc, how, shot, chain: this.goalChain(X.idx) })
    if (passer && this.ctx.commentary) this.push({ min: this.minute, add: this.added || undefined, type: 'info', side: X.idx, player: passer.p.id, text: line(this.crng, 'assist', { a: callName(passer.p.name) }) })
    this.afterGoal(Y.idx)
  }

  private lastHeader = false

  private conceded(Y: Side, xgot: number) {
    const gk = Y.gk
    if (gk) {
      gk.st.conceded++
      this.rp(gk, RP.concededGk + RP.concededGkXgot * (1 - xgot))
    }
    for (const l of Y.on) {
      l.ga++
      if (l.g === 'CB' || l.g === 'FB') this.rp(l, RP.concededDef)
      else if (l.g === 'DM') this.rp(l, RP.concededDm)
    }
    for (const s of this.sides) for (const l of s.on) l.gd += s === Y ? -1 : 1
  }

  private afterGoal(concedingSide: 0 | 1) {
    this.car = null
    this.counter = false
    this.dis = 0
    this.pending = { kind: 'kickoff', side: concedingSide, at: { x: 50, y: 50 }, dead: 55 + this.rng.next() * 30 }
  }

  private ownGoal(d: LP, X: Side, Y: Side): number {
    const room = this.goalRoom(X.idx)
    if (room !== undefined && room <= 0) { this.cornerFor(X.idx); return 2 }
    this.score[X.idx]++
    d.st.ownGoals++
    this.rp(d, RP.ownGoal)
    this.conceded(Y, 0.6)
    X.threat += 1
    this.log('goal', Y.idx, d, flip(this.b), { x: 0, y: 50 }, false)
    this.push({ min: this.minute, add: this.added || undefined, type: 'owngoal', side: X.idx, player: d.p.id, big: true, text: this.ctx.commentary ? line(this.crng, 'goalOwn', { p: callName(d.p.name), t: Y.name }) : '', how: 'own' })
    this.afterGoal(Y.idx)
    return 2
  }

  // =========================================================== set pieces
  private cornerFor(side: 0 | 1) {
    const X = this.sides[side]
    X.stats.corners++
    X.threat += 0.15
    const top = this.rng.next() < 0.5
    this.pending = { kind: 'corner', side, at: { x: 99.5, y: top ? 0.5 : 99.5 }, dead: 27 + this.rng.next() * 15 }
    this.car = null
  }

  private setPieceTaker(s: Side, kind: 'corner' | 'freekick' | 'penalty', left = true): LP | undefined {
    const sheet = s.input.sheet
    const id = kind === 'penalty' ? sheet.penalties : kind === 'freekick' ? sheet.freeKicks : left ? sheet.cornersL : sheet.cornersR
    const lp = s.on.find((l) => l.p.id === id)
    if (lp) return lp
    const key = kind === 'penalty' ? A.penalties : kind === 'freekick' ? A.fkAccuracy : A.crossing
    return [...s.on].filter((l) => l.pos !== 'GK').sort((a, b) => b.p.attrs[key] - a.p.attrs[key])[0]
  }

  private restart(r: Restart): number {
    const X = this.sides[r.side], Y = this.sides[1 - r.side]
    this.ps = r.side
    this.b = { ...r.at }
    this.dis = 0
    this.counter = false
    this.chain = { errN: 0, oneOnOne: false, solo: false }
    const waste = this.timeWasting(X) ? 1.5 : 1
    const dead = r.dead * waste
    this.layout()
    switch (r.kind) {
      case 'kickoff': {
        const c = X.on.filter((l) => l.g === 'ST' || l.g === 'AM' || l.g === 'CM').sort((a, b) => metres(a.at, r.at) - metres(b.at, r.at))[0] || X.on[0]
        this.car = c
        return dead
      }
      case 'goalkick':
        X.stats.goalKicks++
        this.car = X.gk || X.on[0]
        return dead
      case 'gkhold':
        this.car = r.taker && r.taker.on ? r.taker : X.gk || X.on[0]
        return dead
      case 'throw': {
        X.stats.throwIns++
        const c = this.rng.weighted(X.on.filter((l) => l.pos !== 'GK'), (l) => Math.exp(-metres(l.at, r.at) / 8) * (l.g === 'FB' || l.g === 'W' ? 2 : 1))
        this.car = c
        if (c && r.at.x > 74 && (c.ps['Long throw'] || c.ps['Far throw'])) {
          this.chain.setPiece = 'throw'
          return dead + this.cross(c, X, Y, 0, 1)
        }
        return dead
      }
      case 'corner': {
        const taker = this.setPieceTaker(X, 'corner', r.at.y < 50) || X.on[0]
        this.car = taker
        this.chain.setPiece = 'corner'
        taker.at = { ...r.at }
        this.touch(taker)
        if (this.ctx.commentary && this.crng.next() < 0.35) this.ev('corner', X.idx, line(this.crng, 'corner', { t: X.name }))
        if (X.tactics.corners === 'Short' && this.rng.next() < 0.6) return dead * 0.7
        return dead + this.cornerKick(taker, X, Y)
      }
      case 'fk': {
        const at = r.at
        const taker = r.taker && r.taker.on ? r.taker : r.victim && r.victim.on ? r.victim : this.nearest(X.on, at).l || X.on[0]
        this.car = taker
        const xg0 = baseXg(at)
        const central = Math.abs(at.y - 50) < 24
        if (at.x >= 70 && central && xg0 > 0.03) {
          const pref = X.tactics.freeKicks === 'Direct' ? 0.85 : X.tactics.freeKicks === 'Cross' ? 0.15 : 0.55
          if (this.rng.next() < pref * clamp(xg0 / 0.06, 0.4, 1.3)) {
            const k = this.setPieceTaker(X, 'freekick') || taker
            this.car = k
            k.at = { ...at }
            this.chain.setPiece = 'freekick'
            if (this.ctx.commentary && this.crng.next() < 0.5) this.ev('freekick', X.idx, line(this.crng, 'chanceFreekick', { p: callName(k.p.name) }), { player: k.p.id })
            return dead + this.fkShot(k, X, Y, at)
          }
        }
        if (at.x >= 66) {
          const k = this.setPieceTaker(X, 'freekick') || taker
          this.car = k
          k.at = { ...at }
          this.chain.setPiece = 'freekick'
          return dead + this.cross(k, X, Y, 0, 1)
        }
        return dead
      }
      case 'pen': {
        const taker = r.taker && r.taker.on ? r.taker : this.setPieceTaker(X, 'penalty') || X.on[0]
        this.car = taker
        this.b = { x: 88.6, y: 50 }
        return dead + this.penaltyKick(taker, X, Y, false)
      }
    }
    return dead
  }

  private cornerKick(taker: LP, X: Side, Y: Side): number {
    const from = { ...this.b }
    taker.st.crosses++
    taker.st.passes++
    X.stats.crosses++
    X.stats.passes++
    const gk = Y.gk
    const style = X.tactics.corners
    const spot = { x: style === 'Near Post' ? 90 + this.rng.next() * 3 : style === 'Far Post' ? 87 + this.rng.next() * 4 : 86 + this.rng.next() * 7, y: 0 }
    spot.y = style === 'Near Post' ? (from.y < 50 ? 40 : 60) : style === 'Far Post' ? (from.y < 50 ? 60 : 40) : 38 + this.rng.next() * 24
    const delivery = sigmoid(0.55 + 0.04 * (this.crs(taker) + taker.pb.fk - this.ref))
    const m0 = this.nearestOutfield(Y.on, spot).l
    if (this.rng.next() > delivery) {
      taker.st.possLost++
      this.rp(taker, RP.crossFail)
      this.log('corner', X.idx, taker, from, { x: 95, y: from.y < 50 ? 30 : 70 }, false)
      if (m0) { m0.st.clearances++; Y.stats.clearances++; this.rp(m0, RP.clearanceBox) }
      if (this.rng.next() < 0.25) this.cornerFor(X.idx)
      else this.loose({ x: 70 + this.rng.next() * 10, y: 30 + this.rng.next() * 40 }, -0.35)
      return 3
    }
    if (gk) {
      const pClaim = 0.1 * Math.exp((this.gkClaim(gk) - this.ref) / 22) * (spot.x > 92 ? 1.5 : 1)
      if (this.rng.next() < pClaim) {
        taker.st.possLost++
        this.log('corner', X.idx, taker, from, spot, false)
        return 3 + this.gkClaim_(gk, Y, spot, this.rng.next() < 0.6)
      }
    }
    // attackers attack the ball: centre-backs and big strikers
    const atk = X.on.filter((l) => l !== taker && l !== X.gk)
    const tgt = this.rng.weighted(atk, (l) => Math.pow(Math.max(30, this.aer(l)) / 70, 2.5) * (l.g === 'CB' || l.g === 'ST' ? 1.5 : l.g === 'FB' || l.g === 'W' ? 0.5 : 1))
    const defs = Y.on.filter((l) => l !== gk)
    const mk = this.rng.next() < 0.55 ? this.rng.weighted(defs, (l) => Math.pow(Math.max(30, this.aer(l)) / 70, 4)) : this.nearestOutfield(Y.on, spot).l
    if (!tgt || !mk) return 3
    tgt.at = { ...spot }
    const duel = this.aerial(tgt, mk, -0.55 + (style === 'Near Post' ? 0.08 : 0), spot)
    if (duel === 'foul') return 3
    if (duel === 'won') {
      taker.st.crossesOk++
      taker.st.passesCompleted++
      X.stats.crossesOk++
      this.rp(taker, RP.crossOk)
      this.log('corner', X.idx, taker, from, spot, true, tgt)
      this.chain.pass = { from: taker, kind: 'corner', n: this.n }
      this.b = spot
      this.car = tgt
      this.touch(tgt)
      this.lastHeader = true
      const res = this.shoot(tgt, { header: true, setPiece: true, pressure: 0.6 }, 'corner')
      this.lastHeader = false
      return 3 + res
    }
    taker.st.possLost++
    this.log('corner', X.idx, taker, from, spot, false, tgt)
    mk.st.clearances++
    Y.stats.clearances++
    this.rp(mk, RP.clearanceBox)
    if (this.rng.next() < 0.004) return 3 + this.ownGoal(mk, X, Y)
    const u = this.rng.next()
    if (u < 0.22) this.cornerFor(X.idx)
    else if (u < 0.62) this.loose({ x: 68 + this.rng.next() * 12, y: 25 + this.rng.next() * 50 }, -0.2)
    else {
      // cleared to a team-mate: centre-backs are up, the break is on
      const r = this.nearestOutfield(Y.on, flip({ x: 62, y: 50 })).l
      if (r) this.turnover(Y.idx, r, { x: 30 + this.rng.next() * 12, y: 30 + this.rng.next() * 40 }, { dis: 0.55 })
    }
    return 3
  }

  private fkShot(k: LP, X: Side, Y: Side, at: Pt): number {
    const gk = Y.gk
    this.b = { ...at }
    const xg = clamp(baseXg(at) * 0.72, 0.02, 0.11)
    k.st.shots++
    k.st.xg += xg
    X.stats.shots++
    X.stats.xg += xg
    X.threat += xg * 2
    const loc: [number, number] = (() => { const a = toAbs(X.idx, at); return [r1(a.x), r1(a.y)] as [number, number] })()
    const v = { p: callName(k.p.name), gk: gk ? callName(gk.p.name) : 'the keeper', t: X.name }
    // direct free kicks are shots like any other: on the shot map, in the goal frame and in the replay alike
    const fs = (res: ShotInfo['res'], xgotV?: number, wallAt?: Pt) => (this.detail ? this.placeShot(X, res, { inside: false, body: k.p.foot === 'L' ? 'L' : 'R', xgot: xgotV, at: wallAt, gk }) : undefined)
    if (this.rng.next() < 0.26) {
      this.rp(k, RP.blocked)
      const wall = { x: at.x + 8, y: 50 }
      this.log('shot', X.idx, k, at, wall, false)
      this.ev('chance', X.idx, `${callName(k.p.name)} strikes the free kick... ${line(this.crng, 'blocked', v)}`, { player: k.p.id, xg: r2(xg), loc, how: 'freekick', shot: fs('blocked', undefined, wall) })
      if (this.rng.next() < 0.35) this.cornerFor(X.idx)
      else this.loose({ x: at.x - 5, y: at.y }, -0.2)
      return 2
    }
    const sk = this.fk(k)
    const xgNb = xg / 0.74
    const fkRoom = this.goalRoom(X.idx)
    const pGoal = fkRoom !== undefined && fkRoom <= 0 ? 0 : sigmoid(logit(xgNb) + 0.03 * (sk - this.ref) - 0.022 * ((gk ? this.gkStop(gk) : 20) - this.ref - 4))
    const pAvg = sigmoid(logit(xgNb) + 0.03 * (sk - this.ref))
    const pOn = clamp(0.36 + 0.012 * (sk - this.ref), pAvg + 0.02, 0.8)
    const xgot = clamp(pAvg / pOn, 0.02, 0.95)
    const u = this.rng.next()
    if (u < pGoal) {
      X.stats.sot++
      k.st.sot++
      k.st.xgot += xgot
      if (gk) gk.st.xgotFaced += xgot
      this.rp(k, RP.sot)
      const si = fs('goal', xgot)
      this.log('goal', X.idx, k, at, this.shotEnd(X, si, { x: 100, y: 46 }), true)
      this.goal(k, undefined, 'freekick', xg, xgot, `${callName(k.p.name)} steps up...`, loc, undefined, si)
      return 2
    }
    if (u < pOn) {
      X.stats.sot++
      k.st.sot++
      k.st.xgot += xgot
      Y.stats.saves++
      this.rp(k, RP.sot)
      if (gk) { gk.st.saves++; gk.st.xgotFaced += xgot; this.rp(gk, RP.save + RP.saveXgot * xgot) }
      const si = fs('saved', xgot)
      this.log('shot', X.idx, k, at, { x: 99, y: this.shotEnd(X, si, { x: 99, y: 45 }).y }, false)
      this.ev('save', X.idx, `${callName(k.p.name)} curls the free kick goalwards... ${line(this.crng, xgot > 0.35 ? 'saveGreat' : 'saveGood', v)}`, { player: k.p.id, xg: r2(xg), loc, how: 'freekick', shot: si })
      if (this.rng.next() < 0.45) this.cornerFor(X.idx)
      else if (gk) { this.turnover(Y.idx, gk, { x: 5, y: 50 }, { dis: 0.1 }); this.pending = { kind: 'gkhold', side: Y.idx, at: { x: 6, y: 50 }, dead: 6, taker: gk } }
      return 2
    }
    this.rp(k, RP.offTarget)
    const si = fs('off')
    this.log('shot', X.idx, k, at, this.shotEnd(X, si, { x: 100, y: 40 }), false)
    this.ev('miss', X.idx, `${callName(k.p.name)} goes for goal from the free kick... ${line(this.crng, 'miss', v)}`, { player: k.p.id, xg: r2(xg), loc, how: 'freekick', shot: si })
    this.pending = { kind: 'goalkick', side: Y.idx, at: { x: 5.5, y: 50 }, dead: 15 + this.rng.next() * 10 }
    this.car = null
    return 2
  }

  // =========================================================== fouls & discipline
  /** `loc` is where it happened, in the frame of the side in possession (defaults to the ball). */
  private foul(def: LP, victim: LP, kind: 'press' | 'tackle' | 'aerial', loc: Pt = this.b): number {
    const F = this.sides[def.side], V = this.sides[victim.side]
    const at = victim.side === this.ps ? { ...loc } : flip(loc) // victim team frame
    F.stats.fouls++
    def.st.fouls++
    this.rp(def, RP.foul)
    victim.st.foulsWon++
    this.rp(victim, RP.foulWon)
    this.log('foul', F.idx, def, flip(at), flip(at), false, victim)
    const box = inBox(at)
    const clearChance = this.chain.oneOnOne || (this.counter && at.x > 70 && this.dis > 0.5)
    const strict = this.ctx.strictness * (this.ctx.derby ? 1.12 : 1) * (this.minute > 75 ? 1.1 : 1) * (F.idx === 0 && !this.ctx.neutral ? 0.92 : 1) * this.temper()
    const agg = this.e(def, A.aggression)
    const tactical = this.counter && this.dis > 0.3
    const pRed = clearChance ? (box ? 0.07 : 0.25) * strict : 0.0022 * strict * (agg / 70) * (kind === 'aerial' ? 0.5 : 1)
    const pYel = 0.105 * Math.pow(Math.max(20, agg) / 65, 1.1) * strict * (tactical ? 2.4 : 1) * (clearChance ? 2.2 : 1) * (def.p.hidden.temperament > 70 ? 1.2 : 1) * (def.yellow ? 0.55 : 1) * (kind === 'aerial' ? 0.55 : 1) * (box ? 1.3 : 1)
    let dead = 18 + this.rng.next() * 14 + (at.x > 66 ? 10 : 0)
    // Edit Mode: the card for a scripted penalty's foul
    const fc = this.forceCard
    const u = fc === 'red' ? -1 : fc === 'yellow' ? pRed + pYel * 0.5 : fc === 'none' ? 2 : this.rng.next()
    if (u < pRed) { this.sendOff(def, false); dead += 40 }
    else if (u < pRed + pYel) {
      dead += 22
      if (def.yellow) this.sendOff(def, true)
      else {
        def.yellow = true
        def.st.yellow = true
        this.rp(def, RP.yellow)
        F.stats.yellows++
        this.ev('yellow', F.idx, line(this.crng, 'yellow', { p: callName(def.p.name) }), { player: def.p.id, player2: victim.p.id })
      }
    } else if (!box && this.ctx.commentary && this.crng.next() < 0.14) {
      this.ev('foul', F.idx, line(this.crng, 'foul', { p: callName(def.p.name), q: callName(victim.p.name) }), { player: def.p.id, player2: victim.p.id })
    }
    if (!this.forcePen && this.rng.next() < 0.011 * this.ctx.injuryRate * (0.6 + victim.p.hidden.injuryProne / 80) * (kind === 'aerial' ? 0.6 : 1)) this.injure(victim)
    this.car = null
    if (box) {
      victim.st.penWon++
      this.rp(victim, RP.penWon)
      def.st.penConceded++
      this.rp(def, RP.penConceded)
      V.threat += 0.8
      const cardType = [...this.events].reverse().find((e) => e.min === this.minute && e.player === def.p.id && (e.type === 'yellow' || e.type === 'red' || e.type === 'secondYellow'))
      // the award goes before the card in the feed
      const penEv: MatchEvent = { min: this.minute, add: this.added || undefined, type: 'penalty', side: V.idx, player: victim.p.id, player2: def.p.id, text: line(this.crng, 'penaltyAwarded', { p: callName(victim.p.name), t: V.name }), score: [...this.score] as [number, number] }
      if (cardType) this.events.splice(this.events.indexOf(cardType), 0, penEv)
      else this.events.push(penEv)
      if (this.ctx.commentary && this.crng.next() < 0.25) this.ev('var', V.idx, `${line(this.crng, 'var', {})} ${line(this.crng, 'varNo', {})}`)
      const taker = this.setPieceTaker(V, 'penalty')
      this.pending = { kind: 'pen', side: V.idx, at: { x: 88.6, y: 50 }, dead: 50 + this.rng.next() * 40, taker, victim, fouler: def }
      return dead * 0.3
    }
    this.pending = { kind: 'fk', side: V.idx, at, dead, victim }
    return 1
  }

  private sendOff(lp: LP, second: boolean) {
    const S = this.sides[lp.side]
    lp.red = true
    lp.st.red = true
    lp.on = false
    lp.subOff = this.minute
    this.rp(lp, second ? RP.secondYellow : RP.red)
    S.stats.reds++
    if (second) S.stats.yellows++
    this.ev(second ? 'secondYellow' : 'red', S.idx, line(this.crng, second ? 'secondYellow' : 'red', { p: callName(lp.p.name), t: S.name }), { player: lp.p.id })
    S.refresh()
    if (this.car === lp) this.car = null
    // keeper sent off: sacrifice an outfield player for the reserve keeper
    if (lp.pos === 'GK') {
      const gkBench = S.bench.find((b) => b.p.positions[0] === 'GK')
      const victim = [...S.on].filter((l) => l.pos !== 'GK').sort((a, b) => (a.g === 'ST' || a.g === 'W' ? 0 : 1) - (b.g === 'ST' || b.g === 'W' ? 0 : 1))[0]
      if (gkBench && victim && this.canSub(S.idx)) {
        this.substitute(S.idx, victim.p.id, gkBench.p.id)
        const g = S.lps.find((l) => l.p.id === gkBench.p.id)!
        g.pos = 'GK'
        g.slot = lp.slot
        this.placed(g)
      } else if (victim) {
        victim.pos = 'GK'
        victim.slot = lp.slot
        this.placed(victim)
      }
      S.refresh()
    }
  }

  /** Dissent and time-wasting bookings that don't come from a foul. */
  private misconduct() {
    for (const s of this.sides) {
      const waste = this.timeWasting(s)
      const p = 0.0028 * this.ctx.strictness * this.temper() * (this.ctx.derby ? 1.3 : 1) + (waste ? 0.012 : 0)
      if (this.rng.next() >= p) continue
      const pool = s.on.filter((l) => !l.yellow)
      if (!pool.length) continue
      const l = this.rng.weighted(pool, (x) => Math.pow(x.p.hidden.temperament / 60, 2) + (waste && x.pos === 'GK' ? 3 : 0))
      l.yellow = true
      l.st.yellow = true
      this.rp(l, RP.yellow)
      s.stats.yellows++
      this.ev('yellow', s.idx, line(this.crng, waste ? 'yellowTime' : 'yellowDissent', { p: callName(l.p.name) }), { player: l.p.id })
    }
  }

  // =========================================================== penalties
  private penaltyKick(taker: LP, X: Side, Y: Side, shootout: boolean, round = 0): number {
    const gk = Y.gk
    const pk = this.pk(taker)
    const gq = gk ? this.gkStop(gk) * 0.6 + this.e(gk, A.gkPositioning) * 0.4 : 20
    const pressure = shootout ? (round >= 4 ? 0.06 : 0.03) : this.minute >= 80 && Math.abs(this.score[0] - this.score[1]) <= 1 ? 0.03 : 0
    const confident = clamp((this.e(taker, A.composure) - this.ref + 12) / 60, 0, 0.6)
    const fp = this.forcePen && this.forcePen.taker === taker.p.id ? this.forcePen : undefined
    if (fp) this.forcePen = undefined
    const spot = fp?.spot ?? this.rng.weighted<PenaltyKick['spot']>(['BL', 'BR', 'TL', 'TR', 'C'], (s) => (s === 'BL' || s === 'BR' ? 0.33 : s === 'C' ? 0.1 : 0.1 + confident * 0.15) * ((taker.p.foot === 'L') === (s === 'BR' || s === 'TR') ? 1.15 : 1))
    const dirOf = (s: string): 'L' | 'R' | 'C' => (s === 'C' ? 'C' : s[1] === 'L' ? 'L' : 'R')
    const read = clamp(0.36 + (gq - this.ref + 2) / 300, 0.28, 0.5)
    const want = dirOf(spot)
    let dive: 'L' | 'R' | 'C' = fp?.dive ?? (this.rng.next() < 0.1 ? 'C' : this.rng.next() < read + (want === 'C' ? 0 : 0.14) ? (want === 'C' ? (this.rng.next() < 0.5 ? 'L' : 'R') : want) : want === 'L' ? 'R' : want === 'R' ? 'L' : this.rng.next() < 0.5 ? 'L' : 'R')
    const high = spot === 'TL' || spot === 'TR'
    const missP = clamp(0.035 + (high ? 0.08 : spot === 'C' ? 0.01 : 0.025) - (pk - this.ref) * 0.0015 + pressure, 0.01, 0.2)
    let res: PenaltyKick['res']
    if (this.rng.next() < missP) res = this.rng.next() < 0.35 ? 'post' : 'miss'
    else if (dive === want) {
      const saveP = want === 'C' ? 0.85 : high ? 0.2 : clamp(0.55 + (gq - pk) * 0.012, 0.3, 0.8)
      res = this.rng.next() < saveP ? 'saved' : 'goal'
    } else res = 'goal'
    // Edit Mode: a scripted outcome, and no natural penalty goal past a scripted final score
    if (!shootout) {
      const room = fp ? undefined : this.goalRoom(X.idx)
      const want2 = fp?.res ?? (room !== undefined && room <= 0 && res === 'goal' ? 'saved' : undefined)
      if (want2 === 'goal') { res = 'goal' }
      else if (want2 === 'saved') { res = 'saved'; dive = want === 'C' ? 'C' : want }
      else if (want2 === 'miss') { res = this.rng.next() < 0.35 ? 'post' : 'miss' }
    }
    const pen: PenaltyKick = { taker: taker.p.id, keeper: gk?.p.id, spot, dive, res }
    if (shootout) return res === 'goal' ? 1 : 0
    const v = { p: callName(taker.p.name), gk: gk ? callName(gk.p.name) : 'the keeper', t: X.name }
    const loc: [number, number] = (() => { const a = toAbs(X.idx, { x: 88.6, y: 50 }); return [r1(a.x), r1(a.y)] as [number, number] })()
    taker.st.shots++
    taker.st.xg += 0.76
    X.stats.shots++
    X.stats.xg += 0.76
    X.stats.bigChances++
    const goalY = spot === 'C' ? 50 : want === 'L' ? 45 : 55
    if (res === 'goal') {
      taker.st.sot++
      taker.st.xgot += 0.9
      X.stats.sot++
      this.score[X.idx]++
      taker.st.goals++
      this.rp(taker, RP.goal * 0.75)
      this.conceded(Y, 0.9)
      if (gk) gk.st.xgotFaced += 0.9
      X.threat += 1.2
      this.log('pen', X.idx, taker, { x: 88.6, y: 50 }, { x: 100, y: goalY }, true)
      const key = dive === want ? 'goalPenPower' : spot === 'C' ? 'goalPenMiddle' : 'goalPen'
      this.push({ min: this.minute, add: this.added || undefined, type: 'penGoal', side: X.idx, player: taker.p.id, xg: 0.76, big: true, text: line(this.crng, key, v), loc, how: 'pen', pen })
      this.afterGoal(Y.idx)
      return 2
    }
    X.stats.bigChancesMissed++
    taker.st.bcm++
    this.rp(taker, -0.45)
    if (res === 'saved') {
      taker.st.sot++
      taker.st.xgot += 0.7
      X.stats.sot++
      Y.stats.saves++
      if (gk) { gk.st.saves++; gk.st.xgotFaced += 0.7; this.rp(gk, RP.penSave) }
    }
    this.log('pen', X.idx, taker, { x: 88.6, y: 50 }, { x: 100, y: res === 'miss' ? (want === 'L' ? 38 : 62) : goalY }, false)
    const key = res === 'saved' ? 'penSaved' : res === 'post' ? 'penPost' : 'penWide'
    this.push({ min: this.minute, add: this.added || undefined, type: 'penMiss', side: X.idx, player: taker.p.id, player2: gk?.p.id, xg: 0.76, big: true, text: line(this.crng, key, v), loc, how: 'pen', pen })
    if (res === 'saved' && this.rng.next() < 0.3) this.cornerFor(X.idx)
    else if (res === 'saved' && gk) { this.turnover(Y.idx, gk, { x: 5, y: 50 }, { dis: 0.1 }); this.pending = { kind: 'gkhold', side: Y.idx, at: { x: 6, y: 50 }, dead: 8, taker: gk } }
    else this.pending = { kind: 'goalkick', side: Y.idx, at: { x: 5.5, y: 50 }, dead: 20 }
    this.car = null
    return 2
  }

  private shootout() {
    const order = (s: Side) => {
      const sheet = s.input.sheet
      return [...s.on].sort((a, b) => (b.p.id === sheet.penalties ? 100 : 0) + this.pk(b) - ((a.p.id === sheet.penalties ? 100 : 0) + this.pk(a)))
    }
    const lists = [order(this.sides[0]), order(this.sides[1])]
    const sc: [number, number] = [0, 0]
    const taken: [number, number] = [0, 0]
    let round = 0
    const kick = (side: 0 | 1) => {
      const list = lists[side]
      if (!list.length) return
      const taker = list[taken[side] % list.length]
      const X = this.sides[side], Y = this.sides[1 - side as 0 | 1]
      const gk = Y.gk
      // decide the kick with the same model as in-game penalties
      const scored = this.penaltyKick(taker, X, Y, true, round) === 1
      taken[side]++
      if (scored) sc[side]++
      const keeper = gk ? callName(gk.p.name) : 'the keeper'
      const text = scored ? `${callName(taker.p.name)} scores! (${sc[0]}-${sc[1]})` : this.crng.next() < 0.6 ? `${callName(taker.p.name)}'s penalty is saved by ${keeper}! (${sc[0]}-${sc[1]})` : `${callName(taker.p.name)} misses the target! (${sc[0]}-${sc[1]})`
      this.push({ min: 120, type: 'shootout', side, player: taker.p.id, text })
    }
    for (round = 0; round < 5; round++) {
      kick(0)
      if (sc[0] > sc[1] + (5 - round - 1) + 1 || sc[1] > sc[0] + (5 - round)) break
      kick(1)
      if (sc[0] > sc[1] + (5 - round - 1) || sc[1] > sc[0] + (5 - round - 1)) break
    }
    while (sc[0] === sc[1]) { round++; kick(0); kick(1); if (round > 30) { sc[0]++; break } }
    this.pens = sc
    const winner = sc[0] > sc[1] ? this.home.short : this.away.short
    this.phase = 'FT'
    this.push({ min: 120, type: 'ft', side: -1, text: `${winner} win ${Math.max(...sc)}-${Math.min(...sc)} on penalties!` })
    this.finalRatings()
  }

  // =========================================================== injuries
  private injuryCheck() {
    for (const s of this.sides) {
      for (const lp of s.on) {
        const prone = lp.p.hidden.injuryProne / 100
        const tired = lp.energy < 35 ? 2.2 : lp.energy < 50 ? 1.5 : lp.energy < 62 ? 1.15 : 1
        const p = 0.00004 * this.ctx.injuryRate * (0.6 + prone * 1.8) * tired * (lp.ps['Injury prone'] ? 1.6 : 1) * (lp.pos === 'GK' ? 0.3 : 1)
        if (this.rng.next() < p) { this.injure(lp); return }
      }
    }
  }

  private injure(lp: LP) {
    if (this.scriptHolds(lp.p.id)) return
    if (lp.injured || !lp.on) return
    const side = lp.side
    lp.injured = true
    lp.st.injured = true
    this.debt += 50 + this.rng.next() * 60
    this.ev('injury', side, line(this.crng, 'injury', { p: callName(lp.p.name), t: this.sides[side].name, part: this.crng.pick(BODY_PARTS) }), { player: lp.p.id })
    const S = this.sides[side]
    const userControlled = S.input.controlledByUser && !this.ctx.assistantSubs
    if (userControlled) {
      this.injuredWaiting.push({ side, lp })
      lp.energy = Math.min(lp.energy, 35)
      this.cond(lp)
      return
    }
    this.replaceInjured(side, lp)
  }

  private replaceInjured(side: 0 | 1, lp: LP) {
    const S = this.sides[side]
    const sub = this.bestReplacement(S, lp.pos)
    if (sub && this.canSub(side)) this.substitute(side, lp.p.id, sub.p.id, 'injury')
    else {
      lp.on = false
      lp.subOff = this.minute
      this.ev('info', side, line(this.crng, 'injuryOff', { p: callName(lp.p.name) }), { player: lp.p.id })
      S.refresh()
      if (this.car === lp) this.car = null
    }
    this.injuredWaiting = this.injuredWaiting.filter((x) => x.lp !== lp)
  }

  autoResolveInjuries() {
    for (const { side, lp } of [...this.injuredWaiting]) this.replaceInjured(side, lp)
  }

  bestReplacement(S: Side, pos: Position): LP | undefined {
    const pool = S.bench.filter((b) => (pos === 'GK') === (b.p.positions[0] === 'GK'))
    return pool.sort((a, b) => posRating(b.p, pos) - posRating(a.p, pos))[0]
  }

  // =========================================================== fatigue
  private fatigue() {
    for (const s of this.sides) {
      const t = s.tactics
      const tacF = 1 + (t.pressing - 50) / 130 + (t.tempo - 50) / 240 + (s.on.length < 11 ? 0.06 : 0)
      for (const lp of s.on) {
        lp.st.mins++
        lp.gm[lp.g] = (lp.gm[lp.g] || 0) + 1
        lp.pd += (GAIN[lp.g] * PAR[lp.g]) / 90
        const stam = lp.p.attrs[A.stamina]
        const age = ageAt(lp.p, this.ctx.year ?? 2026)
        const ageF = age >= 33 ? 1.15 : age >= 31 ? 1.08 : age <= 20 ? 0.96 : 1
        const roleF = lp.role === 'Box-to-Box' || lp.role.includes('Wingback') ? 1.12 : lp.role === 'Poacher' || lp.role === 'Classic 10' || lp.role === 'Target Forward' ? 0.88 : 1
        const relentless = lp.ps.Relentless ? 1 - lp.ps.Relentless / 30 : 1
        const wb = lp.pos === 'LWB' || lp.pos === 'RWB' ? 1.08 : 1
        const drain = 0.42 * WORK[lp.g] * wb * (1.55 - (stam / 100) * 0.95) * (lp.g === 'GK' ? 1 : tacF) * ageF * roleF * relentless
        lp.energy = Math.max(5, lp.energy - drain)
        this.cond(lp)
      }
    }
  }

  // =========================================================== AI management & game state
  private lead(s: Side) { return s.idx === 0 ? this.score[0] - this.score[1] : this.score[1] - this.score[0] }

  private gameState() {
    for (const s of this.sides) {
      const lead = this.lead(s) + (this.ctx.aggregate ? (s.idx === 0 ? this.ctx.aggregate[0] - this.ctx.aggregate[1] : this.ctx.aggregate[1] - this.ctx.aggregate[0]) : 0)
      const m = this.minute
      let st = 0
      if (lead >= 3) st = -0.9
      else if (lead === 2) st = m >= 60 ? -0.55 : -0.25
      else if (lead === 1) st = m >= 80 ? -0.45 : m >= 65 ? -0.2 : 0
      else if (lead === 0) st = 0
      else if (lead === -1) st = m >= 75 ? 0.45 : m >= 60 ? 0.2 : 0
      else st = m >= 60 ? 0.3 : 0.1
      if (st !== s.state) { s.state = st; this.reshape(s) }
    }
  }

  private aiHalfTime() {
    for (const s of this.sides) {
      if (s.input.controlledByUser && !this.ctx.assistantSubs) continue
      if (this.lead(s) < 0 && this.rng.next() < 0.55) this.aiAttackingSub(s)
      // a struggling player is hooked at the break now and then
      const poor = s.on.filter((l) => l.pos !== 'GK' && this.liveRating(l) < 6.0).sort((a, b) => this.liveRating(a) - this.liveRating(b))[0]
      if (poor && this.rng.next() < 0.3) {
        const inn = this.bestReplacement(s, poor.pos)
        if (inn && this.canSub(s.idx) && inn.p.ovr >= poor.p.ovr - 8 && !this.scriptHolds(poor.p.id)) this.substitute(s.idx, poor.p.id, inn.p.id)
      }
      // a player on a yellow who has been living dangerously comes off
      const risky = s.on.find((l) => l.yellow && l.st.fouls >= 2 && l.pos !== 'GK')
      if (risky && this.rng.next() < 0.5) {
        const inn = this.bestReplacement(s, risky.pos)
        if (inn && this.canSub(s.idx) && !this.scriptHolds(risky.p.id)) this.substitute(s.idx, risky.p.id, inn.p.id)
      }
    }
  }

  private aiManage() {
    for (const s of this.sides) {
      const auto = !s.input.controlledByUser || this.ctx.assistantSubs
      const lead = this.lead(s)
      const agg = this.ctx.aggregate ? (s.idx === 0 ? this.ctx.aggregate[0] - this.ctx.aggregate[1] : this.ctx.aggregate[1] - this.ctx.aggregate[0]) : 0
      const effLead = lead + agg
      if (!s.input.controlledByUser) {
        let target = 0
        if (this.minute >= 70 && effLead < 0) target = this.minute >= 83 ? 1.5 : 0.8
        else if (this.minute >= 75 && effLead === 1) target = -0.6
        else if (this.minute >= 85 && effLead >= 1) target = -0.8
        if (this.ctx.knockout && effLead === 0 && this.minute >= 80) target = 0.4
        if (target !== s.aiMentality) {
          const before = s.aiMentality
          s.aiMentality = target
          this.reshape(s)
          if (this.ctx.commentary && Math.abs(target - before) >= 0.8 && this.crng.next() < 0.7) {
            const x = target > 0 ? 'throwing men forward' : 'shutting up shop'
            this.push({ min: this.minute, type: 'tactic', side: s.idx, text: line(this.crng, 'tactic', { t: s.name, x }) })
          }
          if (target < 0 && effLead > 0 && this.minute > 80 && (s.input.managerVision === 'Park the Bus' || this.rng.next() < 0.3)) s.tactics.timeWasting = true
        }
      }
      if (!auto) continue
      if (this.minute < 55 || !this.canSub(s.idx)) continue
      const windows = [60 + s.idx * 2, 70 + s.idx, 80, 87]
      if (!windows.includes(this.minute)) continue
      if (this.minute === 87 && !(effLead >= 1 || effLead <= -1) && this.rng.next() < 0.5) continue
      const live = (l: LP) => this.liveRating(l)
      const cands = s.on.filter((l) => l.pos !== 'GK' && !this.scriptHolds(l.p.id)).map((l) => {
        let need = 0
        if (l.energy < 79) need += (79 - l.energy) / 9
        if (this.minute >= 75) need += 0.25
        if (l.yellow && (l.g === 'CB' || l.g === 'FB' || l.g === 'DM') && l.st.fouls >= 2) need += 1.2
        const r = live(l)
        if (this.minute >= 60 && r < 6.3) need += (6.3 - r) * 1.5
        if (effLead >= 2 && this.minute >= 65) need += 0.3
        return { l, need }
      }).filter((x) => x.need > 0.45).sort((a, b) => b.need - a.need)
      const n = Math.min(this.minute >= 66 ? 2 : this.rng.int(1, 2), cands.length, (this.phase.startsWith('ET') ? 6 : 5) - s.subsUsed)
      for (let i = 0; i < n; i++) {
        const out = cands[i].l
        let inn = this.bestReplacement(s, out.pos)
        if (effLead < 0 && this.minute >= 62) {
          const att = s.bench.filter((b) => POS_GROUP[b.p.positions[0]] === 'ATT').sort((a, b) => b.p.ovr - a.p.ovr)[0]
          if (att && (out.g === 'CB' || out.g === 'FB' || out.g === 'DM') && this.rng.next() < 0.45) inn = att
        } else if (effLead > 0 && this.minute >= 75) {
          const def = s.bench.filter((b) => POS_GROUP[b.p.positions[0]] === 'DEF' || b.p.positions[0] === 'CDM').sort((a, b) => b.p.ovr - a.p.ovr)[0]
          if (def && (out.g === 'W' || out.g === 'ST' || out.g === 'AM') && this.rng.next() < 0.35) inn = def
        }
        if (inn && inn.p.ovr >= out.p.ovr - 12) this.substitute(s.idx, out.p.id, inn.p.id)
      }
    }
  }

  private aiAttackingSub(s: Side) {
    const out = s.on.filter((l) => (l.g === 'CB' || l.g === 'FB' || l.g === 'DM') && l.pos !== 'GK' && !this.scriptHolds(l.p.id)).sort((a, b) => this.liveRating(a) - this.liveRating(b))[0]
    const att = s.bench.filter((b) => POS_GROUP[b.p.positions[0]] === 'ATT' || POS_GROUP[b.p.positions[0]] === 'MID').sort((a, b) => b.p.ovr - a.p.ovr)[0]
    if (out && att && this.canSub(s.idx)) this.substitute(s.idx, out.p.id, att.p.id)
  }

  // =========================================================== commentary between the big moments
  private buildLine() {
    if (!this.ctx.commentary) return
    const quiet = !this.events.length || this.events[this.events.length - 1].min !== this.minute
    if (!quiet || this.minute - this.lastInfo < 2) return
    const n = this.notable
    const X = this.sides[this.ps]
    let key: string, v: Record<string, any>
    if (n && this.crng.next() < 0.55) { key = n.key; v = n.v }
    else if (this.crng.next() < 0.3) {
      const Y = this.sides[1 - this.ps]
      const deep = Y.tactics.defApproach === 'Deep' || Y.shape.mentality < -0.5
      const c = this.car && this.car.on ? this.car : X.on[0]
      if (!c) return
      key = deep && this.crng.next() < 0.4 ? 'deepBlock' : this.b.x < 35 ? 'recycle' : X.minSec > 40 || this.ctx.neutral ? 'build' : 'crowd'
      v = { p: callName(c.p.name), q: '', t: key === 'crowd' ? this.home.short : X.name, o: key === 'crowd' ? this.away.short : Y.name, side: sideWord(X.idx === 0 ? this.b.y : 100 - this.b.y), venue: this.ctx.venue }
    } else return
    this.lastInfo = this.minute
    this.push({ min: this.minute, add: this.added || undefined, type: 'info', side: this.ps, text: line(this.crng, key, v) })
  }

  // =========================================================== frames, ratings & result
  private frame(evStart: number) {
    const evs = this.events.slice(evStart)
    const rank: Record<string, number> = { goal: 9, penGoal: 9, owngoal: 9, penalty: 8, woodwork: 7, save: 6, penMiss: 6, var: 6, miss: 5, chance: 5, red: 4, secondYellow: 4, corner: 3, freekick: 3, yellow: 2, offside: 2, foul: 1, injury: 1 }
    let k = 'play', ks: 0 | 1 = this.ps, best = 0
    for (const e of evs) {
      if (e.side === -1) continue
      const r = rank[e.type] || 0
      if (r > best) { best = r; k = e.type; ks = e.side }
    }
    const [H, Aw] = this.sides
    const tot = H.minSec + Aw.minSec
    const p = tot > 0 ? H.minSec / tot : 0.5
    // territory: time on the ball in the final third adds pressure
    const th = H.threat - Aw.threat + (p - 0.5) * 0.5
    const mom = clamp(Math.tanh(th * 1.4), -1, 1)
    const ab = toAbs(this.ps, this.b)
    const atk: 0 | 1 = k === 'foul' || k === 'yellow' || k === 'red' || k === 'secondYellow' ? (1 - ks) as 0 | 1 : ks
    this.timeline.push({ m: this.minute, add: this.added, p: Math.round(p * 100) / 100, s: k === 'play' ? this.ps : atk, x: r1(ab.x), y: r1(ab.y), k, mom: Math.round(mom * 100) / 100, ev: evStart, acts: this.acts })
  }

  private liveRating(l: LP, final = false): number {
    const reg = this.phase === 'ET1' || this.phase === 'ET2' || this.phase === 'ETHT' ? 120 : 90
    const gf = this.score[l.side], ga = this.score[1 - l.side]
    const r = computeRating({ rp: l.rp - l.pd, mins: l.st.mins, gm: l.gm, ga: l.ga, gd: l.gd, prog: clamp(this.minute / reg, 0, 1), final, res: gf > ga ? 1 : gf < ga ? -1 : 0 })
    const told = this.ctx.script?.form?.[l.p.id]
    return told ? clamp(Math.round((r + told * 0.3 * clamp(this.minute / reg, 0.3, 1)) * 10) / 10, 3, 10) : r
  }

  private finalRatings() {
    for (const s of this.sides) {
      for (const lp of [...s.lps, ...s.bench]) {
        if (lp.st.mins === 0 && !lp.st.started) continue
        const pensWin = this.pens ? (this.pens[s.idx] > this.pens[1 - s.idx] ? 1 : -1) : 0
        let r = this.liveRating(lp, true)
        if (pensWin && this.score[0] === this.score[1]) r = Math.round((r + pensWin * 0.05) * 10) / 10
        lp.st.rating = r
      }
    }
  }

  private statsOut(l: LP): PStats {
    return { ...l.st, xg: r2(l.st.xg), xa: r2(l.st.xa), xgot: r2(l.st.xgot), xgotFaced: r2(l.st.xgotFaced), heat: encodeHeat(l.heat), energy: Math.round(l.energy) }
  }

  private teamOut(s: Side): FullTeamStats {
    const st = { ...s.stats }
    st.xg = r2(st.xg)
    st.xgot = r2(st.xgot)
    let tp = 0, tc = 0
    for (const l of [...s.lps, ...s.bench]) { tp += l.st.passes; tc += l.st.passesCompleted }
    st.passes = tp
    st.passAcc = tp ? Math.round((tc / tp) * 100) : 0
    return st
  }

  result(): MatchResult {
    const tot = this.sides[0].possSec + this.sides[1].possSec || 1
    const poss0 = Math.round((this.sides[0].possSec / tot) * 100)
    const statsOut: [TeamMatchStats, TeamMatchStats] = [this.teamOut(this.sides[0]), this.teamOut(this.sides[1])]
    statsOut[0].possession = poss0
    statsOut[1].possession = 100 - poss0
    const players: MatchPlayerStats[] = []
    for (const s of this.sides) for (const l of [...s.lps, ...s.bench]) if (l.st.mins > 0 || l.st.started) players.push(this.statsOut(l))
    const winnerSide = this.pens ? (this.pens[0] > this.pens[1] ? 0 : 1) : this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1
    const motm = [...players].sort((a, b) => (b.rating + (b.side === winnerSide ? 0.25 : 0)) - (a.rating + (a.side === winnerSide ? 0.25 : 0)))[0]
    return {
      score: [...this.score] as [number, number],
      ht: this.htScore,
      et: this.regScore,
      pens: this.pens,
      events: this.events,
      stats: statsOut,
      players,
      motm: motm?.id,
      attendance: this.ctx.attendance,
      detail: 'full',
      lineups: [this.sides[0].input.sheet.lineup, this.sides[1].input.sheet.lineup],
      formations: [this.sides[0].input.sheet.formation, this.sides[1].input.sheet.formation],
      captains: [this.sides[0].input.sheet.captain, this.sides[1].input.sheet.captain],
      mom: this.timeline.map((f) => [f.m + f.add / 100, f.mom] as [number, number]),
    }
  }

  // =========================================================== UI helpers
  liveRatings(side: 0 | 1): LiveRating[] {
    const s = this.sides[side]
    const missed = new Set(this.events.filter((e) => e.type === 'penMiss' && e.side === side).map((e) => e.player))
    return [...s.lps, ...s.bench].map((l) => ({
      id: l.p.id, rating: this.finished ? l.st.rating : this.liveRating(l), energy: l.energy, on: l.on, pos: l.pos, yellow: l.yellow, red: l.red, injured: l.injured, slot: l.slot,
      goals: l.st.goals, assists: l.st.assists, subOn: l.subOn, subOff: l.subOff, played: l.st.mins > 0 || l.st.started, role: l.role, penMissed: missed.has(l.p.id) || undefined,
    }))
  }

  liveStats(): [TeamMatchStats, TeamMatchStats] {
    const tot = this.sides[0].possSec + this.sides[1].possSec
    const p0 = tot > 0 ? Math.round((this.sides[0].possSec / tot) * 100) : 50
    const a = this.teamOut(this.sides[0]), b = this.teamOut(this.sides[1])
    a.possession = p0
    b.possession = 100 - p0
    return [a, b]
  }

  /** Live per-player stats, heat map included. */
  playerStats(side: 0 | 1, id: number): MatchPlayerStats | undefined {
    const l = [...this.sides[side].lps, ...this.sides[side].bench].find((x) => x.p.id === id)
    if (!l) return undefined
    return { ...this.statsOut(l), rating: this.finished ? l.st.rating : this.liveRating(l) }
  }
  captain(side: 0 | 1) { return this.sides[side].input.sheet.captain }
  sideTactics(side: 0 | 1) { return this.sides[side].tactics }
  sideShape(side: 0 | 1) { return this.sides[side].shape }
  sideFormation(side: 0 | 1) { return this.sides[side].formation }
  subsLeft(side: 0 | 1) { return (this.phase.startsWith('ET') ? 6 : 5) - this.sides[side].subsUsed }
  onPitchIds(side: 0 | 1) { return [...this.sides[side].on].sort((a, b) => a.slot - b.slot).map((l) => l.p.id) }
  benchIds(side: 0 | 1) { return this.sides[side].bench.map((l) => l.p.id) }
  /** Formation slot of each on-pitch player (for drawing the live shape). */
  slotOf(side: 0 | 1, id: number) { return this.sides[side].on.find((l) => l.p.id === id)?.slot ?? -1 }
  /** Side in possession and ball position (absolute frame). */
  ballState(): { side: 0 | 1; x: number; y: number } { const a = toAbs(this.ps, this.b); return { side: this.ps, x: a.x, y: a.y } }
}

function r1(v: number) { return Math.round(v * 10) / 10 }
function r2(v: number) { return Math.round(v * 100) / 100 }
function sideWord(y: number) { return y < 38 ? 'left' : y > 62 ? 'right' : 'middle' }
function ageAt(p: Player, year: number) {
  const y = Number(p.dob?.slice(0, 4))
  return y ? year - y : 27
}

function describeTactic(t: Partial<TeamTactics>): string {
  if (t.defApproach) return `a ${t.defApproach.toLowerCase()} defensive approach`
  if (t.buildUp) return `${t.buildUp.toLowerCase()} build-up`
  if (t.pressing !== undefined) return t.pressing > 65 ? 'a higher press' : 'a lower press'
  if (t.timeWasting) return 'slowing the game down'
  if (t.width !== undefined) return t.width > 60 ? 'stretching the play' : 'a narrower shape'
  if (t.lineHeight !== undefined) return t.lineHeight > 60 ? 'pushing the line higher' : 'dropping deeper'
  return ''
}
