// Match context derived from the save's real state: stakes, form, streaks, head-to-head, former clubs, milestones.
// Feeds the match-day preview and the press conference question generator.
import type { Competition, Fixture, Player, World } from '../../domain/types'
import { sortTable } from '../competitions/tables'
import { aggregateBefore } from '../competitions/cups'
import { callName } from '../match/commentary'
import { historyNotes } from './history'

type R = 'W' | 'D' | 'L'

export interface Streak { kind: 'won' | 'unbeaten' | 'winless' | 'lost' | 'cleanSheets' | 'scoring'; n: number }

export interface MatchFacts {
  f: Fixture
  comp?: Competition
  us: number
  them: number
  home: boolean
  kind: 'league' | 'cup' | 'uefa' | 'supercup' | 'playoff' | 'friendly'
  final: boolean
  semi: boolean
  knockout: boolean
  leg?: 1 | 2
  agg?: [number, number] // us, them after leg 1
  derby?: string
  usPos?: number
  themPos?: number
  teams?: number
  usPts?: number
  themPts?: number
  played?: number
  gapTop?: number // points behind the leader (0 = leader)
  gapSafety?: number // points above the drop zone (negative = in it)
  titleRace: boolean
  relegation: boolean
  europe: boolean
  opener: boolean
  finale: boolean
  usForm: R[]
  themForm: R[]
  usStreak?: Streak
  themStreak?: Streak
  lastMeeting?: Fixture
  h2h: { w: number; d: number; l: number; gf: number; ga: number }
  exOurs: Player[] // our players who used to play for them
  exTheirs: Player[] // their players who used to play for us
  strengthGap: number // our XI avg minus theirs
  topScorer?: { p: Player; goals: number }
  newSigning?: Player
  youngster?: Player
  injured: Player[]
  lastResult?: { f: Fixture; r: R; gf: number; ga: number }
  bigWinLast: boolean
  heavyLossLast: boolean
}

function playedOf(w: World, clubId: number) {
  return Object.values(w.fixtures).filter((x) => x.played && x.result && (x.home === clubId || x.away === clubId)).sort((a, b) => a.date.localeCompare(b.date))
}
function res(f: Fixture, clubId: number): { r: R; gf: number; ga: number } {
  const s = f.result!.score
  const home = f.home === clubId
  let gf = home ? s[0] : s[1], ga = home ? s[1] : s[0]
  let r: R = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
  if (r === 'D' && f.result!.pens) { const p = f.result!.pens; r = (home ? p[0] > p[1] : p[1] > p[0]) ? 'W' : 'L' }
  void gf; void ga
  gf = home ? s[0] : s[1]; ga = home ? s[1] : s[0]
  return { r, gf, ga }
}

export function streakOf(w: World, clubId: number): Streak | undefined {
  const games = playedOf(w, clubId).reverse().map((f) => res(f, clubId))
  if (games.length < 3) return undefined
  const count = (pred: (g: { r: R; gf: number; ga: number }) => boolean) => { let n = 0; for (const g of games) { if (!pred(g)) break; n++ } return n }
  const won = count((g) => g.r === 'W'), lost = count((g) => g.r === 'L'), unb = count((g) => g.r !== 'L'), winless = count((g) => g.r !== 'W')
  const cs = count((g) => g.ga === 0), scoring = count((g) => g.gf > 0)
  if (won >= 3) return { kind: 'won', n: won }
  if (lost >= 3) return { kind: 'lost', n: lost }
  if (cs >= 3) return { kind: 'cleanSheets', n: cs }
  if (unb >= 5) return { kind: 'unbeaten', n: unb }
  if (winless >= 4) return { kind: 'winless', n: winless }
  if (scoring >= 8) return { kind: 'scoring', n: scoring }
  return undefined
}

export function streakText(s: Streak, team: string): string {
  switch (s.kind) {
    case 'won': return `${team} have won ${s.n} in a row`
    case 'lost': return `${team} have lost ${s.n} straight`
    case 'unbeaten': return `${team} are unbeaten in ${s.n}`
    case 'winless': return `${team} are without a win in ${s.n}`
    case 'cleanSheets': return `${team} have kept ${s.n} clean sheets running`
    case 'scoring': return `${team} have scored in ${s.n} straight games`
  }
}

