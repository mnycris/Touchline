// Edit Mode, integrated: a pencil on the screens you already use turns them editable. Players (attributes, profile,
// contract, a move to any club), clubs' money, negotiations and upcoming matches (see ScriptEditor).
import { useMemo, useState, type ReactNode } from 'react'
import type { AttrKey, Club, Player, Position, SquadRole, World } from '../../domain/types'
import { A } from '../../domain/types'
import { ATTR_GROUPS, ATTR_LABEL, GK_GROUPS, POSITIONS, SQUAD_ROLES } from '../../domain/constants'
import { computeOvr } from '../../domain/ratings'
import { fmtMoney } from '../../domain/finance'
import { useGame, haptic } from '../../store/game'
import { editClubMoney, editPlayer, editTransfer, type PlayerPatch } from '../../engine/world/edit'
import { Icon } from '../icons/Icon'
import { Badge, Ovr } from './atoms'
import { Seg } from './layout'

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

/** A compact −/+ stepper with the value in the middle. */
export function Stepper({ value, onChange, min, max, step = 1, fmt }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => ReactNode }) {
  const set = (v: number) => { const x = Math.max(min, Math.min(max, v)); if (x !== value) { haptic(); onChange(x) } }
  return (
    <span className="ed-step">
      <button onClick={() => set(value - step)} disabled={value <= min} aria-label="Less"><Icon name="minus" size={14} strokeWidth={2.6} /></button>
      <b className="num">{fmt ? fmt(value) : value}</b>
      <button onClick={() => set(value + step)} disabled={value >= max} aria-label="More"><Icon name="plus" size={14} strokeWidth={2.6} /></button>
    </span>
  )
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

type Tab = 'attrs' | 'profile' | 'contract' | 'move'

/** The player page, editable. Overall is never typed in: it follows the attributes and the main position. */
export function PlayerEditor({ w, p, onClose }: { w: World; p: Player; onClose: () => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [tab, setTab] = useState<Tab>('attrs')
  const [attrs, setAttrs] = useState<number[]>(() => [...p.attrs])
  const [pos, setPos] = useState<Position[]>(() => [...p.positions])
  const [prof, setProf] = useState(() => ({ pot: p.pot, foot: p.foot as 'L' | 'R', weakFoot: p.weakFoot, skillMoves: p.skillMoves, height: p.height, morale: Math.round(p.morale), fitness: Math.round(p.fitness), sharpness: Math.round(p.sharpness) }))
  const [con, setCon] = useState(() => ({ wage: p.contract.wage, until: p.contract.until, release: p.contract.releaseClause || 0, role: p.contract.role as SquadRole }))
  const draft = useMemo(() => ({ ...p, attrs, positions: pos }) as Player, [attrs, pos])
  const ovr = computeOvr(draft)
  const gk = pos[0] === 'GK'
  const groups = gk ? [...GK_GROUPS, ...ATTR_GROUPS] : ATTR_GROUPS
  const dirty = attrs.some((v, i) => v !== p.attrs[i]) || pos.join() !== p.positions.join() || prof.pot !== p.pot || prof.foot !== p.foot || prof.weakFoot !== p.weakFoot || prof.skillMoves !== p.skillMoves
    || prof.height !== p.height || prof.morale !== Math.round(p.morale) || prof.fitness !== Math.round(p.fitness) || prof.sharpness !== Math.round(p.sharpness)
    || con.wage !== p.contract.wage || con.until !== p.contract.until || con.release !== (p.contract.releaseClause || 0) || con.role !== p.contract.role
  const apply = () => {
    const patch: PlayerPatch = {
      attrs: Object.fromEntries((Object.keys(A) as AttrKey[]).map((k) => [k, attrs[A[k]]])) as PlayerPatch['attrs'],
      positions: pos, pot: Math.max(prof.pot, ovr), foot: prof.foot, weakFoot: prof.weakFoot, skillMoves: prof.skillMoves, height: prof.height,
      morale: prof.morale, fitness: prof.fitness, sharpness: prof.sharpness,
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
      <div style={{ padding: '0 12px' }}><Seg small items={[{ id: 'attrs' as Tab, label: 'Attributes' }, { id: 'profile' as Tab, label: 'Profile' }, ...(p.clubId ? [{ id: 'contract' as Tab, label: 'Contract' }] : []), { id: 'move' as Tab, label: 'Move' }]} value={tab} onChange={setTab} /></div>

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
          <div className="ed-line"><span className="small">Morale</span><Stepper value={prof.morale} min={0} max={100} step={5} onChange={(v) => setProf({ ...prof, morale: v })} /></div>
          <div className="ed-line"><span className="small">Energy</span><Stepper value={prof.fitness} min={20} max={100} step={5} onChange={(v) => setProf({ ...prof, fitness: v })} fmt={(v) => `${v}%`} /></div>
          <div className="ed-line"><span className="small">Match sharpness</span><Stepper value={prof.sharpness} min={0} max={100} step={5} onChange={(v) => setProf({ ...prof, sharpness: v })} fmt={(v) => `${v}%`} /></div>
          {p.injury && (
            <button className="btn sm" onClick={() => { haptic('medium'); mutate((w) => editPlayer(w, p.id, { healInjury: true }), { roster: true }); notify(`${p.name} is fit again`, 'edit') }}>
              <Icon name="injury" size={15} color="var(--neg)" /> Heal injury ({p.injury.type})
            </button>
          )}
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
  const step = (v: number) => (Math.abs(v) >= 100_000_000 ? 10_000_000 : Math.abs(v) >= 10_000_000 ? 1_000_000 : 250_000)
  return (
    <div className="card ed-card fade-up">
      <div className="ed-head"><span className="ed-badge"><Icon name="edit" size={13} strokeWidth={2.3} /> Editing</span><span className="grow" /><span className="small b">{club.short} finances</span></div>
      <div className="ed-body stack" style={{ gap: 12 }}>
        <div className="ed-line"><span className="small">Transfer budget</span><Stepper value={t} min={0} max={2_000_000_000} step={step(t)} onChange={setT} fmt={(v) => fmtMoney(v, { short: true })} /></div>
        <div className="ed-line"><span className="small">Wage budget / wk</span><Stepper value={wg} min={0} max={20_000_000} step={wg >= 1_000_000 ? 50_000 : 10_000} onChange={setWg} fmt={(v) => fmtMoney(v, { short: true })} /></div>
        <div className="ed-line"><span className="small">Bank balance</span><Stepper value={b} min={-1_000_000_000} max={5_000_000_000} step={step(b)} onChange={setB} fmt={(v) => fmtMoney(v, { short: true })} /></div>
      </div>
      <div className="ed-foot">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm ed-apply grow" onClick={() => { haptic('medium'); mutate((w) => editClubMoney(w, club.id, { transferBudget: t, wageBudget: wg, balance: b })); notify(`${club.short} finances updated`, 'edit'); onClose() }}><Icon name="check" size={16} /> Apply</button>
      </div>
    </div>
  )
}
