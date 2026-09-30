// FotMob-style shot map, drawn from what the simulation actually did: every shot where it was taken, sized by xG,
// marked by outcome (goal, on target, off target, blocked, woodwork). Tap one to see its path to goal, where it went
// in the goal mouth and the numbers behind it.
import { useMemo, useState } from 'react'
import type { MatchEvent, World } from '../../domain/types'
import { PitchSurface } from './PitchSurface'
import { Badge, Face } from './atoms'
import { Icon } from '../icons/Icon'
import { Ball } from './Glyphs'
import { callName } from '../../engine/match/commentary'
import { haptic } from '../../store/game'

interface Shot { e: MatchEvent; side: 0 | 1; x: number; y: number; ex: number; ey: number; gy: number; gz: number; xg: number; xgot?: number; res: 'goal' | 'saved' | 'blocked' | 'off' | 'post'; body?: 'L' | 'R' | 'H'; pen?: boolean }

const PEN_SPOT: Record<string, [number, number]> = { BL: [-0.7, 0.18], BR: [0.7, 0.18], TL: [-0.72, 0.78], TR: [0.72, 0.78], C: [0, 0.45] }
const SITUATION = (how?: string, pen?: boolean) => pen ? 'Penalty' : how === 'corner' ? 'Corner' : how === 'freekick' ? 'Free kick' : how === 'counter' ? 'Fast break' : how === 'rebound' ? 'Rebound' : 'Open play'
const CHANCE: Record<string, string> = { through: 'Through ball', cross: 'Cross', cutback: 'Cutback', solo: 'Solo run', long: 'From distance', counter: 'Counter-attack', error: 'From an error', rebound: 'Rebound', corner: 'From a corner', freekick: 'Direct free kick', pass: 'Assisted', box: 'In the box' }
const RESULT: Record<Shot['res'], string> = { goal: 'Goal', saved: 'Saved', blocked: 'Blocked', off: 'Off target', post: 'Hit the woodwork' }

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

/** The goal mouth from the shooter's side: posts, bar, net, and the ball where the shot went. */
function GoalFrame({ s, color }: { s: Shot; color: string }) {
  // shooter's view: gy −1 (left post) … +1 (right post); 0 ground … 1 bar
  const W = 100, H = 36, pad = 16
  const x = W / 2 + s.gy * (W / 2), y = H - s.gz * H
  return (
    <svg className="gf" viewBox={`${-pad} ${-14} ${W + pad * 2} ${H + 20}`} width="100%" height="100%" aria-hidden>
      <defs><pattern id="gfnet" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M6 0L0 6" stroke="rgba(255,255,255,.07)" strokeWidth=".6" /></pattern></defs>
      <rect x="0" y="0" width={W} height={H} fill="url(#gfnet)" />
      <path d={`M0 ${H}V0H${W}V${H}`} fill="none" stroke="#e8ecf1" strokeWidth="2.4" strokeLinejoin="round" />
      <path d={`M${-pad} ${H}H${W + pad}`} stroke="rgba(255,255,255,.25)" strokeWidth="1" />
      {s.res === 'goal' ? (
        <g transform={`translate(${x} ${y})`}><circle r="5.2" fill="#fff" /><circle r="5.2" fill="none" stroke="#15181c" strokeWidth="1" /><circle r="1.8" fill="#15181c" /></g>
      ) : (
        <circle cx={x} cy={Math.max(-10, y)} r="4.6" fill={s.res === 'saved' ? color : 'none'} stroke={s.res === 'saved' ? '#fff' : color} strokeWidth={s.res === 'saved' ? 1.2 : 1.8} />
      )}
    </svg>
  )
}

