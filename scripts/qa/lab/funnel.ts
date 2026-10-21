// The possession funnel: spells per team-match, how far they get, and how many end in a shot (one PL season).
import { freshWorld, play } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
const w = freshWorld()
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === 13)!
MatchSim.dbg = {}
let n = 0
for (const fid of comp.fixtures) { const f = w.fixtures[fid]; play(w, f.home, f.away, 277, { compId: comp.id }); n++ }
const D = MatchSim.dbg!
const per = (k: string) => ((D[k] || 0) / n / 2).toFixed(1)
const sp = D.sp || 1
const pc = (k: string) => Math.round(((D[k] || 0) / sp) * 100) + '%'
console.log(`spells ${per('sp')} · reach 33 ${pc('sp33')} 50 ${pc('sp50')} 66 ${pc('sp66')} 75 ${pc('sp75')} 84 ${pc('sp84')} · with a shot ${pc('spShot')} · actions ${per('acts')} · challenges ${per('challenge')} · carries ${per('carry')}`)
const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']
console.log('passes: ' + kinds.map((k) => `${k} ${per('pass.' + k)} (${Math.round(((D['passL.' + k] || 0) / Math.max(1, D['pass.' + k] || 0)) * 100)}%)`).join(' · '))
console.log('lost by zone x/10: ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => per('lost' + z)).join(' '))
console.log('box passes ' + per('boxPass') + ' ok ' + Math.round((D.boxPassP || 0) / Math.max(1, D.boxPass || 0) * 100) + '% · into 80+ ' + per('p80') + ' ok ' + Math.round((D.p80P || 0) / Math.max(1, D.p80 || 0) * 100) + '% · carries into box ' + per('boxCarry'))
