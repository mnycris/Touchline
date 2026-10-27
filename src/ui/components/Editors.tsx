// Edit Mode, integrated: a pencil on the screens you already use turns them editable. Players (attributes, profile,
// contract, a move to any club), clubs' money, negotiations and upcoming matches (see ScriptEditor).
import { useMemo, useState, type ReactNode } from 'react'
import type { AttrKey, Club, Player, Position, SquadRole, World } from '../../domain/types'
import { A } from '../../domain/types'
import { ATTR_GROUPS, ATTR_LABEL, GK_GROUPS, INJURIES, POSITIONS, SQUAD_ROLES } from '../../domain/constants'
import { computeOvr, moraleColor, moraleIcon, moraleLevel } from '../../domain/ratings'
import { diffDays, fmtDate } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { useGame, haptic } from '../../store/game'
import { editClub, editClubMoney, editPlayer, editSquadStrength, editTransfer, injuryFor, type ClubPatch, type PlayerPatch } from '../../engine/world/edit'
import { generateObjectives } from '../../engine/world/board'
import { worldRng } from '../../engine/world/advance'
import { FORMATIONS } from '../../domain/constants'
import { Icon } from '../icons/Icon'
import { Badge, Ovr } from './atoms'
import { Seg, Stepper as LStepper } from './layout'

/** Local editing state for a screen, with the little "Edit …" confirmation toast. */
export function useEditing(label: string): [boolean, () => void, (v: boolean) => void] {
  const [on, setOn] = useState(false)
  const notify = useGame((s) => s.notify)
  const toggle = () => { haptic('medium'); if (!on) notify(`Edit ${label}`, 'edit'); setOn(!on) }
  return [on, toggle, setOn]
}

/** The pencil in a screen's top-right corner (only in Edit Mode careers). */
export function EditToggle({ w, on, onClick, label = 'Edit' }: { w: World; on: boolean; onClick: () => void; label?: string }) {
  if (!w.meta.editMode) return null
  return (
    <button className={`iconbtn edit-btn ${on ? 'on' : ''}`} aria-label={on ? `Stop editing` : label} aria-pressed={on} onClick={onClick}>
      <Icon name={on ? 'check' : 'edit'} size={19} strokeWidth={2.1} />
    </button>
  )
}

/** A compact −/+ stepper with the value in the middle: hold to repeat, tap the value to type it. */
export function Stepper(props: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => ReactNode; label?: string; money?: boolean; presets?: number[] }) {
  return <LStepper {...props} compact />
}

