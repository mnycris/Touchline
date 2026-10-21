// Small visual defects across the app: things running off the screen, text clipped inside its box, chips, pills and
// tabs breaking onto two lines. Visits the main screens (top, middle and bottom of each), checks the DOM and keeps a
// screenshot of each for a look by eye. node scripts/qa/defects.mjs <save> <out-dir> [width]
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT, W = '390'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file, { width: Number(W), height: 844 })
await page.emulateMedia({ reducedMotion: 'reduce' })
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world, me = w.userClubId
  const comps = Object.values(w.competitions).filter((c) => c.season === w.season)
  const lg = comps.find((c) => c.format === 'league' && c.clubs.includes(me))
  const cup = comps.find((c) => c.format !== 'league' && c.clubs.includes(me) && c.rounds.length)
  const fx = Object.values(w.fixtures).filter((f) => (f.home === me || f.away === me)).sort((a, b) => a.date.localeCompare(b.date))
  const next = fx.find((f) => !f.played), last = [...fx].reverse().find((f) => f.played && f.result)
  const p = Object.values(w.players).filter((x) => x.clubId === me).sort((a, b) => b.ovr - a.ovr)[0]
  const opp = next ? (next.home === me ? next.away : next.home) : undefined
  const coach = opp != null ? Object.values(w.managers).find((m) => m.clubId === opp) : undefined
  return { lg: lg?.id, cup: cup?.id, next: next?.id, last: last?.id, p: p?.id, me, opp, coach: coach?.id }
})
const cases = [
  ['central', { tab: 'central' }], ['squad', { tab: 'squad' }], ['transfers', { tab: 'transfers' }], ['academy', { tab: 'academy' }], ['season', { tab: 'season' }],
  ['league', { go: { name: 'comp', params: { id: ids.lg } } }], ['cup', ids.cup && { go: { name: 'comp', params: { id: ids.cup } } }],
  ['player', { go: { name: 'player', params: { id: ids.p } } }], ['club', { go: { name: 'club', params: { id: ids.me } } }],
  ['opp-club', ids.opp && { go: { name: 'club', params: { id: ids.opp } } }], ['tactics', { go: { name: 'tactics' } }],
  ['training', { go: { name: 'training' } }], ['development', { go: { name: 'development' } }], ['contracts', { go: { name: 'contracts' } }],
  ['inbox', { go: { name: 'inbox' } }], ['news', { go: { name: 'news' } }], ['calendar', { go: { name: 'calendar' } }], ['office', { go: { name: 'office' } }],
  ['manager', { go: { name: 'manager' } }], ['awards', { go: { name: 'awards' } }], ['squad-status', { go: { name: 'squadStatus' } }], ['coach', ids.coach != null && { go: { name: 'coach', params: { id: ids.coach } } }], ['fifa', { go: { name: 'fifa' } }], ['scouting', { go: { name: 'scouting' } }], ['settings', { go: { name: 'settings' } }],
  ['preview', ids.next && { open: { name: 'prematch', params: { id: ids.next } } }], ['opponent', ids.opp && { go: { name: 'opponent', params: { id: ids.opp, fixtureId: ids.next } } }],
  ['report', ids.last && { open: { name: 'postmatch', params: { id: ids.last } } }], ['search', { go: { name: 'search' } }],
].filter((c) => c[1])

const check = () => page.evaluate(() => {
  const vw = innerWidth, out = []
  const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')} "${(el.textContent || '').trim().slice(0, 40)}"`
  const scroller = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth) return true; if (e.classList.contains('screen')) break } return false }
  // clipped by an ancestor that ends on screen (an ellipsis line, a card): not visible, so not a defect
  const clippedAway = (el) => { for (let e = el.parentElement; e && !e.classList.contains('screen'); e = e.parentElement) { const cs = getComputedStyle(e); if (/hidden|clip/.test(cs.overflowX + cs.overflow) && e.getBoundingClientRect().right <= vw + 1.5) return true } return false }
  const hidden = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true } return false }
  const root = [...document.querySelectorAll('.overlay')].pop() || [...document.querySelectorAll('.layer')].pop()
  if (!root) return [`no screen: ${document.body.innerText.slice(0, 120).replace(/\s+/g, ' ')}`]
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || el.closest('[aria-hidden], .ci-art, svg')) continue
    if (r.right > vw + 1.5 && !scroller(el) && !hidden(el) && !clippedAway(el)) out.push(`off-screen by ${Math.round(r.right - vw)}px: ${desc(el)}`)
    if (/hidden|clip/.test(cs.overflow + cs.overflowY) && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none' && el.clientHeight > 0 && el.clientHeight < 48 && el.scrollHeight > el.clientHeight + 3 && el.textContent.trim() && !el.querySelector('img, svg, canvas')) out.push(`clipped ${el.scrollHeight}/${el.clientHeight}px: ${desc(el)}`)
    // single-line controls wrapping their text
    if (/\b(pill|chip|tab|cp|ch-st|moved-chip|masthead|label)\b/.test(String(el.className)) && cs.whiteSpace !== 'nowrap' || el.tagName === 'BUTTON' && el.closest('.tabs, .seg, .chips')) {
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue
        const rg = document.createRange(); rg.selectNodeContents(n)
        const lines = new Set([...rg.getClientRects()].map((x) => Math.round(x.top)))
        if (lines.size > 1) { out.push(`wraps over ${lines.size} lines: ${desc(el)}`); break }
      }
    }
  }
  return [...new Set(out)]
})

const report = {}
for (const [name, how] of cases) {
  await page.evaluate((how) => { const g = window.__game.getState(); g.closeAll(); if (how.tab) { g.setTab(how.tab); g.resetTab() } else { g.setTab('central'); g.resetTab(); if (how.go) g.go(how.go); if (how.open) g.open(how.open) } }, how)
  await page.waitForTimeout(1100)
  const issues = []
  for (const [k, at] of [['top', 0], ['mid', 0.5], ['end', 1]]) {
    await page.evaluate((at) => { const el = [...document.querySelectorAll('.screen')].pop(); if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * at }, at)
    await page.waitForTimeout(350)
    for (const i of await check()) issues.push(`[${k}] ${i}`)
    await page.screenshot({ path: `${OUT}/${name}-${k}.png` })
  }
  report[name] = [...new Set(issues)]
  console.log(`${name}: ${report[name].length ? report[name].length + ' issue(s)' : 'clean'}`)
  for (const i of report[name].slice(0, 12)) console.log(`   ${i}`)
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1))
console.log(errors.join('\n') || 'no page errors')
await browser.close()
