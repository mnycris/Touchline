// Universal search, Spotlight-style: the field grows out of the search button with the keyboard already up, the
// screen behind blurs, results arrive as you type (top hit, then players, clubs, managers, competitions, transfers,
// news and the career's own screens), and it slips away just as quickly. Empty, it offers what you follow, your
// recent searches and a few useful suggestions.
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SearchKind, SearchRef, World } from '../../domain/types'
import { haptic, useGame } from '../../store/game'
import { Icon } from '../icons/Icon'
import { matchRanges, refOf, search, warmSearch, type Hit } from '../search'
import { spotInput } from '../spot'
import { FollowBtn, StarGlyph, openRef, refView } from './Follow'
import { clearRecent, exists, follows, isFollowing, noteRecent } from '../../engine/world/follow'
import { leagueOf, nextFixture, opponent } from '../selectors'

const LABEL: Record<SearchKind, string> = { player: 'Players', club: 'Clubs', manager: 'Managers', comp: 'Competitions', story: 'Transfers', news: 'News', career: 'Career', message: 'Inbox' }
const SHOW: Record<SearchKind, number> = { player: 5, club: 4, manager: 3, comp: 3, story: 3, news: 3, career: 3, message: 2 }
const CAT_ORDER: SearchKind[] = ['player', 'club', 'manager', 'comp', 'story', 'news', 'career', 'message']

/** The matched parts of a name, in bold. */
function hl(text: string, words: string[]): ReactNode {
  const r = matchRanges(text, words)
  if (!r.length) return text
  const out: ReactNode[] = []
  let at = 0
  r.forEach(([a, b], i) => { if (a < at) return; if (a > at) out.push(text.slice(at, a)); out.push(<mark key={i} className="spot-hl">{text.slice(a, b)}</mark>); at = b })
  if (at < text.length) out.push(text.slice(at))
  return out
}

