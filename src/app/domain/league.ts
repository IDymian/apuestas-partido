/**
 * Liga todos contra todos de la Copa Álvaro.
 *
 * 4 equipos, 6 partidos que se juegan uno por uno en este orden:
 *   1) E1 vs E2   2) E3 vs E4   3) E1 vs E3   4) E2 vs E4   5) E1 vs E4   6) E2 vs E3
 * Cada gol se registra con el número de partido y el equipo al que le cuenta.
 * Tabla: 3 puntos por ganar, 1 por empatar. Desempate: diferencia de gol,
 * goles a favor y, al final, el orden de los equipos.
 *
 * Función pura: la usan los resolvers, la pantalla pública y el admin.
 */
import { TimelineEvent } from './timeline';

/** Índices (en el orden de los equipos) de cada partido, para 4 equipos. */
const FIXTURE_4: [number, number][] = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];

export interface FixtureGame {
  /** 1, 2, 3… */
  number: number;
  home: string;
  away: string;
}

/** Fixture de la jornada a partir del orden de los equipos. */
export function fixture(teamIds: string[]): FixtureGame[] {
  if (teamIds.length === 4) return FIXTURE_4.map(([h, a], i) => ({ number: i + 1, home: teamIds[h], away: teamIds[a] }));
  // Otro número de equipos: todos contra todos en orden simple.
  const out: FixtureGame[] = [];
  for (let i = 0; i < teamIds.length; i++) for (let j = i + 1; j < teamIds.length; j++) out.push({ number: out.length + 1, home: teamIds[i], away: teamIds[j] });
  return out;
}

export type GameStatus = 'pending' | 'live' | 'played';

export interface LeagueGame extends FixtureGame {
  status: GameStatus;
  homeGoals: number;
  awayGoals: number;
  /** Goles de este partido en orden. */
  goalEventIds: string[];
}

export interface Standing {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface League {
  games: LeagueGame[];
  /** Tabla ordenada (incluye el partido en juego, en vivo). */
  table: Standing[];
  currentGame: number;
  /** Goles sin partido o con un equipo que no juega ese partido: se ignoran. */
  invalidEventIds: string[];
}

const cmp = (a: Standing, b: Standing) => b.points - a.points || b.gd - a.gd || b.gf - a.gf;

/**
 * @param currentGame partido actual (los anteriores ya terminaron; mayor que el último = todos terminados).
 * @param finished true si la jornada terminó (el partido actual también cuenta como jugado).
 * @param live true si el partido actual está en vivo (si no, todavía no empieza).
 */
export function league(events: TimelineEvent[], teamIds: string[], currentGame: number, finished: boolean, live = true): League {
  const fx = fixture(teamIds);
  const invalid: string[] = [];
  const games: LeagueGame[] = fx.map((g) => ({
    ...g,
    status:
      g.number < currentGame || (g.number === currentGame && finished) ? 'played' : g.number === currentGame && live ? 'live' : 'pending',
    homeGoals: 0,
    awayGoals: 0,
    goalEventIds: [],
  }));
  const byNumber = new Map(games.map((g) => [g.number, g]));

  for (const e of events) {
    if (e.type !== 'goal') continue;
    const g = e.game != null ? byNumber.get(e.game) : undefined;
    if (!g || g.status === 'pending' || (e.teamId !== g.home && e.teamId !== g.away)) {
      invalid.push(e.id);
      continue;
    }
    if (e.teamId === g.home) g.homeGoals++;
    else g.awayGoals++;
    g.goalEventIds.push(e.id);
  }

  const rows = new Map<string, Standing>(
    teamIds.map((t) => [t, { teamId: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }]),
  );
  for (const g of games) {
    if (g.status === 'pending') continue;
    const h = rows.get(g.home)!;
    const a = rows.get(g.away)!;
    h.played++;
    a.played++;
    h.gf += g.homeGoals;
    h.ga += g.awayGoals;
    a.gf += g.awayGoals;
    a.ga += g.homeGoals;
    if (g.homeGoals > g.awayGoals) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (g.homeGoals < g.awayGoals) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  const order = new Map(teamIds.map((t, i) => [t, i]));
  const table = [...rows.values()].sort((a, b) => cmp(a, b) || order.get(a.teamId)! - order.get(b.teamId)!);

  return { games, table, currentGame, invalidEventIds: invalid };
}

/** El partido en vivo, si hay. */
export function liveGame(l: League): LeagueGame | null {
  return l.games.find((g) => g.status === 'live') ?? null;
}

/** ¿Ya empezó algún partido? (las apuestas de toda la liga se cierran). */
export function leagueStarted(l: League): boolean {
  return l.games.some((g) => g.status !== 'pending');
}

/**
 * ¿Se puede apostar a este mercado ahora? Igual que la validación de submit_ticket:
 *  - Por partido: hasta que termina (en vivo se puede, salvo "primer gol" si ya hubo gol).
 *  - De toda la liga: solo antes de que empiece el primer partido.
 */
export function marketOpen(m: { type: string; param: number | null; section?: string }, l: League, jornadaOpen: boolean): { open: boolean; reason: string | null } {
  if (!jornadaOpen) return { open: false, reason: 'Apuestas cerradas' };
  if (m.type === 'game_winner' || m.type === 'game_first_goal') {
    const g = l.games.find((x) => x.number === m.param);
    if (!g) return { open: false, reason: 'Partido no encontrado' };
    if (g.status === 'played') return { open: false, reason: 'Finalizado' };
    if (g.status === 'live' && m.type === 'game_first_goal' && g.goalEventIds.length) return { open: false, reason: 'Ya hubo gol' };
    return { open: true, reason: null };
  }
  return leagueStarted(l) ? { open: false, reason: 'La liga ya empezó' } : { open: true, reason: null };
}

/** Primero de la tabla, si nadie lo iguala en puntos, diferencia y goles. */
export function champion(l: League): string | null {
  const [a, b] = l.table;
  if (!a || a.played === 0) return null;
  return !b || cmp(a, b) < 0 ? a.teamId : null;
}

/** Último de la tabla, si nadie lo iguala. */
export function lastPlace(l: League): string | null {
  const t = l.table;
  const z = t.at(-1);
  const y = t.at(-2);
  if (!z || z.played === 0) return null;
  return !y || cmp(y, z) < 0 ? z.teamId : null;
}

/** Equipo con más (o menos) de algo, si no hay empate. */
export function uniqueMax(l: League, key: 'gf' | 'ga'): string | null {
  const rows = l.table.filter((r) => r.played > 0);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r[key]));
  const top = rows.filter((r) => r[key] === max);
  return top.length === 1 ? top[0].teamId : null;
}
