// A club's roster: positions, overall, availability and rating at a given slot position.
// npx tsx scripts/qa/lab/roster.ts Chelsea CB
import { freshWorld } from '../engine-lab'
import { posRating } from '../../../src/domain/ratings'
import { squadOf, isAvailable } from '../../../src/engine/match/selection'
const [name, pos = 'CB'] = process.argv.slice(2)
const w = freshWorld()
const c = Object.values(w.clubs).find((x) => !x.national && (x.short === name || x.name.includes(name)))!
const sq = squadOf(w, c.id).sort((a, b) => posRating(b, pos as any) - posRating(a, pos as any))
console.log(c.name, 'manager formation', w.managers[c.managerId]?.formation, w.managers[c.managerId]?.vision)
for (const p of sq) console.log(`${p.name.padEnd(26)} ${p.positions.join('/').padEnd(16)} ovr ${p.ovr} @${pos} ${posRating(p, pos as any)} ${isAvailable(w, p) ? '' : 'UNAVAILABLE ' + (p.injury?.type || '')} fit ${p.fitness}`)
