import { useRemember } from '../memory'
import { underWhite } from '../theme'
import { useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Player, Position, SquadRole, World } from '../../domain/types'
import { A } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, Flag, ImgChain, Ovr, PosChip, Radar, Ring, Sparkline, StatRow, Stars } from '../components/atoms'
import { Confirm, Screen, Sheet, Tabs } from '../components/layout'
import { ATTR_GROUPS, ATTR_LABEL, DEV_PLANS, GK_GROUPS, PLAYSTYLE_INFO, POS_GROUP, POS_NAME, POSITIONS, ROLE_GROUP, ROLES, SQUAD_ROLES, TRAINING_PLANS } from '../../domain/constants'
import { faceStats, formLabel, formValue, moraleLevel, posRating, roleFit } from '../../domain/ratings'
import { fmtMoney } from '../../domain/finance'
import { diffDays, fmtDate, seasonLabel } from '../../domain/dates'
import { ageOf, avgRating, compLogoKey, playerStatus, totals } from '../selectors'
import { playStyleIcon } from '../../services/assets'
import { attrsVisible, knowledge, potRange, scoutPlayer } from '../../engine/world/scouting'
import { askingPrice, playerInterest, sellerStance, yearsLeft } from '../../engine/world/transfers'
import { recallLoan, releaseCost, releaseUserPlayer, setJersey, setLoanListed, setSquadRole, setTransferListed, setUntouchable } from '../../engine/world/userActions'
import { rosterOf } from '../../engine/world/roster'
import { RatingBadge } from './Match'
import { Ball, Boot } from '../components/Lineup'

type Tab = 'attributes' | 'playstyles' | 'stats' | 'career' | 'development'

