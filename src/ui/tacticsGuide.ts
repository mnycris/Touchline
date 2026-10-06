// What the tactical controls really do, written from the match engine (engine.ts, pitch.ts) and checked against
// measured runs (scripts/qa/tactic-effects.ts). Each control gets a short line for every setting, a few bullets on what
// changes in the engine, and the tendencies it moves. No ratings and no invented numbers: tendencies only.
import type { TeamTactics } from '../domain/types'
import { MENTALITIES } from '../domain/constants'

export type TacticKey = 'mentality' | 'defApproach' | 'lineHeight' | 'pressing' | 'offsideTrap' | 'buildUp' | 'chanceCreation' | 'width' | 'tempo' | 'playersInBox' | 'corners' | 'freeKicks' | 'timeWasting' | 'roles'

export interface Guide {
  title: string
  /** what the control is, in one line */
  what: string
  /** what each setting does (for sliders: the low end, the middle, the high end) */
  options: { id: string; label: string; text: string }[]
  /** how the engine uses it */
  engine: string[]
  /** tendencies it moves: [tendency, direction toward the "high" / right-hand setting] */
  moves: [string, 'up' | 'down' | 'mixed'][]
}

export const GUIDES: Record<TacticKey, Guide> = {
  mentality: {
    title: 'Mentality',
    what: 'How much risk the team takes: how many players commit forward and how bravely the ball is played.',
    options: [
      { id: 'Ultra Defensive', label: 'Ultra Defensive', text: 'Players hold their positions and recycle the ball rather than commit forward. You can keep a lot of the ball, but little of it goes anywhere, and few shots follow.' },
      { id: 'Defensive', label: 'Defensive', text: 'A deeper block without the ball, safer passes with it, fewer men breaking forward.' },
      { id: 'Balanced', label: 'Balanced', text: 'The default: measured risk both ways.' },
      { id: 'Attacking', label: 'Attacking', text: 'The whole shape pushes up, midfielders arrive in the box more, players shoot more readily.' },
      { id: 'Ultra Attacking', label: 'Ultra Attacking', text: 'Everyone forward: many more shots, but you give the ball away more and more of your players are caught upfield when you do.' },
    ],
    engine: [
      'Moves the whole team up or down the pitch, with and without the ball.',
      'Raises or lowers how often players pick the forward pass and how readily they shoot.',
      'Midfielders\' late runs into the box get longer as it goes up.',
      'Losing the ball with an attacking mentality leaves you more exposed to counter-attacks.',
      'The match situation adds to it: sides chasing a game push on, sides protecting a lead sit in.',
    ],
    moves: [['Chances created', 'up'], ['Exposure on the break', 'up'], ['Keeping the ball', 'down']],
  },
  defApproach: {
    title: 'Defensive approach',
    what: 'Where and how hard you try to win the ball back. Picking one also sets the line height and pressing sliders to match.',
    options: [
      { id: 'Deep', label: 'Deep', text: 'Drop off and protect your box. The press in their half is much weaker, while it gets tighter near your own goal.' },
      { id: 'Balanced', label: 'Balanced', text: 'Press in the middle third and hold a mid block.' },
      { id: 'High', label: 'High', text: 'Press their defenders and keeper hard; their keeper plays it short less often.' },
      { id: 'Aggressive', label: 'Aggressive', text: 'As High, and players go to ground more: more tackles attempted, about a fifth more fouls (and bookings).' },
    ],
    engine: [
      'Changes how close and how hard your players press in each third of the pitch.',
      'High and Aggressive make the opposition keeper play long more often.',
      'Aggressive adds more challenges and more fouls.',
    ],
    moves: [['Ball won high up', 'up'], ['Fouls', 'up']],
  },
  lineHeight: {
    title: 'Line height',
    what: 'How far up the pitch your back line holds, and with it the rest of the team.',
    options: [
      { id: 'low', label: 'Deep', text: 'A deep line leaves little space behind you and few offsides, but lets the opposition into shooting range more often. With the ball the team also starts deeper, so it passes safely at the back.' },
      { id: 'mid', label: 'Middle', text: 'A mid-height line.' },
      { id: 'high', label: 'High', text: 'A high line squeezes the pitch: the opposition is caught offside more and gets into your box less, but a through ball is easier to complete against it and there is space behind.' },
    ],
    engine: [
      'Positions the defence and the team behind the ball, most strongly when the ball is far away.',
      'The higher the line, the more often runners are caught offside.',
      'Against a high line, through balls are easier to complete and runners have more room in behind.',
      'Losing the ball with a high line leaves you more exposed.',
    ],
    moves: [['Offsides you catch', 'up'], ['Space behind you', 'up'], ['Keeping the ball', 'down']],
  },
  pressing: {
    title: 'Pressing',
    what: 'How intensely your players close down the man on the ball.',
    options: [
      { id: 'low', label: 'Low', text: 'Hold shape and save legs: the opposition passes under little pressure.' },
      { id: 'mid', label: 'Medium', text: 'Press when the moment is right.' },
      { id: 'high', label: 'Relentless', text: 'Constant pressure: their passes go astray more and you challenge for the ball more often, but it is the most tiring setting in the game.' },
    ],
    engine: [
      'Pressure on the ball makes passes less accurate and challenges more frequent.',
      'Strongest in the opposition half; your own third is defended tightly whatever you choose.',
      'The biggest single drain on energy: at full pressing players tire over a third faster than at medium.',
      'A high press makes the opposition keeper play long more often.',
    ],
    moves: [['Energy use', 'up'], ['Ball won high up', 'up'], ['Pressure on their passing', 'up']],
  },
  offsideTrap: {
    title: 'Offside trap',
    what: 'The back line steps up together to catch runners.',
    options: [
      { id: 'off', label: 'Off', text: 'The line holds its height normally.' },
      { id: 'on', label: 'On', text: 'Runners in behind are caught offside about 70% more often. It works far better with a high line; with a deep one there is little to catch.' },
    ],
    engine: ['Multiplies the chance that passes played in behind are flagged offside, scaled by your line height.'],
    moves: [['Offsides you catch', 'up']],
  },
  buildUp: {
    title: 'Build-up',
    what: 'How you move the ball out from the back and through the middle.',
    options: [
      { id: 'Balanced', label: 'Balanced', text: 'Short when it is on, long when it is not; the keeper mixes it.' },
      { id: 'Short Passing', label: 'Short', text: 'Play out through the lines: the keeper plays it short most of the time and long balls are rare. Keeps the ball well, but slower to get forward.' },
      { id: 'Counter', label: 'Counter', text: 'When you win it back you break at once: counters start much more often, with longer, earlier passes.' },
      { id: 'Long Ball', label: 'Long', text: 'Go long early to the front line: the keeper kicks long, short passes at the back are avoided and defenders clear it under pressure. Target men and runners matter; you will see less of the ball.' },
    ],
    engine: [
      'Sets how attractive long passes are, and from how far.',
      'Decides how often your keeper plays it short.',
      'Counter makes winning the ball turn into a fast break more often; Short Passing does the opposite.',
      'Part of the team\'s directness, with chance creation and tempo.',
    ],
    moves: [['Directness', 'mixed'], ['Keeping the ball', 'mixed']],
  },
  chanceCreation: {
    title: 'Chance creation',
    what: 'How you try to turn possession in the final third into chances.',
    options: [
      { id: 'Balanced', label: 'Balanced', text: 'Take what the game gives.' },
      { id: 'Possession', label: 'Possession', text: 'Work the ball until a clear chance appears: half-chances are passed up, good ones are taken, receivers in the final third find a little more space and final-third passes are completed more often. Fewer, better shots.' },
      { id: 'Direct Passing', label: 'Direct', text: 'Look for the killer pass early: through balls are tried half as often again, and players shoot a little sooner. More shots, more offsides.' },
      { id: 'Forward Runs', label: 'Runs', text: 'Players drive forward with the ball and run beyond it: more carries, more through balls, more counters. More shots, but the ball changes hands more often.' },
    ],
    engine: [
      'Changes how often through balls are played and how picky players are about shooting.',
      'Possession gives patient sides more space and accuracy in the final third.',
      'Forward Runs makes players carry the ball forward more.',
    ],
    moves: [['Chances created', 'mixed'], ['Directness', 'mixed']],
  },
  width: {
    title: 'Width',
    what: 'How far apart your players spread across the pitch when you have the ball.',
    options: [
      { id: 'low', label: 'Narrow', text: 'Players stay closer together across the pitch: fewer switches of play and fewer crosses, more of the game through the middle. A little less exposed when you lose the ball.' },
      { id: 'mid', label: 'Balanced', text: 'A normal spread.' },
      { id: 'high', label: 'Wide', text: 'Players spread to the touchlines: switches of play and crosses become more likely. Slightly more exposed when you lose the ball.' },
    ],
    engine: [
      'Spreads or squeezes your shape in possession only; without the ball the team keeps its normal width.',
      'Makes switches of play and crosses more or less likely.',
      'A wide shape is a little more exposed when the ball is lost.',
    ],
    moves: [['Crosses and switches', 'up'], ['Exposure on the break', 'up']],
  },
  tempo: {
    title: 'Tempo',
    what: 'How quickly your players move the ball on.',
    options: [
      { id: 'low', label: 'Patient', text: 'Take time on the ball: more accurate passing and more of the ball, less forward urgency. Easier on the legs.' },
      { id: 'mid', label: 'Measured', text: 'A normal speed of play.' },
      { id: 'high', label: 'Fast', text: 'Quicker decisions and more forward passes: attacks develop faster, but more passes go astray and you keep the ball less. More tiring.' },
    ],
    engine: [
      'Changes how long each action takes, so a fast side gets through more play per minute.',
      'Faster tempo means more forward passes and lower pass accuracy.',
      'Adds to energy use, though less than pressing does.',
    ],
    moves: [['Directness', 'up'], ['Keeping the ball', 'down'], ['Energy use', 'up']],
  },
  playersInBox: {
    title: 'Players in the box',
    what: 'How much you play for crosses.',
    options: [
      { id: 'low', label: 'Few', text: 'Wide players cross less often and keep the move going instead.' },
      { id: 'high', label: 'Many', text: 'Wide players look to cross more often.' },
    ],
    engine: ['Raises or lowers how often wide players choose to cross. Who actually arrives in the box comes from your shape and roles.'],
    moves: [['Crosses and switches', 'up']],
  },
  corners: {
    title: 'Corners',
    what: 'Where corners are delivered.',
    options: [
      { id: 'Balanced', label: 'Balanced', text: 'Anywhere across the six-yard box.' },
      { id: 'Near Post', label: 'Near post', text: 'Aimed at the near post, where the attacker wins the header slightly more often.' },
      { id: 'Far Post', label: 'Far post', text: 'Aimed beyond the far post.' },
      { id: 'Short', label: 'Short', text: 'Most corners are played short and worked, so fewer headers.' },
    ],
    engine: ['Sets the delivery spot (and so who is likely to meet it); Short skips the cross most of the time.'],
    moves: [],
  },
  freeKicks: {
    title: 'Free kicks',
    what: 'What happens with free kicks in shooting range.',
    options: [
      { id: 'Balanced', label: 'Balanced', text: 'Shoot about half the time from good positions.' },
      { id: 'Direct', label: 'Direct', text: 'Shoot from almost every free kick in range.' },
      { id: 'Cross', label: 'Cross', text: 'Mostly cross it in for the big men instead.' },
    ],
    engine: ['Sets how often a free kick in range is a direct shot rather than a ball into the box.'],
    moves: [],
  },
  timeWasting: {
    title: 'Time wasting',
    what: 'Slowing the game down when you are winning.',
    options: [{ id: 'on', label: 'On', text: 'Only from the hour mark and only while you lead: slower restarts and slower play. Referees book players for it more often.' }],
    engine: ['From 60\' while ahead: longer dead-ball time, a slower tempo, and a higher chance of a booking for time-wasting.'],
    moves: [],
  },
  roles: {
    title: 'Roles and duties',
    what: 'Each player\'s role and duty shift what he does on the ball and where he stands.',
    options: [],
    engine: [
      'A role leans a player toward shooting, carrying, dribbling, crossing, forward passing, getting on the ball, getting into the box, or defensive work.',
      'Duties add to it: Attack gets into the box and shoots more but tracks back less; Defend does the opposite; Build-Up plays more forward passes; Roaming carries and dribbles more; Aggressive presses and fouls more.',
      'Some roles also move the player: a Wingback pushes on, an Inside Forward or a Falseback comes inside, a False 9 or a Holding midfielder drops deeper.',
    ],
    moves: [],
  },
}

