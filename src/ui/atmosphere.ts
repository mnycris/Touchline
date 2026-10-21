// The air at the top of a screen (the slow fog behind its header) belongs to what the screen is about: a
// competition's page is lit in its brand, another club's page in that club's colours, a player in his club's, and the
// rest of the career in the manager's own club. A competition without a brand of its own gets the app's neutral air,
// not the manager's club colours over somebody else's tournament.
import type { CSSProperties } from 'react'
import type { Club, World } from '../domain/types'
import type { Route } from '../store/game'
import { compIdentity } from './compIdentity'
import { clubAccent, hexToRgb, luminance } from './theme'

/** Three colours (each "r, g, b"): the fog's body, its light and its shadow. */
export type Atmosphere = [string, string, string]

/** The app's own air: steel night with a breath of its green. */
const NEUTRAL: Atmosphere = ['58, 78, 108', '43, 240, 143', '16, 24, 38']

const rgb = (hex: string) => hexToRgb(hex).join(', ')
const blend = (hex: string, to: [number, number, number], t: number) => hexToRgb(hex).map((v, i) => Math.round(v + (to[i] - v) * t)).join(', ')

function clubAir(club: Club): Atmosphere {
  const acc = clubAccent(club)
  // the light is the club's second colour when it has a distinct one, otherwise its own colour lifted
  const second = [club.kit?.[1], club.kit?.[0]].find((c) => c && Math.abs(luminance(c) - luminance(acc)) > 60 && luminance(c) > 40)
  return [rgb(acc), second ? rgb(second) : blend(acc, [255, 255, 255], 0.38), blend(acc, [0, 0, 0], 0.55)]
}

/** The atmosphere for a route, or undefined for the manager's own club (the default, from the theme). */
export function atmosphereFor(w: World, r: Route | undefined): Atmosphere | undefined {
  if (!r) return undefined
  const p = r.params as { id?: string | number } | undefined
  if (r.name === 'comp' && p?.id != null) {
    const c = w.competitions[String(p.id)]
    if (!c) return undefined
    const ci = compIdentity(c.key)
    return ci ? ci.fog : NEUTRAL
  }
  if (r.name === 'club' && p?.id != null) {
    const club = w.clubs[Number(p.id)]
    return club && club.id !== w.userClubId ? clubAir(club) : undefined
  }
  if (r.name === 'player' && p?.id != null) {
    const pl = w.players[Number(p.id)]
    const club = pl && w.clubs[pl.clubId]
    return club && club.id !== w.userClubId ? clubAir(club) : undefined
  }
  return undefined
}

/** The atmosphere as the fog's CSS variables (see .club-fog). */
export const atmosphereVars = (a: Atmosphere): CSSProperties => ({
  ['--fog-1' as string]: a[0],
  ['--fog-2c' as string]: `rgb(${a[1]})`,
  ['--fog-3c' as string]: `rgb(${a[2]})`,
})
