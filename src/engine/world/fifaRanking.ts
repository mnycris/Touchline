// The world ranking, the way FIFA has computed it since 2018 ("SUM"): every match moves points by
// importance × (result − expected result), the expectation from the ranking gap (Elo, 600 scale). Friendlies count
// little, finals-tournament knockouts a lot; a finals-tournament knockout defeat costs nothing; a shoot-out counts
// as 0.75 for the winner and 0.5 for the loser. Published after each international window, with movement against
// the previous publication.
import type { Competition, Fixture, MatchResult, World } from '../../domain/types'

const TOURNAMENTS = new Set(['EURO', 'CA', 'AFCON', 'ASIAN', 'GOLD'])

/** Starting points from a nation's strength (only when a ranking is first created). */
const seedPoints = (avg: number) => Math.round(1150 + (avg - 70) * 48)

export function ensureRanking(w: World) {
  if (!w.intl || w.intl.fifa) return
  const pts: Record<number, number> = {}
  for (const id of Object.values(w.intl.nt)) { const c = w.clubs[id]; if (c) pts[id] = seedPoints(c.squadAvg) }
  const pub = { rank: ranksOf(pts), pts: { ...pts } }
  w.intl.fifa = { pts, pub, prev: pub, date: w.date, published: 0 }
}

function ranksOf(pts: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {}
  Object.entries(pts).sort((a, b) => b[1] - a[1]).forEach(([id], i) => { out[Number(id)] = i + 1 })
  return out
}

/** FIFA's match importance for a fixture. */
export function importanceOf(comp: Competition | undefined, f: Fixture): number {
  if (!comp) return 10
  const late = /quarter|semi|final|third/i.test(f.roundName)
  if (comp.key === 'WC') return late ? 60 : 50
  if (TOURNAMENTS.has(comp.key)) return late ? 40 : 35
  if (comp.key === 'UNL') return f.roundId ? 25 : 15
  if (comp.intl?.kind === 'groups') return 25 // qualifiers
  return 10 // friendlies in the international windows
}

export function rankingAfterMatch(w: World, f: Fixture, r: MatchResult) {
  ensureRanking(w)
  const F = w.intl?.fifa
  if (!F || F.pts[f.home] == null || F.pts[f.away] == null) return
  const comp = w.competitions[f.compId]
  const I = importanceOf(comp, f)
  const [a, b] = r.score
  let W = a > b ? 1 : a < b ? 0 : 0.5
  if (r.pens) W = r.pens[0] > r.pens[1] ? 0.75 : 0.5
  const We = 1 / (Math.pow(10, -(F.pts[f.home] - F.pts[f.away]) / 600) + 1)
  let dh = I * (W - We)
  let da = I * ((r.pens ? (r.pens[1] > r.pens[0] ? 0.75 : 0.5) : 1 - W) - (1 - We))
  // a knockout defeat at a finals tournament doesn't cost points
  const ko = !!f.roundId && (comp?.key === 'WC' || TOURNAMENTS.has(comp?.key || ''))
  if (ko) { dh = Math.max(0, dh); da = Math.max(0, da) }
  F.pts[f.home] = Math.round((F.pts[f.home] + dh) * 100) / 100
  F.pts[f.away] = Math.round((F.pts[f.away] + da) * 100) / 100
  F.dirty = true
}

/** After a window: publish the new order (movement is against the last publication). */
export function maybePublish(w: World) {
  const F = w.intl?.fifa
  if (!F?.dirty) return
  const soon = Object.values(w.fixtures).some((f) => !f.played && f.date >= w.date && f.date <= addDaysISO(w.date, 6) && w.clubs[f.home]?.national)
  if (soon) return
  F.prev = F.pub
  F.pub = { rank: ranksOf(F.pts), pts: { ...F.pts } }
  F.date = w.date
  F.dirty = false
  F.published = (F.published || 0) + 1
}

function addDaysISO(d: string, n: number) { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

export interface RankRow { id: number; rank: number; pts: number; move: number; delta: number; live: number }
/** The published ranking: rank, points, places moved and points gained since the previous one, and what has
 *  changed live since (matches played after publication). */
export function rankingTable(w: World): RankRow[] {
  const F = w.intl?.fifa
  if (!F) return []
  return Object.keys(F.pub.rank).map(Number).filter((id) => w.clubs[id]).map((id) => ({
    id, rank: F.pub.rank[id], pts: F.pub.pts[id], move: (F.prev.rank[id] ?? F.pub.rank[id]) - F.pub.rank[id],
    delta: Math.round((F.pub.pts[id] - (F.prev.pts[id] ?? F.pub.pts[id])) * 100) / 100, live: Math.round(((F.pts[id] ?? F.pub.pts[id]) - F.pub.pts[id]) * 100) / 100,
  })).sort((a, b) => a.rank - b.rank)
}