/** The option that describes the current setting (sliders by thirds). */
export function currentOption(key: TacticKey, t: TeamTactics): string {
  const v = (n: number) => (n <= 35 ? 'low' : n >= 65 ? 'high' : 'mid')
  switch (key) {
    case 'lineHeight': return v(t.lineHeight)
    case 'pressing': return v(t.pressing)
    case 'width': return v(t.width)
    case 'tempo': return v(t.tempo)
    case 'playersInBox': return t.playersInBox <= 5 ? 'low' : 'high'
    case 'offsideTrap': return t.offsideTrap ? 'on' : 'off'
    case 'timeWasting': return 'on'
    case 'roles': return ''
    default: return String(t[key as keyof TeamTactics])
  }
}

// ---------------------------------------------------------------- tendencies

export interface Tendency { id: string; label: string; low: string; high: string; v: number }

const MI = (t: TeamTactics) => MENTALITIES.indexOf(t.mentality) - 2
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/**
 * Where the setup sits on each tendency (0..1), from the engine's own formulas: directness (build-up, chance creation,
 * tempo), exposure when the ball is lost (mentality, line height, width), energy (pressing, tempo); keeping the ball
 * from the measured effect of each setting on possession.
 */
export function tendencies(t: TeamTactics): Tendency[] {
  const dir = (t.buildUp === 'Long Ball' ? 1 : t.buildUp === 'Counter' ? 0.6 : t.buildUp === 'Short Passing' ? -0.5 : 0)
    + (t.chanceCreation === 'Direct Passing' ? 0.6 : t.chanceCreation === 'Forward Runs' ? 0.35 : t.chanceCreation === 'Possession' ? -0.6 : 0) + (t.tempo - 50) / 45
  const expo = MI(t) * 0.08 + (t.lineHeight - 50) / 220 + (t.width - 50) / 400
  const energy = (t.pressing - 50) / 130 + (t.tempo - 50) / 240
  const press = t.pressing / 100 + (t.defApproach === 'Aggressive' ? 0.12 : t.defApproach === 'High' ? 0.06 : t.defApproach === 'Deep' ? -0.15 : 0)
  const keep = -0.21 * (t.tempo - 50) - 0.13 * (t.lineHeight - 50) + 0.05 * (t.pressing - 50) - MI(t) * 3.5
    + (t.buildUp === 'Long Ball' ? -11 : t.buildUp === 'Counter' ? -6 : t.buildUp === 'Balanced' ? -3 : 0)
    + (t.chanceCreation === 'Direct Passing' || t.chanceCreation === 'Forward Runs' ? -7 : t.chanceCreation === 'Balanced' ? -3 : 0)
  return [
    { id: 'keep', label: 'Keeping the ball', low: 'Gives it up', high: 'Keeps it', v: clamp01(0.5 + keep / 36) },
    { id: 'dir', label: 'Directness', low: 'Patient', high: 'Direct', v: clamp01((dir + 2.2) / 4.4) },
    { id: 'width', label: 'Width of attacks', low: 'Narrow', high: 'Wide', v: clamp01(t.width / 100) },
    { id: 'press', label: 'Pressing intensity', low: 'Sits off', high: 'Hunts', v: clamp01(press) },
    { id: 'expo', label: 'Exposure on the break', low: 'Secure', high: 'Exposed', v: clamp01(0.5 + expo / 0.5) },
    { id: 'energy', label: 'Energy use', low: 'Saves legs', high: 'Tiring', v: clamp01(0.5 + energy / 0.7) },
  ]
}

