import { useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, useWorld, haptic } from '../../store/game'
import type { ObjectiveCategory, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Empty, Face, Ring, Stars, UserAvatar } from '../components/atoms'
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

const CAT_ICON: Record<ObjectiveCategory, string> = { 'Domestic Success': 'trophy', 'Continental Success': 'globe', Financial: 'money', 'Brand Exposure': 'star', 'Youth Development': 'youth' }

// ============================================================================ office (board + finances)
export function Office() {
  const w = useWorld()
  const [tab, setTab] = useState<'board' | 'finance'>('board')
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
  const [filter, setFilter] = useState<'all' | 'transfer' | 'wages' | 'revenue'>('all')
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
  const u = w.user
  const tot = u.history.reduce((a, h) => ({ p: a.p + h.p, w: a.w + h.w, d: a.d + h.d, l: a.l + h.l }), { p: 0, w: 0, d: 0, l: 0 })
  return (
    <Screen title="Manager Career" back>
      <div className="pad stack">
        <div className="hero" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
            <UserAvatar w={w} size={96} radius={18} />
            <div className="grow">
              <div className="h2">{u.firstName} {u.lastName}</div>
              <div className="small" style={{ opacity: 0.85, marginTop: 4 }}>{u.nationality} · {ageOn(u.dob, w.date)} yrs</div>
              <div className="row tight" style={{ marginTop: 8 }}><span className="tiny" style={{ opacity: 0.8 }}>Reputation</span><Stars n={u.reputation / 20} size={13} /></div>
            </div>
          </div>
        </div>
        <div className="grid4">
          <div className="card pad-card" style={{ padding: 10, textAlign: 'center' }}><div className="tiny dim">Played</div><div className="display" style={{ fontSize: 24 }}>{tot.p}</div></div>
          <div className="card pad-card" style={{ padding: 10, textAlign: 'center' }}><div className="tiny dim">Won</div><div className="display pos" style={{ fontSize: 24 }}>{tot.w}</div></div>
          <div className="card pad-card" style={{ padding: 10, textAlign: 'center' }}><div className="tiny dim">Drawn</div><div className="display" style={{ fontSize: 24 }}>{tot.d}</div></div>
          <div className="card pad-card" style={{ padding: 10, textAlign: 'center' }}><div className="tiny dim">Lost</div><div className="display neg" style={{ fontSize: 24 }}>{tot.l}</div></div>
        </div>
        <div className="card list">
          <div className="card-h"><span className="label">Clubs managed</span><span className="tiny dim">Win rate {tot.p ? Math.round((tot.w / tot.p) * 100) : 0}%</span></div>
          {[...u.history].reverse().map((h, i) => (
            <div key={i} className="li">
              <Badge club={w.clubs[h.clubId]} size={34} />
              <div className="meta"><div className="t small">{w.clubs[h.clubId]?.name}</div><div className="s">{fmtDate(h.from, 'short')} – {h.to ? fmtDate(h.to, 'short') : 'present'} · P{h.p} W{h.w} D{h.d} L{h.l} · GF {h.gf} GA {h.ga}</div></div>
            </div>
          ))}
        </div>
        <div className="card list">
          <div className="card-h"><span className="label">Trophies</span><span className="tiny dim">{u.trophies.length}</span></div>
          {!u.trophies.length && <div className="li muted small">Your trophy cabinet is waiting.</div>}
          {u.trophies.map((t, i) => (
            <div key={i} className="li"><CompLogo k={t.compKey} size={30} name={t.compName} /><div className="meta"><div className="t small">{t.compName}</div><div className="s">{seasonLabel(t.season)} · {w.clubs[t.clubId]?.short}</div></div><Icon name="trophy" size={18} color="var(--gold)" /></div>
          ))}
        </div>
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
  const [tab, setTab] = useState<'awards' | 'history'>('awards')
  const awards = [...w.awards].reverse().slice(0, 120)
  return (
    <Screen title="Awards & History" back>
      <Tabs items={[{ id: 'awards', label: 'Awards' }, { id: 'history', label: 'Past Seasons' }]} value={tab} onChange={setTab} />
      {tab === 'awards' && (
        <div className="pad" style={{ marginTop: 12 }}>
          {!awards.length && <Empty icon="medal" title="No awards yet" text="Player and Manager of the Month awards are handed out at the start of every month; season awards at the end of the campaign." />}
          <div className="card list">
            {awards.map((a) => {
              const p = a.playerId ? w.players[a.playerId] : undefined
              const c = a.clubId ? w.clubs[a.clubId] : undefined
              return (
                <button key={a.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => p && go({ name: 'player', params: { id: p.id } })}>
                  {p ? <Face p={p} size={40} radius={10} club={w.clubs[p.clubId]} /> : c ? <Badge club={c} size={36} /> : <Icon name="medal" size={24} color="var(--gold)" />}
                  <div className="meta"><div className="t small">{a.name}</div><div className="s">{p?.name || a.managerName || c?.name}{a.value ? ` · ${a.value}` : ''} · {a.month ? fmtDate(`${a.month}-01`, 'month') : seasonLabel(a.season)}</div></div>
                  {a.compKey && <CompLogo k={a.compKey} size={22} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
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
          <div className="row" style={{ padding: '0 14px 14px' }}>
            <button className="btn block" onClick={() => setQuit(true)}><Icon name="back" size={16} /> Main menu</button>
          </div>
        </div>
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
        <div className="card pad-card small stack" style={{ gap: 6 }}>
          <div className="label">Career settings</div>
          <div className="row between"><span className="muted">Difficulty</span><b>{w.settings.difficulty}</b></div>
          <div className="row between"><span className="muted">Transfers</span><b>{w.settings.transferDifficulty}</b></div>
          <div className="row between"><span className="muted">Injuries · Growth</span><b>{w.settings.injuries} · {w.settings.growth}</b></div>
          <div className="row between"><span className="muted">Sacking · AI transfers</span><b>{w.settings.sacking ? 'On' : 'Off'} · {w.settings.aiTransfers ? 'On' : 'Off'}</b></div>
          <div className="row between"><span className="muted">Play time</span><b>{Math.floor(w.meta.playTimeMin / 60)}h {w.meta.playTimeMin % 60}m</b></div>
        </div>
      </div>
      <Confirm open={quit} title="Return to main menu?" text="Your career is saved first." confirm="Save & exit" onConfirm={async () => { await save(true); exit() }} onClose={() => setQuit(false)} />
    </Screen>
  )
}

void sortTable
void compLogoKey
