// Concurrent matches: Matches tab, spectator view, mini player, results applied as shown; then watch-any-match.
// Needs the dev server: npx vite --port 5173 --strictPort
// node scripts/qa/others.mjs <out-dir> [clubIdx]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-others'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[3] || 4)).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
for (let i = 0; i < 20; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForSelector('text=Play match', { timeout: 20000 })
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
const cnt = await page.evaluate(() => window.__game.getState().live.others?.length || 0)
console.log('concurrent matches:', cnt)
await page.waitForTimeout(6000)
await page.locator('.tab', { hasText: 'Matches' }).first().click()
await shot('matches-tab', 500)
await page.evaluate(() => { const el = document.querySelector('.match-body'); if (el) el.scrollTop = 500 })
await shot('matches-tab-2')
await page.evaluate(() => { const el = document.querySelector('.match-body'); if (el) el.scrollTop = 0 })
await page.locator('.om-main').first().click()
await shot('spectate', 700)
await page.locator('.spec .ctl-btn.big').click() // play
await page.waitForTimeout(5000)
await shot('spectate-running', 0)
await page.locator('.spec .tab', { hasText: 'Line-ups' }).click()
await shot('spectate-lineups', 400)
await page.locator('.spec .tab', { hasText: 'Stats' }).click()
await shot('spectate-stats', 400)
await page.locator('.spec-pip').click()
await shot('pip', 600)
await page.locator('.tab', { hasText: 'Live' }).first().click()
await page.locator('.ctl-btn.big').click()
await page.waitForTimeout(6000)
await shot('pip-running', 0)
await page.getByText('Sim to end').click()
await page.waitForTimeout(800)
const shown = await page.evaluate(() => { const g = window.__game.getState(); return (g.live.others || []).map((o) => [o.fixtureId, o.sim.score.join('-')]) })
await page.locator('.tab', { hasText: 'Matches' }).first().click()
await shot('matches-ft', 400)
await page.getByText('Full-time · Continue').click()
await page.waitForTimeout(1500)
const applied = await page.evaluate((ids) => { const w = window.__game.getState().world; return ids.map(([id]) => [id, w.fixtures[id].played ? w.fixtures[id].result.score.join('-') : 'unplayed']) }, shown)
const mismatch = shown.filter(([id, s], i) => applied[i][1] !== s)
console.log('shown vs applied mismatches:', mismatch.length, JSON.stringify(shown.slice(0, 4)), JSON.stringify(applied.slice(0, 4)))
// ---- watch any match: find an unplayed non-user fixture on a later date, set to watch, continue
await page.evaluate(() => { const g = window.__game.getState(); g.closeAll() })
await page.waitForTimeout(500)
const target = await page.evaluate(() => {
  const w = window.__game.getState().world
  const f = Object.values(w.fixtures).filter((x) => !x.played && !x.userInvolved && x.date > w.date && w.competitions[x.compId]?.format === 'league').sort((a, b) => a.date.localeCompare(b.date) || (b.importance || 0) - (a.importance || 0))[0]
  return f && { id: f.id, date: f.date }
})
console.log('watch target', target)
await page.evaluate((id) => window.__game.getState().watchFixture(id), target.id)
await page.waitForTimeout(300)
for (let i = 0; i < 20; i++) {
  if (await page.locator('.match-screen').count()) break
  if (await page.getByText('Play match').count()) { console.log('hit own match first'); break }
  const b = page.locator('.continue-btn'); if (!(await b.count())) { await page.waitForTimeout(500); continue }
  await b.click(); await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await shot('watch-open', 1500)
await page.waitForTimeout(4000)
await shot('watch-running', 0)
await page.getByText('Sim to end').click().catch(() => {})
await page.waitForTimeout(600)
await page.getByText('Full-time · Continue').click().catch(() => {})
await shot('watch-report', 1200)
console.log(JSON.stringify({ errors }, null, 1))
await browser.close()
