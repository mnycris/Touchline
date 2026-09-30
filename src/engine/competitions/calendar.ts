import type { Fixture, ISODate, World } from '../../domain/types'
import { addDays, dayNum, diffDays, weekday } from '../../domain/dates'

/**
 * Season date template. Anchored on the real 2026/27 calendar; later seasons are shifted by
 * 364-day steps so weekdays stay aligned (Tue/Wed Champions League, Thu Europa League, etc.).
 */
export interface SeasonDates {
  start: ISODate
  end: ISODate
  leagueStart: ISODate // first league weekend (Saturday)
  leagueEnd: ISODate
  summerClose: ISODate
  winterOpen: ISODate
  winterClose: ISODate
  intlBreaks: { start: ISODate; end: ISODate }[]
  // domestic cups
  cups: Record<string, ISODate[]>
  // UEFA (Tuesday of the week for UCL; UEL/UECL shift +2 days)
  uclLP: ISODate[]
  uclKO: ISODate[] // playoff l1, l2, r16 l1, l2, qf l1, l2, sf l1, l2, final
  uelLP: ISODate[]
  uelKO: ISODate[]
  ueclLP: ISODate[]
  ueclKO: ISODate[]
}

const BASE: SeasonDates = {
  start: '2026-07-01',
  end: '2027-06-30',
  leagueStart: '2026-08-15',
  leagueEnd: '2027-05-29',
  summerClose: '2026-09-01',
  winterOpen: '2027-01-01',
  winterClose: '2027-02-01',
  // FIFA windows 2026/27 (detected from the real Premier League / LaLiga / Bundesliga / Serie A fixture lists)
  intlBreaks: [
    { start: '2026-09-21', end: '2026-10-06' },
    { start: '2026-11-09', end: '2026-11-17' },
    { start: '2027-03-22', end: '2027-03-30' },
  ],
  cups: {
    COMMSHIELD: ['2026-08-16'],
    FACUP: ['2026-11-07', '2026-12-05', '2027-01-09', '2027-02-13', '2027-03-06', '2027-04-03', '2027-04-24', '2027-05-22'],
    EFLCUP: ['2026-08-12', '2026-08-26', '2026-09-16', '2026-10-28', '2026-12-16', '2027-01-13', '2027-02-03', '2027-03-21'],
    SUPERCOPA: ['2027-01-06', '2027-01-10'],
    CDR: ['2026-10-29', '2026-12-03', '2026-12-17', '2027-01-14', '2027-01-28', '2027-02-10', '2027-03-03', '2027-04-17'],
    DFLSC: ['2026-08-15'],
    DFB: ['2026-08-22', '2026-10-28', '2026-12-02', '2027-02-03', '2027-04-21', '2027-05-22'],
    CI: ['2026-08-15', '2026-10-07', '2026-12-02', '2027-01-20', '2027-02-10', '2027-04-21', '2027-05-12'],
    SCI: ['2026-12-18', '2026-12-22'],
    CDF: ['2026-12-19', '2027-01-16', '2027-02-06', '2027-03-03', '2027-04-07', '2027-05-15'],
    TDC: ['2026-08-02'],
    KNVB: ['2026-10-28', '2026-12-16', '2027-01-13', '2027-02-10', '2027-03-03', '2027-04-18'],
    JCS: ['2026-08-02'],
    TACA: ['2026-10-17', '2026-11-21', '2026-12-16', '2027-01-20', '2027-02-10', '2027-04-21', '2027-05-23'],
    SUPERTACA: ['2026-08-01'],
    SCOTCUP: ['2027-01-16', '2027-02-06', '2027-03-06', '2027-04-17', '2027-05-29'],
    BELCUP: ['2026-10-28', '2026-12-02', '2027-01-13', '2027-02-10', '2027-04-18'],
    TURCUP: ['2026-12-02', '2027-01-13', '2027-02-10', '2027-03-03', '2027-04-21', '2027-05-19'],
  },
  // Real 2026/27 UEFA calendar (league phase MD1 8–10 Sep ... MD8 27 Jan)
  uclLP: ['2026-09-08', '2026-10-13', '2026-10-20', '2026-11-03', '2026-11-24', '2026-12-08', '2027-01-19', '2027-01-26'],
  uclKO: ['2027-02-16', '2027-02-23', '2027-03-09', '2027-03-16', '2027-04-06', '2027-04-13', '2027-04-27', '2027-05-04', '2027-05-29'],
  uelLP: ['2026-09-10', '2026-10-15', '2026-10-22', '2026-11-05', '2026-11-26', '2026-12-10', '2027-01-21', '2027-01-28'],
  uelKO: ['2027-02-18', '2027-02-25', '2027-03-11', '2027-03-18', '2027-04-08', '2027-04-15', '2027-04-29', '2027-05-06', '2027-05-19'],
  ueclLP: ['2026-10-15', '2026-10-22', '2026-11-05', '2026-11-26', '2026-12-10', '2026-12-17'],
  ueclKO: ['2027-02-18', '2027-02-25', '2027-03-11', '2027-03-18', '2027-04-08', '2027-04-15', '2027-04-29', '2027-05-06', '2027-05-26'],
}

