import { finStyle, STYLE_BUDGET } from './squadPlan'
import type { Competition, Fixture, Player, SeasonArchive, World } from '../../domain/types'
import { createSim } from './matchRunner'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, weekday } from '../../domain/dates'
import { clubBudget, dynamicValue, roundValue } from '../../domain/finance'
import { formationOf } from '../../domain/constants'
import { sortTable } from '../competitions/tables'
import { newFixture } from '../competitions/fixtures'
import { setupSeason } from '../competitions/setupSeason'
import { buildSheet, tacticsForManager } from '../match/selection'
import { finaliseObjectives, generateObjectives, updateBoardConfidence } from './board'
import { seasonAwards } from './awards'
import { isRetiring, seasonAging } from './development'
import { postNews, sendInbox, staffNames } from './messages'
import { rosterOf, touchRoster, setPlayerClub } from './roster'
import { closeCareerEntry, contractDemand, roleForBuyer } from './transfers'
import { pickName, displayName } from '../../domain/names'
import { generateProspect } from './scouting'

// ---------------------------------------------------------------- playoffs
export function leagueFinished(w: World, comp: Competition) {
  return comp.fixtures.every((id) => w.fixtures[id].played)
}

/** Create promotion / relegation play-offs once a league's regular season ends. */
export function createPlayoffs(w: World, comp: Competition) {
  if (w.competitions[`PO${comp.leagueId}-${w.season}`]) return
  const lg = w.leagues[comp.leagueId!]
  if (!lg || !lg.playoff) return
  const table = sortTable(w, comp).map((r) => r.clubId)
  const [a, b] = lg.playoff
  const teams = table.slice(a - 1, b)
  if (teams.length < 2) return
  const lastDate = comp.fixtures.map((id) => w.fixtures[id].date).sort().pop()!
  let d1 = addDays(lastDate, 4)
  while (![2, 3, 5, 6, 0].includes(weekday(d1))) d1 = addDays(d1, 1)
  const po: Competition = {
    id: `PO${lg.id}-${w.season}`, key: `PO${lg.id}`, name: `${lg.short} Play-Offs`, short: `${lg.short} Play-Offs`, format: 'playoff', season: w.season,
    country: lg.country, leagueId: lg.id, tier: lg.level, clubs: teams, fixtures: [], status: 'active', rules: { extraTime: true, penalties: true },
    rounds: [], logoKey: `L${lg.id}`,
  }
  w.competitions[po.id] = po
  const wembley = lg.country === 'England'
  const finalTwoLegs = lg.country === 'Spain' || lg.country === 'Italy'
  const sf = { id: `${po.id}-SF`, name: 'Semi-final', legs: 2 as const, date: d1, date2: addDays(d1, 4), fixtures: [] as string[], drawn: true, pool: teams, winners: [] as number[] }
  const fin = { id: `${po.id}-F`, name: 'Final', legs: (finalTwoLegs ? 2 : 1) as 1 | 2, date: addDays(d1, 11), date2: finalTwoLegs ? addDays(d1, 15) : undefined, fixtures: [] as string[], drawn: false, neutral: wembley, venueName: wembley ? 'Wembley Stadium' : undefined }
  po.rounds = [sf, fin]
  // 4 teams: 3v6, 4v5 (higher seed at home in 2nd leg). 6 teams (Serie B): 3,4 bye; 5v8, 6v7 play first as single leg on d1 - simplified to top four
  const t = teams.length >= 4 ? teams.slice(0, 4) : teams
  // three-team ladder (Ligue 2): 4th v 5th, winner meets 3rd in the final
  if (t.length === 3) (fin as any).bye = t[0]
  const pairs: [number, number][] = t.length === 4 ? [[t[0], t[3]], [t[1], t[2]]] : t.length === 3 ? [[t[1], t[2]]] : [[t[0], t[1]]]
  pairs.forEach(([hi, lo], i) => {
    const tieId = `${sf.id}:T${i + 1}`
    const f1 = newFixture(w, po, lo, hi, sf.date, '19:45', 'Semi-final', { roundId: sf.id, tieId, leg: 1, importance: 4 })
    const f2 = newFixture(w, po, hi, lo, sf.date2!, '19:45', 'Semi-final', { roundId: sf.id, tieId, leg: 2, importance: 4 })
    sf.fixtures.push(f1.id, f2.id)
  })
  if (teams.includes(w.userClubId)) {
    sendInbox(w, { from: lg.name, fromRole: 'Competition', category: 'Competitions', subject: `${lg.short} play-offs confirmed`, body: `You will contest the ${lg.short} play-offs for a place in the top flight.`, actions: [{ label: 'View Bracket', action: 'openComp', payload: po.id, primary: true }], compId: po.id, urgent: true })
  }
}

