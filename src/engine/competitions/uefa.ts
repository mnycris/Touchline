import type { Competition, Fixture, ISODate, World } from '../../domain/types'
import { Rng } from '../../domain/rng'
import { addDays } from '../../domain/dates'
import { ClubDateIndex, findDate, type SeasonDates } from './calendar'
import { newFixture } from './fixtures'
import { emptyRow, sortTable } from './tables'
import { tieWinner } from './cups'

export const UEFA_META: Record<string, { name: string; short: string; matches: number; ko: string; lp: string; finalVenue?: string; tier: number }> = {
  UCL: { name: 'UEFA Champions League', short: 'Champions League', matches: 8, ko: 'uclKO', lp: 'uclLP', finalVenue: 'Riyadh Air Metropolitano, Madrid', tier: 1 },
  UEL: { name: 'UEFA Europa League', short: 'Europa League', matches: 8, ko: 'uelKO', lp: 'uelLP', finalVenue: 'Tüpraş Stadyumu, Istanbul', tier: 2 },
  UECL: { name: 'UEFA Conference League', short: 'Conference League', matches: 6, ko: 'ueclKO', lp: 'ueclLP', tier: 3 },
}

type Edge = [number, number]

/**
 * Swiss-model draw: `perPot` opponents from each pot, no same-country opponents, max 2 from any country.
 * Edges come out as [home, away]: with two opponents per pot (Champions League, Europa League) each club plays one
 * of them at home and one away, so every club has four home and four away games.
 */
function swissGraph(w: World, pots: number[][], perPot: number, rng: Rng): Edge[] | null {
  const country = (c: number) => w.clubs[c]?.country || String(c)
  for (let attempt = 0; attempt < 400; attempt++) {
    const edges: Edge[] = []
    const opp = new Map<number, number[]>()
    const add = (a: number, b: number) => {
      edges.push([a, b])
      opp.set(a, [...(opp.get(a) || []), b]); opp.set(b, [...(opp.get(b) || []), a])
    }
    let failed = false
    for (let i = 0; i < pots.length && !failed; i++) {
      for (let j = i; j < pots.length && !failed; j++) {
        const A = pots[i], B = pots[j]
        if (i === j) {
          // perPot opponents inside the same pot
          if (perPot === 2) {
            // random cycle cover without 2-cycles: a single random Hamiltonian cycle
            let ok = false
            for (let t = 0; t < 200 && !ok; t++) {
              const order = rng.shuffle([...A])
              ok = order.every((c, k) => country(c) !== country(order[(k + 1) % order.length]))
              // round the cycle: each club hosts the next one and visits the previous one
              if (ok) order.forEach((c, k) => add(c, order[(k + 1) % order.length]))
            }
            if (!ok) failed = true
          } else {
            let ok = false
            for (let t = 0; t < 200 && !ok; t++) {
              const order = rng.shuffle([...A])
              ok = true
              for (let k = 0; k < order.length; k += 2) if (country(order[k]) === country(order[k + 1])) ok = false
              if (ok) for (let k = 0; k < order.length; k += 2) add(order[k], order[k + 1])
            }
            if (!ok) failed = true
          }
        } else {
          const used: Map<number, number>[] = []
          for (let m = 0; m < perPot && !failed; m++) {
            let ok = false
            for (let t = 0; t < 300 && !ok; t++) {
              const perm = rng.shuffle([...B])
              ok = A.every((a, k) => country(a) !== country(perm[k]) && !used.some((u) => u.get(a) === perm[k]))
              if (ok) {
                const mm = new Map<number, number>()
                // the first opponent from this pot comes to A, A goes to the second (and the reverse for B)
                A.forEach((a, k) => { if (m % 2 === 0) add(a, perm[k]); else add(perm[k], a); mm.set(a, perm[k]) })
                used.push(mm)
              }
            }
            if (!ok) failed = true
          }
        }
      }
    }
    if (failed) continue
    // max two opponents from the same country
    let okCountry = true
    for (const [c, list] of opp) {
      const cnt: Record<string, number> = {}
      for (const o of list) { cnt[country(o)] = (cnt[country(o)] || 0) + 1; if (cnt[country(o)] > 2) okCountry = false }
      if (!okCountry) break
      void c
    }
    if (!okCountry && attempt < 300) continue
    return edges
  }
  return null
}

