// Central's competitions: a page for each one the club is in this season, in the Season tab's order, swiped the way
// the iPhone swipes (scroll snapping and its own momentum, one page at a time). It opens on the competition of the next
// match. The dots follow the finger: the page coming in grows its dot and lights it in that competition's colour while
// the one leaving shrinks back to grey, and the dot a swipe settles on gives a small bounce.
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
import { fmtDate } from '../../domain/dates'

/** The competition's colour for its dot and the light across its page (its identity's, else a quiet white). */
function tone(c: Competition): { dot: string; rgb: string } {
  const ci = compIdentity(c.key)
  return ci ? { dot: ci.accent, rgb: ci.rgb } : { dot: '#ffffff', rgb: '255, 255, 255' }
}

export function CompPager({ w }: { w: World }) {
  const me = w.userClubId
  const comps = seasonComps(w, me)
  const next = nextFixture(w, me)
  const home = Math.max(0, comps.findIndex((c) => c.id === next?.compId))
  const track = useRef<HTMLDivElement>(null)
  const dots = useRef<HTMLDivElement>(null)
  const at = useRef(home)
  const frame = useRef(0)
  const settle = useRef(0)

  // each dot's share of the selection, from where the track is (0 to 1; between two pages, both in part)
  const paint = (p: number) => {
    dots.current?.querySelectorAll<HTMLElement>('.cpg-dot').forEach((d, i) => d.style.setProperty('--a', Math.max(0, 1 - Math.abs(p - i)).toFixed(3)))
  }
  const landed = (i: number, felt: boolean) => {
    const list = dots.current?.querySelectorAll<HTMLElement>('.cpg-dot')
    list?.forEach((d, k) => d.setAttribute('aria-selected', String(k === i)))
    if (i === at.current) return
    at.current = i
    if (felt) haptic()
    const d = list?.[i]
    if (d) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop') }
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
      <div className="cpg-dots" ref={dots} role="tablist" aria-label="Your competitions">
        {comps.map((c, i) => (
          <button key={c.id} className="cpg-dot" role="tab" aria-label={c.name} aria-selected={i === home} style={{ ['--dc' as string]: tone(c).dot } as CSSProperties} onClick={() => { haptic(); goTo(i) }} />
        ))}
      </div>
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
    <button className="cpg-page" style={{ ['--pr' as string]: tone(c).rgb } as CSSProperties} onClick={() => { haptic(); go({ name: 'comp', params: { id: c.id } }) }}>
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
  const note = won ? `Won the ${c.rounds.length > 1 ? 'final' : 'match'} on ${fmtDate(last?.date || w.date, 'dm')}`
    : final ? `Lost the final on ${fmtDate(last?.date || w.date, 'dm')}`
      : lost ? (last ? `Knocked out on ${fmtDate(last.date, 'dm')}` : 'Knocked out')
        : next ? `${next.neutral ? 'Neutral venue' : next.home === me ? 'Home' : 'Away'} · ${fmtDate(next.date, 'day')} ${fmtDate(next.date, 'dm')} · ${next.time}`
          : last ? 'Through · the next draw is still to come' : entry ? `Enters in the ${entry.name.toLowerCase()} · ${fmtDate(entry.date, 'dm')}` : ''
  return (
    <div className="cpg-road">
      {path.length > 1 && <div className="cup-path">{path.map((r) => <span key={r.id} className={`cp ${r.state}`} title={r.name}>{r.short}</span>)}</div>}
      <div className={`cpg-kicker ${won ? 'won' : final ? 'second' : lost ? 'lost' : ''}`}>{(won || final) && <Icon name="trophy" size={14} />}{kicker}</div>
      {focus && <Tie w={w} f={focus} />}
      {note && <div className="tiny dim cpg-note">{note}</div>}
    </div>
  )
}

function Tie({ w, f }: { w: World; f: Fixture }) {
  const h = w.clubs[f.home], a = w.clubs[f.away]
  const r = f.played && f.result
  return (
    <div className="cpg-tie">
      <div className="cpg-side"><Badge club={h} size={34} /><span className="small b ellipsis">{h.short}</span></div>
      <div className="cpg-mid">{r ? <span className="display">{r.score[0]}–{r.score[1]}</span> : <span className="tiny b dim">VS</span>}{r && r.pens && <span className="tiny dim">{r.pens[0]}–{r.pens[1]} pens</span>}</div>
      <div className="cpg-side"><Badge club={a} size={34} /><span className="small b ellipsis">{a.short}</span></div>
    </div>
  )
}
