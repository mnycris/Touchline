// A finished season, as the Season Review tells it: how the league went (and the run that got there), what happened in
// every competition, the facts worth retelling (biggest win, longest runs), who carried the squad, what the board asked
// for and what the window did. All of it is worked out from what the season left behind: the archive, the
// competitions the club played in and its own fixtures, whose results keep every player's line.
import type { Club, Competition, Fixture, Objective, SeasonArchive, StandingRow, Award, World } from '../../domain/types'
import { ageOn } from '../../domain/dates'
import { ordinalOf } from '../../domain/words'

export type Verdict = 'Champions' | 'Promoted' | 'Champions League' | 'Europe' | 'Top half' | 'Survived' | 'Relegated' | 'Play-offs'

export interface RunMatch { res: 'W' | 'D' | 'L'; pts: number; pos?: number; opp: number; gf: number; ga: number; home: boolean; fixtureId: string }
export interface CompRun { comp: Competition; outcome: string; tone: 'gold' | 'silver' | 'good' | 'plain' | 'bad'; order: number }
export interface SquadLine { id: number; name: string; pos: string; apps: number; starts: number; mins: number; goals: number; assists: number; rating: number; cs: number; young: boolean }
export interface Highlight { fixture: Fixture; opp: number; gf: number; ga: number; comp?: Competition }

export interface Review {
  season: number
  club: Club
  league?: { comp?: Competition; key: string; row: StandingRow; finish: number; size: number; verdict: Verdict; table: StandingRow[]; gapAbove?: number; gapBelow?: number; zones: { ucl: number; uel: number; rele: number; promo: number } }
  trophies: { key: string; comp?: Competition }[]
  record: { p: number; w: number; d: number; l: number; gf: number; ga: number; cs: number }
  run: RunMatch[]
  facts: { biggestWin?: Highlight; heaviestDefeat?: Highlight; unbeaten: number; winStreak: number; comebacks: number; homeRecord: [number, number, number]; awayRecord: [number, number, number] }
  comps: CompRun[]
  squad: SquadLine[]
  standout?: SquadLine
  topScorer?: SquadLine
  topCreator?: SquadLine
  ironMan?: SquadLine
  breakout?: SquadLine
  objectives: Objective[]
  awards: Award[]
  transfers: { in: number; out: number; spent: number; received: number; biggestIn?: { name: string; fee: number; from: number }; biggestOut?: { name: string; fee: number; to: number } }
}

const seasonOf = (f: Fixture) => Number(f.compId.split('-').pop())

/** The club's position after each of its league matches, worked out while the season's fixtures still exist. */
export function leagueRun(w: World, comp: Competition, clubId: number): number[] {
  const fx = comp.fixtures.map((id) => w.fixtures[id]).filter((f): f is Fixture => !!f?.played && !!f.result).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const t = new Map<number, { pts: number; gd: number; gf: number }>(comp.clubs.map((id) => [id, { pts: 0, gd: 0, gf: 0 }]))
  const out: number[] = []
  for (const f of fx) {
    const [a, b] = f.result!.score
    const h = t.get(f.home), x = t.get(f.away)
    if (!h || !x) continue
    h.gf += a; h.gd += a - b; x.gf += b; x.gd += b - a
    if (a > b) h.pts += 3; else if (a < b) x.pts += 3; else { h.pts++; x.pts++ }
    if (f.home !== clubId && f.away !== clubId) continue
    const me = t.get(clubId)!
    out.push(1 + [...t.values()].filter((r) => r !== me && (r.pts > me.pts || (r.pts === me.pts && (r.gd > me.gd || (r.gd === me.gd && r.gf > me.gf))))).length)
  }
  return out
}

