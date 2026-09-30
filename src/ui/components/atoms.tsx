import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { Club, Player, Position, World } from '../../domain/types'
import { GROUP_COLOR, POS_GROUP } from '../../domain/constants'
import darkLogos from '../../data/darkLogos.json'
import { badgeUrls, compLogoUrls, faceUrls, flagUrl, isFailed, managerWikiQuery, markFailed, markLoaded, playerWikiQuery, wikiPhoto, type WikiQuery } from '../../services/assets'
import { Silhouette } from './Silhouette'
import { Icon } from '../icons/Icon'
import { ovrColor } from '../../domain/ratings'
import { hashString } from '../../domain/rng'

/** <img> that walks a list of sources and finally renders a fallback node. Remote images never send a Referer. */
export function ImgChain({ srcs, alt, style, className, fallback }: { srcs: string[]; alt: string; style?: CSSProperties; className?: string; fallback: ReactNode }) {
  const list = useMemo(() => srcs.filter((s) => !isFailed(s)), [srcs.join('|')])
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [list.join('|')])
  if (i >= list.length) return <>{fallback}</>
  return (
    <img src={list[i]} alt={alt} style={style} className={className} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
      onError={() => { markFailed(list[i]); setI(i + 1) }} />
  )
}

/** Resolve a verified Wikipedia photo once the synchronous sources are exhausted. */
function useWiki(q: WikiQuery | undefined, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!q || !enabled) return
    let alive = true
    wikiPhoto(q).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [q?.key, enabled])
  return url
}

type FaceLike = Player | { id: number; regen?: boolean; faceSeed?: number; nation?: string; name?: string; jersey?: number; fullName?: string; dob?: string; ovr?: number; intlRep?: number }

