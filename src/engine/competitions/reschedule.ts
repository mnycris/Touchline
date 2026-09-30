// Fixture rescheduling, the way leagues actually do it: cup ties, European nights, super cups and finals keep their
// dates; a league game that no longer leaves both clubs enough rest moves to the nearest date that does (the same
// weekend first, then a free midweek), never onto a day either club already plays.
import type { Fixture, ISODate, World } from '../../domain/types'
import { addDays, dayNum, fmtDate, weekday } from '../../domain/dates'
import { inBreak, kickoffFor } from './calendar'
import { moveFixture } from './fixtures'
import { sendInbox, staffNames } from '../world/messages'
import { NT_BASE } from '../world/international'

/** Days that must separate two games of the same club (Thursday → Saturday is fine, Thursday → Friday is not). */
const REST = 2

/** Who keeps their date when two games collide: the higher number stays. */
function priority(w: World, f: Fixture): number {
  const c = w.competitions[f.compId]
  if (!c) return 0
  if (f.neutral || c.format === 'supercup') return 6
  if (c.format === 'uefa') return 5
  if (c.format === 'playoff') return 4
  if (c.format === 'cup') return 3
  if (c.format === 'intl') return 6
  return 1
}
const movable = (w: World, f: Fixture) => !f.played && !f.neutral && priority(w, f) <= 3

type Days = Map<number, Fixture[]>

function buildIndex(w: World): Days {
  const m: Days = new Map()
  for (const f of Object.values(w.fixtures)) {
    if (f.home >= NT_BASE) continue
    for (const c of [f.home, f.away]) { const a = m.get(c); if (a) a.push(f); else m.set(c, [f]) }
  }
  return m
}

/** Smallest gap in days between `date` and the club's other games (Infinity when it has none nearby). */
function gapFor(idx: Days, club: number, date: ISODate, self: Fixture): number {
  const d = dayNum(date)
  let min = Infinity
  for (const g of idx.get(club) || []) {
    if (g === self) continue
    const k = Math.abs(dayNum(g.date) - d)
    if (k < min) min = k
  }
  return min
}

function lastLeagueDate(w: World, compId: string): ISODate {
  const c = w.competitions[compId]
  let last = ''
  for (const id of c?.fixtures || []) { const f = w.fixtures[id]; if (f && f.date > last) last = f.date }
  return last
}

/** The best new date for a game that has to move, or undefined when there is no sensible one. */
function bestDate(w: World, f: Fixture, idx: Days): ISODate | undefined {
  const base = f.date
  const league = w.competitions[f.compId]?.format === 'league'
  const earliest = addDays(w.date, 2)
  const latest = league ? lastLeagueDate(w, f.compId) : addDays(base, 10)
  const weekendGame = [5, 6, 0, 1].includes(weekday(base))
  const cands: ISODate[] = []
  // the same weekend (or the same midweek) first
  for (const k of [1, -1, 2, -2, 3]) cands.push(addDays(base, k))
  // then free midweeks, forward before backward
  for (let k = 3; k <= 42; k++) { const d = addDays(base, k); if ([2, 3].includes(weekday(d))) cands.push(d) }
  for (let k = 3; k <= 21; k++) { const d = addDays(base, -k); if ([2, 3].includes(weekday(d))) cands.push(d) }
  let best: ISODate | undefined, bs = Infinity
  for (const d of cands) {
    if (d < earliest || (latest && d > latest) || inBreak(d, w.intlBreaks)) continue
    const g = Math.min(gapFor(idx, f.home, d, f), gapFor(idx, f.away, d, f))
    if (g < REST) continue
    const shift = Math.abs(dayNum(d) - dayNum(base))
    const score = shift + (g === REST ? 3 : 0) + (weekendGame && ![5, 6, 0, 1].includes(weekday(d)) ? 2 : 0)
    if (score < bs) { bs = score; best = d }
  }
  return best
}

export interface MoveNote { f: Fixture; from: ISODate; to: ISODate; reason: string }

