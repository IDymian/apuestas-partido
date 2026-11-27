import { describe, expect, it } from 'vitest';
import { formatSoles, personKey, SettleBet, SettleInput, SettleMarket, settle, splitProportional, TicketStatus } from './settlement';
import { courtTimeline, TimelineEvent } from './timeline';

// ---- Fixtures --------------------------------------------------------------

const R = 'rojo', A = 'azul', V = 'verde';
const TEAMS = [R, A, V];
const OG = 'autogol'; // opción especial de apuesta

const MARKET_DEFS: [string, string, number | null][] = [
  ['first_goal', 'Primer gol', null],
  ['last_goal', 'Último gol', null],
  ['top_scorer', 'Pichichi', null],
  ['first_to_n_goals', 'Primer cuartete', 4],
  ['first_to_n_goals', 'Primer sextete', 6],
  ['nth_goal', 'Gol 15', 15],
  ['nth_goal', 'Gol 28', 28],
  ['most_wins', 'Rey de la cancha', null],
  ['longest_streak', 'Racha más larga', null],
  ['most_exits', 'Equipo que más sale', null],
  ['first_yellow', 'Primera amarilla', null],
  ['last_yellow', 'Última amarilla', null],
  ['most_yellows', 'Más amonestado', null],
  ['first_own_goal', 'Primer autogol', null],
  ['first_nutmeg_victim', 'Primera huacha', null],
];
/** id del mercado = su nombre corto, para leer los tests fácil. */
const ID = {
  fg: 'Primer gol', lg: 'Último gol', top: 'Pichichi', n4: 'Primer cuartete', n6: 'Primer sextete',
  g15: 'Gol 15', g28: 'Gol 28', wins: 'Rey de la cancha', streak: 'Racha más larga', exits: 'Equipo que más sale',
  fy: 'Primera amarilla', ly: 'Última amarilla', my: 'Más amonestado', fog: 'Primer autogol', nut: 'Primera huacha',
};

function markets(overrides: Record<string, Partial<SettleMarket>> = {}): SettleMarket[] {
  return MARKET_DEFS.map(([type, name, param], i) => ({
    id: name, name, type, param, sortOrder: i + 1, isActive: true, rolloverToMarketId: null, initialPot: 0,
    ...(overrides[name] ?? {}),
  }));
}

let seq = 0;
const ev = (e: Partial<TimelineEvent> & Pick<TimelineEvent, 'type'>): TimelineEvent => ({
  id: `e${++seq}`, playerId: null, teamId: null, isOwnGoal: false, teamOutId: null, minute: 0, seq, ...e,
});
const goal = (player: string, team: string) => ev({ type: 'goal', playerId: player, teamId: team });
const ownGoal = (player: string, team: string) => ev({ type: 'goal', playerId: player, teamId: team, isOwnGoal: true });
const yellow = (player: string) => ev({ type: 'yellow', playerId: player });
const nutmeg = (victim: string) => ev({ type: 'nutmeg', playerId: victim });
const rotation = (out: string) => ev({ type: 'rotation', teamOutId: out });

let ticket = 0;
const bet = (name: string, marketId: string, selection: string | number, amount: number, status: TicketStatus = 'approved'): SettleBet => ({
  ticketId: `t${++ticket}`, ticketStatus: status, bettorName: name, marketId, selection: String(selection), amount,
});

const input = (events: TimelineEvent[], bets: SettleBet[] = [], m = markets()): SettleInput => ({
  markets: m, events, bets, teamIds: TEAMS, startingTeamIds: [R, A], ownGoalOptionId: OG,
});
const market = (r: ReturnType<typeof settle>, id: string) => r.markets.find((m) => m.marketId === id)!;
const paid = (r: ReturnType<typeof settle>, name: string) => r.people.find((p) => p.personKey === personKey(name))?.totalCents ?? 0;

/** Caso base del enunciado: Rojo vs Azul, Verde espera. */
const baseEvents = () => [
  goal('pepe', R), // sale Azul, entra Verde
  goal('pepe', R), // sale Verde, entra Azul
  ownGoal('juan', A), // autogol de Juan, gol para Azul: sale Rojo, entra Verde
  goal('lucho', A), // sale Verde, entra Rojo
  goal('lucho', A), // sale Rojo, entra Verde
];

// ---- Línea de tiempo y resolvers ------------------------------------------