function verdictOf(finish: number, size: number, comp: Competition | undefined, won: boolean, tier: number): Verdict {
  const r = comp?.rules || {}
  if (finish === 1) return won || tier <= 1 ? 'Champions' : 'Promoted'
  if (r.promo && finish <= r.promo) return 'Promoted'
  if (r.playoff && finish >= r.playoff[0] && finish <= r.playoff[1]) return 'Play-offs'
  if (r.rele && finish > size - r.rele) return 'Relegated'
  const eu = r.uefa?.[finish - 1]
  if (eu === 'UCL' || (r.ucl && finish <= r.ucl)) return 'Champions League'
  if (eu || ((r.uel || r.uecl) && finish <= (r.ucl || 0) + (r.uel || 0) + (r.uecl || 0))) return 'Europe'
  return finish <= size / 2 ? 'Top half' : 'Survived'
}

/** How far the club got in a knockout competition (or where it finished in a league phase). */
function outcomeOf(w: World, a: SeasonArchive, c: Competition, clubId: number, fx: Fixture[]): Omit<CompRun, 'comp' | 'order'> | undefined {
  if (c.winner === clubId) return { outcome: 'Winners', tone: 'gold' }
  if (!fx.length) return undefined
  const last = fx[fx.length - 1]
  if (c.runnerUp === clubId || /^final$/i.test(last.roundName)) return { outcome: 'Runners-up', tone: 'silver' }
  // a league phase (Champions League and the like) that the club didn't get out of
  const table = a.tables[c.key]
  const knock = /final|round|play-?off|knockout|qualif|leg/i.test(last.roundName)
  if (table && !knock) {
    const pos = table.findIndex((r) => r.clubId === clubId) + 1
    return pos ? { outcome: `League phase · ${ordinalOf(pos)}`, tone: 'bad' } : undefined
  }
  const round = last.roundName.replace(/\s*\(.*\)$/, '').replace(/,? leg \d/i, '')
  return { outcome: /semi/i.test(round) ? 'Semi-finals' : /quarter/i.test(round) ? 'Quarter-finals' : round, tone: /semi/i.test(round) ? 'good' : 'plain' }
}

