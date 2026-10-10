// Engine debug counters over a set of Premier League fixtures: where passes succeed, where possession is lost, how
// shots come about. Runs against whichever engine sits next to it (also usable from an old worktree).
// npx tsx scripts/qa/lab/dbg-zones.ts [matches=120]
import fs from 'node:fs'
import { createWorld } from '../../../src/data/createWorld'
import { MatchSim } from '../../../src/engine/match/engine'
import { createSim } from '../../../src/engine/world/matchRunner'
const N = Number(process.argv[2] || 120)
const raw = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const ars = raw.clubs.find((c: any) => c.dbName === 'Arsenal FC').id
const w = createWorld(raw, { clubId: ars, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' } as any, seed: 7 })
const d: Record<string, number> = {}
MatchSim.dbg = d
const comp = w.competitions['L13-2026']
for (const id of comp.fixtures.slice(0, N)) createSim(w, w.fixtures[id], false).runToEnd()
const per = (k: string) => (d[k] || 0) / N / 2
const f = (x: number) => x.toFixed(2)
console.log('decide/team', f(per('decide')), 'mean pressure', f((d.pr || 0) / (d.decide || 1)), 'challenges', f(per('challenge')))
console.log('weights: carry', f((d['w.carry'] || 0) / d.decide), 'drib', f((d['w.drib'] || 0) / d.decide), 'cross', f((d['w.cross'] || 0) / d.decide), 'cut', f((d['w.cut'] || 0) / d.decide))
const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']
console.log('passes/team', kinds.map((k) => `${k} ${f(per('pass.' + k))} (${Math.round((d['passL.' + k] || 0) / (d['pass.' + k] || 1) * 100)}%, open ${f((d['open.' + k] || 0) / (d['pass.' + k] || 1))})`).join(' · '))
console.log('decisions by zone x/10:', Array.from({ length: 10 }, (_, i) => f(per('zx' + i))).join(' '))
console.log('lost by zone x/10:     ', Array.from({ length: 10 }, (_, i) => f(per('lost' + i))).join(' '))
const hows = Object.keys(d).filter((k) => k.startsWith('shot.')).map((k) => k.slice(5))
console.log('shots/team by how', hows.sort((a, b) => (d['shot.' + b] || 0) - (d['shot.' + a] || 0)).map((h) => `${h} ${f(per('shot.' + h))}/${f((d['xg.' + h] || 0) / N / 2)}`).join(' · '))
console.log('box: passes in', f(per('boxPass')), '(p', f((d.boxPassP || 0) / (d.boxPass || 1)) + ')', 'carries in', f(per('boxCarry')), '| carries', f(per('carry')), 'avg dx', f((d.carryDx || 0) / (d.carry || 1)))
const xs = [60, 65, 70, 75, 80, 85, 90, 95]
console.log('shots/team by x', xs.map((x) => `${x}:${f(((d[`s0.shotx${x}`] || 0) + (d[`s1.shotx${x}`] || 0)) / N / 2)}`).join(' '))
console.log('pressure by zone x/10: ', Array.from({ length: 10 }, (_, i) => f((d['prz' + i] || 0) / (d['zx' + i] || 1))).join(' '))
console.log('shoot checks x/10 6-9:  ', [6, 7, 8, 9].map((i) => `${f(per('sc' + i))} p${f((d['sp' + i] || 0) / (d['sc' + i] || 1))} xg${((d['sx' + i] || 0) / (d['sc' + i] || 1)).toFixed(3)} cr${f((d['scr' + i] || 0) / (d['sc' + i] || 1))}`).join(' | '))
console.log('into 80+: passes', f(per('p80')), '(p', f((d.p80P || 0) / (d.p80 || 1)) + ')', kinds.map((k) => `${k} ${f(per('p80.' + k))}`).join(' '), '| carries', f(per('c80')))
console.log('funnel: spells/team', f(per('sp')), ['sp33', 'sp50', 'sp66', 'sp75', 'sp84', 'spShot'].map((k) => `${k.slice(2)} ${Math.round((d[k] || 0) / (d.sp || 1) * 1000) / 10}%`).join(' '))