export function Spotlight() {
  const open = useGame((s) => s.searchOpen)
  const close = useGame((s) => s.closeSearch)
  const mutate = useGame((s) => s.mutate)
  const v = useGame((s) => s.v)
  const w = useGame((s) => s.world)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<SearchKind | 'all'>('all')
  const dq = useDeferredValue(q)
  const input = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const closedAt = useRef(0)
  // stays drawn while it fades out
  const [shown, setShown] = useState(false)
  useEffect(() => { spotInput.el = input.current; return () => { spotInput.el = null } }, [])
  // the index is built once in idle time, so the first search is as quick as the rest
  useEffect(() => { if (!w) return; const t = window.setTimeout(() => warmSearch(w), 1800); return () => window.clearTimeout(t) }, [w?.meta.id])
  useEffect(() => {
    if (open) {
      setShown(true)
      // back after a while: start afresh (a quick return keeps the last search, selected)
      if (closedAt.current && Date.now() - closedAt.current > 90_000) { setQ(''); setCat('all') }
      body.current?.scrollTo({ top: 0 })
      return
    }
    closedAt.current = Date.now()
    input.current?.blur()
    const t = window.setTimeout(() => setShown(false), 320)
    return () => window.clearTimeout(t)
  }, [open])
  const cancel = () => { haptic(); setQ(''); setCat('all'); close() }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancel() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const res = useMemo(() => (shown && w && dq.trim() ? search(w, dq, undefined, 60) : undefined), [shown, dq, v])
  const pick = (r: SearchRef) => {
    if (!w) return
    haptic()
    mutate((x) => noteRecent(x, r), { save: false })
    close()
    openRef(w, r)
  }
  const counts = useMemo(() => {
    const m = new Map<SearchKind, number>()
    for (const g of res?.groups || []) m.set(g.kind, g.total)
    if (res?.top) m.set(res.top.kind, (m.get(res.top.kind) || 0) + 1)
    return m
  }, [res])
  const cats = CAT_ORDER.filter((k) => counts.get(k))
  const active = cat !== 'all' && !counts.get(cat) ? 'all' : cat
  const first: Hit | undefined = res?.top || res?.groups[0]?.hits[0]

  return (
    <div className={`spot ${open ? 'on' : ''}`} aria-hidden={!open}>
      <div className="spot-bg" onClick={cancel} />
      <div className="spot-bar">
        <label className="spot-field">
          <span className="spot-glass"><Icon name="search" size={18} /></span>
          <input
            ref={input} className="spot-input" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
            tabIndex={open ? 0 : -1} placeholder="Search the football world" value={q}
            onChange={(e) => { setQ(e.target.value); if (!e.target.value) setCat('all') }}
            onKeyDown={(e) => { if (e.key === 'Enter' && first) { e.preventDefault(); input.current?.blur(); pick(refOf(first)) } }}
          />
          {q && <button className="spot-clear" aria-label="Clear" tabIndex={open ? 0 : -1} onClick={(e) => { e.preventDefault(); setQ(''); setCat('all'); input.current?.focus() }}><Icon name="close" size={13} strokeWidth={2.6} /></button>}
        </label>
        <button className="spot-cancel" tabIndex={open ? 0 : -1} onClick={cancel}>Cancel</button>
      </div>
      <div className="spot-body" ref={body} onTouchStart={(e) => { if (!(e.target as HTMLElement).closest('.spot-cats')) input.current?.blur() }}>
        {shown && w && (q.trim() ? (
          res && (res.top || res.groups.length) ? (
            <>
              {cats.length > 1 && (
                <div className="chips spot-cats">
                  <button className={`chip sm ${active === 'all' ? 'on' : ''}`} onClick={() => { haptic(); setCat('all') }}>All</button>
                  {cats.map((k) => <button key={k} className={`chip sm ${active === k ? 'on' : ''}`} onClick={() => { haptic(); setCat(k); body.current?.scrollTo({ top: 0 }) }}>{LABEL[k]}<span className="chip-n">{counts.get(k)}</span></button>)}
                </div>
              )}
              {active === 'all' && res.top && <TopHit w={w} h={res.top} words={res.words} onPick={pick} />}
              {(active === 'all' ? res.groups : res.groups.filter((g) => g.kind === active)).map((g) => {
                const hits = active === 'all' ? g.hits.slice(0, SHOW[g.kind]) : [...(res.top?.kind === g.kind ? [res.top] : []), ...g.hits]
                const more = active === 'all' ? g.total - hits.length : 0
                return (
                  <section key={g.kind} className="spot-group">
                    <div className="spot-gh"><span className="label">{LABEL[g.kind]}</span>{more > 0 && <button className="link" onClick={() => { haptic(); setCat(g.kind); body.current?.scrollTo({ top: 0 }) }}>See all {g.total + (res.top?.kind === g.kind ? 1 : 0)}</button>}</div>
                    <div className="spot-list">{hits.map((h) => <Row key={`${h.kind}:${h.id}`} w={w} h={h} words={res.words} onPick={pick} />)}</div>
                  </section>
                )
              })}
            </>
          ) : res ? (
            <div className="spot-none">
              <Icon name="search" size={30} />
              <div className="b">Nothing for “{q.trim()}”</div>
              <div className="small dim">Try part of a name (“bruno g”), a nickname (“spurs”) or a place in your career (“contracts”).</div>
            </div>
          ) : null
        ) : <Home w={w} onPick={pick} />)}
      </div>
    </div>
  )
}

function Row({ w, h, words, onPick }: { w: World; h: Pick<Hit, 'kind' | 'id'>; words: string[]; onPick: (r: SearchRef) => void }) {
  const view = refView(w, h)
  if (!view) return null
  const followed = !!view.followable && isFollowing(w, view.followable, h.id)
  return (
    <button className={`spot-row k-${h.kind}`} onClick={() => onPick(refOf(h))}>
      <span className="spot-av">{view.avatar(40)}</span>
      <span className="spot-txt">
        <span className="spot-t">{hl(view.title, words)}</span>
        <span className="spot-s">{view.sub}</span>
      </span>
      {followed && <span className="spot-star"><StarGlyph on size={13} /></span>}
      {view.aside}
    </button>
  )
}

