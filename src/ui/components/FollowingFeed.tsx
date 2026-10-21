// News → Following: a strip of everything he follows, each with how it stands right now, and below it one quiet feed
// of what has happened to them (results and standout games, moves, injuries, jobs, stories in the news).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Follow, World } from '../../domain/types'
import { haptic, useGame } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Sheet } from './layout'
import { FollowBtn, compByKey, openRef, refView } from './Follow'
import { follows, followingFeed, type FollowEvent } from '../../engine/world/follow'
import { openStoryFor } from '../../engine/world/market'
import { STAGE_BANNER, STAGE_TONE } from './TransferCard'
import { avgRating, lastResult, nextFixture, outcomeFor, standing, totals } from '../selectors'
import { sortTable } from '../../engine/competitions/tables'
import { diffDays, fmtDate } from '../../domain/dates'
import { openSpotlight } from '../spot'
import { dayLabel } from './NewsCards'

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
type Line = { text: string; tone?: 'pos' | 'neg' | 'warn' | 'info' }

/** How something he follows stands today, in two short lines. */
export function snapshot(w: World, f: Follow): Line[] {
  switch (f.kind) {
    case 'player': {
      const p = w.players[f.id as number]
      if (!p) return []
      const out: Line[] = []
      if (p.injury) out.push({ text: `Injured · back ${fmtDate(p.injury.until, 'dm')}`, tone: 'neg' })
      else {
        const s = openStoryFor(w, p.id)
        if (s && s.stage !== 'done' && s.stage !== 'failed') out.push({ text: s.stage === 'rumour' ? `Linked with ${w.clubs[s.to]?.short}` : `${STAGE_BANNER[s.stage]}: ${w.clubs[s.to]?.short}`, tone: STAGE_TONE[s.stage] === 'rumour' ? 'warn' : 'info' })
        else if (p.loan) out.push({ text: `On loan at ${w.clubs[p.clubId]?.short}` })
        else out.push({ text: w.clubs[p.clubId]?.short || 'Free agent' })
      }
      const t = totals(p)
      out.push({ text: t.apps ? `${t.apps} apps · ${t.goals} G · ${t.assists} A${t.rated ? ` · ${avgRating(t).toFixed(2)}` : ''}` : 'No games yet this season' })
      return out
    }
    case 'club': {
      const c = w.clubs[f.id as number]
      if (!c) return []
      const out: Line[] = []
      const st = c.national ? undefined : standing(w, c.id)
      const last = lastResult(w, c.id)
      if (st) out.push({ text: st.lastSeason ? `${ordinal(st.pos)} last season` : `${ordinal(st.pos)} in the ${st.league}` })
      if (last?.result) {
        const o = outcomeFor(last, c.id)
        const opp = w.clubs[last.home === c.id ? last.away : last.home]?.short
        const [h, a] = last.result.score
        out.push({ text: `${o} ${last.home === c.id ? `${h}–${a} v` : `${a}–${h} at`} ${opp}`, tone: o === 'W' ? 'pos' : o === 'L' ? 'neg' : undefined })
      }
      if (out.length < 2) { const n = nextFixture(w, c.id); if (n) out.push({ text: `Next: ${w.clubs[n.home === c.id ? n.away : n.home]?.short} · ${fmtDate(n.date, 'dm')}` }) }
      return out
    }
    case 'manager': {
      const m = w.managers[f.id as number]
      if (!m) return []
      return [{ text: m.clubId ? w.clubs[m.clubId]?.short || '' : 'Out of work', tone: m.clubId ? undefined : 'warn' }, { text: `W${m.record.w} D${m.record.d} L${m.record.l}` }]
    }
    case 'comp': {
      const c = compByKey(w, f.id as string)
      if (!c) return []
      if (c.status === 'finished') return [{ text: c.winner ? `${w.clubs[c.winner]?.short} won it` : 'Finished', tone: 'pos' }]
      // before a ball is kicked the table says nothing: who holds it, and when it starts
      const started = c.fixtures.some((id) => w.fixtures[id]?.played)
      if (!started) {
        const first = c.fixtures.map((id) => w.fixtures[id]?.date).filter(Boolean).sort()[0]
        const prev = w.archive.find((a) => a.season === c.season - 1)
        const holder = w.clubs[c.holderId || prev?.winners[c.key] || 0]
        return [...(holder ? [{ text: `Holders: ${holder.short}` }] : []), { text: first ? `Starts ${fmtDate(first, 'dm')}` : 'Starts soon' }]
      }
      if (c.table?.length && c.format === 'league') {
        const t = sortTable(w, c)
        const [a, b] = t
        return [{ text: `${w.clubs[a.clubId]?.short} top · ${a.pts} pts` }, ...(b ? [{ text: a.pts === b.pts ? `Level with ${w.clubs[b.clubId]?.short}` : `${a.pts - b.pts} clear of ${w.clubs[b.clubId]?.short}` }] : [])]
      }
      const next = c.rounds.find((r) => !r.winners?.length && r.date >= w.date)
      return [{ text: c.status === 'upcoming' ? 'Starts soon' : next ? `${next.name} · ${fmtDate(next.date, 'dm')}` : 'In progress' }]
    }
    case 'story': {
      const s = w.market?.stories.find((x) => x.id === f.id)
      if (!s) return []
      return [{ text: STAGE_BANNER[s.stage], tone: STAGE_TONE[s.stage] === 'done' ? 'pos' : STAGE_TONE[s.stage] === 'failed' ? 'neg' : STAGE_TONE[s.stage] === 'rumour' ? 'warn' : 'info' }, { text: s.log[s.log.length - 1]?.note || '' }]
    }
  }
}

