// The system's back as the installed iPhone app gets it: Capacitor's web view (stood in for) with WebKit's swipe (a
// history.back() is what the swipe does when it completes). Checks that the history holds one entry per step there
// is to go back through, everywhere (the menu's views, New Career's steps, a career's screens, overlays, the search, a
// tab switch), that a system back is the app's back without the app drawing it a second time, that the app's own Back
// takes the history with it, and what the app tells the native side about swiping back.
// node scripts/qa/system-back.mjs <save> [out-dir]   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
const [SAVE, OUT = '/tmp/opus-system-back'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
})
// the installed app: Capacitor's bridge and the native handler the app talks to
await ctx.addInitScript(() => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
  window.__said = []
  window.webkit = { messageHandlers: { touchline: { postMessage: (m) => window.__said.push(m.swipeBack) } } }
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let fails = 0
const check = (ok, what) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`); if (!ok) fails++ }
const wait = (ms = 450) => page.waitForTimeout(ms)
const hist = () => page.evaluate(() => ({ tl: history.state?.tl, len: history.length }))
const said = () => page.evaluate(() => window.__said[window.__said.length - 1])
const app = () => page.evaluate(() => { const s = window.__game.getState(); return { depth: s.world ? s.overlay.length + s.stacks[s.tab].length + (s.searchOpen ? 1 : 0) : -1, tab: s.tab, top: (s.overlay[s.overlay.length - 1] || s.stacks[s.tab][s.stacks[s.tab].length - 1])?.name } })
// the swipe, completed: the history goes back, as WebKit's gesture does
const swipe = async () => { await page.evaluate(() => history.back()); await wait(600) }
const ghosts = () => page.evaluate(() => document.querySelectorAll('#fx-over .ghost-back, #fx-over .ghost-close').length)

await page.goto('http://localhost:5173/')
await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
await wait(800)
check((await hist()).tl === 0, 'the menu: the history at its base')

// the menu's views
await page.locator('button', { hasText: /Settings/ }).first().click(); await wait()
check((await hist()).tl === 1, `Settings: one entry (tl ${(await hist()).tl})`)
check((await said()) === true, 'Settings: the app says it can be swiped back')
await swipe()
check(!(await page.locator('.topbar .title', { hasText: /Settings/i }).count()) && (await hist()).tl === 0, 'swiping back from Settings: the menu, the history at its base')
check((await said()) === false, 'the menu: no swiping back')

// New Career, step by step
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 }); await wait()
check((await hist()).tl === 1, `New Career, step 1: one entry (tl ${(await hist()).tl})`)
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.locator('.nc-go').click(); await wait()
check((await hist()).tl === 2, `step 2: two entries (tl ${(await hist()).tl})`)
await page.locator('.nc-lg', { hasText: 'Premier League' }).first().click(); await wait()
check((await hist()).tl === 3, `step 3: three (tl ${(await hist()).tl})`)
await page.locator('.nc-club').first().click(); await wait(700)
check((await hist()).tl === 4 && (await page.locator('.nc-cp').count()) === 1, `a club opened: four (tl ${(await hist()).tl})`)
await swipe()
check(!(await page.locator('.nc-cp').count()) && (await hist()).tl === 3, 'swiping back closes the club, step 3 again')
await swipe()
check((await page.locator('.topbar .title').first().innerText()).match(/League/i) && (await hist()).tl === 2, 'swiping back: step 2')
// the app's own Back takes the history with it
await page.locator('.topbar .iconbtn[aria-label="Back"]').first().click(); await wait(700)
check((await hist()).tl === 1 && (await page.locator('input[placeholder="First name"]').count()) === 1, `the Back button: step 1, the history with it (tl ${(await hist()).tl})`)
await page.locator('.topbar .iconbtn[aria-label="Back"]').first().click(); await wait(700)
check((await hist()).tl === 0, `the Back button on step 1: the menu, the history at its base (tl ${(await hist()).tl})`)

// a career
await page.locator('button', { hasText: /^\s*Load/ }).first().click(); await wait()
await page.setInputFiles('input[type=file]', SAVE)
await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 }); await wait(500)
await page.locator('.card', { hasText: /·/ }).first().locator('button').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 }); await wait(800)
await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
check((await hist()).tl === 0 && (await app()).depth === 0, `the career's Central: the history at its base (tl ${(await hist()).tl})`)
const ids = await page.evaluate(() => { const w = window.__game.getState().world; const me = w.clubs[w.userClubId]; const p = Object.values(w.players).find((x) => x.clubId === me.id); const rival = Object.values(w.clubs).find((c) => c.leagueId === me.leagueId && c.id !== me.id); return { club: rival.id, player: p.id } })
await page.evaluate((id) => window.__game.getState().go({ name: 'club', params: { id } }), ids.club); await wait(700)
await page.evaluate((id) => window.__game.getState().go({ name: 'player', params: { id } }), ids.player); await wait(700)
check((await hist()).tl === 2 && (await app()).depth === 2, `two screens in: two entries (tl ${(await hist()).tl})`)
check((await said()) === true, 'a pushed screen: swipe back on')
await swipe()
const a1 = await app()
check(a1.depth === 1 && a1.top === 'club' && (await hist()).tl === 1, `swiping back: the club page (${a1.top}), one entry`)
check((await ghosts()) === 0, 'the app drew no second way back over the system\'s')
await page.locator('.app > .layer .topbar .iconbtn[aria-label="Back"]').click(); await wait(700)
check((await app()).depth === 0 && (await hist()).tl === 0, `the Back button: Central, the history with it (tl ${(await hist()).tl})`)
check((await said()) === false, 'a tab\'s root: swipe back off')

// the search
await page.evaluate(() => window.__game.getState().openSearch()); await wait()
check((await hist()).tl === 1, 'the search: one entry')
await swipe()
check(!(await page.evaluate(() => window.__game.getState().searchOpen)) && (await hist()).tl === 0, 'swiping back closes the search')

// an overlay
await page.evaluate(() => window.__game.getState().open({ name: 'calendar' })); await wait(700)
check((await hist()).tl === 1 && (await app()).depth === 1, 'an overlay: one entry')
await swipe()
check((await app()).depth === 0 && (await hist()).tl === 0, 'swiping back closes the overlay')

// a tab switch: the screens behind aren't the ones the history holds, until the next step forward
await page.evaluate((id) => window.__game.getState().go({ name: 'club', params: { id } }), ids.club); await wait(600)
await page.evaluate(() => window.__game.getState().setTab('squad')); await wait(600)
check((await hist()).tl === 0, 'another tab at its root: the history at its base')
await page.evaluate(() => window.__game.getState().setTab('central')); await wait(700)
check((await hist()).tl === 1 && (await app()).depth === 1, 'back on Central\'s club page: one entry')
check((await said()) === false, '…but no swiping back (the history behind it holds another tab)')
await page.evaluate((id) => window.__game.getState().go({ name: 'player', params: { id } }), ids.player); await wait(700)
check((await said()) === true, 'one step forward: swipe back on again')
await swipe()
check((await app()).top === 'club' && (await hist()).tl === 1, 'and it goes back to the club page')

// a sheet over the screen
await page.evaluate(() => { const s = window.__game.getState(); s.closeAll(); s.setTab('squad') }); await wait(400)
await page.evaluate((id) => window.__game.getState().go({ name: 'player', params: { id } }), ids.player); await wait(700)
const sheetBtn = page.locator('.app > .layer button', { hasText: /Contract|Actions|More|Offer/ }).first()
if (await sheetBtn.count()) {
  await sheetBtn.click(); await wait(600)
  if (await page.evaluate(() => document.getElementById('sheet-host')?.childElementCount)) check((await said()) === false, 'a sheet open: swipe back off')
}
await page.screenshot({ path: `${OUT}/end.png` })
console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}; said: ${JSON.stringify(await page.evaluate(() => window.__said))}`)
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
process.exit(fails ? 1 : 0)
