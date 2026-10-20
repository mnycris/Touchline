// Navigation-state audit: what comes back when you return to a page, and what starts afresh.
//   node scripts/qa/nav-state.mjs <save>
import { openSave } from './load-save.mjs'
const { page, browser, errors } = await openSave(process.argv[2])
let fails = 0
const ok = (c, what) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const st = (fn, arg) => page.evaluate(fn, arg)
const scroller = () => page.evaluate(() => { const el = [...document.querySelectorAll('.screen')].pop(); return el.scrollTop })
const scrollTo = (y) => page.evaluate((y) => { const el = [...document.querySelectorAll('.screen')].pop(); el.scrollTop = y; el.dispatchEvent(new Event('scroll')) }, y)
const wait = (ms = 700) => page.waitForTimeout(ms)
const pid = await st(() => { const w = window.__game.getState().world; return Object.values(w.players).find((p) => p.clubId === w.userClubId).id })

await st(() => window.__game.getState().setTab('squad')); await wait()
await scrollTo(600); await wait(200)
const squadTop = await scroller()
await st((id) => window.__game.getState().go({ name: 'player', params: { id } }), pid); await wait()
await scrollTo(400); await wait(200)
await st(() => window.__game.getState().back()); await wait()
ok(Math.abs((await scroller()) - squadTop) < 4, `back from a player: the squad list where it was (${squadTop})`)
await st((id) => window.__game.getState().go({ name: 'player', params: { id } }), pid); await wait()
ok((await scroller()) === 0, 'the same player opened again: from the top, not the old position')
await st(() => window.__game.getState().back()); await wait()

await st(() => window.__game.getState().setTab('season')); await wait()
await st(() => window.__game.getState().setTab('squad')); await wait()
ok(Math.abs((await scroller()) - squadTop) < 4, 'another tab and back, same day: the squad list where it was')
await st(() => window.__game.getState().setTab('squad')); await wait(900)
ok((await scroller()) < 4, 'the squad tab tapped again at its root: back to the top')
await scrollTo(600); await wait(200)

// a Continue later the tab root starts at the top again
await st(() => window.__game.getState().setTab('central')); await wait()
await st(() => window.__game.getState().advance(window.__game.getState().world.date.slice(0, 8) + String(Number(window.__game.getState().world.date.slice(8)) + 1).padStart(2, '0'))); await wait(1500)
await st(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('squad') }); await wait()
ok((await scroller()) < 4, 'after a Continue: the squad tab back at the top')

// a table's Short / Full / Form is the reader's preference, kept across competitions
const comps = await st(() => { const w = window.__game.getState().world; return Object.values(w.competitions).filter((c) => c.season === w.season && c.format === 'league').slice(0, 2).map((c) => c.id) })
await st(() => window.__game.getState().setTab('season')); await wait()
await st((id) => window.__game.getState().go({ name: 'comp', params: { id } }), comps[0]); await wait()
await page.locator('.seg button', { hasText: 'Full' }).first().click(); await wait(300)
await st(() => window.__game.getState().back()); await wait()
await st((id) => window.__game.getState().go({ name: 'comp', params: { id } }), comps[1]); await wait()
ok(await page.locator('.seg button.on', { hasText: 'Full' }).count() > 0, 'table mode kept for another competition')
await page.locator('.tabs button', { hasText: /Stats/ }).first().click(); await wait(300)
await st(() => window.__game.getState().back()); await wait()
await st((id) => window.__game.getState().go({ name: 'comp', params: { id } }), comps[1]); await wait()
ok(await page.locator('.tabs button.on', { hasText: /Table/ }).count() > 0, 'a competition opened afresh: on its first tab, not the one left last time')
console.log(errors.join('\n') || 'no errors')
console.log(fails ? `${fails} FAILED` : 'all ok')
await browser.close()
process.exit(fails ? 1 : 0)
