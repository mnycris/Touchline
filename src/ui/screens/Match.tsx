import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DEFAULT_SPEEDS, useGame, useWorld, haptic } from '../../store/game'
import { fmtSpeed } from '../components/SpeedEditor'
import type { Fixture, MatchEvent, MatchResult, Player, TeamMatchStats, TeamTactics, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, Ovr } from '../components/atoms'
import { Screen, Seg, Sheet, Tabs } from '../components/layout'
import { Pitch } from '../components/Pitch'
import { FORMATIONS, formationOf, MENTALITIES } from '../../domain/constants'
import { fmtDate } from '../../domain/dates'
import type { MatchSim } from '../../engine/match/engine'
import { compLogoKey, outcomeFor, scoreLine } from '../selectors'
import { callName } from '../../engine/match/commentary'
import { posRating } from '../../domain/ratings'
import { Ball, BenchRowFM, Boot, Boots, MatchLineup, MissedPen, RatingPill, ratingColor, sideFromResult, sideFromSim, TeamLineup, type LineupTap } from '../components/Lineup'
import { kitColors, kitVars, LivePitch, MomentumGraph } from '../components/LivePitch'
import { PlayerMatchPanel } from '../components/PlayerMatchPanel'
import { underWhite } from '../theme'
import { ScriptEditor } from '../components/ScriptEditor'
import { TacticsBoard } from '../components/TacticsBoard'
import { syncOthers } from '../../engine/world/liveDay'
import { MatchesTab, PipCard, SpectatorView } from './LiveOthers'
import { CardMoment, KickMoment, MOMENT_MS, PenaltyMoment, type Moment, type MomentKind } from '../components/MatchMoments'
import { useRemember } from '../memory'

// ============================================================================ helpers
const EVENT_ICON: Record<string, [string, string]> = {
  goal: ['ball', '#fff'], penGoal: ['ball', '#fff'], owngoal: ['ball', 'var(--neg)'], penMiss: ['close', 'var(--neg)'], yellow: ['yellow', '#F5D33F'],
  red: ['red', 'var(--neg)'], secondYellow: ['red', 'var(--neg)'], sub: ['sub', 'var(--acc)'], injury: ['injury', 'var(--neg)'], save: ['glove', 'var(--info)'],
  chance: ['target', 'var(--t2)'], miss: ['target', 'var(--t3)'], woodwork: ['goal', 'var(--warn)'], corner: ['corner', 'var(--t3)'], freekick: ['whistle', 'var(--t3)'],
  offside: ['flag', 'var(--t3)'], foul: ['whistle', 'var(--t3)'], var: ['var', 'var(--info)'], tactic: ['tactics', 'var(--t2)'], ht: ['whistle', '#fff'], ft: ['whistle', '#fff'],
  kickoff: ['whistle', '#fff'], info: ['info', 'var(--t3)'], et: ['clock', '#fff'], pens: ['ball', '#fff'], shootout: ['ball', '#fff'], penalty: ['target', 'var(--warn)'],
}
const KEY_EVENTS = new Set(['goal', 'penGoal', 'owngoal', 'penMiss', 'red', 'secondYellow', 'yellow', 'injury', 'sub', 'var', 'woodwork', 'ht', 'ft', 'pens', 'et', 'penalty'])
export const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal'
const minLabel = (e: MatchEvent) => `${e.min}${e.add ? `+${e.add}` : ''}'`

export function clock(sim: MatchSim) {
  if (sim.phase === 'pre') return "0'"
  if (sim.phase === 'HT') return 'HT'
  if (sim.phase === 'FT') return 'FT'
  if (sim.phase === 'ETHT') return 'ET HT'
  if (sim.phase === 'PENS') return 'PENS'
  return `${sim.minute}${sim.added ? `+${sim.added}` : ''}'`
}

function goalScorers(w: World, r: Pick<MatchResult, 'events'>, side: 0 | 1) {
  const map = new Map<number, string[]>()
  for (const e of r.events) {
    if (!isGoal(e) || e.side !== side) continue
    const id = e.player!
    const arr = map.get(id) || []
    arr.push(`${minLabel(e)}${e.type === 'penGoal' ? ' (P)' : e.type === 'owngoal' ? ' (OG)' : ''}`)
    map.set(id, arr)
  }
  return [...map.entries()].map(([id, mins]) => `${callName(w.players[id]?.name || '')} ${mins.join(', ')}`)
}

export function FixtureRow({ w, f, clubId }: { w: World; f: Fixture; clubId?: number }) {
  const go = useGame((s) => s.go)
  const [sheet, setSheet] = useState(false)
  const comp = w.competitions[f.compId]
  const o = clubId ? outcomeFor(f, clubId) : undefined
  const watching = w.flags.watch === f.id
  return (
    <>
      <button className="li tap fixture-row" style={{ width: '100%' }} onClick={() => { if (f.played) go({ name: 'fixture', params: { id: f.id } }); else { haptic(); setSheet(true) } }}>
        <div className="col" style={{ width: 44, alignItems: 'center', gap: 2 }}>
          {comp && <CompLogo k={compLogoKey(comp)} size={18} name={comp.name} />}
          <span className="tiny dim">{fmtDate(f.date, 'dm')}</span>
        </div>
        <div className="grow row" style={{ gap: 6, minWidth: 0 }}>
          <span className="grow ellipsis small b" style={{ textAlign: 'right' }}>{w.clubs[f.home]?.short}</span>
          <Badge club={w.clubs[f.home]} size={20} />
          <span className={`score-pill sm ${o || ''}`}>{f.played ? scoreLine(f) : f.time}</span>
          <Badge club={w.clubs[f.away]} size={20} />
          <span className="grow ellipsis small b">{w.clubs[f.away]?.short}</span>
        </div>
        {watching && <Icon name="eye" size={14} color="var(--acc)" />}
        {(w.scripts?.[f.id] || f.edited) && <Icon name="edit" size={13} color="var(--gold)" />}
      </button>
      {sheet && <FixtureSheet w={w} f={f} onClose={() => setSheet(false)} />}
    </>
  )
}

