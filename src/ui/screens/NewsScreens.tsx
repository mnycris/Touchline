// News: the feed (top stories, your club, the wider football world, transfers, results, awards) and the article view.
// Tapping a story opens the story — players, clubs and the match report are links inside it.
import { useMemo, useState } from 'react'
import type { NewsItem, World } from '../../domain/types'
import { useGame, useWorld, haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Empty, Face } from '../components/atoms'
import { Chips, Screen } from '../components/layout'
import { fmtDate } from '../../domain/dates'
import { articleFor } from '../../engine/world/articles'
import { Ball } from '../components/Glyphs'
import { useRemember } from '../memory'

const KIND_LABEL: Record<string, string> = { transfer: 'Transfer', rumour: 'Rumour', result: 'Result', injury: 'Injury', manager: 'Manager', record: 'Record', milestone: 'Milestone', youth: 'Youth', contract: 'Contract', title: 'Title', relegation: 'Relegation', award: 'Awards', board: 'Board', preview: 'Preview' }
const FILTERS = ['Top', 'My Club', 'World', 'Transfers', 'Results', 'Awards'] as const
type Filter = (typeof FILTERS)[number]

/** The manager's own press lines: part of the story of the club, not top news. */
export const isOwnQuote = (w: World, n: NewsItem) => !!n.quote && n.quote.clubId === w.userClubId && n.userRelated && n.kind === 'manager'

function matches(w: World, n: NewsItem, f: Filter) {
  switch (f) {
    case 'Top': return (n.importance >= 3 || (n.userRelated && n.importance >= 2)) && !isOwnQuote(w, n)
    case 'My Club': return n.userRelated
    case 'World': return !n.userRelated && n.kind !== 'rumour'
    case 'Transfers': return n.kind === 'transfer' || n.kind === 'contract' || n.kind === 'rumour'
    case 'Results': return n.kind === 'result' || n.kind === 'title' || n.kind === 'relegation' || n.kind === 'milestone' || n.kind === 'record'
    case 'Awards': return n.kind === 'award'
  }
}

export function News() {
  const w = useWorld()
  const [f, setF] = useRemember<Filter>('f', 'Top')
  const list = useMemo(() => w.news.filter((n) => matches(w, n, f)), [w.news.length, w.news[0]?.id, f])
  return (
    <Screen title="News" back>
      <Chips items={FILTERS.map((c) => ({ id: c, label: c }))} value={f} onChange={(v) => setF(v as Filter)} />
      {!list.length && <Empty icon="news" title="No stories yet" text={f === 'World' ? 'Stories from the leagues you follow appear here as the season unfolds.' : undefined} />}
      <div className="pad stack" style={{ marginTop: 10 }}>
        {list.slice(0, 120).map((n, i) => <NewsCard key={n.id} w={w} n={n} lead={i === 0} />)}
      </div>
    </Screen>
  )
}

function NewsThumb({ w, n, size }: { w: World; n: NewsItem; size: number }) {
  const p = n.playerIds[0] ? w.players[n.playerIds[0]] : undefined
  const c = n.clubIds[0] ? w.clubs[n.clubIds[0]] : n.quote ? w.clubs[n.quote.clubId] : undefined
  const comp = n.compId ? w.competitions[n.compId] : undefined
  if (n.kind === 'result' && n.clubIds.length >= 2) {
    return <div className="nw-pair" style={{ width: size, height: size }}><Badge club={w.clubs[n.clubIds[0]]} size={size * 0.56} /><Badge club={w.clubs[n.clubIds[1]]} size={size * 0.56} /></div>
  }
  if (p) return <Face p={p} size={size} radius={12} club={w.clubs[p.clubId]} />
  if (c) return <div className="msg-av" style={{ width: size, height: size }}><Badge club={c} size={size * 0.76} /></div>
  if (comp) return <div className="msg-av" style={{ width: size, height: size }}><CompLogo k={comp.logoKey || comp.key} size={size * 0.62} /></div>
  return <div className="msg-av" style={{ width: size, height: size }}><Icon name="news" size={size * 0.45} /></div>
}