export function Face({ p, size = 48, radius = 12, club, ring }: { p: FaceLike; size?: number; radius?: number; club?: Club; ring?: string }) {
  const seed = (p as Player).faceSeed ?? hashString(String(p.id))
  const kit = club?.kit?.[0] || '#2a3346'
  const trim = club?.kit?.[1] || '#ffffff'
  const srcs = useMemo(() => faceUrls(p as Player).filter((u) => !isFailed(u)), [p.id])
  const [i, setI] = useState(0)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setI(0); setLoaded(false) }, [p.id])
  const pl = p as Player
  const notable = !!pl.fullName && !!pl.dob && !pl.regen && ((pl.intlRep || 0) >= 2 || (pl.ovr || 0) >= 74)
  const wiki = useWiki(notable ? playerWikiQuery(pl) : undefined, notable && i >= srcs.length)
  const src = i < srcs.length ? srcs[i] : wiki || undefined
  return (
    <div className="face" style={{ width: size, height: size, borderRadius: radius, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      {!loaded && <Silhouette size={size} kit={kit} trim={trim} number={pl.jersey} seed={seed} />}
      {src && (
        <img key={src} src={src} alt={pl.name || ''} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
          className={src === wiki ? 'wiki' : undefined}
          style={{ position: loaded ? 'static' : 'absolute', inset: 0, opacity: loaded ? 1 : 0, transition: 'opacity .3s' }}
          onLoad={() => { setLoaded(true); markLoaded(src) }} onError={() => { markFailed(src); setLoaded(false); if (i < srcs.length) setI(i + 1) }} />
      )}
    </div>
  )
}

const MONO_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']
export function initials(name: string) {
  const parts = name.replace(/^(Dr\.|Sir)\s+/, '').split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Person avatar: real photo when available, otherwise a clean monogram (staff, custom managers, agents). */
export function Avatar({ name, photo, size = 40, radius, color }: { name: string; photo?: string | null; size?: number; radius?: number; color?: string }) {
  const [ok, setOk] = useState(true)
  const c = color || MONO_COLORS[hashString(name) % MONO_COLORS.length]
  const r = radius ?? size / 2
  return (
    <div className="avatar" style={{ width: size, height: size, borderRadius: r, ['--av' as any]: c, fontSize: size * 0.38 }}>
      {photo && ok ? <img src={photo} alt={name} referrerPolicy="no-referrer" loading="lazy" onError={() => setOk(false)} /> : <span>{initials(name)}</span>}
    </div>
  )
}

/** Real-world manager portrait (verified Wikipedia lead image), monogram while loading or when none exists. */
export function ManagerAvatar({ name, size = 40, radius, real = true, color }: { name: string; size?: number; radius?: number; real?: boolean; color?: string }) {
  const url = useWiki(real ? managerWikiQuery(name) : undefined, real)
  return <Avatar name={name} photo={url} size={size} radius={radius} color={color} />
}

export function Crest({ club, size = 36 }: { club: { name: string; abbr: string; kit: [string, string]; theme: string }; size?: number }) {
  const [a, b] = club.kit || ['#334', '#fff']
  const light = (h: string) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 }
  const main = light(a) ? club.theme || '#223' : a
  const txt = light(main) ? '#111' : '#fff'
  return (
    <svg width={size} height={size} viewBox="0 0 40 44" style={{ display: 'block' }}>
      <path d="M20 1.5 37 6v14c0 11-7.5 18.5-17 22C10.5 38.5 3 31 3 20V6Z" fill={main} stroke={b} strokeWidth="2.2" />
      <path d="M20 1.5 37 6v14c0 11-7.5 18.5-17 22Z" fill="rgba(255,255,255,.1)" />
      <text x="20" y="26" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" fontWeight="800" fontSize={club.abbr.length > 3 ? 9 : 11} fill={txt}>{club.abbr}</text>
    </svg>
  )
}

const DARK_CLUBS = new Set((darkLogos as { clubs: number[] }).clubs)
const DARK_COMPS = new Set((darkLogos as { comps: string[] }).comps)

export function Badge({ club, size = 32, style }: { club?: Club; size?: number; style?: CSSProperties }) {
  if (!club) return <div style={{ width: size, height: size }} />
  return (
    <div className={DARK_CLUBS.has(club.id) ? 'logo-lift' : undefined} style={{ width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', ...style }}>
      <ImgChain srcs={badgeUrls(club)} alt={club.name} className="badge-img" style={{ width: size, height: size }} fallback={<Crest club={club} size={size} />} />
    </div>
  )
}

export function Flag({ w, nation, code, size = 18 }: { w?: World; nation?: string; code?: string; size?: number }) {
  const url = code ? `${import.meta.env.BASE_URL}assets/flags/${code}.svg` : nation ? flagUrl(w, nation) : undefined
  if (!url) return null
  return <img className="flag" src={url} alt={nation || code || ''} style={{ width: size * 1.33, height: size }} loading="lazy" />
}

/** Competition logo in its official colours; designed emblem when no licensed art exists. */
export function CompLogo({ k, size = 32, name, color }: { k: string; size?: number; name?: string; color?: string; mono?: boolean }) {
  const srcs = compLogoUrls(k)
  if (srcs.length) {
    return <ImgChain srcs={srcs} alt={name || k} className={`comp-logo ${DARK_COMPS.has(k.replace(/-\d+$/, '')) ? 'lift' : ''}`} style={{ height: size, maxWidth: size * 1.6, objectFit: 'contain', display: 'block' }} fallback={<CompEmblem k={k} size={size} name={name} color={color} />} />
  }
  return <CompEmblem k={k} size={size} name={name} color={color} />
}

const EMBLEM_COLORS: Record<string, [string, string]> = {
  UECL: ['#1FCB6B', '#062414'], FACUP: ['#E8112D', '#2B0308'], EFLCUP: ['#009A4E', '#032012'], CDR: ['#C8102E', '#2A0409'],
  SUPERCOPA: ['#F2B707', '#2A1F00'], DFB: ['#D4AF37', '#221A05'], DFLSC: ['#C9C9C9', '#18191c'], CI: ['#0B5CAD', '#03172B'],
  SCI: ['#1D4F9C', '#05122a'], CDF: ['#1E3F9A', '#050f28'], TDC: ['#E1B12C', '#261c04'], KNVB: ['#F36C21', '#2a1003'],
  JCS: ['#E2231A', '#260504'], TACA: ['#C9A227', '#231c05'], SUPERTACA: ['#00A650', '#022210'], SCOTCUP: ['#005EB8', '#021833'],
  BELCUP: ['#E30613', '#2a0204'], TURCUP: ['#E30A17', '#2a0204'], COMMSHIELD: ['#BFC6D1', '#161a21'],
}

export function CompEmblem({ k, size = 32, name, color }: { k: string; size?: number; name?: string; color?: string }) {
  const base = k.replace(/-\d+$/, '')
  const [c1, c2] = EMBLEM_COLORS[base] || [color || '#3A6FD8', '#0a1428']
  const cup = !base.startsWith('L') && !base.startsWith('PO')
  const label = (name || base).replace(/^(UEFA|EFL|Emirates|Roshn)\s+/i, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`em${base}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
      </defs>
      {cup ? (
        <>
          <path d="M24 3 43 13v22L24 45 5 35V13Z" fill={`url(#em${base})`} stroke="rgba(255,255,255,.35)" strokeWidth="1.4" />
          <path d="M17 13h14v5a7 7 0 0 1-14 0Z M17 15h-3c0 4 1.6 5.6 3.8 6 M31 15h3c0 4-1.6 5.6-3.8 6 M24 25v4 M20 32h8l-1-3h-6Z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
          <text x="24" y="41" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="800" fontSize="7.5" fill="#fff" letterSpacing=".5">{label}</text>
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="21" fill={`url(#em${base})`} stroke="rgba(255,255,255,.35)" strokeWidth="1.4" />
          <circle cx="24" cy="24" r="15.5" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
          <text x="24" y="28.5" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="800" fontSize="13" fill="#fff">{label}</text>
        </>
      )}
    </svg>
  )
}

export function Ovr({ v, size = 'md', style }: { v: number | string; size?: 'sm' | 'md' | 'lg' | 'xl'; style?: CSSProperties }) {
  const fs = size === 'sm' ? 16 : size === 'lg' ? 30 : size === 'xl' ? 44 : 22
  const n = typeof v === 'number' ? v : Number(String(v).split('-')[0])
  const col = typeof v === 'number' ? ovrColor(n) : '#C9D1DB'
  return <div className="ovr num" style={{ fontSize: fs, color: col, borderColor: `${col}55`, ...style }}>{typeof v === 'number' && size === 'xl' ? <CountUp value={v} ms={600} /> : v}</div>
}

export function PosChip({ pos, style }: { pos: Position | string; style?: CSSProperties }) {
  const g = POS_GROUP[pos as Position] || 'MID'
  return <span className="pos-chip" style={{ background: GROUP_COLOR[g], ...style }}>{pos}</span>
}

export function Bar({ v, max = 100, color, h = 6 }: { v: number; max?: number; color?: string; h?: number }) {
  const pct = Math.max(0, Math.min(100, (v / max) * 100))
  const c = color || (pct >= 75 ? 'var(--pos)' : pct >= 50 ? '#9BE15D' : pct >= 30 ? 'var(--warn)' : 'var(--neg)')
  return <div className="bar" style={{ height: h }}><i style={{ width: `${pct}%`, background: c }} /></div>
}

export function Stars({ n, max = 5, size = 13, color = 'var(--gold)' }: { n: number; max?: number; size?: number; color?: string }) {
  return (
    <span className="row tight" style={{ gap: 1 }}>
      {Array.from({ length: max }, (_, i) => {
        const fill = Math.max(0, Math.min(1, n - i))
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs><linearGradient id={`st${i}${fill}`}><stop offset={fill} stopColor={color} /><stop offset={fill} stopColor="rgba(255,255,255,.18)" /></linearGradient></defs>
            <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.5 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9Z" fill={`url(#st${i}${fill})`} />
          </svg>
        )
      })}
    </span>
  )
}

export function StatRow({ label, v, max = 99, hidden, gain }: { label: string; v: number; max?: number; hidden?: boolean; gain?: number }) {
  const col = v >= 80 ? '#2ee58a' : v >= 70 ? '#9be15d' : v >= 60 ? '#f5d33f' : v >= 50 ? '#ffa23e' : '#ff5a5a'
  return (
    <div className="row" style={{ gap: 10, padding: '5px 0' }}>
      <div className="grow small muted ellipsis">{label}{!hidden && gain ? <span className={`attr-gain ${gain > 0 ? 'up' : 'down'}`} title="Recent change">{gain > 0 ? '▲' : '▼'}{Math.abs(gain)}</span> : null}</div>
      <div style={{ width: 88 }}>{hidden ? <div className="bar"><i style={{ width: '100%', background: 'rgba(255,255,255,.08)' }} /></div> : <Bar v={v} max={max} color={col} h={5} />}</div>
      <div className="num b" style={{ width: 26, textAlign: 'right', color: hidden ? 'var(--t3)' : col }}>{hidden ? '??' : v}</div>
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="col center" style={{ padding: '36px 24px', textAlign: 'center', gap: 10 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 30% 20%, rgba(var(--club-rgb),.5), rgba(255,255,255,.04))', border: '1px solid var(--line2)' }}>
        <Icon name={icon} size={30} />
      </div>
      <div className="h3">{title}</div>
      {text && <div className="muted small" style={{ maxWidth: 280 }}>{text}</div>}
      {action}
    </div>
  )
}

export function Ring({ v, size = 44, stroke = 5, color, label }: { v: number; size?: number; stroke?: number; color?: string; label?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, v / 100))
  const col = color || (v >= 70 ? 'var(--pos)' : v >= 45 ? 'var(--warn)' : 'var(--neg)')
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.1)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="center" style={{ position: 'absolute', inset: 0, fontFamily: 'var(--display)', fontWeight: 800, fontSize: size * 0.3 }}>{label ?? <CountUp value={v} />}</div>
    </div>
  )
}

