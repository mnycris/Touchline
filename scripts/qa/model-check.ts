// Does the tactics board's model (effectOf in src/engine/match/response.ts: each setting's measured effect, summed, and
// anchored on the styles of play measured whole) say what whole set-ups were measured to do? Each style was played
// whole from kick-off (KICKOFF_FX, against the club's own set-up); against Balanced, that is what the board should
// show for switching to it. And between styles: halfway from each to the next, the model should move smoothly.
// npx tsx scripts/qa/model-check.ts
import { VISION_TACTICS } from '../../src/domain/constants'
import { NEUTRAL, effectOf } from '../../src/engine/match/response'
import { KICKOFF_FX } from '../../src/engine/match/responseData'
import { presetTactics } from '../../src/ui/tacticsGuide'

const pct = (x: number) => `${x >= 1 ? '+' : '−'}${Math.abs(Math.round((x - 1) * 100))}%`.padStart(5)
const bal = KICKOFF_FX['style:Balanced'] || [0, 0]
console.log('style            measured (for / against)   board model (for / against)')
let err = 0, n = 0
for (const name of Object.keys(VISION_TACTICS)) {
  const m = KICKOFF_FX[`style:${name}`]
  if (!m) continue
  const mf = Math.exp(m[0] - bal[0]), ma = Math.exp(m[1] - bal[1])
  const e = effectOf(NEUTRAL, presetTactics(name, NEUTRAL))
  err += (Math.log(e.f / mf)) ** 2 + (Math.log(e.a / ma)) ** 2; n += 2
  console.log(`${name.padEnd(16)} ${pct(mf)} / ${pct(ma)}                ${pct(e.f)} / ${pct(e.a)}`)
}
console.log(`root mean square gap: ${(Math.sqrt(err / n) * 100).toFixed(1)}%`)
// halfway between pairs of styles (numbers averaged, choices from the first): no jumps
const names = Object.keys(VISION_TACTICS)
console.log('\nhalfway between styles (for / against)')
for (let i = 0; i < names.length; i++) {
  const a = presetTactics(names[i], NEUTRAL), b = presetTactics(names[(i + 1) % names.length], NEUTRAL)
  const mid = { ...a, lineHeight: (a.lineHeight + b.lineHeight) / 2, width: (a.width + b.width) / 2, tempo: (a.tempo + b.tempo) / 2, pressing: (a.pressing + b.pressing) / 2 }
  const e = effectOf(NEUTRAL, mid)
  console.log(`${names[i]} → ${names[(i + 1) % names.length]}`.padEnd(32), `${pct(e.f)} / ${pct(e.a)}`)
}
