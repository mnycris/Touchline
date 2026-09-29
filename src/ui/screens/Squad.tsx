import { useRemember } from '../memory'
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Player, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, Face, Ovr, PosChip, Empty } from '../components/atoms'
import { Chips, HubActions, Screen, Seg } from '../components/layout'
import { POS_GROUP, POS_ORDER } from '../../domain/constants'
import { fmtMoney } from '../../domain/finance'
import { rosterOf } from '../../engine/world/roster'
import { ageOf, avgRating, playerStatus, totals, userClub } from '../selectors'
import { formLabel, moraleLevel } from '../../domain/ratings'
import { wageBill, loanedOut } from '../../engine/world/userActions'
import { yearsLeft } from '../../engine/world/transfers'
import { fmtDate } from '../../domain/dates'

type View = 'overview' | 'status' | 'stats' | 'contract' | 'cards'
type Sort = 'pos' | 'ovr' | 'age' | 'value' | 'pot'

export function SquadHub() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const club = userClub(w)
  const [view, setView] = useRemember<View>('view', 'overview')
  const [grp, setGrp] = useRemember('grp', 'ALL')
  const [sort, setSort] = useRemember<Sort>('sort', 'pos')
  const squad = rosterOf(w, club.id)
  const list = useMemo(() => {
    const l = squad.filter((p) => grp === 'ALL' || POS_GROUP[p.positions[0]] === grp)
    const s = [...l]
    if (sort === 'pos') s.sort((a, b) => POS_ORDER[a.positions[0]] - POS_ORDER[b.positions[0]] || b.ovr - a.ovr)
    if (sort === 'ovr') s.sort((a, b) => b.ovr - a.ovr)
    if (sort === 'pot') s.sort((a, b) => b.pot - a.pot)
    if (sort === 'age') s.sort((a, b) => a.dob.localeCompare(b.dob) * -1)
    if (sort === 'value') s.sort((a, b) => b.value - a.value)
    return s
  }, [squad.length, grp, sort, w.date, useGame.getState().v])
  const avgOvr = squad.length ? Math.round(squad.reduce((a, p) => a + p.ovr, 0) / squad.length) : 0
  const avgAge = squad.length ? (squad.reduce((a, p) => a + ageOf(w, p), 0) / squad.length).toFixed(1) : '0'
  const bill = wageBill(w)
  if (w.flags.unemployed) return <Screen title="Squad" right={<HubActions />}><Empty icon="squad" title="No club" text="Find a new job to manage a squad." /></Screen>
  return (
    <Screen title={<div className="row" style={{ gap: 10 }}><Badge club={club} size={30} /><div className="title">Squad</div></div>} right={<HubActions />}>
      <div className="pad">
        <div className="squad-summary">
          <div><div className="label">Players</div><div className="display">{squad.length}</div></div>
          <div><div className="label">Avg OVR</div><div className="display">{avgOvr}</div></div>
          <div><div className="label">Avg Age</div><div className="display">{avgAge}</div></div>
          <div><div className="label">Wages/wk</div><div className="display" style={{ color: bill > club.finance.wageBudget ? 'var(--neg)' : undefined }}>{fmtMoney(bill, { short: true })}</div></div>
        </div>
        <div className="grid4" style={{ marginTop: 10 }}>
          <QuickBtn icon="tactics" label="Team Sheet" onClick={() => go({ name: 'tactics' })} />
          <QuickBtn icon="training" label="Training" onClick={() => go({ name: 'training' })} />
          <QuickBtn icon="development" label="Develop" onClick={() => go({ name: 'development' })} />
          <QuickBtn icon="contract" label="Contracts" onClick={() => go({ name: 'contracts' })} />
        </div>
      </div>
      <div className="pad" style={{ marginTop: 12 }}>
        <Seg small items={[{ id: 'cards', label: 'Cards' }, { id: 'overview', label: 'List' }, { id: 'status', label: 'Status' }, { id: 'stats', label: 'Stats' }, { id: 'contract', label: 'Deal' }]} value={view} onChange={setView} />
      </div>
      <div style={{ marginTop: 10 }} className="row between">
        <Chips items={[{ id: 'ALL', label: 'All' }, { id: 'GK', label: 'GK' }, { id: 'DEF', label: 'DEF' }, { id: 'MID', label: 'MID' }, { id: 'ATT', label: 'ATT' }]} value={grp} onChange={setGrp} />
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        <span className="tiny dim" style={{ alignSelf: 'center' }}>Sort</span>
        {(['pos', 'ovr', 'pot', 'age', 'value'] as Sort[]).map((s) => <button key={s} className={`chip ${sort === s ? 'on' : ''}`} style={{ height: 26 }} onClick={() => { haptic(); setSort(s) }}>{s === 'pos' ? 'Position' : s === 'ovr' ? 'OVR' : s === 'pot' ? 'POT' : s === 'age' ? 'Age' : 'Value'}</button>)}
      </div>
      <div className="pad" style={{ marginTop: 10 }}>
        {view === 'cards' ? (
          <div className="pcard-grid stagger">{list.map((p) => <PlayerCard key={p.id} w={w} p={p} />)}</div>
        ) : (
          <div className="card list">
            {list.map((p) => <SquadRow key={p.id} w={w} p={p} view={view} />)}
          </div>
        )}
      </div>
      <LoanedOutSection w={w} />
    </Screen>
  )
}

