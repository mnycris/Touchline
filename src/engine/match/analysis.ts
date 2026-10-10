// Reading a match while it is played. The half-time report, the live analysis in Manage Team and the before/after of a
// tactical change in the Match Report are all made here, from what the engine counted (the ledger, see ledger.ts) set
// against what an ordinary side does over the same stretch of time. An observation only appears when the numbers stand
// out from that norm, and it says what happened, not what will win: one half is a small sample, and the wording says so.
import type { ChangeReport, ChangeRow, MatchEvent, Position, TeamTactics } from '../../domain/types'
import { emptyLedger, ledgerDiff, viewOf, type Ledger, type LedgerView } from './ledger'

// ---------------------------------------------------------------- what an ordinary side does
// Measured on full-engine league fixtures across the big five (scripts/qa/lab/norms.ts): mean and spread per team.
type Norm = readonly [number, number]
/** per team over a half (45 minutes); shares and rates are per their own base */
export const NORM_HALF: Record<string, Norm> = {
  poss: [0.5, 0.108], passes: [228, 52], passAcc: [0.813, 0.056], spell: [5.72, 1.65], fwdShare: [0.285, 0.049], longShare: [0.054, 0.052],
  reach: [0.651, 0.213], entries: [26.8, 9.6], boxEntries: [6.8, 4.2], tilt: [0.233, 0.087], lostOwn: [7.2, 4.1], lostMid: [13, 4.4],
  lostFinal: [15.2, 5.8], lostPressed: [8.65, 3.1], wonHigh: [1.6, 1.52], quickWon: [3.7, 2.4], shots: [7.06, 4.0], sot: [2.14, 1.85],
  xg: [0.715, 0.547], dribbles: [9.3, 4.6], crosses: [3.85, 2.6], counterShots: [0.34, 0.6], counterXg: [0.066, 0.13],
}
/** touches per 90 minutes by position group */
export const TOUCHES_90: Record<string, Norm> = { GK: [10, 4], CB: [41.5, 18.7], FB: [52.6, 18.5], DM: [55.3, 20.9], CM: [81.7, 22.7], AM: [80.2, 22.1], W: [60.3, 20.8], ST: [29.3, 19.1] }
/** and how much more or less of the ball a role sees than its group (a poacher lives off scraps, a false nine drops in for it) */
const ROLE_TOUCH: Record<string, number> = {
  'Classic 10': 1.09, 'Shadow Striker': 0.89, 'Ball-Playing Defender': 1.36, Playmaker: 1.07, 'Deep-Lying Playmaker': 1.1, Holding: 0.8,
  'False 9': 2.5, Poacher: 0.7, 'Inside Forward': 0.84, 'Wide Midfielder': 1.07, 'Wide Playmaker': 1.16,
}

const COUNTS = new Set(['passes', 'entries', 'boxEntries', 'lostOwn', 'lostMid', 'lostFinal', 'lostPressed', 'wonHigh', 'quickWon', 'shots', 'sot', 'xg', 'dribbles', 'crosses', 'counterShots', 'counterXg'])

/** How far a figure over `minutes` sits from the norm, in spreads (counts scale with time, shares get noisier in short spells). */
export function zOf(key: string, v: number, minutes: number): number {
  const n = NORM_HALF[key]
  if (!n) return 0
  const k = Math.max(5, minutes) / 45
  return COUNTS.has(key) ? (v - n[0] * k) / (n[1] * Math.sqrt(k)) : (v - n[0]) / (n[1] * Math.sqrt(1 / Math.min(1.5, k)))
}
/** What an ordinary side would have by now. */
export const usual = (key: string, minutes: number) => (NORM_HALF[key]?.[0] || 0) * (COUNTS.has(key) ? Math.max(5, minutes) / 45 : 1)

