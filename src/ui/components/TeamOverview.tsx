// The team at a glance, the way an assistant manager would put it to you: the next match and what it asks for, who
// plays (on the same pitch as match day), how the team plays and whether that suits these players, and how much risk
// to take. Every suggestion says why and can be taken with one tap; everything else is one tap away in the other tabs.
import { useMemo, useState } from 'react'
import type { Fixture, Mentality, TeamSheet, World } from '../../domain/types'
import { MENTALITIES } from '../../domain/constants'
import { rosterOf } from '../../engine/world/roster'
import { predictFixture } from '../../engine/match/predict'
import { fmtDate } from '../../domain/dates'
import { haptic, useGame } from '../../store/game'
import { nextFixture, userClub } from '../selectors'
import { PRESET_INFO, presetOf, presetTactics, tendencies } from '../tacticsGuide'
import { ATTITUDE, FOR_STANDING, STYLE_ORDER, attitudeFor, recommendedStyle, standingNote, standingOf, styleFits, teamNotes, type StyleFit } from '../teamAdvice'
import { Icon } from '../icons/Icon'
import { Badge } from './atoms'
import { Sheet } from './layout'
import { TeamLineup, sideFromSheet } from './Lineup'

export type TeamTab = 'overview' | 'lineup' | 'roles' | 'tactics' | 'more'