describe('caso base de la jornada', () => {
  const r = settle(input(baseEvents()));
  const win = (id: string) => market(r, id).winnerSelection;

  it('reconstruye la cancha', () => {
    const t = r.timeline;
    expect(t.games.map((g) => [g.winnerTeamId, g.loserTeamId, g.enteringTeamId])).toEqual([
      [R, A, V], [R, V, A], [A, R, V], [A, V, R], [A, R, V],
    ]);
    expect(t.stats[A]).toMatchObject({ wins: 3, exits: 1, maxStreak: 3, currentStreak: 3 });
    expect(t.stats[R]).toMatchObject({ wins: 2, exits: 2 });
    expect(t.stats[V]).toMatchObject({ wins: 0, exits: 2 });
    expect(t.onCourt.sort()).toEqual([A, V].sort());
    expect(t.waiting).toEqual([R]);
  });

  it('Rey de la cancha: Azul (3 ganados)', () => expect(win(ID.wins)).toBe(A));
  it('Racha más larga: 3', () => expect(win(ID.streak)).toBe('3'));
  it('Equipo que más sale: Verde (empata con Rojo pero llegó primero a 2)', () => expect(win(ID.exits)).toBe(V));
  it('Pichichi: Pepe (empata con Lucho, el autogol no cuenta, llegó primero)', () => expect(win(ID.top)).toBe('pepe'));
  it('Primer gol: Pepe · Último gol: Lucho · Primer autogol: Juan', () => {
    expect(win(ID.fg)).toBe('pepe');
    expect(win(ID.lg)).toBe('lucho');
    expect(win(ID.fog)).toBe('juan');
  });
  it('Primer cuartete y Gol 15: devolución', () => {
    expect(market(r, ID.n4).outcome).toBe('refund');
    expect(market(r, ID.g15).outcome).toBe('refund');
  });
});

