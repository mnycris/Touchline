// Trophies, recorded the day they are won: the club's honours, the manager's cabinet and his reputation. Whoever was
// in charge on the day of the decisive match is credited, so a trophy is never lost to a later move or delayed until
// the end of the season. Recording is idempotent: the season rollover only catches what nothing recorded earlier.
import type { Competition, World } from '../../domain/types'
import { clamp } from '../../domain/rng'

/** The day a competition was decided: its last match played. */
export function decidedOn(w: World, comp: Competition): string {
  let d = ''
  for (const id of comp.fixtures) { const f = w.fixtures[id]; if (f?.played && f.date > d) d = f.date }
  return d || w.date
}

/** The manager's spell at a club that covers a day. */
export const stintOn = (w: World, clubId: number, date: string) => w.user.history.find((h) => h.clubId === clubId && h.from <= date && (!h.to || h.to >= date))

export function registerTrophy(w: World, comp: Competition, winner: number) {
  const club = w.clubs[winner]
  if (!club) return
  club.trophies ||= []
  if (club.trophies.some((t) => t.compKey === comp.key && t.season === comp.season)) return
  club.trophies.push({ compKey: comp.key, season: comp.season })
  const date = decidedOn(w, comp)
  const stint = stintOn(w, winner, date)
  if (stint && !w.user.trophies.some((t) => t.compKey === comp.key && t.season === comp.season)) {
    w.user.trophies.push({ compKey: comp.key, compName: comp.name, season: comp.season, clubId: winner, date })
    stint.trophies.push(comp.short)
    w.user.reputation = clamp(w.user.reputation + (comp.tier === 1 ? 8 : 4), 1, 100)
  }
  const m = w.managers[club.managerId]
  if (m && !stint) { m.trophies++; m.reputation = clamp(m.reputation + 3, 1, 99) }
}

/** This season's competitions already decided whose trophy was never recorded (saves from before trophies were recorded on the day). */
export function registerDecided(w: World, winnerOf: (c: Competition) => number | undefined) {
  for (const c of Object.values(w.competitions)) {
    if (c.season !== w.season || c.status !== 'finished') continue
    const win = winnerOf(c)
    if (win) registerTrophy(w, c, win)
  }
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Older saves: monthly awards kept only the month's name ("October"), which no date could be made from; they get
 * the month back from the season (July to December in its first year, January to June in its second) and the league
 * they were won in. Trophies already won this season go into the cabinet now rather than at the end of the season.
 */
export function migrateHonours(w: World, winnerOf: (c: Competition) => number | undefined) {
  for (const a of w.user.awards) {
    if (a.month && !/^\d{4}-\d{2}$/.test(a.month)) {
      const i = MONTHS_LONG.indexOf(a.month)
      if (i >= 0) a.month = `${i >= 6 ? a.season : a.season + 1}-${String(i + 1).padStart(2, '0')}`
      else delete a.month
    }
    if (!a.compKey) {
      const c = Object.values(w.competitions).find((x) => x.format === 'league' && a.name.startsWith(`${x.short} `))
      if (c) a.compKey = c.key
    }
  }
  registerDecided(w, winnerOf)
}