export function seasonReview(w: World, a: SeasonArchive): Review {
  const clubId = a.userClubId
  const club = w.clubs[clubId]
  const mine = Object.values(w.fixtures)
    .filter((f) => f.played && f.result && (f.home === clubId || f.away === clubId) && seasonOf(f) === a.season && !w.competitions[f.compId]?.intl)
    .sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time))
  const comps = Object.values(w.competitions).filter((c) => c.season === a.season && c.clubs.includes(clubId) && c.format !== 'intl')
  const side = (f: Fixture) => (f.home === clubId ? 0 : 1)
  const forAgainst = (f: Fixture) => { const s = f.result!.score; return side(f) === 0 ? [s[0], s[1]] : [s[1], s[0]] }
  const resOf = (f: Fixture): 'W' | 'D' | 'L' => {
    const [gf, ga] = forAgainst(f)
    if (gf !== ga) return gf > ga ? 'W' : 'L'
    const p = f.result!.pens
    if (!p) return 'D'
    return (side(f) === 0 ? p[0] > p[1] : p[1] > p[0]) ? 'W' : 'L'
  }

  // ---- the league
  const lgKey = Object.keys(a.tables).find((k) => w.leagues[Number(k.replace(/^L/, ''))] && a.tables[k].some((r) => r.clubId === clubId))
    || Object.keys(a.tables).find((k) => a.tables[k].some((r) => r.clubId === clubId))
  let league: Review['league']
  if (lgKey) {
    const table = a.tables[lgKey]
    const finish = a.userFinish || table.findIndex((r) => r.clubId === clubId) + 1
    const comp = comps.find((c) => c.key === lgKey)
    const lg = w.leagues[Number(lgKey.replace(/^L/, ''))]
    const r = comp?.rules || {}
    const row = table[finish - 1]
    league = {
      comp, key: lgKey, row, finish, size: table.length, table,
      verdict: verdictOf(finish, table.length, comp, a.winners[lgKey] === clubId, lg?.level || 1),
      gapAbove: finish > 1 ? table[finish - 2].pts - row.pts : undefined,
      gapBelow: finish < table.length ? row.pts - table[finish].pts : undefined,
      zones: {
        ucl: r.uefa ? r.uefa.filter((x) => x === 'UCL').length : r.ucl || 0,
        uel: r.uefa ? r.uefa.filter((x) => x !== 'UCL').length : (r.uel || 0) + (r.uecl || 0),
        rele: r.rele || 0, promo: r.promo || 0,
      },
    }
  }
  const leagueFx = league?.comp ? mine.filter((f) => f.compId === league!.comp!.id) : []
  const positions = a.userRun || []
  let pts = 0
  const run: RunMatch[] = leagueFx.map((f, i) => {
    const res = resOf(f)
    pts += res === 'W' ? 3 : res === 'D' ? 1 : 0
    const [gf, ga] = forAgainst(f)
    return { res, pts, pos: positions[i], opp: side(f) === 0 ? f.away : f.home, gf, ga, home: side(f) === 0, fixtureId: f.id }
  })

  // ---- the whole season's record and the facts worth retelling
  const record = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0 }
  const home: [number, number, number] = [0, 0, 0], away: [number, number, number] = [0, 0, 0]
  let unbeaten = 0, winStreak = 0, ub = 0, ws = 0, comebacks = 0
  let biggestWin: Highlight | undefined, heaviestDefeat: Highlight | undefined
  for (const f of mine) {
    const [gf, ga] = forAgainst(f)
    const res = resOf(f)
    record.p++; record.gf += gf; record.ga += ga
    if (ga === 0) record.cs++
    record[res === 'W' ? 'w' : res === 'D' ? 'd' : 'l']++
    const hr = side(f) === 0 ? home : away
    hr[res === 'W' ? 0 : res === 'D' ? 1 : 2]++
    ub = res === 'L' ? 0 : ub + 1; unbeaten = Math.max(unbeaten, ub)
    ws = res === 'W' ? ws + 1 : 0; winStreak = Math.max(winStreak, ws)
    const opp = side(f) === 0 ? f.away : f.home
    const hl = { fixture: f, opp, gf, ga, comp: w.competitions[f.compId] }
    if (gf > ga && (!biggestWin || gf - ga > biggestWin.gf - biggestWin.ga || (gf - ga === biggestWin.gf - biggestWin.ga && gf > biggestWin.gf))) biggestWin = hl
    if (ga > gf && (!heaviestDefeat || ga - gf > heaviestDefeat.ga - heaviestDefeat.gf)) heaviestDefeat = hl
    // won from behind: the club trailed at some point (goal events in order) and still won
    if (res === 'W') {
      let me = 0, them = 0, trailed = false
      for (const e of f.result!.events) {
        if (e.type !== 'goal') continue
        if (e.side === side(f)) me++; else them++
        if (them > me) trailed = true
      }
      if (trailed) comebacks++
    }
  }

  // ---- every competition
  const ORDER: Record<string, number> = { league: 0, uefa: 1, cup: 2, supercup: 3, playoff: 4 }
  const compRuns: CompRun[] = []
  for (const c of comps) {
    if (c.format === 'league') {
      if (league?.comp?.id === c.id) compRuns.push({ comp: c, outcome: `${ordinalOf(league.finish)} of ${league.size}`, tone: league.finish === 1 ? 'gold' : league.verdict === 'Relegated' ? 'bad' : league.verdict === 'Champions League' || league.verdict === 'Promoted' ? 'good' : 'plain', order: 0 })
      continue
    }
    const o = outcomeOf(w, a, c, clubId, mine.filter((f) => f.compId === c.id))
    if (o) compRuns.push({ comp: c, ...o, order: ORDER[c.format] ?? 5 })
  }
  compRuns.sort((x, y) => x.order - y.order || x.comp.tier - y.comp.tier)

  // ---- the squad, from every match it played
  const by = new Map<number, SquadLine>()
  const endOfSeason = `${a.season + 1}-06-30`
  for (const f of mine) {
    const s = side(f)
    const conceded = forAgainst(f)[1]
    for (const ps of f.result!.players) {
      if (ps.side !== s || !ps.mins) continue
      const p = w.players[ps.id]
      const name = p?.name || a.people?.[ps.id]?.[0]
      if (!name) continue
      const l = by.get(ps.id) || { id: ps.id, name, pos: p?.positions[0] || a.people?.[ps.id]?.[1] || ps.pos, apps: 0, starts: 0, mins: 0, goals: 0, assists: 0, rating: 0, cs: 0, young: !!p && ageOn(p.dob, endOfSeason) <= 21 }
      l.apps++; if (ps.started) l.starts++
      l.mins += ps.mins; l.goals += ps.goals; l.assists += ps.assists
      l.rating += ps.rating
      if (conceded === 0 && ps.mins >= 60 && (ps.pos === 'GK' || /B$/.test(ps.pos))) l.cs++
      by.set(ps.id, l)
    }
  }
  const squad = [...by.values()].map((l) => ({ ...l, rating: l.apps ? Math.round((l.rating / l.apps) * 100) / 100 : 0 }))
  const regular = Math.max(6, Math.round(record.p * 0.35))
  const pick = (score: (l: SquadLine) => number, ok: (l: SquadLine) => boolean = () => true) => squad.filter(ok).sort((x, y) => score(y) - score(x) || y.mins - x.mins)[0]
  const standout = pick((l) => l.rating, (l) => l.apps >= regular)
  const topScorer = pick((l) => l.goals * 100 - l.mins / 1e4, (l) => l.goals > 0)
  const topCreator = pick((l) => l.assists * 100 - l.mins / 1e4, (l) => l.assists > 0)
  const ironMan = pick((l) => l.mins)
  // a young player who did more than make up the numbers
  const breakout = pick((l) => l.rating + l.mins / 2e4, (l) => l.young && l.apps >= Math.max(6, Math.round(regular / 2)) && l.rating >= 6.75 && l.id !== standout?.id)

  // ---- the board, the league's honours, the window
  const objectives = w.board.objectives.filter((o) => o.season === a.season)
  const awards = a.awards.filter((x) => x.compKey === lgKey)
  const moves = w.transfers.history.filter((t) => t.season === a.season && (t.to === clubId || t.from === clubId) && ['transfer', 'loan', 'free'].includes(t.type))
  const ins = moves.filter((t) => t.to === clubId), outs = moves.filter((t) => t.from === clubId)
  const top = <T extends { fee: number }>(xs: T[]) => [...xs].sort((x, y) => y.fee - x.fee)[0]
  const bi = top(ins), bo = top(outs)
  return {
    season: a.season, club, league,
    trophies: Object.entries(a.winners).filter(([, c]) => c === clubId).map(([key]) => ({ key, comp: comps.find((c) => c.key === key) })),
    record, run,
    facts: { biggestWin, heaviestDefeat, unbeaten, winStreak, comebacks, homeRecord: home, awayRecord: away },
    comps: compRuns, squad, standout, topScorer, topCreator, ironMan, breakout, objectives, awards,
    transfers: {
      in: a.transfersIn ?? ins.length, out: a.transfersOut ?? outs.length,
      spent: ins.reduce((s, t) => s + t.fee, 0), received: outs.reduce((s, t) => s + t.fee, 0),
      biggestIn: bi && bi.fee > 0 ? { name: bi.playerName, fee: bi.fee, from: bi.from } : undefined,
      biggestOut: bo && bo.fee > 0 ? { name: bo.playerName, fee: bo.fee, to: bo.to } : undefined,
    },
  }
}
