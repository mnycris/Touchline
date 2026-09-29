// Navigation memory: each view instance (tab, depth, route, params) remembers its tab, filters, sort and scroll
// position, so going back returns you exactly where you were. Kept for the session, not in the save.
import { createContext, useCallback, useContext, useState } from 'react'

const mem = new Map<string, unknown>()
export const ViewKey = createContext('root')

export function viewKeyFor(prefix: string, depth: number, name: string, params?: unknown) {
  let p = ''
  try { p = params ? JSON.stringify(params) : '' } catch { p = '' }
  return `${prefix}:${depth}:${name}:${p}`
}

/** useState that survives leaving and coming back to the same view. */
export function useRemember<T>(name: string, init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const key = `${useContext(ViewKey)}|${name}`
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

export function rememberedScroll(viewKey: string): number { return (mem.get(`${viewKey}|scroll`) as number) || 0 }
export function saveScroll(viewKey: string, top: number) { mem.set(`${viewKey}|scroll`, top) }
/** Forget everything (new career / loaded save). */
export function clearMemory() { mem.clear() }