const Stars = ({ n }: { n: number }) => (
  <span className="to-stars" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
)
const FIT_WORD = ['', 'Poor fit', 'Weak fit', 'Ordinary fit', 'Good fit', 'Great fit']
/** The tendencies worth showing on the overview, with the short names they go by here. */
const TEND_SHOWN: Record<string, string> = { keep: 'Keeping the ball', dir: 'Directness', press: 'Pressing', expo: 'Exposure', energy: 'Energy use' }
/** The assistant's one line on the match, by the attitude it calls for (the reasons are in the Attitude card). */
const VERDICT: Partial<Record<Mentality, string>> = { Attacking: 'You’re the favourites: go for it.', Balanced: 'An even game: stay balanced.', Defensive: 'They’re the stronger side: stay compact and make your chances count.' }

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
  const pred = useMemo(() => (next ? predictFixture(w, next) : undefined), [w, next, sheet])
  const att = useMemo(() => (next && pred ? attitudeFor(w, next, pred) : undefined), [w, next, pred])
  const notes = teamNotes(w, sheet, squad, fits)
  const [open, setOpen] = useState<StyleFit>()
  const assistant: string = w.flags.staff?.assistant || 'Your assistant'
  const initials = assistant.split(' ').map((x) => x[0]).slice(0, 2).join('')
  const urgent = notes.filter((n) => n.tone === 'fix')
  const better = notes.find((n) => n.tone === 'tip')
  const mentality = sheet.tactics.mentality
  const applyStyle = (name: string) => { haptic('medium'); edit((s) => { s.tactics = presetTactics(name, s.tactics) }); useGame.getState().notify(`Now playing ${name}`, 'ok') }
  const setAttitude = (m: Mentality) => { haptic(); edit((s) => { s.tactics = { ...s.tactics, mentality: m } }) }
  // a change of style is worth suggesting only when it is clearly better for this side than the one in use
  const fitOf = (n?: string) => fits.find((x) => x.name === n)
  const adj = (x?: StyleFit) => (x ? x.score + (FOR_STANDING[x.name]?.(standing) || 0) : -9)
  const curFit = fitOf(cur)
  const suggest = rec.name !== cur && (!curFit || (rec.name === 'Balanced' ? curFit.stars <= 2 : adj(rec) - adj(curFit) >= 0.5)) ? rec : undefined
  const comp = next ? w.competitions[next.compId] : undefined
  const side = useMemo(() => sideFromSheet(w, club.id, sheet, comp), [w, club.id, sheet, comp])
  const tend = tendencies(sheet.tactics).filter((x) => TEND_SHOWN[x.id])

  // the next match: who, where, and the odds as they stand with this team
  const home = next ? next.home === club.id : true
  const opp = next ? w.clubs[home ? next.away : next.home] : undefined
  const mine = pred ? (home ? pred.home : pred.away) : undefined, theirs = pred ? (home ? pred.away : pred.home) : undefined
  const pW = pred ? (home ? pred.pHome : pred.pAway) : 0, pL = pred ? (home ? pred.pAway : pred.pHome) : 0, pD = pred ? pred.pDraw : 0
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const verdict = urgent.length ? urgent[0].text
    : better ? 'You can put out a stronger team than this one.'
    : `The team is ready${opp ? ` for ${opp.short}` : ''}.${att && VERDICT[att.suggest] ? ` ${VERDICT[att.suggest]}` : ''}`

  return (
    <div className="pad stack to" style={{ marginTop: 12 }}>
      {/* the next match, and what the assistant makes of it */}
      <div className={`card to-hero ${urgent.length ? 'urgent' : ''}`}>
        {next && opp && (
          <>
            <div className="to-hero-k tiny">{comp?.short || comp?.name}{next.roundName ? ` · ${next.roundName}` : ''} · {fmtDate(next.date, 'short')} · {next.neutral ? 'Neutral' : home ? 'Home' : 'Away'}</div>
            <div className="to-vs">
              <div className="to-vs-side"><Badge club={club} size={44} /><b className="ellipsis">{club.short}</b>{mine && <span className="to-xi-r">XI <b>{mine.xi.toFixed(1)}</b></span>}</div>
              <div className="to-vs-mid"><span className="display">VS</span></div>
              <div className="to-vs-side"><Badge club={opp} size={44} /><b className="ellipsis">{opp.short}</b>{theirs && <span className="to-xi-r">XI <b>{theirs.xi.toFixed(1)}</b></span>}</div>
            </div>
            {pred && (
              <div className="to-odds" aria-label={`Win ${pct(pW)}, draw ${pct(pD)}, lose ${pct(pL)}`}>
                <div className="to-odds-bar"><i className="w" style={{ flexGrow: pW }} /><i className="d" style={{ flexGrow: pD }} /><i className="l" style={{ flexGrow: pL }} /></div>
                <div className="to-odds-k tiny"><span><b>{pct(pW)}</b> win</span><span><b>{pct(pD)}</b> draw</span><span><b>{pct(pL)}</b> lose</span></div>
              </div>
            )}
          </>
        )}
        <div className="to-say">
          <span className="to-ast-av" aria-hidden>{initials}</span>
          <div className="grow">
            <div className="tiny dim"><b className="t1">{assistant}</b> · Assistant manager</div>
            <div className="to-say-t">{verdict}</div>
            {urgent.length > 1 && <div className="tiny muted">And {urgent.length - 1} more thing{urgent.length > 2 ? 's' : ''} to sort out below.</div>}
            {!urgent.length && better && <div className="tiny muted">{better.text}</div>}
          </div>
        </div>
        {(urgent.length > 0 || better) && <button className="btn primary block" style={{ marginTop: 12 }} onClick={onAuto}><Icon name="refresh" size={16} /> Pick my best team</button>}
      </div>

      {/* who plays: the match-day pitch */}
      <div className="to-pitch">
        <TeamLineup w={w} side={side} aspect={0.86} onTap={() => goTab('lineup')} />
        <button className="btn block sm" onClick={() => goTab('lineup')}><Icon name="swap" size={15} /> Change players</button>
      </div>

      {/* how the team plays */}
      <div className="card to-style-card">
        <div className="to-h"><span className="label">How you play</span><button className="tiny b to-link" onClick={() => goTab('tactics')}>All settings <Icon name="forward" size={12} /></button></div>
        <div className="to-now">
          <div className="grow">
            <div className="to-now-n display">{cur || 'Your own'}</div>
            <div className="small muted">{cur ? PRESET_INFO[cur]?.tag : 'Settings you have set yourself'}</div>
          </div>
          {curFit && <div className="to-now-fit"><Stars n={curFit.stars} /><span className="tiny dim">{FIT_WORD[curFit.stars]}</span></div>}
        </div>
        <div className="to-tend">
          {tend.map((x) => (
            <div key={x.id} className="to-tend-r">
              <span className="tiny">{TEND_SHOWN[x.id]}</span>
              <span className="to-tend-m"><i style={{ width: `${Math.round(6 + x.v * 94)}%` }} /></span>
              <span className="tiny dim to-tend-v">{x.v < 0.34 ? x.low : x.v > 0.66 ? x.high : 'Middle'}</span>
            </div>
          ))}
        </div>
        {suggest ? (
          <div className="to-rec">
            <div className="small"><b>{assistant.split(' ')[0]} suggests {suggest.name}.</b> {suggest.name === 'Balanced' ? `${cur} asks for things this squad doesn’t have: Balanced is a sounder base.` : suggest.why}</div>
            <button className="btn sm club" onClick={() => applyStyle(suggest.name)}><Icon name="check" size={14} /> Play {suggest.name}</button>
          </div>
        ) : curFit ? (
          <div className={`to-rec ${curFit.weak ? 'warn' : curFit.stars >= 3 ? 'ok' : ''}`}>
            <Icon name={curFit.weak ? 'info' : 'check'} size={16} />
            <div className="small">
              {curFit.name === 'Balanced' ? 'A sound base for any squad.' : curFit.why === 'Nothing in this XI stands out for it.' ? (curFit.weak ? '' : 'Nothing in this XI stands out for it, and nothing works against it.') : curFit.why}
              {curFit.weak && <> {curFit.weak}</>}
            </div>
          </div>
        ) : (
          <div className="to-rec"><div className="small"><b>You’re using your own settings.</b> {rec.name === 'Balanced' ? 'Compare them with the ways of playing below.' : `${rec.name} suits this squad best: ${rec.why.charAt(0).toLowerCase()}${rec.why.slice(1)}`}</div></div>
        )}
        <div className="tiny dim to-other-h">Ways to play · stars: how well your players suit it</div>
        <div className="to-chips">
          {STYLE_ORDER.map((n) => fits.find((x) => x.name === n)).filter((x): x is StyleFit => !!x).map((x) => (
            <button key={x.name} className={`to-chip ${cur === x.name ? 'on' : ''} ${suggest?.name === x.name ? 'rec' : ''}`} onClick={() => { haptic(); setOpen(x) }}>
              <b>{x.name}</b>
              <Stars n={x.stars} />
            </button>
          ))}
        </div>
      </div>

      {/* how much risk to take */}
      <div className="card to-sec">
        <div className="to-h"><span className="label">Attitude</span><span className="tiny dim">How much risk to take</span></div>
        <div className="to-risk">
          {MENTALITIES.map((m, i) => (
            <button key={m} className={`to-risk-b m${i} ${mentality === m ? 'on' : ''}`} onClick={() => setAttitude(m)} aria-pressed={mentality === m}>
              {att?.suggest === m && <span className="to-risk-sug">Suggested</span>}
              <i />
              <span>{ATTITUDE[m].label}</span>
            </button>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>{ATTITUDE[mentality].text}</div>
        {att && att.suggest !== mentality && (
          <div className="to-rec" style={{ marginTop: 10, marginBottom: 0 }}>
            <div className="small"><b>{forMatch ? 'For this match' : `Against ${att.opp}`}:</b> {att.why}</div>
            <button className="btn sm club" onClick={() => setAttitude(att.suggest)}>{ATTITUDE[att.suggest].label}</button>
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
