import type { AttrKey, PosGroup, Position, TeamTactics, TrainingPlan } from './types'
import { A } from './types'

export const POSITIONS: Position[] = ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'CM', 'RM', 'LM', 'CAM', 'RW', 'LW', 'CF', 'ST']

export const POS_GROUP: Record<Position, PosGroup> = {
  GK: 'GK', RB: 'DEF', RWB: 'DEF', CB: 'DEF', LB: 'DEF', LWB: 'DEF', CDM: 'MID', CM: 'MID', RM: 'MID', LM: 'MID',
  CAM: 'MID', RW: 'ATT', LW: 'ATT', CF: 'ATT', ST: 'ATT',
}

export const POS_ORDER: Record<Position, number> = {
  GK: 0, RB: 1, RWB: 2, CB: 3, LB: 4, LWB: 5, CDM: 6, CM: 7, RM: 8, LM: 9, CAM: 10, RW: 11, LW: 12, CF: 13, ST: 14,
}

export const GROUP_COLOR: Record<PosGroup, string> = { GK: '#F5B400', DEF: '#2F8CFF', MID: '#1FCB6B', ATT: '#FF4D5E' }

export const POS_NAME: Record<Position, string> = {
  GK: 'Goalkeeper', RB: 'Right Back', RWB: 'Right Wing Back', CB: 'Centre Back', LB: 'Left Back', LWB: 'Left Wing Back',
  CDM: 'Defensive Midfielder', CM: 'Central Midfielder', RM: 'Right Midfielder', LM: 'Left Midfielder',
  CAM: 'Attacking Midfielder', RW: 'Right Winger', LW: 'Left Winger', CF: 'Centre Forward', ST: 'Striker',
}

// ---------------------------------------------------------------- attributes
export const ATTR_LABEL: Record<AttrKey, string> = {
  crossing: 'Crossing', finishing: 'Finishing', heading: 'Heading Accuracy', shortPassing: 'Short Passing',
  volleys: 'Volleys', dribbling: 'Dribbling', curve: 'Curve', fkAccuracy: 'Free Kick Accuracy', longPassing: 'Long Passing',
  ballControl: 'Ball Control', acceleration: 'Acceleration', sprintSpeed: 'Sprint Speed', agility: 'Agility',
  reactions: 'Reactions', balance: 'Balance', shotPower: 'Shot Power', jumping: 'Jumping', stamina: 'Stamina',
  strength: 'Strength', longShots: 'Long Shots', aggression: 'Aggression', interceptions: 'Interceptions',
  positioning: 'Att. Position', vision: 'Vision', penalties: 'Penalties', composure: 'Composure',
  defAwareness: 'Def. Awareness', standingTackle: 'Standing Tackle', slidingTackle: 'Sliding Tackle', gkDiving: 'GK Diving',
  gkHandling: 'GK Handling', gkKicking: 'GK Kicking', gkPositioning: 'GK Positioning', gkReflexes: 'GK Reflexes',
}

export const ATTR_GROUPS: { key: string; label: string; attrs: AttrKey[] }[] = [
  { key: 'PAC', label: 'Pace', attrs: ['acceleration', 'sprintSpeed'] },
  { key: 'SHO', label: 'Shooting', attrs: ['positioning', 'finishing', 'shotPower', 'longShots', 'volleys', 'penalties'] },
  { key: 'PAS', label: 'Passing', attrs: ['vision', 'crossing', 'fkAccuracy', 'shortPassing', 'longPassing', 'curve'] },
  { key: 'DRI', label: 'Dribbling', attrs: ['agility', 'balance', 'reactions', 'ballControl', 'dribbling', 'composure'] },
  { key: 'DEF', label: 'Defending', attrs: ['interceptions', 'heading', 'defAwareness', 'standingTackle', 'slidingTackle'] },
  { key: 'PHY', label: 'Physical', attrs: ['jumping', 'stamina', 'strength', 'aggression'] },
]
export const GK_GROUPS: { key: string; label: string; attrs: AttrKey[] }[] = [
  { key: 'DIV', label: 'Diving', attrs: ['gkDiving'] },
  { key: 'HAN', label: 'Handling', attrs: ['gkHandling'] },
  { key: 'KIC', label: 'Kicking', attrs: ['gkKicking'] },
  { key: 'REF', label: 'Reflexes', attrs: ['gkReflexes'] },
  { key: 'SPD', label: 'Speed', attrs: ['acceleration', 'sprintSpeed'] },
  { key: 'POS', label: 'Positioning', attrs: ['gkPositioning'] },
]

// Face stat formulas (EA FC style)
export const FACE_WEIGHTS: Record<string, [AttrKey, number][]> = {
  PAC: [['acceleration', 0.45], ['sprintSpeed', 0.55]],
  SHO: [['positioning', 0.05], ['finishing', 0.45], ['shotPower', 0.2], ['longShots', 0.2], ['volleys', 0.05], ['penalties', 0.05]],
  PAS: [['vision', 0.2], ['crossing', 0.2], ['fkAccuracy', 0.05], ['shortPassing', 0.35], ['longPassing', 0.15], ['curve', 0.05]],
  DRI: [['agility', 0.1], ['balance', 0.05], ['reactions', 0.05], ['ballControl', 0.35], ['dribbling', 0.5], ['composure', 0.0]],
  DEF: [['interceptions', 0.2], ['heading', 0.1], ['defAwareness', 0.3], ['standingTackle', 0.3], ['slidingTackle', 0.1]],
  PHY: [['jumping', 0.05], ['stamina', 0.25], ['strength', 0.5], ['aggression', 0.2]],
}

