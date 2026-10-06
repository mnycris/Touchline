// FotMob-style line-ups: both XIs on one pitch (home top, away bottom) or a single XI on a full pitch, with photos,
// shirt numbers, live/final rating pills, goals, cards, captaincy and substitutions, plus bench, coaches and absentees.
import type { ReactNode } from 'react'
import type { Club, Competition, Fixture, TeamSheet, World } from '../../domain/types'
import type { Formation } from '../../domain/constants'
import { formationOf } from '../../domain/constants'
import { Avatar, Badge, Face, ManagerAvatar } from './atoms'
import { Icon } from '../icons/Icon'
import { callName } from '../../engine/match/commentary'
import type { MatchSim } from '../../engine/match/engine'
import { playerStatus } from '../selectors'
import { posRating } from '../../domain/ratings'

export function ratingColor(v: number) {
  return v >= 9 ? '#2f80ed' : v >= 8 ? '#0db36b' : v >= 7 ? '#3cc26a' : v >= 6 ? '#f29b1d' : v >= 5 ? '#ef6b2c' : '#e5484d'
}

export function RatingPill({ v, motm, size = 'md' }: { v: number; motm?: boolean; size?: 'sm' | 'md' }) {
  return <span className={`rt-pill ${size}`} style={{ background: motm ? '#2f80ed' : ratingColor(v) }}>{motm && <Icon name="star" size={size === 'sm' ? 8 : 10} strokeWidth={2.6} />}{v.toFixed(1)}</span>
}

export { Ball, Boot, Boots, MissedPen } from './Glyphs'
import { PitchSurface } from './PitchSurface'
import { Ball, Boots, MissedPen } from './Glyphs'

// ---------------------------------------------------------------------------- data model
export interface LPl {
  id: number
  rating?: number
  goals?: number
  og?: number
  assists?: number
  penMissed?: boolean
  yellow?: boolean
  red?: boolean
  subOn?: number
  subOff?: number
  captain?: boolean
  motm?: boolean
  injured?: boolean
  status?: { icon: string; color: string; label: string }
  energy?: number
  fit?: number // rating at the slot (team selection)
  pos?: string
}
export interface LSide {
  club: Club
  formation: Formation
  xi: (LPl | undefined)[] // by formation slot
  bench: LPl[]
  manager?: { name: string; real: boolean; color?: string }
  note?: string
  unavailable?: { id: number; reason: string; icon: string; color: string }[]
  avg?: number
  title?: string // replaces the club name in the header (e.g. Team of the Week)
  logo?: ReactNode // replaces the club badge in the header
}

export function managerOf(w: World, clubId: number): LSide['manager'] {
  if (clubId === w.userClubId) return { name: w.user.realManager || `${w.user.firstName} ${w.user.lastName}`, real: !!w.user.realManager, color: w.user.avatarColor }
  const m = w.managers[w.clubs[clubId]?.managerId]
  return m ? { name: m.name, real: m.real } : undefined
}

export function sideFromSheet(w: World, clubId: number, sheet: Pick<TeamSheet, 'lineup' | 'bench' | 'formation' | 'captain'>, comp?: Competition, note?: string): LSide {
  const f = formationOf(sheet.formation)
  const club = w.clubs[clubId]
  const mk = (id: number, slot?: number): LPl | undefined => {
    const p = w.players[id]
    if (!p) return undefined
    const st = playerStatus(w, p, comp)
    return {
      id, captain: sheet.captain === id, energy: p.fitness,
      fit: slot != null ? posRating(p, f.slots[slot].pos) : undefined, pos: slot != null ? f.slots[slot].label : p.positions[0],
      status: st.key !== 'ok' && st.key !== 'listed' ? { icon: st.icon, color: st.color, label: st.label } : undefined,
    }
  }
  const unavailable = Object.values(w.players)
    .filter((p) => p.clubId === clubId && !p.academy && (p.injury || p.suspensions.length))
    .map((p) => { const st = playerStatus(w, p, comp); return { id: p.id, reason: st.label, icon: st.icon, color: st.color } })
    .filter((u) => u.icon === 'injury' || u.icon === 'suspension')
  const xi = sheet.lineup.map((id, i) => mk(id, i))
  const ovrs = sheet.lineup.map((id) => w.players[id]?.ovr || 0).filter(Boolean)
  return { club, formation: f, xi, bench: sheet.bench.map((id) => mk(id)).filter(Boolean) as LPl[], manager: managerOf(w, clubId), note, unavailable, avg: ovrs.length ? Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length) : undefined }
}