export function seasonDates(season: number): SeasonDates {
  const k = season - 2026
  if (k === 0) return BASE
  const shift = (d: ISODate) => addDays(d, 364 * k + (k > 0 ? 7 * Math.floor(k / 6) : 0))
  const cups: Record<string, ISODate[]> = {}
  for (const [key, ds] of Object.entries(BASE.cups)) cups[key] = ds.map(shift)
  return {
    start: `${season}-07-01`,
    end: `${season + 1}-06-30`,
    leagueStart: shift(BASE.leagueStart),
    leagueEnd: shift(BASE.leagueEnd),
    summerClose: `${season}-09-01`,
    winterOpen: `${season + 1}-01-01`,
    winterClose: `${season + 1}-02-01`,
    intlBreaks: BASE.intlBreaks.map((b) => ({ start: shift(b.start), end: shift(b.end) })),
    cups,
    uclLP: BASE.uclLP.map(shift), uclKO: BASE.uclKO.map(shift),
    uelLP: BASE.uelLP.map(shift), uelKO: BASE.uelKO.map(shift),
    ueclLP: BASE.ueclLP.map(shift), ueclKO: BASE.ueclKO.map(shift),
  }
}

export function inBreak(d: ISODate, breaks: { start: ISODate; end: ISODate }[]) {
  return breaks.some((b) => d >= b.start && d <= b.end)
}

/** Index of dates each club already plays on, for conflict detection. */
export class ClubDateIndex {
  map = new Map<number, Set<number>>()
  add(club: number, date: ISODate) {
    let s = this.map.get(club)
    if (!s) this.map.set(club, (s = new Set()))
    s.add(dayNum(date))
  }
  remove(club: number, date: ISODate) {
    this.map.get(club)?.delete(dayNum(date))
  }
  static from(fixtures: Iterable<Fixture>) {
    const idx = new ClubDateIndex()
    for (const f of fixtures) { idx.add(f.home, f.date); idx.add(f.away, f.date) }
    return idx
  }
  busy(club: number, date: ISODate, gap = 2): boolean {
    const s = this.map.get(club)
    if (!s) return false
    const d = dayNum(date)
    for (let i = -gap; i <= gap; i++) if (s.has(d + i)) return true
    return false
  }
}

/** Find the nearest date to `pref` where both clubs are free, preferring the same weekday class. */
export function findDate(idx: ClubDateIndex, home: number, away: number, pref: ISODate, opts: { gap?: number; window?: number; breaks?: { start: ISODate; end: ISODate }[] } = {}): ISODate {
  const gap = opts.gap ?? 2
  const win = opts.window ?? 12
  const ok = (d: ISODate) => !idx.busy(home, d, gap) && !idx.busy(away, d, gap) && !(opts.breaks && inBreak(d, opts.breaks))
  if (ok(pref)) return pref
  const midweekPref = [2, 3, 4].includes(weekday(pref))
  for (let i = 1; i <= win; i++) {
    for (const d of [addDays(pref, i), addDays(pref, -i)]) {
      const wd = weekday(d)
      const sameClass = midweekPref ? [2, 3, 4].includes(wd) : [0, 5, 6, 1].includes(wd)
      if (sameClass && ok(d)) return d
    }
  }
  for (let i = 1; i <= win; i++) {
    for (const d of [addDays(pref, i), addDays(pref, -i)]) if (ok(d)) return d
  }
  return pref
}

export function kickoffFor(date: ISODate, flavour: 'league' | 'cup' | 'ucl' | 'uel' | 'final' = 'league'): string {
  const wd = weekday(date)
  if (flavour === 'ucl') return '21:00'
  if (flavour === 'uel') return '21:00'
  if (flavour === 'final') return wd === 6 ? '17:30' : '20:00'
  if (wd === 6) return '15:00'
  if (wd === 0) return '14:00'
  if (wd === 5) return '20:00'
  return '19:45'
}

export function isWindowOpen(w: World, date = w.date): boolean {
  return w.windows.some((x) => date >= x.open && date <= x.close)
}
export function currentWindow(w: World, date = w.date) {
  return w.windows.find((x) => date >= x.open && date <= x.close)
}
export function daysToWindowClose(w: World): number | null {
  const win = currentWindow(w)
  return win ? diffDays(win.close, w.date) : null
}
