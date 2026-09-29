// The rest of the matchday while a match is live: a Matches tab with every game kicking off at the same time, a compact
// spectator view for any of them (lineups, events, stats, ratings — no controls), and one pinnable picture-in-picture card.
import { useState } from 'react'
import type { Club, World } from '../../domain/types'
import type { MatchSim } from '../../engine/match/engine'
import type { OtherLive } from '../../engine/world/liveDay'
import { haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo } from '../components/atoms'
import { Tabs } from '../components/layout'
import { kitColors, LivePitch, MomentumGraph } from '../components/LivePitch'
import { Ball, MatchLineup, sideFromSim } from '../components/Lineup'
import { PlayerMatchPanel } from '../components/PlayerMatchPanel'
import { compLogoKey } from '../selectors'
import { callName } from '../../engine/match/commentary'
import { clock, FeedItem, isGoal, StatsPanel } from './Match'

const clubsOf = (w: World, sim: MatchSim): [Club, Club] => [w.clubs[sim.home.clubId], w.clubs[sim.away.clubId]]

/** Last scorers per side, compact: "Haaland 23', 67'". */
function scorerLine(w: World, sim: MatchSim, side: 0 | 1) {
  const map = new Map<number, string[]>()
  for (const e of sim.events) {
    if (!isGoal(e) || e.side !== side || !e.player) continue
    const arr = map.get(e.player) || []
    arr.push(`${e.min}'${e.type === 'penGoal' ? ' P' : e.type === 'owngoal' ? ' OG' : ''}`)
    map.set(e.player, arr)
  }
  return [...map.entries()].map(([id, m]) => `${callName(w.players[id]?.name || '')} ${m.join(', ')}`).join(' · ')
}

/** Tiny pitch: where the ball is and who has it. */
export function MiniPitch({ sim, colors }: { sim: MatchSim; colors: [string, string] }) {
  const b = sim.phase === '1H' || sim.phase === '2H' || sim.phase === 'ET1' || sim.phase === 'ET2' ? sim.ballState() : undefined
  const lg = [...sim.events].reverse().find(isGoal)
  const flash = !!lg && !sim.finished && lg.min === sim.minute
  return (
    <svg viewBox="0 0 100 40" className={`mini-pitch ${flash ? 'goal' : ''}`} preserveAspectRatio="none" aria-hidden>
      <rect x="0" y="0" width="100" height="40" rx="3" fill="#1a4630" />
      <g fill="none" stroke="rgba(255,255,255,.35)" strokeWidth=".6">
        <rect x=".5" y=".5" width="99" height="39" rx="2.5" /><path d="M50 0v40" /><circle cx="50" cy="20" r="6" />
        <path d="M0 11h9v18H0M100 11h-9v18h9" />
      </g>
      {b && <circle cx={b.x} cy={b.y * 0.4} r="2.6" fill={colors[b.side]} stroke="#fff" strokeWidth=".9" className="mini-ball" />}
    </svg>
  )
}

function OtherCard({ w, o, onOpen, onPin, pinned }: { w: World; o: OtherLive; onOpen: () => void; onPin: () => void; pinned: boolean }) {
  const f = w.fixtures[o.fixtureId]
  const [h, a] = clubsOf(w, o.sim)
  const colors = kitColors(h, a)
  const s = o.sim.score
  const sc = [scorerLine(w, o.sim, 0), scorerLine(w, o.sim, 1)]
  const live = !o.sim.finished && o.sim.phase !== 'pre'
  return (
    <div className="om-card">
      <button className="om-main" onClick={onOpen}>
        <div className="om-row">
          <span className="om-team"><Badge club={h} size={24} /><span className="ellipsis">{h?.short}</span></span>
          <span className="om-score num">{s[0]}<i>–</i>{s[1]}</span>
          <span className="om-team r"><span className="ellipsis">{a?.short}</span><Badge club={a} size={24} /></span>
        </div>
        <div className="om-meta">
          <span className={`om-clock ${live ? 'live' : ''}`}>{o.sim.phase === 'pre' ? f?.time : clock(o.sim)}</span>
          {(sc[0] || sc[1]) && <span className="om-sc ellipsis"><Ball size={10} /> {[sc[0], sc[1]].filter(Boolean).join('  |  ')}</span>}
        </div>
        <MiniPitch sim={o.sim} colors={colors} />
      </button>
      <button className={`om-pin ${pinned ? 'on' : ''}`} onClick={onPin} aria-label={pinned ? 'Unpin' : 'Pin as mini player'}><Icon name="pip" size={16} /></button>
    </div>
  )
}

