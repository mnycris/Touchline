import type { Competition, Fixture, MatchPlayerStats, MatchResult, Player, StatLine, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { addDays } from '../../domain/dates'
import { INJURIES } from '../../domain/constants'
import { MatchSim, type MatchContext, type SideInput } from '../match/engine'
import { quickSim } from '../match/quick'
import { aiMatchSheet, validateSheet } from '../match/selection'
import { aggregateBefore } from '../competitions/cups'
import { applyResultToTable } from '../competitions/tables'
import { rosterOf } from './roster'
import { nationalSquad } from './international'

export function emptyLine(): StatLine {
  return { apps: 0, starts: 0, subs: 0, mins: 0, goals: 0, assists: 0, cleanSheets: 0, yellows: 0, reds: 0, ratingSum: 0, rated: 0, motm: 0, shots: 0, sot: 0, xg: 0, saves: 0, conceded: 0, tackles: 0, keyPasses: 0, passes: 0, passesCompleted: 0 }
}

export function venueFor(w: World, f: Fixture): string {
  if (f.venue) return f.venue
  const c = w.clubs[f.home]
  return c?.stadium || `${c?.city || c?.name} home ground`
}

export function attendanceFor(w: World, f: Fixture): number {
  const c = w.clubs[f.home]
  const comp = w.competitions[f.compId]
  const cap = f.neutral ? (f.venue?.includes('Wembley') ? 90000 : f.venue?.includes('Cartuja') ? 70000 : f.venue?.includes('Olympiastadion') ? 74475 : f.venue?.includes('Stade de France') ? 80000 : f.venue?.includes('Olimpico') ? 70634 : f.venue?.includes('Metropolitano') ? 70692 : 45000) : c?.capacity || 10000
  const h = hashString(f.id) % 1000 / 1000
  const fill = clamp(0.72 + (c?.prestige.domestic || 5) * 0.02 + (f.derby ? 0.08 : 0) + (comp?.format === 'uefa' ? 0.06 : 0) + (comp?.format === 'cup' && !f.neutral ? -0.12 : 0) + h * 0.08, 0.35, 1)
  return Math.round(cap * fill)
}

/** How much sharper AI sides play against the user, per career difficulty. */
export const DIFFICULTY_BOOST: Record<string, number> = { Beginner: 0.93, Amateur: 0.96, 'Semi-Pro': 0.985, Professional: 1, 'World Class': 1.015, Legendary: 1.03, Ultimate: 1.045 }

export function matchContext(w: World, f: Fixture, commentary: boolean): MatchContext {
  const comp = w.competitions[f.compId]
  const knockout = !!f.tieId
  const agg = aggregateBefore(w, f)
  const final = f.roundName === 'Final'
  return {
    id: f.id,
    compName: comp?.short || '',
    neutral: !!f.neutral,
    venue: venueFor(w, f),
    attendance: attendanceFor(w, f),
    derby: f.derby,
    final,
    knockout: knockout && (f.leg === 2 || !f.leg),
    aggregate: agg,
    extraTime: !!comp?.rules.extraTime || comp?.format === 'uefa' || (comp?.format === 'cup' && final),
    penaltiesOnly: comp?.format === 'supercup',
    importance: (f.importance || 1) + (final ? 2 : 0) + (f.derby ? 1 : 0),
    strictness: 0.85 + (hashString(f.id + 'ref') % 100) / 250,
    injuryRate: w.settings.injuries === 'Low' ? 0.55 : w.settings.injuries === 'High' ? 1.5 : 1,
    commentary,
    userSide: f.home === w.userClubId ? 0 : f.away === w.userClubId ? 1 : -1,
    aiBoost: DIFFICULTY_BOOST[w.settings.difficulty] ?? 1,
    year: Number(f.date.slice(0, 4)) || undefined,
  }
}

export function sideInput(w: World, clubId: number, comp: Competition | undefined, user: boolean, scripted?: { formation: string; lineup: number[]; bench: number[] }): SideInput {
  const club = w.clubs[clubId]
  let sheet = user ? (club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]) : aiMatchSheet(w, club, comp)
  if (user) sheet = validateSheet(w, club, sheet, comp).sheet
  // Edit Mode line-up for an AI side: the chosen XI in the chosen shape, roles and duties from the AI's own sheet logic
  // (a national side picks from its called-up squad)
  const national = club.national ? new Set(nationalSquad(w, clubId).map((p) => p.id)) : undefined
  const inSide = (id: number) => national ? national.has(id) : w.players[id]?.clubId === clubId
  if (!user && scripted && scripted.lineup.length === 11 && scripted.lineup.every(inSide)) {
    sheet = { ...sheet, formation: scripted.formation || sheet.formation, lineup: [...scripted.lineup], bench: scripted.bench.filter((id) => inSide(id) && !scripted.lineup.includes(id)).slice(0, 12) }
    if (!sheet.lineup.includes(sheet.captain)) sheet.captain = sheet.lineup[0]
    for (const k of ['penalties', 'freeKicks', 'cornersL', 'cornersR'] as const) if (!sheet.lineup.includes(sheet[k])) sheet[k] = [...sheet.lineup].sort((a, b) => (w.players[b]?.ovr || 0) - (w.players[a]?.ovr || 0))[0]
  }
  const players: Record<number, Player> = {}
  for (const id of [...sheet.lineup, ...sheet.bench]) if (w.players[id]) players[id] = w.players[id]
  const mgr = w.managers[club.managerId]
  return { clubId, name: club.name, short: club.short, sheet, players, controlledByUser: user, managerVision: mgr?.vision }
}

