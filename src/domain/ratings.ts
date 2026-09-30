import { A } from './types'
import type { AttrKey, MoraleLevel, Player, Position, PosGroup } from './types'
import { FACE_WEIGHTS, POS_GROUP, POS_SIMILARITY, POS_WEIGHT_KEY, RATING_WEIGHTS, ROLE_GROUP, ROLES } from './constants'
import { ageOn } from './dates'

export function attr(p: Player, k: AttrKey): number {
  return p.attrs[A[k]]
}

const weightCache: Record<string, [number, number][]> = {}
function weightsFor(key: string): [number, number][] {
  if (!weightCache[key]) {
    const w = RATING_WEIGHTS[key]
    weightCache[key] = Object.entries(w).map(([k, v]) => [A[k as AttrKey], v as number])
  }
  return weightCache[key]
}

/** Raw formula rating at a position (without calibration). */
export function rawPosRating(attrs: number[], pos: Position): number {
  const ws = weightsFor(POS_WEIGHT_KEY[pos])
  let s = 0, t = 0
  for (const [i, w] of ws) { s += attrs[i] * w; t += w }
  return s / t
}

/** Rating of a player at a given position (calibrated to EA overall at their best position). */
export function posRating(p: Player, pos: Position): number {
  let r = rawPosRating(p.attrs, pos) + p.ovrAdj
  if (!p.positions.includes(pos)) {
    const sim = similarity(p.positions[0], pos)
    // out of position: EA-style familiarity penalty on top of attribute mismatch
    r -= (1 - sim) * 6 + (sim < 0.9 ? 1.5 : 0)
  }
  return Math.max(1, Math.min(99, Math.round(r)))
}

export function similarity(a: Position, b: Position): number {
  if (a === b) return 1
  if (a === 'GK' || b === 'GK') return 0
  return POS_SIMILARITY[a]?.[b] ?? POS_SIMILARITY[b]?.[a] ?? 0.25
}

export function computeOvr(p: Player): number {
  return Math.max(1, Math.min(99, Math.round(rawPosRating(p.attrs, p.positions[0]) + p.ovrAdj)))
}

export function bestPosition(p: Player): Position {
  let best = p.positions[0], br = -1
  for (const pos of p.positions) {
    const r = posRating(p, pos)
    if (r > br) { br = r; best = pos }
  }
  return best
}

export function faceStats(p: Player): { key: string; value: number }[] {
  if (p.positions[0] === 'GK') {
    return [
      { key: 'DIV', value: p.attrs[A.gkDiving] }, { key: 'HAN', value: p.attrs[A.gkHandling] },
      { key: 'KIC', value: p.attrs[A.gkKicking] }, { key: 'REF', value: p.attrs[A.gkReflexes] },
      { key: 'SPD', value: Math.round(p.attrs[A.acceleration] * 0.45 + p.attrs[A.sprintSpeed] * 0.55) },
      { key: 'POS', value: p.attrs[A.gkPositioning] },
    ]
  }
  return Object.entries(FACE_WEIGHTS).map(([key, ws]) => ({
    key, value: Math.round(ws.reduce((s, [k, w]) => s + p.attrs[A[k]] * w, 0)),
  }))
}

export const group = (p: Player): PosGroup => POS_GROUP[p.positions[0]]
export const age = (p: Player, on: string) => ageOn(p.dob, on)

/** The morale face: smile when happy, flat when content, frown when unhappy. */
export const moraleIcon = (m: number) => (m >= 68 ? 'morale' : m >= 45 ? 'moraleMid' : 'moraleLow')
export const moraleColor = (m: number) => (m >= 68 ? 'var(--pos)' : m >= 45 ? '#c9d36a' : m >= 25 ? 'var(--warn)' : 'var(--neg)')

export function moraleLevel(m: number): MoraleLevel {
  if (m >= 85) return 'Very Happy'
  if (m >= 68) return 'Happy'
  if (m >= 45) return 'Content'
  if (m >= 25) return 'Unhappy'
  return 'Very Unhappy'
}

export function formValue(p: Player): number {
  if (!p.formRatings.length) return 6.5
  const r = p.formRatings
  let s = 0, w = 0
  r.forEach((v, i) => { const ww = 1 + i * 0.35; s += v * ww; w += ww })
  return s / w
}
export function formLabel(p: Player): 'Excellent' | 'Good' | 'Average' | 'Poor' | 'Terrible' {
  const f = formValue(p)
  if (f >= 7.6) return 'Excellent'
  if (f >= 7.0) return 'Good'
  if (f >= 6.3) return 'Average'
  if (f >= 5.8) return 'Poor'
  return 'Terrible'
}

/** Role suitability (0..1) and EA style '++' / '+' marks. */
export function roleFit(p: Player, pos: Position, roleName: string): { score: number; mark: '' | '+' | '++' } {
  const defs = ROLES[ROLE_GROUP[pos]] || []
  const def = defs.find((d) => d.name === roleName)
  if (!def) return { score: 0.5, mark: '' }
  let s = 0, t = 0
  for (const [k, w] of Object.entries(def.key)) { s += p.attrs[A[k as AttrKey]] * (w as number); t += w as number }
  const avg = s / Math.max(1, t)
  const base = posRating(p, pos)
  const score = Math.max(0, Math.min(1, (avg - 45) / 45))
  const mark = avg >= base + 4 && avg >= 75 ? '++' : avg >= base - 1 && avg >= 68 ? '+' : ''
  return { score, mark }
}

export function bestRole(p: Player, pos: Position): string {
  const defs = ROLES[ROLE_GROUP[pos]] || []
  let best = defs[0]?.name || '', bs = -1
  for (const d of defs) {
    const f = roleFit(p, pos, d.name)
    if (f.score > bs) { bs = f.score; best = d.name }
  }
  return best
}

export function ovrColor(ovr: number): string {
  if (ovr >= 85) return '#F9D34A'
  if (ovr >= 80) return '#E7C45C'
  if (ovr >= 75) return '#C9D1DB'
  if (ovr >= 70) return '#B0B9C4'
  if (ovr >= 65) return '#C9905A'
  return '#9A7457'
}
