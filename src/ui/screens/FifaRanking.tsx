// The world ranking: every nation's place and points, moved against the previous publication (▲▲ climbed three or
// more, ▲ one or two, — unchanged, ▼ / ▼▼ fell), filterable by confederation.
import { useMemo } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import { Chips, Screen } from '../components/layout'
import { Badge, Empty } from '../components/atoms'
import { fmtDate } from '../../domain/dates'
import { rankingTable } from '../../engine/world/fifaRanking'
import { useRemember } from '../memory'

/** Movement since the previous ranking. */
export function MoveArrow({ move, size = 12 }: { move: number; size?: number }) {
  if (!move) return <span className="mv flat" style={{ width: size * 1.2 }}><i /></span>
  const up = move > 0, two = Math.abs(move) >= 3
  return (
    <span className={`mv ${up ? 'up' : 'down'}`} title={`${up ? 'Up' : 'Down'} ${Math.abs(move)}`}>
      <svg width={size} height={two ? size * 1.15 : size * 0.8} viewBox={two ? '0 0 12 14' : '0 0 12 9'} aria-hidden>
        {(two ? [0, 5] : [0]).map((y) => <path key={y} d={up ? `M1 ${7.5 + y}L6 ${2.5 + y}l5 5` : `M1 ${1.5 + y}l5 5 5-5`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
    </span>
  )
}

const CONFEDS = ['All', 'UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'] as const

export function FifaRanking({ params }: { params?: { id?: number } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const [cf, setCf] = useRemember<(typeof CONFEDS)[number]>('cf', 'All')
  const rows = useMemo(() => rankingTable(w), [w.intl?.fifa?.date, w.intl?.fifa?.published])
  const F = w.intl?.fifa
  if (!F || !rows.length) return <Screen title="World ranking" back><Empty icon="globe" title="No ranking yet" text="The ranking is published after the first international window." /></Screen>
  const list = rows.filter((r) => cf === 'All' || w.clubs[r.id]?.confed === cf)
  const has = new Set(rows.map((r) => w.clubs[r.id]?.confed))
  return (
    <Screen title="World ranking" sub={F.published ? `Published ${fmtDate(F.date, 'long')}` : 'Initial ranking · updated after each window'} back>
      <Chips items={CONFEDS.filter((c) => c === 'All' || has.has(c)).map((c) => ({ id: c, label: c }))} value={cf} onChange={(v) => setCf(v as (typeof CONFEDS)[number])} />
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card list fr-table" key={cf}>
          <div className="fr-row fr-h tiny dim"><span>#</span><span /><span>Nation</span><span style={{ textAlign: 'right' }}>Points</span><span style={{ textAlign: 'right' }}>+/−</span></div>
          {list.map((r, i) => {
            const c = w.clubs[r.id]
            const mine = params?.id === r.id
            return (
              <button key={r.id} className={`fr-row tap ${mine ? 'mine' : ''}`} style={{ ['--d' as any]: `${Math.min(i, 30) * 14}ms` }} onClick={() => { haptic(); go({ name: 'club', params: { id: r.id } }) }}>
                <b className="num fr-rank">{r.rank}</b>
                <MoveArrow move={r.move} />
                <span className="row tight" style={{ minWidth: 0 }}><Badge club={c} size={22} /><span className="small b ellipsis">{c.name}</span></span>
                <span className="num small" style={{ textAlign: 'right' }}>{r.pts.toFixed(2)}</span>
                <span className={`num tiny ${r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : 'dim'}`} style={{ textAlign: 'right' }}>{r.delta > 0 ? '+' : ''}{r.delta ? r.delta.toFixed(2) : '—'}</span>
              </button>
            )
          })}
        </div>
        <div className="tiny dim" style={{ margin: '10px 4px 20px', lineHeight: 1.5 }}>
          Points follow FIFA's formula: each match adds importance × (result − expected result), the expectation coming from the gap in points. Friendlies weigh 10, Nations League 15–25, qualifiers 25, continental finals 35–40, the World Cup 50–60. A knockout defeat at a finals tournament costs nothing; a shoot-out counts as 0.75 for the winner and 0.5 for the loser.
        </div>
      </div>
    </Screen>
  )
}