export function advancePlayoff(w: World, po: Competition, fixtureId: string) {
  const f = w.fixtures[fixtureId]
  const ri = po.rounds.findIndex((r) => r.id === f.roundId)
  const r = po.rounds[ri]
  if (!r.fixtures.every((id) => w.fixtures[id].played)) return
  const winners: number[] = []
  const ties = new Set(r.fixtures.map((id) => w.fixtures[id].tieId))
  for (const t of ties) {
    const fx = r.fixtures.map((id) => w.fixtures[id]).filter((x) => x.tieId === t).sort((a, b) => (a.leg || 0) - (b.leg || 0))
    const last = fx[fx.length - 1].result!
    if (last.pens) winners.push(last.pens[0] > last.pens[1] ? fx[fx.length - 1].home : fx[fx.length - 1].away)
    else {
      const agg = new Map<number, number>()
      for (const x of fx) { agg.set(x.home, (agg.get(x.home) || 0) + x.result!.score[0]); agg.set(x.away, (agg.get(x.away) || 0) + x.result!.score[1]) }
      const [c1, c2] = [...agg.keys()]
      winners.push((agg.get(c1)! >= agg.get(c2)!) ? c1 : c2)
    }
  }
  r.winners = winners
  const bye = (po.rounds[ri + 1] as any)?.bye as number | undefined
  if (bye && ri === 0) winners.unshift(bye)
  if (ri === po.rounds.length - 1 || winners.length === 1 && ri > 0) {
    po.winner = winners[0]
    po.status = 'finished'
    postNews(w, { headline: `${w.clubs[po.winner].short} win the ${po.short}`, body: `${w.clubs[po.winner].name} have won promotion via the play-offs.`, kind: 'title', playerIds: [], clubIds: [po.winner], compId: po.id, importance: 3, userRelated: po.winner === w.userClubId })
    return
  }
  const fin = po.rounds[ri + 1]
  fin.drawn = true
  fin.pool = winners
  fin.winners = []
  const [h, a] = winners
  if (fin.legs === 2) {
    const f1 = newFixture(w, po, a, h, fin.date, '20:00', 'Final', { roundId: fin.id, tieId: `${fin.id}:T1`, leg: 1, importance: 5 })
    const f2 = newFixture(w, po, h, a, fin.date2!, '20:00', 'Final', { roundId: fin.id, tieId: `${fin.id}:T1`, leg: 2, importance: 5 })
    fin.fixtures.push(f1.id, f2.id)
  } else {
    const f1 = newFixture(w, po, h, a, fin.date, '16:30', 'Final', { roundId: fin.id, tieId: `${fin.id}:T1`, neutral: !!fin.neutral, venue: fin.venueName, importance: 5 })
    fin.fixtures.push(f1.id)
  }
}

export function allSeasonFixturesPlayed(w: World): boolean {
  return Object.values(w.fixtures).every((f) => f.played)
}

