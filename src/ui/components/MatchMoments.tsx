// The big moments of a live match, shown over the pitch while the clock stops: cards, penalty awards and the penalty
// kick itself (placement, dive and outcome come from the simulation — the animation only shows what was decided).
import { useState } from 'react'
import type { Club, MatchEvent, PenaltyKick, Player, World } from '../../domain/types'
import { Badge, Face } from './atoms'
import { PenaltyScene } from './PenaltyScene'

export type MomentKind = 'goal' | 'yellow' | 'red' | 'penalty' | 'kick'
export interface Moment { kind: MomentKind; e: MatchEvent; id: number }

/** How long each moment holds the screen (ms). Tapping skips it. */
export const MOMENT_MS: Record<MomentKind, number> = { goal: 4800, yellow: 3000, red: 5000, penalty: 2900, kick: 5000 }

const minLabel = (e: MatchEvent) => `${e.min}${e.add ? `+${e.add}` : ''}'`

/** Yellow / red card: the card pops in, sways and settles next to the player. */
export function CardMoment({ m, w, club, onClose, reds }: { m: Moment; w: World; club?: Club; onClose: () => void; reds: number }) {
  const p = m.e.player ? w.players[m.e.player] : undefined
  const red = m.kind === 'red'
  const second = m.e.type === 'secondYellow'
  return (
    <button className={`mm mm-card ${red ? 'red' : 'yellow'}`} onClick={onClose} style={{ ['--club' as any]: club?.kit?.[0] || '#444' }}>
      <div className="mm-glow" />
      <div className="mm-row">
        <div className="mm-face-wrap">
          {p && <Face p={p} size={red ? 76 : 64} radius={red ? 38 : 32} club={club} />}
          <span className={`mm-cardchip ${red ? 'r' : 'y'} ${second ? 'second' : ''}`}>{second && <i className="y2" />}</span>
        </div>
        <div className="mm-text">
          <div className="mm-kicker"><Badge club={club} size={16} /><span>{red ? (second ? 'Second yellow' : 'Red card') : 'Yellow card'}</span><span className="mm-min">{minLabel(m.e)}</span></div>
          <div className="mm-name ellipsis">{p?.name}</div>
          <div className="mm-sub ellipsis">{red ? `${club?.short} down to ${11 - reds} men` : m.e.player2 && w.players[m.e.player2] ? `For the foul on ${w.players[m.e.player2].name}` : 'Booked'}</div>
        </div>
      </div>
      <span className="mm-timer" style={{ animationDuration: `${MOMENT_MS[m.kind]}ms` }} />
    </button>
  )
}

/** Penalty awarded: the fouler and the fouled grouped on the left, both clubs' colours flowing behind. */
export function PenaltyMoment({ m, w, victimClub, foulerClub, onClose }: { m: Moment; w: World; victimClub?: Club; foulerClub?: Club; onClose: () => void }) {
  const victim = m.e.player ? w.players[m.e.player] : undefined
  const fouler = m.e.player2 ? w.players[m.e.player2] : undefined
  return (
    <button className="mm mm-pen" onClick={onClose} style={{ ['--c1' as any]: victimClub?.kit?.[0] || '#1fd67a', ['--c2' as any]: foulerClub?.kit?.[0] || '#444' }}>
      <div className="mm-flow"><i /><i /><i /></div>
      <div className="mm-row">
        <div className="mm-pair">
          {fouler && <span className="mm-f back"><Face p={fouler} size={56} radius={28} club={foulerClub} /></span>}
          {victim && <span className="mm-f front"><Face p={victim} size={64} radius={32} club={victimClub} /></span>}
        </div>
        <div className="mm-text">
          <div className="mm-kicker"><Badge club={victimClub} size={16} /><span>Penalty awarded</span><span className="mm-min">{minLabel(m.e)}</span></div>
          <div className="mm-name ellipsis mm-big">PENALTY!</div>
          <div className="mm-sub ellipsis">{victim ? `${victim.name} ` : ''}brought down{fouler ? ` by ${fouler.name}` : ''}</div>
        </div>
      </div>
      <span className="mm-timer" style={{ animationDuration: `${MOMENT_MS.penalty}ms` }} />
    </button>
  )
}

/** The kick, seen from behind the taker: run-up, strike, the keeper's dive and the outcome the simulation decided. */
export function KickMoment({ m, w, takerClub, keeperClub, onClose }: { m: Moment; w: World; takerClub?: Club; keeperClub?: Club; onClose: () => void }) {
  const pen = m.e.pen
  const taker: Player | undefined = pen ? w.players[pen.taker] : m.e.player ? w.players[m.e.player] : undefined
  const keeper = pen?.keeper ? w.players[pen.keeper] : undefined
  const kick: PenaltyKick = pen || { taker: taker?.id || 0, keeper: keeper?.id, spot: 'BL', dive: 'R', res: m.e.type === 'penGoal' ? 'goal' : 'saved' }
  const res = kick.res
  const out = res === 'goal' ? 'GOAL!' : res === 'saved' ? 'SAVED!' : res === 'post' ? (kick.spot.startsWith('T') ? 'OFF THE BAR!' : 'OFF THE POST!') : 'MISSED!'
  const [phase, setPhase] = useState<'' | 'flight' | 'result'>('')
  return (
    <button className={`mm mm-kick res-${res}`} onClick={onClose} style={{ ['--c1' as any]: takerClub?.kit?.[0] || '#1fd67a', ['--c2' as any]: keeperClub?.kit?.[0] || '#444' }}>
      <div className="mk-head">
        <span className="mk-pl">{taker && <Face p={taker} size={36} radius={18} club={takerClub} />}<span className="col" style={{ minWidth: 0 }}><span className="ellipsis">{taker?.name}</span><span className="mk-role">Taker</span></span></span>
        <span className="mk-vs">v</span>
        <span className="mk-pl r"><span className="col" style={{ minWidth: 0, alignItems: 'flex-end' }}><span className="ellipsis">{keeper?.name || 'Keeper'}</span><span className="mk-role">Goalkeeper</span></span>{keeper && <Face p={keeper} size={36} radius={18} club={keeperClub} />}</span>
      </div>
      <div className={`pk-scene ${phase}`}>
        <PenaltyScene pen={kick} taker={taker} keeper={keeper} takerClub={takerClub} keeperClub={keeperClub} eventId={m.id} onPhase={setPhase} />
        <span className="pk-out">{out}</span>
      </div>
      <div className="mk-foot"><Badge club={takerClub} size={16} /><span className="tiny">{minLabel(m.e)} · Penalty · {takerClub?.short}</span></div>
      <span className="mm-timer" style={{ animationDuration: `${MOMENT_MS.kick}ms` }} />
    </button>
  )
}
