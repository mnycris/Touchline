// AI market check: plays to the end of the summer window and reports what clubs bought and why.
// A key midfielder is taken from a club first (as if the user bought him) to check the club reacts.
// Run: npx tsx scripts/qa/market.ts [victim club name] [seed]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { executeTransfer, makeOffer } from '../../src/engine/world/transfers'
import * as TR from '../../src/engine/world/transfers'
import { finStyle, planRole, squadPlan } from '../../src/engine/world/squadPlan'
import { aiMarketStats } from '../../src/engine/world/transfers'
import { POS_GROUP } from '../../src/domain/constants'
import { fmtMoney } from '../../src/domain/finance'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const victimName = process.argv[2] || 'Liverpool'
const seed = Number(process.argv[3] || 7)
const userClub = raw.clubs.find((c) => c.name.includes('Crystal Palace'))!.id
const w = createWorld(raw, {
  clubId: userClub,
  manager: { firstName: 'Alex', lastName: 'Ferris', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
  seed,
})
careerIntro(w)
const victim = Object.values(w.clubs).find((c) => c.name.includes(victimName))!
const plan0 = squadPlan(w, victim)
console.log(`${victim.name} (${finStyle(w, victim)}) level ${plan0.level.toFixed(1)} budget ${fmtMoney(victim.finance.transferBudget)} wages ${fmtMoney(plan0.wageBill)}/${fmtMoney(victim.finance.wageBudget)}`)
console.log('  XI:', plan0.slots.map((s) => `${s.label}:${w.players[s.id!]?.name.split(' ').pop()} ${s.rating.toFixed(0)}`).join(' '))
console.log('  needs:', plan0.needs.map((n) => `${n.kind}@${n.pos}>=${n.minRating} p${n.priority.toFixed(1)}`).join(', ') || '-')
// take their best central midfielder
const mid = plan0.slots.filter((s) => s.id && (s.pos === 'CM' || s.pos === 'CDM' || s.pos === 'CAM')).sort((a, b) => b.rating - a.rating)[0]
const star = w.players[mid.id!]
console.log(`  -> user signs ${star.name} (${mid.pos}, ${planRole(plan0, star.id)})`)
const o = makeOffer(w, { playerId: star.id, fee: star.value, type: 'transfer', fromClubId: userClub })
o.userIsBuyer = true
executeTransfer(w, o)
const plan1 = squadPlan(w, victim)
console.log('  needs after:', plan1.needs.slice(0, 4).map((n) => `${n.kind}@${n.pos}>=${n.minRating} p${n.priority.toFixed(1)}`).join(', '))

const t0 = Date.now()
let aiMs = 0
const origDay = TR.aiTransferDay
void origDay
const startHist = w.transfers.history.length
const summer = w.windows.find((x) => x.name === 'Summer')!
let guard = 0
while (w.date <= summer.close && guard++ < 400) {
  const r = advance(w, 30)
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
  for (const m of w.inbox) m.read = true
}
const hist = w.transfers.history.slice(startHist)
console.log(`\nwindow done ${w.date} in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${hist.length} moves (${hist.filter((h) => h.type === 'transfer').length} transfers, ${hist.filter((h) => h.type === 'free').length} free)`)
const vIn = hist.filter((h) => h.to === victim.id)
console.log(`${victim.short} signed:`, vIn.map((h) => `${w.players[h.playerId]?.name} (${w.players[h.playerId]?.positions[0]} ${w.players[h.playerId]?.ovr}) ${fmtMoney(h.fee)}`).join(' | ') || 'nobody')
console.log(`${victim.short} budget now ${fmtMoney(victim.finance.transferBudget)}`)
// big-five summary: who bought what position vs their needs
for (const lid of [13, 53, 19, 31, 16]) {
  const clubs = Object.values(w.clubs).filter((c) => c.leagueId === lid)
  const ins = hist.filter((h) => clubs.some((c) => c.id === h.to))
  const groups: Record<string, number> = {}
  for (const h of ins) { const g = POS_GROUP[w.players[h.playerId]?.positions[0]]; groups[g] = (groups[g] || 0) + 1 }
  const spend = ins.reduce((a, h) => a + h.fee, 0)
  console.log(`league ${lid}: ${ins.length} in, spend ${fmtMoney(spend)}, by group ${JSON.stringify(groups)}`)
}
// a few clubs' business with their styles
for (const name of ['Manchester City', 'Chelsea', 'Real Madrid', 'Barcelona', 'Bayern', 'Brighton', 'Everton', 'Benfica', 'Ajax', 'Juventus']) {
  const c = Object.values(w.clubs).find((x) => x.name.includes(name))
  if (!c) continue
  const ins = hist.filter((h) => h.to === c.id), outs = hist.filter((h) => h.from === c.id)
  console.log(`${c.short.padEnd(12)} ${finStyle(w, c).padEnd(9)} in ${ins.length} (${fmtMoney(ins.reduce((a, h) => a + h.fee, 0))}) out ${outs.length} (${fmtMoney(outs.reduce((a, h) => a + h.fee, 0))}) budget ${fmtMoney(c.finance.transferBudget)} | ${ins.map((h) => `${w.players[h.playerId]?.name.split(' ').pop()} ${w.players[h.playerId]?.positions[0]}`).join(', ')}`)
}
const news = w.news.filter((n) => /replace/.test(n.headline)).slice(0, 6)
console.log('\nreplacement news:', news.map((n) => n.headline).join(' | ') || '-')
console.log('\nclub-day outcomes:', JSON.stringify(aiMarketStats))
{
  const plan = squadPlan(w, victim)
  console.log(`\n${victim.short} now: level ${plan.level.toFixed(1)} needs`, plan.needs.slice(0, 4).map((n) => `${n.kind}@${n.pos}>=${n.minRating} age<=${n.maxAge} p${n.priority.toFixed(1)} spend ${n.spend}`).join(', '))
  console.log('  lost:', JSON.stringify(victim.transferPolicy?.lost), 'review', victim.transferPolicy?.review)
  const need = plan.needs[0]
  if (need) {
    const { rng: _r } = { rng: 0 }; void _r
    const R = worldRng(w)
    const list = TR.findPlanTargets(w, victim, plan, need, R)
    console.log('  shortlist:', list.map((p) => `${p.name} ${p.positions.join('/')} ${p.ovr} @${w.clubs[p.clubId]?.short} ${p.contract.role} val ${fmtMoney(p.value)}`).join(' | ') || 'none')
    // what's out there at all
    const all = Object.values(w.players).filter((p) => p.positions.includes(need.pos) && p.ovr >= need.minRating - 1 && p.clubId !== victim.id).sort((a, b) => b.ovr - a.ovr).slice(0, 12)
    console.log('  market at pos:', all.map((p) => `${p.name.split(' ').pop()} ${p.ovr} ${w.clubs[p.clubId]?.short} ${p.contract.role}${p.transferListed ? ' L' : ''}`).join(', '))
  }
}
