// Update emails per release: which a save gets, and that each comes once.
//   npx tsx scripts/qa/release-mail.ts <save.touchline>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { lastSeenRelease, markNotesSeen, sendReleaseMail, sendWorldNotes } from '../../src/engine/world/releases'

const CURRENT = '4.2'
const bytes = fs.readFileSync(process.argv[2])
const fresh = () => deserialize(bytes)
function open(w: ReturnType<typeof fresh>, listed?: string) {
  const before = w.inbox.length
  const rep = migrateSave(w)
  sendReleaseMail(w, lastSeenRelease(w, listed, rep.from), CURRENT, rep, true)
  sendWorldNotes(w)
  w.meta.appVersion = CURRENT
  return w.inbox.slice(0, w.inbox.length - before).reverse().map((m) => `${m.fromRole} | ${m.subject}${/Brought up to date/.test(m.body) ? ' [+conversions: ' + m.body.match(/Brought up to date in this save: ([^\n]*)/)![1].split(';').length + ']' : ''}${m.actions.length ? ' [Checkpoints]' : ''}`)
}
let fails = 0
const check = (name: string, got: string[], want: number) => { const ok = got.length === want; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got.length} emails`); for (const g of got) console.log('       ' + g) }

// a 4.1 save from before the 4.2 schema (schema 4, list entry says 4.1)
let w = fresh(); delete w.meta.appVersion; for (const k of Object.keys(w.flags)) if (/^(release|note):/.test(k)) delete w.flags[k]; w.meta.version = 4
check('4.1 save (schema 4)', open(w, '4.1'), 4)
check('  same save opened again', open(w, '4.1'), 0)
// a save from the 4.2 work, built under the 4.1.2 label (already at the 4.2 schema)
w = fresh(); migrateSave(w); delete w.meta.appVersion; for (const k of Object.keys(w.flags)) if (/^(release|note):/.test(k)) delete w.flags[k]
check('4.2-dev save (schema 7, listed 4.1.2)', open(w, '4.1.2'), 2)
// a save already opened by 4.2 that never had the note
w = fresh(); migrateSave(w); w.meta.appVersion = '4.2'; for (const k of Object.keys(w.flags)) if (/^note:/.test(k)) delete w.flags[k]
check('4.2 save without the note', open(w), 1)
check('  again', open(w), 0)
// a save from before versioning (schema 1, nothing listed)
w = fresh(); delete w.meta.appVersion; for (const k of Object.keys(w.flags)) if (/^(release|note):/.test(k)) delete w.flags[k]; w.meta.version = 1
w.flags.valueCalibV1 = true
check('pre-4.1 save (schema 1)', open(w), 5)
// a career started in 4.2
w = fresh(); migrateSave(w); for (const k of Object.keys(w.flags)) if (/^(release|note):/.test(k)) delete w.flags[k]; markNotesSeen(w, CURRENT)
check('new 4.2 career', open(w), 0)
// the 4.1.1 → 4.1.2 transition on its own
w = fresh(); w.meta.version = 4; delete w.meta.appVersion; for (const k of Object.keys(w.flags)) if (/^(release|note):/.test(k)) delete w.flags[k]; w.flags['note:israelFriendliesOnly'] = true
check('4.1.1 save', open(w, '4.1.1'), 2)
console.log(fails ? `${fails} failed` : 'all ok')
process.exit(fails ? 1 : 0)
