// The same screens from two builds of the app, for a side-by-side look: the main menu, then a fresh career (same club,
// same seed) and the screens a player goes through. Run against each server, then lay the pairs side by side.
// node scripts/qa/compare-screens.mjs <url> <out-dir> [club="Arsenal"]
import fs from 'node:fs'
import { chromium } from 'playwright'
const [URL = 'http://localhost:5173/', OUT = '/tmp/opus-compare', CLUB = 'Arsenal'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
const shot = async (name, wait = 900) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const scroll = async (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
await page.goto(URL)
await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
await shot('01-menu', 1800)
// a fresh career, the same way in both builds
await page.evaluate(async (club) => {
  const s = window.__game.getState()
  const raw = await s.loadDb()
  const c = raw.clubs.find((x) => x.short === club || x.name === club || x.name.includes(club))
  await s.startCareer({ clubId: c.id, seed: 11, manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-04-11', avatar: { skin: 1, hair: 2, hairColor: 2, beard: 1, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#1A2233', tie: true }, avatarColor: '#10b981', style: 'Balanced' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'Compare' })
}, CLUB)
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
const go = (r) => page.evaluate((r) => { const s = window.__game.getState(); s.closeAll(); s.go(r) }, r)
const tab = (t) => page.evaluate((t) => { const s = window.__game.getState(); s.closeAll(); s.setTab(t) }, t)
await tab('central'); await shot('02-central-0'); await scroll(760); await shot('03-central-1', 500); await scroll(1500); await shot('04-central-2', 500)
await tab('squad'); await shot('05-squad-0'); await scroll(760); await shot('06-squad-1', 500)
await tab('transfers'); await shot('07-transfers-0'); await scroll(760); await shot('08-transfers-1', 500)
await tab('season'); await shot('09-season-0'); await scroll(760); await shot('10-season-1', 500)
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world
  const comp = (k) => Object.values(w.competitions).find((c) => c.key === k && c.season === w.season)?.id
  const me = w.clubs[w.userClubId]
  const star = Object.values(w.players).filter((p) => p.clubId === me.id).sort((a, b) => b.ovr - a.ovr)[0]
  const f = Object.values(w.fixtures).filter((x) => !x.played && (x.home === me.id || x.away === me.id)).sort((a, b) => a.date.localeCompare(b.date))[0]
  return { league: comp(`L${me.leagueId}`), cup: comp('EFLCUP') || comp('FACUP'), ucl: comp('UCL'), club: me.id, star: star.id, fixture: f?.id }
})
await go({ name: 'comp', params: { id: ids.league } }); await shot('11-league-0'); await scroll(760); await shot('12-league-1', 500)
if (ids.cup) { await go({ name: 'comp', params: { id: ids.cup } }); await shot('13-cup-0'); await scroll(760); await shot('14-cup-1', 500) }
if (ids.ucl) { await go({ name: 'comp', params: { id: ids.ucl } }); await shot('15-ucl-0') }
await go({ name: 'calendar' }); await shot('16-calendar-0'); await scroll(700); await shot('17-calendar-1', 500)
await go({ name: 'office' }); await shot('18-office-0'); await scroll(760); await shot('19-office-1', 500)
await go({ name: 'club', params: { id: ids.club } }); await shot('20-club-0')
await go({ name: 'player', params: { id: ids.star } }); await shot('21-player-0'); await scroll(760); await shot('22-player-1', 500)
await go({ name: 'tactics' }); await shot('23-tactics-0')
if (ids.fixture) { await go({ name: 'prematch', params: { id: ids.fixture } }); await shot('24-matchday-0'); await scroll(760); await shot('25-matchday-1', 500) }
console.log(errors.join('\n') || 'no errors')
await browser.close()
