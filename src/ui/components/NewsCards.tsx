// The news feed's story cards: one design system (same frame, rhythm and type scale), with every kind of story
// wearing its own identity: a scoreline for results, the move itself for transfers, a quote for managers, the number
// for records, gold for trophies and awards, the medical cross for injuries, a dashed "unconfirmed" look for rumours.
import type { NewsItem, World } from '../../domain/types'
import { Badge, CompLogo, Face } from './atoms'
import { Icon } from '../icons/Icon'
import { fmtDate, diffDays } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { underWhite } from '../theme'
import { haptic, useGame } from '../../store/game'

export type StoryType = 'result' | 'deal' | 'transfer' | 'rumour' | 'injury' | 'quote' | 'manager' | 'award' | 'champions' | 'race' | 'promotion' | 'relegation' | 'milestone' | 'retire' | 'youth' | 'contract' | 'board' | 'preview'

/** Label, icon and accent of each kind of story. */
export const STORY: Record<StoryType, { label: string; icon: string; tone: string }> = {
  result: { label: 'Result', icon: 'ball', tone: '#dfe5ec' },
  deal: { label: 'Done deal', icon: 'handshake', tone: '#2bf08f' },
  transfer: { label: 'Transfer', icon: 'transfers', tone: '#2bf08f' },
  rumour: { label: 'Rumour', icon: 'chat', tone: '#ffb020' },
  injury: { label: 'Injury', icon: 'injury', tone: '#ff6b78' },
  quote: { label: 'Manager', icon: 'manager', tone: '#5cb4ff' },
  manager: { label: 'Manager', icon: 'manager', tone: '#5cb4ff' },
  award: { label: 'Awards', icon: 'medal', tone: '#f4c542' },
  champions: { label: 'Champions', icon: 'trophy', tone: '#f4c542' },
  race: { label: 'Title race', icon: 'fire', tone: '#ff8a3d' },
  promotion: { label: 'Promotion', icon: 'arrowUp', tone: '#2bf08f' },
  relegation: { label: 'Relegation', icon: 'arrowDown', tone: '#ff6b78' },
  milestone: { label: 'Milestone', icon: 'flag', tone: '#b794ff' },
  retire: { label: 'Farewell', icon: 'history', tone: '#b9c2cf' },
  youth: { label: 'Academy', icon: 'youth', tone: '#37d3c4' },
  contract: { label: 'Contract', icon: 'contract', tone: '#37d3c4' },
  board: { label: 'Board', icon: 'board', tone: '#9aa7b8' },
  preview: { label: 'Preview', icon: 'calendar', tone: '#5cb4ff' },
}

export function storyType(n: NewsItem): StoryType {
  switch (n.kind) {
    case 'transfer': return n.clubIds.length >= 2 && !/talks|collapse|pre-contract|agrees/i.test(n.headline) ? 'deal' : 'transfer'
    case 'manager': return n.quote ? 'quote' : 'manager'
    case 'title': return /promot/i.test(n.headline + n.body) ? 'promotion' : n.clubIds.length >= 2 && !n.fixtureId ? 'race' : 'champions'
    case 'milestone': return /retire/i.test(n.headline) ? 'retire' : 'milestone'
    case 'record': return 'milestone'
    default: return n.kind as StoryType
  }
}

