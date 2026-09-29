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
import { callName } from '../../engine/match/commentary'

type View = 'overview' | 'status' | 'stats' | 'contract' | 'cards'
type Sort = 'pos' | 'ovr' | 'age' | 'value' | 'pot' | 'apps' | 'goals' | 'assists' | 'rating' | 'energy' | 'sharp' | 'morale' | 'wage' | 'expiry'
const GROUP_NAME: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Forwards' }

/** Columns per view: header label, sort key, cell renderer. Tap a header to sort by it. */
type Col = { k: Sort; label: string; w: number; cell: (w: World, p: Player) => React.ReactNode }
const pct = (v: number) => <span className="sq-meter"><i style={{ width: `${Math.max(4, Math.min(100, v))}%`, background: v >= 75 ? 'var(--pos)' : v >= 50 ? 'var(--warn)' : 'var(--neg)' }} /><b className="num">{Math.round(v)}</b></span>
const COLS: Partial<Record<View, Col[]>> = {
  status: [
    { k: 'energy', label: 'Enrg', w: 42, cell: (_w, p) => pct(p.fitness) },
    { k: 'sharp', label: 'Shrp', w: 42, cell: (_w, p) => pct(p.sharpness) },
    { k: 'morale', label: 'Mor', w: 42, cell: (_w, p) => pct(p.morale) },
  ],
  stats: [
    { k: 'apps', label: 'Apps', w: 32, cell: (_w, p) => <span className="num">{totals(p).apps}</span> },
    { k: 'goals', label: 'G', w: 22, cell: (_w, p) => <span className="num b">{totals(p).goals}</span> },
    { k: 'assists', label: 'A', w: 22, cell: (_w, p) => <span className="num">{totals(p).assists}</span> },
    { k: 'rating', label: 'Avg', w: 38, cell: (_w, p) => { const t = totals(p); return t.rated ? <span className="sq-rt num" style={{ background: ratingBg(avgRating(t)) }}>{avgRating(t).toFixed(1)}</span> : <span className="dim">–</span> } },
  ],
  contract: [
    { k: 'wage', label: 'Wage', w: 50, cell: (_w, p) => <span className="num">{fmtMoney(p.contract.wage, { short: true })}</span> },
    { k: 'expiry', label: 'Until', w: 38, cell: (w, p) => { const yl = yearsLeft(w, p); return <span className="num b" style={{ color: yl <= 0 ? 'var(--neg)' : yl <= 1 ? 'var(--warn)' : undefined }}>{p.contract.until + 1}</span> } },
    { k: 'value', label: 'Value', w: 48, cell: (_w, p) => <span className="num">{fmtMoney(p.value, { short: true })}</span> },
  ],
}
const ratingBg = (v: number) => (v >= 7.5 ? '#0db36b' : v >= 7 ? '#3cc26a' : v >= 6.5 ? '#f29b1d' : '#ef6b2c')

