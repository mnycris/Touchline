// Goal rewind: the move that led to a goal, replayed from the simulation's own action log. Every pass, carry,
// dribble, cross and the finish happened in the match; the replay only animates it: the ball travels each action,
// the players involved run onto it, the camera follows play and the net ripples at the end.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MatchEvent, ReplayStep, ShotInfo, World } from '../../domain/types'
import { Markings } from './PitchSurface'
import { Badge, Face } from './atoms'
import { Icon } from '../icons/Icon'
import { callName } from '../../engine/match/commentary'
import { haptic, useGame } from '../../store/game'
import { BallG } from './Glyphs'
import { PenaltyScene } from './PenaltyScene'

const L = 105, W = 68
const AIR = new Set(['long', 'cross', 'through', 'corner', 'clear', 'fk'])
const STILL = new Set(['rec', 'tackle', 'int', 'aerial', 'block', 'claim', 'save', 'foul'])

interface Seg { k: string; s: 0 | 1; p: number; q?: number; ok: boolean; a: [number, number]; b: [number, number]; t0: number; t1: number; air: number }
interface Track { id: number; side: 0 | 1; keys: { t: number; x: number; y: number }[]; first: number }

const WORD: Record<string, string> = { pass: 'Pass', long: 'Long ball', through: 'Through ball', cross: 'Cross', carry: 'Carry', drib: 'Dribble', shot: 'Shot', goal: 'Goal', tackle: 'Tackle', int: 'Interception', rec: 'Loose ball won', corner: 'Corner', fk: 'Free kick', throw: 'Throw-in', aerial: 'Header', clear: 'Clearance', gk: 'Goal kick', kick: 'Kick-off', foul: 'Foul' }

/** Build the timeline: ball segments with durations from real distances, and a track per player involved. */
function build(chain: ReplayStep[], side: 0 | 1, shot?: ShotInfo) {
  // always attacking left to right
  const fx = (x: number) => (side === 0 ? x : 100 - x), fy = (y: number) => (side === 0 ? y : 100 - y)
  const segs: Seg[] = []
  let t = 0.35
  let last: [number, number] | undefined
  for (const c of chain) {
    const a: [number, number] = [fx(c.x0) * L / 100, fy(c.y0) * W / 100]
    let b: [number, number] = [fx(c.x1) * L / 100, fy(c.y1) * W / 100]
    // the finish goes exactly where the shot map and the goal frame say it went (the match's own shot record)
    if (c.k === 'goal') b = [L + 1.6, shot && shot.res === 'goal' ? fy(shot.end[1]) * W / 100 : b[1]]
    // the ball gets from where the last action ended to where this one starts
    if (last && Math.hypot(last[0] - a[0], last[1] - a[1]) > 0.8) { segs.push({ k: 'bridge', s: c.s, p: c.p, ok: true, a: last, b: a, t0: t, t1: t + 0.14, air: 0 }); t += 0.14 }
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const dur = STILL.has(c.k) ? 0.38 : c.k === 'carry' || c.k === 'drib' ? Math.max(0.55, d / 6.8) : c.k === 'goal' || c.k === 'shot' ? Math.max(0.34, d / 27) : AIR.has(c.k) ? Math.max(0.6, d / 19) : Math.max(0.42, d / 16.5)
    segs.push({ k: c.k, s: c.s, p: c.p, q: c.q, ok: c.ok, a, b, t0: t, t1: t + dur, air: AIR.has(c.k) ? Math.min(1, d / 40) : 0 })
    t += dur + 0.05
    last = b
  }
  // player tracks: at the ball when they play it, arriving where a pass finds them
  const tracks = new Map<number, Track>()
  const key = (id: number, s: 0 | 1, tt: number, x: number, y: number) => {
    let tr = tracks.get(id)
    if (!tr) { tr = { id, side: s, keys: [], first: tt }; tracks.set(id, tr) }
    tr.keys.push({ t: tt, x, y })
  }
  for (const g of segs) {
    if (g.k === 'bridge') continue
    key(g.p, g.s, g.t0, g.a[0], g.a[1])
    if (g.k === 'carry' || g.k === 'drib') key(g.p, g.s, g.t1, g.b[0], g.b[1])
    if (g.k === 'foul' && g.q) {
      // the man fouled is on the ball; the one who fouled him backs off toward his own goal for the free kick
      key(g.q, (1 - g.s) as 0 | 1, g.t0, g.a[0] + (g.s === side ? 1.2 : -1.2), g.a[1])
      key(g.p, g.s, g.t1 + 0.4, g.a[0] + (g.s === side ? -3.4 : 3.4), g.a[1] + (g.a[1] > W / 2 ? -2.2 : 2.2))
    }
    if (g.q && g.k === 'drib') {
      // the man taken on is an opponent: met a stride into the run, then left behind turning to chase
      const o = (1 - g.s) as 0 | 1
      // shoulder to shoulder with the dribbler as he goes past (beside the run, on the side nearer the middle), then
      // left a few yards behind it, so the two never sit on top of each other however short the run
      const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], d = Math.hypot(dx, dy)
      const ux = d > 0.8 ? dx / d : 1, uy = d > 0.8 ? dy / d : 0
      let px = -uy, py = ux
      if ((g.a[1] + py * 3 - W / 2) ** 2 > (g.a[1] - py * 3 - W / 2) ** 2) { px = -px; py = -py }
      const mx = g.a[0] + dx * 0.32 + px * 2.6, my = g.a[1] + dy * 0.32 + py * 2.6
      key(g.q, o, g.t0 + (g.t1 - g.t0) * 0.28, mx, my)
      const back = Math.max(2.2, d * 0.35)
      key(g.q, o, g.t1, g.b[0] - ux * back + px * 2.4, g.b[1] - uy * back + py * 2.4)
    } else if (g.q && g.ok && !STILL.has(g.k) && g.k !== 'goal') key(g.q, g.s, g.t1, g.b[0], g.b[1])
  }
  for (const tr of tracks.values()) {
    tr.keys.sort((a, b) => a.t - b.t)
    // arriving from a few yards away, on the run
    const k0 = tr.keys[0]
    const dir = tr.side === (segs[0]?.s ?? 0) ? -1 : 1
    tr.keys.unshift({ t: Math.max(0, k0.t - 0.9), x: k0.x + dir * 6, y: k0.y + (k0.y > W / 2 ? 3 : -3) })
    tr.first = Math.max(0, k0.t - 0.9)
  }
  return { segs, tracks: [...tracks.values()], end: t + 0.2 }
}