/** Split a regular graph's edges into `rounds` perfect matchings (matchdays). */
function factorize(nodes: number[], edges: Edge[], rounds: number, rng: Rng): Edge[][] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const remaining = new Map<number, Set<number>>()
    for (const n of nodes) remaining.set(n, new Set())
    for (const [a, b] of edges) { remaining.get(a)!.add(b); remaining.get(b)!.add(a) }
    const days: Edge[][] = []
    let ok = true
    for (let r = 0; r < rounds && ok; r++) {
      const matching = perfectMatching(nodes, remaining, rng)
      if (!matching) { ok = false; break }
      for (const [a, b] of matching) { remaining.get(a)!.delete(b); remaining.get(b)!.delete(a) }
      days.push(matching)
    }
    if (ok) return days
  }
  return null
}

function perfectMatching(nodes: number[], adj: Map<number, Set<number>>, rng: Rng): Edge[] | null {
  const matched = new Set<number>()
  const out: Edge[] = []
  let steps = 0
  const solve = (): boolean => {
    if (++steps > 20000) return false
    // choose unmatched node with fewest options
    let best: number | undefined, bestOpts: number[] = []
    for (const n of nodes) {
      if (matched.has(n)) continue
      const opts = [...adj.get(n)!].filter((m) => !matched.has(m))
      if (best === undefined || opts.length < bestOpts.length) { best = n; bestOpts = opts }
      if (opts.length === 0) return false
    }
    if (best === undefined) return true
    rng.shuffle(bestOpts)
    for (const m of bestOpts) {
      matched.add(best); matched.add(m); out.push([best, m])
      if (solve()) return true
      out.pop(); matched.delete(best); matched.delete(m)
    }
    return false
  }
  return solve() ? out : null
}

/** Orient edges so every club has as many home as away games: walk Euler circuits of the (even-degree) graph and
 *  give each edge the direction it is walked in. Used when the draw itself doesn't fix venues (Conference League). */
function eulerOrient(nodes: number[], edges: Edge[], rng: Rng): Edge[] {
  const adj = new Map<number, number[]>()
  nodes.forEach((n) => adj.set(n, []))
  edges.forEach(([a, b], i) => { adj.get(a)!.push(i); adj.get(b)!.push(i) })
  const used = new Array(edges.length).fill(false)
  const out: Edge[] = []
  for (const start of rng.shuffle([...nodes])) {
    const stack = [start]
    while (stack.length) {
      const v = stack[stack.length - 1]
      const list = adj.get(v)!
      while (list.length && used[list[list.length - 1]]) list.pop()
      if (!list.length) { stack.pop(); continue }
      const e = list.pop()!
      used[e] = true
      const [a, b] = edges[e]
      const to = a === v ? b : a
      out.push([v, to])
      stack.push(to)
    }
  }
  return out
}

/** Put each matchday's pairs the right way round, from the draw's [home, away] edges. */
function orientDays(days: Edge[][], oriented: Edge[]): Edge[][] {
  const home = new Map<string, number>()
  for (const [h, a] of oriented) home.set(h < a ? `${h}-${a}` : `${a}-${h}`, h)
  return days.map((day) => day.map(([a, b]) => { const h = home.get(a < b ? `${a}-${b}` : `${b}-${a}`); return (h === b ? [b, a] : [a, b]) as Edge }))
}

