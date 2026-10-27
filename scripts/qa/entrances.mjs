// Screen entrances frame by frame: every animation on the page held at the same moment (60, 200, 400, 700 ms and the
// end), for the Transfers tab and for a competition's page.
// node scripts/qa/entrances.mjs <save> <out-dir> [comp key]   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-entrances', KEY = 'EFLCUP'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
const TIMES = [60, 200, 400, 700, 2000]
async function frames(name, start) {
  for (const t of TIMES) {
    await start()
    await page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t } }, t)
    await page.waitForTimeout(60)
    await page.screenshot({ path: `${OUT}/${name}-${String(t).padStart(4, '0')}.png` })
  }
}
await page.waitForTimeout(800)
// Transfers: from Central, by the tab bar, as a player does
await frames('transfers', async () => {
  await page.evaluate(() => window.__game.getState().setTab('central'))
  await page.waitForTimeout(500)
  await page.locator('.bottom-nav button, nav button', { hasText: /Transfers/i }).first().click()
})
// a competition's page
const id = await page.evaluate((k) => Object.values(window.__game.getState().world.competitions).find((c) => c.key === k && c.season === window.__game.getState().world.season)?.id, KEY)
await frames(`comp-${KEY}`, async () => {
  await page.evaluate(() => { const s = window.__game.getState(); s.setTab('season') })
  await page.waitForTimeout(500)
  await page.evaluate((id) => window.__game.getState().go({ name: 'comp', params: { id } }), id)
})
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
