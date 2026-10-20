// Club reputation (1–99): how big a club is in the football world. Two things make it: what the club is now (the
// strength of its squad and the league it plays in) and what it has been (its stature: history, support, standing in
// Europe). Every club is ranked on the two together and the ranking is laid onto one curve: most of the world keeps
// the values the old squad-and-league formula gave it, while the top tenth spreads out smoothly towards 99 instead of
// piling up at a cap (that formula put two dozen clubs, the whole Premier League included, on a perfect 100).
import type { World } from '../../domain/types'
import { clamp } from '../../domain/rng'

/** Historic stature, 1–10, of the clubs whose name carries more (or less) than their current squad. */
const STATURE: Record<string, number> = {
  'Real Madrid': 10, 'FC Barcelona': 10, 'Manchester United': 10, 'FC Bayern München': 10, 'Liverpool': 10,
  'Juventus': 9.5, 'AC Milan': 9.5,
  'Inter': 9, 'Arsenal': 9, 'Chelsea': 9, 'Manchester City': 9, 'Paris Saint-Germain': 9,
  'Atlético de Madrid': 8.5, 'Borussia Dortmund': 8.5, 'AFC Ajax': 8.5, 'SL Benfica': 8.5,
  'FC Porto': 8, 'Tottenham Hotspur': 8, 'Boca Juniors': 8, 'River Plate': 8, 'Flamengo': 8,
  'Celtic': 7.5, 'Rangers': 7.5, 'AS Roma': 7.5, 'SSC Napoli': 7.5, 'Olympique de Marseille': 7.5, 'Galatasaray': 7.5,
  'Sporting CP': 7.5, 'PSV': 7.5, 'Feyenoord': 7.5, 'Newcastle United': 7.5, 'Aston Villa': 7.5, 'Palmeiras': 7.5,
  'Corinthians': 7.5, 'São Paulo FC': 7.5, 'Santos FC': 7.5, 'Club América': 7.5,
  'Fenerbahçe': 7, 'Sevilla FC': 7, 'Valencia CF': 7, 'SS Lazio': 7, 'FC Schalke 04': 7, 'Everton': 7, 'Olympique Lyonnais': 7,
  'Beşiktaş': 7, 'Athletic Club': 7, 'Bayer 04 Leverkusen': 7, 'ACF Fiorentina': 7, 'Al Hilal': 7, 'Olympiacos': 7,
  'Red Star FC': 7, 'RSC Anderlecht': 7, 'Borussia Mönchengladbach': 7, 'Racing Club': 7, 'Peñarol': 7, 'Nacional': 7,
  'Grêmio': 7, 'Atlético Mineiro': 7, 'Cruzeiro': 7, 'Fluminense': 7, 'Botafogo': 7, 'Vasco da Gama': 7,
  'C.D. Guadalajara': 7, 'Inter Miami CF': 7, 'Al Nassr': 7,
  'Club Brugge': 6.5, 'Hamburger SV': 6.5, 'SV Werder Bremen': 6.5, 'West Ham United': 6.5, 'Leeds United': 6.5,
  'Nottingham Forest': 6.5, 'Independiente': 6.5, 'Cruz Azul': 6.5, 'Tigres UANL': 6.5, 'C.F. Monterrey': 6.5, 'LA Galaxy': 6.5,
  'Al Ittihad': 6.5, 'Al Ahli': 6.5, 'Shakhtar Donetsk': 6.5, 'Dynamo Kyiv': 6.5, 'Dinamo Zagreb': 6.5, 'Real Betis': 6.5,
  'Villarreal CF': 6.5, 'RB Leipzig': 6.5, 'Atalanta': 6.5, 'Eintracht Frankfurt': 6.5, 'VfB Stuttgart': 6.5, 'AS Monaco': 6.5,
  'Real Sociedad': 6.5,
  'FC Red Bull Salzburg': 6, 'FC Basel 1893': 6, 'FC København': 6, 'Panathinaikos': 6, 'PAOK': 6, 'Trabzonspor': 6,
  '1. FC Köln': 6, 'Torino FC': 6, 'Bologna FC 1909': 6, 'Parma Calcio 1913': 6, 'AS Saint-Étienne': 6, 'LOSC Lille': 6,
  'Hertha BSC': 6, 'VfL Wolfsburg': 6, 'RC Deportivo': 6, 'Sunderland': 6, 'Wolverhampton Wanderers': 6, 'Leicester City': 6,
  'Pumas UNAM': 6,
  'UC Sampdoria': 5.5, 'Genoa CFC': 5.5, 'FC Nantes': 5.5, '1. FC Nürnberg': 5.5, '1. FC Kaiserslautern': 5.5, 'RCD Espanyol': 5.5,
  'RC Celta': 5.5, 'Southampton': 5.5, 'Blackburn Rovers': 5.5, 'Derby County': 5.5, 'Crystal Palace': 5.5, 'Fulham': 5.5,
  'Brighton & Hove Albion': 5.5, 'Seattle Sounders FC': 5.5, 'Atlanta United': 5.5, 'LAFC': 5.5, 'Deportivo Toluca': 5.5,
  'Ipswich Town': 5, 'Santos Laguna': 5,
  'AFC Bournemouth': 4.5, 'Brentford': 4.5,
}

