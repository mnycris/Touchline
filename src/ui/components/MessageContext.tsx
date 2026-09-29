// What an email is about, shown under its text: the facts you'd otherwise go looking for. Each type of message gets
// its own panel: contract terms for contract talks, minutes and competition for places for playing-time requests,
// the offer against the player's value for bids, recovery details for injuries, and player cards for development.
import type { InboxMessage, Player, World } from '../../domain/types'
import { A } from '../../domain/types'
import { ATTR_LABEL, POS_GROUP } from '../../domain/constants'
import { ageOn, fmtDate } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { useGame } from '../../store/game'
import { avgRating, totals } from '../selectors'
import { rosterOf } from '../../engine/world/roster'
import { Badge, Face, Ovr, PosChip } from './atoms'
import { Icon } from '../icons/Icon'

type Kind = 'dev' | 'contract' | 'minutes' | 'bid' | 'medical' | 'scouting' | 'player' | 'none'

function kindOf(m: InboxMessage): Kind {
  if (m.dev?.length) return 'dev'
  const t = `${m.subject} ${m.body}`.toLowerCase()
  const acts = m.actions.map((a) => a.action).join(' ')
  if (m.category === 'Medical') return 'medical'
  if (/acceptbid|negotiatebid|rejectbid/i.test(acts) || /offer received|bid for/.test(t)) return 'bid'
  if (/contract|renew|extension|wage/.test(t)) return 'contract'
  if (/loan|minutes|playing time|first-team football|not playing|benched|starts?\b/.test(t)) return 'minutes'
  if (m.category === 'Scouting' || m.category === 'Youth') return 'scouting'
  return m.playerId ? 'player' : 'none'
}

const Fact = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'pos' | 'neg' | 'warn' }) => (
  <div className="mc-fact"><span className="tiny dim">{k}</span><span className={`small b ${tone || ''}`}>{v}</span></div>
)

function PlayerHead({ w, p }: { w: World; p: Player }) {
  const go = useGame((s) => s.go)
  return (
    <button className="mc-head" onClick={() => go({ name: 'player', params: { id: p.id } })}>
      <Face p={p} size={46} radius={12} club={w.clubs[p.clubId]} />
      <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <div className="b ellipsis">{p.name}</div>
        <div className="tiny dim row tight" style={{ gap: 5 }}><Badge club={w.clubs[p.clubId]} size={12} />{w.clubs[p.clubId]?.short || 'Free agent'} · {ageOn(p.dob, w.date)} yrs</div>
      </div>
      <PosChip pos={p.positions[0]} /><Ovr v={p.ovr} size="sm" />
      <Icon name="forward" size={14} color="var(--t3)" />
    </button>
  )
}

