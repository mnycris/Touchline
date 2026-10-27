// Matches on the watch list: Continue stops on their day with a reminder (never straight into a match); closing it
// keeps the day; Continue asks again; Watch opens the chosen one; Not today lets the rest go.
// node scripts/qa/watch-reminder.mjs <save> <out-dir>   (dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-watch'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
// two or three matches of other clubs on the first day before the manager's next match that has some
const pick = await page.evaluate(() => {
  const g = window.__game.getState(), w = g.world
  const mine = Object.values(w.fixtures).filter((f) => f.userInvolved && !f.played).sort((a, b) => a.date.localeCompare(b.date))[0]
  const days = [...new Set(Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && f.date > w.date && (!mine || f.date < mine.date)).map((f) => f.date))].sort()
  const day = days[0]
  const fx = Object.values(w.fixtures).filter((f) => f.date === day && !f.played && !f.userInvolved).sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
  const chosen = [fx[0], fx[Math.floor(fx.length / 2)], fx[fx.length - 1]].filter((f, i, a) => f && a.indexOf(f) === i).slice(0, 3)
  g.mutate((w) => { w.flags.watchList = chosen.map((f) => f.id) }, { save: false })
  return { today: w.date, day, ids: chosen.map((f) => `${w.clubs[f.home].short} v ${w.clubs[f.away].short} ${f.time}`) }
})
console.log('today', pick.today, '· watching on', pick.day, ':', pick.ids.join(', '))
await page.locator('.continue-btn').click()
await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
await page.waitForTimeout(800)
const st = await page.evaluate(() => { const g = window.__game.getState(); return { date: g.world.date, live: !!g.live, prompt: !!g.watchPrompt, stop: g.lastStop } })
console.log('after Continue:', JSON.stringify(st))
await shot('reminder')
// close it: the day stays, Continue says what is waiting
await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 20 } })
await page.waitForTimeout(600)
const st2 = await page.evaluate(() => { const g = window.__game.getState(); return { date: g.world.date, prompt: !!g.watchPrompt, label: document.querySelector('.continue-btn')?.innerText.replace(/\n/g, ' · ') } })
console.log('after closing:', JSON.stringify(st2))
await shot('closed')
await page.locator('.continue-btn').click()
await page.waitForTimeout(800)
console.log('Continue again opens it:', await page.evaluate(() => !!window.__game.getState().watchPrompt))
// watch the second one
await page.locator('.wr-card').nth(1).click()
await page.waitForTimeout(1500)
console.log('watching:', await page.evaluate(() => { const l = window.__game.getState().live; return l ? `${l.fixtureId} spectator=${l.spectator}` : 'nothing' }))
await shot('watching')
// leave it: sim to the end and continue
await page.evaluate(() => { const g = window.__game.getState(); const l = g.live; l.sim.runToEnd(); g.setLive({ ...l, finished: true }) })
await page.waitForTimeout(800)
await page.locator('button', { hasText: /Full-time|Continue/ }).first().click().catch(() => {})
await page.waitForTimeout(1200)
await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('central') })
await page.waitForTimeout(600)
await shot('back-on-central')
await page.locator('.continue-btn').click()
await page.waitForTimeout(800)
console.log('the rest asked about:', await page.evaluate(() => !!window.__game.getState().watchPrompt), await page.locator('.wr-card').count(), 'cards')
await shot('rest')
await page.locator('.wr-skip').click()
await page.waitForTimeout(600)
console.log('after Not today:', await page.evaluate(() => { const g = window.__game.getState(); return JSON.stringify({ list: g.world.flags.watchList, date: g.world.date, prompt: !!g.watchPrompt }) }))
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
