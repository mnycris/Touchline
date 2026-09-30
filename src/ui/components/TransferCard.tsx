// Transfer centre cards: the player between the club he's leaving and the one he's joining, with live arrows
// (orange: rumour, yellow: talks and negotiations, green: done) or a red cross for a deal that collapsed.
import type { StoryStage, TransferStory, World } from '../../domain/types'
import { Badge, Face } from './atoms'
import { Icon } from '../icons/Icon'
import { fmtMoney } from '../../domain/finance'
import { ageOn, diffDays, fmtDate } from '../../domain/dates'
import { STAGE_LABEL } from '../../engine/world/market'
import { callName } from '../../engine/match/commentary'
import { haptic, useGame } from '../../store/game'

export const STAGE_TONE: Record<StoryStage, 'rumour' | 'active' | 'done' | 'failed'> = { rumour: 'rumour', talks: 'active', negotiating: 'active', close: 'active', done: 'done', failed: 'failed' }
export const STAGE_BANNER: Record<StoryStage, string> = { rumour: 'Rumour', talks: 'Talks', negotiating: 'Negotiating', close: 'Close to a deal', done: 'Done deal', failed: 'Failed deal' }

/** Three chevrons pointing right, a light travelling through them; a slow pulsing cross when the deal is off. */
export function DealArrows({ stage, size = 22 }: { stage: StoryStage; size?: number }) {
  const tone = STAGE_TONE[stage]
  if (tone === 'failed') {
    return (
      <svg className="dx failed" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    )
  }
  return (
    <svg className={`dx ${tone}`} width={size * 1.35} height={size} viewBox="0 0 32 24" aria-hidden>
      <path d="M1 3h5.2l8 9-8 9H1l8-9z" />
      <path d="M10 3h5.2l8 9-8 9H10l8-9z" />
      <path d="M19 3h5.2l8 9-8 9H19l8-9z" />
    </svg>
  )
}

const ago = (w: World, d: string) => { const n = diffDays(w.date, d); return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? `${n} days ago` : fmtDate(d, 'dm') }

/** Reliability as five small bars (rumours only). */
export function Reliability({ n }: { n: number }) {
  return <span className="rel" title={`Reliability ${n}/5`}>{[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= n ? 'on' : ''} />)}</span>
}

/** The flow: club he's leaving » player » club he's joining. */
export function DealFlow({ w, s, face = 56, badge = 34 }: { w: World; s: TransferStory; face?: number; badge?: number }) {
  const p = w.players[s.playerId]
  const from = w.clubs[s.from], to = w.clubs[s.to]
  return (
    <div className={`deal-flow ${STAGE_TONE[s.stage]}`}>
      <span className="df-club">{from ? <Badge club={from} size={badge} /> : <span className="df-free" style={{ width: badge, height: badge }}>FA</span>}</span>
      <DealArrows stage={s.stage} size={Math.round(badge * 0.62)} />
      <span className="df-face" style={{ width: face + 8, height: face + 8 }}>{p ? <Face p={p} size={face} radius={face / 2} club={to || from} /> : null}</span>
      <DealArrows stage={s.stage} size={Math.round(badge * 0.62)} />
      <span className="df-club">{to ? <Badge club={to} size={badge} /> : null}</span>
    </div>
  )
}

/** A headline card (carousel and top of the feed). */
export function TransferCard({ w, s, mine }: { w: World; s: TransferStory; mine?: boolean }) {
  const go = useGame((st) => st.go)
  const p = w.players[s.playerId]
  if (!p) return null
  const tone = STAGE_TONE[s.stage]
  const fee = s.kind === 'loan' ? 'Loan' : s.kind === 'free' ? 'Free' : s.fee ? fmtMoney(s.fee, { short: true }) : '—'
  return (
    <button className={`tcard ${tone}`} onClick={() => { haptic(); go({ name: 'story', params: { id: s.id } }) }}>
      <span className="tc-glow" aria-hidden />
      <div className="tc-top">
        <span className={`tc-stage ${tone}`}>{STAGE_BANNER[s.stage]}</span>
        {mine && <span className="tc-you">You</span>}
        <span className="grow" />
        <span className="tiny dim">{ago(w, s.updated)}</span>
      </div>
      <DealFlow w={w} s={s} />
      <div className="tc-name"><b>{callName(p.name)}</b> <span className="dim">({ageOn(p.dob, w.date)})</span></div>
      <div className="tc-facts">
        <span><b>{fmtMoney(p.value, { short: true })}</b><i>Value</i></span>
        <span><b>{fee}</b><i>{s.stage === 'done' ? 'Fee' : s.stage === 'rumour' ? 'Reported' : s.stage === 'failed' ? 'Last bid' : 'Fee'}</i></span>
        <span><b>{p.positions[0]}</b><i>{p.ovr} OVR</i></span>
      </div>
      {s.stage === 'rumour' && s.source && <div className="tc-src tiny"><Icon name="news" size={12} />{s.source}<Reliability n={s.reliability || 2} /></div>}
    </button>
  )
}

/** A compact feed row: the same flow, smaller, with the story in words. */
export function TransferRow({ w, s, mine, onClick }: { w: World; s: TransferStory; mine?: boolean; onClick?: () => void }) {
  const go = useGame((st) => st.go)
  const p = w.players[s.playerId]
  if (!p) return null
  const tone = STAGE_TONE[s.stage]
  const last = s.log[s.log.length - 1]
  const fee = s.kind === 'loan' ? 'Loan' : s.kind === 'free' ? 'Free' : s.fee ? fmtMoney(s.fee, { short: true }) : ''
  return (
    <button className={`trow ${tone}`} onClick={() => { haptic(); onClick ? onClick() : go({ name: 'story', params: { id: s.id } }) }}>
      <DealFlow w={w} s={s} face={38} badge={24} />
      <div className="tr-meta">
        <div className="row tight" style={{ minWidth: 0 }}><b className="small ellipsis">{callName(p.name)}</b>{mine && <span className="tc-you sm">You</span>}</div>
        <div className="tr-note tiny">{last.note}</div>
        <div className="row tight tiny" style={{ marginTop: 3, gap: 6 }}><span className={`tr-stage ${tone}`}>{STAGE_LABEL[s.stage]}</span>{fee && <b>{fee}</b>}<span className="dim">{ago(w, s.updated)}</span></div>
      </div>
    </button>
  )
}

/** Rumour → talks → negotiating → close → done, with where a failed deal fell. */
export function StageTrack({ s }: { s: TransferStory }) {
  const steps: StoryStage[] = ['rumour', 'talks', 'negotiating', 'close', 'done']
  const reached = s.stage === 'failed' ? (s.log.filter((l) => l.stage !== 'failed').map((l) => steps.indexOf(l.stage)).sort((a, b) => b - a)[0] ?? 0) : steps.indexOf(s.stage)
  const start = s.log[0] ? Math.max(0, steps.indexOf(s.log[0].stage)) : 0
  return (
    <div className={`stage-track ${STAGE_TONE[s.stage]}`}>
      {steps.map((st, i) => {
        const done = i <= reached && i >= start
        const here = i === reached
        const skipped = i < start
        return (
          <div key={st} className={`st-step ${done ? 'on' : ''} ${here ? 'here' : ''} ${skipped ? 'skip' : ''}`}>
            <span className="st-dot">{here && s.stage === 'failed' ? <Icon name="close" size={10} strokeWidth={3} /> : done ? <Icon name="check" size={10} strokeWidth={3} /> : null}</span>
            <span className="st-l">{st === 'done' ? 'Done' : STAGE_LABEL[st]}</span>
          </div>
        )
      })}
    </div>
  )
}
