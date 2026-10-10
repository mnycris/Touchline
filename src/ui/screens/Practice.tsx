// The Tactics Lab: the training ground for the team's tactics. See the shape the match engine gives them, with and
// without the ball; change a copy and read the difference; play practice matches against a sparring side, one to
// watch or ten at a time; and compare two setups over the same matches. Nothing here touches the career (see
// engine/world/practice.ts): the setups are practice copies until the manager chooses to keep one.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { TeamTactics, World } from '../../domain/types'
import { useGame, useWorld, haptic } from '../../store/game'
import { Screen, Seg } from '../components/layout'
import { Icon } from '../icons/Icon'
import { Badge, Face } from '../components/atoms'
import { TacticsBoard } from '../components/TacticsBoard'
import { PresetPicker } from '../components/TacticsPresets'
import { ShapeView } from '../components/ShapeView'
import { LivePitch, MomentumGraph, kitColors, kitVars } from '../components/LivePitch'
import {
  compareNotes, compareSetups, compareSources, createPractice, howLabel, practiceOpponent, practiceReport, practiceSample, practiceShape, shapeFacts,
  PRACTICE_LEVELS, PRACTICE_STYLES, SHAPE_PHASES, type CompareRow, type PracticeLevel, type PracticeReport, type PracticeSample, type PracticeStyle,
} from '../../engine/world/practice'
import { mainSheet, sheetFor } from '../../engine/match/selection'
import type { MatchSim } from '../../engine/match/engine'
import { callName } from '../../engine/match/commentary'

type Which = 'A' | 'B'
interface Compare { rows: CompareRow[]; src: ReturnType<typeof compareSources>; srcA: ReturnType<typeof compareSources>; notes: string[]; n: number; opp: number; style: PracticeStyle; A: TeamTactics; B: TeamTactics }
/** The lab survives leaving the screen (for the team sheet, say) but not a different career or sheet. */
interface Session {
  save?: string; A?: TeamTactics; B?: TeamTactics; edit: Which; style: PracticeStyle; level: PracticeLevel
  last?: PracticeReport; prev?: PracticeReport; cmp?: Compare; runs: number; open: boolean; phase: string
}
const session: Session = { edit: 'B', style: 'balanced', level: 'similar', runs: 0, open: true, phase: 'block' }

const SPEEDS = [2, 4, 8]
const RUNS = 10
const same = (a?: TeamTactics, b?: TeamTactics) => JSON.stringify(a) === JSON.stringify(b)

