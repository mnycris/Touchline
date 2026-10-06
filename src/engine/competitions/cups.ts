import type { Competition, Fixture, ISODate, Round, World } from '../../domain/types'
import { Rng } from '../../domain/rng'
import { addDays, diffDays } from '../../domain/dates'
import { ClubDateIndex, findDate, kickoffFor, type SeasonDates } from './calendar'
import { newFixture } from './fixtures'

export interface CupRoundDef {
  name: string
  target: number // clubs remaining after this round
  dateIdx: number
  dateIdx2?: number // second leg
  entry?: (w: World, clubId: number) => boolean // clubs joining at this round
  neutral?: string // venue name for neutral ties
  lowerHome?: boolean // lower tier hosts (Copa del Rey)
}

export interface CupDef {
  key: string
  name: string
  short: string
  country: string
  dates: string // key into SeasonDates.cups
  tier: number
  clubs: (w: World) => number[]
  rounds: CupRoundDef[]
  extraTime: boolean
  noExtraTimeFinal?: boolean
}

const levelOf = (w: World, c: number) => w.leagues[w.clubs[c]?.leagueId]?.level ?? 5
const inUefa = (w: World, c: number) => Object.values(w.competitions).some((k) => k.format === 'uefa' && k.season === w.season && k.clubs.includes(c))
const leagueClubs = (w: World, ids: number[]) => ids.flatMap((id) => w.leagues[id]?.clubs || [])

