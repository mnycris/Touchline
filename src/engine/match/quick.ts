// ============================================================================
// Fast statistical match simulation for leagues outside the deep-simulation set.
//
// Fitted to the action engine: the goal rate of each side comes from the strength gap between the two XIs on the
// day (positional ratings, fitness, sharpness, morale, form, home advantage), with the same gradient, margin
// distribution and draw rate. Scorers, assisters, cards, substitutions, injuries, ratings and team stats are drawn
// so season numbers (golden boots, assists, clean sheets, average ratings) look like the deep leagues'.
// ============================================================================
import type { MatchEvent, MatchPlayerStats, MatchResult, Player, Position, TeamMatchStats } from '../../domain/types'
import { A } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { formationOf } from '../../domain/constants'
import { posRating } from '../../domain/ratings'
import type { MatchContext, SideInput } from './engine'
import { CLEAN_SHEET, GOAL_W, RGROUP, type RG } from './rating'
import { keeperQuality, penaltyChance, takerQuality } from './penalty'

const ASSIST_W: Record<RG, number> = { GK: 0.02, CB: 0.1, FB: 0.45, DM: 0.3, CM: 0.65, AM: 1, W: 0.95, ST: 0.45 }
// bookings per 90 by position as the action engine gives them (aggression sharpens it, but only a little)
const CARD_W: Record<RG, number> = { GK: 0.08, CB: 0.75, FB: 0.68, DM: 1.15, CM: 1.05, AM: 0.78, W: 0.6, ST: 0.62 }
const WORK: Record<RG, number> = { GK: 0.15, CB: 0.8, FB: 1.06, DM: 0.96, CM: 1.1, AM: 0.96, W: 1.05, ST: 0.95 }
/**
 * Shots per 90 and xG per shot by position, as top-flight players (and the action engine) produce them. Shots are
 * shared out with the first and every goal's scorer is drawn from the first times the second, so a player's goals,
 * shots and xG tell the same story: strikers get the best chances, centre-backs a few headers, wingers plenty of both.
 */
const SHOT90: Record<RG, number> = { GK: 0, CB: 0.55, FB: 0.45, DM: 0.6, CM: 1.0, AM: 2.1, W: 2.0, ST: 2.6 }
const XG_SHOT: Record<RG, number> = { GK: 0, CB: 0.085, FB: 0.06, DM: 0.055, CM: 0.065, AM: 0.09, W: 0.1, ST: 0.15 }
/** What a typical player in each position rates for the attributes below (the rates above already carry the position). */
const K_REF: Record<RG, number> = { GK: 40, CB: 74, FB: 51, DM: 55, CM: 63, AM: 69, W: 66, ST: 72 }
const PASS_W: Record<RG, number> = { GK: 0.28, CB: 1.25, FB: 1.1, DM: 1.2, CM: 1.45, AM: 1.2, W: 0.95, ST: 0.55 }
const DEF_W: Record<RG, number> = { GK: 0, CB: 1, FB: 1, DM: 1.3, CM: 1, AM: 0.6, W: 0.65, ST: 0.5 }

interface QP { p: Player; pos: Position; g: RG; side: 0 | 1; mins: number; on: number; off: number; st: MatchPlayerStats }

/** How often a player gets a shot away: his position's rate, sharpened by the attributes that win chances there. */
function shotW(q: QP): number {
  const a = q.p.attrs
  const k = q.g === 'CB' ? a[A.heading] * 0.6 + a[A.jumping] * 0.4 : a[A.finishing] * 0.45 + a[A.positioning] * 0.35 + a[A.longShots] * 0.2
  return SHOT90[q.g] * Math.pow(Math.max(30, k) / K_REF[q.g], 1.5)
}
/** How likely a shot of his goes in: the quality of chance his position gets, and his finishing (or heading). */
function finishW(q: QP): number {
  const k = q.g === 'CB' ? q.p.attrs[A.heading] : q.p.attrs[A.finishing] * 0.7 + q.p.attrs[A.composure] * 0.3
  return XG_SHOT[q.g] * Math.pow(Math.max(30, k) / K_REF[q.g], 1.2)
}

