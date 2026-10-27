// What a club earns, in one place: the broadcasting and commercial money that comes in each month, the gate at a home
// match, and from them what a season brings in. Wages are judged against that, as football's own rules do it: the
// share of a club's income its wage bill takes (healthy up to seven tenths, UEFA's squad-cost line; unsustainable past
// eight and a half, the Premier League's). There is no separate wage budget to fit inside: wages are paid from the
// club's money week by week, and the board watches what they do to it.
import type { Club, World } from '../../domain/types'
import { roundValue } from '../../domain/finance'
import { statureOf } from './reputation'
import { wageBills } from './roster'

/** How a club's income compares with the league-wide formulas below (each club's own size, see calibrateIncomes). */
const scaleOf = (club: Club) => club.finance.incomeScale ?? 1

export const monthlyBroadcasting = (w: World, club: Club): number =>
  Math.round(((w.leagues[club.leagueId]?.wealth || 2) ** 2.2) * 95_000 * (0.8 + club.prestige.intl * 0.05) * scaleOf(club))

/** A year of sponsorship and merchandise for the biggest names in the richest league. */
const COMMERCIAL_TOP = 260_000_000
/**
 * Sponsorship and merchandise: a club's name sells (its stature: history and following, the biggest clubs far
 * apart from the rest) in a market its league sizes. Real Madrid's shirt is worth more than Ajax's, and Ajax's more
 * than a club with a smaller past in a bigger league. Owners who back their club add theirs through it.
 */
export function monthlyCommercial(w: World, club: Club): number {
  const lg = w.leagues[club.leagueId]
  const s = statureOf({ id: club.id, names: [club.name, club.dbName || club.name], squadAvg: club.squadAvg, leaguePrestige: lg?.prestige, capacity: club.capacity, inLeague: !!lg })
  return Math.round((COMMERCIAL_TOP / 12) * Math.exp(0.45 * (s - 10)) * ((lg?.wealth || 2) / 10) ** 0.8 * scaleOf(club) + (club.finance.backing || 0) / 12)
}

/** What a seat costs at his ground (gate receipts are the attendance at this price; more in Europe). */
export const ticketPrice = (w: World, club: Club): number =>
  (12 + (w.leagues[club.leagueId]?.wealth || 3) * 6.5 + club.prestige.domestic * 1.5) * scaleOf(club)

/**
 * A season's income as the club's finances run it: twelve months of broadcasting and commercial money, and the gate
 * from a season of home league matches at about nine tenths full. Cup runs, European nights and prize money come on
 * top, so this is the dependable part of it.
 */
export function seasonIncome(w: World, club: Club): number {
  return Math.round((monthlyBroadcasting(w, club) + monthlyCommercial(w, club)) * 12 + club.capacity * 0.9 * ticketPrice(w, club) * homeLeagueGames(w, club.id))
}

// Each club's home league games this season, read from the competitions once and kept until the season or the set of
// competitions changes (looking through every competition for each club, each time, came to a fifth of a second for
// the whole world, at its creation and at every month's accounts).
const homeGamesOf = new WeakMap<World, { season: number; comps: number; games: Map<number, number> }>()
function homeLeagueGames(w: World, clubId: number): number {
  const comps = Object.keys(w.competitions).length
  let c = homeGamesOf.get(w)
  if (!c || c.season !== w.season || c.comps !== comps) {
    const games = new Map<number, number>()
    for (const comp of Object.values(w.competitions)) {
      if (comp.format !== 'league' || comp.season !== w.season) continue
      for (const id of comp.clubs) if (!games.has(id)) games.set(id, Math.max(1, comp.clubs.length - 1))
    }
    homeGamesOf.set(w, (c = { season: w.season, comps, games }))
  }
  return c.games.get(clubId) ?? 19
}

/** The share of the season's income a weekly wage bill takes. */
export const wagesToIncome = (w: World, club: Club, weeklyBill: number): number => (weeklyBill * 52) / Math.max(1, seasonIncome(w, club))

/** Healthy up to this share of income, unsustainable beyond the second. */
export const WAGES_HEALTHY = 0.7
export const WAGES_LIMIT = 0.85
export type WageHealth = 'healthy' | 'stretched' | 'unsustainable'
export const wageHealth = (share: number): WageHealth => (share <= WAGES_HEALTHY ? 'healthy' : share <= WAGES_LIMIT ? 'stretched' : 'unsustainable')

/** The board's line on wages this season: its objective, else the healthy share. */
export function wageLine(w: World): number {
  return w.board.objectives.find((o) => o.season === w.season && o.metric === 'wageShare' && o.status === 'active')?.target ?? WAGES_HEALTHY
}

export type WageTone = 'ok' | 'warn' | 'bad'
/** Within the board's line, past it, or past the point a club can carry. */
export const wageTone = (share: number, line: number): WageTone => (share <= line ? 'ok' : share <= Math.max(WAGES_LIMIT, line + 0.08) ? 'warn' : 'bad')

/**
 * The line the board draws on wages for the season: seven tenths of income, or for a club already beyond it, a little
 * above where it stands (a board asks a stretched club not to make it worse; it can't ask for a squad sold in a week).
 */
export const wageTarget = (share: number): number => (share <= WAGES_HEALTHY - 0.08 ? WAGES_HEALTHY : Math.min(1.5, Math.ceil((share + 0.06) * 20) / 20))

/** The rest of what running a club costs (staff, ground, travel, academy): a share of what it earns, paid monthly. */
export const monthlyRunningCosts = (w: World, club: Club): number => Math.round((seasonIncome(w, club) - (club.finance.backing || 0)) * 0.22 / 12)

/**
 * Size every club's income to what it pays its players. The formulas above know a league's money and a club's name;
 * what a club spends on wages knows how big it really is (a Dutch side's squad earns a fraction of an English one's
 * in the same database). So each club starts where real clubs stand, its wages about two fifths to two thirds of its
 * income: a club the formulas would make rich runs on less, and one paying far beyond them (a state-backed squad) has
 * owners who make up the difference.
 */
export function calibrateIncomes(w: World) {
  const bills = wageBills(w)
  for (const club of Object.values(w.clubs)) {
    if (club.national) continue
    delete club.finance.incomeScale
    delete club.finance.backing
    const bill = (bills.get(club.id) || 0) * 52
    const formula = seasonIncome(w, club)
    if (!bill || !formula) continue
    const fs = bill / formula
    const start = fs < 0.45 ? 0.45 - (0.45 - fs) * 0.15 : fs > 0.66 ? 0.66 + (fs - 0.66) * 0.25 : fs
    const target = bill / start
    if (target <= formula) club.finance.incomeScale = Math.round(Math.max(0.12, target / formula) * 1000) / 1000
    else club.finance.backing = roundValue(target - formula)
  }
}
