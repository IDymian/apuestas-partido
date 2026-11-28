/** Insignias de la Copa (glosario: "qué lechero", "qué piña", "quedaste como Donatello"). */
export type Badge = 'lechero' | 'pina' | 'donatello';

export const BADGE_META: Record<Badge, { emoji: string; label: string }> = {
  lechero: { emoji: '🥛', label: 'Qué lechero' },
  pina: { emoji: '🍍', label: 'Qué piña' },
  donatello: { emoji: '🐢', label: 'Quedó como Donatello' },
};

/**
 * Insignia de cada jugador en la jornada (una sola, la más fuerte):
 * lechero = 2+ goles · piña = palo, penal fallado o autogol · Donatello = blooper o le hicieron huacha.
 */
export function playerBadges(events: { type: string; player_id: string | null; is_own_goal: boolean }[]): Map<string, Badge> {
  const goals = new Map<string, number>();
  const pina = new Set<string>();
  const dona = new Set<string>();
  for (const e of events) {
    if (!e.player_id) continue;
    if (e.type === 'goal' && !e.is_own_goal) goals.set(e.player_id, (goals.get(e.player_id) ?? 0) + 1);
    else if (e.type === 'post' || e.type === 'penalty_miss' || (e.type === 'goal' && e.is_own_goal)) pina.add(e.player_id);
    else if (e.type === 'blooper' || e.type === 'nutmeg') dona.add(e.player_id);
  }
  const out = new Map<string, Badge>();
  for (const id of dona) out.set(id, 'donatello');
  for (const id of pina) out.set(id, 'pina');
  for (const [id, n] of goals) if (n >= 2) out.set(id, 'lechero');
  return out;
}

/**
 * Vitrina del apostador según sus tickets resueltos: lechero = 2+ apuestas ganadas ·
 * piña = 2+ perdidas · Donatello = perdió todas las resueltas (al menos una).
 */
export function bettorBadges(results: ('won' | 'lost')[]): Badge[] {
  const won = results.filter((r) => r === 'won').length;
  const lost = results.length - won;
  const out: Badge[] = [];
  if (won >= 2) out.push('lechero');
  if (lost >= 2) out.push('pina');
  if (lost > 0 && won === 0) out.push('donatello');
  return out;
}
