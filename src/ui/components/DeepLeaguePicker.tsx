// Followed leagues: up to five leagues (plus your own) whose matches run through the full match engine, so their
// games have line-ups, ratings, events and stats you can open. Everything else uses the fast results model.
import { useState } from 'react'
import { haptic } from '../../store/game'
import { CompLogo, Flag } from './atoms'
import { Icon } from '../icons/Icon'
import { defaultDeepLeagues } from '../../engine/world/matchRunner'

export interface PickLeague { id: number; name: string; country: string; flag: string; prestige: number; level: number }

export function DeepLeaguePicker({ leagues, own, value, onChange }: { leagues: PickLeague[]; own?: number; value?: number[]; onChange: (v: number[]) => void }) {
  const chosen = (value ?? defaultDeepLeagues(own)).filter((id) => id !== own).slice(0, 5)
  const [all, setAll] = useState(false)
  const full = [...leagues].filter((l) => l.level === 1 || l.id === own || chosen.includes(l.id)).sort((a, b) => (b.id === own ? 1 : 0) - (a.id === own ? 1 : 0) || b.prestige - a.prestige || a.name.localeCompare(b.name))
  const list = all ? full : full.filter((l, i) => i < 10 || l.id === own || chosen.includes(l.id))
  const toggle = (id: number) => {
    haptic()
    if (chosen.includes(id)) onChange(chosen.filter((x) => x !== id))
    else if (chosen.length < 5) onChange([...chosen, id])
  }
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="tiny dim">{chosen.length}/5 chosen{own ? ' · your league is always included' : ''}</span>
        <div className="row tight" style={{ gap: 6 }}>
          <button className="chip sm" onClick={() => { haptic(); onChange(defaultDeepLeagues(own)) }}>Top leagues</button>
          <button className="chip sm" onClick={() => { haptic(); onChange([]) }}>Only mine</button>
        </div>
      </div>
      <div className="dlp">
        {list.map((l) => {
          const mine = l.id === own
          const on = mine || chosen.includes(l.id)
          const capped = !on && chosen.length >= 5
          return (
            <button key={l.id} className={`dlp-t ${on ? 'on' : ''} ${mine ? 'mine' : ''} ${capped ? 'full' : ''}`} onClick={() => !mine && toggle(l.id)} disabled={mine}>
              <CompLogo k={`L${l.id}`} size={26} name={l.name} />
              <span className="dlp-n">
                <span className="ellipsis b">{l.name}</span>
                <span className="tiny dim row tight" style={{ gap: 4 }}><Flag code={l.flag} size={10} />{mine ? 'Your league' : l.country}</span>
              </span>
              {on && <span className="dlp-ck"><Icon name="check" size={12} strokeWidth={3} /></span>}
            </button>
          )
        })}
      </div>
      {full.length > list.length || all ? <button className="tiny b" style={{ marginTop: 8, color: 'var(--club2)' }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${full.length} leagues`}</button> : null}
      <div className="tiny dim" style={{ marginTop: 8 }}>Followed leagues are simulated in full: every match has line-ups, ratings, events and stats, and you can watch them live. Other leagues use a faster results model. More leagues means slightly longer days.</div>
    </div>
  )
}
