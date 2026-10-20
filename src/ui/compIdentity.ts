// Visual identities for the most prestigious competitions: each its own colours and a quiet pattern, inside the same
// app (same type, same cards, same spacing). An adaptation of each competition's colour system, not a copy of its
// artwork: the Champions League's night blue with a slow sweep of light (after UEFA's "kick of light" concept), the
// Europa League's orange, the Premier League's purple and green, and so on. Every other competition keeps the
// standard presentation.
import type { CSSProperties } from 'react'

export type CompPattern = 'starball' | 'chevron' | 'grid' | 'stripes' | 'rays' | 'waves'
export interface CompIdentity { a: string; b: string; accent: string; pattern: CompPattern; motion?: boolean }

const ID: Record<string, CompIdentity> = {
  UCL: { a: '#0c1a55', b: '#030820', accent: '#c9d5ff', pattern: 'starball', motion: true },
  UEL: { a: '#2b1302', b: '#0c0602', accent: '#ff7a1a', pattern: 'chevron' },
  UECL: { a: '#05301b', b: '#020e08', accent: '#2df28c', pattern: 'grid' },
  L13: { a: '#37003c', b: '#120016', accent: '#00ff85', pattern: 'stripes' },
  L53: { a: '#3b0b0a', b: '#120404', accent: '#ff5148', pattern: 'rays' },
  L19: { a: '#3a0507', b: '#110203', accent: '#ff3b47', pattern: 'stripes' },
  L31: { a: '#061a52', b: '#02081a', accent: '#36d3ff', pattern: 'waves' },
  L16: { a: '#141a0d', b: '#06080a', accent: '#d9ff40', pattern: 'grid' },
  FACUP: { a: '#3b0712', b: '#120309', accent: '#ff5a6e', pattern: 'rays' },
  EFLCUP: { a: '#03301a', b: '#010e07', accent: '#2fe08b', pattern: 'stripes' },
  CDR: { a: '#3d0a10', b: '#120306', accent: '#f2c14e', pattern: 'rays' },
  DFB: { a: '#2b2106', b: '#0c0902', accent: '#e3bf4a', pattern: 'stripes' },
  CI: { a: '#062a4a', b: '#020c17', accent: '#4ab8ff', pattern: 'waves' },
  CDF: { a: '#08205a', b: '#030a1c', accent: '#ff4d5e', pattern: 'chevron' },
  WC: { a: '#2a2006', b: '#07110f', accent: '#e8c25a', pattern: 'rays', motion: true },
  EURO: { a: '#0a2a7a', b: '#030b24', accent: '#6fa8ff', pattern: 'waves' },
}

export const compIdentity = (key?: string): CompIdentity | undefined => (key ? ID[key.replace(/-\d+$/, '')] : undefined)

/** The identity's colours as CSS variables for the elements that carry it. */
export const identityVars = (ci: CompIdentity): CSSProperties => ({ ['--ci-a' as string]: ci.a, ['--ci-b' as string]: ci.b, ['--ci-acc' as string]: ci.accent })

/** Class names for an element that carries a competition's identity. */
export const identityClass = (ci: CompIdentity) => `ci cip-${ci.pattern}${ci.motion ? ' ci-motion' : ''}`
