// Once a career is open, the work a screen's first visit would otherwise do while you wait is done ahead, a small piece
// at a time whenever the app is idle: the assistant's read of the squad (the Team screen), and the headshots of your squad and of the team you face next (a few at a time, so nothing else waits on them).
import type { World } from '../domain/types'
import { mainSheet, squadOf } from '../engine/match/selection'
import { preloadFace } from '../services/assets'
import { styleFits, warmTeamAdvice } from './teamAdvice'
import { nextFixture } from './selectors'

type Handle = { stop: boolean }
const idle = (fn: () => void) => {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(fn, { timeout: 4000 })
  else window.setTimeout(fn, 120)
}

/** Start warming up after a career opens; returns a function that stops it (another career opened, or the app left it). */
export function warmUp(w: World, delay = 1200): () => void {
  const h: Handle = { stop: false }
  const club = w.clubs[w.userClubId]
  const f = club && !w.flags.unemployed ? nextFixture(w, club.id) : undefined
  const steps: (() => void)[] = club && !w.flags.unemployed ? [
    ...warmTeamAdvice(w),
    // (the user's main sheet: what the Team screen opens on)
    () => { styleFits(w, mainSheet(club)) },
  ] : []
  const run = () => {
    if (h.stop) return
    const s = steps.shift()
    if (!s) { faces(w, h, f?.home === w.userClubId ? f.away : f?.home); return }
    try { s() } catch { /* a warm-up never breaks anything: the screen does the work itself */ }
    idle(run)
  }
  const t = window.setTimeout(() => idle(run), delay)
  return () => { h.stop = true; window.clearTimeout(t) }
}

/** The headshots of the squad, best players first, then the next opponent's, four at a time. */
async function faces(w: World, h: Handle, opp?: number) {
  const mine = squadOf(w, w.userClubId).sort((a, b) => b.ovr - a.ovr)
  const theirs = opp != null && w.clubs[opp] ? squadOf(w, opp).sort((a, b) => b.ovr - a.ovr).slice(0, 16) : []
  const queue = [...mine, ...theirs].filter((p) => !p.regen)
  const worker = async () => {
    while (!h.stop && queue.length) {
      const p = queue.shift()!
      await preloadFace(p)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}
