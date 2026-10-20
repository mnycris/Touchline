// The loan market between AI clubs. While a window is open, clubs send young players who are not getting games, or
// fringe players they are not counting on, to clubs a level or two below where they would play; the borrowing club
// pays part of the wage. Loans end with the season (season rollover brings everyone home).
import type { Club, Player, World } from '../../domain/types'
import type { Rng } from '../../domain/rng'
import { ageOn, diffDays } from '../../domain/dates'
import { POS_GROUP } from '../../domain/constants'
import { currentWindow } from '../competitions/calendar'
import { rosterOf } from './roster'
import { executeTransfer, makeOffer, roleForBuyer } from './transfers'

/** Who a club could send out: young and behind others, or not part of its plans. Never a regular. */
function loanCandidates(w: World, club: Club): Player[] {
  const squad = rosterOf(w, club.id).filter((p) => !p.loan && !p.injury && p.clubId === club.id)
  if (squad.length <= 22) return []
  const byLine = new Map<string, Player[]>()
  for (const p of squad) { const g = POS_GROUP[p.positions[0]]; byLine.set(g, [...(byLine.get(g) || []), p]) }
  // how many of each line a club keeps: two keepers, the rest by shape
  const keep: Record<string, number> = { GK: 2, DEF: 7, MID: 7, ATT: 5 }
  const out: Player[] = []
  for (const [g, list] of byLine) {
    const sorted = [...list].sort((a, b) => b.ovr - a.ovr)
    for (const p of sorted.slice(keep[g] ?? 6)) {
      const age = ageOn(p.dob, w.date)
      const role = p.contract.role
      // the young who need football, or fringe players the club can do without
      if (age < 18) continue
      if ((age <= 23 && (p.pot - p.ovr >= 3 || role === 'Prospect' || role === 'Sparingly')) || (age <= 27 && role === 'Sparingly')) out.push(p)
    }
  }
  return out
}

const BRITISH = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland'])

/**
 * Where a club loans a player: at home; across Britain to a decent league; to Ireland only a young player from a top
 * English or Scottish side; abroad in Europe only from one of the big five leagues, and then to a strong league.
 */
function canLoanTo(w: World, parent: Club, c: Club, p: Player) {
  if (c.country === parent.country) return true
  const pl = w.leagues[parent.leagueId]?.prestige || 0, bl = w.leagues[c.leagueId]?.prestige || 0
  if (BRITISH.has(parent.country) && BRITISH.has(c.country)) return bl >= 4
  if (BRITISH.has(parent.country) && c.country === 'Republic of Ireland') return pl >= 5 && ageOn(p.dob, w.date) <= 21
  const pc = w.nations[parent.country]?.confed, bc = w.nations[c.country]?.confed
  return pc === 'UEFA' && bc === 'UEFA' && pl >= 8 && bl >= 6
}

/** Clubs where he would play: a level below his club, room in his line, not already full of loanees. */
function borrowersFor(w: World, p: Player, parent: Club): Club[] {
  const ok: { c: Club; score: number }[] = []
  for (const c of Object.values(w.clubs)) {
    if (c.id === parent.id || c.id === w.userClubId || c.national || !c.leagueId) continue
    if (!canLoanTo(w, parent, c, p) || /\s(B|II|U\d\d)$/.test(c.name)) continue
    if (c.squadAvg < p.ovr - 8 || c.squadAvg > p.ovr + 1) continue
    // a club clearly below his own: rivals and peers don't lend each other players
    if (c.reputation > parent.reputation - 4) continue
    const squad = rosterOf(w, c.id)
    if (squad.length >= 30 || squad.filter((q) => q.loan).length >= 3) continue
    const role = roleForBuyer(w, p, c.id)
    if (role !== 'Crucial' && role !== 'Important' && role !== 'Rotation') continue
    // the same country, a known league, the role he would have
    ok.push({ c, score: (c.country === parent.country ? 3 : 0) + (role === 'Important' ? 1.5 : role === 'Crucial' ? 1 : 0) + (w.leagues[c.leagueId]?.prestige || 3) / 4 })
  }
  return ok.sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.c)
}

/** Which of the clubs that would have him takes him: most loans stay in the country when a club there will. */
function pickBorrower(w: World, p: Player, parent: Club, rng: Rng): Club | undefined {
  const to = borrowersFor(w, p, parent)
  const home = to.filter((c) => c.country === parent.country)
  const pool = home.length && rng.next() > 0.15 ? home : to
  return pool.length ? pool[Math.floor(Math.pow(rng.next(), 1.5) * pool.length)] : undefined
}

/** A club in for one of the manager's loan-listed players: one the AI market would send him to. */
export function loanSuitor(w: World, p: Player, rng: Rng): Club | undefined {
  const parent = w.clubs[p.clubId]
  return parent ? pickBorrower(w, p, parent, rng) : undefined
}

/** A few loans a day while a window is open; more on deadline day. */
export function aiLoanMarket(w: World, rng: Rng) {
  const win = currentWindow(w)
  if (!win || !w.settings.aiTransfers) return
  const left = diffDays(win.close, w.date)
  const tries = Math.round((win.name === 'Summer' ? 7 : 5) * (left === 0 ? 2.5 : left <= 3 ? 1.6 : 1))
  const done = (w.flags.loansOut ||= {}) as Record<string, number>
  const parents = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && !c.national && c.leagueId)
  for (let i = 0; i < tries; i++) {
    const parent = parents[Math.floor(rng.next() * parents.length)]
    const key = `${parent.id}:${win.name}:${w.season}`
    if ((done[key] || 0) >= 4) continue
    const cands = loanCandidates(w, parent)
    if (!cands.length) continue
    const p = cands[Math.floor(rng.next() * cands.length)]
    const borrower = pickBorrower(w, p, parent, rng)
    if (!borrower) continue
    const wealthy = (w.leagues[borrower.leagueId]?.wealth || 3) >= (w.leagues[parent.leagueId]?.wealth || 3)
    const o = makeOffer(w, { playerId: p.id, fee: 0, type: 'loan', fromClubId: borrower.id, loanWageSplit: wealthy ? (rng.next() < 0.5 ? 100 : 75) : rng.next() < 0.5 ? 50 : 75 })
    o.userIsBuyer = false; o.userIsSeller = false
    // the loan keeps his contract; the terms only carry the role he is promised at the borrowing club
    executeTransfer(w, o, { years: 0, wage: p.contract.wage, role: roleForBuyer(w, p, borrower.id), releaseClause: 0, signingBonus: 0, bonusGoal: 0, bonusCleanSheet: 0, bonusApp: 0 })
    delete w.transfers.offers[o.id]
    done[key] = (done[key] || 0) + 1
  }
}
