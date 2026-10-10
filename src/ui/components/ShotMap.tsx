// FotMob-style shot map, drawn from what the simulation actually did: every shot where it was taken, sized by xG,
// marked by outcome (goal, on target, off target, blocked, woodwork). Tap one and the ball travels its path to where it
// really ended (the net, the keeper, the blocker, wide), and the goal frame beside it shows where it went in the goal
// mouth, easing out to keep a wild one in view. It works live (it updates as shots come) and for one player alone.
import { useMemo, useState } from 'react'
import type { MatchEvent, World } from '../../domain/types'
import { PitchSurface, Markings } from './PitchSurface'
import { Badge, Face } from './atoms'
import { Icon } from '../icons/Icon'
import { Ball, BallG } from './Glyphs'
import { callName } from '../../engine/match/commentary'
import { haptic } from '../../store/game'
import { onDark } from '../theme'

export interface Shot { e: MatchEvent; side: 0 | 1; x: number; y: number; ex: number; ey: number; gy: number; gz: number; xg: number; xgot?: number; res: 'goal' | 'saved' | 'blocked' | 'off' | 'post'; body?: 'L' | 'R' | 'H'; pen?: boolean }

const PEN_SPOT: Record<string, [number, number]> = { BL: [-0.7, 0.18], BR: [0.7, 0.18], TL: [-0.72, 0.78], TR: [0.72, 0.78], C: [0, 0.45] }
const SITUATION = (how?: string, pen?: boolean) => pen ? 'Penalty' : how === 'corner' ? 'Corner' : how === 'freekick' ? 'Free kick' : how === 'counter' ? 'Fast break' : how === 'rebound' ? 'Rebound' : 'Open play'
const CHANCE: Record<string, string> = { through: 'Through ball', cross: 'Cross', cutback: 'Cutback', solo: 'Solo run', long: 'From distance', counter: 'Counter-attack', error: 'From an error', rebound: 'Rebound', corner: 'From a corner', freekick: 'Direct free kick', pass: 'Assisted', box: 'In the box' }
const RESULT: Record<Shot['res'], string> = { goal: 'Goal', saved: 'Saved', blocked: 'Blocked', off: 'Off target', post: 'Hit the woodwork' }
const BODY = (s: Shot) => s.pen ? 'Penalty' : s.body === 'H' ? 'Header' : s.body === 'L' ? 'Left foot' : s.body === 'R' ? 'Right foot' : '—'