function TopHit({ w, h, words, onPick }: { w: World; h: Hit; words: string[]; onPick: (r: SearchRef) => void }) {
  const view = refView(w, h)
  if (!view) return null
  return (
    <div className="spot-top" style={view.tint ? { ['--tint' as string]: view.tint } : undefined}>
      <span className="spot-top-glow" aria-hidden />
      <button className="spot-top-main" onClick={() => onPick(refOf(h))}>
        <span className="spot-av big">{view.avatar(56)}</span>
        <span className="spot-txt">
          <span className="spot-kind">Top hit · {view.kindLabel}</span>
          <span className="spot-top-t">{hl(view.title, words)}</span>
          <span className="spot-s">{view.sub}</span>
        </span>
        {view.aside}
      </button>
      {view.followable && <FollowBtn w={w} kind={view.followable} id={h.id} name={view.title} />}
    </div>
  )
}

/** Before typing: what he follows, what he searched for lately, and a few things worth a tap. */
function Home({ w, onPick }: { w: World; onPick: (r: SearchRef) => void }) {
  const mutate = useGame((s) => s.mutate)
  const fl = follows(w).slice(0, 24)
  const recent = (w.recentSearch || []).filter((r) => exists(w, r)).slice(0, 8)
  const suggest: SearchRef[] = []
  if (recent.length < 4 && !w.flags.unemployed) {
    const nf = nextFixture(w, w.userClubId)
    if (nf) suggest.push({ kind: 'club', id: opponent(nf, w.userClubId) })
    const lg = leagueOf(w, w.userClubId)
    if (lg) suggest.push({ kind: 'comp', id: lg.key })
    const hot = (w.market?.stories || []).filter((s) => s.stage !== 'failed' && s.stage !== 'rumour' && w.players[s.playerId]).sort((a, b) => (b.fee || 0) - (a.fee || 0))[0]
    if (hot) suggest.push({ kind: 'story', id: hot.id })
  }
  const sug = suggest.filter((r) => !recent.some((x) => x.kind === r.kind && x.id === r.id))
  if (!fl.length && !recent.length && !sug.length) {
    return <div className="spot-none"><Icon name="search" size={30} /><div className="b">Search the football world</div><div className="small dim">Players, clubs, managers, competitions, transfers and news, and every screen of your career.</div></div>
  }
  return (
    <>
      {fl.length > 0 && (
        <section className="spot-group">
          <div className="spot-gh"><span className="label">Following</span><button className="link" onClick={() => { haptic(); useGame.getState().closeSearch(); useGame.getState().go({ name: 'news', params: { f: 'Following' } }) }}>Latest</button></div>
          <div className="spot-follow">
            {fl.map((f) => {
              const view = refView(w, f)
              if (!view) return null
              return <button key={`${f.kind}:${f.id}`} className="spot-f" onClick={() => onPick({ kind: f.kind, id: f.id })}><span className="spot-f-av">{view.avatar(52)}</span><span className="spot-f-n">{shortName(view.title, f.kind)}</span></button>
            })}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="spot-group">
          <div className="spot-gh"><span className="label">Recent</span><button className="link" onClick={() => { haptic(); mutate((x) => clearRecent(x), { save: false }) }}>Clear</button></div>
          <div className="spot-list">{recent.map((r) => <Row key={`${r.kind}:${r.id}`} w={w} h={r} words={[]} onPick={onPick} />)}</div>
        </section>
      )}
      {sug.length > 0 && (
        <section className="spot-group">
          <div className="spot-gh"><span className="label">Suggested</span></div>
          <div className="spot-list">{sug.map((r) => <Fragment key={`${r.kind}:${r.id}`}><Row w={w} h={r} words={[]} onPick={onPick} /></Fragment>)}</div>
        </section>
      )}
    </>
  )
}

const shortName = (t: string, kind: string) => (kind === 'player' ? t.replace(/^[A-ZÀ-Ý]\.\s+/u, '') : kind === 'story' ? t.split(' to ')[0] : t.replace(/^(FC|AFC|SC|SV|AC|AS|RC|CF)\s+/, ''))
