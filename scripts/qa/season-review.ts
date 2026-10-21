// What the Season Review is built from, for the last archived season of a save.
//   npx tsx scripts/qa/season-review.ts <save.touchline>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { seasonReview } from '../../src/engine/world/review'

const w = deserialize(fs.readFileSync(process.argv[2]))
migrateSave(w)
const a = w.archive[w.archive.length - 1]
const r = seasonReview(w, a)
const cn = (id: number) => w.clubs[id]?.short
console.log(`${r.club.name} ${r.season}: ${r.league?.finish} of ${r.league?.size} (${r.league?.verdict}) ${r.league?.row.pts}pts, gap above ${r.league?.gapAbove} below ${r.league?.gapBelow}`)
console.log('trophies', r.trophies.map((t) => t.key).join(', '))
console.log('record', JSON.stringify(r.record), 'home', r.facts.homeRecord, 'away', r.facts.awayRecord)
console.log('run', r.run.map((m) => m.res).join(''), 'positions', r.run.map((m) => m.pos ?? '-').join(' '))
const hl = (h?: { gf: number; ga: number; opp: number; comp?: { short: string } }) => h ? `${h.gf}-${h.ga} v ${cn(h.opp)} (${h.comp?.short})` : '-'
console.log('biggest win', hl(r.facts.biggestWin), '| heaviest defeat', hl(r.facts.heaviestDefeat), '| unbeaten', r.facts.unbeaten, '| win streak', r.facts.winStreak, '| comebacks', r.facts.comebacks)
console.log('comps', r.comps.map((c) => `${c.comp.short}: ${c.outcome} [${c.tone}]`).join(' · '))
const sl = (l?: { name: string; apps: number; goals: number; assists: number; rating: number; mins: number }) => l ? `${l.name} ${l.apps}apps ${l.goals}g ${l.assists}a ${l.rating} ${l.mins}'` : '-'
console.log('standout', sl(r.standout)); console.log('scorer', sl(r.topScorer)); console.log('creator', sl(r.topCreator)); console.log('iron man', sl(r.ironMan)); console.log('breakout', sl(r.breakout))
console.log('squad lines', r.squad.length, 'objectives', r.objectives.length, 'awards', r.awards.map((x) => x.name).join(', '))
console.log('transfers', JSON.stringify(r.transfers))
