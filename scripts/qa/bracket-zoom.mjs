// Close-ups of one competition's bracket. node scripts/qa/bracket-zoom.mjs <save> <out.png> <compKey> [scrollLeft]
import { openSave } from './load-save.mjs'
const [file, out, key = 'UCL', sl] = process.argv.slice(2)
const { page, browser, errors } = await openSave(file)
const id = await page.evaluate((key) => { const w = window.__game.getState().world; return Object.values(w.competitions).find((c) => c.season === w.season && c.key === key)?.id }, key)
await page.evaluate((id) => window.__game.getState().go({ name: 'comp', params: { id } }), id)
await page.waitForTimeout(600)
await page.locator('.tabs button', { hasText: /Knockouts|Play-offs/ }).first().click()
await page.waitForTimeout(1400)
if (sl) await page.evaluate((sl) => { const b = document.querySelector('.bk-scroll'); if (b) b.scrollLeft = Number(sl) }, sl)
await page.waitForTimeout(300)
await page.screenshot({ path: out })
console.log(JSON.stringify({ errors }))
await browser.close()
