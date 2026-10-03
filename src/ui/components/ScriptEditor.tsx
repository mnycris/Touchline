// Edit Mode match scripting. Simple: say how the match should go (who's on top, how open, how heated, late drama,
// stars). Advanced: also fix the score (or roll a plausible one), script moments (goals and assists, penalties down
// to the corner, the dive and the card, bookings) at their minute with the engine picking players on AUTO, set
// individual performances and pick an AI side's line-up. The match engine still plays the whole match; the script
// only guarantees what you chose.
import { useMemo, useState } from 'react'
import type { Fixture, MatchScript, Player, ScriptEvent, ScriptLevel, World } from '../../domain/types'
import { FORMATIONS, formationOf } from '../../domain/constants'
import { useGame, haptic } from '../../store/game'
import { setScript } from '../../engine/world/edit'
import { sideInput } from '../../engine/world/matchRunner'
import { validateSheet } from '../../engine/match/selection'
import { squadOf } from '../../engine/match/selection'
import { callName } from '../../engine/match/commentary'
import { plausibleScore, predictFixture } from '../../engine/match/predict'
import { Rng } from '../../domain/rng'
import { Icon } from '../icons/Icon'
import { Badge, Face } from './atoms'
import { Seg, Sheet, Toggle } from './layout'
import { Ball, Boot, MissedPen } from './Glyphs'
import { Stepper } from './Editors'
import { assignToFormation } from '../screens/Match'
import { kitColors } from './LivePitch'

const LEVEL_NAME: Record<number, string> = { [-2]: 'Nightmare', [-1]: 'Off day', 0: 'As usual', 1: 'Sharp', 2: 'Inspired' }
const uid = () => Math.random().toString(36).slice(2, 9)
const goalsFor = (s: MatchScript, side: 0 | 1) => (s.events || []).filter((e) => e.side === side && (e.kind === 'goal' || (e.kind === 'pen' && (e.pen ?? 'goal') === 'goal'))).length
const minLabel = (e: Pick<ScriptEvent, 'min' | 'add'>) => (e.add ? `${e.min}+${e.add}'` : `${e.min}'`)
const AUTO = 0, AUTO_ASSIST = -1