/** An upcoming fixture: watch it live (today, or stop the calendar on its day) or open either club. */
function FixtureSheet({ w, f, onClose }: { w: World; f: Fixture; onClose: () => void }) {
  const go = useGame((s) => s.go)
  const watch = useGame((s) => s.watchFixture)
  const live = useGame((s) => s.live)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const comp = w.competitions[f.compId]
  const today = f.date === w.date
  const watching = w.flags.watch === f.id
  const canWatch = !f.userInvolved && !f.played && f.date >= w.date && !live
  const [scripting, setScripting] = useState(false)
  if (scripting) return <ScriptEditor w={w} f={f} onClose={() => { setScripting(false); onClose() }} />
  return (
    <Sheet open onClose={onClose}>
      <div className="row tight" style={{ justifyContent: 'center', gap: 6 }}>{comp && <CompLogo k={compLogoKey(comp)} size={18} name={comp.name} />}<span className="tiny b upper dim">{comp?.short} · {f.roundName}</span></div>
      <div className="md-teams" style={{ marginTop: 10 }}>
        <button className="md-team" onClick={() => { onClose(); go({ name: 'club', params: { id: home.id } }) }}><Badge club={home} size={52} /><b>{home.short}</b></button>
        <div className="col center" style={{ minWidth: 90 }}><div className="display" style={{ fontSize: 26 }}>{f.time}</div><div className="tiny dim">{today ? 'Today' : fmtDate(f.date, 'long')}</div></div>
        <button className="md-team" onClick={() => { onClose(); go({ name: 'club', params: { id: away.id } }) }}><Badge club={away} size={52} /><b>{away.short}</b></button>
      </div>
      {canWatch && (
        today ? (
          <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => { onClose(); watch(f.id) }}><Icon name="eye" size={18} /> Watch live</button>
        ) : watching ? (
          <button className="btn block" style={{ marginTop: 14 }} onClick={() => { haptic(); w.flags.watch = undefined; force(); useGame.getState().notify('No longer watching this match', 'info') }}><Icon name="check" size={18} color="var(--acc)" /> Watching · tap to cancel</button>
        ) : (
          <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => { watch(f.id); force() }}><Icon name="eye" size={18} /> Watch this match</button>
        )
      )}
      {canWatch && <div className="tiny dim" style={{ textAlign: 'center', marginTop: 8 }}>{today ? 'You watch as a spectator: no team controls. The other games kicking off at the same time run alongside it.' : `Continue will stop on ${fmtDate(f.date, 'long')} so you can watch it live.`}</div>}
      {f.userInvolved && <div className="tiny dim" style={{ textAlign: 'center', marginTop: 12 }}>Your own match. Play it from Match Day.</div>}
      {w.meta.editMode && !f.played && (
        <button className="btn block ed-open" style={{ marginTop: 12 }} onClick={() => { haptic('medium'); useGame.getState().notify('Edit match', 'edit'); setScripting(true) }}>
          <Icon name="edit" size={17} /> {w.scripts?.[f.id] ? 'Edit match script' : 'Edit match'}
        </button>
      )}
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn grow" onClick={() => { onClose(); go({ name: 'club', params: { id: home.id } }) }}><Badge club={home} size={16} /> {home.short}</button>
        <button className="btn grow" onClick={() => { onClose(); go({ name: 'club', params: { id: away.id } }) }}><Badge club={away} size={16} /> {away.short}</button>
      </div>
    </Sheet>
  )
}

