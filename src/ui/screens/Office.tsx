import { useRemember } from '../memory'
import { CheckpointsCard } from '../components/Checkpoints'
import { DeepLeaguePicker } from '../components/DeepLeaguePicker'
import { useMemo, useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, useWorld, haptic } from '../../store/game'
import type { ObjectiveCategory, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, CountUp, Empty, Face, Flag, Ring, Stars, UserAvatar } from '../components/atoms'
import { Confirm, Screen, Seg, Tabs, Toggle } from '../components/layout'
import { fmtMoney } from '../../domain/finance'
import { addDays, ageOn, fmtDate, seasonLabel } from '../../domain/dates'
import { boardMood, CATEGORY_W, generateObjectives, updateBoardConfidence } from '../../engine/world/board'
import { acceptJob, applyForJob, vacancies } from '../../engine/world/managers'
import { wageBill } from '../../engine/world/userActions'
import { worldRng } from '../../engine/world/advance'
import { compLogoKey, leaguePos, userClub } from '../selectors'
import { ordinal } from './Menu'
import { ImageCheck } from '../components/ImageCheck'
import { SpeedEditor } from '../components/SpeedEditor'
import { sortTable } from '../../engine/competitions/tables'
import { careerSummary, seasonOfDate } from '../../engine/world/career'

const CAT_ICON: Record<ObjectiveCategory, string> = { 'Domestic Success': 'trophy', 'Continental Success': 'globe', Financial: 'money', 'Brand Exposure': 'star', 'Youth Development': 'youth' }

// ============================================================================ office (board + finances)
export function Office() {
  const w = useWorld()
  const [tab, setTab] = useRemember<'board' | 'finance'>('tab', 'board')
  if (w.flags.unemployed) return <Screen title="Office" back><Empty icon="office" title="No club" /></Screen>
  return (
    <Screen title="Office" back>
      <Tabs items={[{ id: 'board', label: 'Board Objectives' }, { id: 'finance', label: 'Finances' }]} value={tab} onChange={setTab} />
      {tab === 'board' ? <Board w={w} /> : <Finances w={w} />}
    </Screen>
  )
}