export function sideFromSim(w: World, sim: MatchSim, side: 0 | 1): LSide {
  const clubId = side === 0 ? sim.home.clubId : sim.away.clubId
  const f = formationOf(sim.sideFormation(side))
  const rs = sim.liveRatings(side)
  const cap = sim.captain(side)
  const og = new Map<number, number>()
  for (const e of sim.events) if (e.type === 'owngoal' && e.player && e.side !== side) og.set(e.player, (og.get(e.player) || 0) + 1)
  const mk = (r: (typeof rs)[number]): LPl => ({
    id: r.id, rating: r.played ? r.rating : undefined, goals: r.goals, assists: r.assists, penMissed: r.penMissed, og: og.get(r.id), yellow: r.yellow, red: r.red, subOn: r.subOn, subOff: r.red ? undefined : r.subOff,
    captain: r.id === cap, injured: r.injured, energy: r.energy, pos: r.pos,
  })
  const xi: (LPl | undefined)[] = f.slots.map((_, i) => {
    const r = rs.find((x) => x.on && x.slot === i) || rs.find((x) => x.red && x.slot === i && !rs.some((y) => y.on && y.slot === i))
    return r ? mk(r) : undefined
  })
  const onXi = new Set(xi.filter(Boolean).map((x) => x!.id))
  const bench = rs.filter((r) => !onXi.has(r.id)).sort((a, b) => (b.played ? 1 : 0) - (a.played ? 1 : 0) || (a.subOn ?? a.subOff ?? 999) - (b.subOn ?? b.subOff ?? 999)).map(mk)
  return { club: w.clubs[clubId], formation: f, xi, bench, manager: managerOf(w, clubId) }
}

export function sideFromResult(w: World, fx: Fixture, side: 0 | 1): LSide | undefined {
  const r = fx.result
  if (!r?.lineups || !r.players.length) return undefined
  const clubId = side === 0 ? fx.home : fx.away
  const f = formationOf(r.formations?.[side] || '4-3-3')
  const stats = new Map(r.players.filter((x) => x.side === side).map((x) => [x.id, x]))
  const og = new Map<number, number>()
  for (const e of r.events) if (e.type === 'owngoal' && e.player && e.side !== side) og.set(e.player, (og.get(e.player) || 0) + 1)
  const missed = new Set(r.events.filter((e) => e.type === 'penMiss' && e.side === side).map((e) => e.player))
  const mk = (id: number): LPl | undefined => {
    const s = stats.get(id)
    if (!s) return w.players[id] ? { id } : undefined
    return { id, rating: s.rating, goals: s.goals, assists: s.assists, penMissed: missed.has(id) || undefined, og: og.get(id), yellow: s.yellow, red: s.red, subOn: s.started ? undefined : s.subOn, subOff: s.red ? undefined : s.subOff, captain: r.captains?.[side] === id, motm: r.motm === id, injured: s.injured, pos: s.pos }
  }
  const xi = r.lineups[side].map(mk)
  const bench = [...stats.values()].filter((s) => !s.started).sort((a, b) => (a.subOn ?? 0) - (b.subOn ?? 0)).map((s) => mk(s.id)!).filter(Boolean)
  return { club: w.clubs[clubId], formation: f, xi, bench, manager: managerOf(w, clubId) }
}