export const CUP_DEFS: CupDef[] = [
  {
    key: 'FACUP', name: 'Emirates FA Cup', short: 'FA Cup', country: 'England', dates: 'FACUP', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [13, 14, 60, 61]),
    rounds: [
      { name: 'First Round', target: 40, dateIdx: 0, entry: (w, c) => levelOf(w, c) >= 3 },
      { name: 'Second Round', target: 20, dateIdx: 1 },
      { name: 'Third Round', target: 32, dateIdx: 2, entry: (w, c) => levelOf(w, c) <= 2 },
      { name: 'Fourth Round', target: 16, dateIdx: 3 },
      { name: 'Fifth Round', target: 8, dateIdx: 4 },
      { name: 'Quarter-final', target: 4, dateIdx: 5 },
      { name: 'Semi-final', target: 2, dateIdx: 6, neutral: 'Wembley Stadium' },
      { name: 'Final', target: 1, dateIdx: 7, neutral: 'Wembley Stadium' },
    ],
  },
  {
    key: 'EFLCUP', name: 'Carabao Cup', short: 'Carabao Cup', country: 'England', dates: 'EFLCUP', tier: 3, extraTime: false,
    clubs: (w) => leagueClubs(w, [13, 14, 60, 61]),
    rounds: [
      { name: 'First Round', target: 36, dateIdx: 0, entry: (w, c) => levelOf(w, c) >= 2 },
      { name: 'Second Round', target: 0, dateIdx: 1, entry: (w, c) => levelOf(w, c) === 1 && !inUefa(w, c) },
      { name: 'Third Round', target: 16, dateIdx: 2, entry: (w, c) => levelOf(w, c) === 1 && inUefa(w, c) },
      { name: 'Fourth Round', target: 8, dateIdx: 3 },
      { name: 'Quarter-final', target: 4, dateIdx: 4 },
      { name: 'Semi-final', target: 2, dateIdx: 5, dateIdx2: 6 },
      { name: 'Final', target: 1, dateIdx: 7, neutral: 'Wembley Stadium' },
    ],
  },
  {
    key: 'CDR', name: 'Copa del Rey', short: 'Copa del Rey', country: 'Spain', dates: 'CDR', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [53, 54]),
    rounds: [
      { name: 'First Round', target: 28, dateIdx: 0, lowerHome: true, entry: (w, c) => !w.flags.supercopa?.includes(c) },
      { name: 'Round of 32', target: 16, dateIdx: 2, lowerHome: true, entry: (w, c) => !!w.flags.supercopa?.includes(c) },
      { name: 'Round of 16', target: 8, dateIdx: 3, lowerHome: true },
      { name: 'Quarter-final', target: 4, dateIdx: 4, lowerHome: true },
      { name: 'Semi-final', target: 2, dateIdx: 5, dateIdx2: 6 },
      { name: 'Final', target: 1, dateIdx: 7, neutral: 'Estadio de La Cartuja' },
    ],
  },
  {
    key: 'DFB', name: 'DFB-Pokal', short: 'DFB-Pokal', country: 'Germany', dates: 'DFB', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [19, 20, 2076]),
    rounds: [
      { name: 'First Round', target: 32, dateIdx: 0, lowerHome: true },
      { name: 'Second Round', target: 16, dateIdx: 1, lowerHome: true },
      { name: 'Round of 16', target: 8, dateIdx: 2, lowerHome: true },
      { name: 'Quarter-final', target: 4, dateIdx: 3, lowerHome: true },
      { name: 'Semi-final', target: 2, dateIdx: 4, lowerHome: true },
      { name: 'Final', target: 1, dateIdx: 5, neutral: 'Olympiastadion Berlin' },
    ],
  },
  {
    key: 'CI', name: 'Coppa Italia Frecciarossa', short: 'Coppa Italia', country: 'Italy', dates: 'CI', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [31, 32]),
    rounds: [
      { name: 'First Round', target: 16, dateIdx: 0, entry: (w, c) => levelOf(w, c) === 2 || (w.flags.ciSeeds && !w.flags.ciSeeds.includes(c)) },
      { name: 'Second Round', target: 8, dateIdx: 1 },
      { name: 'Round of 16', target: 8, dateIdx: 2, entry: (w, c) => !!w.flags.ciSeeds?.includes(c) },
      { name: 'Quarter-final', target: 4, dateIdx: 3 },
      { name: 'Semi-final', target: 2, dateIdx: 4, dateIdx2: 5 },
      { name: 'Final', target: 1, dateIdx: 6, neutral: 'Stadio Olimpico' },
    ],
  },
  {
    key: 'CDF', name: 'Coupe de France', short: 'Coupe de France', country: 'France', dates: 'CDF', tier: 2, extraTime: false,
    clubs: (w) => leagueClubs(w, [16, 17]),
    rounds: [
      { name: 'Round of 64', target: 32, dateIdx: 0, lowerHome: true },
      { name: 'Round of 32', target: 16, dateIdx: 1, lowerHome: true },
      { name: 'Round of 16', target: 8, dateIdx: 2, lowerHome: true },
      { name: 'Quarter-final', target: 4, dateIdx: 3, lowerHome: true },
      { name: 'Semi-final', target: 2, dateIdx: 4, lowerHome: true },
      { name: 'Final', target: 1, dateIdx: 5, neutral: 'Stade de France' },
    ],
  },
  {
    key: 'KNVB', name: 'KNVB Beker', short: 'KNVB Beker', country: 'Netherlands', dates: 'KNVB', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [10]),
    rounds: [
      { name: 'First Round', target: 16, dateIdx: 0 },
      { name: 'Round of 16', target: 8, dateIdx: 2 },
      { name: 'Quarter-final', target: 4, dateIdx: 3 },
      { name: 'Semi-final', target: 2, dateIdx: 4 },
      { name: 'Final', target: 1, dateIdx: 5, neutral: 'De Kuip' },
    ],
  },
  {
    key: 'TACA', name: 'Taça de Portugal', short: 'Taça de Portugal', country: 'Portugal', dates: 'TACA', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [308]),
    rounds: [
      { name: 'Fourth Round', target: 16, dateIdx: 1 },
      { name: 'Round of 16', target: 8, dateIdx: 2 },
      { name: 'Quarter-final', target: 4, dateIdx: 3 },
      { name: 'Semi-final', target: 2, dateIdx: 4, dateIdx2: 5 },
      { name: 'Final', target: 1, dateIdx: 6, neutral: 'Estádio Nacional do Jamor' },
    ],
  },
  {
    key: 'SCOTCUP', name: 'Scottish Cup', short: 'Scottish Cup', country: 'Scotland', dates: 'SCOTCUP', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [50]),
    rounds: [
      { name: 'Fourth Round', target: 8, dateIdx: 0 },
      { name: 'Quarter-final', target: 4, dateIdx: 2 },
      { name: 'Semi-final', target: 2, dateIdx: 3, neutral: 'Hampden Park' },
      { name: 'Final', target: 1, dateIdx: 4, neutral: 'Hampden Park' },
    ],
  },
  {
    key: 'BELCUP', name: 'Croky Cup', short: 'Belgian Cup', country: 'Belgium', dates: 'BELCUP', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [4]),
    rounds: [
      { name: 'First Round', target: 16, dateIdx: 0 },
      { name: 'Round of 16', target: 8, dateIdx: 1 },
      { name: 'Quarter-final', target: 4, dateIdx: 2 },
      { name: 'Semi-final', target: 2, dateIdx: 3 },
      { name: 'Final', target: 1, dateIdx: 4, neutral: 'Stade Roi Baudouin' },
    ],
  },
  {
    key: 'TURCUP', name: 'Türkiye Kupası', short: 'Turkish Cup', country: 'Türkiye', dates: 'TURCUP', tier: 2, extraTime: true,
    clubs: (w) => leagueClubs(w, [68]),
    rounds: [
      { name: 'First Round', target: 16, dateIdx: 0 },
      { name: 'Round of 16', target: 8, dateIdx: 1 },
      { name: 'Quarter-final', target: 4, dateIdx: 2 },
      { name: 'Semi-final', target: 2, dateIdx: 3 },
      { name: 'Final', target: 1, dateIdx: 4, neutral: 'Neutral venue' },
    ],
  },
]

