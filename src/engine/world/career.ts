// The manager's career as a story: every match managed (from the fixtures the save keeps for the user), season by
// season, records, favourite systems, the players who carried the teams, and milestones along the way.
import type { Fixture, World } from '../../domain/types'
import { sortTable } from '../competitions/tables'
import { formationOf } from '../../domain/constants'

export type Res = 'W' | 'D' | 'L'
export interface Managed { f: Fixture; club: number; opp: number; side: 0 | 1; gf: number; ga: number; res: Res; season: number }

export const seasonOfDate = (d: string) => (Number(d.slice(5, 7)) >= 7 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1)

/** Every match the user has managed, oldest first: fixtures of the club during each spell in charge. */
export function managedMatches(w: World): Managed[] {
  const out: Managed[] = []
  const stints = w.user.history
  for (const f of Object.values(w.fixtures)) {
    if (!f.played || !f.result) continue
    const st = stints.find((h) => (f.home === h.clubId || f.away === h.clubId) && f.date >= h.from && (!h.to || f.date <= h.to))
    if (!st) continue
    const side: 0 | 1 = f.home === st.clubId ? 0 : 1
    const [a, b] = f.result.score
    const gf = side === 0 ? a : b, ga = side === 0 ? b : a
    let res: Res = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
    if (res === 'D' && f.result.pens) res = (side === 0 ? f.result.pens[0] > f.result.pens[1] : f.result.pens[1] > f.result.pens[0]) ? 'W' : 'L'
    out.push({ f, club: st.clubId, opp: side === 0 ? f.away : f.home, side, gf, ga, res, season: seasonOfDate(f.date) })
  }
  return out.sort((x, y) => (x.f.date + x.f.time).localeCompare(y.f.date + y.f.time))
}

export interface Run { n: number; from?: Managed; to?: Managed }
function longest(ms: Managed[], ok: (m: Managed) => boolean): Run {
  let best: Run = { n: 0 }, cur: Run = { n: 0 }
  for (const m of ms) {
    if (ok(m)) { cur = { n: cur.n + 1, from: cur.from || m, to: m }; if (cur.n > best.n) best = cur }
    else cur = { n: 0 }
  }
  return best
}

export interface SeasonLine { season: number; club: number; p: number; w: number; d: number; l: number; gf: number; ga: number; finish?: number; league?: string; trophies: string[]; live: boolean }
export interface PlayerLine { id: number; apps: number; goals: number; assists: number; rating: number; rated: number }
export interface Milestone { date: string; text: string; icon: string; fixtureId?: string }

export interface CareerSummary {
  matches: Managed[]
  p: number; w: number; d: number; l: number; gf: number; ga: number
  winPct: number
  seasons: SeasonLine[]
  biggestWin?: Managed
  worstDefeat?: Managed
  mostGoals?: Managed
  winRun: Run
  unbeatenRun: Run
  formations: { id: string; name: string; p: number; w: number; d: number; l: number }[]
  scorers: PlayerLine[]
  apps: PlayerLine[]
  rated: PlayerLine[]
  milestones: Milestone[]
}