export function ScriptEditor({ w, f, onClose }: { w: World; f: Fixture; onClose: () => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const existing = w.scripts?.[f.id]
  const [s, setS] = useState<MatchScript>(() => JSON.parse(JSON.stringify(existing || {})))
  const [mode, setMode] = useState<'simple' | 'advanced'>(existing && (existing.score || existing.events?.length || Object.keys(existing.form || {}).length || existing.lineups) ? 'advanced' : 'simple')
  const [adding, setAdding] = useState<ScriptEvent>()
  const [formFor, setFormFor] = useState<0 | 1>()
  const [lineupFor, setLineupFor] = useState<0 | 1>()
  const [rolled, setRolled] = useState(0)
  const comp = w.competitions[f.compId]
  const clubs = [w.clubs[f.home], w.clubs[f.away]] as const
  const colors = kitColors(clubs[0], clubs[1])
  const knockout = !!f.tieId
  const pred = useMemo(() => predictFixture(w, f), [f.id])
  // each side's matchday squad: the user's selected sheet, a scripted AI line-up, or the XI the AI would pick
  const squads = useMemo(() => ([0, 1] as const).map((i) => {
    const id = i ? f.away : f.home
    const club = w.clubs[id]
    const user = id === w.userClubId
    const scripted = s.lineups?.[String(i) as '0' | '1']
    const sheet = user ? validateSheet(w, club, club.sheets.find((x) => x.id === club.activeSheet) || club.sheets[0], comp).sheet : sideInput(w, id, comp, false, scripted).sheet
    return { id, user, xi: sheet.lineup.map((pid) => w.players[pid]).filter(Boolean), bench: sheet.bench.map((pid) => w.players[pid]).filter(Boolean), formation: sheet.formation }
  }), [s.lineups?.['0'], s.lineups?.['1']])
  const set = (patch: Partial<MatchScript>) => setS((x) => {
    const n = { ...x, ...patch }
    // a fixed score never falls below the goals scripted for each side
    if (n.score) n.score = [Math.max(n.score[0], goalsFor(n, 0)), Math.max(n.score[1], goalsFor(n, 1))]
    return n
  })
  const feel = (x: MatchScript): MatchScript => ({ bias: x.bias, goals: x.goals, temper: x.temper, late: x.late, stars: x.stars })
  const empty = (x: MatchScript) => !Object.values(x).some((v) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && v && !Array.isArray(v) && !Object.keys(v).length))
  const save = () => {
    haptic('medium')
    // an AI side whose players are scripted keeps the squad you saw here, so they're all there on the day
    const out: MatchScript = mode === 'simple' ? feel(s) : { ...s }
    if (mode === 'advanced') {
      for (const i of [0, 1] as const) {
        const k = String(i) as '0' | '1'
        if (squads[i].user || out.lineups?.[k]) continue
        const ids = new Set([...squads[i].xi, ...squads[i].bench].map((p) => p.id))
        const used = (out.events || []).some((e) => ids.has(e.player) || (e.assist != null && ids.has(e.assist))) || Object.keys(out.form || {}).some((id) => ids.has(Number(id)))
        if (used) out.lineups = { ...(out.lineups || {}), [k]: { formation: squads[i].formation, lineup: squads[i].xi.map((p) => p.id), bench: squads[i].bench.map((p) => p.id) } }
      }
    }
    const final = empty(out) ? undefined : out
    mutate((w) => setScript(w, f.id, final))
    notify(final ? 'Match scripted' : 'Match script cleared', 'edit')
    onClose()
  }
  const clear = () => { haptic('medium'); mutate((w) => setScript(w, f.id, undefined)); notify('Match script cleared', 'edit'); onClose() }
  const roll = () => {
    haptic('medium')
    const [a, b] = plausibleScore(w, f, new Rng(Date.now() & 0x7fffffff))
    set({ score: [a, b] })
    setRolled((x) => x + 1)
  }

  const levels: { v: ScriptLevel; label: string }[] = [
    { v: 2, label: `${clubs[0].short} dominate` }, { v: 1, label: `${clubs[0].short} have the edge` }, { v: 0, label: 'An even contest' },
    { v: -1, label: `${clubs[1].short} have the edge` }, { v: -2, label: `${clubs[1].short} dominate` },
  ]
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const feelControls = (
    <div className="sc-feel">
      <div className="sc-feel-row"><span className="small b">Goals</span><Seg small items={[{ id: '-1', label: 'Tight' }, { id: '0', label: 'Normal' }, { id: '1', label: 'Open' }, { id: '2', label: 'Goal-fest' }]} value={String(s.goals || 0)} onChange={(v) => { haptic(); set({ goals: (Number(v) || undefined) as MatchScript['goals'] }) }} /></div>
      <div className="sc-feel-row"><span className="small b">Temper</span><Seg small items={[{ id: '-1', label: 'Calm' }, { id: '0', label: 'Normal' }, { id: '1', label: 'Heated' }]} value={String(s.temper || 0)} onChange={(v) => { haptic(); set({ temper: (Number(v) || undefined) as MatchScript['temper'] }) }} /></div>
      <div className="sc-feel-row"><span className="small b">Stars shine</span><Seg small items={[{ id: '', label: 'Off' }, { id: 'home', label: clubs[0].short }, { id: 'away', label: clubs[1].short }, { id: 'both', label: 'Both' }]} value={s.stars || ''} onChange={(v) => { haptic(); set({ stars: (v || undefined) as MatchScript['stars'] }) }} /></div>
      <Toggle label="Late drama" sub="The last ten minutes and stoppage time turn frantic" on={!!s.late} onChange={(v) => set({ late: v || undefined })} />
    </div>
  )

  return (
    <Sheet open onClose={onClose}>
      <div className="sc">
        {/* everything scrolls in here; the save bar sits below it, so it can never cover a section */}
        <div className="sc-scroll">
        <div className="row tight" style={{ justifyContent: 'center', gap: 8 }}><span className="ed-badge"><Icon name="edit" size={13} strokeWidth={2.3} /> Edit match</span></div>
        <div className="sc-teams">
          <span className="row tight"><Badge club={clubs[0]} size={30} /><b className="ellipsis">{clubs[0].short}</b></span>
          <span className="display sc-score" key={rolled}>{s.score && mode === 'advanced' ? `${s.score[0]}–${s.score[1]}` : 'v'}</span>
          <span className="row tight" style={{ justifyContent: 'flex-end' }}><b className="ellipsis">{clubs[1].short}</b><Badge club={clubs[1]} size={30} /></span>
        </div>
        <div className="sc-pred">
          <span className="sc-pred-bar"><i style={{ flex: pred.pHome, background: colors[0] }} /><i style={{ flex: pred.pDraw }} /><i style={{ flex: pred.pAway, background: colors[1] }} /></span>
          <span className="tiny dim">Left alone: {clubs[0].short} {pct(pred.pHome)} · draw {pct(pred.pDraw)} · {clubs[1].short} {pct(pred.pAway)}</span>
        </div>
        <Seg small items={[{ id: 'simple' as const, label: 'Simple' }, { id: 'advanced' as const, label: 'Advanced' }]} value={mode} onChange={(v) => { haptic(); setMode(v) }} />

        {mode === 'simple' && (
          <div className="fade-up" key="simple">
            <div className="label" style={{ margin: '14px 2px 8px' }}>Who's on top?</div>
            <div className="sc-levels">
              {levels.map((l) => (
                <button key={l.v} className={`sc-level ${(s.bias || 0) === l.v ? 'on' : ''}`} onClick={() => { haptic(); set({ bias: l.v || undefined }) }}>
                  <span className="sc-share"><i style={{ flex: 3 + l.v * 1.3, background: colors[0] }} /><i style={{ flex: 3 - l.v * 1.3, background: colors[1] }} /></span>
                  <span className="small b">{l.label}</span>
                  {(s.bias || 0) === l.v && <Icon name="check" size={16} color="var(--gold)" />}
                </button>
              ))}
            </div>
            <div className="label" style={{ margin: '16px 2px 8px' }}>The feel of it</div>
            {feelControls}
            <div className="tiny dim" style={{ marginTop: 10 }}>The whole match is still simulated: these shape the day, not the result itself. For a fixed score or exact moments, use Advanced.</div>
          </div>
        )}

        {mode === 'advanced' && (
          <div className="stack fade-up" style={{ gap: 14, marginTop: 14 }} key="advanced">
            <section className="card sc-sec">
              <div className="row between"><span className="small b">Who's on top?</span><span className="tiny dim">{levels.find((l) => l.v === (s.bias || 0))?.label}</span></div>
              <div className="sc-balance">
                <Badge club={clubs[0]} size={20} />
                <div className="sc-bdots">
                  {([2, 1, 0, -1, -2] as ScriptLevel[]).map((v) => <button key={v} className={`sc-bdot ${(s.bias || 0) === v ? 'on' : ''}`} style={{ ['--c' as any]: v > 0 ? colors[0] : v < 0 ? colors[1] : '#dfe5ec', ['--s' as any]: 0.7 + Math.abs(v) * 0.15 }} onClick={() => { haptic(); set({ bias: v || undefined }) }} aria-label={levels.find((l) => l.v === v)?.label} />)}
                  <i className="sc-bline" />
                </div>
                <Badge club={clubs[1]} size={20} />
              </div>
            </section>

            <section className="card sc-sec">
              <div className="row between">
                <span className="small b">Final score</span>
                <span className="row tight">
                  <button className="chip sm" onClick={roll}><Icon name="refresh" size={13} /> Randomize</button>
                  <button className={`chip sm ${s.score ? 'on' : ''}`} onClick={() => { haptic(); set({ score: s.score ? undefined : [Math.max(1, goalsFor(s, 0)), goalsFor(s, 1)] }) }}>{s.score ? 'Fixed' : 'Let it play out'}</button>
                </span>
              </div>
              {s.score && (
                <div className="sc-scoreset">
                  <Badge club={clubs[0]} size={22} />
                  <Stepper value={s.score[0]} min={goalsFor(s, 0)} max={12} label={`${clubs[0].short} goals`} onChange={(v) => set({ score: [v, s.score![1]] })} />
                  <span className="dim">–</span>
                  <Stepper value={s.score[1]} min={goalsFor(s, 1)} max={12} label={`${clubs[1].short} goals`} onChange={(v) => set({ score: [s.score![0], v] })} />
                  <Badge club={clubs[1]} size={22} />
                </div>
              )}
              <div className="tiny dim" style={{ marginTop: 6 }}>{s.score ? `Goals you don't script come from the run of play${knockout && s.score[0] === s.score[1] ? '; a draw in a knockout still goes to extra time and penalties' : ''}.` : `Randomize rolls a plausible score from the teams' strength (most likely ${pred.likely[0]}–${pred.likely[1]}).`}</div>
            </section>

            <section className="card sc-sec">
              <div className="row between"><span className="small b">Moments</span><span className="tiny dim">{(s.events || []).length || 'None yet'}</span></div>
              {(s.events || []).length > 0 && <Timeline w={w} events={s.events!} colors={colors} knockout={knockout} />}
              {(s.events || []).slice().sort((a, b) => a.min - b.min || (a.add || 0) - (b.add || 0)).map((e) => {
                const p = e.player ? w.players[e.player] : undefined
                const as = e.assist && e.assist > 0 ? w.players[e.assist] : undefined
                return (
                  <div key={e.id} className="sc-ev">
                    <span className="sc-min num">{minLabel(e)}</span>
                    <span className="sc-ic">{e.kind === 'goal' ? <Ball size={14} /> : e.kind === 'pen' ? (e.pen === 'goal' || !e.pen ? <Ball size={14} /> : <MissedPen size={14} />) : <i className={`card-${e.kind === 'red' ? 'r' : 'y'}`} />}</span>
                    {p ? <Face p={p} size={24} radius={12} club={clubs[e.side]} /> : <span className="sc-auto sm"><Icon name="refresh" size={11} /></span>}
                    <span className="grow small" style={{ minWidth: 0 }}>
                      <b>{p ? callName(p.name) : 'Auto'}</b>
                      <span className="dim"> · {e.kind === 'goal' ? (as ? <>assist {callName(as.name)}</> : e.assist === AUTO_ASSIST ? 'auto assist' : 'goal') : e.kind === 'pen' ? `penalty ${e.pen === 'saved' ? 'saved' : e.pen === 'miss' ? 'missed' : 'scored'}${e.card && e.card !== 'none' ? ` · ${e.card} for the foul` : ''}` : e.kind === 'red' ? 'sent off' : 'booked'}</span>
                    </span>
                    <Badge club={clubs[e.side]} size={16} />
                    <button className={`sc-x ${adding?.id === e.id ? 'on' : ''}`} onClick={() => { haptic(); setAdding({ ...e }) }} aria-label="Edit"><Icon name="edit" size={12} /></button>
                    <button className="sc-x" onClick={() => { haptic(); set({ events: (s.events || []).filter((x) => x.id !== e.id) }) }} aria-label="Remove"><Icon name="close" size={13} strokeWidth={2.5} /></button>
                  </div>
                )
              })}
              {!adding && (
                <div className="sc-add">
                  {(['goal', 'pen', 'yellow', 'red'] as const).map((k) => (
                    <button key={k} className="chip sm" onClick={() => { haptic(); setAdding({ id: uid(), kind: k, side: 0, player: AUTO, ...(k === 'goal' ? { assist: AUTO_ASSIST } : {}), min: k === 'goal' ? 30 : 60, ...(k === 'pen' ? { pen: 'goal' as const } : {}) }) }}>
                      {k === 'goal' ? <Ball size={12} /> : k === 'pen' ? <Icon name="target" size={13} /> : <i className={`card-${k === 'red' ? 'r' : 'y'}`} />} {k === 'goal' ? 'Goal' : k === 'pen' ? 'Penalty' : k === 'red' ? 'Red card' : 'Yellow card'}
                    </button>
                  ))}
                </div>
              )}
              {adding && <EventForm w={w} e={adding} squads={squads} clubs={clubs} knockout={knockout} onChange={setAdding} onCancel={() => setAdding(undefined)}
                onDone={(e) => { haptic('medium'); set({ events: [...(s.events || []).filter((x) => x.id !== e.id), e] }); setAdding(undefined) }} editing={(s.events || []).some((x) => x.id === adding.id)} />}
            </section>

            <section className="card sc-sec">
              <div className="row between"><span className="small b">The feel of it</span></div>
              {feelControls}
            </section>

            <section className="card sc-sec">
              <div className="row between"><span className="small b">Performances</span><span className="tiny dim">{Object.keys(s.form || {}).length || 'Everyone as usual'}</span></div>
              {Object.entries(s.form || {}).map(([id, lv]) => {
                const p = w.players[Number(id)]
                if (!p) return null
                return (
                  <div key={id} className="sc-ev">
                    <Face p={p} size={26} radius={13} club={w.clubs[p.clubId]} />
                    <span className="grow small b ellipsis">{callName(p.name)}</span>
                    <span className={`sc-lv l${lv}`}>{LEVEL_NAME[lv]}</span>
                    <button className="sc-x" onClick={() => { haptic(); const n = { ...(s.form || {}) }; delete n[Number(id)]; set({ form: n }) }} aria-label="Remove"><Icon name="close" size={13} strokeWidth={2.5} /></button>
                  </div>
                )
              })}
              <div className="sc-add">
                {([0, 1] as const).map((i) => <button key={i} className={`chip sm ${formFor === i ? 'on' : ''}`} onClick={() => { haptic(); setFormFor(formFor === i ? undefined : i) }}><Badge club={clubs[i]} size={14} /> {clubs[i].short} players</button>)}
              </div>
              {formFor != null && (
                <div className="sc-form fade-up">
                  {[...squads[formFor].xi, ...squads[formFor].bench].map((p, i) => {
                    const lv = s.form?.[p.id] ?? 0
                    return (
                      <div key={p.id} className={`sc-frow ${i === 11 ? 'first-bench' : ''}`}>
                        <Face p={p} size={26} radius={13} club={clubs[formFor]} />
                        <span className="small ellipsis grow">{callName(p.name)} <span className="dim tiny">{p.positions[0]}{i >= 11 ? ' · bench' : ''}</span></span>
                        <div className="sc-lvs">{([-2, -1, 0, 1, 2] as ScriptLevel[]).map((v) => <button key={v} className={`sc-lvb l${v} ${lv === v ? 'on' : ''}`} onClick={() => { haptic(); const n = { ...(s.form || {}) }; if (v) n[p.id] = v; else delete n[p.id]; set({ form: n }) }} title={LEVEL_NAME[v]}>{v === 0 ? '·' : v > 0 ? '+'.repeat(v) : '−'.repeat(-v)}</button>)}</div>
                      </div>
                    )
                  })}
                  <div className="tiny dim" style={{ marginTop: 6 }}>− − nightmare · − off day · + sharp · + + inspired. They play it out: a sharp striker gets more right, he isn't handed goals.</div>
                </div>
              )}
            </section>

            {squads.some((x) => !x.user) && (
              <section className="card sc-sec">
                <div className="row between"><span className="small b">Line-ups</span></div>
                <div className="sc-add">
                  {([0, 1] as const).filter((i) => !squads[i].user).map((i) => (
                    <button key={i} className={`chip sm ${lineupFor === i ? 'on' : ''}`} onClick={() => { haptic(); setLineupFor(lineupFor === i ? undefined : i) }}>
                      <Badge club={clubs[i]} size={14} /> {clubs[i].short}{s.lineups?.[String(i) as '0' | '1'] ? ' · set' : ''}
                    </button>
                  ))}
                </div>
                {lineupFor != null && <LineupPicker w={w} clubId={squads[lineupFor].id} start={squads[lineupFor]} onSave={(l) => { haptic('medium'); set({ lineups: { ...(s.lineups || {}), [String(lineupFor)]: l } }); setLineupFor(undefined) }}
                  onReset={() => { const n = { ...(s.lineups || {}) }; delete n[String(lineupFor) as '0' | '1']; set({ lineups: Object.keys(n).length ? n : undefined }); setLineupFor(undefined) }} />}
              </section>
            )}
          </div>
        )}

        </div>
        <div className="ed-foot sc-foot">
          {existing && <button className="btn sm" onClick={clear}><Icon name="trash" size={15} /> Clear</button>}
          <button className="btn sm ed-apply grow" onClick={save}><Icon name="check" size={16} /> Save script</button>
        </div>
      </div>
    </Sheet>
  )
}

