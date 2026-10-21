// The scouting report on an opponent, built only from what the simulation has actually produced: their results,
// the shapes and XIs they used, the tactics their manager will pick, where their goals came from and where they
// conceded, who is in form, who is missing. Compared against their league's averages where that says something, and,
// for a fixture, against the manager's own side the way the match engine compares players.
import type { Club, Competition, Fixture, MatchEvent, Player, TeamTactics, TeamMatchStats, World } from '../../domain/types'
import { matchUp, sideInput } from './matchRunner'
import { isSuspendedFor } from '../match/selection'
import { formationOf, POS_GROUP } from '../../domain/constants'
import { A } from '../../domain/types'
import { posRating } from '../../domain/ratings'
import { diffDays, fmtDate } from '../../domain/dates'
import { callName } from '../match/commentary'
import { skillsOf, type Skills } from '../match/skills'

/** Something that stands out: `good` is good for them (a threat), otherwise a way to hurt them. */
export interface Trait { good: boolean; key: string; title: string; detail: string }
export interface Rec { w: number; d: number; l: number; gf: number; ga: number }
/** One line of their statistical profile, per game, against the average side in their league. */
export interface StyleRow { id: string; group: 'ball' | 'chances' | 'def'; label: string; v: number; avg: number; dp: number; unit?: '%' }
/** A matchup between the two XIs, on one of the engine's composite skills. */
export interface Matchup { id: string; icon: string; title: string; text: string; skill: string; ours: { id: number; v: number; weak?: boolean }[]; theirs: { id: number; v: number; weak?: boolean }[] }
export interface MatchCtx {
  venue: 'home' | 'away' | 'neutral'
  venueRec: Rec
  last5: { pts: number; n: number; w: number }
  restDays?: number
  lastFx?: Fixture
  nextDays?: number
  nextFx?: Fixture
  xiAvg: number
  ourXiAvg: number
}
export interface OpponentReport {
  clubId: number
  games: number
  record: Rec
  home: Rec
  away: Rec
  recent: { f: Fixture; gf: number; ga: number; res: 'W' | 'D' | 'L' }[]
  formations: { name: string; n: number }[]
  shape: string // the one they'll most likely use
  formationId: string
  captain: number
  xi: number[] // predicted XI
  bench: number[]
  usual: { id: number; starts: number }[] // most used XI
  /** regular starters who are not in the predicted XI, and why */
  usualOut: { id: number; starts: number; why: string }[]
  tactics: TeamTactics
  style: { possession: number; shots: number; xg: number; xga: number; crosses: number; longBalls: number; pressing: number; line: number; width: number; tempo: number }
  league?: { possession: number; shots: number; xg: number; crosses: number; longBalls: number }
  profile: StyleRow[]
  scored: Breakdown
  conceded: Breakdown
  /** goals by quarter of an hour: 0-15, 16-30, 31-45+, 46-60, 61-75, 76-90+ */
  timing: { scored: number[]; conceded: number[] }
  danger: { id: number; goals: number; assists: number; rating: number; apps: number }[]
  inForm: { id: number; rating: number; apps: number }[]
  missing: { id: number; why: string }[]
  subs: { id: number; times: number }[]
  setPieces: { goals: number; share: number; aerial: number[] }
  /** where their attacking threat comes from, by the wide players in their likely XI */
  flanks: { left: number; right: number; leftIds: number[]; rightIds: number[]; weakFb?: { id: number; side: 'left' | 'right' } }
  traits: Trait[]
  /** two or three sentences: who they are, how they're going, and what stands out for this match */
  brief: string[]
  /** for a fixture against the manager's side */
  ctx?: MatchCtx
  matchups: Matchup[]
}
export interface Breakdown { total: number; open: number; setPiece: number; counter: number; penalty: number; header: number; late: number; left: number; centre: number; right: number }

const emptyBd = (): Breakdown => ({ total: 0, open: 0, setPiece: 0, counter: 0, penalty: 0, header: 0, late: 0, left: 0, centre: 0, right: 0 })
const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal'
const rec = (): Rec => ({ w: 0, d: 0, l: 0, gf: 0, ga: 0 })
const games = (r: Rec) => r.w + r.d + r.l
const ppg = (r: Rec) => (games(r) ? (r.w * 3 + r.d) / games(r) : 0)
const r1 = (x: number) => x.toFixed(1), r2 = (x: number) => x.toFixed(2)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** the quarter of an hour an event falls in (stoppage time stays with its half, extra time with the last) */
export const binOf = (e: Pick<MatchEvent, 'min' | 'add'>) => (e.min <= 45 ? Math.min(2, Math.floor(Math.max(0, e.min - 1) / 15)) : Math.min(5, 3 + Math.floor(Math.max(0, e.min - 46) / 15)))