const num = (s: string) => { const m = /(\d{1,4})/.exec(s); return m ? m[1] : undefined }
const weeks = (s: string) => { const m = /(\d+)\s+weeks?/i.exec(s); return m ? `${m[1]} wk${m[1] === '1' ? '' : 's'}` : /months?/i.test(s) ? 'Months' : undefined }
const until = (s: string) => { const m = /(?:until|to) (?:June )?(20\d\d)/i.exec(s); return m ? m[1] : undefined }
const outlet = (s: string) => { const m = /^([A-Z][\w'.&\- ]{2,28}?) (?:report|reports|claim|claims|say|says|understand)\b/.exec(s); return m?.[1] }
const isIntl = (w: World, n: NewsItem) => (n.compId ? w.competitions[n.compId]?.format === 'intl' : false) || n.clubIds.some((id) => w.clubs[id]?.national)

/** Day heading for the feed: Today, Yesterday, then the date. */
export function dayLabel(w: World, d: string) {
  const k = diffDays(w.date, d)
  return k <= 0 ? 'Today' : k === 1 ? 'Yesterday' : k < 7 ? `${fmtDate(d, 'day')} ${fmtDate(d, 'dm')}` : fmtDate(d, 'dm')
}

export function StoryCard({ w, n, lead }: { w: World; n: NewsItem; lead?: boolean }) {
  const go = useGame((s) => s.go)
  const t = storyType(n)
  const S = STORY[t]
  const comp = n.compId ? w.competitions[n.compId] : undefined
  const club = n.clubIds[0] != null ? w.clubs[n.clubIds[0]] : n.quote ? w.clubs[n.quote.clubId] : undefined
  const p = n.playerIds[0] != null ? w.players[n.playerIds[0]] : undefined
  const breaking = n.importance >= 5 && diffDays(w.date, n.date) <= 1
  const intl = isIntl(w, n)
  const open = () => { haptic(); go({ name: 'article', params: { id: n.id } }) }
  const kicker = (
    <div className="ns-kick">
      {breaking && <span className="ns-breaking">Breaking</span>}
      <span className="ns-type"><Icon name={S.icon} size={12} />{S.label}</span>
      {intl && <span className="ns-intl"><Icon name="globe" size={11} />International</span>}
      {comp && <span className="ns-comp"><CompLogo k={comp.logoKey || comp.key} size={13} name={comp.name} />{comp.short}</span>}
    </div>
  )
  const headline = <div className="ns-h">{n.headline}</div>
  const body = <div className="ns-b">{n.body}</div>
  let visual: React.ReactNode = null
  let extra: React.ReactNode = null
  let layout: 'side' | 'stack' = 'side'

  if (t === 'result') {
    const f = n.fixtureId ? w.fixtures[n.fixtureId] : undefined
    const [h, a] = f ? [f.home, f.away] : [n.clubIds[0], n.clubIds[1]]
    const sc = f?.result?.score
    if (h != null && a != null) {
      layout = 'stack'
      visual = (
        <div className="ns-score">
          <span className={`ns-sc-team ${h === w.userClubId ? 'me' : ''}`}><Badge club={w.clubs[h]} size={lead ? 40 : 30} /><b className="ellipsis">{w.clubs[h]?.short}</b></span>
          <span className="ns-sc-num">{sc ? <>{sc[0]}<i>–</i>{sc[1]}</> : 'v'}</span>
          <span className={`ns-sc-team r ${a === w.userClubId ? 'me' : ''}`}><b className="ellipsis">{w.clubs[a]?.short}</b><Badge club={w.clubs[a]} size={lead ? 40 : 30} /></span>
        </div>
      )
    }
  } else if (t === 'deal' || t === 'rumour' || t === 'transfer') {
    const to = n.clubIds[0] != null ? w.clubs[n.clubIds[0]] : undefined
    const from = n.clubIds[1] != null ? w.clubs[n.clubIds[1]] : p ? w.clubs[p.clubId] : undefined
    visual = p ? <Face p={p} size={lead ? 68 : 52} radius={14} club={w.clubs[p.clubId]} /> : to ? <Badge club={to} size={44} /> : null
    if (to && from && to !== from && t !== 'transfer') {
      extra = (
        <div className="ns-move">
          <Badge club={from} size={20} /><span className="ellipsis tiny">{from.short}</span>
          <svg className={`ns-arrows ${t}`} width="28" height="14" viewBox="0 0 32 16" aria-hidden><path d="M1 2h4l6 6-6 6H1l6-6z" /><path d="M11 2h4l6 6-6 6h-4l6-6z" /><path d="M21 2h4l6 6-6 6h-4l6-6z" /></svg>
          <Badge club={to} size={20} /><span className="ellipsis tiny b">{to.short}</span>
          <span className="grow" />
          {t === 'deal' && <span className="ns-fee">{n.fee ? fmtMoney(n.fee, { short: true }) : /free/i.test(n.body) ? 'Free' : 'Undisclosed'}</span>}
          {t === 'rumour' && outlet(n.body) && <span className="ns-src">{outlet(n.body)}</span>}
        </div>
      )
    }
  } else if (t === 'injury') {
    visual = p ? <span className="ns-injured"><Face p={p} size={lead ? 64 : 50} radius={14} club={w.clubs[p.clubId]} /><i><Icon name="plus" size={11} color="#fff" /></i></span> : null
    const wk = weeks(n.body)
    if (wk) extra = <div className="ns-tags"><span className="ns-tag bad"><Icon name="clock" size={11} />Out {wk}</span>{club && <span className="ns-tag"><Badge club={club} size={13} />{club.short}</span>}</div>
  } else if (t === 'quote' && n.quote) {
    layout = 'stack'
    visual = (
      <div className="ns-quote">
        <span className="ns-qmark">“</span>
        <div className="ns-qtext">{n.quote.text}</div>
        <div className="ns-qby"><Badge club={w.clubs[n.quote.clubId]} size={16} /><b>{n.quote.by}</b><span className="dim">· {w.clubs[n.quote.clubId]?.short}</span></div>
      </div>
    )
  } else if (t === 'award') {
    const faces = [...new Set(n.playerIds)].map((id) => w.players[id]).filter(Boolean).slice(0, 4)
    visual = faces.length ? <span className="ns-faces">{faces.map((x) => <Face key={x.id} p={x} size={faces.length > 1 ? 40 : 52} radius={12} club={w.clubs[x.clubId]} />)}</span> : <span className="ns-icon"><Icon name="medal" size={26} color={S.tone} /></span>
    if (faces.length > 1) layout = 'stack'
  } else if (t === 'champions' || t === 'promotion' || t === 'relegation') {
    visual = club ? <span className="ns-crest"><Badge club={club} size={lead ? 58 : 44} />{t === 'champions' && <i><Icon name="trophy" size={12} color="#1d1604" /></i>}</span> : comp ? <CompLogo k={comp.logoKey || comp.key} size={40} name={comp.name} /> : null
  } else if (t === 'race') {
    const [a, b] = n.clubIds.map((id) => w.clubs[id])
    visual = <span className="ns-duo"><Badge club={a} size={36} /><Badge club={b} size={30} /></span>
  } else if (t === 'milestone') {
    const k = num(n.headline)
    visual = p ? <span className="ns-big">{p && <Face p={p} size={lead ? 64 : 50} radius={14} club={w.clubs[p.clubId]} />}{k && <b>{k}</b>}</span> : null
  } else {
    visual = p ? <Face p={p} size={lead ? 64 : 50} radius={14} club={w.clubs[p.clubId]} /> : club ? <span className="ns-icon"><Badge club={club} size={36} /></span> : comp ? <span className="ns-icon"><CompLogo k={comp.logoKey || comp.key} size={30} name={comp.name} /></span> : <span className="ns-icon"><Icon name={S.icon} size={22} color={S.tone} /></span>
    if (t === 'contract' && until(n.body)) extra = <div className="ns-tags"><span className="ns-tag good"><Icon name="contract" size={11} />Until {until(n.body)}</span></div>
  }

  const tint = (t === 'champions' || t === 'promotion' || lead) && club ? underWhite(club.kit?.[0]) : undefined
  return (
    <button className={`ns-card t-${t} ${lead ? 'lead' : ''} ${layout} ${n.userRelated ? 'mine' : ''}`} style={{ ['--tc' as any]: S.tone, ...(tint ? { ['--club-tint' as any]: tint } : {}) }} onClick={open}>
      {kicker}
      {layout === 'stack' ? (
        t === 'quote' ? <>{headline}{visual}</> : <>{visual}{headline}{body}</>
      ) : (
        <div className="ns-row">
          <div className="ns-text">{headline}{body}</div>
          {visual && <div className="ns-vis">{visual}</div>}
        </div>
      )}
      {extra}
    </button>
  )
}
