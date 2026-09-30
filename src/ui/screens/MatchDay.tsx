// Match day (pre-match), FotMob-style: header, preview (prediction, storylines, form, key players, season stats),
// editable line-ups on the pitch for both teams, league table and head-to-head, with play / quick sim / press.
import { createOthers } from '../../engine/world/liveDay'
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Fixture, Player, TeamSheet, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, Ovr, PosChip } from '../components/atoms'
import { Screen, Seg, Sheet, Tabs } from '../components/layout'
import { FORMATIONS, formationOf, MENTALITIES } from '../../domain/constants'
import { fmtDate } from '../../domain/dates'
import { attendanceFor, createSim, sideInput } from '../../engine/world/matchRunner'
import { kitColors, kitVars } from '../components/LivePitch'
import { validateSheet } from '../../engine/match/selection'
import { userFixtureOn } from '../../engine/world/advance'
import { compLogoKey, fixturesOf, leagueOf, outcomeFor, playerStatus } from '../selectors'
import { sortTable, zoneFor, ZONE_COLOR, ZONE_LABEL } from '../../engine/competitions/tables'
import { aggregateBefore } from '../../engine/competitions/cups'
import { callName } from '../../engine/match/commentary'
import { posRating } from '../../domain/ratings'
import { MatchLineup, sideFromSheet, type LineupTap, RatingPill } from '../components/Lineup'
import { buildSheet, setPieceTakers } from '../../engine/match/selection'
import { rosterOf } from '../../engine/world/roster'
import { storyLines } from '../../engine/world/storylines'
import { Bracket, TableView } from './Competitions'
import { FixtureRow, assignToFormation } from './Match'
import { swapInSheet } from './Tactics'
import { ordinal } from './Menu'
import { useRemember } from '../memory'
import { ScriptEditor } from '../components/ScriptEditor'

function poisson(l: number, k: number) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p }

/** Outcome probabilities from both XIs' quality and home advantage (independent Poisson goals). */
export function winProbability(w: World, f: Fixture, hl: number[], al: number[]): [number, number, number] {
  const avg = (ids: number[]) => { const v = ids.map((id) => w.players[id]?.ovr || 60); return v.reduce((a, b) => a + b, 0) / (v.length || 1) }
  const diff = avg(hl) - avg(al) + (f.neutral ? 0 : 2.2)
  const lh = 1.38 * Math.exp(diff / 13), la = 1.12 * Math.exp(-diff / 13)
  let h = 0, d = 0, a = 0
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = poisson(lh, i) * poisson(la, j); if (i > j) h += p; else if (i === j) d += p; else a += p }
  const t = h + d + a
  return [h / t, d / t, a / t]
}

function seasonLine(p: Player) {
  const s = Object.values(p.season).reduce((a, x) => ({ apps: a.apps + x.apps, g: a.g + x.goals, as: a.as + x.assists, r: a.r + x.ratingSum, n: a.n + x.rated, cs: a.cs + x.cleanSheets }), { apps: 0, g: 0, as: 0, r: 0, n: 0, cs: 0 })
  return { ...s, avg: s.n ? s.r / s.n : 0 }
}