/** `detail` keeps commentary, action log and heat maps (live, watched and user-relevant matches). */
export function createSim(w: World, f: Fixture, userLive: boolean, detail = userLive || f.userInvolved === true || !!w.scripts?.[f.id]): MatchSim {
  const comp = w.competitions[f.compId]
  const ctx = matchContext(w, f, detail)
  ctx.assistantSubs = !!w.flags.assistantSubs
  const script = w.scripts?.[f.id]
  if (script) ctx.script = script
  const home = sideInput(w, f.home, comp, userLive && f.home === w.userClubId, script?.lineups?.['0'])
  const away = sideInput(w, f.away, comp, userLive && f.away === w.userClubId, script?.lineups?.['1'])
  return new MatchSim(home, away, ctx, hashString(`${w.meta.seed}:${f.id}`))
}

/** The big five: followed closely unless the player chooses otherwise. */
export const DEFAULT_DEEP_LEAGUES = [13, 53, 19, 31, 16]

/** Default followed leagues for a manager in `own`: the big five, topped up with the next strongest when one is theirs. */
export function defaultDeepLeagues(own?: number): number[] {
  return [...DEFAULT_DEEP_LEAGUES, 308, 10].filter((id) => id !== own).slice(0, 5)
}

/** Leagues whose matches run through the full match engine: the user's league plus up to five chosen ones. */
export function deepLeagueSet(w: World): Set<number> {
  const own = w.clubs[w.userClubId]?.leagueId
  const extra = (w.settings.deepLeagues ?? defaultDeepLeagues(own)).filter((id) => id !== own).slice(0, 5)
  return new Set([own, ...extra].filter((x) => x != null) as number[])
}

/** Whether a fixture gets the full match engine (the user's games always do). */
export function isDeepFixture(w: World, f: Fixture, set = deepLeagueSet(w)): boolean {
  if (f.userInvolved || w.scripts?.[f.id]) return true
  const comp = w.competitions[f.compId]
  if (comp?.format === 'league' && comp.leagueId != null) return set.has(comp.leagueId)
  const h = w.clubs[f.home], a = w.clubs[f.away]
  // internationals: the big tournaments, the strong nations, and any game the manager's own players are in
  if (comp?.format === 'intl') {
    if (comp.tier <= 1 || Math.max(h?.squadAvg || 0, a?.squadAvg || 0) >= 78) return true
    return [f.home, f.away].some((id) => (w.intl?.squads[id] || []).some((pid) => w.players[pid]?.clubId === w.userClubId))
  }
  return (!!h && set.has(h.leagueId)) || (!!a && set.has(a.leagueId))
}

/** Simulate a non-interactive fixture completely (full engine or the fast model, by league). */
export function simulateFixture(w: World, f: Fixture, deep = isDeepFixture(w, f)): MatchResult {
  if (!deep) {
    const comp = w.competitions[f.compId]
    const ctx = matchContext(w, f, false)
    const home = sideInput(w, f.home, comp, false)
    const away = sideInput(w, f.away, comp, false)
    return quickSim(home, away, ctx, hashString(`${w.meta.seed}:${f.id}`))
  }
  const sim = createSim(w, f, false)
  return sim.runToEnd()
}

const YELLOW_LIMITS: Record<string, number[]> = { league: [5, 10, 15], cup: [2, 4], uefa: [3, 5, 7], supercup: [99], playoff: [99], intl: [2, 4] }
const banScope = (comp?: Competition) => comp?.format === 'uefa' ? 'continental' : comp?.format === 'league' ? 'league' : comp?.format === 'intl' ? 'intl' : 'cup'

