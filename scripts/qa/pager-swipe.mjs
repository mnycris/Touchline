// Central's competition pager under real touch swipes: one page per swipe, the dots following, a tap on a dot.
// node scripts/qa/pager-swipe.mjs <save>   (needs the dev server)
import { openSave } from './load-save.mjs'
const [SAVE] = process.argv.slice(2)
const { page, browser } = await openSave(SAVE)
await page.waitForTimeout(800)
await page.evaluate(() => document.querySelector('.cpg')?.scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
const b = await page.evaluate(() => { const r = document.querySelector('.cpg-track').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
const cdp = await page.context().newCDPSession(page)
const state = () => page.evaluate(() => { const t = document.querySelector('.cpg-track'); return `${(t.scrollLeft / t.clientWidth).toFixed(2)} ${[...document.querySelectorAll('.cpg-dot')].map((d) => d.getAttribute('aria-selected') === 'true' ? '●' : '·').join('')} a=${[...document.querySelectorAll('.cpg-dot')].map((d) => d.style.getPropertyValue('--a')).join(',')}` })
const swipe = async (dx) => {
  const y = Math.round(b.y + b.h / 2), x0 = Math.round(b.x + b.w / 2 + (dx < 0 ? 80 : -80))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 12, y }] }); await page.waitForTimeout(12) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
console.log('start   ', await state())
await swipe(-170); await page.waitForTimeout(700); console.log('swipe ← ', await state())
await swipe(-170); await page.waitForTimeout(700); console.log('swipe ← ', await state())
await swipe(-170); await page.waitForTimeout(700); console.log('swipe ← ', await state())
await swipe(170); await page.waitForTimeout(700); console.log('swipe → ', await state())
// tap the first dot
await page.locator('.cpg-dot').first().click(); await page.waitForTimeout(800); console.log('tap dot1', await state())
await browser.close()
