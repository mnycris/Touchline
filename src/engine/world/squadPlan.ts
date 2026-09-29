// AI squad planning. Each club reads its own squad the way a sporting director would: who starts in the manager's
// formation and how good they are at that slot, who covers each line, who is ageing or leaving, and what the budget and
// wage room allow. Recruitment then follows the most pressing need (a lost starter beats a missing third keeper), and
// surplus players are moved on. Clubs differ financially: some spend, some sell, some wait for bargains.
import type { Club, Player, Position, World } from '../../domain/types'
import { formationOf, POS_GROUP } from '../../domain/constants'
import { posRating } from '../../domain/ratings'
import { ageOn } from '../../domain/dates'
import { hashString } from '../../domain/rng'
import { rosterOf } from './roster'

export type FinStyle = 'Ambitious' | 'Balanced' | 'Frugal' | 'Seller'
export type NeedKind = 'starter' | 'depth' | 'succession' | 'upgrade' | 'prospect'

export interface PlanNeed {
  kind: NeedKind
  pos: Position
  /** rating at `pos` a signing must reach */
  minRating: number
  maxAge: number
  minPot?: number
  priority: number
  /** the player this signing would replace or cover */
  replaces?: number
  /** share of the transfer budget this need may use */
  spend: number
}

export interface SlotPlan { pos: Position; label: string; id?: number; rating: number }
export interface SquadPlan {
  clubId: number
  formation: string
  /** mean rating of the best XI at their slots */
  level: number
  slots: SlotPlan[]
  /** best cover per line (by line key) */
  cover: Record<string, { id?: number; rating: number; need: number; have: number }>
  needs: PlanNeed[]
  surplus: Player[]
  /** starters the club builds around: sold only at a premium, never cheaply */
  key: Set<number>
  wageBill: number
}

/** Lines a squad needs cover for. Full-backs and wingers cover either side. */
const LINE: Partial<Record<Position, string>> = {
  GK: 'GK', CB: 'CB', RB: 'FB', LB: 'FB', RWB: 'FB', LWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM', RM: 'W', LM: 'W', RW: 'W', LW: 'W', CF: 'ST', ST: 'ST',
}

/** Financial personality, fixed per club: big clubs mostly spend, selling leagues sell, many are careful. */
export function finStyle(w: World, club: Club): FinStyle {
  const h = hashString(`${club.dbName}:fin`) % 100
  const lg = w.leagues[club.leagueId]
  if (club.prestige.intl >= 8) return h < 65 ? 'Ambitious' : 'Balanced'
  const sellingLeague = !!lg && lg.prestige <= 7 && lg.prestige >= 5
  if (sellingLeague && h < 45) return 'Seller'
  if (h < 16) return 'Ambitious'
  if (h < 48) return 'Frugal'
  return 'Balanced'
}
export const STYLE_BUDGET: Record<FinStyle, number> = { Ambitious: 1.25, Balanced: 1, Frugal: 0.72, Seller: 0.9 }
/** Share of a sale fee that goes back into the transfer budget. */
export const STYLE_REINVEST: Record<FinStyle, number> = { Ambitious: 0.9, Balanced: 0.75, Frugal: 0.55, Seller: 0.6 }

/** Typical slot rating relative to a club's XI level (measured over the database): full-backs and false nines
 *  run a little lower, wide midfielders and No.10s higher. Gaps are judged against these, not a flat average. */
const POS_OFF: Partial<Record<Position, number>> = { GK: 0.8, RB: -1.7, CB: 0.4, LB: -2.1, CDM: -0.2, CM: 0.1, RW: 0.1, ST: 0.1, LW: -0.5, RM: 1.2, CAM: 1, LM: 0.7, CF: -3.3, RWB: -1, LWB: -1 }
const expect = (level: number, pos: Position) => level + (POS_OFF[pos] || 0)

const availableFor = (w: World, p: Player) => !p.academy && !(p.injury && p.injury.totalDays > 75 && p.injury.until > w.date) && !p.retiringAtSeasonEnd

