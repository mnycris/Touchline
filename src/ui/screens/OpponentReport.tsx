// The opponent scouting report, read top to bottom the way a manager would brief himself: who they are in two lines,
// what this match looks like for them, what to fear and where they can be hurt, where the two XIs meet, then the
// detail behind it (their shape, how they play against the league, where their goals come from, who to watch, who's
// missing). Every line is read from matches actually played or from the engine's own inputs.
import { useMemo } from 'react'
import { useGame, useWorld } from '../../store/game'
import { Screen } from '../components/layout'
import { Badge, Empty, Face, ManagerAvatar } from '../components/atoms'
import { Icon, type IconName } from '../icons/Icon'
import { TeamLineup, sideFromSheet, RatingPill } from '../components/Lineup'
import { opponentReport, tacticWord, type Breakdown, type Matchup, type OpponentReport as Report, type StyleRow } from '../../engine/world/opponentReport'
import { sortTable } from '../../engine/competitions/tables'
import { leagueOf } from '../selectors'
import { ordinal } from './Menu'
import { callName } from '../../engine/match/commentary'
import { tendencies } from '../tacticsGuide'
import { kitColors, kitVars } from '../components/LivePitch'
import { onDark } from '../theme'
import type { World } from '../../domain/types'

const BUILD: Record<string, string> = { 'Short Passing': 'short passing from the back', Balanced: 'a mix of short and long', Counter: 'fast counter-attacks', 'Long Ball': 'long balls forward', 'Direct Passing': 'direct passing' }
const GROUP: Record<StyleRow['group'], string> = { ball: 'With the ball', chances: 'Chances', def: 'Without the ball' }

/** One line of the profile: their number, the league's, and a bar that grows from the league average either way. */
function ProfileRow({ x }: { x: StyleRow }) {
  const rel = (x.v - x.avg) / x.avg
  const k = Math.max(-1, Math.min(1, rel / 0.5)) // ±50% fills the half
  const fmt = (v: number) => `${v.toFixed(x.dp)}${x.unit || ''}`
  const word = Math.abs(rel) < 0.08 ? 'average' : rel > 0 ? `+${Math.round(rel * 100)}%` : `${Math.round(rel * 100)}%`
  return (
    <div className="or-prow">
      <div className="or-prow-h"><span className="small">{x.label}</span><span className="small"><b className="num">{fmt(x.v)}</b><span className="tiny dim"> · league {fmt(x.avg)}</span></span></div>
      <div className="or-div-row">
        <div className="or-div" role="img" aria-label={`${x.label}: ${fmt(x.v)}, league ${fmt(x.avg)}`}>
          <i style={k >= 0 ? { left: '50%', width: `${k * 50}%` } : { right: '50%', width: `${-k * 50}%` }} className={Math.abs(rel) < 0.08 ? 'flat' : ''} />
          <b />
        </div>
        <span className={`or-rel ${Math.abs(rel) < 0.08 ? '' : rel > 0 ? 'up' : 'dn'}`}>{word}</span>
      </div>
    </div>
  )
}

function Split({ bd, tone }: { bd: Breakdown; tone: 'for' | 'against' }) {
  const parts = [
    { k: 'Open play', v: bd.open, c: tone === 'for' ? 'var(--acc)' : '#ff6b78' },
    { k: 'Set pieces', v: bd.setPiece, c: '#f4c542' },
    { k: 'Counters', v: bd.counter, c: '#5cb4ff' },
    { k: 'Penalties', v: bd.penalty, c: '#b794ff' },
  ]
  const total = Math.max(1, bd.open + bd.setPiece + bd.counter + bd.penalty)
  return (
    <div>
      <div className="or-split">{parts.filter((p) => p.v).map((p) => <i key={p.k} style={{ flex: p.v, background: p.c }} />)}</div>
      <div className="or-legend">{parts.map((p) => <span key={p.k} className={`tiny ${p.v ? '' : 'dim'}`}><i style={{ background: p.c }} />{p.k} <b className="num">{p.v}</b><span className="dim"> · {Math.round((p.v / total) * 100)}%</span></span>)}</div>
      <div className="tiny dim" style={{ marginTop: 6 }}>{bd.total} {bd.total === 1 ? 'goal' : 'goals'}{bd.header ? ` · ${bd.header} headed` : ''}{(() => { const og = bd.total - bd.open - bd.setPiece - bd.counter - bd.penalty; return og > 0 ? ` · ${og} own ${og === 1 ? 'goal' : 'goals'}` : '' })()}</div>
    </div>
  )
}