export const SUPER_CUPS: { key: string; name: string; short: string; country: string; dates: string; venue?: string; four?: boolean; penaltiesOnly?: boolean }[] = [
  { key: 'COMMSHIELD', name: 'FA Community Shield', short: 'Community Shield', country: 'England', dates: 'COMMSHIELD', venue: 'Wembley Stadium', penaltiesOnly: true },
  { key: 'SUPERCOPA', name: 'Supercopa de España', short: 'Supercopa', country: 'Spain', dates: 'SUPERCOPA', venue: 'Alinma Stadium, Jeddah', four: true, penaltiesOnly: true },
  { key: 'DFLSC', name: 'Franz Beckenbauer Supercup', short: 'DFL-Supercup', country: 'Germany', dates: 'DFLSC', penaltiesOnly: true },
  { key: 'SCI', name: 'Supercoppa Italiana', short: 'Supercoppa', country: 'Italy', dates: 'SCI', venue: 'Al-Awwal Park, Riyadh', four: true, penaltiesOnly: true },
  { key: 'TDC', name: 'Trophée des Champions', short: 'Trophée des Champions', country: 'France', dates: 'TDC', penaltiesOnly: true },
  { key: 'JCS', name: 'Johan Cruijff Schaal', short: 'Johan Cruijff Schaal', country: 'Netherlands', dates: 'JCS', penaltiesOnly: true },
  { key: 'SUPERTACA', name: 'Supertaça Cândido de Oliveira', short: 'Supertaça', country: 'Portugal', dates: 'SUPERTACA', venue: 'Estádio Municipal de Aveiro', penaltiesOnly: true },
]

function strength(w: World, c: number) {
  const cl = w.clubs[c]
  return (cl?.squadAvg || 60) + (cl?.prestige.domestic || 3) * 0.6 - (levelOf(w, c) - 1) * 3
}

export function createCup(w: World, def: CupDef, season: number, dates: SeasonDates): Competition {
  const clubs = def.clubs(w)
  const ds = dates.cups[def.dates] || []
  const comp: Competition = {
    id: `${def.key}-${season}`, key: def.key, name: def.name, short: def.short, format: 'cup', season, country: def.country,
    tier: def.tier, clubs, fixtures: [], status: 'upcoming', logoKey: def.key,
    rules: { extraTime: def.extraTime, penalties: true },
    rounds: def.rounds.map((r, i) => ({
      id: `${def.key}-${season}-R${i + 1}`, name: r.name, legs: r.dateIdx2 !== undefined ? 2 : 1,
      date: ds[r.dateIdx] || ds[ds.length - 1], date2: r.dateIdx2 !== undefined ? ds[r.dateIdx2] : undefined,
      fixtures: [], drawn: false, neutral: !!r.neutral, venueName: r.neutral,
    })),
  }
  w.competitions[comp.id] = comp
  return comp
}

export function cupDef(key: string) {
  return CUP_DEFS.find((d) => d.key === key)
}

