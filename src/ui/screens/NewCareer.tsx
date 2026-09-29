import { DeepLeaguePicker, type PickLeague } from '../components/DeepLeaguePicker'
import { useEffect, useMemo, useState } from 'react'
import { useGame, haptic } from '../../store/game'
import type { RawClub, RawDb, RawLeague } from '../../data/rawTypes'
import type { AvatarConfig, CareerSettings } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Avatar, Badge, CompLogo, Face, Flag, ManagerAvatar, Ovr, PosChip, Stars } from '../components/atoms'
import { Screen, Seg, Sheet, Toggle } from '../components/layout'
import { clubRatings, leagueClubs, rawBudget, rawExpectation, rawSquads, starRating } from '../rawHelpers'
import { fmtMoney } from '../../domain/finance'
import { clubAccent } from '../theme'

type Step = 'manager' | 'league' | 'club' | 'inspect' | 'settings' | 'confirm'
const STEPS: Step[] = ['manager', 'league', 'club', 'inspect', 'settings', 'confirm']

const AVATAR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#64748b']
const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hair: 2, hairColor: 2, beard: 1, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#1A2233', tie: true }
const STYLES = ['Balanced', 'Possession', 'Gegenpress', 'Counter-Attack', 'Direct', 'Wing Play', 'Park the Bus']
export interface ManagerIdentity { real?: string; color: string; style: string }

