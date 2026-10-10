// A league season with the full engine: per-appearance touches, key passes, xA and assists for the top creators,
// against the league's regulars by position group.  npx tsx scripts/qa/lab/creators.ts [league=53]
import { freshWorld, play } from '../engine-lab'
const lg = Number(process.argv[2] || 53)
const w = freshWorld()
const comp = Object.values(w.competitions).find((c) => c.id === `L${lg}-2026`)!
const agg: Record<number, { n: number; t: number; kp: number; xa: number; a: number; g: number; sh: number; pos: string }> = {}
for (const id of comp.fixtures) {
  const f = w.fixtures[id]
  const { r } = play(w, f.home, f.away, 1, { compId: comp.id })
  for (const s of r.players) {
    if (s.mins < 60) continue
    const q = (agg[s.id] ||= { n: 0, t: 0, kp: 0, xa: 0, a: 0, g: 0, sh: 0, pos: s.pos })
    q.n++; q.t += (s as any).touches || 0; q.kp += s.keyPasses; q.xa += (s as any).xa || 0; q.a += s.assists; q.g += s.goals; q.sh += s.shots
  }
}
const rows = Object.entries(agg).filter(([, q]) => q.n >= 20).map(([id, q]) => ({ name: w.players[+id].name, ...q }))
const per = (q: any, k: string) => (q[k] / q.n).toFixed(2)
console.log('top by assists/app')
for (const q of rows.sort((a, b) => b.a / b.n - a.a / a.n).slice(0, 12)) console.log(`${q.name.padEnd(24)} ${q.pos.padEnd(4)} apps ${q.n} A ${q.a} (${per(q, 'a')}) xA ${per(q, 'xa')} KP ${per(q, 'kp')} touches ${per(q, 't')} G ${q.g}`)
const grp: Record<string, number[]> = {}
for (const q of rows) (grp[q.pos] ||= []).push(q.kp / q.n)
console.log('key passes/app by slot position (median, p90):', Object.entries(grp).map(([k, v]) => { v.sort((a, b) => a - b); return `${k} ${v[Math.floor(v.length / 2)].toFixed(2)}/${v[Math.floor(v.length * 0.9)].toFixed(2)}` }).join(' · '))