export function PlayerProfile({ params }: { params: { id: number } }) {
  const w = useWorld()
  const p = w.players[params.id]
  const [tab, setTab] = useRemember<Tab>('tab', 'attributes')
  if (!p) return <Screen title="Player" back><div className="pad muted">Player not found (retired or removed).</div></Screen>
  const mine = p.clubId === w.userClubId || p.loan?.fromClubId === w.userClubId
  const club = w.clubs[p.clubId]
  const vis = mine ? 'all' : attrsVisible(w, p)
  const [pLo, pHi] = mine ? [p.pot, p.pot] : potRange(w, p)
  const st = playerStatus(w, p)
  const fs = faceStats(p)
  const age = ageOf(w, p)
  return (
    <Screen title={p.name} sub={club ? club.name : 'Free agent'} back right={!mine ? <ShortlistBtn w={w} p={p} /> : undefined}>
      <div className="pad">
        <div className="player-hero" style={{ ['--pc' as any]: underWhite(club?.theme) }}>
          <div className="player-hero-bg" />
          <span className="holo" />
          <div className="row" style={{ position: 'relative', zIndex: 1, alignItems: 'flex-end', gap: 12 }}>
            <div className="col" style={{ alignItems: 'center', gap: 8, paddingBottom: 6 }}>
              <Ovr v={p.ovr} size="xl" style={{ background: 'rgba(0,0,0,.35)' }} />
              <div className="col center" style={{ gap: 3 }}>{p.positions.map((pos) => <PosChip key={pos} pos={pos} />)}</div>
            </div>
            <div className="grow" style={{ display: 'flex', justifyContent: 'center' }}>
              <Face p={p} size={150} radius={20} club={club} />
            </div>
            <div className="col" style={{ alignItems: 'center', gap: 10, paddingBottom: 6 }}>
              {club && <Badge club={club} size={40} />}
              <Flag w={w} nation={p.nation} size={22} />
              {p.jersey ? <div className="display" style={{ fontSize: 26, opacity: 0.85 }}>#{p.jersey}</div> : null}
            </div>
          </div>
          <div className="player-facestats">
            {fs.map((f) => <div key={f.key}><div className="label">{f.key}</div><div className="display" style={{ fontSize: 24, color: vis === 'none' ? 'var(--t3)' : undefined }}>{vis === 'none' ? '??' : f.value}</div></div>)}
          </div>
        </div>
      </div>

      <div className="pad" style={{ marginTop: 10 }}>
        <div className="grid3">
          <Info k="Age" v={`${age}`} sub={fmtDate(p.dob, 'short')} />
          <Info k="Potential" v={pLo === pHi ? `${pLo}` : `${pLo}–${pHi}`} sub={mine ? 'Scouted' : `${knowledge(w, p)}% known`} />
          <Info k="Value" v={fmtMoney(p.value, { short: true })} sub={`${fmtMoney(p.contract.wage, { short: true })}/wk`} />
          <Info k="Height" v={`${p.height} cm`} sub={`${p.weight} kg`} />
          <Info k="Foot" v={p.foot === 'L' ? 'Left' : 'Right'} sub={<span className="row tight">WF <Stars n={p.weakFoot} size={10} /></span>} />
          <Info k="Skills" v={<Stars n={p.skillMoves} size={12} />} sub={`WR ${p.workRate[0][0]}/${p.workRate[1][0]}`} />
        </div>
      </div>

      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card pad-card row between" style={{ gap: 8 }}>
          <div className="col center" style={{ gap: 4 }}><Ring v={p.fitness} size={50} /><span className="tiny dim">Energy</span></div>
          <div className="col center" style={{ gap: 4 }}><Ring v={p.sharpness} size={50} color="var(--info)" /><span className="tiny dim">Sharpness</span></div>
          <div className="col center" style={{ gap: 4 }}><Ring v={p.morale} size={50} color={p.morale >= 68 ? 'var(--pos)' : p.morale >= 45 ? '#9be15d' : p.morale >= 25 ? 'var(--warn)' : 'var(--neg)'} label={<Icon name={p.morale >= 45 ? 'morale' : 'moraleLow'} size={18} />} /><span className="tiny dim">{moraleLevel(p.morale)}</span></div>
          <div className="col center" style={{ gap: 4 }}><Sparkline values={p.formRatings.length ? p.formRatings : [6.5, 6.5]} w={70} h={36} /><span className="tiny dim">Form: {formLabel(p)}</span></div>
        </div>
        {st.key !== 'ok' && <div className="card pad-card row tight small" style={{ marginTop: 8, borderColor: st.color }}><Icon name={st.icon} size={16} color={st.color} /><span style={{ color: st.color }} className="b">{st.label}</span></div>}
      </div>

      <PlayerActions w={w} p={p} mine={mine} />
      {mine && <Promises w={w} p={p} />}

      <div style={{ marginTop: 14 }}>
        <Tabs sticky items={[{ id: 'attributes', label: 'Attributes' }, { id: 'playstyles', label: 'PlayStyles' }, { id: 'stats', label: 'Stats' }, { id: 'career', label: 'Career' }, ...(mine ? [{ id: 'development' as Tab, label: 'Development' }] : [])]} value={tab} onChange={setTab} />
      </div>
      {tab === 'attributes' && <AttributesTab w={w} p={p} vis={vis} />}
      {tab === 'playstyles' && <PlayStylesTab p={p} vis={vis} />}
      {tab === 'stats' && <StatsTab w={w} p={p} />}
      {tab === 'career' && <CareerTab w={w} p={p} />}
      {tab === 'development' && mine && <DevelopmentTab w={w} p={p} />}
    </Screen>
  )
}

function Info({ k, v, sub }: { k: string; v: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card pad-card" style={{ padding: '10px 12px' }}>
      <div className="tiny dim">{k}</div>
      <div className="b" style={{ fontSize: 16, marginTop: 3 }}>{v}</div>
      {sub && <div className="tiny dim" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ShortlistBtn({ w, p }: { w: World; p: Player }) {
  const mutate = useGame((s) => s.mutate)
  const on = w.transfers.shortlist.includes(p.id)
  return (
    <button className="iconbtn" aria-label="Shortlist" onClick={() => { haptic(); mutate((w) => { w.transfers.shortlist = on ? w.transfers.shortlist.filter((x) => x !== p.id) : [...w.transfers.shortlist, p.id] }); useGame.getState().notify(on ? 'Removed from shortlist' : 'Added to shortlist', 'ok') }}>
      <Icon name="shortlist" size={20} color={on ? 'var(--gold)' : undefined} />
    </button>
  )
}

function Promises({ w, p }: { w: World; p: Player }) {
  const list = w.promises.filter((x) => x.playerId === p.id).slice(-4).reverse()
  if (!list.length) return null
  return (
    <div className="pad" style={{ marginTop: 10 }}>
      <div className="card list">
        <div className="card-h"><span className="label">Promises</span></div>
        {list.map((pr) => (
          <div key={pr.id} className="li" style={{ minHeight: 50 }}>
            <Icon name={pr.status === 'fulfilled' ? 'check' : pr.status === 'broken' ? 'close' : 'handshake'} size={18} color={pr.status === 'fulfilled' ? 'var(--pos)' : pr.status === 'broken' ? 'var(--neg)' : 'var(--warn)'} />
            <div className="meta"><div className="t small">{pr.kind}</div><div className="s">{pr.status === 'active' ? `${pr.progress}/${pr.requirement} · deadline ${fmtDate(pr.deadline, 'dm')}` : `${pr.status === 'fulfilled' ? 'Kept' : 'Broken'} · made ${fmtDate(pr.made, 'dm')}`}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- actions
function PlayerActions({ w, p, mine }: { w: World; p: Player; mine: boolean }) {
  const mutate = useGame((s) => s.mutate)
  const open = useGame((s) => s.open)
  const notify = useGame((s) => s.notify)
  const [roleOpen, setRoleOpen] = useState(false)
  const [numOpen, setNumOpen] = useState(false)
  const [release, setRelease] = useState(false)
  const [scoutOpen, setScoutOpen] = useState(false)
  if (mine) {
    const loanedOut = p.loan?.fromClubId === w.userClubId
    return (
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card list">
          <div className="li"><Icon name="contract" size={18} color="var(--t2)" /><div className="meta"><div className="t small">Contract until 30 June {p.contract.until + 1}</div><div className="s">{fmtMoney(p.contract.wage)}/wk{p.contract.releaseClause ? ` · Release clause ${fmtMoney(p.contract.releaseClause)}` : ''}</div></div>{!loanedOut && !p.loan && <button className="btn xs club" onClick={() => open({ name: 'renewal', params: { id: p.id } })}>Renew</button>}</div>
          {!loanedOut && <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setRoleOpen(true)}><Icon name="squad" size={18} color="var(--t2)" /><div className="meta"><div className="t small">Squad role</div><div className="s">{p.contract.role}</div></div><Icon name="forward" size={16} color="var(--t3)" /></button>}
          {!loanedOut && <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setNumOpen(true)}><Icon name="squad" size={18} color="var(--t2)" /><div className="meta"><div className="t small">Shirt number</div><div className="s">#{p.jersey}</div></div><Icon name="forward" size={16} color="var(--t3)" /></button>}
          {p.loan && !loanedOut && <div className="li"><Icon name="loan" size={18} color="var(--info)" /><div className="meta"><div className="t small">On loan from {w.clubs[p.loan.fromClubId]?.name}</div><div className="s">Until {fmtDate(p.loan.until, 'long')} · {p.loan.wageSplit}% wages paid by parent club{p.loan.optionFee ? ` · option ${fmtMoney(p.loan.optionFee)}` : ''}</div></div></div>}
          {loanedOut && <div className="li"><Icon name="loan" size={18} color="var(--info)" /><div className="meta"><div className="t small">On loan at {w.clubs[p.clubId]?.name}</div><div className="s">Until {fmtDate(p.loan!.until, 'long')}</div></div><button className="btn xs" onClick={() => { let r = { ok: false, text: '' }; mutate((w) => { r = recallLoan(w, p) }, { roster: true }); notify(r.text, r.ok ? 'ok' : 'err') }}>Recall</button></div>}
        </div>
        {!loanedOut && !p.loan && (
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <button className={`chip ${p.transferListed ? 'on' : ''}`} onClick={() => { mutate((w) => setTransferListed(w, w.players[p.id], !p.transferListed)); notify(p.transferListed ? 'Removed from transfer list' : 'Added to transfer list', 'ok') }}><Icon name="tag" size={14} /> {p.transferListed ? 'Transfer listed' : 'Transfer list'}</button>
            <button className={`chip ${p.loanListed ? 'on' : ''}`} onClick={() => { mutate((w) => setLoanListed(w, w.players[p.id], !p.loanListed)); notify(p.loanListed ? 'Removed from loan list' : 'Added to loan list', 'ok') }}><Icon name="loan" size={14} /> {p.loanListed ? 'Loan listed' : 'Loan list'}</button>
            <button className={`chip ${p.untouchable ? 'on' : ''}`} onClick={() => mutate((w) => setUntouchable(w, w.players[p.id], !p.untouchable))}><Icon name="lock" size={14} /> Untouchable</button>
            <button className="chip" onClick={() => setRelease(true)}><Icon name="close" size={14} /> Release</button>
          </div>
        )}
        <Sheet open={roleOpen} onClose={() => setRoleOpen(false)} title="Squad Role">
          <div className="stack" style={{ gap: 8 }}>
            {SQUAD_ROLES.map((r) => <button key={r} className={`btn block ${p.contract.role === r ? 'club' : ''}`} onClick={() => { mutate((w) => setSquadRole(w, w.players[p.id], r as SquadRole)); setRoleOpen(false) }}>{r}</button>)}
            <div className="tiny dim">Promoting a player lifts his morale; lowering his role upsets him. Players expect playing time to match their role.</div>
          </div>
        </Sheet>
        <Sheet open={numOpen} onClose={() => setNumOpen(false)} title="Shirt Number">
          <div className="num-grid">
            {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => {
              const owner = rosterOf(w, w.userClubId).find((q) => q.jersey === n && q.id !== p.id)
              return <button key={n} className={`num-cell ${p.jersey === n ? 'on' : ''} ${owner ? 'taken' : ''}`} onClick={() => { let r = { ok: true, text: '' }; mutate((w) => { r = setJersey(w, w.players[p.id], n) }); notify(r.text, 'ok'); setNumOpen(false) }}>{n}</button>
            })}
          </div>
        </Sheet>
        <Confirm open={release} title={`Release ${p.name}?`} danger confirm="Release" text={`Terminating his contract costs ${fmtMoney(releaseCost(w, p))} in compensation. He becomes a free agent immediately.`} onConfirm={() => { let r = { ok: true, text: '' }; mutate((w) => { r = releaseUserPlayer(w, w.players[p.id]) }, { roster: true }); notify(r.text, 'ok'); useGame.getState().back() }} onClose={() => setRelease(false)} />
      </div>
    )
  }
  // another club's player
  const stance = p.clubId ? sellerStance(w, p, w.userClubId) : { willing: true }
  const ask = p.clubId ? askingPrice(w, p, w.userClubId) : 0
  const interest = playerInterest(w, p, w.userClubId)
  const target = w.transfers.targets[p.id]
  const active = Object.values(w.transfers.offers).find((o) => o.playerId === p.id && o.userIsBuyer && !['Completed', 'Negotiations Failed'].includes(o.status))
  return (
    <div className="pad" style={{ marginTop: 10 }}>
      <div className="card list">
        <div className="li"><Icon name="money" size={18} color="var(--t2)" /><div className="meta"><div className="t small">{p.clubId ? `Estimated asking price ${fmtMoney(ask)}` : 'Free agent'}</div><div className="s">{p.clubId ? (stance.willing ? `Contract until ${p.contract.until + 1}${p.contract.releaseClause ? ` · Release clause ${fmtMoney(p.contract.releaseClause)}` : ''}` : stance.reason) : 'Can sign immediately with agreed personal terms'}</div></div></div>
        <div className="li"><Icon name="heart" size={18} color={interest >= 60 ? 'var(--pos)' : interest >= 35 ? 'var(--warn)' : 'var(--neg)'} /><div className="meta"><div className="t small">Interest in joining: {interest >= 70 ? 'Very interested' : interest >= 50 ? 'Interested' : interest >= 30 ? 'Undecided' : 'Not interested'}</div><div className="s">{target ? `Status: ${target.status}` : 'Not yet approached'}</div></div></div>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn club grow" onClick={() => open({ name: 'negotiation', params: { playerId: p.id, offerId: active?.id, stage: active?.status === 'Offer Accepted' ? 'contract' : undefined } })} disabled={!!p.clubId && !stance.willing && !p.contract.releaseClause}>
          <Icon name="handshake" size={18} /> {active ? 'Continue talks' : p.clubId ? 'Make Offer' : 'Offer Contract'}
        </button>
        <button className="btn grow" onClick={() => setScoutOpen(true)} disabled={knowledge(w, p) >= 100}><Icon name="scout" size={18} /> Scout</button>
      </div>
      <Sheet open={scoutOpen} onClose={() => setScoutOpen(false)} title={`Scout ${p.name}`}>
        {!w.scouts.length && <div className="muted small">You have no scouts. Hire one in the Scouting hub.</div>}
        <div className="card list">
          {w.scouts.map((s) => (
            <button key={s.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { mutate((w) => scoutPlayer(w, s.id, p.id)); notify(`${s.name} will report on ${p.name}`, 'ok'); setScoutOpen(false) }}>
              <div className="meta"><div className="t">{s.name}</div><div className="s">Exp <Stars n={s.experience} size={10} /> · Judgement <Stars n={s.judgement} size={10} /></div></div>
              <span className="tiny dim">{s.assignment ? (s.assignment.kind === 'player' ? `On ${w.players[s.assignment.playerId!]?.name}` : 'Network search') : 'Available'}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------- tabs
function AttributesTab({ w, p, vis }: { w: World; p: Player; vis: 'all' | 'partial' | 'none' }) {
  const gk = p.positions[0] === 'GK'
  const groups = gk ? GK_GROUPS : ATTR_GROUPS
  const fs = faceStats(p)
  const known = (k: string, i: number) => vis === 'all' || (vis === 'partial' && (i + k.length) % 3 !== 0)
  // recent training gains (last month), your own players only
  const gains = new Map<string, number>()
  for (const g of p.attrGains || []) if (diffDays(w.date, g.date) <= 30) gains.set(g.k, (gains.get(g.k) || 0) + g.d)
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      {vis !== 'all' && <div className="card pad-card small row tight"><Icon name="eye" size={16} color="var(--info)" /><span className="muted">Scout this player to reveal {vis === 'none' ? 'his' : 'all of his'} attributes and his true potential.</span></div>}
      {vis !== 'none' && <div className="center"><Radar values={fs.map((f) => f.value)} labels={fs.map((f) => f.key)} size={230} /></div>}
      <div className="attr-grid">
        {groups.map((g) => (
          <div key={g.key} className="card pad-card" style={{ padding: 12 }}>
            <div className="row between"><span className="label">{g.label}</span><b className="num">{vis === 'none' ? '??' : Math.round(g.attrs.reduce((a, k) => a + p.attrs[A[k]], 0) / g.attrs.length)}</b></div>
            {g.attrs.map((k, i) => <StatRow key={k} label={ATTR_LABEL[k]} v={p.attrs[A[k]]} hidden={!known(k, i)} gain={gains.get(k)} />)}
          </div>
        ))}
        {gk && (
          <div className="card pad-card" style={{ padding: 12 }}>
            <div className="label">Outfield</div>
            {(['reactions', 'shortPassing', 'longPassing', 'composure', 'strength', 'jumping'] as const).map((k, i) => <StatRow key={k} label={ATTR_LABEL[k]} v={p.attrs[A[k]]} hidden={!known(k, i)} />)}
          </div>
        )}
      </div>
      <RolesCard p={p} />
      <div className="card pad-card small">
        <div className="label" style={{ marginBottom: 6 }}>Position ratings</div>
        <div className="pos-grid">
          {POSITIONS.map((pos) => {
            const r = posRating(p, pos)
            const natural = p.positions.includes(pos)
            return <div key={pos} className={`pos-cell ${natural ? 'nat' : ''}`}><span className="tiny dim">{pos}</span><b className="num" style={{ color: vis === 'none' ? 'var(--t3)' : r >= p.ovr - 1 ? 'var(--pos)' : r >= p.ovr - 6 ? '#9be15d' : r >= p.ovr - 12 ? 'var(--warn)' : 'var(--neg)' }}>{vis === 'none' ? '?' : r}</b></div>
          })}
        </div>
      </div>
    </div>
  )
}

function RolesCard({ p }: { p: Player }) {
  const rows = p.positions.flatMap((pos) => (ROLES[ROLE_GROUP[pos]] || []).map((r) => ({ pos, r, fit: roleFit(p, pos, r.name) })))
  const seen = new Set<string>()
  const list = rows.sort((a, b) => b.fit.score - a.fit.score).filter((x) => { const k = x.r.name; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 6)
  return (
    <div className="card">
      <div className="card-h"><span className="label">Role familiarity</span></div>
      <div className="list">
        {list.map(({ pos, r, fit }) => (
          <div key={r.name + pos} className="li" style={{ minHeight: 48 }}>
            <PosChip pos={pos} />
            <div className="meta"><div className="t small">{r.name}{fit.mark && <span className={`role-mark m${fit.mark.length}`}>{fit.mark}</span>}</div><div className="s">{r.desc}</div></div>
            <div style={{ width: 54 }}><div className="bar"><i style={{ width: `${fit.score * 100}%`, background: fit.mark === '++' ? 'var(--gold)' : fit.mark === '+' ? 'var(--pos)' : 'var(--t3)' }} /></div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayStylesTab({ p, vis }: { p: Player; vis: string }) {
  const all = [...p.playstylesPlus.map((n) => ({ n, plus: true })), ...p.playstyles.filter((n) => !p.playstylesPlus.includes(n)).map((n) => ({ n, plus: false }))]
  if (vis === 'none') return <div className="pad muted small" style={{ marginTop: 14 }}>Scout this player to learn his PlayStyles.</div>
  if (!all.length) return <div className="pad muted small" style={{ marginTop: 14 }}>No PlayStyles.</div>
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="grid2">
        {all.map(({ n, plus }) => {
          const info = PLAYSTYLE_INFO[n] || PLAYSTYLE_INFO[n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()]
          return (
            <div key={n} className={`card pad-card playstyle ${plus ? 'plus' : ''}`}>
              <div className="ps-icon"><PlayStyleGlyph name={n} plus={plus} /></div>
              <div className="b small" style={{ marginTop: 8 }}>{n}{plus ? '+' : ''}</div>
              <div className="tiny dim" style={{ marginTop: 3 }}>{info?.cat}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{info?.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlayStyleGlyph({ name, plus }: { name: string; plus: boolean }) {
  const url = playStyleIcon(name, plus)
  const cat = (PLAYSTYLE_INFO[name]?.cat || 'Other')
  const icon = cat === 'Shooting' ? 'goal' : cat === 'Passing' ? 'assist' : cat === 'Ball Control' ? 'ball' : cat === 'Defending' ? 'shield' : cat === 'Physical' ? 'fitness' : cat === 'Goalkeeping' ? 'glove' : 'star'
  const fallback = (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <path d="M22 2 40 12v20L22 42 4 32V12Z" fill={plus ? '#3a2d0c' : 'rgba(255,255,255,.06)'} stroke={plus ? '#F4C542' : 'rgba(255,255,255,.3)'} strokeWidth="1.5" />
      <foreignObject x="11" y="11" width="22" height="22"><Icon name={icon} size={22} color={plus ? '#F4C542' : '#cfd6e0'} /></foreignObject>
    </svg>
  )
  return url ? <ImgChain srcs={[url]} alt={name} style={{ width: 44, height: 44, objectFit: 'contain' }} fallback={fallback} /> : fallback
}

function StatsTab({ w, p }: { w: World; p: Player }) {
  const entries = Object.entries(p.season).filter(([, s]) => s.apps > 0)
  const t = totals(p)
  const gk = p.positions[0] === 'GK'
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="card pad-card">
        <div className="label" style={{ marginBottom: 10 }}>{seasonLabel(w.season)} · All competitions</div>
        <div className="stat-grid">
          <KV k="Apps" v={`${t.apps}`} sub={`${t.starts} starts`} />
          <KV k={gk ? 'Clean sheets' : 'Goals'} v={`${gk ? t.cleanSheets : t.goals}`} />
          <KV k={gk ? 'Saves' : 'Assists'} v={`${gk ? t.saves : t.assists}`} />
          <KV k="Avg rating" v={t.rated ? avgRating(t).toFixed(2) : '–'} />
          <KV k="Minutes" v={`${t.mins}`} />
          <KV k="POTM" v={`${t.motm}`} />
          <KV k={gk ? 'Conceded' : 'xG'} v={gk ? `${t.conceded}` : t.xg.toFixed(1)} />
          <KV k="Cards" v={`${t.yellows}Y ${t.reds}R`} />
        </div>
      </div>
      {entries.length > 0 && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th className="l" style={{ paddingLeft: 12 }}>Competition</th><th>Apps</th><th>{gk ? 'CS' : 'G'}</th><th>A</th><th>Avg</th></tr></thead>
            <tbody>
              {entries.map(([k, s]) => {
                const comp = w.competitions[k]
                return <tr key={k}><td className="l" style={{ paddingLeft: 12 }}><div className="row tight">{comp && <CompLogo k={compLogoKey(comp)} size={16} name={comp.name} />}<span className="ellipsis" style={{ maxWidth: 140 }}>{comp?.short || k}</span></div></td><td>{s.apps}</td><td>{gk ? s.cleanSheets : s.goals}</td><td>{s.assists}</td><td>{s.rated ? (s.ratingSum / s.rated).toFixed(1) : '–'}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      )}
      <MatchLog w={w} p={p} />
      {p.formRatings.length > 0 && (
        <div className="card pad-card">
          <div className="label" style={{ marginBottom: 8 }}>Last {p.formRatings.length} ratings</div>
          <div className="row" style={{ gap: 6 }}>{p.formRatings.map((r, i) => <RatingBadge key={i} v={r} />)}<span className="grow" /><span className="tiny dim">Form {formValue(p).toFixed(2)}</span></div>
        </div>
      )}
    </div>
  )
}

/** FotMob-style match log: every recorded appearance with the result, minutes, goal involvement and rating. */
function MatchLog({ w, p }: { w: World; p: Player }) {
  const go = useGame((s) => s.go)
  const rows = Object.values(w.fixtures)
    .filter((f) => f.played && f.result?.players.length && (f.home === p.clubId || f.away === p.clubId || f.result.players.some((x) => x.id === p.id)))
    .map((f) => ({ f, st: f.result!.players.find((x) => x.id === p.id) }))
    .filter((x) => x.st && x.st.mins > 0)
    .sort((a, b) => b.f.date.localeCompare(a.f.date))
    .slice(0, 10)
  if (!rows.length) return null
  return (
    <div className="card">
      <div className="card-h"><span className="label">Match log</span></div>
      <div className="list">
        {rows.map(({ f, st }) => {
          const side = st!.side
          const oppId = side === 0 ? f.away : f.home
          const comp = w.competitions[f.compId]
          const s = f.result!.score
          const gf = s[side], ga = s[1 - side]
          const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
          return (
            <button key={f.id} className="li tap mlog" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'fixture', params: { id: f.id } })}>
              <div className="col" style={{ width: 40, alignItems: 'center', gap: 2 }}>{comp && <CompLogo k={compLogoKey(comp)} size={16} name={comp.name} />}<span className="tiny dim">{fmtDate(f.date, 'dm')}</span></div>
              <Badge club={w.clubs[oppId]} size={24} />
              <div className="meta">
                <div className="t small ellipsis">{side === 0 ? 'vs' : '@'} {w.clubs[oppId]?.short}</div>
                <div className="s row tight" style={{ gap: 6 }}>
                  <span>{st!.mins}'</span>
                  {st!.goals > 0 && <span className="ga">{st!.goals > 1 && <b>{st!.goals}</b>}<Ball size={12} /></span>}
                  {st!.assists > 0 && <span className="ga">{st!.assists > 1 && <b>{st!.assists}</b>}<Boot size={14} /></span>}
                  {st!.yellow && <span className="card-y" style={{ marginLeft: 0 }} />}{st!.red && <span className="card-r" style={{ marginLeft: 0 }} />}
                </div>
              </div>
              <span className={`fc-score ${res}`}>{s[0]}-{s[1]}</span>
              <RatingBadge v={st!.rating} motm={f.result!.motm === p.id} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function KV({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div><div className="tiny dim">{k}</div><div className="display" style={{ fontSize: 24 }}>{v}</div>{sub && <div className="tiny dim">{sub}</div>}</div>
}

function CareerTab({ w, p }: { w: World; p: Player }) {
  const history = w.transfers.history.filter((h) => h.playerId === p.id)
  const awards = w.awards.filter((a) => a.playerId === p.id)
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      {p.career.length > 0 ? (
        <div className="card">
          <table className="tbl">
            <thead><tr><th className="l" style={{ paddingLeft: 12 }}>Season</th><th className="l">Club</th><th>Apps</th><th>G</th><th>A</th><th>OVR</th></tr></thead>
            <tbody>{[...p.career].reverse().map((c, i) => <tr key={i}><td className="l" style={{ paddingLeft: 12 }}>{seasonLabel(c.season)}</td><td className="l"><div className="row tight"><Badge club={w.clubs[c.clubId]} size={16} /><span className="ellipsis" style={{ maxWidth: 110 }}>{w.clubs[c.clubId]?.short}</span>{c.loan && <span className="tiny dim">(L)</span>}</div></td><td>{c.apps}</td><td>{c.goals}</td><td>{c.assists}</td><td>{c.ovr}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <div className="muted small">Career history builds up season by season in your save.</div>}
      {history.length > 0 && (
        <div className="card list">
          <div className="card-h"><span className="label">Transfers</span></div>
          {history.map((h, i) => (
            <div key={i} className="li" style={{ minHeight: 46 }}>
              <span className="tiny dim" style={{ width: 64 }}>{fmtDate(h.date, 'short')}</span>
              <Badge club={w.clubs[h.from]} size={20} /><Icon name="forward" size={14} color="var(--t3)" /><Badge club={w.clubs[h.to]} size={20} />
              <span className="grow small ellipsis">{w.clubs[h.to]?.short || 'Free agent'}</span>
              <span className="tiny b">{h.type === 'loan' ? 'Loan' : h.type === 'free' ? 'Free' : h.fee ? fmtMoney(h.fee, { short: true }) : h.type}</span>
            </div>
          ))}
        </div>
      )}
      {awards.length > 0 && (
        <div className="card list">
          <div className="card-h"><span className="label">Awards</span></div>
          {awards.map((a) => <div key={a.id} className="li" style={{ minHeight: 44 }}><Icon name="medal" size={18} color="var(--gold)" /><div className="meta"><div className="t small">{a.name}</div><div className="s">{a.month ? fmtDate(`${a.month}-01`, 'month') : seasonLabel(a.season)}</div></div></div>)}
        </div>
      )}
      <div className="card pad-card small">
        <div className="row between"><span className="muted">Full name</span><b>{p.fullName}</b></div>
        <div className="row between" style={{ marginTop: 6 }}><span className="muted">Nationality</span><b className="row tight"><Flag w={w} nation={p.nation} size={12} />{p.nation}</b></div>
        {p.nationalCaps ? <div className="row between" style={{ marginTop: 6 }}><span className="muted">International caps (career mode)</span><b>{p.nationalCaps}</b></div> : null}
        <div className="row between" style={{ marginTop: 6 }}><span className="muted">International reputation</span><Stars n={p.intlRep} size={11} /></div>
        <div className="row between" style={{ marginTop: 6 }}><span className="muted">Body type</span><b>{p.bodyType}</b></div>
        <div className="row between" style={{ marginTop: 6 }}><span className="muted">Joined</span><b>{p.joinedDate ? fmtDate(p.joinedDate, 'long') : '—'}</b></div>
      </div>
    </div>
  )
}

function DevelopmentTab({ w, p }: { w: World; p: Player }) {
  const mutate = useGame((s) => s.mutate)
  const [posOpen, setPosOpen] = useState(false)
  const grp = POS_GROUP[p.positions[0]]
  const plans = DEV_PLANS.filter((d) => d.group === 'ANY' || d.group === grp)
  const hist = p.growthHistory.map((g) => g.ovr)
  const loanedOut = p.loan?.fromClubId === w.userClubId
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="card pad-card">
        <div className="row between"><span className="label">Growth</span><span className="tiny dim">{p.growthHistory[0] ? `since ${fmtDate(p.growthHistory[0].date, 'short')}` : ''}</span></div>
        <div className="row" style={{ gap: 14, marginTop: 10 }}>
          <Sparkline values={hist.length > 1 ? hist : [p.ovr, p.ovr]} w={180} h={50} />
          <div className="col"><span className="tiny dim">Progress to next boost</span><div style={{ width: 90, marginTop: 6 }}><div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, p.devProgress * 10))}%`, background: 'var(--acc)' }} /></div></div><span className="tiny dim" style={{ marginTop: 6 }}>OVR {p.ovr} → POT {p.pot}</span></div>
        </div>
      </div>
      {!loanedOut && (
        <>
          <div className="card">
            <div className="card-h"><span className="label">Training plan</span></div>
            <div className="list">
              {TRAINING_PLANS.map((t) => (
                <button key={t.id} className="li tap" style={{ width: '100%', textAlign: 'left', minHeight: 50 }} onClick={() => { haptic(); mutate((w) => { w.players[p.id].trainingPlan = t.id }) }}>
                  <div className="meta"><div className="t small">{t.id}</div><div className="s">{t.desc}</div></div>
                  {p.trainingPlan === t.id && <Icon name="check" size={18} color="var(--acc)" />}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><span className="label">Development plan</span></div>
            <div className="list">
              {plans.map((d) => (
                <button key={d.id} className="li tap" style={{ width: '100%', textAlign: 'left', minHeight: 50 }} onClick={() => { haptic(); mutate((w) => { w.players[p.id].devPlan = d.id }) }}>
                  <div className="meta"><div className="t small">{d.name}</div><div className="s">{d.desc}{d.attrs.length ? ` · ${d.attrs.map((a) => ATTR_LABEL[a]).join(', ')}` : ''}</div></div>
                  {p.devPlan === d.id && <Icon name="check" size={18} color="var(--acc)" />}
                </button>
              ))}
            </div>
          </div>
          <div className="card list">
            <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setPosOpen(true)}>
              <Icon name="position" size={18} color="var(--t2)" />
              <div className="meta"><div className="t small">Position change</div><div className="s">{p.devTargetPos ? `Training as ${POS_NAME[p.devTargetPos]}${p.positions.includes(p.devTargetPos) ? ' · learned' : ''}` : 'Retrain to a new position'}</div></div>
              <Icon name="forward" size={16} color="var(--t3)" />
            </button>
          </div>
        </>
      )}
      <Sheet open={posOpen} onClose={() => setPosOpen(false)} title="Position change">
        <div className="muted small" style={{ marginBottom: 10 }}>Development shifts towards the attributes of the new position; the position is learned over time.</div>
        <div className="pos-grid">
          {POSITIONS.filter((x) => (x === 'GK') === (p.positions[0] === 'GK')).map((pos: Position) => (
            <button key={pos} className={`pos-cell ${p.devTargetPos === pos ? 'nat' : ''}`} onClick={() => { mutate((w) => { w.players[p.id].devTargetPos = p.positions[0] === pos ? undefined : pos }); setPosOpen(false) }}>
              <span className="tiny">{pos}</span><b className="num">{posRating(p, pos)}</b>
            </button>
          ))}
        </div>
        {p.devTargetPos && <button className="btn block" style={{ marginTop: 10 }} onClick={() => { mutate((w) => { w.players[p.id].devTargetPos = undefined }); setPosOpen(false) }}>Cancel position change</button>}
      </Sheet>
    </div>
  )
}

void yearsLeft
