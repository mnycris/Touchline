// Competition pages in their identity, top to bottom, every tab; the Season page's competition tiles; a club page;
// the hub. node scripts/qa/comp-pages.mjs <save> <out-dir> [keys=UCL,L13,FACUP]
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [save, OUT, keysArg] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(save)
let n = 0
const shot = async (name, full = false) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full }) }
await shot('hub')
await page.locator('.bottomnav .navitem[aria-label="Season"]').click()
await shot('season')
const keys = (keysArg || 'UCL,L13,FACUP').split(',')
for (const k of keys) {
  const id = await page.evaluate((k) => { const w = window.__game.getState().world; const cs = Object.values(w.competitions).filter((c) => c.key === k || c.key.replace(/-\d+$/, '') === k).sort((a, b) => b.season - a.season); return cs[0]?.id }, k)
  if (!id) { console.log('no comp', k); continue }
  await page.evaluate((id) => window.__game.getState().go({ name: 'comp', params: { id } }), id)
  await shot(`${k}-top`)
  const tabs = page.locator('.tabs .tab')
  const nt = await tabs.count()
  for (let i = 0; i < nt; i++) {
    await tabs.nth(i).click()
    await page.evaluate(() => { const s = document.querySelector('.app > .layer .screen'); if (s) s.scrollTop = 330 })
    await shot(`${k}-tab${i}`)
  }
  await page.evaluate(() => window.__game.getState().back())
  await page.waitForTimeout(300)
}
const cid = await page.evaluate(() => { const w = window.__game.getState().world; return Object.values(w.clubs).find((c) => c.short === 'Inter')?.id })
await page.evaluate((id) => window.__game.getState().go({ name: 'club', params: { id } }), cid)
await shot('club-inter')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