export function PlayerCard({ w, p }: { w: World; p: Player }) {
  const go = useGame((s) => s.go)
  const club = w.clubs[p.clubId]
  const st = playerStatus(w, p)
  const tier = p.ovr >= 85 ? 't-elite' : p.ovr >= 80 ? 't-gold' : p.ovr >= 70 ? 't-silver' : 't-bronze'
  return (
    <button className={`pcard ${tier}`} style={{ ['--pc' as any]: club?.theme || '#2a3346' }} onClick={() => { haptic(); go({ name: 'player', params: { id: p.id } }) }}>
      <span className="pcard-shine" />
      <div className="pcard-top">
        <div className="col" style={{ alignItems: 'center' }}>
          <span className="pcard-ovr">{p.ovr}</span>
          <span className="pcard-pos">{p.positions[0]}</span>
        </div>
        {st.key !== 'ok' && <span className="pcard-status" style={{ background: st.color }}><Icon name={st.icon} size={10} color="#fff" /></span>}
      </div>
      <div className="pcard-face"><Face p={p} size={66} radius={10} club={club} /></div>
      <div className="pcard-name ellipsis">{p.name}</div>
      <div className="pcard-meta"><span>{ageOf(w, p)}</span><span className="dot-sep" /><span>POT {p.pot}</span></div>
    </button>
  )
}

function QuickBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return <button className="card tap mini-btn" onClick={() => { haptic(); onClick() }}><Icon name={icon} size={20} color="var(--club2)" /><span>{label}</span></button>
}

export function SquadRow({ w, p, view = 'overview', onClick, right }: { w: World; p: Player; view?: View; onClick?: () => void; right?: React.ReactNode }) {
  const go = useGame((s) => s.go)
  const st = playerStatus(w, p)
  const club = w.clubs[p.clubId]
  const t = totals(p)
  const yl = yearsLeft(w, p)
  return (
    <button className="li tap squad-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onClick ? onClick() : go({ name: 'player', params: { id: p.id } }) }}>
      <div style={{ position: 'relative' }}>
        <Face p={p} size={44} radius={11} club={club} />
        {st.key !== 'ok' && <span className="face-badge" style={{ background: st.color }}><Icon name={st.icon} size={10} color="#fff" /></span>}
      </div>
      <div className="meta">
        <div className="t ellipsis">{p.name}{p.id === club?.sheets.find((s) => s.id === club.activeSheet)?.captain && <span className="cap">C</span>}</div>
        {view === 'overview' && <div className="s ellipsis">{ageOf(w, p)} yrs · {p.contract.role} · {fmtMoney(p.value, { short: true })}</div>}
        {view === 'status' && <div className="row tight" style={{ marginTop: 4, gap: 10 }}><Meter icon="fitness" v={p.fitness} /><Meter icon="sharpness" v={p.sharpness} /><Meter icon="morale" v={p.morale} /></div>}
        {view === 'stats' && <div className="s">{t.apps} apps · {t.goals} G · {t.assists} A · {t.rated ? avgRating(t).toFixed(2) : '–'} avg</div>}
        {view === 'contract' && <div className="s" style={{ color: yl <= 1 ? 'var(--warn)' : undefined }}>{fmtMoney(p.contract.wage)}/wk · until {p.contract.until + 1}{p.contract.releaseClause ? ` · RC ${fmtMoney(p.contract.releaseClause, { short: true })}` : ''}</div>}
        {view === 'status' && st.key !== 'ok' && <div className="tiny" style={{ color: st.color, marginTop: 3 }}>{st.label}</div>}
      </div>
      {right ?? <>
        <PosChip pos={p.positions[0]} />
        <div className="col" style={{ alignItems: 'center', gap: 2 }}>
          <Ovr v={p.ovr} size="sm" />
          <span className="tiny dim num">{p.pot}</span>
        </div>
      </>}
    </button>
  )
}

function Meter({ icon, v }: { icon: string; v: number }) {
  const c = v >= 75 ? 'var(--pos)' : v >= 50 ? 'var(--warn)' : 'var(--neg)'
  return <span className="row tight tiny" style={{ gap: 3 }}><Icon name={icon} size={12} color={c} /><b className="num" style={{ color: c }}>{Math.round(v)}</b></span>
}

