// FotMob-style match performance panel: tap a player in a line-up during (or after) a match to see his rating,
// heat map and the stats the engine recorded for him, grouped and ordered by what matters for his position.
import type { ReactNode } from 'react'
import type { Club, MatchEvent, MatchPlayerStats, World } from '../../domain/types'
import { RGROUP, type RG } from '../../engine/match/rating'
import { decodeHeat, HEAT_H, HEAT_W } from '../../engine/match/pitch'
import { Badge, Face } from './atoms'
import { Sheet } from './layout'
import { Ball, Boot, MissedPen, RatingPill } from './Lineup'
import { Icon } from '../icons/Icon'

type Row = [label: string, value: ReactNode, strong?: boolean]

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const frac = (a = 0, b = 0) => (b ? <>{a}/{b} <span className="pmp-pct">({pct(a, b)}%)</span></> : '0')
const n = (v?: number) => v || 0
const x2 = (v?: number) => (v || 0).toFixed(2)

/** Heat map: 12×8 touch grid, attacking left to right, blurred into a smooth field. */
export function HeatMap({ heat, height = 150 }: { heat?: string; height?: number }) {
  const cells = decodeHeat(heat)
  const cw = 105 / HEAT_W, ch = 68 / HEAT_H
  return (
    <div className="pmp-heat" style={{ height }}>
      <svg viewBox="0 0 105 68" preserveAspectRatio="none" className="pmp-heat-svg">
        <defs>
          <filter id="pmpblur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.6" /></filter>
          <clipPath id="pmpclip"><rect x="0" y="0" width="105" height="68" /></clipPath>
        </defs>
        <g clipPath="url(#pmpclip)"><g filter="url(#pmpblur)">
          {cells.map((v, i) => {
            if (v < 0.04) return null
            const cx = (i % HEAT_W) * cw + cw / 2, cy = Math.floor(i / HEAT_W) * ch + ch / 2
            const hue = 130 - Math.min(1, v) * 130
            return <ellipse key={i} cx={cx} cy={cy} rx={cw * 0.95} ry={ch * 0.95} fill={`hsl(${hue} 85% 52%)`} opacity={Math.min(0.95, 0.2 + v * 0.85)} />
          })}
        </g></g>
        <g fill="none" stroke="rgba(255,255,255,.45)" strokeWidth=".45">
          <rect x=".3" y=".3" width="104.4" height="67.4" />
          <path d="M52.5 0v68" /><circle cx="52.5" cy="34" r="9.15" />
          <path d="M0 13.84h16.5v40.32H0M105 13.84H88.5v40.32H105M0 24.84h5.5v18.32H0M105 24.84h-5.5v18.32H105" />
        </g>
      </svg>
      {!cells.length && <div className="pmp-heat-empty tiny">No touches recorded</div>}
      <span className="pmp-dir tiny">Attacking <Icon name="forward" size={11} strokeWidth={2.4} /></span>
    </div>
  )
}

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
  const topLabels = new Set(top.map((r) => r[0]))
  return (
    <Sheet open onClose={onClose}>
      <div className="pmp" style={{ ['--club' as any]: club?.kit?.[0] || '#1fd67a' }}>
        <div className="pmp-hero">
          <Face p={p} size={64} radius={32} club={club} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="pmp-name ellipsis">{p.name}</div>
            <div className="row tight tiny" style={{ gap: 6, marginTop: 3, color: 'var(--t2)' }}>
              <Badge club={club} size={15} /><span>{club?.short}</span><span className="dim">·</span><span className="b">{role}</span>{p.jersey ? <><span className="dim">·</span><span>#{p.jersey}</span></> : null}
            </div>
            <div className="pmp-evs">
              {Array.from({ length: st.goals }, (_, i) => <Ball key={`g${i}`} size={15} />)}
              {Array.from({ length: st.assists }, (_, i) => <Boot key={`a${i}`} size={17} />)}
              {Array.from({ length: missed }, (_, i) => <MissedPen key={`m${i}`} size={14} />)}
              {yellow && <span className="card-y" />}{red && <span className="card-r" />}
              {st.subOn != null && !st.started && <span className="pmp-chip pos"><Icon name="arrowUp" size={10} strokeWidth={3} />{st.subOn}'</span>}
              {st.subOff != null && <span className="pmp-chip neg"><Icon name="arrowDown" size={10} strokeWidth={3} />{st.subOff}'</span>}
              {st.injured && <span className="pmp-chip neg"><Icon name="injury" size={10} />Injured</span>}
            </div>
          </div>
          <div className="pmp-rt">
            {played ? <RatingPill v={st.rating} motm={motm} /> : <span className="tiny dim">Unused</span>}
            <span className="tiny dim">{motm ? 'Player of the match' : live ? 'Live rating' : 'Rating'}</span>
          </div>
        </div>

        {played && (
          <>
            <HeatMap heat={st.heat} />
            <Section title="Top stats" rows={top} />
            {order.map(([t, rows]) => <Section key={t} title={t} rows={rows.filter((r) => !topLabels.has(r[0]))} />)}
          </>
        )}
        {!played && <div className="muted small" style={{ padding: '18px 4px' }}>{p.name} hasn't played in this match.</div>}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn grow" onClick={onProfile}><Icon name="manager" size={16} /> Profile</button>
          {actions}
        </div>
      </div>
    </Sheet>
  )
}
