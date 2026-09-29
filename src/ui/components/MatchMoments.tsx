// The big moments of a live match, shown over the pitch while the clock stops: cards, penalty awards and the penalty
// kick itself (placement, dive and outcome come from the simulation — the animation only shows what was decided).
import type { Club, MatchEvent, Player, World } from '../../domain/types'
import { Badge, Face } from './atoms'
import { Ball } from './Lineup'

export type MomentKind = 'goal' | 'yellow' | 'red' | 'penalty' | 'kick'
export interface Moment { kind: MomentKind; e: MatchEvent; id: number }

/** How long each moment holds the screen (ms). Tapping skips it. */
export const MOMENT_MS: Record<MomentKind, number> = { goal: 4800, yellow: 3000, red: 5000, penalty: 2900, kick: 6400 }

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

const SPOT: Record<string, [number, number]> = { BL: [20, 76], BR: [80, 76], TL: [20, 30], TR: [80, 30], C: [50, 60] }
/** Keepers wear a contrasting kit: a stable pick per club from the usual goalkeeper colours. */
const GK_KITS = ['#f5d000', '#2dd36f', '#ff8a1f', '#9b5cff', '#16c7e0', '#ff4fa3']
const gkKit = (c?: Club) => GK_KITS[(c?.id ?? 0) % GK_KITS.length]

/** The kick, seen from behind the taker: run-up, the keeper's dive and the outcome the simulation decided. */
export function KickMoment({ m, w, takerClub, keeperClub, onClose }: { m: Moment; w: World; takerClub?: Club; keeperClub?: Club; onClose: () => void }) {
  const pen = m.e.pen
  const taker: Player | undefined = pen ? w.players[pen.taker] : m.e.player ? w.players[m.e.player] : undefined
  const keeper = pen?.keeper ? w.players[pen.keeper] : undefined
  const spot = pen?.spot || 'BL'
  const res = pen?.res || (m.e.type === 'penGoal' ? 'goal' : 'saved')
  const left = spot.endsWith('L')
  const [tx, ty] = res === 'miss' ? [left ? -9 : 109, spot.startsWith('T') ? -12 : 36] : res === 'post' ? [left ? 3 : 97, spot.startsWith('T') ? 12 : 48] : SPOT[spot]
  const dive = pen?.dive || 'C'
  const high = spot.startsWith('T') && dive !== 'C'
  const out = res === 'goal' ? 'GOAL!' : res === 'saved' ? 'SAVED!' : res === 'post' ? 'OFF THE POST!' : 'MISSED!'
  const kit = gkKit(keeperClub)
  return (
    <button className={`mm mm-kick res-${res}`} onClick={onClose} style={{ ['--c1' as any]: takerClub?.kit?.[0] || '#1fd67a', ['--c2' as any]: keeperClub?.kit?.[0] || '#444' }}>
      <div className="mk-head">
        <span className="mk-pl">{taker && <Face p={taker} size={36} radius={18} club={takerClub} />}<span className="col" style={{ minWidth: 0 }}><span className="ellipsis">{taker?.name}</span><span className="mk-role">Taker</span></span></span>
        <span className="mk-vs">v</span>
        <span className="mk-pl r"><span className="col" style={{ minWidth: 0, alignItems: 'flex-end' }}><span className="ellipsis">{keeper?.name || 'Keeper'}</span><span className="mk-role">Goalkeeper</span></span>{keeper && <Face p={keeper} size={36} radius={18} club={keeperClub} />}</span>
      </div>
      <div className="mk-scene">
        <div className="mk-stand" />
        <div className="mk-grass"><i className="mk-box" /><i className="mk-spot" /></div>
        <div className="mk-goal">
          <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="mk-frame">
            <defs><pattern id="mknet" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><path d="M0 0L3.2 3.2M3.2 0L0 3.2" stroke="rgba(255,255,255,.16)" strokeWidth=".35" /></pattern></defs>
            <rect x="3" y="6" width="94" height="74" fill="rgba(0,0,0,.25)" />
            <rect x="3" y="6" width="94" height="74" fill="url(#mknet)" className="mk-net" />
            <path d="M3 80V6h94v74" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
          </svg>
          <span className={`mk-keeper dive-${dive} ${high ? 'hi' : ''}`} style={{ ['--gk' as any]: kit }}>
            <svg viewBox="0 0 64 50" className="mk-body" aria-hidden>
              <path d="M24 16 L9 5 M40 16 L55 5" stroke="var(--gk)" strokeWidth="7" strokeLinecap="round" />
              <circle cx="8" cy="4" r="4.4" fill="#fff" /><circle cx="56" cy="4" r="4.4" fill="#fff" />
              <path d="M20 14 Q32 9 44 14 L42 36 H22 Z" fill="var(--gk)" />
              <path d="M24 36 L22 49 M40 36 L42 49" stroke="#1b1f27" strokeWidth="7" strokeLinecap="round" />
            </svg>
            <span className="mk-head-face">{keeper ? <Face p={keeper} size={24} radius={12} club={keeperClub} /> : <i />}</span>
          </span>
          <span className="mk-ball" style={{ ['--tx' as any]: `${tx}%`, ['--ty' as any]: `${ty}%` }}><Ball size={16} /></span>
          <span className="mk-out">{out}</span>
        </div>
        <span className="mk-taker" style={{ ['--kit' as any]: takerClub?.kit?.[0] || '#1fd67a' }}>{taker && <Face p={taker} size={30} radius={15} club={takerClub} />}</span>
      </div>
      <div className="mk-foot"><Badge club={takerClub} size={16} /><span className="tiny">{minLabel(m.e)} · Penalty · {takerClub?.short}</span></div>
      <span className="mm-timer" style={{ animationDuration: `${MOMENT_MS.kick}ms` }} />
    </button>
  )
}