/** The Matches tab: grouped by competition, the user's competition first. */
export function MatchesTab({ w, others, compId, pip, onOpen, onPin }: { w: World; others: OtherLive[]; compId: string; pip?: string; onOpen: (id: string) => void; onPin: (id?: string) => void }) {
  const groups = new Map<string, OtherLive[]>()
  for (const o of others) {
    const c = w.fixtures[o.fixtureId]?.compId || ''
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push(o)
  }
  const order = [...groups.keys()].sort((a, b) => (a === compId ? -1 : b === compId ? 1 : 0))
  if (!others.length) return <div className="muted small" style={{ padding: 24, textAlign: 'center' }}>No other matches are being played at the same time.</div>
  return (
    <div className="pad" style={{ paddingTop: 10 }}>
      {order.map((c) => {
        const comp = w.competitions[c]
        return (
          <div key={c} style={{ marginBottom: 12 }}>
            <div className="om-h">{comp && <CompLogo k={compLogoKey(comp)} size={16} name={comp.name} />}<span>{comp?.name}</span><span className="dim">· {w.fixtures[groups.get(c)![0].fixtureId]?.roundName}</span></div>
            <div className="om-grid">
              {groups.get(c)!.map((o) => <OtherCard key={o.fixtureId} w={w} o={o} pinned={pip === o.fixtureId} onOpen={() => { haptic(); onOpen(o.fixtureId) }} onPin={() => { haptic(); onPin(pip === o.fixtureId ? undefined : o.fixtureId) }} />)}
            </div>
          </div>
        )
      })}
      <div className="tiny dim" style={{ textAlign: 'center' }}>Tap a match to watch it. Your match pauses while you look.</div>
    </div>
  )
}

