// The team at a glance, the way an assistant manager would put it to you: what needs sorting before the next match,
// who plays, how the team plays and whether that suits these players, and how to approach the next game. Every
// suggestion says why and can be taken with one tap; everything else is one tap away in the other tabs.
import { useMemo, useState } from 'react'
import type { Fixture, Mentality, TeamSheet, World } from '../../domain/types'
import { MENTALITIES, formationOf } from '../../domain/constants'
import { posRating } from '../../domain/ratings'
import { rosterOf } from '../../engine/world/roster'
import { callName } from '../../engine/match/commentary'
import { haptic, useGame } from '../../store/game'
import { nextFixture, playerStatus, userClub } from '../selectors'
import { PRESET_INFO, presetOf, presetTactics } from '../tacticsGuide'
import { ATTITUDE, FOR_STANDING, STYLE_ORDER, attitudeFor, recommendedStyle, standingNote, standingOf, styleFits, teamNotes, type StyleFit } from '../teamAdvice'
import { Icon } from '../icons/Icon'
import { Face } from './atoms'
import { Sheet } from './layout'

export type TeamTab = 'overview' | 'lineup' | 'roles' | 'tactics' | 'more'

const Stars = ({ n }: { n: number }) => (
  <span className="to-stars" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
)
const FIT_WORD = ['', 'Poor fit', 'Weak fit', 'Ordinary fit', 'Good fit', 'Great fit']

