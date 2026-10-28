import { useRemember } from '../memory'
import { ClubEditor, EditToggle, useEditing } from '../components/Editors'
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Club, Competition, Fixture, Player, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Empty, Face, Flag, FormPips, ManagerAvatar, Ovr, PosChip, Stars, UserAvatar } from '../components/atoms'
import { compIdentity, identityClass, identityVars, pageIdentity } from '../compIdentity'
import { IdentityArt } from '../components/IdentityArt'
import { HubActions, Screen, Seg, Shortcuts, Tabs } from '../components/layout'
import { FollowBtn } from '../components/Follow'
import { ClubInfo, ClubNews, ClubTransfers } from '../components/ClubSections'
import { addDays, fmtDate, seasonLabel, weekday } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { previousPositions, sortTable, ZONE_COLOR, ZONE_LABEL, zoneFor, type Zone } from '../../engine/competitions/tables'
import { ageOf, calendarOthers, compLogoKey, fixturesOf, leagueOf, opponent, outcomeFor, scoreLine, seasonComps, standing } from '../selectors'
import { FixtureRow, FixtureSheet } from './Match'
import { rosterOf, allPlayers } from '../../engine/world/roster'
import { POS_ORDER, formationOf } from '../../domain/constants'
import { ordinal } from './Menu'
import { Bracket } from '../components/KnockoutBracket'
import { rankingTable } from '../../engine/world/fifaRanking'
import { MoveArrow } from './FifaRanking'
import { fixturesByDate } from '../../engine/competitions/fixtures'
import { starRating } from '../rawHelpers'
import { tableAround } from '../selectors'
import { cupPath, shortRound } from '../cupPath'
import { FormStrip } from './MatchDay'
import { Ball, Balls, Boot, Boots, TeamLineup, sideFromSheet, RatingPill } from '../components/Lineup'
import { sideInput } from '../../engine/world/matchRunner'
import { intlStage, nationalSquad, seasonReviewDate, userNations } from '../../engine/world/international'
import { watchList } from '../../engine/world/advance'
import { follows } from '../../engine/world/follow'

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
          <Shortcuts cols={2} items={[
            { icon: 'calendar', label: 'Calendar', onClick: () => go({ name: 'calendar' }) },
            { icon: 'medal', label: 'Awards & History', onClick: () => go({ name: 'awards' }) },
          ]} />
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
  const open = useGame((s) => s.open)
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
        <button className="so-next" onClick={() => open({ name: 'prematch', params: { id: next.id } })}>
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
    // losing the last round (a final, or a one-off super cup) is finishing second, not going out
    const lastRound = c.rounds[c.rounds.length - 1]
    if (c.winner === me) status = 'Winners'
    else if (out && active && active.id === lastRound?.id) status = 'Runners-up'
    else if (out) status = active ? `Out in the ${active.name.toLowerCase()}` : 'Out'
    else if (active && !(c.format === 'uefa' && !myRow?.p && active === c.rounds[0])) status = active.fixtures.filter(mine).every((id) => w.fixtures[id].played) ? `${active.name} · through` : active.name
    else if (!status) status = c.rounds[0] ? `${c.rounds[0].name} · ${fmtDate(c.rounds[0].date, 'dm')}` : 'Upcoming'
  }
  const next = fixturesOf(w, me).find((f) => !f.played && f.compId === c.id)
  const path = c.format !== 'league' ? cupPath(w, c) : []
  const ci = compIdentity(c.key)
  return (
    <button className="card tap comp-card" onClick={() => { haptic(); go({ name: 'comp', params: { id: c.id } }) }}>
      <div className="row" style={{ padding: 14, gap: 14 }}>
        <div className={`logo-tile lg${ci ? ` ${identityClass(ci)}` : ''}`} style={ci ? identityVars(ci) : undefined}>{ci && <IdentityArt ci={ci} />}<CompLogo k={compLogoKey(c)} size={44} name={c.name} /></div>
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
  // a UEFA league phase is one 36-club table (its draw pots are kept in `groups` only for the record)
  const groups = c?.format !== 'uefa' && !!c?.groups && Object.keys(c.groups).length > 0
  const hasKO = !!c && (c.rounds.length > 0 || c.intl?.kind === 'tournament')
  // once a league phase (or a tournament's groups) is over, the knockouts are what's on: the page opens there
  const pastTable = !!c && hasKO && (c.format === 'uefa' ? c.rounds.some((r) => r.drawn) : c.intl?.kind === 'tournament' ? c.intl.stage !== 'groups' : false)
  const [tab, setTab] = useRemember<'table' | 'fixtures' | 'bracket' | 'stats'>('tab', pastTable ? 'bracket' : hasTable ? 'table' : c?.intl ? 'fixtures' : 'bracket')
  if (!c) return <Screen title="Competition" back><Empty icon="trophy" title="Competition not found" /></Screen>
  // the big competitions' pages carry their brand all the way down, not just in the title card
  const ci = compIdentity(c.key)
  const pi = ci ? pageIdentity(ci) : undefined
  const items = [
    ...(hasTable ? [{ id: 'table' as const, label: c.format === 'uefa' ? 'League Phase' : groups ? 'Groups' : 'Table' }] : []),
    { id: 'fixtures' as const, label: 'Fixtures' },
    ...(hasKO ? [{ id: 'bracket' as const, label: c.format === 'league' ? 'Play-offs' : 'Knockouts' }] : []),
    { id: 'stats' as const, label: 'Stats' },
  ]
  return (
    <Screen title={<div className="row" style={{ gap: 10, minWidth: 0 }}><CompLogo k={compLogoKey(c)} size={30} name={c.name} /><div style={{ minWidth: 0 }}><div className="title ellipsis">{c.short}</div><div className="tiny dim ellipsis" style={{ marginTop: 1 }}>{c.name !== c.short ? `${c.name} · ` : ''}{seasonLabel(c.season)}</div></div></div>} back right={<FollowBtn w={w} kind="comp" id={c.key} name={c.name} />} className={`comp-page${pi ? ` ${pi.className}` : ''}`} style={pi?.style}>
      <CompHero w={w} c={c} />
      <Tabs sticky items={items} value={tab} onChange={setTab} />
      {tab === 'table' && (groups ? <GroupTables w={w} c={c} /> : <TableView w={w} c={c} />)}
      {tab === 'fixtures' && <CompFixtures w={w} c={c} />}
      {tab === 'bracket' && <Bracket w={w} c={c} />}
      {tab === 'stats' && <CompStats w={w} c={c} />}
    </Screen>
  )
}

