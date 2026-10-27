import { useState } from 'react'
import { atmosphereVars, type Atmosphere } from '../atmosphere'

/** Colour in the air at the top of every screen, drifting slowly, after the main menu's ambient light: the club's,
 * or whatever the screen is about (a competition's brand, another club's colours; see atmosphere). Each screen has its
 * own (screens are opaque for their transitions); the phase comes from the page clock, so the fog carries on where it
 * was instead of restarting with each screen. */
export function ClubFog({ atmo, className }: { atmo?: Atmosphere; className?: string }) {
  const [t] = useState(() => `${-(performance.now() / 1000).toFixed(2)}s`)
  return <div className={`club-fog ${className || ''}`} aria-hidden style={{ ['--fog-t' as string]: t, ...(atmo ? atmosphereVars(atmo) : {}) }}><i className="f1" /><i className="f2" /><i className="f3" /></div>
}
