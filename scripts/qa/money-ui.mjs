// Money in transfers: the bid's budget check, personal terms against the wage room, a renewal, and the wage sheet.
// node scripts/qa/money-ui.mjs <save in an open window> [outDir]   (dev server on :5173)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-money'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
const js = (fn, arg) => page.evaluate(fn, arg)
// the hub and its wage sheet
await js(() => window.__game.getState().setTab('transfers'))
await page.waitForTimeout(700)
await js(() => document.querySelector('.hero-wage')?.click())
await shot('wage-sheet', 700)
await scroll(600); await js(() => { const s = document.querySelector('.sheet .sheet-body, .sheet'); if (s) s.scrollTop = 600 }); await shot('wage-sheet-2', 300)
await js(() => document.querySelector('.sheet button[aria-label="Close"]')?.click())
await page.waitForTimeout(400)
// a bid
const pid = await js(() => { const w = window.__game.getState().world; return Object.values(w.players).filter((p) => p.clubId && p.clubId !== w.userClubId && !p.loan && p.ovr >= 80 && p.ovr <= 84 && p.value < 60e6).sort((a, b) => b.ovr - a.ovr)[0].id })
await js((id) => window.__game.getState().open({ name: 'negotiation', params: { playerId: id } }), pid)
await page.waitForTimeout(1500)
await scroll(2000); await shot('bid', 500)
// Edit Mode: the club accepts, then personal terms
await js((id) => { const g = window.__game.getState(); g.mutate((w) => { w.meta.editMode = true; (w.flags.editAccept ||= {})[id] = true; (w.flags.editWilling ||= {})[id] = true }) }, pid)
await js(() => [...document.querySelectorAll('button')].find((b) => /Submit offer/.test(b.textContent))?.click())
await page.waitForTimeout(6000)
await scroll(3000); await shot('terms', 800)
await js(() => window.__game.getState().close())
await page.waitForTimeout(500)
// a renewal
const rid = await js(() => { const w = window.__game.getState().world; return Object.values(w.players).filter((p) => p.clubId === w.userClubId && !p.loan).sort((a, b) => b.ovr - a.ovr)[2].id })
await js((id) => window.__game.getState().open({ name: 'renewal', params: { id } }), rid)
await page.waitForTimeout(2500)
await scroll(3000); await shot('renewal', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
