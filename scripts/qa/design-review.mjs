// The design review's eye: every main screen of a career at phone size, top, middle and end, each set of three on one
// contact sheet (<out>/sheets) to look at whole, then section by section. Run it before and after a design change and
// compare the sheets side by side (scripts/qa/shot-sheet.mjs puts any shots together).
//   node scripts/qa/design-review.mjs <save> <out-dir> [only,these,cases]   (needs the dev server)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { openSave } from './load-save.mjs'
const [file, OUT, ONLY] = process.argv.slice(2)
fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true })
const { page, browser, errors } = await openSave(file)
await page.emulateMedia({ reducedMotion: 'reduce' })
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world, me = w.userClubId
  const comps = Object.values(w.competitions).filter((c) => c.season === w.season)
  const lg = comps.find((c) => c.format === 'league' && c.clubs.includes(me))
  const cup = comps.find((c) => c.format !== 'league' && c.clubs.includes(me) && c.rounds.length)
  const fx = Object.values(w.fixtures).filter((f) => f.home === me || f.away === me).sort((a, b) => a.date.localeCompare(b.date))
  const next = fx.find((f) => !f.played), last = [...fx].reverse().find((f) => f.played && f.result)
  const p = Object.values(w.players).filter((x) => x.clubId === me).sort((a, b) => b.ovr - a.ovr)[0]
  const opp = next ? (next.home === me ? next.away : next.home) : undefined
  const coach = opp != null ? Object.values(w.managers).find((m) => m.clubId === opp) : undefined
  const msg = w.inbox.find((m) => m.actions?.length) || w.inbox[0]
  const news = w.news[0]
  return { lg: lg?.id, cup: cup?.id, next: next?.id, last: last?.id, p: p?.id, me, opp, coach: coach?.id, msg: msg?.id, news: news?.id }
})
const cases = [
  ['central', { tab: 'central' }], ['squad', { tab: 'squad' }], ['transfers', { tab: 'transfers' }], ['academy', { tab: 'academy' }], ['season', { tab: 'season' }],
  ['league', { go: { name: 'comp', params: { id: ids.lg } } }], ['cup', ids.cup && { go: { name: 'comp', params: { id: ids.cup } } }],
  ['player', { go: { name: 'player', params: { id: ids.p } } }], ['club', { go: { name: 'club', params: { id: ids.me } } }],
  ['opp-club', ids.opp && { go: { name: 'club', params: { id: ids.opp } } }], ['tactics', { go: { name: 'tactics' } }],
  ['training', { go: { name: 'training' } }], ['development', { go: { name: 'development' } }], ['contracts', { go: { name: 'contracts' } }],
  ['inbox', { go: { name: 'inbox' } }], ['message', ids.msg && { go: { name: 'message', params: { id: ids.msg } } }], ['news', { go: { name: 'news' } }],
  ['calendar', { go: { name: 'calendar' } }], ['office', { go: { name: 'office' } }], ['manager', { go: { name: 'manager' } }],
  ['awards', { go: { name: 'awards' } }], ['squad-status', { go: { name: 'squadStatus' } }], ['coach', ids.coach != null && { go: { name: 'coach', params: { id: ids.coach } } }],
  ['fifa', { go: { name: 'fifa' } }], ['scouting', { go: { name: 'scouting' } }], ['settings', { go: { name: 'settings' } }], ['jobs', { go: { name: 'jobs' } }],
  ['preview', ids.next && { open: { name: 'prematch', params: { id: ids.next } } }], ['opponent', ids.opp && { go: { name: 'opponent', params: { id: ids.opp, fixtureId: ids.next } } }],
  ['report', ids.last && { open: { name: 'postmatch', params: { id: ids.last } } }], ['history', { go: { name: 'transferHistory' } }], ['search', { go: { name: 'search' } }],
].filter((c) => c[1] && (!ONLY || ONLY.split(',').includes(c[0])))

for (const [name, how] of cases) {
  await page.evaluate((how) => { const g = window.__game.getState(); g.closeAll(); if (how.tab) { g.setTab(how.tab); g.resetTab() } else { g.setTab('central'); g.resetTab(); if (how.go) g.go(how.go); if (how.open) g.open(how.open) } }, how)
  await page.waitForTimeout(1100)
  const shots = []
  for (const [k, at] of [['top', 0], ['mid', 0.5], ['end', 1]]) {
    await page.evaluate((at) => { const el = [...document.querySelectorAll('.screen')].pop(); if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * at }, at)
    await page.waitForTimeout(350)
    const f = path.join(OUT, `${name}-${k}.png`)
    await page.screenshot({ path: f })
    shots.push(f)
  }
  execFileSync('node', [path.join(path.dirname(new URL(import.meta.url).pathname), 'shot-sheet.mjs'), path.join(OUT, 'sheets', `${name}.png`), '--cols=3', '--w=390', ...shots])
  console.log(name)
}
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no page errors')
await browser.close()