export function ShotMap({ w, events, home, away, colors }: { w: World; events: MatchEvent[]; home: number; away: number; colors: [string, string] }) {
  const all = useMemo(() => shotsOf(events), [events])
  const [half, setHalf] = useState<'all' | '1' | '2'>('all')
  const list = all.filter((s) => half === 'all' || (half === '1' ? s.e.min <= 45 : s.e.min > 45))
  const [sel, setSel] = useState<number>(() => Math.max(0, list.findIndex((s) => s.res === 'goal')))
  if (!all.length) return null
  const cur = list[Math.min(sel, list.length - 1)]
  const L = 105, Wd = 68
  const X = (v: number) => (v / 100) * L, Y = (v: number) => (v / 100) * Wd
  const r = (s: Shot) => 0.9 + Math.sqrt(Math.max(0.01, s.xg)) * 3.1
  const move = (d: number) => { haptic(); setSel((sel + d + list.length) % list.length) }
  const p = cur?.e.player ? w.players[cur.e.player] : undefined
  const club = cur ? w.clubs[cur.side === 0 ? home : away] : undefined
  const tally = (side: 0 | 1) => { const s = all.filter((x) => x.side === side); return { n: s.length, on: s.filter((x) => x.res === 'goal' || x.res === 'saved').length, xg: s.reduce((a, x) => a + x.xg, 0) } }
  const th = tally(0), ta = tally(1)
  return (
    <div className="card shotmap">
      <div className="card-h"><span className="label">Shot map</span><span className="tiny dim">{th.n}–{ta.n} shots · xG {th.xg.toFixed(2)}–{ta.xg.toFixed(2)}</span></div>
      <div className="sm-seg">
        {(['all', '1', '2'] as const).map((k) => <button key={k} className={half === k ? 'on' : ''} onClick={() => { haptic(); setHalf(k); setSel(0) }}>{k === 'all' ? 'All' : k === '1' ? '1st half' : '2nd half'}</button>)}
      </div>
      <div className="sm-pitch">
        <PitchSurface goals pad={2.6} thin>
          <svg className="sm-svg" viewBox={`-2.6 -2.6 ${L + 5.2} ${Wd + 5.2}`} preserveAspectRatio="none">
            {cur && (
              <g className="sm-path" key={`p${sel}${half}`}>
                <line x1={X(cur.x)} y1={Y(cur.y)} x2={X(cur.ex)} y2={Y(cur.ey)} stroke={cur.side === 0 ? colors[0] : colors[1]} strokeWidth=".6" strokeLinecap="round" />
              </g>
            )}
            {list.map((s, i) => {
              const c = s.side === 0 ? colors[0] : colors[1]
              const on = i === sel
              const rad = r(s)
              return (
                <g key={i} className={`sm-shot ${on ? 'sel' : ''}`} onClick={() => { haptic(); setSel(i) }} style={{ ['--d' as any]: `${i * 18}ms` }}>
                  <circle cx={X(s.x)} cy={Y(s.y)} r={rad + 2.2} fill="transparent" />
                  {on && <circle className="sm-ring" cx={X(s.x)} cy={Y(s.y)} r={rad + 1.3} fill="none" stroke={c} strokeWidth=".45" />}
                  {s.res === 'goal' ? (
                    <g transform={`translate(${X(s.x)} ${Y(s.y)})`}><circle r={Math.max(1.6, rad * 0.8)} fill="#fff" /><circle r={Math.max(1.6, rad * 0.8)} fill="none" stroke="#15181c" strokeWidth=".3" /><circle r={Math.max(0.55, rad * 0.28)} fill="#15181c" /></g>
                  ) : (
                    <circle cx={X(s.x)} cy={Y(s.y)} r={rad} fill={s.res === 'saved' ? c : 'transparent'} fillOpacity={s.res === 'saved' ? 0.85 : 0}
                      stroke={s.res === 'saved' ? 'rgba(255,255,255,.6)' : c} strokeWidth={s.res === 'saved' ? 0.25 : 0.5} strokeDasharray={s.res === 'blocked' ? '.9 .7' : undefined} />
                  )}
                  {s.res === 'post' && <circle cx={X(s.x)} cy={Y(s.y)} r={rad * 0.35} fill={c} />}
                </g>
              )
            })}
          </svg>
        </PitchSurface>
        <div className="sm-legend tiny dim">
          <span><i className="lg-goal"><Ball size={10} /></i>Goal</span><span><i className="lg-on" />On target</span><span><i className="lg-off" />Off target</span><span><i className="lg-blk" />Blocked</span>
        </div>
      </div>
      {cur && (
        <div className="sm-detail" key={`${half}${sel}`}>
          <div className="sm-who">
            <button className="iconbtn sm-nav" onClick={() => move(-1)} aria-label="Previous shot"><Icon name="back" size={16} /></button>
            {club && <Badge club={club} size={20} />}
            <b className="sm-min">{cur.e.min}{cur.e.add ? `+${cur.e.add}` : ''}'</b>
            {p ? <><Face p={p} size={26} radius={13} club={club} /><span className="small b ellipsis">{callName(p.name)}</span></> : <span className="small dim">Shot</span>}
            <span className="grow" />
            <span className="tiny dim">{sel + 1}/{list.length}</span>
            <button className="iconbtn sm-nav" onClick={() => move(1)} aria-label="Next shot"><Icon name="forward" size={16} /></button>
          </div>
          <div className="sm-body">
            <div className="sm-goal">
              {cur.res === 'blocked'
                ? <div className="sm-blocked tiny"><Icon name="shield" size={18} color="var(--t2)" /><span>Blocked{cur.e.shot?.by && w.players[cur.e.shot.by] ? ` by ${callName(w.players[cur.e.shot.by].name)}` : ''}</span></div>
                : <GoalFrame s={cur} color={cur.side === 0 ? colors[0] : colors[1]} />}
              <div className="sm-xg"><div><b>{cur.xg.toFixed(2)}</b><span>xG</span></div>{cur.xgot != null && <div><b>{cur.xgot.toFixed(2)}</b><span>xGOT</span></div>}</div>
            </div>
            <div className="sm-facts">
              <div><span>Result</span><b className={cur.res === 'goal' ? 'pos' : ''}>{RESULT[cur.res]}</b></div>
              <div><span>Shot</span><b>{cur.pen ? 'Penalty' : cur.body === 'H' ? 'Header' : cur.body === 'L' ? 'Left foot' : cur.body === 'R' ? 'Right foot' : '—'}{cur.e.shot?.weak ? <span className="dim"> · weaker</span> : null}</b></div>
              <div><span>Situation</span><b>{SITUATION(cur.e.how, cur.pen)}</b></div>
              {!cur.pen && cur.e.how && CHANCE[cur.e.how] && <div><span>Chance</span><b>{CHANCE[cur.e.how]}{cur.e.player2 && w.players[cur.e.player2] ? <span className="dim"> · {callName(w.players[cur.e.player2].name)}</span> : null}</b></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
