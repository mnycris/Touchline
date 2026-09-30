// Messaging-style negotiation log: replies arrive after a typing indicator, never instantly.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../../store/game'

export interface ChatLine { by: 'me' | 'them' | 'system'; text: string; who?: string; tone?: 'good' | 'bad' | 'neutral' }

/** Queue replies behind a typing indicator whose length depends on the message. */
export function useTypingChat(initial: ChatLine[]) {
  const [lines, setLines] = useState<ChatLine[]>(initial)
  const [typing, setTyping] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const timers = useRef<number[]>([])
  // clear pending replies only on a real unmount: React's strict-mode remount runs this cleanup too, and cancelling
  // there would leave a message "typing" forever with its answers never shown
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; const t = timers.current; window.setTimeout(() => { if (!alive.current) t.forEach((x) => window.clearTimeout(x)) }, 0) }
  }, [])
  const busy = typing !== null || pending > 0
  const send = (mine: ChatLine | null, replies: ChatLine[], done?: () => void) => {
    if (mine) setLines((l) => [...l, mine])
    if (replies.length) setPending((n) => n + replies.length)
    let at = 350
    replies.forEach((r) => {
      const think = 650 + Math.min(2300, r.text.length * 17) + Math.random() * 450
      timers.current.push(window.setTimeout(() => setTyping(r.who || 'them'), at))
      at += think
      timers.current.push(window.setTimeout(() => { setTyping(null); setPending((n) => Math.max(0, n - 1)); setLines((l) => [...l, r]); haptic(r.tone === 'good' ? 'medium' : 'light') }, at))
      at += 380
    })
    if (!replies.length) setTyping(null)
    if (done) timers.current.push(window.setTimeout(done, at))
  }
  return { lines, typing, busy, send, setLines }
}

export function ChatLog({ lines, typing, avatar }: { lines: ChatLine[]; typing: string | null; avatar?: (who?: string) => ReactNode }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [lines.length, typing])
  return (
    <div className="chat">
      {lines.map((l, i) => {
        const prev = lines[i - 1]
        const grouped = prev && prev.by === l.by && prev.who === l.who
        if (l.by === 'system') return <div key={i} className="chat-sys">{l.text}</div>
        return (
          <div key={i} className={`chat-row ${l.by} ${grouped ? 'grouped' : ''}`}>
            {l.by === 'them' && <div className="chat-av">{!grouped && avatar?.(l.who)}</div>}
            <div className={`chat-bubble ${l.by} ${l.tone || ''}`}>
              {l.by === 'them' && !grouped && l.who && <div className="chat-who">{l.who}</div>}
              {l.text}
            </div>
          </div>
        )
      })}
      {typing && (
        <div className="chat-row them">
          <div className="chat-av">{avatar?.(typing)}</div>
          <div className="chat-bubble them typing" aria-label={`${typing} is typing`}><i /><i /><i /></div>
        </div>
      )}
      <div ref={end} />
    </div>
  )
}

/** Patience / mood meter for the other side of the table. */
export function MoodMeter({ v, label }: { v: number; label?: string }) {
  const x = Math.max(0, Math.min(100, v))
  const txt = x >= 70 ? 'Positive' : x >= 45 ? 'Calm' : x >= 25 ? 'Tense' : 'Losing patience'
  const col = x >= 70 ? 'var(--pos)' : x >= 45 ? '#9bd35a' : x >= 25 ? 'var(--warn)' : 'var(--neg)'
  return (
    <div className="mood">
      <div className="row between tiny"><span className="dim">{label || 'Mood'}</span><b style={{ color: col }}>{txt}</b></div>
      <div className="mood-track"><i style={{ width: `${x}%`, background: col }} /></div>
    </div>
  )
}