// ============================================================================ live match centre
export function LiveMatch() {
  const w = useWorld()
  const live = useGame((s) => s.live)
  const setLive = useGame((s) => s.setLive)
  const finish = useGame((s) => s.finishUserMatch)
  const finishWatched = useGame((s) => s.finishWatched)
  const closeAll = useGame((s) => s.closeAll)
  const open = useGame((s) => s.open)
  const go = useGame((s) => s.go)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState<'feed' | 'lineups' | 'stats' | 'matches'>('feed')
  const [spectate, setSpectate] = useState<string>()
  const [elsewhere, setElsewhere] = useState<{ id: number; text: string }>()
  const spectateRef = useRef<string | undefined>(undefined)
  spectateRef.current = spectate
  const [manage, setManage] = useState(false)
  const [manageOut, setManageOut] = useState<number>()
  const [moments, setMoments] = useState<Moment[]>([])
  const [panel, setPanel] = useState<{ side: 0 | 1; id: number }>()
  const moment = moments[0]
  const momentId = useRef(0)
  const [pitchOpen, setPitchOpen] = useState(() => { try { return localStorage.getItem('opus:pitch') !== '0' } catch { return true } })
  const [reveal, setReveal] = useState<number>(-1)
  const timer = useRef<number>(undefined)
  const seekRef = useRef<'event' | 'ht' | null>(null)
  const fastRef = useRef(false)

  const sim = live?.sim
  const f = live ? w.fixtures[live.fixtureId] : undefined
  const us: 0 | 1 = f ? (f.home === w.userClubId ? 0 : 1) : 0
  const spectator = !!live?.spectator
  const others = live?.others || []

  const running = !!live?.running && !manage && !moment
  const speed = live?.speed || 1
  const speeds = useGame((s) => s.prefs.speeds) || DEFAULT_SPEEDS

  // main clock: 1 real second per match minute at 1×
  useEffect(() => {
    if (!sim || !running || sim.finished) return
    const interval = seekRef.current ? 40 : 1000 / speed
    timer.current = window.setInterval(() => tick(), interval)
    return () => window.clearInterval(timer.current)
  }, [sim, running, speed, seekRef.current])

  // goals, cards and penalties stop the clock for a moment, FotMob-style — one after another when they come together
  const nextMoment = () => setMoments((q) => q.slice(1))
  useEffect(() => {
    if (!moment) return
    const t = window.setTimeout(nextMoment, MOMENT_MS[moment.kind])
    return () => window.clearTimeout(t)
  }, [moment?.id])

  const tick = () => {
    if (!sim || !live) return
    const before = sim.phase
    const evs = sim.step()
    const oev = syncOthers(sim, live.others)
    // goals elsewhere: a short ticker under the scoreboard (and the mini player flashes)
    if (!fastRef.current) {
      const g = [...oev].reverse().find((x) => isGoal(x.e))
      if (g) {
        const of = w.fixtures[g.fixtureId], o = live.others?.find((x) => x.fixtureId === g.fixtureId)
        if (of && o) setElsewhere({ id: Date.now(), text: `${g.e.min}' ${callName(w.players[g.e.player || 0]?.name || '')} · ${w.clubs[of.home]?.short} ${o.sim.score[0]}–${o.sim.score[1]} ${w.clubs[of.away]?.short}` })
      }
    }
    if (!fastRef.current && spectateRef.current) {
      // watching another game: your own match's goals and red cards arrive as a banner instead of stopping the clock
      const big = evs.find((e) => isGoal(e) || e.type === 'red' || e.type === 'secondYellow')
      if (big) {
        haptic('medium')
        useGame.getState().notify(`Your match: ${isGoal(big) ? 'GOAL' : 'Red card'} ${big.min}' ${callName(w.players[big.player || 0]?.name || '')} · ${w.clubs[f!.home]?.short} ${sim.score[0]}–${sim.score[1]} ${w.clubs[f!.away]?.short}`, isGoal(big) && big.side === us ? 'ok' : 'info')
      }
    } else if (!fastRef.current) {
      const add: Moment[] = []
      const mk = (kind: MomentKind, e: MatchEvent) => add.push({ kind, e, id: ++momentId.current })
      for (const e of evs) {
        if (e.type === 'penalty') mk('penalty', e)
        else if (e.type === 'yellow') mk('yellow', e)
        else if (e.type === 'red' || e.type === 'secondYellow') mk('red', e)
        else if (e.type === 'penGoal') { mk('kick', e); mk('goal', e) }
        else if (e.type === 'penMiss') mk('kick', e)
        else if (isGoal(e)) mk('goal', e)
      }
      if (add.length) {
        setMoments((q) => [...q, ...add])
        haptic(add.some((m) => m.kind === 'goal') ? 'heavy' : 'medium')
        if (seekRef.current) seekRef.current = null
      }
    }
    const pauseFor = () => { live.running = false; seekRef.current = null }
    if (!spectator && sim.injuredWaiting.some((x) => x.side === us)) { pauseFor(); setSpectate(undefined); setManage(true) }
    else if (spectator && sim.injuredWaiting.length) sim.autoResolveInjuries()
    if (sim.phase === 'HT' && before !== 'HT') pauseFor()
    if (sim.phase === 'ETHT' && before !== 'ETHT') pauseFor()
    if (sim.phase === 'PENS' && before !== 'PENS') pauseFor()
    if (sim.finished) {
      live.running = false
      seekRef.current = null
      if (sim.pens) setReveal(0)
    }
    if (seekRef.current === 'event' && evs.some((e) => KEY_EVENTS.has(e.type) || e.big)) seekRef.current = null
    force()
  }

  useEffect(() => {
    if (!elsewhere) return
    const t = window.setTimeout(() => setElsewhere(undefined), 6500)
    return () => window.clearTimeout(t)
  }, [elsewhere?.id])

  // shoot-out reveal, one kick at a time
  const shootout = sim ? sim.events.filter((e) => e.type === 'shootout') : []
  useEffect(() => {
    if (reveal < 0 || reveal >= shootout.length) return
    const t = window.setTimeout(() => { haptic(); setReveal(reveal + 1) }, 1300 / speed)
    return () => window.clearTimeout(t)
  }, [reveal, shootout.length])

  if (!sim || !f || !live) {
    return <Screen title="Match" back onBack={() => closeAll()} noNav><div className="pad muted">No live match.</div></Screen>
  }

  const home = w.clubs[f.home], away = w.clubs[f.away]
  const comp = w.competitions[f.compId]
  const stats = sim.liveStats()
  const agg = sim.ctx.aggregate
  const colors = kitColors(home, away)
  const penDone = !sim.pens || reveal >= shootout.length
  const visibleShoot = sim.pens ? shootout.slice(0, Math.max(0, reveal)) : []
  const penScore: [number, number] = [visibleShoot.filter((e) => e.side === 0 && /scores/.test(e.text)).length, visibleShoot.filter((e) => e.side === 1 && /scores/.test(e.text)).length]
  const hidePens = (e: MatchEvent) => sim.pens && !penDone && (e.type === 'shootout' || e.type === 'ft')

  const setRunning = (v: boolean) => { live.running = v; force() }
  const togglePlay = () => {
    haptic()
    if (sim.finished) return
    if (moment) { setMoments([]); return }
    if (sim.phase === 'HT' || sim.phase === 'ETHT' || sim.phase === 'PENS') { tick(); live.running = true; force(); return }
    setRunning(!live.running)
  }
  const setSpeed = (s: number) => { live.speed = s; force() }
  const nextEvent = () => { haptic(); setMoments([]); if (sim.phase === 'HT' || sim.phase === 'ETHT') tick(); seekRef.current = 'event'; live.running = true; force() }
  const toHT = () => {
    haptic()
    setMoments([])
    fastRef.current = true
    let guard = 0
    const stopAt = sim.phase === '1H' || sim.phase === 'pre' ? 'HT' : null
    while (!sim.finished && guard++ < 200) {
      if (!spectator && sim.injuredWaiting.some((x) => x.side === us)) break
      tick()
      if (stopAt && sim.phase === 'HT') break
      if (!stopAt && (sim.phase === 'ETHT' || sim.phase === 'PENS' || sim.phase === 'FT')) break
    }
    fastRef.current = false
    live.running = false
    force()
  }
  const simToEnd = () => {
    haptic('medium')
    setMoments([])
    sim.ctx.assistantSubs = true
    let guard = 0
    while (!sim.finished && guard++ < 400) {
      if (sim.injuredWaiting.length) sim.autoResolveInjuries()
      sim.step()
    }
    syncOthers(sim, live.others)
    live.running = false
    if (sim.pens) setReveal(shootout.length + 99)
    force()
  }
  const complete = () => {
    haptic('medium')
    const result = sim.result()
    syncOthers(sim, live.others)
    if (spectator) finishWatched(f.id, result, live.others)
    else finish(f.id, result, live.others)
    setLive(undefined)
    closeAll()
    open({ name: spectator ? 'fixture' : 'postmatch', params: { id: f.id } })
  }
  const togglePitch = () => { const v = !pitchOpen; setPitchOpen(v); try { localStorage.setItem('opus:pitch', v ? '1' : '0') } catch { /* private mode */ } }

  const feed = sim.events.filter((e) => e.text && !hidePens(e)).slice().reverse()
  const brk = sim.phase === 'HT' || sim.phase === 'ETHT'
  const scoreNow = sim.score
  const goalsForGraph = sim.events.filter(isGoal).map((e) => ({ key: e.min + (e.add || 0) / 100, side: e.side as 0 | 1 }))

  const onLineupTap = (t: LineupTap) => { haptic(); setPanel({ side: t.side, id: t.id }) }
  const markViewed = (id: string) => { if (!live.viewed?.includes(id)) live.viewed = [...(live.viewed || []), id] }
  const openOther = (id: string) => { live.running = false; setMoments([]); markViewed(id); setSpectate(id); force() }
  const setPip = (id?: string) => { live.pip = id; if (id) markViewed(id); force() }
  const specO = spectate ? others.find((o) => o.fixtureId === spectate) : undefined
  const pipO = live.pip && !spectate ? others.find((o) => o.fixtureId === live.pip) : undefined

  return (
    <div className="match-screen" style={kitVars(colors)}>
      <div className="match-top">
        <div className="row between" style={{ padding: '0 4px' }}>
          <div className="row tight">{comp && <CompLogo k={compLogoKey(comp)} size={18} name={comp.name} />}<span className="tiny b upper" style={{ opacity: 0.8 }}>{comp?.short} · {f.roundName}{spectator ? ' · Spectating' : ''}</span></div>
          <button className="tiny dim row tight" onClick={togglePitch}><Icon name="pitch" size={14} /> {pitchOpen ? 'Hide pitch' : 'Show pitch'}</button>
        </div>
        <div className="scoreboard">
          <div className="sb-team"><Badge club={home} size={44} /><div className="sb-name">{home.short}</div></div>
          <div className="col center" style={{ minWidth: 118 }}>
            <div className="sb-score num"><span key={`h${scoreNow[0]}`} className="pop">{scoreNow[0]}</span><span className="sb-sep">–</span><span key={`a${scoreNow[1]}`} className="pop">{scoreNow[1]}</span></div>
            <div className={`sb-clock ${live.running && !sim.finished && !moment ? 'live' : ''}`}>{clock(sim)}</div>
            {sim.pens && reveal >= 0 && <div className="tiny b" style={{ marginTop: 3 }}>Pens {penScore[0]}–{penScore[1]}</div>}
            {agg && <div className="tiny dim" style={{ marginTop: 2 }}>Agg {sim.score[0] + agg[0]}–{sim.score[1] + agg[1]}</div>}
          </div>
          <div className="sb-team"><Badge club={away} size={44} /><div className="sb-name">{away.short}</div></div>
        </div>
        <div className="row between tiny" style={{ padding: '0 6px', minHeight: 14, alignItems: 'flex-start' }}>
          <div className="scorers">{goalScorers(w, sim, 0).map((s) => <div key={s} className="ellipsis">{s}</div>)}</div>
          <div className="scorers r">{goalScorers(w, sim, 1).map((s) => <div key={s} className="ellipsis">{s}</div>)}</div>
        </div>
        {elsewhere && <button key={elsewhere.id} className="elsewhere tiny" onClick={() => { haptic(); setTab('matches') }}><Ball size={10} /><span className="dim">Elsewhere</span><span className="ellipsis b">{elsewhere.text}</span></button>}
      </div>

      {pitchOpen && (
        <div className="lp-wrap">
          <LivePitch sim={sim} w={w} speed={speed} frameCount={sim.timeline.length} home={home} away={away} />
          {moment && <MomentView m={moment} w={w} sim={sim} onClose={nextMoment} />}
        </div>
      )}
      <div className="mom-wrap">
        <MomentumGraph data={sim.timeline.map((x) => [x.m + x.add / 100, x.mom])} goals={goalsForGraph} colors={colors} live={!sim.finished} et={sim.phase.startsWith('ET') || sim.timeline.some((x) => x.m > 90)} />
      </div>

      <Tabs items={[{ id: 'feed', label: 'Live' }, { id: 'lineups', label: 'Line-ups' }, { id: 'stats', label: 'Stats' }, ...(others.length ? [{ id: 'matches' as const, label: `Matches (${others.length})` }] : [])]} value={tab} onChange={setTab} />

      <div className="match-body">
        {!pitchOpen && moment && <div style={{ position: 'relative', height: moment.kind === 'kick' ? 310 : 150 }}><MomentView m={moment} w={w} sim={sim} onClose={nextMoment} /></div>}
        {brk && !spectator && (
          <div className="card pad-card" style={{ margin: '12px 16px 0', textAlign: 'center' }}>
            <div className="kicker">{sim.phase === 'HT' ? 'Half-time' : 'Extra-time break'}</div>
            <div className="muted small" style={{ marginTop: 6 }}>Make changes now. Substitutions at the break don't use a window.</div>
            <HalfTimeFacts sim={sim} home={home.short} away={away.short} />
            <AssistantNotes sim={sim} w={w} side={us} onManage={(id) => { haptic(); setManageOut(id); setManage(true) }} />
          </div>
        )}
        {tab === 'feed' && (
          <div className="feed">
            {feed.map((e, i) => <FeedItem key={sim.events.length - i} e={e} w={w} home={home.id} away={away.id} />)}
            {!feed.length && <div className="muted small" style={{ padding: 20, textAlign: 'center' }}>{sim.ctx.derby ? `${sim.ctx.derby} · ` : ''}{sim.ctx.attendance.toLocaleString()} expected at {sim.ctx.venue}. Press play to kick off.</div>}
          </div>
        )}
        {tab === 'lineups' && (
          <div className="pad" style={{ paddingTop: 12 }}>
            <MatchLineup w={w} home={sideFromSim(w, sim, 0)} away={sideFromSim(w, sim, 1)} onTap={onLineupTap} />
            <div className="tiny dim" style={{ textAlign: 'center', marginTop: 8 }}>Live ratings. Tap any player for match stats and heat map.</div>
          </div>
        )}
        {tab === 'stats' && <StatsPanel stats={stats} homeId={home.id} awayId={away.id} w={w} />}
        {tab === 'matches' && <MatchesTab w={w} others={others} compId={f.compId} pip={live.pip} onOpen={openOther} onPin={setPip} />}
      </div>

      {panel && (
        <PlayerMatchPanel w={w} st={sim.playerStats(panel.side, panel.id)} club={panel.side === 0 ? home : away} events={sim.events} live={!sim.finished}
          onClose={() => setPanel(undefined)} onProfile={() => { setPanel(undefined); go({ name: 'player', params: { id: panel.id } }) }}
          actions={!spectator && panel.side === us && !sim.finished && sim.onPitchIds(us).includes(panel.id) ? (
            <button className="pmp-pill primary" onClick={() => { haptic(); setPanel(undefined); setManageOut(panel.id); setManage(true) }}><Icon name="sub" size={15} /> Substitute</button>
          ) : undefined} />
      )}
      <div className="match-controls">
        {sim.finished && penDone ? (
          <button className="btn primary block" style={{ height: 54 }} onClick={complete}><Icon name="check" size={20} /> Full-time · Continue</button>
        ) : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button className="ctl-btn big" onClick={togglePlay} aria-label={live.running ? 'Pause' : 'Play'} disabled={sim.finished}>
                <Icon name={live.running && !brk && !moment ? 'pause' : 'play'} size={26} />
              </button>
              <div className="seg grow" style={{ height: 48 }}>
                {speeds.map((s, i) => <button key={i} className={speed === s ? 'on' : ''} style={{ height: 40 }} onClick={() => setSpeed(s)}>{fmtSpeed(s)}</button>)}
              </div>
              {!spectator && (
                <button className="ctl-btn manage" onClick={() => { haptic(); setManageOut(undefined); setManage(true) }} disabled={sim.finished}>
                  <Icon name="tactics" size={22} /><span>Manage</span>
                </button>
              )}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn sm grow" onClick={nextEvent} disabled={sim.finished}><Icon name="skip" size={16} /> Next event</button>
              <button className="btn sm grow" onClick={toHT} disabled={sim.finished}><Icon name="ffwd" size={16} /> {sim.phase === '1H' || sim.phase === 'pre' ? 'To half-time' : 'Next break'}</button>
              <button className="btn sm grow" onClick={simToEnd} disabled={sim.finished}><Icon name="whistle" size={16} /> Sim to end</button>
            </div>
          </>
        )}
      </div>

      {pipO && <PipCard w={w} o={pipO} onOpen={() => openOther(pipO.fixtureId)} onClose={() => setPip(undefined)} />}
      {specO && (
        <SpectatorView w={w} o={specO} lead={sim} speed={speed} running={!!live.running && !sim.finished}
          onToggle={() => { haptic(); if (sim.phase === 'HT' || sim.phase === 'ETHT' || sim.phase === 'PENS') tick(); live.running = !live.running && !sim.finished; force() }}
          onClose={() => { haptic(); setSpectate(undefined) }} onPip={() => { haptic(); setPip(specO.fixtureId); setSpectate(undefined) }}
          onPlayer={(id) => { setSpectate(undefined); go({ name: 'player', params: { id } }) }} />
      )}
      {!spectator && <ManageSheet open={manage} initialOut={manageOut} onClose={() => { setManage(false); setManageOut(undefined); force() }} sim={sim} side={us} w={w} />}
    </div>
  )
}

