// Engine internals: runs N matches of a league and prints the calibration counters.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const leagueId = Number(process.argv[2] || 13)
const N = Number(process.argv[3] || 60)
const club = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: club, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 3 })
const comp = w.competitions[`L${leagueId}-2026`]
MatchSim.dbg = {}
const t = Date.now()
let n = 0
for (const id of comp.fixtures.slice(0, N)) { createSim(w, w.fixtures[id], false).runToEnd(); n++ }
const d = MatchSim.dbg
console.log(`${n} matches ${((Date.now() - t) / n).toFixed(1)} ms/match, acts/match ${(d.acts / n).toFixed(0)}, decide ${(d.decide / n).toFixed(0)}, avg pressure ${(d.pr / d.decide).toFixed(2)}`)
console.log('choice weights share:', ['carry', 'drib', 'cross', 'cut', 'clear'].map((k) => `${k} ${(d['w.' + k] / d.decide).toFixed(3)}`).join(' '))
const kinds = Object.keys(d).filter((k) => k.startsWith('pass.')).map((k) => k.slice(5))
for (const k of kinds) console.log(`pass ${k.padEnd(8)} per team ${(d['pass.' + k] / n / 2).toFixed(1).padStart(6)}  pOk ${(d['passL.' + k] / d['pass.' + k]).toFixed(2)}  open ${(d['open.' + k] / d['pass.' + k]).toFixed(2)}  pr ${(d['prp.' + k] / d['pass.' + k]).toFixed(2)}`)
const hows = Object.keys(d).filter((k) => k.startsWith('shot.')).map((k) => k.slice(5))
for (const k of hows.sort((a, b) => d['shot.' + b] - d['shot.' + a])) console.log(`shot ${k.padEnd(9)} per team ${(d['shot.' + k] / n / 2).toFixed(2).padStart(6)}  xg/shot ${(d['xg.' + k] / d['shot.' + k]).toFixed(3)}`)
const other = Object.keys(d).filter((k) => !/^(pass|passL|open|prp|shot|xg|w)\./.test(k) && !['acts', 'decide', 'pr'].includes(k))
console.log(other.map((k) => `${k} ${(d[k] / n / 2).toFixed(2)}`).join('  '))
console.log('ball x at decisions (per team per match):', [0,1,2,3,4,5,6,7,8,9].map((i) => `${i * 10}s ${((d['zx' + i] || 0) / n / 2).toFixed(0)}/${((d['zw' + i] || 0) / n / 2).toFixed(0)}w`).join('  '))
console.log('turnovers by x of loss (per team):', [0,1,2,3,4,5,6,7,8,9].map((i) => `${i * 10}s ${((d['lost' + i] || 0) / n / 2).toFixed(1)}`).join('  '))
{
  const groups = ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB']
  for (const g of groups) {
    const ks = Object.keys(d).filter((k) => k.startsWith(`goal.${g}.`))
    const sk = Object.keys(d).filter((k) => k.startsWith(`gshot.${g}.`))
    console.log(`${g.padEnd(3)} goals/team ${((d['goal.' + g] || 0) / n / 2).toFixed(2)}  by how: ${ks.sort((a, b) => d[b] - d[a]).slice(0, 6).map((k) => `${k.split('.')[2]} ${(d[k] / n / 2).toFixed(2)}`).join(' ')}  | shots: ${sk.sort((a, b) => d[b] - d[a]).slice(0, 6).map((k) => `${k.split('.')[2]} ${(d[k] / n / 2).toFixed(2)}`).join(' ')}`)
  }
}