function sortKey(w: World, p: Player, k: Sort): number {
  const t = () => totals(p)
  switch (k) {
    case 'pos': return POS_ORDER[p.positions[0]] * 1000 - p.ovr
    case 'ovr': return -p.ovr
    case 'pot': return -p.pot
    case 'age': return -ageOf(w, p)
    case 'value': return -p.value
    case 'apps': return -t().apps
    case 'goals': return -t().goals * 100 - t().assists
    case 'assists': return -t().assists * 100 - t().goals
    case 'rating': { const x = t(); return x.rated ? -avgRating(x) : 99 }
    case 'energy': return p.fitness
    case 'sharp': return p.sharpness
    case 'morale': return p.morale
    case 'wage': return -p.contract.wage
    case 'expiry': return p.contract.until * 1000 - p.ovr
  }
}

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
    return [...l].sort((a, b) => sortKey(w, a, sort) - sortKey(w, b, sort) || b.ovr - a.ovr)
  }, [squad.length, grp, sort, w.date, useGame.getState().v])
  const avgOvr = squad.length ? Math.round(squad.reduce((a, p) => a + p.ovr, 0) / squad.length) : 0
  const avgAge = squad.length ? (squad.reduce((a, p) => a + ageOf(w, p), 0) / squad.length).toFixed(1) : '0'
  const bill = wageBill(w)
  const injured = squad.filter((p) => p.injury).length, banned = squad.filter((p) => p.suspensions.length).length
  const unhappy = squad.filter((p) => p.morale < 40).length, expiring = squad.filter((p) => yearsLeft(w, p) <= 0 && !p.loan).length
  const cols = COLS[view]
  const grouped = sort === 'pos' && grp === 'ALL' && view !== 'cards'
  const sections = grouped ? (['GK', 'DEF', 'MID', 'ATT'] as const).map((g) => ({ g, ps: list.filter((p) => POS_GROUP[p.positions[0]] === g) })).filter((x) => x.ps.length) : [{ g: '', ps: list }]
  if (w.flags.unemployed) return <Screen title="Squad" right={<HubActions />}><Empty icon="squad" title="No club" text="Find a new job to manage a squad." /></Screen>
  const setView2 = (v: View) => { setView(v); if (!COLS[v]?.some((c) => c.k === sort) && !['pos', 'ovr', 'pot', 'age', 'value'].includes(sort)) setSort('pos') }
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
        {(injured || banned || unhappy || expiring) ? (
          <button className="sq-attn" onClick={() => { haptic(); go({ name: 'squadStatus' }) }}>
            {injured > 0 && <span className="neg"><Icon name="injury" size={12} /> {injured} injured</span>}
            {banned > 0 && <span className="neg"><Icon name="red" size={12} /> {banned} suspended</span>}
            {unhappy > 0 && <span className="warn"><Icon name="morale" size={12} /> {unhappy} unhappy</span>}
            {expiring > 0 && <span className="warn"><Icon name="contract" size={12} /> {expiring} expiring</span>}
            <Icon name="forward" size={14} color="var(--t3)" />
          </button>
        ) : null}
      </div>
      <div className="pad" style={{ marginTop: 12 }}>
        <Seg small items={[{ id: 'cards', label: 'Cards' }, { id: 'overview', label: 'List' }, { id: 'status', label: 'Status' }, { id: 'stats', label: 'Stats' }, { id: 'contract', label: 'Deal' }]} value={view} onChange={setView2} />
      </div>
      <div className="sq-tools">
        <Chips items={[{ id: 'ALL', label: 'All' }, { id: 'GK', label: 'GK' }, { id: 'DEF', label: 'DEF' }, { id: 'MID', label: 'MID' }, { id: 'ATT', label: 'ATT' }]} value={grp} onChange={setGrp} />
        {!cols && (
          <div className="chips" style={{ marginTop: 6 }}>
            <span className="tiny dim" style={{ alignSelf: 'center' }}>Sort</span>
            {(['pos', 'ovr', 'pot', 'age', 'value'] as Sort[]).map((k) => <button key={k} className={`chip ${sort === k ? 'on' : ''}`} style={{ height: 26 }} onClick={() => { haptic(); setSort(k) }}>{k === 'pos' ? 'Position' : k === 'ovr' ? 'OVR' : k === 'pot' ? 'POT' : k === 'age' ? 'Age' : 'Value'}</button>)}
          </div>
        )}
      </div>
      <div className="pad" style={{ marginTop: 10 }}>
        {view === 'cards' ? (
          <div className="pcard-grid stagger">{list.map((p) => <PlayerCard key={p.id} w={w} p={p} />)}</div>
        ) : (
          <div className="card list sq-list">
            {cols && (
              <div className="sq-head">
                <button className={`sq-h-name ${sort === 'pos' ? 'on' : ''}`} onClick={() => { haptic(); setSort('pos') }}>Player</button>
                {cols.map((c) => <button key={c.k} className={sort === c.k ? 'on' : ''} style={{ width: c.w }} onClick={() => { haptic(); setSort(c.k) }}>{c.label}{sort === c.k ? ' ▾' : ''}</button>)}
                <span style={{ width: 34 }} className={sort === 'ovr' ? 'on' : ''} onClick={() => { haptic(); setSort('ovr') }}>OVR</span>
              </div>
            )}
            {sections.map((sec) => (
              <div key={sec.g || 'all'}>
                {sec.g && <div className="sq-sec"><span>{GROUP_NAME[sec.g]}</span><span className="dim">{sec.ps.length}</span></div>}
                {sec.ps.map((p) => <SquadRow key={p.id} w={w} p={p} view={view} cols={cols} />)}
              </div>
            ))}
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

export function SquadRow({ w, p, view = 'overview', onClick, right, cols }: { w: World; p: Player; view?: View; onClick?: () => void; right?: React.ReactNode; cols?: Col[] }) {
  const go = useGame((s) => s.go)
  const st = playerStatus(w, p)
  const club = w.clubs[p.clubId]
  const captain = p.id === club?.sheets.find((s) => s.id === club.activeSheet)?.captain
  return (
    <button className={`li tap squad-row ${cols ? 'has-cols' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onClick ? onClick() : go({ name: 'player', params: { id: p.id } }) }}>
      <div style={{ position: 'relative' }}>
        <Face p={p} size={cols ? 34 : 44} radius={cols ? 10 : 11} club={club} />
        {st.key !== 'ok' && <span className="face-badge" style={{ background: st.color }}><Icon name={st.icon} size={10} color="#fff" /></span>}
      </div>
      <div className="meta">
        <div className="t ellipsis">{cols ? callName(p.name) : p.name}{captain && <span className="cap">C</span>}</div>
        {cols ? <div className="s ellipsis">{p.positions[0]} · {ageOf(w, p)}{st.key !== 'ok' ? <span style={{ color: st.color }}> · {st.label}</span> : view === 'contract' ? ` · ${p.contract.role}` : ''}</div>
          : view === 'overview' ? <div className="s ellipsis">{ageOf(w, p)} yrs · {p.contract.role} · {fmtMoney(p.value, { short: true })}{st.key !== 'ok' ? <span style={{ color: st.color }}> · {st.label}</span> : null}</div> : null}
      </div>
      {cols ? <>
        {cols.map((c) => <span key={c.k} className="sq-cell" style={{ width: c.w }}>{c.cell(w, p)}</span>)}
        <span style={{ width: 34, display: 'grid', placeItems: 'center' }}><Ovr v={p.ovr} size="sm" /></span>
      </> : right ?? <>
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
