// Visual identities for the most prestigious competitions, inside the same app (same type, same cards, same spacing).
// Each one is built from the competition's own brand: its colours (sampled from its genuine logo where the app has
// it, otherwise from the brand's published descriptions) and its mark, traced from the genuine logo
// (scripts/assets/comp_marks.py) or cut from its vector logo (svg_parts.py, efl_ball.py), and used large and cropped the
// way the leagues' and broadcasters' own graphics use it.
//   Champions League   the "Kick of Light" identity (2024-27): the starball's night blue, light split into a spectrum
//   Europa League      orange and black, the trophy large;  Conference League  black and bright green, its trophy large
//   Premier League     purple, with the three gradient tones of the 2023 refresh (lime green, sky purple, purple red)
//   LALIGA             coral red (Pantone Red 032 C), the "LL" symbol;  Hypermotion  turquoise
//   Bundesliga         red, white and silver (after the trophy), the player from the logo
//   Serie A            navy and azure, the faceted "A", the tricolore
//   Ligue 1            electric blue and pink on charcoal;  Ligue 2  aquamarine and purple
//   FA Cup             navy and red, the trophy
//   Carabao Cup        the logo's green, the carabao's head and horns as one silhouette against its red sun
//   EFL                its navy and its ball of 72 dots, one per club, with the division's own 24 lit in its colour
//                      as its logo does: Championship gold, League One silver, League Two red
//   Pro League         the bull in its shield, large, in the logo's red on black, Belgium's colours along the top
//   Liga Portugal      navy and electric blue, its symbol (after the Lusitano horse) over azulejo tiles, Portugal's
//                      green and red
//   Eredivisie         Dutch orange, its emblem large (the ring in navy, the "e" in white), the Dutch flag on top
// The colours and art themselves live in screens.css under .ci-<id>. Every other competition keeps the standard look.
import type { CSSProperties } from 'react'
import { assetHref } from '../services/assets'

export interface CompIdentity {
  /** the identity's class in screens.css: .ci-<id> */
  id: string
  /** the competition's mark traced from its genuine logo (public/assets/marks/<mark>.svg), and its width / height */
  mark?: string
  /** a second part of the mark in the same frame, in its own colour (the EFL division's own third of the ball, the
   *  Eredivisie's "e" inside its ring) */
  mark2?: string
  /** the mark whole, in the same frame, where it is shown on its own (the trophy celebration), when the card splits it */
  whole?: string
  ar?: number
  /** the logo shown in white on this identity's colour field, the competition's own version for a coloured background */
  whiteLogo?: boolean
  /** a sun behind the mark (the Carabao Cup's red sun, as on its logo) */
  sun?: boolean
  /** small type, progress and rules on the field */
  accent: string
  /** the slow light of the big European nights: a spectrum through the starball, a sheen over a trophy */
  motion?: 'prism' | 'sheen'
  /** the brand's main colour (r, g, b) for tints across its page, and the night it sits on (behind its sticky tabs)
   *  (the EFL's divisions tint their pages in its navy-blue, their own colour in the accent) */
  rgb: string
  deep: string
  /** the air at the top of its page (see atmosphere): its main colour, its light, its shadow (each r, g, b) */
  fog: [string, string, string]
}