export function PreMatch({ params }: { params?: { id?: string } }) {
  const w = useWorld()
  const close = useGame((s) => s.close)
  const closeAll = useGame((s) => s.closeAll)
  const open = useGame((s) => s.open)
  const go = useGame((s) => s.go)
  const mutate = useGame((s) => s.mutate)
  const setLive = useGame((s) => s.setLive)
  const prefs = useGame((s) => s.prefs)
  const finish = useGame((s) => s.finishUserMatch)
  const [tab, setTab] = useRemember<'preview' | 'lineups' | 'table' | 'bracket' | 'h2h'>('tab', 'preview')
  const [pick, setPick] = useState<LineupTap>()
  const [formOpen, setFormOpen] = useState(false)
  const [scripting, setScripting] = useState(false)
  const todayFx = userFixtureOn(w, w.date)
  const f = params?.id ? w.fixtures[params.id] : todayFx
  const isToday = !!f && !!todayFx && f.id === todayFx.id
  const lines = useMemo(() => (f ? storyLines(w, f) : []), [f?.id, w.date])
  if (!f) return <Screen title="Match Day" back onBack={close} noNav><div className="pad muted">No match today.</div></Screen>

  const comp = w.competitions[f.compId]
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const us: 0 | 1 = f.home === w.userClubId ? 0 : 1
  const club = w.clubs[w.userClubId]
  const sheet = club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
  const { sheet: valid, issues } = validateSheet(w, club, sheet, comp)
  const oppId = us === 0 ? f.away : f.home
  const oppSheet = sideInput(w, oppId, comp, false).sheet
  const ourSide = sideFromSheet(w, club.id, valid, comp, 'Your XI')
  const oppSide = sideFromSheet(w, oppId, oppSheet, comp, 'Predicted')
  const homeSide = us === 0 ? ourSide : oppSide, awaySide = us === 0 ? oppSide : ourSide
  const [ph, pd, pa] = winProbability(w, f, homeSide.xi.map((x) => x?.id || 0), awaySide.xi.map((x) => x?.id || 0))
  // the competition this match belongs to decides the table: the league, the league phase, or the knockout draw
  const knockout = !!f.tieId
  const ctxTable = comp?.table && !knockout && comp.table.some((r) => r.clubId === f.home) ? comp : undefined
  const hasBracket = knockout && !!comp?.rounds.length
  const pos = (id: number) => { const c = ctxTable || (knockout ? undefined : leagueOf(w, id)); if (!c?.table?.some((r) => r.p)) return undefined; const i = sortTable(w, c).findIndex((r) => r.clubId === id); return i >= 0 ? i + 1 : undefined }
  const pressDone = !!w.flags.pressDone?.[`pre:${f.id}`]

  const edit = (fn: (s: TeamSheet) => void) => mutate((w) => { const c = w.clubs[w.userClubId]; const s = c.sheets.find((x) => x.id === c.activeSheet) || c.sheets[0]; fn(s) })

  const start = (mode: 'live' | 'sim') => {
    haptic('medium')
    Object.assign(sheet, valid)
    const sim = createSim(w, f, true)
    if (mode === 'sim') {
      sim.ctx.assistantSubs = true
      const r = sim.runToEnd()
      finish(f.id, r)
      closeAll()
      open({ name: 'postmatch', params: { id: f.id } })
      return
    }
    setLive({ sim, fixtureId: f.id, speed: prefs.matchSpeed, running: true, tick: 0, finished: false, applied: false, others: createOthers(w, f) })
    closeAll()
    open({ name: 'match' })
  }

  const onTap = (t: LineupTap) => {
    haptic()
    if (t.side !== us) { go({ name: 'player', params: { id: t.id } }); return }
    setPick(t)
  }

  // a remembered Table tab on a knockout match (or the other way round) falls back to what this match has
  const view = tab === 'table' && !ctxTable ? (hasBracket ? 'bracket' : 'preview') : tab === 'bracket' && !hasBracket ? (ctxTable ? 'table' : 'preview') : tab
  const colors = kitColors(home, away)
  return (
    <Screen title={isToday ? 'Match Day' : 'Match Preview'} sub={`${comp?.name} · ${f.roundName}`} back onBack={close} noNav style={kitVars(colors)}
      right={w.meta.editMode ? <button className={`iconbtn edit-btn ${w.scripts?.[f.id] ? 'on' : ''}`} aria-label="Edit match" onClick={() => { haptic('medium'); useGame.getState().notify('Edit match', 'edit'); setScripting(true) }}><Icon name="edit" size={19} strokeWidth={2.1} /></button> : undefined}
      footer={isToday ? (
        <div className="md-footer">
          <button className="btn" onClick={() => start('sim')}><Icon name="skip" size={18} /> Quick sim</button>
          <button className="btn primary grow" onClick={() => start('live')}><Icon name="play" size={20} /> Play match</button>
        </div>
      ) : (
        <div className="md-footer"><div className="md-countdown"><Icon name="clock" size={18} /> Kick-off {fmtDate(f.date, 'long')} · {f.time}</div></div>
      )}>
      <div className="md-head">
        <div className="row tight" style={{ justifyContent: 'center', gap: 8 }}>{comp && <CompLogo k={compLogoKey(comp)} size={20} name={comp.name} />}<span className="tiny b upper" style={{ opacity: 0.8 }}>{comp?.short} · {f.roundName}</span></div>
        <div className="md-teams">
          <button className="md-team" onClick={() => go({ name: 'club', params: { id: home.id } })}><Badge club={home} size={62} /><b>{home.short}</b>{pos(home.id) ? <span className="tiny dim">{ordinal(pos(home.id)!)}</span> : null}</button>
          <div className="col center" style={{ minWidth: 92 }}>
            <div className="display" style={{ fontSize: 30, lineHeight: 1 }}>{f.time}</div>
            <div className="tiny dim" style={{ marginTop: 4 }}>{fmtDate(f.date, 'dm')}</div>
          </div>
          <button className="md-team" onClick={() => go({ name: 'club', params: { id: away.id } })}><Badge club={away} size={62} /><b>{away.short}</b>{pos(away.id) ? <span className="tiny dim">{ordinal(pos(away.id)!)}</span> : null}</button>
        </div>
        <div className="row tight tiny dim" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Icon name="stadium" size={13} /> {f.venue || (f.neutral ? 'Neutral venue' : home.stadium)}
          {f.derby && <><span>·</span><Icon name="fire" size={13} color="#ff8a5c" /><span style={{ color: '#ff8a5c' }}>{f.derby}</span></>}
        </div>
      </div>

      <div className="md-actions">
        <button className="md-act" onClick={() => go({ name: 'tactics' })}><Icon name="tactics" size={20} /><span>Team sheet</span></button>
        <button className="md-act" onClick={() => open({ name: 'press', params: { kind: 'pre', fixtureId: f.id } })} disabled={pressDone || !isToday}><Icon name="chat" size={20} /><span>{pressDone ? 'Press done' : isToday ? 'Press' : 'Match day'}</span></button>
        <button className="md-act" onClick={() => go({ name: 'club', params: { id: oppId } })}><Icon name="scout" size={20} /><span>Opponent</span></button>
      </div>

      {issues.length > 0 && (
        <div className="pad" style={{ marginTop: 10 }}>
          <div className="card pad-card small" style={{ background: 'rgba(255,176,32,.08)' }}>
            <div className="row tight b warn"><Icon name="warning" size={16} /> Team sheet auto-adjusted</div>
            {issues.map((i) => <div key={i} className="muted" style={{ marginTop: 4 }}>{i}</div>)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <Tabs sticky items={[{ id: 'preview', label: 'Preview' }, { id: 'lineups', label: 'Line-ups' }, ...(ctxTable ? [{ id: 'table' as const, label: comp?.format === 'uefa' ? 'League phase' : 'Table' }] : []), ...(hasBracket ? [{ id: 'bracket' as const, label: 'Knockouts' }] : []), { id: 'h2h', label: 'H2H' }]} value={view} onChange={setTab} />
      </div>

      {view === 'preview' && (
        <div className="pad stack" style={{ marginTop: 12 }}>
          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 10 }}>Prediction</div>
            <div className="prob-bar">
              <i style={{ flex: ph, background: 'var(--home-c, #3ea6ff)' }} /><i style={{ flex: pd, background: 'var(--s4)' }} /><i style={{ flex: pa, background: 'var(--away-c, #ff8a3d)' }} />
            </div>
            <div className="row between small" style={{ marginTop: 8 }}>
              <span><b className="num">{Math.round(ph * 100)}%</b> <span className="dim">{home.short}</span></span>
              <span><b className="num">{Math.round(pd * 100)}%</b> <span className="dim">Draw</span></span>
              <span><span className="dim">{away.short}</span> <b className="num">{Math.round(pa * 100)}%</b></span>
            </div>
          </div>

          <Stakes w={w} f={f} />

          {lines.length > 0 && (
            <div className="card">
              <div className="card-h"><span className="label">Storylines</span></div>
              <div className="list">
                {lines.map((l, i) => <div key={i} className="li" style={{ minHeight: 42 }}><Icon name={l.icon} size={17} color="var(--t2)" /><div className="meta small">{l.text}</div></div>)}
              </div>
            </div>
          )}

          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 12 }}>Team form</div>
            {[home.id, away.id].map((id) => <FormStrip key={id} w={w} clubId={id} />)}
          </div>

          <KeyPlayers w={w} ids={[home.id, away.id]} />
          <Absentees w={w} f={f} />
          <SeasonCompare w={w} a={home.id} b={away.id} />

          <div className="card pad-card small">
            <div className="label" style={{ marginBottom: 8 }}>Match info</div>
            <div className="row between"><span className="muted">Stadium</span><b>{f.venue || (f.neutral ? 'Neutral venue' : home.stadium)}</b></div>
            {!f.neutral && <div className="row between" style={{ marginTop: 6 }}><span className="muted">Capacity</span><b>{home.capacity.toLocaleString()}</b></div>}
            <div className="row between" style={{ marginTop: 6 }}><span className="muted">Expected crowd</span><b>{attendanceFor(w, f).toLocaleString()}</b></div>
            <div className="row between" style={{ marginTop: 6 }}><span className="muted">Kick-off</span><b>{fmtDate(f.date, 'long')} · {f.time}</b></div>
          </div>
        </div>
      )}

      {view === 'lineups' && (
        <div className="pad stack" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm grow" style={{ whiteSpace: 'nowrap' }} onClick={() => setFormOpen(true)}><Icon name="grid" size={15} /> {formationOf(valid.formation).name.replace(/[()]/g, '')}</button>
            <button className="btn sm" onClick={() => { haptic('medium'); edit((s) => { const b = buildSheet(w, club, s.formation, s.tactics); s.lineup = b.lineup; s.bench = b.bench; s.roles = b.roles; Object.assign(s, setPieceTakers(w, b.lineup)) }); useGame.getState().notify('Best available XI selected', 'ok') }}><Icon name="refresh" size={15} /> Auto-pick</button>
          </div>
          <div className="card pad-card" style={{ padding: 10 }}>
            <div className="label" style={{ marginBottom: 8 }}>Mentality</div>
            <Seg small items={MENTALITIES.map((m) => ({ id: m, label: m.replace('Ultra ', 'Ultra ').replace('Defensive', 'Def').replace('Attacking', 'Att').replace('Balanced', 'Bal') }))} value={valid.tactics.mentality} onChange={(m) => { haptic(); edit((s) => { s.tactics.mentality = m }) }} />
          </div>
          <MatchLineup w={w} home={homeSide} away={awaySide} mode="sheet" onTap={onTap} sel={pick?.id} benchTitle="Bench" />
          <div className="tiny dim" style={{ textAlign: 'center' }}>Tap one of your players to swap, change captain or set-piece duties. Tap an opponent to scout him.</div>
        </div>
      )}

      {view === 'table' && ctxTable && <TableView w={w} c={ctxTable} compact highlight={[home.id, away.id]} />}
      {view === 'bracket' && comp && <Bracket w={w} c={comp} />}

      {view === 'h2h' && <H2H w={w} f={f} />}

      <PickSheet w={w} t={pick} sheet={valid} onClose={() => setPick(undefined)} edit={edit} comp={comp} />
      {scripting && <ScriptEditor w={w} f={f} onClose={() => setScripting(false)} />}
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title="Formation">
        <div className="row wrap" style={{ gap: 7 }}>
          {FORMATIONS.map((fm) => (
            <button key={fm.id} className={`chip ${fm.id === valid.formation ? 'on' : ''}`} onClick={() => {
              haptic('medium')
              edit((s) => {
                const players = s.lineup.map((id) => w.players[id]).filter(Boolean)
                const ids = assignToFormation(players, fm.id)
                s.formation = fm.id
                s.lineup = ids
                s.roles = buildSheet(w, club, fm.id, s.tactics).roles
              })
              setFormOpen(false)
            }}>{fm.name}</button>
          ))}
        </div>
      </Sheet>
    </Screen>
  )
}