type Squad = { id: number; user: boolean; xi: Player[]; bench: Player[]; formation: string }

/** The scripted moments on a match clock: the home side above the line, the away side below. */
function Timeline({ w, events, colors, knockout }: { w: World; events: ScriptEvent[]; colors: [string, string]; knockout: boolean }) {
  const end = knockout && events.some((e) => e.min > 90) ? 120 : 90
  const x = (e: ScriptEvent) => `${Math.min(100, ((e.min + (e.add || 0) * 0.4) / end) * 100)}%`
  return (
    <div className="sc-tl">
      <i className="sc-tl-line" />
      <i className="sc-tl-ht" style={{ left: `${(45 / end) * 100}%` }} />
      {end === 120 && <i className="sc-tl-ht" style={{ left: '75%' }} />}
      {events.map((e) => (
        <span key={e.id} className={`sc-tl-m ${e.side ? 'away' : 'home'}`} style={{ left: x(e), ['--c' as any]: colors[e.side] }} title={`${minLabel(e)} ${e.player ? callName(w.players[e.player]?.name || '') : 'Auto'}`}>
          {e.kind === 'goal' || (e.kind === 'pen' && (e.pen ?? 'goal') === 'goal') ? <Ball size={11} /> : e.kind === 'pen' ? <MissedPen size={11} /> : <i className={`card-${e.kind === 'red' ? 'r' : 'y'}`} />}
        </span>
      ))}
      <span className="sc-tl-lab l">0'</span><span className="sc-tl-lab c" style={{ left: `${(45 / end) * 100}%` }}>HT</span><span className="sc-tl-lab r">{end}'</span>
    </div>
  )
}