export function TeamOverview({ w, sheet, forMatch, edit, onAuto, goTab }: {
  w: World; sheet: TeamSheet; forMatch?: Fixture; edit: (fn: (s: TeamSheet) => void) => void; onAuto: () => void; goTab: (t: TeamTab) => void
}) {
  const club = userClub(w)
  const squad = rosterOf(w, club.id)
  const fits = useMemo(() => styleFits(w, sheet), [w, sheet])
  const standing = standingOf(w, club.id)
  const rec = recommendedStyle(fits, standing).fit
  const cur = presetOf(sheet.tactics)
  const next = forMatch || nextFixture(w, club.id)
  const att = useMemo(() => (next ? attitudeFor(w, next) : undefined), [w, next])
  const notes = teamNotes(w, sheet, squad, fits)
  const [open, setOpen] = useState<StyleFit>()
  const f = formationOf(sheet.formation)
  const assistant: string = w.flags.staff?.assistant || 'Your assistant'
  const initials = assistant.split(' ').map((x) => x[0]).slice(0, 2).join('')
  const urgent = notes.filter((n) => n.tone === 'fix')
  const better = notes.find((n) => n.tone === 'tip')
  const mentality = sheet.tactics.mentality
  const applyStyle = (name: string) => { haptic('medium'); edit((s) => { s.tactics = presetTactics(name, s.tactics) }); useGame.getState().notify(`Now playing ${name}`, 'ok') }
  const setAttitude = (m: Mentality) => { haptic(); edit((s) => { s.tactics = { ...s.tactics, mentality: m } }) }
  // the XI in its lines, attack at the top: slots at about the same depth make a line, left to right
  const lines: number[][] = []
  for (const i of f.slots.map((_, i) => i).sort((a, b) => f.slots[b].y - f.slots[a].y)) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(f.slots[line[0]].y - f.slots[i].y) < 7) line.push(i); else lines.push([i])
  }
  lines.forEach((l) => l.sort((a, b) => f.slots[a].x - f.slots[b].x))
  // a change of style is worth suggesting only when it is clearly better for this side than the one in use
  const fitOf = (n?: string) => fits.find((x) => x.name === n)
  const adj = (x?: StyleFit) => (x ? x.score + (FOR_STANDING[x.name]?.(standing) || 0) : -9)
  const curFit = fitOf(cur)
  const suggest = rec.name !== cur && (!curFit || (rec.name === 'Balanced' ? curFit.stars <= 2 : adj(rec) - adj(curFit) >= 0.5)) ? rec : undefined
  const rated = sheet.lineup.map((id, i) => { const p = w.players[id]; return p ? posRating(p, f.slots[i].pos) : 0 }).filter(Boolean)
  const xiRating = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : '—'

  return (
    <div className="pad stack to" style={{ marginTop: 12 }}>
      {/* the assistant: what to do now */}
      <div className={`card to-ast ${urgent.length ? 'urgent' : better ? 'tip' : 'ready'}`}>
        <div className="to-ast-who">
          <span className="to-ast-av">{initials}</span>
          <span className="tiny dim"><b className="t1">{assistant}</b> · Assistant manager</span>
        </div>
        <div className="to-ast-say">
          {urgent.length ? urgent[0].text
            : better ? 'You can put out a stronger team than this one.'
            : `The team is ready${next ? ` for ${att?.opp}` : ''}.`}
        </div>
        <div className="small muted">
          {urgent.length ? (urgent.length > 1 ? `And ${urgent.length - 1} more thing${urgent.length > 2 ? 's' : ''} to sort out below. I can pick the best team available for you.` : 'I can pick the best team available for you.')
            : better ? better.text
            : `${f.name} · ${cur ? `playing ${cur}` : 'your own tactics'} · ${ATTITUDE[mentality].label.toLowerCase()}. Change anything below, or just play.`}
        </div>
        {(urgent.length > 0 || better) && <button className="btn primary block" style={{ marginTop: 12 }} onClick={onAuto}><Icon name="refresh" size={16} /> Pick my best team</button>}
      </div>

      {/* who plays */}
      <div className="card to-sec">
        <div className="to-h"><span className="label">Your team</span><span className="tiny dim">{f.name} · rated <b className="t1">{xiRating}</b></span></div>
        <button className="to-xi" onClick={() => goTab('lineup')} aria-label="Change the line-up">
          {lines.map((line, k) => (
            <span key={k} className="to-xi-line">
              {line.map((i) => {
                const p = w.players[sheet.lineup[i]]
                const st = p ? playerStatus(w, p) : undefined
                return p
                  ? <span key={i} className="to-pl"><span className="to-pl-f"><Face p={p} size={34} radius={17} club={club} ring={st && st.key !== 'ok' ? st.color : p.fitness < 72 ? 'var(--warn)' : undefined} />{st && st.key !== 'ok' && <span className="face-badge" style={{ background: st.color }}><Icon name={st.icon} size={9} color="#fff" /></span>}</span><span className="to-pl-n">{callName(p.name)}</span></span>
                  : <span key={i} className="to-pl"><span className="to-pl-empty"><Icon name="plus" size={14} /></span><span className="to-pl-n warn">{f.slots[i].label}</span></span>
              })}
            </span>
          ))}
        </button>
        <button className="btn block sm" onClick={() => goTab('lineup')}><Icon name="swap" size={15} /> Change players</button>
      </div>

      {/* how the team plays */}
      <div className="card to-sec">
        <div className="to-h"><span className="label">How you play</span><span className="tiny dim">{cur ? `Now: ${cur}` : 'Now: your own settings'}</span></div>
        {suggest ? (
          <div className="to-rec">
            <div className="small"><b>{assistant.split(' ')[0]} suggests {suggest.name}.</b> {suggest.name === 'Balanced' ? `${cur} asks for things this squad doesn’t have: Balanced is a sounder base.` : suggest.why}</div>
            <button className="btn sm club" onClick={() => applyStyle(suggest.name)}><Icon name="check" size={14} /> Play {suggest.name}</button>
          </div>
        ) : curFit ? (
          <div className={`to-rec ${curFit.weak ? 'warn' : curFit.stars >= 3 ? 'ok' : ''}`}>
            <Icon name={curFit.weak ? 'info' : 'check'} size={16} />
            <div className="small">
              <b>{curFit.name}: {FIT_WORD[curFit.stars].toLowerCase()} for your players.</b>{' '}
              {curFit.name === 'Balanced' ? 'A sound base for any squad.' : curFit.why === 'Nothing in this XI stands out for it.' ? (curFit.weak ? '' : 'Nothing in this XI stands out for it, and nothing works against it.') : curFit.why}
              {curFit.weak && <> {curFit.weak}</>}
            </div>
          </div>
        ) : (
          <div className="to-rec"><div className="small"><b>You’re using your own settings.</b> {rec.name === 'Balanced' ? 'Compare them with the ways of playing below.' : `${rec.name} suits this squad best: ${rec.why.charAt(0).toLowerCase()}${rec.why.slice(1)}`}</div></div>
        )}
        <div className="to-styles">
          {STYLE_ORDER.map((n) => fits.find((x) => x.name === n)).filter((x): x is StyleFit => !!x).map((x) => (
            <button key={x.name} className={`to-style ${cur === x.name ? 'on' : ''}`} onClick={() => { haptic(); setOpen(x) }}>
              <span className="to-style-t"><b>{x.name}</b><span className="tiny dim">{PRESET_INFO[x.name]?.tag}</span></span>
              <span className="to-style-f">{cur === x.name ? <span className="to-inuse">In use</span> : null}<Stars n={x.stars} /></span>
            </button>
          ))}
        </div>
        <div className="tiny dim">Stars: how well your players suit it, compared with other squads.</div>
      </div>

      {/* how to approach the next match */}
      <div className="card to-sec">
        <div className="to-h"><span className="label">Attitude</span><span className="tiny dim">How much risk to take</span></div>
        <div className="to-att">
          {MENTALITIES.map((m) => (
            <button key={m} className={`to-att-b ${mentality === m ? 'on' : ''} m${MENTALITIES.indexOf(m)}`} onClick={() => setAttitude(m)}>{ATTITUDE[m].label}</button>
          ))}
        </div>
        <div className="small muted">{ATTITUDE[mentality].text}</div>
        {att && (
          <div className={`to-rec ${att.suggest === mentality ? 'ok' : ''}`} style={{ marginTop: 10 }}>
            {att.suggest === mentality && <Icon name="check" size={16} />}
            <div className="small"><b>{forMatch ? 'For this match' : `Next: ${att.opp}`}.</b> {att.why}</div>
            {att.suggest !== mentality && <button className="btn sm club" onClick={() => setAttitude(att.suggest)}>{ATTITUDE[att.suggest].label}</button>}
          </div>
        )}
      </div>

      {/* what else the assistant noticed */}
      {notes.filter((n) => n !== urgent[0] && n !== better).length > 0 && (
        <div className="card to-sec">
          <div className="to-h"><span className="label">Worth a look</span></div>
          {notes.filter((n) => n !== urgent[0] && n !== better).map((n, i) => (
            <div key={i} className={`to-note ${n.tone}`}>
              <Icon name={n.tone === 'fix' ? 'warning' : n.tone === 'warn' ? 'info' : 'star'} size={16} />
              <div className="small grow">{n.text}</div>
              {n.fix && <button className="btn xs" onClick={() => { haptic(); edit(n.fix!.run) }}>{n.fix.label}</button>}
            </div>
          ))}
        </div>
      )}

      {/* the rest, for when you want it */}
      <div className="card list to-more">
        <button className="li tap" onClick={() => goTab('roles')}><Icon name="tactics" size={18} color="var(--t2)" /><div className="meta"><div className="t small">Positions and roles</div><div className="s">What each player does in their position</div></div><Icon name="forward" size={16} color="var(--t3)" /></button>
        <button className="li tap" onClick={() => goTab('tactics')}><Icon name="settings" size={18} color="var(--t2)" /><div className="meta"><div className="t small">All tactical settings</div><div className="s">Pressing, line height, width, tempo and more</div></div><Icon name="forward" size={16} color="var(--t3)" /></button>
        <button className="li tap" onClick={() => goTab('more')}><Icon name="corner" size={18} color="var(--t2)" /><div className="meta"><div className="t small">Set pieces and saved teams</div><div className="s">Captain, penalty and corner takers; other line-ups</div></div><Icon name="forward" size={16} color="var(--t3)" /></button>
        <button className="li tap" onClick={() => { haptic(); useGame.getState().open({ name: 'practice', params: forMatch ? { fixtureId: forMatch.id } : undefined }) }}><Icon name="cone" size={18} color="var(--t2)" /><div className="meta"><div className="t small">Tactics Lab</div><div className="s">Try a change in a practice match first: nothing counts</div></div><Icon name="forward" size={16} color="var(--t3)" /></button>
      </div>

      <Sheet open={!!open} onClose={() => setOpen(undefined)} title={open?.name}>
        {open && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 10 }}><Stars n={open.stars} /><span className="small b">{FIT_WORD[open.stars]} for your players</span></div>
            <div className="small">{PRESET_INFO[open.name]?.identity}</div>
            {open.name !== 'Balanced' && <div className="to-why"><Icon name="check" size={15} /><span className="small">{open.why}</span></div>}
            {open.weak && <div className="to-why warn"><Icon name="info" size={15} /><span className="small">{open.weak}</span></div>}
            {standingNote(open.name, standing) && <div className="to-why warn"><Icon name="info" size={15} /><span className="small">{standingNote(open.name, standing)}</span></div>}
            <div className="tp-two">
              <div><div className="tiny b" style={{ color: 'var(--pos)' }}>It needs</div><div className="tiny muted">{PRESET_INFO[open.name]?.needs}</div></div>
              <div><div className="tiny b" style={{ color: 'var(--warn)' }}>The risk</div><div className="tiny muted">{PRESET_INFO[open.name]?.risk}</div></div>
            </div>
            <button className="btn primary" disabled={cur === open.name} onClick={() => { applyStyle(open.name); setOpen(undefined) }}>
              <Icon name="check" size={16} /> {cur === open.name ? 'In use' : `Play ${open.name}`}
            </button>
            <div className="tiny dim">Your attitude stays as it is. Every setting it changes can be fine-tuned under All tactical settings.</div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