/** Floating mini player for one pinned match. */
export function PipCard({ w, o, onOpen, onClose }: { w: World; o: OtherLive; onOpen: () => void; onClose: () => void }) {
  const [h, a] = clubsOf(w, o.sim)
  const colors = kitColors(h, a)
  const s = o.sim.score
  const lastGoal = [...o.sim.events].reverse().find(isGoal)
  const live = !o.sim.finished && o.sim.phase !== 'pre'
  return (
    <div className="pip">
      <button className="pip-main" onClick={onOpen}>
        <div className="pip-row">
          <Badge club={h} size={18} /><span className="pip-n">{h?.short}</span>
          <span className="pip-s num" key={`${s[0]}-${s[1]}`}>{s[0]}–{s[1]}</span>
          <span className="pip-n r">{a?.short}</span><Badge club={a} size={18} />
        </div>
        <div className="pip-meta"><span className={`om-clock ${live ? 'live' : ''}`}>{clock(o.sim)}</span>{lastGoal?.player && <span className="ellipsis"><Ball size={9} /> {callName(w.players[lastGoal.player]?.name || '')} {lastGoal.min}'</span>}</div>
        <MiniPitch sim={o.sim} colors={colors} />
      </button>
      <button className="pip-x" onClick={onClose} aria-label="Close mini player"><Icon name="close" size={12} strokeWidth={2.6} /></button>
    </div>
  )
}

/** Compact spectator view of another live match. */
export function SpectatorView({ w, o, lead, speed, running, onToggle, onClose, onPip, onPlayer }: {
  w: World; o: OtherLive; lead: MatchSim; speed: number; running: boolean; onToggle: () => void; onClose: () => void; onPip: () => void; onPlayer: (id: number) => void
}) {
  const [tab, setTab] = useState<'feed' | 'lineups' | 'stats'>('feed')
  const [panel, setPanel] = useState<{ side: 0 | 1; id: number }>()
  const sim = o.sim
  const f = w.fixtures[o.fixtureId]
  const [home, away] = clubsOf(w, sim)
  const [lh, la] = clubsOf(w, lead)
  const colors = kitColors(home, away)
  const comp = f ? w.competitions[f.compId] : undefined
  const feed = sim.events.filter((e) => e.text).slice().reverse()
  const goals = sim.events.filter(isGoal).map((e) => ({ key: e.min + (e.add || 0) / 100, side: e.side as 0 | 1 }))
  return (
    <div className="spec match-screen" style={{ ['--home-c' as any]: colors[0], ['--away-c' as any]: colors[1] }}>
      <div className="match-top">
        <div className="row between">
          <button className="spec-back" onClick={onClose}>
            <Icon name="back" size={16} strokeWidth={2.4} />
            <span className="tiny b">Your match</span>
            <Badge club={lh} size={14} /><span className="tiny b num">{lead.score[0]}–{lead.score[1]}</span><Badge club={la} size={14} />
            <span className="tiny dim">{clock(lead)}</span>
          </button>
          <button className="spec-pip tiny b" onClick={onPip}><Icon name="pip" size={14} /> Mini player</button>
        </div>
        <div className="row tight" style={{ justifyContent: 'center', marginTop: 8, gap: 6 }}>{comp && <CompLogo k={compLogoKey(comp)} size={16} name={comp.name} />}<span className="tiny b upper" style={{ opacity: 0.8 }}>{comp?.short} · {f?.roundName} · Spectating</span></div>
        <div className="scoreboard">
          <div className="sb-team"><Badge club={home} size={40} /><div className="sb-name">{home?.short}</div></div>
          <div className="col center" style={{ minWidth: 110 }}>
            <div className="sb-score num" style={{ fontSize: 44 }}><span key={`h${sim.score[0]}`} className="pop">{sim.score[0]}</span><span className="sb-sep">–</span><span key={`a${sim.score[1]}`} className="pop">{sim.score[1]}</span></div>
            <div className={`sb-clock ${running && !sim.finished ? 'live' : ''}`}>{clock(sim)}</div>
          </div>
          <div className="sb-team"><Badge club={away} size={40} /><div className="sb-name">{away?.short}</div></div>
        </div>
        <div className="row between tiny" style={{ padding: '4px 6px 0', alignItems: 'flex-start', minHeight: 14 }}>
          <div className="scorers ellipsis">{scorerLine(w, sim, 0)}</div>
          <div className="scorers r ellipsis">{scorerLine(w, sim, 1)}</div>
        </div>
      </div>
      <div className="lp-wrap"><LivePitch sim={sim} w={w} speed={speed} frameCount={sim.timeline.length} home={home} away={away} /></div>
      <div className="mom-wrap"><MomentumGraph data={sim.timeline.map((x) => [x.m + x.add / 100, x.mom])} goals={goals} colors={colors} live={!sim.finished} /></div>
      <Tabs items={[{ id: 'feed', label: 'Events' }, { id: 'lineups', label: 'Line-ups' }, { id: 'stats', label: 'Stats' }]} value={tab} onChange={setTab} />
      <div className="match-body">
        {tab === 'feed' && <div className="feed">{feed.map((e, i) => <FeedItem key={sim.events.length - i} e={e} w={w} home={home.id} away={away.id} />)}{!feed.length && <div className="muted small" style={{ padding: 20, textAlign: 'center' }}>Kick-off at {f?.time}.</div>}</div>}
        {tab === 'lineups' && (
          <div className="pad" style={{ paddingTop: 12 }}>
            <MatchLineup w={w} home={sideFromSim(w, sim, 0)} away={sideFromSim(w, sim, 1)} onTap={(t) => { haptic(); setPanel({ side: t.side, id: t.id }) }} />
          </div>
        )}
        {tab === 'stats' && <StatsPanel stats={sim.liveStats()} homeId={home.id} awayId={away.id} w={w} />}
      </div>
      <div className="match-controls">
        <div className="row" style={{ gap: 8 }}>
          <button className="ctl-btn big" onClick={onToggle} aria-label={running ? 'Pause' : 'Play'} disabled={lead.finished && sim.finished}><Icon name={running ? 'pause' : 'play'} size={24} /></button>
          <button className="btn grow" style={{ height: 48 }} onClick={onClose}><Icon name="back" size={16} /> Back to your match</button>
        </div>
      </div>
      {panel && <PlayerMatchPanel w={w} st={sim.playerStats(panel.side, panel.id)} club={panel.side === 0 ? home : away} events={sim.events} live={!sim.finished} onClose={() => setPanel(undefined)} onProfile={() => { const id = panel.id; setPanel(undefined); onPlayer(id) }} />}
    </div>
  )
}