export function FormPips({ form }: { form: ('W' | 'D' | 'L')[] }) {
  return (
    <span className="row tight" style={{ gap: 3 }}>
      {form.map((f, i) => (
        <span key={i} className="center" style={{ width: 17, height: 17, borderRadius: 5, fontSize: 10, fontWeight: 800, background: f === 'W' ? '#18b765' : f === 'D' ? '#6b7486' : '#e2414f', color: '#fff' }}>{f}</span>
      ))}
    </span>
  )
}

export function Sparkline({ values, w = 90, h = 28, color = 'var(--acc)' }: { values: number[]; w?: number; h?: number; color?: string }) {
  if (values.length < 2) return <svg width={w} height={h} />
  const min = Math.min(...values) - 0.5, max = Math.max(...values) + 0.5
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h}>
      <path d={`${d} L${w - 2},${h} L2,${h} Z`} fill={color} opacity={0.14} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.8} fill={color} />
    </svg>
  )
}

export function Radar({ values, labels, size = 200, color = 'rgba(var(--club-rgb),1)', compare }: { values: number[]; labels: string[]; size?: number; color?: string; compare?: number[] }) {
  const n = values.length
  const cx = size / 2, cy = size / 2, R = size / 2 - 26
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)]
  }
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ')
  return (
    <svg width={size} height={size}>
      {[25, 50, 75, 100].map((g) => <polygon key={g} points={poly(new Array(n).fill(g))} fill="none" stroke="rgba(255,255,255,.08)" />)}
      {values.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.06)" /> })}
      {compare && <polygon points={poly(compare)} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.5)" strokeDasharray="3 3" />}
      <polygon points={poly(values)} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={2} />
      {values.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r={3} fill="#fff" /> })}
      {labels.map((l, i) => {
        const [x, y] = pt(i, 122)
        return <text key={l} x={x} y={y + 4} textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="700" fontSize="12" fill="#aab3c3">{l} <tspan fill="#fff">{values[i]}</tspan></text>
      })}
    </svg>
  )
}

/** Animated number (ease-out count-up), used for budgets, ratings and scores. */
export function CountUp({ value, format = (v: number) => String(Math.round(v)), ms = 700, from }: { value: number; format?: (v: number) => string; ms?: number; from?: number }) {
  const [shown, setShown] = useState(from ?? value)
  useEffect(() => {
    const from = shown
    if (from === value) return
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(from + (value - from) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}

/** The career manager: real-world photo when playing as a real manager, monogram otherwise. */
export function UserAvatar({ w, size = 48, radius }: { w: World; size?: number; radius?: number }) {
  const u = w.user
  return u.realManager ? <ManagerAvatar name={u.realManager} size={size} radius={radius} /> : <Avatar name={`${u.firstName} ${u.lastName}`} size={size} radius={radius} color={u.avatarColor} />
}
