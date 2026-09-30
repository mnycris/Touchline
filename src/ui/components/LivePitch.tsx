// Live 2D match view: a properly proportioned (105×68) pitch with all 22 players as kit-coloured, numbered dots and a
// real football. It plays back what the match engine actually did each minute — the passes, carries, take-ons,
// crosses, tackles, shots and set pieces from the action log — and places the players with the engine's own shape
// model, so a high press, a deep block, a counter or an attack down the right look like what they are.
// Plus the FotMob-style momentum graph.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Club, World } from '../../domain/types'
import { formationOf } from '../../domain/constants'
import type { Act, MatchSim, MinuteFrame } from '../../engine/match/engine'
import { playerSpot, type Pt } from '../../engine/match/pitch'
import { Ball } from './Lineup'
import { PitchSurface } from './PitchSurface'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295 }

function hexRgb(h: string): [number, number, number] {
  const n = parseInt((h || '#888888').replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lum = (h: string) => { const [r, g, b] = hexRgb(h); return (r * 299 + g * 587 + b * 114) / 1000 }
const dist = (a: string, b: string) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }

/** Kit colours for both sides, switching the away side to its second colour on a clash. */
export function kitColors(home: Club, away: Club): [string, string] {
  const h = home.kit?.[0] || '#3ea6ff'
  let a = away.kit?.[0] || '#ff8a3d'
  if (dist(h, a) < 110) a = away.kit?.[1] && dist(h, away.kit[1]) >= 110 ? away.kit[1] : lum(h) > 150 ? '#1b2330' : '#f2f2f2'
  return [h, a]
}

const LABEL: Record<string, string> = {
  goal: 'GOAL', penGoal: 'GOAL', owngoal: 'OWN GOAL', save: 'SAVE', miss: 'OFF TARGET', chance: 'BLOCKED', woodwork: 'WOODWORK', penMiss: 'PENALTY MISSED',
  var: 'VAR · NO GOAL', corner: 'CORNER', freekick: 'FREE KICK', offside: 'OFFSIDE', foul: 'FOUL', yellow: 'YELLOW CARD', red: 'RED CARD', secondYellow: 'RED CARD',
  injury: 'INJURY', penalty: 'PENALTY',
}
/** Actions worth showing even when the minute has to be condensed. */
const KEY_ACT = new Set(['shot', 'goal', 'save', 'block', 'cross', 'corner', 'fk', 'pen', 'through', 'drib', 'tackle', 'int', 'clear', 'claim', 'off', 'foul', 'long'])
/** The side on the ball once an action is done. */
function sideAfter(a: Act): 0 | 1 {
  if (a.k === 'tackle' || a.k === 'int' || a.k === 'rec' || a.k === 'claim' || a.k === 'save' || a.k === 'block') return a.s
  if (!a.ok && (a.k === 'pass' || a.k === 'long' || a.k === 'through' || a.k === 'cross' || a.k === 'drib' || a.k === 'shot')) return (1 - a.s) as 0 | 1
  return a.s
}

interface Dot { id: number; no: number; side: 0 | 1; gk: boolean; slotX: number; slotY: number; pos: string; role: string }
interface Beat { ball: Pt; poss: 0 | 1; hold?: number; from?: { id: number; at: Pt }; dur: number; label?: string; net?: 0 | 1 }

/** Condense a minute's action log into the beats we can show at this speed. */
function beatsFor(f: MinuteFrame, budget: number): Beat[] {
  const acts = (f.acts || []).filter((a) => a.k !== 'rec' || a.ok)
  if (!acts.length) return [{ ball: { x: f.x, y: f.y }, poss: f.s, dur: 1 }]
  let pick = acts
  if (acts.length > budget) {
    const keep = new Set<number>()
    acts.forEach((a, i) => { if (KEY_ACT.has(a.k)) keep.add(i) })
    const rest = acts.map((_, i) => i).filter((i) => !keep.has(i))
    const room = Math.max(0, budget - keep.size)
    for (let k = 0; k < room && rest.length; k++) keep.add(rest[Math.floor((k + 0.5) * rest.length / room)])
    pick = acts.filter((_, i) => keep.has(i))
    if (pick.length > budget + 3) pick = pick.filter((a) => a.k !== 'pass' && a.k !== 'carry').slice(-budget)
  }
  return pick.map((a) => {
    const goal = a.k === 'goal'
    return {
      ball: { x: a.x1, y: a.y1 }, poss: goal ? a.s : sideAfter(a), hold: a.q ?? (a.ok ? a.p : undefined), from: { id: a.p, at: { x: a.x0, y: a.y0 } },
      dur: a.k === 'shot' || goal ? 0.5 : a.k === 'carry' || a.k === 'drib' ? 1.2 : 1,
      label: goal ? 'GOAL' : a.k === 'save' ? 'SAVE' : a.k === 'block' ? 'BLOCKED' : a.k === 'shot' && !a.ok ? 'OFF TARGET' : a.k === 'corner' ? 'CORNER' : a.k === 'off' ? 'OFFSIDE' : a.k === 'foul' ? 'FOUL' : a.k === 'pen' ? (a.ok ? 'GOAL' : 'PENALTY MISSED') : a.k === 'claim' ? 'CLAIMED' : undefined,
      net: goal || (a.k === 'pen' && a.ok) ? a.s : undefined,
    }
  })
}

export const LivePitch = memo(function LivePitch({ sim, w, speed, frameCount, home, away }: { sim: MatchSim; w: World; speed: number; frameCount: number; home: Club; away: Club }) {
  const [ball, setBall] = useState<Pt>({ x: 50, y: 50 })
  const [dur, setDur] = useState(600)
  const [poss, setPoss] = useState<0 | 1 | -1>(-1)
  const [holder, setHolder] = useState<number>()
  const [passer, setPasser] = useState<{ id: number; at: Pt }>()
  const [tag, setTag] = useState<{ text: string; x: number; y: number; k: string; id: number }>()
  const [net, setNet] = useState<{ side: 0 | 1; id: number }>()
  const [tick, setTick] = useState(0)
  const timers = useRef<number[]>([])
  const lastAt = useRef(0)
  const frameCountPrev = useRef(0)
  const [hc, ac] = useMemo(() => kitColors(home, away), [home.id, away.id])

  // players currently on the pitch, with their slots and roles (for the engine's shape model)
  const dots: Dot[] = useMemo(() => {
    const out: Dot[] = []
    for (const side of [0, 1] as const) {
      const f = formationOf(sim.sideFormation(side))
      for (const r of sim.liveRatings(side)) {
        if (!r.on) continue
        const s = f.slots[r.slot] || f.slots[0]
        out.push({ id: r.id, no: w.players[r.id]?.jersey || 0, side, gk: r.pos === 'GK', slotX: s.x, slotY: s.y, pos: r.pos, role: r.role || '' })
      }
    }
    return out
  }, [frameCount, sim.phase, sim.events.length])

  useEffect(() => {
    const frames = sim.timeline
    const f = frames[frames.length - 1]
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    const now = performance.now()
    const gap = now - lastAt.current
    lastAt.current = now
    const brk = sim.phase === 'HT' || sim.phase === 'ETHT' || sim.phase === 'pre' || sim.phase === 'PENS' || (sim.phase === 'FT' && !f)
    if (!f || brk) {
      setDur(700); setBall({ x: 50, y: 50 }); setPoss(-1); setHolder(undefined); setPasser(undefined); setTick((t) => t + 1)
      return
    }
    const minuteMs = 1000 / speed
    // fast-forwarding (seek / next break): snap to the minute's end state
    if (gap < minuteMs * 0.5 || frames.length - frameCountPrev.current > 1) {
      frameCountPrev.current = frames.length
      const last = f.acts?.[f.acts.length - 1]
      setDur(Math.max(60, Math.min(220, gap)))
      setBall({ x: clamp(f.x, -1, 101), y: f.y }); setPoss(f.s); setHolder(last?.q ?? last?.p); setPasser(undefined); setTick((t) => t + 1)
      return
    }
    frameCountPrev.current = frames.length
    // how many beats fit in a minute at this speed (about one every ~0.2s of screen time)
    const budget = clamp(Math.round(minuteMs / 190), 3, 16)
    const beats = beatsFor(f, budget)
    const unit = (minuteMs * 0.94) / beats.reduce((a, b) => a + b.dur, 0)
    let at = 0
    beats.forEach((bt, i) => {
      const ms = bt.dur * unit
      timers.current.push(window.setTimeout(() => {
        setDur(Math.max(90, ms * 0.9))
        setPasser(bt.from)
        setBall(bt.ball)
        setPoss(bt.poss)
        setHolder(bt.hold)
        setTick((t) => t + 1)
        if (bt.label) setTag({ text: bt.label, x: bt.ball.x, y: bt.ball.y, k: bt.label === 'GOAL' ? 'goal' : bt.label === 'SAVE' ? 'save' : 'play', id: frames.length * 100 + i })
        if (bt.net != null) setNet({ side: bt.net, id: frames.length })
      }, at))
      at += ms
    })
    // the minute's headline event (a card, an injury, a penalty award) gets a tag at the end
    const lateTag = LABEL[f.k] && !['goal', 'penGoal', 'owngoal', 'save', 'miss', 'chance', 'corner'].includes(f.k)
    if (lateTag) timers.current.push(window.setTimeout(() => setTag({ text: LABEL[f.k], x: f.x, y: f.y, k: f.k, id: frames.length * 100 + 99 }), Math.min(at, minuteMs * 0.9)))
    return () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = [] }
  }, [frameCount, sim.phase])

  useEffect(() => {
    if (!tag) return
    const t = window.setTimeout(() => setTag(undefined), 1500)
    return () => window.clearTimeout(t)
  }, [tag?.id])
  useEffect(() => {
    if (!net) return
    const t = window.setTimeout(() => setNet(undefined), 2600)
    return () => window.clearTimeout(t)
  }, [net?.id])

  // team shapes from the engine's positioning model around the ball
  const placed = useMemo(() => {
    const bx = clamp(ball.x, 0, 100), by = clamp(ball.y, 0, 100)
    const shapes = [sim.sideShape(0), sim.sideShape(1)]
    const out = dots.map((d) => {
      const own: Pt = d.side === 0 ? { x: bx, y: by } : { x: 100 - bx, y: 100 - by }
      const kickoff = poss === -1
      const inPoss = poss === d.side
      let p = playerSpot(d.slotX, d.slotY, d.pos, d.role, shapes[d.side], kickoff ? true : inPoss, kickoff ? { x: 25, y: 50 } : own)
      if (kickoff && !d.gk) p = { x: Math.min(p.x, 47), y: p.y }
      const j = 1.4
      const x = p.x + (hash(d.id, tick) - 0.5) * j
      const y = p.y + (hash(d.id + 7, tick) - 0.5) * j * 1.4
      return { d, x: d.side === 0 ? x : 100 - x, y: d.side === 0 ? y : 100 - y }
    })
    // the man on the ball is on the ball; the passer stays where he played it from
    for (const o of out) {
      if (holder === o.d.id) { o.x = bx + (o.d.side === 0 ? -1 : 1); o.y = by }
      else if (passer && passer.id === o.d.id && passer.id !== holder) { o.x = passer.at.x; o.y = passer.at.y }
    }
    // the nearest defender closes the ball down
    if (poss !== -1) {
      const def = out.filter((o) => o.d.side !== poss && !o.d.gk)
      if (def.length) {
        const near = def.reduce((a, b) => (Math.hypot(a.x - bx, (a.y - by) * 0.65) < Math.hypot(b.x - bx, (b.y - by) * 0.65) ? a : b))
        near.x += (bx + (poss === 0 ? 2.2 : -2.2) - near.x) * 0.55
        near.y += (by - near.y) * 0.55
      }
    }
    return out
  }, [dots, ball, poss, tick, holder, passer])

  const move = `${Math.round(dur)}ms`
  return (
    <PitchSurface className="lp" pad={2.4} goals field={<>
      {net && <span className={`lp-net ${net.side === 0 ? 'r' : 'l'}`} key={net.id} />}
      {placed.map(({ d, x, y }) => {
        const kit = d.gk ? (d.side === 0 ? '#f5d90a' : '#b16cf0') : d.side === 0 ? hc : ac
        return (
          <span key={d.id} className={`lp-dot ${d.gk ? 'gk' : ''} ${holder === d.id ? 'has' : ''}`}
            style={{ left: `${clamp(x, 1, 99)}%`, top: `${clamp(y, 2, 98)}%`, transition: `left ${move} ease-in-out, top ${move} ease-in-out`, ['--kit' as any]: kit, color: lum(kit) > 150 ? '#0b0d11' : '#fff' }}>
            {d.no || ''}
          </span>
        )
      })}
      <span className="lp-ball-shadow" style={{ left: `${clamp(ball.x, -1.5, 101.5)}%`, top: `${ball.y}%`, transition: `left ${move} ease-out, top ${move} ease-out` }} />
      <span className={`lp-ball ${dur > 150 ? 'rolling' : ''}`} style={{ left: `${clamp(ball.x, -1.5, 101.5)}%`, top: `${ball.y}%`, transition: `left ${move} ease-out, top ${move} ease-out` }}>
        <Ball size={11} />
      </span>
      {tag && <span key={tag.id} className={`lp-tag k-${tag.k}`} style={{ left: `${clamp(tag.x, 12, 88)}%`, top: `${clamp(tag.y - 12, 8, 90)}%` }}>{tag.text}</span>}
    </>} />
  )
})

