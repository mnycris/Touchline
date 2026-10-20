// Visual identities for the most prestigious competitions, inside the same app (same type, same cards, same spacing).
// Each one is built from the competition's own brand: its colours (sampled from its genuine logo where the app has
// it, otherwise from the brand's published descriptions) and its mark, traced from the genuine logo
// (scripts/assets/comp_marks.py) and used large and cropped the way the leagues' and broadcasters' own graphics use it.
//   Champions League   the "Kick of Light" identity (2024-27): the starball's night blue, light split into a spectrum
//   Europa League      orange and black;  Conference League  black and bright green
//   Premier League     purple, with the three gradient tones of the 2023 refresh (lime green, sky purple, purple red)
//   LALIGA             coral red (Pantone Red 032 C), the "LL" symbol;  Hypermotion  turquoise
//   Bundesliga         red, white and silver (after the trophy), the player from the logo
//   Serie A            navy and azure, the faceted "A", the tricolore
//   Ligue 1            electric blue and pink on charcoal;  Ligue 2  aquamarine and purple
//   FA Cup             navy and red, the trophy;  Carabao Cup  green and white, gold
// The colours and art themselves live in screens.css under .ci-<id>. Every other competition keeps the standard look.
import type { CSSProperties } from 'react'

export interface CompIdentity {
  /** the identity's class in screens.css: .ci-<id> */
  id: string
  /** the competition's mark traced from its genuine logo (public/assets/marks/<mark>.svg), and its width / height */
  mark?: string
  ar?: number
  /** the logo shown in white on this identity's colour field, the competition's own version for a coloured background */
  whiteLogo?: boolean
  /** small type, progress and rules on the field */
  accent: string
  /** the slow light of the big European nights: a spectrum through the starball, a sheen over a trophy */
  motion?: 'prism' | 'sheen'
}

const ID: Record<string, CompIdentity> = {
  UCL: { id: 'UCL', mark: 'UCL', ar: 98 / 97, accent: '#b8c6ff', motion: 'prism' },
  UEL: { id: 'UEL', mark: 'UEL', ar: 91 / 103, accent: '#ff7a1a' },
  UECL: { id: 'UECL', accent: '#2cf07c' },
  L13: { id: 'L13', mark: 'L13', ar: 1, accent: '#00ff85' },
  L53: { id: 'L53', mark: 'L53', ar: 139 / 129, whiteLogo: true, accent: '#ffffff' },
  L54: { id: 'L54', mark: 'L54', ar: 139 / 129, whiteLogo: true, accent: '#ffffff' },
  L19: { id: 'L19', mark: 'L19', ar: 168 / 127, accent: '#ff3347' },
  L20: { id: 'L20', mark: 'L20', ar: 190 / 128, accent: '#ff3347' },
  L31: { id: 'L31', mark: 'L31', ar: 121 / 141, accent: '#63b6ff' },
  L16: { id: 'L16', mark: 'L16', ar: 81 / 126, accent: '#ff5fa8' },
  L17: { id: 'L17', mark: 'L17', ar: 80 / 127, accent: '#3cf2cf' },
  FACUP: { id: 'FACUP', mark: 'FACUP', ar: 80 / 124, accent: '#ff5a66' },
  EFLCUP: { id: 'EFLCUP', accent: '#ffd23f' },
  CDR: { id: 'CDR', accent: '#f6c445', motion: 'sheen' },
  DFB: { id: 'DFB', accent: '#ffce3a', motion: 'sheen' },
  CI: { id: 'CI', accent: '#6cbcff' },
  CDF: { id: 'CDF', accent: '#ff5767' },
  WC: { id: 'WC', accent: '#ecc560', motion: 'sheen' },
  EURO: { id: 'EURO', accent: '#9fc2ff', motion: 'sheen' },
}

export const compIdentity = (key?: string): CompIdentity | undefined => (key ? ID[key.replace(/-\d+$/, '')] : undefined)

/** The identity's accent and mark as CSS variables for the elements that carry it. */
export const identityVars = (ci: CompIdentity): CSSProperties => ({
  ['--ci-acc' as string]: ci.accent,
  ...(ci.mark ? { ['--ci-mark' as string]: `url(/assets/marks/${ci.mark}.svg)`, ['--ci-ar' as string]: ci.ar } : {}),
})

/** Class names for an element that carries a competition's identity. */
export const identityClass = (ci: CompIdentity) => `ci ci-${ci.id}${ci.motion ? ` ci-${ci.motion}` : ''}${ci.whiteLogo ? ' ci-white-logo' : ''}`
