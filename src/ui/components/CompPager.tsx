// Central's competitions: a page for each one the club is in this season, in the Season tab's order, swiped the way
// the iPhone swipes (scroll snapping and its own momentum, one page at a time). It opens on the competition of the next
// match. The dots are an iPhone's page dots: tiny grey ones, and the current one a little larger in bright grey, which
// follows the finger from dot to dot, drawn out into a short capsule on the way (its front edge leading, its back
// catching up) and round again where it lands.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { Competition, Fixture, World } from '../../domain/types'
import { useGame, haptic } from '../../store/game'
import { Badge, CompLogo } from './atoms'
import { Icon } from '../icons/Icon'
import { compIdentity } from '../compIdentity'
import { compLogoKey, fixturesOf, nextFixture, seasonComps, tableAround } from '../selectors'
import { previousPositions, ZONE_COLOR, zoneFor } from '../../engine/competitions/tables'
import { MoveArrow } from '../screens/FifaRanking'
import { cupPath } from '../cupPath'
import { aggregateBefore, entryRoundName } from '../../engine/competitions/cups'
import { fmtDate } from '../../domain/dates'

/** The competition's colour for the light across its page (its identity's, else a quiet white). */
const tone = (c: Competition) => compIdentity(c.key)?.rgb || '255, 255, 255'
/** the current dot's size, and how the capsule's two ends travel between dots (the front one sooner, the back later) */
const IND = 9
const front = (f: number) => 1 - (1 - f) ** 2
const rear = (f: number) => f ** 2

export function CompPager({ w }: { w: World }) {
  const me = w.userClubId
  const comps = seasonComps(w, me)
  const next = nextFixture(w, me)
  const home = Math.max(0, comps.findIndex((c) => c.id === next?.compId))
  const track = useRef<HTMLDivElement>(null)
  const dots = useRef<HTMLDivElement>(null)
  const ind = useRef<HTMLElement>(null)
  const at = useRef(home)
  const frame = useRef(0)
  const settle = useRef(0)

  // the current dot where the track is: between two pages, a capsule from one dot towards the other
  const paint = (p: number) => {
    const list = dots.current?.querySelectorAll<HTMLElement>('.cpg-dot')
    if (!list?.length || !ind.current) return
    const mid = (k: number) => list[k].offsetLeft + list[k].offsetWidth / 2
    const q = Math.max(0, Math.min(list.length - 1, p))
    const i = Math.min(list.length - 2, Math.floor(q)), f = list.length > 1 ? q - i : 0
    const a = mid(Math.max(0, i)), b = list.length > 1 ? mid(i + 1) : a
    const left = a + (b - a) * rear(f) - IND / 2, right = a + (b - a) * front(f) + IND / 2
    ind.current.style.transform = `translate3d(${left.toFixed(2)}px, 0, 0)`
    ind.current.style.width = `${(right - left).toFixed(2)}px`
  }
  const landed = (i: number, felt: boolean) => {
    dots.current?.querySelectorAll<HTMLElement>('.cpg-dot').forEach((d, k) => d.setAttribute('aria-selected', String(k === i)))
    if (i === at.current) return
    at.current = i
    if (felt) haptic()
  }
  // open on the next match's competition, and go back to it when the next match changes
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    el.scrollLeft = home * el.clientWidth
    at.current = home
    paint(home)
    landed(home, false)
  }, [next?.id, comps.length])
  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(settle.current) }, [])

  const onScroll = () => {
    const el = track.current
    if (!el || !el.clientWidth) return
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => paint(el.scrollLeft / el.clientWidth))
    clearTimeout(settle.current)
    settle.current = window.setTimeout(() => landed(Math.round(el.scrollLeft / el.clientWidth), true), 110)
  }
  const goTo = (i: number) => {
    const el = track.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }
  if (!comps.length) return null
  return (
    <div className="card cpg" data-swipe-lock>
      {comps.length > 1 && (
        <div className="cpg-dots" ref={dots} role="tablist" aria-label="Your competitions">
          {comps.map((c, i) => <button key={c.id} className="cpg-dot" role="tab" aria-label={c.name} aria-selected={i === home} onClick={() => { haptic(); goTo(i) }} />)}
          <i className="cpg-ind" ref={ind} aria-hidden />
        </div>
      )}
      <div className="cpg-track" ref={track} onScroll={onScroll}>
        {comps.map((c) => <CompPage key={c.id} w={w} c={c} />)}
      </div>
    </div>
  )
}

/** One competition: its table where it has one that still decides something for the club, else the club's road through it. */
function CompPage({ w, c }: { w: World; c: Competition }) {
  const go = useGame((s) => s.go)
  const me = w.userClubId
  const row = c.table?.find((r) => r.clubId === me)
  const path = c.format === 'league' ? [] : cupPath(w, c)
  const lp = path[0]?.id === 'lp' ? path[0] : undefined
  const table = c.format === 'league' || (c.format === 'uefa' && !!row && (!lp || lp.state !== 'won' || path.length === 1))
  return (
    <button className="cpg-page" style={{ ['--pr' as string]: tone(c) } as CSSProperties} onClick={() => { haptic(); go({ name: 'comp', params: { id: c.id } }) }}>
      <div className="card-h cpg-h">
        <div className="row tight" style={{ minWidth: 0 }}><CompLogo k={compLogoKey(c)} size={20} name={c.name} /><span className="label ellipsis">{c.short}</span></div>
      </div>
      {table ? <TablePart w={w} c={c} /> : <RoadPart w={w} c={c} path={path} />}
    </button>
  )
}

