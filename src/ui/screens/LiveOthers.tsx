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
import { kitColors, kitVars, LivePitch, MomentumGraph } from '../components/LivePitch'
import { Ball, MatchLineup, sideFromSim } from '../components/Lineup'
import { PlayerMatchPanel } from '../components/PlayerMatchPanel'
import { compLogoKey } from '../selectors'
import { PitchSurface } from '../components/PitchSurface'
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
    <PitchSurface className={`mini-pitch ${flash ? 'goal' : ''}`} pad={4} thin
      field={b && <span className="mini-ball" style={{ left: `${Math.max(4, Math.min(96, b.x))}%`, top: `${Math.max(6, Math.min(94, b.y))}%`, background: colors[b.side] }} />} />
  )
}

const reds = (sim: MatchSim, side: 0 | 1) => sim.events.filter((e) => e.side === side && (e.type === 'red' || e.type === 'secondYellow')).length

function OtherRow({ w, o, onOpen, onPin, pinned }: { w: World; o: OtherLive; onOpen: () => void; onPin: () => void; pinned: boolean }) {
  const f = w.fixtures[o.fixtureId]
  const [h, a] = clubsOf(w, o.sim)
  const colors = kitColors(h, a)
  const s = o.sim.score
  const sc = [scorerLine(w, o.sim, 0), scorerLine(w, o.sim, 1)].filter(Boolean)
  const live = !o.sim.finished && o.sim.phase !== 'pre'
  const lead = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1
  const team = (c: Club, side: 0 | 1) => (
    <span className={`om-t ${o.sim.finished && lead === 1 - side ? 'lost' : ''}`}>
      <Badge club={c} size={18} /><span className="ellipsis">{c?.short}</span>
      {Array.from({ length: reds(o.sim, side) }, (_, i) => <i key={i} className="om-red" />)}
      <b className="num">{o.sim.phase === 'pre' ? '' : s[side]}</b>
    </span>
  )
  return (
    <div className="om-item">
      <button className="om-main" onClick={onOpen}>
        <span className={`om-clock ${live ? 'live' : ''}`}>{o.sim.phase === 'pre' ? f?.time : clock(o.sim)}</span>
        <span className="om-teams">
          {team(h, 0)}{team(a, 1)}
          {sc.length > 0 && <span className="om-sc"><Ball size={9} /><span className="ellipsis">{sc.join(' · ')}</span></span>}
        </span>
        <MiniPitch sim={o.sim} colors={colors} />
      </button>
      <button className={`om-pin ${pinned ? 'on' : ''}`} onClick={onPin} aria-label={pinned ? 'Unpin' : 'Pin as mini player'}><Icon name="pip" size={15} /></button>
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
          <div key={c} className="om-group">
            <div className="om-h">{comp && <CompLogo k={compLogoKey(comp)} size={18} name={comp.name} />}<span className="ellipsis">{comp?.name}</span><span className="dim ellipsis">{w.fixtures[groups.get(c)![0].fixtureId]?.roundName}</span></div>
            {groups.get(c)!.map((o) => <OtherRow key={o.fixtureId} w={w} o={o} pinned={pip === o.fixtureId} onOpen={() => { haptic(); onOpen(o.fixtureId) }} onPin={() => { haptic(); onPin(pip === o.fixtureId ? undefined : o.fixtureId) }} />)}
          </div>
        )
      })}
      <div className="tiny dim" style={{ textAlign: 'center', marginTop: 4 }}>Tap a match to watch it · <Icon name="pip" size={11} /> keeps it in a mini player. Your match pauses while you look.</div>
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
        <MiniPitch sim={o.sim} colors={colors} />
        <span className="pip-info">
          <span className="pip-t"><Badge club={h} size={15} /><span className="pip-n">{h?.short}</span><b className="num" key={`h${s[0]}`}>{s[0]}</b></span>
          <span className="pip-t"><Badge club={a} size={15} /><span className="pip-n">{a?.short}</span><b className="num" key={`a${s[1]}`}>{s[1]}</b></span>
          <span className="pip-meta"><span className={`om-clock ${live ? 'live' : ''}`}>{clock(o.sim)}</span>{lastGoal?.player && <span className="ellipsis"><Ball size={9} /> {callName(w.players[lastGoal.player]?.name || '')} {lastGoal.min}'</span>}</span>
        </span>
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
    <div className="spec match-screen" style={kitVars(colors)}>
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