/** Players as face tiles, the starters then the bench; AUTO (the engine picks) and None where they apply. */
function PlayerPicker({ list, bench, value, onPick, auto, none, club }: { list: Player[]; bench: Set<number>; value?: number; onPick: (id: number | undefined) => void; auto?: number; none?: boolean; club: World['clubs'][number] }) {
  const starters = list.filter((p) => !bench.has(p.id)), subs = list.filter((p) => bench.has(p.id))
  const tile = (p: Player) => (
    <button key={p.id} className={`sc-pt ${value === p.id ? 'on' : ''} ${bench.has(p.id) ? 'bench' : ''}`} onClick={() => { haptic(); onPick(p.id) }}>
      <Face p={p} size={34} radius={17} club={club} />
      <span className="sc-pt-n ellipsis">{callName(p.name)}</span>
      <span className="sc-pt-p">{p.jersey ? `${p.jersey} · ` : ''}{p.positions[0]}</span>
    </button>
  )
  return (
    <div className="sc-pick">
      <div className="sc-pgrid">
        {auto != null && <button className={`sc-pt special ${value === auto ? 'on' : ''}`} onClick={() => { haptic(); onPick(auto) }}><span className="sc-auto"><Icon name="refresh" size={16} /></span><span className="sc-pt-n">Auto</span><span className="sc-pt-p">Engine picks</span></button>}
        {none && <button className={`sc-pt special ${value == null ? 'on' : ''}`} onClick={() => { haptic(); onPick(undefined) }}><span className="sc-auto none"><Icon name="close" size={15} /></span><span className="sc-pt-n">None</span><span className="sc-pt-p">Solo goal</span></button>}
        {starters.map(tile)}
      </div>
      {subs.length > 0 && <><div className="tiny dim sc-pick-h">Bench</div><div className="sc-pgrid">{subs.map(tile)}</div></>}
    </div>
  )
}