export function createUefaCompetition(w: World, key: 'UCL' | 'UEL' | 'UECL', season: number, pots: number[][], dates: SeasonDates, rng: Rng, idx: ClubDateIndex): Competition {
  const meta = UEFA_META[key]
  const clubs = pots.flat()
  const comp: Competition = {
    id: `${key}-${season}`, key, name: meta.name, short: meta.short, format: 'uefa', season, country: 'Europe', tier: meta.tier,
    clubs, fixtures: [], rounds: [], status: 'upcoming', logoKey: key,
    table: clubs.map((c) => emptyRow(c)),
    rules: { lp: { direct: 8, playoff: [9, 24] }, extraTime: true, penalties: true },
    groups: Object.fromEntries(pots.map((p, i) => [`Pot ${i + 1}`, p])),
  }
  w.competitions[comp.id] = comp
  const perPot = meta.matches / pots.length // UCL/UEL: 8/4 = 2, UECL: 6/6 = 1
  const graph = swissGraph(w, pots, perPot, rng)
  const lpDates: ISODate[] = (dates as any)[meta.lp]
  let days = graph ? factorize(clubs, graph, meta.matches, rng) : null
  if (!days) {
    // extremely unlikely fallback: plain round robin slices
    days = []
    const order = rng.shuffle([...clubs])
    for (let r = 0; r < meta.matches; r++) {
      const day: Edge[] = []
      for (let i = 0; i < order.length / 2; i++) day.push([order[(i + r) % order.length], order[(order.length - 1 - i + r) % order.length]])
      days.push(day)
    }
  }
  days = orientDays(days, graph && perPot === 2 ? graph : eulerOrient(clubs, graph || days.flat(), rng))
  days.forEach((day, r) => {
    const base = lpDates[r]
    day.forEach(([h, a], i) => {
      // split each matchday across two nights (UCL Tue/Wed, UEL/UECL Thu)
      const d = key === 'UCL' ? addDays(base, i % 2) : base
      const time = key === 'UCL' ? (i % 6 === 0 ? '18:45' : '21:00') : (i % 2 ? '18:45' : '21:00')
      newFixture(w, comp, h, a, d, time, `League phase · MD${r + 1}`, { importance: 2 })
      idx.add(h, d); idx.add(a, d)
    })
  })
  const ko: ISODate[] = (dates as any)[meta.ko]
  comp.rounds = [
    { id: `${key}-${season}-KPO`, name: 'Knockout play-offs', legs: 2, date: ko[0], date2: ko[1], fixtures: [], drawn: false },
    { id: `${key}-${season}-R16`, name: 'Round of 16', legs: 2, date: ko[2], date2: ko[3], fixtures: [], drawn: false },
    { id: `${key}-${season}-QF`, name: 'Quarter-finals', legs: 2, date: ko[4], date2: ko[5], fixtures: [], drawn: false },
    { id: `${key}-${season}-SF`, name: 'Semi-finals', legs: 2, date: ko[6], date2: ko[7], fixtures: [], drawn: false },
    { id: `${key}-${season}-F`, name: 'Final', legs: 1, date: ko[8], fixtures: [], drawn: false, neutral: true, venueName: meta.finalVenue },
  ]
  comp.status = 'active'
  return comp
}

export function leaguePhaseComplete(w: World, comp: Competition): boolean {
  return comp.fixtures.filter((id) => w.fixtures[id].roundName.startsWith('League phase')).every((id) => w.fixtures[id].played)
}

