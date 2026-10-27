// How long starting a career takes, stage by stage (the players, the clubs, the season), then the save; and inside
// the slowest stages, which parts (needs the dev server).
// node scripts/qa/time-new-career.mjs
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await page.goto('http://localhost:5173/')
await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
const r = await page.evaluate(async () => {
  const s = window.__game.getState()
  const raw = await s.loadDb()
  const { createWorldAsync } = await import('/src/data/createWorld.ts')
  const opts = { clubId: raw.clubs.find((c) => c.short === 'Sunderland').id, manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-01-11', avatar: {}, avatarColor: '#10b981', style: 'Balanced' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'Timing' }
  const runs = []
  for (let i = 0; i < 3; i++) {
    let t = performance.now()
    const st = {}
    const w = await createWorldAsync(raw, opts, (k) => { st[k] = Math.round(performance.now() - t); t = performance.now() })
    t = performance.now()
    const { careerIntro } = await import('/src/engine/world/advance.ts')
    careerIntro(w)
    st.intro = Math.round(performance.now() - t)
    t = performance.now()
    const json = JSON.stringify(w)
    st.stringify = Math.round(performance.now() - t)
    st.mb = Math.round(json.length / 1e6)
    t = performance.now()
    const { saveCareer } = await import('/src/services/saves.ts')
    await saveCareer(w, { id: 'timing-' + i, name: 'T', clubName: 'S', clubId: w.userClubId, season: w.season, date: w.date, manager: 'J', auto: false })
    st.save = Math.round(performance.now() - t)
    runs.push(st)
  }
  return runs
})
console.log(JSON.stringify(r))
await browser.close()
