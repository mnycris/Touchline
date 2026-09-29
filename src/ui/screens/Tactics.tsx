import { useRemember } from '../memory'
import { useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Player, TeamSheet, TeamTactics, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Face, Ovr, PosChip } from '../components/atoms'
import { Screen, Seg, Sheet, Slider, Tabs, Toggle } from '../components/layout'
import { TacticsBoard } from '../components/TacticsBoard'
import { Pitch } from '../components/Pitch'
import { DEFAULT_TACTICS, FORMATIONS, formationOf, MENTALITIES, ROLE_GROUP, ROLES, VISION_TACTICS } from '../../domain/constants'
import { posRating, roleFit } from '../../domain/ratings'
import { buildSheet, defaultRoles, isAvailable, setPieceTakers } from '../../engine/match/selection'
import { rosterOf } from '../../engine/world/roster'
import { callName } from '../../engine/match/commentary'
import { assignToFormation } from './Match'
import { playerStatus, userClub } from '../selectors'

type Sel = { kind: 'slot'; i: number } | { kind: 'bench'; id: number } | { kind: 'res'; id: number }

export function Tactics() {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const club = userClub(w)
  const sheet = club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
  const [tab, setTab] = useRemember<'lineup' | 'roles' | 'tactics' | 'setpieces' | 'presets'>('tab', 'lineup')
  const [sel, setSel] = useState<Sel>()
  const [formOpen, setFormOpen] = useState(false)
  const [roleSlot, setRoleSlot] = useState<number>()
  const f = formationOf(sheet.formation)
  const squad = rosterOf(w, club.id)
  const P = (id: number) => w.players[id]
  const reserves = squad.filter((p) => !sheet.lineup.includes(p.id) && !sheet.bench.includes(p.id)).sort((a, b) => b.ovr - a.ovr)
  const chem = teamStrength(w, sheet)

  const edit = (fn: (s: TeamSheet) => void) => mutate((w) => { const c = w.clubs[w.userClubId]; const s = c.sheets.find((x) => x.id === c.activeSheet) || c.sheets[0]; fn(s) })

  const tap = (t: Sel) => {
    haptic()
    if (!sel) { setSel(t); return }
    if (JSON.stringify(sel) === JSON.stringify(t)) { setSel(undefined); return }
    edit((s) => swap(w, s, sel, t))
    setSel(undefined)
  }

  const autoPick = () => {
    haptic('medium')
    edit((s) => {
      const b = buildSheet(w, club, s.formation, s.tactics)
      s.lineup = b.lineup; s.bench = b.bench; s.roles = b.roles
      Object.assign(s, setPieceTakers(w, b.lineup))
    })
    useGame.getState().notify('Best available XI selected', 'ok')
  }

  const isSel = (t: Sel) => !!sel && JSON.stringify(sel) === JSON.stringify(t)

  return (
    <Screen title="Team Sheet" sub={`${sheet.name} · ${f.name}`} back right={<button className="btn xs club" onClick={autoPick}><Icon name="refresh" size={14} /> Auto</button>}>
      <Tabs sticky items={[{ id: 'lineup', label: 'Line-up' }, { id: 'roles', label: 'Roles' }, { id: 'tactics', label: 'Tactics' }, { id: 'setpieces', label: 'Set Pieces' }, { id: 'presets', label: 'Sheets' }]} value={tab} onChange={setTab} />
      {tab === 'lineup' && (
        <div className="pad stack" style={{ marginTop: 12 }}>
          <div className="row between">
            <button className="btn sm" onClick={() => setFormOpen(true)}><Icon name="grid" size={16} /> {f.name}</button>
            <div className="row tight tiny"><span className="dim">ATT</span><b>{chem.att}</b><span className="dim">MID</span><b>{chem.mid}</b><span className="dim">DEF</span><b>{chem.def}</b><Ovr v={chem.ovr} size="sm" /></div>
          </div>
          <Pitch formation={f} render={(i) => {
            const p = P(sheet.lineup[i])
            const slot = f.slots[i]
            const st = p ? playerStatus(w, p) : undefined
            const r = p ? posRating(p, slot.pos) : 0
            return (
              <button className={`slot-btn ${isSel({ kind: 'slot', i }) ? 'sel' : ''}`} onClick={() => tap({ kind: 'slot', i })}>
                {p ? <div style={{ position: 'relative' }}><Face p={p} size={42} radius={21} club={club} ring={isSel({ kind: 'slot', i }) ? 'var(--acc)' : r < p.ovr - 5 ? 'var(--warn)' : undefined} />{st && st.key !== 'ok' && <span className="face-badge" style={{ background: st.color }}><Icon name={st.icon} size={9} color="#fff" /></span>}{sheet.captain === p.id && <span className="cap-badge">C</span>}</div> : <div className="empty-slot"><Icon name="plus" size={18} /></div>}
                <div className="slot-name">{p ? callName(p.name) : slot.label}</div>
                <div className="slot-sub"><span style={{ color: r >= (p?.ovr || 0) - 1 ? 'var(--pos)' : r >= (p?.ovr || 0) - 6 ? 'var(--warn)' : 'var(--neg)' }}>{p ? r : ''}</span> {slot.label}</div>
              </button>
            )
          }} />
          {sel && <div className="tiny" style={{ textAlign: 'center', color: 'var(--acc)' }}>Tap another player or slot to swap</div>}
          <div className="label">Substitutes ({sheet.bench.length}/9)</div>
          <div className="card list">
            {sheet.bench.map((id) => <BenchRow key={id} w={w} p={P(id)} on={isSel({ kind: 'bench', id })} onClick={() => tap({ kind: 'bench', id })} />)}
            {sheet.bench.length < 9 && (
              <button className={`li tap ${isSel({ kind: 'bench', id: 0 }) ? 'sel-row' : ''}`} style={{ width: '100%', minHeight: 48 }} onClick={() => tap({ kind: 'bench', id: 0 })}>
                <div className="empty-slot" style={{ width: 36, height: 36 }}><Icon name="plus" size={16} /></div>
                <div className="meta"><div className="t small muted">Empty substitute slot</div><div className="s">Tap, then pick a reserve</div></div>
              </button>
            )}
          </div>
          <div className="label">Reserves ({reserves.length})</div>
          <div className="card list">
            {reserves.map((p) => <BenchRow key={p.id} w={w} p={p} on={isSel({ kind: 'res', id: p.id })} onClick={() => tap({ kind: 'res', id: p.id })} />)}
          </div>
        </div>
      )}
      {tab === 'roles' && (
        <div className="pad" style={{ marginTop: 12 }}>
          <div className="card list">
            {f.slots.map((s, i) => {
              const p = P(sheet.lineup[i])
              const role = sheet.roles[i]
              const fit = p && role ? roleFit(p, s.pos, role.role) : undefined
              return (
                <button key={i} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setRoleSlot(i)}>
                  <PosChip pos={s.pos} />
                  {p && <Face p={p} size={36} radius={9} club={club} />}
                  <div className="meta"><div className="t small ellipsis">{p?.name || '—'}</div><div className="s">{role?.role || 'No role'} · {role?.focus}{fit?.mark && <span className={`role-mark m${fit.mark.length}`}>{fit.mark}</span>}</div></div>
                  <Icon name="edit" size={16} color="var(--t3)" />
                </button>
              )
            })}
          </div>
        </div>
      )}
      {tab === 'tactics' && <TacticsPanel t={sheet.tactics} onChange={(p) => edit((s) => { s.tactics = { ...s.tactics, ...p } })} />}
      {tab === 'setpieces' && <SetPieces w={w} sheet={sheet} edit={edit} />}
      {tab === 'presets' && <Presets w={w} />}

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title="Formation">
        <div className="formation-grid">
          {FORMATIONS.map((fm) => (
            <button key={fm.id} className={`formation-card ${fm.id === f.id ? 'on' : ''}`} onClick={() => {
              haptic('medium')
              edit((s) => {
                const players = s.lineup.map((id) => w.players[id]).filter(Boolean)
                const ids = assignToFormation(players, fm.id)
                s.formation = fm.id
                s.lineup = ids.length === 11 ? ids : buildSheet(w, club, fm.id, s.tactics).lineup
                s.roles = defaultRoles(w, fm.id, s.lineup)
              })
              setFormOpen(false)
            }}>
              <svg viewBox="0 0 60 70" width="60" height="70">
                <rect x="1" y="1" width="58" height="68" rx="4" fill="rgba(31,122,85,.25)" stroke="rgba(255,255,255,.2)" />
                {fm.slots.map((s, i) => <circle key={i} cx={2 + s.x * 0.56} cy={68 - s.y * 0.72} r="3.2" fill={fm.id === f.id ? 'var(--acc)' : '#dfe6ee'} />)}
              </svg>
              <span className="tiny b">{fm.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={roleSlot !== undefined} onClose={() => setRoleSlot(undefined)} title={roleSlot !== undefined ? `${f.slots[roleSlot].label} role` : ''}>
        {roleSlot !== undefined && <RolePicker w={w} p={P(sheet.lineup[roleSlot])} pos={f.slots[roleSlot].pos} cur={sheet.roles[roleSlot]} onPick={(role, focus) => { edit((s) => { s.roles[roleSlot] = { ...(s.roles[roleSlot] || { instructions: {} }), role, focus } }); setRoleSlot(undefined) }} />}
      </Sheet>
    </Screen>
  )
}

/** Swap two squad members wherever they are (XI slot, bench or reserves). */
export function swapInSheet(w: World, s: TeamSheet, a: number, b: number) {
  const sel = (id: number): Sel => { const i = s.lineup.indexOf(id); if (i >= 0) return { kind: 'slot', i }; if (s.bench.includes(id)) return { kind: 'bench', id }; return { kind: 'res', id } }
  const A = sel(a), B = sel(b)
  if (A.kind === 'res' && B.kind === 'res') return
  swap(w, s, A, B)
}

function swap(w: World, s: TeamSheet, a: Sel, b: Sel) {
  const get = (x: Sel) => (x.kind === 'slot' ? s.lineup[x.i] : x.id)
  const ida = get(a), idb = get(b)
  const set = (x: Sel, id: number) => {
    if (x.kind === 'slot') s.lineup[x.i] = id
    else if (x.kind === 'bench') {
      if (!x.id) { if (id && !s.bench.includes(id) && s.bench.length < 9) s.bench.push(id); return }
      const k = s.bench.indexOf(x.id)
      if (k >= 0) { if (id) s.bench[k] = id; else s.bench.splice(k, 1) }
    }
  }
  if (a.kind === 'res' && b.kind === 'res') return
  if (a.kind === 'res' || b.kind === 'res') {
    const res = a.kind === 'res' ? a : b, other = a.kind === 'res' ? b : a
    const resId = get(res)
    set(other, resId)
  } else if ((a.kind === 'bench' && !a.id) || (b.kind === 'bench' && !b.id)) {
    // moving a starter to an empty bench slot is not allowed (XI must stay full); a bench player tapped twice is a no-op
    return
  } else {
    set(a, idb)
    set(b, ida)
  }
  // keep roles consistent for the slot's new player
  const f = formationOf(s.formation)
  s.roles = s.roles.map((r, i) => {
    const p = w.players[s.lineup[i]]
    if (!p || !r) return r
    const defs = ROLES[ROLE_GROUP[f.slots[i].pos]] || []
    return defs.some((d) => d.name === r.role) ? r : { ...r, role: defs[0]?.name || '', focus: defs[0]?.focuses[0] || 'Balanced' }
  })
  if (!s.lineup.includes(s.captain)) s.captain = setPieceTakers(w, s.lineup).captain
}

function BenchRow({ w, p, on, onClick }: { w: World; p: Player; on: boolean; onClick: () => void }) {
  if (!p) return null
  const st = playerStatus(w, p)
  const avail = isAvailable(w, p)
  return (
    <button className={`li tap ${on ? 'sel-row' : ''}`} style={{ width: '100%', textAlign: 'left', minHeight: 52, opacity: avail ? 1 : 0.6 }} onClick={onClick}>
      <Face p={p} size={36} radius={9} club={w.clubs[p.clubId]} ring={on ? 'var(--acc)' : undefined} />
      <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s" style={{ color: st.key !== 'ok' ? st.color : undefined }}>{st.key !== 'ok' ? st.label : `${Math.round(p.fitness)}% energy · ${p.positions.join('/')}`}</div></div>
      <PosChip pos={p.positions[0]} />
      <Ovr v={p.ovr} size="sm" />
    </button>
  )
}

function RolePicker({ w, p, pos, cur, onPick }: { w: World; p?: Player; pos: any; cur?: { role: string; focus: string }; onPick: (role: string, focus: string) => void }) {
  const defs = ROLES[ROLE_GROUP[pos as keyof typeof ROLE_GROUP]] || []
  const [role, setRole] = useState(cur?.role || defs[0]?.name)
  const def = defs.find((d) => d.name === role) || defs[0]
  const [focus, setFocus] = useState(cur?.focus && def?.focuses.includes(cur.focus) ? cur.focus : def?.focuses[0])
  void w
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="card list">
        {defs.map((d) => {
          const fit = p ? roleFit(p, pos, d.name) : undefined
          return (
            <button key={d.name} className={`li tap ${role === d.name ? 'sel-row' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => { setRole(d.name); setFocus(d.focuses[0]) }}>
              <div className="meta"><div className="t small">{d.name}{fit?.mark && <span className={`role-mark m${fit.mark.length}`}>{fit.mark}</span>}</div><div className="s">{d.desc}</div></div>
              {role === d.name && <Icon name="check" size={18} color="var(--acc)" />}
            </button>
          )
        })}
      </div>
      {def && <div><div className="label" style={{ marginBottom: 6 }}>Focus</div><Seg small items={def.focuses.map((x) => ({ id: x, label: x }))} value={focus} onChange={setFocus} /></div>}
      <button className="btn primary block" onClick={() => onPick(role, focus)}>Apply</button>
    </div>
  )
}

export function TacticsPanel({ t, onChange }: { t: TeamTactics; onChange: (p: Partial<TeamTactics>) => void }) {
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="card pad-card stack" style={{ gap: 12 }}>
        <div className="label">Presets</div>
        <div className="row wrap" style={{ gap: 7 }}>
          {Object.keys(VISION_TACTICS).map((v) => <button key={v} className="chip" onClick={() => { haptic('medium'); onChange({ ...DEFAULT_TACTICS, ...VISION_TACTICS[v], mentality: t.mentality }) }}>{v}</button>)}
        </div>
      </div>
      <TacticsBoard t={t} onChange={onChange} />
      <div className="card pad-card"><Slider label="Players in the box" value={t.playersInBox} min={1} max={10} onChange={(v) => onChange({ playersInBox: v })} fmt={(v) => `${v}`} /><div className="tiny dim">How many arrive in the box for crosses and cut-backs.</div></div>
      <div className="card pad-card stack" style={{ gap: 12 }}>
        <div className="label">Set pieces</div>
        <div><div className="small b" style={{ marginBottom: 6 }}>Corners</div><Seg small items={(['Balanced', 'Near Post', 'Far Post', 'Short'] as const).map((x) => ({ id: x, label: x }))} value={t.corners} onChange={(v) => onChange({ corners: v })} /></div>
        <div><div className="small b" style={{ marginBottom: 6 }}>Free kicks</div><Seg small items={(['Balanced', 'Direct', 'Cross'] as const).map((x) => ({ id: x, label: x }))} value={t.freeKicks} onChange={(v) => onChange({ freeKicks: v })} /></div>
      </div>
    </div>
  )
}

function SetPieces({ w, sheet, edit }: { w: World; sheet: TeamSheet; edit: (fn: (s: TeamSheet) => void) => void }) {
  const [pick, setPick] = useState<keyof TeamSheet>()
  const xi = sheet.lineup.map((id) => w.players[id]).filter(Boolean)
  const rows: [keyof TeamSheet, string, string][] = [['captain', 'Captain', 'captain'], ['viceCaptain', 'Vice-captain', 'captain'], ['penalties', 'Penalties', 'ball'], ['freeKicks', 'Free kicks', 'whistle'], ['cornersL', 'Left corners', 'corner'], ['cornersR', 'Right corners', 'corner']]
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="card list">
        {rows.map(([k, label, icon]) => {
          const p = w.players[sheet[k] as number]
          return (
            <button key={k} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setPick(k)}>
              <Icon name={icon} size={18} color="var(--t2)" />
              <div className="meta"><div className="t small">{label}</div><div className="s">{p?.name || '—'}</div></div>
              {p && <Face p={p} size={34} radius={9} club={w.clubs[p.clubId]} />}
            </button>
          )
        })}
      </div>
      <Sheet open={!!pick} onClose={() => setPick(undefined)} title={rows.find((r) => r[0] === pick)?.[1]}>
        <div className="card list">
          {xi.map((p) => (
            <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { edit((s) => { (s as any)[pick!] = p.id }); setPick(undefined) }}>
              <Face p={p} size={34} radius={9} club={w.clubs[p.clubId]} />
              <div className="meta"><div className="t small">{p.name}</div><div className="s">{pick === 'penalties' ? `Penalties ${p.attrs[24]} · Composure ${p.attrs[25]}` : pick === 'freeKicks' ? `FK accuracy ${p.attrs[7]} · Curve ${p.attrs[6]}` : pick?.startsWith('corner') ? `Crossing ${p.attrs[0]} · Curve ${p.attrs[6]}` : `${p.intlRep}★ reputation · ${p.ovr} OVR`}</div></div>
              {(sheet as any)[pick!] === p.id && <Icon name="check" size={18} color="var(--acc)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function Presets({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const club = userClub(w)
  const [name, setName] = useState('')
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      <div className="card list">
        {club.sheets.map((s) => (
          <div key={s.id} className="li">
            <button className="grow row" style={{ gap: 10, textAlign: 'left' }} onClick={() => { haptic(); mutate((w) => { w.clubs[w.userClubId].activeSheet = s.id }) }}>
              <Icon name={club.activeSheet === s.id ? 'check' : 'list'} size={18} color={club.activeSheet === s.id ? 'var(--acc)' : 'var(--t3)'} />
              <div className="meta"><div className="t small">{s.name}</div><div className="s">{formationOf(s.formation).name} · {s.tactics.mentality}</div></div>
            </button>
            {club.sheets.length > 1 && <button className="btn xs danger" onClick={() => mutate((w) => { const c = w.clubs[w.userClubId]; c.sheets = c.sheets.filter((x) => x.id !== s.id); if (c.activeSheet === s.id) c.activeSheet = c.sheets[0].id })}><Icon name="trash" size={13} /></button>}
          </div>
        ))}
      </div>
      {club.sheets.length < 4 && (
        <div className="card pad-card stack" style={{ gap: 8 }}>
          <div className="label">New team sheet</div>
          <input className="input" placeholder="e.g. Cup XI, Rotation" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          <button className="btn club block" disabled={!name.trim()} onClick={() => {
            mutate((w) => {
              const c = w.clubs[w.userClubId]
              const base = c.sheets.find((x) => x.id === c.activeSheet) || c.sheets[0]
              const id = `sheet${Date.now().toString(36)}`
              c.sheets.push({ ...JSON.parse(JSON.stringify(base)), id, name: name.trim() })
              c.activeSheet = id
            })
            setName('')
          }}>Duplicate current as new sheet</button>
        </div>
      )}
      <div className="tiny dim">The active sheet is used for your next match. Unavailable players are replaced automatically at kick-off.</div>
    </div>
  )
}

export function teamStrength(w: World, s: TeamSheet) {
  const f = formationOf(s.formation)
  let att = 0, mid = 0, def = 0, na = 0, nm = 0, nd = 0, tot = 0, n = 0
  s.lineup.forEach((id, i) => {
    const p = w.players[id]
    if (!p) return
    const r = posRating(p, f.slots[i].pos)
    tot += r; n++
    const pos = f.slots[i].pos
    if (['ST', 'CF', 'LW', 'RW'].includes(pos)) { att += r; na++ }
    else if (['CM', 'CDM', 'CAM', 'LM', 'RM'].includes(pos)) { mid += r; nm++ }
    else { def += r; nd++ }
  })
  return { att: na ? Math.round(att / na) : 0, mid: nm ? Math.round(mid / nm) : 0, def: nd ? Math.round(def / nd) : 0, ovr: n ? Math.round(tot / n) : 0 }
}