// Position rating weights (EA overall formula approximation)
type W = Partial<Record<AttrKey, number>>
export const RATING_WEIGHTS: Record<string, W> = {
  GK: { gkDiving: 21, gkHandling: 21, gkKicking: 5, gkReflexes: 21, reactions: 11, gkPositioning: 21 },
  CB: { defAwareness: 14, standingTackle: 17, slidingTackle: 14, heading: 10, strength: 10, aggression: 7, interceptions: 13, shortPassing: 5, ballControl: 4, reactions: 5, jumping: 3 },
  FB: { acceleration: 5, sprintSpeed: 7, stamina: 8, reactions: 8, ballControl: 7, shortPassing: 7, crossing: 9, interceptions: 12, heading: 4, defAwareness: 8, standingTackle: 11, slidingTackle: 14 },
  WB: { acceleration: 4, sprintSpeed: 6, stamina: 10, reactions: 8, ballControl: 8, dribbling: 4, shortPassing: 10, crossing: 12, interceptions: 12, defAwareness: 7, standingTackle: 8, slidingTackle: 11 },
  CDM: { shortPassing: 14, longPassing: 10, interceptions: 14, defAwareness: 9, standingTackle: 12, slidingTackle: 5, ballControl: 10, reactions: 7, vision: 4, strength: 4, aggression: 5, stamina: 6 },
  CM: { shortPassing: 17, longPassing: 13, vision: 13, ballControl: 14, dribbling: 7, reactions: 8, interceptions: 5, positioning: 6, standingTackle: 5, stamina: 6, longShots: 4 },
  CAM: { shortPassing: 16, vision: 14, ballControl: 15, dribbling: 13, positioning: 9, reactions: 7, longShots: 5, finishing: 7, shotPower: 5, agility: 3, acceleration: 4 },
  WM: { crossing: 10, dribbling: 15, ballControl: 13, shortPassing: 11, longPassing: 5, acceleration: 7, sprintSpeed: 6, reactions: 7, positioning: 8, vision: 7, stamina: 5 },
  W: { crossing: 9, dribbling: 16, ballControl: 14, shortPassing: 9, acceleration: 7, sprintSpeed: 6, agility: 3, reactions: 7, positioning: 9, vision: 6, finishing: 10, longShots: 4 },
  CF: { finishing: 11, positioning: 13, heading: 2, shotPower: 5, reactions: 9, dribbling: 14, ballControl: 15, longShots: 4, shortPassing: 9, vision: 8, acceleration: 5, sprintSpeed: 5 },
  ST: { finishing: 18, positioning: 13, heading: 10, shotPower: 10, reactions: 8, dribbling: 7, ballControl: 10, volleys: 2, longShots: 3, acceleration: 4, sprintSpeed: 5, strength: 5 },
}
export const POS_WEIGHT_KEY: Record<Position, string> = {
  GK: 'GK', CB: 'CB', RB: 'FB', LB: 'FB', RWB: 'WB', LWB: 'WB', CDM: 'CDM', CM: 'CM', CAM: 'CAM', RM: 'WM', LM: 'WM',
  RW: 'W', LW: 'W', CF: 'CF', ST: 'ST',
}

/** Position similarity: 1 = identical, 0 = unrelated (drives out-of-position penalties). */
export const POS_SIMILARITY: Partial<Record<Position, Partial<Record<Position, number>>>> = {
  GK: {},
  CB: { RB: 0.6, LB: 0.6, CDM: 0.65, RWB: 0.45, LWB: 0.45 },
  RB: { RWB: 0.95, LB: 0.8, CB: 0.6, RM: 0.6, LWB: 0.75, CDM: 0.45 },
  LB: { LWB: 0.95, RB: 0.8, CB: 0.6, LM: 0.6, RWB: 0.75, CDM: 0.45 },
  RWB: { RB: 0.95, RM: 0.8, LWB: 0.8, RW: 0.6, LB: 0.7 },
  LWB: { LB: 0.95, LM: 0.8, RWB: 0.8, LW: 0.6, RB: 0.7 },
  CDM: { CM: 0.9, CB: 0.65, CAM: 0.6 },
  CM: { CDM: 0.9, CAM: 0.85, RM: 0.65, LM: 0.65 },
  CAM: { CM: 0.85, CF: 0.8, RW: 0.65, LW: 0.65, ST: 0.6, RM: 0.6, LM: 0.6 },
  RM: { RW: 0.95, LM: 0.8, RWB: 0.75, CM: 0.65, CAM: 0.6, LW: 0.75, CF: 0.55, ST: 0.5 },
  LM: { LW: 0.95, RM: 0.8, LWB: 0.75, CM: 0.65, CAM: 0.6, RW: 0.75, CF: 0.55, ST: 0.5 },
  RW: { RM: 0.95, LW: 0.85, CF: 0.65, ST: 0.6, CAM: 0.65, LM: 0.75 },
  LW: { LM: 0.95, RW: 0.85, CF: 0.65, ST: 0.6, CAM: 0.65, RM: 0.75 },
  CF: { ST: 0.95, CAM: 0.8, RW: 0.65, LW: 0.65 },
  ST: { CF: 0.95, CAM: 0.6, RW: 0.6, LW: 0.6 },
}

