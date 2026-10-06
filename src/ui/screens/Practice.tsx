// Tactical practice: test the team's tactics in a training match against a sparring side, watch it or run ten at once,
// and read what happened. Nothing here touches the career (see engine/world/practice.ts); the tactics used are a
// practice copy until the manager chooses to keep them.
import { useEffect, useReducer, useRef, useState } from 'react'
import type { TeamTactics, World } from '../../domain/types'
import { useGame, useWorld, haptic } from '../../store/game'
import { Screen, Seg } from '../components/layout'
import { Icon } from '../icons/Icon'
import { Badge, Face } from '../components/atoms'
import { TacticsBoard } from '../components/TacticsBoard'
import { LivePitch, MomentumGraph, kitColors, kitVars } from '../components/LivePitch'
import { createPractice, howLabel, practiceOpponent, practiceReport, PRACTICE_LEVELS, PRACTICE_STYLES, type PracticeLevel, type PracticeReport, type PracticeStyle } from '../../engine/world/practice'
import { mainSheet, sheetFor } from '../../engine/match/selection'
import type { MatchSim } from '../../engine/match/engine'
import { callName } from '../../engine/match/commentary'

/** The practice session survives leaving the screen (for the team sheet, say) but not a different career. */
interface Session { save?: string; tactics?: TeamTactics; base?: string; style: PracticeStyle; level: PracticeLevel; last?: PracticeReport; prev?: PracticeReport; runs: number; open: boolean }
const session: Session = { style: 'balanced', level: 'similar', runs: 0, open: true }

const SPEEDS = [2, 4, 8]