// ---------------------------------------------------------------- how chances come
export const CHANCE_LABEL: Record<string, string> = {
  pass: 'Build-up play', through: 'Through balls', cross: 'Crosses', cutback: 'Cut-backs', solo: 'Dribbles and cut-ins', counter: 'Counter-attacks',
  box: 'Loose balls in the box', long: 'Long shots', corner: 'Corners', freekick: 'Free kicks', throw: 'Long throws', rebound: 'Rebounds', error: 'Mistakes', pen: 'Penalties',
}
export const chanceLabel = (h: string) => CHANCE_LABEL[h] || 'Other'
/** how a kind of chance reads in a sentence, ours or theirs, and a single one of it */
function chancePhrase(how: string, ours: boolean, one: boolean): string {
  const them = ours ? 'their' : 'our'
  const many: Record<string, string> = {
    pass: 'build-up play', through: 'balls in behind', cross: 'crosses', cutback: 'cut-backs from the byline', solo: `runs at ${them} defence`, counter: 'counter-attacks',
    box: 'scrambles in the box', long: 'shots from distance', corner: 'corners', freekick: 'free kicks', throw: 'long throws', rebound: 'rebounds', error: `${them} mistakes`, pen: 'a penalty',
  }
  const single: Record<string, string> = {
    pass: 'move', through: 'ball in behind', cross: 'cross', cutback: 'cut-back', solo: `run at ${them} defence`, counter: 'counter-attack',
    box: 'scramble in the box', long: 'shot from distance', corner: 'corner', freekick: 'free kick', throw: 'long throw', rebound: 'rebound', error: `${ours ? 'their' : 'our'} mistake`, pen: 'penalty',
  }
  return (one ? single : many)[how] || how
}

// ---------------------------------------------------------------- stretches of a match
export interface Frame { m: number; add: number; L: [Ledger, Ledger] }
export interface Span {
  /** frame indices (exclusive start, -1 = kick-off; inclusive end) */
  a: number
  b: number
  minutes: number
  us: LedgerView
  them: LedgerView
  /** raw counters, for the per-90 comparisons */
  lu: Ledger
  lt: Ledger
}

/** What happened between two frames, from `side`'s point of view. */
export function spanOf(frames: Frame[], side: 0 | 1, a: number, b: number): Span {
  const end = frames[b], start = a >= 0 ? frames[a] : undefined
  const o = (1 - side) as 0 | 1
  const lu = start ? ledgerDiff(end.L[side], start.L[side]) : end.L[side]
  const lt = start ? ledgerDiff(end.L[o], start.L[o]) : end.L[o]
  const minutes = Math.max(1, b - a)
  return { a, b, minutes, us: viewOf(lu, lt, minutes), them: viewOf(lt, lu, minutes), lu, lt }
}

/** The frame index a moment falls in (events carry minute and added minute). */
export function frameAt(frames: Frame[], min: number, add = 0): number {
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    if (f.m > min || (f.m === min && f.add >= add)) return i
  }
  return frames.length - 1
}

// ---------------------------------------------------------------- observations
export interface Obs {
  key: string
  tone: 'good' | 'bad' | 'neutral'
  icon: string
  head: string
  text: string
  /** how far it stands out (ranks what is shown) */
  score: number
  /** a line for the detail view: what the setting trades, never an instruction */
  more?: string
  player?: number
}

export interface Involvement { id: number; name: string; pos: Position; role?: string; mins: number; touches: number }

export interface ObsInput {
  span: Span
  tactics: TeamTactics
  /** our players with their minutes and touches over the same span (omit for spans that don't start at kick-off) */
  players?: Involvement[]
  /** varies the wording from match to match */
  seed: string
  /** goals in the span: ours, theirs */
  goals: [number, number]
}

