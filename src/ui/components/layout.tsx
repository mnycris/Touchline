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
  if (!open || !host) return null
  return createPortal(
    <>
      <div className="sheet-backdrop fade-in" onClick={onClose} />
      <div className="sheet sheet-in" role="dialog">
        <div className="grab" />
        {title && <div className="row between" style={{ marginBottom: 10 }}><div className="h3">{title}</div><button className="iconbtn" style={{ width: 34, height: 34 }} onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></div>}
        {children}
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

export function Stepper({ value, onChange, min, max, step = 1, fmt }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => ReactNode }) {
  const set = (v: number) => { haptic(); onChange(Math.max(min, Math.min(max, v))) }
  return (
    <div className="stepper">
      <button onClick={() => set(value - step)} disabled={value <= min} aria-label="Decrease"><Icon name="minus" size={18} /></button>
      <div className="num">{fmt ? fmt(value) : value}</div>
      <button onClick={() => set(value + step)} disabled={value >= max} aria-label="Increase"><Icon name="plus" size={18} /></button>
    </div>
  )
}
