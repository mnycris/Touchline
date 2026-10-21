// Where does an outclassed side's football go? One fixture many times: per side, the shots and xG by how they came,
// possession, corners, and the spread of each from match to match.
//   PAIRS='Real Madrid,Elche;Man City,Burnley' npx tsx scripts/qa/lab/mismatch.ts [n=120]
import { freshWorld, play } from '../engine-lab'

const n = Number(process.argv[2] || 120)
const w = freshWorld()
const club = (name: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name))!
const f2 = (x: number) => x.toFixed(2)
const pairs = (process.env.PAIRS || 'Real Madrid,Elche;Man City,Burnley;Arsenal,Brighton').split(';').map((x) => x.split(','))
for (const [h, a] of pairs) {
  const H = club(h), A = club(a)
  const by: Record<string, number[]>[] = [{}, {}]
  const st: Record<string, number>[] = [{}, {}]
  const res = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const { r } = play(w, H.id, A.id, 20000 + i)
    res[r.score[0] > r.score[1] ? 0 : r.score[0] === r.score[1] ? 1 : 2]++
    for (const s of [0, 1] as const) {
      for (const k of ['possession', 'shots', 'sot', 'xg', 'corners', 'passes']) st[s][k] = (st[s][k] || 0) + ((r.stats[s] as any)[k] || 0) / n
      for (const e of r.events) {
        if (e.side !== s || e.xg === undefined || !['chance', 'save', 'miss', 'woodwork', 'goal'].includes(e.type)) continue
        const k = e.how || 'open'
        const b = (by[s][k] ||= [0, 0, 0])
        b[0] += 1 / n; b[1] += e.xg / n; if (e.type === 'goal') b[2] += 1 / n
      }
    }
  }
  console.log(`\n${h} v ${a}: W/D/L ${Math.round((res[0] / n) * 100)}/${Math.round((res[1] / n) * 100)}/${Math.round((res[2] / n) * 100)}`)
  for (const s of [0, 1] as const) {
    console.log(`  ${(s ? a : h).padEnd(12)} poss ${st[s].possession.toFixed(0)} shots ${st[s].shots.toFixed(1)} sot ${st[s].sot.toFixed(1)} xG ${f2(st[s].xg)} corners ${st[s].corners.toFixed(1)} passes ${st[s].passes.toFixed(0)}`)
    console.log('    ' + Object.entries(by[s]).sort((x, y) => y[1][1] - x[1][1]).map(([k, v]) => `${k} ${v[0].toFixed(2)}/${f2(v[1])}/${f2(v[2])}`).join(' · '))
  }
}

// the possession funnel per side (engine counters): how far each side's spells get, how they end, its passing
if (process.env.FUNNEL) {
  const { MatchSim } = await import('../../../src/engine/match/engine')
  for (const [h, a] of pairs) {
    const H = club(h), A = club(a)
    MatchSim.dbg = {}
    const m = Math.min(n, 60)
    for (let i = 0; i < m; i++) play(w, H.id, A.id, 20000 + i)
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    console.log(`\n${h} v ${a} funnel (${m} matches)`)
    for (const s of [0, 1]) {
      const q = `s${s}.`, sp = D[q + 'sp'] || 1
      const pc = (k: string) => Math.round(((D[q + k] || 0) / sp) * 100) + '%'
      console.log(`  ${(s ? a : h).padEnd(12)} spells ${(sp / m).toFixed(1)} · reach 33 ${pc('sp33')} 50 ${pc('sp50')} 66 ${pc('sp66')} 75 ${pc('sp75')} 84 ${pc('sp84')} · shot ${pc('spShot')}`)
      const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']
      console.log('    passes ' + kinds.map((k) => `${k} ${((D[q + 'pass.' + k] || 0) / m).toFixed(0)} (${Math.round(((D[q + 'passL.' + k] || 0) / Math.max(1, D[q + 'pass.' + k] || 0)) * 100)}%)`).join(' · '))
      console.log('    lost by zone ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => ((D[q + 'lost' + z] || 0) / m).toFixed(1)).join(' '))
      const nz = (z: number) => Math.max(1, D[q + 'sz' + z] || 0), rz = (z: number, k: string) => Math.round(((D[q + 'sz' + z + k] || 0) / nz(z)) * 100)
      console.log('    starts own/mid/att ' + [0, 1, 2].map((z) => `${((D[q + 'sz' + z] || 0) / m).toFixed(0)} [→66 ${rz(z, 'r66')}% →84 ${rz(z, 'r84')}% shot ${Math.round(((D[q + 'szShot' + z] || 0) / nz(z)) * 100)}%]`).join(' ') + ' · entries ' + Object.entries(D).filter(([k]) => k.startsWith(q + 'ent.')).map(([k, v]) => `${k.slice(q.length + 4)} ${(v / m).toFixed(1)}`).join(' '))
      console.log('    decisions by zone ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => ((D[q + 'zx' + z] || 0) / m).toFixed(0)).join(' ') + ' · pressure ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => ((D[q + 'prz' + z] || 0) / Math.max(1, D[q + 'zx' + z] || 0)).toFixed(2)).join(' '))
    }
  }
}
if (process.env.SHOTS) {
  const { MatchSim } = await import('../../../src/engine/match/engine')
  for (const [h, a] of pairs) {
    const H = club(h), A = club(a)
    MatchSim.dbg = {}
    const m = Math.min(n, 60)
    for (let i = 0; i < m; i++) play(w, H.id, A.id, 20000 + i)
    const D = MatchSim.dbg!
    MatchSim.dbg = null
    console.log(`\n${h} v ${a} shot decisions (${m} matches)`)
    for (const s of [0, 1]) {
      const q = `s${s}.`
      console.log(`  ${(s ? a : h).padEnd(12)} ` + [6, 7, 8, 9].map((z) => { const c = D[q + 'sc' + z] || 0; return `${z}0s: ${(c / m).toFixed(1)} looks, shoots ${Math.round(((D[q + 'sp' + z] || 0) / Math.max(1, c)) * 100)}%, xg0 ${((D[q + 'sx' + z] || 0) / Math.max(1, c)).toFixed(3)}, crowd ${((D[q + 'scr' + z] || 0) / Math.max(1, c)).toFixed(1)}, box bal ${((D[q + 'sbb' + z] || 0) / Math.max(1, c)).toFixed(1)}` }).join(' | '))
    }
  }
}
