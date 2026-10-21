// Watched matches and followed clubs on the calendar, and Continue stopping for a watched match on a busy day (when
// the day's games are simulated in batches). Needs the dev server (the store is exposed there):
//   npx vite --port 5173 & node scripts/qa/watch-calendar.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-watch'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
// a big match on a busy day without one of ours, and two clubs to follow
const pick = await page.evaluate(() => {
  const g = window.__game.getState(), w = g.world
  const by = new Map()
  for (const f of Object.values(w.fixtures)) if (!f.played && f.date > w.date) (by.get(f.date) || by.set(f.date, []).get(f.date)).push(f)
  const days = [...by.keys()].sort()
  const day = days.find((d) => by.get(d).length > 24 && !by.get(d).some((f) => f.userInvolved))
  const rep = (f) => (w.clubs[f.home]?.reputation || 0) + (w.clubs[f.away]?.reputation || 0)
  const f = by.get(day).filter((f) => !f.userInvolved).sort((a, b) => rep(b) - rep(a))[0]
  g.watchFixture(f.id)
  const fol = Object.values(w.clubs).filter((c) => !c.national && c.id !== w.userClubId && c.id !== f.home && c.id !== f.away).sort((a, b) => b.reputation - a.reputation).slice(0, 2)
  for (const c of fol) w.follows = [{ kind: 'club', id: c.id, since: w.date }, ...(w.follows || [])]
  g.setLive(undefined)
  return { id: f.id, date: f.date, n: by.get(day).length, match: `${w.clubs[f.home].short} v ${w.clubs[f.away].short}`, follow: fol.map((c) => c.short), today: w.date }
})
console.log('watching', pick.match, 'on', pick.date, `(${pick.n} fixtures that day; today ${pick.today})`, '· following', pick.follow.join(', '))
await page.waitForTimeout(800)
// the calendar on the watched match's month
await page.evaluate(() => window.__game.getState().go({ name: 'calendar' }))
await page.waitForSelector('.cal-grid', { timeout: 10000 })
for (let k = 0; k < 3; k++) {
  const title = await page.locator('.screen .h3').first().innerText()
  const want = new Date(pick.date + 'T12:00:00Z').toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  if (title.toLowerCase().includes(want.toLowerCase())) break
  await page.getByLabel('Next month').click(); await page.waitForTimeout(400)
}
await page.waitForTimeout(500)
const sc = page.locator('.screen').last()
await sc.screenshot({ path: `${OUT}/calendar-month.png` })
console.log('cells with tags', await page.locator('.cal-tags').count(), '· watched cells', await page.locator('.cal-tags i.w').count())
await page.locator('.cal-cell', { has: page.locator('.cal-tags i.w') }).first().click()
await page.waitForTimeout(600)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = s.scrollHeight })
await page.waitForTimeout(400)
await sc.screenshot({ path: `${OUT}/calendar-day.png` })
// back to Central and Continue until something stops us
await page.evaluate(() => window.__game.getState().closeAll?.())
await page.evaluate(() => window.__game.getState().go({ name: 'central' }))
await page.waitForTimeout(500)
let stoppedFor
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => { const g = window.__game.getState(); return { date: g.world.date, live: g.live?.fixtureId, spectator: !!g.live?.spectator } })
  if (st.live) { stoppedFor = st; break }
  if (st.date > pick.date) break
  // our own match: quick-sim it and carry on
  const quick = page.getByRole('button', { name: /Quick sim/ })
  if (await quick.count()) { await quick.first().click(); await page.waitForTimeout(600) }
  await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.go({ name: 'central' }) })
  await page.waitForTimeout(300)
  const b = page.locator('.continue-btn')
  if (/Match Day/i.test(await b.innerText())) { await b.click(); await page.waitForTimeout(800); continue }
  await b.click().catch(() => {})
  await page.waitForTimeout(300)
  await page.waitForFunction(() => !window.__game.getState().advancing, null, { timeout: 120000 })
  await page.waitForTimeout(300)
}
const after = await page.evaluate((id) => { const g = window.__game.getState(), w = g.world; return { date: w.date, played: !!w.fixtures[id].played, live: g.live?.fixtureId } }, pick.id)
console.log(stoppedFor ? `stopped with live ${stoppedFor.live === pick.id ? 'THE WATCHED MATCH' : stoppedFor.live} on ${stoppedFor.date}${stoppedFor.spectator ? ' (spectator)' : ''}` : 'never stopped for it', '· now', JSON.stringify(after))
if (stoppedFor) await page.screenshot({ path: `${OUT}/stopped.png` })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
