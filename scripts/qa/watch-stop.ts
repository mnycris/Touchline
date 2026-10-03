// A match marked Watch must never be played without the manager: on a day without his own match, on the same day
// kicking off after his, and on the same day kicking off before it. npx tsx scripts/qa/watch-stop.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { advance, afterMatch, simulateDay, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
const file = process.argv[2]
function scenario(label: string, pick: (w: ReturnType<typeof deserialize>, mine: any) => any) {
  const w = deserialize(fs.readFileSync(file))
  const me = w.userClubId
  const mine = Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me) && f.date > w.date).sort((a, b) => a.date.localeCompare(b.date))[0]
  const target = pick(w, mine)
  if (!target) { console.log(label.padEnd(36), 'no suitable fixture'); return }
  w.flags.watch = target.id
  const stops: string[] = []
  for (let k = 0; k < 6 && !target.played; k++) {
    const r = advance(w, 60)
    stops.push(`${r.stop}${r.fixture ? `:${r.fixture.id === target.id ? 'WATCHED' : r.fixture.id === mine.id ? 'MINE' : r.fixture.id}` : ''}`)
    const rng = worldRng(w)
    if (r.stop === 'match' && r.fixture) { afterMatch(w, r.fixture, simulateFixture(w, r.fixture), rng); simulateDay(w, rng) } // as the game does after your match
    else if (r.stop === 'watch' && r.fixture) { w.flags.watch = undefined; afterMatch(w, r.fixture, simulateFixture(w, r.fixture), rng, true); break }
    w.rng = rng.state
  }
  const ok = stops.some((s) => s.includes('WATCHED'))
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(36)} ${target.date} ${target.time} (mine ${mine.date} ${mine.time}) stops: ${stops.join(' → ')}`)
}
scenario('another day', (w, mine) => Object.values(w.fixtures).find((f) => !f.played && !f.userInvolved && f.date > w.date && f.date < mine.date))
scenario('same day, kicks off after mine', (w, mine) => Object.values(w.fixtures).find((f) => !f.played && !f.userInvolved && f.date === mine.date && f.time > mine.time))
scenario('same day, kicks off before mine', (w, mine) => Object.values(w.fixtures).find((f) => !f.played && !f.userInvolved && f.date === mine.date && f.time < mine.time))
scenario('same day, same kick-off', (w, mine) => Object.values(w.fixtures).find((f) => !f.played && !f.userInvolved && f.date === mine.date && f.time === mine.time))
