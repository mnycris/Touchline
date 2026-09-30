// The opponent scouting report: how they line up, how they play, where their goals come from and where they
// concede, who to watch, who's missing, who comes off the bench. Every line is read from matches actually played.
import { useMemo } from 'react'
import { useGame, useWorld } from '../../store/game'
import { Screen } from '../components/layout'
import { Badge, Empty, Face } from '../components/atoms'
import { Icon } from '../icons/Icon'
import { TeamLineup, sideFromSheet, RatingPill } from '../components/Lineup'
import { opponentReport, tacticWord, type Breakdown } from '../../engine/world/opponentReport'
import { sortTable } from '../../engine/competitions/tables'
import { leagueOf } from '../selectors'
import { ordinal } from './Menu'
import { callName } from '../../engine/match/commentary'

const BUILD: Record<string, string> = { 'Short Passing': 'short passing from the back', Balanced: 'a mix of short and long', Counter: 'fast counter-attacks', 'Long Ball': 'long balls forward', 'Direct Passing': 'direct passing' }

function Bar({ label, v, avg, fmt, hi = 'higher' }: { label: string; v: number; avg?: number; fmt: (x: number) => string; hi?: string }) {
  const max = Math.max(v, avg || 0) * 1.25 || 1
  return (
    <div className="or-bar">
      <div className="row between small"><span>{label}</span><b className="num">{fmt(v)}</b></div>
      <div className="or-track"><i style={{ width: `${(v / max) * 100}%` }} />{avg != null && <b style={{ left: `${(avg / max) * 100}%` }} title={`League ${fmt(avg)}`} />}</div>
      {avg != null && <div className="tiny dim">League average {fmt(avg)}{v > avg * 1.1 ? ` · ${hi}` : ''}</div>}
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
      <div className="or-legend">{parts.map((p) => <span key={p.k} className="tiny"><i style={{ background: p.c }} />{p.k} <b className="num">{p.v}</b><span className="dim"> · {Math.round((p.v / total) * 100)}%</span></span>)}</div>
      <div className="tiny dim" style={{ marginTop: 6 }}>{bd.total} goals · {bd.late} after 75'{bd.header ? ` · ${bd.header} headers` : ''}</div>
    </div>
  )
}

