// Pitch geometry for the action engine: team-frame coordinates, player positioning, chance quality (xG).
//
// Team frame: x runs 0 (own goal line) → 100 (opponent goal line); y runs 0 → 100 across the pitch where 0 is the
// attacking team's LEFT touchline (so a left winger lives around y≈16). The pitch is 105m × 68m.
// Absolute frame (used for display and stored actions): the home side attacks to the right, y 0 = top of the screen.
// Home: abs = (x, y). Away: abs = (100 - x, 100 - y).

import type { Formation } from '../../domain/constants'

export const PITCH_W = 105
export const PITCH_H = 68

export interface Pt { x: number; y: number }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
export const logit = (p: number) => Math.log(p / (1 - p))

/** Distance in metres between two team-frame points. */
export function metres(a: Pt, b: Pt) {
  const dx = (a.x - b.x) * 1.05, dy = (a.y - b.y) * 0.68
  return Math.sqrt(dx * dx + dy * dy)
}

/** Point seen from the other team's frame. */
export const flip = (p: Pt): Pt => ({ x: 100 - p.x, y: 100 - p.y })

export function toAbs(side: 0 | 1, p: Pt): Pt {
  return side === 0 ? { x: p.x, y: p.y } : { x: 100 - p.x, y: 100 - p.y }
}

export type Zone = 'def' | 'mid' | 'att' | 'box' | 'wide'
export function zoneOf(p: Pt): Zone {
  if (p.x >= 84 && p.y > 20 && p.y < 80) return 'box'
  if (p.x >= 70 && (p.y <= 20 || p.y >= 80)) return 'wide'
  if (p.x >= 62) return 'att'
  if (p.x >= 33) return 'mid'
  return 'def'
}
export const inBox = (p: Pt) => p.x >= 84.3 && p.y >= 20.4 && p.y <= 79.6

/** Goal-mouth angle (radians) subtended from a point. */
function goalAngle(p: Pt) {
  const dx = (100 - p.x) * 1.05
  const dy = (p.y - 50) * 0.68
  const a = Math.atan2(3.66 - dy, dx) + Math.atan2(3.66 + dy, dx)
  return Math.max(0.01, a)
}

/**
 * Pre-shot expected goals for an unpressured shot with the foot from a location. Calibrated to public open-play xG:
 * 6-yard box ≈ 0.55, penalty spot ≈ 0.26, edge of the box ≈ 0.09, 20m ≈ 0.063, 25m ≈ 0.037, 30m ≈ 0.022;
 * tight angles scaled down.
 */
export function baseXg(p: Pt): number {
  const dx = (100 - p.x) * 1.05
  const dy = (p.y - 50) * 0.68
  const d = Math.sqrt(dx * dx + dy * dy)
  const l = d <= 16.5 ? 0.2 - 0.228 * (d - 5.5) : -2.31 - 0.11 * (d - 16.5)
  const central = 2 * Math.atan(3.66 / Math.max(0.5, d))
  const angF = clamp(goalAngle(p) / central, 0.25, 1)
  return clamp(sigmoid(l) * (0.35 + 0.65 * angF), 0.005, 0.8)
}

export interface ShotContext { header?: boolean; oneOnOne?: boolean; counter?: boolean; rebound?: boolean; pressure?: number; cutback?: boolean; setPiece?: boolean; volley?: boolean }

export function chanceXg(p: Pt, c: ShotContext): number {
  let xg = baseXg(p)
  if (c.header) xg *= 0.55
  if (c.volley) xg *= 0.75
  if (c.cutback) xg *= 1.25
  if (c.rebound) xg *= 1.2
  if (c.counter) xg *= 1.1
  if (c.oneOnOne) xg = Math.max(xg, 0.3 + xg * 0.4)
  if (c.pressure) xg *= 1 - clamp(c.pressure, 0, 1) * 0.35
  return clamp(xg, 0.008, 0.85)
}

// ---------------------------------------------------------------- team shape
export interface ShapeInput {
  formation: Formation
  lineHeight: number // 0..100
  width: number // 0..100
  mentality: number // -2..2
  pressing: number
}

/** Rest-shape depth of a formation slot (team frame, before shifting with the ball). */
export function slotDepth(slotY: number, pos: string): number {
  if (pos === 'GK') return 4
  return 6 + slotY * 0.55
}

