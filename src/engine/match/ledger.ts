// The tactical ledger: what each side actually did, counted by the match engine as it happens. Everything the game
// says about how a match is being played (the half-time report, the live analysis, the before/after comparison of a
// tactical change, the Tactics Lab) is read from these counters, so an observation is always a measurement.
//
// Frames: zones are in the frame of the side the number belongs to (x 0 own goal → 100 opponent goal).

export const LANES = ['left', 'centre', 'right'] as const

export interface Ledger {
  /** seconds on the ball */
  sec: number
  /** possessions: times this side came into possession of the ball */
  spells: number
  passes: number
  passesOk: number
  /** forward passes: progressive, long forward and through balls */
  fwd: number
  fwdOk: number
  back: number
  long: number
  longOk: number
  through: number
  throughOk: number
  crosses: number
  crossesOk: number
  /** carries that took the ball 10m or more upfield */
  progCarries: number
  dribbles: number
  dribblesOk: number
  /** where possession was lost: own / middle / final third (this side's frame) */
  lost: [number, number, number]
  /** of those, lost to a tackle or press while on the ball */
  lostPressed: number
  /** where the ball was won back: own / middle / final third */
  won: [number, number, number]
  /** won back within 8 seconds of losing it */
  quickWon: number
  /** possessions that broke straight into a counter-attack */
  counters: number
  /** entries into the final third with the ball, by lane (left / centre / right from this side's view) */
  entries: [number, number, number]
  boxEntries: number
  /** seconds on the ball in the opponent's third / in its own third */
  tFinal: number
  tOwn: number
  shots: number
  sot: number
  xg: number
  /** shots and xG by how the chance came: through, cross, cutback, counter, box, long, solo, corner, freekick, pen ... */
  by: Record<string, [number, number]>
  fouls: number
}

export function emptyLedger(): Ledger {
  return {
    sec: 0, spells: 0, passes: 0, passesOk: 0, fwd: 0, fwdOk: 0, back: 0, long: 0, longOk: 0, through: 0, throughOk: 0, crosses: 0, crossesOk: 0,
    progCarries: 0, dribbles: 0, dribblesOk: 0, lost: [0, 0, 0], lostPressed: 0, won: [0, 0, 0], quickWon: 0, counters: 0, entries: [0, 0, 0], boxEntries: 0,
    tFinal: 0, tOwn: 0, shots: 0, sot: 0, xg: 0, by: {}, fouls: 0,
  }
}

export function cloneLedger(l: Ledger): Ledger {
  const by: Record<string, [number, number]> = {}
  for (const k in l.by) by[k] = [l.by[k][0], l.by[k][1]]
  return { ...l, lost: [...l.lost] as Ledger['lost'], won: [...l.won] as Ledger['won'], entries: [...l.entries] as Ledger['entries'], by }
}

/** b − a: what happened between two snapshots. */
export function ledgerDiff(b: Ledger, a: Ledger): Ledger {
  const out = emptyLedger()
  for (const k of Object.keys(out) as (keyof Ledger)[]) {
    const v = b[k], w = a[k]
    if (typeof v === 'number') (out as any)[k] = v - (w as number)
    else if (Array.isArray(v)) (out as any)[k] = (v as number[]).map((x, i) => x - ((w as number[])[i] || 0))
  }
  for (const k in b.by) {
    const p = a.by[k] || [0, 0]
    const d: [number, number] = [b.by[k][0] - p[0], b.by[k][1] - p[1]]
    if (d[0] > 0) out.by[k] = d
  }
  return out
}

export function addLedger(into: Ledger, x: Ledger) {
  for (const k of Object.keys(into) as (keyof Ledger)[]) {
    const v = x[k]
    if (typeof v === 'number') (into as any)[k] += v
    else if (Array.isArray(v)) (v as number[]).forEach((n, i) => { ((into as any)[k] as number[])[i] += n })
  }
  for (const k in x.by) {
    const t = (into.by[k] ||= [0, 0])
    t[0] += x.by[k][0]
    t[1] += x.by[k][1]
  }
}

export const third = (x: number) => (x < 33.3 ? 0 : x < 66.6 ? 1 : 2)
export const lane = (y: number) => (y < 33.3 ? 0 : y > 66.6 ? 2 : 1)

/** The figures a person reads, for one side over a stretch of play (with the other side's ledger for context). */
export interface LedgerView {
  minutes: number
  poss: number
  passes: number
  passAcc: number
  /** passes per possession */
  spell: number
  /** share of passes played forward, and how many of those found a team-mate */
  fwdShare: number
  fwdAcc: number
  longShare: number
  /** share of the possessions that reached the final third */
  reach: number
  entries: number
  entryLanes: [number, number, number]
  boxEntries: number
  /** share of the time on the ball spent in the opponent's third */
  tilt: number
  lostOwn: number
  lostMid: number
  lostFinal: number
  lostPressed: number
  wonHigh: number
  wonMid: number
  wonOwn: number
  quickWon: number
  counters: number
  shots: number
  sot: number
  xg: number
  by: Record<string, [number, number]>
  progCarries: number
  dribbles: number
  dribbleAcc: number
  crosses: number
  crossAcc: number
}

export function viewOf(l: Ledger, o: Ledger, minutes: number): LedgerView {
  const tot = l.sec + o.sec || 1
  const pct = (a: number, b: number) => (b > 0 ? a / b : 0)
  return {
    minutes,
    poss: l.sec / tot,
    passes: l.passes,
    passAcc: pct(l.passesOk, l.passes),
    spell: pct(l.passes, l.spells),
    fwdShare: pct(l.fwd, l.passes),
    fwdAcc: pct(l.fwdOk, l.fwd),
    longShare: pct(l.long, l.passes),
    reach: Math.min(1, pct(l.entries[0] + l.entries[1] + l.entries[2], l.spells)),
    entries: l.entries[0] + l.entries[1] + l.entries[2],
    entryLanes: [...l.entries] as [number, number, number],
    boxEntries: l.boxEntries,
    tilt: pct(l.tFinal, l.sec),
    lostOwn: l.lost[0], lostMid: l.lost[1], lostFinal: l.lost[2], lostPressed: l.lostPressed,
    wonHigh: l.won[2], wonMid: l.won[1], wonOwn: l.won[0], quickWon: l.quickWon,
    counters: l.counters,
    shots: l.shots, sot: l.sot, xg: l.xg, by: l.by,
    progCarries: l.progCarries, dribbles: l.dribbles, dribbleAcc: pct(l.dribblesOk, l.dribbles),
    crosses: l.crosses, crossAcc: pct(l.crossesOk, l.crosses),
  }
}
