import { useMemo, useRef, useState } from 'react'
import { movedText } from '../moved'
import { useGame, useWorld, haptic, DEFAULT_ADVANCE_DAYS } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, FormPips, Ring, UserAvatar } from '../components/atoms'
import { HubActions, Screen, SectionTitle, Sheet } from '../components/layout'
import { addDays, diffDays, fmtDate, seasonLabel, weekday } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { calendarOthers, compLogoKey, fixturesOf, nextFixture, opponent, outcomeFor, scoreLine, userClub, lastResult, playerStatus } from '../selectors'
import { rosterOf } from '../../engine/world/roster'
import { currentWindow } from '../../engine/competitions/calendar'
import { unreadCount } from '../../engine/world/messages'
import { boardMood } from '../../engine/world/board'
import { userFixtureOn, watchedToday } from '../../engine/world/advance'
import type { Fixture, World } from '../../domain/types'
import { Celebration } from '../components/Celebration'
import { kitColors } from '../components/LivePitch'
import { underWhite } from '../theme'
import { FixtureRow } from './Match'
import { CompPager } from '../components/CompPager'
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
  // (a player who has left has nothing to ask: his request lapses on the next day's advance, and isn't shown until then)
  const pendingConv = w.conversations.filter((c) => !c.resolved && (w.players[c.playerId]?.clubId === w.userClubId || w.players[c.playerId]?.loan?.fromClubId === w.userClubId))

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

        <CompPager w={w} />

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

/** Competitions whose logo reads cleanly as a white mark (the others keep their own art: as a silhouette some become a
 *  plain shield or square). */
const WHITE_MARK = new Set(['ASIAN', 'BELCUP', 'CDR', 'CI', 'DFLSC', 'FACUP', 'GOLD', 'L1', 'L10', 'L13', 'L16', 'L17', 'L2012', 'L2149', 'L308', 'L31', 'L330', 'L341', 'L350', 'L351', 'L4', 'L41', 'L50', 'L53', 'L54', 'L68', 'L83', 'SCI', 'SUPERCOPA', 'TACA', 'TDC', 'TURCUP', 'UCL', 'UECL', 'UEL', 'WC'])

/**
 * The next match, as FotMob's live card draws one: the home club's colour on the left and the away club's on the right,
 * meeting in the dark between them, each crest over its name, and in the middle the competition's mark over the
 * kick-off. Below, what the match is and the two ways into it.
 */