/**
 * Draw a knockout round: pool = previous winners + byes + new entrants. Lowest seeds play first; rest get byes.
 * From the round where nobody new joins, every round must halve exactly down to the final. A dynamic round (target 0)
 * leaves just enough clubs for that; when the clubs still to come in leave it too few games to play, the lowest of
 * them come in a round early. If a round would still hold more clubs than it can halve (a bracket that has gone out
 * of shape), the surplus is settled first in a play-off between the lowest-ranked, so nobody walks through on byes.
 */
export function drawCupRound(w: World, comp: Competition, idx: number, rng: Rng, idxDates: ClubDateIndex) {
  const def = cupDef(comp.key)
  const round = comp.rounds[idx]
  if (!def || round.drawn) return
  // rounds are matched to the definition by name: a play-off the draw inserted has no definition of its own
  const di = def.rounds.findIndex((r) => r.name === round.name)
  const rdef: CupRoundDef = di >= 0 ? def.rounds[di] : { name: round.name, target: round.target ?? 1, dateIdx: -1 }
  const prev = idx > 0 ? comp.rounds[idx - 1] : undefined
  const already = new Set<number>()
  for (const r of comp.rounds.slice(0, idx)) for (const c of r.pool || []) already.add(c)
  let pool: number[] = prev ? [...(prev.winners || []), ...(prev.byes || [])] : []
  const entrants = di < 0 ? [] : comp.clubs.filter((c) => !already.has(c) && !pool.includes(c) && (idx === 0 ? (rdef.entry ? rdef.entry(w, c) : true) : rdef.entry ? rdef.entry(w, c) : false))
  pool = [...pool, ...entrants]
  // final round safety: everyone left enters
  if (di >= 0 && (di === def.rounds.length - 1 || !def.rounds.slice(di + 1).some((r) => r.entry))) {
    const rest = comp.clubs.filter((c) => !already.has(c) && !pool.includes(c))
    if (idx === 0) pool.push(...rest)
  }
  let target = rdef.target
  if (target === 0) {
    // dynamic: the rounds after this one halve down to the final, so the next round needs a power of two
    const later = comp.clubs.filter((c) => !already.has(c) && !pool.includes(c))
    target = Math.max(1, Math.pow(2, def.rounds.length - di - 1) - later.length)
    if (pool.length > 2 * target) {
      const early = [...later].sort((a, b) => strength(w, a) - strength(w, b)).slice(0, pool.length - 2 * target)
      pool.push(...early)
      target += early.length
    }
  }
  if (pool.length > 2 * target && di >= 0) {
    // too many clubs to halve: a play-off for the lowest-ranked settles the surplus before this round is drawn
    const extra = pool.length - 2 * target
    const after = prev?.date && prev.date > w.date ? prev.date : w.date
    let date = round.date > addDays(after, 9) ? addDays(round.date, -7) : addDays(after, 3)
    if (date > addDays(round.date, -3)) {
      const shift = diffDays(addDays(date, 4), round.date)
      round.date = addDays(round.date, shift)
      if (round.date2) round.date2 = addDays(round.date2, shift)
    }
    const po: Round = { id: `${round.id}P`, name: `${round.name} play-off`, legs: 1, date, fixtures: [], drawn: false, target: pool.length - extra }
    comp.rounds.splice(idx, 0, po)
    drawPlayoff(w, comp, po, pool, extra, rng, idxDates)
    return
  }
  const games = Math.max(0, Math.min(Math.floor(pool.length / 2), pool.length - target))
  // a club that sat out the last round plays in this one
  const rested = new Set(prev?.byes || [])
  const rank = (c: number) => strength(w, c) - (rested.has(c) ? 1000 : 0)
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b))
  const players = sorted.slice(0, games * 2)
  const byes = sorted.slice(games * 2)
  rng.shuffle(players)
  round.pool = pool
  round.byes = byes
  round.winners = []
  round.drawn = true
  for (let i = 0; i < games; i++) {
    let h = players[2 * i], a = players[2 * i + 1]
    if (rdef.lowerHome && levelOf(w, a) > levelOf(w, h)) [h, a] = [a, h]
    const tieId = `${round.id}:T${i + 1}`
    if (round.legs === 2) {
      const d1 = findDate(idxDates, h, a, round.date, { gap: 1 })
      const f1 = newFixture(w, comp, h, a, d1, kickoffFor(d1, 'cup'), round.name, { roundId: round.id, tieId, leg: 1 })
      idxDates.add(h, d1); idxDates.add(a, d1)
      const d2 = findDate(idxDates, a, h, round.date2 || addDays(round.date, 21), { gap: 1 })
      newFixture(w, comp, a, h, d2, kickoffFor(d2, 'cup'), round.name, { roundId: round.id, tieId, leg: 2 })
      idxDates.add(h, d2); idxDates.add(a, d2)
      round.fixtures.push(f1.id, comp.fixtures[comp.fixtures.length - 1])
    } else {
      const neutral = !!rdef.neutral
      const d = neutral ? round.date : findDate(idxDates, h, a, round.date, { gap: 1 })
      const f = newFixture(w, comp, h, a, d, kickoffFor(d, neutral && i === 0 && rdef.target === 1 ? 'final' : 'cup'), round.name,
        { roundId: round.id, tieId, neutral, venue: rdef.neutral })
      idxDates.add(h, d); idxDates.add(a, d)
      round.fixtures.push(f.id)
    }
  }
  comp.status = 'active'
  if (games === 0 && idx < comp.rounds.length - 1) drawCupRound(w, comp, idx + 1, rng, idxDates)
}

