// The player match panel as it looks mid-match and at full time: a save's next match played to about 70 minutes, the
// line-ups opened and a few players tapped (a midfielder, a forward, the keeper), each panel captured top to bottom.
// node scripts/qa/player-panel.mjs <save> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-panel'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
for (let i = 0; i < 20; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.evaluate(() => { const g = window.__game.getState(); const l = g.live; if (l) g.setLive({ ...l, speed: 60 }) })
// through half-time to about 70 minutes
for (let k = 0; k < 120; k++) {
  const m = await page.evaluate(() => { const s = window.__game.getState().live?.sim; return s ? { min: s.minute, ph: s.phase } : null })
  if (!m || m.min >= 70) break
  if (m.ph === 'HT') await page.locator('.ctl-btn.big').click().catch(() => {})
  await page.waitForTimeout(700)
}
await page.locator('.ctl-btn.big').click().catch(() => {})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/00-match.png` })
console.log('state', await page.evaluate(() => { const s = window.__game.getState().live?.sim; return s ? `${s.phase} ${s.minute}` : 'no live' }))
await page.locator('.tabs .tab', { hasText: 'Line-ups' }).first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/00-lineups.png` })
async function panel(sel, name) {
  const el = page.locator(sel).first()
  if (!(await el.count())) { console.log('no', sel); return }
  await el.click({ force: true })
  await page.waitForSelector('.pmp', { timeout: 5000 })
  await page.waitForTimeout(700)
  for (let k = 0; k < 4; k++) {
    await page.evaluate((k) => { const s = document.querySelector('.sheet-body') || document.querySelector('.sheet'); if (s) s.scrollTop = k * 620 }, k)
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${name}-${k}.png` })
  }
  await page.locator('.pmp-pill.x').click()
  await page.waitForTimeout(500)
}
const players = page.locator('.fl-pl')
console.log('players found', await players.count())
await panel('.fl-pl >> nth=6', 'mid')
await panel('.fl-pl >> nth=9', 'fwd')
await panel('.fl-pl >> nth=0', 'gk')
console.log(errors.join('\n') || 'no errors')
await browser.close()