// ---------------------------------------------------------------- rollover
export function seasonRollover(w: World, rng: Rng): SeasonArchive {
  const season = w.season
  const archive: SeasonArchive = { season, tables: {}, winners: {}, userClubId: w.userClubId, awards: [], topScorers: {}, transfersIn: 0, transfersOut: 0 }
  // ---- awards & archive
  archive.awards = seasonAwards(w)
  for (const comp of Object.values(w.competitions)) {
    if (comp.season !== season) continue
    if (comp.table) archive.tables[comp.key] = sortTable(w, comp)
    let winner = comp.winner
    if (comp.format === 'league' && comp.table) winner = archive.tables[comp.key][0]?.clubId
    if (winner) {
      archive.winners[comp.key] = winner
      w.clubs[winner]?.trophies.push({ compKey: comp.key, season })
      if (winner === w.userClubId) {
        w.user.trophies.push({ compKey: comp.key, compName: comp.name, season, clubId: winner })
        const h = w.user.history[w.user.history.length - 1]
        if (h) h.trophies.push(comp.short)
        w.user.reputation = clamp(w.user.reputation + (comp.tier === 1 ? 8 : 4), 1, 100)
      }
      const m = w.managers[w.clubs[winner]?.managerId]
      if (m) { m.trophies++; m.reputation = clamp(m.reputation + 3, 1, 99) }
    }
    if (comp.stats?.topScorers) archive.topScorers[comp.key] = comp.stats.topScorers
  }
  const userLeague = Object.values(w.competitions).find((c) => c.season === season && c.format === 'league' && c.clubs.includes(w.userClubId))
  if (userLeague) archive.userFinish = archive.tables[userLeague.key]?.findIndex((r) => r.clubId === w.userClubId) + 1
  archive.transfersIn = w.transfers.history.filter((t) => t.season === season && t.to === w.userClubId).length
  archive.transfersOut = w.transfers.history.filter((t) => t.season === season && t.from === w.userClubId).length
  // ---- prize money & reputation
  for (const comp of Object.values(w.competitions)) {
    if (comp.season !== season || comp.format !== 'league' || !comp.table) continue
    const lg = w.leagues[comp.leagueId!]
    const t = archive.tables[comp.key]
    t.forEach((row, i) => {
      const club = w.clubs[row.clubId]
      const prize = roundValue((lg?.wealth || 3) ** 2 * 380_000 * (1 + (t.length - i) / t.length))
      club.finance.balance += prize
      club.finance.revenueSeason += prize
      if (club.id === w.userClubId) club.finance.ledger.push({ date: w.date, label: `${comp.short} prize money (${i + 1}${suffix(i + 1)})`, amount: prize, kind: 'prize' })
      club.lastSeasonPos = i + 1
      const exp = club.prestige.domestic
      club.reputation = clamp(club.reputation + (i < 3 ? 2 : i >= t.length - 3 ? -2 : 0), 5, 100)
      void exp
    })
  }
  // ---- promotion / relegation
  movePromotions(w, archive, rng)
  // ---- board review
  finaliseObjectives(w)
  updateBoardConfidence(w)
  // ---- player lifecycle
  const retirees: Player[] = []
  for (const p of Object.values(w.players)) {
    closeCareerEntry(w, p)
    const age = ageOn(p.dob, `${season + 1}-06-30`)
    // loans return
    if (p.loan) {
      const back = p.loan.fromClubId
      if (p.loan.obligation && p.loan.optionFee) {
        p.loan = undefined
      } else {
        setPlayerClub(w, p, back)
        p.loan = undefined
      }
    }
    if (p.retiringAtSeasonEnd || (age >= 34 && isRetiring(p, age, rng))) {
      retirees.push(p)
      continue
    }
    // contract expiry
    if (p.clubId && p.contract.until <= season + 1) {
      const club = w.clubs[p.clubId]
      const keep = p.clubId !== w.userClubId && (p.contract.role === 'Crucial' || p.contract.role === 'Important' || (age <= 29 && rng.next() < 0.5)) && rng.next() < 0.85
      if (keep && club) {
        const c = contractDemand(w, p, club.id, roleForBuyer(w, p, club.id))
        p.contract = { until: season + 1 + c.years, wage: c.wage, role: c.role, releaseClause: 0, signedOn: w.date }
        p.wage = c.wage
      } else if (p.clubId !== w.userClubId || !w.flags.renewed?.[p.id]) {
        w.transfers.history.unshift({ date: w.date, playerId: p.id, playerName: p.name, from: p.clubId, to: 0, fee: 0, type: 'release', season })
        setPlayerClub(w, p, 0)
      }
    }
    p.yellowAccum = {}
    p.suspensions = p.suspensions.filter((s) => s.scope === 'all')
    p.fitness = clamp(88 + rng.int(0, 12), 0, 100)
    p.sharpness = clamp(45 + rng.int(0, 20), 0, 100)
    p.intlDuty = false
    // his season for his country goes into his international record
    if (p.intlSeason) {
      const lines = Object.values(p.intlSeason)
      const caps = lines.reduce((a, s) => a + s.apps, 0), goals = lines.reduce((a, s) => a + s.goals, 0)
      if (caps) (p.intlCareer ||= []).push([season, caps, goals])
      p.intlSeason = undefined
    }
    seasonAging(w, p, rng)
    p.value = dynamicValue(p, w.date, p.valueCalib ?? 1)
  }
  for (const p of retirees) {
    w.transfers.history.unshift({ date: w.date, playerId: p.id, playerName: p.name, from: p.clubId, to: 0, fee: 0, type: 'retire', season })
    if (p.ovr >= 80 || p.clubId === w.userClubId) postNews(w, { headline: `${p.name} retires`, body: `${p.name} has announced his retirement from professional football at the age of ${ageOn(p.dob, w.date)}.`, kind: 'milestone', playerIds: [p.id], clubIds: [p.clubId], importance: p.ovr >= 84 ? 4 : 2, userRelated: p.clubId === w.userClubId })
    delete w.players[p.id]
  }
  touchRoster(w)
  // ---- youth intake (regens) for all clubs keeps the world alive
  regenIntake(w, rng)
  // ---- user academy age-out
  for (const p of rosterAcademy(w)) {
    if (ageOn(p.dob, `${season + 1}-07-01`) >= 19) {
      p.academy = false
      p.academyGrad = p.clubId
      p.gradDate = w.date
      p.contract = { ...p.contract, role: 'Prospect', until: season + 4, wage: 1500, signedOn: w.date }
      sendInbox(w, { from: staffNames(w).youth, fromRole: 'Head of Youth Development', category: 'Youth', subject: `${p.name} promoted`, body: `${p.name} has aged out of the academy and has been promoted to the senior squad.`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id })
    }
  }
  // ---- budgets for the new season
  for (const club of Object.values(w.clubs)) {
    if (club.national) continue
    const squad = rosterOf(w, club.id)
    const value = squad.reduce((a, p) => a + p.value, 0)
    const lg = w.leagues[club.leagueId]
    const top = squad.map((p) => p.ovr).sort((a, b) => b - a).slice(0, 16)
    club.squadAvg = top.length ? Math.round(top.reduce((a, b) => a + b, 0) / top.length * 10) / 10 : club.squadAvg
    club.prestige.intl = clamp(Math.round((club.squadAvg - 59.5) / 2.25), 1, 10)
    const base = clubBudget(value, lg, club.prestige.intl)
    // AI clubs: structural budget by financial style, plus part of what they didn't spend (sales already added during the year)
    club.finance.transferBudget = club.id === w.userClubId
      ? roundValue(base * (0.6 + w.board.overall / 125) + Math.max(0, club.finance.transferBudget * 0.3))
      : roundValue(Math.min(base * 2.2, base * STYLE_BUDGET[finStyle(w, club)] + Math.max(0, club.finance.transferBudget) * 0.35))
    club.finance.wageBudget = Math.round(squad.reduce((a, p) => a + p.contract.wage, 0) * 1.08)
    club.finance.revenueSeason = 0
    club.finance.expensesSeason = 0
    // refresh AI team sheets
    if (club.id !== w.userClubId) {
      const m = w.managers[club.managerId]
      const f = formationOf(m?.formation || '4-3-3 Holding').id
      club.sheets = [buildSheet(w, club, f, tacticsForManager(m?.vision || 'Balanced', f))]
      club.activeSheet = 'first'
    }
  }
  w.archive.push(archive)
  // ---- next season
  const next = season + 1
  // drop last season's fixtures (keep user's for history), competitions kept in archive only
  for (const [id, f] of Object.entries(w.fixtures)) if (!f.userInvolved) delete w.fixtures[id]
  for (const [id, c] of Object.entries(w.competitions)) if (c.season === season && !c.clubs.includes(w.userClubId)) delete w.competitions[id]
  w.date = `${next}-07-01`
  setupSeason(w, next, {}, rng)
  generateObjectives(w, rng)
  w.board.overall = Math.round(w.board.overall * 0.5 + 35)
  w.flags.boardWarned = undefined
  w.flags.seasonReview = season
  w.transfers.offers = {}
  w.transfers.targets = Object.fromEntries(Object.entries(w.transfers.targets).filter(([, t]) => t.status !== 'Completed' && t.status !== 'Negotiations Failed'))
  postNews(w, { headline: `The ${next}/${String((next + 1) % 100).padStart(2, '0')} season begins`, body: `Pre-season is underway. Fixtures for the new campaign have been released.`, kind: 'preview', playerIds: [], clubIds: [w.userClubId], importance: 3, userRelated: true })
  return archive
}

