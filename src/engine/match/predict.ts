// A calculated pre-match prediction: each side's likely XI rated in the positions it will play, adjusted for form,
// fitness, home advantage and the competition, turned into expected goals and win / draw / loss chances (Poisson).
// Used by the match preview and by Edit Mode's "randomize score".
import type { Fixture, World } from '../../domain/types'
import { posRating } from '../../domain/ratings'
import { formationOf } from '../../domain/constants'
import { sideInput } from '../world/matchRunner'
import { isSuspendedFor } from './selection'
import { clamp, type Rng } from '../../domain/rng'

export interface SideOutlook {
  clubId: number
  /** XI strength in the positions they'll play (≈ player rating scale) */
  xi: number
  /** points from the last five results, −1 … +1 */
  form: number
  /** average match fitness of the XI, 0 … 100 */
  fitness: number
  /** best players left out through injury or suspension */
  missing: number[]
  /** expected goals */
  xg: number
}
export interface Reason { text: string; side: 0 | 1 | -1; weight: number }
export interface Prediction { home: SideOutlook; away: SideOutlook; pHome: number; pDraw: number; pAway: number; likely: [number, number]; reasons: Reason[]; h2h: { w: number; d: number; l: number } }

const poisson = (l: number, k: number) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p }

function outlook(w: World, f: Fixture, side: 0 | 1): Omit<SideOutlook, 'xg'> {
  const id = side ? f.away : f.home
  const club = w.clubs[id]
  const comp = w.competitions[f.compId]
  const inp = sideInput(w, id, comp, id === w.userClubId, w.scripts?.[f.id]?.lineups?.[String(side) as '0' | '1'], f.id)
  const slots = formationOf(inp.sheet.formation).slots
  const xiPlayers = inp.sheet.lineup.map((pid) => inp.players[pid]).filter(Boolean)
  const rated = xiPlayers.map((p, i) => posRating(p, slots[i]?.pos || p.positions[0]))
  const xi = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : club.squadAvg
  const fitness = xiPlayers.length ? xiPlayers.reduce((a, p) => a + (p.fitness ?? 100), 0) / xiPlayers.length : 100
  const recent = (club.recent || []).slice(-5)
  const form = recent.length ? recent.reduce((a, r) => a + (r === 'W' ? 1 : r === 'D' ? 0 : -1), 0) / recent.length : 0
  // the squad's best players who aren't available
  const inXi = new Set(inp.sheet.lineup)
  const squad = Object.values(w.players).filter((p) => p.clubId === id && !club.national)
  const missing = squad.filter((p) => !inXi.has(p.id) && (p.injury || isSuspendedFor(p, comp))).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((p) => p.id)
  return { clubId: id, xi, form, fitness, missing }
}

/** Last five meetings, from the home side's point of view. */
function headToHead(w: World, f: Fixture) {
  const past = Object.values(w.fixtures).filter((x) => x.played && x.result && x.id !== f.id && ((x.home === f.home && x.away === f.away) || (x.home === f.away && x.away === f.home))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const r = { w: 0, d: 0, l: 0 }
  for (const x of past) { const s = x.result!.score; const g = x.home === f.home ? s[0] - s[1] : s[1] - s[0]; if (g > 0) r.w++; else if (g < 0) r.l++; else r.d++ }
  return r
}

export function predictFixture(w: World, f: Fixture): Prediction {
  const h = outlook(w, f, 0), a = outlook(w, f, 1)
  const eff = (o: Omit<SideOutlook, 'xg'>) => o.xi + o.form * 1.6 - Math.max(0, 88 - o.fitness) * 0.12
  const h2h = headToHead(w, f)
  // head-to-head counts, lightly: a side that keeps beating this opponent gets a small edge
  const h2hEdge = clamp((h2h.w - h2h.l) * 0.35, -1.2, 1.2)
  // fitted to the match engine's results (scripts/qa/predict-fit.ts): goals rise ~10% per rating point of edge
  const diff = eff(h) - eff(a) + h2hEdge
  const [bh, ba] = f.neutral ? [1.06, 1.06] : [1.18, 0.94]
  const lh = clamp(bh * Math.exp(diff * 0.094), 0.15, 5)
  const la = clamp(ba * Math.exp(-diff * 0.094), 0.12, 4.6)
  let pH = 0, pD = 0, pA = 0, best = 0, likely: [number, number] = [1, 1]
  for (let i = 0; i <= 9; i++) for (let j = 0; j <= 9; j++) {
    const p = poisson(lh, i) * poisson(la, j)
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p
    if (p > best) { best = p; likely = [i, j] }
  }
  const t = pH + pD + pA
  // why: the factors behind it, biggest first
  const reasons: Reason[] = []
  const hn = w.clubs[f.home]?.short, an = w.clubs[f.away]?.short
  const dx = h.xi - a.xi
  if (Math.abs(dx) >= 0.8) reasons.push({ text: `${dx > 0 ? hn : an}'s likely XI is stronger (${Math.max(h.xi, a.xi).toFixed(1)} v ${Math.min(h.xi, a.xi).toFixed(1)})`, side: dx > 0 ? 0 : 1, weight: Math.abs(dx) })
  else reasons.push({ text: `Two evenly matched XIs (${h.xi.toFixed(1)} v ${a.xi.toFixed(1)})`, side: -1, weight: 0.5 })
  const df = h.form - a.form
  if (Math.abs(df) >= 0.4) reasons.push({ text: `${df > 0 ? hn : an} in better form`, side: df > 0 ? 0 : 1, weight: Math.abs(df) * 1.6 })
  if (!f.neutral) reasons.push({ text: `${hn} at home`, side: 0, weight: 1.2 })
  for (const [o, s] of [[h, 0], [a, 1]] as const) {
    if (o.fitness < 84) reasons.push({ text: `${s ? an : hn} short of fitness (${Math.round(o.fitness)}%)`, side: (1 - s) as 0 | 1, weight: (88 - o.fitness) * 0.12 })
    if (o.missing.length) reasons.push({ text: `${s ? an : hn} without ${o.missing.slice(0, 2).map((id) => w.players[id]?.name.split(' ').pop()).join(' and ')}`, side: (1 - s) as 0 | 1, weight: 0.6 + o.missing.length * 0.2 })
  }
  if (h2h.w + h2h.d + h2h.l >= 2 && Math.abs(h2h.w - h2h.l) >= 2) reasons.push({ text: `${h2h.w > h2h.l ? hn : an} won ${Math.max(h2h.w, h2h.l)} of the last ${h2h.w + h2h.d + h2h.l} meetings`, side: h2h.w > h2h.l ? 0 : 1, weight: Math.abs(h2hEdge) })
  reasons.sort((x, y) => y.weight - x.weight)
  return { home: { ...h, xg: lh }, away: { ...a, xg: la }, pHome: pH / t, pDraw: pD / t, pAway: pA / t, likely, reasons, h2h }
}

/** A plausible score for the fixture, drawn from the prediction (the stronger side usually, not always, wins). */
export function plausibleScore(w: World, f: Fixture, rng: Rng): [number, number] {
  const pr = predictFixture(w, f)
  const draw = (l: number) => { let k = 0, p = Math.exp(-l), s = p; const u = rng.next(); while (u > s && k < 9) { k++; p *= l / k; s += p } return k }
  return [draw(pr.home.xg), draw(pr.away.xg)]
}
