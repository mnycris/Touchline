// Starting a career: the first thing anyone sees of the game, told as taking a job. Who you are (a manager's card that
// fills in as you type), where (the leagues, the biggest in their own identity), which club (each one opened before you
// take it), the rules you play by, and the appointment itself, signed, before the world is built. Five steps under the
// app's own top bar, each one screen, with a way back to any of them.
import { DeepLeaguePicker, type PickLeague } from '../components/DeepLeaguePicker'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useGame, haptic } from '../../store/game'
import type { RawClub, RawDb, RawLeague } from '../../data/rawTypes'
import type { BuildStage } from '../../data/createWorld'
import type { AvatarConfig, CareerSettings } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Avatar, Badge, CompLogo, Face, Flag, ManagerAvatar, Ovr, PosChip, Stars } from '../components/atoms'
import { Seg, Sheet, Toggle, TopBar } from '../components/layout'
import { ClubFog } from '../components/ClubFog'
import { IdentityArt } from '../components/IdentityArt'
import { compIdentity, identityClass, identityVars } from '../compIdentity'
import { clubAir, NEUTRAL } from '../atmosphere'
import { clubRatings, leagueClubs, rawBudget, rawExpectation, rawSquads, starRating } from '../rawHelpers'
import { fmtMoney } from '../../domain/finance'
import { clubAccent } from '../theme'

type Step = 'you' | 'league' | 'club' | 'rules' | 'sign'
type Stage = BuildStage | 'saved'
const STEPS: { id: Step; title: string }[] = [
  { id: 'you', title: 'Create Manager' },
  { id: 'league', title: 'Choose League' },
  { id: 'club', title: 'Choose Club' },
  { id: 'rules', title: 'Career Settings' },
  { id: 'sign', title: 'Your Appointment' },
]

const AVATAR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#64748b']
const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hair: 2, hairColor: 2, beard: 1, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#1A2233', tie: true }
/** The coaching styles a manager arrives with (they set his first tactics), each in a line. */
const STYLES: { id: string; line: string }[] = [
  { id: 'Balanced', line: 'Sound in every phase' },
  { id: 'Possession', line: 'Keep it, wear them down' },
  { id: 'Gegenpress', line: 'Win it back high, at once' },
  { id: 'Counter-Attack', line: 'Absorb, then break at pace' },
  { id: 'Direct', line: 'Forward early, win the second ball' },
  { id: 'Wing Play', line: 'Width, crosses, overlaps' },
  { id: 'Park the Bus', line: 'Deep, compact, hard to beat' },
]
interface ManagerIdentity { real?: string; color: string; style: string }
/** The manager he was making before he tried a real one, given back if he returns to his own. */
interface Draft { first: string; last: string; nation: string; age: number; style: string }
const AGE_MIN = 30, AGE_MAX = 72

/** Ways to play, each a set of the career settings; anything else is a custom set. */
const PRESETS: { id: string; name: string; line: string; level: number; s: Pick<CareerSettings, 'difficulty' | 'transferDifficulty' | 'startingBudget' | 'injuries' | 'growth' | 'sacking'> }[] = [
  { id: 'relaxed', name: 'Relaxed', level: 1, line: 'Kinder matches and deals, more to spend, a patient board', s: { difficulty: 'Amateur', transferDifficulty: 'Easy', startingBudget: 'High', injuries: 'Low', growth: 'Normal', sacking: false } },
  { id: 'classic', name: 'Classic', level: 2, line: 'The game as it is meant to be played', s: { difficulty: 'Professional', transferDifficulty: 'Normal', startingBudget: 'Default', injuries: 'Normal', growth: 'Normal', sacking: true } },
  { id: 'hardcore', name: 'Hardcore', level: 3, line: 'The best sides at their best, hard deals, less money', s: { difficulty: 'Legendary', transferDifficulty: 'Hard', startingBudget: 'Low', injuries: 'High', growth: 'Normal', sacking: true } },
]
const presetOf = (s: CareerSettings) => PRESETS.find((p) => (Object.keys(p.s) as (keyof typeof p.s)[]).every((k) => s[k] === p.s[k]))?.id

/** What the board asks, in a word. */
function challenge(text: string): string {
  if (/win the league|title/i.test(text)) return 'Title'
  if (/promotion/i.test(text)) return 'Promotion'
  if (/europe/i.test(text)) return 'Europe'
  if (/top half/i.test(text)) return 'Top half'
  if (/relegation/i.test(text)) return 'Survival'
  return 'Mid-table'
}