// ---------------------------------------------------------------- formations
export interface Slot { label: string; pos: Position; x: number; y: number }
export interface Formation { id: string; name: string; family: string; slots: Slot[] }
const S = (label: string, pos: Position, x: number, y: number): Slot => ({ label, pos, x, y })
const GK = S('GK', 'GK', 50, 5)
const back4 = [S('RB', 'RB', 86, 24), S('RCB', 'CB', 62, 19), S('LCB', 'CB', 38, 19), S('LB', 'LB', 14, 24)]
const back3 = [S('RCB', 'CB', 72, 20), S('CB', 'CB', 50, 18), S('LCB', 'CB', 28, 20)]
const back5 = [S('RWB', 'RWB', 90, 30), S('RCB', 'CB', 70, 19), S('CB', 'CB', 50, 17), S('LCB', 'CB', 30, 19), S('LWB', 'LWB', 10, 30)]

export const FORMATIONS: Formation[] = [
  { id: '4-3-3 Holding', name: '4-3-3 (Holding)', family: '4-3-3', slots: [GK, ...back4, S('CDM', 'CDM', 50, 38), S('RCM', 'CM', 68, 50), S('LCM', 'CM', 32, 50), S('RW', 'RW', 84, 74), S('ST', 'ST', 50, 84), S('LW', 'LW', 16, 74)] },
  { id: '4-3-3 Attack', name: '4-3-3 (Attack)', family: '4-3-3', slots: [GK, ...back4, S('RCM', 'CM', 66, 44), S('LCM', 'CM', 34, 44), S('CAM', 'CAM', 50, 60), S('RW', 'RW', 84, 76), S('ST', 'ST', 50, 86), S('LW', 'LW', 16, 76)] },
  { id: '4-3-3 Defend', name: '4-3-3 (Defend)', family: '4-3-3', slots: [GK, ...back4, S('RDM', 'CDM', 62, 36), S('LDM', 'CDM', 38, 36), S('CM', 'CM', 50, 52), S('RW', 'RW', 84, 72), S('ST', 'ST', 50, 84), S('LW', 'LW', 16, 72)] },
  { id: '4-3-3 Flat', name: '4-3-3 (Flat)', family: '4-3-3', slots: [GK, ...back4, S('RCM', 'CM', 72, 46), S('CM', 'CM', 50, 44), S('LCM', 'CM', 28, 46), S('RW', 'RW', 84, 74), S('ST', 'ST', 50, 84), S('LW', 'LW', 16, 74)] },
  { id: '4-3-3 False 9', name: '4-3-3 (False 9)', family: '4-3-3', slots: [GK, ...back4, S('CDM', 'CDM', 50, 38), S('RCM', 'CM', 70, 50), S('LCM', 'CM', 30, 50), S('RW', 'RW', 84, 76), S('CF', 'CF', 50, 76), S('LW', 'LW', 16, 76)] },
  { id: '4-2-3-1 Wide', name: '4-2-3-1 (Wide)', family: '4-2-3-1', slots: [GK, ...back4, S('RDM', 'CDM', 62, 38), S('LDM', 'CDM', 38, 38), S('RM', 'RM', 84, 62), S('CAM', 'CAM', 50, 62), S('LM', 'LM', 16, 62), S('ST', 'ST', 50, 85)] },
  { id: '4-2-3-1 Narrow', name: '4-2-3-1 (Narrow)', family: '4-2-3-1', slots: [GK, ...back4, S('RDM', 'CDM', 62, 38), S('LDM', 'CDM', 38, 38), S('RCAM', 'CAM', 74, 62), S('CAM', 'CAM', 50, 64), S('LCAM', 'CAM', 26, 62), S('ST', 'ST', 50, 85)] },
  { id: '4-4-2 Flat', name: '4-4-2 (Flat)', family: '4-4-2', slots: [GK, ...back4, S('RM', 'RM', 86, 52), S('RCM', 'CM', 62, 46), S('LCM', 'CM', 38, 46), S('LM', 'LM', 14, 52), S('RS', 'ST', 62, 80), S('LS', 'ST', 38, 80)] },
  { id: '4-4-2 Holding', name: '4-4-2 (Holding)', family: '4-4-2', slots: [GK, ...back4, S('RDM', 'CDM', 62, 38), S('LDM', 'CDM', 38, 38), S('RM', 'RM', 86, 56), S('LM', 'LM', 14, 56), S('RS', 'ST', 62, 80), S('LS', 'ST', 38, 80)] },
  { id: '4-1-2-1-2 Narrow', name: '4-1-2-1-2 (Narrow)', family: '4-1-2-1-2', slots: [GK, ...back4, S('CDM', 'CDM', 50, 36), S('RCM', 'CM', 70, 48), S('LCM', 'CM', 30, 48), S('CAM', 'CAM', 50, 62), S('RS', 'ST', 62, 82), S('LS', 'ST', 38, 82)] },
  { id: '4-1-2-1-2 Wide', name: '4-1-2-1-2 (Wide)', family: '4-1-2-1-2', slots: [GK, ...back4, S('CDM', 'CDM', 50, 36), S('RM', 'RM', 84, 52), S('LM', 'LM', 16, 52), S('CAM', 'CAM', 50, 62), S('RS', 'ST', 62, 82), S('LS', 'ST', 38, 82)] },
  { id: '4-3-2-1', name: '4-3-2-1', family: '4-3-2-1', slots: [GK, ...back4, S('RCM', 'CM', 72, 44), S('CM', 'CM', 50, 42), S('LCM', 'CM', 28, 44), S('RF', 'CF', 64, 70), S('LF', 'CF', 36, 70), S('ST', 'ST', 50, 86)] },
  { id: '4-2-2-2', name: '4-2-2-2', family: '4-2-2-2', slots: [GK, ...back4, S('RDM', 'CDM', 62, 38), S('LDM', 'CDM', 38, 38), S('RAM', 'CAM', 76, 62), S('LAM', 'CAM', 24, 62), S('RS', 'ST', 62, 84), S('LS', 'ST', 38, 84)] },
  { id: '4-1-4-1', name: '4-1-4-1', family: '4-1-4-1', slots: [GK, ...back4, S('CDM', 'CDM', 50, 36), S('RM', 'RM', 86, 58), S('RCM', 'CM', 62, 54), S('LCM', 'CM', 38, 54), S('LM', 'LM', 14, 58), S('ST', 'ST', 50, 84)] },
  { id: '4-4-1-1', name: '4-4-1-1', family: '4-4-1-1', slots: [GK, ...back4, S('RM', 'RM', 86, 52), S('RCM', 'CM', 62, 46), S('LCM', 'CM', 38, 46), S('LM', 'LM', 14, 52), S('CF', 'CF', 50, 70), S('ST', 'ST', 50, 86)] },
  { id: '4-5-1', name: '4-5-1', family: '4-5-1', slots: [GK, ...back4, S('RM', 'RM', 86, 52), S('RCM', 'CM', 66, 46), S('CAM', 'CAM', 50, 60), S('LCM', 'CM', 34, 46), S('LM', 'LM', 14, 52), S('ST', 'ST', 50, 84)] },
  { id: '3-4-3', name: '3-4-3', family: '3-4-3', slots: [GK, ...back3, S('RM', 'RM', 88, 50), S('RCM', 'CM', 62, 44), S('LCM', 'CM', 38, 44), S('LM', 'LM', 12, 50), S('RW', 'RW', 78, 76), S('ST', 'ST', 50, 86), S('LW', 'LW', 22, 76)] },
  { id: '3-4-2-1', name: '3-4-2-1', family: '3-4-2-1', slots: [GK, ...back3, S('RM', 'RM', 88, 50), S('RCM', 'CM', 62, 44), S('LCM', 'CM', 38, 44), S('LM', 'LM', 12, 50), S('RF', 'CF', 66, 70), S('LF', 'CF', 34, 70), S('ST', 'ST', 50, 86)] },
  { id: '3-5-2', name: '3-5-2', family: '3-5-2', slots: [GK, ...back3, S('RDM', 'CDM', 62, 38), S('LDM', 'CDM', 38, 38), S('RM', 'RM', 88, 54), S('CAM', 'CAM', 50, 60), S('LM', 'LM', 12, 54), S('RS', 'ST', 62, 82), S('LS', 'ST', 38, 82)] },
  { id: '3-1-4-2', name: '3-1-4-2', family: '3-1-4-2', slots: [GK, ...back3, S('CDM', 'CDM', 50, 36), S('RM', 'RM', 88, 54), S('RCM', 'CM', 64, 50), S('LCM', 'CM', 36, 50), S('LM', 'LM', 12, 54), S('RS', 'ST', 62, 82), S('LS', 'ST', 38, 82)] },
  { id: '5-3-2', name: '5-3-2', family: '5-3-2', slots: [GK, ...back5, S('RCM', 'CM', 70, 46), S('CM', 'CM', 50, 44), S('LCM', 'CM', 30, 46), S('RS', 'ST', 62, 80), S('LS', 'ST', 38, 80)] },
  { id: '5-2-3', name: '5-2-3', family: '5-2-3', slots: [GK, ...back5, S('RCM', 'CM', 64, 46), S('LCM', 'CM', 36, 46), S('RW', 'RW', 80, 74), S('ST', 'ST', 50, 84), S('LW', 'LW', 20, 74)] },
  { id: '5-4-1', name: '5-4-1', family: '5-4-1', slots: [GK, ...back5, S('RM', 'RM', 84, 54), S('RCM', 'CM', 62, 46), S('LCM', 'CM', 38, 46), S('LM', 'LM', 16, 54), S('ST', 'ST', 50, 82)] },
  { id: '5-2-1-2', name: '5-2-1-2', family: '5-2-1-2', slots: [GK, ...back5, S('RCM', 'CM', 64, 44), S('LCM', 'CM', 36, 44), S('CAM', 'CAM', 50, 60), S('RS', 'ST', 62, 82), S('LS', 'ST', 38, 82)] },
]
export const FORMATION_BY_ID: Record<string, Formation> = Object.fromEntries(FORMATIONS.map((f) => [f.id, f]))
export const FORMATION_ALIASES: Record<string, string> = { '4-4-2': '4-4-2 Flat', '4-3-3': '4-3-3 Holding', '4-2-3-1': '4-2-3-1 Wide' }
export function formationOf(id: string): Formation {
  return FORMATION_BY_ID[id] || FORMATION_BY_ID[FORMATION_ALIASES[id]] || FORMATIONS[0]
}