type HeroStage = { id: string; short: string; name: string; state: 'done' | 'now' | 'ahead' }

/** Where a competition stands, for its title card: the stage, how far through it is, and who leads or has won it. */
function heroState(w: World, c: Competition) {
  const played = (id: string) => !!w.fixtures[id]?.played
  const pts = (r: { pts: number; ded?: number }) => r.pts - (r.ded || 0)
  let stage = '', progress: number | undefined
  let lead: { id: number; text: string } | undefined
  let champion = c.winner
  const stages: HeroStage[] = []
  if (c.format === 'league' && c.table?.length) {
    const t = sortTable(w, c)
    const n = Math.max(...t.map((r) => r.p)), total = (c.clubs.length - 1) * 2
    if (c.status === 'finished') { stage = 'Final standings'; champion = t[0].clubId }
    else if (!n) {
      const first = c.fixtures.map((id) => w.fixtures[id]?.date).filter(Boolean).sort()[0]
      stage = first ? `Kick-off ${fmtDate(first, 'dm')}` : 'Season ahead'
    } else {
      stage = `Matchday ${n} of ${total}`
      progress = n / total
      const gap = pts(t[0]) - (t[1] ? pts(t[1]) : 0)
      lead = { id: t[0].clubId, text: `${pts(t[0])} pts · ${gap > 0 ? `${gap} clear` : 'level at the top'}` }
    }
    return { stage, progress, stages, lead, champion }
  }
  if (c.format === 'uefa' && c.table?.length) {
    const md = Math.max(...c.table.map((r) => r.p)), lpDone = c.table.every((r) => r.p >= 8)
    stages.push({ id: 'lp', short: 'LP', name: 'League phase', state: lpDone ? 'done' : 'now' })
    if (!lpDone) {
      stage = md ? `Matchday ${md} of 8` : 'League phase'
      if (md) { progress = md / 8; const top = sortTable(w, c)[0]; lead = { id: top.clubId, text: `${pts(top)} pts` } }
    }
  }
  if (c.intl && c.groups && Object.keys(c.groups).length) {
    const gfx = c.fixtures.filter((id) => !c.rounds.some((r) => r.fixtures.includes(id)))
    stages.push({ id: 'gs', short: 'GS', name: 'Group stage', state: gfx.length && gfx.every(played) ? 'done' : 'now' })
  }
  for (const r of c.rounds) {
    const done = r.drawn && r.fixtures.length > 0 && r.fixtures.every(played) && !!r.winners?.length
    const now = !done && !stages.some((s) => s.state === 'now')
    stages.push({ id: r.id, short: shortRound(r.name), name: r.name, state: done ? 'done' : now ? 'now' : 'ahead' })
  }
  const final = c.rounds[c.rounds.length - 1]
  if (c.winner) stage = c.intl ? 'Tournament complete' : `Final${final ? ` · ${fmtDate(final.date2 || final.date, 'dm')}` : ''}`
  else if (!stage) {
    const cur = stages.find((s) => s.state === 'now'), r = cur && c.rounds.find((x) => x.id === cur.id)
    stage = c.intl && !r ? intlStage(w, c) : r ? `${r.name}${r.drawn ? '' : ` · ${fmtDate(r.date, 'dm')}`}` : cur?.name || ''
  }
  return { stage, progress, stages, lead, champion }
}

