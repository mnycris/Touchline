// The match read as it goes: the half-time report, the live analysis in Manage Team and, after the match, what each
// tactical change coincided with. Everything comes from engine/match/analysis.ts, which only speaks when the numbers
// stand out from what an ordinary side does over the same time.
import { useMemo, useState } from 'react'
import type { ChangeReport, World } from '../../domain/types'
import type { MatchSim } from '../../engine/match/engine'
import { callName } from '../../engine/match/commentary'
import { chanceLabel, observe, spanOf, type Involvement, type Obs, type Span } from '../../engine/match/analysis'
import { Icon } from '../icons/Icon'
import { haptic } from '../../store/game'

const TONE_ICON: Record<Obs['tone'], string> = { good: 'pos', bad: 'neg', neutral: 'neu' }
/** our colour and theirs, from the match kits (home or away) */
const sideVars = (side: 0 | 1) => ({ ['--us-c' as any]: side === 0 ? 'var(--home-c, rgba(var(--club-rgb), 1))' : 'var(--away-c, rgba(var(--club-rgb), 1))', ['--th-c' as any]: side === 0 ? 'var(--away-c, var(--t3))' : 'var(--home-c, var(--t3))' })

/** Our players' touches and minutes so far, for "who isn't involved". */
function involvement(sim: MatchSim, w: World, side: 0 | 1): Involvement[] {
  return sim.liveRatings(side).filter((r) => r.on).map((r) => {
    const st = sim.playerStats(side, r.id)
    return { id: r.id, name: callName(w.players[r.id]?.name || ''), pos: r.pos, role: r.role, mins: st?.mins || 0, touches: st?.touches || 0 }
  })
}

/** Goals each side scored inside a span of frames. */
function goalsIn(sim: MatchSim, side: 0 | 1, sp: Span): [number, number] {
  const fr = sim.ledgerFrames
  const from = sp.a >= 0 ? fr[sp.a] : undefined, to = fr[sp.b]
  const after = (e: { min: number; add?: number }, f?: { m: number; add: number }) => !f || e.min > f.m || (e.min === f.m && (e.add || 0) > f.add)
  const upTo = (e: { min: number; add?: number }, f: { m: number; add: number }) => e.min < f.m || (e.min === f.m && (e.add || 0) <= f.add)
  const g: [number, number] = [0, 0]
  for (const e of sim.events) {
    if (e.type !== 'goal' && e.type !== 'penGoal' && e.type !== 'owngoal') continue
    if (!after(e, from) || !upTo(e, to)) continue
    g[e.side === side ? 0 : 1]++
  }
  return g
}

function useObs(sim: MatchSim, w: World, side: 0 | 1, from: number, seed: string, version: number) {
  return useMemo(() => {
    const fr = sim.ledgerFrames
    if (!fr.length) return undefined
    const b = fr.length - 1
    const a = Math.max(-1, Math.min(b - 1, from))
    const span = spanOf(fr, side, a, b)
    const obs = observe({ span, tactics: sim.sideTactics(side), players: a < 0 ? involvement(sim, w, side) : undefined, seed, goals: goalsIn(sim, side, span) })
    return { span, obs }
    // `version` re-reads after each simulated minute
  }, [sim, side, from, seed, version, w])
}

function ObsRow({ o, onTap }: { o: Obs; onTap?: () => void }) {
  return (
    <button className={`htr-obs ${o.tone}`} onClick={onTap} disabled={!onTap}>
      <span className={`htr-dot ${TONE_ICON[o.tone]}`}><Icon name={o.icon} size={15} /></span>
      <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <span className="htr-head">{o.head}</span>
        <span className="htr-text">{o.text}</span>
        {o.more && <span className="htr-more">{o.more}</span>}
      </span>
    </button>
  )
}

