// The iPhone's swipe back, for a web app that has no navigation controller to give it one: a finger that starts at
// the left edge of the screen and moves right pulls the screen away and uncovers the one beneath, exactly as it was
// left; let go past a third of the width (or with a flick) and you are back, otherwise it settles where it was.
//
// It does what the screen's own Back button does and nothing else: it is only there when the screen has one (a live
// match, a press conference in progress and the main tabs have none), and finishing the gesture presses it, so any
// screen with its own way back keeps it. A gesture that starts away from the edge, or that is more vertical than
// horizontal, is left to the page (lists, carousels, sliders and the pitch keep their touches), and so is anything
// marked data-swipe-lock.
import { useGame } from '../store/game'
import { keptBeneath, restoreScrolls, skipNextGhost } from './navFx'
import { prefersLessMotion } from './motion'

const EDGE = 24
/** How far the screen beneath sits to the left when it is fully covered, as on iOS (a fraction of the width). */
const PARALLAX = 0.28

interface Drag {
  id: number
  x0: number
  y0: number
  el: HTMLElement
  btn: HTMLElement
  /** what moves in from the left: the real screen (under an overlay) or a snapshot of it */
  under?: HTMLElement
  ownUnder: boolean
  /** where a stand-in for the screen beneath goes (under the main layer, or under the top overlay) */
  host: string
  dim?: HTMLElement
  live: boolean
  x: number
  v: number
  lastX: number
  lastT: number
}

let d: Drag | null = null

function surface(): { el: HTMLElement; under?: HTMLElement; ownUnder: boolean; host: string } | undefined {
  const s = useGame.getState()
  const overlays = document.querySelectorAll<HTMLElement>('.app > .overlay')
  const top = overlays[overlays.length - 1]
  if (top) {
    if (s.overlay.length === 1) return { el: top, under: document.querySelector<HTMLElement>('.app > .layer') || undefined, ownUnder: false, host: '' }
    return { el: top, under: keptBeneath(s), ownUnder: true, host: 'fx-over' }
  }
  const layer = document.querySelector<HTMLElement>('.app > .layer')
  if (!layer) return undefined
  return { el: layer, under: keptBeneath(s), ownUnder: true, host: 'fx-under' }
}

function start(e: TouchEvent) {
  if (d || e.touches.length !== 1) return
  const t = e.touches[0]
  if (t.clientX > EDGE) return
  const s = useGame.getState()
  if (!s.world || s.searchOpen) return
  if (document.getElementById('sheet-host')?.childElementCount) return
  const target = e.target as Element | null
  if (target?.closest('[data-swipe-lock], input[type="range"]')) return
  const sf = surface()
  if (!sf) return
  const btn = sf.el.querySelector<HTMLElement>('.topbar .iconbtn[aria-label="Back"]')
  if (!btn) return
  d = { id: t.identifier, x0: t.clientX, y0: t.clientY, el: sf.el, btn, under: sf.under, ownUnder: sf.ownUnder, host: sf.host, live: false, x: 0, v: 0, lastX: t.clientX, lastT: e.timeStamp }
}

function begin() {
  if (!d) return
  const W = window.innerWidth
  d.live = true
  d.el.classList.add('swiping')
  // (a screen keeps its entrance animation's end state, which would hold it in place over any transform given here)
  d.el.style.animation = 'none'
  d.el.style.transition = 'none'
  const host = d.host ? document.getElementById(d.host) : null
  if (d.ownUnder) {
    if (d.under && host) {
      d.under.classList.add('nav-ghost', 'swipe-under')
      host.appendChild(d.under)
      restoreScrolls(d.under)
    } else if (host) {
      // nothing kept of the screen beneath (a career just loaded): the bare background, so the pull still reads
      const blank = document.createElement('div')
      blank.className = 'nav-ghost swipe-under swipe-blank'
      host.appendChild(blank)
      d.under = blank
    }
  }
  if (d.under) { d.under.style.animation = 'none'; d.under.style.transition = 'none'; d.under.style.transform = `translate3d(${-PARALLAX * W}px,0,0)` }
  const dimHost = d.ownUnder ? host : d.under?.parentElement
  if (dimHost) {
    const dim = document.createElement('div')
    dim.className = 'swipe-dim'
    // just above what is uncovered, just below the screen being pulled
    if (d.ownUnder) dimHost.appendChild(dim)
    else d.el.parentElement?.insertBefore(dim, d.el)
    d.dim = dim
  }
}

