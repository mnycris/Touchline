// A competition's page in a saved career, every tab photographed top to bottom (the knockouts beside the league phase).
// Needs the dev server (the store is exposed there): node scripts/qa/comp-tabs-ui.mjs <save> <out-dir> [comp key, UCL]
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-comp-tabs', KEY = 'UCL'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE, { width: Number(process.env.W || 390) })
const ok = await page.evaluate((key) => {
  const g = window.__game.getState(), w = g.world
  const c = Object.values(w.competitions).find((c) => (c.key || c.id).replace(/-\d+$/, '') === key && c.season === w.season) || Object.values(w.competitions).find((c) => (c.key || c.id).replace(/-\d+$/, '') === key)
  if (!c) return false
  g.closeAll(); g.go({ name: 'comp', params: { id: c.id } })
  return c.id
}, KEY)
if (!ok) { console.log('no competition', KEY); process.exit(1) }
await page.waitForTimeout(1500)
await page.addStyleTag({ content: '.ci-light { display: none !important; }' })
const tabs = page.locator('.screen .tabs .tab')
const n = await tabs.count()
for (let i = 0; i < n; i++) {
  const name = (await tabs.nth(i).innerText()).trim().replace(/[^a-z0-9]+/gi, '-')
  await tabs.nth(i).click()
  await page.waitForTimeout(900)
  // top, then a screen further down, then another
  for (let k = 0; k < 3; k++) {
    await page.evaluate((k) => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = k * 700 }, k)
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${OUT}/${KEY}-${i}-${name}-${k}.png` })
  }
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 0 })
}
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
