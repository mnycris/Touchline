import { useMemo } from 'react'
import { movedText } from '../moved'
import { useGame, useWorld, haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, FormPips, Ring, UserAvatar } from '../components/atoms'
import { HubActions, Screen, SectionTitle } from '../components/layout'
import { addDays, diffDays, fmtDate, seasonLabel, weekday } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { compLogoKey, fixturesOf, leagueOf, nextFixture, opponent, outcomeFor, scoreLine, tableAround, userClub, lastResult, playerStatus } from '../selectors'
import { ZONE_COLOR, zoneFor, sortTable } from '../../engine/competitions/tables'
import { rosterOf } from '../../engine/world/roster'
import { currentWindow } from '../../engine/competitions/calendar'
import { unreadCount } from '../../engine/world/messages'
import { boardMood } from '../../engine/world/board'
import { userFixtureOn } from '../../engine/world/advance'
import { ordinal } from './Menu'
import type { Fixture, World } from '../../domain/types'
import { Fx } from '../components/Fx'
import { kitColors } from '../components/LivePitch'
import { underWhite } from '../theme'
import { FixtureRow } from './Match'
import { intlStage, userOnDuty } from '../../engine/world/international'

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function Hub() {
  const w = useWorld()
  const club = userClub(w)
  const go = useGame((s) => s.go)
  const unemployed = !!w.flags.unemployed

  if (unemployed) return <Unemployed />

  const next = nextFixture(w, club.id)
  const today = userFixtureOn(w, w.date)
  const league = leagueOf(w, club.id)
  const last = lastResult(w, club.id)
  const squad = rosterOf(w, club.id)
  const injured = squad.filter((p) => p.injury)
  const unhappy = squad.filter((p) => p.morale < 35)
  const tired = squad.filter((p) => !p.injury && p.fitness < 65)
  const win = currentWindow(w)
  const unread = unreadCount(w)
  const latestMsg = w.inbox.find((m) => !m.read) || w.inbox[0]
  const topNews = w.news.find((n) => n.userRelated) || w.news[0]
  const form = fixturesOf(w, club.id).filter((f) => f.played && f.result).slice(-5).map((f) => outcomeFor(f, club.id)!)
  const pendingConv = w.conversations.filter((c) => !c.resolved)

  return (
    <Screen
      title={
        <div className="row" style={{ gap: 10 }}>
          <Badge club={club} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="title ellipsis" style={{ fontSize: 17 }}>{club.name}</div>
            <div className="tiny muted">{fmtDate(w.date, 'full')} · {seasonLabel(w.season)}</div>
          </div>
        </div>
      }
      right={<HubActions />}
      footer={<ContinueBar />}
    >
      <div className="pad stack stagger">
        {w.flags.celebrate && w.flags.celebrate.date >= addDays(w.date, -60) && <Celebration w={w} />}
        {next ? <NextMatchCard w={w} f={next} today={!!today} /> : <SeasonDoneCard w={w} />}
        <CalendarStrip w={w} />
        <IntlDutyCard w={w} />

        {pendingConv.length > 0 && (
          <button className="card tap alert-card" onClick={() => { const m = w.inbox.find((x) => x.actions.some((a) => a.action === 'openConversation' && a.payload === pendingConv[0].id)); m ? go({ name: 'message', params: { id: m.id } }) : go({ name: 'conversation', params: { id: pendingConv[0].id } }) }}>
            <div className="row" style={{ padding: 12, gap: 12 }}>
              <Face p={w.players[pendingConv[0].playerId]} size={40} radius={10} club={club} />
              <div className="grow" style={{ textAlign: 'left' }}>
                <div className="kicker" style={{ color: 'var(--warn)' }}>Player wants to talk</div>
                <div className="b small" style={{ marginTop: 2 }}>{w.players[pendingConv[0].playerId]?.name} · {pendingConv[0].kind}</div>
              </div>
              <Icon name="chat" size={20} color="var(--warn)" />
            </div>
          </button>
        )}

        <div className="grid2">
          <Tile icon="inbox" label="Inbox" onClick={() => go({ name: 'inbox' })} badge={unread}>
            <div className="b small ellipsis2">{latestMsg?.subject || 'No messages'}</div>
            <div className="tiny dim" style={{ marginTop: 4 }}>{latestMsg ? `${latestMsg.from} · ${fmtDate(latestMsg.date, 'dm')}` : ''}</div>
          </Tile>
          <Tile icon="board" label="Board" onClick={() => go({ name: 'office' })}>
            <div className="row" style={{ gap: 10 }}>
              <Ring v={w.board.overall} size={46} />
              <div className="small"><div className="b">{boardMood(w.board.overall)}</div><div className="tiny dim">{w.board.objectives.filter((o) => o.status === 'active' && o.season === w.season).length} objectives</div></div>
            </div>
          </Tile>
        </div>

        {league && <MiniTable w={w} />}

        <div className="grid2">
          <Tile icon="squad" label="Squad Status" onClick={() => go({ name: 'squadStatus' })}>
            <div className="stack" style={{ gap: 6 }}>
              <StatusLine icon="injury" color="var(--neg)" n={injured.length} label="Injured" />
              <StatusLine icon="fitness" color="var(--warn)" n={tired.length} label="Low energy" />
              <StatusLine icon="moraleLow" color="var(--warn)" n={unhappy.length} label="Unhappy" />
            </div>
          </Tile>
          <Tile icon="transfers" label={win ? `${win.name} Window` : 'Transfers'} onClick={() => useGame.getState().setTab('transfers')}>
            <div className="display" style={{ fontSize: 22 }}>{fmtMoney(club.finance.transferBudget, { short: true })}</div>
            <div className="tiny dim" style={{ marginTop: 3 }}>{win ? (diffDays(win.close, w.date) === 0 ? <span className="neg b">DEADLINE DAY</span> : `Closes in ${diffDays(win.close, w.date)} days`) : `Opens ${fmtDate(nextWindowOpen(w) || w.date, 'dm')}`}</div>
          </Tile>
        </div>

        {last?.result && (
          <button className="card tap" onClick={() => go({ name: 'fixture', params: { id: last.id } })}>
            <div className="card-h"><span className="label">Last Result</span><FormPips form={form} /></div>
            <div className="row" style={{ padding: '0 14px 14px', gap: 10 }}>
              <Badge club={w.clubs[last.home]} size={30} />
              <div className="grow b small ellipsis" style={{ textAlign: 'left' }}>{w.clubs[last.home].short}</div>
              <div className={`score-pill ${outcomeFor(last, club.id)}`}>{scoreLine(last)}</div>
              <div className="grow b small ellipsis" style={{ textAlign: 'right' }}>{w.clubs[last.away].short}</div>
              <Badge club={w.clubs[last.away]} size={30} />
            </div>
          </button>
        )}

        {topNews && (
          <button className="card tap news-card" onClick={() => go({ name: 'news' })}>
            <div className="card-h"><span className="label">Football News</span><Icon name="news" size={16} color="var(--t3)" /></div>
            <div className="card-b" style={{ textAlign: 'left' }}>
              <div className="h3" style={{ fontSize: 19, lineHeight: 1.08 }}>{topNews.headline}</div>
              <div className="small muted ellipsis2" style={{ marginTop: 6 }}>{topNews.body}</div>
            </div>
          </button>
        )}

        <div className="grid3">
          <MiniBtn icon="calendar" label="Calendar" onClick={() => go({ name: 'calendar' })} />
          <MiniBtn icon="tactics" label="Tactics" onClick={() => go({ name: 'tactics' })} />
          <MiniBtn icon="office" label="Office" onClick={() => go({ name: 'office' })} />
          <MiniBtn icon="manager" label="Career" onClick={() => go({ name: 'manager' })} />
          <MiniBtn icon="medal" label="Awards" onClick={() => go({ name: 'awards' })} />
          <MiniBtn icon="save" label="Save" onClick={() => useGame.getState().save(false)} />
        </div>
      </div>
    </Screen>
  )
}

