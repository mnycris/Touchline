// The iPhone swipe back, driven with real touch sequences (CDP): mid-pull, a completed swipe, a short pull that
// settles back, a vertical scroll from the edge (left to the page), and an overlay pulled off the screen beneath.
//   node scripts/qa/swipe-back.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [save, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(save)
const cdp = await page.context().newCDPSession(page)
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
let n = 0
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const state = () => page.evaluate(() => { const s = window.__game.getState(); return { tab: s.tab, depth: s.stacks[s.tab].length, top: s.stacks[s.tab].at(-1)?.name, ov: s.overlay.map((o) => o.name) } })
async function drag(x0, y0, x1, y1, steps, holdShot) {
  await touch('touchStart', x0, y0)
  for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(16) }
  if (holdShot) await shot(holdShot)
  await touch('touchEnd', x1, y1)
  await page.waitForTimeout(600)
}
// into a stack: Squad tab, then a player
await page.locator('.bottomnav .navitem[aria-label="Squad"]').click()
await page.waitForTimeout(500)
await page.locator('.squad-row').first().click()
await page.waitForTimeout(700)
console.log('before', JSON.stringify(await state()))
await shot('profile')
// 1. a short pull that settles back
await drag(6, 420, 90, 425, 6, 'short-pull-mid')
console.log('after short pull', JSON.stringify(await state()))
await shot('short-pull-settled')
// 2. a vertical scroll that starts at the edge: not a swipe back
await drag(8, 600, 14, 300, 8)
console.log('after vertical', JSON.stringify(await state()))
// 3. a full pull: back to the list
await drag(6, 420, 300, 430, 14, 'full-pull-mid')
console.log('after full pull', JSON.stringify(await state()))
await shot('back-on-list')
// 4. an overlay over the hub: the fixture / match day screen, pulled off
await page.locator('.bottomnav .navitem').first().click()
await page.waitForTimeout(500)
await page.evaluate(() => { const s = window.__game.getState(); const f = Object.values(s.world.fixtures).find((x) => !x.played && (x.home === s.world.userClubId || x.away === s.world.userClubId)); s.open({ name: 'fixture', params: { id: f.id } }) })
await page.waitForTimeout(700)
console.log('overlay open', JSON.stringify(await state()))
await drag(5, 400, 230, 400, 12, 'overlay-pull-mid')
console.log('after overlay pull', JSON.stringify(await state()))
await shot('overlay-closed')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
