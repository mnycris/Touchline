// Navigation memory: each view instance (tab, depth, route, params) remembers its tab, filters, sort and scroll
// position, so going back returns you exactly where you were. Kept for the session, not in the save.
//   - a view opened afresh starts afresh: what an earlier visit to the same page left behind is forgotten
//     (forgetView, called by the store on every push), so an old scroll position never comes back out of context
//   - the tab roots keep their state while you move around, but their scroll only for the same game day and a
//     short while: after a Continue, or a long time away, a tab comes back at the top
//   - preferences that belong to the page rather than to one visit (a table's Short / Full / Form, a sort, a filter)
//     are kept per screen or app-wide, so they survive reaching the same page again by another route
import { createContext, useCallback, useContext, useState } from 'react'

const mem = new Map<string, unknown>()
export const ViewKey = createContext('root')

export function viewKeyFor(prefix: string, depth: number, name: string, params?: unknown) {
  let p = ''
  try { p = params ? JSON.stringify(params) : '' } catch { p = '' }
  return `${prefix}:${depth}:${name}:${p}`
}

/** Where a remembered value lives: this visit only (the default), every visit to this screen, or everywhere. */
export type MemoryScope = 'view' | 'screen' | 'global'

function scopedKey(vk: string, name: string, scope: MemoryScope) {
  if (scope === 'global') return `G|${name}`
  if (scope === 'screen') {
    const [prefix, , route] = vk.split(':')
    return `S:${route === 'root' ? `${prefix}:root` : route}|${name}`
  }
  return `${vk}|${name}`
}

/** useState that survives leaving and coming back to the same view. */
export function useRemember<T>(name: string, init: T | (() => T), scope: MemoryScope = 'view'): [T, (v: T | ((prev: T) => T)) => void] {
  const key = scopedKey(useContext(ViewKey), name, scope)
  const [v, setV] = useState<T>(() => (mem.has(key) ? (mem.get(key) as T) : typeof init === 'function' ? (init as () => T)() : init))
  const set = useCallback((nv: T | ((prev: T) => T)) => {
    setV((prev) => {
      const next = typeof nv === 'function' ? (nv as (p: T) => T)(prev) : nv
      mem.set(key, next)
      return next
    })
  }, [key])
  return [v, set]
}

const ROOT_SCROLL_MS = 15 * 60 * 1000
const isRoot = (vk: string) => { const [prefix, depth] = vk.split(':'); return prefix !== 'ov' && depth === '0' }

/** The scroll position to come back to. A tab root's only holds for the same game day and a short while. */
export function rememberedScroll(viewKey: string, date?: string): number {
  const s = mem.get(`${viewKey}|scroll`) as { top: number; date?: string; at: number } | undefined
  if (!s) return 0
  if (isRoot(viewKey) && (s.date !== date || Date.now() - s.at > ROOT_SCROLL_MS)) return 0
  return s.top
}
export function saveScroll(viewKey: string, top: number, date?: string) { mem.set(`${viewKey}|scroll`, { top, date, at: Date.now() }) }

/** A view opened afresh: forget its scroll and its own state from any earlier visit (screen and app-wide
 * preferences stay). */
export function forgetView(viewKey: string) {
  const p = `${viewKey}|`
  for (const k of [...mem.keys()]) if (k.startsWith(p)) mem.delete(k)
}
/** Forget everything (new career / loaded save). */
export function clearMemory() { mem.clear() }
