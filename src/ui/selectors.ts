// Derived read-models for the UI. Pure functions over the authoritative World.
import type { Club, Competition, Fixture, Player, StatLine, World } from '../domain/types'
import { clubFixtures } from '../engine/competitions/fixtures'
import { positionOf, sortTable } from '../engine/competitions/tables'
import { ageOn } from '../domain/dates'
import { emptyLine } from '../engine/world/matchRunner'
import { isSuspendedFor } from '../engine/match/selection'

export const userClub = (w: World): Club => w.clubs[w.userClubId]

export function seasonComps(w: World, clubId: number): Competition[] {
  return Object.values(w.competitions)
    .filter((c) => c.season === w.season && c.clubs.includes(clubId))
    .sort((a, b) => order(a) - order(b))
}
const order = (c: Competition) => (c.format === 'league' ? 0 : c.format === 'uefa' ? 1 : c.format === 'cup' ? 2 : c.format === 'supercup' ? 3 : 4)

export function leagueOf(w: World, clubId: number): Competition | undefined {
  return Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(clubId))
}

export function leaguePos(w: World, clubId: number): number | undefined {
  const c = leagueOf(w, clubId)
  return c ? positionOf(w, c, clubId) : undefined
}

const fxCache = new WeakMap<World, { v: number; map: Map<number, Fixture[]> }>()
export function fixturesOf(w: World, clubId: number): Fixture[] {
  // cheap memo keyed by number of played fixtures + total
  const key = Object.keys(w.fixtures).length * 7 + playedCount(w)
  let c = fxCache.get(w)
  if (!c || c.v !== key) { c = { v: key, map: new Map() }; fxCache.set(w, c) }
  let arr = c.map.get(clubId)
  if (!arr) { arr = clubFixtures(w, clubId); c.map.set(clubId, arr) }
  return arr
}
function playedCount(w: World) {
  let n = 0
  for (const id in w.fixtures) if (w.fixtures[id].played) n++
  return n
}

export function nextFixture(w: World, clubId: number): Fixture | undefined {
  return fixturesOf(w, clubId).find((f) => !f.played)
}
export function lastResult(w: World, clubId: number): Fixture | undefined {
  const arr = fixturesOf(w, clubId).filter((f) => f.played && f.result)
  return arr[arr.length - 1]
}

export const opponent = (f: Fixture, clubId: number) => (f.home === clubId ? f.away : f.home)

export function outcomeFor(f: Fixture, clubId: number): 'W' | 'D' | 'L' | undefined {
  if (!f.result) return undefined
  const [h, a] = f.result.score
  const pens = f.result.pens
  const us = f.home === clubId ? h : a, them = f.home === clubId ? a : h
  if (us > them) return 'W'
  if (us < them) return 'L'
  if (pens) { const pu = f.home === clubId ? pens[0] : pens[1], pt = f.home === clubId ? pens[1] : pens[0]; return pu > pt ? 'W' : 'L' }
  return 'D'
}

export function scoreLine(f: Fixture): string {
  if (!f.result) return f.time
  const r = f.result
  return `${r.score[0]}–${r.score[1]}${r.pens ? ` (${r.pens[0]}–${r.pens[1]}p)` : r.et ? ' aet' : ''}`
}

export function totals(p: Player, filter?: (compId: string) => boolean): StatLine {
  const t = emptyLine()
  for (const [k, s] of Object.entries(p.season)) {
    if (filter && !filter(k)) continue
    for (const key of Object.keys(t) as (keyof StatLine)[]) t[key] += s[key] as number
  }
  return t
}
export const avgRating = (s: StatLine) => (s.rated ? s.ratingSum / s.rated : 0)

export type PlayerStatus = { key: 'injured' | 'suspended' | 'intl' | 'tired' | 'unhappy' | 'listed' | 'loan' | 'ok'; label: string; color: string; icon: string }
export function playerStatus(w: World, p: Player, comp?: Competition): PlayerStatus {
  if (p.injury) return { key: 'injured', label: `${p.injury.type} · until ${p.injury.until.slice(8, 10)}/${p.injury.until.slice(5, 7)}`, color: 'var(--neg)', icon: 'injury' }
  if (comp ? isSuspendedFor(p, comp) : p.suspensions.length) return { key: 'suspended', label: `Suspended (${p.suspensions.reduce((a, s) => a + s.matches, 0)} match${p.suspensions.reduce((a, s) => a + s.matches, 0) > 1 ? 'es' : ''})`, color: 'var(--neg)', icon: 'suspension' }
  // away with his country (not a problem in his country's own games)
  if (p.intlDuty && comp?.format !== 'intl') return { key: 'intl', label: 'International duty', color: 'var(--info)', icon: 'globe' }
  if (p.fitness < 60) return { key: 'tired', label: `Low energy (${Math.round(p.fitness)}%)`, color: 'var(--warn)', icon: 'fitness' }
  if (p.morale < 30) return { key: 'unhappy', label: 'Unhappy', color: 'var(--warn)', icon: 'moraleLow' }
  if (p.transferListed) return { key: 'listed', label: 'Transfer listed', color: 'var(--t2)', icon: 'tag' }
  if (p.loanListed) return { key: 'listed', label: 'Loan listed', color: 'var(--t2)', icon: 'loan' }
  return { key: 'ok', label: 'Available', color: 'var(--pos)', icon: 'check' }
}

export const ageOf = (w: World, p: Pick<Player, 'dob'>) => ageOn(p.dob, w.date)

export function tableAround(w: World, comp: Competition, clubId: number, span = 2) {
  const t = sortTable(w, comp)
  const i = t.findIndex((r) => r.clubId === clubId)
  let a = Math.max(0, i - span), b = Math.min(t.length, a + span * 2 + 1)
  a = Math.max(0, b - (span * 2 + 1))
  return t.slice(a, b).map((r) => ({ ...r, pos: t.indexOf(r) + 1 }))
}

export function compLogoKey(c: Competition) {
  return c.logoKey || (c.leagueId ? `L${c.leagueId}` : c.key)
}

export function clubShort(w: World, id: number) {
  return w.clubs[id]?.short || 'TBD'
}