function HalfTimeFacts({ sim, home, away }: { sim: MatchSim; home: string; away: string }) {
  const s = sim.liveStats()
  const rows: [string, string, string][] = [
    ['Possession', `${s[0].possession}%`, `${s[1].possession}%`], ['xG', s[0].xg.toFixed(2), s[1].xg.toFixed(2)], ['Shots', String(s[0].shots), String(s[1].shots)],
  ]
  return (
    <div style={{ marginTop: 10 }}>
      <div className="row between tiny dim"><span>{home}</span><span>{away}</span></div>
      {rows.map(([l, a, b]) => <div key={l} className="row between small" style={{ marginTop: 4 }}><b className="num">{a}</b><span className="muted">{l}</span><b className="num">{b}</b></div>)}
    </div>
  )
}

/** Assistant manager's read of the game at a break: what the numbers and the players' legs are saying. */
function AssistantNotes({ sim, w, side, onManage }: { sim: MatchSim; w: World; side: 0 | 1; onManage: (playerId?: number) => void }) {
  const st = sim.liveStats()
  const me = st[side], them = st[1 - side]
  const gf = sim.score[side], ga = sim.score[1 - side]
  const agg = sim.ctx.aggregate
  const aggDiff = agg ? (side === 0 ? agg[0] - agg[1] : agg[1] - agg[0]) : 0
  const lead = gf - ga + aggDiff
  const t = sim.sideTactics(side)
  const rs = sim.liveRatings(side).filter((r) => r.on)
  const notes: { icon: string; text: string; id?: number; tone: 'good' | 'bad' | 'neutral' }[] = []
  const tired = rs.filter((r) => r.pos !== 'GK' && r.energy < 66).sort((a, b) => a.energy - b.energy)[0]
  if (tired) notes.push({ icon: 'fitness', tone: 'bad', id: tired.id, text: `${callName(w.players[tired.id].name)} is running on empty (${Math.round(tired.energy)}%). Fresh legs would help.` })
  const booked = rs.find((r) => r.yellow && ['CB', 'LB', 'RB', 'CDM', 'LWB', 'RWB'].includes(r.pos))
  if (booked) notes.push({ icon: 'yellow', tone: 'bad', id: booked.id, text: `${callName(w.players[booked.id].name)} is on a yellow. One more rash challenge and we're down to ten.` })
  const poor = rs.filter((r) => r.rating < 6.0).sort((a, b) => a.rating - b.rating)[0]
  if (poor && poor.id !== tired?.id) notes.push({ icon: 'formDown', tone: 'bad', id: poor.id, text: `${callName(w.players[poor.id].name)} is struggling (${poor.rating.toFixed(1)}). Think about a change or a role tweak.` })
  if (them.xg > me.xg + 0.5) notes.push({ icon: 'warning', tone: 'bad', text: `They're creating the better chances (xG ${them.xg.toFixed(2)} v ${me.xg.toFixed(2)}). A deeper line or a holding midfielder would tighten us up.` })
  else if (me.xg > them.xg + 0.5 && lead <= 0) notes.push({ icon: 'target', tone: 'good', text: `We're the better side on chances (xG ${me.xg.toFixed(2)}). Keep going, the goal will come.` })
  if (me.possession < 40 && t.buildUp !== 'Counter') notes.push({ icon: 'pitch', tone: 'neutral', text: `Only ${me.possession}% of the ball. Either press higher or commit to a counter-attacking plan.` })
  if (lead < 0) notes.push({ icon: 'ffwd', tone: 'neutral', text: `We need ${-lead === 1 ? 'a goal' : `${-lead} goals`}. More attacking mentality or an extra forward could turn it.` })
  if (lead >= 2 && t.mentality !== 'Defensive') notes.push({ icon: 'shield', tone: 'good', text: 'Comfortable lead. We can manage the game and protect legs for the next fixture.' })
  if (!notes.length) notes.push({ icon: 'check', tone: 'good', text: 'The plan is working. No need to change much.' })
  return (
    <div className="asst">
      <div className="label" style={{ margin: '12px 0 6px', textAlign: 'left' }}>Assistant's notes</div>
      {notes.slice(0, 3).map((n, i) => (
        <button key={i} className={`asst-note ${n.tone}`} onClick={() => onManage(n.id)}>
          <Icon name={n.icon} size={16} /><span className="grow small" style={{ textAlign: 'left' }}>{n.text}</span><Icon name="forward" size={14} />
        </button>
      ))}
    </div>
  )
}