/** Shots of a match, in minute order, from its events. */
export function shotsOf(events: MatchEvent[]): Shot[] {
  const out: Shot[] = []
  for (const e of events) {
    if (e.side !== 0 && e.side !== 1) continue
    if (e.shot && e.loc) {
      out.push({ e, side: e.side, x: e.loc[0], y: e.loc[1], ex: e.shot.end[0], ey: e.shot.end[1], gy: e.shot.gy, gz: e.shot.gz, xg: e.xg || 0.03, xgot: e.shot.xgot, res: e.shot.res, body: e.shot.body })
    } else if ((e.type === 'penGoal' || e.type === 'penMiss') && e.pen) {
      // penalties from the spot, placed where the kick went
      const [gy, gz] = PEN_SPOT[e.pen.spot] || [0, 0.4]
      const x = e.side === 0 ? 89.5 : 10.5
      const res: Shot['res'] = e.pen.res === 'goal' ? 'goal' : e.pen.res === 'saved' ? 'saved' : e.pen.res === 'post' ? 'post' : 'off'
      const miss = res === 'off' ? (gy < 0 ? -1.35 : 1.35) : gy
      out.push({ e, side: e.side, x, y: 50, ex: e.side === 0 ? 100 : 0, ey: 50 + (e.side === 0 ? 1 : -1) * miss * 5.4, gy: miss, gz: res === 'off' ? Math.max(gz, 1.1) : gz, xg: 0.78, res, pen: true })
    }
  }
  return out
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/**
 * The goal mouth from the shooter's side: posts, bar, net, and the ball where the shot went. One frame that stays put
 * from shot to shot: the mark glides to its new place, and the view eases out (never more than a little over twice)
 * when a shot flies well wide or high so the ball stays in it.
 */
function GoalFrame({ s, color }: { s: Shot; color: string }) {
  // shooter's view: gy −1 (left post) … +1 (right post); 0 ground … 1 bar
  const W = 100, H = 36
  const x = W / 2 + s.gy * (W / 2), y = H - s.gz * H
  const z = clamp(Math.max(1, Math.abs(x - W / 2) / (W / 2 + 8), (H - y + 6) / (H + 12)), 1, 2.2)
  // beyond what even the eased-out view holds, the mark sits at the edge of it, on the line it took
  const mx = clamp(x, W / 2 - (W / 2 + 12) * z, W / 2 + (W / 2 + 12) * z), my = clamp(y, H - (H + 12) * z, H + 2)
  const blocked = s.res === 'blocked'
  return (
    <svg className={`gf ${blocked ? 'dim' : ''}`} viewBox="-16 -14 132 56" width="100%" height="100%" aria-hidden>
      <defs><pattern id="gfnet" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M6 0L0 6" stroke="rgba(255,255,255,.07)" strokeWidth=".6" /></pattern></defs>
      <g className="gf-zoom" style={{ transform: `translate(50px, ${H}px) scale(${1 / z}) translate(-50px, -${H}px)` }}>
        <rect x="0" y="0" width={W} height={H} fill="url(#gfnet)" />
        <path d={`M-160 ${H}H260`} stroke="rgba(255,255,255,.22)" strokeWidth="1" />
        <path d={`M0 ${H}V0H${W}V${H}`} fill="none" stroke="#e8ecf1" strokeWidth="2.4" strokeLinejoin="round" />
        {!blocked && (
          <g className="gf-mark" style={{ transform: `translate(${mx}px, ${my}px) scale(${z})` }}>
            {s.res === 'goal' ? <BallG cx={0} cy={0} r={5} own={s.e.type === 'owngoal'} />
              : s.res === 'saved' ? <circle r="4.6" fill={color} stroke="#fff" strokeWidth="1.2" />
                : <circle r="4.6" fill="none" stroke={color} strokeWidth="1.8" />}
          </g>
        )}
      </g>
    </svg>
  )
}

/** The pitch marks for one shot: the ball for a goal, solid for on target, a ring off target, dashed when blocked. */
function ShotMark({ s, cx, cy, rad, c }: { s: Shot; cx: number; cy: number; rad: number; c: string }) {
  if (s.res === 'goal') return <BallG cx={cx} cy={cy} r={Math.max(1.7, rad * 0.86)} own={s.e.type === 'owngoal'} />
  return (
    <>
      <circle cx={cx} cy={cy} r={rad} fill={s.res === 'saved' ? c : 'transparent'} fillOpacity={s.res === 'saved' ? 0.85 : 0}
        stroke={s.res === 'saved' ? 'rgba(255,255,255,.6)' : c} strokeWidth={s.res === 'saved' ? 0.25 : 0.5} strokeDasharray={s.res === 'blocked' ? '.9 .7' : undefined} />
      {s.res === 'post' && <circle cx={cx} cy={cy} r={rad * 0.35} fill={c} />}
    </>
  )
}

/**
 * The selected shot's flight: the line drawn from where it was struck to where the ball really stopped (a block
 * stops it at the blocker), with the ball travelling along it.
 */
function Flight({ x1, y1, x2, y2, c, own }: { x1: number; y1: number; x2: number; y2: number; c: string; own?: boolean }) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  return (
    <g className="sm-path" style={{ ['--len' as any]: len.toFixed(1), ['--x1' as any]: `${x1}px`, ['--y1' as any]: `${y1}px`, ['--x2' as any]: `${x2}px`, ['--y2' as any]: `${y2}px` }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth=".6" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len} />
      <g className="sm-fly"><BallG cx={0} cy={0} r={1.35} own={own} /></g>
    </g>
  )
}

const X = (v: number) => (v / 100) * 105, Y = (v: number) => (v / 100) * 68
const rOf = (s: Shot) => 0.9 + Math.sqrt(Math.max(0.01, s.xg)) * 3.1

