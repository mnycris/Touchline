// Knockout brackets from a mid-season save. node scripts/qa/bracket-ui.mjs <save.touchline> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-bracket'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const comps = await page.evaluate(() => { const w = window.__game.getState().world; return Object.values(w.competitions).filter((c) => c.season === w.season && c.rounds.length && ['FACUP', 'UCL', 'EFLCUP', 'CDR', 'DFB', 'UEL'].includes(c.key)).map((c) => ({ id: c.id, key: c.key })) })
console.log(comps)
for (const c of comps) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'comp', params: { id } }), c.id)
  await page.waitForTimeout(600)
  const tab = page.locator('.tabs button', { hasText: /Knockouts|Play-offs/ }).first()
  if (await tab.count()) await tab.click()
  await shot(`${c.key}`, 900)
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 520 })
  await shot(`${c.key}-down`, 400)
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 0 })
  if (c.key === 'FACUP' || c.key === 'UCL') {
    const tie = page.locator('.bk-tie:not(:disabled)').first()
    if (await tie.count()) { await tie.click(); await shot(`${c.key}-tie`, 600); await page.locator('.sheet .iconbtn[aria-label=Close]').click().catch(() => {}); await page.waitForTimeout(300) }
    await page.evaluate(() => { const b = document.querySelector('.bk-scroll'); if (b) b.scrollLeft = 9999 })
    await shot(`${c.key}-right`, 500)
  }
}
console.log(JSON.stringify({ errors }))
await browser.close()