export function Practice({ params }: { params?: { fixtureId?: string } }) {
  const w = useWorld()
  const saveId = useGame((s) => s.saveId)
  const mutate = useGame((s) => s.mutate)
  const go = useGame((s) => s.go)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const club = w.clubs[w.userClubId]
  const fixtureId = params?.fixtureId && w.fixtures[params.fixtureId] && !w.fixtures[params.fixtureId].played ? params.fixtureId : undefined
  const sheet = sheetFor(club, fixtureId)
  // fresh practice copies for a new career, or when the sheet behind them is a different one
  const baseKey = `${saveId}:${fixtureId || 'main'}`
  if (session.save !== baseKey || !session.A || !session.B) Object.assign(session, { save: baseKey, A: { ...sheet.tactics }, B: { ...sheet.tactics }, edit: 'B', last: undefined, prev: undefined, cmp: undefined, runs: 0 })
  const A = session.A!, B = session.B!
  const t = session.edit === 'A' ? A : B
  const other = session.edit === 'A' ? B : A
  const differ = !same(A, B)
  const opp = practiceOpponent(w, session.level)

  const [watch, setWatch] = useState<{ sim: MatchSim; speed: number; running: boolean; which: Which } | undefined>()
  const [busy, setBusy] = useState<{ done: number; total: number; label: string }>()
  const timer = useRef<number>(undefined)
  const alive = useRef(true)
  // (set again on mount: React's strict-mode remount runs the cleanup once in development)
  useEffect(() => { alive.current = true; return () => { alive.current = false; window.clearInterval(timer.current) } }, [])

  const setT = (p: Partial<TeamTactics>) => { if (session.edit === 'A') session.A = { ...A, ...p }; else session.B = { ...B, ...p }; force() }
  const setWhole = (x: TeamTactics) => { if (session.edit === 'A') session.A = { ...x }; else session.B = { ...x }; force() }
  const finish = (sims: MatchSim[]) => {
    session.prev = session.last
    session.last = practiceReport(sims)
    session.cmp = undefined
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
    setWatch({ sim: createPractice(w, t, opp, session.style, seed()).sim, speed: 4, running: true, which: session.edit })
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
  /** Ten matches of one setup, or ten each of A and B on the same seeds; one match per frame keeps the screen alive. */
  const run = () => {
    haptic('medium')
    session.open = false
    setWatch(undefined)
    const both = differ
    const setups = both ? [A, B] : [t]
    const total = RUNS * setups.length
    const base = seed()
    const sims: MatchSim[] = [], samples: PracticeSample[][] = setups.map(() => [])
    const style = session.style
    let k = 0
    setBusy({ done: 0, total, label: both ? 'Playing A and B over the same ten matches' : 'Same tactics, same opponent, ten different games' })
    const next = () => {
      if (!alive.current) return
      const si = k % setups.length, i = Math.floor(k / setups.length)
      const { sim } = createPractice(w, setups[si], opp, style, base + i * 104729)
      sim.runToEnd()
      if (both) samples[si].push(practiceSample(sim)); else sims.push(sim)
      k++
      setBusy({ done: k, total, label: both ? 'Playing A and B over the same ten matches' : 'Same tactics, same opponent, ten different games' })
      if (k < total) { window.setTimeout(next, 0); return }
      setBusy(undefined)
      if (!both) { finish(sims); return }
      const rows = compareSetups(samples[0], samples[1])
      const src = compareSources(samples[0], samples[1]), srcA = compareSources(samples[0], samples[1], true)
      session.cmp = { rows, src, srcA, notes: compareNotes(rows, src, srcA), n: RUNS, opp, style, A: { ...A }, B: { ...B } }
      session.runs++
      force()
    }
    window.setTimeout(next, 30)
  }
  const keep = (which: Which) => {
    haptic('medium')
    const x = which === 'A' ? A : B
    mutate((w) => {
      const c = w.clubs[w.userClubId]
      const target = fixtureId ? (c.matchSheets ||= {})[fixtureId] || ((c.matchSheets![fixtureId] = { ...JSON.parse(JSON.stringify(mainSheet(c))), id: `match:${fixtureId}` })) : mainSheet(c)
      target.tactics = { ...x }
    })
    useGame.getState().notify(fixtureId ? `Setup ${which} saved for that match` : `Setup ${which} saved to ${mainSheet(club).name}`, 'ok')
  }
  const copy = () => { haptic(); if (session.edit === 'B') session.B = { ...A }; else session.A = { ...B }; force() }
  const reset = () => { haptic(); setWhole({ ...sheet.tactics }) }

  const home = club, away = w.clubs[opp]
  const colors = kitColors(home, away)
  const kept = same(t, sheet.tactics)
  const cmp = session.cmp
  return (
    <Screen title="Tactics Lab" sub="Training ground · nothing here counts" back noNav style={kitVars(colors)}
      footer={(
        <div className="md-footer">
          <button className="btn" disabled={busy !== undefined} onClick={startWatch}><Icon name="play" size={18} /> Watch {session.edit}</button>
          <button className="btn primary grow" disabled={busy !== undefined} onClick={run}><Icon name={differ ? 'compare' : 'ffwd'} size={20} /> {differ ? `Compare A v B ×${RUNS}` : `Test ×${RUNS}`}</button>
        </div>
      )}>
      <div className="pad stack" style={{ gap: 12, marginTop: 12 }}>
        <ShapeCard w={w} t={t} other={differ ? other : undefined} which={session.edit} opp={opp} style={session.style} colors={colors} />

        <div className="card pad-card stack lab-setups" style={{ gap: 10 }}>
          <div className="lab-ab">
            {(['A', 'B'] as const).map((k) => {
              const x = k === 'A' ? A : B
              return (
                <button key={k} className={`lab-ab-btn ${session.edit === k ? 'on' : ''}`} onClick={() => { haptic(); session.edit = k; force() }}>
                  <span className="lab-ab-k">{k}</span>
                  <span className="meta"><b>{k === 'A' ? 'Setup A' : 'Setup B'}</b><span className="tiny dim ellipsis">{same(x, sheet.tactics) ? 'Your tactics' : `${x.mentality} · ${x.defApproach} · ${x.buildUp.replace(' Passing', '')}`}</span></span>
                </button>
              )
            })}
          </div>
          <div className="tiny dim">{differ ? `Editing ${session.edit}. Rings on the pitch show ${session.edit === 'A' ? 'B' : 'A'}; the comparison plays both over the same ten matches.` : `A and B are the same. Change ${session.edit} to compare it against the other.`}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {differ && <button className="btn xs" onClick={copy}><Icon name="copy" size={13} /> Copy {session.edit === 'B' ? 'A to B' : 'B to A'}</button>}
            {!kept && <button className="btn xs" onClick={reset}><Icon name="undo" size={13} /> Back to my tactics</button>}
            {!kept && <button className="btn xs club" onClick={() => keep(session.edit)}><Icon name="check" size={13} /> Keep {session.edit} as my tactics</button>}
          </div>
        </div>

        {watch && <WatchPanel w={w} sim={watch.sim} speed={watch.speed} running={watch.running} which={watch.which} onSpeed={(v) => setWatch({ ...watch, speed: v })} onToggle={() => setWatch({ ...watch, running: !watch.running && !watch.sim.finished })} onSkip={skip} colors={colors} />}

        {busy && (
          <div className="card pad-card row" style={{ gap: 12 }}>
            <div className="pr-spin" />
            <div className="grow">
              <div className="small b">Running practice matches… {busy.done}/{busy.total}</div>
              <div className="tiny dim">{busy.label}</div>
              <div className="lab-prog"><i style={{ width: `${(busy.done / busy.total) * 100}%` }} /></div>
            </div>
          </div>
        )}

        {cmp && !busy && <CompareCard w={w} c={cmp} onKeep={keep} kept={(k) => same(k === 'A' ? cmp.A : cmp.B, sheet.tactics)} />}
        {!cmp && session.last && !busy && <ReportCard w={w} r={session.last} prev={session.prev} />}

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

        <div className="lab-edit-h">
          <span className="lab-ab-k sm">{session.edit}</span>
          <div className="grow"><div className="label">Setup {session.edit}</div><div className="tiny dim">{sheet.formation.replace(/ \(.*/, '')} · {t.mentality} · {t.buildUp} · {t.chanceCreation}</div></div>
          <button className="btn xs" onClick={() => { haptic(); session.open = !session.open; force() }}><Icon name={session.open ? 'up' : 'down'} size={14} /> {session.open ? 'Hide' : 'Edit'}</button>
        </div>
        {session.open && <PresetPicker t={t} onApply={setWhole} />}
        {session.open && <TacticsBoard t={t} onChange={setT} base={differ ? other : undefined} baseLabel={session.edit === 'A' ? 'B' : 'A'} />}

        <div className="tiny dim" style={{ textAlign: 'center' }}>Line-up and roles come from your team sheet. <button className="link-btn" onClick={() => go({ name: 'tactics', params: fixtureId ? { fixtureId } : undefined })}>Edit line-up</button></div>
      </div>
    </Screen>
  )
}

/** The shape the engine gives a setup, at the moment picked, with the other setup as rings. */
function ShapeCard({ w, t, other, which, opp, style, colors }: { w: World; t: TeamTactics; other?: TeamTactics; which: Which; opp: number; style: PracticeStyle; colors: [string, string] }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const ph = SHAPE_PHASES.find((p) => p.id === session.phase) || SHAPE_PHASES[4]
  const key = JSON.stringify(t), okey = other ? JSON.stringify(other) : ''
  const cur = useMemo(() => practiceShape(w, t, opp, style, ph.id), [key, opp, style, ph.id])
  const ghost = useMemo(() => (other ? practiceShape(w, other, opp, style, ph.id) : undefined), [okey, opp, style, ph.id])
  const facts = shapeFacts(cur.dots, cur.ball, cur.inPoss)
  const gf = ghost ? shapeFacts(ghost.dots, ghost.ball, ghost.inPoss) : undefined
  const set = (id: string) => { haptic(); session.phase = id; force() }
  return (
    <div className="card lab-shape">
      <div className="row between" style={{ padding: '12px 14px 8px' }}>
        <div className="label">Shape · {which}</div>
        <div style={{ width: 196 }}>
          <Seg small items={[{ id: 'with', label: 'With the ball' }, { id: 'without', label: 'Without it' }]} value={ph.inPoss ? 'with' : 'without'}
            onChange={(v) => set(v === 'with' ? (ph.id === 'press' ? 'build' : ph.id === 'box' ? 'final' : 'mid') : (ph.id === 'build' ? 'press' : ph.id === 'final' ? 'box' : 'block'))} />
        </div>
      </div>
      <div className="lab-phases">
        {SHAPE_PHASES.filter((p) => p.inPoss === ph.inPoss).map((p) => <button key={p.id} className={`chip ${p.id === ph.id ? 'on' : ''}`} onClick={() => set(p.id)}>{p.label}</button>)}
      </div>
      <div className="lab-pitch"><ShapeView w={w} dots={cur.dots} ghost={ghost?.dots} ball={cur.ball} inPoss={cur.inPoss} kit={colors[0]} oppKit={colors[1]} /></div>
      <div className="lab-facts">
        {facts.map((f, i) => (
          <div key={f.label} className="lab-fact">
            <b className="num">{f.value}</b>
            <span>{f.label}</span>
            {gf && gf[i] && gf[i].value !== f.value && <em>{which === 'A' ? 'B' : 'A'} {gf[i].value}</em>}
          </div>
        ))}
      </div>
      <div className="tiny dim lab-cap">{cur.inPoss ? 'Attacking left to right' : 'Defending the left-hand goal'} · positions from the match engine against the sparring side{other ? ` · rings: setup ${which === 'A' ? 'B' : 'A'}` : ''}</div>
    </div>
  )
}

/** A against B, from the same ten matches, with how sure each difference is. */
function CompareCard({ w, c, onKeep, kept }: { w: World; c: Compare; onKeep: (k: Which) => void; kept: (k: Which) => boolean }) {
  const opp = w.clubs[c.opp]
  const style = PRACTICE_STYLES.find((s) => s.id === c.style)
  const pts = c.rows.find((r) => r.key === 'pts')!
  return (
    <div className="card pad-card stack lab-cmp" style={{ gap: 12 }}>
      <div>
        <div className="label">A v B</div>
        <div className="small b" style={{ marginTop: 3 }}>{c.n} matches each against a side like {opp.short} ({style?.label.toLowerCase()})</div>
      </div>
      <ul className="pr-notes">{c.notes.map((n) => <li key={n} className="small">{n}</li>)}</ul>
      <div className="lab-cmp-t">
        <div className="lab-cmp-h tiny dim"><span /><span>A</span><span>B</span><span /></div>
        {c.rows.map((r) => (
          <div key={r.key} className={`lab-cmp-r v-${r.verdict}`}>
            <span className="small dim">{r.label}</span>
            <span className="small num">{r.fmt(r.a)}</span>
            <span className="small b num">{r.fmt(r.b)}</span>
            <Delta r={r} />
          </div>
        ))}
      </div>
      <div className="pr-two">
        <SourcesAB title="Your chances (xG)" list={c.src} />
        <SourcesAB title="Theirs (xG)" list={c.srcA} />
      </div>
      <div className="tiny dim lab-honest">
        Ten matches is a small sample, even on the same seeds. <b>Clear</b>: at least twice the match-to-match noise. <b>Slight</b>: a lean, not proven. <b>≈</b>: within what ten games vary by anyway. Points move most and settle least.
        {pts.verdict !== 'clear' ? ' ' : ''}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {(['A', 'B'] as const).map((k) => <button key={k} className={`btn sm ${k === 'B' ? 'club' : ''} grow`} disabled={kept(k)} onClick={() => onKeep(k)}><Icon name="check" size={14} /> {kept(k) ? `${k} is your tactics` : `Keep ${k}`}</button>)}
      </div>
    </div>
  )
}

function Delta({ r }: { r: CompareRow }) {
  if (r.verdict === 'noise') return <span className="lab-d same">≈</span>
  const up = r.diff > 0
  const cls = r.good === undefined ? 'neu' : r.good ? 'up' : 'down'
  const mag = Math.abs(r.diff)
  const txt = r.key === 'poss' || r.key === 'passAcc' || r.key === 'energy' ? `${Math.round(mag)}` : mag >= 10 ? mag.toFixed(0) : mag.toFixed(mag >= 1 ? 1 : 2)
  return <span className={`lab-d ${cls} ${r.verdict}`}>{up ? '▲' : '▼'}{txt}</span>
}

function SourcesAB({ title, list }: { title: string; list: { how: string; a: [number, number]; b: [number, number] }[] }) {
  const max = Math.max(0.2, ...list.flatMap((s) => [s.a[1], s.b[1]]))
  return (
    <div>
      <div className="tiny b dim" style={{ marginBottom: 6 }}>{title}</div>
      {list.length ? list.slice(0, 5).map((s) => (
        <div key={s.how} className="lab-src">
          <div className="lab-src-h tiny"><span className="ellipsis">{howLabel(s.how)}</span><span className="num dim">{s.a[1].toFixed(2)}→<b>{s.b[1].toFixed(2)}</b></span></div>
          <div className="lab-src-bars"><i className="a" style={{ width: `${(s.a[1] / max) * 100}%` }} /><i className="b" style={{ width: `${(s.b[1] / max) * 100}%` }} /></div>
        </div>
      )) : <div className="tiny dim">No chances</div>}
    </div>
  )
}

function WatchPanel({ w, sim, speed, running, which, onSpeed, onToggle, onSkip, colors }: { w: World; sim: MatchSim; speed: number; running: boolean; which: Which; onSpeed: (v: number) => void; onToggle: () => void; onSkip: () => void; colors: [string, string] }) {
  const home = w.clubs[sim.sides[0].input.clubId], away = w.clubs[sim.sides[1].input.clubId]
  const goals = sim.events.filter((e) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal')
  const last = [...sim.events].reverse().find((e) => e.text && ['goal', 'penGoal', 'owngoal', 'save', 'miss', 'chance', 'woodwork', 'yellow', 'red'].includes(e.type))
  return (
    <div className="card pr-watch">
      <div className="pr-score">
        <span className="row tight grow" style={{ justifyContent: 'flex-end' }}><b className="small">{home.short}</b><Badge club={home} size={24} /></span>
        <div className="col center" style={{ minWidth: 86 }}>
          <div className="display" style={{ fontSize: 28 }}>{sim.score[0]} – {sim.score[1]}</div>
          <div className={`tiny ${running && !sim.finished ? 'pos b' : 'dim'}`}>{sim.finished ? 'Full time' : sim.phase === 'HT' ? 'Half time' : `${sim.minute}'`} · setup {which}</div>
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