export function ShotMap({ w, events, home, away, colors, live }: { w: World; events: MatchEvent[]; home: number; away: number; colors: [string, string]; live?: boolean }) {
  // (live, the events array grows in place: its length is what changes)
  const all = useMemo(() => shotsOf(events), [events, events.length])
  const [half, setHalf] = useState<'all' | '1' | '2'>('all')
  const list = all.filter((s) => half === 'all' || (half === '1' ? s.e.min <= 45 : s.e.min > 45))
  // the selection is a shot, not a position in the list, so it stays put as new shots arrive
  const [selE, setSelE] = useState<MatchEvent>()
  if (!all.length) return null
  const idx = Math.max(0, selE ? list.findIndex((s) => s.e === selE) : -1)
  const def = live ? list.length - 1 : Math.max(0, list.findIndex((s) => s.res === 'goal'))
  const cur = list[selE && list.some((s) => s.e === selE) ? idx : def]
  const curI = cur ? list.indexOf(cur) : 0
  const move = (d: number) => { haptic(); setSelE(list[(curI + d + list.length) % list.length].e) }
  const p = cur?.e.player ? w.players[cur.e.player] : undefined
  const club = cur ? w.clubs[cur.side === 0 ? home : away] : undefined
  const tally = (side: 0 | 1) => { const s = all.filter((x) => x.side === side); return { n: s.length, xg: s.reduce((a, x) => a + x.xg, 0) } }
  const th = tally(0), ta = tally(1)
  // a near-black kit is lifted so its marks and flights read on the dark pitch
  const col = (s: Shot) => onDark(s.side === 0 ? colors[0] : colors[1])
  return (
    <div className="card shotmap">
      <div className="card-h"><span className="label">Shot map{live ? <span className="sm-live">Live</span> : null}</span><span className="tiny dim">{th.n}–{ta.n} shots · xG {th.xg.toFixed(2)}–{ta.xg.toFixed(2)}</span></div>
      <div className="sm-seg">
        {(['all', '1', '2'] as const).map((k) => <button key={k} className={half === k ? 'on' : ''} onClick={() => { haptic(); setHalf(k); setSelE(undefined) }}>{k === 'all' ? 'All' : k === '1' ? '1st half' : '2nd half'}</button>)}
      </div>
      <div className="sm-pitch">
        <PitchSurface goals pad={2.6} thin>
          <svg className="sm-svg" viewBox={`-2.6 -2.6 ${105 + 5.2} ${68 + 5.2}`} preserveAspectRatio="none">
            {list.map((s, i) => {
              const rad = rOf(s)
              return (
                <g key={i} className={`sm-shot ${s === cur ? 'sel' : ''}`} onClick={() => { haptic(); setSelE(s.e) }} style={{ ['--d' as any]: `${Math.min(i, 20) * 18}ms` }}>
                  <circle cx={X(s.x)} cy={Y(s.y)} r={rad + 2.2} fill="transparent" />
                  {s === cur && <circle className="sm-ring" cx={X(s.x)} cy={Y(s.y)} r={rad + 1.3} fill="none" stroke={col(s)} strokeWidth=".45" />}
                  <ShotMark s={s} cx={X(s.x)} cy={Y(s.y)} rad={rad} c={col(s)} />
                </g>
              )
            })}
            {cur && <Flight key={`${half}:${curI}:${cur.e.min}`} x1={X(cur.x)} y1={Y(cur.y)} x2={X(cur.ex)} y2={Y(cur.ey)} c={col(cur)} own={cur.e.type === 'owngoal'} />}
          </svg>
        </PitchSurface>
        <div className="sm-legend tiny dim">
          <span><i className="lg-goal"><Ball size={11} /></i>Goal</span><span><i className="lg-on" />On target</span><span><i className="lg-off" />Off target</span><span><i className="lg-blk" />Blocked</span>
        </div>
      </div>
      {cur && (
        <div className="sm-detail">
          <div className="sm-who">
            <button className="iconbtn sm-nav" onClick={() => move(-1)} aria-label="Previous shot"><Icon name="back" size={16} /></button>
            <span className="sm-who-in row tight grow" key={`w${curI}${half}`}>
              {club && <Badge club={club} size={20} />}
              <b className="sm-min">{cur.e.min}{cur.e.add ? `+${cur.e.add}` : ''}'</b>
              {p ? <><Face p={p} size={26} radius={13} club={club} /><span className="small b ellipsis">{callName(p.name)}</span></> : <span className="small dim">Shot</span>}
            </span>
            <span className="tiny dim">{curI + 1}/{list.length}</span>
            <button className="iconbtn sm-nav" onClick={() => move(1)} aria-label="Next shot"><Icon name="forward" size={16} /></button>
          </div>
          <ShotBody s={cur} w={w} color={col(cur)} k={`${curI}${half}`} />
        </div>
      )}
    </div>
  )
}

