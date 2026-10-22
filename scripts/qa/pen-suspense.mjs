// A penalty's outcome must not show anywhere on the live match screen before its kick has played: two penalties are
// scripted into the next match (one scored, one saved) and the scoreboard, the scorers line and the feed are read
// through the award and the kick, then after it. Needs the dev server: node scripts/qa/pen-suspense.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-pens'
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
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
// script the penalties into today's match
const fx = await page.evaluate(() => {
  const g = window.__game.getState(), w = g.world
  const f = Object.values(w.fixtures).filter((x) => x.userInvolved && !x.played).sort((a, b) => a.date.localeCompare(b.date))[0]
  const us = f.home === w.userClubId ? 0 : 1
  g.mutate((w) => { (w.scripts ||= {})[f.id] = { events: [{ id: 'p1', kind: 'pen', side: us, player: 0, min: 10, pen: 'goal' }, { id: 'p2', kind: 'pen', side: 1 - us, player: 0, min: 25, pen: 'saved' }] } })
  return f.id
})
console.log('scripted', fx)
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.evaluate(() => { const g = window.__game.getState(); const l = g.live; if (l) g.setLive({ ...l, speed: 2 }) })
// read the screen every 150ms until the 30th minute
const read = () => page.evaluate(() => {
  const s = window.__game.getState().live.sim
  const kick = document.querySelector('.mm-kick'), pen = document.querySelector('.mm-pen'), goal = document.querySelector('.gc')
  return {
    min: s.minute, real: s.score.join('-'),
    board: [...document.querySelectorAll('.sb-score span.pop')].map((x) => x.textContent).join('-'),
    scorers: [...document.querySelectorAll('.scorers')].map((x) => x.textContent).join(' | '),
    feedPen: [...document.querySelectorAll('.feed')].some((x) => /Penalty goal|Penalty missed|saved/i.test(x.textContent || '')),
    moment: kick ? (document.querySelector('.pk-scene.result') ? 'kick:result' : 'kick') : pen ? 'award' : goal ? 'goal' : '',
  }
})
const log = []
let shots = 0, sawKick = 0
for (let i = 0; i < 900; i++) {
  const r = await read()
  const last = log[log.length - 1]
  if (!last || last.moment !== r.moment || last.board !== r.board || last.real !== r.real) {
    log.push(r)
    console.log(`${String(r.min).padStart(3)}' real ${r.real} board ${r.board} · ${r.moment || '-'}${r.feedPen ? ' · feed shows the outcome' : ''} · scorers: ${r.scorers.trim() || '-'}`)
    if (r.moment && shots < 8) await page.screenshot({ path: `${OUT}/${String(++shots).padStart(2, '0')}-${r.min}-${r.moment.replace(':', '-')}.png` })
  }
  if (r.moment === 'kick') sawKick++
  if (r.min >= 30 && !r.moment) break
  await page.waitForTimeout(150)
}
console.log(`kick frames seen: ${sawKick}`)
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
