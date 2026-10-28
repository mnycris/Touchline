// The system's back is the app's back. The app keeps one entry in the browser's history for every step there is to go
// back through (a career's screens, overlays and the search; the menu's views; New Career's steps), each entered as the
// screen before it is left, so the system's own back does what the app's Back does: in the installed iPhone app
// WebKit's own swipe from the edge (the screen beneath shown as it was left, the system's spring and shadow), Safari's,
// Android's back. Going back in the app (its Back buttons) takes the history back with it, quietly. A back the system
// makes presses the Back button of the screen on top, as a finger on it would, without the app drawing the way back
// again where the system already has (iOS).
//
// In the installed app (Capacitor's web view, set up by scripts/ios/native-swipe.mjs) the app also tells the native
// side whether the screen on top can be swiped back: a screen with a Back button that goes back one step, no sheet over
// it, and the screen beneath it captured as it was left (after a tab switch the history behind a screen holds other
// screens, so until the next step forward its Back button is the way back).
import { useLayoutEffect, useRef } from 'react'
import { useGame } from '../store/game'
import { skipNextGhost } from './navFx'

/** A part of the app with steps to go back through: how many there are now, and how to go back one. */
export interface BackLevel { depth: number; back: () => void }

type Native = { postMessage: (m: unknown) => void }
const nativeHandler = () => (window as unknown as { webkit?: { messageHandlers?: { touchline?: Native } } }).webkit?.messageHandlers?.touchline

/** Running inside the installed app (Capacitor's native web view), not a browser. */
export const isNativeApp = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
/** A system that draws the way back itself (iOS: the installed app's swipe, Safari's): the app doesn't draw it again. */
const SYSTEM_DRAWS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const SID = Math.random().toString(36).slice(2)
const levels = new Set<BackLevel>()
/** entries above the base the history holds, as the app last left it */
let shown = 0
/** per entry above the base: whether the screen beneath it was on screen when it was entered (the gesture shows that) */
const trusted: boolean[] = [false]
let travelling = false, hold = false, again = false, untrusted = false
let watchdog = 0

const want = () => { let n = 0; for (const l of levels) n += l.depth; return n }
/** the innermost part with somewhere to go back to */
const top = () => { let t: BackLevel | undefined; for (const l of levels) if (l.depth > 0) t = l; return t }

/** The history brought to the app's depth: entries added for steps taken, a quiet trip back for steps undone. */
function sync() {
  if (travelling || hold) { again = true; return }
  const n = want()
  if (n > shown) {
    for (let i = shown + 1; i <= n; i++) {
      history.pushState({ tl: i, sid: SID }, '')
      // (only the first of several entered at once has the screen beneath it on screen)
      trusted[i] = !untrusted && i === shown + 1
    }
    shown = n
    scheduleCheck()
  } else if (n < shown) {
    travelling = true
    const k = shown - n
    shown = n
    trusted.length = n + 1
    // (if the history can't go there, its popstate never comes: carry on)
    watchdog = window.setTimeout(() => { if (travelling) { travelling = false; sync() } }, 700)
    history.go(-k)
    scheduleCheck()
  }
  untrusted = false
}

function onPop(e: PopStateEvent) {
  const st = e.state as { tl?: number; sid?: string } | null
  const at = st && st.sid === SID && typeof st.tl === 'number' ? st.tl : -1
  if (travelling) {
    travelling = false
    window.clearTimeout(watchdog)
    if (at >= 0) shown = at
    if (again) { again = false; sync() }
    scheduleCheck()
    return
  }
  if (at < 0) {
    // an entry from before this run of the app (a reload): stay in the app, on a fresh base
    history.pushState({ tl: 0, sid: SID }, '')
    shown = 0
    trusted.fill(false)
    untrusted = true
    sync()
    return
  }
  if (at < shown) {
    // the system's back: the app goes back as many steps (one, nearly always)
    let steps = shown - at
    shown = at
    trusted.length = at + 1
    while (steps-- > 0) {
      const l = top()
      if (!l) break
      if (SYSTEM_DRAWS) skipNextGhost()
      l.back()
    }
  } else shown = at
  // once the app has drawn where it went (a step it refused, or a forward the app doesn't do, puts the history back)
  hold = true
  requestAnimationFrame(() => requestAnimationFrame(() => { hold = false; again = false; sync(); scheduleCheck() }))
}

