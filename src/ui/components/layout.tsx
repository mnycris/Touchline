import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { rememberedScroll, saveScroll, ViewKey } from '../memory'
import { Icon } from '../icons/Icon'
import { haptic, useGame } from '../../store/game'
import { unreadCount } from '../../engine/world/messages'

/** Scrollable screen body with an optional sticky top bar. */
export function Screen({ title, sub, children, back, right, noNav, noTop, className, onBack, scrollKey, footer, style }: {
  title?: ReactNode; sub?: ReactNode; children: ReactNode; back?: boolean; right?: ReactNode; noNav?: boolean; noTop?: boolean; className?: string; onBack?: () => void; scrollKey?: string; footer?: ReactNode; style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const vk = useContext(ViewKey)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (scrollKey !== undefined) ref.current?.scrollTo({ top: 0 })
  }, [scrollKey])
  // come back to where you were: restore the scroll position once content has laid out, and keep it updated
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const top = rememberedScroll(vk)
    if (top) { el.scrollTop = top; requestAnimationFrame(() => { if (el.scrollTop < top) el.scrollTop = top }) }
    const onScroll = () => saveScroll(vk, el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [vk])
  return (
    <>
      {!noTop && <TopBar title={title} sub={sub} back={back} right={right} onBack={onBack} />}
      <div ref={ref} style={style} className={`screen ${noNav ? 'no-nav' : ''} ${noTop ? 'no-top' : ''} ${footer ? 'has-footer' : ''} ${className || ''}`}>{children}</div>
      {footer}
    </>
  )
}

