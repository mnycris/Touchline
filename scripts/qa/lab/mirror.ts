// Style against style with the players taken out of it: a club against a copy of itself (neutral venue), one side on
// style A and the other on style B. Each style should have its strengths and costs; none should run away with it.
//   CLUB='Brighton' npx tsx scripts/qa/lab/mirror.ts [n=150]
import { freshWorld } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { hashString } from '../../../src/domain/rng'
import { DEFAULT_TACTICS } from '../../../src/domain/constants'
import type { Fixture, TeamTactics } from '../../../src/domain/types'
const n = Number(process.argv[2] || 150)
const w = freshWorld()
const C = Object.values(w.clubs).find((c) => !c.national && (c.short === (process.env.CLUB || 'Brighton') || c.name === process.env.CLUB))!
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(C.id))!
const f: Fixture = { id: 'mirror', compId: comp.id, home: C.id, away: C.id, date: '2026-10-10', played: false } as Fixture
const base0 = sideInput(w, C.id, comp, false)
import { buildSheet } from '../../../src/engine/match/selection'
// FA / FB: the formation each side plays (the XI picked for it); default the club's own
const withForm = (id?: string) => { if (!id) return base0; const s = buildSheet(w, C, id, base0.sheet.tactics, { comp }); const players = { ...base0.players }; for (const p of [...s.lineup, ...s.bench]) players[p] = w.players[p]; return { ...base0, players, sheet: { ...base0.sheet, formation: s.formation, lineup: s.lineup, bench: s.bench, roles: s.roles } } }
const baseA = withForm(process.env.FA), baseB = withForm(process.env.FB)
const base = base0
const D: TeamTactics = { ...DEFAULT_TACTICS, ...base.sheet.tactics, mentality: 'Balanced', buildUp: 'Balanced', chanceCreation: 'Balanced', lineHeight: 50, pressing: 50, tempo: 50, defApproach: 'Balanced', width: 55, playersInBox: 4 } as TeamTactics
const S: Record<string, Partial<TeamTactics>> = {
  balanced: {},
  possession: { buildUp: 'Short Passing', chanceCreation: 'Possession', tempo: 40, lineHeight: 65, pressing: 62, defApproach: 'High' },
  'possession-def': { buildUp: 'Short Passing', chanceCreation: 'Possession', tempo: 45, lineHeight: 61, pressing: 58, mentality: 'Defensive' },
  counter: { buildUp: 'Counter', chanceCreation: 'Direct Passing', tempo: 78, lineHeight: 41, pressing: 46, defApproach: 'Deep', mentality: 'Attacking' },
  'counter-bal': { buildUp: 'Counter', chanceCreation: 'Direct Passing', tempo: 70, lineHeight: 38, pressing: 40, defApproach: 'Deep' },
  'deep only': { lineHeight: 41, pressing: 46, defApproach: 'Deep' },
  'direct only': { buildUp: 'Counter', chanceCreation: 'Direct Passing', tempo: 78 },
  'attacking': { mentality: 'Attacking' },
  'defensive': { mentality: 'Defensive' },
  'low block': { buildUp: 'Long Ball', chanceCreation: 'Direct Passing', tempo: 40, lineHeight: 18, pressing: 21, defApproach: 'Deep', mentality: 'Defensive' },
  'high press': { buildUp: 'Balanced', chanceCreation: 'Forward Runs', tempo: 72, lineHeight: 78, pressing: 88, defApproach: 'Aggressive' },
}
const pairs = (process.env.STYLES || 'possession-def:counter;possession:counter-bal;balanced:counter;possession:low block;high press:counter;balanced:possession;balanced:high press;balanced:low block').split(';').map((x) => x.split(':'))
console.log(`${C.name} v itself, neutral venue, ${n} each (A's view)`)
for (const [a, b] of pairs) {
  const res = [0, 0, 0]; let xa = 0, xb = 0, pa = 0, sa = 0, sb = 0
  const how: Record<string, number[]>[] = [{}, {}]
  const F = !!process.env.FUNNEL
  const dd: Record<string, number>[] = [{}, {}]
  for (let i = 0; i < n; i++) {
    const ctx = matchContext(w, f, false); ctx.userSide = -1; ctx.neutral = true
    // alternate which side is listed first so that kick-off and the like even out
    const flip = i % 2 === 1
    const A = { ...baseA, sheet: { ...baseA.sheet, tactics: { ...D, ...S[a] } as TeamTactics } }, B = { ...baseB, sheet: { ...baseB.sheet, tactics: { ...D, ...S[b] } as TeamTactics } }
    if (F) MatchSim.dbg = {}
    const r = new MatchSim(flip ? B : A, flip ? A : B, ctx, hashString(`m${i}`)).runToEnd()
    if (F) { for (const [k, v] of Object.entries(MatchSim.dbg!)) { const m = /^s([01])\.(.*)$/.exec(k); if (!m) continue; const who = Number(m[1]) === (flip ? 1 : 0) ? 0 : 1; dd[who][m[2]] = (dd[who][m[2]] || 0) + v / n } MatchSim.dbg = null }
    const ia = flip ? 1 : 0, ib = 1 - ia
    res[r.score[ia] > r.score[ib] ? 0 : r.score[ia] === r.score[ib] ? 1 : 2]++
    for (const e of r.events) if (e.xg !== undefined && ['chance', 'save', 'miss', 'woodwork', 'goal'].includes(e.type) && (e.side === 0 || e.side === 1)) { const h = (how[e.side === ia ? 0 : 1][e.how || '?'] ||= [0, 0]); h[0] += 1 / n; h[1] += e.xg / n }
    xa += r.stats[ia].xg / n; xb += r.stats[ib].xg / n; pa += r.stats[ia].possession / n; sa += r.stats[ia].shots / n; sb += r.stats[ib].shots / n
  }
  console.log(`  ${a.padEnd(15)} v ${b.padEnd(12)} W/D/L ${Math.round((res[0] / n) * 100)}/${Math.round((res[1] / n) * 100)}/${Math.round((res[2] / n) * 100)} · pts ${((res[0] * 3 + res[1]) / n).toFixed(2)} · xG ${xa.toFixed(2)}–${xb.toFixed(2)} · shots ${sa.toFixed(1)}–${sb.toFixed(1)} · poss ${pa.toFixed(0)}%`)
  if (F) for (const k of [0, 1]) { const q = dd[k], sp = q.sp || 1, pc = (x: string) => Math.round(((q[x] || 0) / sp) * 100) + '%'; const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']; console.log(`     ${(k ? b : a).padEnd(14)} spells ${sp.toFixed(0)} · reach 50 ${pc('sp50')} 66 ${pc('sp66')} 75 ${pc('sp75')} 84 ${pc('sp84')} · shot ${pc('spShot')} · ` + kinds.map((x) => `${x} ${(q['pass.' + x] || 0).toFixed(0)} (${Math.round(((q['passL.' + x] || 0) / Math.max(1, q['pass.' + x] || 0)) * 100)}%)`).join(' ') + ' · pass% by third ' + [0, 1, 2].map((z) => `${(q['pz' + z] || 0).toFixed(0)}@${Math.round(((q['pzL' + z] || 0) / Math.max(1, q['pz' + z] || 0)) * 100)}%`).join(' ') + ` into final third ${(q.pin3 || 0).toFixed(0)}@${Math.round(((q.pin3L || 0) / Math.max(1, q.pin3 || 0)) * 100)}%` + ` · cp ${(q.cpN || 0).toFixed(0)}× ${((q.cpV || 0) / Math.max(1, q.cpN || 0)).toFixed(2)} near ${((q.cpNear || 0) / Math.max(1, q.cpN || 0)).toFixed(1)} looks ${(q.cpTry || 0).toFixed(1)} pr ${((q.cpPr || 0) / Math.max(1, q.cpTry || 0)).toFixed(2)} wins ${(q.cpWin || 0).toFixed(1)}` + ' · shooters ' + ['CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'].map((g) => `${g} ${(q['gsh.' + g] || 0).toFixed(1)}(${(q['gshb.' + g] || 0).toFixed(1)} in box)`).join(' ') + ' · receivers ' + ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'].map((g) => `${g} ${(q['rcv.' + g] || 0).toFixed(0)}@${Math.round(((q['rcvL.' + g] || 0) / Math.max(1, q['rcv.' + g] || 0)) * 100)}% x${((q['rcvX.' + g] || 0) / Math.max(1, q['rcv.' + g] || 0)).toFixed(0)}`).join(' ') + ' · entries ' + Object.entries(q).filter(([k]) => k.startsWith('ent.')).map(([k, v]) => `${k.slice(4) || '?'} ${v.toFixed(1)}`).join(' ') + ' · starts own/mid/att ' + [0, 1, 2].map((z) => { const nz = Math.max(1, q['sz' + z] || 0), r = (k: string) => Math.round(((q['sz' + z + k] || 0) / nz) * 100); return `${(q['sz' + z] || 0).toFixed(0)} [→50 ${r('r50')}% →66 ${r('r66')}% →84 ${r('r84')}% shot ${Math.round(((q['szShot' + z] || 0) / nz) * 100)}%]` }).join(' ') + ' · decisions/pressure by zone ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => `${(q['zx' + z] || 0).toFixed(0)}/${((q['prz' + z] || 0) / Math.max(1, q['zx' + z] || 0)).toFixed(2)}`).join(' ') + ' · lost ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => (q['lost' + z] || 0).toFixed(1)).join(' ')) }
  if (process.env.HOW) for (const k of [0, 1]) console.log('     ' + (k ? b : a).padEnd(12) + Object.entries(how[k]).sort((x, y) => y[1][1] - x[1][1]).map(([h, v]) => `${h} ${v[0].toFixed(1)}/${v[1].toFixed(2)}`).join(' · '))
}
