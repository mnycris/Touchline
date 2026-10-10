// Big-side fixtures: are matches between two good possession sides played out as real ones are (shots, xG, passes)?
// npx tsx scripts/qa/lab/bigs.ts [n=20]
import { freshWorld, play } from '../engine-lab'
const N = Number(process.argv[2] || 20)
const w = freshWorld()
const c = (n: string) => Object.values(w.clubs).find((x) => !x.national && (x.short === n || x.name.includes(n)))!
const pairs = (process.env.PAIRS || 'Man City:Arsenal,Liverpool:Chelsea,Arsenal:Liverpool,Real Madrid:Barcelona,Bayern:Dortmund,Inter:Napoli,PSG:Marseille,Man City:Brentford,Arsenal:Burnley,Everton:Brentford').split(',')
for (const pr of pairs) {
  const [h, a] = pr.split(':').map(c)
  const rs = Array.from({ length: N }, (_, i) => play(w, h.id, a.id, 300 + i).r)
  const m = (f: (r: any) => number) => (rs.reduce((x, r) => x + f(r), 0) / rs.length).toFixed(1)
  const sh = h.sheets.find((s) => s.id === h.activeSheet)!.tactics, sa = a.sheets.find((s) => s.id === a.activeSheet)!.tactics
  console.log(`${pr.padEnd(22)} ${m((r) => r.score[0])}-${m((r) => r.score[1])}  shots ${m((r) => r.stats[0].shots)}-${m((r) => r.stats[1].shots)}  xg ${m((r) => r.stats[0].xg)}-${m((r) => r.stats[1].xg)}  poss ${m((r) => r.stats[0].possession)}  passes ${m((r) => r.stats[0].passes)}-${m((r) => r.stats[1].passes)}  | ${sh.buildUp}/${sh.chanceCreation}/${sh.defApproach}${sh.lineHeight} v ${sa.buildUp}/${sa.chanceCreation}/${sa.defApproach}${sa.lineHeight}`)
}