// ---------------------------------------------------------------- roles (FC IQ style)
export interface RoleDef { name: string; focuses: string[]; key: Partial<Record<AttrKey, number>>; desc: string; tags: string[] }
export const ROLES: Record<string, RoleDef[]> = {
  GK: [
    { name: 'Goalkeeper', focuses: ['Defend'], key: { gkReflexes: 1, gkDiving: 1, gkPositioning: 1 }, desc: 'Stays on the line and prioritises shot stopping.', tags: ['stop'] },
    { name: 'Sweeper Keeper', focuses: ['Balanced', 'Attack'], key: { gkPositioning: 1, sprintSpeed: 0.6, gkKicking: 0.6 }, desc: 'Leaves the box to sweep behind a high line.', tags: ['sweep'] },
    { name: 'Ball-Playing Keeper', focuses: ['Build-Up'], key: { gkKicking: 1, shortPassing: 0.8, composure: 0.6 }, desc: 'Starts attacks with composed distribution.', tags: ['build'] },
  ],
  CB: [
    { name: 'Defender', focuses: ['Defend', 'Balanced'], key: { defAwareness: 1, standingTackle: 1, heading: 0.6 }, desc: 'Holds the line and wins duels.', tags: ['def'] },
    { name: 'Stopper', focuses: ['Aggressive'], key: { aggression: 1, standingTackle: 1, strength: 0.8 }, desc: 'Steps out aggressively to win the ball early.', tags: ['press', 'def'] },
    { name: 'Ball-Playing Defender', focuses: ['Build-Up', 'Defend'], key: { shortPassing: 1, longPassing: 0.8, composure: 0.8 }, desc: 'Breaks lines with passes from deep.', tags: ['build'] },
  ],
  FB: [
    { name: 'Fullback', focuses: ['Defend', 'Balanced'], key: { standingTackle: 1, defAwareness: 1, interceptions: 0.6 }, desc: 'Defends the flank and supports conservatively.', tags: ['def'] },
    { name: 'Falseback', focuses: ['Balanced'], key: { shortPassing: 1, vision: 0.7, interceptions: 0.6 }, desc: 'Inverts into midfield in possession.', tags: ['build', 'invert'] },
    { name: 'Wingback', focuses: ['Balanced', 'Attack'], key: { stamina: 1, crossing: 0.8, sprintSpeed: 0.8 }, desc: 'Covers the whole flank, joining attacks.', tags: ['width', 'cross'] },
    { name: 'Attacking Wingback', focuses: ['Attack', 'Roaming'], key: { crossing: 1, dribbling: 0.8, sprintSpeed: 1 }, desc: 'Plays like a winger from full-back.', tags: ['width', 'cross', 'att'] },
  ],
  CDM: [
    { name: 'Holding', focuses: ['Defend', 'Balanced'], key: { interceptions: 1, defAwareness: 1, standingTackle: 0.8 }, desc: 'Screens the back line.', tags: ['def', 'screen'] },
    { name: 'Centre-Half', focuses: ['Defend'], key: { defAwareness: 1, strength: 0.8, heading: 0.8 }, desc: 'Drops between the centre-backs.', tags: ['def', 'deep'] },
    { name: 'Deep-Lying Playmaker', focuses: ['Build-Up', 'Balanced', 'Roaming'], key: { longPassing: 1, vision: 1, shortPassing: 0.8 }, desc: 'Dictates tempo from deep.', tags: ['build', 'playmaker'] },
    { name: 'Wide Half', focuses: ['Balanced'], key: { stamina: 0.8, shortPassing: 0.8, interceptions: 0.8 }, desc: 'Shuttles wide to support the full-back.', tags: ['width'] },
  ],
  CM: [
    { name: 'Box-to-Box', focuses: ['Balanced'], key: { stamina: 1, shortPassing: 0.7, standingTackle: 0.6, longShots: 0.5 }, desc: 'Contributes at both ends.', tags: ['b2b'] },
    { name: 'Holding', focuses: ['Defend'], key: { interceptions: 1, defAwareness: 0.8 }, desc: 'Sits and protects.', tags: ['def', 'screen'] },
    { name: 'Deep-Lying Playmaker', focuses: ['Build-Up', 'Balanced'], key: { longPassing: 1, vision: 1 }, desc: 'Orchestrates from deep.', tags: ['build', 'playmaker'] },
    { name: 'Playmaker', focuses: ['Attack', 'Roaming'], key: { vision: 1, shortPassing: 1, ballControl: 0.8 }, desc: 'Finds space to create chances.', tags: ['playmaker', 'create'] },
    { name: 'Half-Winger', focuses: ['Attack'], key: { dribbling: 1, crossing: 0.6, acceleration: 0.6 }, desc: 'Drifts wide into the half-spaces.', tags: ['width', 'create'] },
  ],
  CAM: [
    { name: 'Playmaker', focuses: ['Balanced', 'Roaming'], key: { vision: 1, shortPassing: 1 }, desc: 'The creative hub between the lines.', tags: ['playmaker', 'create'] },
    { name: 'Shadow Striker', focuses: ['Attack'], key: { positioning: 1, finishing: 1, acceleration: 0.6 }, desc: 'Arrives late into the box to score.', tags: ['shoot', 'runs'] },
    { name: 'Half-Winger', focuses: ['Attack'], key: { dribbling: 1, crossing: 0.6 }, desc: 'Works the half-spaces and flanks.', tags: ['width', 'create'] },
    { name: 'Classic 10', focuses: ['Attack'], key: { vision: 1, ballControl: 1, composure: 0.8 }, desc: 'Stays forward, waiting to unlock defences.', tags: ['playmaker', 'create', 'lazy'] },
  ],
  WM: [
    { name: 'Winger', focuses: ['Balanced', 'Attack'], key: { crossing: 1, sprintSpeed: 1, dribbling: 0.8 }, desc: 'Hugs the line and delivers crosses.', tags: ['width', 'cross'] },
    { name: 'Wide Midfielder', focuses: ['Balanced', 'Defend'], key: { stamina: 1, crossing: 0.7, standingTackle: 0.6 }, desc: 'Balances attacking width with tracking back.', tags: ['width', 'def'] },
    { name: 'Wide Playmaker', focuses: ['Balanced', 'Attack'], key: { vision: 1, shortPassing: 1 }, desc: 'Drifts inside to create.', tags: ['create', 'playmaker'] },
    { name: 'Inside Forward', focuses: ['Attack'], key: { finishing: 1, dribbling: 1, acceleration: 0.8 }, desc: 'Cuts inside to shoot.', tags: ['shoot', 'runs'] },
  ],
  W: [
    { name: 'Winger', focuses: ['Balanced', 'Attack'], key: { crossing: 1, sprintSpeed: 1, dribbling: 0.8 }, desc: 'Stretches play and crosses.', tags: ['width', 'cross'] },
    { name: 'Inside Forward', focuses: ['Attack', 'Balanced'], key: { finishing: 1, dribbling: 1, acceleration: 0.8 }, desc: 'Cuts inside onto the stronger foot.', tags: ['shoot', 'runs'] },
    { name: 'Wide Playmaker', focuses: ['Balanced', 'Attack'], key: { vision: 1, shortPassing: 1, dribbling: 0.6 }, desc: 'Creates from wide areas.', tags: ['create', 'playmaker'] },
  ],
  ST: [
    { name: 'Advanced Forward', focuses: ['Attack'], key: { finishing: 1, acceleration: 0.8, positioning: 0.8 }, desc: 'Plays on the shoulder of the last defender.', tags: ['runs', 'shoot'] },
    { name: 'Poacher', focuses: ['Attack'], key: { finishing: 1, positioning: 1, reactions: 0.6 }, desc: 'Lives in the box, feeding on chances.', tags: ['shoot', 'box'] },
    { name: 'False 9', focuses: ['Build-Up'], key: { vision: 1, shortPassing: 1, dribbling: 0.8 }, desc: 'Drops deep to link play.', tags: ['create', 'link'] },
    { name: 'Target Forward', focuses: ['Attack', 'Balanced'], key: { strength: 1, heading: 1, jumping: 0.6 }, desc: 'Holds up play and attacks crosses.', tags: ['aerial', 'link'] },
  ],
}
export const ROLE_GROUP: Record<Position, string> = {
  GK: 'GK', CB: 'CB', RB: 'FB', LB: 'FB', RWB: 'FB', LWB: 'FB', CDM: 'CDM', CM: 'CM', CAM: 'CAM', RM: 'WM', LM: 'WM',
  RW: 'W', LW: 'W', CF: 'ST', ST: 'ST',
}