function LoanedOutSection({ w }: { w: World }) {
  const out = loanedOut(w)
  const go = useGame((s) => s.go)
  if (!out.length) return null
  return (
    <>
      <div className="section-title"><div className="h3">Out on loan</div></div>
      <div className="pad"><div className="card list">
        {out.map((p) => {
          const t = totals(p)
          return (
            <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
              <Face p={p} size={40} radius={10} club={w.clubs[p.clubId]} />
              <div className="meta"><div className="t">{p.name}</div><div className="s row tight"><Badge club={w.clubs[p.clubId]} size={14} /> {w.clubs[p.clubId]?.short} · {t.apps} apps · {t.goals} G · until {fmtDate(p.loan!.until, 'dm')}</div></div>
              <Ovr v={p.ovr} size="sm" />
            </button>
          )
        })}
      </div></div>
    </>
  )
}

export function SquadStatus() {
  const w = useWorld()
  const squad = rosterOf(w, w.userClubId)
  const inj = squad.filter((p) => p.injury).sort((a, b) => a.injury!.until.localeCompare(b.injury!.until))
  const sus = squad.filter((p) => p.suspensions.length)
  const tired = squad.filter((p) => !p.injury && p.fitness < 65).sort((a, b) => a.fitness - b.fitness)
  const unhappy = squad.filter((p) => p.morale < 40).sort((a, b) => a.morale - b.morale)
  const intl = squad.filter((p) => p.intlDuty)
  const Section = ({ title, list, sub }: { title: string; list: Player[]; sub: (p: Player) => string }) => list.length ? (
    <>
      <div className="section-title"><div className="h3">{title} <span className="dim">({list.length})</span></div></div>
      <div className="pad"><div className="card list">{list.map((p) => <SquadRow key={p.id} w={w} p={p} right={<span className="tiny muted" style={{ maxWidth: 130, textAlign: 'right' }}>{sub(p)}</span>} />)}</div></div>
    </>
  ) : null
  return (
    <Screen title="Squad Status" back>
      {!inj.length && !sus.length && !tired.length && !unhappy.length && !intl.length && <Empty icon="check" title="All clear" text="Everyone is fit, available and happy." />}
      <Section title="Injured" list={inj} sub={(p) => `${p.injury!.type} · back ${fmtDate(p.injury!.until, 'dm')}`} />
      <Section title="Suspended" list={sus} sub={(p) => p.suspensions.map((s) => `${s.matches} ${s.scope === 'all' ? 'match' : s.scope}${s.matches > 1 ? 'es' : ''}`).join(', ')} />
      <Section title="International duty" list={intl} sub={(p) => p.nation} />
      <Section title="Low energy" list={tired} sub={(p) => `${Math.round(p.fitness)}% energy`} />
      <Section title="Unhappy" list={unhappy} sub={(p) => `${moraleLevel(p.morale)} · form ${formLabel(p)}`} />
    </Screen>
  )
}

export function Contracts() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const open = useGame((s) => s.open)
  const squad = [...rosterOf(w, w.userClubId)].sort((a, b) => a.contract.until - b.contract.until || b.ovr - a.ovr)
  const club = userClub(w)
  const bill = wageBill(w)
  return (
    <Screen title="Contracts" back>
      <div className="pad">
        <div className="card pad-card">
          <div className="row between"><span className="label">Wage bill</span><b>{fmtMoney(bill)}/wk</b></div>
          <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, (bill / club.finance.wageBudget) * 100)}%`, background: bill > club.finance.wageBudget ? 'var(--neg)' : 'var(--club)' }} /></div>
          <div className="row between tiny dim" style={{ marginTop: 6 }}><span>Budget {fmtMoney(club.finance.wageBudget)}/wk</span><span>Room {fmtMoney(Math.max(0, club.finance.wageBudget - bill))}</span></div>
        </div>
      </div>
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card list">
          {squad.map((p) => {
            const yl = yearsLeft(w, p)
            return (
              <div key={p.id} className="li">
                <button className="row grow" style={{ gap: 12, textAlign: 'left', minWidth: 0 }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                  <Face p={p} size={40} radius={10} club={club} />
                  <div className="meta"><div className="t ellipsis">{p.name}</div><div className="s" style={{ color: yl <= 1 ? 'var(--warn)' : undefined }}>{fmtMoney(p.contract.wage)}/wk · expires {p.contract.until + 1} · {p.contract.role}</div></div>
                </button>
                {p.loan ? <span className="tiny dim">Loan</span> : <button className={`btn xs ${yl <= 1 ? 'club' : ''}`} onClick={() => open({ name: 'renewal', params: { id: p.id } })}>Renew</button>}
              </div>
            )
          })}
        </div>
      </div>
    </Screen>
  )
}