export function NewCareer({ onExit }: { onExit: () => void }) {
  const raw = useGame((s) => s.raw)
  const dbError = useGame((s) => s.dbError)
  const loadDb = useGame((s) => s.loadDb)
  const startCareer = useGame((s) => s.startCareer)
  const [step, setStep] = useState<Step>('you')
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [nation, setNation] = useState('England')
  const [age, setAge] = useState(42)
  const [identity, setIdentity] = useState<ManagerIdentity>({ color: AVATAR_COLORS[0], style: 'Balanced' })
  const [leagueId, setLeagueId] = useState<number>()
  const [clubId, setClubId] = useState<number>()
  const [saveName, setSaveName] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [settings, setSettings] = useState<CareerSettings>({ difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' })
  const [building, setBuilding] = useState(false)
  // from the signature on, the appointment is made: there is no going back while it is written
  const [signing, setSigning] = useState(false)
  const [peek, setPeek] = useState<number>()
  const draft = useRef<Draft>(undefined)

  useEffect(() => { loadDb() }, [loadDb])

  const idx = STEPS.findIndex((s) => s.id === step)
  const go = (s: Step) => { haptic(); setDir(STEPS.findIndex((x) => x.id === s) > idx ? 'fwd' : 'back'); setStep(s) }
  const next = () => go(STEPS[idx + 1].id)
  const back = () => {
    if (signing) return
    if (idx === 0) onExit()
    else go(STEPS[idx - 1].id)
  }
  // the system's back (Android's button, the browser's) closes the club that is open, else goes back a step
  const systemBack = useRef(back)
  useEffect(() => { systemBack.current = () => { if (building) return; if (peek != null) setPeek(undefined); else back() } })
  useEffect(() => {
    const onPop = () => systemBack.current()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (!raw) {
    return (
      <div className="nc">
        <ClubFog atmo={NEUTRAL} />
        <TopBar title="New Career" back onBack={onExit} search={false} />
        <div className="nc-loading">
          {dbError ? <><Icon name="warning" size={32} color="var(--neg)" /><div className="muted">Could not load the football database. {dbError}</div><button className="btn" onClick={() => loadDb()}>Retry</button></> : <><div className="spinner" /><div className="muted small">Loading the EA SPORTS FC 27 database…</div></>}
        </div>
      </div>
    )
  }

  const club = clubId ? raw.clubs.find((c) => c.id === clubId) : undefined
  const league = leagueId ? raw.leagues.find((l) => l.id === leagueId) : undefined
  const flag = raw.nations.find((n) => n.name === nation)?.flag

  const build = async (onStage: (s: Stage) => Promise<void>) => {
    if (!club) return
    const born = `${2026 - age}-0${1 + (first.length % 9)}-1${last.length % 9}`
    try {
      await startCareer({ clubId: club.id, manager: { firstName: first.trim(), lastName: last.trim(), nationality: nation, dob: born, avatar: DEFAULT_AVATAR, realManager: identity.real, avatarColor: identity.color, style: identity.style }, settings, saveName: saveName.trim() || `${club.short} Career`, editMode }, onStage)
    } catch (e) {
      setBuilding(false)
      setSigning(false)
      useGame.getState().notify(`The career could not be started: ${e instanceof Error ? e.message : e}`, 'err')
    }
  }
  if (building && club) return <Building raw={raw} club={club} onBuild={build} />

  const sign = () => {
    if (!club) return
    haptic('heavy')
    setSigning(true)
    // the name is written along the line first
    window.setTimeout(() => setBuilding(true), 1150)
  }

  const valid = first.trim().length >= 1 && last.trim().length >= 2
  const view: Record<Step, { body: ReactNode; cta?: ReactNode }> = {
    you: {
      body: <YouStep raw={raw} first={first} last={last} setFirst={setFirst} setLast={setLast} nation={nation} setNation={setNation} age={age} setAge={setAge} identity={identity} setIdentity={setIdentity} flag={flag} keepDraft={(d) => { draft.current = d }} draft={() => draft.current} />,
      cta: <button className="btn primary block nc-go" disabled={!valid} onClick={next}>Continue <Icon name="forward" size={18} /></button>,
    },
    league: {
      body: <LeagueStep raw={raw} onPick={(id) => { setLeagueId(id); if (id !== leagueId) setClubId(undefined); next() }} />,
    },
    club: {
      body: league ? <ClubStep raw={raw} league={league} picked={clubId} onOpen={(id) => { haptic(); setPeek(id) }} /> : null,
    },
    rules: {
      body: <RulesStep settings={settings} setSettings={setSettings} leagues={raw.leagues} own={club?.leagueId} editMode={editMode} setEditMode={setEditMode} />,
      cta: <button className="btn primary block nc-go" onClick={next}>Continue <Icon name="forward" size={18} /></button>,
    },
    sign: {
      body: club ? <SignStep raw={raw} club={club} league={league} first={first} last={last} nation={nation} flag={flag} age={age} identity={identity} settings={settings} editMode={editMode} saveName={saveName} setSaveName={setSaveName} signed={signing} /> : null,
      cta: club ? <button className="btn primary block nc-go" disabled={signing} onClick={sign}>{signing ? <><Icon name="check" size={19} /> Signed</> : <><Icon name="contract" size={19} /> Sign the contract</>}</button> : undefined,
    },
  }
  const v = view[step]
  const peeked = step === 'club' && peek != null ? raw.clubs.find((c) => c.id === peek) : undefined
  return (
    <div className="nc">
      {/* the app's own air until there is a club, then the club's */}
      <ClubFog key={club?.id ?? 'app'} className="nc-air" atmo={club ? clubAir(club) : NEUTRAL} />
      <TopBar title={STEPS[idx].title} sub={`Step ${idx + 1} of ${STEPS.length}`} back onBack={back} search={false} />
      <nav className="nc-rail" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s.id} className={i < idx ? 'done' : i === idx ? 'on' : ''} disabled={i >= idx || signing} aria-label={s.title} aria-current={i === idx ? 'step' : undefined} onClick={() => go(s.id)}><i /></button>
        ))}
      </nav>
      <div className={`screen no-nav nc-body ${v.cta ? 'has-cta' : ''}`} key={step}>
        <div className={`pad nc-in-${dir}`}>{v.body}</div>
      </div>
      {v.cta && <div className="nc-cta">{v.cta}</div>}
      {peeked && <ClubPreview raw={raw} club={peeked} onClose={() => setPeek(undefined)} onTake={() => { haptic('heavy'); setPeek(undefined); setClubId(peeked.id); go('rules') }} />}
    </div>
  )
}