/** FotMob-style momentum graph: per-minute pressure bars, home above the line and away below, with goals marked. */
export function MomentumGraph({ data, goals, colors, live, et }: { data: [number, number][]; goals: { key: number; side: 0 | 1 }[]; colors: [string, string]; live?: boolean; et?: boolean }) {
  const W = 300, H = 56, mid = H / 2
  const total = Math.max(data.length + (live ? 1 : 0), et ? 130 : 97)
  const bw = W / total
  const sm = data.map((_, i) => ((data[i - 1]?.[1] ?? data[i][1]) + 2 * data[i][1] + (data[i + 1]?.[1] ?? data[i][1])) / 4)
  const idxOf = (key: number) => { const i = data.findIndex((d) => d[0] >= key - 1e-6); return i < 0 ? data.length - 1 : i }
  const ht = data.findIndex((d) => d[0] >= 46)
  const ft = data.findIndex((d) => d[0] >= 91)
  return (
    <svg className="mom-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,.12)" strokeWidth=".6" />
      {ht > 0 && <line x1={ht * bw} y1="2" x2={ht * bw} y2={H - 2} stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" strokeWidth=".6" />}
      {ft > 0 && <line x1={ft * bw} y1="2" x2={ft * bw} y2={H - 2} stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" strokeWidth=".6" />}
      {sm.map((v, i) => {
        const h = Math.max(0.6, Math.pow(Math.abs(v), 0.6) * (mid - 7))
        return <rect key={i} x={i * bw + bw * 0.12} width={bw * 0.76} y={v >= 0 ? mid - h : mid} height={h} rx={bw * 0.2} fill={v >= 0 ? colors[0] : colors[1]} opacity={0.92} />
      })}
      {goals.map((g, i) => {
        const x = (idxOf(g.key) + 0.5) * bw
        return <g key={i} transform={`translate(${x - 4} ${g.side === 0 ? 0 : H - 8})`}><circle cx="4" cy="4" r="4" fill="#fff" /><circle cx="4" cy="4" r="1.6" fill="#15181c" /></g>
      })}
      {live && data.length > 0 && <rect x={data.length * bw} y="3" width="1" height={H - 6} fill="var(--acc)" />}
    </svg>
  )
}