/** The play-off the draw inserted: the lowest-ranked clubs of the pool meet, everyone else waits for the round itself. */
function drawPlayoff(w: World, comp: Competition, po: Round, pool: number[], extra: number, rng: Rng, idxDates: ClubDateIndex) {
  const sorted = [...pool].sort((a, b) => strength(w, a) - strength(w, b))
  const players = sorted.slice(0, extra * 2)
  rng.shuffle(players)
  po.pool = pool
  po.byes = sorted.slice(extra * 2)
  po.winners = []
  po.drawn = true
  for (let i = 0; i < extra; i++) {
    let h = players[2 * i], a = players[2 * i + 1]
    if (levelOf(w, a) > levelOf(w, h)) [h, a] = [a, h]
    const d = findDate(idxDates, h, a, po.date, { gap: 1 })
    const f = newFixture(w, comp, h, a, d, kickoffFor(d, 'cup'), po.name, { roundId: po.id, tieId: `${po.id}:T${i + 1}` })
    idxDates.add(h, d); idxDates.add(a, d)
    po.fixtures.push(f.id)
  }
  comp.status = 'active'
}

/** Winner of a tie (single or two-legged) once decided, otherwise undefined. */
export function tieWinner(w: World, fixtures: Fixture[]): number | undefined {
  if (fixtures.some((f) => !f.played || !f.result)) return undefined
  // convention: result.score includes extra-time goals; result.et (if present) is the 90-minute score
  if (fixtures.length === 1) {
    const f = fixtures[0], r = f.result!
    if (r.pens) return r.pens[0] > r.pens[1] ? f.home : f.away
    return r.score[0] >= r.score[1] ? f.home : f.away
  }
  const [l1, l2] = fixtures.sort((a, b) => (a.leg || 0) - (b.leg || 0))
  const r2 = l2.result!
  if (r2.pens) return r2.pens[0] > r2.pens[1] ? l2.home : l2.away
  const aggA = l1.result!.score[0] + r2.score[1] // leg1 home team
  const aggB = l1.result!.score[1] + r2.score[0]
  return aggA > aggB ? l1.home : l1.away
}

export function aggregateBefore(w: World, f: Fixture): [number, number] | undefined {
  if (f.leg !== 2 || !f.tieId) return undefined
  const l1 = Object.values(w.fixtures).find((x) => x.tieId === f.tieId && x.leg === 1)
  if (!l1?.result) return undefined
  // aggregate from the perspective of leg-2 home / away
  return [l1.result.score[1], l1.result.score[0]]
}

export function isKnockout(f: Fixture) {
  return !!f.tieId
}