/** The goal frame (it stays; the ball moves) and the facts of the shot (they change). */
function ShotBody({ s, w, color, k }: { s: Shot; w: World; color: string; k: string }) {
  return (
    <div className="sm-body">
      <div className="sm-goal">
        <div className="gf-wrap">
          <GoalFrame s={s} color={color} />
          {s.res === 'blocked' && <div className="sm-blocked tiny" key={`b${k}`}><Icon name="shield" size={16} color="var(--t2)" /><span>Blocked{s.e.shot?.by && w.players[s.e.shot.by] ? ` by ${callName(w.players[s.e.shot.by].name)}` : ''}</span></div>}
        </div>
        <div className="sm-xg" key={`x${k}`}><div><b>{s.xg.toFixed(2)}</b><span>xG</span></div>{s.xgot != null && <div><b>{s.xgot.toFixed(2)}</b><span>xGOT</span></div>}</div>
      </div>
      <div className="sm-facts" key={`f${k}`}>
        <div><span>Result</span><b className={s.res === 'goal' ? 'pos' : ''}>{RESULT[s.res]}</b></div>
        <div><span>Shot</span><b>{BODY(s)}{s.e.shot?.weak ? <span className="dim"> · weaker</span> : null}</b></div>
        <div><span>Situation</span><b>{SITUATION(s.e.how, s.pen)}</b></div>
        {!s.pen && s.e.how && CHANCE[s.e.how] && <div><span>Chance</span><b>{CHANCE[s.e.how]}{s.e.player2 && w.players[s.e.player2] ? <span className="dim"> · {callName(w.players[s.e.player2].name)}</span> : null}</b></div>}
      </div>
    </div>
  )
}

/**
 * One player's shots, for the player match panel: his attacking half (whichever end he shot at, drawn attacking up the
 * screen's right), each shot as on the full map, and the same detail for the one picked. Read straight off the events.
 */
export function PlayerShots({ w, events, player, color }: { w: World; events: MatchEvent[]; player: number; color: string }) {
  const mine = useMemo(() => shotsOf(events).filter((s) => s.e.player === player && s.e.type !== 'owngoal'), [events, events.length, player])
  const [sel, setSel] = useState(-1)
  if (!mine.length) return null
  // every shot turned to attack the right-hand goal
  const norm = (s: Shot) => (s.side === 0 ? s : { ...s, x: 100 - s.x, y: 100 - s.y, ex: 100 - s.ex, ey: 100 - s.ey })
  const list = mine.map(norm)
  const cur = list[sel >= 0 && sel < list.length ? sel : Math.max(0, list.findIndex((s) => s.res === 'goal'))]
  const ci = list.indexOf(cur)
  const xg = list.reduce((a, s) => a + s.xg, 0)
  return (
    <div className="pmp-shots">
      <div className="pmp-hh"><span>Shots</span><span className="pmp-hh-n">{list.length} · xG <b>{xg.toFixed(2)}</b></span></div>
      <div className="pms-pitch">
        <svg viewBox="-3.5 -4 75 58" className="pms-svg">
          <rect x="-4" y="-5" width="77" height="64" fill="var(--pitch)" />
          {/* the pitch turned so he attacks up the screen: across is the pitch's width, up is toward goal */}
          <g transform="matrix(0 -1 1 0 0 105)">
            <Markings L={105} sw={0.9} />
            <path d="M105 30.34h2.2v7.32H105" fill="none" stroke="var(--pitch-line)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
            {list.map((s, i) => {
              const rad = rOf(s)
              return (
                <g key={i} className={`sm-shot ${s === cur ? 'sel' : ''}`} onClick={() => { haptic(); setSel(i) }} style={{ ['--d' as any]: `${i * 30}ms` }}>
                  <circle cx={X(s.x)} cy={Y(s.y)} r={rad + 2.2} fill="transparent" />
                  {s === cur && <circle className="sm-ring" cx={X(s.x)} cy={Y(s.y)} r={rad + 1.3} fill="none" stroke={color} strokeWidth=".45" />}
                  <ShotMark s={s} cx={X(s.x)} cy={Y(s.y)} rad={rad} c={color} />
                </g>
              )
            })}
            {cur && <Flight key={ci} x1={X(cur.x)} y1={Y(cur.y)} x2={X(cur.ex)} y2={Y(cur.ey)} c={color} />}
          </g>
        </svg>
      </div>
      {cur && (
        <>
          <div className="pms-pick">
            {list.map((s, i) => (
              <button key={i} className={`pms-chip ${i === ci ? 'on' : ''}`} onClick={() => { haptic(); setSel(i) }}>
                <b className="num">{s.e.min}{s.e.add ? `+${s.e.add}` : ''}'</b><span>{RESULT[s.res] === 'Hit the woodwork' ? 'Woodwork' : RESULT[s.res]}</span>
              </button>
            ))}
          </div>
          <ShotBody s={cur} w={w} color={color} k={String(ci)} />
        </>
      )}
    </div>
  )
}
