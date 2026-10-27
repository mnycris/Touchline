// Personal terms as the manager meets them: a free agent and a player bought from a club, the contract form as it
// opens (what is filled in for him, the signing-on fee above all) and after the agent's first reply.
// node scripts/qa/contract-terms.mjs <save> <out-dir>   (needs the dev server; the save's date should be in a window)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-terms'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const bottom = () => page.evaluate(() => { const s = [...document.querySelectorAll('.overlay .screen, .screen')].pop(); s.scrollTop = s.scrollHeight })
const form = () => page.evaluate(() => [...document.querySelectorAll('.overlay .screen .stepper, .screen .stepper')].map((s) => s.innerText.replace(/\n/g, ' ')).join(' | '))
const targets = await page.evaluate(() => {
  const w = window.__game.getState().world
  const free = Object.values(w.players).filter((p) => !p.clubId && !p.retired && p.ovr >= 72).sort((a, b) => b.ovr - a.ovr)[0]
  const star = Object.values(w.players).filter((p) => p.clubId && p.clubId !== w.userClubId && p.ovr >= 84 && !p.arrivedOn).sort((a, b) => b.ovr - a.ovr)[3]
  return { free: free && { id: free.id, name: free.name, wage: free.wage }, star: star && { id: star.id, name: star.name, wage: star.wage } }
})
console.log('targets', JSON.stringify(targets))
// a free agent: straight to his terms
if (targets.free) {
  await page.evaluate((id) => window.__game.getState().open({ name: 'negotiation', params: { playerId: id } }), targets.free.id)
  await page.waitForTimeout(1500)
  if (await page.getByText(/Offer contract|Personal terms/).count()) {
    await bottom(); await shot('free-terms-open', 2500)
    console.log('free agent form as it opens:', await form())
  } else await shot('free-room')
  await page.evaluate(() => window.__game.getState().closeAll())
  await page.waitForTimeout(500)
}
// a club's player: bid what they ask, then his terms
if (targets.star) {
  await page.evaluate((id) => window.__game.getState().open({ name: 'negotiation', params: { playerId: id } }), targets.star.id)
  await page.waitForTimeout(1200)
  await shot('room')
  const chips = page.locator('.overlay .chip')
  const k = await chips.count()
  if (k) await chips.nth(k - 1).click()
  await page.getByText('Submit offer').click().catch(() => {})
  await page.waitForTimeout(4500)
  if (await page.getByText(/Accept their price/).count()) { await page.getByText(/Accept their price/).click(); await page.waitForTimeout(4000) }
  await bottom(); await shot('after-bid', 600)
  if (await page.getByText(/Offer contract/).count()) {
    console.log('club player form as it opens:', await form())
    await page.getByText('Offer contract').click()
    await page.waitForTimeout(4500)
    await bottom(); await shot('agent-reply')
    console.log('after the agent replies:', await form())
  }
}
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