export const DEFAULT_TACTICS: TeamTactics = {
  buildUp: 'Balanced', defApproach: 'Balanced', lineHeight: 55, width: 55, tempo: 55, pressing: 50,
  chanceCreation: 'Balanced', playersInBox: 5, corners: 'Balanced', freeKicks: 'Balanced', mentality: 'Balanced',
  timeWasting: false, offsideTrap: false,
}

export const VISION_TACTICS: Record<string, Partial<TeamTactics>> = {
  Possession: { buildUp: 'Short Passing', defApproach: 'High', lineHeight: 68, width: 58, tempo: 45, pressing: 65, chanceCreation: 'Possession' },
  Gegenpress: { buildUp: 'Balanced', defApproach: 'Aggressive', lineHeight: 75, width: 50, tempo: 72, pressing: 85, chanceCreation: 'Forward Runs' },
  'Counter-Attack': { buildUp: 'Counter', defApproach: 'Deep', lineHeight: 35, width: 52, tempo: 78, pressing: 40, chanceCreation: 'Direct Passing' },
  'Park the Bus': { buildUp: 'Long Ball', defApproach: 'Deep', lineHeight: 22, width: 38, tempo: 40, pressing: 25, chanceCreation: 'Direct Passing', playersInBox: 3 },
  Balanced: {},
  Direct: { buildUp: 'Long Ball', defApproach: 'Balanced', lineHeight: 50, width: 60, tempo: 70, pressing: 55, chanceCreation: 'Direct Passing', playersInBox: 7 },
  'Wing Play': { buildUp: 'Balanced', defApproach: 'Balanced', width: 80, chanceCreation: 'Forward Runs', playersInBox: 7 },
}

