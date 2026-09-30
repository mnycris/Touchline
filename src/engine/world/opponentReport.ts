// The scouting report on an opponent, built only from what the simulation has actually produced: their results,
// the shapes and XIs they used, the tactics their manager will pick, where their goals came from and where they
// conceded, who is in form, who is missing. Compared against their league's averages where that says something.
import type { Club, Competition, Fixture, MatchEvent, Player, TeamTactics, World } from '../../domain/types'
import { sideInput } from './matchRunner'
import { isSuspendedFor } from '../match/selection'
import { formationOf } from '../../domain/constants'
import { A } from '../../domain/types'
import { fmtDate } from '../../domain/dates'

export interface Trait { good: boolean; text: string }
export interface OpponentReport {
  clubId: number
  games: number
  record: { w: number; d: number; l: number; gf: number; ga: number }
  home: { w: number; d: number; l: number; gf: number; ga: number }
  away: { w: number; d: number; l: number; gf: number; ga: number }
  recent: { f: Fixture; gf: number; ga: number; res: 'W' | 'D' | 'L' }[]
  formations: { name: string; n: number }[]
  shape: string // the one they'll most likely use
  formationId: string
  captain: number
  xi: number[] // predicted XI
  bench: number[]
  usual: { id: number; starts: number }[] // most used XI
  tactics: TeamTactics
  style: { possession: number; shots: number; xg: number; xga: number; crosses: number; longBalls: number; pressing: number; line: number; width: number; tempo: number }
  league?: { possession: number; shots: number; xg: number; crosses: number; longBalls: number }
  scored: Breakdown
  conceded: Breakdown
  danger: { id: number; goals: number; assists: number; rating: number; apps: number }[]
  inForm: { id: number; rating: number; apps: number }[]
  missing: { id: number; why: string }[]
  subs: { id: number; times: number }[]
  setPieces: { goals: number; share: number; aerial: number[] }
  /** where their attacking threat comes from, by the wide players in their likely XI */
  flanks: { left: number; right: number; leftIds: number[]; rightIds: number[]; weakFb?: { id: number; side: 'left' | 'right' } }
  traits: Trait[]
}
export interface Breakdown { total: number; open: number; setPiece: number; counter: number; penalty: number; header: number; late: number; left: number; centre: number; right: number }

const emptyBd = (): Breakdown => ({ total: 0, open: 0, setPiece: 0, counter: 0, penalty: 0, header: 0, late: 0, left: 0, centre: 0, right: 0 })
const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal'

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

