// The day's watch list, when Continue reaches it: the matches the manager set to watch today, each one tap from
// kick-off, or let go for today (they are then played with the rest of the day). Closing it leaves the day as it was:
// the matches stay on the list, and Continue asks again rather than playing through them.
import type { Fixture, World } from '../../domain/types'
import { fmtDate } from '../../domain/dates'
import { watchedToday } from '../../engine/world/advance'
import { haptic, useGame } from '../../store/game'
import { compLogoKey } from '../selectors'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo } from './atoms'
import { Sheet } from './layout'
import { kitColors, kitVars } from './LivePitch'

export function WatchReminder() {
  const open = useGame((s) => s.watchPrompt)
  const w = useGame((s) => s.world)
  useGame((s) => s.v)
  const close = useGame((s) => s.closeWatchPrompt)
  const list = w && open ? watchedToday(w) : []
  const skip = () => { haptic(); useGame.getState().skipWatchedToday(); useGame.getState().notify('Off the watch list for today', 'ok') }
  return (
    <Sheet open={!!w && list.length > 0} onClose={close}>
      {w && list.length > 0 && (
        <div className="wr">
          <div className="wr-head">
            <span className="wr-ic"><Icon name="eye" size={18} /></span>
            <div className="grow">
              <div className="kicker">{fmtDate(w.date, 'long')}</div>
              <div className="h3" style={{ marginTop: 3 }}>{list.length > 1 ? `${list.length} matches to watch` : 'A match to watch'}</div>
            </div>
          </div>
          <div className="wr-list">
            {list.map((f) => <WatchCard key={f.id} w={w} f={f} onWatch={() => { haptic('medium'); useGame.getState().watchFixture(f.id) }} />)}
          </div>
          <button className="btn ghost block wr-skip" onClick={skip}>Not today</button>
          <div className="tiny dim" style={{ textAlign: 'center', marginTop: 6 }}>{list.length > 1 ? 'They are' : 'It is'} then played with the rest of the day.</div>
        </div>
      )}
    </Sheet>
  )
}

/** One match on the list: both crests in their colours, the competition and the kick-off between them. */
function WatchCard({ w, f, onWatch }: { w: World; f: Fixture; onWatch: () => void }) {
  const home = w.clubs[f.home], away = w.clubs[f.away], comp = w.competitions[f.compId]
  if (!home || !away) return null
  return (
    <button className="wr-card" style={kitVars(kitColors(home, away))} onClick={onWatch}>
      <div className="wr-comp tiny">{comp && <CompLogo k={compLogoKey(comp)} size={15} name={comp.name} />}<span className="ellipsis">{comp?.short || comp?.name}{f.roundName ? ` · ${f.roundName}` : ''}</span></div>
      <div className="wr-row">
        <div className="wr-side"><Badge club={home} size={40} /><b className="ellipsis">{home.short}</b></div>
        <div className="wr-mid">
          <div className="wr-time">{f.time}</div>
          <span className="wr-go"><Icon name="play" size={11} strokeWidth={2.6} />Watch</span>
        </div>
        <div className="wr-side"><Badge club={away} size={40} /><b className="ellipsis">{away.short}</b></div>
      </div>
    </button>
  )
}
