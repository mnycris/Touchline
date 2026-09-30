// Fixture congestion audit: per club, games on the same day or with too little rest, over a played season.
// npx tsx scripts/qa/clashes.ts [club]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { diffDays } from '../../src/domain/dates'
import { NT_BASE } from '../../src/engine/world/international'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.name.includes(process.argv[2] || 'Real Madrid'))!.id
const w = createWorld(raw, {
  clubId: club,
  manager: { firstName: 'A', lastName: 'B', nationality: 'Spain', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } } as any,
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any,
  seed: 3,
})
careerIntro(w)
const all = new Map<string, any>()
let guard = 0
const season = w.season
while (w.season === season && guard++ < 3000) {
  for (const f of Object.values(w.fixtures)) all.set(f.id, f)
  const r = advance(w, w.date >= `${season + 1}-05-20` ? 1 : 400)
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
  for (const m of w.inbox) m.read = true
}
const byClub = new Map<number, any[]>()
for (const f of all.values()) {
  if (f.home >= NT_BASE) continue
  for (const c of [f.home, f.away]) { const a = byClub.get(c) || []; a.push(f); byClub.set(c, a) }
}
const kinds: Record<string, number> = {}
const samples: string[] = []
for (const [c, list] of byClub) {
  list.sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 1; i < list.length; i++) {
    const gap = diffDays(list[i].date, list[i - 1].date)
    if (gap >= 2) continue
    const a = w.competitions[list[i - 1].compId]?.format || list[i - 1].compId.split('-')[0], b = w.competitions[list[i].compId]?.format || list[i].compId.split('-')[0]
    const k = `${gap === 0 ? 'same day' : 'next day'} ${a}+${b}`
    kinds[k] = (kinds[k] || 0) + 1
    if (samples.length < 14) samples.push(`${w.clubs[c]?.short}: ${list[i - 1].date} ${list[i - 1].compId} ${list[i - 1].roundName} | ${list[i].date} ${list[i].compId} ${list[i].roundName}`)
  }
}
console.log('clashes (<48h between games):', kinds)
console.log(samples.join('\n'))
// matchday order for the user's league
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club))!
const mine = [...all.values()].filter((f) => f.compId === lg.id && (f.home === club || f.away === club)).sort((a, b) => a.date.localeCompare(b.date))
const moved = [...all.values()].filter((f) => f.moved)
console.log('moved fixtures:', moved.length, 'early', moved.filter((f) => f.moved.kind === 'early').length, 'late', moved.filter((f) => f.moved.kind === 'late').length)
console.log(moved.slice(0, 8).map((f) => `${f.compId} ${f.roundName} ${w.clubs[f.home]?.short} v ${w.clubs[f.away]?.short}: ${f.moved.from} -> ${f.date} (${f.moved.reason})`).join('\n'))
const msgs = w.inbox.filter((m) => /rescheduled/.test(m.subject))
console.log('user reschedule messages:', msgs.length, msgs[0]?.body.slice(0, 220))
console.log('user league order:', mine.map((f) => f.roundName.replace('Matchday ', '')).join(' '))