/** Press to step once, hold to keep stepping. */
function useRepeat(fn: () => void) {
  const cur = useRef(fn)
  useEffect(() => { cur.current = fn })
  const timer = useRef<number>(undefined)
  const stop = () => { window.clearTimeout(timer.current); window.clearInterval(timer.current) }
  useEffect(() => stop, [])
  return {
    onPointerDown: () => { cur.current(); stop(); timer.current = window.setTimeout(() => { timer.current = window.setInterval(() => cur.current(), 70) }, 380) },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
  }
}

// ----------------------------------------------------------------- you
interface RealMgr { name: string; nationality: string; age: number; vision: string; formation: string; club?: RawClub }
const POPULAR = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Brazil', 'Argentina', 'Scotland', 'Wales', 'Republic of Ireland', 'United States']

/** How the coaching style plays, drawn on a small tactics board attacking to the right: the players and their runs. */
function StyleGlyph({ id }: { id: string }) {
  const dots = (pts: [number, number][]) => pts.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="1.9" fill="currentColor" stroke="none" />)
  const d: Record<string, ReactNode> = {
    // a shape that holds together in every phase
    Balanced: dots([[9, 8], [9, 20], [16, 14], [24, 7.5], [24, 20.5], [31, 14]]),
    // passes round a diamond
    Possession: <><path d="M10 14 19 7l10 7-10 7z" strokeDasharray="1.6 2.2" strokeWidth="1.5" />{dots([[10, 14], [19, 7], [29, 14], [19, 21]])}</>,
    // three closing on the ball as soon as it is lost
    Gegenpress: <><circle cx="26" cy="14" r="7.5" strokeDasharray="1.6 2.2" strokeWidth="1.3" /><circle cx="26" cy="14" r="2" strokeWidth="1.5" />{dots([[18.5, 14], [29.75, 7.5], [29.75, 20.5]])}</>,
    // sit deep, then one long run into the space
    'Counter-Attack': <><path d="M13 16c7 2 11-7 19-8" strokeWidth="1.6" /><path d="M29.2 5.4 32.4 8l-2.8 2.8" strokeWidth="1.6" />{dots([[7.5, 9], [7.5, 19], [12, 14]])}</>,
    // the long ball forward, and the runner after it
    Direct: <><path d="M8 18Q19 1 31 11" strokeDasharray="1.6 2.2" strokeWidth="1.5" />{dots([[8, 18], [32, 12.5], [27, 19]])}</>,
    // up both flanks, a man in the box
    'Wing Play': <><path d="M9 5.5h18M9 22.5h18" strokeWidth="1.6" /><path d="M24.6 3.3 27.4 5.5l-2.8 2.2M24.6 20.3l2.8 2.2-2.8 2.2" strokeWidth="1.6" />{dots([[31, 14]])}</>,
    // two banks in front of its own goal
    'Park the Bus': dots([[7.5, 5], [7.5, 9.5], [7.5, 14], [7.5, 18.5], [7.5, 23], [13, 9.5], [13, 14], [13, 18.5]]),
  }
  return (
    <svg className="nc-glyph" viewBox="0 0 40 28" width="40" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g strokeWidth="1.1" strokeOpacity=".24"><rect x="1.5" y="1.5" width="37" height="25" rx="3.5" /><path d="M20 1.5v25M1.5 9.5H5v9H1.5M38.5 9.5H35v9h3.5" /></g>
      {d[id] || d.Balanced}
    </svg>
  )
}

/** The manager's card: who he is, filled in as he is made. */
function ManagerCard({ first, last, nation, flag, age, identity }: { first: string; last: string; nation: string; flag?: string; age: number; identity: ManagerIdentity }) {
  const name = `${first.trim()} ${last.trim()}`.trim()
  const style = STYLES.find((s) => s.id === identity.style)
  return (
    <div className="nc-id" style={{ ['--pc' as string]: identity.color } as CSSProperties}>
      <i className="nc-id-sheen" key={`${name}|${identity.color}|${identity.real || ''}`} aria-hidden />
      <div className="nc-id-top">
        {identity.real ? <ManagerAvatar name={identity.real} size={68} radius={18} nation={nation} />
          : name ? <Avatar name={name} size={68} radius={18} color={identity.color} />
          : <div className="avatar nc-id-blank" style={{ width: 68, height: 68, borderRadius: 18, ['--av' as string]: identity.color } as CSSProperties}><Icon name="manager" size={32} /></div>}
        <div className="nc-id-main">
          <span className="nc-id-k">{identity.real ? 'Real manager' : 'Manager'} · 2026/27</span>
          <b className={`nc-id-name ${name ? '' : 'empty'}`}>{name || 'Your name'}</b>
          <span className="nc-id-meta"><Flag code={flag} size={12} />{nation} · {age}</span>
        </div>
      </div>
      <div className="nc-id-style"><StyleGlyph id={identity.style} /><b>{identity.style}</b><span className="ellipsis">{style?.line}</span></div>
    </div>
  )
}