const GROUP: Partial<Record<Position, string>> = { GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM', LM: 'W', RM: 'W', LW: 'W', RW: 'W', ST: 'ST', CF: 'ST' }
const GROUP_NAME: Record<string, string> = { GK: 'keeper', CB: 'centre-back', FB: 'full-back', DM: 'holding midfielder', CM: 'central midfielder', AM: 'number 10', W: 'wide player', ST: 'striker' }
const LANE_NAME = ['left', 'middle', 'right']

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
const pick = (seed: string, key: string, xs: string[]) => xs[hash(seed + key) % xs.length]
const pc = (x: number) => `${Math.round(x * 100)}%`
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const x2 = (x: number) => x.toFixed(2)
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** Everything that stands out in a stretch of play, strongest first. */
export function observe(o: ObsInput): Obs[] {
  const { us, them } = o.span
  const m = o.span.minutes
  const t = o.tactics
  const out: Obs[] = []
  const z = (k: string, v: number) => zOf(k, v, m)
  const say = (k: string, xs: string[]) => pick(o.seed, k, xs)
  if (m < 10) return out

  // ---- where our chances have come from (or why there are none)
  const src = Object.entries(us.by).sort((a, b) => b[1][1] - a[1][1])
  const xgUs = us.xg, xgThem = them.xg
  if (src.length && xgUs >= 0.3) {
    const [how, [n, x]] = src[0]
    if (x / xgUs >= 0.45 && how !== 'pen') {
      out.push({
        key: 'srcUs', tone: 'good', icon: 'target', head: `Our threat: ${chanceLabel(how).toLowerCase()}`,
        text: n === 1 ? `A single ${chancePhrase(how, true, true)} is ${x2(x)} of our ${x2(xgUs)} xG: one big chance, not a pattern yet.`
          : say('srcUs', [
            `${x2(x)} of our ${x2(xgUs)} xG has come from ${chancePhrase(how, true, false)} (${plural(n, 'shot')}).`,
            `Most of what we've created has come from ${chancePhrase(how, true, false)}: ${plural(n, 'shot')}, ${x2(x)} of our ${x2(xgUs)} xG.`,
          ]),
        score: (n === 1 ? 0.6 : 1) + (x / xgUs) * 1.2,
      })
    }
  }
  if (z('xg', xgUs) < -0.9 && z('shots', us.shots) < -0.6) {
    // which step of the attack is failing: getting there, getting in, or getting a shot away
    const why = us.entries < usual('entries', m) * 0.7 ? `we're rarely getting into their third (${plural(us.entries, 'time')}; a side usually manages about ${Math.round(usual('entries', m))})`
      : us.boxEntries < usual('boxEntries', m) * 0.6 ? `we reach their third (${plural(us.entries, 'time')}) but only got into the box ${plural(us.boxEntries, 'time')}`
        : `we get into the box (${plural(us.boxEntries, 'time')}) but rarely get a shot away from it`
    out.push({ key: 'dry', tone: 'bad', icon: 'warning', head: 'Not much created', text: `${plural(us.shots, 'shot')}, ${x2(xgUs)} xG. ${cap(why)}.`, score: 1.4 - z('xg', xgUs) * 0.5 })
  } else if (us.shots >= 6 && xgUs / us.shots < 0.065) {
    const far = us.by.long?.[0] || 0
    out.push({ key: 'quality', tone: 'neutral', icon: 'target', head: 'Lots of shots, few good ones', text: `${plural(us.shots, 'shot')} worth ${x2(xgUs)} xG${far >= 3 ? `, ${far} of them from distance` : ''}: the chances are coming, the clear ones aren't.`, score: 1.1 })
  }

  // ---- where their danger comes from
  const srcT = Object.entries(them.by).sort((a, b) => b[1][1] - a[1][1])
  if (srcT.length && xgThem >= 0.5) {
    const [how, [n, x]] = srcT[0]
    const lanes = them.entryLanes, tot = lanes[0] + lanes[1] + lanes[2]
    // their left is our right; a flank only says something about chances that come from out there or through it
    const li = tot >= 8 ? lanes.indexOf(Math.max(...lanes)) : -1
    const flank = li >= 0 && li !== 1 && lanes[li] / tot >= 0.45 ? LANE_NAME[2 - li] : ''
    const where = !flank ? '' : how === 'cross' || how === 'cutback' ? ` from our ${flank}` : how === 'through' || how === 'solo' || how === 'pass' || how === 'counter' ? ` down our ${flank}` : ''
    if (x / xgThem >= 0.4 && how !== 'pen') {
      out.push({
        key: 'srcThem', tone: 'bad', icon: 'shield', head: `Their danger: ${chanceLabel(how).toLowerCase()}`,
        text: n === 1 ? `A single ${chancePhrase(how, false, true)}${where} is ${x2(x)} of their ${x2(xgThem)} xG: one chance, not a pattern yet.`
          : say('srcThem', [
            `${x2(x)} of their ${x2(xgThem)} xG has come from ${chancePhrase(how, false, false)}${where} (${plural(n, 'shot')}).`,
            `They've hurt us mostly with ${chancePhrase(how, false, false)}${where}: ${plural(n, 'shot')}, ${x2(x)} xG.`,
          ]),
        score: (n === 1 ? 0.5 : 0.9) + (x / xgThem) + Math.max(0, z('xg', xgThem)) * 0.4,
      })
    }
  }

  // ---- on the break
  const cs = them.by.counter?.[0] || 0, cx = them.by.counter?.[1] || 0
  if (cs >= 2 && z('counterXg', cx) > 1.2) {
    const exposed = t.lineHeight >= 65 ? 'with the line set high' : t.mentality === 'Attacking' || t.mentality === 'Ultra Attacking' ? 'with men committed forward' : ''
    out.push({
      key: 'counter', tone: 'bad', icon: 'ffwd', head: 'Caught on the break', text: `${plural(cs, 'counter-attack shot')} against us (${x2(cx)} xG)${exposed ? `, ${exposed}` : ''}.`,
      score: 1.2 + z('counterXg', cx) * 0.3,
      more: 'A deeper line or a more cautious mentality leaves fewer gaps when the ball is lost, at the cost of territory and men in the box.',
    })
  }
  const ccs = us.by.counter?.[0] || 0, ccx = us.by.counter?.[1] || 0
  if (ccs >= 2 && z('counterXg', ccx) > 1.2) out.push({ key: 'ourCounter', tone: 'good', icon: 'ffwd', head: 'Breaking well', text: `${plural(ccs, 'shot')} on the counter (${x2(ccx)} xG): there's space behind them when they lose it.`, score: 1 + z('counterXg', ccx) * 0.25 })

  // ---- the ball: why we have so little of it, or why so much of it is going nowhere
  if (us.poss <= 0.42) {
    const causes: [number, string][] = []
    if (us.longShare > 0.1 || z('fwdShare', us.fwdShare) > 1) causes.push([Math.max(z('longShare', us.longShare), z('fwdShare', us.fwdShare)), `we're moving it forward early (${pc(us.longShare)} long balls, ${n1(us.spell)} passes a move)`])
    if (z('lostPressed', us.lostPressed) > 0.8) causes.push([z('lostPressed', us.lostPressed), `we're being caught on the ball (${plural(us.lostPressed, 'time')} tackled or pressed off it)`])
    if (z('passAcc', us.passAcc) < -0.8) causes.push([-z('passAcc', us.passAcc), `our passing is loose (${pc(us.passAcc)} completed)`])
    if (z('spell', them.spell) > 0.8) causes.push([z('spell', them.spell), `they keep it for long spells (${n1(them.spell)} passes a move)`])
    if (z('wonHigh', them.wonHigh) > 1) causes.push([z('wonHigh', them.wonHigh), `their press wins it back high (${plural(them.wonHigh, 'time')} in our third)`])
    causes.sort((a, b) => b[0] - a[0])
    const why = causes.slice(0, 2).map((c) => c[1])
    const deep = t.defApproach === 'Deep' || t.mentality === 'Defensive' || t.mentality === 'Ultra Defensive'
    out.push({
      key: 'poss', tone: deep ? 'neutral' : 'bad', icon: 'pitch', head: `${pc(us.poss)} of the ball`,
      text: why.length ? `Mainly because ${why.join(', and ')}.` : deep ? 'About what a side sitting off the ball expects.' : 'No single cause stands out: they simply have it more.',
      score: 0.8 + (0.5 - us.poss) * 4 + (causes[0]?.[0] || 0) * 0.3,
    })
  } else if (us.poss >= 0.58 && z('boxEntries', us.boxEntries) < -0.3 && z('xg', xgUs) < 0) {
    const gate = us.reach < 0.45 ? `only ${pc(us.reach)} of our moves reach their third` : `we reach their third ${plural(us.entries, 'time')} but get into the box ${plural(us.boxEntries, 'time')}`
    out.push({ key: 'sterile', tone: 'bad', icon: 'pitch', head: `${pc(us.poss)} of the ball, little end product`, text: `${cap(gate)}. ${them.poss < 0.42 ? 'They are happy to let us have it.' : ''}`.trim(), score: 1.2 })
  }

  // ---- where we attack
  const ul = us.entryLanes, ut = ul[0] + ul[1] + ul[2]
  if (ut >= Math.max(10, m * 0.33)) {
    const li = ul.indexOf(Math.max(...ul))
    if (ul[li] / ut >= (li === 1 ? 0.6 : 0.58)) out.push({
      key: 'lane', tone: 'neutral', icon: 'pitch', head: li === 1 ? 'Through the middle' : `Down the ${LANE_NAME[li]}`,
      text: say('lane', [
        `${pc(ul[li] / ut)} of our attacks have gone ${li === 1 ? 'through the middle' : `down the ${LANE_NAME[li]}`} (${ul[li]} of ${ut}).`,
        `We're attacking ${li === 1 ? 'through the middle' : `down the ${LANE_NAME[li]}`} far more than anywhere else: ${ul[li]} of ${ut} entries into their third.`,
      ]),
      score: 0.5 + (ul[li] / ut - 0.55) * 3,
    })
  }

  // ---- pressing
  const pressing = t.pressing >= 60 || t.defApproach === 'High' || t.defApproach === 'Aggressive'
  if (pressing) {
    const zh = z('wonHigh', us.wonHigh), zq = z('quickWon', us.quickWon)
    if (zh > 1.1 || zq > 1.1) {
      const high = `${plural(us.wonHigh, 'ball')} won in their third (a side usually has about ${n1(usual('wonHigh', m))} by now)`
      const quick = `${plural(us.quickWon, 'time')} we've won it back within seconds of losing it (usually about ${Math.round(usual('quickWon', m))})`
      out.push({ key: 'pressOk', tone: 'good', icon: 'press', head: zh > 1.1 ? 'The press is biting' : 'Winning it straight back', text: `${cap(zh > 1.1 && zq > 1.1 ? `${high}, and ${quick}` : zh > 1.1 ? high : quick)}.`, score: 0.9 + Math.max(zh, zq) * 0.3 })
    } else if (z('wonHigh', us.wonHigh) < 0 && z('passAcc', them.passAcc) > 0.8) {
      out.push({ key: 'pressNo', tone: 'bad', icon: 'press', head: "The press isn't getting near them", text: `They've completed ${pc(them.passAcc)} of their passes and we've won it in their third ${plural(us.wonHigh, 'time')}.`, score: 1 + z('passAcc', them.passAcc) * 0.3, more: 'A press that is played through costs legs and leaves the space behind it; a mid block keeps the shape.' })
    }
  }
  if (z('wonHigh', them.wonHigh) > 1.3 && them.wonHigh >= 3) {
    out.push({ key: 'pressed', tone: 'bad', icon: 'press', head: 'Their press is causing problems', text: `We've lost it in our own third ${plural(us.lostOwn, 'time')}, ${them.wonHigh} of those to their press.`, score: 1 + z('wonHigh', them.wonHigh) * 0.3, more: 'Going longer from the back bypasses a press; playing through it needs time on the ball and players who can turn.' })
  }

  // ---- over our midfield
  if (z('longShare', them.longShare) > 1.4 && them.entries >= usual('entries', m) * 0.8) {
    out.push({ key: 'bypassed', tone: 'neutral', icon: 'long', head: 'They are going over the midfield', text: `${pc(them.longShare)} of their passes are long balls, and they've still reached our third ${plural(them.entries, 'time')}.`, score: 0.8 + z('longShare', them.longShare) * 0.2 })
  }

  // ---- territory
  if (z('tilt', us.tilt) > 1.2 && us.poss >= 0.45) out.push({ key: 'tilt', tone: 'good', icon: 'pitch', head: 'Camped in their half', text: `${pc(us.tilt)} of our time on the ball has been in their third.`, score: 0.7 + z('tilt', us.tilt) * 0.2 })
  if (z('tilt', them.tilt) > 1.2 && them.poss >= 0.45) out.push({ key: 'tiltThem', tone: 'bad', icon: 'pitch', head: 'Pinned back', text: `${pc(them.tilt)} of their time on the ball has been in our third, and ${plural(them.boxEntries, 'time')} into our box.`, score: 0.8 + z('tilt', them.tilt) * 0.2 })

  // ---- the scoreline against the chances
  const [gf, ga] = o.goals
  if (Math.abs(gf - ga - (xgUs - xgThem)) >= 1.1 && xgUs + xgThem >= 0.8) {
    const flatters = gf - ga > xgUs - xgThem
    out.push({ key: 'luck', tone: 'neutral', icon: 'scale', head: flatters ? 'The score flatters us' : 'The score is harsh on us', text: `xG ${x2(xgUs)}–${x2(xgThem)}: ${flatters ? 'the finishing (ours or theirs) has gone our way' : "on the chances, we've done better than the scoreline says"}.`, score: 0.9 + Math.abs(gf - ga - (xgUs - xgThem)) * 0.3 })
  }

  // ---- who isn't getting on the ball
  if (o.players) {
    const quiet = o.players
      .filter((p) => p.mins >= 25 && GROUP[p.pos] && GROUP[p.pos] !== 'GK')
      .map((p) => { const g = GROUP[p.pos]!, exp = TOUCHES_90[g][0] * (ROLE_TOUCH[p.role || ''] ?? 1) * p.mins / 90; return { p, g, exp, gap: exp - p.touches, r: p.touches / Math.max(1, exp) } })
      .filter((x) => x.r < 0.45 && x.gap >= 8)
      .sort((a, b) => a.r - b.r)
    for (const q of quiet.slice(0, 2)) out.push({
      key: 'quiet:' + q.p.id, tone: 'neutral', icon: 'person', player: q.p.id, head: `${q.p.name} isn't involved`,
      text: q.g === 'ST' || q.g === 'W' ? `${plural(q.p.touches, 'touch', 'touches')} in ${q.p.mins} minutes; a ${GROUP_NAME[q.g]} usually has about ${Math.round(q.exp)} by now. He's being kept out of the game, or the ball isn't reaching him.`
        : `${plural(q.p.touches, 'touch', 'touches')} in ${q.p.mins} minutes; a ${GROUP_NAME[q.g]} usually has about ${Math.round(q.exp)} by now.`,
      score: 0.7 + (1 - q.r),
    })
  }

  return out.sort((a, b) => b.score - a.score)
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ---------------------------------------------------------------- before and after a change
export interface TacticChange { min: number; add: number; side: 0 | 1; text: string; frame: number }

const ROWS: { key: string; label: string; fmt: ChangeRow['fmt']; good: 1 | -1 | 0; get: (us: Ledger, them: Ledger) => number; rate?: boolean }[] = [
  { key: 'poss', label: 'Possession', fmt: 'pct', good: 0, rate: true, get: (u, t) => u.sec / Math.max(1, u.sec + t.sec) },
  { key: 'shots', label: 'Shots', fmt: 'n1', good: 1, get: (u) => u.shots },
  { key: 'xg', label: 'xG', fmt: 'n2', good: 1, get: (u) => u.xg },
  { key: 'xga', label: 'xG against', fmt: 'n2', good: -1, get: (_, t) => t.xg },
  { key: 'entries', label: 'Into their third', fmt: 'n1', good: 1, get: (u) => u.entries[0] + u.entries[1] + u.entries[2] },
  { key: 'box', label: 'Into their box', fmt: 'n1', good: 1, get: (u) => u.boxEntries },
  { key: 'boxA', label: 'Into our box', fmt: 'n1', good: -1, get: (_, t) => t.boxEntries },
  { key: 'wonHigh', label: 'Won in their third', fmt: 'n1', good: 1, get: (u) => u.won[2] },
  { key: 'passAcc', label: 'Pass completion', fmt: 'pct', good: 1, rate: true, get: (u) => u.passesOk / Math.max(1, u.passes) },
  { key: 'ctrA', label: 'Counter shots against', fmt: 'n1', good: -1, get: (_, t) => t.by.counter?.[0] || 0 },
]

/**
 * For each of `side`'s tactical changes, what the side did before it and after it (to the next change, or the end), per
 * 90 minutes. A row is marked clear only when the difference is bigger than the stretch lengths make likely by chance.
 */
export function changeReports(frames: Frame[], changes: TacticChange[], side: 0 | 1, events: MatchEvent[]): ChangeReport[] {
  const mine = changes.filter((c) => c.side === side && c.frame > 0 && c.frame < frames.length)
  const out: ChangeReport[] = []
  const o = (1 - side) as 0 | 1
  const at = (i: number): [Ledger, Ledger] => (i >= 0 ? frames[i].L : [emptyLedger(), emptyLedger()])
  mine.forEach((c, k) => {
    const a0 = k > 0 ? mine[k - 1].frame - 1 : -1
    const cut = c.frame - 1
    const b1 = k < mine.length - 1 ? mine[k + 1].frame - 1 : frames.length - 1
    if (cut <= a0 || b1 <= cut) return
    const mb = cut - a0, ma = b1 - cut
    const [B0, B1, A1] = [at(a0), at(cut), at(b1)]
    const ub = ledgerDiff(B1[side], B0[side]), tb = ledgerDiff(B1[o], B0[o])
    const ua = ledgerDiff(A1[side], B1[side]), ta = ledgerDiff(A1[o], B1[o])
    const rows: ChangeRow[] = ROWS.map((r) => {
      const vb = r.get(ub, tb), va = r.get(ua, ta)
      const before = r.rate ? vb : vb * 90 / mb, after = r.rate ? va : va * 90 / ma
      let clear = false
      if (mb >= 10 && ma >= 10) {
        if (r.key === 'poss') clear = Math.abs(after - before) >= 0.08 + 0.4 / Math.sqrt(Math.min(mb, ma))
        else if (r.key === 'passAcc') clear = Math.abs(after - before) >= 0.05 && ub.passes >= 60 && ua.passes >= 60
        else {
          // counts: a Poisson read of the two rates (xG is treated as counts of a tenth of a goal)
          const sc = r.fmt === 'n2' ? 10 : 1
          const se = Math.sqrt(vb * sc / (mb * mb) + va * sc / (ma * ma) + 1 / (mb * ma)) * 90 / sc
          clear = Math.abs(after - before) >= 2 * se
        }
      }
      return { key: r.key, label: r.label, fmt: r.fmt, good: r.good, before, after, clear }
    })
    // what else changed in the stretch after it: the scoreline, players sent off, the other side's own changes
    const inAfter = (e: MatchEvent) => { const i = frameAt(frames, e.min, e.add || 0); return i > cut && i <= b1 }
    const notes: string[] = []
    const goals = events.filter((e) => (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && inAfter(e))
    if (goals.length) notes.push(`${plural(goals.length, 'goal')} in the period after it changed the game state too: sides behind push on, sides ahead sit in.`)
    const reds = events.filter((e) => (e.type === 'red' || e.type === 'secondYellow') && inAfter(e))
    if (reds.length) notes.push(`A sending-off in that period (${reds.map((e) => `${e.min}'`).join(', ')}) changes everything after it.`)
    const theirs = events.filter((e) => e.side === o && (e.type === 'tactic' || e.type === 'sub') && inAfter(e))
    if (theirs.length) notes.push(`They made ${plural(theirs.length, 'change')} of their own in that time.`)
    if (Math.min(mb, ma) < 20) notes.push(`${Math.min(mb, ma)} minutes is a short stretch: most of these differences are what any ${Math.min(mb, ma)} minutes vary by.`)
    // one line: what moved clearly, the good news first (possession is neither good nor bad on its own)
    const moved = (r: ChangeRow) => `${r.after > r.before ? 'more' : 'fewer'} ${r.label.toLowerCase()}`.replace('more possession', 'more of the ball').replace('fewer possession', 'less of the ball').replace('fewer pass completion', 'a lower pass completion').replace('more pass completion', 'a higher pass completion').replace('fewer xg', 'less xG').replace('more xg', 'more xG').replace('xg against', 'xG against')
    const clearRows = rows.filter((r) => r.clear)
    const better = clearRows.filter((r) => r.good !== 0 && (r.after > r.before) === (r.good > 0)).map(moved)
    const worse = clearRows.filter((r) => r.good !== 0 && (r.after > r.before) !== (r.good > 0)).map(moved)
    const neutral = clearRows.filter((r) => r.good === 0).map(moved)
    const first = [...neutral, ...better]
    const read = !clearRows.length ? 'Nothing clear either way: the numbers before and after are within what stretches this long vary by anyway.'
      : `Afterwards: ${first.join(', ')}${worse.length ? `${first.length ? ', but ' : ''}${worse.join(', ')}` : ''}.`
    out.push({ min: c.min, add: c.add, text: c.text, minsBefore: mb, minsAfter: ma, rows, notes, read })
  })
  return out
}
