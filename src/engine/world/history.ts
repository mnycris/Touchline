// The football world's memory, used sparingly: a note only when history is about to be made or repeated, and only
// from what the save itself knows (every match since the career began, the seasons it has archived, the manager's own
// record), so nothing is claimed that isn't so. Records are "since" the first season the save holds, never all-time.
import type { Fixture, Player, World } from '../../domain/types'
import { MATCH_MARKS, WIN_MARKS, managedMatches, type Managed } from './career'
import { fmtDate, seasonLabel } from '../../domain/dates'
import { ordinalOf } from '../../domain/words'
import { callName } from '../match/commentary'
import { postNews } from './messages'

export interface HistoryNote { icon: string; text: string; weight: number; kind: string; playerId?: number; clubId?: number }

const GOALS_FOR_YOU = [25, 50, 75, 100, 150, 200, 250, 300]
const APPS_FOR_YOU = [50, 100, 150, 200, 250, 300, 400, 500]
const SEASON_GOALS = [20, 25, 30, 40, 50, 60]

type R = 'W' | 'D' | 'L'
function resultFor(f: Fixture, club: number): R {
  const [a, b] = f.result!.score
  const gf = f.home === club ? a : b, ga = f.home === club ? b : a
  if (gf !== ga) return gf > ga ? 'W' : 'L'
  const p = f.result!.pens
  return p ? ((f.home === club ? p[0] > p[1] : p[1] > p[0]) ? 'W' : 'L') : 'D'
}
const runAtEnd = (rs: R[], ok: (r: R) => boolean) => { let n = 0; for (let i = rs.length - 1; i >= 0 && ok(rs[i]); i--) n++; return n }
const bestRun = (rs: R[], ok: (r: R) => boolean) => { let best = 0, cur = 0; for (const r of rs) { cur = ok(r) ? cur + 1 : 0; best = Math.max(best, cur) } return best }