function Celebration({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const c = w.competitions[w.flags.celebrate.compId]
  if (!c) return null
  return (
    <div className="hero celebrate-card">
      <Fx kind="confetti" />
      <div style={{ position: 'relative', zIndex: 1, padding: 18 }} className="col center">
        <CompLogo k={compLogoKey(c)} size={52} name={c.name} />
        <div className="kicker gold" style={{ marginTop: 10 }}>Champions</div>
        <div className="h1" style={{ textAlign: 'center', marginTop: 4 }}>{c.name}</div>
        <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>{w.clubs[w.userClubId].name} · {seasonLabel(c.season)}</div>
        <button className="btn sm" style={{ marginTop: 12, background: 'rgba(0,0,0,.35)' }} onClick={() => mutate((w) => { w.flags.celebrate = undefined })}>Celebrate & continue</button>
      </div>
    </div>
  )
}

function nextWindowOpen(w: World) {
  return w.windows.map((x) => x.open).filter((d) => d > w.date).sort()[0]
}

function StatusLine({ icon, color, n, label }: { icon: string; color: string; n: number; label: string }) {
  return <div className="row tight small"><Icon name={icon} size={15} color={n ? color : 'var(--t3)'} /><span className="b num" style={{ width: 16 }}>{n}</span><span className="muted">{label}</span></div>
}

function Tile({ icon, label, children, onClick, badge }: { icon: string; label: string; children: React.ReactNode; onClick: () => void; badge?: number }) {
  return (
    <button className="card tap tile" onClick={() => { haptic(); onClick() }}>
      <span className="wm"><Icon name={icon} size={96} strokeWidth={1.4} /></span>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row tight"><Icon name={icon} size={16} color="var(--club2)" /><span className="label">{label}</span></div>
        {!!badge && <span className="pill" style={{ background: 'var(--neg)', color: '#fff' }}>{badge}</span>}
      </div>
      <div style={{ textAlign: 'left' }}>{children}</div>
    </button>
  )
}

function MiniBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="card tap mini-btn" onClick={() => { haptic(); onClick() }}>
      <Icon name={icon} size={22} color="var(--club2)" />
      <span>{label}</span>
    </button>
  )
}