export function matchFacts(w: World, f: Fixture, us: number): MatchFacts {
  const comp = w.competitions[f.compId]
  const them = f.home === us ? f.away : f.home
  const home = f.home === us
  const round = (f.roundName || '').toLowerCase()
  const kind = (comp?.format || 'friendly') as MatchFacts['kind']
  const aggRaw = aggregateBefore(w, f)
  const agg: [number, number] | undefined = aggRaw ? (home ? [aggRaw[0], aggRaw[1]] : [aggRaw[1], aggRaw[0]]) : undefined
  // league context
  let usPos: number | undefined, themPos: number | undefined, teams: number | undefined, usPts: number | undefined, themPts: number | undefined, played: number | undefined, gapTop: number | undefined, gapSafety: number | undefined
  const league = comp?.format === 'league' ? comp : Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(us) && c.status !== 'finished')
  if (league?.table?.length) {
    const t = sortTable(w, league)
    teams = t.length
    const iu = t.findIndex((r) => r.clubId === us), it = t.findIndex((r) => r.clubId === them)
    if (iu >= 0) {
      usPos = iu + 1
      usPts = t[iu].pts - (t[iu].ded || 0)
      played = t[iu].p
      gapTop = (t[0].pts - (t[0].ded || 0)) - usPts
      const rele = league.rules.rele || 3
      const safe = t[t.length - rele - 1]
      gapSafety = safe ? usPts - (safe.pts - (safe.ded || 0)) + (iu < t.length - rele ? 1 : 0) : undefined
    }
    if (it >= 0) { themPos = it + 1; themPts = t[it].pts - (t[it].ded || 0) }
  }
  const leagueGame = comp?.format === 'league'
  const titleRace = leagueGame && (played || 0) >= 8 && usPos != null && usPos <= 3 && (gapTop || 0) <= 6
  const relegation = leagueGame && (played || 0) >= 8 && usPos != null && teams != null && usPos > teams - 6
  const europe = leagueGame && (played || 0) >= 10 && usPos != null && usPos >= 4 && usPos <= 8
  const leagueFx = leagueGame ? Object.values(w.fixtures).filter((x) => x.compId === f.compId && (x.home === us || x.away === us)).sort((a, b) => a.date.localeCompare(b.date)) : []
  const opener = leagueGame && leagueFx[0]?.id === f.id
  const finale = leagueGame && leagueFx[leagueFx.length - 1]?.id === f.id
  const form = (id: number) => playedOf(w, id).slice(-5).map((x) => res(x, id).r)
  const meetings = playedOf(w, us).filter((x) => x.home === them || x.away === them)
  const h2h = { w: 0, d: 0, l: 0, gf: 0, ga: 0 }
  for (const m of meetings) { const r = res(m, us); h2h[r.r === 'W' ? 'w' : r.r === 'D' ? 'd' : 'l']++; h2h.gf += r.gf; h2h.ga += r.ga }
  const squad = (id: number) => Object.values(w.players).filter((p) => p.clubId === id && !p.academy)
  const ours = squad(us), theirs = squad(them)
  const exOurs = ours.filter((p) => p.career.some((c) => c.clubId === them)).slice(0, 3)
  const exTheirs = theirs.filter((p) => p.career.some((c) => c.clubId === us)).slice(0, 3)
  const avg = (ps: Player[]) => { const top = [...ps].sort((a, b) => b.ovr - a.ovr).slice(0, 11); return top.reduce((a, p) => a + p.ovr, 0) / (top.length || 1) }
  const seasonGoals = (p: Player) => Object.values(p.season).reduce((a, s) => a + s.goals, 0)
  const scorer = [...ours].sort((a, b) => seasonGoals(b) - seasonGoals(a))[0]
  const since = addDaysISO(w.date, -45)
  const arrivals = new Set(w.transfers.history.filter((t) => t.to === us && t.date >= since && (t.type === 'transfer' || t.type === 'free' || t.type === 'loan')).map((t) => t.playerId))
  const joined = ours.filter((p) => arrivals.has(p.id)).sort((a, b) => b.ovr - a.ovr)[0]
  const youngster = ours.filter((p) => ageYears(p.dob, w.date) <= 20 && p.ovr >= 68).sort((a, b) => b.pot - a.pot)[0]
  const last = playedOf(w, us).slice(-1)[0]
  const lastR = last ? { f: last, ...res(last, us) } : undefined
  return {
    f, comp, us, them, home, kind,
    final: /final/.test(round) && !/semi|quarter/.test(round), semi: /semi/.test(round), knockout: !!f.tieId || (comp?.format !== 'league' && !/group|league phase|matchday/i.test(f.roundName)),
    leg: f.leg, agg, derby: f.derby,
    usPos, themPos, teams, usPts, themPts, played, gapTop, gapSafety, titleRace, relegation, europe, opener, finale,
    usForm: form(us), themForm: form(them), usStreak: streakOf(w, us), themStreak: streakOf(w, them),
    lastMeeting: meetings[meetings.length - 1], h2h, exOurs, exTheirs,
    strengthGap: avg(ours) - avg(theirs),
    topScorer: scorer && seasonGoals(scorer) >= 3 ? { p: scorer, goals: seasonGoals(scorer) } : undefined,
    newSigning: joined, youngster,
    injured: ours.filter((p) => p.injury && p.ovr >= avg(ours) - 3).sort((a, b) => b.ovr - a.ovr).slice(0, 3),
    lastResult: lastR, bigWinLast: !!lastR && lastR.gf - lastR.ga >= 3, heavyLossLast: !!lastR && lastR.ga - lastR.gf >= 3,
  }
}