function poisson(rng: Rng, lambda: number) { return Math.min(9, rng.poisson(Math.max(0.02, lambda))) }

/** XI strength on the day, in rating points. */
function strength(s: SideInput, rng: Rng, boost: number): number {
  const f = formationOf(s.sheet.formation)
  let sum = 0, n = 0
  s.sheet.lineup.forEach((id, i) => {
    const p = s.players[id]
    if (!p || !f.slots[i]) return
    const cond = (0.9 + 0.1 * clamp(p.fitness, 0, 100) / 100) * (0.95 + 0.05 * clamp(p.sharpness, 0, 100) / 100) * (0.98 + 0.04 * (p.morale - 50) / 50)
    sum += posRating(p, f.slots[i].pos) * cond
    n++
  })
  const avg = n ? sum / n : 50
  return avg * boost - (11 - n) * 3 + rng.normal(0, 1.2)
}

export function quickSim(home: SideInput, away: SideInput, ctx: MatchContext, seed: number): MatchResult {
  const rng = new Rng(seed ^ 0x2c1b3c6d)
  const us = ctx.userSide
  const boost = (i: 0 | 1) => (us === 0 || us === 1 ? (i === us ? 1 : ctx.aiBoost ?? 1) : 1)
  const sides = [home, away]
  const str = [strength(home, rng, boost(0)), strength(away, rng, boost(1))]
  const gap = str[0] - str[1] + (ctx.neutral ? 0 : 2)
  const k = (g: number) => (g >= 0 ? 0.056 * g : 0.068 * g)
  const lam = [1.26 * Math.exp(k(gap)) * Math.exp(rng.normal(0, 0.1)), 1.26 * Math.exp(k(-gap)) * Math.exp(rng.normal(0, 0.1))]
  // --- players and minutes
  const ps: QP[] = []
  const events: MatchEvent[] = []
  for (const i of [0, 1] as const) {
    const s = sides[i]
    const f = formationOf(s.sheet.formation)
    s.sheet.lineup.forEach((id, slot) => {
      const p = s.players[id]
      if (!p) return
      const pos = f.slots[slot]?.pos || p.positions[0]
      ps.push({ p, pos, g: RGROUP[pos], side: i, mins: 90, on: 0, off: 90, st: blank(p.id, i, pos, true) })
    })
    // substitutions: tired and poor-form players make way for the freshest like-for-like options
    const nSubs = clamp(Math.round(rng.normal(4, 0.8)), 2, 5)
    const bench = s.sheet.bench.map((id) => s.players[id]).filter(Boolean) as Player[]
    const starters = ps.filter((q) => q.side === i && q.g !== 'GK')
    for (let k2 = 0; k2 < nSubs && bench.length; k2++) {
      const out = rng.weighted(starters.filter((q) => q.off === 90), (q) => (1.6 - q.p.attrs[A.stamina] / 100) * (q.g === 'CB' ? 0.5 : 1) * (q.p.fitness < 80 ? 1.6 : 1))
      if (!out) break
      const bi = bench.reduce((best, b, idx) => (posRating(b, out.pos) > posRating(bench[best], out.pos) ? idx : best), 0)
      const inn = bench.splice(bi, 1)[0]
      const minute = clamp(Math.round(rng.normal(70, 11)), 46, 89)
      out.off = minute
      out.mins = minute
      out.st.subOff = minute
      const q: QP = { p: inn, pos: out.pos, g: out.g, side: i, mins: 90 - minute, on: minute, off: 90, st: blank(inn.id, i, out.pos, false) }
      q.st.subOn = minute
      ps.push(q)
      events.push({ min: minute, type: 'sub', side: i, player: inn.id, player2: out.p.id, text: '' })
    }
  }
  const onAt = (q: QP, m: number) => q.on <= m && q.off >= m
  // penalties: the designated taker if he is on, else the best taker on the pitch, against the keeper on the day,
  // with the action engine's model (penalty.ts)
  const penTaker = (side: 0 | 1, minute: number) => {
    const on = ps.filter((q) => q.side === side && onAt(q, minute) && q.g !== 'GK')
    return on.find((q) => q.p.id === sides[side].sheet.penalties) || [...on].sort((a, b) => takerQuality(b.p) - takerQuality(a.p))[0]
  }
  const penOdds = (side: 0 | 1, t: QP, pressure = 0) => penaltyChance(takerQuality(t.p), t.p.attrs[A.composure], keeperQuality(ps.find((q) => q.side !== side && q.g === 'GK' && q.off >= 90)?.p), pressure, t.p.foot === 'L' ? 'L' : 'R')
  // --- goals
  // a shared component (open games stay open, tight ones stay tight) gives the engine's draw rate
  const common = poisson(rng, 0.14)
  const score: [number, number] = [Math.min(9, poisson(rng, lam[0] - 0.14) + common), Math.min(9, poisson(rng, lam[1] - 0.14) + common)]
  const goalEvents = (side: 0 | 1, n: number, from: number, to: number) => {
    for (let g = 0; g < n; g++) {
      const minute = clamp(Math.round(from + (to - from) * Math.pow(rng.next(), 0.92)), from + 1, to)
      const mates = ps.filter((q) => q.side === side && onAt(q, minute))
      const opp = ps.filter((q) => q.side !== side && onAt(q, minute))
      const u = rng.next()
      if (u < 0.03 && opp.length) {
        const og = rng.weighted(opp, (q) => (q.g === 'CB' ? 3 : q.g === 'FB' || q.g === 'DM' ? 1.2 : 0.3))
        og.st.ownGoals = (og.st.ownGoals || 0) + 1
        events.push({ min: minute, type: 'owngoal', side, player: og.p.id, text: '', big: true })
        continue
      }
      // about one goal in twelve is a penalty, a few more for a side with a reliable taker
      const taker = penTaker(side, minute)
      if (taker && u < 0.03 + 0.085 * (penOdds(side, taker) / 0.78)) {
        taker.st.goals++; taker.st.shots++; taker.st.sot++; taker.st.xg += 0.76
        events.push({ min: minute, type: 'penGoal', side, player: taker.p.id, text: '', xg: 0.76, big: true })
        continue
      }
      // the same pick that shares out the shots, weighted by how well each converts them
      const scorer = rng.weighted(mates, (q) => shotW(q) * finishW(q))
      if (!scorer) continue
      scorer.st.goals++
      scorer.st.shots++
      scorer.st.xg += XG_SHOT[scorer.g] * 1.6
      let assister: QP | undefined
      if (rng.next() < 0.72) {
        const pool = mates.filter((q) => q !== scorer)
        if (pool.length) assister = rng.weighted(pool, (q) => ASSIST_W[q.g] * Math.pow(Math.max(30, q.p.attrs[A.vision] * 0.5 + q.p.attrs[A.shortPassing] * 0.3 + q.p.attrs[A.crossing] * 0.2) / 70, 4))
        if (assister) { assister.st.assists++; assister.st.keyPasses++ }
      }
      events.push({ min: minute, type: 'goal', side, player: scorer.p.id, player2: assister?.p.id, text: '', big: true })
    }
  }
  goalEvents(0, score[0], 0, 90)
  goalEvents(1, score[1], 0, 90)
  // the penalties that were missed
  for (const i of [0, 1] as const) {
    const minute = clamp(Math.round(rng.next() * 90), 3, 90)
    const taker = penTaker(i, minute)
    // a side is awarded about 0.15 penalties a game; the ones its taker does not score are the misses
    if (!taker || rng.next() >= 0.15 * (1 - penOdds(i, taker))) continue
    taker.st.shots++; taker.st.xg += 0.76
    events.push({ min: minute, type: 'penMiss', side: i, player: taker.p.id, text: '', xg: 0.76, big: true })
  }
  let regScore: [number, number] | undefined
  let pens: [number, number] | undefined
  const agg = ctx.aggregate || [0, 0]
  const level = () => score[0] + agg[0] === score[1] + agg[1]
  if (ctx.knockout && level()) {
    regScore = [...score] as [number, number]
    if (ctx.extraTime && !ctx.penaltiesOnly) {
      const e0 = poisson(rng, lam[0] / 3.3), e1 = poisson(rng, lam[1] / 3.3)
      score[0] += e0; score[1] += e1
      for (const q of ps) if (q.off === 90) { q.off = 120; q.mins += 30 }
      goalEvents(0, e0, 90, 120)
      goalEvents(1, e1, 90, 120)
    }
    if (level()) {
      // the five best takers left on the pitch, under shoot-out pressure
      const pk = (i: 0 | 1) => {
        const xs = ps.filter((q) => q.side === i && q.off >= 90 && q.g !== 'GK').sort((a, b) => takerQuality(b.p) - takerQuality(a.p)).slice(0, 5)
        return xs.length ? xs.reduce((a, q) => a + penOdds(i, q, 0.035), 0) / xs.length : 0.7
      }
      const p0 = pk(0), p1 = pk(1)
      let a = 0, b = 0
      for (let r = 0; r < 5; r++) { if (rng.next() < p0) a++; if (rng.next() < p1) b++ }
      while (a === b) { if (rng.next() < p0) a++; if (rng.next() < p1) b++ }
      pens = [a, b]
      events.push({ min: 120, type: 'pens', side: -1, text: '' })
    }
  }
  events.sort((x, y) => x.min - y.min)
  // running score on each event
  const run: [number, number] = [0, 0]
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'penGoal') run[e.side as 0 | 1]++
    else if (e.type === 'owngoal') run[e.side as 0 | 1]++
    e.score = [...run] as [number, number]
  }
  // --- cards
  for (const i of [0, 1] as const) {
    const pool = ps.filter((q) => q.side === i)
    const ny = poisson(rng, 1.48 * ctx.strictness * (ctx.derby ? 1.2 : 1))
    for (let c = 0; c < ny; c++) {
      const q = rng.weighted(pool, (x) => CARD_W[x.g] * Math.pow(x.p.attrs[A.aggression] / 65, 0.9) * (x.mins / 90))
      if (!q) continue
      const minute = clamp(Math.round(q.on + rng.next() * Math.max(1, q.off - q.on)), 1, 90)
      if (q.st.yellow) {
        if (rng.next() < 0.18 && !q.st.red) { q.st.red = true; q.off = Math.min(q.off, minute); q.mins = Math.max(1, q.off - q.on); events.push({ min: minute, type: 'secondYellow', side: i, player: q.p.id, text: '' }) }
        continue
      }
      q.st.yellow = true
      events.push({ min: minute, type: 'yellow', side: i, player: q.p.id, text: '' })
    }
    if (rng.next() < 0.035 * ctx.strictness) {
      const q = rng.weighted(pool.filter((x) => !x.st.red), (x) => CARD_W[x.g] * (x.mins / 90))
      if (q) {
        const minute = clamp(Math.round(q.on + rng.next() * Math.max(1, q.off - q.on)), 5, 90)
        q.st.red = true
        q.off = Math.min(q.off, minute)
        q.mins = Math.max(1, q.off - q.on)
        events.push({ min: minute, type: 'red', side: i, player: q.p.id, text: '' })
      }
    }
  }
  // --- injuries
  for (const q of ps) {
    const pInj = 0.013 * ctx.injuryRate * (0.6 + q.p.hidden.injuryProne / 60) * (q.mins / 90) * (q.p.fitness < 70 ? 1.6 : 1)
    if (rng.next() < pInj) q.st.injured = true
  }
  events.sort((x, y) => x.min - y.min)
  // --- team stats
  const poss0 = clamp(Math.round(50 + (str[0] - str[1]) * 1.1 + rng.normal(0, 5)), 24, 76)
  const team = (i: 0 | 1): TeamMatchStats => {
    const g = score[i]
    const shots = Math.max(g, Math.round(lam[i] * 8.8 + rng.normal(0, 2.2)))
    const sot = clamp(Math.round(shots * 0.35 + rng.normal(0, 1)), g, shots)
    const poss = i === 0 ? poss0 : 100 - poss0
    const passes = Math.max(180, Math.round(510 * poss / 50 + rng.normal(0, 40)))
    return {
      possession: poss, shots, sot, xg: Math.round(Math.max(0.08, lam[i] * 0.98 + rng.normal(0, 0.28)) * 100) / 100, passes,
      passAcc: clamp(Math.round(80 + (poss - 50) * 0.25 + rng.normal(0, 2.5)), 62, 93), corners: poisson(rng, 4.4 * Math.sqrt(lam[i] / 1.36)),
      fouls: poisson(rng, 10), offsides: poisson(rng, 1.8), yellows: 0, reds: 0, saves: 0, bigChances: poisson(rng, lam[i] * 0.72),
    }
  }
  const stats: [TeamMatchStats, TeamMatchStats] = [team(0), team(1)]
  stats[0].saves = Math.max(0, stats[1].sot - score[1])
  stats[1].saves = Math.max(0, stats[0].sot - score[0])
  for (const e of events) {
    if (e.side === -1) continue
    if (e.type === 'yellow') stats[e.side].yellows++
    if (e.type === 'red' || e.type === 'secondYellow') { stats[e.side].reds++; if (e.type === 'secondYellow') stats[e.side].yellows++ }
  }
  // --- player numbers and ratings
  const won = (i: 0 | 1) => (pens ? (pens[i] > pens[1 - i] ? 1 : -1) : score[i] > score[1 - i] ? 1 : score[i] < score[1 - i] ? -1 : 0)
  for (const i of [0, 1] as const) {
    const mine = ps.filter((q) => q.side === i && q.mins > 0)
    const ts = stats[i]
    const shotsLeft = Math.max(0, ts.shots - mine.reduce((a, q) => a + q.st.shots, 0))
    spread(rng, mine, shotsLeft, shotW, (q, n) => { q.st.shots += n; q.st.xg += n * XG_SHOT[q.g] })
    for (const q of mine) {
      q.st.sot = Math.min(q.st.shots, q.st.goals + Math.max(0, Math.round((q.st.shots - q.st.goals) * 0.3 + rng.next() - 0.5)))
      q.st.xg = Math.round(q.st.xg * 100) / 100
    }
    spread(rng, mine, ts.passes, (q) => PASS_W[q.g], (q, n) => { q.st.passes = n; q.st.passesCompleted = Math.round(n * clamp(ts.passAcc / 100 + (q.g === 'CB' ? 0.04 : q.g === 'ST' ? -0.08 : 0) + rng.normal(0, 0.03), 0.5, 0.97)) })
    spread(rng, mine, poisson(rng, 12.5), (q) => DEF_W[q.g], (q, n) => { q.st.tackles += n })
    spread(rng, mine, poisson(rng, 9), (q) => DEF_W[q.g] * (q.g === 'CB' || q.g === 'DM' ? 1.4 : 1), (q, n) => { q.st.interceptions += n })
    spread(rng, mine, Math.max(0, poisson(rng, lam[i] * 7) - mine.reduce((a, q) => a + q.st.keyPasses, 0)), (q) => ASSIST_W[q.g], (q, n) => { q.st.keyPasses += n })
    const gk = mine.find((q) => q.g === 'GK')
    if (gk) gk.st.saves = stats[i].saves
    const conceded = score[1 - i]
    const res = won(i)
    for (const q of mine) {
      q.st.mins = q.mins
      const g = q.g
      let r = 6.58 + rng.normal(0, 0.44) + (str[i] - str[1 - i]) * 0.012 + (g === 'GK' ? 0.18 : g === 'CB' ? 0.16 : g === 'FB' ? 0.2 : g === 'AM' || g === 'ST' ? -0.1 : 0)
      r += q.st.goals * (0.95 * GOAL_W[g] + 0.05) + q.st.assists * 0.5 + q.st.keyPasses * 0.06 + (q.st.shots - q.st.goals) * 0.01
      r += (q.st.tackles + q.st.interceptions) * 0.06
      if (conceded === 0) r += CLEAN_SHEET[g] * Math.min(1, q.mins / 90) * (q.mins >= 60 ? 1 : 0.4)
      if (g === 'GK') r += q.st.saves * 0.12 - conceded * 0.2
      else if (g === 'CB' || g === 'FB') r -= conceded * 0.06
      r += (res > 0 ? 0.16 : res < 0 ? -0.1 : 0.02) * Math.min(1, q.mins / 90)
      if (q.st.yellow) r -= 0.2
      if (q.st.red) r -= 1.2
      if ((q.st.ownGoals || 0) > 0) r -= 0.7
      r = 6.2 + (r - 6.2) * clamp(q.mins / 75, 0.35, 1)
      if (r > 7.4) r = 7.4 + (r - 7.4) * 0.72
      if (r < 6.3) r = 6.3 - (6.3 - r) * 0.72
      q.st.rating = Math.round(clamp(r, 3, 10) * 10) / 10
      // energy after the game (the world uses it as post-match fitness)
      const stam = q.p.attrs[A.stamina]
      const drain = 0.42 * WORK[g] * (1.55 - (stam / 100) * 0.95)
      q.st.energy = Math.round(clamp(q.p.fitness - drain * q.mins, 5, 100))
    }
  }
  const players = ps.filter((q) => q.mins > 0 || q.st.started).map((q) => q.st)
  const winnerSide = pens ? (pens[0] > pens[1] ? 0 : 1) : score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : -1
  const motm = [...players].sort((a, b) => (b.rating + (b.side === winnerSide ? 0.25 : 0)) - (a.rating + (a.side === winnerSide ? 0.25 : 0)))[0]
  return {
    score, ht: [events.filter((e) => e.min <= 45 && (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.side === 0).length, events.filter((e) => e.min <= 45 && (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.side === 1).length],
    et: regScore, pens, events, stats, players, motm: motm?.id, attendance: ctx.attendance, detail: 'stats',
    lineups: [home.sheet.lineup, away.sheet.lineup], formations: [home.sheet.formation, away.sheet.formation], captains: [home.sheet.captain, away.sheet.captain],
  }
}

function blank(id: number, side: 0 | 1, pos: Position, started: boolean): MatchPlayerStats {
  return { id, side, pos, mins: 0, rating: 6, goals: 0, assists: 0, shots: 0, sot: 0, xg: 0, passes: 0, passesCompleted: 0, keyPasses: 0, tackles: 0, interceptions: 0, saves: 0, fouls: 0, yellow: false, red: false, started }
}

/** Share `total` among players by weight × minutes, integer counts. */
function spread(rng: Rng, qs: QP[], total: number, w: (q: QP) => number, set: (q: QP, n: number) => void) {
  const ws = qs.map((q) => Math.max(0, w(q)) * (q.mins / 90))
  const sum = ws.reduce((a, b) => a + b, 0)
  if (!sum || total <= 0) { for (const q of qs) set(q, 0); return }
  const exact = ws.map((x) => (x / sum) * total)
  const counts = exact.map(Math.floor)
  // the leftovers go by the fractions that were cut off, so small shares (a centre-back's half a shot) are kept on average
  const frac = exact.map((x, i) => x - counts[i])
  let left = total - counts.reduce((a, b) => a + b, 0)
  while (left-- > 0) counts[rng.weighted(frac.map((_, i) => i), (i) => frac[i])]++
  qs.forEach((q, i) => set(q, counts[i]))
}