export function FormStrip({ w, clubId }: { w: World; clubId: number }) {
  const go = useGame((s) => s.go)
  const games = fixturesOf(w, clubId).filter((x) => x.played && x.result).slice(-5)
  const club = w.clubs[clubId]
  return (
    <div className="row" style={{ gap: 8, marginBottom: 10 }}>
      <Badge club={club} size={22} />
      <div className="row grow" style={{ gap: 6, justifyContent: 'flex-end' }}>
        {games.length === 0 && <span className="tiny dim">No games yet this season</span>}
        {games.map((x) => {
          const o = outcomeFor(x, clubId)!
          const opp = w.clubs[x.home === clubId ? x.away : x.home]
          return (
            <button key={x.id} className="form-chip" onClick={() => go({ name: 'fixture', params: { id: x.id } })}>
              <span className={`fc-score ${o}`}>{x.result!.score[0]}-{x.result!.score[1]}</span>
              <Badge club={opp} size={18} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function KeyPlayers({ w, ids }: { w: World; ids: number[] }) {
  const go = useGame((s) => s.go)
  const pickFor = (id: number) => {
    const ps = rosterOf(w, id).filter((p) => !p.injury)
    const withStats = ps.map((p) => ({ p, s: seasonLine(p) }))
    const played = withStats.filter((x) => x.s.n >= 2)
    if (played.length >= 3) return played.sort((a, b) => b.s.avg - a.s.avg).slice(0, 2)
    return withStats.sort((a, b) => b.p.ovr - a.p.ovr).slice(0, 2)
  }
  return (
    <div className="card">
      <div className="card-h"><span className="label">Players to watch</span></div>
      <div className="kp-grid">
        {ids.map((id) => (
          <div key={id}>
            {pickFor(id).map(({ p, s }) => (
              <button key={p.id} className="kp" onClick={() => go({ name: 'player', params: { id: p.id } })}>
                <Face p={p} size={46} radius={23} club={w.clubs[id]} />
                <div className="small b ellipsis" style={{ maxWidth: '100%' }}>{callName(p.name)}</div>
                <div className="tiny dim">{s.n ? `${s.g} G · ${s.as} A · ${s.apps} apps` : `${p.positions[0]} · ${p.ovr} OVR`}</div>
                {s.n > 0 && <RatingPill v={Math.round(s.avg * 100) / 100} size="sm" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** What the result means: league positions for a win, draw or defeat; the knockout situation; the prize in a final. */
function Stakes({ w, f }: { w: World; f: Fixture }) {
  const comp = w.competitions[f.compId]
  if (!comp) return null
  const me = w.userClubId
  const them = f.home === me ? f.away : f.home
  const us = w.clubs[me], opp = w.clubs[them]
  const ri = comp.rounds.findIndex((r) => r.id === f.roundId)
  const nextRound = ri >= 0 ? comp.rounds[ri + 1] : undefined
  const final = /final/i.test(f.roundName) && !/semi|quarter/i.test(f.roundName)

  if (!f.tieId && comp.table?.some((r) => r.clubId === me)) {
    const t = sortTable(w, comp)
    const row = t.find((r) => r.clubId === me)!
    if (!row.p && comp.format !== 'uefa') return null
    const now = t.findIndex((r) => r.clubId === me) + 1
    const project = (gf: number, ga: number) => {
      const rows = t.map((r) => ({ id: r.clubId, pts: r.pts - (r.ded || 0), gd: r.gf - r.ga, gf: r.gf }))
      const a = rows.find((r) => r.id === me)!, b = rows.find((r) => r.id === them)
      const pa = gf > ga ? 3 : gf === ga ? 1 : 0, pb = gf < ga ? 3 : gf === ga ? 1 : 0
      a.pts += pa; a.gd += gf - ga; a.gf += gf
      if (b) { b.pts += pb; b.gd += ga - gf; b.gf += ga }
      rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf)
      return rows.findIndex((r) => r.id === me) + 1
    }
    const outs: { k: string; pos: number }[] = [{ k: 'Win', pos: project(1, 0) }, { k: 'Draw', pos: project(1, 1) }, { k: 'Defeat', pos: project(0, 1) }]
    return (
      <div className="card pad-card">
        <div className="row between" style={{ marginBottom: 10 }}><span className="label">What's at stake</span><span className="tiny dim">{us.short} now {ordinal(now)}</span></div>
        <div className="stk-grid">
          {outs.map((o) => {
            const z = zoneFor(w, comp, o.pos, t.length)
            const d = now - o.pos
            return (
              <div key={o.k} className={`stk k-${o.k}`}>
                <span className="tiny dim">{o.k}</span>
                <b className="display">{ordinal(o.pos)}</b>
                <span className={`tiny stk-d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : 'No change'}</span>
                {z && <span className="tiny stk-z"><i style={{ background: ZONE_COLOR[z] }} />{ZONE_LABEL[z]}</span>}
              </div>
            )
          })}
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>If every other result stays as it is.</div>
      </div>
    )
  }

  if (f.tieId || comp.format === 'supercup' || final) {
    const agg = f.leg === 2 ? aggregateBefore(w, f) : undefined
    const home = f.home === me
    const [ua, ta] = agg ? (home ? [agg[0], agg[1]] : [agg[1], agg[0]]) : [0, 0]
    const d = ua - ta
    const et = comp.rules.extraTime !== false
    const lines: string[] = []
    if (final) lines.push(`The winner lifts the ${comp.name} trophy.`)
    else if (f.leg === 1) {
      const l2 = Object.values(w.fixtures).find((x) => x.tieId === f.tieId && x.leg === 2)
      lines.push(`First leg. The return is ${l2 ? `${l2.home === me ? 'at home' : 'away'} on ${fmtDate(l2.date, 'long')}` : 'still to come'}.`)
    } else if (agg) {
      lines.push(`Aggregate ${us.short} ${ua}–${ta} ${opp.short}.`)
      lines.push(d > 0 ? `${us.short} lead by ${d}: any draw takes them through; ${d === 1 ? 'a one-goal defeat' : `losing by ${d}`} means ${et ? 'extra time' : 'penalties'}.`
        : d === 0 ? `All square: the winner on the night goes through, a draw means ${et ? 'extra time' : 'penalties'}.`
          : `${us.short} trail by ${-d}: win by ${-d + 1} to go through, by ${-d} to force ${et ? 'extra time' : 'penalties'}.`)
    } else lines.push(`Knockout: win and you're through${et ? '; a draw goes to extra time and penalties' : '; a draw goes straight to penalties'}.`)
    if (!final && nextRound && f.leg !== 1) lines.push(`Next: the ${nextRound.name.toLowerCase()}${nextRound.drawn ? '' : ', drawn after this round'}.`)
    return (
      <div className="card pad-card">
        <div className="row tight" style={{ marginBottom: 8 }}>{final ? <Icon name="trophy" size={16} color="var(--gold)" /> : <Icon name="bracket" size={16} color="var(--t2)" />}<span className="label">What's at stake</span></div>
        {lines.map((l) => <div key={l} className="small" style={{ marginTop: 4 }}>{l}</div>)}
      </div>
    )
  }
  return null
}

/** Who is missing: injuries, suspensions and international duty, both sides. */
function Absentees({ w, f }: { w: World; f: Fixture }) {
  const go = useGame((s) => s.go)
  const comp = w.competitions[f.compId]
  const out = (id: number) => rosterOf(w, id).map((p) => ({ p, s: playerStatus(w, p, comp) }))
    .filter((x) => x.s.key === 'injured' || x.s.key === 'suspended' || x.s.key === 'intl').sort((a, b) => b.p.ovr - a.p.ovr)
  const sides = [f.home, f.away].map((id) => ({ id, list: out(id) }))
  const why = (p: Player, key: string) => key === 'injured' && p.injury ? `${p.injury.type} · back ${fmtDate(p.injury.until, 'dm')}` : key === 'suspended' ? 'Suspended' : 'International duty'
  if (!sides[0].list.length && !sides[1].list.length) return <div className="card pad-card small muted row tight"><Icon name="check" size={16} color="var(--pos)" /> Both squads are fully available.</div>
  return (
    <div className="card">
      <div className="card-h"><span className="label">Unavailable</span></div>
      <div className="kp-grid">
        {sides.map(({ id, list }) => (
          <div key={id} className="abs-col">
            {list.length === 0 && <div className="tiny dim" style={{ padding: 12 }}>Nobody missing</div>}
            {list.slice(0, 5).map(({ p, s }) => (
              <button key={p.id} className="abs" onClick={() => go({ name: 'player', params: { id: p.id } })}>
                <Face p={p} size={30} radius={15} club={w.clubs[id]} />
                <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                  <span className="small b ellipsis" style={{ display: 'block' }}>{callName(p.name)}</span>
                  <span className="tiny ellipsis" style={{ display: 'block', color: s.color }}><Icon name={s.icon} size={10} /> {why(p, s.key)}</span>
                </span>
                <span className="tiny dim num">{p.ovr}</span>
              </button>
            ))}
            {list.length > 5 && <div className="tiny dim" style={{ padding: '0 12px 10px' }}>+{list.length - 5} more</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SeasonCompare({ w, a, b }: { w: World; a: number; b: number }) {
  const stat = (id: number) => {
    const g = fixturesOf(w, id).filter((x) => x.played && x.result && w.competitions[x.compId]?.season === w.season)
    let gf = 0, ga = 0, cs = 0, wins = 0
    for (const x of g) { const h = x.home === id; const s = x.result!.score; gf += h ? s[0] : s[1]; ga += h ? s[1] : s[0]; if ((h ? s[1] : s[0]) === 0) cs++; if (outcomeFor(x, id) === 'W') wins++ }
    return { n: g.length, gf, ga, cs, wins }
  }
  const A = stat(a), B = stat(b)
  if (!A.n && !B.n) return null
  const rows: [string, number, number, boolean][] = [
    ['Matches played', A.n, B.n, true], ['Wins', A.wins, B.wins, true], ['Goals per match', A.n ? A.gf / A.n : 0, B.n ? B.gf / B.n : 0, true],
    ['Conceded per match', A.n ? A.ga / A.n : 0, B.n ? B.ga / B.n : 0, false], ['Clean sheets', A.cs, B.cs, true],
  ]
  return (
    <div className="card pad-card">
      <div className="row between" style={{ marginBottom: 6 }}><Badge club={w.clubs[a]} size={22} /><span className="label">Season so far</span><Badge club={w.clubs[b]} size={22} /></div>
      {rows.map(([l, x, y, higher]) => {
        const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2))
        const aBetter = higher ? x > y : x < y, bBetter = higher ? y > x : y < x
        return (
          <div key={l} className="cmp-row">
            <span className={`cmp-v ${aBetter ? 'on h' : ''}`}>{fmt(x)}</span>
            <span className="small muted">{l}</span>
            <span className={`cmp-v ${bBetter ? 'on a' : ''}`}>{fmt(y)}</span>
          </div>
        )
      })}
    </div>
  )
}

function H2H({ w, f }: { w: World; f: Fixture }) {
  const games = fixturesOf(w, f.home).filter((x) => x.played && x.result && (x.home === f.away || x.away === f.away)).reverse()
  let hw = 0, d = 0, aw = 0
  for (const x of games) { const o = outcomeFor(x, f.home); if (o === 'W') hw++; else if (o === 'D') d++; else aw++ }
  const home = w.clubs[f.home], away = w.clubs[f.away]
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="card pad-card">
        <div className="row between">
          <div className="col center" style={{ gap: 6 }}><Badge club={home} size={40} /><b className="display" style={{ fontSize: 26 }}>{hw}</b><span className="tiny dim">Wins</span></div>
          <div className="col center" style={{ gap: 6 }}><span style={{ height: 40 }} /><b className="display" style={{ fontSize: 26 }}>{d}</b><span className="tiny dim">Draws</span></div>
          <div className="col center" style={{ gap: 6 }}><Badge club={away} size={40} /><b className="display" style={{ fontSize: 26 }}>{aw}</b><span className="tiny dim">Wins</span></div>
        </div>
      </div>
      {games.length ? <div className="card list">{games.slice(0, 10).map((x) => <FixtureRow key={x.id} w={w} f={x} />)}</div> : <div className="card pad-card small muted">These sides haven't met during your career yet.</div>}
    </div>
  )
}

/** Tap a player in your XI: swap with a bench/reserve player or another starter, or hand him the armband / set pieces. */
function PickSheet({ w, t, sheet, onClose, edit, comp }: { w: World; t?: LineupTap; sheet: TeamSheet; onClose: () => void; edit: (fn: (s: TeamSheet) => void) => void; comp?: import('../../domain/types').Competition }) {
  const go = useGame((s) => s.go)
  const club = w.clubs[w.userClubId]
  const f = formationOf(sheet.formation)
  const p = t ? w.players[t.id] : undefined
  const slot = t?.slot != null ? t.slot : sheet.lineup.indexOf(t?.id || 0)
  const slotPos = slot >= 0 ? f.slots[slot].pos : p?.positions[0]
  const squad = rosterOf(w, club.id)
  const options = useMemo(() => {
    if (!p || !slotPos) return []
    return squad.filter((q) => q.id !== p.id).map((q) => {
      const where = sheet.lineup.includes(q.id) ? 'XI' : sheet.bench.includes(q.id) ? 'Bench' : 'Reserves'
      return { q, where, fit: posRating(q, slotPos), st: playerStatus(w, q, comp) }
    }).sort((a, b) => (a.st.key === 'injured' || a.st.key === 'suspended' ? 1 : 0) - (b.st.key === 'injured' || b.st.key === 'suspended' ? 1 : 0) || b.fit - a.fit)
  }, [t?.id, sheet.lineup.join(), sheet.bench.join()])
  if (!p) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const inXI = sheet.lineup.includes(p.id)
  const doSwap = (q: Player) => {
    haptic('medium')
    edit((s) => swapInSheet(w, s, p.id, q.id))
    onClose()
  }
  const duty = (k: 'captain' | 'penalties' | 'freeKicks' | 'cornersL') => { haptic(); edit((s) => { s[k] = p.id; if (k === 'cornersL') s.cornersR = p.id }); useGame.getState().notify(`${callName(p.name)}: ${k === 'captain' ? 'captain' : k === 'penalties' ? 'penalty taker' : k === 'freeKicks' ? 'free kicks' : 'corners'}`, 'ok') }
  const st = playerStatus(w, p, comp)
  return (
    <Sheet open={!!t} onClose={onClose} title={inXI ? `${f.slots[slot]?.label || ''} · ${callName(p.name)}` : callName(p.name)}>
      <div className="row" style={{ gap: 12 }}>
        <Face p={p} size={56} radius={28} club={club} />
        <div className="grow">
          <div className="b">{p.name}</div>
          <div className="tiny dim">{p.positions.join(' / ')} · {Math.round(p.fitness)}% energy · morale {Math.round(p.morale)}</div>
          {st.key !== 'ok' && <div className="tiny" style={{ color: st.color, marginTop: 2 }}>{st.label}</div>}
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}><Ovr v={slotPos ? posRating(p, slotPos) : p.ovr} size="sm" /><span className="tiny dim">at {slotPos}</span></div>
      </div>
      {inXI && (
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
          <button className={`chip ${sheet.captain === p.id ? 'on' : ''}`} onClick={() => duty('captain')}><Icon name="captain" size={14} /> Captain</button>
          <button className={`chip ${sheet.penalties === p.id ? 'on' : ''}`} onClick={() => duty('penalties')}><Icon name="target" size={14} /> Penalties</button>
          <button className={`chip ${sheet.freeKicks === p.id ? 'on' : ''}`} onClick={() => duty('freeKicks')}><Icon name="whistle" size={14} /> Free kicks</button>
          <button className={`chip ${sheet.cornersL === p.id ? 'on' : ''}`} onClick={() => duty('cornersL')}><Icon name="corner" size={14} /> Corners</button>
          <button className="chip" onClick={() => { onClose(); go({ name: 'player', params: { id: p.id } }) }}><Icon name="eye" size={14} /> Profile</button>
        </div>
      )}
      <div className="label" style={{ margin: '14px 0 6px' }}>{inXI ? 'Replace or swap with' : 'Swap with'}</div>
      <div className="card list" style={{ maxHeight: '46vh', overflow: 'auto' }}>
        {options.map(({ q, where, fit, st }) => (
          <button key={q.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => doSwap(q)} disabled={inXI && where !== 'XI' && (st.key === 'injured' || st.key === 'suspended')}>
            <Face p={q} size={36} radius={18} club={club} />
            <div className="meta">
              <div className="t ellipsis">{q.name}</div>
              <div className="s" style={{ color: st.key !== 'ok' && st.key !== 'listed' ? st.color : undefined }}>{where} · {q.positions.join('/')} · {st.key !== 'ok' && st.key !== 'listed' ? st.label : `${Math.round(q.fitness)}%`}</div>
            </div>
            <PosChip pos={q.positions[0]} />
            <div className="col" style={{ alignItems: 'flex-end' }}><Ovr v={fit} size="sm" /><span className="tiny dim">{slotPos}</span></div>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
