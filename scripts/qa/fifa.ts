// Prints the world ranking from a save. npx tsx scripts/qa/fifa.ts <save> [n]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { rankingTable } from '../../src/engine/world/fifaRanking'
const [file, nArg = '25'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const F = w.intl?.fifa
console.log('published', F?.published, 'on', F?.date, 'dirty', F?.dirty)
for (const r of rankingTable(w).slice(0, Number(nArg))) console.log(String(r.rank).padStart(3), (r.move > 0 ? `+${r.move}` : r.move < 0 ? `${r.move}` : '=').padStart(4), w.clubs[r.id].name.padEnd(22), r.pts.toFixed(2).padStart(8), (r.delta >= 0 ? '+' : '') + r.delta.toFixed(2), 'avg', w.clubs[r.id].squadAvg)