export const MENTALITIES = ['Ultra Defensive', 'Defensive', 'Balanced', 'Attacking', 'Ultra Attacking'] as const

export const TRAINING_PLANS: { id: TrainingPlan; energy: number; sharp: number; dev: number; desc: string }[] = [
  { id: 'All Out Energy', energy: 2.2, sharp: 0.2, dev: 0.4, desc: 'Maximum recovery. Minimal development and sharpness gains.' },
  { id: 'Energy Focused', energy: 1.5, sharp: 0.55, dev: 0.7, desc: 'Prioritises freshness for the next match.' },
  { id: 'Balanced', energy: 1.0, sharp: 1.0, dev: 1.0, desc: 'A healthy balance of recovery and improvement.' },
  { id: 'Performance Focused', energy: 0.6, sharp: 1.4, dev: 1.3, desc: 'Pushes sharpness and development at an energy cost.' },
  { id: 'All Out Performance', energy: 0.25, sharp: 1.8, dev: 1.6, desc: 'Maximum gains. Heavy fatigue and higher injury risk.' },
]

export const DEV_PLANS: { id: string; name: string; group: PosGroup | 'ANY'; attrs: AttrKey[]; desc: string }[] = [
  { id: 'balanced', name: 'Balanced', group: 'ANY', attrs: [], desc: 'Develops attributes that matter for the current position.' },
  { id: 'poacher', name: 'Poacher', group: 'ATT', attrs: ['finishing', 'positioning', 'reactions', 'composure', 'volleys'], desc: 'Clinical penalty-box finisher.' },
  { id: 'mobile-striker', name: 'Mobile Striker', group: 'ATT', attrs: ['acceleration', 'sprintSpeed', 'agility', 'dribbling', 'finishing'], desc: 'Quick, agile forward who runs the channels.' },
  { id: 'target-forward', name: 'Target Forward', group: 'ATT', attrs: ['heading', 'strength', 'jumping', 'finishing', 'shotPower'], desc: 'Physical presence who dominates in the air.' },
  { id: 'wide-forward', name: 'Wide Forward', group: 'ATT', attrs: ['dribbling', 'acceleration', 'finishing', 'crossing', 'agility'], desc: 'Explosive winger who attacks the box.' },
  { id: 'playmaker', name: 'Playmaker', group: 'MID', attrs: ['vision', 'shortPassing', 'longPassing', 'ballControl', 'curve'], desc: 'Creative hub who unlocks defences.' },
  { id: 'box-to-box', name: 'Box-to-Box', group: 'MID', attrs: ['stamina', 'shortPassing', 'standingTackle', 'longShots', 'interceptions'], desc: 'Tireless midfielder at both ends.' },
  { id: 'ball-winner', name: 'Ball Winning Midfielder', group: 'MID', attrs: ['standingTackle', 'interceptions', 'aggression', 'stamina', 'strength'], desc: 'Aggressive destroyer who wins it back.' },
  { id: 'dlp', name: 'Deep-Lying Playmaker', group: 'MID', attrs: ['longPassing', 'vision', 'shortPassing', 'composure', 'interceptions'], desc: 'Dictates tempo from deep positions.' },
  { id: 'attacking-fb', name: 'Attacking Fullback', group: 'DEF', attrs: ['crossing', 'sprintSpeed', 'stamina', 'dribbling', 'acceleration'], desc: 'Overlapping full-back who supplies width.' },
  { id: 'defensive-fb', name: 'Defensive Fullback', group: 'DEF', attrs: ['standingTackle', 'slidingTackle', 'defAwareness', 'interceptions', 'strength'], desc: 'Solid defender first, attacker second.' },
  { id: 'ball-playing-cb', name: 'Ball Playing Defender', group: 'DEF', attrs: ['shortPassing', 'longPassing', 'composure', 'defAwareness', 'ballControl'], desc: 'Composed centre-back who starts attacks.' },
  { id: 'stopper', name: 'Stopper', group: 'DEF', attrs: ['standingTackle', 'heading', 'strength', 'aggression', 'jumping'], desc: 'Dominant, aggressive central defender.' },
  { id: 'sweeper-keeper', name: 'Sweeper Keeper', group: 'GK', attrs: ['gkPositioning', 'gkKicking', 'sprintSpeed', 'reactions', 'gkReflexes'], desc: 'Keeper comfortable far off the line.' },
  { id: 'shot-stopper', name: 'Shot Stopper', group: 'GK', attrs: ['gkReflexes', 'gkDiving', 'gkHandling', 'gkPositioning', 'reactions'], desc: 'Traditional keeper built on reflexes.' },
]