function at(tr: Track, t: number): [number, number] {
  const k = tr.keys
  if (t <= k[0].t) return [k[0].x, k[0].y]
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const u = (t - k[i - 1].t) / Math.max(0.001, k[i].t - k[i - 1].t)
      const e = u * u * (3 - 2 * u)
      return [k[i - 1].x + (k[i].x - k[i - 1].x) * e, k[i - 1].y + (k[i].y - k[i - 1].y) * e]
    }
  }
  const z = k[k.length - 1]
  // after his part in it he keeps moving up with play
  const drift = Math.min(4, (t - z.t) * 1.6)
  return [z.x + drift, z.y]
}

function ballAt(segs: Seg[], t: number): { x: number; y: number; h: number; seg?: Seg } {
  if (!segs.length) return { x: L / 2, y: W / 2, h: 0 }
  if (t <= segs[0].t0) return { x: segs[0].a[0], y: segs[0].a[1], h: 0, seg: segs[0] }
  for (const g of segs) {
    if (t <= g.t1) {
      const u = Math.max(0, Math.min(1, (t - g.t0) / Math.max(0.001, g.t1 - g.t0)))
      const e = g.k === 'carry' || g.k === 'drib' ? u : 1 - Math.pow(1 - u, 1.6)
      return { x: g.a[0] + (g.b[0] - g.a[0]) * e, y: g.a[1] + (g.b[1] - g.a[1]) * e, h: g.air * Math.sin(Math.PI * u), seg: g }
    }
    if (t < g.t1 + 0.05) return { x: g.b[0], y: g.b[1], h: 0, seg: g }
  }
  const g = segs[segs.length - 1]
  return { x: g.b[0], y: g.b[1], h: 0, seg: g }
}

