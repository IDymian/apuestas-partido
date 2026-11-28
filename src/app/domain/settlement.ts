/**
 * Lógica pura de liquidación de las apuestas de una jornada.
 *
 * Todo el dinero se maneja en CÉNTIMOS (enteros) para no perder ni ganar
 * dinero por errores de coma flotante. La UI formatea con `formatSoles`.
 *
 * Una apuesta elige una "selección": el id de un jugador, el id de un equipo
 * o un número (como texto), según el `target` del tipo de mercado.
 */
import { courtTimeline, CourtTimeline, leaderFirstToReach, sortEvents, TimelineEvent } from './timeline';
import { champion, FixtureGame, lastPlace, league, League, uniqueMax } from './league';
import { GAME_GOALS_MAX, GAME_MARKETS, GameMarketDef } from './game-markets';

export type TicketStatus = 'pending' | 'approved' | 'rejected';
export type MarketTarget = 'player' | 'team' | 'number';
export type { TimelineEvent } from './timeline';

export interface SettleMarket {
  id: string;
  name: string;
  type: string;
  sortOrder: number;
  isActive: boolean;
  rolloverToMarketId: string | null;
  /** Pozo inicial en soles (puede tener céntimos). */
  initialPot: number;
  /** 4 / 6 para "primero en llegar a N goles", 15 / 28 para "gol número N". */
  param: number | null;
}

export interface SettleBet {
  ticketId: string;
  ticketStatus: TicketStatus;
  bettorName: string;
  marketId: string;
  /** id de jugador, id de equipo o número como texto. */
  selection: string;
  /** Soles enteros, 1..5. */
  amount: number;
}

export interface SettleInput {
  markets: SettleMarket[];
  events: TimelineEvent[];
  teamIds: string[];
  startingTeamIds: string[];
  /** Id del jugador especial "Autogol" (opción de apuesta), si existe. */
  ownGoalOptionId: string | null;
  /** Deben venir en orden de creación del ticket: el último ganador absorbe el redondeo. */
  bets: SettleBet[];
  /** Partido de la liga que se está jugando (por defecto: todos jugados). */
  currentGame?: number;
  /** La jornada terminó: el partido actual cuenta como jugado. */
  finished?: boolean;
  /** El partido actual está en vivo (si no, todavía no empieza). */
  live?: boolean;
  /** Partidos creados dinámicamente (si falta, usa el fixture automático). */
  games?: FixtureGame[] | null;
}

export interface ResolveContext {
  /** Ordenados por minuto y orden de registro. */
  events: TimelineEvent[];
  timeline: CourtTimeline;
  param: number | null;
  ownGoalOptionId: string | null;
  /** Liga todos contra todos: partidos, marcadores y tabla. */
  league: League;
}

/** Lo que decide un resolver a partir de los eventos. */
export type Resolution =
  | { kind: 'winner'; selection: string }
  | { kind: 'refund'; reason: string }
  | { kind: 'unresolved'; reason: string };

export type Resolver = (ctx: ResolveContext) => Resolution;

/** winners: hubo aciertos · refund: no ocurrió · no_winner: nadie acertó · unresolved: tipo desconocido */
export type MarketOutcome = 'winners' | 'refund' | 'no_winner' | 'unresolved';

export interface PersonAmount {
  personKey: string;
  bettorName: string;
  /** Lo que apostó esta persona en el mercado (a la selección ganadora, si es un reparto). */
  stakeCents: number;
  amountCents: number;
}

export interface MarketResult {
  marketId: string;
  name: string;
  type: string;
  outcome: MarketOutcome;
  reason: string | null;
  /** Jugador, equipo o número ganador. */
  winnerSelection: string | null;
  betsPotCents: number;
  initialPotCents: number;
  rolledInCents: number;
  rolledInFrom: string[];
  totalPotCents: number;
  rolledToMarketId: string | null;
  /** Lo que se queda el organizador desde este mercado (nadie acertó, pozos no repartidos). */
  houseCents: number;
  payouts: PersonAmount[];
  refunds: PersonAmount[];
}

export interface PersonResult {
  personKey: string;
  bettorName: string;
  stakedCents: number;
  wonCents: number;
  refundedCents: number;
  /** Lo que hay que pagarle: ganado + devuelto. */
  totalCents: number;
}