/** Goals for and against by quarter of an hour, mirrored about the axis. */
function Timing({ t, color }: { t: Report['timing']; color: string }) {
  const max = Math.max(1, ...t.scored, ...t.conceded)
  const L = ['0–15', '16–30', '31–45', '46–60', '61–75', '76–90']
  return (
    <div className="or-time">
      <div className="or-time-grid">
        {L.map((l, i) => (
          <div key={l} className="or-time-col">
            <div className="or-time-up"><span className="tiny num">{t.scored[i] || ''}</span><i style={{ height: `${(t.scored[i] / max) * 100}%`, background: color }} /></div>
            <div className="or-time-dn"><i style={{ height: `${(t.conceded[i] / max) * 100}%` }} /><span className="tiny num">{t.conceded[i] || ''}</span></div>
            <span className="or-time-l">{l}</span>
          </div>
        ))}
      </div>
      <div className="or-legend" style={{ justifyContent: 'center' }}><span className="tiny"><i style={{ background: color }} />Scored</span><span className="tiny"><i style={{ background: '#ff6b78' }} />Conceded</span></div>
    </div>
  )
}

/** A matchup: your players and theirs on the skill the engine compares, and what it means. */
function MatchupRow({ m, w, us, them }: { m: Matchup; w: World; us: number; them: number }) {
  const go = useGame((s) => s.go)
  const P = (id: number) => w.players[id]
  const side = (list: Matchup['ours'], club: number, cls: string) => (
    <div className={`or-mu-side ${cls}`}>
      {list.map((x) => P(x.id) && (
        <button key={x.id} className="or-mu-p" onClick={() => go({ name: 'player', params: { id: x.id } })}>
          <Face p={P(x.id)} size={34} radius={17} club={w.clubs[club]} />
          <span className="tiny ellipsis">{callName(P(x.id).name)}</span>
          <b className={`or-mu-v num ${x.weak ? 'weak' : ''}`}>{x.v}</b>
        </button>
      ))}
    </div>
  )
  return (
    <div className="or-mu">
      <div className="or-mu-h"><span className="or-mu-ic"><Icon name={m.icon as IconName} size={15} /></span><b className="small grow">{m.title}</b><span className="tiny dim">{m.skill}</span></div>
      <div className="or-mu-duel">
        {side(m.ours, us, 'us')}
        <span className="or-mu-vs tiny dim">vs</span>
        {side(m.theirs, them, 'them')}
      </div>
      <div className="tiny muted or-mu-t">{m.text}</div>
    </div>
  )
}