/** Routes a queued moment to its popup. */
function MomentView({ m, w, sim, onClose }: { m: Moment; w: World; sim: MatchSim; onClose: () => void }) {
  const side = (m.e.side ?? 0) as 0 | 1
  const club = w.clubs[side === 0 ? sim.home.clubId : sim.away.clubId]
  const other = w.clubs[side === 0 ? sim.away.clubId : sim.home.clubId]
  if (m.kind === 'goal') return <GoalCard key={m.id} e={m.e} w={w} sim={sim} onClose={onClose} />
  if (m.kind === 'penalty') return <PenaltyMoment key={m.id} m={m} w={w} victimClub={club} foulerClub={other} onClose={onClose} />
  if (m.kind === 'kick') return <KickMoment key={m.id} m={m} w={w} takerClub={club} keeperClub={other} onClose={onClose} />
  const reds = sim.events.filter((e) => e.side === side && (e.type === 'red' || e.type === 'secondYellow') && e.min + (e.add || 0) / 100 <= m.e.min + (m.e.add || 0) / 100).length
  return <CardMoment key={m.id} m={m} w={w} club={club} reds={reds} onClose={onClose} />
}

/** FotMob-style goal card: the clock stops, scorer photo, assist, minute and the updated score. */
function GoalCard({ e, w, sim, onClose }: { e: MatchEvent; w: World; sim: MatchSim; onClose: () => void }) {
  const goal = isGoal(e)
  const p = e.player ? w.players[e.player] : undefined
  const a = e.player2 && goal ? w.players[e.player2] : undefined
  const clubId = e.side === 0 ? sim.home.clubId : sim.away.clubId
  const club = w.clubs[clubId]
  const score = e.score || sim.score
  const kind = goal ? (e.type === 'owngoal' ? 'Own goal' : e.type === 'penGoal' ? 'Penalty goal' : 'Goal') : e.type === 'penMiss' ? 'Penalty missed' : 'Red card'
  const reds = sim.events.filter((x) => (x.type === 'red' || x.type === 'secondYellow') && x.side === e.side).length
  return (
    <button className={`goal-card ${goal ? 'is-goal' : 'is-red'}`} style={{ ['--gc' as any]: club ? underWhite(club.kit?.[0]) : '#1fd67a' }} onClick={onClose}>
      <div className="gc-top">
        <Badge club={club} size={22} />
        <span className="gc-word">{kind}</span>
        <span className="gc-min">{minLabel(e)}</span>
      </div>
      <div className="gc-body">
        {p && <div className="gc-face"><Face p={p} size={64} radius={32} club={e.type === 'owngoal' ? w.clubs[p.clubId] : club} />{goal && <Ball size={22} className="gc-ball" />}{!goal && e.type !== 'penMiss' && <span className="gc-redcard" />}</div>}
        <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <div className="gc-name ellipsis">{p?.name}</div>
          <div className="gc-sub ellipsis">{a ? `Assist: ${a.name}` : goal ? (e.type === 'penGoal' ? 'From the spot' : e.type === 'owngoal' ? `For ${club?.short}` : 'Unassisted') : e.type === 'penMiss' ? 'Chance gone' : `${club?.short} down to ${11 - reds} men`}{e.xg && goal ? ` · xG ${e.xg.toFixed(2)}` : ''}</div>
          {goal && (
            <div className="gc-score">
              <Badge club={w.clubs[sim.home.clubId]} size={18} />
              <span className={e.side === 0 ? 'hit' : ''}>{score[0]}</span><span className="dim">–</span><span className={e.side === 1 ? 'hit' : ''}>{score[1]}</span>
              <Badge club={w.clubs[sim.away.clubId]} size={18} />
            </div>
          )}
        </div>
      </div>
      <span className="gc-timer" style={{ animationDuration: `${MOMENT_MS.goal}ms` }} />
    </button>
  )
}

/** Feed rows with hierarchy: goals, then big moments (penalty, red, VAR, missed pen), then notable events
 *  (yellow, injury, sub, woodwork), then plain commentary; kick-off, half-time and full-time are dividers. */