function TablePart({ w, c }: { w: World; c: Competition }) {
  const rows = tableAround(w, c, w.userClubId, 2)
  const prev = previousPositions(w, c)
  const total = c.table?.length || 20
  return (
    <table className="tbl">
      <thead><tr><th style={{ width: prev ? 44 : 30 }}>#</th><th className="l">Club</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const z = zoneFor(w, c, r.pos, total)
          return (
            <tr key={r.clubId} className={r.clubId === w.userClubId ? 'me' : ''}>
              <td><span className="tbl-pos"><span className="zone-num" style={{ borderColor: ZONE_COLOR[z] }}>{r.pos}</span>{prev?.has(r.clubId) && <MoveArrow move={prev.get(r.clubId)! - r.pos} size={9} />}</span></td>
              <td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={20} /><span className="ellipsis b" style={{ maxWidth: 150 }}>{w.clubs[r.clubId].short}</span></div></td>
              <td>{r.p}</td><td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="b">{r.pts - (r.ded || 0)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** A cup or a European knockout: the rounds so far and ahead, and the tie that matters now (or the one that ended it). */
function RoadPart({ w, c, path }: { w: World; c: Competition; path: ReturnType<typeof cupPath> }) {
  const me = w.userClubId
  const mine = fixturesOf(w, me).filter((f) => f.compId === c.id)
  const next = mine.find((f) => !f.played)
  const last = [...mine].reverse().find((f) => f.played && f.result)
  const lost = path.find((r) => r.state === 'lost')
  // a one-off final (a super cup) or the last round of a cup: losing it is finishing second, not going out
  const final = !!lost && lost.id === c.rounds[c.rounds.length - 1]?.id
  const won = c.winner === me
  const now = path.find((r) => r.state === 'now')
  // a cup the club joins in a later round (the big clubs' third round)
  const entry = c.rounds.find((r) => r.entrants?.includes(me) || r.fixtures.some((id) => mine.some((f) => f.id === id)))
  const focus: Fixture | undefined = won || lost ? last : next || last
  const kicker = won ? 'Winners' : final ? 'Runners-up' : lost ? `Out · ${lost.name}` : next ? next.roundName || now?.name || 'Next round' : now ? now.name : c.status === 'finished' ? 'Finished' : entry ? entry.name : 'Waiting for the draw'
  // not in it yet: the cup's own mark, and the round the club joins it in (else its next round)
  const waiting = !focus && !won && !lost
  const joins = waiting && !entry ? entryRoundName(w, c, me) : undefined
  const coming = waiting ? c.rounds.find((r) => (joins ? r.name === joins : !r.drawn && r.date >= w.date)) : undefined
  const place = (f: Fixture) => (f.neutral ? f.venue || 'Neutral venue' : f.home === me ? 'Home' : 'Away')
  // a two-legged tie says which leg, and the second where it stands on aggregate (home side first, as the tie shows)
  const legNote = (f: Fixture) => {
    if (f.leg === 2) { const ag = aggregateBefore(w, f); return ag ? `Second leg · ${ag[0]}–${ag[1]} on aggregate` : 'Second leg' }
    if (f.leg === 1) return `First leg · ${f.home === me ? 'at home' : 'away'}`
    return place(f)
  }
  const note = won ? `Won the ${c.rounds.length > 1 ? 'final' : 'match'} on ${fmtDate(last?.date || w.date, 'dm')}`
    : final ? `Lost the final on ${fmtDate(last?.date || w.date, 'dm')}`
      : lost ? (last ? `Knocked out on ${fmtDate(last.date, 'dm')}` : 'Knocked out')
        : next ? legNote(next)
          : last ? 'Through · the next draw is still to come' : entry ? `Enters in the ${entry.name.toLowerCase()} · ${fmtDate(entry.date, 'dm')}` : coming ? `${joins ? `Enters in the ${coming.name.toLowerCase()}` : coming.name} · ${fmtDate(coming.date, 'dm')}` : ''
  return (
    <div className="cpg-road">
      {path.length > 1 && <div className="cup-path">{path.map((r) => <span key={r.id} className={`cp ${r.state}`} title={r.name}>{r.short}</span>)}</div>}
      {waiting && <span className="cpg-mark"><CompLogo k={compLogoKey(c)} size={46} name={c.name} /></span>}
      <div className={`cpg-kicker ${won ? 'won' : final ? 'second' : lost ? 'lost' : ''}`}>{(won || final) && <Icon name="trophy" size={14} />}{kicker}</div>
      {focus && <Tie w={w} f={focus} />}
      {note && <div className="tiny dim cpg-note">{note}</div>}
    </div>
  )
}

/** The tie: the two crests and names, and between them the score, or the kick-off and its date. */
function Tie({ w, f }: { w: World; f: Fixture }) {
  const h = w.clubs[f.home], a = w.clubs[f.away]
  const r = f.played && f.result
  return (
    <div className="cpg-tie">
      <div className="cpg-side"><Badge club={h} size={44} /><span className="small b ellipsis">{h.short}</span></div>
      <div className="cpg-mid">
        {r ? <><span className="display">{r.score[0]}–{r.score[1]}</span>{r.pens && <span className="tiny dim">{r.pens[0]}–{r.pens[1]} pens</span>}</>
          : <><span className="display">{f.time}</span><span className="tiny dim">{fmtDate(f.date, 'day')} {fmtDate(f.date, 'dm')}</span></>}
      </div>
      <div className="cpg-side"><Badge club={a} size={44} /><span className="small b ellipsis">{a.short}</span></div>
    </div>
  )
}
