// Checkpoints: named snapshots of a career to come back to (before a final, before deadline day, start of a season...).
import { useEffect, useMemo, useState } from 'react'
import { useGame, haptic } from '../../store/game'
import type { World } from '../../domain/types'
import { listCheckpoints, MAX_CHECKPOINTS, storageInfo, type CheckpointMeta } from '../../services/saves'
import { fmtDate, seasonLabel } from '../../domain/dates'
import { Icon } from '../icons/Icon'
import { Confirm, Sheet } from './layout'
import { currentWindow } from '../../engine/competitions/calendar'
import { nextFixture } from '../selectors'
import { ordinal } from '../screens/Menu'

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 14 ? `${d} day${d > 1 ? 's' : ''} ago` : new Date(t).toLocaleDateString()
}
const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`)

/** Names that fit the moment: the next big match, the window, the start of a season. */
function suggestions(w: World): string[] {
  const out: string[] = []
  const f = nextFixture(w, w.userClubId)
  const win = currentWindow(w)
  if (f) {
    const comp = w.competitions[f.compId]
    const opp = w.clubs[f.home === w.userClubId ? f.away : f.home]
    if (f.roundName === 'Final' || /semi/i.test(f.roundName)) out.push(`Before the ${comp?.short} ${f.roundName.toLowerCase()}`)
    else if (f.derby) out.push(`Before the ${f.derby}`)
    else if (opp) out.push(`Before ${opp.short} (${comp?.short})`)
  }
  if (win) out.push(`Before the ${win.name.toLowerCase()} deadline`)
  else { const next = w.windows.find((x) => x.open > w.date); if (next) out.push(`Before the ${next.name.toLowerCase()} window`) }
  if (w.date <= `${w.season}-08-20`) out.push(`Start of ${seasonLabel(w.season)}`)
  out.push(fmtDate(w.date, 'long'))
  return [...new Set(out)].slice(0, 4)
}

function CpRow({ cp, onRestore, onDelete, current }: { cp: CheckpointMeta; onRestore: () => void; onDelete: () => void; current?: boolean }) {
  return (
    <div className="cp-row">
      <span className={`cp-ic ${cp.auto ? 'auto' : ''}`}><Icon name={cp.auto === 'update' ? 'download' : cp.auto === 'restore' ? 'undo' : 'flag'} size={16} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small b ellipsis">{cp.name}</div>
        <div className="tiny dim ellipsis">{fmtDate(cp.date, 'long')} · {cp.clubName}{cp.position ? ` · ${ordinal(cp.position)}${cp.leagueName ? ` in ${cp.leagueName}` : ''}` : ''}</div>
        <div className="tiny dim">{ago(cp.created)} · {mb(cp.size)}{cp.auto ? ' · automatic' : ''}</div>
      </div>
      <button className="btn xs" onClick={() => { haptic(); onRestore() }} disabled={current}><Icon name="undo" size={14} /> Restore</button>
      <button className="iconbtn cp-del" onClick={() => { haptic(); onDelete() }} aria-label="Delete checkpoint"><Icon name="trash" size={16} /></button>
    </div>
  )
}

/** In a career: create checkpoints and go back to one. */
export function CheckpointsCard({ w, careerId }: { w: World; careerId: string }) {
  const create = useGame((s) => s.createCheckpoint)
  const restore = useGame((s) => s.restoreCheckpoint)
  const remove = useGame((s) => s.deleteCheckpoint)
  const [list, setList] = useState<CheckpointMeta[]>()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<{ cp: CheckpointMeta; kind: 'restore' | 'delete' }>()
  const [store, setStore] = useState<{ used: number; quota: number; persisted: boolean }>()
  const sugg = useMemo(() => suggestions(w), [w.date])
  const reload = () => listCheckpoints(careerId).then(setList).catch(() => setList([]))
  useEffect(() => { reload(); storageInfo().then(setStore).catch(() => undefined) }, [careerId])
  const full = (list?.filter((c) => !c.auto).length || 0) >= MAX_CHECKPOINTS
  return (
    <div className="card cp-card">
      <div className="card-h">
        <div className="row tight"><Icon name="flag" size={15} color="var(--club2)" /><span className="label">Checkpoints</span></div>
        <span className="tiny dim">{list?.length ?? '–'} / {MAX_CHECKPOINTS}</span>
      </div>
      <div className="tiny dim" style={{ padding: '0 14px 10px' }}>A snapshot you can come back to, kept apart from the autosave. Restoring keeps the state you leave as an automatic checkpoint, so nothing is lost.</div>
      {list && list.length > 0 && <div className="cp-list">{list.map((cp) => <CpRow key={cp.id} cp={cp} onRestore={() => setAsk({ cp, kind: 'restore' })} onDelete={() => setAsk({ cp, kind: 'delete' })} />)}</div>}
      {list && !list.length && <div className="cp-empty tiny dim"><Icon name="flag" size={18} color="var(--t3)" />No checkpoints yet</div>}
      <div style={{ padding: 14 }}>
        <button className="btn club block" disabled={full} onClick={() => { haptic(); setName(sugg[0] || ''); setAdding(true) }}><Icon name="plus" size={16} /> {full ? 'Checkpoint limit reached' : 'Create checkpoint'}</button>
        {store && store.quota > 0 && (
          <div className="cp-store">
            <div className="bar" style={{ height: 4 }}><i style={{ width: `${Math.min(100, (store.used / store.quota) * 100)}%`, background: store.used / store.quota > 0.8 ? 'var(--neg)' : 'var(--club2)' }} /></div>
            <div className="row between tiny dim" style={{ marginTop: 5 }}><span>{mb(store.used)} used on this device</span><span>{store.persisted ? 'Protected from clean-up' : `${mb(store.quota)} available`}</span></div>
          </div>
        )}
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title="New checkpoint">
        <input className="input" style={{ width: '100%' }} value={name} maxLength={40} autoFocus placeholder="Name it" onChange={(e) => setName(e.target.value)} />
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{sugg.map((x) => <button key={x} className={`chip sm ${name === x ? 'on' : ''}`} onClick={() => { haptic(); setName(x) }}>{x}</button>)}</div>
        <div className="tiny dim" style={{ marginTop: 12 }}>{fmtDate(w.date, 'long')} · {w.clubs[w.userClubId]?.name || 'Unemployed'}</div>
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy} onClick={async () => { setBusy(true); haptic('medium'); await create(name); await reload(); setBusy(false); setAdding(false) }}>
          {busy ? <div className="spinner" /> : <><Icon name="flag" size={16} /> Create</>}
        </button>
      </Sheet>
      <Confirm open={ask?.kind === 'restore'} title="Go back to this checkpoint?"
        text={ask ? <>You return to <b>{fmtDate(ask.cp.date, 'long')}</b> (“{ask.cp.name}”). Where you are now is kept as an automatic checkpoint.</> : ''}
        confirm="Restore" onConfirm={() => { const cp = ask!.cp; restore(cp) }} onClose={() => setAsk(undefined)} />
      <Confirm open={ask?.kind === 'delete'} title="Delete checkpoint?" danger confirm="Delete" text={ask ? `“${ask.cp.name}” will be removed from this device.` : ''}
        onConfirm={async () => { await remove(ask!.cp); reload() }} onClose={() => setAsk(undefined)} />
    </div>
  )
}

/** On the load screen: a career's checkpoints, restorable without loading the career first. */
export function CheckpointList({ careerId, onRestored }: { careerId: string; onRestored?: () => void }) {
  const restore = useGame((s) => s.restoreCheckpoint)
  const remove = useGame((s) => s.deleteCheckpoint)
  const [list, setList] = useState<CheckpointMeta[]>()
  const [ask, setAsk] = useState<{ cp: CheckpointMeta; kind: 'restore' | 'delete' }>()
  const reload = () => listCheckpoints(careerId).then(setList).catch(() => setList([]))
  useEffect(() => { reload() }, [careerId])
  if (!list) return <div className="cp-empty tiny dim"><div className="spinner" /></div>
  return (
    <>
      {list.length ? <div className="cp-list">{list.map((cp) => <CpRow key={cp.id} cp={cp} onRestore={() => setAsk({ cp, kind: 'restore' })} onDelete={() => setAsk({ cp, kind: 'delete' })} />)}</div>
        : <div className="cp-empty tiny dim"><Icon name="flag" size={18} color="var(--t3)" />No checkpoints. Create them in the career under Settings.</div>}
      <Confirm open={ask?.kind === 'restore'} title="Go back to this checkpoint?"
        text={ask ? <>The career continues from <b>{fmtDate(ask.cp.date, 'long')}</b> (“{ask.cp.name}”). Its latest progress is kept as an automatic checkpoint.</> : ''}
        confirm="Restore & play" onConfirm={async () => { const ok = await restore(ask!.cp); if (ok) onRestored?.() }} onClose={() => setAsk(undefined)} />
      <Confirm open={ask?.kind === 'delete'} title="Delete checkpoint?" danger confirm="Delete" text={ask ? `“${ask.cp.name}” will be removed from this device.` : ''}
        onConfirm={async () => { await remove(ask!.cp); reload() }} onClose={() => setAsk(undefined)} />
    </>
  )
}