export function Practice({ params }: { params?: { fixtureId?: string } }) {
  const w = useWorld()
  const saveId = useGame((s) => s.saveId)
  const mutate = useGame((s) => s.mutate)
  const go = useGame((s) => s.go)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const club = w.clubs[w.userClubId]
  const fixtureId = params?.fixtureId && w.fixtures[params.fixtureId] && !w.fixtures[params.fixtureId].played ? params.fixtureId : undefined
  const sheet = sheetFor(club, fixtureId)
  // a fresh practice copy of the tactics for a new career, or when the sheet behind it changed
  const baseKey = `${saveId}:${fixtureId || 'main'}`
  if (session.save !== baseKey || !session.tactics) Object.assign(session, { save: baseKey, tactics: { ...sheet.tactics }, last: undefined, prev: undefined, runs: 0 })
  const t = session.tactics!
  const changed = JSON.stringify(t) !== JSON.stringify(sheet.tactics)
  const opp = practiceOpponent(w, session.level)
  const style = PRACTICE_STYLES.find((s) => s.id === session.style)!

  const [watch, setWatch] = useState<{ sim: MatchSim; speed: number; running: boolean } | undefined>()
  const [busy, setBusy] = useState<number>()
  const timer = useRef<number>(undefined)
  const alive = useRef(true)
  // (set again on mount: React's strict-mode remount runs the cleanup once in development)
  useEffect(() => { alive.current = true; return () => { alive.current = false; window.clearInterval(timer.current) } }, [])

  const setT = (p: Partial<TeamTactics>) => { session.tactics = { ...t, ...p }; force() }
  const finish = (sims: MatchSim[]) => {
    session.prev = session.last
    session.last = practiceReport(sims)
    session.runs++
    force()
  }
  const seed = () => (Date.now() ^ (session.runs * 7919)) >>> 0

  // watch one match: a minute every 1/speed seconds, straight through half-time
  useEffect(() => {
    window.clearInterval(timer.current)
    if (!watch || !watch.running) return
    timer.current = window.setInterval(() => {
      const s = watch.sim
      if (s.injuredWaiting.length) s.autoResolveInjuries()
      s.step()
      if (s.finished) { window.clearInterval(timer.current); setWatch({ ...watch, running: false }); finish([s]) }
      force()
    }, 1000 / watch.speed)
    return () => window.clearInterval(timer.current)
  }, [watch?.sim, watch?.running, watch?.speed])

  const startWatch = () => {
    haptic('medium')
    session.open = false
    setWatch({ sim: createPractice(w, t, opp, session.style, seed()).sim, speed: 4, running: true })
  }
  const skip = () => {
    if (!watch) return
    haptic()
    const s = watch.sim
    let g = 0
    while (!s.finished && g++ < 400) { if (s.injuredWaiting.length) s.autoResolveInjuries(); s.step() }
    setWatch({ ...watch, running: false })
    finish([s])
  }
  // ten at once, one per frame so the screen stays responsive
  const runMany = () => {
    haptic('medium')
    session.open = false
    setWatch(undefined)
    const sims: MatchSim[] = []
    const base = seed()
    setBusy(0)
    const next = () => {
      if (!alive.current) return
      const { sim } = createPractice(w, t, opp, session.style, base + sims.length * 104729)
      sim.runToEnd()
      sims.push(sim)
      setBusy(sims.length)
      if (sims.length < 10) window.setTimeout(next, 0)
      else { setBusy(undefined); finish(sims) }
    }
    window.setTimeout(next, 30)
  }
  const keep = () => {
    haptic('medium')
    mutate((w) => {
      const c = w.clubs[w.userClubId]
      const target = fixtureId ? (c.matchSheets ||= {})[fixtureId] || ((c.matchSheets![fixtureId] = { ...JSON.parse(JSON.stringify(mainSheet(c))), id: `match:${fixtureId}` })) : mainSheet(c)
      target.tactics = { ...t }
    })
    useGame.getState().notify(fixtureId ? 'Tactics saved for that match' : `Tactics saved to ${mainSheet(club).name}`, 'ok')
  }
  const reset = () => { haptic(); session.tactics = { ...sheet.tactics }; force() }

  const home = club, away = w.clubs[opp]
  const colors = kitColors(home, away)
  const r = session.last
  return (
    <Screen title="Tactical Practice" sub="A training match · nothing counts" back noNav style={kitVars(colors)}
      footer={(
        <div className="md-footer">
          <button className="btn" disabled={busy !== undefined} onClick={runMany}><Icon name="ffwd" size={18} /> Test ×10</button>
          <button className="btn primary grow" disabled={busy !== undefined} onClick={startWatch}><Icon name="play" size={20} /> {watch ? 'Watch again' : 'Watch a match'}</button>
        </div>
      )}>
      <div className="pad stack" style={{ gap: 12, marginTop: 12 }}>
        {watch && <WatchPanel w={w} sim={watch.sim} speed={watch.speed} running={watch.running} onSpeed={(v) => setWatch({ ...watch, speed: v })} onToggle={() => setWatch({ ...watch, running: !watch.running && !watch.sim.finished })} onSkip={skip} colors={colors} />}

        {busy !== undefined && (
          <div className="card pad-card row" style={{ gap: 12 }}>
            <div className="pr-spin" />
            <div className="grow"><div className="small b">Running practice matches… {busy}/10</div><div className="tiny dim">Same tactics, same opponent, ten different games</div></div>
          </div>
        )}

        {r && busy === undefined && <ReportCard w={w} r={r} prev={session.prev} />}

        <div className="card pad-card stack" style={{ gap: 10 }}>
          <div className="row between">
            <div className="label">Sparring side</div>
            <span className="row tight tiny dim"><Badge club={away} size={18} /> a side like {away.short}</span>
          </div>
          <div className="pr-styles">
            {PRACTICE_STYLES.map((s) => (
              <button key={s.id} className={`pr-style ${session.style === s.id ? 'on' : ''}`} onClick={() => { haptic(); session.style = s.id; force() }}>
                <b>{s.label}</b><span>{s.desc}</span>
              </button>
            ))}
          </div>
          <Seg small items={PRACTICE_LEVELS.map((l) => ({ id: l.id, label: l.label }))} value={session.level} onChange={(v) => { session.level = v; force() }} />
        </div>

        <div className="card">
          <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); session.open = !session.open; force() }}>
            <Icon name="tactics" size={18} color="var(--club2)" />
            <div className="meta">
              <div className="t">Practice tactics{changed ? <span className="pr-chg"> · changed</span> : null}</div>
              <div className="s">{sheet.formation.replace(/ \(.*/, '')} · {t.mentality} · {t.buildUp} · {t.chanceCreation}{fixtureId ? ' · from this match’s sheet' : ''}</div>
            </div>
            <Icon name={session.open ? 'up' : 'down'} size={16} color="var(--t3)" />
          </button>
          {changed && (
            <div className="row" style={{ gap: 8, padding: '0 14px 12px' }}>
              <button className="btn xs" onClick={reset}><Icon name="undo" size={13} /> Back to my tactics</button>
              <button className="btn xs club" onClick={keep}><Icon name="check" size={13} /> Keep these tactics</button>
            </div>
          )}
        </div>
        {session.open && <TacticsBoard t={t} onChange={setT} />}

        <div className="tiny dim" style={{ textAlign: 'center' }}>Your line-up and roles come from your team sheet. <button className="link-btn" onClick={() => go({ name: 'tactics', params: fixtureId ? { fixtureId } : undefined })}>Edit line-up</button></div>
      </div>
    </Screen>
  )
}