/** Resolve every clash for the given clubs (all clubs when omitted). Returns what moved. */
export function rescheduleClashes(w: World, clubs?: Iterable<number>, opts: { notify?: boolean } = {}): MoveNote[] {
  const idx = buildIndex(w)
  const list = clubs ? [...new Set(clubs)] : [...idx.keys()]
  const notes: MoveNote[] = []
  const soon = addDays(w.date, 1)
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const c of list) {
      const games = (idx.get(c) || []).filter((f) => !f.played && f.date > soon).sort((a, b) => a.date.localeCompare(b.date))
      for (let i = 0; i < games.length; i++) {
        const f = games[i]
        // the nearest other game of either club inside the rest window
        let clash: Fixture | undefined
        for (const club of [f.home, f.away]) {
          for (const g of idx.get(club) || []) {
            if (g === f) continue
            if (Math.abs(dayNum(g.date) - dayNum(f.date)) < REST) { clash = g; break }
          }
          if (clash) break
        }
        if (!clash) continue
        // the lower-priority game moves; between equals, the later-created (a fresh draw) keeps its date
        const pf = priority(w, f), pc = priority(w, clash)
        const mover = pf < pc ? f : pc < pf ? clash : (movable(w, f) ? f : clash)
        if (!movable(w, mover) || mover.date <= soon) continue
        const other = mover === f ? clash : f
        const d = bestDate(w, mover, idx)
        if (!d || d === mover.date) continue
        const from = mover.date
        const oc = w.competitions[other.compId]
        // "the Champions League final", "the FA Cup quarter-finals", "the Europa League" (a league-phase night needs no round)
        const round = other.roundName && !/^(Matchday|League phase|Group|MD\d)|·/.test(other.roundName) ? ` ${other.roundName.replace(/^([A-Z])/, (m) => m.toLowerCase())}` : ''
        const reason = `${oc?.short || 'another match'}${round}`
        moveFixture(w, mover, d, kickoffFor(d, w.competitions[mover.compId]?.format === 'cup' ? 'cup' : 'league'))
        mover.moved = { from: mover.moved?.from || from, reason: `${w.clubs[other.home === mover.home || other.away === mover.home ? mover.home : mover.away]?.short} play the ${reason} on ${fmtDate(other.date, 'dm')}`, kind: d < (mover.moved?.from || from) ? 'early' : 'late', source: 'clash' }
        notes.push({ f: mover, from, to: d, reason: mover.moved.reason })
        changed = true
      }
    }
    if (!changed) break
  }
  if (opts.notify) {
    const mine = notes.filter((n) => n.f.home === w.userClubId || n.f.away === w.userClubId)
    if (mine.length) {
      const lines = mine.map((n) => `${w.clubs[n.f.home]?.short} v ${w.clubs[n.f.away]?.short} (${w.competitions[n.f.compId]?.short}, ${n.f.roundName}) moves from ${fmtDate(n.from, 'long')} to ${fmtDate(n.to, 'long')}: ${n.reason}.`)
      sendInbox(w, {
        from: w.competitions[mine[0].f.compId]?.name || 'League', fromRole: 'Fixtures', category: 'Competitions',
        subject: mine.length === 1 ? 'Fixture rescheduled' : `${mine.length} fixtures rescheduled`, body: lines.join(' '),
        actions: [{ label: 'Calendar', action: 'openCalendar', primary: true }],
      })
    }
  }
  void staffNames
  return notes
}

/** Real fixture lists: a game played well away from the rest of its matchday is marked brought forward or put back. */
export function markOutOfSequence(w: World, compId: string) {
  const c = w.competitions[compId]
  if (!c) return
  const byRound = new Map<string, Fixture[]>()
  for (const id of c.fixtures) { const f = w.fixtures[id]; if (!f) continue; const a = byRound.get(f.roundName); if (a) a.push(f); else byRound.set(f.roundName, [f]) }
  for (const list of byRound.values()) {
    if (list.length < 3) continue
    const days = list.map((f) => dayNum(f.date)).sort((a, b) => a - b)
    const mid = days[Math.floor(days.length / 2)]
    const modal = list.find((f) => dayNum(f.date) === mid)!.date
    for (const f of list) {
      const k = dayNum(f.date) - mid
      if (Math.abs(k) <= 4 || f.moved) continue
      f.moved = { from: modal, reason: `the rest of ${f.roundName} is played around ${fmtDate(modal, 'dm')}`, kind: k < 0 ? 'early' : 'late', source: 'calendar' }
    }
  }
}
