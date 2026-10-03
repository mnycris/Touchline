// Popup exits: plays the next match live and photographs a goal card (or any match moment) on its way out, plus a
// toast leaving. node scripts/qa/popup-exit.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/popup-exit'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
// to match day, then kick off
await page.evaluate(() => window.__game.getState().advance())
await page.waitForSelector('text=Play match', { timeout: 60000 })
await page.getByText('Play match').click()
await page.waitForSelector('.lp-wrap, .match-body', { timeout: 20000 })
// fast forward until a moment card shows, then let it time out while photographing
let shots = 0
for (let i = 0; i < 400 && shots < 1; i++) {
  if (await page.locator('.goal-card, .mm').count()) {
    await page.screenshot({ path: `${OUT}/1-shown.png` })
    // freeze the moment's exit at a few points: dismiss it, then pause the leave animation
    await page.locator('.presence:not(.presence-leaving) > .goal-card, .presence:not(.presence-leaving) > .mm').first().click()
    for (const t of [40, 120, 200]) {
      await page.evaluate((t) => { for (const a of document.getAnimations()) { if (a.animationName === 'popOut') { a.pause(); a.currentTime = t } } }, t)
      const leaving = await page.locator('.presence-leaving').count()
      await page.screenshot({ path: `${OUT}/2-leaving-${t}.png` })
      console.log('t', t, 'leaving elements', leaving)
    }
    await page.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName === 'popOut') a.play() })
    shots++
  }
  await page.waitForTimeout(120)
}
await page.waitForTimeout(500)
console.log('after exit, leftover leaving:', await page.locator('.presence-leaving').count())
await page.evaluate(() => window.__game.getState().notify('A toast that should leave smoothly', 'ok'))
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/3-toast.png` })
await page.waitForTimeout(2350)
console.log('toast leaving:', await page.locator('.presence-leaving .toast').count())
await page.screenshot({ path: `${OUT}/4-toast-leaving.png` })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
