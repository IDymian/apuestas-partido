import { describe, expect, it } from 'vitest';
import {
  SettleBet,
  SettleEvent,
  SettleMarket,
  TicketStatus,
  formatSoles,
  personKey,
  settle,
  splitProportional,
} from './settlement';

// ---- Fixtures --------------------------------------------------------------

const FG = 'm-first-goal';
const LG = 'm-last-goal';
const FY = 'm-first-yellow';

function markets(overrides: Partial<Record<string, Partial<SettleMarket>>> = {}): SettleMarket[] {
  const base: SettleMarket[] = [
    { id: FG, name: 'Primer gol', type: 'first_goal', sortOrder: 1, isActive: true, rolloverToMarketId: LG, initialPot: 0 },
    { id: LG, name: 'Último gol', type: 'last_goal', sortOrder: 2, isActive: true, rolloverToMarketId: null, initialPot: 0 },
    { id: FY, name: 'Primera amarilla', type: 'first_yellow', sortOrder: 3, isActive: true, rolloverToMarketId: null, initialPot: 0 },
  ];
  return base.map((m) => ({ ...m, ...(overrides[m.id] ?? {}) }));
}

let ticket = 0;
function bet(bettorName: string, marketId: string, playerId: string, amount: number, status: TicketStatus = 'approved'): SettleBet {
  return { ticketId: `t${++ticket}`, ticketStatus: status, bettorName, marketId, playerId, amount };
}

let seq = 0;
function goal(playerId: string, minute: number, stoppage = 0): SettleEvent {
  return { id: `e${++seq}`, type: 'goal', playerId, minute, stoppage, seq };
}
function yellow(playerId: string, minute: number, stoppage = 0): SettleEvent {
  return { id: `e${++seq}`, type: 'yellow', playerId, minute, stoppage, seq };
}

const market = (r: ReturnType<typeof settle>, id: string) => r.markets.find((m) => m.marketId === id)!;
const paid = (r: ReturnType<typeof settle>, name: string) =>
  r.people.find((p) => p.personKey === personKey(name))?.totalCents ?? 0;

// ---- Casos pedidos --------------------------------------------------------