function Board({ w }: { w: World }) {
  const objs = w.board.objectives.filter((o) => o.season === w.season)
  const cats = Object.keys(CATEGORY_W) as ObjectiveCategory[]
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="art-banner row" style={{ gap: 16, padding: 16, display: 'flex' }}>
        <Fx kind="grid" />
        <div style={{ position: 'relative', zIndex: 1 }}><Ring v={w.board.overall} size={78} stroke={7} /></div>
        <div className="grow" style={{ position: 'relative', zIndex: 1 }}>
          <div className="label">Board confidence</div>
          <div className="h2" style={{ marginTop: 4 }}>{boardMood(w.board.overall)}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>{w.board.warnings ? `${w.board.warnings} warning${w.board.warnings > 1 ? 's' : ''} issued` : 'No warnings'} · reviewed weekly</div>
        </div>
      </div>
      <div className="grid5">
        {cats.map((c) => (
          <div key={c} className="col center" style={{ gap: 4 }}>
            <Ring v={w.board.confidence[c]} size={52} label={<Icon name={CAT_ICON[c]} size={17} />} />
            <span className="tiny dim" style={{ textAlign: 'center', lineHeight: 1.1 }}>{c.replace(' Success', '').replace(' Development', '')}</span>
            <b className="tiny num">{Math.round(w.board.confidence[c])}</b>
          </div>
        ))}
      </div>
      {cats.map((c) => {
        const list = objs.filter((o) => o.category === c)
        if (!list.length) return null
        return (
          <div key={c} className="card">
            <div className="card-h"><div className="row tight"><Icon name={CAT_ICON[c]} size={16} color="var(--club2)" /><span className="label">{c}</span></div><span className="tiny dim">{Math.round(CATEGORY_W[c] * 100)}% weight</span></div>
            <div className="list">
              {list.map((o) => (
                <div key={o.id} className="li" style={{ minHeight: 54 }}>
                  <div className="meta">
                    <div className="t small">{o.text}</div>
                    <div className="row tight" style={{ marginTop: 6 }}>
                      <div style={{ width: 120 }}><div className="bar"><i style={{ width: `${o.progress * 100}%`, background: o.status === 'failed' ? 'var(--neg)' : o.progress >= 0.999 ? 'var(--pos)' : o.progress >= 0.5 ? '#9be15d' : 'var(--warn)' }} /></div></div>
                      <span className="tiny dim">{o.status === 'complete' ? 'Complete' : o.status === 'failed' ? 'Failed' : `${Math.round(o.progress * 100)}%`}</span>
                    </div>
                  </div>
                  <span className={`prio p-${o.priority.replace(' ', '')}`}>{o.priority}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Finances({ w }: { w: World }) {
  const club = userClub(w)
  const f = club.finance
  const bill = wageBill(w)
  const [filter, setFilter] = useRemember<'all' | 'transfer' | 'wages' | 'revenue'>('ledgerFilter', 'all')
  const ledger = [...f.ledger].reverse().filter((l) => filter === 'all' ? true : filter === 'transfer' ? l.kind === 'transfer' || l.kind === 'bonus' : filter === 'wages' ? l.kind === 'wages' : l.amount > 0).slice(0, 80)
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="grid2">
        <div className="card pad-card"><div className="label">Club balance</div><div className="display" style={{ fontSize: 26, marginTop: 4, color: f.balance < 0 ? 'var(--neg)' : undefined }}>{fmtMoney(f.balance)}</div></div>
        <div className="card pad-card"><div className="label">Transfer budget</div><div className="display" style={{ fontSize: 26, marginTop: 4 }}>{fmtMoney(f.transferBudget)}</div></div>
        <div className="card pad-card"><div className="label">Season revenue</div><div className="display pos" style={{ fontSize: 22, marginTop: 4 }}>{fmtMoney(f.revenueSeason)}</div></div>
        <div className="card pad-card"><div className="label">Season expenses</div><div className="display neg" style={{ fontSize: 22, marginTop: 4 }}>{fmtMoney(f.expensesSeason)}</div></div>
      </div>
      <div className="card pad-card">
        <div className="row between"><span className="label">Weekly wages</span><b>{fmtMoney(bill)} / {fmtMoney(f.wageBudget)}</b></div>
        <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, (bill / f.wageBudget) * 100)}%`, background: bill > f.wageBudget ? 'var(--neg)' : 'var(--club)' }} /></div>
      </div>
      <Seg small items={[{ id: 'all', label: 'All' }, { id: 'revenue', label: 'Income' }, { id: 'wages', label: 'Wages' }, { id: 'transfer', label: 'Transfers' }]} value={filter} onChange={setFilter} />
      <div className="card list">
        {!ledger.length && <div className="li muted small">No transactions yet.</div>}
        {ledger.map((l, i) => (
          <div key={i} className="li" style={{ minHeight: 44 }}>
            <span className="tiny dim" style={{ width: 46 }}>{fmtDate(l.date, 'dm')}</span>
            <div className="meta small">{l.label}</div>
            <b className={`num small ${l.amount >= 0 ? 'pos' : 'neg'}`}>{l.amount >= 0 ? '+' : ''}{fmtMoney(l.amount, { short: true })}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================ manager career
export function ManagerCareer() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const u = w.user
  const c = useMemo(() => careerSummary(w), [w.date, w.user.history.length, w.lastUserResult])
  const cur = u.history[u.history.length - 1]
  const club = w.flags.unemployed ? undefined : w.clubs[u.clubId]
  const cabinet = useMemo(() => {
    const m = new Map<string, { key: string; name: string; seasons: number[] }>()
    for (const t of u.trophies) { const e = m.get(t.compKey) || { key: t.compKey, name: t.compName, seasons: [] }; e.seasons.push(t.season); m.set(t.compKey, e) }
    return [...m.values()].sort((a, b) => b.seasons.length - a.seasons.length)
  }, [u.trophies.length])
  const seasons = new Set(c.seasons.map((s) => s.season)).size
  const fx = (m?: { f: { id: string } }) => m && go({ name: 'fixture', params: { id: m.f.id } })
  const scoreOf = (m: NonNullable<typeof c.biggestWin>) => `${m.f.result!.score[0]}–${m.f.result!.score[1]}`
  const RecordTile = ({ label, m, tone }: { label: string; m?: typeof c.biggestWin; tone?: string }) => m ? (
    <button className="mc-rec" onClick={() => fx(m)}>
      <span className="tiny dim">{label}</span>
      <span className="row tight" style={{ gap: 6 }}><Badge club={w.clubs[m.f.home]} size={20} /><b className="display" style={{ color: tone }}>{scoreOf(m)}</b><Badge club={w.clubs[m.f.away]} size={20} /></span>
      <span className="tiny dim ellipsis">{w.clubs[m.opp]?.short} · {fmtDate(m.f.date, 'dm')} {m.f.date.slice(0, 4)}</span>
    </button>
  ) : null
  const RunTile = ({ label, r }: { label: string; r: typeof c.winRun }) => r.n > 1 ? (
    <div className="mc-rec">
      <span className="tiny dim">{label}</span>
      <b className="display">{r.n} <span className="small dim">matches</span></b>
      <span className="tiny dim ellipsis">{r.from && fmtDate(r.from.f.date, 'dm')} – {r.to && fmtDate(r.to.f.date, 'dm')} {r.to?.f.date.slice(0, 4)}</span>
    </div>
  ) : null
  const People = ({ title, rows, stat }: { title: string; rows: typeof c.scorers; stat: (r: (typeof c.scorers)[number]) => string }) => rows.length ? (
    <div className="card list">
      <div className="card-h"><span className="label">{title}</span></div>
      {rows.map((r, i) => {
        const p = w.players[r.id]
        return (
          <button key={r.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => p && go({ name: 'player', params: { id: r.id } })} disabled={!p}>
            <span className="mc-rank">{i + 1}</span>
            {p ? <Face p={p} size={32} radius={16} club={w.clubs[p.clubId]} /> : <span style={{ width: 32 }} />}
            <div className="meta"><div className="t small ellipsis">{p?.name || 'Retired player'}</div><div className="s">{r.apps} apps · {r.goals} goals · {r.assists} assists</div></div>
            <b className="num">{stat(r)}</b>
          </button>
        )
      })}
    </div>
  ) : null
  return (
    <Screen title="Manager Career" back>
      <div className="pad stack">
        <div className="hero mc-hero">
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <UserAvatar w={w} size={92} radius={20} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="h2 ellipsis">{u.firstName} {u.lastName}</div>
              <div className="small row tight" style={{ opacity: 0.85, marginTop: 4 }}><Flag w={w} nation={u.nationality} size={11} />{u.nationality} · {ageOn(u.dob, w.date)} yrs</div>
              <div className="small row tight" style={{ marginTop: 6 }}>
                {club ? <><Badge club={club} size={18} /><span className="ellipsis">{club.short} since {fmtDate(cur.from, 'month')}</span></> : <span className="neg">Out of work</span>}
              </div>
              <div className="row tight" style={{ marginTop: 8 }}><span className="tiny" style={{ opacity: 0.8 }}>Reputation</span><Stars n={u.reputation / 20} size={13} />{u.style && <span className="chip sm" style={{ marginLeft: 4 }}>{u.style}</span>}</div>
            </div>
          </div>
        </div>

        <div className="mc-kpis">
          <div><b className="display"><CountUp value={c.p} from={0} /></b><span className="tiny dim">Matches</span></div>
          <div><b className="display"><CountUp value={c.winPct} from={0} format={(v) => `${Math.round(v)}%`} /></b><span className="tiny dim">Win rate</span></div>
          <div><b className="display gold"><CountUp value={u.trophies.length} from={0} /></b><span className="tiny dim">Trophies</span></div>
          <div><b className="display"><CountUp value={seasons} from={0} /></b><span className="tiny dim">Seasons</span></div>
        </div>

        {c.p > 0 && (
          <div className="card pad-card">
            <div className="mc-wdl">
              <i className="w" style={{ flex: c.w || 0.001 }} /><i className="d" style={{ flex: c.d || 0.001 }} /><i className="l" style={{ flex: c.l || 0.001 }} />
            </div>
            <div className="row between small" style={{ marginTop: 8 }}>
              <span><b className="pos">{c.w}</b> <span className="dim">won</span></span>
              <span><b>{c.d}</b> <span className="dim">drawn</span></span>
              <span><b className="neg">{c.l}</b> <span className="dim">lost</span></span>
              <span><b>{c.gf}–{c.ga}</b> <span className="dim">goals</span></span>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-h"><span className="label">Trophy cabinet</span><span className="tiny dim">{u.trophies.length}</span></div>
          {cabinet.length === 0 ? <div className="card-b small muted">The cabinet is waiting for its first piece of silverware.</div> : (
            <div className="mc-cab">
              {cabinet.map((t) => (
                <div key={t.key} className="mc-trophy">
                  <div className="mc-tr-logo"><CompLogo k={t.key} size={44} name={t.name} />{t.seasons.length > 1 && <span className="mc-x">×{t.seasons.length}</span>}</div>
                  <span className="tiny b ellipsis2" style={{ textAlign: 'center' }}>{t.name}</span>
                  <span className="tiny dim" style={{ textAlign: 'center' }}>{t.seasons.sort().map((s) => seasonLabel(s)).join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {c.seasons.length > 0 && (
          <div className="card list">
            <div className="card-h"><span className="label">Season by season</span></div>
            {c.seasons.map((s) => {
              const done = !s.live && w.archive.some((a) => a.season === s.season)
              return (
                <button key={`${s.season}${s.club}`} className="li tap mc-season" style={{ width: '100%', textAlign: 'left' }} disabled={!done} onClick={() => done && go({ name: 'seasonReview', params: { season: s.season } })}>
                  <span className="mc-sl">{seasonLabel(s.season)}</span>
                  <Badge club={w.clubs[s.club]} size={26} />
                  <div className="meta">
                    <div className="t small ellipsis">{s.finish ? `${ordinal(s.finish)} in the ${s.league}` : w.clubs[s.club]?.short}</div>
                    <div className="s">W{s.w} D{s.d} L{s.l} · {s.gf}–{s.ga}{s.p ? ` · ${Math.round((s.w / s.p) * 100)}% wins` : ''}{s.live ? ' · so far' : ''}</div>
                  </div>
                  <div className="row tight">{s.trophies.map((k, i) => <CompLogo key={i} k={k} size={20} />)}</div>
                  {done && <Icon name="forward" size={14} color="var(--t3)" />}
                </button>
              )
            })}
          </div>
        )}

        {(c.biggestWin || c.winRun.n > 1) && (
          <>
            <div className="label" style={{ margin: '4px 2px 0' }}>Records</div>
            <div className="mc-recs">
              <RecordTile label="Biggest win" m={c.biggestWin} tone="var(--pos)" />
              <RecordTile label="Heaviest defeat" m={c.worstDefeat} tone="var(--neg)" />
              <RunTile label="Longest winning run" r={c.winRun} />
              <RunTile label="Longest unbeaten run" r={c.unbeatenRun} />
              {c.mostGoals && c.mostGoals !== c.biggestWin && c.mostGoals !== c.worstDefeat && c.mostGoals.gf + c.mostGoals.ga >= 5 && <RecordTile label="Most goals in a match" m={c.mostGoals} />}
            </div>
          </>
        )}

        {c.formations.length > 0 && (
          <div className="card list">
            <div className="card-h"><span className="label">Favourite systems</span></div>
            {c.formations.map((f) => (
              <div key={f.id} className="li">
                <div className="meta"><div className="t small">{f.name}</div><div className="s">{f.p} matches · W{f.w} D{f.d} L{f.l}</div></div>
                <div className="mc-fbar"><i style={{ width: `${(f.w / f.p) * 100}%` }} /></div>
                <b className="num small" style={{ width: 38, textAlign: 'right' }}>{Math.round((f.w / f.p) * 100)}%</b>
              </div>
            ))}
          </div>
        )}

        <People title="Top scorers under you" rows={c.scorers} stat={(r) => String(r.goals)} />
        <People title="Most appearances" rows={c.apps} stat={(r) => String(r.apps)} />
        <People title="Best average rating" rows={c.rated} stat={(r) => (r.rating / r.rated).toFixed(2)} />

        <div className="card list">
          <div className="card-h"><span className="label">Clubs managed</span></div>
          {[...u.history].reverse().map((h, i) => (
            <button key={i} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'club', params: { id: h.clubId } })}>
              <Badge club={w.clubs[h.clubId]} size={34} />
              <div className="meta">
                <div className="t small">{w.clubs[h.clubId]?.name}</div>
                <div className="s">{fmtDate(h.from, 'short')} – {h.to ? fmtDate(h.to, 'short') : 'present'} · P{h.p} W{h.w} D{h.d} L{h.l}</div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}><b className="num small">{h.p ? Math.round((h.w / h.p) * 100) : 0}%</b><span className="tiny dim">{u.trophies.filter((t) => t.clubId === h.clubId && t.season >= seasonOfDate(h.from)).length} trophies</span></div>
            </button>
          ))}
        </div>

        {c.milestones.length > 0 && (
          <div className="card">
            <div className="card-h"><span className="label">Milestones</span></div>
            <div className="mc-tl">
              {c.milestones.slice(0, 14).map((m, i) => (
                <button key={i} className="mc-ms" disabled={!m.fixtureId} onClick={() => m.fixtureId && go({ name: 'fixture', params: { id: m.fixtureId } })}>
                  <span className={`mc-dot ${m.icon === 'trophy' ? 'gold' : ''}`}><Icon name={m.icon} size={12} /></span>
                  <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><span className="small b" style={{ display: 'block' }}>{m.text}</span><span className="tiny dim">{fmtDate(m.date.slice(0, 10), 'long')}</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {u.awards.length > 0 && (
          <div className="card list">
            <div className="card-h"><span className="label">Personal awards</span></div>
            {u.awards.map((a, i) => <div key={i} className="li"><Icon name="medal" size={20} color="var(--gold)" /><div className="meta"><div className="t small">{a.name}</div><div className="s">{a.month ? fmtDate(`${a.month}-01`, 'month') : seasonLabel(a.season)}</div></div></div>)}
          </div>
        )}
        <JobsButton />
      </div>
    </Screen>
  )
}

function JobsButton() {
  const go = useGame((s) => s.go)
  return <button className="btn block" onClick={() => go({ name: 'jobs' })}><Icon name="manager" size={18} /> Job market</button>
}

export function Jobs({ params }: { params?: { sacked?: boolean } }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const closeAll = useGame((s) => s.closeAll)
  const back = useGame((s) => s.back)
  const [confirm, setConfirm] = useState<number>()
  const offers = w.user.jobOffers.filter((o) => o.expires >= w.date)
  const jobs = vacancies(w).filter((c) => !offers.some((o) => o.clubId === c.id)).sort((a, b) => b.reputation - a.reputation).slice(0, 30)
  const applied: Record<number, string> = w.flags.applied || {}
  return (
    <Screen title="Job Market" sub={w.flags.unemployed ? 'You are unemployed' : `Reputation ${Math.round(w.user.reputation)}`} back onBack={() => (params?.sacked ? closeAll() : back())}>
      <div className="pad stack">
        {params?.sacked && <div className="card pad-card small" style={{ borderColor: 'rgba(255,77,94,.5)' }}><b className="neg">You have been dismissed.</b> <span className="muted">Apply for vacant positions or wait for clubs to approach you. The world keeps moving when you continue.</span></div>}
        {offers.length > 0 && <>
          <div className="label">Offers</div>
          <div className="card list">
            {offers.map((o) => {
              const c = w.clubs[o.clubId]
              return (
                <div key={o.clubId} className="li">
                  <Badge club={c} size={40} />
                  <div className="meta"><div className="t small">{c.name}</div><div className="s">{w.leagues[c.leagueId]?.name} · expires {fmtDate(o.expires, 'dm')}</div></div>
                  <button className="btn xs club" onClick={() => setConfirm(c.id)}>Accept</button>
                </div>
              )
            })}
          </div>
        </>}
        <div className="label">Vacancies</div>
        {!jobs.length && <div className="muted small">No vacancies right now. Managers are sacked through the season — check back later.</div>}
        <div className="card list">
          {jobs.map((c) => {
            const pos = leaguePos(w, c.id)
            return (
              <div key={c.id} className="li">
                <Badge club={c} size={40} />
                <div className="meta"><div className="t small">{c.name}</div><div className="s">{w.leagues[c.leagueId]?.short}{pos ? ` · ${ordinal(pos)}` : ''} · rep {c.reputation}</div></div>
                {applied[c.id] ? <span className="tiny dim">Applied</span> : <button className="btn xs" onClick={() => {
                  let ok = false
                  mutate((w) => {
                    const rng = worldRng(w)
                    ok = applyForJob(w, c.id, rng)
                    w.rng = rng.state
                    ;(w.flags.applied ||= {})[c.id] = w.date
                    if (ok) w.user.jobOffers.push({ clubId: c.id, date: w.date, expires: addDays(w.date, 7) })
                  })
                  notify(ok ? `${c.short} want to appoint you!` : `${c.short} went with another candidate`, ok ? 'ok' : 'info')
                }}>Apply</button>}
              </div>
            )
          })}
        </div>
      </div>
      <Confirm open={!!confirm} title={confirm ? `Become ${w.clubs[confirm].short} manager?` : ''} confirm="Accept job" text={!w.flags.unemployed ? `You will leave ${w.clubs[w.userClubId].name} immediately.` : 'Your new squad, budget and objectives are waiting.'} onConfirm={() => {
        haptic('heavy')
        mutate((w) => {
          acceptJob(w, confirm!)
          const rng = worldRng(w)
          generateObjectives(w, rng)
          updateBoardConfidence(w)
          w.rng = rng.state
        }, { roster: true })
        notify(`Welcome to ${w.clubs[confirm!].name}!`, 'ok')
        closeAll()
        useGame.getState().setTab('central')
        useGame.getState().resetTab()
      }} onClose={() => setConfirm(undefined)} />
    </Screen>
  )
}

// ============================================================================ awards & history
export function Awards() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const [tab, setTab] = useRemember<'awards' | 'history'>('tab', 'awards')
  return (
    <Screen title="Awards & History" back>
      <Tabs items={[{ id: 'awards', label: 'Awards' }, { id: 'history', label: 'Past Seasons' }]} value={tab} onChange={setTab} />
      {tab === 'awards' && <AwardsBoard />}
      {tab === 'history' && (
        <div className="pad stack" style={{ marginTop: 12 }}>
          {!w.archive.length && <Empty icon="history" title="No completed seasons yet" />}
          {[...w.archive].reverse().map((a) => (
            <div key={a.season} className="card">
              <div className="card-h"><span className="h3">{seasonLabel(a.season)}</span><span className="small muted">{a.userFinish ? `${w.clubs[a.userClubId]?.short}: ${ordinal(a.userFinish)}` : ''}</span></div>
              <div className="list">
                {Object.entries(a.winners).slice(0, 14).map(([k, cid]) => (
                  <div key={k} className="li" style={{ minHeight: 44 }}>
                    <CompLogo k={k.replace(/-\d+$/, '')} size={22} />
                    <div className="meta small">{Object.values(w.competitions).find((c) => c.key === k.replace(/-\d+$/, ''))?.name || k.replace(/-\d+$/, '')}</div>
                    <Badge club={w.clubs[cid]} size={22} /><span className="small b">{w.clubs[cid]?.short}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}

// ============================================================================ season review
export function SeasonReview({ params }: { params: { season: number } }) {
  const w = useWorld()
  const close = useGame((s) => s.closeAll)
  const a = w.archive.find((x) => x.season === params.season) || w.archive[w.archive.length - 1]
  if (!a) return <Screen title="Season Review" back onBack={close} noNav><Empty icon="season" title="No review available" /></Screen>
  const club = w.clubs[a.userClubId]
  const objs = w.board.objectives.filter((o) => o.season === a.season)
  const won = Object.entries(a.winners).filter(([, c]) => c === a.userClubId)
  const awards = a.awards.slice(0, 12)
  const lgKey = Object.keys(a.tables).find((k) => a.tables[k].some((r) => r.clubId === a.userClubId))
  return (
    <Screen title="Season Review" sub={seasonLabel(a.season)} back onBack={close} noNav>
      <div className="pad stack fade-up">
        <div className="hero" style={{ padding: 18, textAlign: 'center' }}>
          {won.length ? <Fx kind="confetti" /> : <Fx kind="beams" />}
          <div style={{ position: 'relative', zIndex: 1 }} className="col center">
            <Badge club={club} size={84} />
            <div className="h1" style={{ marginTop: 10 }}>{a.userFinish ? `${ordinal(a.userFinish)} place` : 'Season complete'}</div>
            <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>{club?.name} · {seasonLabel(a.season)}</div>
            {won.length > 0 && <div className="row" style={{ gap: 10, marginTop: 12 }}>{won.map(([k]) => <div key={k} className="col center" style={{ gap: 4 }}><CompLogo k={k.replace(/-\d+$/, '')} size={36} /><Icon name="trophy" size={16} color="var(--gold)" /></div>)}</div>}
          </div>
        </div>
        {objs.length > 0 && (
          <div className="card list">
            <div className="card-h"><span className="label">Board objectives</span><span className="tiny dim">{objs.filter((o) => o.status === 'complete').length}/{objs.length} met</span></div>
            {objs.map((o) => <div key={o.id} className="li" style={{ minHeight: 44 }}><Icon name={o.status === 'complete' ? 'check' : 'close'} size={16} color={o.status === 'complete' ? 'var(--pos)' : 'var(--neg)'} /><div className="meta small">{o.text}</div><span className={`prio p-${o.priority.replace(' ', '')}`}>{o.priority}</span></div>)}
          </div>
        )}
        {lgKey && (
          <div className="card">
            <div className="card-h"><span className="label">Final table</span></div>
            <table className="tbl"><tbody>
              {a.tables[lgKey].slice(0, 20).map((r, i) => <tr key={r.clubId} className={r.clubId === a.userClubId ? 'me' : ''}><td style={{ width: 28 }}>{i + 1}</td><td className="l"><div className="row tight"><Badge club={w.clubs[r.clubId]} size={18} /><span className="ellipsis" style={{ maxWidth: 150 }}>{w.clubs[r.clubId]?.short}</span></div></td><td>{r.p}</td><td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="b">{r.pts}</td></tr>)}
            </tbody></table>
          </div>
        )}
        {awards.length > 0 && (
          <div className="card list">
            <div className="card-h"><span className="label">Season awards</span></div>
            {awards.map((x) => { const p = x.playerId ? w.players[x.playerId] : undefined; return <div key={x.id} className="li"><Icon name="medal" size={18} color="var(--gold)" /><div className="meta"><div className="t small">{x.name}</div><div className="s">{p?.name || x.managerName}{x.value ? ` · ${x.value}` : ''}</div></div>{p && <Face p={p} size={34} radius={9} club={w.clubs[p.clubId]} />}</div> })}
          </div>
        )}
        <div className="card pad-card small muted">Contracts have expired, loans have ended, retiring players have hung up their boots and the {seasonLabel(w.season)} fixtures are out. Your new budget is {fmtMoney(w.clubs[w.userClubId]?.finance.transferBudget || 0)}.</div>
        <button className="btn primary block" onClick={close}>Start {seasonLabel(w.season)}</button>
      </div>
    </Screen>
  )
}

// ============================================================================ in-career settings
export function CareerSettingsScreen() {
  const w = useWorld()
  const prefs = useGame((s) => s.prefs)
  const setPrefs = useGame((s) => s.setPrefs)
  const save = useGame((s) => s.save)
  const exit = useGame((s) => s.exitToMenu)
  const mutate = useGame((s) => s.mutate)
  const [quit, setQuit] = useState(false)
  const [name, setName] = useState(w.meta.saveName)
  const so = prefs.stopOn
  return (
    <Screen title="Settings" back>
      <div className="pad stack">
        <div className="card">
          <div className="card-h"><span className="label">Save</span></div>
          <div className="li"><div className="meta"><input className="input" style={{ width: '100%' }} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onBlur={() => mutate((w) => { w.meta.saveName = name.trim() || w.meta.saveName })} /></div></div>
          <div className="li"><div className="meta"><div className="t small">Autosave</div><div className="s">After every match, when advancing stops and a few seconds after changes</div></div><Icon name="check" size={18} color="var(--acc)" /></div>
          <div className="row" style={{ padding: '0 14px 14px', gap: 8 }}>
            <button className="btn club grow" onClick={() => save(false)}><Icon name="save" size={16} /> Save now</button>
            <button className="btn grow" onClick={() => useGame.getState().saveAs(`${name.trim() || w.meta.saveName} (${w.date.slice(0, 4)}/${String(Number(w.date.slice(2, 4)) + 1).padStart(2, '0')})`)}><Icon name="plus" size={16} /> New slot</button>
          </div>
          <div className="row" style={{ padding: '0 14px 14px', gap: 8 }}>
            <button className="btn grow" onClick={() => { haptic(); useGame.getState().exportSave(useGame.getState().saveId || w.meta.id) }}><Icon name="upload" size={16} /> Export</button>
            <button className="btn grow" onClick={() => setQuit(true)}><Icon name="back" size={16} /> Main menu</button>
          </div>
        </div>
        <CheckpointsCard w={w} careerId={useGame.getState().saveId || w.meta.id} />
        <div className="card">
          <div className="card-h"><span className="label">Advance stops on</span></div>
          <Toggle label="Transfer messages" sub="Bids, counter-offers and completed deals" on={so.offers} onChange={(v) => setPrefs({ stopOn: { ...so, offers: v } })} />
          <Toggle label="Injuries & medical" on={so.injuries} onChange={(v) => setPrefs({ stopOn: { ...so, injuries: v } })} />
          <Toggle label="Player conversations" on={so.conversations} onChange={(v) => setPrefs({ stopOn: { ...so, conversations: v } })} />
          <Toggle label="Scouting reports" sub="Senior and youth scouts" on={so.scouting} onChange={(v) => setPrefs({ stopOn: { ...so, scouting: v } })} />
          <div className="li tiny dim">Your matches, transfer window open/deadline days and urgent board messages always stop the calendar.</div>
        </div>
        <div className="card">
          <div className="card-h"><span className="label">Match speed buttons</span></div>
          <SpeedEditor />
          <Toggle label="Assistant manages substitutions" on={prefs.assistantSubs} onChange={(v) => setPrefs({ assistantSubs: v })} />
        </div>
        <div className="card">
          <div className="card-h"><span className="label">Device</span></div>
          <Toggle label="Haptics" on={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} />
          <Toggle label="Reduce motion" on={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
        </div>
        <ImageCheck />
        <CareerOptions />
        <div className="card pad-card">
          <div className="label" style={{ marginBottom: 8 }}>Followed leagues</div>
          <DeepLeaguePicker leagues={Object.values(w.leagues)} own={w.clubs[w.userClubId]?.leagueId} value={w.settings.deepLeagues} onChange={(v) => mutate((x) => { x.settings.deepLeagues = v })} />
        </div>
        <div className="card pad-card small"><div className="row between"><span className="muted">Play time</span><b>{fmtPlayTime(w.meta.playTimeMin)}</b></div></div>
      </div>
      <Confirm open={quit} title="Return to main menu?" text="Your career is saved first." confirm="Save & exit" onConfirm={async () => { await save(true); exit() }} onClose={() => setQuit(false)} />
    </Screen>
  )
}

void sortTable
void compLogoKey

export function fmtPlayTime(min: number) {
  const m = Math.floor(min || 0)
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Career options that can change mid-save; each takes effect from the next day or match. */
function CareerOptions() {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const st = w.settings
  const set = (p: Partial<typeof st>) => { haptic(); mutate((x) => { Object.assign(x.settings, p) }) }
  const diffs: (typeof st.difficulty)[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional', 'World Class', 'Legendary', 'Ultimate']
  return (
    <div className="card pad-card stack" style={{ gap: 12 }}>
      <div className="label">Career options</div>
      <div>
        <div className="small b" style={{ marginBottom: 6 }}>Match difficulty</div>
        <div className="row wrap" style={{ gap: 6 }}>{diffs.map((d) => <button key={d} className={`chip sm ${st.difficulty === d ? 'on' : ''}`} onClick={() => set({ difficulty: d })}>{d}</button>)}</div>
      </div>
      <div><div className="small b" style={{ marginBottom: 6 }}>Transfer negotiations</div><Seg small items={[{ id: 'Easy', label: 'Easy' }, { id: 'Normal', label: 'Normal' }, { id: 'Hard', label: 'Hard' }]} value={st.transferDifficulty} onChange={(v) => set({ transferDifficulty: v })} /></div>
      <div><div className="small b" style={{ marginBottom: 6 }}>Injury frequency</div><Seg small items={[{ id: 'Low', label: 'Low' }, { id: 'Normal', label: 'Normal' }, { id: 'High', label: 'High' }]} value={st.injuries} onChange={(v) => set({ injuries: v })} /></div>
      <div><div className="small b" style={{ marginBottom: 6 }}>Player growth</div><Seg small items={[{ id: 'Slow', label: 'Slow' }, { id: 'Normal', label: 'Normal' }, { id: 'Fast', label: 'Fast' }]} value={st.growth} onChange={(v) => set({ growth: v })} /></div>
      <div style={{ margin: '0 -14px -14px' }}>
        <Toggle label="Manager sacking" sub="The board can dismiss you if confidence collapses" on={st.sacking} onChange={(v) => set({ sacking: v })} />
        <Toggle label="AI transfers" sub="Other clubs buy, sell and loan players" on={st.aiTransfers} onChange={(v) => set({ aiTransfers: v })} />
      </div>
      <div className="tiny dim">Changes apply from the next day or match. The starting budget was set when the career began.</div>
    </div>
  )
}

/** Awards grouped the way they're presented: season honours, then each month's winners by competition. */
function AwardsBoard() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const [scope, setScope] = useRemember<'mine' | 'all'>('scope', 'mine')
  const own = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(w.userClubId))?.key
  const list = w.awards.filter((a) => scope === 'all' || !a.compKey || a.compKey === own || a.clubId === w.userClubId || (a.playerId && w.players[a.playerId]?.clubId === w.userClubId))
  if (!w.awards.length) return <div className="pad" style={{ marginTop: 12 }}><Empty icon="medal" title="No awards yet" text="Player and Manager of the Month awards are handed out at the start of every month; season awards at the end of the campaign." /></div>
  const seasonAw = list.filter((a) => !a.month).reverse()
  const months = [...new Set(list.filter((a) => a.month).map((a) => a.month!))].sort().reverse()
  const person = (a: (typeof list)[number]) => {
    const p = a.playerId ? w.players[a.playerId] : undefined
    const c = a.clubId ? w.clubs[a.clubId] : undefined
    return (
      <button className="aw-p" onClick={() => p ? go({ name: 'player', params: { id: p.id } }) : c && go({ name: 'club', params: { id: c.id } })}>
        {p ? <Face p={p} size={40} radius={12} club={w.clubs[p.clubId]} /> : c ? <Badge club={c} size={34} /> : <Icon name="medal" size={24} color="var(--gold)" />}
        <span className="aw-pn"><span className="tiny dim">{/Manager/.test(a.name) ? 'Manager of the Month' : /Month/.test(a.name) ? 'Player of the Month' : a.name}</span><span className="small b ellipsis">{p?.name || a.managerName || c?.name}</span>{a.value ? <span className="tiny dim">{a.value}</span> : null}</span>
      </button>
    )
  }
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <Seg small items={[{ id: 'mine', label: 'My league & club' }, { id: 'all', label: 'All leagues' }]} value={scope} onChange={setScope} />
      {seasonAw.length > 0 && (
        <div className="card">
          <div className="card-h"><span className="label">Season awards</span></div>
          <div className="aw-grid">
            {seasonAw.slice(0, 18).map((a) => {
              const p = a.playerId ? w.players[a.playerId] : undefined
              return (
                <button key={a.id} className="aw-season" onClick={() => p && go({ name: 'player', params: { id: p.id } })}>
                  {p ? <Face p={p} size={50} radius={14} club={w.clubs[p.clubId]} /> : <Icon name="medal" size={30} color="var(--gold)" />}
                  <span className="tiny b" style={{ color: 'var(--gold)', textAlign: 'center' }}>{a.name}</span>
                  <span className="small b ellipsis" style={{ maxWidth: '100%' }}>{p?.name || a.managerName}</span>
                  <span className="tiny dim">{seasonLabel(a.season)}{a.value ? ` · ${a.value}` : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {months.map((m) => {
        const inMonth = list.filter((a) => a.month === m)
        const comps = [...new Set(inMonth.map((a) => a.compKey || ''))].sort((a, b) => (a === own ? -1 : b === own ? 1 : 0))
        return (
          <div key={m} className="card">
            <div className="card-h"><span className="label">{fmtDate(`${m}-01`, 'month')}</span></div>
            <div className="list">
              {comps.map((k) => {
                const rows = inMonth.filter((a) => (a.compKey || '') === k)
                const player = rows.find((a) => a.playerId), manager = rows.find((a) => !a.playerId)
                return (
                  <div key={k} className="aw-row">
                    <div className="aw-comp">{k && <CompLogo k={k} size={22} />}</div>
                    {player && person(player)}
                    {manager && person(manager)}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
