// Less motion: the app's own Reduce Motion setting, or the device asking for it. Either one calms the app: no ambient
// movement, transitions and celebrations cut to their end state; the match itself still moves (the ball and players
// on the pitch are the match, not decoration).
import { useGame } from '../store/game'

const osReduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const prefersLessMotion = () => !!useGame.getState().prefs.reduceMotion || osReduce()

export function useLessMotion() {
  const pref = useGame((s) => s.prefs.reduceMotion)
  return pref || osReduce()
}

/** Keeps <html class="rm"> in step with the setting and the device, for the stylesheet. */
export function initMotionClass() {
  if (typeof document === 'undefined') return
  const apply = () => document.documentElement.classList.toggle('rm', prefersLessMotion())
  apply()
  useGame.subscribe((s, p) => { if (s.prefs.reduceMotion !== p.prefs.reduceMotion) apply() })
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', apply) } catch { /* old engines */ }
}