/** The big competitions' own title card at the top of their page, in their brand: colours, the genuine mark large,
 * where the season stands, who leads and who holds it. */
function CompHero({ w, c }: { w: World; c: Competition }) {
  const ci = compIdentity(c.key)
  if (!ci) return null
  const { stage, progress, stages, lead, champion } = heroState(w, c)
  const holder = c.holderId || w.archive.find((a) => a.season === c.season - 1)?.winners[c.key]
  const chip = (id: number, label: string, text?: string) => w.clubs[id] && (
    <span className="ch-chip"><span className="ch-chip-l">{label}</span><Badge club={w.clubs[id]} size={16} /><b>{w.clubs[id].short}</b>{text && <span className="ch-chip-t">{text}</span>}</span>
  )
  return (
    <div className="pad" style={{ marginTop: 8 }}>
      <div className={`comp-hero ${identityClass(ci)}`} style={identityVars(ci)}>
        <IdentityArt ci={ci} />
        <div className="ch-top">
          <span className="ch-logo"><CompLogo k={compLogoKey(c)} size={36} name={c.name} /></span>
          <div className="ch-kicker"><span>{seasonLabel(c.season)}</span>{stage && <><i className="ch-dot" />{stage}</>}</div>
        </div>
        <div className="ch-name">{c.name}</div>
        {progress != null && <div className="ch-prog" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(2, progress * 100)}%` }} /></div>}
        {stages.length > 1 && (
          <div className="ch-stages">{stages.map((s, i) => <span key={s.id} className="ch-stw">{i > 0 && <i className="ch-sep" />}<span className={`ch-st ${s.state}`} title={s.name}>{s.short}</span></span>)}</div>
        )}
        <div className="ch-foot">
          {champion ? chip(champion, c.format === 'league' ? 'Champions' : 'Winners') : lead ? chip(lead.id, c.format === 'league' ? 'Leaders' : 'Top', lead.text) : null}
          {!champion && holder ? chip(holder, 'Holders') : null}
        </div>
      </div>
    </div>
  )
}

export function TableView({ w, c, compact, highlight }: { w: World; c: Competition; compact?: boolean; highlight?: number[] }) {
  const go = useGame((s) => s.go)
  const [mode, setMode] = useRemember<'short' | 'full' | 'form'>('tableMode', 'short', 'global')
  const t = sortTable(w, c)
  // who moved since the last matchday (only once there is one to compare with)
  const prev = useMemo(() => previousPositions(w, c), [c.id, w.date, useGame.getState().v])
  const zones = new Map<Zone, true>()
  t.forEach((_, i) => { const z = zoneFor(w, c, i + 1, t.length); if (z) zones.set(z, true) })
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      {!compact && <Seg small items={[{ id: 'short', label: 'Short' }, { id: 'full', label: 'Full' }, { id: 'form', label: 'Form' }]} value={mode} onChange={setMode} />}
      <div className="card" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead><tr><th style={{ width: prev ? (mode === 'full' ? 36 : 44) : 28 }}>#</th><th className="l">Club</th><th>P</th>{mode === 'full' && <><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th></>}{mode === 'form' ? <th>Form</th> : <th>GD</th>}<th>Pts</th></tr></thead>
          <tbody>
            {t.map((r, i) => {
              const z = zoneFor(w, c, i + 1, t.length)
              const next = zoneFor(w, c, i + 2, t.length)
              return (
                <tr key={r.clubId} className={`${r.clubId === w.userClubId || highlight?.includes(r.clubId) ? 'me' : ''} ${next !== z && i < t.length - 1 ? 'zone-break' : ''}`} onClick={() => go({ name: 'club', params: { id: r.clubId } })}>
                  <td><span className={`tbl-pos ${mode === 'full' ? 'tight' : ''}`}><span className="zone-num" style={{ borderColor: ZONE_COLOR[z] }}>{i + 1}</span>{prev?.has(r.clubId) && <MoveArrow move={prev.get(r.clubId)! - (i + 1)} size={9} />}</span></td>
                  <td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={20} /><span className="ellipsis b" style={{ maxWidth: mode === 'full' ? (prev ? 64 : 88) : 150 }}>{w.clubs[r.clubId]?.short}</span></div></td>
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
              {(e.x.goals > 0 || e.x.assists > 0) && <span className="row tight" style={{ gap: 6 }}>{e.x.goals > 0 && <span className="ga"><Balls n={e.x.goals} size={12} /></span>}{e.x.assists > 0 && <span className="ga"><Boots n={e.x.assists} size={14} /></span>}</span>}
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
  const [tab, setTab] = useRemember<'overview' | 'squad' | 'fixtures' | 'transfers' | 'news' | 'info'>('tab', 'overview')
  const [editing, toggleEdit, setEditing] = useEditing('Club')
  const c = w.clubs[params.id]
  if (!c) return <Screen title="Club" back><Empty icon="stadium" title="Club not found" /></Screen>
  if (c.national) return <NationProfile w={w} c={c} />
  const squad = [...rosterOf(w, c.id)].sort((a, b) => POS_ORDER[a.positions[0]] - POS_ORDER[b.positions[0]] || b.ovr - a.ovr)
  const lg = leagueOf(w, c.id)
  const st = standing(w, c.id)
  const mgr = w.managers[c.managerId]
  const top = [...squad].sort((a, b) => b.ovr - a.ovr)
  const avg = top.slice(0, 16).reduce((a, p) => a + p.ovr, 0) / Math.max(1, Math.min(16, top.length))
  return (
    <Screen title={c.short} sub={w.leagues[c.leagueId]?.name || c.country} back right={<div className="row tight"><FollowBtn w={w} kind="club" id={c.id} name={c.name} /><EditToggle w={w} on={editing} onClick={toggleEdit} label="Edit club" /></div>}>
      {editing && <div className="pad" style={{ marginBottom: 10 }}><ClubEditor w={w} club={c} onClose={() => setEditing(false)} /></div>}
      <div className="pad">
        <div className="hero" style={{ padding: 16, background: `linear-gradient(140deg, ${c.theme}, #06080d 85%)` }}>
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <Badge club={c} size={80} />
            <div className="grow">
              <div className="h2">{c.name}</div>
              <div className="row tight small" style={{ marginTop: 6, opacity: 0.9 }}>{lg && <CompLogo k={compLogoKey(lg)} size={16} name={lg.name} />}{st ? (st.lastSeason ? `${ordinal(st.pos)} in the ${st.league} last season` : `${ordinal(st.pos)} in ${st.league}`) : lg ? lg.short : c.country}</div>
              <div style={{ marginTop: 6 }}><Stars n={starRating(avg)} size={13} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card jgrid c3 club-facts">
          <button className="tap club-mgr" disabled={c.id !== w.userClubId && !mgr} onClick={() => go(c.id === w.userClubId ? { name: 'manager' } : { name: 'coach', params: { id: mgr!.id } })}>
            <span className="club-mgr-av">{c.id === w.userClubId ? <UserAvatar w={w} size={30} radius={15} /> : mgr ? <ManagerAvatar name={mgr.name} real={mgr.real} size={30} radius={15} nation={mgr.nationality} clubs={[c.name]} /> : null}</span>
            <div style={{ minWidth: 0 }}><div className="tiny dim">Manager</div><div className="b small ellipsis2" style={{ marginTop: 2, lineHeight: 1.15 }}>{c.id === w.userClubId ? `${w.user.firstName} ${w.user.lastName}` : mgr?.name || 'Vacant'}</div></div>
          </button>
          <div><div className="tiny dim">Stadium</div><div className="b small ellipsis2" style={{ marginTop: 2, lineHeight: 1.15 }}>{c.stadium || '—'}</div></div>
          <div><div className="tiny dim">Budget</div><div className="b small" style={{ marginTop: 2 }}>{fmtMoney(c.finance.transferBudget, { short: true })}</div></div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'overview', label: 'Overview' }, { id: 'squad', label: 'Squad' }, { id: 'fixtures', label: 'Fixtures' }, { id: 'transfers', label: 'Transfers' }, { id: 'news', label: 'News' }, { id: 'info', label: 'Club' }]} value={tab} onChange={setTab} /></div>
      {tab === 'overview' && <ClubOverview w={w} clubId={c.id} />}
      {tab === 'squad' && (
        <div className="pad" style={{ marginTop: 10 }}>
          <div className="card list">
            {squad.map((p) => (
              <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                <Face p={p} size={40} radius={10} club={c} />
                <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s">{ageOf(w, p)} yrs · {fmtMoney(p.value, { short: true })}</div></div>
                <PosChip pos={p.positions[0]} />
                <Ovr v={p.ovr} size="sm" />
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'fixtures' && <ClubFixtures w={w} clubId={c.id} />}
      {tab === 'transfers' && <ClubTransfers w={w} club={c} />}
      {tab === 'news' && <ClubNews w={w} club={c} />}
      {tab === 'info' && <ClubInfo w={w} club={c} />}
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
  const rank = rankingTable(w).find((r) => r.id === c.id)
  const trophies = new Map<string, number>()
  for (const t of c.trophies) trophies.set(t.compKey, (trophies.get(t.compKey) || 0) + 1)
  const groups = new Map<string, Player[]>()
  for (const p of [...squad].sort((a, b) => POS_ORDER[a.positions[0]] - POS_ORDER[b.positions[0]] || b.ovr - a.ovr)) {
    const g = POS_GRP[p.positions[0]] || 'Forwards'
    groups.set(g, [...(groups.get(g) || []), p])
  }
  return (
    <Screen title={c.short} sub={`${c.confed || 'FIFA'} · National team`} back right={<FollowBtn w={w} kind="club" id={c.id} name={c.name} />}>
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
      {rank && (
        <div className="pad" style={{ marginTop: 10 }}>
          <button className="card tap fr-card" onClick={() => go({ name: 'fifa', params: { id: c.id } })}>
            <div className="fr-big"><span className="tiny dim">World ranking</span><b className="display">{rank.rank}</b></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row tight"><MoveArrow move={rank.move} size={13} /><span className="small b">{rank.move > 0 ? `Up ${rank.move}` : rank.move < 0 ? `Down ${-rank.move}` : 'No change'}</span><span className="tiny dim">since the last ranking</span></div>
              <div className="tiny dim" style={{ marginTop: 4 }}>{rank.pts.toFixed(2)} points{rank.live ? ` · ${rank.live > 0 ? '+' : ''}${rank.live.toFixed(1)} from matches since` : ''}</div>
            </div>
            <span className="tiny b" style={{ color: 'var(--acc)' }}>Full table</span>
          </button>
        </div>
      )}
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card jgrid c3 club-facts">
          <div><div className="tiny dim">Strength</div><div className="b small" style={{ marginTop: 3 }}>{c.squadAvg.toFixed(1)} <span className="tiny dim">best 23</span></div></div>
          <div><div className="tiny dim">Home ground</div><div className="b small ellipsis2" style={{ marginTop: 3, lineHeight: 1.15 }}>{c.stadium}</div></div>
          <div><div className="tiny dim">Your players</div><div className="b small" style={{ marginTop: 3 }}>{mine.length || '—'}</div></div>
        </div>
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
                    <div className="meta"><div className="t small">{x.name}</div><div className="s">{x.winner === c.id ? 'Winners' : out ? 'Knocked out' : row?.group ? `${row.group} · ${ordinal(pos)} · ${row.pts} pts` : intlStage(w, x)}</div></div>
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
  const prev = lg ? previousPositions(w, lg) : undefined
  return (
    <div className="pad stack" style={{ marginTop: 10 }}>
      {next && <div className="card"><div className="card-h"><span className="label">Next match</span></div><div className="list"><FixtureRow w={w} f={next} clubId={clubId} /></div></div>}
      <div className="card pad-card"><div className="label" style={{ marginBottom: 10 }}>Form</div><FormStrip w={w} clubId={clubId} /></div>
      {around.length > 0 && lg && (
        <div className="card">
          <div className="card-h"><div className="row tight"><CompLogo k={compLogoKey(lg)} size={18} name={lg.name} /><span className="label">{lg.short}</span></div></div>
          <table className="tbl">
            <thead><tr><th style={{ width: prev ? 44 : 28 }}>#</th><th className="l">Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>{around.map((r) => <tr key={r.clubId} className={r.clubId === clubId ? 'me' : ''} onClick={() => r.clubId !== clubId && go({ name: 'club', params: { id: r.clubId } })}><td><span className="tbl-pos">{r.pos}{prev?.has(r.clubId) && <MoveArrow move={prev.get(r.clubId)! - r.pos} size={9} />}</span></td><td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={18} /><span className="ellipsis b">{w.clubs[r.clubId]?.short}</span></div></td><td>{r.p}</td><td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="b">{r.pts - (r.ded || 0)}</td></tr>)}</tbody>
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

type CalEvent = { icon: string; text: string; color?: string; f?: Fixture }
/** What a day holds for him: his match, the matches he is set to watch, his followed clubs' games, his players'
 * national team games and the season's dates (windows, breaks, draws, the review). */
interface CalDay { own?: Fixture; watch: Fixture[]; follow: { f: Fixture; club: number }[]; nt: CalEvent[]; events: CalEvent[] }
type CalShow = 'all' | 'mine' | 'watch' | 'follow'

/** A national team game with his players in it: the row, and which of his players are in it. */
function CalNational({ w, e }: { w: World; e: CalEvent }) {
  return (
    <div className="cal-nt">
      <FixtureRow w={w} f={e.f!} />
      <div className="tiny dim row tight cal-nt-who"><Icon name={e.icon} size={12} color={e.color} /><span className="ellipsis">{e.text}</span></div>
    </div>
  )
}

/**
 * Someone else's match on his calendar, in one line: the club he follows picked out (the other side quieter), or for a
 * match he is set to watch, the eye. Tapping it offers to watch it or to open either club (a result opens the match).
 */
function CalMatch({ w, f, club, watch }: { w: World; f: Fixture; club?: number; watch?: boolean }) {
  const [sheet, setSheet] = useState(false)
  const go = useGame((s) => s.go)
  const comp = w.competitions[f.compId]
  const h = w.clubs[f.home], a = w.clubs[f.away]
  const lit = (id: number) => (club == null || id === club ? ' on' : '')
  return (
    <>
      <button className={`cal-m ${watch ? 'watch' : 'follow'}`} onClick={() => { haptic(); if (f.played) go({ name: 'fixture', params: { id: f.id } }); else setSheet(true) }}>
        <span className="cal-m-comp">{comp && <CompLogo k={compLogoKey(comp)} size={14} name={comp.name} />}</span>
        <span className={`cal-m-t r${lit(h.id)}`}>{h.short}</span>
        <Badge club={h} size={17} />
        <span className="cal-m-s">{f.played ? scoreLine(f) : f.time}</span>
        <Badge club={a} size={17} />
        <span className={`cal-m-t${lit(a.id)}`}>{a.short}</span>
        <span className="cal-m-why">{watch ? <Icon name="eye" size={13} color="var(--acc)" /> : <Icon name="star" size={11} color="var(--gold)" />}</span>
      </button>
      {sheet && <FixtureSheet w={w} f={f} onClose={() => setSheet(false)} />}
    </>
  )
}

/**
 * The other matches of a day in its cell: a match he is watching as its two crests ringed in green, else the clubs he
 * follows that play, as a small stack of their crests. Smaller, in the corner, when the day already shows his match or
 * an event (then the eye for a watched match, the crest of a club he follows).
 */
function CellOthers({ w, day, corner }: { w: World; day: CalDay; corner: boolean }) {
  if (day.watch.length) {
    const f = day.watch[0]
    return corner
      ? <span className="cal-o corner watch" aria-label="A match you're watching"><Icon name="eye" size={9} strokeWidth={2.6} /></span>
      : <span className="cal-o watch" aria-label={`Watching ${w.clubs[f.home]?.short} v ${w.clubs[f.away]?.short}`}><Badge club={w.clubs[f.home]} size={14} /><Badge club={w.clubs[f.away]} size={14} /></span>
  }
  if (!day.follow.length) return null
  const clubs = [...new Set(day.follow.map((x) => x.club))]
  const shown = clubs.slice(0, corner ? 1 : 2)
  return (
    <span className={`cal-o follow${corner ? ' corner' : ''}`} aria-label={`Clubs you follow play: ${clubs.map((id) => w.clubs[id]?.short).join(', ')}`}>
      {shown.map((id) => <Badge key={id} club={w.clubs[id]} size={corner ? 11 : 14} />)}
      {!corner && clubs.length > shown.length && <b>+{clubs.length - shown.length}</b>}
    </span>
  )
}

export function CalendarScreen() {
  const w = useWorld()
  const advance = useGame((s) => s.advance)
  const advancing = useGame((s) => s.advancing)
  const [month, setMonth] = useRemember('month', w.date.slice(0, 7))
  const [show, setShow] = useRemember<CalShow>('calShow', 'all')
  const [sel, setSel] = useState<string>()
  const me = w.userClubId
  const fx = fixturesOf(w, me)
  const first = `${month}-01`
  const lead = (weekday(first) + 6) % 7
  const days: (string | null)[] = [...Array(lead).fill(null)]
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) days.push(d)
  const shift = (n: number) => { haptic(); const [y, m] = month.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(dt.toISOString().slice(0, 7)); setSel(undefined) }
  // national sides the manager's players are with (or would be picked for): their games are on his calendar too
  const review = seasonReviewDate(w)
  const all = fixturesByDate(w)
  const myNations = useMemo(() => new Map([...userNations(w)].map(([id, ps]) => [id, ps.map((p) => p.name.split(' ').slice(-1)[0])])), [w.date, w.userClubId])
  const dayOf = (d: string): CalDay => {
    const day: CalDay = { own: fx.find((x) => x.date === d), watch: [], follow: [], nt: [], events: [] }
    for (const { f, watch, club } of calendarOthers(w, d)) {
      if (watch) day.watch.push(f)
      else if (club != null) day.follow.push({ f, club })
    }
    for (const win of w.windows) {
      if (win.open === d) day.events.push({ icon: 'transfers', text: `${win.name} transfer window opens`, color: 'var(--tw)' })
      if (win.close === d) day.events.push({ icon: 'deadline', text: `${win.name} deadline day`, color: 'var(--neg)' })
    }
    for (const b of w.intlBreaks) if (b.start === d) day.events.push({ icon: 'globe', text: 'International break begins', color: 'var(--info)' })
    for (const c of Object.values(w.competitions)) for (const r of c.rounds) if (!r.drawn && addDays(r.date, -10) === d && c.clubs.includes(me)) day.events.push({ icon: 'bracket', text: `${c.short} ${r.name} draw`, color: 'var(--gold)' })
    for (const x of all.get(d) || []) {
      const players = myNations.get(x.home) || myNations.get(x.away)
      if (players) day.nt.push({ icon: 'globe', text: players.join(', '), color: 'var(--info)', f: x })
    }
    if (d === review) day.events.push({ icon: 'season', text: 'Season review', color: 'var(--gold)' })
    return day
  }
  const inWindow = (d: string) => w.windows.some((x) => d >= x.open && d <= x.close)
  const inBreak = (d: string) => w.intlBreaks.some((x) => d >= x.start && d <= x.end)
  const monthDays = days.filter((d): d is string => !!d).map((d) => ({ d, day: dayOf(d) }))
  const monthFx = fx.filter((f) => f.date.slice(0, 7) === month)
  const res = monthFx.filter((f) => f.played).map((f) => outcomeFor(f, me))
  const comps = [...new Set(monthFx.map((f) => f.compId))].map((id) => w.competitions[id]).filter(Boolean)
  const watching = watchList(w).length > 0
  const following = follows(w).some((x) => x.kind === 'club')
  // what the month at a glance shows: everything, or one kind of thing
  const showing: CalShow = (show === 'watch' && !watching) || (show === 'follow' && !following) ? 'all' : show
  const keep = (day: CalDay): CalDay => showing === 'all' ? day
    : showing === 'mine' ? { ...day, watch: [], follow: [] }
      : showing === 'watch' ? { watch: day.watch, follow: [], nt: [], events: [] }
        : { watch: [], follow: day.follow, nt: [], events: [] }
  const busy = (day: CalDay) => !!day.own || day.watch.length > 0 || day.follow.length > 0 || day.nt.length > 0 || day.events.length > 0
  const agenda = monthDays.map((x) => ({ d: x.d, day: keep(x.day) })).filter((x) => busy(x.day))
  const selDay = sel ? dayOf(sel) : undefined
  const eventLine = (e: CalEvent, i: number) => <div key={i} className="cal-ag-ev small"><Icon name={e.icon} size={15} color={e.color} /><span>{e.text}</span></div>
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
            const day = monthDays.find((x) => x.d === d)!.day
            const f = day.own
            const past = d < w.date
            const o = f?.played ? outcomeFor(f, me) : undefined
            const home = f?.home === me
            const ev = day.events[0]
            const others = day.watch.length > 0 || day.follow.length > 0
            return (
              <button key={d} className={`cal-cell ${d === w.date ? 'today' : ''} ${sel === d ? 'sel' : ''} ${past ? 'past' : ''} ${f ? 'has-fx' : ''} ${!f && day.watch.length ? 'has-watch' : ''} ${inWindow(d) ? 'win' : ''} ${inBreak(d) ? 'intl' : ''}`} onClick={() => { haptic(); setSel(sel === d ? undefined : d) }}>
                <span className="cal-n">{Number(d.slice(8))}</span>
                {f ? (
                  <>
                    <span className={`cal-fx ${o || ''}`}><Badge club={w.clubs[opponent(f, me)]} size={20} /></span>
                    <span className={`cal-sub ${o || ''}`}>{f.played && f.result ? `${home ? f.result.score[0] : f.result.score[1]}-${home ? f.result.score[1] : f.result.score[0]}` : home ? 'H' : 'A'}</span>
                  </>
                ) : ev ? (
                  <><Icon name={ev.icon} size={14} color={ev.color} /><span /></>
                ) : others ? (
                  <><CellOthers w={w} day={day} corner={false} /><span className="cal-sub o">{day.watch[0] && !day.watch[0].played ? day.watch[0].time : ''}</span></>
                ) : (
                  <><span>{all.get(d)?.length ? <span className="cal-dot" /> : null}</span><span /></>
                )}
                {(f || ev) && others && <CellOthers w={w} day={day} corner />}
              </button>
            )
          })}
        </div>
        <div className="row wrap tiny dim cal-legend">
          <span><i className="lg-win" />Transfer window</span><span><i className="lg-intl" />International break</span><span><i className="lg-w" />Won</span><span><i className="lg-l" />Lost</span>
          {watching && <span><i className="lg-watch" />Watching</span>}{following && <span><i className="lg-follow" />Clubs you follow</span>}
        </div>
      </div>
      {sel && selDay && (
        <div className="pad stack fade-up" style={{ marginTop: 12 }} key={sel}>
          <div className="label">{fmtDate(sel, 'full')}</div>
          {(selDay.own || selDay.events.length > 0 || selDay.nt.length > 0) && (
            <div className="card list">
              {selDay.own && <FixtureRow w={w} f={selDay.own} clubId={me} />}
              {selDay.nt.map((e, i) => <CalNational key={i} w={w} e={e} />)}
              {selDay.events.map(eventLine)}
            </div>
          )}
          {selDay.watch.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="label row tight cal-sec"><Icon name="eye" size={13} color="var(--acc)" />Watching</div>
              <div className="card list cal-watch">{selDay.watch.map((f) => <FixtureRow key={f.id} w={w} f={f} />)}</div>
            </div>
          )}
          {selDay.follow.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="label row tight cal-sec"><Icon name="star" size={12} color="var(--gold)" />Clubs you follow</div>
              <div className="card cal-ms">{selDay.follow.map(({ f, club }) => <CalMatch key={f.id} w={w} f={f} club={club} />)}</div>
            </div>
          )}
          {!busy(selDay) && <div className="card pad-card small muted">Nothing for your club this day.{all.get(sel)?.length ? ` ${all.get(sel)!.length} fixtures elsewhere.` : ''}</div>}
          {sel > w.date && (
            <button className="btn club block" disabled={advancing} onClick={() => { haptic('medium'); advance(sel) }}>
              <Icon name="ffwd" size={18} /> Advance to {fmtDate(sel, 'dm')}
            </button>
          )}
          {sel > w.date && <div className="tiny dim">Advancing stops early for your matches, the matches you watch, and anything your stop conditions flag (Settings → Advance).</div>}
        </div>
      )}
      {!sel && (
        <div className="pad" style={{ marginTop: 14 }}>
          <div className="row between" style={{ margin: '0 2px 8px', gap: 10 }}>
            <div className="label">{fmtDate(first, 'month').split(' ')[0]} at a glance</div>
          </div>
          {(watching || following) && (
            <div style={{ marginBottom: 10 }}>
              <Seg small items={[{ id: 'all' as const, label: 'All' }, { id: 'mine' as const, label: 'My club' }, ...(watching ? [{ id: 'watch' as const, label: 'Watching' }] : []), ...(following ? [{ id: 'follow' as const, label: 'Following' }] : [])]} value={showing} onChange={(v) => { haptic(); setShow(v) }} />
            </div>
          )}
          {!agenda.length && <div className="card pad-card small muted">{showing === 'watch' ? 'No matches marked to watch this month.' : showing === 'follow' ? "The clubs you follow don't play this month." : 'Nothing scheduled for your club this month.'}</div>}
          {agenda.length > 0 && (
            <div className="card list cal-agenda">
              {agenda.map(({ d, day }) => (
                <div key={d} className={`cal-ag ${d < w.date ? 'past' : ''} ${d === w.date ? 'today' : ''}`}>
                  <button className="cal-ag-d" onClick={() => { haptic(); setSel(d) }}><b className="display">{Number(d.slice(8))}</b><span className="tiny dim">{fmtDate(d, 'day')}</span></button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    {day.own && <FixtureRow w={w} f={day.own} clubId={me} />}
                    {day.nt.map((e, i) => <CalNational key={i} w={w} e={e} />)}
                    {day.events.map(eventLine)}
                    {(day.watch.length > 0 || day.follow.length > 0) && (
                      <div className="cal-ms">
                        {day.watch.map((f) => <CalMatch key={f.id} w={w} f={f} watch />)}
                        {day.follow.map(({ f, club }) => <CalMatch key={f.id} w={w} f={f} club={club} />)}
                      </div>
                    )}
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
