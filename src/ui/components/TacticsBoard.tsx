// Team instructions, presented so you can see what you're changing: a mentality dial, out-of-possession and
// in-possession boards with a live diagram each, and (in a match) quick game plans plus a summary of what the
// change does, taken from how the match engine reads these values.
import type { ReactNode } from 'react'
import type { TeamTactics } from '../../domain/types'
import { MENTALITIES } from '../../domain/constants'
import { haptic } from '../../store/game'
import { Seg, Slider } from './layout'
import { Icon } from '../icons/Icon'
import { HalfMarkings } from './PitchSurface'
import { GuideButton, PlayStyleCard } from './TacticsGuide'

type Change = (p: Partial<TeamTactics>) => void

const MENT_TEXT: Record<string, string> = {
  'Ultra Defensive': 'Men behind the ball. Very few bodies forward; clear it when in doubt.',
  Defensive: 'Solid first. Full-backs hold, attacks are picked carefully.',
  Balanced: 'Measured risk both ways.',
  Attacking: 'More runners beyond the ball and braver passes into the final third.',
  'Ultra Attacking': 'Everyone forward. Chances flow at both ends.',
}
const DEF_PRESET: Record<TeamTactics['defApproach'], { lineHeight: number; pressing: number; text: string }> = {
  Deep: { lineHeight: 30, pressing: 30, text: 'Drop off and protect the box. Little space in behind, but they will have the ball.' },
  Balanced: { lineHeight: 50, pressing: 50, text: 'Press in the middle third, hold a mid block.' },
  High: { lineHeight: 68, pressing: 68, text: 'Squeeze up and win it back in their half. Space behind your line.' },
  Aggressive: { lineHeight: 75, pressing: 85, text: 'Hunt the ball everywhere. More fouls, more ball won high, legs go sooner.' },
}
const BUILD_TEXT: Record<TeamTactics['buildUp'], string> = {
  Balanced: 'Mix it: short when it is on, long when pressed.',
  'Short Passing': 'Play out from the back through the lines. Needs composed defenders.',
  Counter: 'Sit, win it, and break fast into the space they leave.',
  'Long Ball': 'Go early to the front line. Target men and runners matter.',
}
const CHANCE_TEXT: Record<TeamTactics['chanceCreation'], string> = {
  Balanced: 'Take what the game gives.',
  Possession: 'Work the ball until a clear chance appears. Fewer, better shots.',
  'Direct Passing': 'Look for the killer pass early: through balls and switches.',
  'Forward Runs': 'Runners off the ball: overlaps and late box arrivals.',
}

/** Energy cost multiplier the engine applies for pressing and tempo. */
const drain = (t: TeamTactics) => 1 + (t.pressing - 50) / 130 + (t.tempo - 50) / 240

/** Plain-language consequences of moving from `a` to `b`. */
function effects(a: TeamTactics, b: TeamTactics): { text: string; tone: 'pos' | 'neg' | 'neu' }[] {
  const out: { text: string; tone: 'pos' | 'neg' | 'neu' }[] = []
  const mi = (m: string) => MENTALITIES.indexOf(m as (typeof MENTALITIES)[number])
  const dm = mi(b.mentality) - mi(a.mentality)
  if (dm > 0) out.push({ text: 'More bodies in attack: more chances, more exposed on the break', tone: 'neu' })
  if (dm < 0) out.push({ text: 'Fewer men forward: harder to break down, fewer chances', tone: 'neu' })
  const dl = b.lineHeight - a.lineHeight
  if (dl >= 8) out.push({ text: 'Higher line: more offsides and a shorter pitch, but space in behind', tone: 'neu' })
  if (dl <= -8) out.push({ text: 'Deeper line: less space behind, more pressure on your box', tone: 'neu' })
  const dp = b.pressing - a.pressing
  if (dp >= 8) out.push({ text: 'Press harder: win it higher, tire faster', tone: 'neu' })
  if (dp <= -8) out.push({ text: 'Press less: save legs, concede territory', tone: 'neu' })
  const dw = b.width - a.width
  if (dw >= 10) out.push({ text: 'Wider: more crosses and switches, stretched shape', tone: 'neu' })
  if (dw <= -10) out.push({ text: 'Narrower: compact through the middle, fewer wide outlets', tone: 'neu' })
  const dt = b.tempo - a.tempo
  if (dt >= 10) out.push({ text: 'Quicker tempo: more direct attacks, more loose balls', tone: 'neu' })
  if (dt <= -10) out.push({ text: 'Slower tempo: keep the ball, calm the game', tone: 'neu' })
  if (b.offsideTrap !== a.offsideTrap) out.push({ text: b.offsideTrap ? 'Offside trap on: catches runners, punished by timing and pace' : 'Offside trap off', tone: 'neu' })
  if (b.timeWasting !== a.timeWasting) out.push({ text: b.timeWasting ? 'Time wasting on: slower restarts when ahead, risk of bookings' : 'Time wasting off', tone: 'neu' })
  if (b.buildUp !== a.buildUp) out.push({ text: `Build-up: ${b.buildUp}`, tone: 'neu' })
  if (b.chanceCreation !== a.chanceCreation) out.push({ text: `Chance creation: ${b.chanceCreation}`, tone: 'neu' })
  const de = Math.round((drain(b) / drain(a) - 1) * 100)
  if (Math.abs(de) >= 3) out.push({ text: `Energy use ${de > 0 ? '+' : ''}${de}%`, tone: de > 0 ? 'neg' : 'pos' })
  return out
}