const TYPE_ICON: Record<FollowEvent['type'], string> = { news: 'news', result: 'ball', performance: 'star', transfer: 'transfers', injury: 'injury', job: 'manager' }

export function FollowingView({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const go = useGame((s) => s.go)
  const v = useGame((s) => s.v)
  const [manage, setManage] = useState(false)
  const list = follows(w)
  const feed = useMemo(() => followingFeed(w, 30), [w.date, v])
  // seen: the count on the chip resets once he has looked
  useEffect(() => { if (w.flags.followSeen !== w.date) mutate((x) => { x.flags.followSeen = x.date }, { save: false }) }, [w.date])
  if (!list.length) {
    return (
      <div className="pad" style={{ marginTop: 14 }}>
        <div className="card fw-empty">
          <span className="fw-empty-star"><Icon name="star" size={26} color="var(--gold)" /></span>
          <div className="h3">Follow the football world</div>
          <div className="small muted">Tap the star on any player, club, manager, competition or transfer. What happens to them is gathered here, without filling your inbox.</div>
          <button className="btn sm" onClick={() => openSpotlight()}><Icon name="search" size={15} /> Find someone to follow</button>
        </div>
      </div>
    )
  }
  const days: { d: string; items: FollowEvent[] }[] = []
  for (const e of feed) { const last = days[days.length - 1]; if (last && last.d === e.date) last.items.push(e); else days.push({ d: e.date, items: [e] }) }
  const open = (e: FollowEvent) => {
    haptic()
    if (e.storyId != null && w.market?.stories.some((s) => s.id === e.storyId)) go({ name: 'story', params: { id: e.storyId } })
    else if (e.newsId) go({ name: 'article', params: { id: e.newsId } })
    else if (e.fixtureId && w.fixtures[e.fixtureId]?.played) go({ name: 'fixture', params: { id: e.fixtureId } })
    else openRef(w, e.ref)
  }
  return (
    <>
      <div className="row between" style={{ margin: '14px 20px 8px' }}>
        <span className="label">You follow {list.length}</span>
        <button className="link" onClick={() => { haptic(); setManage(true) }}>Manage</button>
      </div>
      <div className="fl-rail">
        {list.map((f) => {
          const view = refView(w, f)
          if (!view) return null
          const lines = snapshot(w, f)
          return (
            <button key={`${f.kind}:${f.id}`} className="fl-card" style={view.tint ? { ['--tint' as string]: view.tint } : undefined} onClick={() => { haptic(); openRef(w, f) }}>
              <span className="fl-card-glow" aria-hidden />
              <span className="fl-card-av">{view.avatar(42)}</span>
              <span className="fl-card-n">{view.title}</span>
              {lines.map((l, i) => <span key={i} className={`fl-card-l ${l.tone || ''}`}>{l.text}</span>)}
            </button>
          )
        })}
      </div>
      <div className="ns-feed">
        {!feed.length && <div className="card pad-card small muted" style={{ textAlign: 'center' }}>Nothing new in the last month. Results, moves, injuries and stories about what you follow will appear here.</div>}
        {days.map((g) => (
          <section key={g.d} className="ns-day">
            <div className="ns-day-h"><span>{dayLabel(w, g.d)}</span><i /></div>
            <div className="card list fl-list">{g.items.map((e) => <EventRow key={e.key} w={w} e={e} onClick={() => open(e)} />)}</div>
          </section>
        ))}
      </div>
      <Sheet open={manage} onClose={() => setManage(false)} title="Following">
        <div className="tiny dim" style={{ marginBottom: 10 }}>Tap the star to stop following. Nothing here sends you messages: developments appear in this feed, and only the big ones in the news drop-in.</div>
        <div className="card list">
          {list.map((f) => {
            const view = refView(w, f)
            if (!view) return null
            return (
              <div key={`${f.kind}:${f.id}`} className="li fl-manage">
                <span className="spot-av">{view.avatar(36)}</span>
                <div className="meta"><div className="t small ellipsis">{view.title}</div><div className="s tiny">{view.kindLabel} · since {fmtDate(f.since, 'dm')}</div></div>
                <FollowBtn w={w} kind={f.kind} id={f.id} name={view.title} />
              </div>
            )
          })}
        </div>
        {(() => { const gone = (w.follows || []).length - list.length; return gone > 0 ? <div className="tiny dim" style={{ marginTop: 10 }}>{gone} finished transfer stor{gone > 1 ? 'ies' : 'y'} no longer shown.</div> : null })()}
      </Sheet>
    </>
  )
}

function EventRow({ w, e, onClick }: { w: World; e: FollowEvent; onClick: () => void }) {
  const view = refView(w, e.ref)
  let badge: ReactNode = <span className={`fl-type ${e.tone || ''}`}><Icon name={TYPE_ICON[e.type]} size={13} /></span>
  if (e.type === 'result' && e.fixtureId) {
    const f = w.fixtures[e.fixtureId]
    const o = f ? outcomeFor(f, e.ref.id as number) : undefined
    if (o) badge = <span className={`fl-res ${o}`}>{o}</span>
  }
  const fresh = diffDays(w.date, e.date) <= 1
  return (
    <button className="li tap fl-ev" onClick={onClick}>
      <span className="fl-ev-av">{view?.avatar(34)}{badge}</span>
      <div className="meta">
        <div className={`t small ${e.importance >= 3 ? 'b' : ''}`}>{e.text}</div>
        {e.sub && <div className="s tiny ellipsis">{e.sub}</div>}
      </div>
      {fresh && e.importance >= 3 && <span className="fl-new" aria-label="New" />}
    </button>
  )
}