/** Build the club's current squad plan. */
export function squadPlan(w: World, club: Club): SquadPlan {
  const squad = rosterOf(w, club.id).filter((p) => availableFor(w, p))
  const mgr = w.managers[club.managerId]
  const f = formationOf(mgr?.formation || '4-3-3 Holding')
  const wageBill = rosterOf(w, club.id).reduce((a, p) => a + (p.contract.wage || 0), 0)

  // best XI: repeatedly take the strongest remaining (player, slot) pair
  const rate = new Map<string, number>()
  const r = (p: Player, pos: Position) => {
    const k = `${p.id}:${pos}`
    let v = rate.get(k)
    if (v === undefined) { v = posRating(p, pos); rate.set(k, v) }
    return v
  }
  const slots: SlotPlan[] = f.slots.map((s) => ({ pos: s.pos, label: s.label, rating: 0 }))
  const used = new Set<number>()
  const open = new Set(slots.map((_, i) => i))
  while (open.size) {
    let bi = -1, bp: Player | undefined, bv = -1
    for (const i of open) {
      for (const p of squad) {
        if (used.has(p.id)) continue
        const v = r(p, slots[i].pos)
        if (v > bv) { bv = v; bi = i; bp = p }
      }
    }
    if (bi < 0 || !bp) break
    slots[bi].id = bp.id
    slots[bi].rating = bv
    used.add(bp.id)
    open.delete(bi)
  }
  const filled = slots.filter((s) => s.id)
  const level = filled.length ? filled.reduce((a, s) => a + s.rating, 0) / filled.length : club.squadAvg

  // cover per line: one backup per two slots (keepers: one)
  const lines = new Map<string, Position[]>()
  for (const s of slots) { const k = LINE[s.pos] || s.pos; lines.set(k, [...(lines.get(k) || []), s.pos]) }
  const cover: SquadPlan['cover'] = {}
  const benchUsed = new Set<number>()
  for (const [k, poss] of lines) {
    const need = k === 'GK' ? 1 : Math.ceil(poss.length / 2)
    const cands = squad.filter((p) => !used.has(p.id) && !benchUsed.has(p.id))
      .map((p) => ({ p, v: Math.max(...poss.map((pos) => r(p, pos))) }))
      .sort((a, b) => b.v - a.v)
    // a backup keeper only has to be a keeper; outfield cover has to be a real option
    const picked = cands.filter((c) => c.v >= level - (k === 'GK' ? 22 : 12)).slice(0, need)
    picked.forEach((c) => benchUsed.add(c.p.id))
    cover[k] = { id: picked[0]?.p.id, rating: picked[0]?.v ?? 0, need, have: picked.length }
  }

  const style = finStyle(w, club)
  const budget = club.finance.transferBudget
  const needs: PlanNeed[] = []
  const age = (id?: number) => (id ? ageOn(w.players[id].dob, w.date) : 0)
  // 1. weak or missing starters (the big one: a sold starter leaves his slot to a backup)
  for (const s of slots) {
    const gap = expect(level, s.pos) - s.rating
    // keepers are changed rarely: only a clear gap counts
    if (!s.id || gap >= (s.pos === 'GK' ? 6.5 : 4.5)) {
      needs.push({ kind: 'starter', pos: s.pos, minRating: Math.round(Math.max(s.rating + 3, expect(level, s.pos) - 1.5)), maxAge: s.pos === 'GK' || s.pos === 'CB' ? 31 : 30, priority: 5 + Math.min(4, gap / 2.5) + (s.id ? 0 : 2), replaces: s.id, spend: 0.75 })
    }
  }
  // 2. missing or poor cover
  for (const [k, c] of Object.entries(cover)) {
    const poss = lines.get(k)!
    if (c.have < c.need || (k !== 'GK' && c.rating < level - 9)) {
      needs.push({ kind: 'depth', pos: poss[0], minRating: Math.round(level - (k === 'GK' ? 9 : 7)), maxAge: k === 'GK' ? 33 : 29, priority: 2.2 + (c.have < c.need ? 1.2 : 0) + (k === 'GK' ? -1.1 : 0), spend: k === 'GK' ? 0.15 : 0.3 })
    }
  }
  // 3. ageing starters: plan the succession a season ahead
  for (const s of slots) {
    const a = age(s.id)
    if (s.id && a >= (s.pos === 'GK' ? 34 : 32)) {
      needs.push({ kind: 'succession', pos: s.pos, minRating: Math.round(level - 5), maxAge: 27, minPot: Math.round(level - 1), priority: 1.2 + (a - 32) * 0.5, replaces: s.id, spend: 0.45 })
    }
    // a starter running down his contract (and not signing) needs a plan too
    const p = s.id ? w.players[s.id] : undefined
    if (p && p.contract.until <= w.season && w.date >= `${w.season}-12-01` && !p.retiringAtSeasonEnd) {
      needs.push({ kind: 'succession', pos: s.pos, minRating: Math.round(level - 2), maxAge: 28, priority: 1.8, replaces: s.id, spend: 0.45 })
    }
  }
  // 1b. a starter who just left: replace like for like unless someone of similar quality already stepped in
  for (const l of club.transferPolicy?.lost || []) {
    const gone = w.players[l.id]
    if (!gone || gone.clubId === club.id) continue
    const was = posRating(gone, l.pos)
    const line = LINE[l.pos] || l.pos
    const now = Math.max(0, ...slots.filter((s) => (LINE[s.pos] || s.pos) === line).map((s) => s.rating))
    const drop = was - Math.min(now, was)
    if (drop >= 2 || level < was - 6) {
      // the longer the gap stays open, the more realistic the bar becomes
      const waited = Math.max(0, (Date.parse(w.date) - Date.parse(l.date)) / 86400000)
      needs.push({ kind: 'starter', pos: l.pos, minRating: Math.round(Math.max(now + 0.5, was - 5) - Math.min(3, waited / 10)), maxAge: 30, priority: 5.5 + Math.min(3, drop / 2) + (l.key ? 1 : 0), replaces: l.id, spend: 0.85 })
    }
  }
  // 4. ambitious upgrades: the weakest starter, when the money is there
  const weakest = [...slots].filter((s) => s.id).sort((a, b) => (a.rating - expect(level, a.pos)) - (b.rating - expect(level, b.pos)))[0]
  const rich = budget > 0 && club.squadAvg > 0 ? budget / Math.max(1, club.squadAvg ** 3 * 40) : 0
  if (weakest && (style === 'Ambitious' ? rich > 0.5 : rich > 1.2)) {
    needs.push({ kind: 'upgrade', pos: weakest.pos, minRating: Math.round(weakest.rating + 3), maxAge: 28, priority: 1.4 + Math.min(1.5, rich / 2) + (style === 'Ambitious' ? 0.6 : 0), replaces: weakest.id, spend: style === 'Ambitious' ? 0.8 : 0.55 })
  }
  // 5. prospects for the future (sellers and careful clubs like these most)
  const youth = squad.filter((p) => ageOn(p.dob, w.date) <= 21 && p.pot >= level + 2).length
  if (youth < 3) {
    const pos = (['CB', 'CM', 'ST', 'RW', 'CAM', 'LB'] as Position[])[hashString(`${club.id}:${w.season}:${w.date.slice(5, 7)}`) % 6]
    needs.push({ kind: 'prospect', pos, minRating: Math.round(level - 16), maxAge: 20, minPot: Math.round(level + 3), priority: 0.9 + (style === 'Seller' || style === 'Frugal' ? 0.7 : 0), spend: 0.18 })
  }
  needs.sort((a, b) => b.priority - a.priority)

  // surplus: not in the XI, not first cover, and the squad is big — or high earners going nowhere
  const all = rosterOf(w, club.id)
  const surplus = all.length > 25
    ? all.filter((p) => !used.has(p.id) && !benchUsed.has(p.id) && !p.academy && !p.loan && !(ageOn(p.dob, w.date) <= 21 && p.pot >= level))
      .sort((a, b) => a.ovr - b.ovr).slice(0, all.length - 25)
    : []
  const key = new Set(slots.filter((s) => s.id && s.rating >= level - 1.5).map((s) => s.id!))
  return { clubId: club.id, formation: f.id, level, slots, cover, needs, surplus, key, wageBill }
}

/** How a player figures in his club's plan: key starter, starter, first cover or surplus. */
export function planRole(plan: SquadPlan, id: number): 'key' | 'starter' | 'cover' | 'surplus' | 'fringe' {
  if (plan.key.has(id)) return 'key'
  if (plan.slots.some((s) => s.id === id)) return 'starter'
  if (Object.values(plan.cover).some((c) => c.id === id)) return 'cover'
  if (plan.surplus.some((p) => p.id === id)) return 'surplus'
  return 'fringe'
}

/** Candidate positions for a need, to search the market cheaply. */
export function needGroup(pos: Position) { return POS_GROUP[pos] }
