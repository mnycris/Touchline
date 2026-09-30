// Prints the opponent scouting report for a club from a save. npx tsx scripts/qa/opp-report.ts <save> [club]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { opponentReport } from '../../src/engine/world/opponentReport'
const [file, name = 'Chelsea'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const c = Object.values(w.clubs).find((x) => x.short === name || x.name.includes(name))!
const r = opponentReport(w, c.id)
const nm = (id: number) => w.players[id]?.name
console.log(c.name, r.games, 'games', r.record, 'home', r.home, 'away', r.away)
console.log('formations', r.formations, 'shape', r.shape)
console.log('style', Object.fromEntries(Object.entries(r.style).map(([k, v]) => [k, Math.round(v * 10) / 10])), 'league', r.league)
console.log('scored', r.scored, '\nconceded', r.conceded)
console.log('danger', r.danger.map((x) => `${nm(x.id)} ${x.goals}g ${x.assists}a`), 'inForm', r.inForm.map((x) => `${nm(x.id)} ${x.rating.toFixed(2)}`))
console.log('missing', r.missing.map((x) => `${nm(x.id)} (${x.why})`), 'subs', r.subs.map((x) => `${nm(x.id)} ×${x.times}`), 'aerial', r.setPieces.aerial.map(nm))
console.log('usual XI', r.usual.map((x) => `${nm(x.id)}(${x.starts})`).join(', '))
console.log('traits'); for (const t of r.traits) console.log(' ', t.good ? '+' : '−', t.text)
