// AI recruitment sanity: who signed more than one player for the same line in a window, and keepers per squad.
// npx tsx scripts/qa/squad-buys.ts <save> [since YYYY-MM-DD]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { rosterOf } from '../../src/engine/world/roster'
const [file, since = '2026-06-01'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const LINE = (pos: string) => (/^(RB|LB|RWB|LWB)$/.test(pos) ? 'FB' : /^(RW|LW|RM|LM)$/.test(pos) ? 'W' : pos === 'CF' ? 'ST' : pos)
const ins = w.transfers.history.filter((t) => t.date >= since && (t.type === 'transfer' || t.type === 'free' || t.type === 'loan' || t.type === 'loan-buy') && w.clubs[t.to] && !w.clubs[t.to].national)
const by = new Map<string, typeof ins>()
for (const t of ins) { const p = w.players[t.playerId]; if (!p) continue; const k = `${t.to}|${LINE(p.positions[0])}`; by.set(k, [...(by.get(k) || []), t]) }
let multi = 0, gk2 = 0
const rows: string[] = []
for (const [k, list] of by) {
  if (list.length < 2) continue
  multi++
  const [club, line] = k.split('|')
  if (line === 'GK') gk2++
  rows.push(`${w.clubs[+club].short.padEnd(16)} ${line.padEnd(3)} ×${list.length}: ${list.map((t) => `${t.date.slice(5)} ${w.players[t.playerId]?.name} (${w.players[t.playerId]?.ovr})`).join(', ')}`)
}
console.log(`${ins.length} incoming moves since ${since}; ${multi} club-lines with 2+ signings (${gk2} for keepers)`)
for (const r of rows.sort().slice(0, 40)) console.log(' ', r)
const gks = Object.values(w.clubs).filter((c) => c.leagueId && !c.national && w.leagues[c.leagueId]?.level <= 2).map((c) => ({ c, n: rosterOf(w, c.id).filter((p) => p.positions[0] === 'GK' && !p.academy).length }))
const hist: Record<number, number> = {}; for (const x of gks) hist[x.n] = (hist[x.n] || 0) + 1
console.log('senior keepers per club (top two divisions):', hist, 'most:', gks.sort((a, b) => b.n - a.n).slice(0, 5).map((x) => `${x.c.short} ${x.n}`).join(', '))
