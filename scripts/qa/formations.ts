// Formation matrix: the same squad and balanced tactics in different formations. No shape should dominate.
// Run: npx tsx scripts/qa/formations.ts [club="Brentford"] [games per pair=60]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamTactics } from '../../src/domain/types'
import { buildSheet } from '../../src/engine/match/selection'
import { MatchSim, type SideInput } from '../../src/engine/match/engine'
import { FORMATIONS } from '../../src/domain/constants'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const clubName = process.argv[2] || 'Brentford'
const G = Number(process.argv[3] || 60)
const only = process.argv[4] ? process.argv[4].split(',') : null
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: arsenal, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 5 })
const club = Object.values(w.clubs).find((c) => c.name === clubName)!
const tac: TeamTactics = { buildUp: 'Balanced', defApproach: 'Balanced', lineHeight: 55, width: 55, tempo: 55, pressing: 50, chanceCreation: 'Balanced', playersInBox: 5, corners: 'Balanced', freeKicks: 'Balanced', mentality: 'Balanced', timeWasting: false, offsideTrap: false }
const forms = (only || FORMATIONS.map((f) => f.id))
const sheets = Object.fromEntries(forms.map((f) => [f, buildSheet(w, club, f, tac)]))
const side = (f: string, idx: number): SideInput => { const sheet = sheets[f]; return { clubId: club.id + idx, name: f, short: f, sheet, players: Object.fromEntries([...sheet.lineup, ...sheet.bench].map((id) => [id, w.players[id]])) } }
const ctx = (i: number) => ({ id: `f${i}`, compName: 'T', neutral: true, venue: 'X', attendance: 30000, knockout: false, extraTime: false, penaltiesOnly: false, importance: 1, strictness: 1, injuryRate: 1, commentary: false })
const acc: Record<string, { pts: number; n: number; gf: number; ga: number; xg: number }> = {}
for (const f of forms) acc[f] = { pts: 0, n: 0, gf: 0, ga: 0, xg: 0 }
let seed = 1
const t0 = Date.now()
for (let i = 0; i < forms.length; i++) for (let j = i + 1; j < forms.length; j++) for (let g = 0; g < G; g++) {
  const flip = g % 2 === 1
  const a = flip ? forms[j] : forms[i], b = flip ? forms[i] : forms[j]
  const r = new MatchSim(side(a, 0), side(b, 1), ctx(g), seed++).runToEnd()
  const [sa, sb] = r.score
  for (const [n, gf, ga, st] of [[a, sa, sb, r.stats[0]], [b, sb, sa, r.stats[1]]] as const) { const x = acc[n]; x.n++; x.gf += gf; x.ga += ga; x.xg += st.xg; x.pts += gf > ga ? 3 : gf === ga ? 1 : 0 }
}
console.log(`${club.name}: ${G} games per pair, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
for (const f of forms.sort((x, y) => acc[y].pts / acc[y].n - acc[x].pts / acc[x].n)) { const x = acc[f]; console.log(f.padEnd(20) + (x.pts / x.n).toFixed(2) + '  gf ' + (x.gf / x.n).toFixed(2) + '  ga ' + (x.ga / x.n).toFixed(2) + '  xG ' + (x.xg / x.n).toFixed(2)) }
