// Press conference with follow-ups, from a save: opens the next fixture's pre-match conference and answers each
// question, preferring an answer that draws a follow-up. node scripts/qa/press-ui.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/press-ui'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 300) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const bottom = () => page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = s.scrollHeight })
const fid = await page.evaluate(() => {
  const w = window.__game.getState().world
  const f = Object.values(w.fixtures).filter((x) => !x.played && (x.home === w.userClubId || x.away === w.userClubId)).sort((a, b) => a.date.localeCompare(b.date))[0]
  window.__game.getState().open({ name: 'press', params: { kind: 'pre', fixtureId: f.id } })
  return f.id
})
await shot('open', 900)
for (let q = 0; q < 9; q++) {
  await page.waitForSelector('.btn.answer', { timeout: 9000 }).catch(() => {})
  if (!(await page.locator('.btn.answer').count())) break
  await bottom(); await shot(`q${q + 1}`, 250)
  // the conference's questions live in React state; pick the answer with a follow-up when there is one
  const idx = await page.evaluate((k) => {
    const tones = [...document.querySelectorAll('.btn.answer .tone')].map((b) => b.textContent)
    const pref = (process_tones => ['Deflect', 'Critical', 'Humble', 'Joke'].map((t) => tones.indexOf(t)).find((i) => i >= 0))()
    return k === 'first' ? 0 : pref ?? 0
  }, process.env.PICK || 'pref')
  await page.locator('.btn.answer').nth(idx).click()
  await page.waitForTimeout(500)
}
await bottom(); await shot('summary', 700)
console.log(fid, errors.length ? errors.join('\n') : 'no errors')
await browser.close()