function WatchPanel({ w, sim, speed, running, onSpeed, onToggle, onSkip, colors }: { w: World; sim: MatchSim; speed: number; running: boolean; onSpeed: (v: number) => void; onToggle: () => void; onSkip: () => void; colors: [string, string] }) {
  const home = w.clubs[sim.sides[0].input.clubId], away = w.clubs[sim.sides[1].input.clubId]
  const goals = sim.events.filter((e) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal')
  const last = [...sim.events].reverse().find((e) => e.text && ['goal', 'penGoal', 'owngoal', 'save', 'miss', 'chance', 'woodwork', 'yellow', 'red'].includes(e.type))
  return (
    <div className="card pr-watch">
      <div className="pr-score">
        <span className="row tight grow" style={{ justifyContent: 'flex-end' }}><b className="small">{home.short}</b><Badge club={home} size={24} /></span>
        <div className="col center" style={{ minWidth: 86 }}>
          <div className="display" style={{ fontSize: 28 }}>{sim.score[0]} – {sim.score[1]}</div>
          <div className={`tiny ${running && !sim.finished ? 'pos b' : 'dim'}`}>{sim.finished ? 'Full time' : sim.phase === 'HT' ? 'Half time' : `${sim.minute}'`}</div>
        </div>
        <span className="row tight grow"><Badge club={away} size={24} /><b className="small">{away.short}</b></span>
      </div>
      <div className="lp-wrap"><LivePitch sim={sim} w={w} speed={speed} frameCount={sim.timeline.length} home={home} away={away} /></div>
      <div className="mom-wrap"><MomentumGraph data={sim.timeline.map((x) => [x.m + x.add / 100, x.mom])} goals={goals.map((e) => ({ key: e.min + (e.add || 0) / 100, side: e.side as 0 | 1 }))} colors={colors} live={!sim.finished} /></div>
      <div className="pr-feed tiny">{last ? <><b>{last.min}'</b> {last.text}</> : <span className="dim">Kick-off</span>}</div>
      <div className="row" style={{ gap: 8, padding: '0 12px 12px' }}>
        {!sim.finished && <button className="btn sm" onClick={onToggle}><Icon name={running ? 'pause' : 'play'} size={16} /></button>}
        {!sim.finished && <div style={{ width: 128, flex: 'none' }}><Seg small items={SPEEDS.map((s) => ({ id: String(s), label: `${s}×` }))} value={String(speed)} onChange={(v) => onSpeed(Number(v))} /></div>}
        {!sim.finished && <button className="btn sm grow" onClick={onSkip}><Icon name="skip" size={16} /> To full time</button>}
      </div>
    </div>
  )
}

/** What happened, as numbers and plain observations, against the previous run. */
function ReportCard({ w, r, prev }: { w: World; r: PracticeReport; prev?: PracticeReport }) {
  const [S, T] = r.stats
  const P = prev?.stats[0], Q = prev?.stats[1]
  const delta = (a: number, b: number | undefined, unit = '', invert = false) => {
    if (b === undefined) return null
    const d = Math.round((a - b) * 10) / 10
    if (Math.abs(d) < (unit === '%' ? 2 : 0.5)) return <span className="pr-d same">=</span>
    return <span className={`pr-d ${(d > 0) !== invert ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}{unit}</span>
  }
  const head = r.n === 1 ? `Practice match · ${r.score[0]}–${r.score[1]}` : `Over ${r.n} practice matches · W${r.record[0]} D${r.record[1]} L${r.record[2]}`
  const rows: [string, string, React.ReactNode][] = [
    ['Possession', `${S.possession}%`, delta(S.possession, P?.possession, '%')],
    ['Shots', `${S.shots} v ${T.shots}`, delta(S.shots, P?.shots)],
    ['Expected goals', `${S.xg.toFixed(2)} v ${T.xg.toFixed(2)}`, delta(S.xg, P?.xg)],
    ['Passes', `${S.passes} · ${S.passAcc}%`, delta(S.passes, P?.passes)],
    ['Moves into the final third', `${r.entries}`, delta(r.entries, prev?.entries)],
    ['Ball won in their third', `${r.won[2]}`, delta(r.won[2], prev?.won[2])],
    ['Chances against (xG)', T.xg.toFixed(2), delta(T.xg, Q?.xg, '', true)],
    ['Energy at the end', `${r.energy}%`, delta(r.energy, prev?.energy, '%')],
  ]
  return (
    <div className="card pad-card stack pr-report" style={{ gap: 12 }}>
      <div className="row between">
        <div><div className="label">{r.n === 1 ? 'What happened' : 'Tendencies'}</div><div className="small b" style={{ marginTop: 3 }}>{head}</div></div>
        {r.n > 1 && <span className="tiny dim">avg {r.score[0]}–{r.score[1]}</span>}
      </div>
      {r.notes.length > 0 && <ul className="pr-notes">{r.notes.map((n) => <li key={n} className="small">{n}</li>)}</ul>}
      <div className="pr-rows">
        {rows.map(([k, v, d]) => <div key={k} className="row between pr-row"><span className="small dim">{k}</span><span className="small b num">{v} {d}</span></div>)}
      </div>
      <div>
        <div className="tiny b dim" style={{ marginBottom: 5 }}>Where your play happened</div>
        <Bar parts={r.thirds} labels={['Own third', 'Midfield', 'Their third']} />
      </div>
      {r.entries >= 3 && (
        <div>
          <div className="tiny b dim" style={{ marginBottom: 5 }}>Moves into the final third</div>
          <Bar parts={r.lanes} labels={['Left', 'Middle', 'Right']} />
        </div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="pr-chip">{r.moveLength} passes a spell</span>
        <span className="pr-chip">{r.forward}% passes forward</span>
        <span className="pr-chip">{r.longShare}% long balls</span>
        {(S.crosses ?? 0) > 0 && <span className="pr-chip">{S.crosses} crosses</span>}
        {S.offsides > 0 && <span className="pr-chip">{S.offsides} offsides</span>}
      </div>
      <div className="pr-two">
        <Sources title="Your chances came from" list={r.chances} />
        <Sources title="Theirs came from" list={r.against} />
      </div>
      {(r.hub || r.creator || r.shooter) && (
        <div className="pr-people">
          {r.hub && <Person w={w} id={r.hub.id} label="Most on the ball" v={`${r.hub.touches} touches`} />}
          {r.creator && <Person w={w} id={r.creator.id} label="Made the chances" v={`${r.creator.keyPasses} key passes`} />}
          {r.shooter && <Person w={w} id={r.shooter.id} label="Took the shots" v={`${r.shooter.shots} · ${r.shooter.xg.toFixed(2)} xG`} />}
        </div>
      )}
      {prev && <div className="tiny dim">▲▼ against your previous run{prev.n !== r.n ? ` (${prev.n === 1 ? 'one match' : `${prev.n} matches`})` : ''}.</div>}
    </div>
  )
}

function Bar({ parts, labels }: { parts: number[]; labels: string[] }) {
  return (
    <div>
      <div className="pr-bar">{parts.map((p, i) => <i key={i} style={{ width: `${Math.max(p, 2)}%`, opacity: 0.45 + i * 0.25 }} />)}</div>
      <div className="row between tiny dim" style={{ marginTop: 4 }}>{labels.map((l, i) => <span key={l}>{l} {parts[i]}%</span>)}</div>
    </div>
  )
}

function Sources({ title, list }: { title: string; list: { how: string; shots: number; xg: number }[] }) {
  const top = list.filter((c) => c.shots > 0).slice(0, 4)
  return (
    <div>
      <div className="tiny b dim" style={{ marginBottom: 5 }}>{title}</div>
      {top.length ? top.map((c) => <div key={c.how} className="row between tiny" style={{ padding: '2px 0' }}><span>{howLabel(c.how)}</span><span className="num dim">{c.shots} · {c.xg.toFixed(2)}</span></div>) : <div className="tiny dim">No shots</div>}
    </div>
  )
}

function Person({ w, id, label, v }: { w: World; id: number; label: string; v: string }) {
  const p = w.players[id]
  if (!p) return null
  return (
    <div className="pr-person">
      <Face p={p} size={34} radius={9} club={w.clubs[p.clubId]} />
      <div className="meta"><div className="tiny dim">{label}</div><div className="small b ellipsis">{callName(p.name)}</div><div className="tiny dim">{v}</div></div>
    </div>
  )
}