export interface RoleShift { dx: number; dy: number; dxDef: number; widthMul: number }
const RS_CACHE = new Map<string, RoleShift>()
/** How a role moves off its slot in possession (dx forward, dy toward the centre when positive). */
export function roleShift(role: string, pos: string): RoleShift {
  const key = role + '|' + pos
  const hit = RS_CACHE.get(key)
  if (hit) return hit
  const r = roleShiftRaw(role, pos)
  RS_CACHE.set(key, r)
  return r
}
function roleShiftRaw(role: string, pos: string): RoleShift {
  const r: RoleShift = { dx: 0, dy: 0, dxDef: 0, widthMul: 1 }
  switch (role) {
    case 'Inside Forward': r.dy = 12; r.dx = 3; break
    case 'Winger': r.widthMul = 1.1; break
    case 'Wide Playmaker': r.dy = 10; r.dx = -3; break
    case 'Advanced Forward': r.dx = 4; break
    case 'Poacher': r.dx = 6; r.dxDef = 6; break
    case 'False 9': r.dx = -8; break
    case 'Target Forward': r.dx = 2; break
    case 'Shadow Striker': r.dx = 5; break
    case 'Classic 10': r.dxDef = 4; break
    case 'Box-to-Box': r.dx = 4; break
    case 'Holding': r.dx = -5; r.dxDef = -3; break
    case 'Deep-Lying Playmaker': r.dx = -4; break
    case 'Wingback': r.dx = 10; r.widthMul = 1.08; break
    case 'Attacking Wingback': r.dx = 16; r.widthMul = 1.12; break
    case 'Falseback': r.dy = 18; r.dx = 4; break
    case 'Fullback': r.dx = 5; break
    case 'Ball-Playing Defender': r.dx = 2; break
    case 'Sweeper Keeper': r.dx = 4; break
  }
  if (!role && (pos === 'LB' || pos === 'RB')) r.dx = 6
  return r
}

/**
 * Where a player stands given the team's shape, whether his team has the ball, and where the ball is
 * (ball in the player's team frame). The whole block slides with the ball: in possession it stretches up the pitch,
 * out of possession it compresses behind the ball, and the line height / mentality push the anchor up or down.
 */
export function playerSpot(slotX: number, slotY: number, pos: string, role: string | RoleShift, s: ShapeInput, inPoss: boolean, ball: Pt, jx = 0, jy = 0, out?: Pt): Pt {
  const o = out || { x: 0, y: 0 }
  if (pos === 'GK') {
    o.x = inPoss ? clamp(4 + (ball.x - 30) * 0.14, 2, 20) : clamp(3 + ball.x * 0.07 + (s.lineHeight - 50) / 22, 1.5, 12)
    o.y = 50 + (ball.y - 50) * 0.15
    return o
  }
  const rs = typeof role === 'string' ? roleShift(role, pos) : role
  const rel = slotDepth(slotY, pos) - 16.5 // 0 for centre-backs … ≈36 for a striker
  let x: number, y: number
  if (inPoss) {
    const anchor = ball.x * 0.7 - 2 + (s.lineHeight - 50) / 5 + s.mentality * 3
    // a deep team still keeps its forwards high: the shape stretches when the defenders sit back
    const stretch = 1.05 + s.mentality * 0.04 - Math.max(0, ball.x - 50) / 400 + clamp((22 - anchor) / 45, 0, 0.35)
    x = anchor + rel * stretch + rs.dx
    const spread = 0.8 + s.width / 250
    y = 50 + (slotX - 50) * spread * rs.widthMul
    if (rs.dy) y += slotX < 50 ? rs.dy : slotX > 50 ? -rs.dy : 0
    y += (ball.y - 50) * 0.18
    // attacking the far post: wide attackers come inside when the ball is on the other flank high up the pitch
    if (ball.x > 62 && (pos === 'LW' || pos === 'RW' || pos === 'LM' || pos === 'RM') && (slotX < 50) !== (ball.y < 50) && Math.abs(ball.y - 50) > 12) {
      const k = Math.min(1, (ball.x - 62) / 18)
      y = y + (50 + (slotX < 50 ? -13 : 13) - y) * 0.75 * k
      x += 5 * k
    }
  } else {
    // ball given in our own frame; the opponent attacks toward our goal (x → 0). Line height matters most when the
    // ball is far away; once it is near our box everybody defends the box. The last line never drops onto the goal line.
    const reach = clamp(ball.x / 50, 0.3, 1)
    const anchor = Math.max(ball.x < 18 ? 6.5 : 10.5, ball.x * 0.52 + ((s.lineHeight - 50) / 4 + s.mentality * 1.5) * reach - 1)
    x = anchor + rel * 0.78 + rs.dxDef
    y = 50 + (slotX - 50) * 0.78 + (ball.y - 50) * 0.3
  }
  o.x = clamp(x + jx, 1.5, 97)
  o.y = clamp(y + jy, 2, 98)
  return o
}

// ---------------------------------------------------------------- heatmap
export const HEAT_W = 12
export const HEAT_H = 8
export function heatIndex(p: Pt) {
  const cx = clamp(Math.floor(p.x / (100 / HEAT_W)), 0, HEAT_W - 1)
  const cy = clamp(Math.floor(p.y / (100 / HEAT_H)), 0, HEAT_H - 1)
  return cy * HEAT_W + cx
}
/** Compact heat string: one base-36 digit (0-z) per cell, normalised to the player's busiest cell. */
export function encodeHeat(h: ArrayLike<number>): string {
  let max = 0
  for (let i = 0; i < h.length; i++) if (h[i] > max) max = h[i]
  if (!max) return ''
  let s = ''
  for (let i = 0; i < h.length; i++) s += Math.round((h[i] / max) * 35).toString(36)
  return s
}
export function decodeHeat(s: string | undefined): number[] {
  if (!s) return []
  return [...s].map((c) => parseInt(c, 36) / 35)
}
