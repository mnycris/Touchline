// Following and the things search finds: the star that follows something, and one way of showing any entity of the
// world (face, badge, logo, the move itself) with its name, a useful line about it, and where tapping it goes.
import { useState, type ReactNode } from 'react'
import type { Competition, FollowKind, SearchRef, World } from '../../domain/types'
import { haptic, useGame, type Tab } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, Flag, ManagerAvatar, UserAvatar } from './atoms'
import { DealArrows, STAGE_BANNER, STAGE_TONE } from './TransferCard'
import { STORY, storyType } from './NewsCards'
import { isFollowing, toggleFollow } from '../../engine/world/follow'
import { compLogoKey, standing } from '../selectors'
import { placeById } from '../search'
import { fmtMoney } from '../../domain/finance'
import { ageOn, fmtDate } from '../../domain/dates'
import { callName } from '../../engine/match/commentary'
import { sortTable } from '../../engine/competitions/tables'

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

/** This season's edition of a competition, or the latest one there is. */
export function compByKey(w: World, key: string): Competition | undefined {
  let best: Competition | undefined
  for (const c of Object.values(w.competitions)) if (c.key === key && (!best || (c.season === w.season ? 1e4 : c.season) > (best.season === w.season ? 1e4 : best.season))) best = c
  return best
}

const KIND_LABEL: Record<FollowKind, string> = { player: 'player', club: 'club', manager: 'manager', comp: 'competition', story: 'transfer' }

/** The follow star: the same small icon everywhere something can be followed. */
export function FollowBtn({ w, kind, id, name }: { w: World; kind: FollowKind; id: number | string; name: string }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const on = isFollowing(w, kind, id)
  const [pop, setPop] = useState(0)
  return (
    <button className={`iconbtn follow-btn ${on ? 'on' : ''}`} aria-label={on ? `Unfollow ${name}` : `Follow ${name}`} aria-pressed={on}
      onClick={() => {
        haptic(on ? 'light' : 'medium')
        let now = false
        mutate((x) => { now = toggleFollow(x, kind, id) })
        setPop((n) => n + 1)
        notify(now ? `Following ${name}` : `Stopped following ${name}`, now ? 'ok' : 'info')
      }}>
      <StarGlyph on={on} key={pop} size={19} />
      <span className="sr">{on ? 'Following' : `Follow this ${KIND_LABEL[kind]}`}</span>
    </button>
  )
}

