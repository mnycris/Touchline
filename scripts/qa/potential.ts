// Potential ranges without any scouting: famous players known, young unknowns wide. npx tsx scripts/qa/potential.ts
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { potRange, publicKnowledge } from '../../src/engine/world/scouting'
import { ageOn } from '../../src/domain/dates'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 3 })
const ps = Object.values(w.players).filter((p) => p.clubId !== w.userClubId && w.clubs[p.clubId])
const show = (label: string, list: typeof ps) => { console.log(`\n${label}`); for (const p of list.slice(0, 7)) { const [lo, hi] = potRange(w, p); console.log(`  ${p.name.padEnd(24)} ${String(ageOn(p.dob, w.date)).padStart(2)}y ovr ${p.ovr} pot ${p.pot} → shown ${lo === hi ? lo : `${lo}-${hi}`} (known ${publicKnowledge(w, p)}) ${w.clubs[p.clubId].short}`) } }
show('Stars', ps.filter((p) => p.ovr >= 88))
show('Established abroad (78-82, 24-29)', ps.filter((p) => p.ovr >= 78 && p.ovr <= 82 && w.clubs[p.clubId].country !== 'England' && ageOn(p.dob, w.date) >= 24 && ageOn(p.dob, w.date) <= 29))
show('Premier League squad players', ps.filter((p) => w.clubs[p.clubId].leagueId === w.clubs[w.userClubId].leagueId && p.ovr < 76))
show('Unknown youth abroad (≤19, <68)', ps.filter((p) => ageOn(p.dob, w.date) <= 19 && p.ovr < 68 && w.clubs[p.clubId].country !== 'England'))
const width = (l: typeof ps) => (l.reduce((a, p) => { const [lo, hi] = potRange(w, p); return a + hi - lo }, 0) / Math.max(1, l.length)).toFixed(1)
console.log('\navg shown width: stars', width(ps.filter((p) => p.ovr >= 86)), '| 24-29 abroad', width(ps.filter((p) => ageOn(p.dob, w.date) >= 24 && ageOn(p.dob, w.date) <= 29 && w.clubs[p.clubId].country !== 'England')), '| u20 abroad', width(ps.filter((p) => ageOn(p.dob, w.date) <= 19 && w.clubs[p.clubId].country !== 'England')))
