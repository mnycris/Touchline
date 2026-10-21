// Long names never push a layout off screen: every player gets a very long name, then the main screens and each of
// their tabs are checked for anything sticking out past the screen's edge (outside a container that scrolls or clips
// it on purpose). Needs the dev server (the store is exposed there):
//   node scripts/qa/long-names.mjs <out-dir>     (env W sets the width, default 390)
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-long'
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Maximiliano'); await page.fill('input[placeholder="Last name"]', 'Wojciechowski-Papadopoulos')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
// everyone gets a long name (the last part is what most screens call him)
await page.evaluate(() => {
  const g = window.__game.getState(), w = g.world
  const tails = ['Wojciechowski', 'Papadopoulos', 'Oxlade-Chamberlain', 'Kristoffersen', 'Hernández-Valdivieso', 'Vandenbroucke']
  let i = 0
  for (const p of Object.values(w.players)) { const last = p.name.split(' ').slice(-1)[0]; p.name = `${p.name.split(' ')[0]} ${last}-${tails[i++ % tails.length]}` }
  g.bump()
})

const check = (label) => page.evaluate((label) => {
  const W = innerWidth
  const scr = [...document.querySelectorAll('.screen')].pop()
  const roots = [scr, ...document.querySelectorAll('.tabbar, .sheet, .toast-wrap')].filter(Boolean)
  // the element runs past the box that clips it (or past the screen): a container that scrolls sideways, an ellipsis,
  // or a decoration layered on top are fine
  const problem = (el, r) => {
    // (an SVG clips its own drawing)
    if (el.ownerSVGElement) return false
    if (/(absolute|fixed)/.test(getComputedStyle(el).position)) return false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (a === scr) break
      const cs = getComputedStyle(a)
      if (cs.position === 'absolute' || cs.position === 'fixed') return false
      if (/(auto|scroll)/.test(cs.overflowX)) return false
      if (/(hidden|clip)/.test(cs.overflowX)) {
        if (cs.textOverflow === 'ellipsis') return false
        const ar = a.getBoundingClientRect()
        return r.right > ar.right + 2 || r.left < ar.left - 2
      }
    }
    return r.right > W + 1 || r.left < -1
  }
  const out = []
  const seen = new Set()
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    if (!problem(el, r)) continue
    // the outermost offender only
    let p = el.parentElement, inner = false
    while (p) { if (seen.has(p)) { inner = true; break } p = p.parentElement }
    seen.add(el)
    if (inner) continue
    if (!out.length) { document.querySelectorAll('[data-qa-bad]').forEach((x) => x.removeAttribute('data-qa-bad')); el.setAttribute('data-qa-bad', '1') }
    const cls = (el.getAttribute('class') || '').split(' ').filter(Boolean).slice(0, 3).join('.')
    out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} [${Math.round(r.left)}→${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 60)}"`)
  }
  // text cut off by its box with no ellipsis (a name chopped mid-word)
  const cut = []
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const cs = getComputedStyle(el)
    if (cs.overflowX === 'visible' || cs.textOverflow === 'ellipsis' || cs.whiteSpace !== 'nowrap') continue
    if (el.scrollWidth > el.clientWidth + 2) cut.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]} "${el.textContent.trim().slice(0, 40)}"`)
  }
  return { label, doc: document.documentElement.scrollWidth > W + 1, out: out.slice(0, 8), cut: cut.slice(0, 5) }
}, label)

const report = []
const visit = async (label, fn, tabs = true) => {
  try { await fn() } catch (e) { report.push({ label, err: e.message.split('\n')[0] }); return }
  await page.waitForTimeout(700)
  const snap = async (name) => {
    await page.evaluate(() => document.querySelector('[data-qa-bad]')?.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${name.replace(/[^a-z0-9]+/gi, '-')}.png` })
  }
  const r = await check(label)
  if (r.out.length || r.cut.length || r.doc) { report.push(r); await snap(label) }
  if (tabs) {
    await page.evaluate(() => { document.querySelectorAll('[data-qa-top]').forEach((x) => x.removeAttribute('data-qa-top')); [...document.querySelectorAll('.screen')].pop()?.setAttribute('data-qa-top', '1') })
    const sel = '[data-qa-top] .tabs .tab, [data-qa-top] .seg button'
    const n = await page.locator(sel).count().catch(() => 0)
    for (let i = 0; i < Math.min(n, 12); i++) {
      const t = page.locator(sel).nth(i)
      const name = (await t.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 20)
      if (!name || !(await t.isVisible().catch(() => false))) continue
      await t.click().catch(() => {}); await page.waitForTimeout(450)
      const rr = await check(`${label} › ${name}`)
      if (rr.out.length || rr.cut.length || rr.doc) { report.push(rr); await snap(`${label} › ${name}`) }
    }
  }
}
const go = (r) => page.evaluate((r) => { const g = window.__game.getState(); g.closeAll(); g.go(r) }, r)
const open = (r) => page.evaluate((r) => window.__game.getState().open(r), r)
const ids = await page.evaluate(() => { const w = window.__game.getState().world; const ps = Object.values(w.players).filter((p) => p.clubId === w.userClubId).sort((a, b) => b.ovr - a.ovr); const c = w.competitions[Object.keys(w.competitions).find((k) => w.competitions[k].clubs?.includes(w.userClubId) && w.competitions[k].format === 'league')]; return { p: ps[0].id, club: w.userClubId, comp: c?.id } })