export function OpponentReport({ params }: { params: { id: number; fixtureId?: string } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const c = w.clubs[params.id]
  const f = params.fixtureId ? w.fixtures[params.fixtureId] : undefined
  const comp = f ? w.competitions[f.compId] : undefined
  const r = useMemo(() => (c ? opponentReport(w, c.id, comp, f) : undefined), [params.id, params.fixtureId, w.date])
  if (!c || !r) return <Screen title="Opponent" back><Empty icon="scout" title="No report" /></Screen>
  const lg = leagueOf(w, c.id)
  const pos = lg ? sortTable(w, lg).findIndex((x) => x.clubId === c.id) + 1 : 0
  const mgr = w.managers[c.managerId]
  const side = sideFromSheet(w, c.id, { lineup: r.xi, bench: r.bench, formation: r.formationId, captain: r.captain }, comp, 'Predicted')
  const P = (id: number) => w.players[id]
  const recTxt = (x: typeof r.home) => `${x.w}W ${x.d}D ${x.l}L`
  const threats = r.traits.filter((t) => t.good), chances = r.traits.filter((t) => !t.good)
  const usId = f ? (f.home === c.id ? f.away : f.home) : w.userClubId
  // their colour and yours, kept apart, lifted to read on the dark cards
  const [hc, ac] = f ? kitColors(w.clubs[f.home], w.clubs[f.away]) : [c.kit?.[0] || '#ff8a3d', '#3ea6ff']
  const theirC = onDark(f ? (f.home === c.id ? hc : ac) : hc), ourC = onDark(f ? (f.home === c.id ? ac : hc) : ac)
  const ts = tendencies(r.tactics)
  const ctx = r.ctx
  return (
    <Screen title="Scouting report" sub={c.name} back>
      <div className="pad stack or" style={{ marginTop: 6, ['--their-c' as any]: theirC, ['--our-c' as any]: ourC, ...(f ? kitVars([hc, ac]) : {}) }}>
        <button className="card or-head" onClick={() => go({ name: 'club', params: { id: c.id } })} style={{ ['--oc' as any]: c.kit?.[0] || '#445' }}>
          <Badge club={c} size={58} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="h3 ellipsis">{c.name}</div>
            <div className="tiny dim">{pos ? `${ordinal(pos)} in the ${lg!.short}` : c.country}</div>
            {mgr && <div className="tiny dim row tight or-mgr"><ManagerAvatar name={mgr.name} real={mgr.real} size={18} radius={9} nation={mgr.nationality} clubs={[c.name]} /><span className="ellipsis">{mgr.name}</span></div>}
            <div className="or-rec"><b>{recTxt(r.record)}</b><span className="dim"> · {r.record.gf}–{r.record.ga} goals · {r.games} games</span></div>
          </div>
          <Icon name="forward" size={16} color="var(--t3)" />
        </button>

        {r.games === 0 ? <div className="card pad-card small muted">No matches played yet this season: the report fills in as they play.</div> : (
          <>
            {r.brief.length > 0 && (
              <div className="card pad-card or-brief">
                <div className="label" style={{ marginBottom: 8 }}>In short</div>
                {r.brief.map((s) => <p key={s} className="small">{s}</p>)}
              </div>
            )}

            <div className="card pad-card">
              <div className="label" style={{ marginBottom: 10 }}>Recent form</div>
              <div className="or-form">
                {r.recent.map(({ f: x, gf, ga, res }) => {
                  const opp = w.clubs[x.home === c.id ? x.away : x.home]
                  return (
                    <button key={x.id} className={`or-fx ${res}`} onClick={() => go({ name: 'fixture', params: { id: x.id } })}>
                      <span className="or-res">{gf}–{ga}</span>
                      <Badge club={opp} size={20} />
                      <span className="tiny dim">{x.home === c.id ? 'H' : 'A'}</span>
                    </button>
                  )
                })}
              </div>
              <div className="or-ha">
                <div className={ctx?.venue === 'home' ? 'on' : ''}><span className="tiny dim">Home{ctx?.venue === 'home' ? ' · this match' : ''}</span><b className="small">{recTxt(r.home)}</b><span className="tiny dim">{r.home.gf}–{r.home.ga}</span></div>
                <div className={ctx?.venue === 'away' ? 'on' : ''}><span className="tiny dim">Away{ctx?.venue === 'away' ? ' · this match' : ''}</span><b className="small">{recTxt(r.away)}</b><span className="tiny dim">{r.away.gf}–{r.away.ga}</span></div>
              </div>
            </div>

            {ctx && (
              <div className="card pad-card">
                <div className="label" style={{ marginBottom: 10 }}>This match</div>
                <div className="or-ctx">
                  {ctx.last5.n > 0 && <div><span className="tiny dim">Last {ctx.last5.n}</span><b className="small">{ctx.last5.pts} pts</b><span className="tiny dim">{ctx.last5.w} {ctx.last5.w === 1 ? 'win' : 'wins'}</span></div>}
                  <div><span className="tiny dim">XI strength</span><b className="small">{ctx.xiAvg.toFixed(1)}</b><span className="tiny dim">yours {ctx.ourXiAvg.toFixed(1)}</span></div>
                  {(ctx.restDays != null || ctx.nextDays != null) && (
                    <div>
                      <span className="tiny dim">Rest before</span>
                      <b className="small">{ctx.restDays != null ? `${ctx.restDays} ${ctx.restDays === 1 ? 'day' : 'days'}` : '—'}</b>
                      <span className="tiny dim ellipsis">{ctx.nextDays != null ? `next: ${ctx.nextDays} ${ctx.nextDays === 1 ? 'day' : 'days'}` : 'nothing after'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(threats.length > 0 || chances.length > 0) && (
              <div className="card pad-card or-tw">
                {threats.length > 0 && <>
                  <div className="label or-tw-h"><Icon name="shield" size={14} color="var(--their-c)" /> Watch out for</div>
                  {threats.map((t) => <div key={t.key} className="or-trait threat"><i /><div><div className="small b">{t.title}</div><div className="tiny muted">{t.detail}</div></div></div>)}
                </>}
                {chances.length > 0 && <>
                  <div className="label or-tw-h" style={{ marginTop: threats.length ? 12 : 0 }}><Icon name="target" size={14} color="var(--pos)" /> Where they can be hurt</div>
                  {chances.map((t) => <div key={t.key} className="or-trait chance"><i /><div><div className="small b">{t.title}</div><div className="tiny muted">{t.detail}</div></div></div>)}
                </>}
              </div>
            )}
          </>
        )}

        {r.matchups.length > 0 && (
          <div className="card pad-card">
            <div className="row between" style={{ marginBottom: 4 }}><span className="label">Where the teams meet</span><span className="or-mu-key tiny"><i className="us" />You<i className="them" />{c.short}</span></div>
            <div className="tiny dim" style={{ marginBottom: 10 }}>The match engine's own measures, with PlayStyles counted</div>
            {r.matchups.map((m) => <MatchupRow key={m.id} m={m} w={w} us={usId} them={c.id} />)}
          </div>
        )}

        <div className="card">
          <div className="card-h"><span className="label">Likely line-up</span><span className="tiny dim">{r.shape}{r.formations[0] ? ` · used ${r.formations[0].n} of ${r.games}` : ''}</span></div>
          <TeamLineup w={w} side={side} onTap={(t) => go({ name: 'player', params: { id: t.id } })} />
          {r.formations.length > 1 && <div className="or-shapes tiny">{r.formations.map((x) => <span key={x.name} className="chip sm">{x.name} <b className="num">{x.n}</b></span>)}</div>}
          {r.usualOut.length > 0 && (
            <div className="or-out">
              <div className="tiny dim" style={{ marginBottom: 6 }}>Regulars not in this XI</div>
              {r.usualOut.map((x) => P(x.id) && <div key={x.id} className="or-line"><Face p={P(x.id)} size={26} radius={13} club={c} /><span className="small b grow ellipsis">{callName(P(x.id).name)}</span><span className="tiny dim">{x.starts} starts · {x.why}</span></div>)}
            </div>
          )}
        </div>

        <div className="card pad-card stack" style={{ gap: 12 }}>
          <div className="row between"><span className="label">How they'll set up</span><span className="tiny dim">their manager's plan</span></div>
          <div className="or-tags">
            <span className="chip sm">{r.shape}</span>
            <span className="chip sm">{r.tactics.mentality}</span>
            <span className="chip sm">{tacticWord.pressing(r.style.pressing)}</span>
            <span className="chip sm">{tacticWord.line(r.style.line)}</span>
            <span className="chip sm">{tacticWord.width(r.style.width)}</span>
            <span className="chip sm">{tacticWord.tempo(r.style.tempo)}</span>
          </div>
          <div className="small muted">They build with {BUILD[r.tactics.buildUp] || r.tactics.buildUp.toLowerCase()} and create through {r.tactics.chanceCreation.toLowerCase()}{r.tactics.offsideTrap ? ', and play an offside trap' : ''}{r.tactics.timeWasting ? '. They will waste time when ahead' : ''}.</div>
          <div className="tb-tend or-tend">
            {ts.map((x) => (
              <div key={x.id} className="tb-tend-row">
                <div className="row between tiny"><span className="b">{x.label}</span></div>
                <div className="tb-meter" role="img" aria-label={`${x.label}: ${x.v < 0.34 ? x.low : x.v > 0.66 ? x.high : 'in between'}`}><i style={{ left: `${Math.round(x.v * 100)}%` }} /></div>
                <div className="row between tb-ends"><span>{x.low}</span><span>{x.high}</span></div>
              </div>
            ))}
          </div>
        </div>

        {r.profile.length > 0 && (
          <div className="card pad-card">
            <div className="row between" style={{ marginBottom: 2 }}><span className="label">How they've played</span><span className="tiny dim">per game · {r.games} played</span></div>
            <div className="tiny dim" style={{ marginBottom: 6 }}>Against the average side in the {lg?.short || 'league'}: the bar grows from the league average</div>
            {(['ball', 'chances', 'def'] as const).map((g) => {
              const rows = r.profile.filter((x) => x.group === g)
              const odd = rows.filter((x) => Math.abs(x.v - x.avg) / x.avg >= 0.08), even = rows.filter((x) => !odd.includes(x))
              return (
                <div key={g} className="or-pgroup">
                  <div className="or-pgroup-h tiny">{GROUP[g]}</div>
                  {odd.map((x) => <ProfileRow key={x.id} x={x} />)}
                  {even.length > 0 && <div className="tiny dim or-even">About average: {even.map((x) => `${x.label.replace(/^[A-Z](?=[a-z])/, (m) => m.toLowerCase())} ${x.v.toFixed(x.dp)}${x.unit || ''}`).join(' · ')}</div>}
                </div>
              )
            })}
          </div>
        )}

        {r.games > 0 && (
          <div className="card pad-card stack" style={{ gap: 14 }}>
            <div><div className="label" style={{ marginBottom: 8 }}>Where their goals come from</div><Split bd={r.scored} tone="for" /></div>
            <div><div className="label" style={{ marginBottom: 8 }}>How they concede</div><Split bd={r.conceded} tone="against" /></div>
            {r.scored.total + r.conceded.total > 0 && <div><div className="label" style={{ marginBottom: 8 }}>When</div><Timing t={r.timing} color="var(--their-c)" /></div>}
          </div>
        )}

        {(r.danger.length > 0 || r.inForm.length > 0) && (
          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 10 }}>Players to watch</div>
            <div className="or-people">
              {r.danger.map((x) => P(x.id) && (
                <button key={x.id} className="or-p" onClick={() => go({ name: 'player', params: { id: x.id } })}>
                  <span className="or-pf"><Face p={P(x.id)} size={48} radius={24} club={c} />{r.missing.some((m) => m.id === x.id) && <i>Out</i>}</span><b className="small ellipsis">{callName(P(x.id).name)}</b>
                  <span className="tiny"><b>{x.goals}</b> g · <b>{x.assists}</b> a</span><span className="tiny dim">{P(x.id).positions[0]} · in {x.apps}</span>
                </button>
              ))}
              {r.inForm.filter((x) => !r.danger.some((d) => d.id === x.id)).map((x) => P(x.id) && (
                <button key={x.id} className="or-p" onClick={() => go({ name: 'player', params: { id: x.id } })}>
                  <Face p={P(x.id)} size={48} radius={24} club={c} /><b className="small ellipsis">{callName(P(x.id).name)}</b>
                  <RatingPill v={x.rating} size="sm" /><span className="tiny dim">{P(x.id).positions[0]} · last {x.apps}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card pad-card stack" style={{ gap: 10 }}>
          <div className="label">Set pieces</div>
          <div className="small">{r.setPieces.goals === 1 ? '1 goal' : `${r.setPieces.goals} goals`} from corners and free kicks{r.scored.total ? ` (${Math.round(r.setPieces.share * 100)}% of theirs)` : ''} · {r.conceded.setPiece} conceded</div>
          {r.setPieces.aerial.length > 0 && <div className="row tight wrap" style={{ gap: 6 }}><span className="tiny dim">Biggest threat in the air</span>{r.setPieces.aerial.map((id) => P(id) && <span key={id} className="chip sm"><Face p={P(id)} size={18} radius={9} club={c} /> {callName(P(id).name)}{P(id).height ? ` · ${P(id).height}cm` : ''}</span>)}</div>}
        </div>

        {(r.missing.length > 0 || r.subs.length > 0) && (
          <div className="card pad-card stack" style={{ gap: 10 }}>
            {r.missing.length > 0 && <>
              <div className="label">Missing</div>
              {r.missing.map((x) => P(x.id) && <div key={x.id} className="or-line"><Face p={P(x.id)} size={28} radius={14} club={c} /><span className="small b grow ellipsis">{callName(P(x.id).name)}</span><span className="tiny dim">{x.why}</span></div>)}
            </>}
            {r.subs.length > 0 && <>
              <div className="label" style={{ marginTop: r.missing.length ? 6 : 0 }}>First off the bench</div>
              {r.subs.map((x) => P(x.id) && <div key={x.id} className="or-line"><Face p={P(x.id)} size={28} radius={14} club={c} /><span className="small b grow ellipsis">{callName(P(x.id).name)}</span><span className="tiny dim">{P(x.id).positions[0]} · on {x.times} times</span></div>)}
            </>}
          </div>
        )}

      </div>
    </Screen>
  )
}