function NextMatchCard({ w, f, today }: { w: World; f: Fixture; today: boolean }) {
  const open = useGame((s) => s.open)
  const go = useGame((s) => s.go)
  const comp = w.competitions[f.compId]
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const days = diffDays(f.date, w.date)
  // position in this match's own competition (league, league phase); nothing for a knockout tie
  const ctx = comp?.table && !f.tieId ? comp : undefined
  const lg = (id: number) => { const c = ctx || (f.tieId ? undefined : leagueOf(w, id)); if (!c || !c.table?.some((r) => r.p)) return ''; const t = sortTable(w, c); const i = t.findIndex((r) => r.clubId === id); return i >= 0 ? `${ordinal(i + 1)}${c.format === 'uefa' ? ` in the ${c.short}` : ''}` : '' }
  const [hc, ac] = kitColors(home, away).map(underWhite)
  return (
    <div className="hero next-match duo" style={{ ['--hc' as any]: hc, ['--ac' as any]: ac }}>
      <div style={{ position: 'relative', zIndex: 1, padding: '14px 14px 16px' }}>
        <div className="row between">
          <div className="row tight">
            {comp && <CompLogo k={compLogoKey(comp)} size={22} name={comp.name} />}
            <span className="label" style={{ color: 'rgba(255,255,255,.85)' }}>{comp?.short} · {f.roundName}</span>
            {f.moved && <span className="moved-chip" title={movedText(f)!.long}><Icon name="refresh" size={10} strokeWidth={2.6} />{movedText(f)!.tag}</span>}
          </div>
          <span className="pill" style={{ background: today ? 'var(--acc)' : 'rgba(0,0,0,.35)', color: today ? '#03170c' : '#fff' }}>{today ? 'MATCH DAY' : days === 1 ? 'TOMORROW' : `${days} DAYS`}</span>
        </div>
        <div className="row" style={{ marginTop: 14, alignItems: 'flex-start' }}>
          <div className="col center grow" style={{ gap: 6 }}>
            <Badge club={home} size={64} />
            <div className="b ellipsis" style={{ maxWidth: 120, textAlign: 'center' }}>{home.short}</div>
            <div className="tiny" style={{ opacity: 0.7 }}>{lg(home.id)}</div>
          </div>
          <div className="col center" style={{ paddingTop: 16, minWidth: 80 }}>
            <div className="display" style={{ fontSize: 30 }}>{f.time}</div>
            <div className="tiny" style={{ opacity: 0.8, marginTop: 4 }}>{fmtDate(f.date, 'day')}</div>
          </div>
          <div className="col center grow" style={{ gap: 6 }}>
            <Badge club={away} size={64} />
            <div className="b ellipsis" style={{ maxWidth: 120, textAlign: 'center' }}>{away.short}</div>
            <div className="tiny" style={{ opacity: 0.7 }}>{lg(away.id)}</div>
          </div>
        </div>
        <div className="row tight tiny" style={{ justifyContent: 'center', opacity: 0.85, marginTop: 10 }}>
          <Icon name="stadium" size={14} /> {f.venue || (f.neutral ? 'Neutral venue' : home.stadium)}
          {f.derby && <><span style={{ opacity: 0.5 }}>·</span><Icon name="fire" size={14} color="#ff8a5c" /> {f.derby}</>}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm grow" style={{ background: 'rgba(0,0,0,.28)' }} onClick={() => go({ name: 'tactics' })}><Icon name="tactics" size={16} /> Team Sheet</button>
          {today
            ? <button className="btn sm primary grow" onClick={() => open({ name: 'prematch' })}><Icon name="play" size={16} /> Match Day</button>
            : <button className="btn sm grow" style={{ background: 'rgba(0,0,0,.28)' }} onClick={() => open({ name: 'prematch', params: { id: f.id } })}><Icon name="eye" size={16} /> Preview</button>}
        </div>
      </div>
    </div>
  )
}