/** Apply a finished result to the authoritative world state. */
/** `full` keeps the complete result (commentary, extended stats, heat maps) — for matches the manager watched. */
export function applyMatchResult(w: World, f: Fixture, result: MatchResult, rng: Rng, full = false): { injuries: { id: number; days: number; type: string }[]; bans: { id: number; games: number }[] } {
  const comp = w.competitions[f.compId]
  const edited = !!w.scripts?.[f.id]
  const keepFull = f.userInvolved || full || edited
  const inUserComp = comp?.clubs.includes(w.userClubId) || comp?.format === 'uefa'
  f.played = true
  // a scripted match is marked as edited in its report; the script has done its job
  if (edited) { f.edited = true; delete w.scripts![f.id] }
  // followed competitions and deep-simulated leagues keep line-ups, ratings and key events for their match reports
  f.result = keepFull ? result : compact(result, !!inUserComp || (result.detail === 'full' && isDeepFixture(w, f)))
  if (comp?.format === 'league' || ((comp?.format === 'uefa' || comp?.format === 'intl') && !f.roundId && comp.table)) applyResultToTable(comp, f)
  const injuries: { id: number; days: number; type: string }[] = []
  const bans: { id: number; games: number }[] = []
  const compKey = comp?.id || f.compId
  const intl = comp?.format === 'intl'
  const [hs, as] = result.score
  // serve existing bans for this competition before new ones are issued
  for (const clubId of [f.home, f.away]) serveBans(w, clubId, comp)
  // --- players
  for (const st of result.players) {
    const p = w.players[st.id]
    if (!p) continue
    // a player's matches for his country are kept apart from his club season
    const line = ((intl ? (p.intlSeason ||= {}) : p.season)[compKey] ||= emptyLine())
    const played = st.mins > 0
    if (played) {
      line.apps++
      if (st.started) line.starts++; else line.subs++
      line.mins += st.mins
      line.goals += st.goals
      line.assists += st.assists
      line.shots += st.shots
      line.sot += st.sot
      line.xg += st.xg
      line.saves += st.saves
      line.tackles += st.tackles
      line.keyPasses += st.keyPasses
      line.passes += st.passes
      line.passesCompleted += st.passesCompleted
      line.ratingSum += st.rating
      line.rated++
      const conceded = st.side === 0 ? as : hs
      if (p.positions[0] === 'GK' || ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(st.pos)) line.conceded += conceded
      if (conceded === 0 && st.mins >= 60 && (p.positions[0] === 'GK' || ['CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM'].includes(p.positions[0]))) line.cleanSheets++
      if (result.motm === p.id) line.motm++
      p.formRatings.push(st.rating)
      if (p.formRatings.length > 5) p.formRatings.shift()
      p.fitness = clamp(Math.round(st.energy ?? p.fitness - st.mins * 0.25), 5, 100)
      // match minutes are what really build sharpness, fastest when a player is short of it
      p.sharpness = clamp(Math.round(p.sharpness + (st.mins / 90) * 20 * Math.max(0.15, 1.25 - p.sharpness / 100)), 0, 100)
      p.lastMatchDate = f.date
      const won = st.side === 0 ? hs > as : as > hs
      const lost = st.side === 0 ? hs < as : as < hs
      p.morale = clamp(p.morale + (won ? 1.6 : lost ? -1.8 : 0.2) + (st.rating >= 7.5 ? 1 : st.rating < 5.8 ? -1 : 0), 0, 100)
    }
    // cards
    if (st.yellow && !st.red) {
      line.yellows++
      const fmt = comp?.format || 'league'
      const key = comp?.key || f.compId
      p.yellowAccum[key] = (p.yellowAccum[key] || 0) + 1
      const limits = comp?.intl?.kind === 'friendly' ? [] : YELLOW_LIMITS[fmt] || [5]
      if (limits.includes(p.yellowAccum[key])) {
        const games = fmt === 'league' && p.yellowAccum[key] >= 10 ? 2 : 1
        p.suspensions.push({ matches: games, scope: banScope(comp), compId: key, reason: `${p.yellowAccum[key]} yellow cards` })
        bans.push({ id: p.id, games })
      }
    }
    if (st.red) {
      line.reds++
      const second = result.events.some((e) => e.type === 'secondYellow' && e.player === p.id)
      const games = second ? 1 : rng.chance(0.25) ? 1 : 3
      p.suspensions.push({ matches: games, scope: banScope(comp), compId: comp?.key, reason: second ? 'Sent off (two yellows)' : 'Straight red card' })
      bans.push({ id: p.id, games })
    }
    if (st.injured && !p.injury) {
      const inj = rollInjury(w, p, rng, f.date)
      p.injury = { ...inj, inMatch: f.id }
      injuries.push({ id: p.id, days: inj.totalDays, type: inj.type })
    }
  }
  // --- rolling form / minutes (used by morale & AI)
  const minsBy = new Map(result.players.map((x) => [x.id, x.mins]))
  const startedBy = new Set(result.players.filter((x) => x.started).map((x) => x.id))
  for (const [clubId, gf, ga] of [[f.home, hs, as], [f.away, as, hs]] as const) {
    const club = w.clubs[clubId]
    if (!club) continue
    const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
    club.recent = [...(club.recent || []), r].slice(-6) as ('W' | 'D' | 'L')[]
    // the user's squad keeps a longer memory: conversations know the difference between one game and two months
    const keep = clubId === w.userClubId ? 12 : 6
    for (const p of rosterOf(w, clubId)) {
      p.recentMins = [...(p.recentMins || []), minsBy.get(p.id) || 0].slice(-keep)
      if (clubId === w.userClubId && startedBy.has(p.id)) p.lastStart = f.date
    }
  }
  // --- managers & user history
  for (const [clubId, gf, ga] of [[f.home, hs, as], [f.away, as, hs]] as const) {
    const club = w.clubs[clubId]
    const res = gf > ga ? 'w' : gf < ga ? 'l' : 'd'
    const pensWin = result.pens ? (clubId === f.home ? result.pens[0] > result.pens[1] : result.pens[1] > result.pens[0]) : undefined
    if (clubId === w.userClubId) {
      const h = w.user.history[w.user.history.length - 1]
      if (h) { h.p++; h[res]++; h.gf += gf; h.ga += ga }
    } else {
      const m = w.managers[club?.managerId]
      if (m) { m.record.p++; m.record[res]++ }
    }
    void pensWin
  }
  // --- gate receipts
  const home = w.clubs[f.home]
  if (home && !f.neutral && !home.national) {
    const lg = w.leagues[home.leagueId]
    const ticket = 12 + (lg?.wealth || 3) * 6.5 + home.prestige.domestic * 1.5
    const gate = Math.round(result.attendance * ticket * (comp?.format === 'uefa' ? 1.6 : 1))
    home.finance.balance += gate
    home.finance.revenueSeason += gate
    if (f.home === w.userClubId) home.finance.ledger.push({ date: f.date, label: `Gate receipts v ${w.clubs[f.away].short}`, amount: gate, kind: 'gate' })
  }
  return { injuries, bans }
}

