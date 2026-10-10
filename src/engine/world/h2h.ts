// Head to head between two clubs, from the meetings the career has kept (every match the manager's side played, so
// these are the meetings of his time in the game; nothing from before it is invented). Read from the first club's
// side, which on a match preview is the home side.
import type { Fixture, World } from '../../domain/types'
import { seasonLabel } from '../../domain/dates'
import { callName } from '../match/commentary'

export interface Meeting { f: Fixture; a: number; b: number; res: 'A' | 'D' | 'B'; season: number }
export interface H2HData {
  meetings: Meeting[] // newest first
  a: { w: number; gf: number; big?: Meeting }
  b: { w: number; gf: number; big?: Meeting }
  d: number
  /** at the first club's ground, from its side */
  atA: { w: number; d: number; l: number }
  /** both clubs scored */
  btts: number
  scorers: { id: number; goals: number; side: 'a' | 'b' }[]
  /** sentences that say something, from these meetings only */
  notes: string[]
  /** league finishes in the seasons the archive kept, when the two shared a league */
  seasons: { season: number; label: string; league: string; a: number; b: number; aPts: number; bPts: number }[]
}

export function headToHead(w: World, a: number, b: number): H2HData {
  const meetings: Meeting[] = Object.values(w.fixtures)
    .filter((f) => f.played && f.result && ((f.home === a && f.away === b) || (f.home === b && f.away === a)))
    .sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time))
    .map((f) => {
      const ga = f.home === a ? f.result!.score[0] : f.result!.score[1], gb = f.home === a ? f.result!.score[1] : f.result!.score[0]
      // a tie settled on penalties counts as the draw it was over the match
      return { f, a: ga, b: gb, res: ga > gb ? 'A' : ga < gb ? 'B' : 'D', season: w.competitions[f.compId]?.season ?? +f.date.slice(0, 4) } as Meeting
    })
  const out: H2HData = { meetings, a: { w: 0, gf: 0 }, b: { w: 0, gf: 0 }, d: 0, atA: { w: 0, d: 0, l: 0 }, btts: 0, scorers: [], notes: [], seasons: [] }
  const goals = new Map<number, { goals: number; side: 'a' | 'b' }>()
  for (const m of meetings) {
    out.a.gf += m.a; out.b.gf += m.b
    if (m.res === 'A') out.a.w++; else if (m.res === 'B') out.b.w++; else out.d++
    if (m.a > 0 && m.b > 0) out.btts++
    const margin = m.a - m.b
    if (margin > 0 && (!out.a.big || margin > out.a.big.a - out.a.big.b)) out.a.big = m
    if (margin < 0 && (!out.b.big || -margin > out.b.big.b - out.b.big.a)) out.b.big = m
    if (m.f.home === a) { if (m.res === 'A') out.atA.w++; else if (m.res === 'D') out.atA.d++; else out.atA.l++ }
    for (const e of m.f.result!.events) {
      if ((e.type !== 'goal' && e.type !== 'penGoal') || !e.player) continue
      const side = (e.side === 0) === (m.f.home === a) ? 'a' : 'b'
      const g = goals.get(e.player) || { goals: 0, side }
      g.goals++
      goals.set(e.player, g)
    }
  }
  out.scorers = [...goals.entries()].map(([id, g]) => ({ id, ...g })).filter((x) => w.players[x.id]).sort((x, y) => y.goals - x.goals).slice(0, 4)

  const A = w.clubs[a]?.short || '', B = w.clubs[b]?.short || ''
  const n = meetings.length
  if (n) {
    // a run: the same kind of result (or the same side unbeaten) from the latest meeting back
    const unbeaten = (side: 'A' | 'B') => { let k = 0; for (const m of meetings) { if (m.res === (side === 'A' ? 'B' : 'A')) break; k++ } return k }
    const wins = (side: 'A' | 'B') => { let k = 0; for (const m of meetings) { if (m.res !== side) break; k++ } return k }
    const wa = wins('A'), wb = wins('B'), ua = unbeaten('A'), ub = unbeaten('B')
    if (n >= 2 && (wa === n || wb === n)) out.notes.push(`${wa === n ? A : B} have won every meeting so far (${n}).`)
    else if (wa >= 2 || wb >= 2) out.notes.push(`${wa >= 2 ? A : B} have won the last ${wa >= 2 ? wa : wb}.`)
    else if (ua >= 3 || ub >= 3) out.notes.push(`${ua >= 3 ? A : B} are unbeaten in the last ${ua >= 3 ? ua : ub}.`)
    const atG = out.atA.w + out.atA.d + out.atA.l
    if (atG >= 2) out.notes.push(out.atA.l === 0 ? `${B} have never won away to ${A} (${atG} visits).` : out.atA.w === 0 ? `${A} have never beaten ${B} at home (${atG} meetings).` : `At ${A}'s ground: ${out.atA.w}W ${out.atA.d}D ${out.atA.l}L for ${A}.`)
    if (n >= 3) out.notes.push(`${((out.a.gf + out.b.gf) / n).toFixed(1)} goals a game; both scored in ${out.btts} of ${n}.`)
    const top = out.scorers[0]
    if (top && top.goals >= 2) out.notes.push(`${callName(w.players[top.id].name)} has ${top.goals} goals in these meetings.`)
  }

  // the seasons the archive kept, where both finished in the same league table
  for (const ar of [...(w.archive || [])].sort((x, y) => y.season - x.season)) {
    for (const [key, rows] of Object.entries(ar.tables)) {
      if (!key.startsWith('L')) continue
      const ia = rows.findIndex((r) => r.clubId === a), ib = rows.findIndex((r) => r.clubId === b)
      if (ia < 0 || ib < 0) continue
      out.seasons.push({ season: ar.season, label: seasonLabel(ar.season), league: w.leagues[+key.slice(1)]?.name || 'League', a: ia + 1, b: ib + 1, aPts: rows[ia].pts, bPts: rows[ib].pts })
      break
    }
  }
  return out
}