export function StarGlyph({ on, size = 16 }: { on: boolean; size?: number }) {
  const d = 'm12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z'
  return (
    <svg className={`star-glyph ${on ? 'on' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill={on ? 'var(--gold)' : 'none'} stroke={on ? 'var(--gold)' : 'currentColor'} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  )
}

export interface RefView {
  title: string
  sub: ReactNode
  avatar: (size: number) => ReactNode
  /** a small thing on the right: rating, stage, position */
  aside?: ReactNode
  /** theme colour behind a highlighted card */
  tint?: string
  kindLabel: string
  followable?: FollowKind
}

/** How an entity looks in a list: search results, recent searches, the Following strip and feed. */
export function refView(w: World, r: SearchRef): RefView | undefined {
  switch (r.kind) {
    case 'player': {
      const p = w.players[r.id as number]
      if (!p) return undefined
      const club = w.clubs[p.clubId]
      return {
        title: p.name, kindLabel: 'Player', followable: 'player', tint: club?.theme,
        sub: <><Badge club={club} size={13} /><span>{club?.short || 'Free agent'}{p.loan && club ? ' (loan)' : ''} · {p.positions[0]} · {ageOn(p.dob, w.date)}</span></>,
        avatar: (s) => <Face p={p} size={s} radius={s / 2} club={club} />,
        aside: <span className="spot-ovr">{p.ovr}</span>,
      }
    }
    case 'club': {
      const c = w.clubs[r.id as number]
      if (!c) return undefined
      const lg = c.national ? undefined : w.leagues[c.leagueId]
      const st = c.national ? undefined : standing(w, c.id)
      return {
        title: c.name, kindLabel: c.national ? 'National team' : 'Club', followable: 'club', tint: c.theme,
        sub: c.national ? <><span>National team · {c.confed || 'FIFA'}</span></> : <><Flag w={w} nation={c.country} size={10} /><span>{lg ? `${lg.short || lg.name}` : c.country}{st ? ` · ${ordinal(st.pos)}${st.lastSeason ? ' last season' : ''}` : ''}</span></>,
        avatar: (s) => <Badge club={c} size={Math.round(s * 0.86)} />,
      }
    }
    case 'manager': {
      if (r.id === 'me') {
        const club = w.clubs[w.user.clubId]
        return { title: `${w.user.firstName} ${w.user.lastName}`, kindLabel: 'You', sub: <><Badge club={w.flags.unemployed ? undefined : club} size={13} /><span>{w.flags.unemployed ? 'Looking for a club' : club?.short} · your career</span></>, avatar: (s) => <UserAvatar w={w} size={s} radius={s / 2} /> }
      }
      const m = w.managers[r.id as number]
      if (!m) return undefined
      const club = w.clubs[m.clubId]
      return {
        title: m.name, kindLabel: 'Manager', followable: 'manager', tint: club?.theme,
        sub: club ? <><Badge club={club} size={13} /><span>{club.short} · {m.nationality}</span></> : <span>Out of work · {m.nationality}</span>,
        avatar: (s) => <ManagerAvatar name={m.name} real={m.real} size={s} radius={s / 2} nation={m.nationality} clubs={club ? [club.name] : []} />,
      }
    }
    case 'comp': {
      const c = compByKey(w, r.id as string)
      if (!c) return undefined
      const where = c.format === 'uefa' ? 'Europe' : c.format === 'intl' ? (c.intl?.confed === 'FIFA' ? 'World' : c.intl?.confed || 'International') : c.country
      const state = c.status === 'finished' ? (c.winner ? `Won by ${w.clubs[c.winner]?.short}` : 'Finished') : c.status === 'upcoming' ? 'Starts soon' : c.format === 'league' && c.table?.length ? `${w.clubs[sortTable(w, c)[0]?.clubId]?.short || ''} top` : 'In progress'
      return { title: c.name, kindLabel: 'Competition', followable: 'comp', sub: <span>{where} · {state}</span>, avatar: (s) => <span className="spot-logo" style={{ width: s, height: s }}><CompLogo k={compLogoKey(c)} size={Math.round(s * 0.72)} name={c.name} /></span> }
    }
    case 'story': {
      const s = w.market?.stories.find((x) => x.id === r.id)
      const p = s ? w.players[s.playerId] : undefined
      if (!s || !p) return undefined
      const to = w.clubs[s.to], from = w.clubs[s.from]
      const fee = s.kind === 'loan' ? 'loan' : s.kind === 'free' ? 'free' : s.fee ? fmtMoney(s.fee, { short: true }) : ''
      return {
        title: `${callName(p.name)} to ${to?.short || '?'}`, kindLabel: 'Transfer', followable: 'story', tint: to?.theme,
        sub: <><span className={`spot-stage ${STAGE_TONE[s.stage]}`}>{STAGE_BANNER[s.stage]}</span><span>{from?.short || 'Free agent'} → {to?.short}{fee ? ` · ${fee}` : ''}</span></>,
        avatar: (sz) => <span className="spot-move" style={{ width: sz, height: sz }}><Face p={p} size={sz} radius={sz / 2} club={from} /><span className="spot-move-to"><Badge club={to} size={Math.round(sz * 0.42)} /></span></span>,
        aside: <DealArrows stage={s.stage} size={14} />,
      }
    }
    case 'news': {
      const n = w.news.find((x) => x.id === r.id)
      if (!n) return undefined
      const t = STORY[storyType(n)]
      const p = n.playerIds.map((id) => w.players[id]).find(Boolean)
      const c = n.clubIds.map((id) => w.clubs[id]).find(Boolean)
      return {
        title: n.headline, kindLabel: t.label,
        sub: <><span style={{ color: t.tone }}>{t.label}</span><span>{fmtDate(n.date, 'dm')}</span></>,
        avatar: (s) => p ? <Face p={p} size={s} radius={s / 2} club={w.clubs[p.clubId]} /> : c ? <Badge club={c} size={Math.round(s * 0.86)} /> : <span className="spot-tile" style={{ width: s, height: s, color: t.tone }}><Icon name={t.icon} size={s * 0.5} /></span>,
      }
    }
    case 'career': {
      const pl = placeById(w, r.id as string)
      if (!pl) return undefined
      return { title: pl.title, kindLabel: 'Career', sub: <span>{pl.sub}</span>, avatar: (s) => <span className="spot-tile acc" style={{ width: s, height: s }}><Icon name={pl.icon} size={s * 0.48} /></span> }
    }
    case 'message': {
      const m = w.inbox.find((x) => x.id === r.id)
      if (!m) return undefined
      return { title: m.subject, kindLabel: 'Message', sub: <span>{m.from} · {fmtDate(m.date, 'dm')}</span>, avatar: (s) => <span className="spot-tile" style={{ width: s, height: s }}><Icon name="inbox" size={s * 0.48} /></span> }
    }
  }
  return undefined
}

/** Go to an entity: its profile, the story, the article, a career screen or a tab. */
export function openRef(w: World, r: SearchRef) {
  const st = useGame.getState()
  const go = (name: string, params?: unknown) => {
    const stack = st.overlay.length ? st.overlay : st.stacks[st.tab]
    const top = stack[stack.length - 1]
    if (top && top.name === name && JSON.stringify(top.params) === JSON.stringify(params)) return
    st.go({ name, params })
  }
  switch (r.kind) {
    case 'player': return go('player', { id: r.id })
    case 'club': return go('club', { id: r.id })
    case 'manager': return r.id === 'me' ? go('manager') : go('coach', { id: r.id })
    case 'comp': { const c = compByKey(w, r.id as string); if (c) go('comp', { id: c.id }); return }
    case 'story': return go('story', { id: r.id })
    case 'news': return go('article', { id: r.id })
    case 'message': return go('message', { id: r.id })
    case 'career': {
      const pl = placeById(w, r.id as string)
      if (!pl) return
      if (pl.tab) { if (st.tab === pl.tab) st.resetTab(); else st.setTab(pl.tab as Tab); return }
      if (pl.route) go(pl.route.name, pl.route.params)
    }
  }
}