export interface SettlementResult {
  markets: MarketResult[];
  people: PersonResult[];
  /** Total que se queda el organizador. */
  houseCents: number;
  timeline: CourtTimeline;
  league: League;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const toCents = (soles: number): number => Math.round(soles * 100);

export function formatSoles(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const soles = Math.floor(abs / 100);
  const cs = (abs % 100).toString().padStart(2, '0');
  return `${sign}S/ ${soles.toLocaleString('es-PE')}.${cs}`;
}

/** "  José  Pérez " y "jose perez" son la misma persona. */
export function personKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Número máximo que se puede elegir en "Racha más larga" (10 = "10 o más"). */
export const STREAK_MAX_OPTION = 10;
/** Número máximo en "¿Cuántos palos?" (5 = "5 o más"). */
export const POSTS_MAX_OPTION = 5;

/** Opción máxima ("N o más") de cada mercado a número. */
export function numberMaxOption(type: string | undefined): number {
  if (type === 'game_winner') return 2;
  if (type === 'game_goals') return GAME_GOALS_MAX;
  if (type?.startsWith('game_has_')) return 1;
  return type === 'total_posts' ? POSTS_MAX_OPTION : STREAK_MAX_OPTION;
}

const goals = (c: ResolveContext) => c.events.filter((e) => e.type === 'goal');
const realGoals = (c: ResolveContext) => goals(c).filter((e) => !e.isOwnGoal && e.playerId);
const ofType = (c: ResolveContext, t: TimelineEvent['type']) => c.events.filter((e) => e.type === t && e.playerId);
/** En Primer/Último gol y Gol N, un autogol hace ganar a la opción "Autogol". */
const goalSelection = (c: ResolveContext, e: TimelineEvent): Resolution =>
  e.isOwnGoal
    ? c.ownGoalOptionId
      ? { kind: 'winner', selection: c.ownGoalOptionId }
      : { kind: 'unresolved', reason: 'Falta la opción "Autogol"' }
    : { kind: 'winner', selection: e.playerId! };
const winner = (selection: string | null | undefined, refundReason: string): Resolution =>
  selection ? { kind: 'winner', selection } : { kind: 'refund', reason: refundReason };

const NO_GOALS = 'No hubo goles';
const NO_YELLOWS = 'No hubo amarillas';

/** Primer jugador con un evento de ese tipo (roja, palo, golazo…). */
const firstOf = (t: TimelineEvent['type'], none: string): Resolver => (c) => winner(ofType(c, t)[0]?.playerId, none);

/**
 * Mejor / peor equipo por % de partiditos ganados (ganados / jugados).
 * Desempate: el mejor es el que ganó más; el peor, el que salió más; luego el orden de los equipos.
 */
function teamByWinRate(c: ResolveContext, mode: 'best' | 'worst'): Resolution {
  const rows = c.timeline.teamIds
    .map((id, order) => {
      const s = c.timeline.stats[id];
      return { id, order, wins: s.wins, exits: s.exits, played: s.wins + s.exits };
    })
    .filter((r) => r.played > 0);
  if (rows.length === 0) return { kind: 'refund', reason: NO_GOALS };
  rows.sort((a, b) => {
    // a.wins/a.played vs b.wins/b.played sin decimales
    const rate = b.wins * a.played - a.wins * b.played;
    if (mode === 'best') return rate || b.wins - a.wins || a.order - b.order;
    return -rate || b.exits - a.exits || a.order - b.order;
  });
  return { kind: 'winner', selection: rows[0].id };
}

const NOT_PLAYED = 'Aún no se juega';
const NO_GAMES = 'No se jugó ningún partido';
const TIED = 'Empate en la tabla';
const leagueWinner = (c: ResolveContext, pick: string | null): Resolution =>
  pick ? { kind: 'winner', selection: pick } : c.league.table.every((r) => r.played === 0) ? { kind: 'refund', reason: NO_GAMES } : { kind: 'refund', reason: TIED };
/** Partido N de la liga (param). */
const gameOf = (c: ResolveContext) => c.league.games.find((g) => g.number === c.param);

/** Resolver de una apuesta de partido (ganador, goles, primer…, último gol, ¿habrá…?). */
function gameResolver(def: GameMarketDef): Resolver {
  return (c) => {
    const g = gameOf(c);
    if (!g) return { kind: 'unresolved', reason: 'Falta el número de partido' };
    if (g.status === 'pending') return { kind: 'unresolved', reason: NOT_PLAYED };
    const played = g.status === 'played';
    const goals = g.goalEventIds.map((id) => c.events.find((x) => x.id === id)!).filter(Boolean);
    const matches = (e: TimelineEvent) =>
      def.event === 'own_goal' ? e.type === 'goal' && e.isOwnGoal : def.event === 'goal' ? e.type === 'goal' : e.type === def.event;
    const pool = def.event === 'goal' || def.event === 'own_goal' ? goals : c.events.filter((e) => e.game === g.number && e.playerId);
    switch (def.kind) {
      case 'winner':
        // 1 = gana el primero, 0 = empate, 2 = gana el segundo
        return { kind: 'winner', selection: g.homeGoals > g.awayGoals ? '1' : g.homeGoals < g.awayGoals ? '2' : '0' };
      case 'goals':
        return { kind: 'winner', selection: String(Math.min(g.homeGoals + g.awayGoals, GAME_GOALS_MAX)) };
      case 'first': {
        const e = pool.find(matches);
        if (e) return def.event === 'goal' ? goalSelection(c, e) : { kind: 'winner', selection: e.playerId! };
        return played ? { kind: 'refund', reason: `No hubo ${def.label.toLowerCase().replace(/^primer[a]? /, '')}` } : { kind: 'unresolved', reason: 'Todavía no' };
      }
      case 'last_goal': {
        const e = goals.at(-1);
        if (e) return goalSelection(c, e);
        return played ? { kind: 'refund', reason: 'Terminó 0-0' } : { kind: 'unresolved', reason: 'Sin goles todavía' };
      }
      case 'has':
        if (pool.some(matches)) return { kind: 'winner', selection: '1' };
        return played ? { kind: 'winner', selection: '0' } : { kind: 'unresolved', reason: 'Todavía no' };
    }
  };
}

/** Registro de tipos de mercado. Para un tipo nuevo, agrega aquí su resolver. */
export const RESOLVERS: Record<string, Resolver> = {
  // ⚽ Goles (a jugador)
  first_goal: (c) => {
    const e = goals(c)[0];
    return e ? goalSelection(c, e) : { kind: 'refund', reason: NO_GOALS };
  },
  last_goal: (c) => {
    const e = goals(c).at(-1);
    return e ? goalSelection(c, e) : { kind: 'refund', reason: NO_GOALS };
  },
  top_scorer: (c) => winner(leaderFirstToReach(realGoals(c).map((e) => e.playerId!)), NO_GOALS),
  first_to_n_goals: (c) => {
    const n = c.param ?? 0;
    if (n < 1) return { kind: 'unresolved', reason: 'Falta la cantidad de goles' };
    const count = new Map<string, number>();
    for (const e of realGoals(c)) {
      const k = (count.get(e.playerId!) ?? 0) + 1;
      count.set(e.playerId!, k);
      if (k === n) return { kind: 'winner', selection: e.playerId! };
    }
    return { kind: 'refund', reason: `Nadie llegó a ${n} goles` };
  },
  nth_goal: (c) => {
    const n = c.param ?? 0;
    if (n < 1) return { kind: 'unresolved', reason: 'Falta el número de gol' };
    const e = goals(c)[n - 1];
    return e ? goalSelection(c, e) : { kind: 'refund', reason: `No hubo ${n} goles` };
  },

  // 🛡️ Equipos (a equipo o número)
  most_wins: (c) => winner(c.timeline.mostWinsTeamId, NO_GOALS),
  longest_streak: (c) =>
    c.timeline.maxStreak > 0
      ? { kind: 'winner', selection: String(Math.min(c.timeline.maxStreak, STREAK_MAX_OPTION)) }
      : { kind: 'refund', reason: NO_GOALS },
  most_exits: (c) => winner(c.timeline.mostExitsTeamId, NO_GOALS),
  // Liga: campeón y último por puntos (desempate: diferencia de gol y goles a favor).
  best_team: (c) => leagueWinner(c, champion(c.league)),
  worst_team: (c) => leagueWinner(c, lastPlace(c.league)),
  top_scoring_team: (c) => leagueWinner(c, uniqueMax(c.league, 'gf')),
  most_conceded_team: (c) => leagueWinner(c, uniqueMax(c.league, 'ga')),
  /** @deprecated formato "ganador se queda": por % de partiditos ganados. */
  best_win_rate: (c) => teamByWinRate(c, 'best'),

  // 🆚 Por partido (param = número de partido): ver GAME_MARKETS
  ...Object.fromEntries(GAME_MARKETS.map((d) => [d.type, gameResolver(d)])),

  // 🟨 Amarillas (a jugador)
  first_yellow: (c) => winner(ofType(c, 'yellow')[0]?.playerId, NO_YELLOWS),
  last_yellow: (c) => winner(ofType(c, 'yellow').at(-1)?.playerId, NO_YELLOWS),
  most_yellows: (c) => winner(leaderFirstToReach(ofType(c, 'yellow').map((e) => e.playerId!)), NO_YELLOWS),
  first_red: firstOf('red', 'No hubo rojas'),

  // 🤡 Pichanga (a jugador)
  first_own_goal: (c) => winner(goals(c).find((e) => e.isOwnGoal && e.playerId)?.playerId, 'No hubo autogoles'),
  first_nutmeg_victim: (c) => winner(ofType(c, 'nutmeg')[0]?.playerId, 'No hubo huachas'),

  // 🎬 Show (a jugador o número)
  first_blooper: firstOf('blooper', 'No hubo bloopers'),
  first_penalty_conceded: firstOf('penalty', 'No hubo penales'),
  first_penalty_missed: firstOf('penalty_miss', 'Nadie falló un penal'),
  first_post: firstOf('post', 'No hubo palos'),
  first_golazo: firstOf('golazo', 'No hubo golazos'),
  first_dive: firstOf('dive', 'No hubo piscinazos'),
  // Siempre se resuelve: 0 palos también es un resultado.
  total_posts: (c) => ({ kind: 'winner', selection: String(Math.min(ofType(c, 'post').length, POSTS_MAX_OPTION)) }),
};

/**
 * Reparte `potCents` en proporción a `stakes`. Redondea hacia abajo y el
 * último de la lista absorbe la diferencia, así la suma es exacta.
 */
export function splitProportional<T extends { stakeCents: number }>(
  potCents: number,
  stakes: T[],
): (T & { amountCents: number })[] {
  const total = stakes.reduce((s, x) => s + x.stakeCents, 0);
  if (total === 0) return [];
  let given = 0;
  return stakes.map((x, i) => {
    const amountCents = i === stakes.length - 1 ? potCents - given : Math.floor((potCents * x.stakeCents) / total);
    given += amountCents;
    return { ...x, amountCents };
  });
}

/** Agrupa por persona conservando el orden de la primera apuesta. */
function groupByPerson(bets: SettleBet[]): PersonAmount[] {
  const map = new Map<string, PersonAmount>();
  for (const b of bets) {
    const key = personKey(b.bettorName);
    const cur = map.get(key) ?? {
      personKey: key,
      bettorName: b.bettorName.trim().replace(/\s+/g, ' '),
      stakeCents: 0,
      amountCents: 0,
    };
    cur.stakeCents += toCents(b.amount);
    map.set(key, cur);
  }
  return [...map.values()];
}

/**
 * Orden de proceso: un mercado se liquida después de todos los que le
 * arrastran bote. Los arrastres que forman ciclos o apuntan a mercados
 * inactivos/inexistentes se anulan (el bote queda para el organizador).
 */
function processingOrder(markets: SettleMarket[]): { order: SettleMarket[]; target: Map<string, string | null> } {
  const byId = new Map(markets.map((m) => [m.id, m]));
  const target = new Map<string, string | null>();
  for (const m of markets) {
    const t = m.rolloverToMarketId;
    target.set(m.id, t && t !== m.id && byId.has(t) ? t : null);
  }
  const sorted = [...markets].sort((a, b) => a.sortOrder - b.sortOrder);
  const indeg = new Map<string, number>(markets.map((m) => [m.id, 0]));
  for (const t of target.values()) if (t) indeg.set(t, (indeg.get(t) ?? 0) + 1);

  const order: SettleMarket[] = [];
  const done = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const m of sorted) {
      if (done.has(m.id) || (indeg.get(m.id) ?? 0) > 0) continue;
      order.push(m);
      done.add(m.id);
      progressed = true;
      const t = target.get(m.id);
      if (t) indeg.set(t, (indeg.get(t) ?? 0) - 1);
    }
  }
  for (const m of sorted) {
    if (!done.has(m.id)) {
      target.set(m.id, null);
      order.push(m);
    }
  }
  return { order, target };
}

