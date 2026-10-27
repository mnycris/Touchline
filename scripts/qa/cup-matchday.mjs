// A competition's match-day screen for one of the club's own fixtures in it (the next, else the last), to see how the
// competition's identity sits on the match-day band. node scripts/qa/cup-matchday.mjs <save> <KEY> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, KEY = 'EFLCUP', OUT = '/tmp/opus-cup-matchday'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
const id = await page.evaluate((k) => {
  const w = window.__game.getState().world, me = w.userClubId
  const fx = Object.values(w.fixtures).filter((f) => (f.home === me || f.away === me) && w.competitions[f.compId]?.key.replace(/-\d+$/, '') === k).sort((a, b) => a.date.localeCompare(b.date))
  return (fx.find((f) => !f.played) || fx[fx.length - 1])?.id
}, KEY)
if (!id) console.log(`no ${KEY} fixture for this club`)
else {
  await page.evaluate((id) => { const s = window.__game.getState(); s.closeAll(); s.open({ name: 'prematch', params: { id } }) }, id)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${KEY}-matchday.png` })
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