export function opponentReport(w: World, clubId: number, forComp?: Competition): OpponentReport {
  const club = w.clubs[clubId]
  const season = w.season
  const fx = Object.values(w.fixtures).filter((f) => f.played && f.result && (f.home === clubId || f.away === clubId) && w.competitions[f.compId]?.season === season).sort((a, b) => b.date.localeCompare(a.date))
  const rec = () => ({ w: 0, d: 0, l: 0, gf: 0, ga: 0 })
  const record = rec(), home = rec(), away = rec()
  const scored = emptyBd(), conceded = emptyBd()
  const forms = new Map<string, number>(), starts = new Map<number, number>(), subsOn = new Map<number, number>()
  const perf = new Map<number, { g: number; a: number; r: number[]; apps: number }>()
  const sums = { possession: 0, shots: 0, xg: 0, xga: 0, crosses: 0, longBalls: 0, aerials: 0 }
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
    for (const e of r.events) {
      if (!isGoal(e) || (e.side !== 0 && e.side !== 1)) continue
      const forUs = e.type === 'owngoal' ? e.side !== side : e.side === side
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
  // their league's norms, for comparison
  const lgComp = Object.values(w.competitions).find((c) => c.season === season && c.format === 'league' && c.clubs.includes(clubId))
  let league: OpponentReport['league']
  if (lgComp) {
    const lf = lgComp.fixtures.map((id) => w.fixtures[id]).filter((f) => f?.played && f.result)
    const det = lf.filter((f) => f.result!.stats[0].crosses != null)
    if (lf.length >= 10) {
      const avg = (fn: (f: Fixture) => number, list = lf) => list.reduce((a, f) => a + fn(f), 0) / Math.max(1, list.length)
      league = { possession: 50, shots: avg((f) => (f.result!.stats[0].shots + f.result!.stats[1].shots) / 2), xg: avg((f) => (f.result!.stats[0].xg + f.result!.stats[1].xg) / 2), crosses: avg((f) => ((f.result!.stats[0].crosses || 0) + (f.result!.stats[1].crosses || 0)) / 2, det), longBalls: avg((f) => ((f.result!.stats[0].longBalls || 0) + (f.result!.stats[1].longBalls || 0)) / 2, det) }
    }
  }
  const inp = sideInput(w, clubId, forComp || lgComp, clubId === w.userClubId)
  const t = inp.sheet.tactics
  const style = { possession: sums.possession / n, shots: sums.shots / n, xg: sums.xg / n, xga: sums.xga / n, crosses: detailed ? sums.crosses / detailed : 0, longBalls: detailed ? sums.longBalls / detailed : 0, pressing: t.pressing, line: t.lineHeight, width: t.width, tempo: t.tempo }
  const formations = [...forms.entries()].map(([id, k]) => ({ name: formationOf(id).name, n: k })).sort((a, b) => b.n - a.n)
  const usual = [...starts.entries()].map(([id, k]) => ({ id, starts: k })).filter((x) => w.players[x.id]?.clubId === clubId).sort((a, b) => b.starts - a.starts).slice(0, 11)
  const danger = [...perf.entries()].map(([id, q]) => ({ id, goals: q.g, assists: q.a, rating: q.r.length ? q.r.reduce((a, b) => a + b, 0) / q.r.length : 0, apps: q.apps })).filter((x) => w.players[x.id]?.clubId === clubId && x.goals + x.assists > 0).sort((a, b) => b.goals * 2 + b.assists - (a.goals * 2 + a.assists)).slice(0, 3)
  const inForm = [...perf.entries()].map(([id, q]) => { const last = q.r.slice(0, 5); return { id, rating: last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0, apps: last.length } }).filter((x) => x.apps >= 3 && w.players[x.id]?.clubId === clubId).sort((a, b) => b.rating - a.rating).slice(0, 3)
  const squad: Player[] = Object.values(w.players).filter((p) => p.clubId === clubId)
  const missing = squad.filter((p) => p.injury || isSuspendedFor(p, forComp || lgComp)).sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p) => ({ id: p.id, why: p.injury ? `${p.injury.type} · back ${fmtDate(p.injury.until, 'dm')}` : 'Suspended' }))
  const subs = [...subsOn.entries()].map(([id, k]) => ({ id, times: k })).filter((x) => w.players[x.id]?.clubId === clubId).sort((a, b) => b.times - a.times).slice(0, 3)
  const aerial = squad.filter((p) => !p.injury && p.positions[0] !== 'GK').sort((a, b) => (b.height || 180) * 0.6 + b.attrs[A.jumping] * 0.3 + b.attrs[A.heading] * 0.4 - ((a.height || 180) * 0.6 + a.attrs[A.jumping] * 0.3 + a.attrs[A.heading] * 0.4)).slice(0, 2).map((p) => p.id)
  const setPieces = { goals: scored.setPiece, share: scored.total ? scored.setPiece / scored.total : 0, aerial }

  // what stands out, good and bad (for them), from the numbers
  const traits: Trait[] = []
  const pct = (a: number, b: number) => (b ? a / b : 0)
  if (fx.length >= 4) {
    if (style.possession >= 56) traits.push({ good: true, text: `Keep the ball: ${Math.round(style.possession)}% possession on average` })
    else if (style.possession <= 44) traits.push({ good: false, text: `Happy without the ball (${Math.round(style.possession)}% possession): expect to have it` })
    if (league && style.xg >= league.xg * 1.2) traits.push({ good: true, text: `Create a lot: ${style.xg.toFixed(1)} xG a game` })
    if (league && style.xga >= league.xg * 1.2) traits.push({ good: false, text: `Leaky: they give up ${style.xga.toFixed(1)} xG a game` })
    else if (league && style.xga <= league.xg * 0.8) traits.push({ good: true, text: `Hard to break down: ${style.xga.toFixed(1)} xG against a game` })
    if (record.gf < style.xg * n * 0.8 && style.xg > 0.8) traits.push({ good: false, text: `Wasteful: ${record.gf} goals from ${(style.xg * n).toFixed(1)} xG` })
    if (record.gf > style.xg * n * 1.25 && record.gf >= 6) traits.push({ good: true, text: `Clinical: ${record.gf} goals from ${(style.xg * n).toFixed(1)} xG` })
    if (pct(conceded.setPiece, conceded.total) >= 0.35 && conceded.total >= 4) traits.push({ good: false, text: `Vulnerable at set pieces: ${conceded.setPiece} of ${conceded.total} conceded` })
    if (setPieces.share >= 0.3 && scored.total >= 4) traits.push({ good: true, text: `Dangerous at set pieces: ${scored.setPiece} of ${scored.total} goals` })
    if (pct(conceded.late, conceded.total) >= 0.33 && conceded.total >= 4) traits.push({ good: false, text: `Fade late: ${conceded.late} of ${conceded.total} conceded after 75'` })
    if (pct(scored.late, scored.total) >= 0.33 && scored.total >= 4) traits.push({ good: true, text: `Strong finishers: ${scored.late} of ${scored.total} goals after 75'` })
    if (pct(scored.counter, scored.total) >= 0.25 && scored.total >= 4) traits.push({ good: true, text: `Deadly on the counter: ${scored.counter} of ${scored.total} goals` })
    if (pct(conceded.counter, conceded.total) >= 0.25 && conceded.total >= 4) traits.push({ good: false, text: `Exposed to counters: ${conceded.counter} of ${conceded.total} conceded` })
    const games = (r: typeof home) => r.w + r.d + r.l
    if (games(home) >= 3 && games(away) >= 3) {
      const hp = (home.w * 3 + home.d) / games(home), ap = (away.w * 3 + away.d) / games(away)
      if (hp - ap >= 1) traits.push({ good: hp > 1.8, text: `Far better at home (${hp.toFixed(1)} pts a game) than away (${ap.toFixed(1)})` })
    }
  }
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
  if (flanks.left && flanks.right && Math.abs(flanks.left - flanks.right) >= 5) {
    const strong = flanks.left > flanks.right ? 'left' : 'right'
    const who = (strong === 'left' ? lw : rw).sort((a, b) => att(b.p) - att(a.p))[0]
    traits.push({ good: true, text: `Most of their threat comes down the ${strong}${who ? `, where ${who.p.name} plays` : ''}` })
  }
  if (flanks.weakFb) traits.push({ good: false, text: `Weaker at ${flanks.weakFb.side} back: ${w.players[flanks.weakFb.id]?.name} is the one to run at` })
  if (t.lineHeight >= 68) traits.push({ good: false, text: `A high line: space in behind for quick runners` })
  else if (t.lineHeight <= 32) traits.push({ good: true, text: `Sit deep: little space in behind` })
  if (t.pressing >= 70) traits.push({ good: true, text: `Press hard: be ready to play through it` })
  return {
    clubId, games: fx.length, record, home, away, recent, formations, shape: formationOf(inp.sheet.formation).name, formationId: inp.sheet.formation, captain: inp.sheet.captain, xi: inp.sheet.lineup, bench: inp.sheet.bench,
    usual, tactics: t, style, league, scored, conceded, danger, inForm, missing, subs, setPieces, flanks, traits,
  }
}

export const tacticWord = {
  pressing: (v: number) => (v >= 70 ? 'High press' : v >= 50 ? 'Mid-block' : v >= 30 ? 'Low press' : 'Sit off'),
  line: (v: number) => (v >= 68 ? 'High line' : v >= 45 ? 'Standard line' : 'Deep line'),
  width: (v: number) => (v >= 65 ? 'Wide' : v >= 40 ? 'Balanced width' : 'Narrow'),
  tempo: (v: number) => (v >= 65 ? 'Fast tempo' : v >= 40 ? 'Measured' : 'Slow build-up'),
}
export type { Club }
