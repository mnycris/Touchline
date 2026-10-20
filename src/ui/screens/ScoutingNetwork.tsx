// The scouting network: who your scouts are, what each of them is doing and how far along, what they have found, and
// where in the world you are looking. Every number is one you act on: who is idle, who reports when, what it costs.
import { useState } from 'react'
import type { Scout, World } from '../../domain/types'
import { useGame, useWorld, haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Avatar, Badge, Face, Flag, Ovr, PosChip, Stars } from '../components/atoms'
import { Confirm, Screen, Seg, Sheet, Stepper } from '../components/layout'
import { fmtMoney } from '../../domain/finance'
import { addDays, diffDays, fmtDate } from '../../domain/dates'
import { fireScout, knowledge, potRange, reportDays, scoutNetwork, SCOUT_SLOTS } from '../../engine/world/scouting'
import { ageOf } from '../selectors'
import { HireSheet } from './Transfers'

const REGIONS = ['Anywhere', 'England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Brazil', 'Argentina', 'Scandinavia', 'Eastern Europe', 'Africa', 'South America', 'Rest of World']
const REGION_FLAG: Record<string, string | undefined> = { England: 'England', Spain: 'Spain', Germany: 'Germany', Italy: 'Italy', France: 'France', Portugal: 'Portugal', Netherlands: 'Netherlands', Belgium: 'Belgium', Brazil: 'Brazil', Argentina: 'Argentina' }
const POS_OPTS = ['Any', 'GK', 'CB', 'FB', 'CDM', 'CM', 'CAM', 'W', 'ST', 'DEF', 'MID', 'ATT']
const FOCUS: { id: string; label: string; sub: string }[] = [
  { id: 'Balanced', label: 'Balanced', sub: 'A bit of everything' },
  { id: 'High Potential', label: 'Potential', sub: 'Who could become very good' },
  { id: 'Ready Now', label: 'Ready now', sub: 'Who could play for you today' },
  { id: 'Bargain', label: 'Bargains', sub: 'Good value for the money' },
]
const ordinalDays = (d: number) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)

/** How quickly he works, in words a manager would use. */
const pace = (s: Pick<Scout, 'experience' | 'judgement'>) => { const d = reportDays(s); return d <= 6 ? 'Very quick' : d <= 9 ? 'Quick' : d <= 13 ? 'Steady' : 'Slow' }

