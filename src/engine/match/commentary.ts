import type { Rng } from '../../domain/rng'

export type Vars = Record<string, string | number | undefined>

export function fill(t: string, v: Vars): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

export function callName(name: string): string {
  const m = name.match(/^[A-ZÀ-Ý]\.\s+(.+)$/u)
  return m ? m[1] : name
}

const T: Record<string, string[]> = {
  kickoff: [
    '{home} get us underway at {venue}.',
    "We're off at {venue}! {home} kick off against {away}.",
    'The referee blows the whistle and {home} v {away} is underway.',
    '{away} get the game started in front of a crowd of {att}.',
  ],
  kickoffDerby: [
    'The {derby} is underway and the noise inside {venue} is deafening.',
    'It is {derby} day — {home} and {away} go to war at {venue}.',
  ],
  kickoffFinal: [
    'The {comp} final is underway! {home} v {away} for the trophy.',
    'History awaits — the {comp} final kicks off at {venue}.',
  ],
  build: [
    '{p} finds space between the lines.',
    '{t} patiently work it across the back line.',
    '{p} switches play with a raking ball out to the flank.',
    '{t} are enjoying a spell of possession here.',
    '{p} drops deep to pick the ball up and turns neatly.',
    '{t} probe down the {side}, looking for an opening.',
    '{p} drives forward from midfield.',
    '{t} move the ball quickly, one touch at a time.',
    '{p} combines with {q} on the edge of the area.',
    '{p} is pulling the strings for {t} at the moment.',
    '{t} press high and force a hurried clearance.',
    '{p} wins a crucial duel in midfield.',
    '{p} darts in behind but the pass is overhit.',
    'Neat footwork from {p} to escape two challenges.',
    '{t} are camped in the {o} half.',
  ],
  press: [
    '{t} win it back high up the pitch.',
    '{p} snaps into a challenge and wins possession.',
    'Aggressive pressing from {t} — {o} are struggling to play out.',
  ],
  pressure: [
    '{t} are turning the screw now.',
    'Wave after wave of {t} attacks.',
    '{o} are hanging on here.',
  ],
  crowd: [
    'The home supporters urge {t} forward.',
    'The atmosphere at {venue} is electric.',
    'A chorus of whistles from the stands as {o} keep the ball.',
  ],
  chanceThrough: [
    '{a} threads a ball through for {p}...',
    '{p} runs onto a superb pass from {a}...',
    'Defence-splitting ball from {a} and {p} is clean through...',
  ],
  chanceCross: [
    '{a} whips a cross into the box, {p} rises...',
    'Inviting delivery from {a} towards {p}...',
    '{a} gets to the byline and picks out {p}...',
  ],
  chanceCutback: [
    '{a} cuts it back for {p}...',
    '{a} squares it across the six-yard box to {p}...',
  ],
  chanceLong: [
    '{p} lets fly from distance...',
    '{p} tries his luck from 25 yards...',
    '{p} unleashes a shot from outside the box...',
  ],
  chanceDribble: [
    '{p} jinks past his marker and shoots...',
    '{p} skips inside and tries the far corner...',
    '{p} dances through the challenges and gets a shot away...',
  ],
  chanceCounter: [
    '{t} break at pace! {p} leads the counter...',
    'Lightning counter-attack from {t} — {p} is away...',
    '{t} spring forward on the break, {p} with support...',
  ],
  chanceCorner: [
    '{a} swings the corner in, {p} attacks it...',
    'Corner from {a} and {p} gets up highest...',
  ],
  chanceFreekick: [
    '{p} stands over the free kick...',
    'Free kick in a dangerous position — {p} to take...',
  ],
  chanceError: [
    'Mistake at the back from {o}! {p} pounces...',
    'Poor pass out from {o} and {p} intercepts...',
  ],
  chanceOneOnOne: ['{p} is clean through on goal...', '{p} races clear with only {gk} to beat...', '{p} gets in behind and bears down on goal...'],
  chanceLowCross: ['{a} drills it low across the box towards {p}...', '{a} fizzes a ball into the six-yard box, {p} arrives...', 'Low cross from {a} and {p} meets it first time...'],
  chancePass: ['{a} slips it into {p}...', '{p} takes a pass from {a} and shoots...', '{a} finds {p} in space...', 'Quick one-two between {a} and {p}...', '{a} lays it off to {p}...'],
  chanceBox: ['{p} turns in the box and shoots...', '{p} gets a sight of goal...', 'The ball drops to {p} inside the area...', '{p} makes space for himself and fires...'],
  takeOn: ['{p} skins {q} down the {side}.', '{p} beats {q} with a quick change of direction.', '{p} glides past {q} and drives on.', 'Lovely footwork from {p} to leave {q} behind.', '{p} knocks it past {q} and uses his pace.'],
  progCarry: ['{p} drives forward into the {o} half.', '{p} carries the ball 30 yards before anyone closes him down.', '{p} surges through midfield.', '{p} strides forward with the ball at his feet.'],
  switch: ['{p} switches play to {q} on the far side.', 'A raking crossfield ball from {p} finds {q}.', '{p} changes the point of attack with a long diagonal to {q}.'],
  pressWin: ['{t} press high and {p} wins it back.', '{p} hunts the ball down and {o} are forced into an error.', 'Relentless pressing from {t} — {p} nicks it high up the pitch.'],
  interceptLine: ['{p} reads it and steps in to intercept.', 'Good anticipation from {p} to cut out the pass.', '{p} gets a toe to it and {t} win it back.'],
  tackleLine: ['Strong challenge from {p} on {q}.', '{p} slides in and wins the ball cleanly from {q}.', '{p} stands {q} up and takes it off him.'],
  crossCleared: ['{q} whips it in but {p} heads clear.', '{p} gets in front to clear the cross from {q}.', 'Dangerous delivery from {q}, cleared by {p}.'],
  recycle: ['{t} recycle possession at the back.', '{t} are happy to keep the ball and move {o} around.', '{p} takes a touch and resets the attack.'],
  deepBlock: ['{o} have dropped into a deep, compact block.', '{o} sit deep and invite {t} on.', 'Two banks of four from {o} — {t} are probing for a way through.'],
  chanceRebound: ['The rebound falls kindly for {p}...', '{p} is first to the loose ball...'],
  saveEasy: ['...straight at {gk}.', '...{gk} gathers comfortably.', '...a routine save for {gk}.'],
  saveGood: ['...but {gk} gets down well to save!', '...fine stop from {gk}!', '...{gk} tips it round the post!'],
  saveGreat: ['...WHAT A SAVE from {gk}!', '...{gk} produces a stunning reflex stop!', '...an incredible fingertip save from {gk}!'],
  miss: ['...but it flashes wide.', '...over the bar.', '...dragged wide of the far post.', '...just past the post!', '...skied into the stands.'],
  missBig: ['...and somehow he misses! A huge chance goes begging.', '...unbelievable — he puts it wide from six yards!'],
  blocked: ['...blocked by a defender.', '...charged down.', '...deflected behind for a corner.'],
  woodwork: ['...and it crashes off the post!', '...off the crossbar!', '...rattles the woodwork!'],
  goal: [
    'GOAL! {p} finds the net for {t}!',
    'GOAL! {p} makes no mistake!',
    'GOAL! {p} scores for {t}!',
  ],
  goalHeader: ['GOAL! A towering header from {p}!', 'GOAL! {p} nods it home!'],
  goalLong: ['GOAL! A thunderbolt from {p}! What a strike!', 'GOAL! {p} bends it into the top corner from range!'],
  goalSolo: ['GOAL! Individual brilliance from {p}!', 'GOAL! {p} does it all himself!'],
  goalCounter: ['GOAL! A devastating counter finished by {p}!', 'GOAL! {p} finishes off a breathtaking break!'],
  goalTap: ['GOAL! {p} taps it in!', 'GOAL! {p} is there to turn it home!'],
  goalFK: ['GOAL! {p} curls the free kick into the top corner!', 'GOAL! A sublime free kick from {p}!'],
  goalPen: ['GOAL! {p} sends {gk} the wrong way from the spot.', 'GOAL! {p} buries the penalty.'],
  goalPenPower: ['GOAL! {gk} guesses right but {p} puts too much on it!', 'GOAL! {p} beats the dive with pure power.'],
  goalPenMiddle: ['GOAL! {p} goes straight down the middle as {gk} dives!', 'GOAL! Nerves of steel — {p} chips it down the centre.'],
  penSaved: ['SAVED! {gk} guesses right and keeps out {p}!', '...{gk} dives the right way and SAVES it!', 'What a stop! {gk} denies {p} from the spot!'],
  penPost: ['...{p} hits the post! The penalty is missed!', '...off the woodwork! {p} can not believe it.'],
  penWide: ['...{p} drags it wide! A huge let-off.', '...over the bar! {p} blazes the penalty high.'],
  goalOwn: ['OWN GOAL! {p} turns it into his own net!', 'OWN GOAL! Disaster for {p} and {t}.'],
  equaliser: ['{t} are level!', 'All square!', "It's back to parity!"],
  lead: ['{t} lead!', '{t} are in front!'],
  late: ['Scenes at {venue}! A dramatic late goal!', 'Late, late drama!'],
  hattrick: ['HAT-TRICK for {p}!', 'That is his third of the game — {p} has a hat-trick!'],
  brace: ['That is his second of the afternoon.', '{p} has a brace!'],
  assist: ['Assist: {a}.', 'Superb assist from {a}.', '{a} with the assist.'],
  penaltyAwarded: ['PENALTY! {p} is brought down in the box!', 'PENALTY to {t}! {p} is fouled.'],
  penMiss: ['...and {gk} SAVES the penalty!', '...{p} fires the penalty over the bar!', '...{p} hits the post from the spot!'],
  yellow: ['{p} is shown a yellow card.', 'Yellow card for {p} after a cynical foul.', '{p} goes into the book.', '{p} is booked for a late challenge.'],
  yellowDissent: ['{p} is booked for dissent.'],
  yellowTime: ['{p} is booked for time-wasting.'],
  secondYellow: ['Second yellow! {p} is sent off!', "{p} picks up a second booking and he's off!"],
  red: ['RED CARD! {p} is sent off for a dangerous challenge!', 'Straight red for {p}! {t} are down to ten.'],
  foul: ['{p} brings down {q}. Free kick.', 'Foul by {p} on {q}.', '{p} clips the heels of {q}.'],
  corner: ['Corner to {t}.', '{t} win a corner.'],
  offside: ['{p} is flagged offside.', 'The flag goes up — {p} strayed offside.'],
  offsideGoal: ["The ball is in the net but {p} is offside! No goal.", 'VAR check... the goal is disallowed for offside against {p}.'],
  injury: ['{p} is down and needs treatment.', 'Concern for {t} as {p} goes down holding his {part}.'],
  injuryOff: ["{p} can't continue.", '{p} limps off injured.'],
  sub: ['{t} make a change: {p} replaces {q}.', 'Substitution for {t} — {p} on, {q} off.'],
  subInjury: ['Enforced change for {t}: {p} comes on for the injured {q}.'],
  tactic: ['Tactical change from {t}: {x}.', '{t} switch to {x}.'],
  ht: ['HALF-TIME: {home} {hs}-{as} {away}.', 'The referee blows for half-time. {home} {hs}-{as} {away}.'],
  ft: ['FULL-TIME: {home} {hs}-{as} {away}.', "It's all over! {home} {hs}-{as} {away}."],
  ftDraw: ['FULL-TIME: The points are shared. {home} {hs}-{as} {away}.'],
  et: ['We are going to extra time!', 'Nothing to separate them after 90 minutes — extra time.'],
  pens: ['It will be decided by a penalty shootout!', 'Penalties it is!'],
  added: ['{x} minutes of added time.', 'The fourth official indicates {x} minutes of stoppage time.'],
  timeWaste: ['{t} are taking their time over every set piece.', '{t} are running down the clock.'],
  var: ['VAR is checking a possible penalty...', 'VAR review for a potential handball...'],
  varNo: ['...no penalty. Play continues.', '...the decision stands.'],
}

export function line(rng: Rng, key: string, v: Vars): string {
  const arr = T[key] || [key]
  return fill(arr[Math.floor(rng.next() * arr.length)], v)
}

export const BODY_PARTS = ['hamstring', 'ankle', 'knee', 'thigh', 'calf', 'groin', 'shoulder']
