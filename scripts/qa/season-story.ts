// The Season Review's headline for every kind of season: the real archive, then the club moved to each finish
// (points set between its neighbours, the title and cups taken away or given).
//   npx tsx scripts/qa/season-story.ts <save with an archived season>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { seasonReview } from '../../src/engine/world/review'
import type { SeasonArchive, StandingRow } from '../../src/domain/types'

const w = deserialize(fs.readFileSync(process.argv[2]))
migrateSave(w)
const real = w.archive[w.archive.length - 1]
const clubId = real.userClubId
const lgKey = Object.keys(real.tables).find((k) => k.startsWith('L') && real.tables[k].some((r) => r.clubId === clubId))!
function at(pos: number, opts: { tieAbove?: boolean; margin?: number; keepCups?: boolean } = {}): SeasonArchive {
  const a: SeasonArchive = JSON.parse(JSON.stringify(real))
  const t = a.tables[lgKey].filter((r) => r.clubId !== clubId)
  const me: StandingRow = { ...real.tables[lgKey].find((r) => r.clubId === clubId)!, l: 4 }
  t.splice(pos - 1, 0, me)
  // points: between the neighbours (or level with the one above)
  for (let i = 0; i < t.length; i++) t[i].pts = 100 - i * 3
  if (opts.tieAbove && pos > 1) { me.pts = t[pos - 2].pts; me.gf = t[pos - 2].gf - 5; me.ga = t[pos - 2].ga + 2 }
  if (opts.margin != null) me.pts = t[pos].pts + opts.margin
  a.tables[lgKey] = t
  a.userFinish = pos
  // (when the real season was settled says nothing about a made-up one)
  if (pos !== real.userFinish) delete a.decided
  if (pos !== 1) delete a.winners[lgKey]; else a.winners[lgKey] = clubId
  if (!opts.keepCups) for (const k of Object.keys(a.winners)) if (k !== lgKey && a.winners[k] === clubId) delete a.winners[k]
  return a
}
const show = (label: string, a: SeasonArchive) => {
  const s = seasonReview(w, a).story
  console.log(`${label.padEnd(30)} ${s.mood.padEnd(9)} ${s.headline.toUpperCase().padEnd(20)} ${s.kicker}`)
  for (const n of s.notes) console.log(`${''.padEnd(41)}· ${n.text}`)
}
show('real archive', real)
show('champions, no cups', at(1))
show('champions + cups', at(1, { keepCups: true }))
show('2nd, 6 behind', at(2))
show('2nd on goal difference', at(2, { tieAbove: true }))
show('3rd', at(3))
show('3rd + cup', at(3, { keepCups: true }))
show('5th', at(5))
show('9th', at(9))
show('14th', at(14))
show('17th, safe by 1', at(17, { margin: 1 }))
show('18th, relegated', at(18))
show('20th, relegated', at(20))
