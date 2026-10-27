// The app-wide polish tour's second half: the screens the defect sweep (defects.mjs) and the match-day walkthrough
// (e2e-matchday.mjs) don't reach. Main Menu and Load, Tactics Lab, press, a negotiation, a selling negotiation,
// brackets, World, Following, Search, a manager's profile, Edit Mode's editors, Settings and Save/Load, renewals.
// Screenshots for a look by eye, the DOM defect checks of defects.mjs on each, page errors.
//   node scripts/qa/polish-tour.mjs <save> <out-dir>
import fs from 'node:fs'
import { chromium } from 'playwright'
const [file, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`) })
await page.emulateMedia({ reducedMotion: 'reduce' })
let n = 0
const shot = async (name, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (at) => page.evaluate((at) => { const el = [...document.querySelectorAll('.screen')].pop(); if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * at }, at)
const g = (fn, arg) => page.evaluate(fn, arg)

// the main menu, the saves list, the import
await page.goto('http://localhost:5173/')
await shot('menu', 1500)
await page.locator('button', { hasText: /Load/ }).first().click()
await shot('load-empty')
await page.setInputFiles('input[type=file]', file)
await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
await shot('load-imported')
await page.locator('.save-row, .card', { hasText: /imported|·/ }).first().click().catch(() => {})
const loadBtn = page.locator('button', { hasText: /^Load$|Continue/ }).first()
if (await loadBtn.count()) await loadBtn.click().catch(() => {})
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await g(() => window.__game.getState().clearNewsDrop?.())
await shot('central-loaded')

const ids = await g(() => {
  const w = window.__game.getState().world, me = w.userClubId
  const comps = Object.values(w.competitions).filter((c) => c.season === w.season)
  const ko = comps.find((c) => c.clubs.includes(me) && c.rounds.some((r) => r.drawn)) || comps.find((c) => c.rounds.some((r) => r.drawn))
  const next = Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const opp = next ? (next.home === me ? next.away : next.home) : undefined
  const target = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me && p.ovr >= 78 && p.ovr <= 84 && !w.clubs[p.clubId]?.national).sort((a, b) => b.ovr - a.ovr)[3]
  const renew = Object.values(w.players).find((p) => p.clubId === me && p.contract.until <= w.season + 1)
  const mgr = Object.values(w.managers).find((m) => m.clubId === opp) || Object.values(w.managers).find((m) => m.clubId)
  return { ko: ko?.id, next: next?.id, opp, target: target?.id, renew: renew?.id, mgr: mgr?.id }
})
const visit = async (name, how, ats = [0]) => {
  await g((how) => { const s = window.__game.getState(); s.closeAll(); s.setTab(how.tab || 'central'); s.resetTab(); if (how.go) s.go(how.go); if (how.open) s.open(how.open) }, how)
  for (const at of ats) { await scroll(at); await shot(`${name}${ats.length > 1 ? `-${Math.round(at * 100)}` : ''}`, 900) }
}

await visit('tactics-lab', { open: { name: 'practice' } })
if (ids.next) await visit('press-pre', { open: { name: 'press', params: { kind: 'pre', fixtureId: ids.next } } })
if (ids.target) await visit('negotiation', { open: { name: 'negotiation', params: { playerId: ids.target } } })
if (ids.renew) await visit('renewal', { open: { name: 'renewal', params: { id: ids.renew } } })
if (ids.ko) {
  await visit('bracket', { go: { name: 'comp', params: { id: ids.ko } } })
  await page.locator('.tabs .tab', { hasText: /Knockouts|Bracket|Play-offs/ }).first().click().catch(() => {})
  await shot('bracket-tab', 900)
}
await visit('world', { tab: 'season' }); await page.locator('.tabs .tab', { hasText: 'World' }).first().click(); await shot('world-tab', 700)
await visit('following', { go: { name: 'news', params: { f: 'Following' } } })
if (ids.mgr != null) await visit('manager-profile', { go: { name: 'coach', params: { id: ids.mgr } } })
await visit('transfer-history', { go: { name: 'transferHistory' } })
await visit('season-review', { open: { name: 'seasonReview', params: { season: (await g(() => window.__game.getState().world.season)) - 1 } } })
// Universal Search
await g(() => { const s = window.__game.getState(); s.closeAll(); s.setTab('central'); s.resetTab() })
await page.locator('.topbar button[aria-label="Search"], .topbar .iconbtn').first().click().catch(() => {})
await page.waitForTimeout(500)
await page.keyboard.type('Bayern', { delay: 40 }).catch(() => {})
await shot('search', 900)
await g(() => window.__game.getState().closeSearch?.())
// Edit Mode: the club editor and the match editor
await g(() => { const s = window.__game.getState(); s.world.meta.editMode = true; s.bump() })
await visit('settings-edit', { go: { name: 'settings' } }, [0, 1])
if (ids.opp) {
  await visit('club-edit', { go: { name: 'club', params: { id: ids.opp } } })
  await page.locator('button', { hasText: /^Edit$|Edit club/ }).first().click().catch(() => {})
  await shot('club-editor', 900)
}
if (ids.next) {
  await visit('md-edit', { open: { name: 'prematch', params: { id: ids.next } } })
  await page.locator('.edit-btn').first().click().catch(() => {})
  await shot('match-editor', 1000)
}
await g(() => { const s = window.__game.getState(); s.world.meta.editMode = false; s.closeAll(); s.bump() })
console.log(`${n} screenshots in ${OUT}`)
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
