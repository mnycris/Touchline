import { useRemember } from '../memory'
import { ClubMoneyEditor, EditToggle, useEditing } from '../components/Editors'
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Club, Competition, Fixture, Player, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Empty, Face, Flag, FormPips, Ovr, PosChip, Stars } from '../components/atoms'
import { HubActions, Screen, Seg, Tabs } from '../components/layout'
import { addDays, fmtDate, seasonLabel, weekday } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { sortTable, ZONE_COLOR, ZONE_LABEL, zoneFor, type Zone } from '../../engine/competitions/tables'
import { compLogoKey, fixturesOf, leagueOf, opponent, outcomeFor, seasonComps } from '../selectors'
import { FixtureRow } from './Match'
import { rosterOf, allPlayers } from '../../engine/world/roster'
import { POS_ORDER, formationOf } from '../../domain/constants'
import { ordinal } from './Menu'
import { Bracket } from '../components/KnockoutBracket'
import { fixturesByDate } from '../../engine/competitions/fixtures'
import { starRating } from '../rawHelpers'
import { tableAround } from '../selectors'
import { FormStrip } from './MatchDay'
import { Ball, Boot, Boots, TeamLineup, sideFromSheet, RatingPill } from '../components/Lineup'
import { sideInput } from '../../engine/world/matchRunner'
import { intlStage, nationalSquad, seasonReviewDate, userNations } from '../../engine/world/international'

// ============================================================================ season hub
export function SeasonHub() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const [tab, setTab] = useRemember<'mine' | 'fixtures' | 'world'>('tab', 'mine')
  const comps = w.flags.unemployed ? [] : seasonComps(w, w.userClubId)
  return (
    <Screen title="Season" sub={seasonLabel(w.season)} right={<HubActions />}>
      <Tabs items={[{ id: 'mine', label: 'Competitions' }, { id: 'fixtures', label: 'Fixtures' }, { id: 'world', label: 'World' }]} value={tab} onChange={setTab} />
      {tab === 'mine' && (
        <div className="pad stack stagger" style={{ marginTop: 12 }}>
          {!w.flags.unemployed && <SeasonOverview w={w} />}
          {comps.map((c) => <CompCard key={c.id} w={w} c={c} />)}
          {!w.flags.unemployed && <SeasonLeaders w={w} />}
          <div className="grid2">
            <button className="card tap mini-btn" onClick={() => go({ name: 'calendar' })}><Icon name="calendar" size={22} color="var(--club2)" /><span>Calendar</span></button>
            <button className="card tap mini-btn" onClick={() => go({ name: 'awards' })}><Icon name="medal" size={22} color="var(--club2)" /><span>Awards & History</span></button>
          </div>
        </div>
      )}
      {tab === 'fixtures' && <ClubFixtures w={w} clubId={w.userClubId} />}
      {tab === 'world' && <WorldLeagues w={w} />}
    </Screen>
  )
}

