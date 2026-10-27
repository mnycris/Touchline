// Where building a world spends its time: a CPU profile of createWorld, as self time and total time per function
// (needs the dev server).   node scripts/qa/profile-new-career.mjs
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await page.goto('http://localhost:5173/')
await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
await page.evaluate(async () => { const s = window.__game.getState(); window.__raw = await s.loadDb(); window.__cw = (await import('/src/data/createWorld.ts')).createWorld })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.evaluate(() => {
  const raw = window.__raw
  const opts = { clubId: raw.clubs.find((c) => c.short === 'Sunderland').id, manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-01-11', avatar: {}, avatarColor: '#10b981', style: 'Balanced' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'P' }
  for (let i = 0; i < 2; i++) window.__cw(raw, opts)
})
const { profile } = await cdp.send('Profiler.stop')
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const parent = new Map()
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
const dt = profile.timeDeltas, samples = profile.samples
const self = new Map(), total = new Map()
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/src/')[1] || n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`
for (let i = 0; i < samples.length; i++) {
  const d = (dt[i] || 0) / 1000
  let n = byId.get(samples[i])
  self.set(key(n), (self.get(key(n)) || 0) + d)
  const seen = new Set()
  while (n) { const k = key(n); if (!seen.has(k)) { total.set(k, (total.get(k) || 0) + d); seen.add(k) } n = byId.get(parent.get(n.id)) }
}
const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, t]) => `${t.toFixed(0).padStart(6)} ms  ${f}`).join('\n')
console.log('--- total (incl. callees), two worlds ---\n' + top(total, 40))
console.log('--- self ---\n' + top(self, 25))
await browser.close()
