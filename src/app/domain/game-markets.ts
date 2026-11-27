/**
 * Apuestas de cada partido de la liga (además de las generales de la jornada).
 * El mismo catálogo está en la migración SQL (copa_extra_markets y submit_ticket).
 *
 *  - winner:    ganador (1 = primer equipo, 0 = empate, 2 = segundo equipo)
 *  - goals:     cuántos goles hubo en el partido (0 a 5+)
 *  - first:     primer jugador con ese evento en el partido
 *  - last_goal: el que mete el último gol del partido
 *  - has:       ¿pasó en el partido? (1 = Sí, 0 = No)
 */
import { EventKind } from './timeline';

export type GameMarketKind = 'winner' | 'goals' | 'first' | 'last_goal' | 'has';
export type GameMarketGroup = 'resultado' | 'goles' | 'tarjetas' | 'show' | 'si_no';

export interface GameMarketDef {
  type: string;
  /** Nombre corto (dentro del partido). */
  label: string;
  kind: GameMarketKind;
  group: GameMarketGroup;
  target: 'player' | 'number';
  /** Evento que lo decide. "own_goal" = gol con autogol. */
  event?: EventKind | 'own_goal';
  /** Se puede apostar a la opción "Autogol". */
  allowsOwnGoal?: boolean;
}

export const GAME_MARKETS: GameMarketDef[] = [
  { type: 'game_winner', label: 'Ganador', kind: 'winner', group: 'resultado', target: 'number' },
  { type: 'game_goals', label: 'Goles en el partido', kind: 'goals', group: 'resultado', target: 'number' },
  { type: 'game_first_goal', label: 'Primer gol', kind: 'first', event: 'goal', group: 'goles', target: 'player', allowsOwnGoal: true },
  { type: 'game_last_goal', label: 'Último gol', kind: 'last_goal', event: 'goal', group: 'goles', target: 'player', allowsOwnGoal: true },
  { type: 'game_first_own_goal', label: 'Primer autogol', kind: 'first', event: 'own_goal', group: 'goles', target: 'player' },
  { type: 'game_first_yellow', label: 'Primera amarilla', kind: 'first', event: 'yellow', group: 'tarjetas', target: 'player' },
  { type: 'game_first_red', label: 'Primera roja', kind: 'first', event: 'red', group: 'tarjetas', target: 'player' },
  { type: 'game_first_post', label: 'Primer palo', kind: 'first', event: 'post', group: 'show', target: 'player' },
  { type: 'game_first_golazo', label: 'Primer golazo', kind: 'first', event: 'golazo', group: 'show', target: 'player' },
  { type: 'game_first_penalty', label: 'Primer penal cometido', kind: 'first', event: 'penalty', group: 'show', target: 'player' },
  { type: 'game_first_penalty_miss', label: 'Primer penal fallado', kind: 'first', event: 'penalty_miss', group: 'show', target: 'player' },
  { type: 'game_first_blooper', label: 'Primer blooper', kind: 'first', event: 'blooper', group: 'show', target: 'player' },
  { type: 'game_first_dive', label: 'Primer piscinazo', kind: 'first', event: 'dive', group: 'show', target: 'player' },
  { type: 'game_first_nutmeg', label: 'Primera huacha', kind: 'first', event: 'nutmeg', group: 'show', target: 'player' },
  { type: 'game_has_post', label: '¿Habrá palo?', kind: 'has', event: 'post', group: 'si_no', target: 'number' },
  { type: 'game_has_penalty', label: '¿Habrá penal?', kind: 'has', event: 'penalty', group: 'si_no', target: 'number' },
  { type: 'game_has_red', label: '¿Habrá roja?', kind: 'has', event: 'red', group: 'si_no', target: 'number' },
  { type: 'game_has_golazo', label: '¿Habrá golazo?', kind: 'has', event: 'golazo', group: 'si_no', target: 'number' },
  { type: 'game_has_own_goal', label: '¿Habrá autogol?', kind: 'has', event: 'own_goal', group: 'si_no', target: 'number' },
];

export const GAME_MARKET_BY_TYPE = new Map(GAME_MARKETS.map((d) => [d.type, d]));
export const isGameMarket = (type: string | undefined) => !!type && GAME_MARKET_BY_TYPE.has(type);

/** Máximo de "Goles en el partido" (5 = "5 o más"). */
export const GAME_GOALS_MAX = 5;

export const GAME_GROUPS: { id: GameMarketGroup; label: string; icon: string }[] = [
  { id: 'resultado', label: 'Resultado', icon: '🆚' },
  { id: 'goles', label: 'Goles', icon: '⚽' },
  { id: 'tarjetas', label: 'Tarjetas', icon: '🟨' },
  { id: 'show', label: 'Show', icon: '🎬' },
  { id: 'si_no', label: '¿Pasará?', icon: '❓' },
];
