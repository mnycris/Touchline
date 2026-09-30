import type { Competition, World } from '../../domain/types'
import { Rng } from '../../domain/rng'
import { ClubDateIndex, seasonDates } from './calendar'
import { createLeagueCompetition } from './leagues'
import { CUP_DEFS, createCup, createSuperCup, drawCupRound, reservedWeekends } from './cups'
import { createUefaCompetition } from './uefa'
import { sortTable } from './tables'
import { setupIntlSeason } from '../world/international'
import { markOutOfSequence, rescheduleClashes } from './reschedule'
import { takeNewFixtures } from './fixtures'

export interface SeasonSeed {
  realFixtures?: Record<string, [string, string, number, number, number][]>
  uefaPots?: Record<string, number[][]>
  superCups?: Record<string, number[]>
  ciSeeds?: number[]
}

const UEFA_COUNTRIES = new Set(['England', 'Spain', 'Germany', 'Italy', 'France', 'Netherlands', 'Portugal', 'Belgium', 'Scotland',
  'Türkiye', 'Austria', 'Switzerland', 'Denmark', 'Norway', 'Sweden', 'Poland', 'Romania', 'Republic of Ireland', 'Greece',
  'Croatia', 'Czechia', 'Ukraine', 'Cyprus', 'Hungary', 'Azerbaijan', 'Finland', 'Bulgaria'])

export function isUefaClub(w: World, clubId: number) {
  return UEFA_COUNTRIES.has(w.clubs[clubId]?.country)
}

export function setupSeason(w: World, season: number, seed: SeasonSeed, rng: Rng) {
  const dates = seasonDates(season)
  w.season = season
  w.seasonStart = dates.start
  w.seasonEnd = dates.end
  w.windows = [
    { name: 'Summer', open: dates.start, close: dates.summerClose },
    { name: 'Winter', open: dates.winterOpen, close: dates.winterClose },
  ]
  w.intlBreaks = dates.intlBreaks

  // ---- leagues
  for (const lg of Object.values(w.leagues)) {
    const real = seed.realFixtures?.[String(lg.id)]
    createLeagueCompetition(w, lg, season, dates, rng, real, reservedWeekends(dates, lg.country))
  }
  const idx = ClubDateIndex.from(Object.values(w.fixtures))

  // ---- UEFA
  const pots = seed.uefaPots || computeUefaPots(w, season - 1, rng)
  for (const key of ['UCL', 'UEL', 'UECL'] as const) {
    if (pots[key]?.length) createUefaCompetition(w, key, season, pots[key], dates, rng, idx)
  }

  // ---- super cups
  const sc = seed.superCups || computeSuperCups(w, season - 1)
  w.flags.supercopa = sc.SUPERCOPA || []
  w.flags.ciSeeds = seed.ciSeeds || computeCiSeeds(w, season - 1)
  for (const [key, teams] of Object.entries(sc)) createSuperCup(w, key, season, dates, teams, idx)

  // ---- domestic cups (first round drawn now; later rounds drawn as ties complete)
  for (const def of CUP_DEFS) {
    const clubs = def.clubs(w)
    if (clubs.length < 8) continue
    const comp = createCup(w, def, season, dates)
    drawCupRound(w, comp, 0, rng, idx)
  }

  // ---- international football: national teams, their competitions and friendlies
  setupIntlSeason(w, season, rng)

  // real calendars bring games forward and put them back: say so; then move whatever clashes with a cup or European date
  for (const c of Object.values(w.competitions)) if (c.season === season && c.format === 'league') markOutOfSequence(w, c.id)
  rescheduleClashes(w)
  takeNewFixtures(w)

  // the user's fixtures (played ones from former clubs stay in the career record)
  for (const f of Object.values(w.fixtures)) f.userInvolved = f.home === w.userClubId || f.away === w.userClubId || (f.played && !!f.userInvolved)
}

function lastTable(w: World, key: string, season: number) {
  const comp = w.competitions[`${key}-${season}`]
  if (comp?.table) return sortTable(w, comp).map((r) => r.clubId)
  const arch = w.archive.find((a) => a.season === season)
  return arch?.tables[key]?.map((r) => r.clubId) || []
}

function cupWinner(w: World, key: string, season: number): number | undefined {
  return w.competitions[`${key}-${season}`]?.winner ?? w.archive.find((a) => a.season === season)?.winners[key]
}
function cupRunnerUp(w: World, key: string, season: number): number | undefined {
  return w.competitions[`${key}-${season}`]?.runnerUp
}