export const PLAYSTYLE_INFO: Record<string, { cat: string; desc: string }> = {
  'Finesse shot': { cat: 'Shooting', desc: 'Curls placed shots into the corners with extra accuracy.' },
  'Power shot': { cat: 'Shooting', desc: 'Strikes powerful shots from range.' },
  'Chip shot': { cat: 'Shooting', desc: 'Delicate chips over advancing goalkeepers.' },
  'Dead ball': { cat: 'Shooting', desc: 'Specialist from free kicks and corners.' },
  'Precision header': { cat: 'Shooting', desc: 'Accurate, powerful headers on goal.' },
  'Low driven shot': { cat: 'Shooting', desc: 'Drives low, hard shots under the goalkeeper.' },
  'Acrobatic': { cat: 'Shooting', desc: 'Scissor kicks and volleys with exceptional accuracy.' },
  'Gamechanger': { cat: 'Shooting', desc: 'Produces trivela and outside-foot moments of magic.' },
  'Incisive pass': { cat: 'Passing', desc: 'Threads defence-splitting through balls.' },
  'Pinged pass': { cat: 'Passing', desc: 'Fast, driven passes that break lines.' },
  'Long ball pass': { cat: 'Passing', desc: 'Accurate lofted passes over long distances.' },
  'Tiki taka': { cat: 'Passing', desc: 'Quick one-touch passing combinations.' },
  'Whipped pass': { cat: 'Passing', desc: 'Dangerous whipped crosses from wide.' },
  'Inventive': { cat: 'Passing', desc: 'Creative passes that others would not see.' },
  'First touch': { cat: 'Ball Control', desc: 'Superb first touch under pressure.' },
  'Flair': { cat: 'Ball Control', desc: 'Flamboyant flicks and trick passes.' },
  'Press proven': { cat: 'Ball Control', desc: 'Keeps the ball calmly under intense pressure.' },
  'Rapid': { cat: 'Ball Control', desc: 'Accelerates past defenders with the ball.' },
  'Technical': { cat: 'Ball Control', desc: 'Precise close control in tight spaces.' },
  'Trickster': { cat: 'Ball Control', desc: 'Beats defenders with skill moves.' },
  'Quick step': { cat: 'Physical', desc: 'Explosive first steps over short distances.' },
  'Relentless': { cat: 'Physical', desc: 'Recovers stamina quickly and runs all day.' },
  'Long throw': { cat: 'Physical', desc: 'Launches long throw-ins into the box.' },
  'Bruiser': { cat: 'Physical', desc: 'Physically dominates duels.' },
  'Enforcer': { cat: 'Physical', desc: 'Uses strength to win physical battles.' },
  'Aerial fortress': { cat: 'Defending', desc: 'Commands the air in both boxes.' },
  'Anticipate': { cat: 'Defending', desc: 'Reads the play to win the ball cleanly.' },
  'Block': { cat: 'Defending', desc: 'Throws body in the way of shots.' },
  'Intercept': { cat: 'Defending', desc: 'Cuts out passes with exceptional awareness.' },
  'Jockey': { cat: 'Defending', desc: 'Contains attackers with patient defending.' },
  'Slide tackle': { cat: 'Defending', desc: 'Well-timed sliding challenges.' },
  'Far reach': { cat: 'Goalkeeping', desc: 'Covers more of the goal when diving.' },
  'Footwork': { cat: 'Goalkeeping', desc: 'Quick feet to make reaction saves.' },
  'Cross claimer': { cat: 'Goalkeeping', desc: 'Comes to claim crosses confidently.' },
  'Rush out': { cat: 'Goalkeeping', desc: 'Rushes out to smother one-on-ones.' },
  'Far throw': { cat: 'Goalkeeping', desc: 'Starts counter attacks with long throws.' },
  'Deflector': { cat: 'Goalkeeping', desc: 'Parries shots into safe areas.' },
  'One club player': { cat: 'Special', desc: 'Deep loyalty to their club.' },
  'Injury prone': { cat: 'Special', desc: 'More susceptible to injuries.' },
  'Solid player': { cat: 'Special', desc: 'Rarely suffers injuries.' },
}