function suffix(n: number) {
  return n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
}

function rosterAcademy(w: World) {
  return Object.values(w.players).filter((p) => p.academy && p.clubId === w.userClubId)
}

function movePromotions(w: World, archive: SeasonArchive, rng: Rng) {
  // group leagues by country ordered by level
  const byCountry: Record<string, number[]> = {}
  for (const lg of Object.values(w.leagues)) (byCountry[lg.country] ||= []).push(lg.id)
  for (const ids of Object.values(byCountry)) {
    ids.sort((a, b) => w.leagues[a].level - w.leagues[b].level)
    for (let i = 0; i < ids.length - 1; i++) {
      const up = w.leagues[ids[i]], down = w.leagues[ids[i + 1]]
      if (down.level !== up.level + 1) continue
      const upT = archive.tables[`L${up.id}`]?.map((r) => r.clubId) || []
      const dnT = archive.tables[`L${down.id}`]?.map((r) => r.clubId) || []
      if (!upT.length || !dnT.length) continue
      const rele = upT.slice(upT.length - (up.rele || 0))
      const promo = dnT.slice(0, down.promo || 0)
      const po = w.competitions[`PO${down.id}-${archive.season}`]
      if (po?.winner) promo.push(po.winner)
      else if (down.playoff) promo.push(dnT[(down.playoff[0] || 3) - 1])
      // relegation play-off (Bundesliga / Ligue 1 style): 16th of top flight vs next best of lower
      if (up.releplayoff && (down.promoplayoff || down.playoff)) {
        const cand = upT[up.releplayoff - 1]
        const challenger = down.promoplayoff ? dnT[down.promoplayoff - 1] : undefined
        if (challenger && !promo.includes(challenger)) {
          if (relegationPlayoff(w, up.id, cand, challenger, archive.season, rng) === challenger) { rele.push(cand); promo.push(challenger) }
        }
      }
      const n = Math.min(rele.length, promo.length)
      const R = rele.slice(rele.length - n), P = promo.slice(0, n)
      for (const c of R) moveClub(w, c, up.id, down.id)
      for (const c of P) moveClub(w, c, down.id, up.id)
      for (const c of P) postNews(w, { headline: `${w.clubs[c].short} promoted to the ${up.short}`, body: `${w.clubs[c].name} will play in the ${up.name} next season.`, kind: 'title', playerIds: [], clubIds: [c], importance: c === w.userClubId ? 5 : 2, userRelated: c === w.userClubId })
      for (const c of R) postNews(w, { headline: `${w.clubs[c].short} relegated from the ${up.short}`, body: `${w.clubs[c].name} drop into the ${down.name}.`, kind: 'relegation', playerIds: [], clubIds: [c], importance: c === w.userClubId ? 5 : 2, userRelated: c === w.userClubId })
    }
  }
}