/** After a cup fixture is played: record winners, draw next round or crown the champion. */
export function advanceCup(w: World, comp: Competition, f: Fixture, rng: Rng, idxDates: ClubDateIndex): { roundDone: boolean; champion?: number } {
  const ri = comp.rounds.findIndex((r) => r.id === f.roundId)
  if (ri < 0) return { roundDone: false }
  const round = comp.rounds[ri]
  const tie = round.fixtures.map((id) => w.fixtures[id]).filter((x) => x.tieId === f.tieId)
  const win = tieWinner(w, tie)
  if (win !== undefined && !round.winners!.includes(win)) round.winners!.push(win)
  const allDone = round.fixtures.every((id) => w.fixtures[id].played)
  if (!allDone) return { roundDone: false }
  if (ri === comp.rounds.length - 1 || (round.winners!.length + (round.byes?.length || 0)) === 1) {
    comp.winner = round.winners![0]
    const fin = tie[0]
    comp.runnerUp = fin.home === comp.winner ? fin.away : fin.home
    comp.status = 'finished'
    return { roundDone: true, champion: comp.winner }
  }
  drawCupRound(w, comp, ri + 1, rng, idxDates)
  return { roundDone: true }
}

export function createSuperCup(w: World, key: string, season: number, dates: SeasonDates, teams: number[], idxDates: ClubDateIndex): Competition | undefined {
  const def = SUPER_CUPS.find((s) => s.key === key)
  if (!def || teams.length < 2) return undefined
  const ds = dates.cups[def.dates] || []
  const comp: Competition = {
    id: `${key}-${season}`, key, name: def.name, short: def.short, format: 'supercup', season, country: def.country, tier: 4,
    clubs: teams, fixtures: [], status: 'upcoming', logoKey: key, rules: { extraTime: false, penalties: true },
    rounds: def.four
      ? [{ id: `${key}-${season}-SF`, name: 'Semi-final', legs: 1, date: ds[0], fixtures: [], drawn: true, neutral: true, venueName: def.venue },
        { id: `${key}-${season}-F`, name: 'Final', legs: 1, date: ds[1] || ds[0], fixtures: [], drawn: false, neutral: true, venueName: def.venue }]
      : [{ id: `${key}-${season}-F`, name: 'Final', legs: 1, date: ds[0], fixtures: [], drawn: true, neutral: !!def.venue, venueName: def.venue }],
  }
  w.competitions[comp.id] = comp
  const r0 = comp.rounds[0]
  r0.pool = teams
  r0.winners = []
  if (def.four) {
    const pairs: [number, number][] = [[teams[0], teams[3]], [teams[1], teams[2]]]
    pairs.forEach(([h, a], i) => {
      const f = newFixture(w, comp, h, a, addDays(ds[0], i), '20:00', 'Semi-final', { roundId: r0.id, tieId: `${r0.id}:T${i + 1}`, neutral: true, venue: def.venue })
      r0.fixtures.push(f.id); idxDates.add(h, f.date); idxDates.add(a, f.date)
    })
  } else {
    const [h, a] = teams
    const d = ds[0]
    const f = newFixture(w, comp, h, a, d, kickoffFor(d, 'final'), 'Final', { roundId: r0.id, tieId: `${r0.id}:T1`, neutral: !!def.venue, venue: def.venue })
    r0.fixtures.push(f.id); idxDates.add(h, d); idxDates.add(a, d)
  }
  return comp
}

/** Supercups with two rounds: draw the final after semis. */
export function advanceSuperCup(w: World, comp: Competition, f: Fixture): { champion?: number } {
  const ri = comp.rounds.findIndex((r) => r.id === f.roundId)
  const round = comp.rounds[ri]
  const win = tieWinner(w, [f])
  if (win !== undefined) round.winners = [...(round.winners || []), win]
  if (!round.fixtures.every((id) => w.fixtures[id].played)) return {}
  if (ri === comp.rounds.length - 1) {
    comp.winner = round.winners![0]
    comp.runnerUp = f.home === comp.winner ? f.away : f.home
    comp.status = 'finished'
    return { champion: comp.winner }
  }
  const next = comp.rounds[ri + 1]
  const [h, a] = round.winners!
  const nf = newFixture(w, comp, h, a, next.date, '20:00', 'Final', { roundId: next.id, tieId: `${next.id}:T1`, neutral: true, venue: next.venueName })
  next.fixtures.push(nf.id)
  next.pool = [h, a]
  next.winners = []
  next.drawn = true
  return {}
}

export function reservedWeekends(dates: SeasonDates, country: string): Set<ISODate> {
  const s = new Set<ISODate>()
  if (country === 'England') for (const i of [2, 3, 4, 5]) if (dates.cups.FACUP?.[i]) s.add(dates.cups.FACUP[i])
  return s
}