export interface RepInput { id: number; names: string[]; squadAvg: number; leaguePrestige?: number; capacity: number; inLeague: boolean }

/** The old formula: squad strength and league, unclamped. Still the backbone of "what the club is now". */
const sporting = (c: RepInput) => c.squadAvg * 1.9 - 72 + (c.leaguePrestige ?? 4) * 2.2

/** Stature on the same scale: from the table for clubs whose name means more (or less), else read from the club. */
function stature(c: RepInput) {
  const s = c.names.map((n) => STATURE[n]).find((x) => x != null)
  if (s != null) return 40 + s * 7.5
  // no record of a bigger past: its squad as if in an average league (the league already counts in what it is now),
  // a little more or less for the size of its following (a 5,000 to a 90,000 stadium)
  const cap = clamp((Math.log10(Math.max(1000, c.capacity || 8000)) - Math.log10(5000)) / (Math.log10(90000) - Math.log10(5000)), 0, 1)
  return c.squadAvg * 1.9 - 72 + 4 * 2.2 + (cap - 0.5) * 12 - 2
}

/** Reputation for every club, ranked together and laid onto the curve. */
export function computeReputations(clubs: RepInput[]): Map<number, number> {
  const rows = clubs.map((c) => { const now = sporting(c); return { c, now, x: 0.5 * now + 0.5 * stature(c) } })
  const league = rows.filter((r) => r.c.inLeague)
  // the curve: the old formula's own spread, highest first (the shape the rest of the game is balanced on)
  const curve = league.map((r) => clamp(r.now, 5, 100)).sort((a, b) => b - a)
  const ranked = [...league].sort((a, b) => b.x - a.x)
  const n = Math.max(2, ranked.length)
  const cut = Math.floor((n - 1) * 0.1)
  const at = (rank: number) => {
    const p = rank / (n - 1)
    if (rank >= cut) return curve[Math.min(curve.length - 1, rank)]
    // the top tenth: from the edge of the old spread up to 99, the biggest clubs clearly apart
    return 99 - (99 - curve[cut]) * Math.pow(p / 0.1, 0.75)
  }
  const out = new Map<number, number>()
  ranked.forEach((r, i) => out.set(r.c.id, Math.round(clamp(at(i), 5, 99))))
  // clubs outside the leagues: placed among them by the same measure
  const xs = ranked.map((r) => r.x)
  for (const r of rows) {
    if (r.c.inLeague) continue
    let i = xs.findIndex((x) => x <= r.x)
    if (i < 0) i = xs.length - 1
    out.set(r.c.id, Math.round(clamp(at(i), 5, 99)))
  }
  return out
}

/** Recalculate a world's club reputations from where each club stands today. */
export function rebuildReputations(w: World) {
  const clubs = Object.values(w.clubs).filter((c) => !c.national)
  const rep = computeReputations(clubs.map((c) => ({ id: c.id, names: [c.name, c.dbName].filter(Boolean) as string[], squadAvg: c.squadAvg, leaguePrestige: w.leagues[c.leagueId]?.prestige, capacity: c.capacity, inLeague: !!c.leagueId })))
  for (const c of clubs) { const r = rep.get(c.id); if (r != null) c.reputation = r }
}

/** A season's finish moves reputation a little; near the top every step up is harder to take. */
export function seasonReputation(rep: number, pos: number, size: number): number {
  if (pos < 3) return Math.min(99, Math.round(rep + 2 * Math.min(1, Math.max(0, 99 - rep) / 8)))
  if (pos >= size - 3) return Math.max(5, rep - 2)
  return rep
}