export function MessageContext({ w, m }: { w: World; m: InboxMessage }) {
  const go = useGame((s) => s.go)
  const kind = kindOf(m)
  const p = m.playerId ? w.players[m.playerId] : undefined
  if (kind === 'dev') {
    return (
      <div className="card mc">
        <div className="mc-h"><Icon name="up" size={14} /> Development this fortnight</div>
        {m.dev!.map((r) => {
          const q = w.players[r.id]
          if (!q) return null
          const d = r.to - r.from
          return (
            <button key={r.id} className="mc-dev" onClick={() => go({ name: 'player', params: { id: q.id } })}>
              <Face p={q} size={40} radius={11} club={w.clubs[q.clubId]} />
              <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                <div className="small b ellipsis">{q.name} <span className="tiny dim">{q.positions[0]} · {ageOn(q.dob, w.date)}</span></div>
                <div className="mc-attrs">{r.attrs.map(([k, v]) => <span key={k} className={`mc-attr ${v > 0 ? 'pos' : 'neg'}`}>{ATTR_LABEL[k]} {v > 0 ? '+' : ''}{v}</span>)}</div>
              </div>
              <div className="mc-ovr num"><span className="dim">{r.from}</span><Icon name="forward" size={11} /><b>{r.to}</b><span className={`mc-d ${d > 0 ? 'pos' : 'neg'}`}>{d > 0 ? '+' : ''}{d}</span></div>
            </button>
          )
        })}
      </div>
    )
  }
  if (!p) return null
  const club = w.clubs[p.clubId]
  const yl = Math.max(0, p.contract.until - w.season)
  const t = totals(p, (k) => k.includes(String(w.season)))
  if (kind === 'contract') {
    return (
      <div className="card mc">
        <div className="mc-h"><Icon name="contract" size={14} /> Current contract</div>
        <PlayerHead w={w} p={p} />
        <div className="mc-grid">
          <Fact k="Wage" v={`${fmtMoney(p.contract.wage)}/wk`} />
          <Fact k="Expires" v={p.contract.until ? `June ${p.contract.until + 1}` : '–'} tone={yl <= 1 ? 'warn' : undefined} />
          <Fact k="Years left" v={yl <= 0 ? 'Final months' : String(yl)} tone={yl <= 1 ? 'warn' : undefined} />
          <Fact k="Squad role" v={p.contract.role} />
          <Fact k="Release clause" v={p.contract.releaseClause ? fmtMoney(p.contract.releaseClause) : 'None'} />
          <Fact k="Morale" v={p.morale >= 70 ? 'Happy' : p.morale >= 45 ? 'Content' : 'Unhappy'} tone={p.morale >= 70 ? 'pos' : p.morale < 45 ? 'neg' : undefined} />
        </div>
      </div>
    )
  }
  if (kind === 'minutes') {
    const rivals = rosterOf(w, p.clubId).filter((q) => q.id !== p.id && POS_GROUP[q.positions[0]] === POS_GROUP[p.positions[0]]).sort((a, b) => b.ovr - a.ovr).slice(0, 4)
    const clubGames = Object.values(w.fixtures).filter((f) => f.played && f.date >= `${w.season}-07-01` && (f.home === p.clubId || f.away === p.clubId)).length
    return (
      <div className="card mc">
        <div className="mc-h"><Icon name="clock" size={14} /> Playing time</div>
        <PlayerHead w={w} p={p} />
        <div className="mc-grid">
          <Fact k="Appearances" v={`${t.apps}${clubGames ? ` of ${clubGames}` : ''}`} tone={clubGames && t.apps < clubGames * 0.3 ? 'neg' : undefined} />
          <Fact k="Minutes" v={t.mins.toLocaleString('en-GB')} />
          <Fact k="Avg rating" v={t.rated ? avgRating(t).toFixed(2) : '–'} />
          <Fact k="Potential" v={`${p.ovr} → ${p.pot}`} />
        </div>
        {rivals.length > 0 && (
          <div className="mc-list">
            <div className="tiny dim" style={{ margin: '4px 0 6px' }}>Competition for his place</div>
            {rivals.map((q) => (
              <div key={q.id} className="mc-rival"><Face p={q} size={24} radius={7} club={club} /><span className="small ellipsis grow">{q.name}</span><span className="tiny dim">{q.positions[0]}</span><Ovr v={q.ovr} size="sm" /></div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (kind === 'bid') {
    const offer = Object.values(w.transfers.offers).filter((o) => o.playerId === p.id && o.userIsSeller).sort((a, b) => (b.history.length ? 1 : 0) - (a.history.length ? 1 : 0)).slice(-1)[0]
    const buyer = offer ? w.clubs[offer.fromClubId] : m.clubId ? w.clubs[m.clubId] : undefined
    const ratio = offer && p.value ? offer.fee / p.value : 0
    return (
      <div className="card mc">
        <div className="mc-h"><Icon name="transfers" size={14} /> The offer</div>
        <PlayerHead w={w} p={p} />
        <div className="mc-grid">
          {offer && <Fact k="Offer" v={fmtMoney(offer.fee)} tone={ratio >= 1.1 ? 'pos' : ratio < 0.85 ? 'neg' : undefined} />}
          <Fact k="Market value" v={fmtMoney(p.value)} />
          {offer && <Fact k="Against value" v={`${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`} tone={ratio >= 1.1 ? 'pos' : ratio < 0.85 ? 'neg' : undefined} />}
          <Fact k="Contract" v={yl <= 0 ? 'Expiring' : `${yl} yr${yl === 1 ? '' : 's'} left`} tone={yl <= 1 ? 'warn' : undefined} />
          <Fact k="Squad role" v={p.contract.role} />
          <Fact k="This season" v={`${t.apps} apps · ${t.goals} G · ${t.assists} A`} />
        </div>
        {buyer && (
          <button className="mc-club" onClick={() => go({ name: 'club', params: { id: buyer.id } })}>
            <Badge club={buyer} size={28} /><div className="grow" style={{ textAlign: 'left' }}><div className="small b">{buyer.name}</div><div className="tiny dim">{w.leagues[buyer.leagueId]?.name || buyer.country}</div></div><Icon name="forward" size={14} color="var(--t3)" />
          </button>
        )}
      </div>
    )
  }
  if (kind === 'medical') {
    const inj = p.injury
    const missed = inj ? Object.values(w.fixtures).filter((f) => !f.played && (f.home === p.clubId || f.away === p.clubId) && f.date >= w.date && f.date < inj.until).length : 0
    return (
      <div className="card mc">
        <div className="mc-h"><Icon name="injury" size={14} /> Medical</div>
        <PlayerHead w={w} p={p} />
        <div className="mc-grid">
          {inj ? <>
            <Fact k="Injury" v={inj.type} tone="neg" />
            <Fact k="Expected return" v={fmtDate(inj.until, 'dm')} />
            <Fact k="Matches at risk" v={String(missed)} tone={missed >= 3 ? 'neg' : undefined} />
            <Fact k="Severity" v={inj.totalDays >= 60 ? 'Long-term' : inj.totalDays >= 21 ? 'Several weeks' : 'Short-term'} />
          </> : <>
            <Fact k="Status" v="Available" tone="pos" />
            <Fact k="Fitness" v={`${Math.round(p.fitness)}%`} />
            <Fact k="Sharpness" v={`${Math.round(p.sharpness)}%`} tone={p.sharpness < 60 ? 'warn' : undefined} />
          </>}
        </div>
      </div>
    )
  }
  return (
    <div className="card mc">
      <PlayerHead w={w} p={p} />
      <div className="mc-grid">
        <Fact k="Value" v={fmtMoney(p.value)} />
        <Fact k="Contract" v={p.contract.until ? `Until ${p.contract.until + 1}` : 'Free agent'} />
        <Fact k={kind === 'scouting' ? 'Potential' : 'This season'} v={kind === 'scouting' ? `${p.pot}` : `${t.apps} apps · ${t.goals} G`} />
        <Fact k="Best attribute" v={(() => { const ks = Object.keys(A) as (keyof typeof A)[]; const k = ks.reduce((b, x) => (p.attrs[A[x]] > p.attrs[A[b]] ? x : b), ks[0]); return `${ATTR_LABEL[k]} ${p.attrs[A[k]]}` })()} />
      </div>
    </div>
  )
}