function EventForm({ w, e, squads, clubs, knockout, onChange, onCancel, onDone, editing }: {
  w: World; e: ScriptEvent; squads: Squad[]; clubs: readonly [World['clubs'][number], World['clubs'][number]]; knockout: boolean; editing?: boolean
  onChange: (e: ScriptEvent) => void; onCancel: () => void; onDone: (e: ScriptEvent) => void
}) {
  const sq = squads[e.side]
  const all = [...sq.xi, ...sq.bench]
  const bench = new Set(sq.bench.map((p) => p.id))
  const maxMin = knockout ? 120 : 90
  const endOfHalf = e.min === 45 || e.min === 90 || e.min === 105 || e.min === 120
  const up = (p: Partial<ScriptEvent>) => onChange({ ...e, ...p })
  const what = e.kind === 'goal' ? 'goal' : e.kind === 'pen' ? 'penalty' : e.kind === 'red' ? 'red card' : 'yellow card'
  return (
    <div className="sc-evform fade-up">
      <div className="sc-sides">
        {([0, 1] as const).map((i) => <button key={i} className={`sc-sidebtn ${e.side === i ? 'on' : ''}`} onClick={() => { haptic(); up({ side: i, player: AUTO, assist: e.kind === 'goal' ? AUTO_ASSIST : undefined }) }}><Badge club={clubs[i]} size={20} /><b className="ellipsis">{clubs[i].short}</b></button>)}
      </div>
      <div className="tiny dim sc-pick-h">{e.kind === 'goal' ? 'Scorer' : e.kind === 'pen' ? 'Taker' : 'Player'}</div>
      <PlayerPicker list={all} bench={bench} value={e.player} club={clubs[e.side]} auto={AUTO} onPick={(id) => up({ player: id ?? AUTO, assist: e.assist === id ? AUTO_ASSIST : e.assist })} />
      {e.kind === 'goal' && (
        <>
          <div className="tiny dim sc-pick-h">Assist</div>
          <PlayerPicker list={all.filter((p) => p.id !== e.player)} bench={bench} value={e.assist} club={clubs[e.side]} auto={AUTO_ASSIST} none onPick={(id) => up({ assist: id })} />
        </>
      )}
      {e.kind === 'pen' && (
        <>
          <div className="tiny dim sc-pick-h">Outcome</div>
          <Seg small items={[{ id: 'goal', label: 'Scored' }, { id: 'saved', label: 'Saved' }, { id: 'miss', label: 'Missed' }]} value={e.pen || 'goal'} onChange={(v) => up({ pen: v as ScriptEvent['pen'] })} />
          <div className="row" style={{ gap: 12, marginTop: 10, alignItems: 'flex-start' }}>
            <div>
              <div className="tiny dim" style={{ margin: '0 2px 5px' }}>Placement</div>
              <div className="sc-goal">
                {(['TL', 'TR', 'BL', 'C', 'BR'] as const).map((k) => <button key={k} className={`sc-spot s-${k} ${e.spot === k ? 'on' : ''}`} onClick={() => { haptic(); up({ spot: e.spot === k ? undefined : k }) }} aria-label={k} />)}
              </div>
            </div>
            <div className="grow">
              <div className="tiny dim" style={{ margin: '0 2px 5px' }}>Keeper dives</div>
              <Seg small items={[{ id: 'L', label: 'Left' }, { id: 'C', label: 'Stays' }, { id: 'R', label: 'Right' }, { id: '', label: 'Auto' }]} value={e.dive || ''} onChange={(v) => up({ dive: (v || undefined) as ScriptEvent['dive'] })} />
              <div className="tiny dim" style={{ marginTop: 6 }}>From the taker's side. Untouched, the taker and keeper decide.</div>
            </div>
          </div>
          <div className="tiny dim sc-pick-h">Card for the foul</div>
          <Seg small items={[{ id: '', label: 'Referee' }, { id: 'none', label: 'None' }, { id: 'yellow', label: 'Yellow' }, { id: 'red', label: 'Red' }]} value={e.card || ''} onChange={(v) => { haptic(); up({ card: (v || undefined) as ScriptEvent['card'] }) }} />
        </>
      )}
      <div className="ed-line" style={{ marginTop: 12 }}>
        <span className="small">Minute</span>
        <span className="row tight">
          <Stepper value={e.min} min={1} max={maxMin} label="Minute" onChange={(v) => up({ min: v, add: v === 45 || v === 90 || v === 105 || v === 120 ? e.add : undefined })} fmt={(v) => `${v}'`} />
          {endOfHalf && <Stepper value={e.add || 0} min={0} max={e.min === 90 ? 8 : 5} label="Stoppage time" onChange={(v) => up({ add: v || undefined })} fmt={(v) => (v ? `+${v}` : '+0')} />}
        </span>
      </div>
      {e.min > 90 && <div className="tiny dim">Extra-time moments only happen if the match goes to extra time.</div>}
      {sq.bench.some((p) => p.id === e.player || p.id === e.assist) && <div className="tiny" style={{ color: 'var(--gold)', marginTop: 4 }}>Starting on the bench: he comes on before the moment if a change is left.</div>}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn sm" onClick={onCancel}>Cancel</button>
        <button className="btn sm ed-apply grow" onClick={() => onDone(e)}>
          {e.kind === 'goal' ? <Boot size={14} /> : <Icon name={editing ? 'check' : 'plus'} size={15} />} {editing ? 'Update' : 'Add'} {what} · {minLabel(e)}
        </button>
      </div>
    </div>
  )
}

