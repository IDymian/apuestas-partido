import { Injectable } from '@angular/core';
import { BetDraft, MAX_BETS_PER_TICKET, MatchEvent, MatchStatus, PublicMatchData } from './models';
import { PublicApi } from './public-api';

/**
 * Backend falso en memoria para probar la app sin Supabase (cuando el .env
 * está vacío). Códigos: DEMO26 (abierto), ENVIVO (en juego), FINAL (finalizado).
 */
@Injectable()
export class MockPublicApi extends PublicApi {
  readonly isDemo = true;
  private data = new Map<string, PublicMatchData>();
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    super();
    this.data.set('DEMO26', buildDemo('DEMO26', 'open', []));
    this.data.set('ENVIVO', buildDemo('ENVIVO', 'closed', [{ type: 'yellow', player: 'p9', minute: 12 }]));
    this.data.set(
      'FINAL',
      buildDemo('FINAL', 'finished', [
        { type: 'yellow', player: 'p9', minute: 12 },
        { type: 'goal', player: 'p3', minute: 45, stoppage: 2 },
      ]),
    );
  }

  async getMatch(code: string): Promise<PublicMatchData | null> {
    await delay(250);
    const d = this.data.get(code.trim().toUpperCase());
    return d ? structuredClone(d) : null;
  }

  async uploadReceipt(matchId: string, _image: Blob): Promise<string> {
    await delay(400);
    return `${matchId}/${crypto.randomUUID()}.jpg`;
  }

  async submitTicket(code: string, bettorName: string, bets: BetDraft[], _receiptPath: string): Promise<string> {
    await delay(500);
    const d = this.data.get(code.toUpperCase());
    if (!d) throw new Error('Partido no encontrado');
    if (d.match.status !== 'open') throw new Error('El partido está cerrado, ya no se aceptan apuestas');
    if (!bettorName.trim()) throw new Error('Escribe tu nombre (máximo 40 caracteres)');
    if (bets.length < 1 || bets.length > MAX_BETS_PER_TICKET) throw new Error('Cada ticket debe tener entre 1 y 20 apuestas');
    // En el modo demo el ticket queda "pendiente": no aparece en la lista pública.
    return crypto.randomUUID();
  }

  subscribe(code: string, onChange: () => void): () => void {
    const key = code.toUpperCase();
    const set = this.listeners.get(key) ?? new Set();
    set.add(onChange);
    this.listeners.set(key, set);
    return () => set.delete(onChange);
  }

  qrUrl(): string | null {
    return null;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildDemo(
  code: string,
  status: MatchStatus,
  events: { type: 'goal' | 'yellow'; player: string; minute: number; stoppage?: number }[],
): PublicMatchData {
  const id = `demo-${code}`;
  const names: [string, 'home' | 'away'][] = [
    ['Pepito Ramírez', 'home'], ['Juanito Torres', 'home'], ['Fulanito Díaz', 'home'],
    ['Carlos Medina', 'home'], ['Raúl Paredes', 'home'], ['Mario Quispe', 'home'],
    ['Diego Salas', 'away'], ['Andrés Rojas', 'away'], ['Hugo Vargas', 'away'],
    ['Kevin Flores', 'away'], ['Óscar Huamán', 'away'], ['Bruno Chávez', 'away'],
  ];
  const players = names.map(([name, team], i) => ({ id: `p${i + 1}`, name, team, is_own_goal: false, sort_order: i + 1 }));
  players.push({ id: 'og', name: 'Autogol', team: null as never, is_own_goal: true, sort_order: 9999 });

  const markets = [
    { id: 'fg', name: 'Primer gol', type: 'first_goal', sort_order: 1, is_active: true, rollover_to_market_id: 'lg', initial_pot: 0, allows_own_goal: true },
    { id: 'lg', name: 'Último gol', type: 'last_goal', sort_order: 2, is_active: true, rollover_to_market_id: null, initial_pot: 5, allows_own_goal: true },
    { id: 'fy', name: 'Primera amarilla', type: 'first_yellow', sort_order: 3, is_active: true, rollover_to_market_id: null, initial_pot: 0, allows_own_goal: false },
  ];

  let n = 0;
  const bet = (name: string, market: string, player: string, amount: number) => ({
    id: `b${++n}`,
    ticket_id: `t-${name}`,
    bettor_name: name,
    market_id: market,
    player_id: player,
    amount,
    created_at: new Date(Date.UTC(2026, 10, 24, 20, n)).toISOString(),
  });
  const bets = [
    bet('Ana', 'fg', 'p1', 4), bet('Ana', 'fy', 'p9', 2),
    bet('Luis', 'fg', 'p2', 2),
    bet('Rosa', 'lg', 'p3', 3),
    bet('Beto', 'lg', 'p3', 1), bet('Beto', 'fy', 'p7', 3),
    bet('Carla Mendoza', 'fy', 'p9', 5), bet('Carla Mendoza', 'lg', 'p7', 2),
  ];

  const evs: MatchEvent[] = events.map((e, i) => ({
    id: `e${i + 1}`, type: e.type, player_id: e.player, minute: e.minute, stoppage: e.stoppage ?? 0, seq: i + 1,
  }));

  return {
    match: {
      id, home_team: 'Los Tigres', away_team: 'Las Águilas',
      starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      access_code: code, status,
      yape_number: '999 888 777', yape_holder: 'Organizador Demo', yape_qr_path: null,
    },
    players: players as PublicMatchData['players'],
    markets,
    events: evs,
    bets,
  };
}