const ID: Record<string, CompIdentity> = {
  UCL: { id: 'UCL', mark: 'UCL', ar: 98 / 97, accent: '#b8c6ff', motion: 'prism', rgb: '58, 86, 230', deep: '#03082f', fog: ['30, 52, 190', '127, 140, 255', '4, 10, 92'] },
  UEL: { id: 'UEL', mark: 'UEL', ar: 91 / 103, accent: '#ff7a1a', rgb: '255, 105, 0', deep: '#110a05', fog: ['230, 90, 0', '255, 176, 102', '90, 34, 0'] },
  UECL: { id: 'UECL', mark: 'UECL', ar: 78 / 182, accent: '#2cf07c', motion: 'sheen', rgb: '44, 240, 124', deep: '#050f09', fog: ['18, 150, 76', '44, 240, 124', '4, 52, 26'] },
  L13: { id: 'L13', mark: 'L13', ar: 1, accent: '#00ff85', rgb: '150, 60, 255', deep: '#16001b', fog: ['110, 0, 130', '0, 255, 133', '55, 0, 60'] },
  L53: { id: 'L53', mark: 'L53', ar: 139 / 129, whiteLogo: true, accent: '#ffffff', rgb: '242, 61, 64', deep: '#1c0507', fog: ['220, 40, 50', '255, 138, 110', '110, 8, 20'] },
  L54: { id: 'L54', mark: 'L54', ar: 139 / 129, whiteLogo: true, accent: '#ffffff', rgb: '0, 170, 176', deep: '#001a1e', fog: ['0, 140, 148', '47, 224, 224', '0, 56, 64'] },
  L19: { id: 'L19', mark: 'L19', ar: 168 / 127, accent: '#ff3347', rgb: '210, 5, 21', deep: '#130405', fog: ['200, 10, 26', '205, 208, 218', '70, 0, 8'] },
  L20: { id: 'L20', mark: 'L20', ar: 190 / 128, accent: '#ff3347', rgb: '210, 5, 21', deep: '#130405', fog: ['200, 10, 26', '205, 208, 218', '70, 0, 8'] },
  L31: { id: 'L31', mark: 'L31', ar: 121 / 141, accent: '#63b6ff', rgb: '40, 110, 230', deep: '#020a20', fog: ['22, 64, 168', '99, 182, 255', '4, 18, 64'] },
  L16: { id: 'L16', mark: 'L16', ar: 81 / 126, accent: '#ff5fa8', rgb: '70, 80, 255', deep: '#0b0c1c', fog: ['44, 60, 230', '255, 95, 168', '18, 18, 48'] },
  L17: { id: 'L17', mark: 'L17', ar: 80 / 127, accent: '#3cf2cf', rgb: '60, 200, 190', deep: '#06141a', fog: ['30, 150, 140', '150, 100, 255', '10, 40, 52'] },
  L14: { id: 'L14', mark: 'EFL-L14o', mark2: 'EFL-L14', whole: 'EFL', ar: 1, accent: '#e6c56c', rgb: '70, 92, 200', deep: '#080c22', fog: ['30, 42, 112', '230, 197, 108', '8, 12, 48'] },
  L60: { id: 'L60', mark: 'EFL-L60o', mark2: 'EFL-L60', whole: 'EFL', ar: 1, accent: '#d9dde6', rgb: '70, 92, 200', deep: '#080c22', fog: ['30, 42, 112', '205, 210, 222', '8, 12, 48'] },
  L61: { id: 'L61', mark: 'EFL-L61o', mark2: 'EFL-L61', whole: 'EFL', ar: 1, accent: '#ff5f70', rgb: '70, 92, 200', deep: '#0b0a22', fog: ['30, 42, 112', '232, 52, 78', '8, 12, 48'] },
  L4: { id: 'L4', mark: 'L4', ar: 33.8 / 41, accent: '#ff4870', rgb: '248, 16, 64', deep: '#14060a', fog: ['190, 10, 48', '255, 96, 128', '66, 0, 18'] },
  L308: { id: 'L308', mark: 'L308', ar: 2236 / 3676, accent: '#6fb4ff', rgb: '40, 110, 235', deep: '#000a20', fog: ['0, 46, 128', '96, 170, 255', '0, 12, 44'] },
  L10: { id: 'L10', mark: 'L10r', mark2: 'L10e', whole: 'L10', ar: 191.908 / 192.865, accent: '#ff9a3d', rgb: '255, 122, 0', deep: '#170902', fog: ['210, 80, 0', '255, 160, 70', '80, 26, 0'] },
  FACUP: { id: 'FACUP', mark: 'FACUP', ar: 80 / 124, accent: '#ff5a66', rgb: '40, 70, 170', deep: '#060c22', fog: ['26, 48, 128', '230, 40, 60', '8, 16, 52'] },
  EFLCUP: { id: 'EFLCUP', mark: 'EFLCUP', mark2: 'EFLCUP-skull', ar: 200 / 112, sun: true, motion: 'sheen', accent: '#ffd23f', rgb: '0, 150, 75', deep: '#03140b', fog: ['0, 128, 64', '255, 210, 63', '0, 46, 22'] },
  CDR: { id: 'CDR', accent: '#f6c445', motion: 'sheen', rgb: '190, 30, 45', deep: '#16050a', fog: ['170, 22, 40', '246, 196, 69', '64, 6, 16'] },
  DFB: { id: 'DFB', accent: '#ffce3a', motion: 'sheen', rgb: '200, 160, 60', deep: '#110e05', fog: ['120, 96, 34', '255, 206, 58', '36, 28, 8'] },
  CI: { id: 'CI', accent: '#6cbcff', rgb: '40, 110, 220', deep: '#03102a', fog: ['20, 76, 170', '108, 188, 255', '2, 28, 72'] },
  CDF: { id: 'CDF', accent: '#ff5767', rgb: '40, 70, 170', deep: '#060c22', fog: ['24, 44, 130', '255, 87, 103', '8, 14, 52'] },
  WC: { id: 'WC', accent: '#ecc560', motion: 'sheen', rgb: '210, 170, 70', deep: '#120e04', fog: ['126, 96, 26', '236, 197, 96', '40, 30, 6'] },
  EURO: { id: 'EURO', accent: '#9fc2ff', motion: 'sheen', rgb: '50, 100, 230', deep: '#050c28', fog: ['30, 70, 200', '159, 194, 255', '10, 24, 80'] },
}

export const compIdentity = (key?: string): CompIdentity | undefined => (key ? ID[key.replace(/-\d+$/, '')] : undefined)

/** The identity's accent and mark as CSS variables for the elements that carry it. */
export const identityVars = (ci: CompIdentity): CSSProperties => ({
  ['--ci-acc' as string]: ci.accent,
  ...(ci.mark ? { ['--ci-mark' as string]: `url(${assetHref(`assets/marks/${ci.mark}.svg`)})`, ['--ci-ar' as string]: ci.ar } : {}),
  ...(ci.mark2 ? { ['--ci-mark2' as string]: `url(${assetHref(`assets/marks/${ci.mark2}.svg`)})` } : {}),
})

/** A competition's own page in its identity (see .cis in screens.css): its tabs, selections, cards and small type. */
export const pageIdentity = (ci: CompIdentity): { className: string; style: CSSProperties } => ({
  className: `cis ci-${ci.id}`,
  style: { ...identityVars(ci), ['--cis-rgb' as string]: ci.rgb, ['--cis-deep' as string]: ci.deep },
})

/** Class names for an element that carries a competition's identity. */
export const identityClass = (ci: CompIdentity) => `ci ci-${ci.id}${ci.motion ? ` ci-${ci.motion}` : ''}${ci.whiteLogo ? ' ci-white-logo' : ''}`
