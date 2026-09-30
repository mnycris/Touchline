// Trophy celebration on Central: entrance, confetti, the send-off. node scripts/qa/celebrate-ui.mjs <save> <out-dir> [compKey]
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-cel', key] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 0) => { if (wait) await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.evaluate((key) => {
  const G = window.__game
  const w = G.getState().world
  const c = Object.values(w.competitions).find((x) => x.season === w.season && (key ? x.key === key : x.winner === w.userClubId)) || Object.values(w.competitions).find((x) => x.season === w.season && x.clubs.includes(w.userClubId) && x.format === 'league')
  G.setState({ prefs: { ...G.getState().prefs, reduceMotion: false } })
  G.getState().mutate((w) => { w.flags.celebrate = { compId: c.id, date: w.date } })
}, key)
for (const ms of [60, 250, 450, 700, 1100, 1800, 3200]) await shot(`in-${ms}`, ms === 60 ? 60 : ms - [60, 250, 450, 700, 1100, 1800, 3200][[60, 250, 450, 700, 1100, 1800, 3200].indexOf(ms) - 1])
await page.locator('.cel-go').click()
for (const ms of [120, 300, 500, 800]) await shot(`out-${ms}`, ms === 120 ? 120 : 180)
console.log(JSON.stringify({ errors }))
await browser.close()
