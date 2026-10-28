// A manager of another club: who he is, where he works and how it is going, the way his teams play, and what the
// papers say about him. Followed from here like a player or a club.
import type { Manager, World } from '../../domain/types'
import { useGame, useWorld } from '../../store/game'
import { Badge, CompLogo, Empty, Flag, FormPips, ManagerAvatar, Stars } from '../components/atoms'
import { Screen } from '../components/layout'
import { FollowBtn } from '../components/Follow'
import { StoryCard } from '../components/NewsCards'
import { FixtureRow } from './Match'
import { compLogoKey, fixturesOf, nextFixture, outcomeFor, standing } from '../selectors'
import { diffDays, fmtDate } from '../../domain/dates'
import { underWhite } from '../theme'

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

/** Stories about him: his quotes, his name in a headline, his club's managerial news while he is there. */
export function managerNews(w: World, m: Manager) {
  return w.news.filter((n) => n.quote?.by === m.name || n.headline.includes(m.name) || (n.kind === 'manager' && !!m.clubId && n.clubIds.includes(m.clubId) && (!m.appointed || n.date >= m.appointed)))
}

export function CoachProfile({ params }: { params?: { id: number } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const m = params ? w.managers[params.id] : undefined
  if (!m) return <Screen title="Manager" back><Empty icon="manager" title="Manager not found" /></Screen>
  const club = w.clubs[m.clubId]
  const st = club && !club.national ? standing(w, club.id) : undefined
  const next = club ? nextFixture(w, club.id) : undefined
  const r = m.record
  const pct = r.p ? Math.round((r.w / r.p) * 100) : 0
  const tenure = m.appointed && club ? diffDays(w.date, m.appointed) : 0
  const news = managerNews(w, m).slice(0, 5)
  const form = club ? fixturesOf(w, club.id).filter((f) => f.played && f.result).slice(-5).map((f) => outcomeFor(f, club.id)!).filter(Boolean) : []
  return (
    <Screen title={m.name} sub={club ? club.name : 'Out of work'} back right={<FollowBtn w={w} kind="manager" id={m.id} name={m.name} />}>
      <div className="pad">
        <div className="hero coach-hero" style={{ ['--cc' as string]: underWhite(club?.theme || '#2a3240') }}>
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <ManagerAvatar name={m.name} real={m.real} size={84} radius={42} nation={m.nationality} clubs={w.clubs[m.clubId] ? [w.clubs[m.clubId].name] : []} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="h2" style={{ lineHeight: 1.02 }}>{m.name}</div>
              <div className="row tight small" style={{ marginTop: 7, opacity: 0.9 }}><Flag w={w} nation={m.nationality} size={12} /><span>{m.nationality} · {m.age}</span></div>
              {club ? (
                <button className="row tight coach-club" onClick={() => go({ name: 'club', params: { id: club.id } })}>
                  <Badge club={club} size={20} /><span className="small b">{club.name}</span>
                </button>
              ) : <div className="small dim" style={{ marginTop: 8 }}>Between jobs</div>}
            </div>
          </div>
        </div>
      </div>
      <div className="pad" style={{ marginTop: 10 }}><div className="card jgrid c3 club-facts">
        <div><div className="tiny dim">Reputation</div><div style={{ marginTop: 5 }}><Stars n={Math.max(1, Math.round(m.reputation / 20))} size={12} /></div></div>
        <div><div className="tiny dim">Formation</div><div className="b small ellipsis" style={{ marginTop: 3 }}>{m.formation.split(' ')[0]}</div><div className="tiny dim ellipsis">{m.formation.split(' ').slice(1).join(' ') || '—'}</div></div>
        <div><div className="tiny dim">Style</div><div className="b small ellipsis" style={{ marginTop: 3 }}>{m.vision}</div></div>
      </div></div>
      <div className="pad stack" style={{ marginTop: 10 }}>
        <div className="card pad-card">
          <div className="row between"><span className="label">Record in this career</span><span className="tiny dim">{r.p} games</span></div>
          <div className="coach-rec">
            <div><b className="display">{r.w}</b><span className="tiny dim">Won</span></div>
            <div><b className="display">{r.d}</b><span className="tiny dim">Drawn</span></div>
            <div><b className="display">{r.l}</b><span className="tiny dim">Lost</span></div>
            <div><b className="display">{pct}%</b><span className="tiny dim">Win rate</span></div>
          </div>
          <div className="bar coach-bar"><i style={{ width: `${r.p ? (r.w / r.p) * 100 : 0}%`, background: 'var(--pos)' }} /><i style={{ width: `${r.p ? (r.d / r.p) * 100 : 0}%`, background: 'var(--t3)' }} /><i style={{ width: `${r.p ? (r.l / r.p) * 100 : 0}%`, background: 'var(--neg)' }} /></div>
          {m.trophies > 0 && <div className="small" style={{ marginTop: 10 }}><b className="gold">{m.trophies}</b> trophies in this career</div>}
        </div>
        {club && (
          <div className="card pad-card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="label">At {club.short}</span>
              <span className="tiny dim">{m.appointed ? `Since ${fmtDate(m.appointed, 'short')}${tenure > 60 ? ` · ${tenure >= 365 ? `${(tenure / 365).toFixed(1)} years` : `${Math.round(tenure / 30)} months`}` : ''}` : ''}</span>
            </div>
            {st && <button className="row tight small" disabled={!st.comp} onClick={() => st.comp && go({ name: 'comp', params: { id: st.comp.id } })}>{st.comp && <CompLogo k={compLogoKey(st.comp)} size={18} name={st.comp.name} />}<span>{st.lastSeason ? <>Finished <b>{ordinal(st.pos)}</b> in the {st.league} last season</> : <><b>{ordinal(st.pos)}</b> in the {st.league}</>}</span></button>}
            {form.length > 0 && <div className="row between" style={{ marginTop: 12 }}><span className="tiny dim">Last {form.length}</span><FormPips form={form} /></div>}
            {next && <><div className="tiny dim" style={{ margin: '12px 0 -4px' }}>Next match</div><div className="list" style={{ margin: '0 -14px -14px' }}><FixtureRow w={w} f={next} clubId={club.id} /></div></>}
          </div>
        )}
        {news.length > 0 && (
          <div>
            <div className="label" style={{ margin: '4px 2px 8px' }}>In the news</div>
            <div className="ns-feed" style={{ padding: 0 }}>{news.map((n) => <StoryCard key={n.id} w={w} n={n} />)}</div>
          </div>
        )}
      </div>
    </Screen>
  )
}