const MOMENT_TITLE: Record<string, [string, string]> = {
  penalty: ['Penalty', 'var(--warn)'], red: ['Red card', '#ff4d5e'], secondYellow: ['Second yellow · Red card', '#ff4d5e'], penMiss: ['Penalty missed', '#ff4d5e'], var: ['VAR check', 'var(--info)'],
}
const NOTE_TITLE: Record<string, [string, string]> = {
  yellow: ['Yellow card', '#f5d33f'], injury: ['Injury', '#ff4d5e'], sub: ['Substitution', 'var(--acc)'], woodwork: ['Off the woodwork', 'var(--warn)'],
}
export function FeedItem({ e, w, home, away }: { e: MatchEvent; w: World; home: number; away: number }) {
  const [ic, col] = EVENT_ICON[e.type] || ['info', 'var(--t3)']
  const key = isGoal(e)
  const club = e.side === 0 ? w.clubs[home] : e.side === 1 ? w.clubs[away] : undefined
  const p = e.player ? w.players[e.player] : undefined
  const p2 = e.player2 ? w.players[e.player2] : undefined
  if (e.type === 'kickoff' || e.type === 'ht' || e.type === 'ft' || e.type === 'et' || e.type === 'pens') {
    const label = e.type === 'ht' ? 'Half-time' : e.type === 'ft' ? 'Full-time' : e.type === 'et' ? 'Extra time' : e.type === 'pens' ? 'Penalties' : e.min > 1 ? 'Second half' : 'Kick-off'
    return (
      <div className="feed-div fade-up">
        <span className="feed-div-l" /><span className="feed-div-t">{label}{e.score && e.type !== 'kickoff' ? ` · ${e.score[0]}–${e.score[1]}` : ''}</span><span className="feed-div-l" />
        {e.text && <div className="feed-div-s tiny dim">{e.text}</div>}
      </div>
    )
  }
  if (key) {
    return (
      <div className="feed-item goal big fade-up" style={club ? { ['--gc' as any]: underWhite(club.kit?.[0]) } : undefined}>
        <div className="feed-min">{minLabel(e)}</div>
        <div className="feed-ic"><Ball size={18} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row tight" style={{ marginBottom: 4 }}>{club && <Badge club={club} size={18} />}<span className="display" style={{ fontSize: 18 }}>{e.type === 'owngoal' ? 'Own goal' : e.type === 'penGoal' ? 'Penalty goal' : 'Goal'}{e.score ? ` · ${e.score[0]}–${e.score[1]}` : ''}</span></div>
          <div className="b" style={{ color: 'var(--t1)' }}>{e.text}</div>
          {p && (p2 || e.xg) ? <div className="tiny dim row tight" style={{ marginTop: 3, gap: 4 }}>{p2 && e.type !== 'owngoal' && <><Boot size={13} /><span>{p2.name}</span></>}{e.xg ? <span>{p2 && e.type !== 'owngoal' ? ' · ' : ''}xG {e.xg.toFixed(2)}</span> : null}</div> : null}
        </div>
        {p && club && <Face p={p} size={38} radius={19} club={e.type === 'owngoal' ? w.clubs[p.clubId] : club} />}
      </div>
    )
  }
  const moment = MOMENT_TITLE[e.type]
  if (moment) {
    return (
      <div className="feed-item big moment fade-up" style={{ ['--mc' as any]: moment[1] }}>
        <div className="feed-min">{minLabel(e)}</div>
        <div className="feed-ic">{e.type === 'red' || e.type === 'secondYellow' ? <span className="feed-card r" /> : e.type === 'penMiss' ? <MissedPen size={16} /> : <Icon name={ic} size={17} color={moment[1]} />}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row tight" style={{ marginBottom: 3 }}>{club && <Badge club={club} size={15} />}<span className="feed-mt" style={{ color: moment[1] }}>{moment[0]}</span></div>
          <div className="small" style={{ color: 'var(--t1)' }}>{e.text}</div>
        </div>
        {p && club && <Face p={p} size={32} radius={16} club={club} />}
      </div>
    )
  }
  const note = NOTE_TITLE[e.type]
  if (note) {
    return (
      <div className="feed-item note fade-up" style={{ ['--mc' as any]: note[1] }}>
        <div className="feed-min">{minLabel(e)}</div>
        <div className="feed-ic">{e.type === 'yellow' ? <span className="feed-card y" /> : <Icon name={ic} size={16} color={col} />}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          {e.type === 'sub' && p ? (
            <div className="small">
              <div className="row tight" style={{ gap: 5 }}><Icon name="arrowUp" size={12} color="var(--pos)" strokeWidth={3} /><b>{p.name}</b></div>
              {p2 && <div className="row tight dim" style={{ gap: 5, marginTop: 2 }}><Icon name="arrowDown" size={12} color="var(--neg)" strokeWidth={3} /><span>{p2.name}</span></div>}
            </div>
          ) : (
            <div className="small" style={{ color: 'var(--t1)' }}>{e.text}</div>
          )}
        </div>
        {club && <Badge club={club} size={18} />}
      </div>
    )
  }
  return (
    <div className="feed-item fade-up">
      <div className="feed-min">{minLabel(e)}</div>
      <div className="feed-ic" style={{ color: col }}><Icon name={ic} size={16} /></div>
      <div className="grow small" style={{ minWidth: 0, color: 'var(--t2)' }}>{e.text}</div>
    </div>
  )
}