function addGoal(bd: Breakdown, e: MatchEvent, attackingSide: 0 | 1) {
  bd.total++
  if (e.type === 'penGoal' || e.how === 'pen') bd.penalty++
  else if (e.how === 'corner' || e.how === 'freekick') bd.setPiece++
  else if (e.how === 'counter') bd.counter++
  else bd.open++
  if (e.shot?.body === 'H') bd.header++
  if (e.min >= 76) bd.late++
  if (e.loc && e.type !== 'penGoal') {
    // flank from the attacking side's view: y is across the pitch (0..100), home attacks towards x = 100
    const y = attackingSide === 0 ? e.loc[1] : 100 - e.loc[1]
    if (y < 36) bd.left++; else if (y > 64) bd.right++; else bd.centre++
  }
}

// the per-game numbers of the profile, read off a side's match stats (undefined where an older result lacks them)
type Pick2 = (st: TeamMatchStats, so: TeamMatchStats) => number | undefined
const PROFILE: { id: string; group: StyleRow['group']; label: string; dp: number; unit?: '%'; get: Pick2; avg?: 'mirror' }[] = [
  { id: 'possession', group: 'ball', label: 'Possession', dp: 0, unit: '%', get: (s) => s.possession },
  { id: 'passAcc', group: 'ball', label: 'Pass accuracy', dp: 0, unit: '%', get: (s) => (s.passes ? s.passAcc : undefined) },
  { id: 'passes', group: 'ball', label: 'Passes', dp: 0, get: (s) => s.passes || undefined },
  { id: 'longBalls', group: 'ball', label: 'Long balls', dp: 1, get: (s) => s.longBalls },
  { id: 'crosses', group: 'ball', label: 'Crosses', dp: 1, get: (s) => s.crosses },
  { id: 'dribbles', group: 'ball', label: 'Dribbles', dp: 1, get: (s) => s.dribbles },
  { id: 'shots', group: 'chances', label: 'Shots', dp: 1, get: (s) => s.shots },
  { id: 'xg', group: 'chances', label: 'Expected goals', dp: 2, get: (s) => s.xg },
  { id: 'bigChances', group: 'chances', label: 'Big chances', dp: 1, get: (s) => s.bigChances },
  { id: 'boxTouches', group: 'chances', label: 'Touches in the box', dp: 1, get: (s) => s.boxTouches },
  { id: 'shotsAg', group: 'def', label: 'Shots against', dp: 1, get: (_s, o) => o.shots, avg: 'mirror' },
  { id: 'xga', group: 'def', label: 'xG against', dp: 2, get: (_s, o) => o.xg, avg: 'mirror' },
  { id: 'won', group: 'def', label: 'Tackles + interceptions', dp: 1, get: (s) => (s.tackles != null && s.interceptions != null ? s.tackles + s.interceptions : undefined) },
  { id: 'fouls', group: 'def', label: 'Fouls', dp: 1, get: (s) => s.fouls },
]

