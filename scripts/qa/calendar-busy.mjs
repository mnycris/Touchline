// The calendar on a busy month for a manager who follows several clubs and has marked matches to watch: the month
// grid, the month at a glance, and a day with his match, a watched match and followed clubs' games.
// node scripts/qa/calendar-busy.mjs <save> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-calendar'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
const setup = await page.evaluate(() => {
  const g = window.__game.getState(), w = g.world
  const me = w.userClubId
  const big = Object.values(w.clubs).filter((c) => !c.national && c.id !== me && c.leagueId).sort((a, b) => b.reputation - a.reputation).slice(0, 6)
  g.mutate((w) => { w.follows = [...big.map((c) => ({ kind: 'club', id: c.id, since: w.date })), ...(w.follows || []).filter((f) => f.kind !== 'club')] })
  // four matches to watch over the next month: the biggest of a few days
  const month = w.date.slice(0, 7)
  const by = new Map()
  for (const f of Object.values(w.fixtures)) if (!f.played && f.date > w.date && f.date <= `${month}-31` || (!f.played && f.date.slice(0, 7) === month && f.date > w.date)) (by.get(f.date) || by.set(f.date, []).get(f.date)).push(f)
  const rep = (f) => (w.clubs[f.home]?.reputation || 0) + (w.clubs[f.away]?.reputation || 0)
  const picks = [...by.keys()].sort().slice(0, 12).map((d) => by.get(d).filter((f) => !f.userInvolved).sort((a, b) => rep(b) - rep(a))[0]).filter(Boolean).slice(0, 5)
  for (const f of picks) g.watchFixture?.(f.id)
  return { follow: big.map((c) => c.short), watch: picks.map((f) => `${f.date} ${w.clubs[f.home].short} v ${w.clubs[f.away].short}`) }
})
console.log(JSON.stringify(setup, null, 1))
await page.evaluate(() => window.__game.getState().go({ name: 'calendar' }))
await page.waitForSelector('.cal-grid', { timeout: 10000 })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/1-month.png` })
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 520 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/2-glance.png` })
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 1400 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/3-glance-more.png` })
// a day with both a watched match and followed clubs, else the first watched day
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 0 })
// the filters: what he is watching, then the clubs he follows
for (const [k, name] of [['Watching', '5-watching'], ['Following', '6-following']]) {
  const b = page.locator('.seg button, .seg-btn, [role=tab]', { hasText: new RegExp(`^${k}$`, 'i') }).first()
  if (await b.count()) { await b.click(); await page.waitForTimeout(400); await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 520 }); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png` }) }
}
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 0 })
// a day with his match, a watched match and followed clubs if there is one, else the first watched day
const pickDay = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.cal-cell')]
  const i = cells.findIndex((c) => c.querySelector('.cal-o.corner.watch')) >= 0 ? cells.findIndex((c) => c.querySelector('.cal-o.corner.watch')) : cells.findIndex((c) => c.querySelector('.cal-o.watch'))
  return i
})
if (pickDay >= 0) { await page.locator('.cal-cell').nth(pickDay).click(); await page.waitForTimeout(600) }
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 560 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/4-day.png` })
// a day of the clubs he follows only
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 0 })
const folDay = await page.evaluate(() => [...document.querySelectorAll('.cal-cell')].findIndex((c) => c.querySelector('.cal-o.follow:not(.corner)')))
if (folDay >= 0) { await page.locator('.cal-cell').nth(folDay).click(); await page.waitForTimeout(600); await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 560 }); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/7-follow-day.png` }) }
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