export function NewCareer({ onExit }: { onExit: () => void }) {
  const raw = useGame((s) => s.raw)
  const dbError = useGame((s) => s.dbError)
  const loadDb = useGame((s) => s.loadDb)
  const startCareer = useGame((s) => s.startCareer)
  const [step, setStep] = useState<Step>('manager')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [nation, setNation] = useState('England')
  const [age, setAge] = useState(42)
  const [identity, setIdentity] = useState<ManagerIdentity>({ color: AVATAR_COLORS[0], style: 'Balanced' })
  const [leagueId, setLeagueId] = useState<number>()
  const [clubId, setClubId] = useState<number>()
  const [saveName, setSaveName] = useState('')
  const [settings, setSettings] = useState<CareerSettings>({ difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' })
  const [starting, setStarting] = useState(false)

  useEffect(() => { loadDb() }, [])

  const idx = STEPS.indexOf(step)
  const goBack = () => (idx === 0 ? onExit() : setStep(STEPS[idx - 1]))
  const next = () => { haptic(); setStep(STEPS[idx + 1]) }

  if (!raw) {
    return (
      <Screen title="New Career" back onBack={onExit} noNav>
        <div className="col center" style={{ padding: 60, gap: 14 }}>
          {dbError ? <><Icon name="warning" size={32} color="var(--neg)" /><div className="muted">Could not load the football database. {dbError}</div><button className="btn" onClick={() => loadDb()}>Retry</button></> : <><div className="spinner" /><div className="muted small">Loading EA SPORTS FC 27 database…</div></>}
        </div>
      </Screen>
    )
  }

  const club = clubId ? raw.clubs.find((c) => c.id === clubId) : undefined
  const league = leagueId ? raw.leagues.find((l) => l.id === leagueId) : undefined

  if (starting) {
    return (
      <div className="screen no-nav no-top center" style={{ flexDirection: 'column', gap: 18 }}>
        {club && <div className="pop"><Badge club={club as any} size={110} /></div>}
        <div className="h2" style={{ textAlign: 'center' }}>{club?.name}</div>
        <div className="spinner" />
        <div className="muted small">Building the 2026/27 football world…</div>
      </div>
    )
  }

  const titles: Record<Step, string> = { manager: 'Create Manager', league: 'Choose League', club: 'Choose Club', inspect: 'Club Overview', settings: 'Career Settings', confirm: 'Confirm Career' }

  return (
    <Screen title={titles[step]} sub={`Step ${idx + 1} of ${STEPS.length}`} back onBack={goBack} noNav scrollKey={step}>
      <div className="stepbar pad"><i style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} /></div>
      {step === 'manager' && (
        <ManagerStep raw={raw} first={first} last={last} setFirst={setFirst} setLast={setLast} nation={nation} setNation={setNation} age={age} setAge={setAge} identity={identity} setIdentity={setIdentity} onNext={next} />
      )}
      {step === 'league' && <LeagueStep raw={raw} onPick={(id) => { setLeagueId(id); setClubId(undefined); next() }} />}
      {step === 'club' && league && <ClubStep raw={raw} league={league} onPick={(id) => { setClubId(id); next() }} />}
      {step === 'inspect' && club && <InspectStep raw={raw} club={club} onNext={next} />}
      {step === 'settings' && <SettingsStep settings={settings} setSettings={setSettings} onNext={next} leagues={raw.leagues} own={club?.leagueId} />}
      {step === 'confirm' && club && (
        <div className="pad stack fade-up">
          <div className="hero" style={{ padding: 18, background: `linear-gradient(135deg, ${clubAccent(club)}, #06080d 80%)` }}>
            <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
              {identity.real ? <ManagerAvatar name={identity.real} size={86} radius={16} /> : <Avatar name={`${first} ${last}`} size={86} radius={16} color={identity.color} />}
              <div className="grow">
                <div className="kicker" style={{ color: '#fff', opacity: 0.8 }}>Manager</div>
                <div className="h2">{first} {last}</div>
                <div className="row tight small" style={{ marginTop: 6 }}><Flag code={raw.nations.find((n) => n.name === nation)?.flag} size={13} /> {nation} · {age} · {identity.style}</div>
              </div>
              <Badge club={club as any} size={62} />
            </div>
          </div>
          <div className="card pad-card stack" style={{ gap: 8 }}>
            <Line k="Club" v={club.name} />
            <Line k="League" v={league?.name} />
            <Line k="Board expectation" v={rawExpectation(raw, club)} />
            <Line k="Transfer budget" v={fmtMoney(rawBudget(raw, club) * (settings.startingBudget === 'High' ? 1.6 : settings.startingBudget === 'Low' ? 0.6 : 1))} />
            <Line k="Difficulty" v={settings.difficulty} />
            <Line k="Transfers" v={settings.transferDifficulty} />
          </div>
          <div className="field">
            <label className="label">Save name</label>
            <input className="input" value={saveName} placeholder={`${club.short} Career`} maxLength={32} onChange={(e) => setSaveName(e.target.value)} />
          </div>
          <button className="btn primary block" style={{ height: 56, fontSize: 19 }} onClick={() => {
            haptic('heavy')
            setStarting(true)
            window.setTimeout(async () => {
              const born = `${2026 - age}-0${1 + (first.length % 9)}-1${last.length % 9}`
              await startCareer({ clubId: club.id, manager: { firstName: first.trim(), lastName: last.trim(), nationality: nation, dob: born, avatar: DEFAULT_AVATAR, realManager: identity.real, avatarColor: identity.color, style: identity.style }, settings, saveName: saveName.trim() || `${club.short} Career` })
            }, 60)
          }}>
            <Icon name="whistle" size={22} /> Start Career
          </button>
        </div>
      )}
    </Screen>
  )
}

function Line({ k, v }: { k: string; v: any }) {
  return <div className="row between"><span className="muted small">{k}</span><span className="b">{v}</span></div>
}

// ----------------------------------------------------------------- manager
interface RealMgr { name: string; nationality: string; age: number; vision: string; formation: string; club?: RawClub }

function ManagerStep(props: { raw: RawDb; first: string; last: string; setFirst: (s: string) => void; setLast: (s: string) => void; nation: string; setNation: (s: string) => void; age: number; setAge: (n: number) => void; identity: ManagerIdentity; setIdentity: (i: ManagerIdentity) => void; onNext: () => void }) {
  const { raw, identity, setIdentity } = props
  const [mode, setMode] = useState<'custom' | 'real'>(identity.real ? 'real' : 'custom')
  const [natOpen, setNatOpen] = useState(false)
  const [q, setQ] = useState('')
  const [mq, setMq] = useState('')
  const nat = raw.nations.find((n) => n.name === props.nation)
  const valid = props.first.trim().length >= 1 && props.last.trim().length >= 2
  const nations = useMemo(() => [...raw.nations].sort((a, b) => a.name.localeCompare(b.name)), [raw])
  const reals = useMemo<RealMgr[]>(() => {
    const out: RealMgr[] = []
    const lg = new Map(raw.leagues.map((l) => [l.id, l]))
    for (const c of raw.clubs) if (c.manager) out.push({ ...c.manager, club: c })
    return out.sort((a, b) => ((lg.get(b.club!.leagueId)?.prestige || 0) * 10 + b.club!.squadAvg) - ((lg.get(a.club!.leagueId)?.prestige || 0) * 10 + a.club!.squadAvg))
  }, [raw])
  const shown = reals.filter((m) => !mq || m.name.toLowerCase().includes(mq.toLowerCase()) || m.club?.name.toLowerCase().includes(mq.toLowerCase())).slice(0, 60)
  const pickReal = (m: RealMgr) => {
    haptic('medium')
    const parts = m.name.split(' ')
    props.setFirst(parts.length > 1 ? parts.slice(0, -1).join(' ') : m.name)
    props.setLast(parts.length > 1 ? parts[parts.length - 1] : m.name)
    props.setNation(m.nationality)
    props.setAge(Math.max(30, Math.min(75, m.age)))
    const style = STYLES.includes(m.vision) ? m.vision : 'Balanced'
    setIdentity({ ...identity, real: m.name, style })
  }
  return (
    <div className="pad stack fade-up">
      <Seg items={[{ id: 'custom', label: 'Create manager' }, { id: 'real', label: 'Real manager' }]} value={mode} onChange={(v) => { setMode(v); if (v === 'custom') setIdentity({ ...identity, real: undefined }) }} />
      <div className="manager-preview">
        {identity.real ? <ManagerAvatar name={identity.real} size={96} radius={48} /> : <Avatar name={`${props.first || '?'} ${props.last}`} size={96} color={identity.color} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="h2 ellipsis">{props.first || 'First'} {props.last || 'Last'}</div>
          <div className="row tight small muted" style={{ marginTop: 6 }}><Flag code={nat?.flag} size={12} /> {props.nation} · {props.age} yrs</div>
          <div className="small" style={{ marginTop: 4, color: 'var(--acc)' }}>{identity.style} coach{identity.real ? ' · real manager' : ''}</div>
        </div>
      </div>
      {mode === 'real' ? (
        <>
          <div className="search-box"><Icon name="search" size={18} color="var(--t3)" /><input placeholder="Search managers or clubs" value={mq} onChange={(e) => setMq(e.target.value)} /></div>
          <div className="card list" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            {shown.map((m) => (
              <button key={m.name + m.club?.id} className={`li tap ${identity.real === m.name ? 'sel-row' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => pickReal(m)}>
                <ManagerAvatar name={m.name} size={42} />
                <div className="meta"><div className="t ellipsis">{m.name}</div><div className="s row tight">{m.club && <Badge club={m.club as any} size={14} />}{m.club?.short} · {m.nationality} · {m.age}</div></div>
                <span className="tiny dim">{m.vision}</span>
              </button>
            ))}
          </div>
          <div className="tiny dim">Real managers start with their real reputation. If they currently manage another club, that club appoints a replacement.</div>
        </>
      ) : (
        <>
          <div className="row">
            <div className="field grow"><label className="label">First name</label><input className="input" value={props.first} maxLength={18} onChange={(e) => props.setFirst(e.target.value)} placeholder="First name" autoComplete="off" /></div>
            <div className="field grow"><label className="label">Last name</label><input className="input" value={props.last} maxLength={20} onChange={(e) => props.setLast(e.target.value)} placeholder="Last name" autoComplete="off" /></div>
          </div>
          <div className="row">
            <div className="field grow">
              <label className="label">Nationality</label>
              <button className="input row" style={{ textAlign: 'left' }} onClick={() => setNatOpen(true)}><Flag code={nat?.flag} size={15} /> <span className="grow ellipsis">{props.nation}</span><Icon name="down" size={16} /></button>
            </div>
            <div className="field" style={{ width: 128 }}>
              <label className="label">Age</label>
              <div className="stepper" style={{ height: 48 }}>
                <button onClick={() => props.setAge(Math.max(30, props.age - 1))} aria-label="Younger"><Icon name="minus" size={18} /></button>
                <div className="num">{props.age}</div>
                <button onClick={() => props.setAge(Math.min(72, props.age + 1))} aria-label="Older"><Icon name="plus" size={18} /></button>
              </div>
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Badge colour</div>
            <div className="row wrap" style={{ gap: 8 }}>{AVATAR_COLORS.map((c) => <button key={c} aria-label={c} className="swatch" style={{ background: c, boxShadow: identity.color === c ? '0 0 0 2px var(--bg), 0 0 0 4px #fff' : undefined }} onClick={() => { haptic(); setIdentity({ ...identity, color: c }) }} />)}</div>
          </div>
        </>
      )}
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Coaching style</div>
        <div className="row wrap" style={{ gap: 7 }}>{STYLES.map((st) => <button key={st} className={`chip ${identity.style === st ? 'on' : ''}`} onClick={() => { haptic(); setIdentity({ ...identity, style: st }) }}>{st}</button>)}</div>
        <div className="tiny dim" style={{ marginTop: 6 }}>Sets your default team tactics. You can change everything later.</div>
      </div>
      <button className="btn primary block" disabled={!valid} onClick={props.onNext}>Continue <Icon name="forward" size={18} /></button>
      <Sheet open={natOpen} onClose={() => setNatOpen(false)} title="Nationality">
        <input className="input" style={{ width: '100%', marginBottom: 10 }} placeholder="Search nations" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {nations.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).map((n) => (
            <button key={n.name} className="li tap" style={{ minHeight: 46, width: '100%', textAlign: 'left' }} onClick={() => { props.setNation(n.name); setNatOpen(false); setQ('') }}>
              <Flag code={n.flag} size={16} /><div className="meta">{n.name}</div>{n.name === props.nation && <Icon name="check" size={18} color="var(--acc)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

// ----------------------------------------------------------------- league
const COUNTRY_ORDER = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Scotland', 'Türkiye', 'Saudi Arabia', 'United States']

function LeagueStep({ raw, onPick }: { raw: RawDb; onPick: (id: number) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, RawLeague[]>()
    for (const l of raw.leagues) { const a = m.get(l.country) || []; a.push(l); m.set(l.country, a) }
    for (const a of m.values()) a.sort((x, y) => x.level - y.level)
    return [...m.entries()].sort((a, b) => {
      const ia = COUNTRY_ORDER.indexOf(a[0]), ib = COUNTRY_ORDER.indexOf(b[0])
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      return Math.max(...b[1].map((l) => l.prestige)) - Math.max(...a[1].map((l) => l.prestige)) || a[0].localeCompare(b[0])
    })
  }, [raw])
  return (
    <div className="pad stack stagger">
      {groups.map(([country, leagues]) => (
        <div key={country} className="card">
          <div className="card-h"><div className="row tight"><Flag code={leagues[0].flag} size={14} /><span className="label">{country}</span></div></div>
          <div className="list">
            {leagues.map((l) => {
              const clubs = leagueClubs(raw, l)
              const best = clubs[0]
              return (
                <button key={l.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onPick(l.id) }}>
                  <div className="logo-tile"><CompLogo k={`L${l.id}`} size={34} name={l.name} /></div>
                  <div className="meta">
                    <div className="t">{l.name}</div>
                    <div className="s">{clubs.length} clubs · Tier {l.level}{best ? ` · Top rated: ${best.short}` : ''}</div>
                  </div>
                  <Stars n={Math.max(0.5, l.prestige / 2)} size={11} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------- club
function ClubStep({ raw, league, onPick }: { raw: RawDb; league: RawLeague; onPick: (id: number) => void }) {
  const clubs = useMemo(() => leagueClubs(raw, league), [raw, league])
  const [sort, setSort] = useState<'rating' | 'name' | 'budget'>('rating')
  const sorted = useMemo(() => {
    const a = [...clubs]
    if (sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name))
    if (sort === 'budget') a.sort((x, y) => rawBudget(raw, y) - rawBudget(raw, x))
    return a
  }, [clubs, sort])
  return (
    <div className="stack">
      <div className="pad row" style={{ gap: 12 }}>
        <CompLogo k={`L${league.id}`} size={40} name={league.name} />
        <div className="grow"><div className="h3">{league.name}</div><div className="tiny muted">{league.country} · {clubs.length} clubs · {league.rele ? `${league.rele} relegated` : 'No relegation'}</div></div>
      </div>
      <div className="pad"><Seg small items={[{ id: 'rating', label: 'Rating' }, { id: 'budget', label: 'Budget' }, { id: 'name', label: 'A–Z' }]} value={sort} onChange={setSort} /></div>
      <div className="pad club-grid stagger">
        {sorted.map((c) => {
          const r = clubRatings(raw, c.id)
          const acc = clubAccent(c)
          return (
            <button key={c.id} className="club-card tap" style={{ ['--cc' as any]: acc }} onClick={() => { haptic(); onPick(c.id) }}>
              <div className="club-card-top"><Badge club={c as any} size={58} /></div>
              <div className="b ellipsis" style={{ fontSize: 14, marginTop: 8 }}>{c.short}</div>
              <div style={{ marginTop: 4 }}><Stars n={starRating(c.squadAvg)} size={11} /></div>
              <div className="row between tiny" style={{ marginTop: 8, width: '100%' }}>
                <span><span className="dim">ATT</span> <b>{r.att}</b></span>
                <span><span className="dim">MID</span> <b>{r.mid}</b></span>
                <span><span className="dim">DEF</span> <b>{r.def}</b></span>
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>{fmtMoney(rawBudget(raw, c), { short: true })}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- inspect
function InspectStep({ raw, club, onNext }: { raw: RawDb; club: RawClub; onNext: () => void }) {
  const r = clubRatings(raw, club.id)
  const squad = rawSquads(raw).get(club.id) || []
  const lg = raw.leagues.find((l) => l.id === club.leagueId)
  const byId = new Map(raw.clubs.map((c) => [c.id, c]))
  const hist = raw.history[String(club.leagueId)]
  const lastPos = hist ? hist.findIndex((h) => h.clubId === club.id) + 1 : 0
  const acc = clubAccent(club)
  const young = squad.filter((p) => p.age <= 21).sort((a, b) => b.pot - a.pot).slice(0, 3)
  return (
    <div className="stack fade-up">
      <div className="pad">
        <div className="hero club-hero" style={{ background: `linear-gradient(145deg, ${acc} 0%, ${club.kit?.[1] && club.kit[1] !== acc ? club.kit[1] + '44' : '#0a0f18'} 55%, #05070c 100%)` }}>
          <div style={{ position: 'relative', zIndex: 1, padding: 18 }}>
            <div className="row" style={{ gap: 16 }}>
              <Badge club={club as any} size={92} />
              <div className="grow">
                <div className="h1" style={{ fontSize: 30 }}>{club.name}</div>
                <div className="row tight small" style={{ marginTop: 8, opacity: 0.9 }}>{lg && <CompLogo k={`L${lg.id}`} size={18} name={lg.name} />} {lg?.name}</div>
                <div style={{ marginTop: 8 }}><Stars n={starRating(club.squadAvg)} size={14} /></div>
              </div>
            </div>
            <div className="rating-strip">
              {[['OVR', r.ovr], ['ATT', r.att], ['MID', r.mid], ['DEF', r.def]].map(([k, v]) => (
                <div key={k as string}><div className="label" style={{ color: 'rgba(255,255,255,.7)' }}>{k}</div><div className="display" style={{ fontSize: 28 }}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="pad grid2">
        <Info icon="objective" k="Board expectation" v={rawExpectation(raw, club)} />
        <Info icon="money" k="Transfer budget" v={fmtMoney(rawBudget(raw, club))} />
        <Info icon="stadium" k={club.stadium || 'Stadium'} v={club.capacity ? `${club.capacity.toLocaleString()} seats` : '—'} />
        <Info icon="history" k="2025/26 finish" v={lastPos ? `${lastPos}${['th', 'st', 'nd', 'rd'][lastPos % 10 > 3 || Math.floor(lastPos / 10) === 1 ? 0 : lastPos % 10]}` : lg?.level === 1 ? 'Promoted' : '—'} />
        <Info icon="globe" k="City" v={club.city || club.country} />
        <Info icon="calendar" k="Founded" v={club.founded || '—'} />
      </div>
      {club.manager && (
        <div className="pad">
          <div className="card pad-card row" style={{ gap: 12 }}>
            <Icon name="manager" size={22} color="var(--t2)" />
            <div className="grow small"><span className="muted">You replace </span><b>{club.manager.name}</b><span className="muted"> ({club.manager.nationality}) · {club.manager.formation}</span></div>
          </div>
        </div>
      )}
      <div className="section-title"><div className="h3">Key Players</div></div>
      <div className="pad"><div className="card list">
        {squad.slice(0, 6).map((p) => (
          <div key={p.id} className="li">
            <Face p={{ id: p.id, nation: p.nation, name: p.name } as any} size={42} radius={10} />
            <div className="meta"><div className="t ellipsis">{p.name}</div><div className="s">{p.age} yrs · {p.nation}</div></div>
            <PosChip pos={p.pos} />
            <Ovr v={p.ovr} size="sm" />
          </div>
        ))}
      </div></div>
      {young.length > 0 && <>
        <div className="section-title"><div className="h3">Top Prospects</div></div>
        <div className="pad"><div className="card list">
          {young.map((p) => (
            <div key={p.id} className="li">
              <Face p={{ id: p.id, nation: p.nation, name: p.name } as any} size={42} radius={10} />
              <div className="meta"><div className="t ellipsis">{p.name}</div><div className="s">{p.age} yrs · POT {p.pot}</div></div>
              <PosChip pos={p.pos} />
              <Ovr v={p.ovr} size="sm" />
            </div>
          ))}
        </div></div>
      </>}
      {club.rivals.length > 0 && <>
        <div className="section-title"><div className="h3">Rivals</div></div>
        <div className="pad"><div className="card list">
          {club.rivals.map(([id, name, lvl]) => byId.get(id) && (
            <div key={id} className="li">
              <Badge club={byId.get(id) as any} size={34} />
              <div className="meta"><div className="t">{byId.get(id)!.name}</div><div className="s">{name}</div></div>
              <span className="row tight">{Array.from({ length: lvl }, (_, i) => <Icon key={i} name="fire" size={15} color="var(--neg)" />)}</span>
            </div>
          ))}
        </div></div>
      </>}
      <div className="pad" style={{ marginTop: 8 }}>
        <button className="btn primary block" onClick={onNext}>Manage {club.short} <Icon name="forward" size={18} /></button>
      </div>
    </div>
  )
}

function Info({ icon, k, v }: { icon: string; k: string; v: any }) {
  return (
    <div className="card pad-card" style={{ padding: 12 }}>
      <div className="row tight"><Icon name={icon} size={16} color="var(--t3)" /><span className="tiny dim ellipsis">{k}</span></div>
      <div className="b" style={{ marginTop: 6, fontSize: 15 }}>{v}</div>
    </div>
  )
}

// ----------------------------------------------------------------- settings
function SettingsStep({ settings, setSettings, onNext, leagues, own }: { settings: CareerSettings; setSettings: (s: CareerSettings) => void; onNext: () => void; leagues: PickLeague[]; own?: number }) {
  const set = (p: Partial<CareerSettings>) => setSettings({ ...settings, ...p })
  const diffs: CareerSettings['difficulty'][] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional', 'World Class', 'Legendary', 'Ultimate']
  return (
    <div className="pad stack fade-up">
      <div className="card pad-card stack" style={{ gap: 10 }}>
        <div className="label">Match difficulty</div>
        <div className="row wrap" style={{ gap: 7 }}>{diffs.map((d) => <button key={d} className={`chip ${settings.difficulty === d ? 'on' : ''}`} onClick={() => set({ difficulty: d })}>{d}</button>)}</div>
        <div className="tiny dim">Scales how strongly AI teams perform against you in simulated and live matches.</div>
      </div>
      <div className="card pad-card stack" style={{ gap: 12 }}>
        <div><div className="label" style={{ marginBottom: 6 }}>Transfer negotiations</div><Seg small items={[{ id: 'Easy', label: 'Easy' }, { id: 'Normal', label: 'Normal' }, { id: 'Hard', label: 'Hard' }]} value={settings.transferDifficulty} onChange={(v) => set({ transferDifficulty: v })} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Starting budget</div><Seg small items={[{ id: 'Low', label: 'Low' }, { id: 'Default', label: 'Default' }, { id: 'High', label: 'High' }]} value={settings.startingBudget} onChange={(v) => set({ startingBudget: v })} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Injury frequency</div><Seg small items={[{ id: 'Low', label: 'Low' }, { id: 'Normal', label: 'Normal' }, { id: 'High', label: 'High' }]} value={settings.injuries} onChange={(v) => set({ injuries: v })} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Player growth</div><Seg small items={[{ id: 'Slow', label: 'Slow' }, { id: 'Normal', label: 'Normal' }, { id: 'Fast', label: 'Fast' }]} value={settings.growth} onChange={(v) => set({ growth: v })} /></div>
      </div>
      <div className="card">
        <Toggle label="Manager sacking" sub="The board can dismiss you if confidence collapses" on={settings.sacking} onChange={(v) => set({ sacking: v })} />
        <Toggle label="AI transfers" sub="Other clubs buy, sell and loan players" on={settings.aiTransfers} onChange={(v) => set({ aiTransfers: v })} />
      </div>
      <div className="card pad-card">
        <div className="label" style={{ marginBottom: 8 }}>Followed leagues</div>
        <DeepLeaguePicker leagues={leagues} own={own} value={settings.deepLeagues} onChange={(v) => set({ deepLeagues: v })} />
      </div>
      <button className="btn primary block" onClick={onNext}>Continue <Icon name="forward" size={18} /></button>
    </div>
  )
}
