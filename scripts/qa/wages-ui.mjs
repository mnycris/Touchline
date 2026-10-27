// Wages without a wage budget, as the manager meets them: the transfer hub's figure and its sheet, personal terms for a
// free agent and for a club's player (the agent's position, Match, what the contract does to the bill), a renewal,
// the contracts list, the club's finances and the board's objective.
// node scripts/qa/wages-ui.mjs <save> <out-dir>   (needs the dev server; a save in a window shows the most)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-wages'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scrollTo = (sel) => page.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].pop(); el?.scrollIntoView({ block: 'center' }) }, sel)
const text = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.replace(/\n/g, ' · ')).join(' | '), sel)
const g = (fn, arg) => page.evaluate(fn, arg)

const info = await g(() => {
  const w = window.__game.getState().world
  const o = w.board.objectives.filter((x) => x.season === w.season && x.category === 'Financial').map((x) => `${x.text} [${x.metric} ${x.target}] ${Math.round(x.progress * 100)}%`)
  const c = w.clubs[w.userClubId]
  return { date: w.date, club: c.name, version: w.meta.version, scale: c.finance.incomeScale, backing: c.finance.backing, objectives: o, budget: c.finance.transferBudget, balance: c.finance.balance }
})
console.log(JSON.stringify(info, null, 1))

// the transfer hub: the wages figure, then its sheet
await g(() => window.__game.getState().setTab('transfers'))
await shot('hub', 1200)
await page.locator('.hero-wage').click()
await shot('wage-sheet', 900)
console.log('sheet:', await text('.sheet .ws-nums'))
const closeSheet = async () => { await page.locator('.sheet [aria-label="Close"]').last().click().catch(() => {}); await page.waitForTimeout(500) }
await closeSheet()

const targets = await g(() => {
  const w = window.__game.getState().world
  const free = Object.values(w.players).filter((p) => !p.clubId && !p.retired && p.ovr >= 72).sort((a, b) => b.ovr - a.ovr)[0]
  const star = Object.values(w.players).filter((p) => p.clubId && p.clubId !== w.userClubId && p.ovr >= 82 && !p.arrivedOn).sort((a, b) => b.ovr - a.ovr)[6]
  const mine = Object.values(w.players).filter((p) => p.clubId === w.userClubId && !p.loan).sort((a, b) => a.contract.until - b.contract.until || b.ovr - a.ovr)[0]
  return { free: free?.id, star: star?.id, mine: mine?.id, names: [free?.name, star?.name, mine?.name] }
})
console.log('targets', targets.names.join(' / '))

// a free agent: straight to terms
if (targets.free) {
  await g((id) => window.__game.getState().open({ name: 'negotiation', params: { playerId: id } }), targets.free)
  await page.waitForTimeout(3500)
  console.log('free agent, agent position:', await text('.nego-ask'))
  console.log('free agent, form opens at:', await text('.overlay .stepper'))
  await scrollTo('.wi'); await shot('free-terms')
  await page.getByText('Match').first().click().catch(() => {})
  await scrollTo('.wi'); await shot('free-matched')
  await page.locator('.wi .tb-info').first().click().catch(() => {})
  await shot('free-sheet', 800)
  await closeSheet()
  console.log('after Match:', await text('.overlay .stepper'), '//', await text('.wi'))
  await g(() => window.__game.getState().closeAll())
  await page.waitForTimeout(500)
}
// a club's player: their price, then his terms
if (targets.star) {
  await g((id) => window.__game.getState().open({ name: 'negotiation', params: { playerId: id } }), targets.star)
  await page.waitForTimeout(1200)
  console.log('pre-bid:', await text('.bid-money'))
  await scrollTo('.bid-money'); await shot('pre-bid')
  const chips = page.locator('.overlay .chip')
  const k = await chips.count()
  if (k) await chips.nth(Math.min(3, k - 1)).click()
  await page.getByText('Submit offer').click().catch(() => {})
  await page.waitForTimeout(4500)
  if (await page.getByText(/Accept their price/).count()) { await page.getByText(/Accept their price/).click(); await page.waitForTimeout(4500) }
  if (await page.locator('.nego-ask').count()) {
    console.log('club player, agent position:', await text('.nego-ask'))
    await page.getByText('Match').first().click().catch(() => {})
    await scrollTo('.wi'); await shot('star-matched')
    console.log('after Match:', await text('.wi'))
  } else await shot('star-no-terms')
  await g(() => window.__game.getState().closeAll())
  await page.waitForTimeout(500)
}
// a renewal
if (targets.mine) {
  await g((id) => window.__game.getState().open({ name: 'renewal', params: { id } }), targets.mine)
  await page.waitForTimeout(3000)
  console.log('renewal, agent position:', await text('.nego-ask'))
  await scrollTo('.wi'); await shot('renewal')
  await g(() => window.__game.getState().closeAll())
  await page.waitForTimeout(500)
}
// contracts, finances, board
await g(() => window.__game.getState().go({ name: 'contracts' }))
await shot('contracts', 900)
await g(() => window.__game.getState().go({ name: 'office' }))
await page.waitForTimeout(800)
await page.getByText('Finances', { exact: true }).click().catch(() => {})
await shot('finances', 900)
console.log('ledger:', (await text('.card.list .li')).slice(0, 500))
await page.getByText('Board Objectives', { exact: true }).click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /of the club's income/.test(e.textContent || '')); el?.scrollIntoView({ block: 'center' }) })
await shot('board', 600)
// overdrawn: the board's freeze shown before any bid is made
if (targets.star) {
  await g(() => window.__game.getState().mutate((w) => { w.clubs[w.userClubId].finance.balance = -20_000_000 }))
  await g((id) => window.__game.getState().open({ name: 'negotiation', params: { playerId: id } }), targets.star)
  await page.waitForTimeout(1200)
  await scrollTo('.bid-money'); await shot('overdrawn-bid')
  console.log('overdrawn:', await text('.bid-money'))
}
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