describe('reglas especiales', () => {
  it('1. Gol número N que fue autogol → gana la opción "Autogol"', () => {
    const evs = [goal('pepe', R), ownGoal('juan', R)];
    const r = settle(input(evs, [], markets({ [ID.g15]: { param: 2 } })));
    expect(market(r, ID.g15).winnerSelection).toBe(OG);
    expect(market(r, ID.lg).winnerSelection).toBe(OG);
  });

  it('2. Rotación sin gol: no es ganado ni salida y corta la racha del que sale', () => {
    const evs = [goal('pepe', R), goal('pepe', R), rotation(R), goal('lucho', A)];
    // R gana 2 (racha 2) · rotación: sale R (racha 0), entra el que esperaba (A) · cancha V vs A
    const t = courtTimeline(evs, TEAMS, [R, A]);
    expect(t.stats[R]).toMatchObject({ wins: 2, exits: 0, currentStreak: 0, maxStreak: 2 });
    expect(t.games).toHaveLength(3);
    expect(t.stats[V].exits).toBe(2); // salió en el gol 2 y en el gol 4
    expect(t.stats[A]).toMatchObject({ wins: 1, exits: 1 });
  });

  it('2b. La racha del que se queda sigue tras una rotación', () => {
    const t = courtTimeline([goal('p', R), rotation(V), goal('p', R)], TEAMS, [R, A]);
    expect(t.stats[R].currentStreak).toBe(2);
    expect(t.maxStreak).toBe(2);
  });

  it('3. Empate en Más amonestado → el que llegó primero', () => {
    const r = settle(input([yellow('ana'), yellow('beto'), yellow('beto'), yellow('ana')]));
    expect(market(r, ID.my).winnerSelection).toBe('beto');
    expect(market(r, ID.fy).winnerSelection).toBe('ana');
    expect(market(r, ID.ly).winnerSelection).toBe('ana');
  });

  it('4. Arrastres configurados: cuartete → sextete y gol 15 → gol 28', () => {
    const evs = Array.from({ length: 28 }, (_, i) => goal(i < 6 ? 'pepe' : `p${i}`, [R, V, A][i % 3]));
    // Pepe mete los 6 primeros: cuartete y sextete son de Pepe.
    const m = markets({ [ID.n4]: { rolloverToMarketId: ID.n6 }, [ID.g15]: { rolloverToMarketId: ID.g28 } });
    const r = settle(input(evs, [
      bet('Ana', ID.n4, 'nadie', 3), // nadie acierta cuartete → pasa a sextete
      bet('Beto', ID.n6, 'pepe', 2),
      bet('Carla', ID.g15, 'nadie', 4), // nadie acierta gol 15 → pasa a gol 28
      bet('Dani', ID.g28, 'p27', 1),
    ], m));
    expect(market(r, ID.n4).winnerSelection).toBe('pepe');
    expect(market(r, ID.n4).rolledToMarketId).toBe(ID.n6);
    expect(market(r, ID.n6).totalPotCents).toBe(500);
    expect(paid(r, 'Beto')).toBe(500);
    expect(market(r, ID.g28).totalPotCents).toBe(500);
    expect(paid(r, 'Dani')).toBe(500);
    expect(r.houseCents).toBe(0);
  });

  it('5. Apuestas a equipo y a número: reparto proporcional y redondeo exacto', () => {
    const r = settle(input(baseEvents(), [
      bet('Ana', ID.wins, A, 1), bet('Beto', ID.wins, A, 1), bet('Carla', ID.wins, A, 1), bet('Dani', ID.wins, R, 7),
      bet('Eva', ID.streak, 3, 4), bet('Fito', ID.streak, 3, 1), bet('Gabi', ID.streak, 2, 5),
    ]));
    expect(market(r, ID.wins).payouts.map((p) => p.amountCents)).toEqual([333, 333, 334]);
    expect(market(r, ID.streak).payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([['Eva', 800], ['Fito', 200]]);
  });

  it('5b. Racha de 10 o más se apuesta como "10"', () => {
    const evs = Array.from({ length: 12 }, () => goal('pepe', R));
    expect(market(settle(input(evs)), ID.streak).winnerSelection).toBe('10');
  });

  it('6. Jornada sin goles → goles y equipos devuelven', () => {
    const r = settle(input([yellow('ana')], [bet('Ana', ID.wins, A, 3), bet('Beto', ID.top, 'pepe', 2), bet('Carla', ID.streak, 1, 1)]));
    for (const id of [ID.fg, ID.lg, ID.top, ID.n4, ID.n6, ID.g15, ID.g28, ID.wins, ID.streak, ID.exits, ID.fog]) {
      expect(market(r, id).outcome, id).toBe('refund');
    }
    expect(paid(r, 'Ana')).toBe(300);
    expect(paid(r, 'Beto')).toBe(200);
    expect(market(r, ID.fy).winnerSelection).toBe('ana');
  });

  it('7. Gol para un equipo que no está en cancha → inválido e ignorado en la cancha', () => {
    const bad = goal('pepe', V); // Verde está esperando
    const t = courtTimeline([bad, goal('lucho', A)], TEAMS, [R, A]);
    expect(t.invalidEventIds).toEqual([bad.id]);
    expect(t.games).toHaveLength(1);
    expect(t.stats[V].wins).toBe(0);
  });

  it('Autogol en Pichichi y cuartete no cuenta; Primer autogol no acepta la opción "Autogol"', () => {
    const evs = [ownGoal('juan', R), ownGoal('juan', A), ownGoal('juan', R), ownGoal('juan', V), goal('pepe', R)];
    const r = settle(input(evs, [bet('Ana', ID.fog, OG, 2), bet('Beto', ID.fog, 'juan', 1)]));
    expect(market(r, ID.top).winnerSelection).toBe('pepe');
    expect(market(r, ID.n4).outcome).toBe('refund');
    expect(market(r, ID.fog).payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([['Beto', 300]]);
  });

  it('Primera huacha: la primera víctima', () => {
    expect(market(settle(input([nutmeg('lucho'), nutmeg('pepe')])), ID.nut).winnerSelection).toBe('lucho');
  });
});

// ---- Dinero ---------------------------------------------------------------

describe('reparto y dinero', () => {
  it('Nadie acierta → el bote se lo queda el organizador', () => {
    const r = settle(input([goal('fulanito', R)], [bet('Ana', ID.fg, 'pepito', 4), bet('Luis', ID.fg, 'juanito', 2)]));
    const fg = market(r, ID.fg);
    expect(fg.outcome).toBe('no_winner');
    expect(fg.houseCents).toBe(600);
    expect(r.houseCents).toBe(600);
    expect(paid(r, 'Ana')).toBe(0);
  });

  it('Arrastre configurado: el bote pasa al otro mercado (caso Ana/Luis/Rosa/Beto)', () => {
    const m = markets({ [ID.fg]: { rolloverToMarketId: ID.lg } });
    const r = settle(input([goal('fulanito', R)], [
      bet('Ana', ID.fg, 'pepito', 4), bet('Luis', ID.fg, 'juanito', 2),
      bet('Rosa', ID.lg, 'fulanito', 3), bet('Beto', ID.lg, 'fulanito', 1),
    ], m));
    expect(market(r, ID.lg).totalPotCents).toBe(1000);
    expect(paid(r, 'Rosa')).toBe(750);
    expect(paid(r, 'Beto')).toBe(250);
    expect(r.houseCents).toBe(0);
  });

  it('Ejemplo Ana S/ 4 y Beto S/ 1 en bote de S/ 20', () => {
    const r = settle(input([yellow('y1')], [
      bet('Ana', ID.fy, 'y1', 4), bet('Beto', ID.fy, 'y1', 1), bet('Carla', ID.fy, 'y2', 5), bet('Dani', ID.fy, 'y3', 5), bet('Eva', ID.fy, 'y4', 5),
    ]));
    expect(market(r, ID.fy).payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([['Ana', 1600], ['Beto', 400]]);
  });

  it('Una persona con varios tickets suma su participación', () => {
    const r = settle(input([goal('p1', R)], [bet('Ana', ID.lg, 'p1', 2), bet('Beto', ID.lg, 'p1', 3), bet(' ana ', ID.lg, 'p1', 3), bet('Zoe', ID.lg, 'p9', 2)]));
    expect(market(r, ID.lg).payouts.map((p) => [p.personKey, p.amountCents])).toEqual([['ana', 625], ['beto', 375]]);
  });

  it('Pendientes y rechazadas no cuentan', () => {
    const r = settle(input([goal('p1', R)], [
      bet('Ana', ID.lg, 'p1', 2), bet('Beto', ID.lg, 'p1', 5, 'pending'), bet('Carla', ID.lg, 'p1', 5, 'rejected'), bet('Dani', ID.lg, 'p2', 3),
    ]));
    expect(market(r, ID.lg).betsPotCents).toBe(500);
    expect(market(r, ID.lg).payouts.map((p) => [p.bettorName, p.amountCents])).toEqual([['Ana', 500]]);
  });

  it('Devolución: pozo inicial y arrastre quedan para el organizador', () => {
    const r = settle(input([], [bet('Ana', ID.fg, 'p1', 4)], markets({ [ID.fg]: { initialPot: 10 } })));
    expect(paid(r, 'Ana')).toBe(400);
    expect(r.houseCents).toBe(1000);
  });

  it('Mercado inactivo no cuenta y ciclos de arrastre se anulan', () => {
    const m = markets({ [ID.fg]: { rolloverToMarketId: ID.lg }, [ID.lg]: { rolloverToMarketId: ID.fg }, [ID.fy]: { isActive: false } });
    const r = settle(input([goal('a', R)], [bet('Ana', ID.fg, 'q', 2), bet('Beto', ID.lg, 'q', 3), bet('Carla', ID.fy, 'x', 5)], m));
    expect(r.houseCents).toBe(500);
    expect(r.markets.find((x) => x.marketId === ID.fy)).toBeUndefined();
    expect(r.people.find((p) => p.bettorName === 'Carla')).toBeUndefined();
  });

  it('Tipo desconocido queda sin resolver', () => {
    const r = settle(input([], [], [{ id: 'x', name: 'Raro', type: 'first_corner', param: null, sortOrder: 1, isActive: true, rolloverToMarketId: null, initialPot: 0 }]));
    expect(r.markets[0].outcome).toBe('unresolved');
  });

  it('Nunca se pierde ni sobra dinero (muchos casos aleatorios)', () => {
    let s = 42;
    const rnd = (n: number) => (s = (s * 1103515245 + 12345) % 2 ** 31) % n;
    const ids = Object.values(ID);
    const sel = () => [`j${rnd(4)}`, R, A, V, String(1 + rnd(4)), OG][rnd(6)];
    for (let i = 0; i < 300; i++) {
      const bets: SettleBet[] = [];
      for (let j = 1 + rnd(25); j > 0; j--) {
        bets.push(bet(`P${rnd(8)}`, ids[rnd(ids.length)], sel(), 1 + rnd(5), (['approved', 'approved', 'pending', 'rejected'] as TicketStatus[])[rnd(4)]));
      }
      seq = 0;
      const evs: TimelineEvent[] = [];
      for (let k = rnd(12); k > 0; k--) {
        const kind = rnd(6);
        if (kind < 3) evs.push(goal(`j${rnd(4)}`, TEAMS[rnd(3)]));
        else if (kind === 3) evs.push(ownGoal(`j${rnd(4)}`, TEAMS[rnd(3)]));
        else if (kind === 4) evs.push(yellow(`j${rnd(4)}`));
        else evs.push(rotation(TEAMS[rnd(3)]));
      }
      const initial = rnd(3) === 0 ? 7.35 : 0;
      const m = markets({ [ID.fg]: { initialPot: initial, rolloverToMarketId: rnd(2) ? ID.lg : null } });
      const r = settle(input(evs, bets, m));
      const totalIn = bets.filter((b) => b.ticketStatus === 'approved').reduce((t, b) => t + b.amount * 100, 0) + Math.round(initial * 100);
      const totalOut = r.people.reduce((t, p) => t + p.totalCents, 0) + r.houseCents;
      expect(totalOut).toBe(totalIn);
    }
  });
});

describe('helpers', () => {
  it('formatSoles', () => {
    expect(formatSoles(750)).toBe('S/ 7.50');
    expect(formatSoles(5)).toBe('S/ 0.05');
  });
  it('splitProportional suma exacto', () => {
    expect(splitProportional(100, [{ stakeCents: 1 }, { stakeCents: 1 }, { stakeCents: 1 }]).map((o) => o.amountCents)).toEqual([33, 33, 34]);
  });
});

// ---- Copa Álvaro: mercados de show ----------------------------------------

describe('mercados de show y de equipos nuevos', () => {
  const SHOW_DEFS: [string, string][] = [
    ['first_red', 'Primera roja'],
    ['first_blooper', 'Primer blooper'],
    ['first_penalty_conceded', 'Primer penal cometido'],
    ['first_penalty_missed', 'Primer penal fallado'],
    ['first_post', 'Primer palo'],
    ['first_golazo', 'Primer golazo'],
    ['first_dive', 'Primer piscinazo'],
    ['total_posts', 'Cuántos palos'],
    ['best_team', 'Mejor equipo'],
    ['worst_team', 'Peor equipo'],
  ];
  const showMarkets = (): SettleMarket[] =>
    SHOW_DEFS.map(([type, name], i) => ({ id: name, name, type, param: null, sortOrder: i + 1, isActive: true, rolloverToMarketId: null, initialPot: 0 }));
  const run = (events: TimelineEvent[], bets: SettleBet[] = []) => settle(input(events, bets, showMarkets()));
  const p = (type: TimelineEvent['type'], player: string) => ev({ type, playerId: player });

  it('cada "primer X" gana el primer jugador de ese evento', () => {
    const r = run([
      p('post', 'lucho'), p('red', 'juan'), p('blooper', 'pepe'), p('penalty', 'juan'),
      p('penalty_miss', 'lucho'), p('golazo', 'pepe'), p('dive', 'lucho'), p('red', 'pepe'), p('post', 'pepe'),
    ]);
    const w = (id: string) => market(r, id).winnerSelection;
    expect(w('Primera roja')).toBe('juan');
    expect(w('Primer blooper')).toBe('pepe');
    expect(w('Primer penal cometido')).toBe('juan');
    expect(w('Primer penal fallado')).toBe('lucho');
    expect(w('Primer palo')).toBe('lucho');
    expect(w('Primer golazo')).toBe('pepe');
    expect(w('Primer piscinazo')).toBe('lucho');
    expect(w('Cuántos palos')).toBe('2');
  });

  it('sin el evento → devolución; "Cuántos palos" con 0 sí se resuelve', () => {
    const r = run([], [bet('Ana', 'Primera roja', 'juan', 3), bet('Beto', 'Cuántos palos', 0, 2)]);
    expect(market(r, 'Primera roja').outcome).toBe('refund');
    expect(market(r, 'Cuántos palos').outcome).toBe('winners');
    expect(market(r, 'Cuántos palos').winnerSelection).toBe('0');
  });

  it('"Cuántos palos" topa en 5 ("5 o más")', () => {
    const r = run(Array.from({ length: 7 }, () => p('post', 'pepe')));
    expect(market(r, 'Cuántos palos').winnerSelection).toBe('5');
  });

  it('mejor y peor equipo por % de partiditos ganados', () => {
    // R-A en cancha. Azul gana 2 (sale R, luego V), Rojo gana 1 de 2, Verde pierde su único.
    // Rojo: 1G 1S (50%) · Azul: 2G 1S (67%) · Verde: 0G 1S (0%)
    const r = run([goal('pepe', A), goal('lucho', A), goal('juan', R), goal('pepe', A)]);
    const t = r.timeline.stats;
    expect([t[R].wins, t[A].wins, t[V].wins]).toEqual([1, 2, 0]);
    expect(market(r, 'Mejor equipo').winnerSelection).toBe(A);
    expect(market(r, 'Peor equipo').winnerSelection).toBe(V);
  });

  it('mejor/peor equipo sin goles → devolución', () => {
    const r = run([p('red', 'juan')]);
    expect(market(r, 'Mejor equipo').outcome).toBe('refund');
    expect(market(r, 'Peor equipo').outcome).toBe('refund');
  });
});

