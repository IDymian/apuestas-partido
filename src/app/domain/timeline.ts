/**
 * Línea de tiempo de la cancha en una jornada de triangulares.
 *
 * Dos equipos en cancha y el resto esperando en cola. Cada partidito es a un
 * gol: el que recibe el gol sale (va al final de la cola) y entra el primero
 * de la cola. Una "rotación" saca a un equipo sin gol: no cuenta como
 * partidito ganado ni como salida, pero corta la racha del que sale.
 *
 * Función pura: la usan los resolvers, la pantalla pública y el admin.
 */

export type EventKind = 'goal' | 'yellow' | 'nutmeg' | 'rotation';

export interface TimelineEvent {
  id: string;
  type: EventKind;
  /** Goleador real (también en autogol), amonestado o víctima de la huacha. */
  playerId: string | null;
  /** Gol: equipo al que le cuenta. */
  teamId: string | null;
  isOwnGoal: boolean;
  /** Rotación: equipo que sale. */
  teamOutId: string | null;
  minute: number;
  /** Orden de registro; desempata eventos del mismo minuto. */
  seq: number;
}

export interface TeamStats {
  wins: number;
  exits: number;
  currentStreak: number;
  maxStreak: number;
}

export interface CourtGame {
  /** Número de partidito (1, 2, 3…). */
  number: number;
  eventId: string;
  winnerTeamId: string;
  loserTeamId: string;
  enteringTeamId: string;
}

export interface CourtTimeline {
  teamIds: string[];
  /** Estado actual. */
  onCourt: [string, string];
  waiting: string[];
  games: CourtGame[];
  stats: Record<string, TeamStats>;
  /** Mayor racha de partiditos seguidos ganados por cualquier equipo. */
  maxStreak: number;
  /** Equipos en cancha justo ANTES de cada evento (para el admin). */
  courtAt: Record<string, [string, string]>;
  /** Goles o rotaciones con un equipo que no estaba en cancha: se ignoran. */
  invalidEventIds: string[];
  /** Quién ganó más partiditos (empate: el que llegó primero). */
  mostWinsTeamId: string | null;
  /** Quién salió más veces por gol (empate: el que llegó primero). */
  mostExitsTeamId: string | null;
}

export function compareEvents(a: { minute: number; seq: number }, b: { minute: number; seq: number }): number {
  return a.minute - b.minute || a.seq - b.seq;
}

export function sortEvents<T extends { minute: number; seq: number }>(events: T[]): T[] {
  return [...events].sort(compareEvents);
}

/**
 * Líder de un conteo; si hay empate gana el que llegó primero a esa cantidad.
 * `keys` es la secuencia en orden cronológico (una entrada por ocurrencia).
 */
export function leaderFirstToReach(keys: string[]): string | null {
  const count = new Map<string, number>();
  const reachedAt = new Map<string, number>();
  keys.forEach((k, i) => {
    count.set(k, (count.get(k) ?? 0) + 1);
    reachedAt.set(k, i);
  });
  let best: string | null = null;
  for (const [k, c] of count) {
    if (best === null) {
      best = k;
      continue;
    }
    const bc = count.get(best)!;
    if (c > bc || (c === bc && reachedAt.get(k)! < reachedAt.get(best)!)) best = k;
  }
  return best;
}

export function courtTimeline(events: TimelineEvent[], teamIds: string[], startingTeamIds: string[]): CourtTimeline {
  if (teamIds.length < 2) throw new Error('Se necesitan al menos 2 equipos');
  const start =
    startingTeamIds.length === 2 &&
    startingTeamIds[0] !== startingTeamIds[1] &&
    startingTeamIds.every((t) => teamIds.includes(t))
      ? startingTeamIds
      : teamIds.slice(0, 2);

  let onCourt: [string, string] = [start[0], start[1]];
  const waiting = teamIds.filter((t) => !onCourt.includes(t));
  const stats: Record<string, TeamStats> = Object.fromEntries(
    teamIds.map((t) => [t, { wins: 0, exits: 0, currentStreak: 0, maxStreak: 0 }]),
  );
  const games: CourtGame[] = [];
  const courtAt: Record<string, [string, string]> = {};
  const invalid: string[] = [];
  const winKeys: string[] = [];
  const exitKeys: string[] = [];
  let maxStreak = 0;

  /** Saca a `out` de la cancha y entra el primero de la cola. */
  const swapOut = (out: string): string => {
    if (waiting.length === 0) return out; // con 2 equipos vuelve a entrar el mismo
    const entering = waiting.shift()!;
    waiting.push(out);
    onCourt = onCourt[0] === out ? [entering, onCourt[1]] : [onCourt[0], entering];
    return entering;
  };

  for (const e of sortEvents(events)) {
    courtAt[e.id] = [...onCourt] as [string, string];

    if (e.type === 'goal') {
      if (!e.teamId || !onCourt.includes(e.teamId)) {
        invalid.push(e.id);
        continue;
      }
      const winner = e.teamId;
      const loser = onCourt[0] === winner ? onCourt[1] : onCourt[0];
      stats[winner].wins++;
      stats[winner].currentStreak++;
      stats[winner].maxStreak = Math.max(stats[winner].maxStreak, stats[winner].currentStreak);
      maxStreak = Math.max(maxStreak, stats[winner].currentStreak);
      stats[loser].exits++;
      stats[loser].currentStreak = 0;
      winKeys.push(winner);
      exitKeys.push(loser);
      const entering = swapOut(loser);
      games.push({ number: games.length + 1, eventId: e.id, winnerTeamId: winner, loserTeamId: loser, enteringTeamId: entering });
    } else if (e.type === 'rotation') {
      if (!e.teamOutId || !onCourt.includes(e.teamOutId)) {
        invalid.push(e.id);
        continue;
      }
      stats[e.teamOutId].currentStreak = 0;
      swapOut(e.teamOutId);
    }
  }

  return {
    teamIds,
    onCourt,
    waiting: [...waiting],
    games,
    stats,
    maxStreak,
    courtAt,
    invalidEventIds: invalid,
    mostWinsTeamId: leaderFirstToReach(winKeys),
    mostExitsTeamId: leaderFirstToReach(exitKeys),
  };
}
