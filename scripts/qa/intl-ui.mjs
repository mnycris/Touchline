// International football in the browser: duty card, calendar, groups, national team page, player caps, watching a game.
// node scripts/qa/intl-ui.mjs <out-dir> [summer]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-intl'; fs.mkdirSync(OUT, { recursive: true })
const SUMMER = process.argv[3] === 'summer'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`) })
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
const go = (route) => page.evaluate((r) => window.__game.getState().go(r), route)
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click()
await page.locator('.club-card', { hasText: 'Arsenal' }).first().click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })

/** Advance (quick-simming the user's matches) until the date is reached. */
const until = (date) => page.evaluate(async (date) => {
  const mr = await import('/src/engine/world/matchRunner.ts')
  const adv = await import('/src/engine/world/advance.ts')
  const G = window.__game
  G.setState({ prefs: { ...G.getState().prefs, reduceMotion: true } })
  for (let i = 0; i < 400 && G.getState().world.date < date; i++) {
    const w0 = G.getState().world
    const f = adv.userFixtureOn(w0, w0.date)
    if (f && !f.played) { const sim = mr.createSim(w0, f, true); sim.ctx.assistantSubs = true; G.getState().finishUserMatch(f.id, sim.runToEnd()); G.getState().closeAll(); continue }
    await G.getState().advance(date)
    G.getState().closeAll()
  }
  G.getState().clearNewsDrop()
  const w = G.getState().world
  return { date: w.date, onDuty: Object.values(w.players).filter((p) => p.clubId === w.userClubId && p.intlDuty).map((p) => p.name) }
}, date)

console.log('world', await page.evaluate(() => { const w = window.__game.getState().world; return { nts: Object.keys(w.intl?.nt || {}).length, comps: Object.values(w.competitions).filter((c) => c.format === 'intl').map((c) => `${c.key}:${c.fixtures.length}`) } }))
console.log(await until('2026-09-23'))
await page.waitForTimeout(1500)
await page.evaluate(() => window.__game.getState().clearNewsDrop())
await shot('hub', 900)
await page.locator('.intl-card').scrollIntoViewIfNeeded()
await shot('hub-duty', 500)
// the national game from the duty card: its sheet (watch)
await page.locator('.intl-card .fixture-row').first().click()
await shot('duty-sheet', 600)
await page.keyboard.press('Escape'); await page.waitForTimeout(300)
await page.evaluate(() => window.__game.getState().closeAll())
await go({ name: 'squadStatus' }); await shot('squad-status', 700)
await go({ name: 'calendar' }); await shot('calendar', 900)
await scroll(700); await shot('calendar-agenda', 500)
// Season → World: International first
await page.evaluate(() => { const G = window.__game.getState(); G.closeAll?.(); G.setTab('season') })
await page.waitForTimeout(400)
await page.locator('.tabs button', { hasText: 'World' }).first().click().catch(() => {})
await shot('world', 800)
const unl = await page.evaluate(() => Object.values(window.__game.getState().world.competitions).find((c) => c.key === 'UNL')?.id)
await go({ name: 'comp', params: { id: unl } }); await shot('unl-groups', 900)
await scroll(900); await shot('unl-groups-2', 400)
await page.locator('.tabs button', { hasText: 'Fixtures' }).first().click(); await shot('unl-fixtures', 700)
await page.locator('.tabs button', { hasText: 'Knockouts' }).first().click(); await shot('unl-ko', 500)
await page.locator('.tabs button', { hasText: 'Stats' }).first().click(); await shot('unl-stats', 500)
const eng = await page.evaluate(() => window.__game.getState().world.intl.nt['England'])
await go({ name: 'club', params: { id: eng } }); await shot('england', 1200)
await scroll(700); await shot('england-2', 600)
await scroll(1400); await shot('england-3', 600)
await scroll(0)
await page.locator('.tabs button', { hasText: /Squad/ }).first().click(); await shot('england-squad', 1000)
// after the first games of the window
console.log(await until('2026-09-28'))
const saka = await page.evaluate(() => Object.values(window.__game.getState().world.players).find((p) => p.name === 'B. Saka')?.id)
await go({ name: 'player', params: { id: saka } })
await page.waitForTimeout(700)
await page.locator('.tabs button', { hasText: 'Stats' }).first().click(); await shot('saka-stats', 900)
await scroll(700); await shot('saka-stats-2', 500)
// watch a national game live as a spectator
const today = await page.evaluate(() => { const w = window.__game.getState().world; return Object.values(w.fixtures).filter((f) => f.date > w.date && f.home >= 9500000 && !f.played).sort((a, b) => a.date.localeCompare(b.date))[0] })
console.log('next intl', today?.id, today?.date)
console.log(await until(today.date))
await page.evaluate((id) => { const G = window.__game.getState(); G.closeAll(); G.watchFixture(id) }, today.id)
await page.waitForTimeout(2500)
await shot('watch-live', 800)
await page.evaluate(() => { const G = window.__game.getState(); const l = G.live; if (l) { l.sim.runToEnd?.() } })
console.log(await until('2026-10-06'))
await go({ name: 'inbox' }); await shot('inbox', 900)
if (SUMMER) {
  console.log(await until('2027-06-10'))
  await page.evaluate(() => { const G = window.__game.getState(); G.closeAll(); G.setTab('central') })
  await shot('summer-hub', 1000)
  const afcon = await page.evaluate(() => Object.values(window.__game.getState().world.competitions).find((c) => c.key === 'AFCON')?.id)
  await go({ name: 'comp', params: { id: afcon } }); await shot('afcon', 900)
  console.log(await until('2027-06-26'))
  await go({ name: 'comp', params: { id: afcon } })
  await page.locator('.tabs button', { hasText: 'Knockouts' }).first().click(); await shot('afcon-ko', 900)
}
console.log(JSON.stringify({ errors: errors.slice(0, 20) }))
await browser.close()