function SeasonDoneCard({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  // the summer's tournaments carry on after the club season
  const summer = Object.values(w.competitions).filter((c) => c.season === w.season && c.intl?.kind === 'tournament' && c.status !== 'finished' && c.fixtures.some((id) => w.fixtures[id] && !w.fixtures[id].played))
  return (
    <div className="hero" style={{ padding: 18 }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="kicker" style={{ color: '#fff' }}>Off-season</div>
        <div className="h2" style={{ marginTop: 6 }}>{summer.length ? 'Tournament summer' : 'No fixtures scheduled'}</div>
        <div className="small" style={{ opacity: 0.8, marginTop: 6 }}>{summer.length ? `Your season is over; the ${summer.length > 1 ? `${summer.slice(0, -1).map((c) => c.short).join(', ')} and ${summer[summer.length - 1].short}` : summer[0].short} ${summer.length > 1 ? 'are' : 'is'} on. The season review follows the last final.` : `Continue to the end of the season. The ${seasonLabel(w.season + 1)} campaign starts after the summer.`}</div>
        {summer.length > 0 && (
          <div className="stack" style={{ gap: 6, marginTop: 12 }}>
            {summer.map((c) => (
              <button key={c.id} className="summer-comp" onClick={() => go({ name: 'comp', params: { id: c.id } })}>
                <CompLogo k={compLogoKey(c)} size={26} name={c.name} />
                <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}><div className="b small ellipsis">{c.name}</div><div className="tiny" style={{ opacity: 0.75 }}>{intlStage(w, c)}</div></div>
                <Icon name="forward" size={16} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** The manager's players away with their countries: where they are and the next game (watchable from the row). */
function IntlDutyCard({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const duty = userOnDuty(w)
  if (!duty.length) return null
  const club = w.clubs[w.userClubId]
  const total = duty.reduce((a, d) => a + d.players.length, 0)
  // two of his nations meeting each other share one fixture row
  const groups: { f?: Fixture; sides: typeof duty }[] = []
  for (const d of duty) {
    const f = d.next || d.last
    const g = f && groups.find((x) => x.f?.id === f.id)
    if (g) g.sides.push(d); else groups.push({ f, sides: [d] })
  }
  const shown = groups.slice(0, 4)
  const more = duty.length - shown.reduce((a, g) => a + g.sides.length, 0)
  return (
    <div className="card intl-card">
      <div className="card-h">
        <div className="row tight"><Icon name="globe" size={16} color="var(--info)" /><span className="label">International duty</span></div>
        <span className="tiny dim">{total} player{total > 1 ? 's' : ''} away</span>
      </div>
      <div className="list">
        {shown.map((g) => (
          <div key={g.sides[0].nt.id} className="intl-row">
            {g.sides.map((d) => (
              <button key={d.nt.id} className="intl-who" onClick={() => { haptic(); go({ name: 'club', params: { id: d.nt.id } }) }}>
                <Badge club={d.nt} size={30} />
                <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                  <div className="b small">{d.nt.short}</div>
                  <div className="tiny dim ellipsis">{d.players.map((p) => p.name.split(' ').slice(-1)[0]).join(', ')}</div>
                </div>
                <div className="intl-faces">{d.players.slice(0, 3).map((p) => <Face key={p.id} p={p} size={28} radius={14} club={club} />)}{d.players.length > 3 && <span className="tiny b">+{d.players.length - 3}</span>}</div>
              </button>
            ))}
            {g.f && <FixtureRow w={w} f={g.f} />}
          </div>
        ))}
      </div>
      {more > 0 && <button className="card-more tiny b" onClick={() => go({ name: 'squadStatus' })}>{more} more national team{more > 1 ? 's' : ''} · Squad Status</button>}
    </div>
  )
}

function CalendarStrip({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(w.date, i)), [w.date])
  const fx = fixturesOf(w, w.userClubId)
  const win = w.windows
  return (
    <button className="card cal-strip" onClick={() => go({ name: 'calendar' })}>
      {days.map((d, i) => {
        const f = fx.find((x) => x.date === d)
        const isDeadline = win.some((x) => x.close === d)
        const isOpen = win.some((x) => x.open === d)
        return (
          <div key={d} className={`cal-day ${i === 0 ? 'today' : ''} ${f ? 'match' : ''}`}>
            <div className="tiny dim b">{WD[weekday(d)]}</div>
            <div className="display" style={{ fontSize: 18 }}>{Number(d.slice(8, 10))}</div>
            <div className="cal-mark">
              {f ? <Badge club={w.clubs[opponent(f, w.userClubId)]} size={20} /> : isDeadline ? <Icon name="deadline" size={16} color="var(--neg)" /> : isOpen ? <Icon name="transfers" size={16} color="var(--tw)" /> : <span className="cal-dot" />}
            </div>
          </div>
        )
      })}
    </button>
  )
}

function MiniTable({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const comp = leagueOf(w, w.userClubId)!
  const rows = tableAround(w, comp, w.userClubId, 2)
  const total = comp.table?.length || 20
  return (
    <button className="card tap" onClick={() => go({ name: 'comp', params: { id: comp.id } })}>
      <div className="card-h">
        <div className="row tight"><CompLogo k={compLogoKey(comp)} size={20} name={comp.name} /><span className="label">{comp.short}</span></div>
        <span className="tiny dim">Matchday {Math.max(...(comp.table || []).map((r) => r.p), 0)}</span>
      </div>
      <table className="tbl">
        <thead><tr><th style={{ width: 30 }}>#</th><th className="l">Club</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const z = zoneFor(w, comp, r.pos, total)
            return (
              <tr key={r.clubId} className={r.clubId === w.userClubId ? 'me' : ''}>
                <td><span className="zone-num" style={{ borderColor: ZONE_COLOR[z] }}>{r.pos}</span></td>
                <td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={20} /><span className="ellipsis b" style={{ maxWidth: 150 }}>{w.clubs[r.clubId].short}</span></div></td>
                <td>{r.p}</td><td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="b">{r.pts - (r.ded || 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </button>
  )
}

/** Sticky "Continue" control that drives the calendar forward. */
export function ContinueBar() {
  const w = useWorld()
  const advancing = useGame((s) => s.advancing)
  const advance = useGame((s) => s.advance)
  const stop = useGame((s) => s.stopAdvance)
  const open = useGame((s) => s.open)
  const today = w.flags.unemployed ? undefined : userFixtureOn(w, w.date)
  const next = w.flags.unemployed ? undefined : nextFixture(w, w.userClubId)
  const label = today ? 'Match Day' : advancing ? 'Advancing' : 'Continue'
  const sub = today ? `${w.clubs[today.home].short} v ${w.clubs[today.away].short}` : advancing ? fmtDate(w.date, 'long') : next ? `Next: ${w.clubs[opponent(next, w.userClubId)]?.short} · ${fmtDate(next.date, 'dm')}` : fmtDate(w.date, 'long')
  return (
    <div className="continue-wrap">
      <button className={`continue-btn ${advancing ? 'busy' : ''} ${today ? 'match' : ''}`} onClick={() => {
        haptic('medium')
        if (advancing) { stop(); return }
        if (today) { open({ name: 'prematch' }); return }
        advance()
      }}>
        <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
          <div className="display" style={{ fontSize: 21 }}>{label}</div>
          <div className="tiny ellipsis" style={{ opacity: 0.8, marginTop: 1 }}>{sub}</div>
        </div>
        {advancing ? <><div className="spinner" style={{ borderTopColor: '#03170c', borderColor: 'rgba(0,0,0,.2)' }} /><span className="tiny b" style={{ marginLeft: 4 }}>STOP</span></> : <Icon name={today ? 'play' : 'ffwd'} size={26} />}
      </button>
    </div>
  )
}

function Unemployed() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const offers = w.user.jobOffers.filter((o) => o.expires >= w.date)
  return (
    <Screen title="Unemployed" sub={fmtDate(w.date, 'full')} right={<HubActions />} footer={<ContinueBar />}>
      <div className="pad stack">
        <div className="hero" style={{ padding: 18 }}>
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <UserAvatar w={w} size={72} radius={14} />
            <div>
              <div className="h2">{w.user.firstName} {w.user.lastName}</div>
              <div className="small" style={{ opacity: 0.8, marginTop: 4 }}>Reputation {Math.round(w.user.reputation)} · Out of work since {fmtDate(w.user.sacked || w.date, 'dm')}</div>
            </div>
          </div>
        </div>
        <button className="btn club block" onClick={() => go({ name: 'jobs' })}><Icon name="manager" size={18} /> Job Centre {offers.length ? `(${offers.length} offer${offers.length > 1 ? 's' : ''})` : ''}</button>
        <div className="muted small">Time keeps moving while you look for your next club. Clubs contact you when a job opens that fits your reputation.</div>
      </div>
      <SectionTitle title="Latest news" />
      <div className="pad"><div className="card list">{w.news.slice(0, 6).map((n) => <div key={n.id} className="li"><div className="meta"><div className="t small">{n.headline}</div><div className="s">{fmtDate(n.date, 'dm')}</div></div></div>)}</div></div>
    </Screen>
  )
}

void playerStatus