export function StatsPanel({ stats, homeId, awayId, w }: { stats: [TeamMatchStats, TeamMatchStats]; homeId: number; awayId: number; w: World }) {
  const rows: [string, keyof TeamMatchStats, (v: number) => string, boolean][] = [
    ['Expected goals (xG)', 'xg', (v) => v.toFixed(2), true], ['Total shots', 'shots', String, true], ['Shots on target', 'sot', String, true],
    ['Big chances', 'bigChances', String, true], ['Passes', 'passes', String, true], ['Pass accuracy', 'passAcc', (v) => `${v}%`, true], ['Corners', 'corners', String, true],
    ['Keeper saves', 'saves', String, true], ['Fouls committed', 'fouls', String, false], ['Offsides', 'offsides', String, false], ['Yellow cards', 'yellows', String, false], ['Red cards', 'reds', String, false],
  ]
  const [a0, b0] = [stats[0].possession, stats[1].possession]
  return (
    <div className="pad" style={{ paddingTop: 12 }}>
      <div className="card pad-card">
        <div className="row between" style={{ marginBottom: 8 }}><Badge club={w.clubs[homeId]} size={22} /><span className="label">Ball possession</span><Badge club={w.clubs[awayId]} size={22} /></div>
        <div className="poss-bar"><i style={{ flex: a0, background: 'var(--home-c)' }}><b>{a0}%</b></i><i style={{ flex: b0, background: 'var(--away-c)' }}><b>{b0}%</b></i></div>
        <div style={{ marginTop: 10 }}>
          {rows.map(([label, k, fmt, higher]) => {
            const a = stats[0][k] as number, b = stats[1][k] as number
            const aw = higher ? a > b : a < b, bw = higher ? b > a : b < a
            return (
              <div key={k} className="cmp-row">
                <span className={`cmp-v ${aw ? 'on h' : ''}`}>{fmt(a)}</span>
                <span className="small muted">{label}</span>
                <span className={`cmp-v ${bw ? 'on a' : ''}`}>{fmt(b)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function RatingBadge({ v, motm }: { v: number; motm?: boolean }) {
  return <span className="rating-badge num" style={{ background: motm ? '#2f80ed' : ratingColor(v), color: '#fff' }}>{motm && <Icon name="star" size={10} />}{v.toFixed(1)}</span>
}

// ---------------------------------------------------------------------------- manage sheet
function ManageSheet({ open, onClose, sim, side, w, initialOut }: { open: boolean; onClose: () => void; sim: MatchSim; side: 0 | 1; w: World; initialOut?: number }) {
  const [tab, setTab] = useState<'subs' | 'tactics' | 'formation'>('subs')
  const [out, setOut] = useState<number>()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const waiting = sim.injuredWaiting.filter((x) => x.side === side).map((x) => x.lp.p.id)
  useEffect(() => { if (open && waiting.length) { setTab('subs'); setOut(waiting[0]) } }, [open, waiting.join(',')])
  useEffect(() => { if (open && initialOut) { setTab('subs'); setOut(initialOut) } }, [open, initialOut])
  const t = sim.sideTactics(side)
  const setT = (p: Partial<TeamTactics>) => { sim.setTactics(side, p); force() }
  // what the tactics were when the sheet opened: the board explains the difference
  const [base, setBase] = useState<TeamTactics>()
  useEffect(() => { if (open) setBase({ ...sim.sideTactics(side) }) }, [open])
  const ratings = sim.liveRatings(side)
  const onIds = sim.onPitchIds(side)
  const bench = sim.benchIds(side)
  const clubId = side === 0 ? sim.home.clubId : sim.away.clubId
  const club = w.clubs[clubId]
  const r = (id: number) => ratings.find((x) => x.id === id)
  const outR = out ? r(out) : undefined
  const lineup = sideFromSim(w, sim, side)
  const doSub = (inId: number) => {
    if (!out) return
    const ok = sim.substitute(side, out, inId, waiting.includes(out) ? 'injury' : 'tactical')
    if (ok) { haptic('medium'); useGame.getState().notify(`${callName(w.players[inId].name)} on for ${callName(w.players[out].name)}`, 'ok'); setOut(undefined) } else useGame.getState().notify('No substitutions or windows left', 'err')
    force()
  }
  // a slot nobody on the pitch occupies (after a red card, or after moving someone out of it)
  const vacantSlot = (slot?: number) => slot != null && !onIds.some((id) => sim.slotOf(side, id) === slot)
  const onPitchTap = (tp: LineupTap) => {
    haptic()
    if (vacantSlot(tp.slot)) {
      if (!out) { useGame.getState().notify('Tap a player first, then the empty position', 'info'); return }
      if (sim.moveToSlot(side, out, tp.slot!)) {
        useGame.getState().notify(`${callName(w.players[out].name)} moves to ${curForm.slots[tp.slot!]?.label || 'the gap'}`, 'ok')
        setOut(undefined)
        force()
      }
      return
    }
    if (!tp.id || !onIds.includes(tp.id)) return
    if (!out) { setOut(tp.id); return }
    if (out === tp.id) { if (!waiting.includes(out)) setOut(undefined); return }
    // two players on the pitch: swap their positions
    if (sim.swapPositions(side, out, tp.id)) {
      useGame.getState().notify(`${callName(w.players[out].name)} ⇄ ${callName(w.players[tp.id].name)}`, 'ok')
      setOut(undefined)
      force()
    }
  }
  const curForm = formationOf(sim.sideFormation(side))
  const benchSorted = [...bench].sort((a, b) => (outR ? posRating(w.players[b], outR.pos) - posRating(w.players[a], outR.pos) : w.players[b].ovr - w.players[a].ovr))
  return (
    <Sheet open={open} onClose={() => { if (waiting.length && sim.canSub(side) && bench.length) { useGame.getState().notify('Replace the injured player first', 'err'); return } ; if (waiting.length) sim.autoResolveInjuries(); onClose() }} title="Manage Team">
      <Seg items={[{ id: 'subs', label: `Subs (${sim.subsLeft(side)})` }, { id: 'tactics', label: 'Tactics' }, { id: 'formation', label: 'Shape' }]} value={tab} onChange={setTab} />
      {tab === 'subs' && (
        <div style={{ marginTop: 12 }}>
          {waiting.length > 0 && <div className="card pad-card small" style={{ background: 'rgba(255,77,94,.1)', marginBottom: 10 }}><b className="neg">Injury:</b> {waiting.map((id) => w.players[id]?.name).join(', ')} can't continue. Choose a replacement.</div>}
          <TeamLineup w={w} side={lineup} onTap={onPitchTap} sel={out} mode="live" energy />
          <div className="label" style={{ margin: '12px 0 6px', textTransform: 'none', letterSpacing: 0 }}>{out ? <>Bring on for <b style={{ color: 'var(--t1)' }}>{callName(w.players[out].name)}</b> <span className="dim">({outR?.pos} · {Math.round(outR?.energy || 0)}% energy)</span>{lineup.xi.some((x, i) => vacantSlot(i) && (!x || x.red)) ? <span className="dim"> · or tap the empty position</span> : null}</> : lineup.xi.some((x, i) => vacantSlot(i) && (!x || x.red)) ? 'Tap a player, then a substitute, a team-mate to swap with, or the empty position to fill it.' : 'Tap a player on the pitch, then a substitute. Tap two players to swap their positions.'}</div>
          <div className="card list">
            {benchSorted.map((id) => {
              const p = w.players[id]
              const fit = outR ? posRating(p, outR.pos) : p.ovr
              return (
                <BenchRowFM key={id} w={w} s={{ id, pos: p.positions.join(' / ') }} club={club} onTap={out ? () => doSub(id) : undefined}
                  right={<div className="col" style={{ alignItems: 'flex-end' }}><Ovr v={fit} size="sm" /><span className="tiny dim">{outR ? `at ${outR.pos}` : `${Math.round(p.fitness)}%`}</span></div>} />
              )
            })}
            {!bench.length && <div className="li muted small">No substitutes available.</div>}
          </div>
          {!sim.canSub(side) && <div className="tiny warn" style={{ marginTop: 8 }}>All substitution windows used.</div>}
        </div>
      )}
      {tab === 'tactics' && (
        <div style={{ marginTop: 12 }}>
          <TacticsBoard t={t} onChange={setT} base={base} game={{ score: sim.score, side, minute: sim.minute, reds: [0, 1].map((x) => sim.events.filter((e) => e.side === x && (e.type === 'red' || e.type === 'secondYellow')).length) as [number, number] }} />
        </div>
      )}
      {tab === 'formation' && (
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>Current: {curForm.name}</div>
          <div className="row wrap" style={{ gap: 7 }}>
            {FORMATIONS.map((fm) => (
              <button key={fm.id} className={`chip ${fm.id === curForm.id ? 'on' : ''}`} onClick={() => {
                const players = onIds.map((id) => w.players[id]).filter(Boolean)
                sim.setFormation(side, fm.id, assignToFormation(players, fm.id))
                haptic('medium'); force()
              }}>{fm.name}</button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pitch formation={curForm} compact render={(i) => {
              const id = onIds[i]
              const p = w.players[id]
              if (!p) return null
              return <><Face p={p} size={30} radius={15} club={club} /><div className="slot-name">{callName(p.name)}</div></>
            }} />
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** Best assignment of the players on the pitch to the slots of a new formation. */
export function assignToFormation(players: Player[], formationId: string): number[] {
  const f = formationOf(formationId)
  const left = [...players]
  const out: number[] = new Array(f.slots.length).fill(0)
  const order = f.slots.map((_, i) => i).sort((a, b) => (f.slots[a].pos === 'GK' ? -1 : 0) - (f.slots[b].pos === 'GK' ? -1 : 0))
  for (const i of order) {
    let best = -1, bs = -1e9
    left.forEach((p, k) => {
      if ((f.slots[i].pos === 'GK') !== (p.positions[0] === 'GK') && left.some((q) => (f.slots[i].pos === 'GK') === (q.positions[0] === 'GK'))) return
      const s = posRating(p, f.slots[i].pos)
      if (s > bs) { bs = s; best = k }
    })
    if (best >= 0) { out[i] = left[best].id; left.splice(best, 1) }
  }
  return out.filter(Boolean)
}

// ============================================================================ post-match & match report
export function PostMatch({ params }: { params: { id: string } }) {
  const w = useWorld()
  const closeAll = useGame((s) => s.closeAll)
  const open = useGame((s) => s.open)
  const f = w.fixtures[params.id]
  const others = useMemo(() => f ? Object.values(w.fixtures).filter((x) => x.date === f.date && x.compId === f.compId && x.id !== f.id && x.played) : [], [params.id, w.date])
  if (!f?.result) return <Screen title="Result" back onBack={closeAll} noNav><div className="pad muted">Result not available.</div></Screen>
  const press = !w.flags.pressDone?.[`post:${f.id}`]
  return (
    <Screen title="Full-time" back onBack={closeAll} noNav
      footer={<div className="md-footer">{press && <button className="btn" onClick={() => open({ name: 'press', params: { kind: 'post', fixtureId: f.id } })}><Icon name="chat" size={18} /> Press</button>}<button className="btn primary grow" onClick={() => closeAll()}><Icon name="check" size={18} /> Continue</button></div>}>
      <MatchReportBody w={w} f={f} />
      {others.length > 0 && (
        <>
          <div className="section-title"><div className="h3">Other results</div></div>
          <div className="pad"><div className="card list">{others.map((x) => <FixtureRow key={x.id} w={w} f={x} />)}</div></div>
        </>
      )}
    </Screen>
  )
}

export function FixtureReport({ params }: { params: { id: string } }) {
  const w = useWorld()
  const f = w.fixtures[params.id]
  const comp = f ? w.competitions[f.compId] : undefined
  return (
    <Screen title="Match Report" sub={comp ? `${comp.short} · ${f.roundName}` : ''} back>
      {f?.result ? <MatchReportBody w={w} f={f} /> : <div className="pad muted">This match hasn't been played yet.</div>}
    </Screen>
  )
}

/** "2 [ball] 1 [boot] · 90'": goals and assists as icons, FotMob-style. */
export function GoalsAssists({ st, mins = true }: { st: { goals: number; assists: number; mins: number }; mins?: boolean }) {
  return (
    <div className="ga-line tiny dim">
      {st.goals > 0 && <span className="ga"><b>{st.goals}</b><Ball size={12} /></span>}
      {st.assists > 0 && <span className="ga"><Boots n={st.assists} size={14} /></span>}
      {mins && <span>{st.mins}'</span>}
    </div>
  )
}

function MatchReportBody({ w, f }: { w: World; f: Fixture }) {
  const go = useGame((s) => s.go)
  const r = f.result!
  const hasLineups = !!r.lineups && r.players.length > 0
  const [tab, setTab] = useRemember<'summary' | 'lineups' | 'stats'>('reportTab', 'summary')
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const comp = w.competitions[f.compId]
  const colors = kitColors(home, away)
  const motm = r.motm ? w.players[r.motm] : undefined
  const motmStat = r.players.find((x) => x.id === r.motm)
  const keyEv = r.events.filter((e) => ['goal', 'penGoal', 'owngoal', 'penMiss', 'red', 'secondYellow', 'yellow', 'sub', 'injury'].includes(e.type))
  const hs = hasLineups ? sideFromResult(w, f, 0) : undefined, as = hasLineups ? sideFromResult(w, f, 1) : undefined
  const [panel, setPanel] = useState<LineupTap>()
  const panelSt = panel ? r.players.find((x) => x.id === panel.id && x.side === panel.side) : undefined
  return (
    <div style={kitVars(colors)}>
      <div className="md-head">
        <div className="row tight" style={{ justifyContent: 'center', gap: 8 }}>{comp && <CompLogo k={compLogoKey(comp)} size={20} name={comp.name} />}<span className="tiny b upper" style={{ opacity: 0.8 }}>{comp?.short} · {f.roundName}</span></div>
        <div className="md-teams">
          <button className="md-team" onClick={() => go({ name: 'club', params: { id: home.id } })}><Badge club={home} size={58} /><b>{home.short}</b></button>
          <div className="col center" style={{ minWidth: 100 }}>
            <div className="display num" style={{ fontSize: 46, lineHeight: 1 }}>{r.score[0]} – {r.score[1]}</div>
            <div className="tiny dim" style={{ marginTop: 4 }}>{r.pens ? `${r.pens[0]}–${r.pens[1]} on penalties` : r.et ? 'After extra time' : `Full-time · HT ${r.ht[0]}–${r.ht[1]}`}</div>
            {f.edited && <div className="tiny row tight" style={{ marginTop: 4, color: 'var(--gold)', justifyContent: 'center' }}><Icon name="edit" size={11} /> Edited match</div>}
          </div>
          <button className="md-team" onClick={() => go({ name: 'club', params: { id: away.id } })}><Badge club={away} size={58} /><b>{away.short}</b></button>
        </div>
        <div className="row between tiny" style={{ alignItems: 'flex-start', opacity: 0.85, padding: '0 8px' }}>
          <div style={{ maxWidth: '48%' }}>{goalScorers(w, r, 0).map((s) => <div key={s} className="row tight" style={{ gap: 4 }}><Ball size={10} />{s}</div>)}</div>
          <div style={{ maxWidth: '48%', textAlign: 'right' }}>{goalScorers(w, r, 1).map((s) => <div key={s} className="row tight" style={{ gap: 4, justifyContent: 'flex-end' }}>{s}<Ball size={10} /></div>)}</div>
        </div>
        <div className="tiny dim" style={{ textAlign: 'center', marginTop: 8 }}>{f.venue || (f.neutral ? 'Neutral venue' : home.stadium)} · Att. {r.attendance.toLocaleString()} · {fmtDate(f.date, 'long')}</div>
      </div>
      {motm && (
        <div className="pad" style={{ marginTop: 10 }}>
          <button className="card tap row" style={{ padding: 12, gap: 12, width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: motm.id } })}>
            <Face p={motm} size={48} radius={24} club={w.clubs[motm.clubId]} />
            <div className="grow"><div className="kicker" style={{ color: '#2f80ed' }}>Player of the Match</div><div className="b" style={{ marginTop: 2 }}>{motm.name}</div>{motmStat && <GoalsAssists st={motmStat} />}</div>
            {motmStat && <RatingPill v={motmStat.rating} motm />}
          </button>
        </div>
      )}
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'summary', label: 'Summary' }, ...(hasLineups ? [{ id: 'lineups' as const, label: 'Line-ups' }] : []), { id: 'stats', label: 'Stats' }]} value={tab} onChange={setTab} /></div>
      {tab === 'summary' && (
        <div className="pad stack" style={{ marginTop: 10 }}>
          {r.mom && r.mom.length > 10 && (
            <div className="card pad-card">
              <div className="label" style={{ marginBottom: 8 }}>Momentum</div>
              <MomentumGraph data={r.mom} goals={r.events.filter(isGoal).map((e) => ({ key: e.min + (e.add || 0) / 100, side: e.side as 0 | 1 }))} colors={colors} et={!!r.et} />
            </div>
          )}
          <div className="card list">
            {keyEv.length === 0 && <div className="li muted small">No key events.</div>}
            {keyEv.map((e, i) => {
              const [ic, col] = EVENT_ICON[e.type] || ['info', 'var(--t3)']
              const p = e.player ? w.players[e.player] : undefined
              const p2 = e.player2 ? w.players[e.player2] : undefined
              const left = e.side === 0
              const main = `${callName(p?.name || '')}${e.type === 'penGoal' ? ' (pen)' : e.type === 'owngoal' ? ' (OG)' : ''}`
              const sub = e.type === 'sub' ? `Off: ${callName(p2?.name || '')}` : isGoal(e) && p2 && e.type !== 'owngoal' ? <span className="row tight" style={{ gap: 3, justifyContent: left ? 'flex-start' : 'flex-end' }}><Boot size={12} />{callName(p2.name)}</span> : ''
              return (
                <div key={i} className="ev-row" style={{ flexDirection: left ? 'row' : 'row-reverse', textAlign: left ? 'left' : 'right' }}>
                  <span className="ev-min">{minLabel(e)}</span>
                  <span className="ev-ic">{isGoal(e) ? <Ball size={16} /> : <Icon name={ic} size={16} color={col} />}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small b ellipsis">{main}</div>
                    {sub && <div className="tiny dim ellipsis">{sub}</div>}
                  </div>
                  {isGoal(e) && e.score && <span className="ev-score">{e.score[0]}–{e.score[1]}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {tab === 'lineups' && hs && as && (
        <div className="pad" style={{ marginTop: 10 }}>
          <MatchLineup w={w} home={hs} away={as} onTap={(t) => { haptic(); setPanel(t) }} />
        </div>
      )}
      {tab === 'stats' && <StatsPanel stats={r.stats} homeId={home.id} awayId={away.id} w={w} />}
      {panel && panelSt && (
        <PlayerMatchPanel w={w} st={panelSt} club={panel.side === 0 ? home : away} events={r.events} motm={r.motm === panel.id}
          onClose={() => setPanel(undefined)} onProfile={() => { setPanel(undefined); go({ name: 'player', params: { id: panel.id } }) }} />
      )}
    </div>
  )
}
