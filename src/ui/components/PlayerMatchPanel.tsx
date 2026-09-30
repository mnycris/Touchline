// FotMob-style match performance panel: tap a player in a line-up during (or after) a match to see his rating,
// heat map and the stats the engine recorded for him, grouped and ordered by what matters for his position.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Club, MatchEvent, MatchPlayerStats, World } from '../../domain/types'
import { RGROUP, type RG } from '../../engine/match/rating'
import { decodeHeat, HEAT_H, HEAT_W } from '../../engine/match/pitch'
import { Badge, Face, Flag } from './atoms'
import { POS_NAME } from '../../domain/constants'
import { ageOf } from '../selectors'
import { Sheet } from './layout'
import { Ball, Boot, MissedPen, RatingPill } from './Lineup'
import { Icon } from '../icons/Icon'
import { PitchSurface } from './PitchSurface'

type Row = [label: string, value: ReactNode, strong?: boolean]

/** Position names that fit a third of the panel. */
const POS_SHORT: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Centre-back', RB: 'Right-back', LB: 'Left-back', RWB: 'Wing-back', LWB: 'Wing-back', CDM: 'Defensive mid',
  CM: 'Midfielder', RM: 'Right mid', LM: 'Left mid', CAM: 'Attacking mid', RW: 'Right winger', LW: 'Left winger', CF: 'Forward', ST: 'Striker',
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const frac = (a = 0, b = 0) => (b ? <>{a}/{b} <span className="pmp-pct">({pct(a, b)}%)</span></> : '0')
const n = (v?: number) => v || 0
const x2 = (v?: number) => (v || 0).toFixed(2)

/** Heat map: the 12×8 touch grid (attacking left to right) smoothed into a continuous field and coloured
 *  green → yellow → orange → red, drawn on the charcoal pitch. */
export function HeatMap({ heat }: { heat?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cells = useMemo(() => decodeHeat(heat), [heat])
  useEffect(() => {
    const cv = ref.current
    if (!cv || !cells.length) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const W = cv.width, H = cv.height
    // separable gaussian: each cell centre spreads over ~one and a half cells
    const sx = W / HEAT_W * 0.62, sy = H / HEAT_H * 0.66
    const gx = new Float32Array(W * HEAT_W), gy = new Float32Array(H * HEAT_H)
    for (let x = 0; x < W; x++) for (let i = 0; i < HEAT_W; i++) { const d = x + 0.5 - (i + 0.5) * (W / HEAT_W); gx[x * HEAT_W + i] = Math.exp(-(d * d) / (2 * sx * sx)) }
    for (let y = 0; y < H; y++) for (let j = 0; j < HEAT_H; j++) { const d = y + 0.5 - (j + 0.5) * (H / HEAT_H); gy[y * HEAT_H + j] = Math.exp(-(d * d) / (2 * sy * sy)) }
    const field = new Float32Array(W * H)
    // rows of the grid folded with the x kernel first
    const rowX = new Float32Array(HEAT_H * W)
    for (let j = 0; j < HEAT_H; j++) for (let x = 0; x < W; x++) {
      let v = 0
      for (let i = 0; i < HEAT_W; i++) v += cells[j * HEAT_W + i] * gx[x * HEAT_W + i]
      rowX[j * W + x] = v
    }
    let max = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0
      for (let j = 0; j < HEAT_H; j++) v += rowX[j * W + x] * gy[y * HEAT_H + j]
      field[y * W + x] = v
      if (v > max) max = v
    }
    const img = ctx.createImageData(W, H)
    for (let k = 0; k < field.length; k++) {
      const c = HEAT_LUT[Math.min(255, Math.round((field[k] / (max || 1)) * 255))]
      img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = c[3]
    }
    ctx.putImageData(img, 0, 0)
  }, [cells])
  return (
    <PitchSurface className="pmp-heat" chevron
      under={cells.length ? <canvas ref={ref} width={168} height={109} className="pmp-heat-cv" /> : undefined}>
      {!cells.length && <div className="pmp-heat-empty tiny">No touches recorded</div>}
    </PitchSurface>
  )
}

/** Colour ramp for the heat field: transparent at the fringe, then green, yellow, orange and a red core. */
const HEAT_STOPS: [number, number, number, number, number][] = [
  [0, 43, 196, 110, 0], [0.1, 43, 196, 110, 0], [0.2, 52, 199, 104, 0.5], [0.4, 150, 214, 62, 0.72],
  [0.58, 247, 214, 64, 0.84], [0.76, 255, 146, 56, 0.9], [1, 238, 58, 50, 0.95],
]
const HEAT_LUT: [number, number, number, number][] = Array.from({ length: 256 }, (_, i) => {
  const t = i / 255
  let k = 0
  while (k < HEAT_STOPS.length - 2 && t > HEAT_STOPS[k + 1][0]) k++
  const [a, b] = [HEAT_STOPS[k], HEAT_STOPS[k + 1]]
  const f = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))
  const m = (x: number, y: number) => x + (y - x) * f
  return [Math.round(m(a[1], b[1])), Math.round(m(a[2], b[2])), Math.round(m(a[3], b[3])), Math.round(m(a[4], b[4]) * 255)]
})

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter(Boolean)
  if (!shown.length) return null
  return (
    <div className="pmp-sec">
      <div className="pmp-h">{title}</div>
      {shown.map(([l, v, strong]) => <div key={l} className="pmp-row"><span>{l}</span><span className={strong ? 'b' : ''}>{v}</span></div>)}
    </div>
  )
}