/** Choose an AI side's XI and bench for the match, in any formation. */
function LineupPicker({ w, clubId, start, onSave, onReset }: { w: World; clubId: number; start: Squad; onSave: (l: { formation: string; lineup: number[]; bench: number[] }) => void; onReset: () => void }) {
  // (a national side picks from its called-up squad)
  const squad = squadOf(w, clubId).filter((p) => !p.injury).sort((a, b) => (a.positions[0] === 'GK' ? -1 : 0) - (b.positions[0] === 'GK' ? -1 : 0) || b.ovr - a.ovr)
  const [formation, setFormation] = useState(start.formation)
  const [xi, setXi] = useState<number[]>(start.xi.map((p) => p.id))
  const [bench, setBench] = useState<number[]>(start.bench.map((p) => p.id))
  const club = w.clubs[clubId]
  const cycle = (id: number) => {
    haptic()
    if (xi.includes(id)) { setXi(xi.filter((x) => x !== id)); if (bench.length < 12) setBench([...bench, id]) }
    else if (bench.includes(id)) setBench(bench.filter((x) => x !== id))
    else if (xi.length < 11) setXi([...xi, id])
    else if (bench.length < 12) setBench([...bench, id])
  }
  const common = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', '5-3-2', '4-1-2-1-2', '4-5-1']
  const forms = FORMATIONS.filter((f) => common.some((c) => f.name.startsWith(c))).slice(0, 10)
  return (
    <div className="sc-form fade-up">
      <div className="sc-chips" style={{ marginBottom: 8 }}>{forms.map((f) => <button key={f.id} className={`chip sm ${formation === f.id ? 'on' : ''}`} onClick={() => { haptic(); setFormation(f.id) }}>{f.name}</button>)}</div>
      <div className="tiny dim" style={{ margin: '0 2px 6px' }}>Tap to cycle: starting XI · bench · left out. <b style={{ color: xi.length === 11 ? 'var(--pos)' : 'var(--warn)' }}>XI {xi.length}/11</b> · bench {bench.length}</div>
      {squad.map((p) => {
        const st = xi.includes(p.id) ? 'xi' : bench.includes(p.id) ? 'bench' : 'out'
        return (
          <button key={p.id} className={`sc-lrow ${st}`} onClick={() => cycle(p.id)}>
            <span className={`sc-lst ${st}`}>{st === 'xi' ? 'XI' : st === 'bench' ? 'SUB' : '—'}</span>
            <Face p={p} size={26} radius={13} club={club} />
            <span className="small ellipsis grow" style={{ textAlign: 'left' }}>{callName(p.name)}</span>
            <span className="tiny dim">{p.positions[0]}</span>
            <b className="num small" style={{ width: 24, textAlign: 'right' }}>{p.ovr}</b>
          </button>
        )
      })}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn sm" onClick={onReset}>AI picks</button>
        <button className="btn sm ed-apply grow" disabled={xi.length !== 11} onClick={() => onSave({ formation, lineup: assignToFormation(xi.map((id) => w.players[id]), formation), bench })}>Use this line-up · {formationOf(formation).name}</button>
      </div>
    </div>
  )
}
