// A world built from a fixed seed, as a fingerprint: the hash of everything in it (bar when it was made), and of its
// parts. Two builds of the code that should make the same world must print the same lines.
// npx tsx scripts/qa/world-fingerprint.ts [seed] [club]
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
const [seed = '12345', clubName = 'Sunderland'] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const clubId = raw.clubs.find((c) => c.short === clubName || c.name === clubName)!.id
const t = performance.now()
const w = createWorld(raw, { clubId, seed: Number(seed), manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-01-11', avatar: {} as never, avatarColor: '#10b981', style: 'Gegenpress' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'F' })
const ms = performance.now() - t
delete (w.meta as { created?: string }).created
const h = (x: unknown) => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 12)
const parts = Object.fromEntries(Object.keys(w).map((k) => [k, h((w as unknown as Record<string, unknown>)[k])]))
console.log(`world ${h(w)}  (${Object.keys(w.players).length} players, ${Object.keys(w.fixtures).length} fixtures, built in ${ms.toFixed(0)} ms)`)
for (const [k, v] of Object.entries(parts)) console.log(`  ${k.padEnd(14)} ${v}`)
