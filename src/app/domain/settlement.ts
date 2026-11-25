/**
 * Lógica pura de liquidación de la polla.
 *
 * Todo el dinero se maneja en CÉNTIMOS (enteros) para no perder ni ganar
 * dinero por errores de coma flotante. La UI formatea con `formatSoles`.
 */

export type TicketStatus = 'pending' | 'approved' | 'rejected';
export type EventType = 'goal' | 'yellow';

export interface SettleMarket {
  id: string;
  name: string;
  /** first_goal | last_goal | first_yellow | (tipos futuros) */
  type: string;
  sortOrder: number;
  isActive: boolean;
  rolloverToMarketId: string | null;
  /** Pozo inicial en soles (puede tener céntimos). */
  initialPot: number;
}

export interface SettleEvent {
  id: string;
  type: EventType;
  playerId: string;
  minute: number;
  /** Minutos de tiempo añadido (45+2 → minute 45, stoppage 2). */
  stoppage: number;
  /** Orden de registro; desempata eventos del mismo minuto. */
  seq: number;
}

export interface SettleBet {
  ticketId: string;
  ticketStatus: TicketStatus;
  bettorName: string;
  marketId: string;
  playerId: string;
  /** Soles enteros, 1..5. */
  amount: number;
}

export interface SettleInput {
  markets: SettleMarket[];
  events: SettleEvent[];
  /** Deben venir en orden de creación del ticket: el último ganador absorbe el redondeo. */
  bets: SettleBet[];
}

/** Lo que decide un resolver a partir de los eventos. */
export type Resolution =
  | { kind: 'winner'; playerId: string }
  | { kind: 'refund'; reason: string }
  | { kind: 'unresolved'; reason: string };

export type Resolver = (events: SettleEvent[]) => Resolution;

export type MarketOutcome = 'winners' | 'refund' | 'no_winner' | 'unresolved';

export interface PersonAmount {
  personKey: string;
  bettorName: string;
  /** Lo que apostó esta persona en el mercado (al ganador, si es un reparto). */
  stakeCents: number;
  amountCents: number;
}

export interface MarketResult {
  marketId: string;
  name: string;
  type: string;
  outcome: MarketOutcome;
  reason: string | null;
  winnerPlayerId: string | null;
  /** Suma de apuestas aprobadas en este mercado. */
  betsPotCents: number;
  initialPotCents: number;
  /** Bote que llegó por arrastre desde otros mercados. */
  rolledInCents: number;
  rolledInFrom: string[];
  totalPotCents: number;
  /** Mercado al que se arrastró el bote (si no hubo aciertos). */
  rolledToMarketId: string | null;
  /** Lo que queda acumulado para el próximo partido desde este mercado. */
  accumulatedCents: number;
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
  accumulatedCents: number;
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

export function compareEvents(a: SettleEvent, b: SettleEvent): number {
  return a.minute - b.minute || a.stoppage - b.stoppage || a.seq - b.seq;
}

const firstOf = (events: SettleEvent[], type: EventType) =>
  events.filter((e) => e.type === type).sort(compareEvents)[0];
const lastOf = (events: SettleEvent[], type: EventType) =>
  events.filter((e) => e.type === type).sort(compareEvents).at(-1);

/** Registro de tipos de mercado. Para un tipo nuevo, agrega aquí su resolver. */
export const RESOLVERS: Record<string, Resolver> = {
  first_goal: (events) => {
    const e = firstOf(events, 'goal');
    return e ? { kind: 'winner', playerId: e.playerId } : { kind: 'refund', reason: 'Sin goles (0-0)' };
  },
  last_goal: (events) => {
    const e = lastOf(events, 'goal');
    return e ? { kind: 'winner', playerId: e.playerId } : { kind: 'refund', reason: 'Sin goles (0-0)' };
  },
  first_yellow: (events) => {
    const e = firstOf(events, 'yellow');
    return e
      ? { kind: 'winner', playerId: e.playerId }
      : { kind: 'refund', reason: 'No hubo tarjetas amarillas' };
  },
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
    const amountCents =
      i === stakes.length - 1 ? potCents - given : Math.floor((potCents * x.stakeCents) / total);
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
 * inactivos/inexistentes se anulan (el bote queda acumulado).
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
  // Lo que queda está en un ciclo: se anula su arrastre.
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
      winnerPlayerId: null,
      betsPotCents,
      initialPotCents,
      rolledInCents: inc.cents,
      rolledInFrom: inc.from,
      totalPotCents,
      rolledToMarketId: null,
      accumulatedCents: 0,
      payouts: [],
      refunds: [],
    };

    const resolver = resolvers[m.type];
    const res: Resolution = resolver
      ? resolver(input.events)
      : { kind: 'unresolved', reason: `Tipo de mercado desconocido: ${m.type}` };

    if (res.kind === 'unresolved') {
      r.reason = res.reason;
    } else if (res.kind === 'refund') {
      // Se devuelve lo apostado; pozo inicial y arrastre quedan acumulados.
      r.outcome = 'refund';
      r.reason = res.reason;
      r.refunds = groupByPerson(bets).map((p) => ({ ...p, amountCents: p.stakeCents }));
      r.accumulatedCents = initialPotCents + inc.cents;
    } else {
      r.winnerPlayerId = res.playerId;
      const winners = groupByPerson(bets.filter((b) => b.playerId === res.playerId));
      if (winners.length > 0) {
        r.outcome = 'winners';
        r.payouts = splitProportional(totalPotCents, winners);
      } else {
        r.outcome = 'no_winner';
        const t = target.get(m.id) ?? null;
        if (t && totalPotCents > 0) {
          r.rolledToMarketId = t;
          const cur = rolledIn.get(t) ?? { cents: 0, from: [] };
          rolledIn.set(t, { cents: cur.cents + totalPotCents, from: [...cur.from, m.id] });
        } else if (t) {
          r.rolledToMarketId = t;
        } else {
          r.accumulatedCents = totalPotCents;
        }
      }
    }
    results.set(m.id, r);
  }

  // Resultados en el orden visual (sort_order).
  const markets = [...active].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => results.get(m.id)!);

  // Totales por persona.
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
    accumulatedCents: markets.reduce((s, r) => s + r.accumulatedCents, 0),
  };
}