export function OpponentReport({ params }: { params: { id: number; fixtureId?: string } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const c = w.clubs[params.id]
  const f = params.fixtureId ? w.fixtures[params.fixtureId] : undefined
  const comp = f ? w.competitions[f.compId] : undefined
  const r = useMemo(() => (c ? opponentReport(w, c.id, comp) : undefined), [params.id, w.date])
  if (!c || !r) return <Screen title="Opponent" back><Empty icon="scout" title="No report" /></Screen>
  const lg = leagueOf(w, c.id)
  const pos = lg ? sortTable(w, lg).findIndex((x) => x.clubId === c.id) + 1 : 0
  const mgr = w.managers[c.managerId]
  const side = sideFromSheet(w, c.id, { lineup: r.xi, bench: r.bench, formation: r.formationId, captain: r.captain }, comp, 'Predicted')
  const P = (id: number) => w.players[id]
  const rec = (x: typeof r.home) => `${x.w}W ${x.d}D ${x.l}L`
  const good = r.traits.filter((t) => t.good), bad = r.traits.filter((t) => !t.good)
  return (
    <Screen title="Scouting report" sub={c.name} back>
      <div className="pad stack or" style={{ marginTop: 6 }}>
        <button className="card or-head" onClick={() => go({ name: 'club', params: { id: c.id } })} style={{ ['--oc' as any]: c.kit?.[0] || '#445' }}>
          <Badge club={c} size={58} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="h3 ellipsis">{c.name}</div>
            <div className="tiny dim">{pos ? `${ordinal(pos)} in the ${lg!.short}` : c.country}{mgr ? ` · ${mgr.name}` : ''}</div>
            <div className="or-rec"><b>{rec(r.record)}</b><span className="dim"> · {r.record.gf}–{r.record.ga} goals · {r.games} games</span></div>
          </div>
          <Icon name="forward" size={16} color="var(--t3)" />
        </button>

        {r.games === 0 ? <div className="card pad-card small muted">No matches played yet this season: the report fills in as they play.</div> : (
          <>
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
                <div><span className="tiny dim">Home</span><b className="small">{rec(r.home)}</b><span className="tiny dim">{r.home.gf}–{r.home.ga}</span></div>
                <div><span className="tiny dim">Away</span><b className="small">{rec(r.away)}</b><span className="tiny dim">{r.away.gf}–{r.away.ga}</span></div>
              </div>
            </div>

            {(good.length > 0 || bad.length > 0) && (
              <div className="card pad-card">
                <div className="label" style={{ marginBottom: 8 }}>What stands out</div>
                {good.map((t) => <div key={t.text} className="or-trait good"><Icon name="check" size={14} /><span className="small">{t.text}</span></div>)}
                {bad.map((t) => <div key={t.text} className="or-trait bad"><Icon name="target" size={14} /><span className="small">{t.text}</span></div>)}
                <div className="tiny dim" style={{ marginTop: 8 }}>Green: their strengths. Red: where to hurt them.</div>
              </div>
            )}
          </>
        )}

        <div className="card">
          <div className="card-h"><span className="label">Likely line-up</span><span className="tiny dim">{r.shape}{r.formations[0] ? ` · used ${r.formations[0].n} of ${r.games}` : ''}</span></div>
          <TeamLineup w={w} side={side} onTap={(t) => go({ name: 'player', params: { id: t.id } })} />
          {r.formations.length > 1 && <div className="or-shapes tiny">{r.formations.map((x) => <span key={x.name} className="chip sm">{x.name} <b className="num">{x.n}</b></span>)}</div>}
        </div>

        <div className="card pad-card stack" style={{ gap: 12 }}>
          <div className="label">How they play</div>
          <div className="or-tags">
            <span className="chip sm">{tacticWord.pressing(r.style.pressing)}</span>
            <span className="chip sm">{tacticWord.line(r.style.line)}</span>
            <span className="chip sm">{tacticWord.width(r.style.width)}</span>
            <span className="chip sm">{tacticWord.tempo(r.style.tempo)}</span>
            <span className="chip sm">{r.tactics.mentality}</span>
          </div>
          <div className="small muted">They build with {BUILD[r.tactics.buildUp] || r.tactics.buildUp.toLowerCase()} and create through {r.tactics.chanceCreation.toLowerCase()}{r.tactics.offsideTrap ? ', and play an offside trap' : ''}.</div>
          {r.games > 0 && (
            <>
              <Bar label="Possession" v={r.style.possession} avg={r.league ? 50 : undefined} fmt={(x) => `${Math.round(x)}%`} hi="they like the ball" />
              <Bar label="Shots a game" v={r.style.shots} avg={r.league?.shots} fmt={(x) => x.toFixed(1)} />
              <Bar label="xG a game" v={r.style.xg} avg={r.league?.xg} fmt={(x) => x.toFixed(2)} hi="dangerous" />
              <Bar label="xG against a game" v={r.style.xga} avg={r.league?.xg} fmt={(x) => x.toFixed(2)} hi="open at the back" />
              {r.style.crosses > 0 && <Bar label="Crosses a game" v={r.style.crosses} avg={r.league?.crosses} fmt={(x) => x.toFixed(1)} hi="plenty from wide" />}
              {r.style.longBalls > 0 && <Bar label="Long balls a game" v={r.style.longBalls} avg={r.league?.longBalls} fmt={(x) => x.toFixed(1)} hi="direct" />}
            </>
          )}
        </div>

        {r.games > 0 && (
          <div className="card pad-card stack" style={{ gap: 14 }}>
            <div><div className="label" style={{ marginBottom: 8 }}>Where their goals come from</div><Split bd={r.scored} tone="for" /></div>
            <div><div className="label" style={{ marginBottom: 8 }}>How they concede</div><Split bd={r.conceded} tone="against" /></div>
          </div>
        )}

        {(r.flanks.leftIds.length > 0 || r.flanks.rightIds.length > 0) && (
          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 10 }}>Threat by flank</div>
            <div className="or-flanks">
              {(['left', 'right'] as const).map((k) => {
                const ids = k === 'left' ? r.flanks.leftIds : r.flanks.rightIds
                const v = k === 'left' ? r.flanks.left : r.flanks.right
                const strong = v > (k === 'left' ? r.flanks.right : r.flanks.left) + 3
                return (
                  <div key={k} className={`or-flank ${strong ? 'hot' : ''}`}>
                    <span className="tiny dim upper">Their {k}</span>
                    <div className="row tight">{ids.map((id) => P(id) && <Face key={id} p={P(id)} size={28} radius={14} club={c} />)}</div>
                    <b className="num">{Math.round(v)}</b>
                  </div>
                )
              })}
            </div>
            {r.flanks.weakFb && P(r.flanks.weakFb.id) && <div className="or-trait bad" style={{ marginTop: 8 }}><Icon name="target" size={14} /><span className="small">Run at {callName(P(r.flanks.weakFb.id).name)}, their {r.flanks.weakFb.side} back</span></div>}
          </div>
        )}

        {(r.danger.length > 0 || r.inForm.length > 0) && (
          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 10 }}>Players to watch</div>
            <div className="or-people">
              {r.danger.map((x) => P(x.id) && (
                <button key={x.id} className="or-p" onClick={() => go({ name: 'player', params: { id: x.id } })}>
                  <span className="or-pf"><Face p={P(x.id)} size={48} radius={24} club={c} />{r.missing.some((m) => m.id === x.id) && <i>Out</i>}</span><b className="small ellipsis">{callName(P(x.id).name)}</b>
                  <span className="tiny"><b>{x.goals}</b> g · <b>{x.assists}</b> a</span><span className="tiny dim">in {x.apps}</span>
                </button>
              ))}
              {r.inForm.filter((x) => !r.danger.some((d) => d.id === x.id)).map((x) => P(x.id) && (
                <button key={x.id} className="or-p" onClick={() => go({ name: 'player', params: { id: x.id } })}>
                  <Face p={P(x.id)} size={48} radius={24} club={c} /><b className="small ellipsis">{callName(P(x.id).name)}</b>
                  <RatingPill v={x.rating} size="sm" /><span className="tiny dim">last {x.apps}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card pad-card stack" style={{ gap: 10 }}>
          <div className="label">Set pieces</div>
          <div className="small">{r.setPieces.goals} goals from corners and free kicks{r.scored.total ? ` (${Math.round(r.setPieces.share * 100)}% of theirs)` : ''} · {r.conceded.setPiece} conceded</div>
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

        {r.usual.length > 0 && (
          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 8 }}>Most used XI</div>
            <div className="or-usual">{r.usual.map((x) => P(x.id) && <button key={x.id} className="or-u" onClick={() => go({ name: 'player', params: { id: x.id } })}><Face p={P(x.id)} size={30} radius={15} club={c} /><span className="tiny ellipsis">{callName(P(x.id).name)}</span><span className="tiny dim">{x.starts}</span></button>)}</div>
          </div>
        )}
      </div>
    </Screen>
  )
}