function paint(x: number) {
  if (!d) return
  const W = window.innerWidth
  const p = Math.min(1, x / W)
  d.el.style.transform = `translate3d(${x}px,0,0)`
  if (d.under) d.under.style.transform = `translate3d(${-PARALLAX * W * (1 - p)}px,0,0)`
  if (d.dim) d.dim.style.opacity = String(0.32 * (1 - p))
}

function move(e: TouchEvent) {
  if (!d) return
  const t = Array.from(e.changedTouches).find((x) => x.identifier === d!.id)
  if (!t) return
  const dx = t.clientX - d.x0, dy = t.clientY - d.y0
  if (!d.live) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    // only a clearly sideways pull to the right is a swipe back; anything else belongs to the page
    if (dx <= 0 || dx < Math.abs(dy) * 1.3) { d = null; return }
    begin()
  }
  e.preventDefault()
  const dt = Math.max(1, e.timeStamp - d.lastT)
  d.v = 0.6 * d.v + 0.4 * ((t.clientX - d.lastX) / dt)
  d.lastX = t.clientX
  d.lastT = e.timeStamp
  d.x = Math.max(0, dx)
  paint(d.x)
}

function settle(commit: boolean) {
  const g = d
  d = null
  if (!g) return
  const W = window.innerWidth
  const ms = prefersLessMotion() ? 120 : commit ? Math.max(140, Math.min(260, ((W - g.x) / Math.max(0.8, g.v)) | 0)) : 220
  const ease = `${ms}ms cubic-bezier(0.2, 0.7, 0.25, 1)`
  g.el.style.transition = `transform ${ease}`
  if (g.under) g.under.style.transition = `transform ${ease}`
  if (g.dim) g.dim.style.transition = `opacity ${ease}`
  requestAnimationFrame(() => {
    g.el.style.transform = commit ? `translate3d(${W}px,0,0)` : 'translate3d(0,0,0)'
    if (g.under) g.under.style.transform = commit ? 'translate3d(0,0,0)' : `translate3d(${-PARALLAX * W}px,0,0)`
    if (g.dim) g.dim.style.opacity = commit ? '0' : '0.32'
  })
  window.setTimeout(() => {
    if (commit) {
      // the screen is already gone: press its Back button (its own way back), without animating it a second time
      skipNextGhost()
      g.btn.click()
    }
    // once the screen beneath is rendered for real, the stand-in goes
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (g.ownUnder) g.under?.remove()
      else if (g.under) { g.under.style.transition = ''; g.under.style.transform = '' }
      g.dim?.remove()
      if (g.el.isConnected) { g.el.classList.remove('swiping'); g.el.style.transition = ''; g.el.style.transform = '' }
    }))
  }, ms + 20)
}

function end(e: TouchEvent) {
  if (!d) return
  if (!Array.from(e.changedTouches).some((x) => x.identifier === d!.id)) return
  if (!d.live) { d = null; return }
  const W = window.innerWidth
  settle(d.x > W * 0.36 || (d.v > 0.45 && d.x > 28))
}

function cancel() {
  if (!d) return
  if (!d.live) { d = null; return }
  settle(false)
}

/** Start listening (once, at app start). */
export function initSwipeBack() {
  if (typeof document === 'undefined') return
  document.addEventListener('touchstart', start, { passive: true })
  document.addEventListener('touchmove', move, { passive: false })
  document.addEventListener('touchend', end, { passive: true })
  document.addEventListener('touchcancel', cancel, { passive: true })
  // a system back (browser history, a native gesture in a wrapper) while a pull is under way wins: put things back
  window.addEventListener('popstate', cancel)
}
