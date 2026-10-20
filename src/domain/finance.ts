import type { Club, LeagueDef, Player } from './types'
import { ageOn } from './dates'

/** EA-style market value formula (EUR). */
export function formulaValue(ovr: number, pot: number, age: number, pos: string): number {
  let v = 11_500_000 * Math.pow(1.205, ovr - 75)
  // youth premium from potential headroom
  const head = Math.max(0, pot - ovr)
  if (age <= 23) v *= Math.pow(1.13, head * (age <= 19 ? 0.85 : age <= 21 ? 0.7 : 0.5))
  // age curve
  const ageF = age <= 17 ? 0.75 : age <= 21 ? 1.1 : age <= 25 ? 1.15 : age <= 27 ? 1.05 : age <= 29 ? 0.9 : age <= 30 ? 0.72 : age <= 31 ? 0.58 : age <= 32 ? 0.45 : age <= 33 ? 0.33 : age <= 34 ? 0.24 : age <= 35 ? 0.16 : 0.1
  v *= ageF
  if (pos === 'GK') v *= 0.72
  if (pos === 'CB' || pos === 'CDM') v *= 0.92
  if (v < 25_000) v = 25_000 + ovr * 500
  return roundValue(v)
}

export function roundValue(v: number): number {
  if (v >= 100_000_000) return Math.round(v / 500_000) * 500_000
  if (v >= 10_000_000) return Math.round(v / 100_000) * 100_000
  if (v >= 1_000_000) return Math.round(v / 50_000) * 50_000
  if (v >= 100_000) return Math.round(v / 5_000) * 5_000
  return Math.round(v / 1_000) * 1_000
}

/** Value multipliers from contract length, form and status. */
export function dynamicValue(p: Player, today: string, calib = 1): number {
  const age = ageOn(p.dob, today)
  let v = formulaValue(p.ovr, p.pot, age, p.positions[0]) * calib
  const seasonEnd = Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 7 ? 1 : 0)
  const yearsLeft = p.contract.until - seasonEnd + 1
  if (p.clubId && yearsLeft <= 0) v *= 0.35
  else if (p.clubId && yearsLeft === 1) v *= 0.72
  const f = p.formRatings.length ? p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length : 6.6
  v *= 1 + Math.max(-0.12, Math.min(0.15, (f - 6.7) * 0.12))
  if (p.injury) v *= 0.9
  return roundValue(v)
}

/**
 * Market wage for a player at a club, calibrated to real 2025/26 levels: an 80-rated regular at a Premier League giant
 * ≈ €105K/wk, 85 ≈ €185K, 90 ≈ €325K; ~€20K for a 75 in the Eredivisie, ~€12K for a 70 in the Championship.
 */
export function marketWage(p: Player, club: Club, league: LeagueDef | undefined, role: string, age: number): number {
  const wealth = league ? league.wealth : 3
  const lf = 0.1 + 0.9 * Math.pow(Math.min(10, wealth) / 10, 1.6)
  const cf = 0.62 + club.prestige.intl * 0.038
  const roleF: Record<string, number> = { Crucial: 1.15, Important: 1, Rotation: 0.85, Sparingly: 0.72, Prospect: 0.6 }
  let w = 105_000 * Math.pow(1.12, p.ovr - 80) * lf * cf * (roleF[role] || 1)
  if (age <= 21) w *= 0.82 + Math.max(0, p.pot - p.ovr) * 0.008
  if (age >= 32) w *= 0.9
  // goalkeepers are paid well below outfield players of the same standing
  if (p.positions[0] === 'GK') w *= 0.72
  return Math.max(500, w)
}

/** What the player's camp asks for: the market rate, a raise on his current deal, but no absurd jumps either way. */
export function wageDemand(p: Player, club: Club, league: LeagueDef | undefined, role: string, today?: string): number {
  const age = today ? ageOn(p.dob, today) : 26
  const market = marketWage(p, club, league, role, age)
  const cur = p.clubId === club.id ? p.contract.wage : p.wage
  let w = market
  if (cur > 0) {
    const raise = p.clubId === club.id ? 1.06 : 1.12
    w = Math.max(market, Math.min(cur * raise, Math.max(market * 1.5, cur * 0.75)))
    // staying, even a player who is badly underpaid asks for at most double what he earns
    if (p.clubId === club.id) w = Math.min(w, Math.max(cur * 2, cur * raise))
  }
  return roundWage(Math.max(500, w))
}

export function roundWage(w: number) {
  if (w >= 100_000) return Math.round(w / 5_000) * 5_000
  if (w >= 10_000) return Math.round(w / 500) * 500
  return Math.round(w / 50) * 50
}

export function fmtMoney(v: number, opts: { sign?: boolean; short?: boolean } = {}): string {
  const s = v < 0 ? '-' : opts.sign && v > 0 ? '+' : ''
  const a = Math.abs(v)
  let out: string
  if (a >= 1_000_000_000) out = `€${(a / 1_000_000_000).toFixed(2)}B`
  else if (a >= 1_000_000) out = `€${(a / 1_000_000).toFixed(a >= 100_000_000 ? 0 : a >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`
  else if (a >= 1_000) out = `€${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`
  else out = `€${Math.round(a)}`
  return s + out
}

export function clubBudget(squadValue: number, league: LeagueDef | undefined, intlPrestige: number, wealthOverride?: number): number {
  const wealth = wealthOverride ?? league?.wealth ?? 3
  const wf = 0.45 + wealth * 0.17
  const b = 5_500_000 * Math.pow(Math.max(0.2, squadValue / 100_000_000), 0.78) * wf * (0.62 + intlPrestige * 0.075)
  return roundValue(Math.max(250_000, b))
}