// ---------------------------------------------------------------------------
// Liquidación
// ---------------------------------------------------------------------------

export function settle(input: SettleInput, resolvers: Record<string, Resolver> = RESOLVERS): SettlementResult {
  const events = sortEvents(input.events);
  const timeline = courtTimeline(events, input.teamIds, input.startingTeamIds);
  const lg = league(
    events,
    input.teamIds,
    input.currentGame ?? Number.MAX_SAFE_INTEGER,
    input.finished ?? true,
    input.live ?? true,
    input.games,
  );
  const active = input.markets.filter((m) => m.isActive);
  const approved = input.bets.filter((b) => b.ticketStatus === 'approved');
  const { order, target } = processingOrder(active);

  const rolledIn = new Map<string, { cents: number; from: string[] }>();
  const results = new Map<string, MarketResult>();

  for (const m of order) {
    const bets = approved.filter((b) => b.marketId === m.id);
    const betsPotCents = bets.reduce((s, b) => s + toCents(b.amount), 0);
    const initialPotCents = toCents(m.initialPot || 0);
    const inc = rolledIn.get(m.id) ?? { cents: 0, from: [] };
    const totalPotCents = betsPotCents + initialPotCents + inc.cents;

    const r: MarketResult = {
      marketId: m.id,
      name: m.name,
      type: m.type,
      outcome: 'unresolved',
      reason: null,
      winnerSelection: null,
      betsPotCents,
      initialPotCents,
      rolledInCents: inc.cents,
      rolledInFrom: inc.from,
      totalPotCents,
      rolledToMarketId: null,
      houseCents: 0,
      payouts: [],
      refunds: [],
    };

    const resolver = resolvers[m.type];
    const res: Resolution = resolver
      ? resolver({ events, timeline, param: m.param, ownGoalOptionId: input.ownGoalOptionId, league: lg })
      : { kind: 'unresolved', reason: `Tipo de mercado desconocido: ${m.type}` };

    if (res.kind === 'unresolved') {
      r.reason = res.reason;
    } else if (res.kind === 'refund') {
      // Se devuelve lo apostado; pozo inicial y arrastre quedan para el organizador.
      r.outcome = 'refund';
      r.reason = res.reason;
      r.refunds = groupByPerson(bets).map((p) => ({ ...p, amountCents: p.stakeCents }));
      r.houseCents = initialPotCents + inc.cents;
    } else {
      r.winnerSelection = res.selection;
      const winners = groupByPerson(bets.filter((b) => b.selection === res.selection));
      if (winners.length > 0) {
        r.outcome = 'winners';
        r.payouts = splitProportional(totalPotCents, winners);
      } else {
        r.outcome = 'no_winner';
        const t = target.get(m.id) ?? null;
        if (t) {
          r.rolledToMarketId = t;
          if (totalPotCents > 0) {
            const cur = rolledIn.get(t) ?? { cents: 0, from: [] };
            rolledIn.set(t, { cents: cur.cents + totalPotCents, from: [...cur.from, m.id] });
          }
        } else {
          // Nadie acertó y no hay arrastre: el bote se lo queda el organizador.
          r.houseCents = totalPotCents;
        }
      }
    }
    results.set(m.id, r);
  }

  const markets = [...active].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => results.get(m.id)!);

  const people = new Map<string, PersonResult>();
  const person = (key: string, name: string) => {
    let p = people.get(key);
    if (!p) {
      p = { personKey: key, bettorName: name, stakedCents: 0, wonCents: 0, refundedCents: 0, totalCents: 0 };
      people.set(key, p);
    }
    return p;
  };
  const activeIds = new Set(active.map((m) => m.id));
  for (const b of approved) {
    if (!activeIds.has(b.marketId)) continue;
    person(personKey(b.bettorName), b.bettorName.trim().replace(/\s+/g, ' ')).stakedCents += toCents(b.amount);
  }
  for (const r of markets) {
    for (const p of r.payouts) person(p.personKey, p.bettorName).wonCents += p.amountCents;
    for (const p of r.refunds) person(p.personKey, p.bettorName).refundedCents += p.amountCents;
  }
  for (const p of people.values()) p.totalCents = p.wonCents + p.refundedCents;

  return {
    markets,
    people: [...people.values()].sort((a, b) => b.totalCents - a.totalCents || a.bettorName.localeCompare(b.bettorName)),
    houseCents: markets.reduce((s, r) => s + r.houseCents, 0),
    timeline,
    league: lg,
  };
}