/** Where the season stands: league progress, the next match and what is coming up on the calendar. */
function SeasonOverview({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const me = w.userClubId
  const lg = leagueOf(w, me)
  const all = fixturesOf(w, me).filter((f) => w.competitions[f.compId]?.season === w.season)
  const lgFx = lg ? all.filter((f) => f.compId === lg.id) : []
  const done = lgFx.filter((f) => f.played).length
  const next = all.find((f) => !f.played)
  const upcoming: { d: string; icon: string; text: string; color: string }[] = []
  for (const x of w.windows) {
    if (x.open > w.date) upcoming.push({ d: x.open, icon: 'transfers', text: `${x.name} window opens`, color: 'var(--tw)' })
    else if (x.close >= w.date) upcoming.push({ d: x.close, icon: 'deadline', text: `${x.name} deadline day`, color: 'var(--neg)' })
  }
  for (const b of w.intlBreaks) if (b.start > w.date) upcoming.push({ d: b.start, icon: 'globe', text: 'International break', color: 'var(--info)' })
  upcoming.push({ d: seasonReviewDate(w), icon: 'season', text: 'Season review', color: 'var(--gold)' })
  const soon = upcoming.filter((u) => u.d >= w.date).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 2)
  const res = all.filter((f) => f.played && f.result).map((f) => outcomeFor(f, me))
  const pct = lgFx.length ? done / lgFx.length : 0
  return (
    <div className="card pad-card so-card">
      <div className="row between">
        <div><div className="label">Season {seasonLabel(w.season)}</div><div className="h3" style={{ marginTop: 4 }}>{lg ? (done ? `Matchday ${done} of ${lgFx.length}` : 'Pre-season') : 'Season'}</div></div>
        {res.length > 0 && <div className="col" style={{ alignItems: 'flex-end', gap: 3 }}><span className="tiny dim">All competitions</span><span className="small b"><span className="pos">W{res.filter((r) => r === 'W').length}</span> · D{res.filter((r) => r === 'D').length} · <span className="neg">L{res.filter((r) => r === 'L').length}</span></span></div>}
      </div>
      {lg && <div className="so-bar"><i style={{ width: `${Math.max(2, pct * 100)}%` }} /></div>}
      {next && (
        <button className="so-next" onClick={() => go({ name: 'prematch', params: { id: next.id } })}>
          <span className="tiny dim">Next</span>
          <Badge club={w.clubs[opponent(next, me)]} size={22} />
          <span className="small b ellipsis">{w.clubs[opponent(next, me)]?.short} ({next.home === me ? 'H' : 'A'})</span>
          <span className="tiny dim ellipsis">{w.competitions[next.compId]?.short} · {fmtDate(next.date, 'dm')}</span>
          <Icon name="forward" size={14} color="var(--t3)" />
        </button>
      )}
      {soon.length > 0 && (
        <div className="so-soon">
          {soon.map((u) => {
            const n = Math.max(0, Math.round((Date.parse(u.d) - Date.parse(w.date)) / 864e5))
            return <span key={u.text} className="tiny row tight"><Icon name={u.icon} size={13} color={u.color} />{u.text} · <b>{n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n} days`}</b></span>
          })}
        </div>
      )}
    </div>
  )
}

/** The squad's season so far across every competition. */
function SeasonLeaders({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const squad = rosterOf(w, w.userClubId)
  const tot = (p: Player) => Object.entries(p.season).filter(([cid]) => w.competitions[cid]?.season === w.season || !w.competitions[cid])
    .reduce((a, [, x]) => ({ apps: a.apps + x.apps, g: a.g + x.goals, as: a.as + x.assists, r: a.r + x.ratingSum, n: a.n + x.rated, cs: a.cs + x.cleanSheets }), { apps: 0, g: 0, as: 0, r: 0, n: 0, cs: 0 })
  const rows = squad.map((p) => ({ p, s: tot(p) })).filter((x) => x.s.apps > 0)
  if (!rows.length) return null
  const top = <K extends 'g' | 'as' | 'cs'>(k: K) => [...rows].sort((a, b) => b.s[k] - a.s[k])[0]
  const minApps = Math.max(3, Math.round(Math.max(...rows.map((r) => r.s.apps)) * 0.4))
  const best = [...rows].filter((x) => x.s.n >= minApps).sort((a, b) => b.s.r / b.s.n - a.s.r / a.s.n)[0]
  const gk = [...rows].filter((x) => x.p.positions[0] === 'GK').sort((a, b) => b.s.cs - a.s.cs)[0]
  const tiles = [
    { k: 'Top scorer', x: top('g'), v: (x: (typeof rows)[number]) => `${x.s.g}`, show: top('g')?.s.g > 0, icon: <Ball size={12} /> },
    { k: 'Most assists', x: top('as'), v: (x: (typeof rows)[number]) => `${x.s.as}`, show: top('as')?.s.as > 0, icon: <Boot size={14} /> },
    { k: 'Best rated', x: best, v: (x: (typeof rows)[number]) => (x.s.r / x.s.n).toFixed(2), show: !!best, icon: <Icon name="star" size={12} color="var(--gold)" /> },
    { k: 'Clean sheets', x: gk, v: (x: (typeof rows)[number]) => `${x.s.cs}`, show: !!gk && gk.s.cs > 0, icon: <Icon name="shield" size={12} color="var(--info)" /> },
  ].filter((t) => t.show && t.x)
  if (!tiles.length) return null
  return (
    <div className="card">
      <div className="card-h"><span className="label">Season leaders</span></div>
      <div className="sl-grid">
        {tiles.map((t) => (
          <button key={t.k} className="sl" onClick={() => go({ name: 'player', params: { id: t.x!.p.id } })}>
            <Face p={t.x!.p} size={44} radius={22} club={w.clubs[w.userClubId]} />
            <span className="small b ellipsis" style={{ maxWidth: '100%' }}>{t.x!.p.name.split(' ').slice(-1)[0]}</span>
            <span className="row tight tiny dim">{t.icon}{t.k}</span>
            <b className="display">{t.v(t.x!)}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

const shortRound = (name: string) => {
  const n = name.toLowerCase()
  if (/semi/.test(n)) return 'SF'
  if (/quarter/.test(n)) return 'QF'
  if (/final/.test(n)) return 'F'
  if (/league phase/.test(n)) return 'LP'
  if (/play-?off/.test(n)) return 'PO'
  const m = n.match(/round of (\d+)/); if (m) return `R${m[1]}`
  const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].findIndex((x) => n.startsWith(x)); if (ord >= 0) return `R${ord + 1}`
  const d = n.match(/(\d+)/); if (d) return `R${d[1]}`
  return name.split(/\s+/).map((x) => x[0]).join('').toUpperCase().slice(0, 3)
}

/** The user's road through a cup: rounds played (won or lost), the current one and the ones still ahead. */
function cupPath(w: World, c: Competition): { id: string; name: string; short: string; state: 'won' | 'lost' | 'now' | 'ahead' }[] {
  const me = w.userClubId
  const mine = (id: string) => { const f = w.fixtures[id]; return !!f && (f.home === me || f.away === me) }
  const out: ReturnType<typeof cupPath> = []
  if (c.format === 'uefa' && c.table?.some((r) => r.clubId === me)) {
    const row = c.table.find((r) => r.clubId === me)!
    const pos = sortTable(w, c).findIndex((r) => r.clubId === me) + 1
    const lpDone = row.p >= 8
    out.push({ id: 'lp', name: 'League phase', short: 'LP', state: !lpDone ? 'now' : pos <= 24 ? 'won' : 'lost' })
    if (out[0].state === 'lost') return out
  }
  const first = c.rounds.findIndex((r) => r.fixtures.some(mine) || r.entrants?.includes(me))
  const start = first >= 0 ? first : out.length ? 0 : -1
  if (start < 0) return out
  for (let i = start; i < c.rounds.length; i++) {
    const r = c.rounds[i]
    const played = r.fixtures.filter(mine).map((id) => w.fixtures[id])
    // a drawn round we are not in (a bye, or a play-off round skipped by finishing high enough) is not on our road
    if (r.drawn && !played.length && (r.byes?.includes(me) || c.format === 'uefa' || r.winners?.length)) continue
    const done = played.length > 0 && played.every((f) => f.played) && !!r.winners?.length
    const current = out.some((x) => x.state === 'now')
    const state = done ? (r.winners!.includes(me) ? 'won' : 'lost') : current ? 'ahead' : 'now'
    out.push({ id: r.id, name: r.name, short: shortRound(r.name), state })
    if (state === 'lost') break
  }
  return out
}

function CompCard({ w, c }: { w: World; c: Competition }) {
  const go = useGame((s) => s.go)
  const me = w.userClubId
  let status = ''
  const myRow = c.table?.find((r) => r.clubId === me)
  if ((c.format === 'league' || (c.format === 'uefa' && c.table)) && myRow) {
    if (!myRow.p) status = c.format === 'uefa' ? 'League phase · 8 matches' : `${c.clubs.length} clubs · season starts ${fmtDate((fixturesOf(w, me).find((f) => f.compId === c.id)?.date) || w.date, 'dm')}`
    else {
      const t = sortTable(w, c)
      const pos = t.findIndex((r) => r.clubId === me) + 1
      status = `${ordinal(pos)} · ${myRow.pts - (myRow.ded || 0)} pts · ${myRow.p} played`
    }
  }
  if (c.format !== 'league') {
    const mine = (id: string) => { const f = w.fixtures[id]; return f && (f.home === me || f.away === me) }
    const active = [...c.rounds].reverse().find((r) => r.drawn && r.fixtures.some(mine))
    const roundDone = (r: typeof c.rounds[number]) => r.fixtures.filter(mine).every((id) => w.fixtures[id].played)
    const out = c.rounds.some((r) => r.drawn && r.fixtures.some(mine) && roundDone(r) && r.winners && r.winners.length > 0 && !r.winners.includes(me))
    if (c.winner === me) status = 'Winners!'
    else if (out) status = `Eliminated${active ? ` · ${active.name}` : ''}`
    else if (active && !(c.format === 'uefa' && !myRow?.p && active === c.rounds[0])) status = active.fixtures.filter(mine).every((id) => w.fixtures[id].played) ? `${active.name} · through` : active.name
    else if (!status) status = c.rounds[0] ? `${c.rounds[0].name} · ${fmtDate(c.rounds[0].date, 'dm')}` : 'Upcoming'
  }
  const next = fixturesOf(w, me).find((f) => !f.played && f.compId === c.id)
  const path = c.format !== 'league' ? cupPath(w, c) : []
  return (
    <button className="card tap comp-card" onClick={() => { haptic(); go({ name: 'comp', params: { id: c.id } }) }}>
      <div className="row" style={{ padding: 14, gap: 14 }}>
        <div className="logo-tile lg"><CompLogo k={compLogoKey(c)} size={44} name={c.name} /></div>
        <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
          <div className="h3 ellipsis">{c.name}</div>
          <div className="small muted" style={{ marginTop: 3 }}>{status}</div>
          {next && <div className="tiny dim" style={{ marginTop: 3 }}>Next: {w.clubs[opponent(next, me)]?.short} ({next.home === me ? 'H' : 'A'}) · {fmtDate(next.date, 'dm')}</div>}
          {path.length > 1 && <div className="cup-path">{path.map((r) => <span key={r.id} className={`cp ${r.state}`} title={r.name}>{r.short}</span>)}</div>}
        </div>
        <Icon name="forward" size={18} color="var(--t3)" />
      </div>
    </button>
  )
}

function ClubFixtures({ w, clubId }: { w: World; clubId: number }) {
  const list = fixturesOf(w, clubId).filter((f) => w.competitions[f.compId]?.season === w.season)
  const byMonth = new Map<string, Fixture[]>()
  for (const f of list) { const k = f.date.slice(0, 7); const a = byMonth.get(k) || []; a.push(f); byMonth.set(k, a) }
  if (!list.length) return <Empty icon="calendar" title="No fixtures" />
  return (
    <div className="pad" style={{ marginTop: 10 }}>
      {[...byMonth.entries()].map(([m, fx]) => (
        <div key={m} style={{ marginBottom: 12 }}>
          <div className="label" style={{ margin: '10px 4px 6px' }}>{fmtDate(`${m}-01`, 'month')}</div>
          <div className="card list">{fx.map((f) => <FixtureRow key={f.id} w={w} f={f} clubId={clubId} />)}</div>
        </div>
      ))}
    </div>
  )
}

function WorldLeagues({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const comps = Object.values(w.competitions).filter((c) => c.season === w.season)
  const byCountry = new Map<string, Competition[]>()
  for (const c of comps) { const a = byCountry.get(c.country) || []; a.push(c); byCountry.set(c.country, a) }
  const order = ['International', 'Europe', 'England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands']
  const entries = [...byCountry.entries()].sort((a, b) => ((order.indexOf(a[0]) + 1) || 99) - ((order.indexOf(b[0]) + 1) || 99) || a[0].localeCompare(b[0]))
  // internationals: the big tournaments first, friendlies last
  const intlOrder = (c: Competition) => (c.intl?.kind === 'friendly' ? 9 : c.tier) + (c.status === 'finished' ? 0.5 : 0)
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      {entries.map(([country, list]) => (
        <div key={country} className="card">
          <div className="card-h"><div className="row tight">{country === 'International' ? <Icon name="globe" size={15} color="var(--info)" /> : country !== 'Europe' && <Flag w={w} nation={country} code={Object.values(w.leagues).find((l) => l.country === country)?.flag} size={13} />}<span className="label">{country}</span></div>{country === 'International' && <span className="tiny dim">{Object.keys(w.intl?.nt || {}).length} nations</span>}</div>
          <div className="list">
            {list.sort((a, b) => country === 'International' ? intlOrder(a) - intlOrder(b) : (a.format === 'league' ? 0 : 1) - (b.format === 'league' ? 0 : 1) || a.tier - b.tier).map((c) => (
              <button key={c.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'comp', params: { id: c.id } })}>
                <div className="logo-tile"><CompLogo k={compLogoKey(c)} size={30} name={c.name} /></div>
                <div className="meta"><div className="t small">{c.name}</div><div className="s">{c.format === 'intl' ? `${c.intl?.kind === 'friendly' ? '' : `${c.clubs.length} nations · `}${intlStage(w, c)}` : c.status === 'finished' ? `Winner: ${w.clubs[c.winner || 0]?.short || sortTable(w, c)[0] && w.clubs[sortTable(w, c)[0].clubId]?.short}` : `${c.clubs.length} clubs`}</div></div>
                <Icon name="forward" size={16} color="var(--t3)" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================ competition
export function CompScreen({ params }: { params: { id: string } }) {
  const w = useWorld()
  const c = w.competitions[params.id]
  const hasTable = !!c?.table
  const groups = !!c?.groups && Object.keys(c.groups).length > 0
  const hasKO = !!c && (c.rounds.length > 0 || c.intl?.kind === 'tournament')
  const [tab, setTab] = useRemember<'table' | 'fixtures' | 'bracket' | 'stats'>('tab', hasTable ? 'table' : c?.intl ? 'fixtures' : 'bracket')
  if (!c) return <Screen title="Competition" back><Empty icon="trophy" title="Competition not found" /></Screen>
  const items = [
    ...(hasTable ? [{ id: 'table' as const, label: c.format === 'uefa' ? 'League Phase' : groups ? 'Groups' : 'Table' }] : []),
    { id: 'fixtures' as const, label: 'Fixtures' },
    ...(hasKO ? [{ id: 'bracket' as const, label: c.format === 'league' ? 'Play-offs' : 'Knockouts' }] : []),
    { id: 'stats' as const, label: 'Stats' },
  ]
  return (
    <Screen title={c.short} sub={`${c.name} · ${seasonLabel(c.season)}`} back right={<div style={{ width: 40 }}><CompLogo k={compLogoKey(c)} size={32} name={c.name} /></div>}>
      <Tabs sticky items={items} value={tab} onChange={setTab} />
      {tab === 'table' && (groups ? <GroupTables w={w} c={c} /> : <TableView w={w} c={c} />)}
      {tab === 'fixtures' && <CompFixtures w={w} c={c} />}
      {tab === 'bracket' && <Bracket w={w} c={c} />}
      {tab === 'stats' && <CompStats w={w} c={c} />}
    </Screen>
  )
}

export function TableView({ w, c, compact, highlight }: { w: World; c: Competition; compact?: boolean; highlight?: number[] }) {
  const go = useGame((s) => s.go)
  const [mode, setMode] = useRemember<'short' | 'full' | 'form'>('tableMode', 'short')
  const t = sortTable(w, c)
  const zones = new Map<Zone, true>()
  t.forEach((_, i) => { const z = zoneFor(w, c, i + 1, t.length); if (z) zones.set(z, true) })
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      {!compact && <Seg small items={[{ id: 'short', label: 'Short' }, { id: 'full', label: 'Full' }, { id: 'form', label: 'Form' }]} value={mode} onChange={setMode} />}
      <div className="card" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 28 }}>#</th><th className="l">Club</th><th>P</th>{mode === 'full' && <><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th></>}{mode === 'form' ? <th>Form</th> : <th>GD</th>}<th>Pts</th></tr></thead>
          <tbody>
            {t.map((r, i) => {
              const z = zoneFor(w, c, i + 1, t.length)
              const next = zoneFor(w, c, i + 2, t.length)
              return (
                <tr key={r.clubId} className={`${r.clubId === w.userClubId || highlight?.includes(r.clubId) ? 'me' : ''} ${next !== z && i < t.length - 1 ? 'zone-break' : ''}`} onClick={() => go({ name: 'club', params: { id: r.clubId } })}>
                  <td><span className="zone-num" style={{ borderColor: ZONE_COLOR[z] }}>{i + 1}</span></td>
                  <td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={20} /><span className="ellipsis b" style={{ maxWidth: mode === 'full' ? 88 : 150 }}>{w.clubs[r.clubId]?.short}</span></div></td>
                  <td>{r.p}</td>
                  {mode === 'full' && <><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td><td>{r.gf}</td><td>{r.ga}</td></>}
                  {mode === 'form' ? <td><FormPips form={r.form.slice(-5)} /></td> : <td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>}
                  <td className="b">{r.pts - (r.ded || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="row wrap" style={{ gap: 12, marginTop: 10 }}>
        {[...zones.keys()].map((z) => <span key={z} className="row tight tiny muted"><span className="status-dot" style={{ background: ZONE_COLOR[z] }} />{ZONE_LABEL[z]}</span>)}
      </div>
    </div>
  )
}

/** Groups (a competition played in groups: internationals): one table per group, qualification marked. */
function GroupTables({ w, c }: { w: World; c: Competition }) {
  const go = useGame((s) => s.go)
  const meta = c.intl
  const names = Object.keys(c.groups || {})
  // the manager's own nation is highlighted; sides with his players in them carry his club's badge
  const home = w.intl?.nt[w.user.nationality] || 0
  const withMine = useMemo(() => userNations(w), [w.date, w.userClubId])
  const myClub = w.clubs[w.userClubId]
  const zone = (name: string, pos: number): { color: string; label: string } | undefined => {
    if (!meta) return undefined
    if (meta.kind === 'groups') {
      const top = meta.qualify?.top || 2
      if (pos <= top) return { color: 'var(--pos)', label: `Qualify for the ${meta.feeds === 'WC' ? 'World Cup' : 'Euro'}` }
      if (pos === top + 1 && meta.qualify?.extra) return { color: 'var(--warn)', label: 'Best of the rest qualify' }
      return undefined
    }
    const adv = meta.advance
    if (!adv || (adv.groupsPrefix && !name.startsWith(adv.groupsPrefix))) return undefined
    if (pos <= adv.top) return { color: adv.top === 1 ? 'var(--gold)' : 'var(--pos)', label: adv.top === 1 ? 'Finals' : 'Knockout stage' }
    if (adv.thirds && pos === adv.top + 1) return { color: 'var(--warn)', label: 'Best third-placed sides go through' }
    return undefined
  }
  const legend = new Map<string, string>()
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      {names.map((g) => {
        const rows = sortTable(w, c, (c.table || []).filter((r) => r.group === g))
        return (
          <div key={g} className="card">
            <div className="card-h"><span className="label">{g}</span>{rows.every((r) => r.p) && rows.length > 0 && <span className="tiny dim">{rows[0].p} played</span>}</div>
            <table className="tbl">
              <thead><tr><th style={{ width: 28 }}>#</th><th className="l">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const z = zone(g, i + 1)
                  if (z) legend.set(z.label, z.color)
                  return (
                    <tr key={r.clubId} className={r.clubId === home ? 'me' : ''} onClick={() => go({ name: 'club', params: { id: r.clubId } })}>
                      <td><span className="zone-num" style={{ borderColor: z?.color || 'transparent' }}>{i + 1}</span></td>
                      <td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={20} /><span className="ellipsis b" style={{ maxWidth: 96 }}>{w.clubs[r.clubId]?.short}</span>{withMine.has(r.clubId) && myClub && <Badge club={myClub} size={12} style={{ opacity: 0.85 }} />}</div></td>
                      <td>{r.p}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td>
                      <td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>
                      <td className="b">{r.pts}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
      {legend.size > 0 && <div className="row wrap" style={{ gap: 12 }}>{[...legend.entries()].map(([l, col]) => <span key={l} className="row tight tiny muted"><span className="status-dot" style={{ background: col }} />{l}</span>)}</div>}
    </div>
  )
}

/** International fixtures page by matchday across the groups (friendlies by date); everything else by round. */
const fixtureRound = (c: Competition, f: Fixture) => {
  if (c.format !== 'intl') return f.roundName
  if (c.intl?.kind === 'friendly') return fmtDate(f.date, 'long')
  const md = f.roundName.match(/· MD(\d+)$/)
  return md ? `Matchday ${md[1]}` : f.roundName
}

function CompFixtures({ w, c }: { w: World; c: Competition }) {
  const rounds = useMemo(() => {
    const m = new Map<string, Fixture[]>()
    for (const id of c.fixtures) { const f = w.fixtures[id]; if (!f) continue; const k = fixtureRound(c, f); const a = m.get(k) || []; a.push(f); m.set(k, a) }
    return [...m.entries()].map(([name, fx]) => ({ name, fx: fx.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) })).sort((a, b) => a.fx[0].date.localeCompare(b.fx[0].date))
  }, [c.fixtures.length, c.id])
  const current = Math.max(0, rounds.findIndex((r) => r.fx.some((f) => !f.played)))
  const [i, setI] = useState(current === -1 ? rounds.length - 1 : current)
  const r = rounds[Math.min(i, rounds.length - 1)]
  if (!r) return <Empty icon="calendar" title="No fixtures drawn yet" text={c.rounds[0] ? `The ${c.rounds[0].name.toLowerCase()} draw takes place before ${fmtDate(c.rounds[0].date, 'long')}.` : undefined} />
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="row between">
        <button className="iconbtn" disabled={i <= 0} onClick={() => setI(i - 1)} aria-label="Previous"><Icon name="back" size={20} /></button>
        <div className="col center"><div className="b">{r.name}</div><div className="tiny dim">{fmtDate(r.fx[0].date, 'dm')}{r.fx[r.fx.length - 1].date !== r.fx[0].date ? ` – ${fmtDate(r.fx[r.fx.length - 1].date, 'dm')}` : ''}</div></div>
        <button className="iconbtn" disabled={i >= rounds.length - 1} onClick={() => setI(i + 1)} aria-label="Next"><Icon name="forward" size={20} /></button>
      </div>
      <div className="card list" style={{ marginTop: 10 }}>{r.fx.map((f) => <FixtureRow key={f.id} w={w} f={f} clubId={f.home === w.userClubId || f.away === w.userClubId ? w.userClubId : undefined} />)}</div>
    </div>
  )
}

export { Bracket }

function CompStats({ w, c }: { w: World; c: Competition }) {
  const go = useGame((s) => s.go)
  const [k, setK] = useState<'totw' | 'goals' | 'assists' | 'cleanSheets' | 'rating'>(c.format === 'league' ? 'totw' : 'goals')
  const intl = c.format === 'intl'
  const list = useMemo(() => {
    const out: { p: Player; v: number; apps: number }[] = []
    for (const p of allPlayers(w)) {
      const s = intl ? p.intlSeason?.[c.id] : p.season[c.id]
      if (!s || !s.apps) continue
      const v = k === 'rating' ? (s.rated >= Math.max(3, Math.round(c.fixtures.filter((id) => w.fixtures[id]?.played).length / Math.max(1, c.clubs.length / 2) * 0.4)) ? s.ratingSum / s.rated : 0) : (s as any)[k]
      if (v > 0) out.push({ p, v, apps: s.apps })
    }
    return out.sort((a, b) => b.v - a.v || a.apps - b.apps).slice(0, 25)
  }, [c.id, k, w.date])
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <Seg small items={[...(c.format === 'league' ? [{ id: 'totw' as const, label: 'TOTW' }] : []), { id: 'goals', label: 'Goals' }, { id: 'assists', label: 'Assists' }, { id: 'cleanSheets', label: 'Clean sh.' }, { id: 'rating', label: 'Rating' }]} value={k} onChange={setK} />
      {k === 'totw' && <TeamOfTheWeek w={w} c={c} />}
      {k !== 'totw' && !list.length && <Empty icon="stats" title="No stats yet" />}
      {k !== 'totw' && <div className="card list" style={{ marginTop: 10 }}>
        {list.map(({ p, v, apps }, i) => (
          <button key={p.id} className={`li tap ${p.clubId === w.userClubId ? 'me-row' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
            <span className="display" style={{ width: 22, fontSize: 18, color: i < 3 ? 'var(--gold)' : 'var(--t3)' }}>{i + 1}</span>
            <Face p={p} size={38} radius={10} club={w.clubs[p.clubId]} />
            <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s row tight">{intl ? <><Badge club={w.clubs[w.intl?.nt[p.nation] || 0]} size={13} />{w.clubs[w.intl?.nt[p.nation] || 0]?.short}</> : <><Badge club={w.clubs[p.clubId]} size={13} />{w.clubs[p.clubId]?.short}</>} · {apps} apps</div></div>
            <span className="display" style={{ fontSize: 24 }}>{k === 'rating' ? v.toFixed(2) : v}</span>
          </button>
        ))}
      </div>}
    </div>
  )
}

/** FotMob-style Team of the Week: best-rated performers of the latest completed round in a 4-3-3. */
function TeamOfTheWeek({ w, c }: { w: World; c: Competition }) {
  const go = useGame((s) => s.go)
  const data = useMemo(() => {
    const played = c.fixtures.map((id) => w.fixtures[id]).filter((f) => f?.played && f.result?.players.length)
    if (!played.length) return undefined
    const byRound = new Map<string, Fixture[]>()
    for (const f of played) { const k = f.roundName; byRound.set(k, [...(byRound.get(k) || []), f]) }
    // latest round that is (nearly) complete
    const rounds = [...byRound.entries()].sort((a, b) => b[1][0].date.localeCompare(a[1][0].date))
    const [round, fx] = rounds.find(([, list]) => list.length >= Math.floor(c.clubs.length / 2) - 1) || rounds[0]
    const pool = fx.flatMap((f) => f.result!.players.filter((x) => x.mins >= 45).map((x) => ({ x, f, clubId: x.side === 0 ? f.home : f.away })))
    const group = (pos: string) => (pos === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'DEF' : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos) ? 'MID' : 'ATT')
    const take = (g: string, n: number) => pool.filter((e) => group(e.x.pos) === g).sort((a, b) => b.x.rating - a.x.rating).slice(0, n)
    const gk = take('GK', 1), def = take('DEF', 4), mid = take('MID', 3), att = take('ATT', 3)
    // order defenders/attackers by side so the shape reads right
    const sideOrder = (pos: string) => (/^R/.test(pos) ? 0 : /^L/.test(pos) ? 2 : 1)
    def.sort((a, b) => sideOrder(a.x.pos) - sideOrder(b.x.pos)); att.sort((a, b) => sideOrder(a.x.pos) - sideOrder(b.x.pos))
    const xi = [...gk, ...def, ...mid, ...att]
    return { round, xi }
  }, [c.id, w.date])
  if (!data || data.xi.length < 11) return <Empty icon="stats" title="Team of the Week" text="Available once a full round has been played." />
  const f = formationOf('4-3-3 Flat')
  const best = [...data.xi].sort((a, b) => b.x.rating - a.x.rating)[0]
  const side = {
    club: w.clubs[w.userClubId], formation: f,
    xi: data.xi.map((e) => ({ id: e.x.id, rating: e.x.rating, goals: e.x.goals, assists: e.x.assists, motm: e === best, pos: e.x.pos })),
    bench: [], note: data.round,
  }
  return (
    <div style={{ marginTop: 10 }}>
      <TeamLineup w={w} side={{ ...side, title: 'Team of the Week', logo: <CompLogo k={compLogoKey(c)} size={22} name={c.name} /> }} mode="live" onTap={(t) => t.id && go({ name: 'player', params: { id: t.id } })} />
      <div className="card list" style={{ marginTop: 10 }}>
        {data.xi.map((e) => {
          const p = w.players[e.x.id]
          if (!p) return null
          const opp = w.clubs[e.clubId === e.f.home ? e.f.away : e.f.home]
          return (
            <button key={e.x.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
              <Face p={p} size={34} radius={17} club={w.clubs[e.clubId]} />
              <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s row tight"><Badge club={w.clubs[e.clubId]} size={13} />{w.clubs[e.clubId]?.short} v {opp?.short} · {e.f.result!.score[0]}-{e.f.result!.score[1]}</div></div>
              {(e.x.goals > 0 || e.x.assists > 0) && <span className="row tight" style={{ gap: 6 }}>{e.x.goals > 0 && <span className="ga">{e.x.goals > 1 && <b>{e.x.goals}</b>}<Ball size={12} /></span>}{e.x.assists > 0 && <span className="ga"><Boots n={e.x.assists} size={14} /></span>}</span>}
              <PosChip pos={e.x.pos} />
              <RatingPill v={e.x.rating} motm={e === best} size="sm" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================ club profile
export function ClubProfile({ params }: { params: { id: number } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const [tab, setTab] = useRemember<'overview' | 'squad' | 'fixtures' | 'info'>('tab', 'overview')
  const [editing, toggleEdit, setEditing] = useEditing('Club')
  const c = w.clubs[params.id]
  if (!c) return <Screen title="Club" back><Empty icon="stadium" title="Club not found" /></Screen>
  if (c.national) return <NationProfile w={w} c={c} />
  const squad = [...rosterOf(w, c.id)].sort((a, b) => POS_ORDER[a.positions[0]] - POS_ORDER[b.positions[0]] || b.ovr - a.ovr)
  const lg = leagueOf(w, c.id)
  const pos = lg ? sortTable(w, lg).findIndex((r) => r.clubId === c.id) + 1 : 0
  const mgr = w.managers[c.managerId]
  const top = [...squad].sort((a, b) => b.ovr - a.ovr)
  const avg = top.slice(0, 16).reduce((a, p) => a + p.ovr, 0) / Math.max(1, Math.min(16, top.length))
  const trophies = new Map<string, number>()
  for (const t of c.trophies) trophies.set(t.compKey, (trophies.get(t.compKey) || 0) + 1)
  return (
    <Screen title={c.short} sub={w.leagues[c.leagueId]?.name || c.country} back right={<EditToggle w={w} on={editing} onClick={toggleEdit} label="Edit club" />}>
      {editing && <div className="pad" style={{ marginBottom: 10 }}><ClubMoneyEditor club={c} onClose={() => setEditing(false)} /></div>}
      <div className="pad">
        <div className="hero" style={{ padding: 16, background: `linear-gradient(140deg, ${c.theme}, #06080d 85%)` }}>
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <Badge club={c} size={80} />
            <div className="grow">
              <div className="h2">{c.name}</div>
              <div className="row tight small" style={{ marginTop: 6, opacity: 0.9 }}>{lg && <CompLogo k={compLogoKey(lg)} size={16} name={lg.name} />}{pos ? `${ordinal(pos)} in ${lg!.short}` : c.country}</div>
              <div style={{ marginTop: 6 }}><Stars n={starRating(avg)} size={13} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pad grid3" style={{ marginTop: 10 }}>
        <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Manager</div><div className="b small ellipsis" style={{ marginTop: 3 }}>{c.id === w.userClubId ? `${w.user.firstName} ${w.user.lastName}` : mgr?.name || 'Vacant'}</div></div>
        <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Stadium</div><div className="b small ellipsis" style={{ marginTop: 3 }}>{c.stadium || '—'}</div></div>
        <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Budget</div><div className="b small" style={{ marginTop: 3 }}>{fmtMoney(c.finance.transferBudget, { short: true })}</div></div>
      </div>
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'overview', label: 'Overview' }, { id: 'squad', label: 'Squad' }, { id: 'fixtures', label: 'Fixtures' }, { id: 'info', label: 'Club' }]} value={tab} onChange={setTab} /></div>
      {tab === 'overview' && <ClubOverview w={w} clubId={c.id} />}
      {tab === 'squad' && (
        <div className="pad" style={{ marginTop: 10 }}>
          <div className="card list">
            {squad.map((p) => (
              <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                <Face p={p} size={40} radius={10} club={c} />
                <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s">{Number(w.date.slice(0, 4)) - Number(p.dob.slice(0, 4))} yrs · {fmtMoney(p.value, { short: true })}</div></div>
                <PosChip pos={p.positions[0]} />
                <Ovr v={p.ovr} size="sm" />
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'fixtures' && <ClubFixtures w={w} clubId={c.id} />}
      {tab === 'info' && (
        <div className="pad stack" style={{ marginTop: 10 }}>
          <div className="card pad-card small stack" style={{ gap: 6 }}>
            <div className="row between"><span className="muted">City</span><b>{c.city || c.country}</b></div>
            <div className="row between"><span className="muted">Founded</span><b>{c.founded || '—'}</b></div>
            <div className="row between"><span className="muted">Capacity</span><b>{c.capacity.toLocaleString()}</b></div>
            <div className="row between"><span className="muted">Domestic prestige</span><Stars n={c.prestige.domestic / 2} size={11} /></div>
            <div className="row between"><span className="muted">International prestige</span><Stars n={c.prestige.intl / 2} size={11} /></div>
            <div className="row between"><span className="muted">Kit</span><span className="row tight">{c.kit.map((k) => <span key={k} className="swatch" style={{ width: 20, height: 20, background: k }} />)}</span></div>
          </div>
          {c.rivals.length > 0 && <div className="card list"><div className="card-h"><span className="label">Rivals</span></div>{c.rivals.map(([id, name, lvl]) => w.clubs[id] && <button key={id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'club', params: { id } })}><Badge club={w.clubs[id]} size={30} /><div className="meta"><div className="t small">{w.clubs[id].name}</div><div className="s">{name}</div></div><span className="row tight">{Array.from({ length: lvl }, (_, i) => <Icon key={i} name="fire" size={14} color="var(--neg)" />)}</span></button>)}</div>}
          {trophies.size > 0 && <div className="card list"><div className="card-h"><span className="label">Trophies won in this save</span></div>{[...trophies.entries()].map(([k, n]) => <div key={k} className="li"><CompLogo k={k.startsWith('L') ? k : k} size={24} /><div className="meta"><div className="t small">{Object.values(w.competitions).find((x) => x.key === k)?.name || k}</div></div><b>×{n}</b></div>)}</div>}
        </div>
      )}
    </Screen>
  )
}

const POS_GRP: Record<string, string> = { GK: 'Goalkeepers', CB: 'Defenders', LB: 'Defenders', RB: 'Defenders', LWB: 'Defenders', RWB: 'Defenders', CDM: 'Midfielders', CM: 'Midfielders', CAM: 'Midfielders', LM: 'Midfielders', RM: 'Midfielders' }

/** A national team: its flag, strength, the squad it has called up (or would), fixtures and competitions. */
function NationProfile({ w, c }: { w: World; c: Club }) {
  const go = useGame((s) => s.go)
  const [tab, setTab] = useRemember<'overview' | 'squad' | 'fixtures'>('ntab', 'overview')
  const called = !!w.intl?.squads[c.id]?.length
  const squad = nationalSquad(w, c.id)
  const fx = fixturesOf(w, c.id)
  const next = fx.find((f) => !f.played)
  const comps = Object.values(w.competitions).filter((x) => x.season === w.season && x.format === 'intl' && x.intl?.kind !== 'friendly' && x.clubs.includes(c.id))
  const nextComp = next ? w.competitions[next.compId] : comps[0]
  const sheet = squad.length >= 11 ? sideInput(w, c.id, nextComp, false).sheet : undefined
  const mine = squad.filter((p) => p.clubId === w.userClubId)
  const trophies = new Map<string, number>()
  for (const t of c.trophies) trophies.set(t.compKey, (trophies.get(t.compKey) || 0) + 1)
  const groups = new Map<string, Player[]>()
  for (const p of [...squad].sort((a, b) => POS_ORDER[a.positions[0]] - POS_ORDER[b.positions[0]] || b.ovr - a.ovr)) {
    const g = POS_GRP[p.positions[0]] || 'Forwards'
    groups.set(g, [...(groups.get(g) || []), p])
  }
  return (
    <Screen title={c.short} sub={`${c.confed || 'FIFA'} · National team`} back>
      <div className="pad">
        <div className="hero" style={{ padding: 16, background: `linear-gradient(140deg, ${c.kit[0] === '#f4f6f8' ? c.kit[1] : c.kit[0]}, #06080d 85%)` }}>
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <Badge club={c} size={76} />
            <div className="grow">
              <div className="h2">{c.name}</div>
              <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>{called ? `In camp · ${squad.length} called up` : 'Next squad announced before the next international window'}</div>
              <div style={{ marginTop: 6 }}><Stars n={starRating(c.squadAvg)} size={13} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pad grid3" style={{ marginTop: 10 }}>
        <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Strength</div><div className="b small" style={{ marginTop: 3 }}>{c.squadAvg.toFixed(1)} <span className="tiny dim">best 23</span></div></div>
        <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Home ground</div><div className="b small ellipsis" style={{ marginTop: 3 }}>{c.stadium}</div></div>
        <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Your players</div><div className="b small" style={{ marginTop: 3 }}>{mine.length || '—'}</div></div>
      </div>
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'overview', label: 'Overview' }, { id: 'squad', label: called ? 'Squad' : 'Likely squad' }, { id: 'fixtures', label: 'Fixtures' }]} value={tab} onChange={setTab} /></div>
      {tab === 'overview' && (
        <div className="pad stack" style={{ marginTop: 10 }}>
          {next && <div className="card"><div className="card-h"><span className="label">Next match</span></div><div className="list"><FixtureRow w={w} f={next} /></div></div>}
          <div className="card pad-card"><div className="label" style={{ marginBottom: 10 }}>Form</div><FormStrip w={w} clubId={c.id} /></div>
          {comps.length > 0 && (
            <div className="card list">
              <div className="card-h"><span className="label">Competitions</span></div>
              {comps.map((x) => {
                const row = x.table?.find((r) => r.clubId === c.id)
                const pos = row?.group ? sortTable(w, x, (x.table || []).filter((r) => r.group === row.group)).findIndex((r) => r.clubId === c.id) + 1 : 0
                const out = x.rounds.some((r) => r.winners?.length && r.fixtures.some((id) => { const f = w.fixtures[id]; return f && (f.home === c.id || f.away === c.id) }) && !r.winners.includes(c.id))
                return (
                  <button key={x.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'comp', params: { id: x.id } })}>
                    <div className="logo-tile"><CompLogo k={compLogoKey(x)} size={28} name={x.name} /></div>
                    <div className="meta"><div className="t small">{x.name}</div><div className="s">{x.winner === c.id ? 'Winners!' : out ? 'Knocked out' : row?.group ? `${row.group} · ${ordinal(pos)} · ${row.pts} pts` : intlStage(w, x)}</div></div>
                    <Icon name="forward" size={16} color="var(--t3)" />
                  </button>
                )
              })}
            </div>
          )}
          {sheet?.lineup?.length ? <TeamLineup w={w} side={sideFromSheet(w, c.id, sheet, nextComp, called ? 'Expected XI' : 'Likely XI')} mode="live" onTap={(t) => t.id && go({ name: 'player', params: { id: t.id } })} /> : null}
          {trophies.size > 0 && <div className="card list"><div className="card-h"><span className="label">Trophies won in this save</span></div>{[...trophies.entries()].map(([k, n]) => <div key={k} className="li"><CompLogo k={k} size={24} /><div className="meta"><div className="t small">{Object.values(w.competitions).find((x) => x.key === k)?.name || k}</div></div><b>×{n}</b></div>)}</div>}
        </div>
      )}
      {tab === 'squad' && (
        <div className="pad stack" style={{ marginTop: 10 }}>
          {!called && <div className="tiny dim" style={{ padding: '0 4px' }}>Who would be picked today: the best available players, balanced by position. The real squad is named a few days before each game.</div>}
          {[...groups.entries()].map(([g, list]) => (
            <div key={g} className="card list">
              <div className="card-h"><span className="label">{g}</span><span className="tiny dim">{list.length}</span></div>
              {list.map((p) => (
                <button key={p.id} className={`li tap ${p.clubId === w.userClubId ? 'me-row' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                  <Face p={p} size={40} radius={10} club={w.clubs[p.clubId]} />
                  <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s row tight"><Badge club={w.clubs[p.clubId]} size={13} /><span className="ellipsis">{w.clubs[p.clubId]?.short || 'Free agent'}</span> · {p.nationalCaps || 0} caps</div></div>
                  <PosChip pos={p.positions[0]} />
                  <Ovr v={p.ovr} size="sm" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {tab === 'fixtures' && <ClubFixtures w={w} clubId={c.id} />}
    </Screen>
  )
}

/** FotMob-style club overview: next match, form, table, key players and the expected XI. */
function ClubOverview({ w, clubId }: { w: World; clubId: number }) {
  const go = useGame((s) => s.go)
  const c = w.clubs[clubId]
  const next = fixturesOf(w, clubId).find((f) => !f.played)
  const lg = leagueOf(w, clubId)
  const around = lg?.table?.some((r) => r.p) ? tableAround(w, lg, clubId, 2) : []
  const players = rosterOf(w, clubId)
  const line = (p: Player) => Object.values(p.season).reduce((a, s) => ({ g: a.g + s.goals, as: a.as + s.assists, r: a.r + s.ratingSum, n: a.n + s.rated }), { g: 0, as: 0, r: 0, n: 0 })
  const rated = players.map((p) => ({ p, l: line(p) })).filter((x) => x.l.n >= 2).sort((a, b) => b.l.r / b.l.n - a.l.r / a.l.n)
  const scorer = players.map((p) => ({ p, l: line(p) })).filter((x) => x.l.g > 0).sort((a, b) => b.l.g - a.l.g)[0]
  const key = (rated.length ? rated.slice(0, 3) : players.map((p) => ({ p, l: line(p) })).sort((a, b) => b.p.ovr - a.p.ovr).slice(0, 3))
  const xiSheet = clubId === w.userClubId ? (c.sheets.find((s) => s.id === c.activeSheet) || c.sheets[0]) : sideInput(w, clubId, lg, false).sheet
  return (
    <div className="pad stack" style={{ marginTop: 10 }}>
      {next && <div className="card"><div className="card-h"><span className="label">Next match</span></div><div className="list"><FixtureRow w={w} f={next} clubId={clubId} /></div></div>}
      <div className="card pad-card"><div className="label" style={{ marginBottom: 10 }}>Form</div><FormStrip w={w} clubId={clubId} /></div>
      {around.length > 0 && lg && (
        <div className="card">
          <div className="card-h"><div className="row tight"><CompLogo k={compLogoKey(lg)} size={18} name={lg.name} /><span className="label">{lg.short}</span></div></div>
          <table className="tbl">
            <thead><tr><th style={{ width: 28 }}>#</th><th className="l">Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>{around.map((r) => <tr key={r.clubId} className={r.clubId === clubId ? 'me' : ''} onClick={() => r.clubId !== clubId && go({ name: 'club', params: { id: r.clubId } })}><td>{r.pos}</td><td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={18} /><span className="ellipsis b">{w.clubs[r.clubId]?.short}</span></div></td><td>{r.p}</td><td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="b">{r.pts - (r.ded || 0)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="card">
        <div className="card-h"><span className="label">{rated.length ? 'Top rated' : 'Key players'}</span>{scorer && <span className="tiny dim">Top scorer: {scorer.p.name} ({scorer.l.g})</span>}</div>
        <div className="list">
          {key.map(({ p, l }) => (
            <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
              <Face p={p} size={40} radius={20} club={c} />
              <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s">{p.positions[0]} · {l.n ? `${l.g} G · ${l.as} A` : `${p.ovr} OVR`}</div></div>
              {l.n ? <RatingPill v={Math.round((l.r / l.n) * 100) / 100} size="sm" /> : <Ovr v={p.ovr} size="sm" />}
            </button>
          ))}
        </div>
      </div>
      {xiSheet?.lineup?.length ? <TeamLineup w={w} side={sideFromSheet(w, clubId, xiSheet, lg, clubId === w.userClubId ? 'Your XI' : 'Expected XI')} mode="live" onTap={(t) => t.id && go({ name: 'player', params: { id: t.id } })} /> : null}
    </div>
  )
}

// ============================================================================ calendar
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A calendar fixture: the club's own, or a national team game with the manager's players in it (named underneath). */
function IntlOr({ w, e }: { w: World; e: { text: string; f?: Fixture; nt?: boolean } }) {
  if (!e.nt) return <FixtureRow w={w} f={e.f!} clubId={w.userClubId} />
  return (
    <div className="cal-nt">
      <FixtureRow w={w} f={e.f!} />
      <div className="tiny dim row tight cal-nt-who"><Icon name="globe" size={12} color="var(--info)" />{e.text}</div>
    </div>
  )
}
export function CalendarScreen() {
  const w = useWorld()
  const advance = useGame((s) => s.advance)
  const advancing = useGame((s) => s.advancing)
  const [month, setMonth] = useRemember('month', w.date.slice(0, 7))
  const [sel, setSel] = useState<string>()
  const fx = fixturesOf(w, w.userClubId)
  const first = `${month}-01`
  const lead = (weekday(first) + 6) % 7
  const days: (string | null)[] = [...Array(lead).fill(null)]
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) days.push(d)
  const shift = (n: number) => { haptic(); const [y, m] = month.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(dt.toISOString().slice(0, 7)); setSel(undefined) }
  // national sides the manager's players are with (or would be picked for): their games are on his calendar too
  const review = seasonReviewDate(w)
  const all = fixturesByDate(w)
  const myNations = useMemo(() => new Map([...userNations(w)].map(([id, ps]) => [id, ps.map((p) => p.name.split(' ').slice(-1)[0])])), [w.date, w.userClubId])
  const events = (d: string) => {
    const out: { icon: string; text: string; color?: string; f?: Fixture; nt?: boolean }[] = []
    const f = fx.find((x) => x.date === d)
    if (f) out.push({ icon: 'ball', text: `${w.clubs[f.home].short} v ${w.clubs[f.away].short} · ${w.competitions[f.compId]?.short}`, f })
    for (const win of w.windows) {
      if (win.open === d) out.push({ icon: 'transfers', text: `${win.name} transfer window opens`, color: 'var(--tw)' })
      if (win.close === d) out.push({ icon: 'deadline', text: `${win.name} deadline day`, color: 'var(--neg)' })
    }
    for (const b of w.intlBreaks) if (b.start === d) out.push({ icon: 'globe', text: 'International break begins', color: 'var(--info)' })
    for (const c of Object.values(w.competitions)) for (const r of c.rounds) if (!r.drawn && addDays(r.date, -10) === d && c.clubs.includes(w.userClubId)) out.push({ icon: 'bracket', text: `${c.short} ${r.name} draw`, color: 'var(--gold)' })
    for (const x of all.get(d) || []) {
      const players = myNations.get(x.home) || myNations.get(x.away)
      if (players) out.push({ icon: 'globe', text: players.join(', '), color: 'var(--info)', f: x, nt: true })
    }
    if (d === review) out.push({ icon: 'season', text: 'Season review', color: 'var(--gold)' })
    return out
  }
  const inWindow = (d: string) => w.windows.some((x) => d >= x.open && d <= x.close)
  const inBreak = (d: string) => w.intlBreaks.some((x) => d >= x.start && d <= x.end)
  const monthFx = fx.filter((f) => f.date.slice(0, 7) === month)
  const res = monthFx.filter((f) => f.played).map((f) => outcomeFor(f, w.userClubId))
  const comps = [...new Set(monthFx.map((f) => f.compId))].map((id) => w.competitions[id]).filter(Boolean)
  const agenda = days.filter((d): d is string => !!d).map((d) => ({ d, ev: events(d) })).filter((x) => x.ev.length)
  const selEvents = sel ? events(sel) : []
  return (
    <Screen title="Calendar" sub={fmtDate(w.date, 'full')} back>
      <div className="pad">
        <div className="row between" style={{ marginBottom: 6 }}>
          <button className="iconbtn" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="back" size={20} /></button>
          <div className="col center">
            <div className="h3 fade-in" key={month}>{fmtDate(first, 'month')}</div>
            <div className="tiny dim row tight" style={{ marginTop: 3 }}>
              {monthFx.length ? <>{monthFx.length} match{monthFx.length > 1 ? 'es' : ''}{res.length > 0 && <> · <b className="pos">W{res.filter((r) => r === 'W').length}</b> <b>D{res.filter((r) => r === 'D').length}</b> <b className="neg">L{res.filter((r) => r === 'L').length}</b></>}</> : 'No matches'}
              {comps.map((c) => <CompLogo key={c.id} k={compLogoKey(c)} size={13} name={c.name} />)}
            </div>
          </div>
          <button className="iconbtn" onClick={() => shift(1)} aria-label="Next month"><Icon name="forward" size={20} /></button>
        </div>
        <div className="cal-grid" key={month}>
          {WD.map((d) => <div key={d} className="tiny dim b" style={{ textAlign: 'center', paddingBottom: 2 }}>{d}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={i} />
            const f = fx.find((x) => x.date === d)
            const ev = events(d)
            const past = d < w.date
            const o = f?.played ? outcomeFor(f, w.userClubId) : undefined
            const home = f?.home === w.userClubId
            return (
              <button key={d} className={`cal-cell ${d === w.date ? 'today' : ''} ${sel === d ? 'sel' : ''} ${past ? 'past' : ''} ${f ? 'has-fx' : ''} ${inWindow(d) ? 'win' : ''} ${inBreak(d) ? 'intl' : ''}`} onClick={() => { haptic(); setSel(sel === d ? undefined : d) }}>
                <span className="cal-n">{Number(d.slice(8))}</span>
                {f ? (
                  <>
                    <span className={`cal-fx ${o || ''}`}><Badge club={w.clubs[opponent(f, w.userClubId)]} size={20} /></span>
                    <span className={`cal-sub ${o || ''}`}>{f.played && f.result ? `${home ? f.result.score[0] : f.result.score[1]}-${home ? f.result.score[1] : f.result.score[0]}` : home ? 'H' : 'A'}</span>
                  </>
                ) : ev[0] ? <Icon name={ev[0].icon} size={14} color={ev[0].color} /> : (all.get(d)?.length ? <span className="cal-dot" /> : <span />)}
              </button>
            )
          })}
        </div>
        <div className="row wrap tiny dim cal-legend">
          <span><i className="lg-win" />Transfer window</span><span><i className="lg-intl" />International break</span><span><i className="lg-w" />Won</span><span><i className="lg-l" />Lost</span>
        </div>
      </div>
      {sel && (
        <div className="pad stack fade-up" style={{ marginTop: 12 }} key={sel}>
          <div className="label">{fmtDate(sel, 'full')}</div>
          <div className="card list">
            {selEvents.length ? selEvents.map((e, i) => e.f ? <IntlOr key={i} w={w} e={e} /> : <div key={i} className="li" style={{ minHeight: 46 }}><Icon name={e.icon} size={18} color={e.color} /><div className="meta small">{e.text}</div></div>) : <div className="li muted small">No events for your club. {all.get(sel)?.length ? `${all.get(sel)!.length} fixtures worldwide.` : ''}</div>}
          </div>
          {sel > w.date && (
            <button className="btn club block" disabled={advancing} onClick={() => { haptic('medium'); advance(sel) }}>
              <Icon name="ffwd" size={18} /> Advance to {fmtDate(sel, 'dm')}
            </button>
          )}
          {sel > w.date && <div className="tiny dim">Advancing stops early for your matches and anything your stop conditions flag (Settings → Advance).</div>}
        </div>
      )}
      {!sel && (
        <div className="pad" style={{ marginTop: 14 }}>
          <div className="label" style={{ margin: '0 2px 8px' }}>{fmtDate(first, 'month').split(' ')[0]} at a glance</div>
          {!agenda.length && <div className="card pad-card small muted">Nothing scheduled for your club this month.</div>}
          {agenda.length > 0 && (
            <div className="card list cal-agenda">
              {agenda.map(({ d, ev }) => (
                <div key={d} className={`cal-ag ${d < w.date ? 'past' : ''} ${d === w.date ? 'today' : ''}`}>
                  <button className="cal-ag-d" onClick={() => { haptic(); setSel(d) }}><b className="display">{Number(d.slice(8))}</b><span className="tiny dim">{fmtDate(d, 'day')}</span></button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    {ev.map((e, i) => e.f ? <IntlOr key={i} w={w} e={e} /> : <div key={i} className="cal-ag-ev small"><Icon name={e.icon} size={15} color={e.color} /><span>{e.text}</span></div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}