/** Two-legged relegation play-off played with the match engine (lower-tier side at home first). */
function relegationPlayoff(w: World, upId: number, top: number, low: number, season: number, rng: Rng): number {
  const base = (leg: 1 | 2, home: number, away: number): Fixture => ({
    id: `RPO${upId}-${season}-${leg}`, compId: '', roundName: `Relegation play-off · leg ${leg}`, date: `${season + 1}-05-${leg === 1 ? '28' : '31'}`,
    time: '20:30', home, away, played: false, leg, tieId: `RPO${upId}-${season}`,
  })
  const f1 = base(1, low, top)
  const s1 = createSim(w, f1, false)
  s1.ctx.knockout = false
  const r1 = s1.runToEnd()
  const f2 = base(2, top, low)
  const s2 = createSim(w, f2, false)
  s2.ctx.knockout = true
  s2.ctx.extraTime = true
  s2.ctx.aggregate = [r1.score[1], r1.score[0]]
  const r2 = s2.runToEnd()
  const aggTop = r1.score[1] + r2.score[0], aggLow = r1.score[0] + r2.score[1]
  const winner = r2.pens ? (r2.pens[0] > r2.pens[1] ? top : low) : aggTop >= aggLow ? top : low
  const lg = w.leagues[upId]
  postNews(w, {
    headline: winner === low ? `${w.clubs[low].short} win promotion via the play-off` : `${w.clubs[top].short} survive the relegation play-off`,
    body: `${w.clubs[low].name} ${r1.score[0]}-${r1.score[1]} ${w.clubs[top].name}, then ${w.clubs[top].name} ${r2.score[0]}-${r2.score[1]} ${w.clubs[low].name}${r2.pens ? ` (${r2.pens[0]}-${r2.pens[1]} pens)` : ''}. Aggregate ${aggTop}-${aggLow}. ${w.clubs[winner].name} will play in the ${lg?.name} next season.`,
    kind: winner === low ? 'title' : 'result', playerIds: [], clubIds: [top, low], importance: top === w.userClubId || low === w.userClubId ? 5 : 3, userRelated: top === w.userClubId || low === w.userClubId,
  })
  void rng
  return winner
}