export interface PlayerMatchPanelProps {
  w: World
  st?: MatchPlayerStats
  club?: Club
  events: MatchEvent[]
  motm?: boolean
  live?: boolean
  onClose: () => void
  onProfile: () => void
  actions?: ReactNode
}

export function PlayerMatchPanel({ w, st, club, events, motm, live, onClose, onProfile, actions }: PlayerMatchPanelProps) {
  const p = st ? w.players[st.id] : undefined
  if (!st || !p) return null
  const g: RG = RGROUP[st.pos] || 'CM'
  const gk = g === 'GK'
  const def = g === 'CB' || g === 'FB' || g === 'DM'
  const played = st.mins > 0 || st.started
  const mine = events.filter((e) => e.player === st.id || e.player2 === st.id)
  const yellow = st.yellow, red = st.red
  const missed = mine.filter((e) => e.type === 'penMiss' && e.player === st.id).length
  const bigMissed = n(st.bcm)
  const prevented = n(st.xgotFaced) - n(st.conceded)

  const top: Row[] = [
    ['Minutes played', `${st.mins}'`],
    ...(gk ? [['Saves', n(st.saves), true], ['Goals conceded', n(st.conceded)], ['Goals prevented', `${prevented >= 0 ? '+' : ''}${prevented.toFixed(2)}`, true]] as Row[] : []),
    ...(!gk ? [['Goals', st.goals, st.goals > 0], ['Assists', st.assists, st.assists > 0]] as Row[] : []),
    ...(!gk && !def ? [['Expected goals (xG)', x2(st.xg)], ['Expected assists (xA)', x2(st.xa)]] as Row[] : []),
    ['Touches', n(st.touches)],
    ['Accurate passes', frac(st.passesCompleted, st.passes)],
    ...(!gk ? [['Chances created', st.keyPasses, st.keyPasses >= 3]] as Row[] : []),
    ...(def && !gk ? [['Tackles won', st.tackles], ['Interceptions', st.interceptions]] as Row[] : []),
  ]
  const attack: Row[] = [
    ['Shots', st.shots], ['Shots on target', st.sot], ['Expected goals (xG)', x2(st.xg)], ['xG on target (xGOT)', x2(st.xgot)],
    ['Big chances missed', bigMissed, bigMissed > 0], ['Successful dribbles', frac(st.dribblesOk, st.dribbles)], ['Touches in opposition box', n(st.boxTouches)],
    ...(n(st.offsides) ? [['Offsides', n(st.offsides)]] as Row[] : []),
    ...(missed ? [['Penalties missed', missed, true]] as Row[] : []),
  ]
  const passing: Row[] = [
    ['Accurate passes', frac(st.passesCompleted, st.passes)], ['Chances created', st.keyPasses], ['Big chances created', n(st.bcc)], ['Expected assists (xA)', x2(st.xa)],
    ['Accurate crosses', frac(st.crossesOk, st.crosses)], ['Accurate long balls', frac(st.longBallsOk, st.longBalls)],
    ...(n(st.throughBalls) ? [['Through balls', n(st.throughBalls)]] as Row[] : []),
  ]
  const defending: Row[] = [
    ['Tackles won', st.tackles], ['Interceptions', st.interceptions], ['Clearances', n(st.clearances)], ['Blocked shots', n(st.blocks)], ['Recoveries', n(st.recoveries)],
    ['Dribbled past', n(st.dribbledPast)],
    ...(n(st.errors) ? [['Errors leading to a shot', n(st.errors), true]] as Row[] : []),
    ...(n(st.penConceded) ? [['Penalties conceded', n(st.penConceded), true]] as Row[] : []),
  ]
  const duels: Row[] = [
    ['Duels won', frac(st.duelsWon, st.duels)], ['Aerial duels won', frac(st.aerialsWon, st.aerials)], ['Fouls committed', st.fouls], ['Was fouled', n(st.foulsWon)],
    ['Possession lost', n(st.possLost)], ['Dispossessed', n(st.dispossessed)],
    ...(n(st.penWon) ? [['Penalties won', n(st.penWon), true]] as Row[] : []),
  ]
  const keeping: Row[] = [
    ['Saves', n(st.saves)], ['Goals conceded', n(st.conceded)], ['xGOT faced', x2(st.xgotFaced)], ['Goals prevented', `${prevented >= 0 ? '+' : ''}${prevented.toFixed(2)}`, prevented > 0.5],
    ['High claims', n(st.claims)], ['Punches', n(st.punches)], ['Sweeper actions', n(st.sweeps)], ['Accurate long balls', frac(st.longBallsOk, st.longBalls)],
  ]
  const order: [string, Row[]][] = gk
    ? [['Goalkeeping', keeping], ['Distribution', passing.slice(0, 1).concat(passing.slice(5, 6))], ['Defending', defending.slice(0, 3)]]
    : def
      ? [['Defending', defending], ['Duels', duels], ['Passing', passing], ['Attack', attack]]
      : [['Attack', attack], ['Passing', passing], ['Duels', duels], ['Defending', defending]]

  const role = st.pos
  // results kept in summary form (deep-simulated leagues) carry only the core numbers
  const ext = st.touches !== undefined
  const basic: Row[] = [
    ['Minutes played', `${st.mins}'`], ['Goals', st.goals, st.goals > 0], ['Assists', st.assists, st.assists > 0],
    ...(gk ? [['Saves', n(st.saves)]] as Row[] : [['Shots', `${st.shots} (${st.sot} on target)`], ['Expected goals (xG)', x2(st.xg)]] as Row[]),
    ['Accurate passes', frac(st.passesCompleted, st.passes)], ['Chances created', st.keyPasses], ['Tackles won', st.tackles], ['Interceptions', st.interceptions], ['Fouls committed', st.fouls],
  ]
  const topLabels = new Set(top.map((r) => r[0]))
  return (
    <Sheet open onClose={onClose}>
      <div className="pmp" style={{ ['--club' as any]: club?.kit?.[0] || '#1fd67a' }}>
        <div className="pmp-hero">
          <div className="pmp-ph">
            <Face p={p} size={84} radius={42} club={club} />
            {played && <span className="pmp-rt"><RatingPill v={st.rating} motm={motm} /></span>}
            <span className="pmp-flag"><Flag w={w} nation={p.nation} size={13} /></span>
          </div>
          <div className="pmp-name">{p.name}</div>
          <div className="pmp-sub tiny">{!played ? 'Unused substitute' : motm ? 'Player of the match' : live ? 'Live rating' : 'Match rating'}</div>
          {(st.goals > 0 || st.assists > 0 || missed > 0 || yellow || red || st.subOn != null || st.subOff != null || st.injured) && (
            <div className="pmp-evs">
              {Array.from({ length: st.goals }, (_, i) => <Ball key={`g${i}`} size={15} />)}
              {Array.from({ length: st.assists }, (_, i) => <Boot key={`a${i}`} size={17} />)}
              {Array.from({ length: missed }, (_, i) => <MissedPen key={`m${i}`} size={14} />)}
              {yellow && <span className="card-y" />}{red && <span className="card-r" />}
              {st.subOn != null && !st.started && <span className="pmp-chip pos"><Icon name="arrowUp" size={10} strokeWidth={3} />{st.subOn}'</span>}
              {st.subOff != null && <span className="pmp-chip neg"><Icon name="arrowDown" size={10} strokeWidth={3} />{st.subOff}'</span>}
              {st.injured && <span className="pmp-chip neg"><Icon name="injury" size={10} />Injured</span>}
            </div>
          )}
          <div className="pmp-meta">
            <div><b>{POS_SHORT[role] || POS_NAME[role as keyof typeof POS_NAME] || role}</b><span>Position</span></div>
            <div><b className="row tight" style={{ justifyContent: 'center' }}><Badge club={club} size={16} /><span className="ellipsis">{club?.short}</span></b><span>Team</span></div>
            <div><b>{ageOf(w, p)}{p.jersey ? <span className="dim"> · #{p.jersey}</span> : null}</b><span>Age · Shirt</span></div>
          </div>
        </div>

        {played && ext && (
          <>
            <div className="pmp-sec pmp-heat-sec">
              <div className="pmp-hh"><span>Heatmap</span><span className="pmp-hh-n">Touches <b>{n(st.touches)}</b></span></div>
              <HeatMap heat={st.heat} />
            </div>
            <Section title="Top stats" rows={top} />
            {order.map(([t, rows]) => <Section key={t} title={t} rows={rows.filter((r) => !topLabels.has(r[0]))} />)}
          </>
        )}
        {played && !ext && (
          <>
            <Section title="Match stats" rows={basic} />
            <div className="tiny dim" style={{ marginTop: 8 }}>Summary stats only: the full breakdown and heat map are kept for matches you play or watch.</div>
          </>
        )}
        {!played && <div className="muted small" style={{ padding: '18px 4px' }}>{p.name} hasn't played in this match.</div>}

        <div className="pmp-dock">
          <button className="pmp-pill" onClick={onProfile}><Icon name="manager" size={15} /> Profile</button>
          {actions}
          <button className="pmp-pill x" onClick={onClose} aria-label="Close"><Icon name="close" size={16} strokeWidth={2.4} /></button>
        </div>
      </div>
    </Sheet>
  )
}