/** Three figures side by side: ours, the label, theirs, with a bar for the split. */
function Strip({ sp, names }: { sp: Span; names: [string, string] }) {
  const rows: [string, number, number, (x: number) => string][] = [
    ['xG', sp.us.xg, sp.them.xg, (x) => x.toFixed(2)],
    ['Shots', sp.us.shots, sp.them.shots, (x) => String(x)],
    ['Into the box', sp.us.boxEntries, sp.them.boxEntries, (x) => String(x)],
    ['Ball', sp.us.poss, sp.them.poss, (x) => `${Math.round(x * 100)}%`],
  ]
  return (
    <div className="htr-strip">
      <div className="htr-strip-h tiny"><span>{names[0]}</span><span>{names[1]}</span></div>
      {rows.map(([l, a, b, f]) => {
        const tot = a + b
        const share = tot > 0 ? a / tot : 0.5
        return (
          <div key={l} className="htr-srow">
            <b className="num">{f(a)}</b>
            <div className="htr-sbar"><span className="htr-sl">{l}</span><i style={{ width: `${share * 100}%` }} /></div>
            <b className="num">{f(b)}</b>
          </div>
        )
      })}
    </div>
  )
}

/** Where each side's chances came from, as bars. */
function Sources({ sp }: { sp: Span }) {
  const list = (by: Span['us']['by']) => Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 4)
  const max = Math.max(0.05, ...Object.values(sp.us.by).map((x) => x[1]), ...Object.values(sp.them.by).map((x) => x[1]))
  const col = (title: string, by: Span['us']['by'], cls: string) => (
    <div className="htr-src">
      <div className="htr-src-t tiny">{title}</div>
      {list(by).length ? list(by).map(([how, [n, x]]) => (
        <div key={how} className="htr-src-r">
          <div className="row between tiny"><span className="ellipsis">{chanceLabel(how)}</span><span className="num dim">{n} · {x.toFixed(2)}</span></div>
          <div className={`htr-src-bar ${cls}`}><i style={{ width: `${(x / max) * 100}%` }} /></div>
        </div>
      )) : <div className="tiny dim">No shots</div>}
    </div>
  )
  return <div className="htr-srcs">{col('Our chances', sp.us.by, 'us')}{col('Theirs', sp.them.by, 'them')}</div>
}

/** Where each side got into the final third: left, middle, right (theirs mirrored onto our view). */
function Lanes({ sp }: { sp: Span }) {
  const pct = (l: [number, number, number]) => { const t = l[0] + l[1] + l[2] || 1; return l.map((x) => Math.round((x / t) * 100)) }
  const us = pct(sp.us.entryLanes), th = pct(sp.them.entryLanes).reverse()
  return (
    <div className="htr-lanes">
      <div className="htr-lane-pitch">
        {[0, 1, 2].map((i) => (
          <div key={i} className="htr-lane">
            <span className="htr-lane-n tiny">{['Left', 'Middle', 'Right'][i]}</span>
            <span className="htr-lane-us" style={{ ['--a' as any]: 0.12 + us[i] / 160 }}>{us[i]}%</span>
            <span className="htr-lane-th" style={{ ['--a' as any]: 0.08 + th[i] / 200 }}>{th[i]}%</span>
          </div>
        ))}
      </div>
      <div className="row between tiny dim" style={{ marginTop: 5 }}><span>Into the final third, by flank (from our side)</span><span className="htr-key"><i className="us" /> us <i className="th" /> them</span></div>
    </div>
  )
}

