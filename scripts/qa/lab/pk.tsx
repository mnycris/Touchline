// Dev-only stills of the penalty scene: /scripts/qa/lab/pk.html?k=BR,L,goal&t=0,1,1.6,2&foot=R
import { createRoot } from 'react-dom/client'
import '../../../src/styles/global.css'
import '../../../src/styles/screens.css'
import { PenaltyScene } from '../../../src/ui/components/PenaltyScene'

const q = new URLSearchParams(location.search)
const [spot, dive, res] = (q.get('k') || 'BR,L,goal').split(',') as any
const times = (q.get('t') || '0,0.9,1.4,1.62,1.8,2.02,2.3,3.2').split(',').map(Number)
const foot = q.get('foot') || 'R'
const taker: any = { id: 1, name: q.get('name') || 'Bukayo Saka', jersey: Number(q.get('no') || 7), foot }
const keeper: any = { id: 2, name: 'Gianluigi Donnarumma', jersey: 1 }
const tc: any = { id: 3, short: 'Arsenal', kit: (q.get('kit') || '#EF0107,#FFFFFF').split(',') }
const kc: any = { id: 4, short: 'Man City', kit: (q.get('kit2') || '#6CABDD,#FFFFFF').split(',') }
const W = Number(q.get('w') || 338)
createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6 }}>
    {times.map((t) => (
      <div key={t} style={{ width: W }}>
        <div className={`pk-scene ${t >= 2 ? 'result' : ''} res-${res}`} style={{ margin: 0 }}>
          <PenaltyScene pen={{ taker: 1, keeper: 2, spot, dive, res }} taker={taker} keeper={keeper} takerClub={tc} keeperClub={kc} eventId={Number(q.get('seed') || 5)} at={t} />
        </div>
        <div style={{ color: '#fff', font: '11px monospace', padding: '2px 0' }}>t={t}</div>
      </div>
    ))}
  </div>,
)