export function Scouting() {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [assign, setAssign] = useState<number>()
  const [hire, setHire] = useState(false)
  const [replacing, setReplacing] = useState<number>()
  const [releasing, setReleasing] = useState<number>()
  const [how, setHow] = useState(false)
  const [cfg, setCfg] = useState({ region: 'Anywhere', position: 'Any', ageMax: 23, focus: 'High Potential', months: 2 })
  const working = w.scouts.filter((s) => s.assignment)
  const idle = w.scouts.length - working.length
  const found = working.reduce((a, s) => a + (s.assignment?.kind === 'network' ? s.assignment.foundIds.length : 0), 0)
  const wages = w.scouts.reduce((a, s) => a + s.wage, 0)
  // where the network is looking right now
  const cover = new Map<string, Scout[]>()
  for (const s of working) { const r = s.assignment!.kind === 'player' ? 'Players' : s.assignment!.region || 'Anywhere'; cover.set(r, [...(cover.get(r) || []), s]) }
  const target = assign != null ? w.scouts.find((s) => s.id === assign) : undefined
  return (
    <Screen title="Scouting Network" sub={`${w.scouts.length} of ${SCOUT_SLOTS} scouts`} back right={<button className="iconbtn" aria-label="How scouting works" onClick={() => { haptic(); setHow(true) }}><Icon name="info" size={19} /></button>}>
      <div className="pad stack">
        <div className="sn-sum">
          <div><b className="display">{working.length}</b><span className="tiny dim">working</span></div>
          <div className={idle ? 'warn' : ''}><b className="display">{idle}</b><span className="tiny dim">idle</span></div>
          <div><b className="display">{found}</b><span className="tiny dim">found</span></div>
          <div><b className="display">{fmtMoney(wages, { short: true })}</b><span className="tiny dim">a week</span></div>
        </div>
        {cover.size > 0 && (
          <div className="sn-cover">
            <span className="tiny dim">Looking in</span>
            {[...cover.entries()].map(([r, list]) => (
              <span key={r} className="sn-reg">{REGION_FLAG[r] ? <Flag w={w} nation={REGION_FLAG[r]} size={10} /> : <Icon name={r === 'Players' ? 'person' : 'globe'} size={12} />}{r === 'Players' ? 'Single players' : r}{list.length > 1 && <b>×{list.length}</b>}</span>
            ))}
          </div>
        )}
        {w.scouts.map((s, i) => <ScoutCard key={s.id} w={w} s={s} i={i} onAssign={() => { haptic(); const a = s.assignment; if (a?.kind === 'network') setCfg({ region: a.region || 'Anywhere', position: a.position || 'Any', ageMax: a.ageMax || 23, focus: a.focus || 'Balanced', months: Math.max(1, Math.round(a.duration / 30)) }); setAssign(s.id) }} onReplace={() => { haptic(); setReplacing(s.id) }} onRelease={() => { haptic(); setReleasing(s.id) }} />)}
        {w.scouts.length < SCOUT_SLOTS ? <button className="btn block" onClick={() => setHire(true)}><Icon name="plus" size={18} /> Hire a scout ({w.scouts.length}/{SCOUT_SLOTS})</button> : <div className="tiny dim" style={{ textAlign: 'center' }}>All {SCOUT_SLOTS} places are taken: replace a scout to bring someone new in.</div>}
      </div>
      <Sheet open={assign !== undefined} onClose={() => setAssign(undefined)} title={target ? `Send ${target.name.split(' ')[0]} out` : 'Scouting instructions'}>
        <div className="stack" style={{ gap: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Where</div>
            <div className="row wrap" style={{ gap: 6 }}>{REGIONS.map((r) => <button key={r} className={`chip sm ${cfg.region === r ? 'on' : ''}`} onClick={() => { haptic(); setCfg({ ...cfg, region: r }) }}>{REGION_FLAG[r] && <Flag w={w} nation={REGION_FLAG[r]} size={10} />}{r}</button>)}</div>
            {target && <div className="tiny dim" style={{ marginTop: 6 }}>{target.name.split(' ')[0]} is from {target.nationality}: he works faster on players from there.</div>}
          </div>
          <div><div className="label" style={{ marginBottom: 6 }}>Position</div><div className="row wrap" style={{ gap: 6 }}>{POS_OPTS.map((p) => <button key={p} className={`chip sm ${cfg.position === p ? 'on' : ''}`} onClick={() => { haptic(); setCfg({ ...cfg, position: p }) }}>{p === 'Any' ? 'Any position' : p}</button>)}</div></div>
          <div className="ed-line"><span className="small">Aged up to</span><Stepper value={cfg.ageMax} min={17} max={35} onChange={(v) => setCfg({ ...cfg, ageMax: v })} /></div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Looking for</div>
            <div className="sn-focus">{FOCUS.map((f) => <button key={f.id} className={cfg.focus === f.id ? 'on' : ''} onClick={() => { haptic(); setCfg({ ...cfg, focus: f.id }) }}><b className="small">{f.label}</b><span className="tiny dim">{f.sub}</span></button>)}</div>
          </div>
          <div><div className="label" style={{ marginBottom: 6 }}>For</div><Seg small items={[1, 2, 3, 6].map((m) => ({ id: m, label: `${m} month${m > 1 ? 's' : ''}` }))} value={cfg.months} onChange={(v) => setCfg({ ...cfg, months: v })} /></div>
          <div className="tiny dim">He reports every few days with the players who match, until {fmtDate(addDays(w.date, cfg.months * 30), 'long')}.</div>
          <button className="btn primary block" onClick={() => { mutate((x) => scoutNetwork(x, assign!, cfg.region, cfg.position, cfg.ageMax, cfg.focus, cfg.months)); notify(`${target?.name || 'Scout'} sent: ${cfg.region}`, 'ok'); setAssign(undefined) }}><Icon name="globe" size={16} /> Send him</button>
        </div>
      </Sheet>
      <Sheet open={how} onClose={() => setHow(false)} title="How scouting works">
        <div className="stack small" style={{ gap: 10 }}>
          <div><b>Send a scout to a region</b> with a brief (position, age, what you are after) and he reports every few days with players who match, until his mission ends.</div>
          <div><b>Or send him to watch one player</b> from that player's page: he builds a full report, attributes, PlayStyles and true potential.</div>
          <div><b>Experience</b> sets how fast he works, <b>judgement</b> how sharp his reads are, and he is quicker on players from the country he knows.</div>
          <div className="muted">The best-known players need little scouting; an unknown teenager abroad needs a lot.</div>
        </div>
      </Sheet>
      <HireSheet open={hire || replacing != null} onClose={() => { setHire(false); setReplacing(undefined) }} youth={false} replacing={replacing} />
      <Confirm open={releasing != null} title={`Release ${w.scouts.find((x) => x.id === releasing)?.name || 'scout'}?`} text={`His contract is paid off with four weeks' wages (${fmtMoney((w.scouts.find((x) => x.id === releasing)?.wage || 0) * 4)}); what he has found stays known.`} confirm="Release" danger onConfirm={() => { mutate((x) => fireScout(x, releasing!, false)); notify('Scout released', 'ok'); setReleasing(undefined) }} onClose={() => setReleasing(undefined)} />
    </Screen>
  )
}

function ScoutCard({ w, s, i, onAssign, onReplace, onRelease }: { w: World; s: Scout; i: number; onAssign: () => void; onReplace: () => void; onRelease: () => void }) {
  const go = useGame((st) => st.go)
  const [all, setAll] = useState(false)
  const a = s.assignment
  const found = a?.kind === 'network' ? a.foundIds.map((id) => w.players[id]).filter(Boolean).reverse() : []
  const p = a?.kind === 'player' && a.playerId ? w.players[a.playerId] : undefined
  const ends = a?.kind === 'network' ? addDays(a.started, a.duration) : undefined
  const daysIn = a ? diffDays(w.date, a.started) : 0
  // a single player: knowledge left to gain at his rate
  const left = p ? Math.max(0, Math.ceil((100 - knowledge(w, p)) / ((4 + s.experience * 2.2) * (w.clubs[p.clubId]?.country === s.nationality || p.nation === s.nationality ? 1.5 : 1) * (1 + s.judgement * 0.05)))) : 0
  return (
    <div className={`card sn-card ${a ? 'on' : 'idle'}`} style={{ animationDelay: `${i * 40}ms` }}>
      <div className="sn-head">
        <span className="sn-av"><Avatar name={s.name} size={46} /><span className="sn-nat"><Flag w={w} nation={s.nationality} size={10} /></span></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="b ellipsis">{s.name}</div>
          <div className="tiny dim">{s.nationality} · {fmtMoney(s.wage, { short: true })}/wk</div>
          <div className="sn-skills tiny">
            <span><span className="dim">Speed</span><Stars n={s.experience} size={10} /></span>
            <span><span className="dim">Eye</span><Stars n={s.judgement} size={10} /></span>
          </div>
        </div>
        <button className={`btn xs ${a ? '' : 'club'}`} onClick={onAssign}>{a ? 'Change' : 'Send out'}</button>
      </div>
      {!a && <div className="sn-idle tiny"><Icon name="clock" size={13} /> Idle: send him to a region, or to watch a player from their page.</div>}
      {a?.kind === 'network' && (
        <div className="sn-job">
          <div className="row between" style={{ gap: 8 }}>
            <span className="row tight small b" style={{ minWidth: 0 }}>{REGION_FLAG[a.region || ''] ? <Flag w={w} nation={REGION_FLAG[a.region || '']} size={11} /> : <Icon name="globe" size={13} />}<span className="ellipsis">{a.region}</span></span>
            <span className="tiny dim">{ends && w.date < ends ? `until ${fmtDate(ends, 'dm')}` : 'finishing'}</span>
          </div>
          <div className="sn-brief tiny">{[a.position && a.position !== 'Any' ? a.position : 'Any position', `under ${(a.ageMax || 23) + 1}`, a.focus && a.focus !== 'Balanced' ? FOCUS.find((f) => f.id === a.focus)?.label.toLowerCase() : 'balanced'].map((t) => <span key={t}>{t}</span>)}</div>
          <div className="sn-prog"><i style={{ width: `${a.progress}%` }} /></div>
          <div className="tiny dim">Day {Math.max(1, daysIn)} of {a.duration} · {found.length ? `${found.length} found so far` : 'nobody yet: he reports every few days'}</div>
          {found.length > 0 && (
            <div className="sn-found">
              {(all ? found : found.slice(0, 4)).map((x) => {
                const [lo, hi] = potRange(w, x)
                return (
                  <button key={x.id} className="sn-p" onClick={() => { haptic(); go({ name: 'player', params: { id: x.id } }) }}>
                    <Face p={x} size={36} radius={18} club={w.clubs[x.clubId]} />
                    <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                      <span className="small b ellipsis" style={{ display: 'block' }}>{x.name}</span>
                      <span className="tiny dim row tight"><Badge club={w.clubs[x.clubId]} size={12} /><span className="ellipsis">{w.clubs[x.clubId]?.short || 'Free agent'} · {ageOf(w, x)} · {knowledge(w, x)}% known</span></span>
                    </span>
                    <PosChip pos={x.positions[0]} />
                    <span className="col" style={{ alignItems: 'center' }}><Ovr v={x.ovr} size="sm" /><span className="tiny gold num">{lo === hi ? lo : `${lo}-${hi}`}</span></span>
                  </button>
                )
              })}
              {found.length > 4 && <button className="link sn-more" onClick={() => { haptic(); setAll(!all) }}>{all ? 'Show fewer' : `Show all ${found.length}`}</button>}
            </div>
          )}
        </div>
      )}
      {a?.kind === 'player' && p && (
        <button className="sn-job sn-watch" onClick={() => { haptic(); go({ name: 'player', params: { id: p.id } }) }}>
          <Face p={p} size={40} radius={20} club={w.clubs[p.clubId]} />
          <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
            <span className="tiny dim">Watching</span>
            <span className="small b ellipsis" style={{ display: 'block' }}>{p.name} · {w.clubs[p.clubId]?.short || 'Free agent'}</span>
            <span className="sn-prog" style={{ marginTop: 6 }}><i style={{ width: `${Math.round(a.progress)}%` }} /></span>
            <span className="tiny dim" style={{ display: 'block', marginTop: 4 }}>{Math.round(a.progress)}% known · full report {ordinalDays(left)}</span>
          </span>
        </button>
      )}
      <div className="sn-foot">
        <span className="tiny dim row tight" title={pace(s)}><Icon name="clock" size={12} />~{reportDays(s)} days per full report</span>
        <span className="grow" />
        <button className="btn xs ghost" onClick={onReplace}><Icon name="swap" size={13} /> Replace</button>
        <button className="btn xs ghost" onClick={onRelease}>Release</button>
      </div>
    </div>
  )
}
