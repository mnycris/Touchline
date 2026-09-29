// The football world in the news: title races, milestones, breakout youngsters and star injuries from the leagues
// the manager follows (their own plus the deep-simulated ones). Rate-limited so the feed carries stories, not noise.
import type { Fixture, MatchResult, World } from '../../domain/types'
import { hashString } from '../../domain/rng'
import { ageOn, weekday } from '../../domain/dates'
import { sortTable } from '../competitions/tables'
import { deepLeagueSet } from './matchRunner'
import { postNews } from './messages'

const pickFor = (seed: string) => <T,>(arr: T[]) => arr[hashString(seed) % arr.length]

function followedLeagues(w: World) {
  const set = deepLeagueSet(w)
  return Object.values(w.competitions).filter((c) => c.season === w.season && c.format === 'league' && c.leagueId != null && set.has(c.leagueId) && c.table?.length)
}

/** After each match in a followed league: goal milestones and serious injuries to stars. */
export function matchWorldNews(w: World, f: Fixture, r: MatchResult, injuries: { id: number; days: number; type: string }[]) {
  const comp = w.competitions[f.compId]
  if (!comp || comp.format !== 'league' || comp.leagueId == null || !deepLeagueSet(w).has(comp.leagueId)) return
  const own = comp.clubs.includes(w.userClubId)
  const lgPrestige = w.leagues[comp.leagueId]?.prestige || 3
  // league goals milestones: 10 (own league only), 20, 25, 30, 35...
  const scorers = new Set(r.events.filter((e) => (e.type === 'goal' || e.type === 'penGoal') && e.player).map((e) => e.player!))
  for (const id of scorers) {
    const p = w.players[id]
    const line = p?.season[comp.id] || p?.season[comp.key]
    if (!p || !line) continue
    const g = line.goals
    const scored = r.events.filter((e) => e.player === id && (e.type === 'goal' || e.type === 'penGoal')).length
    const marks = [10, 20, 25, 30, 35, 40].filter((m) => g >= m && g - scored < m && (m > 10 || own))
    if (!marks.length) continue
    const m = marks[marks.length - 1]
    const pick = pickFor(`${p.id}:${m}:${w.season}`)
    const lead = Object.values(w.players).filter((q) => (q.season[comp.id]?.goals || q.season[comp.key]?.goals || 0) > g).length === 0
    postNews(w, {
      headline: pick([`${p.name} reaches ${m} ${comp.short} goals`, `${m} and counting for ${p.name}`, `${p.name} hits ${m} for the season`]),
      body: `${p.name} took his ${comp.short} tally to ${g} for the season with ${scored > 1 ? `${scored} goals` : 'a goal'} against ${w.clubs[f.home === p.clubId ? f.away : f.home]?.short}${lead ? `, and leads the scoring charts` : ''}.`,
      kind: 'milestone', playerIds: [p.id], clubIds: [p.clubId], compId: comp.id, fixtureId: f.id, importance: m >= 30 ? 4 : lgPrestige >= 8 || own ? 3 : 2, userRelated: p.clubId === w.userClubId,
    })
  }
  // star injuries elsewhere (the user's own are reported by the medical team)
  for (const inj of injuries) {
    const p = w.players[inj.id]
    if (!p || p.clubId === w.userClubId || p.ovr < 83 || inj.days < 28) continue
    const pick = pickFor(`${p.id}:${w.date}:inj`)
    postNews(w, {
      headline: pick([`Blow for ${w.clubs[p.clubId]?.short} as ${p.name} is ruled out`, `${p.name} faces ${Math.round(inj.days / 7)} weeks out`, `${w.clubs[p.clubId]?.short} sweat on ${p.name} injury`]),
      body: `${w.clubs[p.clubId]?.name} will be without ${p.name} for around ${Math.round(inj.days / 7)} weeks after he suffered a ${inj.type.toLowerCase()}.`,
      kind: 'injury', playerIds: [p.id], clubIds: [p.clubId], compId: comp.id, importance: p.ovr >= 87 ? 4 : 3, userRelated: own,
    })
  }
}

/** Once a day: title races (Mondays) and breakout youngsters (1st of the month). */
export function dailyWorldNews(w: World) {
  const d = w.date
  if (weekday(d) === 1) for (const comp of followedLeagues(w)) titleRace(w, comp.id)
  if (d.slice(8, 10) === '01' && d.slice(5, 7) !== '07' && d.slice(5, 7) !== '08') breakouts(w)
}