// ---------------------------------------------------------------------------- layout
/** Rows like FotMob: slots are clustered by depth and the rows spread evenly over the available height. */
function rowCount(f: Formation) {
  const ys = f.slots.map((s) => s.y).sort((a, b) => a - b)
  let n = 1
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 11) n++
  return n
}
function slotTops(f: Formation, from: number, to: number): number[] {
  const order = f.slots.map((s, i) => ({ i, y: s.y })).sort((a, b) => a.y - b.y)
  const rows: { i: number; y: number }[][] = []
  for (const o of order) {
    const last = rows[rows.length - 1]
    if (last && o.y - last[last.length - 1].y <= 11) last.push(o)
    else rows.push([o])
  }
  const out: number[] = new Array(f.slots.length).fill(0)
  rows.forEach((row, ri) => {
    const mean = row.reduce((a, o) => a + o.y, 0) / row.length
    const t = rows.length === 1 ? from : from + ((to - from) * ri) / (rows.length - 1)
    for (const o of row) out[o.i] = t + (o.y - mean) * (to > from ? 0.22 : -0.22)
  })
  return out
}

function PlNode({ w, s, club, left, top, small, onTap, sel, mode, energy }: { w: World; s: LPl; club: Club; left: number; top: number; small?: boolean; onTap?: () => void; sel?: boolean; mode: 'live' | 'sheet'; energy?: boolean }) {
  const mine = club.id === w.userClubId
  const p = w.players[s.id]
  if (!p) return null
  const size = small ? 34 : 40
  const goals = s.goals || 0
  const assists = s.assists || 0
  return (
    <button type="button" data-mine={mine ? '1' : undefined} className={`fl-pl ${sel ? 'sel' : ''} ${s.red ? 'sent' : ''}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={onTap} disabled={!onTap}>
      <div className="fl-ph" style={{ width: size, height: size }}>
        <Face p={p} size={size} radius={size / 2} club={club} />
        {s.rating != null && <span className="fl-rt"><RatingPill v={s.rating} motm={s.motm} size="sm" /></span>}
        {mode === 'sheet' && s.fit != null && <span className="fl-rt"><span className="fit-pill" style={{ background: s.fit >= p.ovr - 1 ? '#3cc26a' : s.fit >= p.ovr - 6 ? '#f29b1d' : '#e5484d' }}>{s.fit}</span></span>}
        {(s.yellow || s.red) && <span className="fl-cards">{s.yellow && <i className="y" />}{s.red && <i className="r" />}</span>}
        {(goals > 0 || !!s.og || s.penMissed) && (
          <span className="fl-goals">
            {Array.from({ length: Math.min(goals, 3) }, (_, i) => <Ball key={i} size={13} />)}
            {goals > 3 && <b>×{goals}</b>}
            {!!s.og && <span className="og"><Ball size={12} /></span>}
            {s.penMissed && <MissedPen size={12} />}
          </span>
        )}
        {assists > 0 && <span className="fl-ast"><Boots n={assists} size={15} /></span>}
        {s.subOn != null && <span className="fl-sub in"><Icon name="arrowUp" size={10} strokeWidth={3} /></span>}
        {s.subOff != null && <span className="fl-sub out"><Icon name="arrowDown" size={10} strokeWidth={3} /></span>}
        {s.subOn == null && s.subOff == null && s.injured && <span className="fl-status" style={{ background: 'var(--neg)' }}><Icon name="injury" size={9} color="#fff" /></span>}
        {s.subOn == null && s.subOff == null && !s.injured && s.status && <span className="fl-status" style={{ background: s.status.color }}><Icon name={s.status.icon} size={9} color="#fff" /></span>}
      </div>
      <div className="fl-nm">{p.jersey ? <span className="fl-no">{p.jersey}</span> : null}<span className="ellipsis">{callName(p.name)}</span>{s.captain && <span className="fl-cap">C</span>}</div>
      {(s.subOff != null || s.subOn != null) && <div className="fl-subm">{s.subOn != null && <span className="pos">{s.subOn}'</span>}{s.subOff != null && <span className="neg">{s.subOff}'</span>}</div>}
      {(mode === 'sheet' || energy) && s.energy != null && s.energy < (energy ? 101 : 85) && <EnergyBar v={s.energy} />}
    </button>
  )
}

/** The thin energy bar under a player on the pitch. */
export function EnergyBar({ v }: { v: number }) {
  return <div className="fl-energy"><i style={{ width: `${v}%`, background: v > 70 ? 'var(--pos)' : v > 55 ? 'var(--warn)' : 'var(--neg)' }} /></div>
}

function TeamBar({ s, right, onClick }: { s: LSide; right?: ReactNode; onClick?: () => void }) {
  return (
    <div className="fl-bar" onClick={onClick}>
      {s.logo ?? <Badge club={s.club} size={22} />}
      <b className="ellipsis">{s.title ?? s.club.short}</b>
      {s.note && <span className="fl-note">{s.note}</span>}
      <span className="grow" />
      {right}
      {s.avg != null && <span className="tiny dim">Avg {s.avg}</span>}
      <span className="fl-form">{s.formation.name.replace(/ \(.*\)/, '')}</span>
    </div>
  )
}

export interface LineupTap { side: 0 | 1; id: number; slot?: number; bench?: boolean }

/** Both teams on one pitch, FotMob-style. */
export function MatchLineup({ w, home, away, onTap, sel, mode = 'live', benchTitle = 'Substitutes' }: { w: World; home: LSide; away: LSide; onTap?: (t: LineupTap) => void; sel?: number; mode?: 'live' | 'sheet'; benchTitle?: string }) {
  const rowsH = slotTops(home.formation, 5, 42.5)
  const rowsA = slotTops(away.formation, 95, 57.5)
  const small = (f: Formation) => rowCount(f) >= 5
  return (
    <div className="fl-wrap">
      <TeamBar s={home} />
      <PitchSurface vertical aspect={0.54} pad={2.5} className="fl-pitch two">
        {home.xi.map((s, i) => s && <PlNode key={`h${s.id}`} w={w} s={s} club={home.club} mode={mode} small={small(home.formation)} left={clampX(100 - home.formation.slots[i].x)} top={rowsH[i]} sel={sel === s.id} onTap={onTap ? () => onTap({ side: 0, id: s.id, slot: i }) : undefined} />)}
        {away.xi.map((s, i) => s && <PlNode key={`a${s.id}`} w={w} s={s} club={away.club} mode={mode} small={small(away.formation)} left={clampX(away.formation.slots[i].x)} top={rowsA[i]} sel={sel === s.id} onTap={onTap ? () => onTap({ side: 1, id: s.id, slot: i }) : undefined} />)}
      </PitchSurface>
      <TeamBar s={away} />
      <BenchColumns w={w} home={home} away={away} title={benchTitle} onTap={onTap} sel={sel} />
    </div>
  )
}

/** One XI on a full-length pitch, attacking upwards (team selection, manage team). */
export function TeamLineup({ w, side, onTap, sel, mode = 'sheet', energy, children }: { w: World; side: LSide; onTap?: (t: LineupTap) => void; sel?: number; mode?: 'live' | 'sheet'; energy?: boolean; children?: ReactNode }) {
  const tops = slotTops(side.formation, 90, 11)
  return (
    <div className="fl-wrap">
      <TeamBar s={side} />
      <PitchSurface vertical aspect={0.8} pad={2.5} chevron className="fl-pitch one">
        {side.xi.map((s, i) => s && <PlNode key={s.id} w={w} s={s} club={side.club} mode={mode} energy={energy} left={clampX(side.formation.slots[i].x)} top={tops[i]} sel={sel === s.id} onTap={onTap ? () => onTap({ side: 0, id: s.id, slot: i }) : undefined} />)}
        {side.xi.map((s, i) => !s && <div key={`e${i}`} className="fl-empty" style={{ left: `${clampX(side.formation.slots[i].x)}%`, top: `${tops[i]}%` }} onClick={onTap ? () => onTap({ side: 0, id: 0, slot: i }) : undefined}><Icon name="plus" size={16} /><span>{side.formation.slots[i].label}</span></div>)}
      </PitchSurface>
      {children}
    </div>
  )
}

const clampX = (x: number) => Math.max(9, Math.min(91, x))

export function BenchRowFM({ w, s, club, onTap, sel, right }: { w: World; s: LPl; club: Club; onTap?: () => void; sel?: boolean; right?: ReactNode }) {
  const p = w.players[s.id]
  if (!p) return null
  return (
    <button type="button" className={`fl-bench-row ${sel ? 'sel' : ''}`} onClick={onTap} disabled={!onTap}>
      <Face p={p} size={30} radius={15} club={club} />
      <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <div className="small b ellipsis">{p.jersey ? <span className="dim num" style={{ marginRight: 4 }}>{p.jersey}</span> : null}{callName(p.name)}</div>
        <div className="tiny dim row tight" style={{ gap: 4 }}>
          {s.subOn != null && <><Icon name="arrowUp" size={10} color="var(--pos)" strokeWidth={3} />{s.subOn}'</>}
          {s.subOff != null && <><Icon name="arrowDown" size={10} color="var(--neg)" strokeWidth={3} />{s.subOff}'</>}
          {s.subOn == null && s.subOff == null && <span>{s.pos || p.positions[0]}</span>}
          {Array.from({ length: Math.min(s.goals || 0, 3) }, (_, i) => <Ball key={i} size={11} />)}
          <Boots n={s.assists || 0} size={12} />
          {s.penMissed && <MissedPen size={11} />}
          {s.yellow && <span className="card-y" />}{s.red && <span className="card-r" />}
        </div>
      </div>
      {right ?? (s.rating != null && <RatingPill v={s.rating} motm={s.motm} size="sm" />)}
      {s.status && <Icon name={s.status.icon} size={13} color={s.status.color} />}
    </button>
  )
}

function BenchColumns({ w, home, away, title, onTap, sel }: { w: World; home: LSide; away: LSide; title: string; onTap?: (t: LineupTap) => void; sel?: number }) {
  return (
    <div className="fl-extra">
      {(home.bench.length > 0 || away.bench.length > 0) && (
        <>
          <div className="fl-h">{title}</div>
          <div className="fl-cols">
            <div>{home.bench.map((s) => <BenchRowFM key={s.id} w={w} s={s} club={home.club} sel={sel === s.id} onTap={onTap ? () => onTap({ side: 0, id: s.id, bench: true }) : undefined} />)}</div>
            <div>{away.bench.map((s) => <BenchRowFM key={s.id} w={w} s={s} club={away.club} sel={sel === s.id} onTap={onTap ? () => onTap({ side: 1, id: s.id, bench: true }) : undefined} />)}</div>
          </div>
        </>
      )}
      {(home.manager || away.manager) && (
        <>
          <div className="fl-h">Coach</div>
          <div className="fl-cols">
            {[home, away].map((s, i) => <div key={i} className="fl-coach">{s.manager && <><ManagerOrMono m={s.manager} /><span className="small b ellipsis">{s.manager.name}</span></>}</div>)}
          </div>
        </>
      )}
      {((home.unavailable?.length || 0) + (away.unavailable?.length || 0)) > 0 && (
        <>
          <div className="fl-h">Injured &amp; suspended</div>
          <div className="fl-cols">
            {[home, away].map((s, i) => (
              <div key={i}>
                {(s.unavailable || []).slice(0, 6).map((u) => {
                  const p = w.players[u.id]
                  return p ? (
                    <div key={u.id} className="fl-bench-row" style={{ cursor: 'default' }}>
                      <Face p={p} size={26} radius={13} club={s.club} />
                      <div className="grow" style={{ minWidth: 0 }}><div className="small b ellipsis">{callName(p.name)}</div><div className="tiny ellipsis" style={{ color: u.color }}>{u.reason}</div></div>
                    </div>
                  ) : null
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ManagerOrMono({ m }: { m: NonNullable<LSide['manager']> }) {
  return m.real ? <ManagerAvatar name={m.name} size={30} /> : <Avatar name={m.name} size={30} color={m.color} />
}