function moveClub(w: World, clubId: number, from: number, to: number) {
  w.leagues[from].clubs = w.leagues[from].clubs.filter((c) => c !== clubId)
  w.leagues[to].clubs.push(clubId)
  w.clubs[clubId].leagueId = to
}

function regenIntake(w: World, rng: Rng) {
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId || club.national) continue
    const squad = rosterOf(w, club.id)
    const n = squad.length < 24 ? 3 : squad.length < 28 ? 2 : 1
    const nat = w.nations[club.country] ? club.country : rng.pick(['England', 'Spain', 'France', 'Germany', 'Brazil'])
    for (let i = 0; i < n; i++) {
      const fake = { id: -1, name: '', nationality: nat, experience: clamp(Math.round(club.youthRating / 2), 1, 5), judgement: 3, wage: 0, faceSeed: 0, mission: { country: nat, playerType: 'Any', started: w.date, months: 1, nextReport: w.date } }
      const pr = generateProspect(w, fake as any, rng)
      const nm = pickName(w.namePools, nat, rng)
      const p: Player = {
        id: pr.id, name: displayName(nm.first, nm.last, nat), fullName: `${nm.first} ${nm.last}`, shortName: displayName(nm.first, nm.last, nat), nation: nat,
        clubId: club.id, positions: pr.positions, dob: pr.dob, height: pr.height, weight: pr.weight, foot: pr.foot, ovr: pr.trueOvr, pot: pr.truePot,
        ovrAdj: 0, attrs: pr.attrs, weakFoot: rng.int(2, 4), skillMoves: rng.int(2, 3), intlRep: 1, workRate: ['Medium', 'Medium'], bodyType: 'Lean',
        playstyles: [], playstylesPlus: [], value: pr.value, wage: 800, contract: { until: w.season + 4, wage: 800, role: 'Prospect', releaseClause: 0, signedOn: w.date },
        jersey: 40 + i, realFace: false, faceSeed: pr.faceSeed, regen: true, fitness: 95, sharpness: 45, morale: 70, formRatings: [], suspensions: [],
        yellowAccum: {}, joinedDate: w.date, trainingPlan: 'Balanced', devPlan: 'balanced', devProgress: 0, growthHistory: [{ date: w.date, ovr: pr.trueOvr }],
        hidden: { consistency: 45, professionalism: rng.int(30, 90), injuryProne: rng.int(10, 60), devRate: 0.8 + rng.next() * 0.5, adaptability: 50, bigMatch: 45, ambition: rng.int(30, 95), loyalty: rng.int(30, 90), temperament: rng.int(20, 80) },
        season: {}, career: [],
      }
      w.players[p.id] = p
    }
  }
  touchRoster(w)
}
