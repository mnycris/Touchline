// The Season Review: a finished season told in chapters, the way a club's end-of-season film would tell it. One idea
// per chapter, the number first and the words after it: where you finished and what you won, the season in numbers,
// the run that got you there, the nights worth remembering, every competition, the players who carried it, what the
// board asked for, the final table, the league's honours and the window. Everything opens what it is about.
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { Club, World } from '../../domain/types'
import { seasonLabel, fmtDate } from '../../domain/dates'
import { ordinalOf } from '../../domain/words'
import { fmtMoney } from '../../domain/finance'
import { seasonReview, type Mood, type Review, type SquadLine } from '../../engine/world/review'
import { useGame, useWorld } from '../../store/game'
import { Screen } from '../components/layout'
import { Badge, CompLogo, CountUp, Empty, Face } from '../components/atoms'
import { Confetti } from '../components/Celebration'
import { compIdentity, identityVars } from '../compIdentity'
import { useLessMotion } from '../motion'
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
  useReveal()
  const leave = inOverlay ? closeAll : back
  if (!a || !r) return <Screen title="Season Review" back onBack={leave} noNav><Empty icon="season" title="No review available" /></Screen>
  const acc = clubAccent(r.club)
  const vars = { ['--sr' as string]: acc, ['--sr-rgb' as string]: hexToRgb(acc).join(', '), ...(MOOD_ACC[r.story.mood] ? { ['--sr-acc' as string]: MOOD_ACC[r.story.mood] } : {}) } as CSSProperties
  const justEnded = inOverlay && a.season === w.season - 1
  let ch = 0
  const chapter = (title: string, body: ReactNode, aside?: ReactNode) => (
    <section className="sr-ch sr-rv">
      <div className="sr-chh"><span className="sr-chn">{String(++ch).padStart(2, '0')}</span><span className="sr-cht">{title}</span>{aside && <span className="sr-cha">{aside}</span>}</div>
      {body}
    </section>
  )
  return (
    <Screen title="Season Review" sub={seasonLabel(a.season)} back onBack={leave} noNav className={`season-review m-${r.story.mood}`} style={vars}>
      <Cover w={w} r={r} />
      <div className="pad stack sr-body">
        <Notes r={r} />
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
          <div className="sr-next sr-rv">
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

// ---------------------------------------------------------------------------- 00 the cover
// The season's cover, a night under the floodlights: lit by how it went (warm gold for a title, the club's own light
// for a good season, dimmed for a struggle, the lights going out on a relegation), the club's crest as a watermark,
// the season in a word or two set as large as it fits, the line that explains it, the medals, the numbers that settle
// it, every match of the season as one waveform, and the league's own band underneath.
const MOOD_ACC: Record<Mood, string> = { glory: '#f4c542', triumph: '#f4c542', success: '', steady: '', struggle: '#9aa3ae', fall: '#8d97a6' }

function Cover({ w, r }: { w: World; r: Review }) {
  const reduce = useLessMotion()
  const ref = useRef<HTMLElement>(null)
  const lg = r.league
  const s = r.story
  // the crest drifts a little slower than the page
  useEffect(() => {
    const el = ref.current
    const sc = el?.closest('.screen') as HTMLElement | null
    if (!el || !sc || reduce) return
    let raf = 0
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => el.style.setProperty('--sy', String(Math.min(600, sc.scrollTop)))) }
    sc.addEventListener('scroll', on, { passive: true })
    return () => { sc.removeEventListener('scroll', on); cancelAnimationFrame(raf) }
  }, [reduce])
  const ci = lg ? compIdentity(lg.key) : undefined
  const pts = lg ? lg.row.pts - (lg.row.ded || 0) : 0
  const gd = lg ? lg.row.gf - lg.row.ga : 0
  const longest = Math.max(...s.headline.split(/\s+/).map((x) => x.length))
  // (a super cup earns its medal, not a shower of ticker tape)
  const won = s.majors > 0
  // the medals: what was won, then the finals lost
  const medals = [
    ...r.trophies.map((t) => ({ key: t.key, comp: t.comp, tone: 'gold' })),
    ...r.comps.filter((c) => c.tone === 'silver' && c.comp.format !== 'league' && !r.trophies.some((t) => t.key === c.comp.key)).map((c) => ({ key: c.comp.key, comp: c.comp, tone: 'silver' })),
  ]
  const kit = r.club.kit?.[0] || '#ffffff', kit2 = r.club.kit?.[1] || '#ffffff'
  const champion = lg?.finish === 1
  // which season this is at the club, counting back through the seasons managed here without a break
  let year = 0
  for (let y = r.season; w.archive.some((x) => x.season === y && x.userClubId === r.club.id); y--) year++
  return (
    <section ref={ref} className={`sr-cover m-${s.mood}${lg?.finish === 2 && !won ? ' runner' : ''}`} style={{ ['--len' as string]: longest }}>
      <div className="sr-cv-bg" aria-hidden>
        <i className="sr-cv-light" />
        <i className="sr-cv-beams" />
        <div className="sr-cv-crest"><Badge club={r.club} size={300} /></div>
        <i className="sr-cv-grain" />
        <i className="sr-cv-fade" />
      </div>
      {won && <Confetti colors={['#F4C542', '#FFE38A', '#ffffff', kit, kit2, '#F4C542']} fire={0} reduce={reduce} shower />}
      <div className="sr-cv-in">
        <div className="sr-cv-top">
          <span className="sr-cv-club"><Badge club={r.club} size={22} />{r.club.name}</span>
          {year > 0 && <span className="sr-cv-year">{ordinalOf(year)} season</span>}
        </div>
        <h1 className="sr-cv-head">{s.headline}</h1>
        {s.kicker && <p className="sr-cv-kicker">{s.kicker}</p>}
        {medals.length > 0 && (
          <div className="sr-cv-silver">
            {medals.map((m, i) => (
              <div key={m.key} className={`sr-medal ${m.tone}`} style={{ animationDelay: `${700 + i * 110}ms` }}>
                <span className="sr-medal-ring"><span className="sr-medal-disc"><CompLogo k={m.comp ? compLogoKey(m.comp) : m.key.replace(/-\d+$/, '')} size={30} name={m.comp?.name} /></span></span>
                <span className="sr-medal-n">{m.comp?.short || m.key}</span>
              </div>
            ))}
          </div>
        )}
        {lg && (
          <div className="sr-cv-rail">
            <div><b>{lg.finish}<sup>{ordinalOf(lg.finish).replace(/^\d+/, '')}</sup></b><span>of {lg.size}</span></div>
            <div><b><CountUp value={pts} from={0} ms={reduce ? 0 : 900} /></b><span>points</span></div>
            <div><b>{lg.row.w}<i>·</i>{lg.row.d}<i>·</i>{lg.row.l}</b><span>W · D · L</span></div>
            <div><b>{gd > 0 ? '+' : ''}{gd}</b><span>goal diff.</span></div>
          </div>
        )}
        {r.games.length > 2 && <Wave r={r} />}
      </div>
      {lg && (
        <div className={`sr-cv-band ${ci ? `ci ci-${ci.id}${ci.whiteLogo ? ' ci-white-logo' : ''}` : ''}${champion ? ' won' : ''}`} style={ci ? identityVars(ci) : undefined}>
          {lg.comp && <CompLogo k={compLogoKey(lg.comp)} size={24} name={lg.comp.name} />}
          <span className="sr-band-n">{lg.comp?.name || 'League'}</span>
          <span className="sr-band-s">{champion ? <><Icon name="trophy" size={13} />Champions</> : `${ordinalOf(lg.finish)} of ${lg.size}`}</span>
        </div>
      )}
    </section>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayOf = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5

/**
 * Every match of the season on the calendar it was played to, as one waveform: a win rises by its margin, a defeat
 * falls by it, a draw is a beat on the line; the nights that won (or lost) something carry a mark. Drawn in once,
 * left to right, the way the season went.
 */
function Wave({ r }: { r: Review }) {
  const g = r.games
  const W = 340, BASE = 34, H = 62
  const d0 = dayOf(g[0].date), d1 = dayOf(g[g.length - 1].date)
  const span = Math.max(1, d1 - d0)
  const x = (d: string) => 4 + ((dayOf(d) - d0) / span) * (W - 8)
  const bw = Math.max(1.6, Math.min(3.2, ((W - 8) / g.length) * 0.6))
  // the months the season ran through, at their first day
  const months: { x: number; t: string }[] = []
  const first = new Date(Date.UTC(+g[0].date.slice(0, 4), +g[0].date.slice(5, 7), 1))
  for (let m = first; m.getTime() / 864e5 <= d1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    months.push({ x: 4 + ((m.getTime() / 864e5 - d0) / span) * (W - 8), t: MONTHS[m.getUTCMonth()] })
  }
  return (
    <svg className="sr-wave" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Every match of the season: ${r.record.w} won, ${r.record.d} drawn, ${r.record.l} lost`}>
      <line className="wv-base" x1="0" x2={W} y1={BASE} y2={BASE} />
      {months.map((m) => <line key={m.t + m.x} className="wv-tick" x1={m.x} x2={m.x} y1={BASE + 24} y2={BASE + 27} />)}
      {months.map((m) => (m.x + 16 < W ? <text key={m.t + m.x} className="wv-m" x={m.x + 3} y={H - 1}>{m.t}</text> : null))}
      {g.map((m, i) => {
        const cx = x(m.date)
        const up = m.res === 'W' ? 6 + 5 * Math.min(4, m.margin) : 0
        const dn = m.res === 'L' ? 5 + 4 * Math.min(4, m.margin) : 0
        const style = { ['--i' as string]: i } as CSSProperties
        return (
          <g key={i}>
            {m.res === 'W' && <rect className="wv-w" x={cx - bw / 2} y={BASE - up} width={bw} height={up - 1} rx={bw / 2} style={style} />}
            {m.res === 'L' && <rect className="wv-l" x={cx - bw / 2} y={BASE + 1} width={bw} height={dn} rx={bw / 2} style={style} />}
            {m.res === 'D' && <rect className="wv-d" x={cx - bw / 2} y={BASE - 2.5} width={bw} height={5} rx={bw / 2} style={style} />}
            {m.mark && <circle className={`wv-mk ${m.mark}`} cx={cx} cy={m.mark === 'down' ? BASE + dn + 6 : BASE - Math.max(up, 3) - 6} r="2.6" style={style} />}
          </g>
        )
      })}
    </svg>
  )
}

/** The facts that make the season this one, under the cover. */
function Notes({ r }: { r: Review }) {
  if (!r.story.notes.length) return null
  return (
    <div className="sr-notes">
      {r.story.notes.map((n) => (
        <div key={n.text} className={`sr-note${n.good ? ' good' : ''}`}><Icon name={n.icon} size={14} /><span>{n.text}</span></div>
      ))}
    </div>
  )
}

/** Chapters rise into view as they are reached, not all at once off-screen. */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.season-review .sr-rv:not(.in)'))
    if (typeof IntersectionObserver === 'undefined') { els.forEach((e) => e.classList.add('in')); return }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -24px 0px', threshold: 0 })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  })
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
            {x.value ? <span className="tiny dim">{x.value} {/Glove/.test(x.name) ? 'clean sheets' : /Playmaker/.test(x.name) ? 'assists' : /Boot/.test(x.name) ? 'goals' : ''}</span> : null}
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