export function NewsCard({ w, n, lead }: { w: World; n: NewsItem; lead?: boolean }) {
  const go = useGame((s) => s.go)
  const comp = n.compId ? w.competitions[n.compId] : undefined
  const club = n.clubIds[0] ? w.clubs[n.clubIds[0]] : undefined
  return (
    <button className={`card tap news-item ${lead ? 'lead' : ''}`} style={lead && club ? { ['--nc' as any]: club.kit?.[0] } : undefined} onClick={() => { haptic(); go({ name: 'article', params: { id: n.id } }) }}>
      <div className="row" style={{ gap: 12, padding: 12, alignItems: 'flex-start' }}>
        <NewsThumb w={w} n={n} size={lead ? 64 : 48} />
        <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
          <div className="row tight"><span className={`news-kind k-${n.kind}`}>{KIND_LABEL[n.kind] || n.kind}</span>{comp && <span className="tiny dim">{comp.short}</span>}<span className="tiny dim">· {fmtDate(n.date, 'dm')}</span></div>
          <div className={lead ? 'h3' : 'b'} style={{ marginTop: 5, fontSize: lead ? 21 : 15, lineHeight: 1.12 }}>{n.headline}</div>
          <div className="small muted nw-body" style={{ marginTop: 5 }}>{n.body}</div>
        </div>
      </div>
    </button>
  )
}

