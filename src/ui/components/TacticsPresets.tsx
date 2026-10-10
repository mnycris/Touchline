// Presets as what they are: a name, the identity behind it, and (on tap) the exact settings it puts in place, so
// choosing one is an informed decision rather than a label.
import { useState } from 'react'
import type { TeamTactics } from '../../domain/types'
import { DEFAULT_TACTICS, VISION_TACTICS } from '../../domain/constants'
import { PRESET_INFO, presetSettings } from '../tacticsGuide'
import { haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Sheet } from './layout'

/** The tactics a preset gives (the manager's mentality is kept). */
export const presetTactics = (name: string, t: TeamTactics): TeamTactics => ({ ...DEFAULT_TACTICS, ...VISION_TACTICS[name], mentality: t.mentality, timeWasting: t.timeWasting })

const KEYS: (keyof TeamTactics)[] = ['buildUp', 'defApproach', 'lineHeight', 'width', 'tempo', 'pressing', 'chanceCreation', 'playersInBox']
/** The preset the current settings are, if any. */
export const presetOf = (t: TeamTactics) => Object.keys(VISION_TACTICS).find((n) => { const p = presetTactics(n, t); return KEYS.every((k) => p[k] === t[k]) })

export function PresetPicker({ t, onApply }: { t: TeamTactics; onApply: (p: TeamTactics) => void }) {
  const [open, setOpen] = useState<string>()
  const cur = presetOf(t)
  const p = open ? presetTactics(open, t) : undefined
  const info = open ? PRESET_INFO[open] : undefined
  return (
    <div className="card pad-card tp">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="label">Presets</div>
        <span className="tiny dim">{cur ? `Now: ${cur}` : 'Custom setup'}</span>
      </div>
      <div className="tp-row">
        {Object.keys(VISION_TACTICS).map((n) => (
          <button key={n} className={`tp-card ${cur === n ? 'on' : ''}`} onClick={() => { haptic(); setOpen(n) }}>
            <b>{n}</b>
            <span>{PRESET_INFO[n]?.tag}</span>
          </button>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(undefined)} title={open}>
        {p && info && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="small">{info.identity}</div>
            <div className="tp-set">
              {presetSettings(p).map((s) => (
                <div key={s.key} className={`tp-set-row ${t[s.key] !== p[s.key] ? 'chg' : ''}`}>
                  <span className="tiny dim">{s.label}</span><b className="tiny">{s.value}</b>
                </div>
              ))}
            </div>
            <div className="tp-two">
              <div><div className="tiny b" style={{ color: 'var(--pos)' }}>It needs</div><div className="tiny muted">{info.needs}</div></div>
              <div><div className="tiny b" style={{ color: 'var(--warn)' }}>The risk</div><div className="tiny muted">{info.risk}</div></div>
            </div>
            <div className="tiny dim">Your mentality ({t.mentality}) and time wasting stay as they are. Highlighted settings change.</div>
            <button className="btn primary" onClick={() => { haptic('medium'); onApply(p); setOpen(undefined) }} disabled={cur === open}>
              <Icon name="check" size={16} /> {cur === open ? 'In use' : `Use ${open}`}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
