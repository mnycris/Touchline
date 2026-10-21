import type { Club, Player, World } from '../../domain/types'
// (a cycle with selection, which reads the rosters: only functions cross it, used after both have loaded)
import { fillGaps } from '../match/selection'

// Derived club -> players index (not persisted). Invalidate with touchRoster() whenever
// a player's club or academy status changes.
const cache = new WeakMap<World, { v: number; map: Map<number, Player[]>; academy: Map<number, Player[]>; all: Player[] }>()

export function touchRoster(w: World) {
  w.flags.rosterVersion = (w.flags.rosterVersion || 0) + 1
}

function index(w: World) {
  const v = w.flags.rosterVersion || 0
  let c = cache.get(w)
  if (!c || c.v !== v) {
    const map = new Map<number, Player[]>()
    const academy = new Map<number, Player[]>()
    const all = Object.values(w.players)
    for (const p of all) {
      const m = p.academy ? academy : map
      let arr = m.get(p.clubId)
      if (!arr) m.set(p.clubId, (arr = []))
      arr.push(p)
    }
    c = { v, map, academy, all }
    cache.set(w, c)
  }
  return c
}

export function rosterOf(w: World, clubId: number): Player[] {
  return index(w).map.get(clubId) || []
}
export function academyOf(w: World, clubId: number): Player[] {
  return index(w).academy.get(clubId) || []
}
/** Anyone sharing a shirt number with a teammate takes the next free one from 40; a real player keeps his number
 * before a generated one, then whoever has been at the club longest. Returns how many numbers changed. */
export function dedupeNumbers(w: World, clubId: number): number {
  const squad = [...rosterOf(w, clubId)].sort((a, b) => +!!a.regen - +!!b.regen || (a.joinedDate || '').localeCompare(b.joinedDate || '') || a.id - b.id)
  const used = new Set<number>(), clash: Player[] = []
  for (const p of squad) if (used.has(p.jersey)) clash.push(p); else used.add(p.jersey)
  let n = 40
  for (const p of clash) { while (used.has(n)) n++; used.add(n); p.jersey = n }
  return clash.length
}
/** A player who leaves a club leaves its team sheets too, every sheet and each match's own copy: his place in the
 * XI is left open for the next pick (an AI club picks for each match; the manager's own sheets are filled at once by
 * setPlayerClub, so his team sheet never shows a hole). */
export function dropFromSheets(club: Club | undefined, id: number) {
  if (!club) return
  for (const s of [...(club.sheets || []), ...Object.values(club.matchSheets || {})]) {
    if (s.lineup.includes(id)) s.lineup = s.lineup.map((x) => (x === id ? 0 : x))
    if (s.bench.includes(id)) s.bench = s.bench.filter((x) => x !== id)
  }
}

export function setPlayerClub(w: World, p: Player, clubId: number) {
  const from = p.clubId
  moveClub(w, p, clubId)
  // the manager's own sheets: the best of the rest takes a leaver's place straight away, in the XI or on the bench,
  // and a new arrival fills a place still open
  const mine = from !== clubId && (from === w.userClubId || clubId === w.userClubId) ? w.clubs[w.userClubId] : undefined
  if (mine && !mine.national) for (const s of [...mine.sheets, ...Object.values(mine.matchSheets || {})]) fillGaps(w, mine, s)
}

function moveClub(w: World, p: Player, clubId: number) {
  // whatever the move (a transfer, a loan and its return, a release, a contract running out), the old club's
  // sheets let him go
  if (p.clubId !== clubId) dropFromSheets(w.clubs[p.clubId], p.id)
  const c = cache.get(w)
  const valid = c && c.v === (w.flags.rosterVersion || 0)
  if (valid && !p.academy) {
    const from = c!.map.get(p.clubId)
    if (from) { const i = from.indexOf(p); if (i >= 0) from.splice(i, 1) }
    let to = c!.map.get(clubId)
    if (!to) c!.map.set(clubId, (to = []))
    to.push(p)
    p.clubId = clubId
    return
  }
  p.clubId = clubId
  touchRoster(w)
}

/**
 * What a club pays a player each week: his wage, or its share of it during a loan (the borrowing club pays the split
 * agreed in the loan, his parent club the rest).
 */
export function wageShare(p: Player, clubId: number): number {
  const wage = p.contract.wage || 0
  if (!p.loan) return p.clubId === clubId ? wage : 0
  const borrower = (p.loan.wageSplit ?? 50) / 100
  if (p.clubId === clubId && p.loan.fromClubId !== clubId) return wage * borrower
  if (p.loan.fromClubId === clubId) return wage * (1 - borrower)
  return 0
}

/** A club's weekly wage bill: its squad, its share of loanees' wages, and its share of the players it has loaned out. */
export function wageBill(w: World, clubId: number): number {
  let s = 0
  for (const p of rosterOf(w, clubId)) s += wageShare(p, clubId)
  for (const p of allPlayers(w)) if (p.loan?.fromClubId === clubId && p.clubId !== clubId) s += wageShare(p, clubId)
  return Math.round(s)
}

/** Cached array of every player (valid until the roster version changes). */
export function allPlayers(w: World): Player[] {
  return index(w).all
}
