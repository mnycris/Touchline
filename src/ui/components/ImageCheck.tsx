import { useEffect, useState } from 'react'
import { Icon } from '../icons/Icon'
import { managerWikiQuery, wikiPhoto } from '../../services/assets'
import eaAssets from '../../data/eaAssets.json'

const PS_SAMPLE = Object.values((eaAssets as { playstyles: Record<string, string> }).playstyles)[0]
const PROBES: { label: string; url?: string; wiki?: boolean }[] = [
  { label: 'EA SPORTS FC 27 headshots', url: 'https://ratings-images-prod.pulse.ea.com/FC27/full/player-portraits/p239085.png?width=64' },
  { label: 'EA SPORTS FC 27 headshots, full size', url: 'https://ratings-images-prod.pulse.ea.com/FC27/full/player-portraits/p239085.png?width=512' },
  { label: 'EA SPORTS FC 26 headshots', url: 'https://ratings-images-prod.pulse.ea.com/FC26/full/player-portraits/p239085.png?width=64' },
  { label: 'EA SPORTS FC 25 headshots', url: 'https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits/p239085.png?width=64' },
  { label: 'SoFIFA headshots (FC 26)', url: 'https://cdn.sofifa.net/players/239/085/26_120.png' },
  { label: 'SoFIFA headshots, retina (FC 26)', url: 'https://cdn.sofifa.net/players/239/085/26_240.png' },
  { label: 'FUTBIN headshots (FC 26)', url: 'https://cdn.futbin.com/content/fifa26/img/players/239085.png' },
  { label: 'FUTWIZ headshots (FC 26)', url: 'https://cdn.futwiz.com/assets/img/fc26/faces/239085.png' },
  { label: 'FUTBIN headshots (FC 25)', url: 'https://cdn.futbin.com/content/fifa25/img/players/239085.png' },
  { label: 'Club crests (football-logos.cc)', url: 'https://assets.football-logos.cc/logos/england/512x512/arsenal.02d595b0.png' },
  // the same icon file the player pages use, so this row matches what you see there
  { label: 'EA PlayStyle icons', url: PS_SAMPLE },
  { label: 'Manager photos (Wikipedia)', wiki: true },
]

function Probe({ p, onResult }: { p: (typeof PROBES)[number]; onResult: (r: 'ok' | 'fail') => void }) {
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>('wait')
  useEffect(() => {
    let alive = true
    const done = (r: 'ok' | 'fail') => { if (!alive) return; setState(r); onResult(r) }
    if (p.wiki) { wikiPhoto(managerWikiQuery('Pep Guardiola')).then((u) => done(u ? 'ok' : 'fail')); return () => { alive = false } }
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    img.onload = () => done('ok')
    img.onerror = () => done('fail')
    img.src = `${p.url}${p.url!.includes('?') ? '&' : '?'}probe=${Date.now()}`
    return () => { alive = false }
  }, [])
  return (
    <div className="li" style={{ minHeight: 44 }}>
      <div className="meta small">{p.label}</div>
      {state === 'wait' ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name={state === 'ok' ? 'check' : 'close'} size={18} color={state === 'ok' ? 'var(--pos)' : 'var(--neg)'} />}
    </div>
  )
}

/** Live check of each remote image source on this device/network: a one-line summary, the sources one by one on a tap. */
export function ImageCheck() {
  const [run, setRun] = useState(0)
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState<Record<string, 'ok' | 'fail'>>({})
  const done = Object.keys(res).length, ok = Object.values(res).filter((r) => r === 'ok').length
  return (
    <div className="card">
      <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="eye" size={18} color="var(--t2)" />
        <div className="meta"><div className="t small">Image sources</div><div className="s">{done < PROBES.length ? 'Checking…' : `${ok} of ${PROBES.length} reachable on this device`}</div></div>
        <Icon name={open ? 'up' : 'down'} size={16} color="var(--t3)" />
      </button>
      <div className="list" key={run} style={open ? undefined : { display: 'none' }}>{PROBES.map((p) => <Probe key={p.label} p={p} onResult={(r) => setRes((x) => ({ ...x, [p.label]: r }))} />)}</div>
      {open && <div className="li"><button className="link" onClick={() => { setRes({}); setRun(run + 1) }}>Test again</button></div>}
    </div>
  )
}