/** Out of possession: our half, defensive line and pressing trigger. */
function DefDiagram({ t }: { t: TeamTactics }) {
  const line = 64 - (t.lineHeight / 100) * 44 // y of the back line (0 = halfway, 70 = our goal line)
  const press = 64 - (t.pressing / 100) * 62
  return (
    <svg viewBox="0 0 100 70" className="tb-diag" aria-hidden>
      <rect x="0" y="0" width="100" height="70" rx="6" fill="var(--pitch)" />
      <HalfMarkings w={100} h={70} goal="bottom" />
      <rect x="3" y="3" width="94" height={Math.max(0, press - 3)} fill="rgba(255,120,90,.16)" />
      <path d={`M3 ${press}h94`} stroke="rgba(255,140,110,.75)" strokeDasharray="2 2" strokeWidth=".7" />
      <text x="3" y={Math.max(6, press - 2)} fontSize="5" fill="rgba(255,190,170,.9)">press trigger</text>
      <path d={`M6 ${line}h88`} stroke={t.offsideTrap ? '#ffd23f' : '#fff'} strokeWidth="1.4" strokeLinecap="round" />
      {[14, 38, 62, 86].map((x) => <circle key={x} cx={x} cy={line} r="2.6" fill="var(--club, #3ea6ff)" stroke="#fff" strokeWidth=".7" />)}
      <text x="97" y={line - 3} fontSize="5" textAnchor="end" fill="rgba(255,255,255,.85)">{t.offsideTrap ? 'line · trap' : 'back line'}</text>
    </svg>
  )
}

/** In possession: width lanes and attack direction/tempo. */
function AttDiagram({ t }: { t: TeamTactics }) {
  const lane = 12 + (t.width / 100) * 30 // half-distance of the wide lanes from centre
  const len = 18 + (t.tempo / 100) * 34
  const direct = t.buildUp === 'Long Ball' || t.buildUp === 'Counter' || t.chanceCreation === 'Direct Passing'
  return (
    <svg viewBox="0 0 100 70" className="tb-diag" aria-hidden>
      <rect x="0" y="0" width="100" height="70" rx="6" fill="var(--pitch)" />
      <HalfMarkings w={100} h={70} goal="top" />
      <path d={`M${50 - lane} 8V64M${50 + lane} 8V64`} stroke="rgba(120,200,255,.5)" strokeDasharray="3 2" strokeWidth=".8" />
      <defs><marker id="tbarr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#fff" /></marker></defs>
      {direct
        ? <path d={`M50 62 L50 ${62 - len}`} stroke="#fff" strokeWidth="1.4" markerEnd="url(#tbarr)" />
        : <path d={`M50 62 l-8 -${len / 3} l12 -${len / 3} l-6 -${len / 3}`} fill="none" stroke="#fff" strokeWidth="1.2" markerEnd="url(#tbarr)" strokeLinejoin="round" />}
      <circle cx={50 - lane} cy="30" r="2.6" fill="var(--club, #3ea6ff)" stroke="#fff" strokeWidth=".7" />
      <circle cx={50 + lane} cy="30" r="2.6" fill="var(--club, #3ea6ff)" stroke="#fff" strokeWidth=".7" />
      <text x="50" y="68" fontSize="5" textAnchor="middle" fill="rgba(255,255,255,.8)">{t.tempo >= 65 ? 'fast' : t.tempo <= 35 ? 'patient' : 'measured'} · {t.width >= 65 ? 'wide' : t.width <= 35 ? 'narrow' : 'balanced width'}</text>
    </svg>
  )
}