function AttrRow({ k, v, base, onChange }: { k: AttrKey; v: number; base: number; onChange: (v: number) => void }) {
  const d = v - base
  return (
    <div className="ed-attr">
      <span className="small ellipsis">{ATTR_LABEL[k]}</span>
      <input type="range" min={1} max={99} value={v} style={{ ['--p' as any]: `${v}%` }} onChange={(e) => onChange(Number(e.target.value))} aria-label={ATTR_LABEL[k]} />
      <span className={`ed-v num ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{v}</span>
    </div>
  )
}

/** A condition you drag: the bar in the colour of how good it is, the word for it, and the usual settings a tap away. */
function CondMeter({ label, icon, v, min = 0, unit = '%', word, color, presets, onChange }: { label: string; icon: string; v: number; min?: number; unit?: string; word: string; color: string; presets: [number, string][]; onChange: (v: number) => void }) {
  return (
    <div className="ed-cond" style={{ ['--c' as any]: color }}>
      <div className="ed-cond-h">
        <Icon name={icon} size={16} color={color} />
        <span className="small b">{label}</span>
        <span className="grow" />
        <span className="tiny b" style={{ color }}>{word}</span>
        <span className="ed-cond-v num">{v}{unit && <small>{unit}</small>}</span>
      </div>
      <input type="range" className="ed-cond-range" min={min} max={100} value={v} style={{ ['--p' as any]: `${((v - min) / (100 - min)) * 100}%` }} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <div className="ed-chips">{presets.map(([x, t]) => <button key={t} className={`chip sm ${v === x ? 'on' : ''}`} onClick={() => { haptic(); onChange(x) }}>{t}</button>)}</div>
    </div>
  )
}

type InjuryDraft = { type: string; days: number } | null
const outFor = (d: number) => (d >= 56 && d % 7 === 0 ? `${d / 7} weeks` : d === 1 ? '1 day' : `${d} days`)

/** The injury he has (heal it, or change how long he is out), or one to give him from the game's own list. */
function InjuryEdit({ w, p, inj, onChange }: { w: World; p: Player; inj: InjuryDraft; onChange: (v: InjuryDraft) => void }) {
  if (inj) {
    const x = injuryFor(w, p, inj.type, inj.days)
    return (
      <div className="ed-inj hurt fade-in">
        <div className="ed-cond-h">
          <Icon name="injury" size={16} color="var(--neg)" />
          <span className="small b">Injured</span>
          <span className="grow" />
          <span className={`ed-sev s-${x.severity}`}>{x.severity}</span>
        </div>
        <div className="ed-inj-name">{inj.type}</div>
        <div className="ed-line"><span className="small">Out for</span><Stepper value={inj.days} min={1} max={365} onChange={(d) => onChange({ ...inj, days: d })} fmt={outFor} presets={[7, 14, 28, 56, 90, 180]} /></div>
        <div className="tiny dim">Back in training on {fmtDate(x.until, 'long')}</div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm grow" onClick={() => { haptic(); onChange(null) }}><Icon name="check" size={15} color="var(--pos)" /> Heal him</button>
        </div>
      </div>
    )
  }
  return (
    <div className="ed-inj fade-in">
      <div className="ed-cond-h">
        <Icon name="injury" size={16} color="var(--t3)" />
        <span className="small b">Injury</span>
        <span className="grow" />
        <span className="tiny b pos">Fit</span>
      </div>
      <div className="tiny dim" style={{ margin: '2px 0 8px' }}>Injure him: pick what it is, then set how long he's out.</div>
      <div className="ed-inj-list">
        {INJURIES.map((i) => (
          <button key={i.type} className="ed-inj-opt" onClick={() => { haptic(); onChange({ type: i.type, days: Math.round((i.min + i.max) / 2) }) }}>
            <span className={`ed-sev-dot s-${i.sev}`} />
            <span className="small b ellipsis grow">{i.type}</span>
            <span className="tiny dim num">{i.max >= 56 ? `${Math.round(i.min / 7)}–${Math.round(i.max / 7)} wks` : `${i.min}–${i.max} days`}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

type Tab = 'attrs' | 'condition' | 'profile' | 'contract' | 'move'

/** The player page, editable. Overall is never typed in: it follows the attributes and the main position. */
export function PlayerEditor({ w, p, onClose }: { w: World; p: Player; onClose: () => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [tab, setTab] = useState<Tab>('attrs')
  const [attrs, setAttrs] = useState<number[]>(() => [...p.attrs])
  const [pos, setPos] = useState<Position[]>(() => [...p.positions])
  const [prof, setProf] = useState(() => ({ pot: p.pot, foot: p.foot as 'L' | 'R', weakFoot: p.weakFoot, skillMoves: p.skillMoves, height: p.height, morale: Math.round(p.morale), fitness: Math.round(p.fitness), sharpness: Math.round(p.sharpness) }))
  const injNow: InjuryDraft = p.injury && p.injury.until > w.date ? { type: p.injury.type, days: diffDays(p.injury.until, w.date) } : null
  const [inj, setInj] = useState<InjuryDraft>(injNow)
  const injDirty = JSON.stringify(inj) !== JSON.stringify(injNow)
  const [con, setCon] = useState(() => ({ wage: p.contract.wage, until: p.contract.until, release: p.contract.releaseClause || 0, role: p.contract.role as SquadRole }))
  const draft = useMemo(() => ({ ...p, attrs, positions: pos }) as Player, [attrs, pos])
  const ovr = computeOvr(draft)
  const gk = pos[0] === 'GK'
  const groups = gk ? [...GK_GROUPS, ...ATTR_GROUPS] : ATTR_GROUPS
  const dirty = attrs.some((v, i) => v !== p.attrs[i]) || pos.join() !== p.positions.join() || prof.pot !== p.pot || prof.foot !== p.foot || prof.weakFoot !== p.weakFoot || prof.skillMoves !== p.skillMoves
    || prof.height !== p.height || prof.morale !== Math.round(p.morale) || prof.fitness !== Math.round(p.fitness) || prof.sharpness !== Math.round(p.sharpness)
    || con.wage !== p.contract.wage || con.until !== p.contract.until || con.release !== (p.contract.releaseClause || 0) || con.role !== p.contract.role || injDirty
  const apply = () => {
    const patch: PlayerPatch = {
      attrs: Object.fromEntries((Object.keys(A) as AttrKey[]).map((k) => [k, attrs[A[k]]])) as PlayerPatch['attrs'],
      positions: pos, pot: Math.max(prof.pot, ovr), foot: prof.foot, weakFoot: prof.weakFoot, skillMoves: prof.skillMoves, height: prof.height,
      morale: prof.morale, fitness: prof.fitness, sharpness: prof.sharpness, injury: injDirty ? inj : undefined,
      contract: p.clubId ? { wage: con.wage, until: con.until, releaseClause: con.release, role: con.role } : undefined,
    }
    haptic('medium')
    let next = 0
    mutate((w) => { next = editPlayer(w, p.id, patch) }, { roster: true })
    notify(`${p.name} updated · ${next} OVR`, 'edit')
    onClose()
  }
  const togglePos = (x: Position) => {
    haptic()
    if (pos.includes(x)) { if (pos.length > 1) setPos(pos.filter((y) => y !== x)) }
    else if (pos.length < 4) setPos([...pos, x])
  }
  return (
    <div className="card ed-card fade-up">
      <div className="ed-head">
        <span className="ed-badge"><Icon name="edit" size={13} strokeWidth={2.3} /> Editing</span>
        <span className="grow" />
        <span className="tiny dim">Overall</span>
        <Ovr v={ovr} size="sm" />
        {ovr !== p.ovr && <span className={`tiny b ${ovr > p.ovr ? 'pos' : 'neg'}`}>{ovr > p.ovr ? '+' : ''}{ovr - p.ovr}</span>}
      </div>
      <div style={{ padding: '0 12px' }}><Seg small items={[{ id: 'attrs' as Tab, label: 'Attributes' }, { id: 'condition' as Tab, label: 'Condition' }, { id: 'profile' as Tab, label: 'Profile' }, ...(p.clubId ? [{ id: 'contract' as Tab, label: 'Contract' }] : []), { id: 'move' as Tab, label: 'Move' }]} value={tab} onChange={setTab} /></div>

      {tab === 'attrs' && (
        <div className="ed-body">
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            {[-5, -1, 1, 5].map((d) => <button key={d} className="chip sm" onClick={() => { haptic(); setAttrs(attrs.map((v, i) => (groups.some((g) => g.attrs.some((k) => A[k] === i)) ? Math.max(1, Math.min(99, v + d)) : v))) }}>{d > 0 ? `+${d}` : d} all</button>)}
            <span className="grow" />
            <button className="chip sm" onClick={() => { haptic(); setAttrs([...p.attrs]) }}>Reset</button>
          </div>
          {groups.map((g) => (
            <div key={g.key} className="ed-group">
              <div className="ed-gh">{g.label}</div>
              {g.attrs.map((k) => <AttrRow key={k} k={k} v={attrs[A[k]]} base={p.attrs[A[k]]} onChange={(v) => setAttrs(attrs.map((x, i) => (i === A[k] ? v : x)))} />)}
            </div>
          ))}
          <div className="tiny dim" style={{ marginTop: 6 }}>Overall is worked out from the attributes at the main position, like it is in the game.</div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="ed-body stack" style={{ gap: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Positions <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· first is the main one</span></div>
            <div className="ed-pos">
              {POSITIONS.map((x) => { const i = pos.indexOf(x); return <button key={x} className={`chip sm ${i >= 0 ? 'on' : ''}`} onClick={() => togglePos(x)}>{x}{i >= 0 && <sup>{i + 1}</sup>}</button> })}
            </div>
          </div>
          <div className="ed-line"><span className="small">Potential</span><Stepper value={Math.max(prof.pot, ovr)} min={ovr} max={99} onChange={(v) => setProf({ ...prof, pot: v })} /></div>
          <div className="ed-line"><span className="small">Preferred foot</span><Seg small items={[{ id: 'L' as const, label: 'Left' }, { id: 'R' as const, label: 'Right' }]} value={prof.foot} onChange={(v) => setProf({ ...prof, foot: v })} /></div>
          <div className="ed-line"><span className="small">Weak foot</span><Stepper value={prof.weakFoot} min={1} max={5} onChange={(v) => setProf({ ...prof, weakFoot: v })} fmt={(v) => `${v}★`} /></div>
          <div className="ed-line"><span className="small">Skill moves</span><Stepper value={prof.skillMoves} min={1} max={5} onChange={(v) => setProf({ ...prof, skillMoves: v })} fmt={(v) => `${v}★`} /></div>
          <div className="ed-line"><span className="small">Height</span><Stepper value={prof.height} min={150} max={210} onChange={(v) => setProf({ ...prof, height: v })} fmt={(v) => `${v} cm`} /></div>
        </div>
      )}

      {tab === 'condition' && (
        <div className="ed-body stack" style={{ gap: 12 }}>
          <CondMeter label="Energy" icon="fitness" v={prof.fitness} min={20} onChange={(v) => setProf({ ...prof, fitness: v })}
            word={prof.fitness >= 85 ? 'Fresh' : prof.fitness >= 70 ? 'Fine' : prof.fitness >= 50 ? 'Tired' : 'Exhausted'}
            color={prof.fitness >= 70 ? 'var(--pos)' : prof.fitness >= 45 ? 'var(--warn)' : 'var(--neg)'}
            presets={[[100, 'Fresh'], [75, 'Fine'], [55, 'Tired'], [35, 'Exhausted']]} />
          <CondMeter label="Match sharpness" icon="sharpness" v={prof.sharpness} onChange={(v) => setProf({ ...prof, sharpness: v })}
            word={prof.sharpness >= 80 ? 'Match fit' : prof.sharpness >= 55 ? 'Getting there' : prof.sharpness >= 30 ? 'Short of games' : 'Rusty'}
            color="var(--info)" presets={[[100, 'Sharp'], [65, 'Decent'], [40, 'Lacking'], [15, 'Rusty']]} />
          <CondMeter label="Morale" icon={moraleIcon(prof.morale)} v={prof.morale} unit="" onChange={(v) => setProf({ ...prof, morale: v })}
            word={moraleLevel(prof.morale)} color={moraleColor(prof.morale)}
            presets={[[95, 'Very happy'], [75, 'Happy'], [55, 'Content'], [30, 'Unhappy']]} />
          <InjuryEdit w={w} p={p} inj={inj} onChange={setInj} />
        </div>
      )}

      {tab === 'contract' && p.clubId > 0 && (
        <div className="ed-body stack" style={{ gap: 12 }}>
          <div className="ed-line"><span className="small">Weekly wage</span><Stepper value={con.wage} min={500} max={2_000_000} step={con.wage >= 100_000 ? 10_000 : con.wage >= 10_000 ? 2_500 : 500} onChange={(v) => setCon({ ...con, wage: v })} fmt={(v) => fmtMoney(v, { short: true })} /></div>
          <div className="ed-line"><span className="small">Contract until</span><Stepper value={con.until} min={w.season} max={w.season + 7} onChange={(v) => setCon({ ...con, until: v })} fmt={(v) => `June ${v + 1}`} /></div>
          <div className="ed-line"><span className="small">Release clause</span><Stepper value={con.release} min={0} max={1_000_000_000} step={con.release >= 100_000_000 ? 10_000_000 : 5_000_000} onChange={(v) => setCon({ ...con, release: v })} fmt={(v) => (v ? fmtMoney(v, { short: true }) : 'None')} /></div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Squad role</div>
            <div className="row wrap" style={{ gap: 6 }}>{SQUAD_ROLES.map((r) => <button key={r} className={`chip sm ${con.role === r ? 'on' : ''}`} onClick={() => { haptic(); setCon({ ...con, role: r }) }}>{r}</button>)}</div>
          </div>
        </div>
      )}

      {tab === 'move' && <MoveTab w={w} p={p} onDone={onClose} />}

      {tab !== 'move' && (
        <div className="ed-foot">
          <button className="btn sm" onClick={() => { haptic(); onClose() }}>Cancel</button>
          <button className="btn sm ed-apply grow" disabled={!dirty} onClick={apply}><Icon name="check" size={16} /> Apply changes</button>
        </div>
      )}
    </div>
  )
}

/** A custom transfer to any club, with a fee, a loan or a free move. */
function MoveTab({ w, p, onDone }: { w: World; p: Player; onDone: () => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [q, setQ] = useState('')
  const [to, setTo] = useState<Club>()
  const [kind, setKind] = useState<'transfer' | 'loan' | 'free'>(p.clubId ? 'transfer' : 'free')
  const [fee, setFee] = useState(() => Math.round(p.value / 500_000) * 500_000)
  const clubs = useMemo(() => {
    const t = q.trim().toLowerCase()
    return Object.values(w.clubs).filter((c) => c.leagueId && c.id !== p.clubId && (!t || c.name.toLowerCase().includes(t) || c.short.toLowerCase().includes(t)))
      .sort((a, b) => b.reputation - a.reputation).slice(0, t ? 30 : 12)
  }, [q])
  const go = () => {
    if (!to) return
    haptic('heavy')
    let ok = false
    mutate((w) => { ok = editTransfer(w, p.id, to.id, kind, kind === 'transfer' ? fee : 0) }, { roster: true })
    notify(ok ? `${p.name} → ${to.short}${kind === 'transfer' && fee ? ` · ${fmtMoney(fee, { short: true })}` : kind === 'loan' ? ' on loan' : ''}` : 'Move not possible', ok ? 'edit' : 'err')
    if (ok) onDone()
  }
  return (
    <div className="ed-body stack" style={{ gap: 10 }}>
      <div className="search-box" style={{ height: 40 }}><Icon name="search" size={16} color="var(--t3)" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a club" /></div>
      <div className="ed-clubs">
        {clubs.map((c) => (
          <button key={c.id} className={`ed-club ${to?.id === c.id ? 'on' : ''}`} onClick={() => { haptic(); setTo(c) }}>
            <Badge club={c} size={24} /><span className="small b ellipsis">{c.short}</span>
          </button>
        ))}
      </div>
      {to && (
        <div className="stack fade-up" style={{ gap: 10 }}>
          <Seg small items={[...(p.clubId ? [{ id: 'transfer' as const, label: 'Transfer' }, { id: 'loan' as const, label: 'Loan' }] : []), { id: 'free' as const, label: 'Free' }]} value={kind} onChange={setKind} />
          {kind === 'transfer' && <div className="ed-line"><span className="small">Fee <span className="dim">· value {fmtMoney(p.value, { short: true })}</span></span><Stepper value={fee} min={0} max={500_000_000} step={fee >= 50_000_000 ? 5_000_000 : fee >= 5_000_000 ? 1_000_000 : 250_000} onChange={setFee} fmt={(v) => fmtMoney(v, { short: true })} /></div>}
          <button className="btn ed-apply block" onClick={go}><Badge club={to} size={20} /> Move to {to.short}</button>
          <div className="tiny dim">The deal goes through like a real one: fee and budgets, a new contract, squad numbers, team sheets and the news.</div>
        </div>
      )}
    </div>
  )
}

/** Club money, editable (Office / club page in Edit Mode). */
export function ClubMoneyEditor({ club, onClose }: { club: Club; onClose: () => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [t, setT] = useState(club.finance.transferBudget)
  const [wg, setWg] = useState(club.finance.wageBudget)
  const [b, setB] = useState(club.finance.balance)
  const user = useGame((s) => s.world?.userClubId) === club.id
  const step = (v: number) => (Math.abs(v) >= 100_000_000 ? 10_000_000 : Math.abs(v) >= 10_000_000 ? 1_000_000 : 250_000)
  return (
    <div className="card ed-card fade-up">
      <div className="ed-head"><span className="ed-badge"><Icon name="edit" size={13} strokeWidth={2.3} /> Editing</span><span className="grow" /><span className="small b">{club.short} finances</span></div>
      <div className="ed-body stack" style={{ gap: 12 }}>
        <div className="ed-line"><span className="small">Transfer budget</span><Stepper value={t} min={0} max={2_000_000_000} step={step(t)} onChange={setT} fmt={(v) => fmtMoney(v, { short: true })} /></div>
        {/* the manager's club has no wage budget (wages are judged against income); an AI club recruits within one */}
        {!user && <div className="ed-line"><span className="small">Wage budget / wk</span><Stepper value={wg} min={0} max={20_000_000} step={wg >= 1_000_000 ? 50_000 : 10_000} onChange={setWg} fmt={(v) => fmtMoney(v, { short: true })} /></div>}
        <div className="ed-line"><span className="small">Bank balance</span><Stepper value={b} min={-1_000_000_000} max={5_000_000_000} step={step(b)} onChange={setB} fmt={(v) => fmtMoney(v, { short: true })} /></div>
      </div>
      <div className="ed-foot">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm ed-apply grow" onClick={() => { haptic('medium'); mutate((w) => editClubMoney(w, club.id, { transferBudget: t, wageBudget: wg, balance: b })); notify(`${club.short} finances updated`, 'edit'); onClose() }}><Icon name="check" size={16} /> Apply</button>
      </div>
    </div>
  )
}

const KIT_SWATCHES = ['#EF0107', '#C8102E', '#DA291C', '#6CABDD', '#034694', '#132257', '#003399', '#FDB913', '#FFD700', '#00A650', '#1B5E20', '#7A263A', '#670E36', '#FFFFFF', '#111111', '#F58220', '#5C2D91', '#00A3E0']

/** Everything about a club in one editor: identity, standing, money, squad strength and shape, transfer behaviour,
 *  and (for your club) the board's objectives. Changes apply together. */
export function ClubEditor({ w, club, onClose }: { w: World; club: Club; onClose: () => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const user = club.id === w.userClubId
  const [tab, setTab] = useState<'identity' | 'standing' | 'money' | 'squad' | 'market' | 'board'>('identity')
  const [p, setP] = useState<ClubPatch>({ name: club.name, short: club.short, stadium: club.stadium, capacity: club.capacity, reputation: club.reputation, domestic: club.prestige.domestic, intl: club.prestige.intl, youthRating: club.youthRating, kit: [...club.kit] as [string, string], market: club.market ? { ...club.market } : undefined, formation: w.managers[club.managerId]?.formation })
  const [t, setT] = useState(club.finance.transferBudget)
  const [wg, setWg] = useState(club.finance.wageBudget)
  const [b, setB] = useState(club.finance.balance)
  const [shift, setShift] = useState(0)
  const [objs, setObjs] = useState(() => w.board.objectives.filter((o) => o.season === w.season).map((o) => o.id))
  const [regen, setRegen] = useState(false)
  const up = (x: Partial<ClubPatch>) => setP((q) => ({ ...q, ...x }))
  const step = (v: number) => (Math.abs(v) >= 100_000_000 ? 10_000_000 : Math.abs(v) >= 10_000_000 ? 1_000_000 : 250_000)
  const tabs = [{ id: 'identity' as const, label: 'Club' }, { id: 'standing' as const, label: 'Standing' }, { id: 'money' as const, label: 'Money' }, { id: 'squad' as const, label: 'Squad' }, ...(user ? [{ id: 'board' as const, label: 'Board' }] : [{ id: 'market' as const, label: 'Market' }])]
  const forms = FORMATIONS.filter((f) => ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', '5-3-2', '4-1-2-1-2', '4-5-1', '4-1-4-1', '5-4-1'].some((c) => f.name.startsWith(c))).slice(0, 12)
  const apply = () => {
    haptic('medium')
    mutate((w) => {
      editClub(w, club.id, p)
      editClubMoney(w, club.id, { transferBudget: t, wageBudget: wg, balance: b })
      if (shift) editSquadStrength(w, club.id, shift)
      if (user) {
        if (regen) generateObjectives(w, worldRng(w))
        else w.board.objectives = w.board.objectives.filter((o) => o.season !== w.season || objs.includes(o.id))
      }
    })
    notify(`${p.short || club.short} updated`, 'edit')
    onClose()
  }
  const cur = w.board.objectives.filter((o) => o.season === w.season)
  const top16 = useMemo(() => { const t = Object.values(w.players).filter((x) => x.clubId === club.id).map((x) => x.ovr).sort((a, b) => b - a).slice(0, 16); return t.length ? t.reduce((a, b) => a + b, 0) / t.length : club.squadAvg }, [club.id])
  return (
    <div className="card ed-card fade-up">
      <div className="ed-head"><span className="ed-badge"><Icon name="edit" size={13} strokeWidth={2.3} /> Editing</span><span className="grow" /><Badge club={{ ...club, kit: p.kit || club.kit }} size={18} /><span className="small b">{club.short}</span></div>
      <div className="ed-tabs"><Seg small items={tabs} value={tab} onChange={(v) => { haptic(); setTab(v) }} /></div>
      <div className="ed-body stack fade-up" key={tab} style={{ gap: 12 }}>
        {tab === 'identity' && (
          <>
            <label className="ed-field"><span className="tiny dim">Name</span><input className="input" value={p.name} maxLength={40} onChange={(e) => up({ name: e.target.value })} /></label>
            <label className="ed-field"><span className="tiny dim">Short name</span><input className="input" value={p.short} maxLength={18} onChange={(e) => up({ short: e.target.value })} /></label>
            <label className="ed-field"><span className="tiny dim">Stadium</span><input className="input" value={p.stadium} maxLength={48} onChange={(e) => up({ stadium: e.target.value })} /></label>
            <div className="ed-line"><span className="small">Capacity</span><Stepper value={p.capacity!} min={1000} max={130000} step={p.capacity! >= 20000 ? 1000 : 500} label="Stadium capacity" onChange={(v) => up({ capacity: v })} fmt={(v) => v.toLocaleString('en-GB')} /></div>
            {(['Home colour', 'Second colour'] as const).map((lab, i) => (
              <div key={lab}>
                <div className="tiny dim" style={{ margin: '0 2px 6px' }}>{lab}</div>
                <div className="ed-swatches">
                  {KIT_SWATCHES.map((c) => <button key={c} className={`ed-sw ${p.kit![i].toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => { haptic(); const k = [...p.kit!] as [string, string]; k[i] = c; up({ kit: k }) }} aria-label={c} />)}
                  <label className="ed-sw custom" style={{ background: p.kit![i] }}><input type="color" value={p.kit![i]} onChange={(e) => { const k = [...p.kit!] as [string, string]; k[i] = e.target.value; up({ kit: k }) }} /><Icon name="plus" size={12} /></label>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'standing' && (
          <>
            <div className="ed-line"><span className="small">Reputation</span><Stepper value={p.reputation!} min={1} max={100} label="Reputation" onChange={(v) => up({ reputation: v })} /></div>
            <div className="tiny dim" style={{ marginTop: -6 }}>How big the club is seen to be: who wants to join, who answers the phone, board expectations.</div>
            <div className="ed-line"><span className="small">Domestic prestige</span><Stepper value={p.domestic!} min={1} max={10} label="Domestic prestige" onChange={(v) => up({ domestic: v })} fmt={(v) => `${v}/10`} /></div>
            <div className="ed-line"><span className="small">International prestige</span><Stepper value={p.intl!} min={1} max={10} label="International prestige" onChange={(v) => up({ intl: v })} fmt={(v) => `${v}/10`} /></div>
            <div className="ed-line"><span className="small">Academy quality</span><Stepper value={p.youthRating!} min={1} max={10} label="Academy quality" onChange={(v) => up({ youthRating: v })} fmt={(v) => `${v}/10`} /></div>
            <div className="tiny dim" style={{ marginTop: -6 }}>The academy's quality sets the talent of future youth intakes.</div>
          </>
        )}
        {tab === 'money' && (
          <>
            <div className="ed-line"><span className="small">Transfer budget</span><Stepper value={t} min={0} max={2_000_000_000} step={step(t)} label="Transfer budget" money onChange={setT} fmt={(v) => fmtMoney(v, { short: true })} /></div>
            {!user && <div className="ed-line"><span className="small">Wage budget / wk</span><Stepper value={wg} min={0} max={20_000_000} step={wg >= 1_000_000 ? 50_000 : 10_000} label="Weekly wage budget" money onChange={setWg} fmt={(v) => fmtMoney(v, { short: true })} /></div>}
            <div className="ed-line"><span className="small">Bank balance</span><Stepper value={b} min={-1_000_000_000} max={5_000_000_000} step={step(b)} label="Bank balance" money onChange={setB} fmt={(v) => fmtMoney(v, { short: true })} /></div>
          </>
        )}
        {tab === 'squad' && (
          <>
            <div className="ed-line"><span className="small">Squad strength</span><Stepper value={shift} min={-15} max={15} label="Shift every player's attributes" onChange={setShift} fmt={(v) => (v > 0 ? `+${v}` : `${v}`)} /></div>
            <div className="ed-preview"><span className="tiny dim">Top-16 average</span><b className="num">{top16.toFixed(1)}</b>{shift !== 0 && <><Icon name="forward" size={12} color="var(--t3)" /><b className="num" style={{ color: shift > 0 ? 'var(--pos)' : 'var(--neg)' }}>≈ {Math.min(99, top16 + shift).toFixed(1)}</b></>}</div>
            <div className="tiny dim" style={{ marginTop: -6 }}>Every player's attributes move together; overall, potential and value are recalculated from them.</div>
            {!user && (
              <>
                <div className="tiny dim" style={{ margin: '4px 2px 0' }}>Preferred shape (the manager's formation)</div>
                <div className="ed-chips">{forms.map((f) => <button key={f.id} className={`chip sm ${p.formation === f.id ? 'on' : ''}`} onClick={() => { haptic(); up({ formation: f.id }) }}>{f.name}</button>)}</div>
              </>
            )}
          </>
        )}
        {tab === 'market' && (
          <>
            <div><div className="tiny dim" style={{ margin: '0 2px 6px' }}>Buying</div><Seg small items={[{ id: '-2', label: 'Never' }, { id: '-1', label: 'Quiet' }, { id: '0', label: 'Normal' }, { id: '1', label: 'Active' }, { id: '2', label: 'Splurge' }]} value={String(p.market?.buy || 0)} onChange={(v) => { haptic(); up({ market: { ...(p.market || {}), buy: (Number(v) || undefined) as -2 | -1 | 1 | 2 | undefined } }) }} /></div>
            <div><div className="tiny dim" style={{ margin: '0 2px 6px' }}>Selling</div><Seg small items={[{ id: '-1', label: 'Reluctant' }, { id: '0', label: 'Normal' }, { id: '1', label: 'Willing' }]} value={String(p.market?.sell || 0)} onChange={(v) => { haptic(); up({ market: { ...(p.market || {}), sell: (Number(v) || undefined) as -1 | 1 | undefined } }) }} /></div>
            <div className="tiny dim">Reluctant sellers ask more and keep their key players; willing sellers take less and let anyone go. Buying sets how often they act in a window.</div>
          </>
        )}
        {tab === 'board' && (
          <>
            {cur.map((o) => (
              <div key={o.id} className={`ed-obj ${objs.includes(o.id) && !regen ? '' : 'off'}`}>
                <span className={`ed-pri p-${o.priority.replace(' ', '')}`}>{o.priority}</span>
                <span className="small grow">{o.text}</span>
                <button className="sc-x" disabled={regen} onClick={() => { haptic(); setObjs(objs.includes(o.id) ? objs.filter((x) => x !== o.id) : [...objs, o.id]) }} aria-label={objs.includes(o.id) ? 'Remove' : 'Keep'}><Icon name={objs.includes(o.id) ? 'close' : 'undo'} size={13} strokeWidth={2.4} /></button>
              </div>
            ))}
            <button className={`chip sm ${regen ? 'on' : ''}`} style={{ alignSelf: 'flex-start' }} onClick={() => { haptic(); setRegen(!regen) }}><Icon name="refresh" size={13} /> {regen ? 'New objectives on apply' : 'Draw up new objectives'}</button>
            <div className="tiny dim">New objectives are set from the club as it stands (after this edit's reputation and squad changes).</div>
          </>
        )}
      </div>
      <div className="ed-foot">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm ed-apply grow" onClick={apply}><Icon name="check" size={16} /> Apply</button>
      </div>
    </div>
  )
}
