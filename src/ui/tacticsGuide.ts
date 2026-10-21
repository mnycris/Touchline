// What the tactical controls really do, written from the match engine (engine.ts, pitch.ts) and checked against
// measured runs (scripts/qa/engine-lab.ts tactics / formations). Each control gets a short line for every setting, what it
// gives and costs, a few bullets on what changes in the engine, and the tendencies it moves. Tendencies only, no ratings.
import type { TeamTactics } from '../domain/types'
import { DEFAULT_TACTICS, MENTALITIES, VISION_TACTICS } from '../domain/constants'

export type TacticKey = 'mentality' | 'defApproach' | 'lineHeight' | 'pressing' | 'offsideTrap' | 'buildUp' | 'chanceCreation' | 'width' | 'tempo' | 'playersInBox' | 'corners' | 'freeKicks' | 'timeWasting' | 'roles'

export interface Guide {
  title: string
  /** what the control is, in one line */
  what: string
  /** what each setting does (for sliders: the low end, the middle, the high end) */
  options: { id: string; label: string; text: string }[]
  /** what pushing it toward the high / right-hand setting gives, and what it costs */
  gives: string[]
  costs: string[]
  /** how the engine uses it */
  engine: string[]
  /** tendencies it moves: [tendency, direction toward the "high" / right-hand setting] */
  moves: [string, 'up' | 'down' | 'mixed'][]
}

