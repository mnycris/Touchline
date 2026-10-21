// The app's own logo, crest and face components at the sizes the app draws them, on its surfaces, for visual QA
// (dev server only: http://localhost:5173/scripts/qa/gallery/index.html?s=comps|crests|faces&league=13).
import { createRoot } from 'react-dom/client'
import { useEffect, useState, type ReactNode } from 'react'
import '../../../src/styles/global.css'
import '../../../src/styles/screens.css'
import { Badge, CompLogo, Face } from '../../../src/ui/components/atoms'
import compLogos from '../../../src/data/compLogos.json'
import type { Club } from '../../../src/domain/types'

const q = new URLSearchParams(location.search)
const S = q.get('s') || 'comps'
const ALL_COMPS = ['UCL', 'UEL', 'UECL', 'UNL', 'EURO@2028', 'WC@2030', 'ASIAN', 'GOLD', 'AFCON', 'CA', 'EUROQ', 'INTF',
  'FACUP', 'EFLCUP', 'COMMSHIELD', 'CDR', 'SUPERCOPA', 'DFB', 'DFLSC', 'CI', 'SCI', 'CDF', 'TDC', 'KNVB', 'JCS', 'TACA', 'SUPERTACA', 'SCOTCUP', 'BELCUP', 'TURCUP',
  ...Object.keys(compLogos).filter((k) => k.startsWith('L'))]

const cell = (label: string, body: ReactNode) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8, background: 'var(--s1)', borderRadius: 14, minWidth: 0 }}>
    {body}
    <span style={{ fontSize: 10, color: 'var(--t2)', textAlign: 'center' }}>{label}</span>
  </div>
)

function Comps() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {ALL_COMPS.map((k) => cell(k, (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CompLogo k={k} size={18} /><CompLogo k={k} size={28} /><CompLogo k={k} size={44} />
        </div>
      )))}
    </div>
  )
}

function Crests() {
  const [clubs, setClubs] = useState<Club[]>([])
  useEffect(() => { fetch('/data/world.json').then((r) => r.json()).then((d) => setClubs(d.clubs)) }, [])
  const lg = q.get('league')
  const list = clubs.filter((c) => (lg ? String(c.leagueId) === lg : true)).slice(0, Number(q.get('n') || 400))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
      {list.map((c) => cell(`${c.short} ${c.id}`, (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge club={c} size={18} /><Badge club={c} size={28} /><Badge club={c} size={48} />
        </div>
      )))}
    </div>
  )
}

function Faces() {
  const ids = (q.get('ids') || '').split(',').filter(Boolean).map(Number)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {ids.map((id) => cell(String(id), (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Face p={{ id, name: String(id) }} size={32} radius={16} /><Face p={{ id, name: String(id) }} size={48} radius={14} /><Face p={{ id, name: String(id) }} size={96} radius={26} />
        </div>
      )))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 12 }}>
    {S === 'comps' ? <Comps /> : S === 'crests' ? <Crests /> : <Faces />}
  </div>,
)