export function GoalReplay({ w, e, colors, home, away, onClose }: { w: World; e: MatchEvent; colors: [string, string]; home: number; away: number; onClose: () => void }) {
  const side = e.side as 0 | 1
  const { segs, tracks, end } = useMemo(() => build(e.chain || [], side, e.shot), [e])
  const reduce = useGame((s) => s.prefs.reduceMotion)
  const [t, setT] = useState(reduce ? end : 0)
  const [speed, setSpeed] = useState(1)
  const [run, setRun] = useState(!reduce)
  const [leaving, setLeaving] = useState(false)
  const cam = useRef({ x: segs[0]?.a[0] ?? L / 2, y: segs[0]?.a[1] ?? W / 2, z: 1 })
  const host = typeof document !== 'undefined' ? document.getElementById('sheet-host') : null
  useEffect(() => {
    if (!run) return
    let raf = 0, prev = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now
      setT((x) => { const n = x + dt * speed; if (n >= end + 1.4) { setRun(false); return end + 1.4 } return n })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [run, speed, end])
  const close = () => { haptic(); setLeaving(true); window.setTimeout(onClose, 220) }
  const replay = () => { haptic(); setT(0); lastReal.current = undefined; cam.current = { x: segs[0]?.a[0] ?? L / 2, y: segs[0]?.a[1] ?? W / 2, z: 1 }; setRun(true) }
  const ball = ballAt(segs, t)
  const scored = t >= (segs[segs.length - 1]?.t1 ?? end)
  // camera: follows the ball, eases in on the goal for the finish
  const finishing = ball.seg && (ball.seg.k === 'goal' || ball.seg.k === 'shot') || scored
  const tz = finishing ? 1.25 : 1
  const c = cam.current
  const ease = reduce ? 1 : 0.085
  c.x += (Math.min(L - 26, Math.max(26, ball.x + 6)) - c.x) * ease
  c.y += (Math.min(W - 14, Math.max(14, ball.y)) - c.y) * ease
  c.z += (tz - c.z) * 0.05
  const vw = 64 / c.z, vh = vw * 0.62
  const vx = reduce ? -3 : Math.min(L + 5 - vw, Math.max(-5, c.x - vw / 2)), vy = reduce ? -3 : Math.min(W + 5 - vh, Math.max(-5, c.y - vh / 2))
  const col = side === 0 ? colors[0] : colors[1], oppCol = side === 0 ? colors[1] : colors[0]
  // the caption holds the last real action through the short hops between them
  const lastReal = useRef<Seg | undefined>(undefined)
  if (ball.seg && ball.seg.k !== 'bridge') lastReal.current = ball.seg
  const cur = lastReal.current
  const actor = cur ? w.players[cur.p] : undefined
  const receiver = cur?.q && cur.ok ? w.players[cur.q] : undefined
  const scorer = e.player ? w.players[e.player] : undefined, assist = e.player2 ? w.players[e.player2] : undefined
  // the players on screen, each name under his marker unless it would run into another's, then above it (the man on
  // the ball keeps his place, the others give way)
  const placed = tracks.filter((tr) => t >= tr.first).map((tr) => {
    const [x, y] = at(tr, t)
    const onBall = !!cur && (cur.p === tr.id || (cur.q === tr.id && t > cur.t1 - 0.25))
    const nm = w.players[tr.id] ? callName(w.players[tr.id].name) : ''
    return { tr, x, y, ly: y + 3.6, onBall, half: nm.length * (onBall ? 0.68 : 0.6) }
  })
  const order = [...placed].sort((a, b) => Number(b.onBall) - Number(a.onBall))
  const boxes: { x: number; y: number; half: number }[] = []
  const hits = (x: number, y: number, half: number) => boxes.some((b) => Math.abs(b.x - x) < b.half + half + 0.4 && Math.abs(b.y - y) < 2.5)
    || placed.some((o) => Math.abs(o.x - x) < half + 1.5 && Math.abs(o.y - (y - 0.8)) < 2.2)
  for (const p of order) {
    for (const ly of [p.y + 3.6, p.y - 2.3, p.y + 6]) { if (!hits(p.x, ly, p.half)) { p.ly = ly; break } }
    boxes.push({ x: p.x, y: p.ly, half: p.half })
  }
  // the ball's recent path
  const trail: string[] = []
  for (let k = Math.max(0, t - 2.2); k <= t; k += 0.05) { const b = ballAt(segs, k); trail.push(`${b.x.toFixed(2)},${b.y.toFixed(2)}`) }
  if (!host) return null
  return createPortal(
    <>
      <div className={`sheet-backdrop ${leaving ? 'fade-out' : 'fade-in'}`} onClick={close} />
      <div className={`gr ${leaving ? 'out' : ''}`} role="dialog" aria-label="Goal replay">
        <div className="gr-head">
          <Badge club={w.clubs[side === 0 ? home : away]} size={26} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="gr-title">{e.type === 'owngoal' ? 'Own goal' : 'Goal'} · {e.min}{e.add ? `+${e.add}` : ''}'</div>
            <div className="tiny dim ellipsis">{scorer ? callName(scorer.name) : ''}{assist ? ` · assist ${callName(assist.name)}` : ''}{e.xg ? ` · xG ${e.xg.toFixed(2)}` : ''}</div>
          </div>
          <button className="iconbtn gr-x" onClick={close} aria-label="Close replay"><Icon name="close" size={18} /></button>
        </div>
        <div className={`gr-pitch ${scored ? 'scored' : ''}`}>
          <svg viewBox={`${vx.toFixed(2)} ${vy.toFixed(2)} ${(reduce ? L + 6 : vw).toFixed(2)} ${(reduce ? W + 6 : vh).toFixed(2)}`} preserveAspectRatio="xMidYMid slice">
            <rect x={-6} y={-6} width={L + 12} height={W + 12} fill="var(--pitch)" />
            <g opacity=".95"><Markings L={L} W={W} sw={0.9} /></g>
            {/* goals, the one being attacked with its net */}
            <rect x={-1.8} y={W / 2 - 3.66} width={1.8} height={7.32} fill="var(--pitch-goal)" stroke="var(--pitch-mark)" strokeWidth=".35" />
            <g className={`gr-net ${scored ? 'on' : ''}`}>
              <rect x={L} y={W / 2 - 3.66} width={2.2} height={7.32} fill="rgba(255,255,255,.05)" stroke="#e8ecf1" strokeWidth=".4" />
              {[0.2, 0.4, 0.6, 0.8].map((k) => <line key={k} x1={L} y1={W / 2 - 3.66 + 7.32 * k} x2={L + 2.2} y2={W / 2 - 3.66 + 7.32 * k} stroke="rgba(255,255,255,.14)" strokeWidth=".15" />)}
            </g>
            {/* passes already played, fading */}
            {segs.filter((g) => g.t1 < t && g.k !== 'bridge' && !STILL.has(g.k)).map((g, i) => (
              <line key={i} x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={g.s === side ? col : oppCol} strokeOpacity={Math.max(0.12, 0.5 - (t - g.t1) * 0.12)} strokeWidth=".35" strokeDasharray={g.k === 'carry' || g.k === 'drib' ? '.8 .7' : undefined} strokeLinecap="round" />
            ))}
            <polyline points={trail.join(' ')} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".3" strokeLinecap="round" />
            {placed.map(({ tr, x, y, ly, onBall }) => {
              const p = w.players[tr.id]
              const fade = Math.min(1, (t - tr.first) / 0.35)
              const c2 = tr.side === side ? col : oppCol
              return (
                <g key={tr.id} opacity={fade}>
                  {onBall && <circle cx={x} cy={y} r={2.6} fill="none" stroke={c2} strokeOpacity=".5" strokeWidth=".3" className="gr-halo" />}
                  <circle cx={x} cy={y} r={1.45} fill={c2} stroke="#fff" strokeWidth=".35" />
                  {p && <text x={x} y={ly} textAnchor="middle" className={`gr-name ${onBall ? 'on' : ''}`}>{callName(p.name)}</text>}
                </g>
              )
            })}
            <ellipse cx={ball.x + ball.h * 1.8} cy={ball.y + ball.h * 1.2} rx=".75" ry=".45" fill="rgba(0,0,0,.45)" />
            <BallG cx={ball.x} cy={ball.y - ball.h * 2.2} r={0.72 + ball.h * 0.5} own={e.type === 'owngoal'} />
          </svg>
          {scored && <div className="gr-goal" key="g"><span>GOAL</span></div>}
        </div>
        <div className="gr-cap">
          {cur && !scored ? (
            <div className="gr-step" key={`${cur.t0}`}>
              {actor && <Face p={actor} size={28} radius={14} club={w.clubs[cur.s === 0 ? home : away]} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small b ellipsis">{WORD[cur.k] || cur.k}{receiver && cur.k !== 'goal' ? ` → ${callName(receiver.name)}` : ''}</div>
                <div className="tiny dim ellipsis">{actor ? callName(actor.name) : ''}</div>
              </div>
            </div>
          ) : scored && scorer ? (
            <div className="gr-step done" key="end">
              <Face p={scorer} size={30} radius={15} club={w.clubs[side === 0 ? home : away]} />
              <div className="grow" style={{ minWidth: 0 }}><div className="small b ellipsis">{scorer.name}</div><div className="tiny dim">{e.score ? `${e.score[0]}–${e.score[1]}` : ''}{assist ? ` · assisted by ${callName(assist.name)}` : ''}</div></div>
            </div>
          ) : <div className="gr-step tiny dim">The move</div>}
          <div className="gr-ctrl">
            <button className="btn xs" onClick={() => { haptic(); setSpeed(speed === 1 ? 0.5 : 1) }}>{speed === 1 ? '1×' : '½×'}</button>
            <button className="btn xs primary" onClick={replay}><Icon name="refresh" size={14} /> Replay</button>
          </div>
        </div>
        <div className="gr-bar"><i style={{ width: `${Math.min(100, (t / end) * 100)}%` }} /></div>
      </div>
    </>,
    host,
  )
}

/**
 * A penalty goal replayed: the kick exactly as the match decided it (spot, the keeper's dive, the finish), in the same
 * frame as a goal replay, with the scene restarted on Replay.
 */
export function PenaltyReplay({ w, e, home, away, onClose }: { w: World; e: MatchEvent; home: number; away: number; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [run, setRun] = useState(0)
  const host = typeof document !== 'undefined' ? document.getElementById('sheet-host') : null
  const pen = e.pen
  if (!host || !pen) return null
  const side = e.side as 0 | 1
  const takerClub = w.clubs[side === 0 ? home : away], keeperClub = w.clubs[side === 0 ? away : home]
  const taker = w.players[pen.taker], keeper = pen.keeper ? w.players[pen.keeper] : undefined
  const close = () => { haptic(); setLeaving(true); window.setTimeout(onClose, 220) }
  return createPortal(
    <>
      <div className={`sheet-backdrop ${leaving ? 'fade-out' : 'fade-in'}`} onClick={close} />
      <div className={`gr ${leaving ? 'out' : ''}`} role="dialog" aria-label="Penalty replay">
        <div className="gr-head">
          <Badge club={takerClub} size={26} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="gr-title">Penalty · {e.min}{e.add ? `+${e.add}` : ''}'</div>
            <div className="tiny dim ellipsis">{taker ? callName(taker.name) : ''}{keeper ? ` v ${callName(keeper.name)}` : ''}</div>
          </div>
          <button className="iconbtn gr-x" onClick={close} aria-label="Close replay"><Icon name="close" size={18} /></button>
        </div>
        <div className="gr-pen" style={{ ['--c1' as any]: takerClub?.kit?.[0] || '#1fd67a', ['--c2' as any]: keeperClub?.kit?.[0] || '#444' }}>
          <div className="pk-scene">
            <PenaltyScene key={run} pen={pen} taker={taker} keeper={keeper} takerClub={takerClub} keeperClub={keeperClub} eventId={hashId(e)} />
          </div>
        </div>
        <div className="gr-cap">
          <div className="gr-step done">
            {taker && <Face p={taker} size={30} radius={15} club={takerClub} />}
            <div className="grow" style={{ minWidth: 0 }}><div className="small b ellipsis">{taker?.name}</div><div className="tiny dim">{e.score ? `${e.score[0]}–${e.score[1]}` : ''} · from the spot</div></div>
          </div>
          <div className="gr-ctrl"><button className="btn xs primary" onClick={() => { haptic(); setRun((x) => x + 1) }}><Icon name="refresh" size={14} /> Replay</button></div>
        </div>
      </div>
    </>,
    host,
  )
}
const hashId = (e: MatchEvent) => (e.min * 100 + (e.add || 0)) * 7 + (e.side === 1 ? 3 : 1)