/** Played matches of a club, oldest first. */
function playedBy(w: World, club: number, before: string) {
  return Object.values(w.fixtures).filter((f) => f.played && f.result && f.date <= before && (f.home === club || f.away === club)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** Appearances and goals for the manager's sides, by player, from the matches he managed. */
export function underYou(ms: Managed[]) {
  const m = new Map<number, { apps: number; goals: number }>()
  for (const x of ms) for (const st of x.f.result!.players) {
    if (st.side !== x.side || st.mins <= 0) continue
    const r = m.get(st.id) || { apps: 0, goals: 0 }
    r.apps++; r.goals += st.goals
    m.set(st.id, r)
  }
  return m
}

const seasonGoals = (p: Player) => Object.values(p.season).reduce((a, s) => a + s.goals, 0)
/** The players who will most likely feature: the fit core of the squad. */
const likely = (w: World, club: number) => Object.values(w.players).filter((p) => p.clubId === club && !p.injury && !p.academy).sort((a, b) => b.ovr - a.ovr).slice(0, 16)

/** What history says about a coming match: at most a handful of notes, the most notable first. */
export function historyNotes(w: World, f: Fixture): HistoryNote[] {
  const out: HistoryNote[] = []
  const comp = w.competitions[f.compId]
  const user = f.home === w.userClubId || f.away === w.userClubId
  const H = w.clubs[f.home], A = w.clubs[f.away]
  if (!H || !A) return out
  const first = w.archive.length ? Math.min(...w.archive.map((a) => a.season)) : undefined
  const since = first != null ? seasonLabel(first) : ''

  // ---- the manager
  if (user) {
    const ms = managedMatches(w)
    const them = f.home === w.userClubId ? f.away : f.home
    const n = ms.length + 1
    const wins = ms.filter((m) => m.res === 'W').length
    if (MATCH_MARKS.includes(n)) out.push({ kind: 'manager', icon: 'calendar', weight: 7, text: `Your ${ordinalOf(n)} match as a manager` })
    else if (WIN_MARKS.includes(wins + 1)) out.push({ kind: 'manager', icon: 'star', weight: 7, text: `A win would be your ${ordinalOf(wins + 1)} as a manager` })
    const stint = w.user.history[w.user.history.length - 1]
    const here = ms.filter((m) => m.club === w.userClubId && m.f.date >= (stint?.from || ''))
    if (here.length !== ms.length && MATCH_MARKS.includes(here.length + 1)) out.push({ kind: 'manager', icon: 'calendar', weight: 5, text: `Your ${ordinalOf(here.length + 1)} match in charge of ${w.clubs[w.userClubId].short}` })
    // a club he used to manage
    const left = [...w.user.history].reverse().find((h) => h.clubId === them && h.to)
    if (left) {
      const after = ms.filter((m) => m.opp === them && m.f.date > left.to!)
      if (!after.length) out.push({ kind: 'former', icon: 'swap', weight: 8, clubId: them, text: `Your first meeting with ${w.clubs[them].short} since leaving in ${fmtDate(left.to!, 'month')}` })
    }
    // his record against this opponent
    const vs = ms.filter((m) => m.opp === them)
    if (vs.length >= 4) {
      const r = { W: 0, D: 0, L: 0 }
      for (const m of vs) r[m.res]++
      const rec = `P${vs.length} W${r.W} D${r.D} L${r.L}`
      if (!r.L) out.push({ kind: 'h2h', icon: 'shield', weight: 5, text: `You have never lost to ${w.clubs[them].short} (${rec})` })
      else if (!r.W) out.push({ kind: 'h2h', icon: 'warning', weight: 5, text: `You are still looking for a first win against ${w.clubs[them].short} (${rec})` })
    }
    // runs: a win to equal or better his best as a manager
    const rs = ms.map((m) => m.res)
    const cur = runAtEnd(rs, (r) => r === 'W'), best = bestRun(rs, (r) => r === 'W')
    if (cur >= 5 && cur === best) out.push({ kind: 'run', icon: 'form', weight: 6, text: `${cur} wins in a row, your best run as a manager: a win makes it ${cur + 1}` })
    else if (cur >= 4 && cur + 1 === best) out.push({ kind: 'run', icon: 'form', weight: 6, text: `A win would equal your best run as a manager, ${best} straight wins` })
    // the players: round numbers under him
    const mine = underYou(ms)
    for (const p of likely(w, w.userClubId)) {
      const r = mine.get(p.id)
      if (!r) continue
      const g = GOALS_FOR_YOU.find((x) => x === r.goals + 1)
      if (g) out.push({ kind: 'player', icon: 'ball', weight: g >= 100 ? 7 : 5, playerId: p.id, text: `${callName(p.name)} is one goal from ${g} for you` })
      const a = APPS_FOR_YOU.find((x) => x === r.apps + 1)
      if (a && a >= 100) out.push({ kind: 'player', icon: 'squad', weight: a >= 200 ? 5 : 3, playerId: p.id, text: `${callName(p.name)} would make his ${ordinalOf(a)} appearance under you` })
    }
  }

  // ---- players on both sides: season landmarks, and the league's best season tally since the save began
  const leagueGame = comp?.format === 'league'
  const bestTally = (() => {
    if (!leagueGame || first == null) return undefined
    let b: { goals: number; id: number; season: number } | undefined
    for (const a of w.archive) { const t = a.topScorers[comp!.key]?.[0]; if (t && (!b || t[1] > b.goals)) b = { goals: t[1], id: t[0], season: a.season } }
    return b
  })()
  for (const club of [f.home, f.away]) {
    for (const p of likely(w, club).slice(0, 12)) {
      const g = seasonGoals(p)
      const mark = SEASON_GOALS.find((x) => x === g + 1)
      if (mark) out.push({ kind: 'player', icon: 'ball', weight: mark >= 40 ? 6 : 4, playerId: p.id, text: `${callName(p.name)} is one goal from ${mark} this season` })
      if (bestTally && leagueGame) {
        const lg = p.season[comp!.id]?.goals || 0
        if (lg >= 15 && lg >= bestTally.goals - 1 && lg <= bestTally.goals) {
          const who = w.players[bestTally.id]
          const rec = `${bestTally.goals}${who ? `, ${callName(who.name)} in ${seasonLabel(bestTally.season)}` : ''}`
          out.push({ kind: 'record', icon: 'star', weight: 8, playerId: p.id, text: lg === bestTally.goals ? `${callName(p.name)} has ${lg} ${comp!.short} goals: one more is the best season since ${since} (${rec})` : `${callName(p.name)} is one short of the best ${comp!.short} season since ${since} (${rec})` })
        }
      }
    }
  }

  // ---- the clubs: runs measured against their own since the save began (the manager's side is measured against him)
  if (first != null) for (const club of [f.home, f.away]) {
    if (user && club === w.userClubId) continue
    const rs = playedBy(w, club, w.date).map((x) => resultFor(x, club))
    const cur = runAtEnd(rs, (r) => r === 'W'), best = bestRun(rs, (r) => r === 'W')
    const c = w.clubs[club]
    if (cur >= 6 && cur === best) out.push({ kind: 'run', icon: 'form', weight: 5, clubId: club, text: `${cur} straight wins: ${c.short}'s best run since ${since}` })
    else if (cur >= 5 && cur + 1 === best) out.push({ kind: 'run', icon: 'form', weight: 5, clubId: club, text: `A win would equal ${c.short}'s best run since ${since} (${best})` })
  }

  // ---- the fixture itself: a pattern in recent meetings
  const meetings = Object.values(w.fixtures).filter((x) => x.played && x.result && ((x.home === f.home && x.away === f.away) || (x.home === f.away && x.away === f.home))).sort((a, b) => a.date.localeCompare(b.date))
  // (the manager's own record against them says it already)
  if (meetings.length >= 3 && !out.some((n) => n.kind === 'h2h')) {
    const rs = meetings.map((m) => resultFor(m, f.home))
    const hw = runAtEnd(rs, (r) => r === 'W'), aw = runAtEnd(rs, (r) => r === 'L'), dr = runAtEnd(rs, (r) => r === 'D')
    const hu = runAtEnd(rs, (r) => r !== 'L'), au = runAtEnd(rs, (r) => r !== 'W')
    if (hw >= 3) out.push({ kind: 'h2h', icon: 'history', weight: 5, text: `${H.short} have won the last ${hw} meetings` })
    else if (aw >= 3) out.push({ kind: 'h2h', icon: 'history', weight: 5, text: `${A.short} have won the last ${aw} meetings` })
    else if (dr >= 3) out.push({ kind: 'h2h', icon: 'history', weight: 4, text: `The last ${dr} meetings have all been drawn` })
    else if (hu >= 4) out.push({ kind: 'h2h', icon: 'history', weight: 3, text: `${A.short} have not beaten ${H.short} in ${hu} meetings` })
    else if (au >= 4) out.push({ kind: 'h2h', icon: 'history', weight: 3, text: `${H.short} have not beaten ${A.short} in ${au} meetings` })
  }

  // ---- silverware: holders, and how long since a finalist last won it
  const round = (f.roundName || '').toLowerCase()
  const final = /final/.test(round) && !/semi|quarter/.test(round), semi = /semi/.test(round)
  if (comp && comp.format !== 'league' && (final || semi || /quarter/.test(round))) {
    const holder = comp.holderId || w.archive.find((a) => a.season === comp.season - 1)?.winners[comp.key]
    if (holder === f.home || holder === f.away) out.push({ kind: 'trophy', icon: 'trophy', weight: 4, clubId: holder, text: `${w.clubs[holder].short} are the holders` })
    if (final) for (const club of [f.home, f.away]) {
      if (club === holder) continue
      const last = (w.clubs[club].trophies || []).filter((t) => t.compKey === comp.key && t.season < comp.season).sort((a, b) => b.season - a.season)[0]
      if (last && comp.season - last.season >= 2) out.push({ kind: 'trophy', icon: 'trophy', weight: 5, clubId: club, text: `${w.clubs[club].short} last won the ${comp.short} in ${seasonLabel(last.season)}` })
    }
  }

  // ---- the run-in: a points total not reached since the save began
  if (leagueGame && first != null && comp!.table?.length) {
    const left = comp!.fixtures.filter((id) => !w.fixtures[id]?.played && (w.fixtures[id]?.home === f.home || w.fixtures[id]?.away === f.home)).length
    let best = 0
    for (const a of w.archive) best = Math.max(best, a.tables[comp!.key]?.[0]?.pts || 0)
    for (const club of [f.home, f.away]) {
      const row = comp!.table.find((r) => r.clubId === club)
      if (!row || !best || left > 6) continue
      if (row.pts < best && row.pts + 3 >= best) out.push({ kind: 'record', icon: 'star', weight: 6, clubId: club, text: `A win would take ${w.clubs[club].short} to ${row.pts + 3} points: ${row.pts + 3 > best ? 'the most' : 'level with the most'} in a ${comp!.short} season since ${since} (${best})` })
    }
  }

  // the most notable few, one note per player
  const seen = new Set<number>()
  return out.sort((a, b) => b.weight - a.weight).filter((n) => { if (n.playerId == null) return true; if (seen.has(n.playerId)) return false; seen.add(n.playerId); return true }).slice(0, 4)
}

/**
 * After the manager's match: the landmarks just reached, in the news. His 100th win, a striker's 50th goal for him,
 * a 200th appearance under him. Checked against the totals before the match, so each is reported once.
 */
export function historyAfterMatch(w: World, f: Fixture) {
  if (!f.result || (f.home !== w.userClubId && f.away !== w.userClubId)) return
  const ms = managedMatches(w)
  const last = ms[ms.length - 1]
  if (!last || last.f.id !== f.id) return
  const name = `${w.user.firstName} ${w.user.lastName}`
  const club = w.clubs[last.club]
  const wins = ms.filter((m) => m.res === 'W').length
  if (MATCH_MARKS.includes(ms.length)) postNews(w, { headline: `${name} reaches ${ms.length} matches as a manager`, body: `${w.clubs[f.home]?.short} v ${w.clubs[f.away]?.short} was ${name}'s ${ordinalOf(ms.length)} match as a manager, with ${wins} wins so far.`, kind: 'milestone', playerIds: [], clubIds: [club.id], fixtureId: f.id, importance: 3, userRelated: true })
  if (last.res === 'W' && WIN_MARKS.includes(wins)) postNews(w, { headline: `${wins} wins for ${name}`, body: `${club.short}'s ${last.gf}–${last.ga} win over ${w.clubs[last.opp]?.short} was ${name}'s ${ordinalOf(wins)} as a manager, in ${ms.length} matches.`, kind: 'milestone', playerIds: [], clubIds: [club.id], fixtureId: f.id, importance: 3, userRelated: true })
  const mine = underYou(ms)
  for (const st of f.result.players) {
    if (st.side !== last.side || st.mins <= 0) continue
    const p = w.players[st.id], r = mine.get(st.id)
    if (!p || !r) continue
    const g = GOALS_FOR_YOU.find((x) => r.goals >= x && r.goals - st.goals < x)
    if (g && g >= 50) postNews(w, { headline: `${p.name} reaches ${g} goals under ${w.user.lastName}`, body: `${p.name}'s goal${st.goals > 1 ? 's' : ''} against ${w.clubs[last.opp]?.short} took him to ${r.goals} for ${name}, in ${r.apps} appearances.`, kind: 'milestone', playerIds: [p.id], clubIds: [club.id], fixtureId: f.id, importance: g >= 100 ? 4 : 3, userRelated: true })
    if (APPS_FOR_YOU.includes(r.apps) && r.apps >= 100) postNews(w, { headline: `${r.apps} appearances under ${w.user.lastName} for ${p.name}`, body: `${p.name} made his ${ordinalOf(r.apps)} appearance for ${name} against ${w.clubs[last.opp]?.short}.`, kind: 'milestone', playerIds: [p.id], clubIds: [club.id], fixtureId: f.id, importance: 2, userRelated: true })
  }
}