export const GUIDES: Record<TacticKey, Guide> = {
  mentality: {
    title: 'Mentality',
    what: 'How much risk the team takes: how many players commit forward, how deep it defends and how readily it shoots.',
    options: [
      { id: 'Ultra Defensive', label: 'Ultra Defensive', text: 'Everyone behind the ball in a deep, compact block, cleared rather than played out under pressure. Chances against become harder to make, but you will rarely have a good one yourself.' },
      { id: 'Defensive', label: 'Defensive', text: 'A deeper, tighter block and fewer men breaking forward.' },
      { id: 'Balanced', label: 'Balanced', text: 'Measured risk both ways.' },
      { id: 'Attacking', label: 'Attacking', text: 'The shape pushes up, midfielders arrive in the box more and players shoot more readily.' },
      { id: 'Ultra Attacking', label: 'Ultra Attacking', text: 'Everyone forward: many more chances, but more of your players are caught upfield when you lose the ball, and they take longer to get back.' },
    ],
    gives: ['More bodies in and around the box, more shots, braver passes forward.'],
    costs: ['More players caught upfield when an attack breaks down; counter-attacks against grow quickly at the top end.'],
    engine: [
      'Moves the whole team up or down the pitch, with and without the ball; the defensive settings also make the block deeper and narrower.',
      'Raises or lowers how often players pick the forward pass and how readily they shoot.',
      'With a defensive mentality, defenders under pressure near their goal clear it more often instead of playing out.',
      'With an attacking one, the side takes longer to recover its shape after losing the ball.',
      'The match situation adds to it: sides chasing a game push on, sides protecting a lead sit in, sides three up stop forcing it.',
    ],
    moves: [['Chances created', 'up'], ['Exposure on the break', 'up']],
  },
  defApproach: {
    title: 'Defensive approach',
    what: 'How the block defends: how high it engages and how hard it goes in. Picking one also sets the line height and pressing sliders to match.',
    options: [
      { id: 'Deep', label: 'Deep', text: 'Drop off as a unit and protect the box: compact between the lines, narrow, with little pressing in their half. They will have the ball, but chances through a crowded box are worse ones.' },
      { id: 'Balanced', label: 'Balanced', text: 'A mid block that engages from halfway.' },
      { id: 'High', label: 'High', text: 'Engage higher up and close down their build-up; their keeper plays it short less often.' },
      { id: 'Aggressive', label: 'Aggressive', text: 'As High, and players step out harder and go to ground more: more tackles, about a fifth more fouls (and bookings).' },
    ],
    gives: ['Toward Aggressive: the ball won higher up and more often, and their keeper forced long.'],
    costs: ['Toward Aggressive: more fouls and cards, and the men who step out leave gaps behind them. Toward Deep: territory and the ball conceded.'],
    engine: [
      'Sets the shape of the block: a deep one squeezes the space between its lines and closes the middle.',
      'Sets how readily the nearest players step out to close the ball down near your own box: a deep block has the bodies right there and closes down hardest of all in its own third.',
      'High and Aggressive make the opposition keeper play long more often; Aggressive adds challenges and fouls.',
    ],
    moves: [['Ball won high up', 'up'], ['Fouls', 'up']],
  },
  lineHeight: {
    title: 'Line height',
    what: 'How far up the pitch your back line holds. The midfield follows the ball and your defensive approach, so the line also decides how much room there is behind and between the lines.',
    options: [
      { id: 'low', label: 'Deep', text: 'Little space behind you and few offsides. With a mid block in front it leaves room between your lines; with a deep block the whole team sits low and compact.' },
      { id: 'mid', label: 'Middle', text: 'A mid-height line.' },
      { id: 'high', label: 'High', text: 'Squeezes the pitch while the ball is being pressed: the opposition is caught offside more and struggles to get through a compressed midfield. When their passer has time, the line has to drop off, and the space behind is there for balls over the top.' },
    ],
    gives: ['Higher: a shorter pitch, more offsides, fewer chances against from patient build-up.'],
    costs: ['Higher: balls in behind and one-on-ones; quick forwards against slow defenders are the danger.'],
    engine: [
      'Positions the back line, most strongly when the ball is far from your goal; near your box every line holds its edge.',
      'A high line holds only while the man on the ball is under pressure. When he has time to look up, the back line drops off toward a mid block, and steps up again once the press is back on him, so pressing is what keeps a high line high.',
      'The higher the line, the more often runners are caught offside, and the more room an opponent sees behind it, so balls in behind are tried more often.',
      'A ball in behind is a race between the runner and the covering defender; a beaten line is chasing back for several seconds.',
    ],
    moves: [['Offsides you catch', 'up'], ['Space behind you', 'up'], ['Chances against from build-up', 'down']],
  },
  pressing: {
    title: 'Pressing',
    what: 'How hard and how high your players close down the man on the ball.',
    options: [
      { id: 'low', label: 'Low', text: 'Hold the shape and save legs: their defenders and midfielders have time on the ball.' },
      { id: 'mid', label: 'Medium', text: 'The nearest man steps out in midfield.' },
      { id: 'high', label: 'Relentless', text: 'The nearest man goes after the ball everywhere, a second one joins in, and straight after losing it you counter-press. Their passing suffers; your legs go sooner.' },
    ],
    gives: ['Pressure on their passing, the ball won back higher up, mistakes forced from players who are poor under pressure.'],
    costs: ['Energy: the biggest drain in the game. A beaten press leaves the men who stepped out behind the ball.'],
    engine: [
      'Decides how far and how often the nearest players step toward the ball in each third; at high settings a second man presses too.',
      'Pressure on the ball makes passes less accurate and challenges more frequent, less so against composed, technical players.',
      'Tired players press less.',
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
    gives: ['More balls in behind flagged before they become chances.'],
    costs: ['Nothing changes when the timing is right; the runs it fails to catch are still the same runs.'],
    engine: ['Multiplies the chance that a pass played in behind, or to a man on the shoulder of the line, is flagged offside; line height scales it.'],
    moves: [['Offsides you catch', 'up']],
  },
  buildUp: {
    title: 'Build-up',
    what: 'How you move the ball out from the back and through the middle.',
    options: [
      { id: 'Balanced', label: 'Balanced', text: 'Short when it is on, long when it is not; the keeper mixes it.' },
      { id: 'Short Passing', label: 'Short', text: 'Play out through the lines: the keeper plays it short most of the time, long balls are rare and passers are more patient. Keeps the ball well; needs composed players against a press.' },
      { id: 'Counter', label: 'Counter', text: 'When you win it back you break at once: counters start much more often, with longer, earlier passes.' },
      { id: 'Long Ball', label: 'Long', text: 'Go long early to the front line: the keeper kicks long, short passes at the back are avoided and defenders clear it under pressure. Target men and runners matter; you will see less of the ball.' },
    ],
    gives: ['Toward Long: the press bypassed, the ball forward quickly, aerial strength and runners used.'],
    costs: ['Toward Long: less of the ball and more passes lost. Short needs composure under pressure, or the ball is lost close to your own goal.'],
    engine: [
      'Sets how attractive long passes are, and from how far.',
      'Decides how often your keeper plays it short.',
      'Counter makes winning the ball turn into a fast break more often; Short Passing does the opposite and makes passers more patient.',
      'Part of the team\'s directness, with chance creation and tempo.',
    ],
    moves: [['Directness', 'mixed'], ['Keeping the ball', 'mixed']],
  },
  chanceCreation: {
    title: 'Chance creation',
    what: 'How you try to turn possession in the final third into chances.',
    options: [
      { id: 'Balanced', label: 'Balanced', text: 'Take what the game gives.' },
      { id: 'Possession', label: 'Possession', text: 'Work the ball until a clear chance appears: passers avoid the risky ball, half-chances are passed up and good ones taken, and the patient circulation finds receivers a little more space. It needs players who can keep the ball; without them it goes round and round.' },
      { id: 'Direct Passing', label: 'Direct', text: 'Look for the killer pass early: through balls are tried more often, passers accept more risk, and players shoot a little sooner. More shots, more offsides.' },
      { id: 'Forward Runs', label: 'Runs', text: 'Players drive forward with the ball and run beyond it: more carries, more balls in behind, more counters. More shots, but the ball changes hands more often.' },
    ],
    gives: ['Possession: fewer, better shots and more control. Direct and Runs: more shots and more pace in the attack.'],
    costs: ['Possession: few shots if the players cannot find the gap. Direct and Runs: more ball lost and more offsides.'],
    engine: [
      'Changes how much weight passers give to a pass arriving, how often balls in behind are played and how picky players are about shooting.',
      'Possession sides wait longer before forcing it forward when a move is going nowhere; direct sides hardly wait at all.',
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
      { id: 'high', label: 'Wide', text: 'Players spread to the touchlines: switches of play and crosses become more likely, and a shifting block is pulled across. Slightly more exposed when you lose the ball.' },
    ],
    gives: ['Wider: switches that catch the block shifting, more crosses.'],
    costs: ['Wider: a stretched shape when the ball is lost.'],
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
      { id: 'low', label: 'Patient', text: 'Take time on the ball: more accurate, more careful passing and more of the ball, less forward urgency. Easier on the legs.' },
      { id: 'mid', label: 'Measured', text: 'A normal speed of play.' },
      { id: 'high', label: 'Fast', text: 'Quicker decisions and more forward passes: attacks develop before the block is set, but more passes go astray and you keep the ball less. More tiring.' },
    ],
    gives: ['Faster: attacks that arrive before the defence has shifted, more play per minute.'],
    costs: ['Faster: more passes lost, less of the ball, more tiring.'],
    engine: [
      'Changes how long each action takes, so a fast side gets through more play per minute and the defending block has less time to shift across.',
      'Faster tempo means more forward passes, more accepted risk and lower pass accuracy.',
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
    gives: ['More crosses into the box.'],
    costs: ['Crosses into a crowded box are often headed clear.'],
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
    gives: [],
    costs: [],
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
    gives: [],
    costs: [],
    engine: ['Sets how often a free kick in range is a direct shot rather than a ball into the box.'],
    moves: [],
  },
  timeWasting: {
    title: 'Time wasting',
    what: 'Slowing the game down when you are winning.',
    options: [{ id: 'on', label: 'On', text: 'Only from the hour mark and only while you lead: slower restarts and slower play. Referees book players for it more often.' }],
    gives: ['Fewer minutes for them to come back.'],
    costs: ['Bookings, and more stoppage time.'],
    engine: ['From 60\' while ahead: longer dead-ball time, a slower tempo, and a higher chance of a booking for time-wasting.'],
    moves: [],
  },
  roles: {
    title: 'Roles and duties',
    what: 'Each player\'s role and duty shift what he does on the ball and where he stands.',
    options: [],
    gives: [],
    costs: [],
    engine: [
      'A role leans a player toward shooting, carrying, dribbling, crossing, forward passing, getting on the ball, getting into the box, or defensive work.',
      'Creative roles (Playmaker, Classic 10, Half-Winger, Box-to-Box, Wide Playmaker, False 9) take up the pocket between the opposition\'s lines in the build-up; that is where a side without a number 10 finds its way forward.',
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
  if (m <= -1 && (t.buildUp === 'Short Passing' || t.chanceCreation === 'Possession')) out.push({ title: 'Patient but cautious', text: 'Short, patient passing with few men committing forward: there are not many options ahead of the ball, so moves take a long time to get anywhere. Expect few chances.' })
  if (t.buildUp === 'Long Ball' && t.chanceCreation === 'Possession') out.push({ title: 'Long, then patient', text: 'The build-up goes long early, then the final third asks for patience: possession comes in short bursts and the long balls make it hard to settle.' })
  if (t.lineHeight >= 65 && t.pressing <= 40) out.push({ title: 'High line, no pressure', text: 'A high line without pressure on the ball: their passers have time, so the line keeps dropping off and spends much of the game deeper than you set it, and when it does hold, the ball over the top is on. Pressing is what keeps a high line high.' })
  if (t.lineHeight <= 38 && t.defApproach !== 'Deep' && MI(t) >= 0) out.push({ title: 'Deep line, mid block', text: 'A deep back line with the midfield engaging higher up leaves room between your lines, where their creative players can receive and turn. Either drop as a unit (a Deep approach) or bring the line up.' })
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

// ---------------------------------------------------------------- presets

/** What each preset is for, in the match engine's terms: its identity, what it asks of the players, what it risks. */
export const PRESET_INFO: Record<string, { tag: string; identity: string; needs: string; risk: string }> = {
  Possession: {
    tag: 'Keep it, wear them down',
    identity: 'A high block that presses to win the ball back, short build-up from the keeper and a patient final third: the ball goes round until a clear chance appears.',
    needs: 'Composed, technical passers who keep the ball under pressure. Without them the circulation goes nowhere.',
    risk: 'Fewer shots than your possession suggests, and space behind the line when the press is beaten.',
  },
  Gegenpress: {
    tag: 'Win it back high, at once',
    identity: 'An aggressive press and a high line squeeze the game into their half; runners break forward the moment the ball is won.',
    needs: 'Fit, aggressive pressers, quick defenders to cover the space behind.',
    risk: 'The most tiring way to play, and a ball over the top of the line is always the danger.',
  },
  'Counter-Attack': {
    tag: 'Let them come, then break',
    identity: 'A deep, compact block, then quick, direct passing into the space they leave the moment you win it.',
    needs: 'Pace up front and players who pick the right pass early.',
    risk: 'You will defend for long spells and see less of the ball.',
  },
  'Park the Bus': {
    tag: 'Protect the box above all',
    identity: 'Deep and narrow with few men forward; long balls relieve the pressure. Shots against go up, but most come from distance through a crowded box.',
    needs: 'Concentration, aerial strength at the back and a target up front.',
    risk: 'Chances of your own are rare, and a goal against changes nothing about how hard it is to score.',
  },
  Balanced: {
    tag: 'The neutral base',
    identity: 'A mid block, mixed passing and measured risk: a starting point to adjust from.',
    needs: 'Nothing in particular.',
    risk: 'Nothing extreme either way.',
  },
  Direct: {
    tag: 'Forward early',
    identity: 'Long balls to the front line at a high tempo, through balls looked for early and plenty of bodies attacking crosses.',
    needs: 'A strong target forward and runners who win second balls.',
    risk: 'Less of the ball, more aerial contests, and more passes that go astray.',
  },
  'Wing Play': {
    tag: 'Stretch them wide',
    identity: 'A very wide shape, runners beyond the ball and players set to attack the box: the game is played through the flanks and crosses.',
    needs: 'Wingers or wing-backs who cross well and strikers who attack the ball.',
    risk: 'A stretched shape leaves gaps in the middle when the ball is lost.',
  },
}

/** The tactics a preset gives (the manager's mentality and time wasting are kept). */
export const presetTactics = (name: string, t: TeamTactics): TeamTactics => ({ ...DEFAULT_TACTICS, ...VISION_TACTICS[name], mentality: t.mentality, timeWasting: t.timeWasting })

const PRESET_KEYS: (keyof TeamTactics)[] = ['buildUp', 'defApproach', 'lineHeight', 'width', 'tempo', 'pressing', 'chanceCreation', 'playersInBox']
/** The preset the current settings are, if any. */
export const presetOf = (t: TeamTactics) => Object.keys(VISION_TACTICS).find((n) => { const p = presetTactics(n, t); return PRESET_KEYS.every((k) => p[k] === t[k]) })

/** The settings a preset sets, in words, for showing what it actually is. */
export function presetSettings(t: TeamTactics): { key: keyof TeamTactics; label: string; value: string }[] {
  const lvl = (v: number, lo: string, mid: string, hi: string) => `${v <= 35 ? lo : v >= 65 ? hi : mid} · ${v}`
  return [
    { key: 'defApproach', label: 'Defensive approach', value: t.defApproach },
    { key: 'lineHeight', label: 'Line height', value: lvl(t.lineHeight, 'Deep', 'Middle', 'High') },
    { key: 'pressing', label: 'Pressing', value: lvl(t.pressing, 'Low', 'Medium', 'Relentless') },
    { key: 'buildUp', label: 'Build-up', value: t.buildUp },
    { key: 'chanceCreation', label: 'Chance creation', value: t.chanceCreation },
    { key: 'width', label: 'Width', value: lvl(t.width, 'Narrow', 'Balanced', 'Wide') },
    { key: 'tempo', label: 'Tempo', value: lvl(t.tempo, 'Patient', 'Measured', 'Fast') },
    { key: 'playersInBox', label: 'Players in the box', value: `${t.playersInBox}` },
  ]
}

/**
 * What changed between two setups, in a short phrase for the commentary and the Match Report ("attacking mentality,
 * line higher, 4-4-2"). Small nudges of a slider (under 8) are left out: they are browsing, not a change of plan.
 */
export function describeChange(a: TeamTactics, b: TeamTactics, formA?: string, formB?: string): string {
  const out: string[] = []
  if (formA && formB && formA !== formB) out.push(formB)
  if (a.mentality !== b.mentality) out.push(`${b.mentality.toLowerCase()} mentality`)
  if (a.defApproach !== b.defApproach) out.push(`${b.defApproach === 'Deep' ? 'a deep' : b.defApproach === 'Balanced' ? 'a mid' : b.defApproach === 'High' ? 'a high' : 'an aggressive'} block`)
  if (a.buildUp !== b.buildUp) out.push(b.buildUp === 'Balanced' ? 'mixed build-up' : b.buildUp === 'Counter' ? 'counter-attacking build-up' : `${b.buildUp.toLowerCase()} build-up`)
  if (a.chanceCreation !== b.chanceCreation) out.push(b.chanceCreation === 'Balanced' ? 'mixed chance creation' : b.chanceCreation === 'Possession' ? 'patient chance creation' : b.chanceCreation.toLowerCase())
  const slide = (k: 'lineHeight' | 'pressing' | 'width' | 'tempo', up: string, down: string) => {
    const d = b[k] - a[k]
    if (Math.abs(d) >= 8) out.push(d > 0 ? up : down)
  }
  slide('lineHeight', 'line higher', 'line deeper')
  slide('pressing', 'pressing harder', 'pressing less')
  slide('width', 'wider', 'narrower')
  slide('tempo', 'quicker tempo', 'slower tempo')
  if (a.playersInBox !== b.playersInBox) out.push(`${b.playersInBox} in the box`)
  if (a.offsideTrap !== b.offsideTrap) out.push(b.offsideTrap ? 'offside trap on' : 'offside trap off')
  if (a.timeWasting !== b.timeWasting) out.push(b.timeWasting ? 'running the clock down' : 'no more time-wasting')
  if (a.corners !== b.corners) out.push(`${b.corners.toLowerCase()} corners`)
  if (a.freeKicks !== b.freeKicks) out.push(`${b.freeKicks.toLowerCase()} free kicks`)
  return out.join(', ')
}