/** The career's way back: its overlays, the screens of the tab it's on, the search. */
const career: BackLevel = {
  get depth() {
    const s = useGame.getState()
    return s.world ? s.overlay.length + s.stacks[s.tab].length + (s.searchOpen ? 1 : 0) : 0
  },
  back() {
    const s = useGame.getState()
    if (s.searchOpen) { s.closeSearch(); return }
    // the screen's own Back button (some do more than step back), or a plain step back where it has none
    const btn = topBackButton()
    if (btn) btn.click()
    else s.back()
  },
}

/** The Back button of the screen on top of the career (none on a live match, a press conference under way, the tabs). */
function topBackButton(): HTMLElement | null {
  const ovs = document.querySelectorAll<HTMLElement>('.app > .overlay')
  const scr = ovs[ovs.length - 1] || document.querySelector<HTMLElement>('.app > .layer')
  return scr?.querySelector<HTMLElement>('.topbar .iconbtn[aria-label="Back"]') || null
}

/** Can the screen on top be swiped back, as the system's gesture would show it? */
function canSwipe(): boolean {
  if (travelling || shown <= 0 || !trusted[shown]) return false
  if (document.getElementById('sheet-host')?.childElementCount) return false
  const s = useGame.getState()
  if (s.world) return !s.searchOpen && !!topBackButton() && !topBackButton()!.hasAttribute('data-no-swipe')
  // the menu and New Career: the Back of the screen showing (not of a snapshot animating away)
  const bars = [...document.querySelectorAll<HTMLElement>('.app .topbar')].filter((b) => !b.closest('.nav-ghost'))
  const b = bars[bars.length - 1]?.querySelector('.iconbtn[aria-label="Back"], .iconbtn[aria-label="Back to the menu"]')
  return !!b && !b.hasAttribute('data-no-swipe')
}

let said: boolean | undefined
let checking = 0
function scheduleCheck() {
  if (!nativeHandler() || checking) return
  checking = requestAnimationFrame(() => {
    checking = 0
    const on = canSwipe()
    if (on !== said) { said = on; nativeHandler()?.postMessage({ swipeBack: on }) }
  })
}

/** A part of the app (a component) with steps to go back through: its depth now, and its way back one step. */
export function useBackLevel(depth: number, back: () => void) {
  const l = useRef<BackLevel>({ depth, back })
  useLayoutEffect(() => {
    const lv = l.current
    levels.add(lv)
    sync()
    return () => { levels.delete(lv); sync() }
  }, [])
  useLayoutEffect(() => {
    l.current.back = back
    if (l.current.depth !== depth) { l.current.depth = depth; sync() }
  })
}

/** Start (once, at app start). */
export function initSystemBack() {
  if (typeof window === 'undefined') return
  history.replaceState({ tl: 0, sid: SID }, '')
  levels.add(career)
  useGame.subscribe((s, p) => {
    // another tab, another career: the history behind the screen now holds other screens
    if (s.tab !== p.tab || s.saveId !== p.saveId) { trusted.fill(false); untrusted = true; scheduleCheck() }
    if (s.overlay !== p.overlay || s.stacks !== p.stacks || s.tab !== p.tab || s.searchOpen !== p.searchOpen || s.world !== p.world) sync()
  })
  window.addEventListener('popstate', onPop)
  // the installed app: say whenever what's on top changes (a screen, a sheet)
  if (nativeHandler()) {
    new MutationObserver(scheduleCheck).observe(document.body, { childList: true, subtree: true })
    scheduleCheck()
  }
}
