// Transfer centre, headless: stories through a window, why deals fail, realism of moves, and an exact reversal.
// npx tsx scripts/qa/transfer-centre.ts [until-date]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { reverseDeal, moveAppeal } from '../../src/engine/world/market'
import { aiMarketStats } from '../../src/engine/world/transfers'
import { diffDays } from '../../src/domain/dates'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const until = process.argv[2] || '2026-09-02'
const w = createWorld(raw, {
  clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id,
  manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } } as any,
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any,
  seed: 21,
})
careerIntro(w)
const t0 = Date.now()
const snaps: string[] = []
let guard = 0
while (w.date < until && guard++ < 3000) {
  const r = advance(w, Math.max(1, Math.min(7, diffDays(until, w.date))))
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
  for (const m of w.inbox) m.read = true
  const st = w.market!.stories
  const by: Record<string, number> = {}
  for (const s of st) by[s.stage] = (by[s.stage] || 0) + 1
  if (snaps.length < 40) snaps.push(`${w.date} ${JSON.stringify(by)}`)
}
console.log(snaps.filter((_, i) => i % 3 === 0).join('\n'))
console.log(`simulated to ${w.date} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
const st = w.market!.stories
const failed = st.filter((s) => s.stage === 'failed')
const why: Record<string, number> = {}
for (const s of failed) { const k = s.log[s.log.length - 1].note.replace(/[A-Z][\w.'’ -]+?(?= (turns|isn|fails|can|are|will|refuse|only|went|couldn|ran|is no longer|joined))/g, 'X').replace(/€[\d.,]+[MK]?/g, '€').slice(0, 70); why[k] = (why[k] || 0) + 1 }
console.log('failed reasons:', Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 14))
const done = st.filter((s) => s.stage === 'done')
console.log('done stories', done.length, 'history transfers this season', w.transfers.history.filter((h) => h.season === w.season && (h.type === 'transfer' || h.type === 'free' || h.type === 'loan')).length)
console.log('ai stats', Object.entries(aiMarketStats).sort((a, b) => b[1] - a[1]).slice(0, 12))
// some big done deals with their journeys
for (const s of done.filter((s) => (s.fee || 0) >= 25e6).slice(0, 4)) console.log(`\n${w.players[s.playerId]?.name} ${w.clubs[s.from]?.short} → ${w.clubs[s.to]?.short} €${((s.fee || 0) / 1e6).toFixed(1)}M\n  ${s.log.map((l) => `${l.date} [${l.stage}] ${l.note}`).join('\n  ')}`)
// the decision model on a settled star
const star = Object.values(w.players).filter((p) => p.ovr >= 86 && p.clubId).sort((a, b) => b.ovr - a.ovr)[0]
const mid = Object.values(w.clubs).filter((c) => c.leagueId && c.reputation < w.clubs[star.clubId].reputation - 15 && c.finance.transferBudget > 80e6)[0]
if (star && mid) { const a = moveAppeal(w, star, mid.id); console.log(`\n${star.name} (${w.clubs[star.clubId].short}) to ${mid.short}: ${a.score}`, a.reasons.slice(0, 6).map((r) => `${r.v > 0 ? '+' : ''}${r.v} ${r.text}`)) }
// reversal: everything back as it was
const rev = done.find((s) => s.undo && s.fee && s.fee > 5e6 && !s.undo.swap && w.players[s.playerId]?.clubId === s.to)
if (rev) {
  const p = w.players[rev.playerId], from = w.clubs[rev.from], to = w.clubs[rev.to]
  const b = { fromBal: from.finance.balance, toBal: to.finance.balance, fromBud: from.finance.transferBudget, toBud: to.finance.transferBudget, hist: w.transfers.history.length, news: w.news.length }
  const r = reverseDeal(w, rev.id)
  console.log('\nreverse:', r.text, { back: p.clubId === rev.from, fromBal: Math.round((from.finance.balance - b.fromBal) / 1e5) / 10, toBal: Math.round((to.finance.balance - b.toBal) / 1e5) / 10, fee: (rev.undo!.fee / 1e6).toFixed(1), fromBud: Math.round((from.finance.transferBudget - b.fromBud) / 1e5) / 10, toBud: Math.round((to.finance.transferBudget - b.toBud) / 1e5) / 10, hist: w.transfers.history.length - b.hist, news: w.news.length - b.news, storyGone: !w.market!.stories.includes(rev), contract: p.contract.until, wage: p.wage })
}
