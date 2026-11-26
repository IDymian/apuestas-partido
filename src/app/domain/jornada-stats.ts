import { TimelineEvent } from './timeline';

export interface PlayerCount {
  playerId: string;
  count: number;
}

export interface JornadaStats {
  /** Todos los goles de la noche (autogoles incluidos). */
  totalGoals: number;
  scorers: PlayerCount[];
  yellows: PlayerCount[];
  ownGoals: PlayerCount[];
  nutmegVictims: PlayerCount[];
  /** Próximo "gol número N" de los mercados activos, si queda alguno. */
  nextMilestone: { n: number; remaining: number } | null;
}

function tally(events: TimelineEvent[]): PlayerCount[] {
  const map = new Map<string, { count: number; first: number }>();
  events.forEach((e, i) => {
    if (!e.playerId) return;
    const cur = map.get(e.playerId) ?? { count: 0, first: i };
    cur.count++;
    cur.first = i; // momento en que llegó a su cantidad actual
    map.set(e.playerId, cur);
  });
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .map(([playerId, v]) => ({ playerId, count: v.count }));
}

/** Estadísticas de la jornada para la pantalla pública y el admin. `events` ordenados. */
export function jornadaStats(events: TimelineEvent[], nthGoalParams: number[] = []): JornadaStats {
  const goals = events.filter((e) => e.type === 'goal');
  const totalGoals = goals.length;
  const next = [...nthGoalParams].sort((a, b) => a - b).find((n) => n > totalGoals);
  return {
    totalGoals,
    scorers: tally(goals.filter((e) => !e.isOwnGoal)),
    yellows: tally(events.filter((e) => e.type === 'yellow')),
    ownGoals: tally(goals.filter((e) => e.isOwnGoal)),
    nutmegVictims: tally(events.filter((e) => e.type === 'nutmeg')),
    nextMilestone: next ? { n: next, remaining: next - totalGoals } : null,
  };
}
