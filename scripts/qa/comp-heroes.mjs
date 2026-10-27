// The competition pages as they open: the title card (hero) of each of the club's competitions, caught early in its
// entrance and once settled, and its knockouts tab.
// node scripts/qa/comp-heroes.mjs <save> <out-dir> [comp keys, comma separated]   (needs the dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-heroes', KEYS] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
const comps = await page.evaluate((keys) => {
  const w = window.__game.getState().world
  const all = Object.values(w.competitions).filter((c) => c.season === w.season)
  const pick = keys ? keys.split(',').map((k) => all.find((c) => c.key === k)).filter(Boolean) : all.filter((c) => c.clubs.includes(w.userClubId))
  return pick.map((c) => ({ id: c.id, key: c.key, name: c.name }))
}, KEYS)
console.log(comps.map((c) => c.key).join(' '))
for (const c of comps) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'comp', params: { id } }), c.id)
  await page.waitForTimeout(120)
  await page.screenshot({ path: `${OUT}/${c.key}-0-entering.png` })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${c.key}-1-hero.png` })
  const ko = page.locator('.tabs button, .tab', { hasText: /Knockouts|Play-offs/ }).first()
  if (await ko.count()) { await ko.click().catch(() => {}); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${c.key}-2-knockouts.png` }) }
  await page.evaluate(() => window.__game.getState().back?.())
  await page.waitForTimeout(500)
}
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