/** The per-player numbers other clubs' results keep in the save (the full action detail stays with the user's matches). */
function coreStats(p: MatchPlayerStats): MatchPlayerStats {
  return {
    id: p.id, side: p.side, pos: p.pos, mins: p.mins, rating: p.rating, goals: p.goals, assists: p.assists, shots: p.shots, sot: p.sot, xg: p.xg,
    passes: p.passes, passesCompleted: p.passesCompleted, keyPasses: p.keyPasses, tackles: p.tackles, interceptions: p.interceptions, saves: p.saves,
    fouls: p.fouls, yellow: p.yellow, red: p.red, subOn: p.subOn, subOff: p.subOff, injured: p.injured, started: p.started, energy: p.energy,
  }
}

function compact(r: MatchResult, keepEvents: boolean): MatchResult {
  return {
    ...r,
    events: keepEvents ? r.events.filter((e) => ['goal', 'penGoal', 'owngoal', 'red', 'secondYellow', 'yellow', 'pens'].includes(e.type)).map((e) => ({ ...e, text: '' })) : r.events.filter((e) => ['goal', 'penGoal', 'owngoal', 'red', 'secondYellow'].includes(e.type)).map((e) => ({ ...e, text: '' })),
    players: keepEvents ? r.players.map(coreStats) : [],
    detail: keepEvents ? 'stats' : 'quick',
    lineups: keepEvents ? r.lineups : undefined,
    mom: undefined,
  }
}

export function rollInjury(w: World, p: Player, rng: Rng, date: string) {
  const inj = rng.weighted(INJURIES, (i) => i.weight)
  const prone = 0.8 + p.hidden.injuryProne / 150
  const days = Math.max(1, Math.round(rng.range(inj.min, inj.max) * prone * (w.settings.injuries === 'Low' ? 0.7 : w.settings.injuries === 'High' ? 1.25 : 1)))
  return { type: inj.type, severity: inj.sev, since: date, until: addDays(date, days), totalDays: days }
}

function serveBans(w: World, clubId: number, comp: Competition | undefined) {
  if (!comp) return
  const scope = banScope(comp)
  const club = w.clubs[clubId]
  // a national side's bans are served by its nation's players, called up or not
  const players = club?.national ? Object.values(w.players).filter((p) => p.nation === club.nation && p.suspensions.length) : rosterOf(w, clubId)
  for (const p of players) {
    if (!p.suspensions.length) continue
    for (const s of p.suspensions) {
      if (s.scope === 'all' || (s.scope === scope && (!s.compId || s.compId === comp.key || s.compId === comp.id))) {
        s.matches--
      }
    }
    p.suspensions = p.suspensions.filter((s) => s.matches > 0)
  }
}