function titleRace(w: World, compId: string) {
  const comp = w.competitions[compId]
  const t = sortTable(w, comp)
  if (t.length < 4) return
  const played = t[0].p
  const total = (t.length - 1) * 2
  if (played < 6) return
  const flags = (w.flags.leaders ||= {}) as Record<string, number>
  const leader = t[0], second = t[1]
  const gap = leader.pts - second.pts
  const prev = flags[compId]
  flags[compId] = leader.clubId
  const L = w.clubs[leader.clubId], S = w.clubs[second.clubId]
  const own = comp.clubs.includes(w.userClubId)
  const big = (w.leagues[comp.leagueId!]?.prestige || 3) >= 8
  const pick = pickFor(`${compId}:${w.date}`)
  const left = total - played
  if (prev && prev !== leader.clubId) {
    postNews(w, {
      headline: pick([`${L.short} go top of the ${comp.short}`, `New leaders: ${L.short} take over at the top`, `${L.short} overtake ${w.clubs[prev]?.short} at the summit`]),
      body: `${L.name} are the new ${comp.short} leaders${gap ? `, ${gap} point${gap === 1 ? '' : 's'} ahead of ${S.short}` : ` on goal difference from ${S.short}`} with ${left} games to play.`,
      kind: 'title', playerIds: [], clubIds: [L.id, S.id], compId, importance: own || big ? 3 : 2, userRelated: own && (L.id === w.userClubId || S.id === w.userClubId || prev === w.userClubId),
    })
  } else if (left <= 8 && left > 0 && gap >= 6 && gap > left * 1.2 && !flags[`${compId}:closing`]) {
    flags[`${compId}:closing`] = 1
    postNews(w, {
      headline: pick([`${L.short} closing in on the ${comp.short} title`, `${L.short} can almost touch the trophy`, `Title within reach for ${L.short}`]),
      body: `With ${left} games left, ${L.name} are ${gap} points clear of ${S.short}. A few more wins will settle it.`,
      kind: 'title', playerIds: [], clubIds: [L.id], compId, importance: own || big ? 3 : 2, userRelated: own && L.id === w.userClubId,
    })
  } else if (left <= 10 && left > 0 && gap <= 2 && t[2] && leader.pts - t[2].pts <= 4 && !flags[`${compId}:race:${Math.floor(left / 3)}`]) {
    flags[`${compId}:race:${Math.floor(left / 3)}`] = 1
    postNews(w, {
      headline: pick([`Three-way title race in the ${comp.short}`, `${comp.short} title race goes down to the wire`, `Nothing to separate the ${comp.short} leaders`]),
      body: `${L.short}, ${S.short} and ${w.clubs[t[2].clubId]?.short} are separated by ${leader.pts - t[2].pts} points with ${left} matches remaining.`,
      kind: 'title', playerIds: [], clubIds: [L.id, S.id, t[2].clubId], compId, importance: own || big ? 3 : 2, userRelated: own,
    })
  }
}

function breakouts(w: World) {
  // young players with a strong last month in a followed league
  const month = (() => { const x = new Date(`${w.date}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() - 1); return x.toISOString().slice(0, 7) })()
  const comps = followedLeagues(w)
  const best: { id: number; avg: number; apps: number; compId: string; g: number; a: number }[] = []
  for (const comp of comps) {
    const per = new Map<number, { s: number; n: number; g: number; a: number }>()
    for (const fid of comp.fixtures) {
      const f = w.fixtures[fid]
      if (!f?.played || !f.date.startsWith(month) || !f.result?.players?.length) continue
      for (const st of f.result.players) {
        if (st.mins < 45) continue
        const e = per.get(st.id) || { s: 0, n: 0, g: 0, a: 0 }
        e.s += st.rating; e.n++; e.g += st.goals; e.a += st.assists
        per.set(st.id, e)
      }
    }
    for (const [id, e] of per) {
      const p = w.players[id]
      if (!p || e.n < 3 || ageOn(p.dob, w.date) > 20) continue
      const avg = e.s / e.n
      if (avg >= 7.25) best.push({ id, avg, apps: e.n, compId: comp.id, g: e.g, a: e.a })
    }
  }
  best.sort((a, b) => b.avg - a.avg)
  for (const b of best.slice(0, 2)) {
    const p = w.players[b.id]
    const comp = w.competitions[b.compId]
    const pick = pickFor(`${p.id}:${month}:bo`)
    postNews(w, {
      headline: pick([`${p.name}: the teenager lighting up the ${comp.short}`, `${ageOn(p.dob, w.date)}-year-old ${p.name} catching the eye`, `Scouts flock to watch ${p.name}`]),
      body: `${p.name} averaged ${b.avg.toFixed(2)} over ${b.apps} ${comp.short} games last month for ${w.clubs[p.clubId]?.name}${b.g || b.a ? `, with ${b.g} goal${b.g === 1 ? '' : 's'} and ${b.a} assist${b.a === 1 ? '' : 's'}` : ''}. Rated ${p.ovr} today, he is tipped to go much higher.`,
      kind: 'youth', playerIds: [p.id], clubIds: [p.clubId], compId: comp.id, importance: 3, userRelated: p.clubId === w.userClubId,
    })
  }
}