export function computeSuperCups(w: World, prev: number): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  const pair = (league: string, cup: string) => {
    const t = lastTable(w, league, prev)
    if (!t.length) return undefined
    const champ = t[0]
    let other = cupWinner(w, cup, prev)
    if (!other || other === champ) other = t[1]
    return [champ, other]
  }
  const cs = pair('L13', 'FACUP'); if (cs) out.COMMSHIELD = cs
  const dfl = pair('L19', 'DFB'); if (dfl) out.DFLSC = dfl
  const tdc = pair('L16', 'CDF'); if (tdc) out.TDC = tdc
  const jcs = pair('L10', 'KNVB'); if (jcs) out.JCS = jcs
  const st = pair('L308', 'TACA'); if (st) out.SUPERTACA = st
  const four = (league: string, cup: string) => {
    const t = lastTable(w, league, prev)
    if (t.length < 4) return undefined
    const set: number[] = [t[0], t[1]]
    for (const c of [cupWinner(w, cup, prev), cupRunnerUp(w, cup, prev), ...t.slice(2)]) {
      if (c && !set.includes(c)) set.push(c)
      if (set.length === 4) break
    }
    return set
  }
  const sp = four('L53', 'CDR'); if (sp) out.SUPERCOPA = sp
  const it = four('L31', 'CI'); if (it) out.SCI = it
  return out
}

function computeCiSeeds(w: World, prev: number) {
  return lastTable(w, 'L31', prev).slice(0, 8)
}

/** Qualification for next season's UEFA competitions from final tables & cup winners. */
export function computeUefaPots(w: World, prev: number, rng: Rng): Record<string, number[][]> {
  const ucl: number[] = [], uel: number[] = [], uecl: number[] = []
  const taken = new Set<number>()
  const add = (arr: number[], c?: number) => { if (c && !taken.has(c)) { arr.push(c); taken.add(c) } }
  // league places by rule
  const leagues = Object.values(w.leagues).filter((l) => l.level === 1 && UEFA_COUNTRIES.has(l.country)).sort((a, b) => b.prestige - a.prestige)
  const cupFor: Record<string, string> = { England: 'FACUP', Spain: 'CDR', Germany: 'DFB', Italy: 'CI', France: 'CDF', Netherlands: 'KNVB', Portugal: 'TACA', Scotland: 'SCOTCUP', Belgium: 'BELCUP', Türkiye: 'TURCUP' }
  for (const lg of leagues) {
    const t = lastTable(w, `L${lg.id}`, prev)
    const slots = lg.uefa || []
    slots.forEach((s, i) => add(s === 'UCL' ? ucl : s === 'UEL' ? uel : uecl, t[i]))
    const cup = cupFor[lg.country]
    if (cup) add(uel, cupWinner(w, cup, prev))
    if (lg.country === 'England') add(uecl, cupWinner(w, 'EFLCUP', prev))
  }
  // title holders
  add(ucl, cupWinner(w, 'UCL', prev)); add(ucl, cupWinner(w, 'UEL', prev)); add(uel, cupWinner(w, 'UECL', prev))
  // Rest-of-world UEFA clubs (no simulated league): strongest domestic clubs by squad quality
  const byCountry: Record<string, number[]> = {}
  for (const c of Object.values(w.clubs)) {
    if (c.leagueId === 0 && UEFA_COUNTRIES.has(c.country)) (byCountry[c.country] ||= []).push(c.id)
  }
  for (const list of Object.values(byCountry)) {
    list.sort((a, b) => w.clubs[b].squadAvg - w.clubs[a].squadAvg)
    add(ucl, list[0]); add(uel, list[1]); add(uecl, list[2])
  }
  const strength = (c: number) => w.clubs[c].reputation * 0.6 + w.clubs[c].squadAvg * 0.4 + rng.next() * 0.01
  // balance each competition to exactly 36, overflow cascades down, shortfall filled with best remaining
  const fill = (arr: number[], next: number[] | null) => {
    arr.sort((a, b) => strength(b) - strength(a))
    while (arr.length > 36) {
      const c = arr.pop()!
      if (next) next.push(c); else taken.delete(c)
    }
  }
  fill(ucl, uel); fill(uel, uecl); fill(uecl, null)
  const pool = Object.values(w.clubs).filter((c) => isUefaClub(w, c.id) && !taken.has(c.id) && w.leagues[c.leagueId]?.level !== 2)
    .sort((a, b) => strength(b.id) - strength(a.id)).map((c) => c.id)
  for (const arr of [ucl, uel, uecl]) while (arr.length < 36 && pool.length) { const c = pool.shift()!; arr.push(c); taken.add(c) }
  const mkPots = (arr: number[], n: number) => {
    arr.sort((a, b) => strength(b) - strength(a))
    const size = arr.length / n
    return Array.from({ length: n }, (_, i) => arr.slice(i * size, (i + 1) * size))
  }
  return { UCL: mkPots(ucl, 4), UEL: mkPots(uel, 4), UECL: mkPots(uecl, 6) }
}

export function compsForClub(w: World, clubId: number): Competition[] {
  return Object.values(w.competitions).filter((c) => c.season === w.season && c.clubs.includes(clubId))
}
