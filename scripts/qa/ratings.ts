// Rating audit: do match ratings follow what players actually did? npx tsx scripts/qa/ratings.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
import { RGROUP } from '../../src/engine/match/rating'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 120)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 9 })
const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19', 'L31', 'L16'].includes(w.competitions[f.compId]?.key || '')).slice(0, N)
type Row = { g: string; r: number; won: number; st: any; gf: number; ga: number; name: string; team: string }
const rows: Row[] = []
for (const f of fx) {
  const r = createSim(w, f, false, true).runToEnd()
  for (const st of r.players) {
    if (st.mins < 60 || !st.started) continue
    const g = RGROUP[st.pos as keyof typeof RGROUP] || 'CM'
    const gf = st.side === 0 ? r.score[0] : r.score[1], ga = st.side === 0 ? r.score[1] : r.score[0]
    rows.push({ g, r: st.rating, won: gf > ga ? 1 : gf < ga ? -1 : 0, st, gf, ga, name: w.players[st.id]?.name || '', team: w.clubs[st.side === 0 ? f.home : f.away]?.short })
  }
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) }
console.log(`${fx.length} matches, ${rows.length} starters (60+ mins)`)
console.log('group  n    mean  sd    >=8   <6    win   draw  loss')
for (const g of ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST']) {
  const a = rows.filter((x) => x.g === g)
  if (!a.length) continue
  const rs = a.map((x) => x.r)
  console.log(`${g.padEnd(5)} ${String(a.length).padStart(4)}  ${mean(rs).toFixed(2)}  ${sd(rs).toFixed(2)}  ${(a.filter((x) => x.r >= 8).length / a.length * 100).toFixed(0).padStart(3)}%  ${(a.filter((x) => x.r < 6).length / a.length * 100).toFixed(0).padStart(3)}%  ${mean(a.filter((x) => x.won > 0).map((x) => x.r)).toFixed(2)}  ${mean(a.filter((x) => x.won === 0).map((x) => x.r)).toFixed(2)}  ${mean(a.filter((x) => x.won < 0).map((x) => x.r)).toFixed(2)}`)
}
const line = (x: Row) => { const s = x.st; return `${x.r.toFixed(1)} ${x.g} ${x.name} (${x.team} ${x.gf}-${x.ga}) g${s.goals} a${s.assists} sh${s.shots}/${s.sot} xg${s.xg} kp${s.keyPasses} pas${s.passesCompleted}/${s.passes} tk${s.tackles} int${s.interceptions} clr${s.clearances ?? ''} blk${s.blocks ?? ''} drb${s.dribblesOk ?? ''}/${s.dribbles ?? ''} du${s.duelsWon ?? ''}/${s.duels ?? ''} lost${s.possLost ?? ''} sv${s.saves} err${s.errors ?? ''} touches${s.touches ?? ''} bcm${s.bcm ?? ''} bcc${s.bcc ?? ''}${s.yellow ? ' YC' : ''}${s.red ? ' RC' : ''}${s.penConceded ? ' PENc' + s.penConceded : ''}${s.ownGoals ? ' OG' : ''} fl${s.fouls} ${x.st.pos}` }
const byR = [...rows].sort((a, b) => b.r - a.r)
console.log('\nTOP 12'); for (const x of byR.slice(0, 12)) console.log(' ', line(x))
console.log('\nBOTTOM 10'); for (const x of byR.slice(-10)) console.log(' ', line(x))
console.log('\nquiet but high (no G/A, >=7.6)'); for (const x of byR.filter((x) => x.r >= 7.6 && !x.st.goals && !x.st.assists).slice(0, 10)) console.log(' ', line(x))
console.log('\nscored but low (<7.0)'); for (const x of byR.filter((x) => x.r < 7.0 && x.st.goals > 0).slice(0, 8)) console.log(' ', line(x))
console.log('\nkeepers conceding 3+ rated >= 6.8'); for (const x of byR.filter((x) => x.g === 'GK' && x.ga >= 3 && x.r >= 6.8).slice(0, 6)) console.log(' ', line(x))
// sensitivity to the result: same contribution, different result
const quiet = rows.filter((x) => !x.st.goals && !x.st.assists && x.g !== 'GK')
console.log('\nno-contribution outfielders: win', mean(quiet.filter((x) => x.won > 0).map((x) => x.r)).toFixed(2), 'loss', mean(quiet.filter((x) => x.won < 0).map((x) => x.r)).toFixed(2))
// how much do individual defensive numbers move defenders' ratings?
const cb = rows.filter((x) => x.g === 'CB')
const corr = (xs: number[], ys: number[]) => { const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2 } return a / Math.sqrt(b * c) }
const def = (x: Row) => (x.st.tackles || 0) + (x.st.interceptions || 0) + (x.st.clearances || 0) * 0.6 + (x.st.blocks || 0) + (x.st.aerialsWon || 0) * 0.5
console.log('CB rating vs defensive actions r =', corr(cb.map(def), cb.map((x) => x.r)).toFixed(2), '| vs goals against r =', corr(cb.map((x) => x.ga), cb.map((x) => x.r)).toFixed(2))
const att = rows.filter((x) => x.g === 'ST' || x.g === 'W')
console.log('ST/W rating vs xG r =', corr(att.map((x) => x.st.xg), att.map((x) => x.r)).toFixed(2), '| vs goals r =', corr(att.map((x) => x.st.goals), att.map((x) => x.r)).toFixed(2), '| vs touches r =', corr(att.map((x) => x.st.touches || 0), att.map((x) => x.r)).toFixed(2))
const mid = rows.filter((x) => x.g === 'CM' || x.g === 'DM')
console.log('CM/DM rating vs passes completed r =', corr(mid.map((x) => x.st.passesCompleted), mid.map((x) => x.r)).toFixed(2), '| vs key passes r =', corr(mid.map((x) => x.st.keyPasses), mid.map((x) => x.r)).toFixed(2), '| vs result r =', corr(mid.map((x) => x.won), mid.map((x) => x.r)).toFixed(2))
const gk = rows.filter((x) => x.g === 'GK')
console.log('GK rating vs saves r =', corr(gk.map((x) => x.st.saves), gk.map((x) => x.r)).toFixed(2), '| vs conceded r =', corr(gk.map((x) => x.ga), gk.map((x) => x.r)).toFixed(2))
// what each group actually does on average (the raw material the ratings are built from)
console.log('\ngroup  touch  pass   kp    shots xg    tk    int   clr   drb   duels lost')
for (const g of ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST']) {
  const a = rows.filter((x) => x.g === g); if (!a.length) continue
  const m = (k: string) => mean(a.map((x) => Number(x.st[k]) || 0))
  console.log(`${g.padEnd(5)} ${m('touches').toFixed(0).padStart(5)}  ${m('passesCompleted').toFixed(0).padStart(3)}/${m('passes').toFixed(0).padEnd(3)} ${m('keyPasses').toFixed(1).padStart(4)}  ${m('shots').toFixed(1).padStart(4)}  ${m('xg').toFixed(2)}  ${m('tackles').toFixed(1).padStart(4)}  ${m('interceptions').toFixed(1).padStart(4)}  ${m('clearances').toFixed(1).padStart(4)}  ${m('dribbles').toFixed(1).padStart(4)}  ${m('duels').toFixed(1).padStart(4)}  ${m('possLost').toFixed(1).padStart(4)}`)
}
const grp = process.argv[3]
if (grp) {
  const a = byR.filter((x) => x.g === grp)
  console.log(`\n${grp} lowest`); for (const x of a.slice(-12)) console.log(' ', line(x))
  console.log(`\n${grp} around the median`); for (const x of a.slice(Math.floor(a.length / 2) - 4, Math.floor(a.length / 2) + 4)) console.log(' ', line(x))
}
// substitutes: a short cameo should sit a little under a starter's average unless he does something
{
  const subs: number[] = []
  for (const f of fx.slice(0, 60)) { const r = createSim(w, f, false, true).runToEnd(); for (const st of r.players) if (!st.started && st.mins > 0) subs.push(st.rating) }
  console.log('\nsubstitutes', subs.length, 'mean', mean(subs).toFixed(2), 'sd', sd(subs).toFixed(2), '<6', (subs.filter((x) => x < 6).length / subs.length * 100).toFixed(0) + '%', '>=7.5', (subs.filter((x) => x >= 7.5).length / subs.length * 100).toFixed(0) + '%')
}
// the quick simulation (leagues not followed closely) should land on the same scale
{
  const q: Record<string, number[]> = {}
  for (const f of fx) { const r = simulateFixture(w, f, false); for (const st of r.players) { if (st.mins < 60 || !st.started) continue; const g = RGROUP[st.pos as keyof typeof RGROUP] || 'CM'; (q[g] ||= []).push(st.rating) } }
  console.log('quick sim   ', ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'].map((g) => `${g} ${mean(q[g] || []).toFixed(2)}±${sd(q[g] || []).toFixed(2)}`).join('  '))
}
// moving a player must never re-score what he already did: swap a centre-back and the striker mid-match
{
  let worst = 0, worstStep = 0
  for (const f of fx.slice(0, 30)) {
    const sim: any = createSim(w, f, false, true)
    while (sim.minute < 60 && !sim.finished) sim.step()
    const on = sim.sides[0].lps.filter((l: any) => l.on)
    const cb = on.find((l: any) => l.g === 'CB'), st = on.find((l: any) => l.g === 'ST' || l.g === 'W')
    if (!cb || !st) continue
    const before = new Map(sim.liveRatings(0).map((x: any) => [x.id, x.rating]))
    sim.swapPositions(0, cb.p.id, st.p.id)
    const after = new Map(sim.liveRatings(0).map((x: any) => [x.id, x.rating]))
    for (const id of [cb.p.id, st.p.id]) worst = Math.max(worst, Math.abs((after.get(id) as number) - (before.get(id) as number)))
    sim.step()
    const next = new Map(sim.liveRatings(0).map((x: any) => [x.id, x.rating]))
    for (const id of [cb.p.id, st.p.id]) worstStep = Math.max(worstStep, Math.abs((next.get(id) as number) - (after.get(id) as number)))
  }
  console.log(`position swap at 60': largest instant change ${worst.toFixed(2)}, largest change over the next minute ${worstStep.toFixed(2)}`)
}