function addDaysISO(d: string, n: number) {
  const t = new Date(d + 'T12:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
function ageYears(dob: string, date: string) {
  const a = Number(date.slice(0, 4)) - Number(dob.slice(0, 4))
  return date.slice(5) < dob.slice(5) ? a - 1 : a
}
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

/** Neutral preview lines for the match-day screen (from the home side's point of view). */
export function storyLines(w: World, f: Fixture): { icon: string; text: string }[] {
  const x = matchFacts(w, f, f.home)
  const H = w.clubs[f.home].short, A = w.clubs[f.away].short
  const out: { icon: string; text: string }[] = []
  if (x.final) out.push({ icon: 'trophy', text: `${x.comp?.name} final${f.venue ? ` at ${f.venue}` : ''}` })
  else if (x.semi) out.push({ icon: 'bracket', text: `${x.comp?.name} semi-final${x.leg ? `, ${x.leg === 1 ? 'first' : 'second'} leg` : ''}` })
  if (x.agg) out.push({ icon: 'history', text: `First leg finished ${A} ${x.agg[1]}–${x.agg[0]} ${H}` })
  if (x.derby) out.push({ icon: 'fire', text: x.derby })
  if (x.usPos && x.themPos && x.comp?.format === 'league' && (x.played || 0) > 0) {
    if (x.usPos <= 2 && x.themPos <= 4 || x.themPos <= 2 && x.usPos <= 4) out.push({ icon: 'trophy', text: `Title race: ${ord(x.usPos)} v ${ord(x.themPos)}` })
    else if (x.teams && x.usPos > x.teams - 5 && x.themPos > x.teams - 5) out.push({ icon: 'warning', text: `Relegation six-pointer: ${ord(x.usPos)} v ${ord(x.themPos)}` })
    else out.push({ icon: 'list', text: `${H} ${ord(x.usPos)} (${x.usPts} pts) · ${A} ${ord(x.themPos)} (${x.themPts} pts)` })
  }
  // history about to be made or repeated, from what the save remembers
  for (const n of historyNotes(w, f).slice(0, 3)) out.push({ icon: n.icon, text: n.text })
  if (x.opener) out.push({ icon: 'calendar', text: 'Opening day of the league season' })
  if (x.finale) out.push({ icon: 'flag', text: 'Final day of the league season' })
  if (x.usStreak) out.push({ icon: x.usStreak.kind === 'lost' || x.usStreak.kind === 'winless' ? 'formDown' : 'form', text: streakText(x.usStreak, H) })
  if (x.themStreak) out.push({ icon: x.themStreak.kind === 'lost' || x.themStreak.kind === 'winless' ? 'formDown' : 'form', text: streakText(x.themStreak, A) })
  // (in a second leg the last meeting is the first leg, already said)
  if (x.lastMeeting?.result && !(x.agg && x.lastMeeting.tieId && x.lastMeeting.tieId === f.tieId)) {
    const m = x.lastMeeting
    out.push({ icon: 'history', text: `Last meeting: ${w.clubs[m.home].short} ${m.result!.score[0]}–${m.result!.score[1]} ${w.clubs[m.away].short}${m.result!.pens ? ` (${m.result!.pens[0]}–${m.result!.pens[1]} pens)` : ''}` })
  }
  for (const p of x.exOurs.slice(0, 1)) out.push({ icon: 'swap', text: `${callName(p.name)} faces former club ${A}` })
  for (const p of x.exTheirs.slice(0, 1)) out.push({ icon: 'swap', text: `${callName(p.name)} returns to face ${H}` })
  return out.slice(0, 8)
}
