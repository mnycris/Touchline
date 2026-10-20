// Press outlets: every reporter has a name, the outlet is from the club's country (its local paper only for its
// clubs), and the questions go to outlets on their beat. npx tsx scripts/qa/press-outlets.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { pressQuestions } from '../../src/engine/world/press'
import { outletById, outletsFor } from '../../src/engine/world/outlets'
import type { World } from '../../src/domain/types'
const w: World = deserialize(fs.readFileSync(process.argv[2]))
let fails = 0
const ok = (c: boolean, what: string) => { if (!c) { fails++; console.log(`FAIL ${what}`) } }
const fx = Object.values(w.fixtures).filter((f) => f.home === w.userClubId || f.away === w.userClubId)
const pre = fx.filter((f) => !f.played).slice(0, 6), post = fx.filter((f) => f.played).slice(-6)
const seen = new Map<string, number>()
for (const [kind, list] of [['pre', pre], ['post', post]] as const) for (const f of list) for (let k = 0; k < 4; k++) {
  w.flags.pressCount = k
  for (const q of pressQuestions(w, kind, f.id)) {
    const o = outletById(q.outletId)
    ok(!!o && o.name === q.outlet, `outlet ${q.outlet} known`)
    ok(/^[A-ZÀ-Ž][\p{L}'-]+ [\p{L}' -]+$/u.test(q.reporter) && !/undefined/.test(q.reporter), `reporter name "${q.reporter}"`)
    ok(!!o && (o.country === w.clubs[w.userClubId].country || o.country === '_'), `${o?.name} from the club's country`)
    seen.set(`${q.reporter} · ${q.outlet}`, (seen.get(`${q.reporter} · ${q.outlet}`) || 0) + 1)
  }
}
// nobody works for two outlets
const byName = new Map<string, Set<string>>()
for (const k of seen.keys()) { const [n, o] = k.split(' · '); byName.set(n, (byName.get(n) || new Set()).add(o)) }
for (const [n, os] of byName) ok(os.size === 1, `${n} works for ${[...os].join(' and ')}`)
console.log([...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ×${n}`).join('\n'))
for (const id of [1, 9, 11, 241, 243, 45, 21, 73, 219, 236]) { const c = w.clubs[id]; if (c) console.log(`${c.short}: ${outletsFor(c).map((x) => x.name).join(', ')}`) }
ok(!outletsFor(w.clubs[9]).some((x) => x.id === 'men') && outletsFor(w.clubs[11]).some((x) => x.id === 'men'), 'the Manchester paper covers Manchester clubs only')
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
