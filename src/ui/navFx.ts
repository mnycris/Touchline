// Screen transitions that know which way you are going. Opening a screen slides the new one in over the old;
// going back slides the screen you are leaving away to the right and uncovers the one beneath, exactly as you left
// it; switching tabs cross-fades; closing an overlay drops it away. The screen being left is a snapshot of its DOM
// (scroll positions and canvases copied), taken synchronously when the navigation state changes and before React
// replaces it, so it can animate out without keeping the old component alive.
import { useRef } from 'react'
import { useGame } from '../store/game'
import { prefersLessMotion } from './motion'

export type NavDir = 'none' | 'fwd' | 'back' | 'tab' | 'open' | 'close'
let dir: NavDir = 'none'
/** The direction of the navigation React is about to render. */
export const navDir = () => dir

type S = ReturnType<typeof useGame.getState>
function decide(s: S, p: S): NavDir | undefined {
  if (s.overlay !== p.overlay && s.overlay.length !== p.overlay.length) return s.overlay.length > p.overlay.length ? 'open' : 'close'
  if (s.overlay.length) return undefined
  if (s.tab !== p.tab) return 'tab'
  if (s.stacks !== p.stacks) {
    const a = s.stacks[s.tab].length, b = p.stacks[s.tab].length
    if (a !== b) return a > b ? 'fwd' : 'back'
  }
  return undefined
}

const reduced = () => prefersLessMotion()

/** Copy what cloneNode leaves behind: scroll offsets and canvas pixels. */
function snapshot(el: HTMLElement): HTMLElement {
  const ghost = el.cloneNode(true) as HTMLElement
  const a = el.querySelectorAll<HTMLElement>('*'), b = ghost.querySelectorAll<HTMLElement>('*')
  const scrolls: [HTMLElement, number, number][] = []
  for (let i = 0; i < a.length && i < b.length; i++) {
    const o = a[i]
    if (o.scrollTop || o.scrollLeft) scrolls.push([b[i], o.scrollTop, o.scrollLeft])
    if (o instanceof HTMLCanvasElement && b[i] instanceof HTMLCanvasElement) {
      try { (b[i] as HTMLCanvasElement).getContext('2d')?.drawImage(o, 0, 0) } catch { /* tainted or zero-size */ }
    }
  }
  ;(ghost as HTMLElement & { _scrolls?: typeof scrolls })._scrolls = scrolls
  ghost.removeAttribute('id')
  ghost.setAttribute('aria-hidden', 'true')
  return ghost
}

type Ghost = HTMLElement & { _scrolls?: [HTMLElement, number, number][] }
/** Put a snapshot back where its scroll positions apply (they are lost whenever it leaves the document). */
export function restoreScrolls(g: HTMLElement) { for (const [n, t, l] of (g as Ghost)._scrolls || []) { n.scrollTop = t; n.scrollLeft = l } }

/**
 * The screens left behind on the way forward, as they were left, keyed by where they sat: the interactive swipe
 * back (see swipeBack) shows the one beneath under the screen being pulled away. A handful at most.
 */
const kept = new Map<string, HTMLElement>()
function keep(key: string, g: HTMLElement) {
  kept.delete(key)
  kept.set(key, g)
  while (kept.size > 12) kept.delete(kept.keys().next().value!)
}
const layerKeyOf = (s: S, depth: number) => `${s.tab}:${depth}:${s.stacks[s.tab][depth - 1]?.name ?? 'root'}`
/** The snapshot of the screen beneath the one showing (if it was left by navigating forward from it). */
export function keptBeneath(s: S): HTMLElement | undefined {
  if (s.overlay.length > 1) return kept.get(`ov:${s.overlay.length - 1}:${s.overlay[s.overlay.length - 2].name}`)
  if (s.overlay.length) return undefined
  const d = s.stacks[s.tab].length
  return d ? kept.get(layerKeyOf(s, d - 1)) : undefined
}
let skip = false
/** The next navigation has already been animated (by the finger): don't animate it again. (Only straight away: a
 * Back button that asks first and navigates later animates as usual.) */
export function skipNextGhost() { skip = true; window.setTimeout(() => { skip = false }, 400) }

function place(el: HTMLElement | null, host: string, cls: string, ms: number, keepAs?: string) {
  const h = document.getElementById(host)
  if (!el || !h) return
  const ghost = snapshot(el)
  ghost.classList.remove('layer-in', 'layer-in-tab', 'overlay-in')
  ghost.classList.add('ghost', cls)
  h.appendChild(ghost)
  restoreScrolls(ghost)
  window.setTimeout(() => { ghost.remove(); if (keepAs) { ghost.classList.remove(cls); keep(keepAs, ghost) } }, ms)
}

/** Start listening (once, at app start). */
export function initNavFx() {
  return useGame.subscribe((s, p) => {
    const d = s.world && p.world && s.saveId === p.saveId ? decide(s, p) : undefined
    if (!d) { if (s.saveId !== p.saveId) dir = 'none'; return }
    dir = d
    if (skip) { skip = false; return }
    const layer = document.querySelector<HTMLElement>('.app > .layer')
    const overlays = document.querySelectorAll<HTMLElement>('.app > .overlay')
    const topOv = overlays[overlays.length - 1] || null
    // (with less motion nothing animates, but the screen left is still kept for the swipe back)
    const ms = (n: number) => (reduced() ? 0 : n)
    if (d === 'back') { if (!reduced()) place(layer, 'fx-over', 'ghost-back', 240) }
    else if (d === 'fwd') place(layer, 'fx-under', 'ghost-hold', ms(300), layerKeyOf(p, p.stacks[p.tab].length))
    else if (d === 'tab') { if (!reduced()) place(layer, 'fx-under', 'ghost-hold', 220) }
    else if (d === 'close') { if (!reduced()) place(topOv, 'fx-over', 'ghost-close', 240) }
    // (only an overlay of the stack is held: the screen on top can be something else, a live match among them)
    else if (d === 'open' && topOv && p.overlay.length) place(topOv, 'fx-over', 'ghost-hold-ov', ms(340), `ov:${p.overlay.length}:${p.overlay[p.overlay.length - 1].name}`)
  })
}

/** The entrance class for a screen, fixed when it mounts (so later re-renders never restart an animation). */
export function useEnterClass(key: string, kind: 'layer' | 'overlay'): string {
  const r = useRef<{ key: string; cls: string } | undefined>(undefined)
  if (!r.current || r.current.key !== key) {
    const d = navDir()
    const cls = kind === 'overlay'
      ? (d === 'close' ? '' : 'overlay-in')
      : d === 'back' || d === 'close' || d === 'open' ? '' : d === 'tab' ? 'layer-in-tab' : 'layer-in'
    r.current = { key, cls }
  }
  return r.current.cls
}
