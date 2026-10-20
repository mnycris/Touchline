// A club's profile beyond the squad: its transfer business season by season, its news, and what kind of club it is
// (where, how big, how it stands in the world).
import { useMemo } from 'react'
import type { Club, TransferRecord, World } from '../../domain/types'
import { haptic, useGame } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Avatar, Badge, CompLogo, Empty, Face, Flag, Stars } from './atoms'
import { Seg } from './layout'
import { StoryCard, dayLabel } from './NewsCards'
import { useRemember } from '../memory'
import { fmtMoney } from '../../domain/finance'
import { fmtDate, seasonLabel } from '../../domain/dates'
import { compLogoKey, standing } from '../selectors'
import { rosterOf, wageBill } from '../../engine/world/roster'
import { compByKey } from './Follow'

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
const KIND: Record<TransferRecord['type'], string> = { transfer: 'Transfer', loan: 'Loan', free: 'Free', 'loan-return': 'Back from loan', release: 'Released', retire: 'Retired', youth: 'Academy', 'loan-buy': 'Signed after loan' }

/** Arrivals and departures, season by season, with what was paid and received. */
export function ClubTransfers({ w, club }: { w: World; club: Club }) {
  const go = useGame((s) => s.go)
  const recs = useMemo(() => w.transfers.history.filter((r) => (r.to === club.id || r.from === club.id) && r.type !== 'loan-return'), [w.transfers.history.length, w.transfers.history[0]?.date, club.id])
  const seasons = [...new Set([w.season, ...recs.map((r) => r.season)])].sort((a, b) => b - a)
  const [season, setSeason] = useRemember<number>('trSeason', seasons[0])
  const list = recs.filter((r) => r.season === season)
  const ins = list.filter((r) => r.to === club.id), outs = list.filter((r) => r.from === club.id)
  const spent = ins.reduce((a, r) => a + (r.type === 'transfer' || r.type === 'loan-buy' || r.type === 'loan' ? r.fee : 0), 0)
  const got = outs.reduce((a, r) => a + (r.type === 'transfer' || r.type === 'loan-buy' || r.type === 'loan' ? r.fee : 0), 0)
  const oldest = w.transfers.history[w.transfers.history.length - 1]
  const Row = ({ r, dir }: { r: TransferRecord; dir: 'in' | 'out' }) => {
    const p = w.players[r.playerId]
    const other = w.clubs[dir === 'in' ? r.from : r.to]
    const fee = r.type === 'transfer' || r.type === 'loan-buy' ? (r.fee ? fmtMoney(r.fee, { short: true }) : 'Undisclosed') : r.type === 'loan' ? (r.fee ? `Loan · ${fmtMoney(r.fee, { short: true })}` : 'Loan') : KIND[r.type]
    return (
      <button className="li tap ct-row" disabled={!p} onClick={() => { if (p) { haptic(); go({ name: 'player', params: { id: p.id } }) } }}>
        {p ? <Face p={p} size={38} radius={19} club={w.clubs[p.clubId]} /> : <Avatar name={r.playerName} size={38} />}
        <div className="meta">
          <div className="t small ellipsis">{r.playerName}</div>
          <div className="s tiny row tight">
            {other ? <><span className="dim">{dir === 'in' ? 'from' : 'to'}</span><Badge club={other} size={13} /><span className="ellipsis">{other.short}</span></> : <span className="dim">{dir === 'in' ? 'free agent' : r.type === 'retire' ? 'retired' : 'without a club'}</span>}
            <span className="dim">· {fmtDate(r.date, 'dm')}</span>
          </div>
        </div>
        <span className={`ct-fee ${r.type}`}>{fee}</span>
      </button>
    )
  }
  return (
    <div className="pad stack" style={{ marginTop: 10 }}>
      {seasons.length > 1 && <Seg small items={seasons.slice(0, 4).map((s) => ({ id: s, label: seasonLabel(s) }))} value={season} onChange={(v) => setSeason(v)} />}
      <div className="card ct-sum">
        <div><span className="tiny dim">Spent</span><b className="display">{fmtMoney(spent, { short: true })}</b><span className="tiny dim">{ins.length} in</span></div>
        <div><span className="tiny dim">Received</span><b className="display">{fmtMoney(got, { short: true })}</b><span className="tiny dim">{outs.length} out</span></div>
        <div><span className="tiny dim">Net</span><b className={`display ${got - spent >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(got - spent, { short: true, sign: true })}</b><span className="tiny dim">{seasonLabel(season)}</span></div>
      </div>
      {!list.length && <div className="card"><Empty icon="transfers" title="No business yet" text={season === w.season ? 'Nothing in or out this season so far.' : 'No recorded moves this season.'} /></div>}
      {ins.length > 0 && <div className="card list"><div className="card-h"><span className="label">Arrivals</span><span className="tiny dim">{ins.length}</span></div>{ins.map((r, i) => <Row key={`${r.playerId}:${i}`} r={r} dir="in" />)}</div>}
      {outs.length > 0 && <div className="card list"><div className="card-h"><span className="label">Departures</span><span className="tiny dim">{outs.length}</span></div>{outs.map((r, i) => <Row key={`${r.playerId}:${i}`} r={r} dir="out" />)}</div>}
      {oldest && season === seasons[seasons.length - 1] && season !== w.season && <div className="tiny dim" style={{ textAlign: 'center' }}>The record goes back to {fmtDate(oldest.date, 'long')}.</div>}
    </div>
  )
}

/** The club in the news: results, moves, the manager, injuries, milestones. */
export function ClubNews({ w, club }: { w: World; club: Club }) {
  const list = useMemo(() => w.news.filter((n) => n.clubIds.includes(club.id) || n.quote?.clubId === club.id).slice(0, 40), [w.news.length, w.news[0]?.id, club.id])
  if (!list.length) return <div className="pad" style={{ marginTop: 10 }}><div className="card"><Empty icon="news" title="No stories yet" text={`News about ${club.short} appears here as the season goes on.`} /></div></div>
  const days: { d: string; items: typeof list }[] = []
  for (const n of list) { const last = days[days.length - 1]; if (last && last.d === n.date) last.items.push(n); else days.push({ d: n.date, items: [n] }) }
  return (
    <div className="ns-feed">
      {days.map((g) => (
        <section key={g.d} className="ns-day">
          <div className="ns-day-h"><span>{dayLabel(w, g.d)}</span><i /></div>
          {g.items.map((n) => <StoryCard key={n.id} w={w} n={n} />)}
        </section>
      ))}
    </div>
  )
}

/** Where the club is from, how big it is and how it stands: reputation against the world, money, honours. */
export function ClubInfo({ w, club }: { w: World; club: Club }) {
  const go = useGame((s) => s.go)
  const ranks = useMemo(() => {
    const all = Object.values(w.clubs).filter((c) => !c.national).sort((a, b) => b.reputation - a.reputation)
    const world = all.findIndex((c) => c.reputation <= club.reputation) + 1
    const home = all.filter((c) => c.country === club.country)
    return { world, n: all.length, home: home.findIndex((c) => c.reputation <= club.reputation) + 1, homeN: home.length }
  }, [club.id, club.reputation])
  const st = standing(w, club.id)
  const squad = rosterOf(w, club.id)
  const value = squad.reduce((a, p) => a + p.value, 0)
  const bill = wageBill(w, club.id)
  const lg = w.leagues[club.leagueId]
  const trophies = new Map<string, number[]>()
  for (const t of club.trophies) trophies.set(t.compKey, [...(trophies.get(t.compKey) || []), t.season])
  const tier = club.reputation >= 95 ? 'One of the world’s great clubs' : club.reputation >= 88 ? 'A big name across Europe' : club.reputation >= 78 ? 'Well known beyond its league' : club.reputation >= 65 ? 'Established in its league' : club.reputation >= 50 ? 'A modest club' : 'A small club'
  return (
    <div className="pad stack" style={{ marginTop: 10 }}>
      <div className="card ci-rep">
        <div className="ci-rep-n"><b className="display">{club.reputation}</b><span className="tiny dim">reputation</span></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small b">{tier}</div>
          <div className="tiny dim" style={{ marginTop: 3 }}>{ordinal(ranks.world)} in the world · {ordinal(ranks.home)} of {ranks.homeN} in {club.country}</div>
          <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${club.reputation}%`, background: 'linear-gradient(90deg, var(--club2, var(--acc)), var(--gold))' }} /></div>
          <div className="tiny dim" style={{ marginTop: 6 }}>Built from what the club is now (squad and league) and what it has been (history, support, standing in Europe). Moves with where it finishes each season.</div>
        </div>
      </div>
      <div className="card ci-grid">
        <div><span className="tiny dim">Domestic standing</span><Stars n={club.prestige.domestic / 2} size={12} /></div>
        <div><span className="tiny dim">International standing</span><Stars n={club.prestige.intl / 2} size={12} /></div>
        <div><span className="tiny dim">{st?.lastSeason ? 'Last season' : 'League position'}</span><b className="small">{st ? `${ordinal(st.pos)} · ${st.league}` : '—'}</b></div>
        <div><span className="tiny dim">Squad value</span><b className="small">{fmtMoney(value, { short: true })}</b></div>
        <div><span className="tiny dim">Wage bill</span><b className="small">{fmtMoney(bill, { short: true })}/wk</b></div>
        <div><span className="tiny dim">Transfer budget</span><b className="small">{fmtMoney(club.finance.transferBudget, { short: true })}</b></div>
      </div>
      <div className="card pad-card small stack" style={{ gap: 8 }}>
        <div className="row between"><span className="muted">Home</span><span className="row tight b"><Flag w={w} nation={club.country} size={11} />{club.city ? `${club.city}, ${club.country}` : club.country}</span></div>
        {club.founded ? <div className="row between"><span className="muted">Founded</span><b>{club.founded}</b></div> : null}
        <div className="row between"><span className="muted">Stadium</span><b className="ellipsis" style={{ maxWidth: '62%', textAlign: 'right' }}>{club.stadium || '—'}</b></div>
        <div className="row between"><span className="muted">Capacity</span><b>{club.capacity.toLocaleString()}</b></div>
        {lg && <div className="row between"><span className="muted">League</span><span className="row tight b">{(() => { const c = compByKey(w, `L${lg.id}`); return c ? <CompLogo k={compLogoKey(c)} size={16} name={c.name} /> : null })()}{lg.name}</span></div>}
        <div className="row between"><span className="muted">Colours</span><span className="row tight">{club.kit.map((k) => <span key={k} className="swatch" style={{ width: 20, height: 20, background: k }} />)}</span></div>
      </div>
      {club.rivals.length > 0 && (
        <div className="card list">
          <div className="card-h"><span className="label">Rivals</span></div>
          {club.rivals.map(([id, name, lvl]) => w.clubs[id] && (
            <button key={id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'club', params: { id } })}>
              <Badge club={w.clubs[id]} size={30} />
              <div className="meta"><div className="t small">{w.clubs[id].name}</div><div className="s">{name}</div></div>
              <span className="row tight">{Array.from({ length: lvl }, (_, i) => <Icon key={i} name="fire" size={14} color="var(--neg)" />)}</span>
            </button>
          ))}
        </div>
      )}
      {trophies.size > 0 && (
        <div className="card list">
          <div className="card-h"><span className="label">Honours in this career</span></div>
          {[...trophies.entries()].map(([k, seasons]) => {
            const c = compByKey(w, k)
            return <div key={k} className="li"><CompLogo k={c ? compLogoKey(c) : k} size={24} name={c?.name} /><div className="meta"><div className="t small">{c?.name || k}</div><div className="s">{seasons.sort((a, b) => b - a).map(seasonLabel).join(' · ')}</div></div><b className="gold">×{seasons.length}</b></div>
          })}
        </div>
      )}
    </div>
  )
}