function NextMatchCard({ w, f, today }: { w: World; f: Fixture; today: boolean }) {
  const open = useGame((s) => s.open)
  const go = useGame((s) => s.go)
  const comp = w.competitions[f.compId]
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const days = diffDays(f.date, w.date)
  const [hc, ac] = kitColors(home, away).map(underWhite)
  const key = comp ? compLogoKey(comp) : ''
  const when = today ? 'Today' : days === 1 ? 'Tomorrow' : `${fmtDate(f.date, 'day')} · in ${days} days`
  const venue = f.venue || (f.neutral ? 'Neutral venue' : home.stadium)
  const enter = () => { haptic(); open(today ? { name: 'prematch' } : { name: 'prematch', params: { id: f.id } }) }
  return (
    <div className={`nm${today ? ' today' : ''}`} style={{ ['--hc' as string]: hc, ['--ac' as string]: ac } as React.CSSProperties}>
      <button className="nm-band" onClick={enter} aria-label={`${home.name} v ${away.name}, ${comp?.name || ''}, ${when}, ${f.time}`}>
        <span className="nm-club"><Badge club={home} size={54} /><b>{home.short}</b></span>
        <span className="nm-mid">
          {comp && <CompLogo k={key} size={28} name={comp.name} mono={WHITE_MARK.has(key.replace(/[-_]\d+$/, ''))} />}
          <b className="nm-time">{f.time}</b>
          <span className="nm-when">{when}</span>
        </span>
        <span className="nm-club"><Badge club={away} size={54} /><b>{away.short}</b></span>
      </button>
      <div className="nm-foot">
        <div className="nm-meta tiny">
          <span className="row tight" style={{ minWidth: 0 }}>
            <span className="ellipsis">{[comp?.short, f.roundName].filter(Boolean).join(' · ')}</span>
            {f.moved && <span className="moved-chip" title={movedText(f)!.long}><Icon name="refresh" size={10} strokeWidth={2.6} />{movedText(f)!.tag}</span>}
          </span>
          {f.derby
            ? <span className="row tight nm-derby"><Icon name="fire" size={12} color="#ff8a5c" /><span className="ellipsis">{f.derby}</span></span>
            : <span className="row tight nm-venue"><Icon name="stadium" size={12} /><span className="ellipsis">{venue}</span></span>}
        </div>
        <div className="nm-actions">
          <button className="btn sm" onClick={() => go({ name: 'tactics' })}><Icon name="tactics" size={15} /> Team Sheet</button>
          {today
            ? <button className="btn sm primary" onClick={() => open({ name: 'prematch' })}><Icon name="play" size={15} /> Match Day</button>
            : <button className="btn sm" onClick={() => open({ name: 'prematch', params: { id: f.id } })}><Icon name="eye" size={15} /> Preview</button>}
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
        // a match he is watching shows its two crests, a followed club's match that club's crest; on a day of his own
        // match a small mark in the corner says there is one too (as on the calendar: green watched, gold followed)
        const others = calendarOthers(w, d)
        const busy = !!f || isDeadline || isOpen
        const pick = others.find((x) => x.watch) || others[0]
        const tags = !pick ? null : busy ? <span className="cal-tags corner">{others.some((x) => x.watch) && <i className="w" />}{others.some((x) => !x.watch) && <i className="f" />}</span>
          : pick.watch ? <span className="cal-vs" aria-label="A match you're watching"><Badge club={w.clubs[pick.f.home]} size={15} /><Badge club={w.clubs[pick.f.away]} size={15} /></span>
          : <span className="cal-fol" aria-label="A club you follow plays"><Badge club={w.clubs[pick.club!]} size={15} /><Icon name="star" size={10} color="var(--gold)" /></span>
        return (
          <div key={d} className={`cal-day ${i === 0 ? 'today' : ''} ${f ? 'match' : ''}`}>
            <div className="tiny dim b">{WD[weekday(d)]}</div>
            <div className="display" style={{ fontSize: 18 }}>{Number(d.slice(8, 10))}</div>
            <div className="cal-mark">
              {f ? <Badge club={w.clubs[opponent(f, w.userClubId)]} size={20} /> : isDeadline ? <Icon name="deadline" size={16} color="var(--neg)" /> : isOpen ? <Icon name="transfers" size={16} color="var(--tw)" /> : tags || <span className="cal-dot" />}
            </div>
            {busy && tags}
          </div>
        )
      })}
    </button>
  )
}

/** Sticky "Continue" control that drives the calendar forward. Held down, it offers a set number of days instead. */
export function ContinueBar() {
  const w = useWorld()
  const advancing = useGame((s) => s.advancing)
  const advance = useGame((s) => s.advance)
  const stop = useGame((s) => s.stopAdvance)
  const open = useGame((s) => s.open)
  const today = w.flags.unemployed ? undefined : userFixtureOn(w, w.date)
  const next = w.flags.unemployed ? undefined : nextFixture(w, w.userClubId)
  // matches on the watch list today come first when they kick off before his own (Continue asks about them)
  const toWatch = advancing ? [] : watchedToday(w).filter((f) => !today || f.time < today.time)
  const label = today && !toWatch.length ? 'Match Day' : advancing ? 'Advancing' : 'Continue'
  const sub = toWatch.length ? `To watch: ${w.clubs[toWatch[0].home].short} v ${w.clubs[toWatch[0].away].short}${toWatch.length > 1 ? ` + ${toWatch.length - 1} more` : ''}`
    : today ? `${w.clubs[today.home].short} v ${w.clubs[today.away].short}` : advancing ? fmtDate(w.date, 'long') : next ? `Next: ${w.clubs[opponent(next, w.userClubId)]?.short} · ${fmtDate(next.date, 'dm')}` : fmtDate(w.date, 'long')
  // press and hold: the button fills, then the quick-advance sheet opens (not on a match day or while advancing)
  const [quick, setQuick] = useState(false)
  const [holding, setHolding] = useState(false)
  const hold = useRef<{ timer: number; fired: boolean }>(undefined)
  const canHold = !advancing && !today
  const startHold = () => {
    if (!canHold) return
    const h = { fired: false, timer: 0 }
    h.timer = window.setTimeout(() => { h.fired = true; setHolding(false); haptic('medium'); setQuick(true) }, HOLD_MS)
    hold.current = h
    setHolding(true)
  }
  const endHold = () => { if (hold.current && !hold.current.fired) { window.clearTimeout(hold.current.timer); hold.current = undefined } setHolding(false) }
  return (
    <div className="continue-wrap">
      <button className={`continue-btn ${advancing ? 'busy' : ''} ${today ? 'match' : ''} ${holding ? 'holding' : ''}`}
        onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold} onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          // the hold already opened the sheet: this is the end of that press, not a tap
          if (hold.current?.fired) { hold.current = undefined; return }
          haptic('medium')
          if (advancing) { stop(); return }
          if (toWatch.length) { useGame.getState().openWatchPrompt(); return }
          if (today) { open({ name: 'prematch' }); return }
          advance()
        }}>
        <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
          <div className="display" style={{ fontSize: 21 }}>{label}</div>
          <div className="tiny ellipsis" style={{ opacity: 0.8, marginTop: 1 }}>{sub}</div>
        </div>
        {advancing ? <><div className="spinner" style={{ borderTopColor: '#03170c', borderColor: 'rgba(0,0,0,.2)' }} /><span className="tiny b" style={{ marginLeft: 4 }}>STOP</span></> : <Icon name={toWatch.length ? 'eye' : today ? 'play' : 'ffwd'} size={26} />}
      </button>
      <QuickAdvance open={quick} onClose={() => setQuick(false)} />
    </div>
  )
}