/** Seeded bracket (2024+ format): 9/10 v 23/24 ... then R16 seeds 1..8 meet play-off winners. */
export function drawUefaKnockouts(w: World, comp: Competition, stage: number, rng: Rng, idx: ClubDateIndex) {
  const round = comp.rounds[stage]
  if (round.drawn) return
  const table = sortTable(w, comp)
  const ids = table.map((r) => r.clubId)
  let pairs: [number, number][] = [] // [seeded (2nd leg home), unseeded]
  if (stage === 0) {
    // 9-10 v 23-24, 11-12 v 21-22, 13-14 v 19-20, 15-16 v 17-18
    const pairsPos: [number, number][] = [[9, 24], [10, 23], [11, 22], [12, 21], [13, 20], [14, 19], [15, 18], [16, 17]]
    // UEFA draws between the pairs of pots; randomise within each pair block
    for (let b = 0; b < 4; b++) {
      const seeds = [pairsPos[2 * b][0], pairsPos[2 * b + 1][0]]
      const uns = rng.shuffle([pairsPos[2 * b][1], pairsPos[2 * b + 1][1]])
      pairs.push([ids[seeds[0] - 1], ids[uns[0] - 1]], [ids[seeds[1] - 1], ids[uns[1] - 1]])
    }
  } else if (stage === 1) {
    const kpo = comp.rounds[0]
    const winners = kpo.fixtures.map((id) => w.fixtures[id]).filter((f) => f.leg === 2)
      .map((f) => tieWinner(w, kpo.fixtures.map((x) => w.fixtures[x]).filter((x) => x.tieId === f.tieId))!)
    // bracket: seeds 1-2 face winners of 15/16 v 17/18 ties, 3-4 face 13/14 v 19/20 ... (random within pair)
    const winnerByTie = new Map<string, number>()
    kpo.fixtures.forEach((id) => {
      const f = w.fixtures[id]
      if (f.leg === 2) winnerByTie.set(f.tieId!, tieWinner(w, kpo.fixtures.map((x) => w.fixtures[x]).filter((x) => x.tieId === f.tieId))!)
    })
    const tieOrder = kpo.fixtures.map((id) => w.fixtures[id]).filter((f) => f.leg === 2).map((f) => f.tieId!)
    const wins = tieOrder.map((t) => winnerByTie.get(t)!)
    const blocks = [[6, 7], [4, 5], [2, 3], [0, 1]]
    for (let b = 0; b < 4; b++) {
      const seeds = [ids[2 * b], ids[2 * b + 1]]
      const opp = rng.shuffle([wins[blocks[b][0]], wins[blocks[b][1]]])
      pairs.push([seeds[0], opp[0]], [seeds[1], opp[1]])
    }
    // bracket order so seeds 1 and 2 are in opposite halves: (1,8),(4,5) | (2,7),(3,6)
    pairs = [0, 7, 3, 4, 1, 6, 2, 5].map((k) => pairs[k])
    void winners
  } else {
    const prev = comp.rounds[stage - 1]
    const ties = prev.fixtures.map((id) => w.fixtures[id]).filter((f) => f.leg === 2 || prev.legs === 1)
    const wins = ties.map((f) => tieWinner(w, prev.fixtures.map((x) => w.fixtures[x]).filter((x) => x.tieId === f.tieId))!)
    for (let i = 0; i < wins.length; i += 2) {
      // better league-phase ranking hosts the second leg
      const a = wins[i], b = wins[i + 1]
      pairs.push(ids.indexOf(a) < ids.indexOf(b) ? [a, b] : [b, a])
    }
  }
  round.pool = pairs.flat()
  round.winners = []
  round.drawn = true
  pairs.forEach(([seed, other], i) => {
    const tieId = `${round.id}:T${i + 1}`
    if (round.legs === 2) {
      const d1 = findDate(idx, other, seed, round.date, { gap: 1, window: 3 })
      const f1 = newFixture(w, comp, other, seed, d1, '21:00', round.name, { roundId: round.id, tieId, leg: 1, importance: 3 })
      const d2 = findDate(idx, seed, other, round.date2!, { gap: 1, window: 3 })
      const f2 = newFixture(w, comp, seed, other, d2, '21:00', round.name, { roundId: round.id, tieId, leg: 2, importance: 3 })
      round.fixtures.push(f1.id, f2.id)
      idx.add(seed, d1); idx.add(other, d1); idx.add(seed, d2); idx.add(other, d2)
    } else {
      const f = newFixture(w, comp, seed, other, round.date, comp.key === 'UCL' ? '21:00' : '21:00', 'Final',
        { roundId: round.id, tieId, neutral: true, venue: round.venueName, importance: 5 })
      round.fixtures.push(f.id)
    }
  })
}

export function advanceUefa(w: World, comp: Competition, f: Fixture, rng: Rng, idx: ClubDateIndex): { stageDrawn?: string; champion?: number } {
  if (!f.roundId) {
    if (leaguePhaseComplete(w, comp) && !comp.rounds[0].drawn) {
      drawUefaKnockouts(w, comp, 0, rng, idx)
      return { stageDrawn: comp.rounds[0].name }
    }
    return {}
  }
  const ri = comp.rounds.findIndex((r) => r.id === f.roundId)
  const round = comp.rounds[ri]
  const tie = round.fixtures.map((id) => w.fixtures[id]).filter((x) => x.tieId === f.tieId)
  const win = tieWinner(w, tie)
  if (win !== undefined && !round.winners!.includes(win)) round.winners!.push(win)
  if (!round.fixtures.every((id) => w.fixtures[id].played)) return {}
  if (ri === comp.rounds.length - 1) {
    comp.winner = round.winners![0]
    comp.runnerUp = f.home === comp.winner ? f.away : f.home
    comp.status = 'finished'
    return { champion: comp.winner }
  }
  drawUefaKnockouts(w, comp, ri + 1, rng, idx)
  return { stageDrawn: comp.rounds[ri + 1].name }
}