/** Notes on our own players at a break: legs, cards and form (tap to make the change). */
function PlayerNotes({ sim, w, side, onManage }: { sim: MatchSim; w: World; side: 0 | 1; onManage: (id?: number) => void }) {
  const rs = sim.liveRatings(side).filter((r) => r.on)
  const notes: { icon: string; text: string; id: number }[] = []
  const tired = rs.filter((r) => r.pos !== 'GK' && r.energy < 66).sort((a, b) => a.energy - b.energy)[0]
  if (tired) notes.push({ icon: 'fitness', id: tired.id, text: `${callName(w.players[tired.id].name)} is tiring (${Math.round(tired.energy)}% energy).` })
  const booked = rs.find((r) => r.yellow && ['CB', 'LB', 'RB', 'CDM', 'LWB', 'RWB'].includes(r.pos))
  if (booked) notes.push({ icon: 'yellow', id: booked.id, text: `${callName(w.players[booked.id].name)} is on a yellow card.` })
  const poor = rs.filter((r) => r.rating < 6.0).sort((a, b) => a.rating - b.rating)[0]
  if (poor && poor.id !== tired?.id) notes.push({ icon: 'formDown', id: poor.id, text: `${callName(w.players[poor.id].name)} is having a difficult game (${poor.rating.toFixed(1)}).` })
  if (!notes.length) return null
  return (
    <div className="htr-sec">
      <div className="htr-sec-t">Players</div>
      {notes.map((n) => (
        <button key={n.id + n.icon} className="htr-pnote" onClick={() => { haptic(); onManage(n.id) }}>
          <Icon name={n.icon} size={15} /><span className="grow small" style={{ textAlign: 'left' }}>{n.text}</span><Icon name="forward" size={13} />
        </button>
      ))}
    </div>
  )
}

/**
 * The half-time report: the half as it was played, in three observations at most, with the detail one tap away. It
 * can be put away; the break carries on either way.
 */