const HOLD_MS = 420

/** Advance by one of four set numbers of days, each saying where it would stop early; the four can be changed. */
function QuickAdvance({ open, onClose }: { open: boolean; onClose: () => void }) {
  const w = useWorld()
  const saved = useGame((s) => s.prefs.advanceDays)
  const setPrefs = useGame((s) => s.setPrefs)
  const days = saved?.length === 4 ? saved : DEFAULT_ADVANCE_DAYS
  const [edit, setEdit] = useState<number[]>()
  const next = w.flags.unemployed ? undefined : nextFixture(w, w.userClubId)
  const close = () => { setEdit(undefined); onClose() }
  const run = (n: number) => { haptic('medium'); close(); useGame.getState().advance(addDays(w.date, n)) }
  // a preset moves to the next value nobody else holds, within 1-30 days
  const step = (i: number, d: number) => setEdit((e) => {
    if (!e) return e
    let v = e[i]
    do { v += d } while (v >= 1 && v <= 30 && e.some((x, k) => k !== i && x === v))
    if (v < 1 || v > 30) return e
    haptic()
    return e.map((x, k) => (k === i ? v : x))
  })
  return (
    <Sheet open={open} onClose={close} title={edit ? 'Quick advance presets' : 'Advance'}>
      {!edit ? (
        <>
          <div className="qa-grid">
            {days.map((n) => {
              const to = addDays(w.date, n)
              const stopsFirst = next && next.date <= to
              return (
                <button key={n} className="qa-btn" onClick={() => run(n)}>
                  <b className="display">{n}</b>
                  <span className="qa-u">{n === 1 ? 'day' : 'days'}</span>
                  <span className={`qa-to ${stopsFirst ? 'stop' : ''}`}>{stopsFirst ? `Match ${fmtDate(next!.date, 'dm')}` : `To ${fmtDate(to, 'dm')}`}</span>
                </button>
              )
            })}
          </div>
          <div className="tiny dim" style={{ marginTop: 12, lineHeight: 1.45 }}>Stops early for a match day, and for anything you have asked Continue to stop for in Settings.</div>
          <button className="btn sm block" style={{ marginTop: 12 }} onClick={() => { haptic(); setEdit([...days]) }}><Icon name="edit" size={15} /> Change the presets</button>
        </>
      ) : (
        <>
          <div className="qa-edit">
            {edit.map((n, i) => (
              <div key={i} className="qa-e">
                <button className="iconbtn" aria-label="Fewer days" disabled={n <= 1} onClick={() => step(i, -1)}><Icon name="minus" size={16} /></button>
                <div className="qa-ev"><b className="display">{n}</b><span className="tiny dim">{n === 1 ? 'day' : 'days'}</span></div>
                <button className="iconbtn" aria-label="More days" disabled={n >= 30} onClick={() => step(i, 1)}><Icon name="plus" size={16} /></button>
              </div>
            ))}
          </div>
          <div className="tiny dim" style={{ marginTop: 10 }}>Four jumps, from 1 to 30 days each.</div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn sm" onClick={() => { haptic(); setEdit([...DEFAULT_ADVANCE_DAYS]) }}>Reset</button>
            <button className="btn sm club grow" onClick={() => { haptic('medium'); setPrefs({ advanceDays: [...edit].sort((a, b) => a - b) }); setEdit(undefined) }}>Save</button>
          </div>
        </>
      )}
    </Sheet>
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