function YouStep(props: { raw: RawDb; first: string; last: string; setFirst: (s: string) => void; setLast: (s: string) => void; nation: string; setNation: (s: string) => void; age: number; setAge: Dispatch<SetStateAction<number>>; identity: ManagerIdentity; setIdentity: (i: ManagerIdentity) => void; flag?: string; keepDraft: (d: Draft) => void; draft: () => Draft | undefined }) {
  const { raw, identity, setIdentity } = props
  const [mode, setMode] = useState<'custom' | 'real'>(identity.real ? 'real' : 'custom')
  const [natOpen, setNatOpen] = useState(false)
  const [q, setQ] = useState('')
  const [mq, setMq] = useState('')
  const nations = useMemo(() => {
    const all = [...raw.nations].sort((a, b) => a.name.localeCompare(b.name))
    const pop = POPULAR.map((n) => all.find((x) => x.name === n)).filter(Boolean) as typeof all
    return { pop, all }
  }, [raw])
  const reals = useMemo<RealMgr[]>(() => {
    const out: RealMgr[] = []
    const lg = new Map(raw.leagues.map((l) => [l.id, l]))
    for (const c of raw.clubs) if (c.manager) out.push({ ...c.manager, club: c })
    return out.sort((a, b) => ((lg.get(b.club!.leagueId)?.prestige || 0) * 10 + b.club!.squadAvg) - ((lg.get(a.club!.leagueId)?.prestige || 0) * 10 + a.club!.squadAvg))
  }, [raw])
  const shown = reals.filter((m) => !mq || m.name.toLowerCase().includes(mq.toLowerCase()) || m.club?.name.toLowerCase().includes(mq.toLowerCase())).slice(0, 60)
  const pickReal = (m: RealMgr) => {
    haptic('medium')
    if (!identity.real) props.keepDraft({ first: props.first, last: props.last, nation: props.nation, age: props.age, style: identity.style })
    const parts = m.name.split(' ')
    props.setFirst(parts.length > 1 ? parts.slice(0, -1).join(' ') : m.name)
    props.setLast(parts.length > 1 ? parts[parts.length - 1] : m.name)
    props.setNation(m.nationality)
    props.setAge(Math.max(AGE_MIN, Math.min(AGE_MAX, m.age)))
    setIdentity({ ...identity, real: m.name, style: STYLES.some((s) => s.id === m.vision) ? m.vision : 'Balanced' })
  }
  const switchMode = (v: 'custom' | 'real') => {
    haptic()
    setMode(v)
    if (v === 'custom' && identity.real) {
      const d = props.draft() || { first: '', last: '', nation: 'England', age: 42, style: 'Balanced' }
      setIdentity({ ...identity, real: undefined, style: d.style })
      props.setFirst(d.first); props.setLast(d.last); props.setNation(d.nation); props.setAge(d.age)
    }
  }
  const younger = useRepeat(() => { haptic(); props.setAge((a) => Math.max(AGE_MIN, a - 1)) })
  const older = useRepeat(() => { haptic(); props.setAge((a) => Math.min(AGE_MAX, a + 1)) })
  // the chosen style brought into view when it is out of sight (a real manager's may be far along the row); one tapped
  // in view stays where it is
  const styles = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = styles.current, el = row?.querySelector<HTMLElement>('.nc-style.on')
    if (!row || !el) return
    const from = row.scrollLeft + 16, to = row.scrollLeft + row.clientWidth - 16
    if (el.offsetLeft < from) row.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' })
    else if (el.offsetLeft + el.offsetWidth > to) row.scrollTo({ left: el.offsetLeft + el.offsetWidth - row.clientWidth + 16, behavior: 'smooth' })
  }, [identity.style])
  return (
    <div className="stack nc-you">
      <ManagerCard first={props.first} last={props.last} nation={props.nation} flag={props.flag} age={props.age} identity={identity} />
      <Seg items={[{ id: 'custom', label: 'Your own' }, { id: 'real', label: 'Real manager' }]} value={mode} onChange={switchMode} />
      {mode === 'custom' ? (
        <div className="nc-form">
          <div className="nc-row2">
            <label className="nc-field"><span>First name</span><input value={props.first} maxLength={18} onChange={(e) => props.setFirst(e.target.value)} placeholder="First name" autoComplete="off" /></label>
            <label className="nc-field"><span>Last name</span><input value={props.last} maxLength={20} onChange={(e) => props.setLast(e.target.value)} placeholder="Last name" autoComplete="off" /></label>
          </div>
          <div className="nc-row2 nc-na">
            <button className="nc-field nc-pick" onClick={() => { haptic(); setNatOpen(true) }}><span>Nationality</span><b><Flag code={props.flag} size={14} /><span className="ellipsis">{props.nation}</span><Icon name="down" size={16} /></b></button>
            <div className="nc-field nc-age">
              <span>Age</span>
              <div className="nc-age-row">
                <button aria-label="Younger" disabled={props.age <= AGE_MIN} {...younger}><Icon name="minus" size={15} /></button>
                <b>{props.age}</b>
                <button aria-label="Older" disabled={props.age >= AGE_MAX} {...older}><Icon name="plus" size={15} /></button>
              </div>
            </div>
          </div>
          <div className="nc-field nc-colours">
            <span>Badge colour</span>
            <div className="nc-swatches">{AVATAR_COLORS.map((c) => <button key={c} aria-label={c} className={`swatch ${identity.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => { haptic(); setIdentity({ ...identity, color: c }) }} />)}</div>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <div className="search-box"><Icon name="search" size={18} color="var(--t3)" /><input placeholder="Search managers or clubs" value={mq} onChange={(e) => setMq(e.target.value)} /></div>
          <div className="card list nc-reals">
            {shown.map((m) => (
              <button key={m.name + m.club?.id} className={`li tap ${identity.real === m.name ? 'sel-row' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => pickReal(m)}>
                <ManagerAvatar name={m.name} size={42} nation={m.nationality} clubs={m.club ? [m.club.name] : []} />
                <div className="meta"><div className="t ellipsis">{m.name}</div><div className="s row tight">{m.club && <Badge club={m.club as never} size={14} />}{m.club?.short} · {m.nationality} · {m.age}</div></div>
                {identity.real === m.name ? <Icon name="check" size={18} color="var(--acc)" /> : <span className="tiny dim">{m.vision}</span>}
              </button>
            ))}
          </div>
          <div className="tiny dim">A real manager starts with his own reputation; the club he leaves appoints someone new.</div>
        </div>
      )}
      <div>
        <div className="label nc-sec">Coaching style</div>
        <div className="nc-styles" ref={styles} role="radiogroup" aria-label="Coaching style">
          {STYLES.map((s) => (
            <button key={s.id} role="radio" aria-checked={identity.style === s.id} className={`nc-style ${identity.style === s.id ? 'on' : ''}`} onClick={() => { haptic(); setIdentity({ ...identity, style: s.id }) }}>
              <StyleGlyph id={s.id} /><b>{s.id}</b><span>{s.line}</span>
            </button>
          ))}
        </div>
      </div>
      <Sheet open={natOpen} onClose={() => setNatOpen(false)} title="Nationality">
        <input className="input" style={{ width: '100%', marginBottom: 10 }} placeholder="Search nations" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {(q ? nations.all.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())) : [...nations.pop, ...nations.all.filter((n) => !POPULAR.includes(n.name))]).map((n, i) => (
            <button key={n.name} className={`li tap ${!q && i === nations.pop.length ? 'nc-nat-gap' : ''}`} style={{ minHeight: 46, width: '100%', textAlign: 'left' }} onClick={() => { haptic(); props.setNation(n.name); setNatOpen(false); setQ('') }}>
              <Flag code={n.flag} size={16} /><div className="meta">{n.name}</div>{n.name === props.nation && <Icon name="check" size={18} color="var(--acc)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

// ----------------------------------------------------------------- league
/** The leagues with their own identity, shown first, in this order. */
const FEATURED = [13, 53, 19, 31, 16, 10, 308, 4, 14]
const COUNTRY_ORDER = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Scotland', 'Türkiye', 'Saudi Arabia', 'United States']

function LeagueStep({ raw, onPick }: { raw: RawDb; onPick: (id: number) => void }) {
  const featured = FEATURED.map((id) => raw.leagues.find((l) => l.id === id)).filter(Boolean) as RawLeague[]
  // the rest in one list: country by country (the big football countries first), each country's top tier first
  const rest = useMemo(() => {
    const best = new Map<string, number>()
    for (const l of raw.leagues) best.set(l.country, Math.max(best.get(l.country) || 0, l.prestige))
    const rank = (c: string) => { const i = COUNTRY_ORDER.indexOf(c); return i < 0 ? 99 : i }
    return raw.leagues.filter((l) => !FEATURED.includes(l.id))
      .sort((a, b) => rank(a.country) - rank(b.country) || (best.get(b.country) || 0) - (best.get(a.country) || 0) || a.country.localeCompare(b.country) || a.level - b.level)
  }, [raw])
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="nc-leagues">
        {featured.map((l, i) => {
          const ci = compIdentity(`L${l.id}`)
          const top = leagueClubs(raw, l).slice(0, 3)
          return (
            <button key={l.id} className={`nc-lg ${i === 0 ? 'wide' : ''} ${ci ? identityClass(ci).replace(/ ci-(sheen|prism)/, '') : ''}`} style={ci ? identityVars(ci) : undefined} onClick={() => { haptic('medium'); onPick(l.id) }}>
              {ci && <IdentityArt ci={{ ...ci, motion: undefined }} />}
              <span className="nc-lg-logo"><CompLogo k={`L${l.id}`} size={i === 0 ? 40 : 30} name={l.name} /></span>
              <span className="nc-lg-name">{l.name}</span>
              <span className="nc-lg-meta"><Flag code={l.flag} size={10} />{l.clubs.length} clubs<span className="nc-lg-crests">{top.map((c) => <Badge key={c.id} club={c as never} size={i === 0 ? 17 : 14} />)}</span></span>
            </button>
          )
        })}
      </div>
      <div>
        <div className="label nc-sec">More leagues</div>
        <div className="card list nc-more">
          {rest.map((l) => (
            <button key={l.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onPick(l.id) }}>
              <div className="logo-tile"><CompLogo k={`L${l.id}`} size={28} name={l.name} /></div>
              <div className="meta"><div className="t ellipsis">{l.name}</div><div className="s row tight"><Flag code={l.flag} size={11} /><span className="ellipsis">{l.country}{l.level > 1 ? ` · tier ${l.level}` : ''} · {l.clubs.length} clubs</span></div></div>
              <Stars n={Math.max(0.5, l.prestige / 2)} size={9} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- club
function ClubStep({ raw, league, picked, onOpen }: { raw: RawDb; league: RawLeague; picked?: number; onOpen: (id: number) => void }) {
  const clubs = useMemo(() => leagueClubs(raw, league), [raw, league])
  const [sort, setSort] = useState<'rating' | 'budget' | 'name'>('rating')
  const sorted = useMemo(() => {
    const a = [...clubs]
    if (sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name))
    if (sort === 'budget') a.sort((x, y) => rawBudget(raw, y) - rawBudget(raw, x))
    return a
  }, [raw, clubs, sort])
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row nc-lghead">
        <CompLogo k={`L${league.id}`} size={34} name={league.name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="t ellipsis">{league.name}</div>
          <div className="tiny dim row tight"><Flag code={league.flag} size={10} />{league.country} · {clubs.length} clubs · {league.rele ? `${league.rele} go down` : 'no relegation'}</div>
        </div>
      </div>
      <Seg small items={[{ id: 'rating', label: 'Strongest' }, { id: 'budget', label: 'Richest' }, { id: 'name', label: 'A–Z' }]} value={sort} onChange={(v) => { haptic(); setSort(v) }} />
      <div className="nc-clubs">
        {sorted.map((c) => (
          <button key={c.id} className={`nc-club ${picked === c.id ? 'picked' : ''}`} style={{ ['--cc' as string]: clubAccent(c) } as CSSProperties} onClick={() => onOpen(c.id)}>
            <span className="nc-club-crest"><Badge club={c as never} size={54} /></span>
            <b className="ellipsis">{c.short}</b>
            <Stars n={starRating(c.squadAvg)} size={10} />
            <span className="nc-club-foot"><b>{fmtMoney(rawBudget(raw, c), { short: true })}</b><span>{challenge(rawExpectation(raw, c))}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A club, opened before you take it: what it is, what the board wants, the money, the players and the rivals. */
function ClubPreview({ raw, club, onClose, onTake }: { raw: RawDb; club: RawClub; onClose: () => void; onTake: () => void }) {
  const r = clubRatings(raw, club.id)
  const squad = rawSquads(raw).get(club.id) || []
  const lg = raw.leagues.find((l) => l.id === club.leagueId)
  const byId = new Map(raw.clubs.map((c) => [c.id, c]))
  const hist = raw.history[String(club.leagueId)]
  const lastPos = hist ? hist.findIndex((h) => h.clubId === club.id) + 1 : 0
  const exp = rawExpectation(raw, club)
  const young = squad.filter((p) => p.age <= 21).sort((a, b) => b.pot - a.pot).slice(0, 6)
  const [leaving, setLeaving] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const close = () => { haptic(); setLeaving(true); window.setTimeout(onClose, 220) }
  const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) % 10 === 1 ? 0 : n % 10]}`
  return (
    <div className={`nc-cp ${leaving ? 'out' : ''}`} role="dialog" aria-label={club.name}>
      <ClubFog atmo={clubAir(club)} />
      <div className="screen no-nav nc-cp-scroll" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 190)}>
        <div className="nc-cp-hero">
          <div className="nc-cp-crest"><Badge club={club as never} size={96} /></div>
          <div className="nc-cp-name">{club.name}</div>
          <div className="nc-cp-lg">{lg && <CompLogo k={`L${lg.id}`} size={16} name={lg.name} />}<span>{lg?.name}</span><Stars n={starRating(club.squadAvg)} size={11} /></div>
          <div className="nc-cp-ratings">{([['OVR', r.ovr], ['ATT', r.att], ['MID', r.mid], ['DEF', r.def]] as const).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        </div>
        <div className="pad stack nc-cp-body">
          <div className="card list nc-job">
            <div className="li"><span className="muted">The board wants</span><b>{exp}</b></div>
            <div className="li"><span className="muted">Transfer budget</span><b>{fmtMoney(rawBudget(raw, club))}</b></div>
            {club.manager && <div className="li"><span className="muted">You replace</span><b>{club.manager.name}</b></div>}
          </div>
          <div className="nc-facts">
            <div><Icon name="stadium" size={15} /><span>{club.stadium || 'Stadium'}</span><b>{club.capacity ? club.capacity.toLocaleString() : '—'}</b></div>
            <div><Icon name="history" size={15} /><span>2025/26</span><b>{lastPos ? ord(lastPos) : lg?.level === 1 ? 'Promoted' : '—'}</b></div>
            <div><Icon name="globe" size={15} /><span>City</span><b>{club.city || club.country}</b></div>
            <div><Icon name="calendar" size={15} /><span>Founded</span><b>{club.founded || '—'}</b></div>
          </div>
          <div>
            <div className="label nc-sec">Key players</div>
            <div className="nc-players">
              {squad.slice(0, 8).map((p) => (
                <div key={p.id} className="nc-pl">
                  <Face p={{ id: p.id, nation: p.nation, name: p.name } as never} size={56} radius={14} />
                  <b className="ellipsis">{p.name.split(' ').slice(-1)[0]}</b>
                  <span className="nc-pl-foot"><PosChip pos={p.pos} /><Ovr v={p.ovr} size="sm" /></span>
                </div>
              ))}
            </div>
          </div>
          {young.length > 0 && (
            <div>
              <div className="label nc-sec">Prospects</div>
              <div className="nc-players">
                {young.map((p) => (
                  <div key={p.id} className="nc-pl">
                    <Face p={{ id: p.id, nation: p.nation, name: p.name } as never} size={56} radius={14} />
                    <b className="ellipsis">{p.name.split(' ').slice(-1)[0]}</b>
                    <span className="nc-pl-foot"><PosChip pos={p.pos} /><span className="nc-pot"><i>POT</i>{p.pot}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {club.rivals.length > 0 && (
            <div>
              <div className="label nc-sec">Rivals</div>
              <div className="card list">
                {club.rivals.map(([id, name, lvl]) => byId.get(id) && (
                  <div key={id} className="li">
                    <Badge club={byId.get(id) as never} size={32} />
                    <div className="meta"><div className="t">{byId.get(id)!.name}</div><div className="s">{name}</div></div>
                    <span className="row tight">{Array.from({ length: lvl }, (_, i) => <Icon key={i} name="fire" size={14} color="var(--neg)" />)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={`nc-cp-bar ${scrolled ? 'on' : ''}`} aria-hidden={!scrolled}><span className="ellipsis">{club.name}</span></div>
      <button className="iconbtn nc-cp-x" onClick={close} aria-label="Close"><Icon name="close" size={20} /></button>
      <div className="nc-cta"><button className="btn primary block nc-go" onClick={onTake}>Take the job <Icon name="forward" size={18} /></button></div>
    </div>
  )
}

// ----------------------------------------------------------------- rules
/** A way to play, as how hard it is: one, two or three bars. */
function Level({ n }: { n: number }) {
  return <span className="nc-level" aria-hidden>{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
}

function RulesStep({ settings, setSettings, leagues, own, editMode, setEditMode }: { settings: CareerSettings; setSettings: (s: CareerSettings) => void; leagues: PickLeague[]; own?: number; editMode: boolean; setEditMode: (v: boolean) => void }) {
  const set = (p: Partial<CareerSettings>) => setSettings({ ...settings, ...p })
  const preset = presetOf(settings)
  const [custom, setCustom] = useState(!preset)
  const diffs: CareerSettings['difficulty'][] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional', 'World Class', 'Legendary', 'Ultimate']
  const isCustom = custom || !preset
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card list nc-presets" role="radiogroup" aria-label="How you want to play">
        {PRESETS.map((p) => {
          const on = preset === p.id && !custom
          return (
            <button key={p.id} role="radio" aria-checked={on} className={`li tap nc-preset ${on ? 'on' : ''}`} onClick={() => { haptic(); setCustom(false); set(p.s) }}>
              <Level n={p.level} />
              <span className="meta">
                <span className="t">{p.name}{p.id === 'classic' && <i className="nc-rec">Recommended</i>}</span>
                <span className="s">{p.line}</span>
                <span className="s nc-preset-k">{p.s.difficulty} · {p.s.transferDifficulty.toLowerCase()} deals · {p.s.startingBudget === 'Default' ? 'usual' : p.s.startingBudget.toLowerCase()} budget</span>
              </span>
              <span className="nc-radio" />
            </button>
          )
        })}
        <button role="radio" aria-checked={isCustom} className={`li tap nc-preset ${isCustom ? 'on' : ''}`} onClick={() => { haptic(); setCustom(true) }}>
          <span className="nc-level custom" aria-hidden><Icon name="settings" size={17} /></span>
          <span className="meta"><span className="t">Custom</span><span className="s">Set each one yourself</span></span>
          <span className="nc-radio" />
        </button>
      </div>
      {isCustom && (
        <div className="stack fade-up" style={{ gap: 12 }}>
          <div className="card pad-card stack" style={{ gap: 10 }}>
            <div className="label">Match difficulty</div>
            <div className="row wrap" style={{ gap: 7 }}>{diffs.map((d) => <button key={d} className={`chip ${settings.difficulty === d ? 'on' : ''}`} onClick={() => { haptic(); set({ difficulty: d }) }}>{d}</button>)}</div>
          </div>
          <div className="card pad-card stack" style={{ gap: 12 }}>
            <div><div className="label" style={{ marginBottom: 6 }}>Transfer negotiations</div><Seg small items={[{ id: 'Easy', label: 'Easy' }, { id: 'Normal', label: 'Normal' }, { id: 'Hard', label: 'Hard' }]} value={settings.transferDifficulty} onChange={(v) => set({ transferDifficulty: v })} /></div>
            <div><div className="label" style={{ marginBottom: 6 }}>Starting budget</div><Seg small items={[{ id: 'Low', label: 'Low' }, { id: 'Default', label: 'Usual' }, { id: 'High', label: 'High' }]} value={settings.startingBudget} onChange={(v) => set({ startingBudget: v })} /></div>
            <div><div className="label" style={{ marginBottom: 6 }}>Injuries</div><Seg small items={[{ id: 'Low', label: 'Fewer' }, { id: 'Normal', label: 'Normal' }, { id: 'High', label: 'More' }]} value={settings.injuries} onChange={(v) => set({ injuries: v })} /></div>
            <div><div className="label" style={{ marginBottom: 6 }}>Player growth</div><Seg small items={[{ id: 'Slow', label: 'Slow' }, { id: 'Normal', label: 'Normal' }, { id: 'Fast', label: 'Fast' }]} value={settings.growth} onChange={(v) => set({ growth: v })} /></div>
          </div>
          <div className="card">
            <Toggle label="The board can sack you" sub="If its confidence collapses" on={settings.sacking} onChange={(v) => set({ sacking: v })} />
          </div>
        </div>
      )}
      <div className="card">
        <Toggle label="Other clubs do business" sub="They buy, sell and loan players through the windows" on={settings.aiTransfers} onChange={(v) => set({ aiTransfers: v })} />
      </div>
      <div className="card pad-card">
        <div className="label" style={{ marginBottom: 8 }}>Leagues to follow closely</div>
        <DeepLeaguePicker leagues={leagues} own={own} value={settings.deepLeagues} onChange={(v) => set({ deepLeagues: v })} />
      </div>
      <div className={`card edit-opt ${editMode ? 'on' : ''}`}>
        <Toggle label={<span className="row tight"><Icon name="edit" size={16} color="var(--gold)" /> Edit Mode</span> as never} sub="Sandbox freedom: edit players, move them between clubs, script matches and bend negotiations. The save is marked as edited for good." on={editMode} onChange={(v) => { haptic(); setEditMode(v) }} />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- sign
function SignStep({ raw, club, league, first, last, nation, flag, age, identity, settings, editMode, saveName, setSaveName, signed }: { raw: RawDb; club: RawClub; league?: RawLeague; first: string; last: string; nation: string; flag?: string; age: number; identity: ManagerIdentity; settings: CareerSettings; editMode: boolean; saveName: string; setSaveName: (s: string) => void; signed: boolean }) {
  const budget = rawBudget(raw, club) * (settings.startingBudget === 'High' ? 1.6 : settings.startingBudget === 'Low' ? 0.6 : 1)
  const preset = PRESETS.find((p) => p.id === presetOf(settings))
  const name = `${first.trim()} ${last.trim()}`
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="nc-deal" style={{ ['--cc' as string]: clubAccent(club) } as CSSProperties}>
        <div className="nc-deal-head">
          <div className="nc-deal-k">Official<span>2026/27</span></div>
          <Badge club={club as never} size={58} />
        </div>
        <div className="nc-deal-who">
          {identity.real ? <ManagerAvatar name={identity.real} size={50} radius={14} nation={nation} /> : <Avatar name={name} size={50} radius={14} color={identity.color} />}
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="nc-deal-name ellipsis">{name}</b>
            <span className="tiny muted row tight"><Flag code={flag} size={11} />{nation} · {age} · {identity.style}</span>
          </div>
        </div>
        <p className="nc-deal-line">is appointed manager of <b>{club.name}</b>{league ? `, ${league.name},` : ''} for the 2026/27 season.</p>
        <div className="nc-deal-terms">
          <div><span>The board wants</span><b>{rawExpectation(raw, club)}</b></div>
          <div><span>Transfer budget</span><b>{fmtMoney(budget)}</b></div>
          <div><span>Rules</span><b>{preset ? preset.name : 'Custom'} · {settings.difficulty}</b></div>
          {editMode && <div><span>Edit Mode</span><b style={{ color: 'var(--gold)' }}>On, for good</b></div>}
        </div>
        <div className={`nc-deal-sign ${signed ? 'signed' : ''}`}>
          <svg viewBox="0 0 220 40" aria-hidden><path d="M6 28c10-14 16-20 20-14s-6 16 2 14 12-18 18-16-4 16 4 14 10-12 16-12 2 10 8 9 10-10 15-9 1 8 7 8 9-7 14-7 3 6 9 6 12-5 18-5 6 4 12 4 14-3 20-3 10 2 16 1" /></svg>
          <span>{signed ? `Signed, ${name}` : 'Manager\'s signature'}</span>
        </div>
      </div>
      <label className="nc-field"><span>Save name</span><input value={saveName} placeholder={`${club.short} Career`} maxLength={32} onChange={(e) => setSaveName(e.target.value)} /></label>
    </div>
  )
}

const STAGES: Stage[] = ['players', 'clubs', 'season', 'saved']
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
/** once the page has painted (or a moment has passed, if it is hidden and frames are not coming) */
const painted = () => new Promise<void>((r) => { requestAnimationFrame(() => requestAnimationFrame(() => r())); window.setTimeout(r, 150) })

/** The world being built: the club, and each part of its season ticked off as it is really done. The building takes
 *  the thread in stages; between them the screen is drawn, and each line stays a moment however quick the device. */
function Building({ raw, club, onBuild }: { raw: RawDb; club: RawClub; onBuild: (onStage: (s: Stage) => Promise<void>) => void }) {
  const lines = [
    `${raw.players.length.toLocaleString()} players and their ratings`,
    `${raw.clubs.length.toLocaleString()} clubs: squads, shirt numbers, managers`,
    `${raw.leagues.length} leagues, the cups and the European draws`,
    `The board at ${club.short} sets its objectives`,
  ]
  const [n, setN] = useState(0)
  const started = useRef(false)
  const begin = useRef(onBuild)
  useEffect(() => {
    if (started.current) return
    started.current = true
    let last = performance.now()
    const onStage = async (s: Stage) => {
      const wait = 320 - (performance.now() - last)
      if (wait > 0) await sleep(wait)
      setN(STAGES.indexOf(s) + 1)
      last = performance.now()
      await painted()
      if (s === 'saved') await sleep(380)
    }
    // the crest is on its way in before the first stage takes the thread
    void painted().then(() => sleep(160)).then(() => begin.current(onStage))
  }, [])
  return (
    <div className="nc nc-building" style={{ ['--cc' as string]: clubAccent(club) } as CSSProperties}>
      <div className="nc-build">
        <div className="nc-build-crest"><Badge club={club as never} size={104} /></div>
        <div className="nc-build-name">{club.name}</div>
        <div className="nc-build-k">Building the 2026/27 season</div>
        <div className="nc-build-bar"><i style={{ width: `${(n / STAGES.length) * 100}%` }} /></div>
        <div className="nc-build-lines">
          {lines.map((l, i) => (
            <div key={l} className={`nc-build-line ${i < n ? 'on' : i === n ? 'now' : ''}`}>
              {i < n ? <Icon name="check" size={14} /> : <i className="nc-build-spin" aria-hidden />}{l}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
