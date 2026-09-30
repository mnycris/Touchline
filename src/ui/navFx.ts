// Screen transitions that know which way you are going. Opening a screen slides the new one in over the old;
// going back slides the screen you are leaving away to the right and uncovers the one beneath, exactly as you left
// it; switching tabs cross-fades; closing an overlay drops it away. The screen being left is a snapshot of its DOM
// (scroll positions and canvases copied), taken synchronously when the navigation state changes and before React
// replaces it, so it can animate out without keeping the old component alive.
import { useRef } from 'react'
import { useGame } from '../store/game'

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

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

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

function place(el: HTMLElement | null, host: string, cls: string, ms: number) {
  const h = document.getElementById(host)
  if (!el || !h) return
  const ghost = snapshot(el)
  ghost.classList.remove('layer-in', 'layer-in-tab', 'overlay-in')
  ghost.classList.add('ghost', cls)
  h.appendChild(ghost)
  for (const [n, t, l] of (ghost as HTMLElement & { _scrolls?: [HTMLElement, number, number][] })._scrolls || []) { n.scrollTop = t; n.scrollLeft = l }
  window.setTimeout(() => ghost.remove(), ms)
}

/** Start listening (once, at app start). */
export function initNavFx() {
  return useGame.subscribe((s, p) => {
    const d = s.world && p.world && s.saveId === p.saveId ? decide(s, p) : undefined
    if (!d) { if (s.saveId !== p.saveId) dir = 'none'; return }
    dir = d
    if (reduced()) return
    const layer = document.querySelector<HTMLElement>('.app > .layer')
    const overlays = document.querySelectorAll<HTMLElement>('.app > .overlay')
    const topOv = overlays[overlays.length - 1] || null
    if (d === 'back') place(layer, 'fx-over', 'ghost-back', 240)
    else if (d === 'fwd') place(layer, 'fx-under', 'ghost-hold', 300)
    else if (d === 'tab') place(layer, 'fx-under', 'ghost-hold', 220)
    else if (d === 'close') place(topOv, 'fx-over', 'ghost-close', 240)
    else if (d === 'open' && topOv) place(topOv, 'fx-over', 'ghost-hold-ov', 340)
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