function Board({ title, icon, diagram, sub, children }: { title: string; icon: string; diagram: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="card pad-card tb-board">
      <div className="tb-top">
        <div className="grow" style={{ minWidth: 0 }}><div className="tb-h"><Icon name={icon} size={16} /><span>{title}</span></div>{sub && <div className="tiny dim tb-desc">{sub}</div>}</div>
        {diagram}
      </div>
      <div className="tb-ctrls">{children}</div>
    </div>
  )
}

export interface GameState { score: [number, number]; side: 0 | 1; minute: number; reds: [number, number] }

const PLANS: { id: string; label: string; icon: string; text: string; set: Partial<TeamTactics> }[] = [
  { id: 'protect', label: 'Protect the lead', icon: 'shield', text: 'Defensive, deep block, slow tempo, time wasting', set: { mentality: 'Defensive', defApproach: 'Deep', lineHeight: 30, pressing: 32, tempo: 30, width: 45, timeWasting: true, offsideTrap: false } },
  { id: 'control', label: 'Control it', icon: 'target', text: 'Balanced, keep the ball, mid block', set: { mentality: 'Balanced', defApproach: 'Balanced', lineHeight: 50, pressing: 50, tempo: 42, chanceCreation: 'Possession', timeWasting: false } },
  { id: 'chase', label: 'Chase the game', icon: 'up', text: 'Attacking, high press, fast and wide', set: { mentality: 'Attacking', defApproach: 'High', lineHeight: 66, pressing: 72, tempo: 72, width: 64, chanceCreation: 'Forward Runs', timeWasting: false } },
]