export function careerSummary(w: World): CareerSummary {
  const ms = managedMatches(w)
  const tot = { p: ms.length, w: 0, d: 0, l: 0, gf: 0, ga: 0 }
  for (const m of ms) { tot[m.res === 'W' ? 'w' : m.res === 'D' ? 'd' : 'l']++; tot.gf += m.gf; tot.ga += m.ga }

  // season by season (a season can hold two clubs after a mid-season move)
  const key = (m: Managed) => `${m.season}:${m.club}`
  const seasons = new Map<string, SeasonLine>()
  for (const m of ms) {
    const k = key(m)
    const s = seasons.get(k) || { season: m.season, club: m.club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [], live: m.season === w.season }
    s.p++; s[m.res === 'W' ? 'w' : m.res === 'D' ? 'd' : 'l']++; s.gf += m.gf; s.ga += m.ga
    seasons.set(k, s)
  }
  for (const s of seasons.values()) {
    const arch = w.archive.find((a) => a.season === s.season && a.userClubId === s.club)
    if (arch?.userFinish) s.finish = arch.userFinish
    const lg = Object.values(w.competitions).find((c) => c.season === s.season && c.format === 'league' && c.clubs.includes(s.club))
    if (lg) { s.league = lg.short; if (!s.finish && lg.table?.some((r) => r.p)) s.finish = sortTable(w, lg).findIndex((r) => r.clubId === s.club) + 1 || undefined }
    s.trophies = w.user.trophies.filter((t) => t.season === s.season && t.clubId === s.club).map((t) => t.compKey)
  }

  const played = ms.filter((m) => m.f.result)
  const by = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | undefined>((a, b) => (a === undefined || f(b) > f(a) ? b : a), undefined)
  const biggestWin = by(played.filter((m) => m.gf > m.ga), (m) => (m.gf - m.ga) * 100 + m.gf)
  const worstDefeat = by(played.filter((m) => m.ga > m.gf), (m) => (m.ga - m.gf) * 100 + m.ga)
  const mostGoals = by(played, (m) => (m.gf + m.ga) * 100 + m.gf)

  // systems: the formation the team started in
  const fm = new Map<string, { p: number; w: number; d: number; l: number }>()
  for (const m of ms) {
    const id = m.f.result?.formations?.[m.side]
    if (!id) continue
    const r = fm.get(id) || { p: 0, w: 0, d: 0, l: 0 }
    r.p++; r[m.res === 'W' ? 'w' : m.res === 'D' ? 'd' : 'l']++
    fm.set(id, r)
  }
  const formations = [...fm.entries()].map(([id, r]) => ({ id, name: formationOf(id)?.name || id, ...r })).sort((a, b) => b.p - a.p).slice(0, 3)

  // the players: goals, appearances and ratings in the user's matches
  const pl = new Map<number, PlayerLine>()
  for (const m of ms) {
    for (const st of m.f.result!.players) {
      if (st.side !== m.side || st.mins <= 0) continue
      const r = pl.get(st.id) || { id: st.id, apps: 0, goals: 0, assists: 0, rating: 0, rated: 0 }
      r.apps++; r.goals += st.goals; r.assists += st.assists
      if (st.rating) { r.rating += st.rating; r.rated++ }
      pl.set(st.id, r)
    }
  }
  const lines = [...pl.values()]
  const scorers = [...lines].filter((x) => x.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 5)
  const apps = [...lines].sort((a, b) => b.apps - a.apps).slice(0, 5)
  const minApps = Math.max(5, Math.round(ms.length * 0.2))
  const rated = [...lines].filter((x) => x.rated >= minApps).sort((a, b) => b.rating / b.rated - a.rating / a.rated).slice(0, 5)

  // milestones
  const milestones: Milestone[] = []
  const clubName = (id: number) => w.clubs[id]?.short || 'club'
  for (const h of w.user.history) milestones.push({ date: h.from, text: `Appointed ${w.clubs[h.clubId]?.name || 'manager'}`, icon: 'manager' })
  if (ms[0]) milestones.push({ date: ms[0].f.date, text: `First match: ${clubName(ms[0].club)} ${ms[0].gf}–${ms[0].ga} ${clubName(ms[0].opp)}`, icon: 'whistle', fixtureId: ms[0].f.id })
  const firstWin = ms.find((m) => m.res === 'W')
  if (firstWin) milestones.push({ date: firstWin.f.date, text: `First win: ${firstWin.gf}–${firstWin.ga} against ${clubName(firstWin.opp)}`, icon: 'check', fixtureId: firstWin.f.id })
  for (const n of [50, 100, 200, 300, 500, 750, 1000]) if (ms[n - 1]) milestones.push({ date: ms[n - 1].f.date, text: `${n} matches in charge`, icon: 'calendar', fixtureId: ms[n - 1].f.id })
  let wins = 0
  for (const m of ms) {
    if (m.res !== 'W') continue
    wins++
    if ([50, 100, 200, 300, 500].includes(wins)) milestones.push({ date: m.f.date, text: `${wins} wins`, icon: 'star', fixtureId: m.f.id })
  }
  for (const t of w.user.trophies) {
    const last = [...ms].reverse().find((m) => m.season === t.season && w.competitions[m.f.compId]?.key === t.compKey)
    milestones.push({ date: last?.f.date || `${t.season + 1}-05-31`, text: `Won the ${t.compName} with ${clubName(t.clubId)}`, icon: 'trophy', fixtureId: last?.f.id })
  }
  for (const a of w.user.awards) milestones.push({ date: a.month ? `${a.month}-28` : `${a.season + 1}-06-01`, text: a.name, icon: 'medal' })
  if (w.user.sacked) milestones.push({ date: w.user.sacked, text: 'Dismissed', icon: 'close' })
  milestones.sort((a, b) => b.date.localeCompare(a.date))

  return {
    matches: ms, ...tot, winPct: tot.p ? Math.round((tot.w / tot.p) * 100) : 0,
    seasons: [...seasons.values()].sort((a, b) => b.season - a.season),
    biggestWin, worstDefeat, mostGoals,
    winRun: longest(ms, (m) => m.res === 'W'), unbeatenRun: longest(ms, (m) => m.res !== 'L'),
    formations, scorers, apps, rated, milestones,
  }
}