export function Article({ params }: { params: { id: string } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const n = w.news.find((x) => x.id === params.id)
  if (!n) return <Screen title="News" back><Empty icon="news" title="Story not found" text="Older stories are archived after a while." /></Screen>
  const a = articleFor(w, n)
  const heroClub = a.hero.kind === 'club' ? w.clubs[a.hero.id as number] : a.hero.kind === 'player' ? w.clubs[w.players[a.hero.id as number]?.clubId] : undefined
  const heroP = a.hero.kind === 'player' ? w.players[a.hero.id as number] : undefined
  const f = a.fixtureId ? w.fixtures[a.fixtureId] : undefined
  const winners = n.kind === 'award' && n.month ? w.awards.filter((x) => x.month === n.month) : []
  const related = [...new Set(n.playerIds)].map((id) => w.players[id]).filter(Boolean)
  const relClubs = [...new Set([...n.clubIds, ...(n.quote ? [n.quote.clubId] : [])])].map((id) => w.clubs[id]).filter(Boolean)
  return (
    <Screen title={KIND_LABEL[n.kind] || 'News'} back>
      <div className="art fade-up">
        <div className="art-hero" style={{ ['--hc' as any]: heroClub?.kit?.[0] || '#1fd67a', ['--hc2' as any]: heroClub?.kit?.[1] || '#0b0e13' }}>
          <div className="art-hero-bg" />
          {heroP ? <div className="art-face"><Face p={heroP} size={112} radius={24} club={heroClub} /></div>
            : f ? <div className="art-pair"><Badge club={w.clubs[f.home]} size={70} /><span className="art-score num">{f.result?.score[0]}–{f.result?.score[1]}</span><Badge club={w.clubs[f.away]} size={70} /></div>
              : heroClub ? <Badge club={heroClub} size={96} /> : n.compId ? <CompLogo k={w.competitions[n.compId]?.logoKey || w.competitions[n.compId]?.key || ''} size={80} /> : <Icon name="news" size={60} />}
        </div>
        <div className="pad">
          <div className="art-kicker"><span className={`news-kind k-${n.kind}`}>{a.kicker}</span><span className="tiny dim">{fmtDate(n.date, 'long')}</span></div>
          <h1 className="art-h">{a.headline}</h1>
          <p className="art-lede">{a.lede}</p>
          {a.paras.map((p, i) => <p key={i} className="art-p">{p}</p>)}

          {f?.result && (
            <button className="card tap art-match" onClick={() => go({ name: 'fixture', params: { id: f.id } })}>
              <Badge club={w.clubs[f.home]} size={28} /><span className="b ellipsis">{w.clubs[f.home]?.short}</span>
              <span className="art-ms num">{f.result.score[0]}–{f.result.score[1]}</span>
              <span className="b ellipsis">{w.clubs[f.away]?.short}</span><Badge club={w.clubs[f.away]} size={28} />
              <span className="tiny dim art-ml">Match report <Icon name="forward" size={12} /></span>
            </button>
          )}

          {winners.length > 0 && (
            <div className="art-awards">
              {winners.map((x) => {
                const p = x.playerId ? w.players[x.playerId] : undefined
                const c = x.clubId ? w.clubs[x.clubId] : undefined
                return (
                  <button key={x.id} className="art-award" onClick={() => p ? go({ name: 'player', params: { id: p.id } }) : c && go({ name: 'club', params: { id: c.id } })}>
                    {p ? <Face p={p} size={52} radius={14} club={w.clubs[p.clubId]} /> : c ? <Badge club={c} size={44} /> : null}
                    <span className="tiny b" style={{ color: 'var(--gold)' }}>{x.name.replace(/^.*? (Player|Manager)/, '$1')}</span>
                    <span className="small b ellipsis" style={{ maxWidth: '100%' }}>{p?.name || x.managerName}</span>
                    <span className="tiny dim row tight">{x.compKey && <CompLogo k={x.compKey} size={12} />}{x.name.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          )}

          {a.facts.length > 0 && (
            <div className="art-facts">
              {a.facts.map(([k, v]) => <div key={k} className="art-fact"><span className="tiny dim">{k}</span><span className="small b">{v}</span></div>)}
            </div>
          )}

          {(related.length > 0 || relClubs.length > 0) && (
            <div className="art-rel">
              <div className="label" style={{ marginBottom: 8 }}>In this story</div>
              <div className="row wrap" style={{ gap: 8 }}>
                {related.slice(0, 6).map((p) => <button key={p.id} className="chip" onClick={() => go({ name: 'player', params: { id: p.id } })}><Face p={p} size={20} radius={10} club={w.clubs[p.clubId]} /> {p.name}</button>)}
                {relClubs.slice(0, 4).map((c) => <button key={c.id} className="chip" onClick={() => go({ name: 'club', params: { id: c.id } })}><Badge club={c} size={16} /> {c.short}</button>)}
              </div>
            </div>
          )}
          {n.kind === 'result' && !f?.result && <div className="tiny dim" style={{ marginTop: 12 }}><Ball size={10} /> Full match data isn't kept for this game.</div>}
        </div>
      </div>
    </Screen>
  )
}

/** "Latest news" drop-in: two or three important fresh stories, then it gets out of the way. */
export function NewsDrop() {
  const drop = useGame((s) => s.newsDrop)
  const clear = useGame((s) => s.clearNewsDrop)
  const go = useGame((s) => s.go)
  const w = useGame((s) => s.world)
  if (!drop || !w) return null
  const items = drop.ids.map((id) => w.news.find((n) => n.id === id)).filter(Boolean) as NewsItem[]
  if (!items.length) return null
  return (
    <div className="ndrop" key={drop.nonce} onAnimationEnd={(e) => { if (e.animationName === 'ndropOut') clear() }}>
      <div className="ndrop-h">
        <button className="row tight" onClick={() => { haptic(); clear(); go({ name: 'news' }) }}><span className="ndrop-dot" /><span className="ndrop-k">Latest news</span></button>
        <button className="ndrop-x" onClick={() => { haptic(); clear() }} aria-label="Dismiss"><Icon name="close" size={14} strokeWidth={2.4} /></button>
      </div>
      {items.map((n) => (
        <button key={n.id} className="ndrop-row" onClick={() => { haptic(); clear(); go({ name: 'article', params: { id: n.id } }) }}>
          <NewsThumb w={w} n={n} size={30} />
          <span className="ellipsis2 small b">{n.headline}</span>
        </button>
      ))}
    </div>
  )
}