export const INJURIES: { type: string; min: number; max: number; weight: number; sev: 'Minor' | 'Moderate' | 'Serious' | 'Severe' }[] = [
  { type: 'Bruised Thigh', min: 2, max: 7, weight: 12, sev: 'Minor' },
  { type: 'Ankle Knock', min: 3, max: 8, weight: 12, sev: 'Minor' },
  { type: 'Calf Strain', min: 8, max: 21, weight: 10, sev: 'Moderate' },
  { type: 'Hamstring Strain', min: 14, max: 35, weight: 12, sev: 'Moderate' },
  { type: 'Groin Strain', min: 10, max: 25, weight: 8, sev: 'Moderate' },
  { type: 'Twisted Ankle', min: 7, max: 21, weight: 9, sev: 'Moderate' },
  { type: 'Knee Sprain', min: 20, max: 45, weight: 6, sev: 'Serious' },
  { type: 'Thigh Muscle Tear', min: 28, max: 56, weight: 5, sev: 'Serious' },
  { type: 'Broken Metatarsal', min: 42, max: 84, weight: 3, sev: 'Serious' },
  { type: 'Concussion', min: 7, max: 14, weight: 3, sev: 'Moderate' },
  { type: 'Back Spasm', min: 4, max: 12, weight: 6, sev: 'Minor' },
  { type: 'Shoulder Dislocation', min: 21, max: 42, weight: 2, sev: 'Serious' },
  { type: 'Achilles Tendinitis', min: 21, max: 60, weight: 2, sev: 'Serious' },
  { type: 'ACL Rupture', min: 180, max: 270, weight: 1, sev: 'Severe' },
  { type: 'Fractured Leg', min: 120, max: 200, weight: 0.5, sev: 'Severe' },
  { type: 'Illness', min: 2, max: 6, weight: 7, sev: 'Minor' },
]

export const SQUAD_ROLES = ['Crucial', 'Important', 'Rotation', 'Sparingly', 'Prospect'] as const
export const ROLE_EXPECTED_SHARE: Record<string, number> = { Crucial: 0.85, Important: 0.65, Rotation: 0.4, Sparingly: 0.18, Prospect: 0.08 }

export const attrIndex = (k: AttrKey) => A[k]

/** Substitutes named on a team sheet. (Five may come on, in three windows; that rule lives in the match engine.) */
export const BENCH_SIZE = 10