export function opponentReport(w: World, clubId: number, forComp?: Competition, fixture?: Fixture): OpponentReport {
  const season = w.season
  const fx = Object.values(w.fixtures).filter((f) => f.played && f.result && (f.home === clubId || f.away === clubId) && w.competitions[f.compId]?.season === season).sort((a, b) => b.date.localeCompare(a.date))
  const record = rec(), home = rec(), away = rec()
  const scored = emptyBd(), conceded = emptyBd()
  const timing = { scored: [0, 0, 0, 0, 0, 0], conceded: [0, 0, 0, 0, 0, 0] }
  const forms = new Map<string, number>(), starts = new Map<number, number>(), subsOn = new Map<number, number>()
  const perf = new Map<number, { g: number; a: number; r: number[]; apps: number }>()
  const sums = { possession: 0, shots: 0, xg: 0, xga: 0, crosses: 0, longBalls: 0, aerials: 0 }
  const prof = PROFILE.map(() => ({ s: 0, n: 0 }))
  let detailed = 0
  const recent: OpponentReport['recent'] = []
  for (const f of fx) {
    const r = f.result!
    const side: 0 | 1 = f.home === clubId ? 0 : 1
    const gf = r.score[side], ga = r.score[1 - side]
    const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
    for (const t of [record, side === 0 ? home : away]) { t.gf += gf; t.ga += ga; if (res === 'W') t.w++; else if (res === 'D') t.d++; else t.l++ }
    if (recent.length < 6) recent.push({ f, gf, ga, res })
    const form = r.formations?.[side]
    if (form) forms.set(form, (forms.get(form) || 0) + 1)
    for (const id of r.lineups?.[side] || []) starts.set(id, (starts.get(id) || 0) + 1)
    const st = r.stats[side], so = r.stats[1 - side]
    sums.possession += st.possession; sums.shots += st.shots; sums.xg += st.xg; sums.xga += so.xg
    if (st.crosses != null) { sums.crosses += st.crosses; sums.longBalls += st.longBalls || 0; sums.aerials += st.aerialsWon || 0; detailed++ }
    PROFILE.forEach((m, i) => { const v = m.get(st, so); if (v != null && Number.isFinite(v)) { prof[i].s += v; prof[i].n++ } })
    for (const e of r.events) {
      if (!isGoal(e) || (e.side !== 0 && e.side !== 1)) continue
      // an own goal is recorded on the side it counts for, like any other goal
      const forUs = e.side === side
      timing[forUs ? 'scored' : 'conceded'][binOf(e)]++
      if (e.type === 'owngoal') { (forUs ? scored : conceded).total++; continue }
      addGoal(forUs ? scored : conceded, e, e.side as 0 | 1)
    }
    for (const p of r.players) {
      if (p.side !== side) continue
      if (!p.started && p.mins > 0) subsOn.set(p.id, (subsOn.get(p.id) || 0) + 1)
      if (!p.mins) continue
      const q = perf.get(p.id) || { g: 0, a: 0, r: [], apps: 0 }
      q.g += p.goals; q.a += p.assists; q.apps++
      if (p.rating) q.r.push(p.rating)
      perf.set(p.id, q)
    }
  }
  const n = Math.max(1, fx.length)
  // their league's norms, for comparison: the average side, every stat per game
  const lgComp = Object.values(w.competitions).find((c) => c.season === season && c.format === 'league' && c.clubs.includes(clubId))
  let league: OpponentReport['league']
  const lgProf = PROFILE.map(() => ({ s: 0, n: 0 }))
  if (lgComp) {
    const lf = lgComp.fixtures.map((id) => w.fixtures[id]).filter((f) => f?.played && f.result)
    const det = lf.filter((f) => f.result!.stats[0].crosses != null)
    if (lf.length >= 10) {
      const avg = (fn: (f: Fixture) => number, list = lf) => list.reduce((a, f) => a + fn(f), 0) / Math.max(1, list.length)
      league = { possession: 50, shots: avg((f) => (f.result!.stats[0].shots + f.result!.stats[1].shots) / 2), xg: avg((f) => (f.result!.stats[0].xg + f.result!.stats[1].xg) / 2), crosses: avg((f) => ((f.result!.stats[0].crosses || 0) + (f.result!.stats[1].crosses || 0)) / 2, det), longBalls: avg((f) => ((f.result!.stats[0].longBalls || 0) + (f.result!.stats[1].longBalls || 0)) / 2, det) }
      for (const f of lf) for (const sd of [0, 1] as const) {
        const st = f.result!.stats[sd], so = f.result!.stats[1 - sd]
        PROFILE.forEach((m, i) => { const v = m.get(st, so); if (v != null && Number.isFinite(v)) { lgProf[i].s += v; lgProf[i].n++ } })
      }
    }
  }
  const profile: StyleRow[] = league && fx.length >= 3 ? PROFILE.map((m, i) => ({ id: m.id, group: m.group, label: m.label, dp: m.dp, unit: m.unit, v: prof[i].n ? prof[i].s / prof[i].n : NaN, avg: lgProf[i].n ? lgProf[i].s / lgProf[i].n : NaN }))
    .filter((x) => Number.isFinite(x.v) && Number.isFinite(x.avg) && x.avg > 0) : []
  // how they will set up for this game, if there is one (an AI manager adapts to the opponent, see contextTactics)
  const inp = sideInput(w, clubId, forComp || lgComp, clubId === w.userClubId, undefined, fixture?.id, fixture ? matchUp(fixture, fixture.home === clubId ? 0 : 1) : undefined)
  const t = inp.sheet.tactics
  const style = { possession: sums.possession / n, shots: sums.shots / n, xg: sums.xg / n, xga: sums.xga / n, crosses: detailed ? sums.crosses / detailed : 0, longBalls: detailed ? sums.longBalls / detailed : 0, pressing: t.pressing, line: t.lineHeight, width: t.width, tempo: t.tempo }
  const formations = [...forms.entries()].map(([id, k]) => ({ name: formationOf(id).name, n: k })).sort((a, b) => b.n - a.n)
  const usual = [...starts.entries()].map(([id, k]) => ({ id, starts: k })).filter((x) => w.players[x.id]?.clubId === clubId).sort((a, b) => b.starts - a.starts).slice(0, 11)
  const danger = [...perf.entries()].map(([id, q]) => ({ id, goals: q.g, assists: q.a, rating: q.r.length ? q.r.reduce((a, b) => a + b, 0) / q.r.length : 0, apps: q.apps })).filter((x) => w.players[x.id]?.clubId === clubId && x.goals + x.assists > 0).sort((a, b) => b.goals * 2 + b.assists - (a.goals * 2 + a.assists)).slice(0, 3)
  const inForm = [...perf.entries()].map(([id, q]) => { const last = q.r.slice(0, 5); return { id, rating: last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0, apps: last.length } }).filter((x) => x.apps >= 3 && w.players[x.id]?.clubId === clubId).sort((a, b) => b.rating - a.rating).slice(0, 3)
  const squad: Player[] = Object.values(w.players).filter((p) => p.clubId === clubId)
  const comp = forComp || lgComp
  // out for this match: injured past its date (today, with no fixture), or suspended
  const injuredFor = (p: Player) => !!p.injury && (!fixture || p.injury.until > fixture.date)
  const outFor = (p: Player) => injuredFor(p) || isSuspendedFor(p, comp)
  const whyOut = (p: Player) => (injuredFor(p) ? `${p.injury!.type} · back ${fmtDate(p.injury!.until, 'dm')}` : isSuspendedFor(p, comp) ? 'Suspended' : undefined)
  const missing = squad.filter(outFor).sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p) => ({ id: p.id, why: whyOut(p)! }))
  const subs = [...subsOn.entries()].map(([id, k]) => ({ id, times: k })).filter((x) => w.players[x.id]?.clubId === clubId).sort((a, b) => b.times - a.times).slice(0, 3)
  const aerial = squad.filter((p) => !outFor(p) && p.positions[0] !== 'GK').sort((a, b) => (b.height || 180) * 0.6 + b.attrs[A.jumping] * 0.3 + b.attrs[A.heading] * 0.4 - ((a.height || 180) * 0.6 + a.attrs[A.jumping] * 0.3 + a.attrs[A.heading] * 0.4)).slice(0, 2).map((p) => p.id)
  const setPieces = { goals: scored.setPiece, share: scored.total ? scored.setPiece / scored.total : 0, aerial }
  // regular starters (half their games or more) not in the XI they're expected to pick
  const usualOut = usual.filter((x) => x.starts >= Math.max(2, fx.length * 0.5) && !inp.sheet.lineup.includes(x.id)).map((x) => {
    const p = w.players[x.id]
    // the XI is their pick as things stand today: say so for a man who will be back by then
    const why = whyOut(p) || (p.injury ? `Injured today, back ${fmtDate(p.injury.until, 'dm')}: could return` : p.fitness < 80 ? `Tired · ${Math.round(p.fitness)}% fit` : 'Expected to start on the bench')
    return { ...x, why }
  })

  // flanks: the wide players of their likely XI (attackers going forward, full-backs defending)
  const slots = formationOf(inp.sheet.formation).slots
  const xiP = inp.sheet.lineup.map((id, i) => ({ p: inp.players[id], pos: slots[i]?.pos })).filter((x) => x.p && x.pos)
  const att = (p: Player) => (p.attrs[A.dribbling] + p.attrs[A.crossing] + p.attrs[A.sprintSpeed] + p.attrs[A.finishing] * 0.5) / 3.5
  const def = (p: Player) => (p.attrs[A.standingTackle] + p.attrs[A.defAwareness] + p.attrs[A.sprintSpeed] * 0.6) / 2.6
  const isL = (pos: string) => pos.startsWith('L') && pos !== 'LCB', isR = (pos: string) => pos.startsWith('R') && pos !== 'RCB'
  const wide = (pred: (s: string) => boolean) => xiP.filter((x) => pred(x.pos!) && !['LB', 'RB', 'LWB', 'RWB'].includes(x.pos!) || (pred(x.pos!) && ['LWB', 'RWB'].includes(x.pos!)))
  const lw = wide(isL), rw = wide(isR)
  const score = (l: typeof lw) => (l.length ? l.reduce((a, x) => a + att(x.p), 0) / l.length : 0)
  const fbs = xiP.filter((x) => ['LB', 'RB', 'LWB', 'RWB'].includes(x.pos!)).map((x) => ({ id: x.p.id, side: (x.pos!.startsWith('L') ? 'left' : 'right') as 'left' | 'right', d: def(x.p) })).sort((a, b) => a.d - b.d)
  const flanks = { left: score(lw), right: score(rw), leftIds: lw.map((x) => x.p.id), rightIds: rw.map((x) => x.p.id), weakFb: fbs.length === 2 && fbs[1].d - fbs[0].d >= 6 ? { id: fbs[0].id, side: fbs[0].side } : undefined }

  // ---------------------------------------------------------------- this fixture
  const club = w.clubs[clubId]
  const nm = club.short
  let ctx: MatchCtx | undefined
  const matchups: Matchup[] = []
  const usId = fixture ? (fixture.home === clubId ? fixture.away : fixture.home) : undefined
  const xiAvgOf = (ids: number[], formation: string) => { const sl = formationOf(formation).slots; const v = ids.map((id, i) => (w.players[id] && sl[i] ? posRating(w.players[id], sl[i].pos) : 0)).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
  if (fixture && usId != null && usId !== clubId) {
    const venue = fixture.neutral ? 'neutral' : fixture.home === clubId ? 'home' : 'away'
    const all = Object.values(w.fixtures).filter((f) => (f.home === clubId || f.away === clubId) && f.id !== fixture.id)
    // the match before this one and the one after, played or still to come
    const before = all.filter((f) => f.date < fixture.date).sort((a, b) => b.date.localeCompare(a.date))[0]
    const after = all.filter((f) => f.date > fixture.date).sort((a, b) => a.date.localeCompare(b.date))[0]
    const last5 = recent.slice(0, 5)
    const usInp = sideInput(w, usId, forComp || lgComp, usId === w.userClubId, undefined, fixture.id)
    ctx = {
      venue, venueRec: venue === 'away' ? away : home,
      last5: { n: last5.length, pts: last5.reduce((a, x) => a + (x.res === 'W' ? 3 : x.res === 'D' ? 1 : 0), 0), w: last5.filter((x) => x.res === 'W').length },
      restDays: before ? diffDays(fixture.date, before.date) : undefined, lastFx: before,
      nextDays: after ? diffDays(after.date, fixture.date) : undefined, nextFx: after,
      xiAvg: xiAvgOf(inp.sheet.lineup, inp.sheet.formation), ourXiAvg: xiAvgOf(usInp.sheet.lineup, usInp.sheet.formation),
    }
    matchups.push(...matchupsFor(w, { sheet: inp.sheet, players: inp.players }, { sheet: usInp.sheet, players: usInp.players }, nm))
  }

  // ---------------------------------------------------------------- what stands out, good and bad (for them)
  const traits: Trait[] = []
  const add = (good: boolean, key: string, title: string, detail: string) => traits.push({ good, key, title, detail })
  const pct = (a: number, b: number) => (b ? a / b : 0)
  const lgXg = league?.xg
  if (fx.length >= 4) {
    if (lgXg && style.xg >= lgXg * 1.2) add(true, 'create', 'They create a lot', `${r2(style.xg)} xG a game, against a league average of ${r2(lgXg)}`)
    else if (lgXg && style.xg <= lgXg * 0.8) add(false, 'blunt', 'Short of chances', `${r2(style.xg)} xG a game, against a league average of ${r2(lgXg)}`)
    if (lgXg && style.xga >= lgXg * 1.2) add(false, 'leaky', 'Open at the back', `They give up ${r2(style.xga)} xG a game (league ${r2(lgXg)})`)
    else if (lgXg && style.xga <= lgXg * 0.8) add(true, 'tight', 'Hard to break down', `Only ${r2(style.xga)} xG against a game (league ${r2(lgXg)})`)
    if (record.gf < style.xg * n * 0.8 && style.xg > 0.8) add(false, 'wasteful', 'Wasteful in front of goal', `${plural(record.gf, 'goal')} from ${r1(style.xg * n)} xG`)
    if (record.gf > style.xg * n * 1.25 && record.gf >= 6) add(true, 'clinical', 'Clinical', `${plural(record.gf, 'goal')} from ${r1(style.xg * n)} xG`)
    if (pct(conceded.setPiece, conceded.total) >= 0.35 && conceded.total >= 4) add(false, 'spAg', 'Vulnerable at set pieces', `${conceded.setPiece} of the ${conceded.total} goals they've conceded`)
    if (setPieces.share >= 0.3 && scored.total >= 4) add(true, 'spFor', 'Dangerous at set pieces', `${scored.setPiece} of their ${scored.total} goals`)
    if (pct(conceded.late, conceded.total) >= 0.33 && conceded.total >= 4) add(false, 'fade', 'They fade late', `${conceded.late} of ${conceded.total} conceded after 75'`)
    if (pct(scored.late, scored.total) >= 0.33 && scored.total >= 4) add(true, 'late', 'Strong finishers', `${scored.late} of ${scored.total} goals after 75'`)
    if (pct(scored.counter, scored.total) >= 0.25 && scored.total >= 4) add(true, 'counter', 'Deadly on the counter', `${scored.counter} of ${scored.total} goals on the break`)
    if (pct(conceded.counter, conceded.total) >= 0.25 && conceded.total >= 4) add(false, 'counterAg', 'Exposed on the break', `${conceded.counter} of ${conceded.total} conceded to counter-attacks`)
    if (games(home) >= 3 && games(away) >= 3) {
      const hp = ppg(home), ap = ppg(away)
      // only the side of it that matters for where this match is played
      if (hp - ap >= 1 && ctx?.venue !== 'away') add(true, 'home', 'Strong at home', `${r1(hp)} points a game at home, ${r1(ap)} away`)
      if (hp - ap >= 1 && ctx?.venue === 'away') add(false, 'away', 'Poor away from home', `${away.w}W ${away.d}D ${away.l}L on the road (${r1(ap)} points a game), against ${r1(hp)} at home`)
    }
  }
  const prow = (id: string) => profile.find((x) => x.id === id)
  const yel = prow('fouls')
  if (yel && yel.v >= yel.avg * 1.25 && fx.length >= 4) add(false, 'fouls', 'They give away fouls', `${r1(yel.v)} a game (league ${r1(yel.avg)}): free kicks within range`)
  if (ctx && ctx.last5.n >= 4) {
    if (ctx.last5.pts >= 12) add(true, 'form', 'In form', `${ctx.last5.w} wins in their last ${ctx.last5.n}`)
    else if (ctx.last5.pts <= 4) add(false, 'form', 'Out of form', `${ctx.last5.pts} points from their last ${ctx.last5.n}`)
  }
  if (flanks.weakFb && w.players[flanks.weakFb.id]) add(false, 'weakFb', `Weaker at ${flanks.weakFb.side} back`, `${callName(w.players[flanks.weakFb.id].name)} is the less solid of their full-backs`)
  const topOut = danger.find((d) => missing.some((m) => m.id === d.id))
  if (topOut && topOut.goals + topOut.assists >= 3) {
    const p = w.players[topOut.id]
    const ga = [topOut.goals ? plural(topOut.goals, 'goal') : '', topOut.assists ? plural(topOut.assists, 'assist') : ''].filter(Boolean).join(' and ')
    add(false, 'without', `Without ${callName(p.name)}`, `${ga} this season; ${p.injury ? `out injured (${p.injury.type.toLowerCase()}) until ${fmtDate(p.injury.until, 'dm')}` : 'suspended'}`)
  }

  // ---------------------------------------------------------------- the brief
  const brief: string[] = []
  if (fx.length >= 3) {
    const ways: string[] = []
    if (t.pressing >= 65) ways.push('press high')
    else if (t.pressing <= 35 && t.lineHeight <= 42) ways.push('sit deep and wait')
    else if (t.pressing <= 35) ways.push('sit off the ball')
    if (t.buildUp === 'Counter' || t.chanceCreation === 'Forward Runs') ways.push('break quickly')
    else if (t.buildUp === 'Long Ball' || t.chanceCreation === 'Direct Passing') ways.push('go direct')
    else if (t.buildUp === 'Short Passing' || t.chanceCreation === 'Possession') ways.push('build patiently')
    const poss = style.possession >= 55 ? `they have more of the ball than most (${Math.round(style.possession)}%)` : style.possession <= 45 ? `they have less of the ball than most (${Math.round(style.possession)}%)` : `they share the ball (${Math.round(style.possession)}%)`
    const xgClause = lgXg ? (style.xg >= lgXg * 1.15 ? `create plenty (${r2(style.xg)} xG a game)` : style.xg <= lgXg * 0.85 ? `create little (${r2(style.xg)} xG a game)` : `create about as much as the average side (${r2(style.xg)} xG a game)`) : `create ${r2(style.xg)} xG a game`
    const contrast = (style.possession <= 45 && lgXg && style.xg >= lgXg * 1.15) || (style.possession >= 55 && lgXg && style.xg <= lgXg * 0.85) ? 'but' : 'and'
    brief.push(`${nm} ${ways.length ? ways.join(' and ') : 'play a balanced game'}: ${poss} ${contrast} ${xgClause}.`)
    if (ctx) {
      const vr = ctx.venueRec
      const formTxt = ctx.last5.n ? `${ctx.last5.pts} points from their last ${ctx.last5.n}` : ''
      brief.push(ctx.venue !== 'neutral' && games(vr) >= 2
        ? `This one is ${ctx.venue === 'home' ? 'at their ground' : 'away for them'}, where they are ${vr.w}W ${vr.d}D ${vr.l}L (${vr.gf}–${vr.ga}) this season${formTxt ? `; ${formTxt}` : ''}.`
        : formTxt ? `${formTxt[0].toUpperCase()}${formTxt.slice(1)}.` : '')
    }
    const lead = danger.find((d) => !missing.some((m) => m.id === d.id))
    if (topOut && topOut.goals >= 2) brief.push(`Their top scorer ${callName(w.players[topOut.id].name)} (${plural(topOut.goals, 'goal')}) is out${lead ? `; ${callName(w.players[lead.id].name)} is the main threat left` : ''}.`)
    else if (lead && lead.goals + lead.assists >= 3) {
      const p = w.players[lead.id]
      const ga = [lead.goals ? plural(lead.goals, 'goal') : '', lead.assists ? plural(lead.assists, 'assist') : ''].filter(Boolean).join(' and ')
      // the predicted XI is today's pick: a man due back before kick-off is named as one who could return
      const back = p.injury && !inp.sheet.lineup.includes(p.id) ? `, and he is due back from injury on ${fmtDate(p.injury.until, 'dm')}` : ''
      brief.push(`${callName(p.name)} is the one to watch: ${ga} in ${lead.apps}${back}.`)
    }
  }
  return {
    clubId, games: fx.length, record, home, away, recent, formations, shape: formationOf(inp.sheet.formation).name, formationId: inp.sheet.formation, captain: inp.sheet.captain, xi: inp.sheet.lineup, bench: inp.sheet.bench,
    usual, usualOut, tactics: t, style, league, profile, scored, conceded, timing, danger, inForm, missing, subs, setPieces, flanks, traits, brief: brief.filter(Boolean), ctx, matchups,
  }
}