export function TopBar({ title, sub, back, right, onBack }: { title?: ReactNode; sub?: ReactNode; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  const goBack = useGame((s) => s.back)
  return (
    <div className="topbar">
      {back && (
        <button className="iconbtn" aria-label="Back" onClick={() => { haptic(); (onBack || goBack)() }}>
          <Icon name="back" size={22} />
        </button>
      )}
      <div className="grow" style={{ minWidth: 0 }}>
        {typeof title === 'string' ? <div className="title ellipsis">{title}</div> : title}
        {sub && <div className="tiny dim ellipsis" style={{ marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

/** The standard hub top-right cluster: inbox + settings. */
export function HubActions() {
  const w = useGame((s) => s.world)
  useGame((s) => s.v)
  const go = useGame((s) => s.go)
  const n = w ? unreadCount(w) : 0
  return (
    <div className="row tight">
      {w?.meta.editMode && <span className="edit-flag" title="Edit Mode career" aria-label="Edit Mode career"><Icon name="edit" size={13} strokeWidth={2.2} /></span>}
      <button className="iconbtn" aria-label="Inbox" onClick={() => go({ name: 'inbox' })}>
        <Icon name="inbox" size={21} />
        {n > 0 && <span className="dot">{n > 99 ? '99+' : n}</span>}
      </button>
      <button className="iconbtn" aria-label="Settings" onClick={() => go({ name: 'settings' })}>
        <Icon name="settings" size={21} />
      </button>
    </div>
  )
}

const NAV: { tab: 'central' | 'squad' | 'transfers' | 'academy' | 'season'; label: string; icon: string }[] = [
  { tab: 'central', label: 'Central', icon: 'central' },
  { tab: 'squad', label: 'Squad', icon: 'squad' },
  { tab: 'transfers', label: 'Transfers', icon: 'transfers' },
  { tab: 'academy', label: 'Academy', icon: 'academy' },
  { tab: 'season', label: 'Season', icon: 'season' },
]

export function BottomNav() {
  const tab = useGame((s) => s.tab)
  const setTab = useGame((s) => s.setTab)
  return (
    <nav className="bottomnav">
      {NAV.map((n) => (
        <button key={n.tab} className={`navitem ${tab === n.tab ? 'on' : ''}`} onClick={() => setTab(n.tab)} aria-label={n.label}>
          <Icon name={n.icon} size={24} />
          <span>{n.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function Tabs<T extends string>({ items, value, onChange, sticky }: { items: { id: T; label: ReactNode; badge?: number }[]; value: T; onChange: (v: T) => void; sticky?: boolean }) {
  return (
    <div className={`tabs ${sticky ? 'sticky' : ''}`}>
      {items.map((i) => (
        <button key={i.id} className={`tab ${value === i.id ? 'on' : ''}`} onClick={() => { haptic(); onChange(i.id) }}>
          {i.label}
          {!!i.badge && <span className="pill" style={{ marginLeft: 6, background: 'var(--neg)', color: '#fff', height: 17, padding: '0 5px' }}>{i.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function Seg<T extends string | number>({ items, value, onChange, small }: { items: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className="seg">
      {items.map((i) => (
        <button key={String(i.id)} className={value === i.id ? 'on' : ''} style={small ? { height: 30, fontSize: 12 } : undefined} onClick={() => { haptic(); onChange(i.id) }}>{i.label}</button>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ items, value, onChange }: { items: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {items.map((i) => (
        <button key={String(i.id)} className={`chip ${value === i.id ? 'on' : ''}`} onClick={() => { haptic(); onChange(i.id) }}>{i.label}</button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode }) {
  return (
    <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onChange(!on) }}>
      <div className="meta">
        <div className="t">{label}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      <span className={`switch ${on ? 'on' : ''}`}><i /></span>
    </button>
  )
}

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, left, right, fmt }: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; left?: string; right?: string; fmt?: (v: number) => ReactNode }) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <div style={{ padding: '6px 0' }}>
      <div className="row between">
        <span className="small b">{label}</span>
        <span className="num b" style={{ color: 'var(--club2)' }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} style={{ ['--p' as any]: `${p}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      {(left || right) && <div className="row between tiny dim" style={{ marginTop: -4 }}><span>{left}</span><span>{right}</span></div>}
    </div>
  )
}

/** Bottom sheet rendered into the app frame. */
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setHost(document.getElementById('sheet-host')) }, [])
  // stays mounted for its exit so it slides away instead of vanishing (showing what it last showed)
  const [shown, setShown] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const last = useRef<{ children: ReactNode; title?: ReactNode }>({ children, title })
  if (open) last.current = { children, title }
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return }
    if (!shown) return
    setLeaving(true)
    const t = window.setTimeout(() => { setShown(false); setLeaving(false) }, 230)
    return () => window.clearTimeout(t)
  }, [open])
  if ((!open && !shown) || !host) return null
  const view = open ? { children, title } : last.current
  return createPortal(
    <>
      <div className={`sheet-backdrop ${leaving ? 'fade-out' : 'fade-in'}`} onClick={leaving ? undefined : onClose} />
      <div className={`sheet ${leaving ? 'sheet-out' : 'sheet-in'}`} role="dialog">
        <div className="grab" />
        {view.title && <div className="row between" style={{ marginBottom: 10 }}><div className="h3">{view.title}</div><button className="iconbtn" style={{ width: 34, height: 34 }} onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></div>}
        {view.children}
      </div>
    </>,
    host,
  )
}

export function Confirm({ open, title, text, confirm = 'Confirm', danger, onConfirm, onClose }: { open: boolean; title: string; text?: ReactNode; confirm?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {text && <div className="muted" style={{ marginBottom: 16 }}>{text}</div>}
      <div className="row">
        <button className="btn grow" onClick={onClose}>Cancel</button>
        <button className={`btn grow ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose() }}>{confirm}</button>
      </div>
    </Sheet>
  )
}

export function SectionTitle({ title, action, onAction }: { title: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="section-title">
      <div className="h3">{title}</div>
      {action && <button className="link" onClick={() => { haptic(); onAction?.() }}>{action}</button>}
    </div>
  )
}

export function KV({ k, v, sub }: { k: ReactNode; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kv">
      <div className="label">{k}</div>
      <div className="kv-v">{v}</div>
      {sub && <div className="tiny dim">{sub}</div>}
    </div>
  )
}

/** A number with − / + for small steps (hold to repeat, speeding up) and a tap on the value to type it straight in. */
export function Stepper({ value, onChange, min, max, step = 1, fmt, label, money, presets }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => ReactNode; label?: string; money?: boolean; presets?: number[] }) {
  const clampV = (v: number) => Math.max(min, Math.min(max, v))
  const set = (v: number) => { haptic(); onChange(clampV(v)) }
  const [pad, setPad] = useState(false)
  // hold to repeat: the value is tracked locally so each repeat builds on the last
  const cur = useRef(value)
  cur.current = value
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const stop = () => { window.clearTimeout(timer.current); timer.current = undefined }
  const hold = (dir: 1 | -1) => {
    let n = 0
    fired.current = false
    const tick = () => {
      n++
      fired.current = true
      const mult = n > 24 ? 10 : n > 10 ? 4 : 1
      const next = clampV(cur.current + dir * step * mult)
      if (next === cur.current) { stop(); return }
      cur.current = next
      onChange(next)
      if (n % 4 === 0) haptic()
      timer.current = window.setTimeout(tick, n < 4 ? 140 : 70)
    }
    timer.current = window.setTimeout(tick, 380)
  }
  useEffect(() => stop, [])
  const isMoney = money ?? (max >= 100_000 && !!fmt)
  return (
    <div className="stepper">
      <button onClick={() => { if (fired.current) { fired.current = false; return } set(value - step) }} onPointerDown={() => hold(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} disabled={value <= min} aria-label="Decrease"><Icon name="minus" size={18} /></button>
      <button className="num stepper-v" onClick={() => { haptic(); setPad(true) }} aria-label="Type a value">{fmt ? fmt(value) : value}</button>
      <button onClick={() => { if (fired.current) { fired.current = false; return } set(value + step) }} onPointerDown={() => hold(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} disabled={value >= max} aria-label="Increase"><Icon name="plus" size={18} /></button>
      <NumberPad open={pad} onClose={() => setPad(false)} value={value} min={min} max={max} money={isMoney} fmt={fmt} label={label} presets={presets} onDone={(v) => { onChange(clampV(v)); setPad(false) }} />
    </div>
  )
}

/** Type a number: a keypad (with K / M for money), range shown and enforced, quick presets where they help. */
export function NumberPad({ open, onClose, value, min, max, money, fmt, label, presets, onDone }: { open: boolean; onClose: () => void; value: number; min: number; max: number; money?: boolean; fmt?: (v: number) => ReactNode; label?: string; presets?: number[]; onDone: (v: number) => void }) {
  const [txt, setTxt] = useState('')
  useEffect(() => { if (open) setTxt('') }, [open])
  const parse = (t: string): number | undefined => {
    if (!t) return undefined
    const m = t.match(/^(-?\d*\.?\d*)([KMB]?)$/)
    if (!m || m[1] === '' || m[1] === '-' || m[1] === '.') return undefined
    const k = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : 1
    return Math.round(Number(m[1]) * k)
  }
  const v = parse(txt)
  const out = v != null && (v < min || v > max)
  const press = (k: string) => {
    haptic()
    if (k === '⌫') { setTxt(txt.slice(0, -1)); return }
    if ('KMB'.includes(k)) { if (/\d$/.test(txt)) setTxt(txt.replace(/[KMB]$/, '') + k); return }
    if (/[KMB]$/.test(txt)) return
    if (k === '.' && (txt.includes('.') || !money)) return
    if (k === '-' ) { setTxt(txt.startsWith('-') ? txt.slice(1) : `-${txt}`); return }
    if (txt.replace(/[^\d]/g, '').length >= 12) return
    setTxt(txt + k)
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', money ? '.' : min < 0 ? '-' : '', '0', '⌫']
  const quick = presets ?? (money ? [] : max <= 130 && min >= 0 ? [15, 30, 45, 60, 75, 90].filter((x) => x >= min && x <= max) : [])
  return (
    <Sheet open={open} onClose={onClose} title={label || 'Enter a value'}>
      <div className={`np-display ${out ? 'out' : ''}`} onKeyDown={(e) => { if (/^[\d.]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (/^[kmb]$/i.test(e.key)) press(e.key.toUpperCase()); else if (e.key === 'Enter' && v != null && !out) onDone(v) }} tabIndex={0}>
        <span className="np-txt">{txt ? txt : <span className="dim">{fmt ? fmt(value) : value}</span>}</span>
        <span className="np-caret" />
      </div>
      <div className="np-sub tiny">
        {v != null && fmt ? <b>{fmt(Math.max(min, Math.min(max, v)))}</b> : <span className="dim">Now {fmt ? fmt(value) : value}</span>}
        <span className="dim">{out ? 'Out of range: ' : 'Range '}{fmt ? fmt(min) : min} – {fmt ? fmt(max) : max}</span>
      </div>
      {quick.length > 0 && <div className="np-quick">{quick.map((q) => <button key={q} className="chip sm" onClick={() => { haptic(); onDone(q) }}>{fmt ? fmt(q) : q}</button>)}</div>}
      <div className="np-keys">
        {keys.map((k, i) => k ? <button key={i} className={`np-k ${k === '⌫' ? 'fn' : ''}`} onClick={() => press(k)}>{k === '⌫' ? <Icon name="back" size={20} /> : k}</button> : <span key={i} />)}
        {money && ['K', 'M', 'B'].map((k) => <button key={k} className="np-k unit" onClick={() => press(k)}>{k === 'K' ? 'thousand' : k === 'M' ? 'million' : 'billion'}</button>)}
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={v == null || out} onClick={() => v != null && onDone(v)}><Icon name="check" size={17} /> Set {v != null && !out && fmt ? fmt(v) : ''}</button>
    </Sheet>
  )
}
