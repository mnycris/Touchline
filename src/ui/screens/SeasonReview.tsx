// The Season Review: a finished season told in chapters, the way a club's end-of-season film would tell it. One idea
// per chapter, the number first and the words after it: where you finished and what you won, the season in numbers,
// the run that got you there, the nights worth remembering, every competition, the players who carried it, what the
// board asked for, the final table, the league's honours and the window. Everything opens what it is about.
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { Club, World } from '../../domain/types'
import { seasonLabel, fmtDate } from '../../domain/dates'
import { ordinalOf } from '../../domain/words'
import { fmtMoney } from '../../domain/finance'
import { seasonReview, type Review, type SquadLine } from '../../engine/world/review'
import { useGame, useWorld } from '../../store/game'
import { Screen } from '../components/layout'
import { Fx } from '../components/Fx'
import { Badge, CompLogo, Empty, Face } from '../components/atoms'
import { Icon } from '../icons/Icon'
import { clubAccent, hexToRgb } from '../theme'
import { compLogoKey } from '../selectors'

const PRIO = ['Critical', 'Very High', 'High', 'Medium', 'Low']

export function SeasonReview({ params }: { params: { season: number } }) {
  const w = useWorld()
  const inOverlay = useGame((s) => s.overlay.some((r) => r.name === 'seasonReview'))
  const closeAll = useGame((s) => s.closeAll)
  const back = useGame((s) => s.back)
  const a = w.archive.find((x) => x.season === params.season) || w.archive[w.archive.length - 1]
  const r = useMemo(() => (a ? seasonReview(w, a) : undefined), [w, a])
  const leave = inOverlay ? closeAll : back
  if (!a || !r) return <Screen title="Season Review" back onBack={leave} noNav><Empty icon="season" title="No review available" /></Screen>
  const acc = clubAccent(r.club)
  const vars = { ['--sr' as string]: acc, ['--sr-rgb' as string]: hexToRgb(acc).join(', ') } as CSSProperties
  const justEnded = inOverlay && a.season === w.season - 1
  let ch = 0
  const chapter = (title: string, body: ReactNode, aside?: ReactNode) => (
    <section className="sr-ch fade-up" style={{ animationDelay: `${Math.min(6, ++ch) * 60}ms` }}>
      <div className="sr-chh"><span className="sr-chn">{String(ch).padStart(2, '0')}</span><span className="sr-cht">{title}</span>{aside && <span className="sr-cha">{aside}</span>}</div>
      {body}
    </section>
  )
  return (
    <Screen title="Season Review" sub={seasonLabel(a.season)} back onBack={leave} noNav className="season-review" style={vars}>
      <Hero w={w} r={r} />
      <div className="pad stack sr-body">
        {chapter('The season in numbers', <Numbers r={r} />)}
        {r.run.length > 0 && chapter(r.run.every((m) => m.pos) ? 'The run' : 'The points race', <Run w={w} r={r} />, r.league?.comp && <CompLogo k={compLogoKey(r.league.comp)} size={18} name={r.league.comp.name} />)}
        {(r.facts.biggestWin || r.facts.heaviestDefeat) && chapter('Nights to remember', <Nights w={w} r={r} />)}
        {r.comps.length > 0 && chapter('Every competition', <Comps r={r} />)}
        {r.squad.length > 0 && chapter('The players', <Players w={w} r={r} />)}
        {r.objectives.length > 0 && chapter('The board’s targets', <Board r={r} />)}
        {r.league && chapter('Final table', <Table w={w} r={r} />)}
        {r.awards.length > 0 && chapter('The league’s honours', <Honours w={w} r={r} />)}
        {(r.transfers.in > 0 || r.transfers.out > 0) && chapter('The window', <Window w={w} r={r} />)}
        {justEnded ? (
          <div className="sr-next fade-up">
            <div className="label">Next</div>
            <div className="h2" style={{ marginTop: 4 }}>{seasonLabel(w.season)}</div>
            <div className="small muted" style={{ marginTop: 6 }}>Contracts have expired, loans have ended, retiring players have hung up their boots and the fixtures are out. Your budget: <b className="t1">{fmtMoney(w.clubs[w.userClubId]?.finance.transferBudget || 0)}</b>.</div>
            <button className="btn primary block" style={{ marginTop: 14 }} onClick={closeAll}>Start {seasonLabel(w.season)}</button>
          </div>
        ) : (
          <button className="btn block" onClick={leave}>Done</button>
        )}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------------------- 00 the headline
function Hero({ w, r }: { w: World; r: Review }) {
  const lg = r.league
  const won = r.trophies.length > 0
  const pts = lg?.row ? lg.row.pts - (lg.row.ded || 0) : 0
  const gap = !lg ? '' : lg.finish === 1
    ? lg.gapBelow ? `${lg.gapBelow} clear of ${w.clubs[lg.table[1].clubId]?.short}` : `top on goal difference`
    : lg.gapAbove === 0 ? `level on points with ${w.clubs[lg.table[lg.finish - 2].clubId]?.short}` : `${lg.gapAbove} behind ${w.clubs[lg.table[lg.finish - 2].clubId]?.short}`
  const tone = lg?.verdict === 'Champions' || lg?.verdict === 'Promoted' ? 'gold' : lg?.verdict === 'Relegated' ? 'bad' : lg?.verdict === 'Champions League' || lg?.verdict === 'Europe' ? 'good' : 'plain'
  return (
    <div className="sr-hero">
      {won ? <Fx kind="confetti" /> : <Fx kind="beams" />}
      <div className="sr-hero-in">
        <div className="sr-kick"><span>Season review</span><span>{seasonLabel(r.season)}</span></div>
        <div className="sr-club"><Badge club={r.club} size={44} /><span className="h3">{r.club.name}</span></div>
        {lg ? (
          <>
            <div className="sr-finish">
              <span className="sr-ord">{lg.finish}<sup>{ordinalOf(lg.finish).replace(/^\d+/, '')}</sup></span>
              <span className="sr-of">of {lg.size}</span>
            </div>
            <div className={`sr-verdict t-${tone}`}>{lg.verdict}</div>
            <div className="sr-line">
              {lg.comp && <CompLogo k={compLogoKey(lg.comp)} size={20} name={lg.comp.name} />}
              <span>{lg.comp?.name || 'League'}</span><i />
              <b>{pts} pts</b><i /><span>{gap}</span>
            </div>
          </>
        ) : <div className="sr-ord sm">Season complete</div>}
        {won && (
          <div className="sr-trophies">
            {r.trophies.map((t) => (
              <div key={t.key} className="sr-medal">
                <span className="sr-medal-ring"><span className="sr-medal-disc"><CompLogo k={t.comp ? compLogoKey(t.comp) : t.key.replace(/-\d+$/, '')} size={32} name={t.comp?.name} /></span></span>
                <span className="sr-medal-n">{t.comp?.short || t.key}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- 01 the numbers
function Numbers({ r }: { r: Review }) {
  const { p, w: won, d, l, gf, ga, cs } = r.record
  const seg = (n: number, cls: string, label: string) => n > 0 && <div className={`sr-wdl-s ${cls}`} style={{ flexGrow: n }}><b>{n}</b><span>{label}</span></div>
  return (
    <div className="card sr-num">
      <div className="sr-wdl">{seg(won, 'w', 'won')}{seg(d, 'd', 'drawn')}{seg(l, 'l', 'lost')}</div>
      <div className="sr-tiles">
        <div><b>{p}</b><span>matches</span></div>
        <div><b>{gf}</b><span>scored · {(gf / Math.max(1, p)).toFixed(1)} a game</span></div>
        <div><b>{ga}</b><span>conceded</span></div>
        <div><b>{cs}</b><span>clean sheets</span></div>
      </div>
      <div className="sr-ha">
        <div><span className="label">Home</span><span>W{r.facts.homeRecord[0]} D{r.facts.homeRecord[1]} L{r.facts.homeRecord[2]}</span></div>
        <div><span className="label">Away</span><span>W{r.facts.awayRecord[0]} D{r.facts.awayRecord[1]} L{r.facts.awayRecord[2]}</span></div>
      </div>
      <div className="sr-facts">
        {r.facts.unbeaten >= 3 && <span><b>{r.facts.unbeaten}</b> unbeaten in a row</span>}
        {r.facts.winStreak >= 3 && <span><b>{r.facts.winStreak}</b> straight wins</span>}
        {r.facts.comebacks > 0 && <span><b>{r.facts.comebacks}</b> won from behind</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- 02 the run
function Run({ w, r }: { w: World; r: Review }) {
  const go = useGame((s) => s.go)
  const lg = r.league!
  const run = r.run
  const n = run.length
  const W = 340, H = 132, L = 26, R = 34, T = 10, B = 12
  const x = (i: number) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : 0)
  const byPos = run.every((m) => m.pos)
  const size = lg.size
  const maxPts = Math.max(3, run[n - 1]?.pts || 0)
  const y = (v: number) => byPos ? T + ((v - 1) / Math.max(1, size - 1)) * (H - T - B) : T + (1 - v / maxPts) * (H - T - B)
  const pts = run.map((m, i) => [x(i), y(byPos ? m.pos! : m.pts)] as const)
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('')
  const area = `${line}L${x(n - 1).toFixed(1)},${(H - B).toFixed(1)}L${x(0).toFixed(1)},${(H - B).toFixed(1)}Z`
  const band = (from: number, to: number, cls: string) => from <= to && <rect className={cls} x={L} width={W - L - R} y={y(from) - (H - T - B) / Math.max(1, size - 1) / 2} height={(to - from + 1) * ((H - T - B) / Math.max(1, size - 1))} />
  const last = run[n - 1]
  const best = byPos ? Math.min(...run.map((m) => m.pos!)) : 0
  return (
    <div className="card sr-run">
      <svg viewBox={`0 0 ${W} ${H}`} className="sr-chart" role="img" aria-label={byPos ? `League position after each match, finishing ${ordinalOf(lg.finish)}` : `Points after each match, finishing on ${last?.pts}`}>
        <defs>
          <linearGradient id="srArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(var(--sr-rgb))" stopOpacity=".42" /><stop offset="1" stopColor="rgb(var(--sr-rgb))" stopOpacity="0" /></linearGradient>
        </defs>
        {byPos && <>
          {band(1, lg.zones.promo || lg.zones.ucl, 'z-top')}
          {lg.zones.uel > 0 && band((lg.zones.ucl || 0) + 1, (lg.zones.ucl || 0) + lg.zones.uel, 'z-eu')}
          {lg.zones.rele > 0 && band(size - lg.zones.rele + 1, size, 'z-down')}
          <text className="ax" x={L - 6} y={y(1) + 3} textAnchor="end">1</text>
          <text className="ax" x={L - 6} y={y(size) + 3} textAnchor="end">{size}</text>
        </>}
        {!byPos && <>
          <line className="grid" x1={L} x2={W - R} y1={y(maxPts)} y2={y(maxPts)} />
          <text className="ax" x={L - 6} y={y(0) + 3} textAnchor="end">0</text>
        </>}
        {!byPos && <path d={area} fill="url(#srArea)" />}
        <path d={line} className="sr-line-p" />
        {pts.length > 0 && <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="4.5" className="sr-dot" />}
        {last && <text className="end" x={pts[n - 1][0] + 8} y={pts[n - 1][1] + 4}>{byPos ? ordinalOf(lg.finish) : last.pts}</text>}
      </svg>
      <div className="sr-strip" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {run.map((m) => <button key={m.fixtureId} className={`sr-r ${m.res}`} aria-label={`${m.res === 'W' ? 'Won' : m.res === 'D' ? 'Drew' : 'Lost'} ${m.gf}–${m.ga} ${m.home ? 'v' : 'at'} ${w.clubs[m.opp]?.short}`} onClick={() => go({ name: 'fixture', params: { id: m.fixtureId } })} />)}
      </div>
      <div className="sr-runcap tiny dim">
        <span>Matchday 1</span>
        <span>{byPos ? `Highest: ${ordinalOf(best)}` : `${(last.pts / Math.max(1, n)).toFixed(2)} points a game`}</span>
        <span>Matchday {n}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- 03 the nights
function Nights({ w, r }: { w: World; r: Review }) {
  const go = useGame((s) => s.go)
  const card = (label: string, h: NonNullable<Review['facts']['biggestWin']>, cls: string) => {
    const homeSide = h.fixture.home === r.club.id
    const [hc, ac] = homeSide ? [r.club, w.clubs[h.opp]] : [w.clubs[h.opp], r.club]
    const sc = h.fixture.result!.score
    return (
      <button className={`card sr-night ${cls}`} onClick={() => go({ name: 'fixture', params: { id: h.fixture.id } })}>
        <span className="label">{label}</span>
        <span className="sr-night-sc">
          <Badge club={hc} size={30} /><b>{sc[0]}–{sc[1]}</b><Badge club={ac} size={30} />
        </span>
        <span className="sr-night-m">{homeSide ? 'v' : 'at'} {w.clubs[h.opp]?.short} · {fmtDate(h.fixture.date, 'dm')}</span>
        <span className="sr-night-m">{h.comp?.short || ''}</span>
      </button>
    )
  }
  return (
    <div className="sr-nights">
      {r.facts.biggestWin && card('Biggest win', r.facts.biggestWin, 'win')}
      {r.facts.heaviestDefeat && card('Heaviest defeat', r.facts.heaviestDefeat, 'loss')}
    </div>
  )
}

// ---------------------------------------------------------------------------- 04 every competition
function Comps({ r }: { r: Review }) {
  const go = useGame((s) => s.go)
  return (
    <div className="card list sr-comps">
      {r.comps.map((c) => (
        <button key={c.comp.id} className="li tap" onClick={() => go({ name: 'comp', params: { id: c.comp.id } })}>
          <CompLogo k={compLogoKey(c.comp)} size={30} name={c.comp.name} />
          <div className="meta"><div className="t small">{c.comp.name}</div></div>
          <span className={`sr-pill t-${c.tone}`}>{c.tone === 'gold' && <Icon name="trophy" size={12} />}{c.outcome}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------- 05 the players
function Who({ w, l, size, club }: { w: World; l: SquadLine; size: number; club: Club }) {
  const p = w.players[l.id]
  return p ? <Face p={p} size={size} radius={Math.round(size * 0.28)} club={club} /> : <span className="sr-mono" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>{l.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>
}

function Players({ w, r }: { w: World; r: Review }) {
  const go = useGame((s) => s.go)
  const open = (l: SquadLine) => w.players[l.id] && go({ name: 'player', params: { id: l.id } })
  const s = r.standout
  const minor: [string, SquadLine | undefined, (l: SquadLine) => ReactNode][] = [
    ['Top scorer', r.topScorer, (l) => <><b>{l.goals}</b> goals</>],
    ['Most assists', r.topCreator, (l) => <><b>{l.assists}</b> assists</>],
    ['Ever-present', r.ironMan, (l) => <><b>{l.apps}</b> matches</>],
    ['Breakthrough', r.breakout, (l) => <><b>{l.rating.toFixed(2)}</b> avg</>],
  ]
  return (
    <div className="stack" style={{ gap: 10 }}>
      {s && (
        <button className="card sr-star" onClick={() => open(s)}>
          <span className="sr-star-face"><Who w={w} l={s} size={92} club={r.club} /></span>
          <span className="sr-star-txt">
            <span className="kicker">Player of the season</span>
            <span className="h2 ellipsis">{s.name}</span>
            <span className="tiny dim">{s.pos} · {s.apps} matches · {Math.round(s.mins / 90)} full games</span>
            <span className="sr-star-st">
              <span><b>{s.rating.toFixed(2)}</b>avg rating</span>
              <span><b>{s.goals}</b>goals</span>
              <span><b>{s.assists}</b>assists</span>
            </span>
          </span>
        </button>
      )}
      <div className={`sr-minors n${minor.filter(([, l]) => l).length}`}>
        {minor.filter(([, l]) => l).map(([label, l, stat]) => (
          <button key={label} className="card sr-minor" onClick={() => open(l!)}>
            <Who w={w} l={l!} size={46} club={r.club} />
            <span className="label">{label}</span>
            <span className="small b ellipsis" style={{ maxWidth: '100%' }}>{l!.name}</span>
            <span className="sr-minor-st">{stat(l!)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- 06 the board
function Board({ r }: { r: Review }) {
  const objs = [...r.objectives].sort((a, b) => PRIO.indexOf(a.priority) - PRIO.indexOf(b.priority))
  const met = objs.filter((o) => o.status === 'complete').length
  const crit = objs.filter((o) => o.priority === 'Critical')
  const critMet = crit.filter((o) => o.status === 'complete').length
  const C = 2 * Math.PI * 26
  return (
    <div className="card sr-board">
      <div className="sr-board-h">
        <svg viewBox="0 0 64 64" className="sr-ring" aria-hidden>
          <circle cx="32" cy="32" r="26" className="bg" />
          <circle cx="32" cy="32" r="26" className="fg" strokeDasharray={`${(C * met) / Math.max(1, objs.length)} ${C}`} transform="rotate(-90 32 32)" />
        </svg>
        <div>
          <div className="h2">{met} of {objs.length}</div>
          <div className="small muted">targets met{crit.length ? ` · ${critMet} of ${crit.length} critical` : ''}</div>
        </div>
      </div>
      {objs.map((o) => (
        <div key={o.id} className={`sr-obj ${o.status === 'complete' ? 'ok' : 'no'}`}>
          <Icon name={o.status === 'complete' ? 'check' : 'close'} size={15} />
          <span className="small">{o.text}</span>
          <span className={`prio p-${o.priority.replace(' ', '')}`}>{o.priority}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------- 07 the table
function Table({ w, r }: { w: World; r: Review }) {
  const go = useGame((s) => s.go)
  const lg = r.league!
  const z = lg.zones
  const zone = (i: number) => i < (z.promo || z.ucl) ? 'z-top' : i < z.ucl + z.uel && !z.promo ? 'z-eu' : z.rele && i >= lg.size - z.rele ? 'z-down' : ''
  return (
    <div className="card sr-table">
      <table className="tbl"><thead><tr><th style={{ width: 30 }}>#</th><th className="l">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>
        {lg.table.map((row, i) => (
          <tr key={row.clubId} className={`${row.clubId === r.club.id ? 'me' : ''} ${zone(i)}`} onClick={() => go({ name: 'club', params: { id: row.clubId } })}>
            <td>{i + 1}</td>
            <td className="l"><div className="row tight"><Badge club={w.clubs[row.clubId]} size={18} /><span className="ellipsis" style={{ maxWidth: 120 }}>{w.clubs[row.clubId]?.short}</span></div></td>
            <td>{row.p}</td><td>{row.w}</td><td>{row.d}</td><td>{row.l}</td>
            <td>{row.gf - row.ga > 0 ? '+' : ''}{row.gf - row.ga}</td>
            <td className="b">{row.pts - (row.ded || 0)}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  )
}

// ---------------------------------------------------------------------------- 08 the honours
function Honours({ w, r }: { w: World; r: Review }) {
  const go = useGame((s) => s.go)
  const lgName = r.league?.comp?.name || ''
  return (
    <div className="sr-honours">
      {r.awards.map((x) => {
        const p = x.playerId ? w.players[x.playerId] : undefined
        const club = p ? w.clubs[p.clubId] : x.clubId ? w.clubs[x.clubId] : undefined
        const ours = (p && p.clubId === r.club.id) || x.clubId === r.club.id
        return (
          <button key={x.id} className={`card sr-hon ${ours ? 'ours' : ''}`} onClick={() => p ? go({ name: 'player', params: { id: p.id } }) : club && go({ name: 'club', params: { id: club.id } })}>
            {p ? <Face p={p} size={44} radius={13} club={club} /> : club ? <Badge club={club} size={40} /> : <Icon name="medal" size={26} color="var(--gold)" />}
            <span className="sr-hon-n">{x.name.replace(lgName, '').trim()}</span>
            <span className="small b ellipsis" style={{ maxWidth: '100%' }}>{p?.name || x.managerName || club?.name}</span>
            {x.value ? <span className="tiny dim">{x.value}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------- 09 the window
function Window({ w, r }: { w: World; r: Review }) {
  const t = r.transfers
  return (
    <div className="card sr-window">
      <div className="sr-win-row">
        <div><b>{t.in}</b><span>signed</span></div>
        <div><b>{t.out}</b><span>sold</span></div>
        <div><b>{fmtMoney(t.spent)}</b><span>spent</span></div>
        <div><b>{fmtMoney(t.received)}</b><span>received</span></div>
      </div>
      {t.biggestIn && <div className="li small"><Icon name="arrowDown" size={16} color="var(--pos)" /><div className="meta"><div className="t">{t.biggestIn.name}</div><div className="s">Biggest signing · from {w.clubs[t.biggestIn.from]?.short || 'abroad'}</div></div><b>{fmtMoney(t.biggestIn.fee)}</b></div>}
      {t.biggestOut && <div className="li small"><Icon name="arrowUp" size={16} color="var(--neg)" /><div className="meta"><div className="t">{t.biggestOut.name}</div><div className="s">Biggest sale · to {w.clubs[t.biggestOut.to]?.short || 'abroad'}</div></div><b>{fmtMoney(t.biggestOut.fee)}</b></div>}
    </div>
  )
}
