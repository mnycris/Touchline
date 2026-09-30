// Back-navigation audit: on each screen, switch to another tab / segment / chip and scroll down, open a child
// screen, come back, and check the screen is exactly as it was left. node scripts/qa/nav-tour.mjs <save> [out-dir]
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/nav-tour'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world
  const me = w.userClubId
  const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(me) && c.season === w.season)
  const cup = Object.values(w.competitions).find((c) => c.format !== 'league' && c.clubs.includes(me) && c.season === w.season && c.rounds?.length)
  const played = Object.values(w.fixtures).filter((f) => f.played && f.result && (f.home === me || f.away === me)).sort((a, b) => b.date.localeCompare(a.date))[0]
  const next = Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const p = Object.values(w.players).find((x) => x.clubId === me && x.ovr >= 80)
  const opp = next.home === me ? next.away : next.home
  const nt = Object.values(w.clubs).find((c) => c.national && c.nation === 'England') || Object.values(w.clubs).find((c) => c.national)
  return { me, lg: lg.id, cup: cup?.id, played: played.id, next: next.id, p: p.id, opp, nt: nt.id }
})
const cases = [
  ['tab squad', { tab: 'squad' }], ['tab transfers', { tab: 'transfers' }], ['tab academy', { tab: 'academy' }], ['tab season', { tab: 'season' }], ['tab central', { tab: 'central' }],
  ['comp league', { go: { name: 'comp', params: { id: ids.lg } } }], ['comp cup', ids.cup && { go: { name: 'comp', params: { id: ids.cup } } }],
  ['club', { go: { name: 'club', params: { id: ids.opp } } }], ['own club', { go: { name: 'club', params: { id: ids.me } } }],
  ['player', { go: { name: 'player', params: { id: ids.p } } }], ['calendar', { go: { name: 'calendar' } }], ['news', { go: { name: 'news' } }],
  ['inbox', { go: { name: 'inbox' } }], ['search', { go: { name: 'search' } }], ['scouting', { go: { name: 'scouting' } }],
  ['transferHistory', { go: { name: 'transferHistory' } }], ['office', { go: { name: 'office' } }], ['manager', { go: { name: 'manager' } }],
  ['awards', { go: { name: 'awards' } }], ['fifa', { go: { name: 'fifa' } }], ['nation', { go: { name: 'club', params: { id: ids.nt } } }],
  ['opponent', { go: { name: 'opponent', params: { id: ids.opp, fixtureId: ids.next } } }], ['contracts', { go: { name: 'contracts' } }],
  ['squadStatus', { go: { name: 'squadStatus' } }], ['training', { go: { name: 'training' } }], ['development', { go: { name: 'development' } }],
  ['tactics', { go: { name: 'tactics' } }], ['prematch (overlay)', { open: { name: 'prematch', params: { id: ids.next } } }],
  ['postmatch (overlay)', { open: { name: 'postmatch', params: { id: ids.played } } }], ['fixture (overlay)', { open: { name: 'fixture', params: { id: ids.played } } }],
].filter((c) => c[1])
const state = () => page.evaluate(() => {
  const scr = [...document.querySelectorAll('.overlay .screen, .layer .screen')].pop()
  const on = [...(scr?.querySelectorAll('.tab.on, .seg button.on, .chip.on') || [])].map((b) => b.textContent.trim().slice(0, 18))
  return { scroll: Math.round(scr?.scrollTop || 0), on, h: scr ? scr.scrollHeight - scr.clientHeight : 0 }
})
const rows = []
for (const [name, c] of cases) {
  await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('central'); g.resetTab() })
  await page.waitForTimeout(250)
  await page.evaluate((c) => {
    const g = window.__game.getState()
    if (c.tab) { g.setTab(c.tab); g.resetTab() }
    if (c.go) g.go(c.go)
    if (c.open) g.open(c.open)
  }, c)
  await page.waitForTimeout(900)
  // change what can be changed: the last tab, the second segment, the second chip of the first chip row
  const changed = await page.evaluate(() => {
    const scr = [...document.querySelectorAll('.overlay .screen, .layer .screen')].pop()
    if (!scr) return 'no screen'
    const did = []
    const tabs = [...scr.querySelectorAll('.tabs')][0]
    if (tabs) { const b = [...tabs.querySelectorAll('.tab')]; const t = b[Math.min(b.length - 1, 1)]; if (t && !t.classList.contains('on')) { t.click(); did.push(`tab:${t.textContent.trim()}`) } }
    const seg = scr.querySelector('.seg')
    if (seg) { const b = [...seg.querySelectorAll('button')]; const t = b[1]; if (t && !t.classList.contains('on')) { t.click(); did.push(`seg:${t.textContent.trim()}`) } }
    const chips = scr.querySelector('.chips')
    if (chips) { const b = [...chips.querySelectorAll('.chip')]; const t = b[1]; if (t && !t.classList.contains('on')) { t.click(); did.push(`chip:${t.textContent.trim()}`) } }
    return did.join(' ')
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => { const scr = [...document.querySelectorAll('.overlay .screen, .layer .screen')].pop(); if (scr) scr.scrollTop = Math.min(420, (scr.scrollHeight - scr.clientHeight) * 0.6) })
  await page.waitForTimeout(400)
  const before = await state()
  // open a child and come back
  await page.evaluate((pid) => window.__game.getState().go({ name: 'player', params: { id: pid } }), ids.p === undefined ? 0 : (name === 'player' ? ids.p + 0 : ids.p))
  await page.waitForTimeout(700)
  await page.evaluate(() => window.__game.getState().back())
  await page.waitForTimeout(900)
  const after = await state()
  const ok = JSON.stringify(before.on) === JSON.stringify(after.on) && Math.abs(before.scroll - after.scroll) <= 4
  rows.push({ name, changed, before, after, ok })
  if (!ok) await page.screenshot({ path: `${OUT}/${name.replace(/\W+/g, '_')}.png` })
  console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(20), changed.padEnd(34), JSON.stringify(before), '→', JSON.stringify(after))
}
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