export function TacticsBoard({ t, onChange, base, game }: { t: TeamTactics; onChange: Change; base?: TeamTactics; game?: GameState }) {
  const mi = MENTALITIES.indexOf(t.mentality)
  const set: Change = (p) => { haptic(); onChange(p) }
  const eff = base ? effects(base, t) : []
  const diff = game ? game.score[game.side] - game.score[1 - game.side] : 0
  const left = game ? Math.max(0, 90 - game.minute) : 0
  const hint = !game ? '' : game.minute < 1 ? '' : diff > 0 && left <= 20 ? `You lead with ${left}' left.` : diff < 0 && left <= 25 ? `You're behind with ${left}' left.` : game.reds[game.side] > game.reds[1 - game.side] ? 'You are down to ten.' : game.reds[1 - game.side] > game.reds[game.side] ? 'They are down to ten: time to push?' : ''
  const suggest = !game ? undefined : diff > 0 && left <= 20 ? 'protect' : diff < 0 && left <= 25 ? 'chase' : undefined
  return (
    <div className="stack tb" style={{ gap: 12 }}>
      {game && (
        <div className="card pad-card">
          <div className="row between"><div className="label">Game plans</div>{hint && <span className="tiny b" style={{ color: 'var(--warn)' }}>{hint}</span>}</div>
          <div className="tb-plans">
            {PLANS.map((p) => (
              <button key={p.id} className={`tb-plan ${suggest === p.id ? 'sug' : ''}`} onClick={() => { haptic('medium'); onChange(p.set) }}>
                <Icon name={p.icon} size={18} /><b>{p.label}</b><span className="tiny dim">{p.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card pad-card">
        <div className="row between"><div className="label row tight">Mentality <GuideButton k="mentality" t={t} /></div><span className="tiny b" style={{ color: 'var(--t1)' }}>{t.mentality}</span></div>
        <div className="tb-ment" style={{ ['--i' as any]: mi }}>
          <div className="tb-ment-track" />
          {MENTALITIES.map((m, i) => (
            <button key={m} className={i === mi ? 'on' : ''} onClick={() => set({ mentality: m })} aria-label={m}>
              <span className="display">{['UD', 'D', 'B', 'A', 'UA'][i]}</span>
            </button>
          ))}
        </div>
        <div className="tiny dim" style={{ marginTop: 8, minHeight: 28 }}>{MENT_TEXT[t.mentality]}</div>
      </div>

      <Board title="Out of possession" icon="shield" diagram={<DefDiagram t={t} />} sub={DEF_PRESET[t.defApproach].text}>
        <div className="tiny b tb-sub row tight">Defensive approach <GuideButton k="defApproach" t={t} /></div>
        <Seg small items={(['Deep', 'Balanced', 'High', 'Aggressive'] as const).map((x) => ({ id: x, label: x }))} value={t.defApproach} onChange={(v) => set({ defApproach: v, lineHeight: DEF_PRESET[v].lineHeight, pressing: DEF_PRESET[v].pressing })} />
        <Slider label={<span className="row tight">Line height <GuideButton k="lineHeight" t={t} /></span>} value={t.lineHeight} onChange={(v) => onChange({ lineHeight: v })} left="Deep" right="High" />
        <Slider label={<span className="row tight">Pressing <GuideButton k="pressing" t={t} /></span>} value={t.pressing} onChange={(v) => onChange({ pressing: v })} left="Low" right="Relentless" />
        <div className="row tight"><button className={`chip ${t.offsideTrap ? 'on' : ''}`} onClick={() => set({ offsideTrap: !t.offsideTrap })}><Icon name="flag" size={14} /> Offside trap</button><GuideButton k="offsideTrap" t={t} /></div>
      </Board>

      <Board title="In possession" icon="ball" diagram={<AttDiagram t={t} />} sub={`${BUILD_TEXT[t.buildUp]} ${CHANCE_TEXT[t.chanceCreation]}`}>
        <div className="tiny b tb-sub row tight">Build-up <GuideButton k="buildUp" t={t} /></div>
        <Seg small items={(['Balanced', 'Short Passing', 'Counter', 'Long Ball'] as const).map((x) => ({ id: x, label: x.replace(' Passing', '') }))} value={t.buildUp} onChange={(v) => set({ buildUp: v })} />
        <div className="tiny b tb-sub row tight">Chance creation <GuideButton k="chanceCreation" t={t} /></div>
        <Seg small items={(['Balanced', 'Possession', 'Direct Passing', 'Forward Runs'] as const).map((x) => ({ id: x, label: x.replace(' Passing', '').replace('Forward ', '') }))} value={t.chanceCreation} onChange={(v) => set({ chanceCreation: v })} />
        <Slider label={<span className="row tight">Width <GuideButton k="width" t={t} /></span>} value={t.width} onChange={(v) => onChange({ width: v })} left="Narrow" right="Wide" />
        <Slider label={<span className="row tight">Tempo <GuideButton k="tempo" t={t} /></span>} value={t.tempo} onChange={(v) => onChange({ tempo: v })} left="Patient" right="Fast" />
      </Board>

      <div className="card li tb-tw">
        <button className="grow row" style={{ gap: 12, textAlign: 'left' }} onClick={() => set({ timeWasting: !t.timeWasting })}>
          <Icon name="clock" size={18} />
          <div className="meta"><div className="t">Time wasting</div><div className="s">From the hour, while ahead: slower restarts. Referees lose patience.</div></div>
          <span className={`tb-sw ${t.timeWasting ? 'on' : ''}`}><i /></span>
        </button>
        <GuideButton k="timeWasting" t={t} />
      </div>

      <PlayStyleCard t={t} />

      {base && (
        <div className="card pad-card tb-eff">
          <div className="label" style={{ marginBottom: 6 }}>What this changes{eff.length ? ` · ${eff.length}` : ''}</div>
          {eff.length ? eff.map((e) => <div key={e.text} className={`tb-eff-row ${e.tone}`}><Icon name={e.tone === 'neg' ? 'down' : e.tone === 'pos' ? 'up' : 'forward'} size={12} strokeWidth={2.4} />{e.text}</div>)
            : <div className="tiny dim">No changes yet. Everything you change applies from the next minute.</div>}
        </div>
      )}
    </div>
  )
}