export function HalfTimeReport({ sim, w, side, names, seed, onManage, onClose }: {
  sim: MatchSim; w: World; side: 0 | 1; names: [string, string]; seed: string; onManage: (id?: number) => void; onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const r = useObs(sim, w, side, -1, seed + ':ht', sim.ledgerFrames.length)
  const et = sim.phase === 'ETHT'
  if (!r) return null
  const head = r.obs.slice(0, 3), rest = r.obs.slice(3)
  return (
    <div className="card htr" style={sideVars(side)}>
      <div className="htr-top">
        <div className="kicker">{et ? 'Extra-time break' : 'Half-time report'}</div>
        <button className="htr-x" onClick={() => { haptic(); onClose() }} aria-label="Close the report"><Icon name="close" size={16} /></button>
      </div>
      <Strip sp={r.span} names={names} />
      <div className="htr-list">
        {head.length ? head.map((o) => <ObsRow key={o.key} o={o} onTap={o.player ? () => onManage(o.player) : undefined} />)
          : <div className="htr-quiet small muted">An even half with nothing out of the ordinary in the numbers.</div>}
      </div>
      <div className={`htr-detail ${open ? 'open' : ''}`}>
        <div className="htr-detail-in">
          {rest.length > 0 && <div className="htr-sec"><div className="htr-sec-t">Also</div>{rest.slice(0, 4).map((o) => <ObsRow key={o.key} o={o} onTap={o.player ? () => onManage(o.player) : undefined} />)}</div>}
          <div className="htr-sec"><div className="htr-sec-t">Where the chances came from</div><Sources sp={r.span} /></div>
          <div className="htr-sec"><div className="htr-sec-t">Where the attacks went</div><Lanes sp={r.span} /></div>
          <PlayerNotes sim={sim} w={w} side={side} onManage={onManage} />
        </div>
      </div>
      <div className="htr-foot">
        <button className="btn sm ghost" onClick={() => { haptic(); setOpen((x) => !x) }}><Icon name={open ? 'up' : 'down'} size={15} /> {open ? 'Less' : 'More detail'}</button>
        <button className="btn sm" onClick={() => { haptic(); onManage() }}><Icon name="tactics" size={15} /> Make changes</button>
      </div>
      <div className="tiny dim htr-note">{et ? 'The match so far.' : 'One half is a small sample: these are tendencies, not verdicts.'} Substitutions at the break don't use a window.</div>
    </div>
  )
}

/** Live analysis for Manage Team: the last quarter of an hour, or the match so far. */
export function LiveAnalysis({ sim, w, side, names }: { sim: MatchSim; w: World; side: 0 | 1; names: [string, string] }) {
  const [win, setWin] = useState<'15' | 'all'>('15')
  const fr = sim.ledgerFrames
  const from = win === 'all' ? -1 : fr.length - 1 - 15
  const r = useObs(sim, w, side, from, `live:${sim.ctx.venue}:${win}`, fr.length)
  if (!r || r.span.minutes < 10) return <div className="htr-quiet small muted" style={{ marginTop: 12 }}>Too early to read anything into it: give it ten minutes.</div>
  return (
    <div style={{ marginTop: 12, ...sideVars(side) }}>
      <div className="seg" style={{ height: 34, marginBottom: 10 }}>
        <button className={win === '15' ? 'on' : ''} onClick={() => setWin('15')}>Last {Math.min(15, r.span.minutes)} min</button>
        <button className={win === 'all' ? 'on' : ''} onClick={() => setWin('all')}>Match so far</button>
      </div>
      <Strip sp={r.span} names={names} />
      <div className="htr-list">
        {r.obs.length ? r.obs.slice(0, 5).map((o) => <ObsRow key={o.key} o={o} />) : <div className="htr-quiet small muted">Nothing stands out from an ordinary {win === '15' ? 'quarter of an hour' : 'game'} so far.</div>}
      </div>
      {win === 'all' && <div className="htr-sec"><div className="htr-sec-t">Where the chances came from</div><Sources sp={r.span} /></div>}
      <div className="tiny dim htr-note">{win === '15' ? 'Fifteen minutes is a short window: read it as a hint, not a trend.' : 'Compared with what an ordinary side does over the same time.'}</div>
    </div>
  )
}

const fmtRow = (fmt: 'pct' | 'n1' | 'n2', v: number) => (fmt === 'pct' ? `${Math.round(v * 100)}%` : fmt === 'n2' ? v.toFixed(2) : v.toFixed(1))

/** After the match: what each of the manager's changes coincided with. */
export function ChangeReports({ list }: { list: ChangeReport[] }) {
  const [open, setOpen] = useState(0)
  return (
    <div className="card pad-card chg">
      <div className="label" style={{ marginBottom: 2 }}>Your changes</div>
      <div className="tiny dim" style={{ marginBottom: 8 }}>Per 90 minutes, before and after each change. It coincided with what follows; it didn't necessarily cause it.</div>
      {list.map((c, i) => (
        <div key={i} className={`chg-item ${open === i ? 'open' : ''}`}>
          <button className="chg-h" onClick={() => { haptic(); setOpen(open === i ? -1 : i) }}>
            <span className="chg-min num">{c.min}{c.add ? `+${c.add}` : ''}'</span>
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
              <span className="chg-t">{c.text[0].toUpperCase() + c.text.slice(1)}</span>
              <span className="chg-read tiny">{c.read}</span>
            </span>
            <Icon name={open === i ? 'up' : 'down'} size={15} />
          </button>
          <div className="chg-body">
            <div className="chg-in">
              <div className="chg-row chg-hd tiny"><span /><span>Before · {c.minsBefore}'</span><span>After · {c.minsAfter}'</span></div>
              {c.rows.map((r) => {
                const up = r.after > r.before
                const good = r.good === 0 ? undefined : up === (r.good > 0)
                return (
                  <div key={r.key} className="chg-row small">
                    <span className="muted">{r.label}</span>
                    <span className="num">{fmtRow(r.fmt, r.before)}</span>
                    <span className={`num ${r.clear ? (good === undefined ? 'chg-clear' : good ? 'chg-good' : 'chg-bad') : ''}`}>{fmtRow(r.fmt, r.after)}{r.clear && <Icon name={up ? 'arrowUp' : 'arrowDown'} size={11} />}</span>
                  </div>
                )
              })}
              {c.notes.map((n) => <div key={n} className="tiny dim chg-note"><Icon name="info" size={12} /> {n}</div>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