await visit('central', () => go({ name: 'central' }))
await visit('squad', () => page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('squad') }))
await visit('player', () => go({ name: 'player', params: { id: ids.p } }))
await visit('club', () => go({ name: 'club', params: { id: ids.club } }))
await visit('comp', () => go({ name: 'comp', params: { id: ids.comp } }))
await visit('transfers', () => page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('transfers') }))
await visit('academy', () => page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('academy') }))
await visit('season', () => page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('season') }))
await visit('tactics', () => go({ name: 'tactics' }))
await visit('contracts', () => go({ name: 'contracts' }))
await visit('squadStatus', () => go({ name: 'squadStatus' }))
await visit('development', () => go({ name: 'development' }))
// on to our first match: the preview, then the match played live to the end with its report
await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('central') })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForTimeout(800)
await visit('prematch', async () => {})
await page.evaluate(() => document.querySelector('.kp-grid')?.scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/view-players-to-watch.png` })
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.waitForTimeout(1500)
await page.getByText('Sim to end').click()
await page.waitForTimeout(1500)
await visit('match (full time)', async () => {})
const fid = await page.evaluate(() => window.__game.getState().live?.fixtureId)
await page.getByText(/Full-time · Continue|Continue/).last().click().catch(() => {})
await page.waitForTimeout(1200)
if (fid) await visit('fixture report', () => page.evaluate((id) => { const g = window.__game.getState(); g.closeAll(); g.open({ name: 'fixture', params: { id } }) }, fid))
if (fid) {
  await page.evaluate((id) => { const g = window.__game.getState(); g.closeAll(); g.open({ name: 'fixture', params: { id } }) }, fid)
  await page.waitForTimeout(700)
  await page.locator('.tab', { hasText: /Line-ups/i }).first().click().catch(() => {})
  await page.waitForTimeout(600)
  await page.evaluate(() => document.querySelector('.fl-extra')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/view-report-subs.png` })
}
await visit('news', () => go({ name: 'news' }))
await visit('inbox', () => go({ name: 'inbox' }))
await visit('calendar', () => go({ name: 'calendar' }), false)

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1))
for (const r of report) {
  if (r.err) { console.log(`✗ ${r.label}: ${r.err}`); continue }
  console.log(`• ${r.label}${r.doc ? ' (page scrolls sideways)' : ''}`)
  for (const o of r.out) console.log('    out ', o)
  for (const c of r.cut) console.log('    cut ', c)
}
console.log(report.length ? `${report.length} screens with problems` : 'no overflow anywhere')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
