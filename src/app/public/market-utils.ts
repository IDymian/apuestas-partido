import { Market, PublicMatchData } from '../core/models';
import { makeSelectionLabel, teamOrder, toTimelineEvents } from '../domain/adapt';
import { league, League, marketOpen } from '../domain/league';
import { numberMaxOption } from '../domain/settlement';

export interface Choice {
  selection: string;
  label: string;
  /** Texto corto para botones 1 / X / 2. */
  short?: string;
}

export type MarketState = { open: boolean; reason: string | null };

/** Liga de la jornada (partido actual, en vivo y marcadores). */
export function leagueOf(d: PublicMatchData): League {
  return league(toTimelineEvents(d.events), teamOrder(d.teams), d.match.current_game ?? 1, d.match.status === 'finished', !!d.match.game_live);
}

/** ¿Qué mercados reciben apuestas ahora? (misma regla que la base de datos) */
export function marketStates(d: PublicMatchData, lg: League): Map<string, MarketState> {
  const open = d.match.status === 'open';
  return new Map(d.markets.map((m) => [m.id, marketOpen(m, lg, open)]));
}

export type Labeler = ReturnType<typeof makeSelectionLabel>;

/** Opciones de un mercado: jugadores (nombre completo), equipos, 1/X/2 o números. */
export function choicesFor(m: Market, d: PublicMatchData, label: Labeler): Choice[] {
  if (m.type === 'game_winner') {
    return [
      { selection: '1', label: label('number', '1', m.type, m.param), short: '1' },
      { selection: '0', label: 'Empate', short: 'X' },
      { selection: '2', label: label('number', '2', m.type, m.param), short: '2' },
    ];
  }
  if (m.target === 'team') {
    return [...d.teams].sort((a, b) => a.sort_order - b.sort_order).map((t) => ({ selection: t.id, label: t.name }));
  }
  if (m.target === 'number') {
    const min = m.option_min ?? 1;
    const max = m.option_max ?? numberMaxOption(m.type);
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const n = min + i;
      return { selection: String(n), label: n === max ? `${n}+` : String(n) };
    });
  }
  const players = d.players
    .filter((p) => !p.is_own_goal)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ selection: p.id, label: p.name }));
  const og = d.players.find((p) => p.is_own_goal);
  return m.allows_own_goal && og ? [...players, { selection: og.id, label: '🙈 Autogol' }] : players;
}

/** Bote de cada mercado y lo apostado a cada opción (céntimos, solo apuestas aprobadas). */
export function potsOf(d: PublicMatchData): Map<string, { pot: number; bySel: Map<string, number> }> {
  const map = new Map<string, { pot: number; bySel: Map<string, number> }>();
  for (const m of d.markets) map.set(m.id, { pot: Math.round(Number(m.initial_pot || 0) * 100), bySel: new Map() });
  for (const b of d.bets) {
    const e = map.get(b.market_id);
    if (!e) continue;
    const sel = b.player_id ?? b.team_id ?? String(b.option_value);
    e.pot += b.amount * 100;
    e.bySel.set(sel, (e.bySel.get(sel) ?? 0) + b.amount * 100);
  }
  return map;
}

/**
 * "Cuota" estimada de bote compartido: cuánto multiplicarías lo apostado si
 * ganara esa opción con los botes de ahora (bote ÷ apostado a esa opción).
 */
export function oddsOf(pots: ReturnType<typeof potsOf>, marketId: string, selection: string): string {
  const e = pots.get(marketId);
  const on = e?.bySel.get(selection) ?? 0;
  if (!e || on === 0) return '—';
  return (e.pot / on).toFixed(2);
}

/** Ícono de cada mercado. */
export const MARKET_ICON: Record<string, string> = {
  first_goal: '⚽', last_goal: '🏁', top_scorer: '👟', first_to_n_goals: '🎯', nth_goal: '🔢',
  best_team: '🏆', worst_team: '🐢', top_scoring_team: '💥', most_conceded_team: '🥅', game_winner: '🆚', game_first_goal: '⚽',
  most_wins: '👑', longest_streak: '🔥', most_exits: '🚪',
  first_yellow: '🟨', last_yellow: '🟨', most_yellows: '😤', first_red: '🟥',
  first_blooper: '🤦', first_penalty_conceded: '🚨', first_penalty_missed: '🙅', first_post: '🥅',
  first_golazo: '✨', first_dive: '🏊', total_posts: '🧮', first_own_goal: '🙈', first_nutmeg_victim: '🥜',
};