describe('settle()', () => {
  it('1. Un solo gol: primer gol sin aciertos arrastra al último gol', () => {
    const r = settle({
      markets: markets(),
      events: [goal('fulanito', 30)],
      bets: [
        bet('Ana', FG, 'pepito', 4),
        bet('Luis', FG, 'juanito', 2),
        bet('Rosa', LG, 'fulanito', 3),
        bet('Beto', LG, 'fulanito', 1),
      ],
    });

    const fg = market(r, FG);
    expect(fg.outcome).toBe('no_winner');
    expect(fg.winnerPlayerId).toBe('fulanito');
    expect(fg.totalPotCents).toBe(600);
    expect(fg.rolledToMarketId).toBe(LG);

    const lg = market(r, LG);
    expect(lg.winnerPlayerId).toBe('fulanito');
    expect(lg.rolledInCents).toBe(600);
    expect(lg.totalPotCents).toBe(1000);
    expect(lg.payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([
      ['Rosa', 750],
      ['Beto', 250],
    ]);

    expect(paid(r, 'Rosa')).toBe(750);
    expect(paid(r, 'Beto')).toBe(250);
    expect(paid(r, 'Ana')).toBe(0);
    expect(r.accumulatedCents).toBe(0);
  });

  it('2. Reparto proporcional con varios ganadores (ejemplo Ana 4 / Beto 1 en bote de 20)', () => {
    const r = settle({
      markets: markets(),
      events: [goal('p1', 10), goal('p2', 80), yellow('y1', 20)],
      bets: [
        bet('Ana', FY, 'y1', 4),
        bet('Beto', FY, 'y1', 1),
        bet('Carla', FY, 'y2', 5),
        bet('Dani', FY, 'y3', 5),
        bet('Eva', FY, 'y4', 5),
      ],
    });
    const fy = market(r, FY);
    expect(fy.totalPotCents).toBe(2000);
    expect(fy.payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([
      ['Ana', 1600],
      ['Beto', 400],
    ]);
  });

  it('2b. Una persona con varias apuestas y tickets suma su participación', () => {
    const r = settle({
      markets: markets(),
      events: [goal('p1', 10)],
      bets: [bet('Ana', LG, 'p1', 2), bet('Beto', LG, 'p1', 3), bet(' ana ', LG, 'p1', 3), bet('Zoe', LG, 'p9', 2)],
    });
    const lg = market(r, LG);
    expect(lg.payouts.map((p) => [p.personKey, p.stakeCents, p.amountCents])).toEqual([
      ['ana', 500, 625],
      ['beto', 300, 375],
    ]);
  });

  it('3. Partido 0-0: se devuelve lo apostado en mercados de goles', () => {
    const r = settle({
      markets: markets({ [FG]: { initialPot: 10 } }),
      events: [yellow('y1', 15)],
      bets: [
        bet('Ana', FG, 'p1', 4),
        bet('Luis', LG, 'p2', 2),
        bet('Ana', LG, 'p3', 1),
        bet('Rosa', FY, 'y1', 3),
      ],
    });
    expect(market(r, FG).outcome).toBe('refund');
    expect(market(r, LG).outcome).toBe('refund');
    expect(market(r, FG).refunds.map((p) => [p.bettorName, p.amountCents])).toEqual([['Ana', 400]]);
    expect(paid(r, 'Ana')).toBe(500);
    expect(paid(r, 'Luis')).toBe(200);
    expect(paid(r, 'Rosa')).toBe(300);
    // El pozo inicial no se reparte: queda acumulado.
    expect(r.accumulatedCents).toBe(1000);
  });

  it('3b. Sin amarillas: se devuelve lo apostado en ese mercado', () => {
    const r = settle({
      markets: markets(),
      events: [goal('p1', 5)],
      bets: [bet('Ana', FY, 'y1', 5), bet('Beto', FY, 'y2', 2)],
    });
    expect(market(r, FY).outcome).toBe('refund');
    expect(paid(r, 'Ana')).toBe(500);
    expect(paid(r, 'Beto')).toBe(200);
  });

  it('4. Nadie acierta el último gol: su bote (con el arrastre) queda acumulado', () => {
    const r = settle({
      markets: markets(),
      events: [goal('p1', 10), goal('p2', 70)],
      bets: [bet('Ana', FG, 'p9', 3), bet('Beto', LG, 'p8', 2), bet('Carla', LG, 'p1', 1)],
    });
    expect(market(r, FG).rolledToMarketId).toBe(LG);
    const lg = market(r, LG);
    expect(lg.winnerPlayerId).toBe('p2');
    expect(lg.outcome).toBe('no_winner');
    expect(lg.totalPotCents).toBe(600);
    expect(lg.accumulatedCents).toBe(600);
    expect(r.accumulatedCents).toBe(600);
    expect(r.people.every((p) => p.totalCents === 0)).toBe(true);
  });

  it('5. Apuestas pendientes o rechazadas no cuentan', () => {
    const r = settle({
      markets: markets(),
      events: [goal('p1', 10)],
      bets: [
        bet('Ana', LG, 'p1', 2),
        bet('Beto', LG, 'p1', 5, 'pending'),
        bet('Carla', LG, 'p1', 5, 'rejected'),
        bet('Dani', LG, 'p2', 3),
      ],
    });
    const lg = market(r, LG);
    expect(lg.betsPotCents).toBe(500);
    expect(lg.payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([['Ana', 500]]);
    expect(r.people.map((p) => p.bettorName).sort()).toEqual(['Ana', 'Dani']);
  });

  it('6. Redondeo a céntimos: el último ganador absorbe la diferencia', () => {
    const r = settle({
      markets: markets(),
      events: [goal('p1', 10)],
      bets: [
        bet('Ana', LG, 'p1', 1),
        bet('Beto', LG, 'p1', 1),
        bet('Carla', LG, 'p1', 1),
        bet('Dani', LG, 'p2', 5),
        bet('Eva', LG, 'p2', 2),
      ],
    });
    const lg = market(r, LG);
    expect(lg.totalPotCents).toBe(1000);
    expect(lg.payouts.map((p) => p.amountCents)).toEqual([333, 333, 334]);
    expect(lg.payouts.reduce((s, p) => s + p.amountCents, 0)).toBe(lg.totalPotCents);
  });

  it('6b. Nunca se pierde ni sobra dinero (muchos casos aleatorios)', () => {
    let s = 42;
    const rnd = (n: number) => ((s = (s * 1103515245 + 12345) % 2 ** 31) % n);
    for (let i = 0; i < 300; i++) {
      const bets: SettleBet[] = [];
      const n = 1 + rnd(25);
      for (let j = 0; j < n; j++) {
        bets.push(bet(`P${rnd(8)}`, [FG, LG, FY][rnd(3)], `j${rnd(4)}`, 1 + rnd(5), (['approved', 'approved', 'pending', 'rejected'] as TicketStatus[])[rnd(4)]));
      }
      const events: SettleEvent[] = [];
      for (let k = rnd(4); k > 0; k--) events.push(goal(`j${rnd(4)}`, rnd(95)));
      for (let k = rnd(3); k > 0; k--) events.push(yellow(`j${rnd(4)}`, rnd(95)));
      const initial = rnd(3) === 0 ? 7.35 : 0;
      const r = settle({ markets: markets({ [FG]: { initialPot: initial } }), events, bets });

      const totalIn = bets.filter((b) => b.ticketStatus === 'approved').reduce((t, b) => t + b.amount * 100, 0) + Math.round(initial * 100);
      const totalOut = r.people.reduce((t, p) => t + p.totalCents, 0) + r.accumulatedCents;
      expect(totalOut).toBe(totalIn);
    }
  });
});

// ---- Reglas adicionales ----------------------------------------------------

describe('reglas de eventos', () => {
  it('mismo minuto: desempata el orden de registro', () => {
    const r = settle({
      markets: markets(),
      events: [goal('a', 20), goal('b', 20)],
      bets: [bet('Ana', FG, 'a', 1), bet('Beto', LG, 'b', 1)],
    });
    expect(market(r, FG).winnerPlayerId).toBe('a');
    expect(market(r, LG).winnerPlayerId).toBe('b');
  });

  it('tiempo añadido: 45+2 va antes que 46, y 90+3 después de 90', () => {
    const r = settle({
      markets: markets(),
      events: [goal('c', 90), goal('b', 46), goal('a', 45, 2), goal('d', 90, 3)],
      bets: [],
    });
    expect(market(r, FG).winnerPlayerId).toBe('a');
    expect(market(r, LG).winnerPlayerId).toBe('d');
  });

  it('autogol es un jugador más', () => {
    const r = settle({
      markets: markets(),
      events: [goal('autogol', 33)],
      bets: [bet('Ana', FG, 'autogol', 2), bet('Beto', FG, 'x', 2)],
    });
    expect(market(r, FG).payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([['Ana', 400]]);
  });

  it('pozo inicial se suma al bote del mercado ganado', () => {
    const r = settle({
      markets: markets({ [LG]: { initialPot: 12.5 } }),
      events: [goal('a', 10)],
      bets: [bet('Ana', LG, 'a', 3), bet('Beto', LG, 'b', 2)],
    });
    expect(market(r, LG).totalPotCents).toBe(1750);
    expect(paid(r, 'Ana')).toBe(1750);
  });

  it('mercado inactivo no cuenta y arrastre a inactivo queda acumulado', () => {
    const r = settle({
      markets: markets({ [LG]: { isActive: false } }),
      events: [goal('a', 10)],
      bets: [bet('Ana', FG, 'z', 3), bet('Beto', LG, 'a', 5)],
    });
    expect(r.markets.map((m) => m.marketId)).toEqual([FG, FY]);
    expect(market(r, FG).accumulatedCents).toBe(300);
    expect(r.people.find((p) => p.bettorName === 'Beto')).toBeUndefined();
  });

  it('arrastres en cadena se resuelven en orden y los ciclos se anulan', () => {
    const chain = settle({
      markets: markets({ [FY]: { rolloverToMarketId: FG } }),
      events: [goal('a', 10), yellow('y', 5)],
      bets: [bet('Ana', FY, 'q', 2), bet('Beto', FG, 'q', 3), bet('Carla', LG, 'a', 1)],
    });
    // FY → FG → LG
    expect(market(chain, LG).totalPotCents).toBe(600);
    expect(paid(chain, 'Carla')).toBe(600);

    const cycle = settle({
      markets: markets({ [LG]: { rolloverToMarketId: FG } }),
      events: [goal('a', 10)],
      bets: [bet('Ana', FG, 'q', 2), bet('Beto', LG, 'q', 3)],
    });
    expect(cycle.accumulatedCents).toBe(500);
  });

  it('tipo desconocido queda sin resolver', () => {
    const r = settle({
      markets: [{ id: 'x', name: 'Raro', type: 'first_corner', sortOrder: 1, isActive: true, rolloverToMarketId: null, initialPot: 0 }],
      events: [],
      bets: [bet('Ana', 'x', 'a', 2)],
    });
    expect(r.markets[0].outcome).toBe('unresolved');
  });
});

describe('helpers', () => {
  it('formatSoles', () => {
    expect(formatSoles(750)).toBe('S/ 7.50');
    expect(formatSoles(5)).toBe('S/ 0.05');
    expect(formatSoles(123456)).toMatch(/^S\/ 1.?234\.56$/);
  });
  it('splitProportional suma exacto', () => {
    const out = splitProportional(100, [{ stakeCents: 1 }, { stakeCents: 1 }, { stakeCents: 1 }]);
    expect(out.map((o) => o.amountCents)).toEqual([33, 33, 34]);
  });
});