/**
 * Where the two XIs meet, read with the engine's own composite skills: a ball in behind is a race between the runner
 * and the covering defender (pace), a press is the presser against the man on the ball (ball security), a set piece
 * or a cross is an aerial duel. Facts about both sides, not advice.
 */
function matchupsFor(w: World, them: { sheet: import('../../domain/types').TeamSheet; players: Record<number, Player> }, us: { sheet: import('../../domain/types').TeamSheet; players: Record<number, Player> }, nm: string): Matchup[] {
  const xi = (s: typeof them) => { const sl = formationOf(s.sheet.formation).slots; return s.sheet.lineup.map((id, i) => ({ p: s.players[id] || w.players[id], pos: sl[i]?.pos })).filter((x) => x.p && x.pos) }
  const T = xi(them), U = xi(us)
  const sk = new Map<number, Skills>()
  const S = (p: Player) => { let v = sk.get(p.id); if (!v) { v = skillsOf(p); sk.set(p.id, v) } return v }
  const grp = (pos: string) => POS_GROUP[pos as keyof typeof POS_GROUP] || ''
  const isCB = (pos: string) => pos === 'CB'
  const isAtt = (pos: string) => grp(pos) === 'ATT'
  const top = (l: typeof T, k: keyof Skills, n: number, asc = false) => [...l].sort((a, b) => (asc ? S(a.p)[k] - S(b.p)[k] : S(b.p)[k] - S(a.p)[k])).slice(0, n).map((x) => ({ id: x.p.id, v: Math.round(S(x.p)[k]) }))
  const who = (l: { id: number; v: number }[]) => l.map((x) => `${callName(w.players[x.id].name)} (${x.v})`).join(' and ')
  const out: Matchup[] = []
  const tt = them.sheet.tactics, ut = us.sheet.tactics
  // a high line: room in behind, a race each time
  const theirCB = T.filter((x) => isCB(x.pos!)), ourAtt = U.filter((x) => isAtt(x.pos!))
  if (tt.lineHeight >= 58 && theirCB.length && ourAtt.length) {
    const quick = top(ourAtt, 'pace', 2), slow = top(theirCB, 'pace', 1, true)
    out.push({ id: 'behind', icon: 'long', skill: 'Pace', title: 'Space behind a high line', ours: quick, theirs: slow.map((x) => ({ ...x, weak: true })),
      text: `${nm} hold their line high (${Math.round(tt.lineHeight)}) while they press the ball. A ball in behind is a race between the runner and the covering defender: your quickest are ${who(quick)}; their slowest centre-back is ${who(slow)}.` })
  }
  // your own high line against their pace
  const ourCB = U.filter((x) => isCB(x.pos!)), theirAtt = T.filter((x) => isAtt(x.pos!))
  if (ut.lineHeight >= 58 && ourCB.length && theirAtt.length) {
    const quick = top(theirAtt, 'pace', 2), slow = top(ourCB, 'pace', 1, true)
    if (quick[0] && slow[0] && quick[0].v - slow[0].v >= 6) out.push({ id: 'exposed', icon: 'warning', skill: 'Pace', title: 'Their pace against your line', ours: slow.map((x) => ({ ...x, weak: true })), theirs: quick,
      text: `Your line is set high (${Math.round(ut.lineHeight)}). Their quickest runners are ${who(quick)}; your slowest centre-back is ${who(slow)}.` })
  }
  // their press against your build-up
  if (tt.pressing >= 62) {
    const build = U.filter((x) => x.pos !== 'GK' && ['DEF', 'MID'].includes(grp(x.pos!)))
    if (build.length >= 3) {
      const sure = top(build, 'secure', 2), shaky = top(build, 'secure', 1, true)
      const pressers = top(T.filter((x) => x.pos !== 'GK'), 'press', 2)
      out.push({ id: 'press', icon: 'press', skill: 'Ball security', title: 'Playing through their press', ours: [...sure, ...shaky.map((x) => ({ ...x, weak: true }))], theirs: pressers,
        text: `${nm} press hard (${Math.round(tt.pressing)}). When they close a man down it is their pressing against his ball security: your surest on the ball at the back and in midfield are ${who(sure)}, the least sure ${who(shaky)}. Their hardest pressers: ${who(pressers)}.` })
    }
  }
  // in the air: crosses and set pieces
  const tAir = top(T.filter((x) => x.pos !== 'GK'), 'aer', 2), uAir = top(U.filter((x) => x.pos !== 'GK'), 'aer', 2)
  if (tAir.length && uAir.length) out.push({ id: 'air', icon: 'corner', skill: 'In the air', title: 'Crosses and set pieces', ours: uAir, theirs: tAir,
    text: `Every cross and set piece is an aerial duel (heading, jumping, strength and height). Their biggest threats in the air: ${who(tAir)}; your best: ${who(uAir)}.` })
  // the weaker full-back against your winger on that side
  const fb = T.filter((x) => ['LB', 'RB', 'LWB', 'RWB'].includes(x.pos!)).sort((a, b) => S(a.p).jockey - S(b.p).jockey)
  if (fb.length === 2 && S(fb[1].p).jockey - S(fb[0].p).jockey >= 4) {
    const weak = fb[0], theirSide = weak.pos!.startsWith('L') ? 'L' : 'R'
    // their left faces your right
    const mine = U.filter((x) => x.pos!.startsWith(theirSide === 'L' ? 'R' : 'L') && ['MID', 'ATT'].includes(grp(x.pos!)) && x.pos !== 'CM' && x.pos !== 'CDM' && x.pos !== 'CAM').sort((a, b) => S(b.p).drib - S(a.p).drib)[0]
    if (mine) out.push({ id: 'flank', icon: 'person', skill: 'Dribbling v defending', title: `Their ${theirSide === 'L' ? 'left' : 'right'} back`, ours: [{ id: mine.p.id, v: Math.round(S(mine.p).drib) }], theirs: [{ id: weak.p.id, v: Math.round(S(weak.p).jockey), weak: true }],
      text: `${callName(weak.p.name)} is the less solid of their full-backs in a one-on-one (${Math.round(S(weak.p).jockey)}, against ${Math.round(S(fb[1].p).jockey)} on the other side). On that flank you have ${callName(mine.p.name)} (dribbling ${Math.round(S(mine.p).drib)}, pace ${Math.round(S(mine.p).pace)}).` })
  }
  return out
}

export const tacticWord = {
  pressing: (v: number) => (v >= 70 ? 'High press' : v >= 50 ? 'Mid-block' : v >= 30 ? 'Low press' : 'Sit off'),
  line: (v: number) => (v >= 68 ? 'High line' : v >= 45 ? 'Standard line' : 'Deep line'),
  width: (v: number) => (v >= 65 ? 'Wide' : v >= 40 ? 'Balanced width' : 'Narrow'),
  tempo: (v: number) => (v >= 65 ? 'Fast tempo' : v >= 40 ? 'Measured' : 'Slow build-up'),
}
export type { Club }