// ---------------------------------------------------------------- combinations

/** Settings that combine in a way worth knowing about, in plain words (none of them right or wrong). */
export function combos(t: TeamTactics): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = []
  const m = MI(t)
  if (m <= -1 && (t.buildUp === 'Short Passing' || t.chanceCreation === 'Possession')) out.push({ title: 'Safe circulation', text: 'A defensive mentality with short, patient passing: players stop committing forward, so the ball goes round the back. You can keep a lot of it, but expect few chances.' })
  if (t.buildUp === 'Long Ball' && t.chanceCreation === 'Possession') out.push({ title: 'Long, then patient', text: 'The build-up goes long early, then the final third asks for patience: possession comes in short bursts and the long balls make it hard to settle.' })
  if (t.lineHeight >= 65 && t.pressing <= 40) out.push({ title: 'High line, no pressure', text: 'A high line without pressure on the ball: their passers have time, and a through ball against a high line is easier to complete. Pressing is what usually protects a high line.' })
  if (t.offsideTrap && t.lineHeight <= 40) out.push({ title: 'Trap with a deep line', text: 'The offside trap catches runners against your line; with a deep line there are few to catch, so it does little.' })
  if (t.pressing >= 70 && t.tempo >= 70) out.push({ title: 'Full intensity', text: 'Relentless pressing with a fast tempo is the most tiring way to play: expect tired legs from the hour and plan your substitutions.' })
  if (t.width >= 70 && t.playersInBox <= 3) out.push({ title: 'Wide, few crosses', text: 'Wide positions with few players set to attack the box: wide players will cross less often, so the width mostly turns into switches of play and carries.' })
  if (m >= 1 && t.lineHeight >= 65 && t.width >= 60) out.push({ title: 'All-in', text: 'An attacking mentality, a high line and a wide shape: plenty of bodies forward, but this is the setup most exposed to counter-attacks when you lose the ball.' })
  if (t.buildUp === 'Counter' && t.chanceCreation === 'Possession') out.push({ title: 'Break, then wait', text: 'Counter build-up wants to break the moment you win it; Possession then slows it down in the final third, so many breaks end in patient build-up.' })
  if (t.tempo >= 70 && t.buildUp === 'Short Passing') out.push({ title: 'Quick short passing', text: 'Short passing at a fast tempo: lots of quick combinations, but faster play costs accuracy, so more passes go astray than at a calmer tempo.' })
  if (t.defApproach === 'Deep' && m >= 1) out.push({ title: 'Deep without it, forward with it', text: 'You defend deep but attack with numbers: players have a long way to go forward, and more of them are caught upfield when an attack breaks down.' })
  if (t.timeWasting) out.push({ title: 'Time wasting on', text: 'It only kicks in after an hour and only while you are ahead.' })
  return out
}

// ---------------------------------------------------------------- roles

const BIAS_WORDS: Record<string, [string, string]> = {
  sh: ['shoots more', 'shoots less'], ca: ['carries the ball forward more', 'carries less'], dr: ['takes players on more', 'dribbles less'],
  cr: ['crosses more', 'crosses less'], pf: ['plays more forward passes', 'plays safer passes'], rw: ['gets on the ball more', 'sees less of the ball'],
  bx: ['gets into the box more', 'stays out of the box'], dw: ['presses and tackles more (and fouls more)', 'does less defensive work'],
}

/** What a role and duty make a player do in the engine, strongest first. */
export function roleTendencies(bias: Record<string, number> | undefined, focus: Record<string, number> | undefined): string[] {
  const sum: Record<string, number> = {}
  for (const b of [bias, focus]) for (const [k, v] of Object.entries(b || {})) sum[k] = (sum[k] || 0) + v
  return Object.entries(sum).filter(([, v]) => Math.abs(v) >= 0.08).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([k, v]) => BIAS_WORDS[k]?.[v > 0 ? 0 : 1]).filter(Boolean) as string[]
}
