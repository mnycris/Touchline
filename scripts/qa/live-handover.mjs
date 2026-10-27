// A live match, played as a manager would: kick off, go to half-time, make a substitution through Manage → Subs (the
// assistant stands down for the rest of the match), then Sim to end (the assistant takes the rest back), with a
// screenshot at each step. node scripts/qa/live-handover.mjs <save on match day> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-live-handover'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
const state = () => page.evaluate(() => {
  const g = window.__game.getState(), l = g.live
  if (!l) return { live: false }
  const us = l.sim.home.clubId === g.world.userClubId ? 0 : 1
  const s = l.sim.sides[us]
  return { live: true, minute: l.sim.minute, phase: l.sim.phase, finished: l.sim.finished, handsOn: s.handsOn, assistant: !!l.sim.ctx.assistantSubs, subs: s.subsUsed, us, subMins: l.sim.events.filter((e) => e.type === 'sub' && e.side === us).map((e) => e.min) }
})
await page.locator('.continue-btn').click()
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Play match/ }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/1-kickoff.png` })
await page.getByRole('button', { name: /To half-time/ }).click()
await page.waitForFunction(() => window.__game.getState().live?.sim.phase === 'HT', null, { timeout: 60000 })
console.log('half-time', JSON.stringify(await state()))
await page.waitForTimeout(500)
await page.locator('[aria-label="Close the report"]').click().catch(() => {})
await page.getByRole('button', { name: /Manage/ }).click()
await page.waitForTimeout(500)
await page.locator('.seg button', { hasText: /^Subs/ }).first().click()
await page.waitForTimeout(400)
await page.locator('.fl-pl').nth(5).click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/2-subs.png` })
await page.locator('.fl-bench-row').first().click()
await page.waitForTimeout(500)
const after = await state()
console.log('after his own change', JSON.stringify(after))
await page.screenshot({ path: `${OUT}/3-subbed.png` })
await page.locator('.sheet [aria-label="Close"]').first().click().catch(() => {})
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Sim to end/ }).click()
await page.waitForFunction(() => window.__game.getState().live?.sim.finished, null, { timeout: 60000 })
const end = await state()
console.log('full time', JSON.stringify(end))
await page.screenshot({ path: `${OUT}/4-fulltime.png` })
console.log(after.handsOn === true ? 'OK: the manager took over with his change' : 'FAIL: his change did not hand him the match')
console.log(end.handsOn === false && end.assistant ? 'OK: Sim to end handed the rest back to the assistant' : 'FAIL: Sim to end did not hand back')
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
