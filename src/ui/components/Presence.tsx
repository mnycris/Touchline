// Popups leave the way they arrived. Wrap anything that appears and disappears (a match moment, a toast, a panel) in
// <Presence id={...}>: when the id changes or the content goes away, the content last shown stays on screen for its
// exit animation (see .presence-leaving in screens.css) instead of vanishing, while the next one comes in as usual.
// A new id is a new popup; the same id simply re-renders.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface Gone { key: string; node: ReactNode }
let seq = 0

export function Presence({ id, children, exitMs = 240 }: { id?: string | number | null; children?: ReactNode; exitMs?: number }) {
  const key = id == null ? undefined : String(id)
  const shown = key !== undefined && children != null && children !== false
  const [gone, setGone] = useState<Gone[]>([])
  const committed = useRef<{ key?: string; node?: ReactNode }>({})
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  // after every commit: remember what is on screen; when it is replaced or removed, keep it for its exit
  useLayoutEffect(() => {
    const prev = committed.current
    if (prev.key !== undefined && prev.key !== (shown ? key : undefined)) {
      const g: Gone = { key: `${prev.key}:${++seq}`, node: prev.node }
      setGone((list) => [...list, g])
      timers.current.push(window.setTimeout(() => setGone((list) => list.filter((x) => x !== g)), exitMs))
    }
    committed.current = shown ? { key, node: children } : {}
  })
  return (
    <>
      {gone.map((g) => <div key={g.key} className="presence presence-leaving" aria-hidden>{g.node}</div>)}
      {shown && <div key={`now:${key}`} className="presence">{children}</div>}
    </>
  )
}
