/**
 * Backend falso en memoria para probar la app SIN Supabase (cuando el .env
 * está vacío). La parte pública y el admin comparten los mismos datos.
 *
 * Jornadas de ejemplo: DEMO26 (en vivo), ABIERTA (apuestas abiertas), FINAL (finalizada).
 * Login admin en modo demo: cualquier correo y contraseña.
 */
import { inject, Injectable } from '@angular/core';
import { AdminApi, EventPatch, NewEvent } from './admin-api';
import {
  AdminMatchData,
  EventRow,
  MarketRow,
  MarketType,
  MatchInput,
  MatchRow,
  MatchStatus,
  MAX_BETS_PER_TICKET,
  PaidRow,
  PlayerRow,
  PublicMatchData,
  TeamRow,
  TicketRow,
  TicketStatus,
} from './models';
import { PublicApi, SubmitBet } from './public-api';

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => structuredClone(x);
const uid = (): string => crypto.randomUUID();

export const MARKET_TYPES: MarketType[] = [
  { type: 'first_goal', label: 'Primer gol', target: 'player', section: 'goles', has_param: false, option_min: null, option_max: null, allows_own_goal: true },
  { type: 'last_goal', label: 'Último gol', target: 'player', section: 'goles', has_param: false, option_min: null, option_max: null, allows_own_goal: true },
  { type: 'top_scorer', label: 'Pichichi (más goles)', target: 'player', section: 'goles', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_to_n_goals', label: 'Primero en llegar a N goles', target: 'player', section: 'goles', has_param: true, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'nth_goal', label: 'Gol número N', target: 'player', section: 'goles', has_param: true, option_min: null, option_max: null, allows_own_goal: true },
  { type: 'most_wins', label: 'Rey de la cancha', target: 'team', section: 'equipos', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'longest_streak', label: 'Racha más larga', target: 'number', section: 'equipos', has_param: false, option_min: 1, option_max: 10, allows_own_goal: false },
  { type: 'most_exits', label: 'Equipo que más sale', target: 'team', section: 'equipos', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_yellow', label: 'Primera amarilla', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'last_yellow', label: 'Última amarilla', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'most_yellows', label: 'El más amonestado', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_own_goal', label: 'Primer autogol', target: 'player', section: 'pichanga', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_nutmeg_victim', label: 'Primera huacha', target: 'player', section: 'pichanga', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
];

/** Igual que el trigger de la BD: nombre, tipo y parámetro de los 15 mercados. */
const DEFAULT_MARKETS: [string, string, number | null][] = [
  ['Primer gol de la noche', 'first_goal', null],
  ['Último gol de la noche', 'last_goal', null],
  ['Pichichi de la noche', 'top_scorer', null],
  ['Primer cuartete', 'first_to_n_goals', 4],
  ['Primer sextete', 'first_to_n_goals', 6],
  ['Gol número 15', 'nth_goal', 15],
  ['Gol número 28', 'nth_goal', 28],
  ['Rey de la cancha', 'most_wins', null],
  ['Racha más larga', 'longest_streak', null],
  ['Equipo que más sale', 'most_exits', null],
  ['Primera amarilla', 'first_yellow', null],
  ['Última amarilla', 'last_yellow', null],
  ['El más amonestado', 'most_yellows', null],
  ['Primer autogol', 'first_own_goal', null],
  ['Primera huacha', 'first_nutmeg_victim', null],
];

export const DEMO_PLAYERS = [
  'Victor Manuel Espino', 'Oscar Fernando Vara', 'Mate Italo Loechle', 'Angel Jose Pariona',
  'Alexis Encalada', 'Adrian Ruiz', 'Iker Gabriel Barturen', 'Braden García',
  'Victor Nicolas Ortiz', 'Diego Guevara', 'Nestor Rojas', 'Paul Espinoza',
  'Fabian Jesus Sandoval', 'Manuel Tumi', 'Bryan Eduardo Barba', 'David Málaga',
  'Lorenzo Balicco', 'Andreow Jomark Santiago', 'David Ignacio Vivar', 'Alvaro Fabrizzio Salazar',
];

@Injectable({ providedIn: 'root' })
export class MockStore {
  matches: MatchRow[] = [];
  teams: TeamRow[] = [];
  players: PlayerRow[] = [];
  markets: MarketRow[] = [];
  tickets: TicketRow[] = [];
  events: EventRow[] = [];
  paid: PaidRow[] = [];
  receipts = new Map<string, string>();
  qrs = new Map<string, string>();
  private seq = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    this.seed();
  }

  nextSeq() {
    return ++this.seq;
  }

  subscribe(code: string, fn: () => void) {
    const key = code.toUpperCase();
    const set = this.listeners.get(key) ?? new Set();
    set.add(fn);
    this.listeners.set(key, set);
    return () => set.delete(fn);
  }

  notify(matchId: string) {
    const code = this.matches.find((m) => m.id === matchId)?.access_code;
    if (code) setTimeout(() => this.listeners.get(code)?.forEach((fn) => fn()), 50);
  }

  /** Igual que el trigger de la BD: Equipo A/B/C, Autogol y los 15 mercados. */
  createMatch(input: MatchInput, status: MatchStatus = 'open', id = uid()): MatchRow {
    const teamIds = ['A', 'B', 'C'].map((l, i) => {
      const t: TeamRow = { id: `${id}-team-${l}`, match_id: id, name: `Equipo ${l}`, sort_order: i + 1, color: null };
      this.teams.push(t);
      return t.id;
    });
    const m: MatchRow = {
      id,
      title: input.title,
      starts_at: input.starts_at,
      access_code: input.access_code.toUpperCase(),
      status,
      closed_at: null,
      starting_team_ids: [teamIds[0], teamIds[1]],
      pay_method: input.pay_method || 'Plin',
      pay_number: input.pay_number,
      pay_holder: input.pay_holder,
      pay_qr_path: null,
      created_at: new Date().toISOString(),
    };
    this.matches.unshift(m);
    this.players.push({ id: `${id}-og`, match_id: id, name: 'Autogol', is_own_goal: true, sort_order: 9999 });
    DEFAULT_MARKETS.forEach(([name, type, param], i) =>
      this.markets.push({ id: `${id}-m${i + 1}`, match_id: id, name, type, param, sort_order: i + 1, is_active: true, rollover_to_market_id: null, initial_pot: 0 }),
    );
    return m;
  }

  addTicket(matchId: string, name: string, bets: { market: string; player?: string; team?: string; option?: number; amount: number }[], status: TicketStatus, minutesAgo: number, reason: string | null = null) {
    const id = uid();
    const market = (n: string) => this.markets.find((m) => m.match_id === matchId && m.name === n)!.id;
    this.tickets.push({
      id,
      match_id: matchId,
      bettor_name: name,
      total: bets.reduce((s, b) => s + b.amount, 0),
      receipt_path: null,
      status,
      reject_reason: reason,
      created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      reviewed_at: status === 'pending' ? null : new Date().toISOString(),
      bets: bets.map((b) => ({
        id: uid(),
        ticket_id: id,
        market_id: market(b.market),
        player_id: b.player ? this.playerId(matchId, b.player) : null,
        team_id: b.team ? `${matchId}-team-${b.team}` : null,
        option_value: b.option ?? null,
        amount: b.amount,
      })),
    });
    return id;
  }

  playerId(matchId: string, name: string) {
    return this.players.find((p) => p.match_id === matchId && p.name === name)!.id;
  }

  private seed() {
    // [código, título, estado, cuántos eventos del guion]
    const scenarios: [string, string, MatchStatus, number][] = [
      ['FINAL', 'Álvaro Fest (terminada)', 'finished', 99],
      ['ABIERTA', 'Pichanga del jueves', 'open', 0],
      ['DEMO26', 'Pichanga de prueba', 'closed', 10],
    ];
    for (const [code, title, status, nEvents] of scenarios) {
      const id = `demo-${code}`;
      this.createMatch(
        { title, starts_at: new Date(Date.now() + (status === 'open' ? 2 : -2) * 3600_000).toISOString(), access_code: code, pay_method: 'Plin', pay_number: '999 888 777', pay_holder: 'Organizador Demo' },
        status,
        id,
      );
      DEMO_PLAYERS.forEach((name, i) => this.players.push({ id: `${id}-p${i + 1}`, match_id: id, name, is_own_goal: false, sort_order: i + 1 }));
      if (status !== 'open') this.matches.find((m) => m.id === id)!.closed_at = new Date(Date.now() - 90 * 60_000).toISOString();

      this.addTicket(id, 'Ana', [
        { market: 'Primer gol de la noche', player: 'Victor Manuel Espino', amount: 4 },
        { market: 'Rey de la cancha', team: 'A', amount: 3 },
        { market: 'Primera amarilla', player: 'Diego Guevara', amount: 2 },
        { market: 'Racha más larga', option: 3, amount: 2 },
      ], 'approved', 180);
      this.addTicket(id, 'Luis', [
        { market: 'Primer gol de la noche', player: 'Adrian Ruiz', amount: 2 },
        { market: 'Pichichi de la noche', player: 'Victor Manuel Espino', amount: 5 },
        { market: 'Equipo que más sale', team: 'C', amount: 3 },
        { market: 'Primer autogol', player: 'Nestor Rojas', amount: 1 },
      ], 'approved', 170);
      this.addTicket(id, 'Rosa', [
        { market: 'Último gol de la noche', player: 'David Málaga', amount: 3 },
        { market: 'Primer cuartete', player: 'Victor Manuel Espino', amount: 2 },
        { market: 'Gol número 15', player: 'Autogol', amount: 1 },
        { market: 'Primera huacha', player: 'Paul Espinoza', amount: 4 },
      ], 'approved', 160);
      this.addTicket(id, 'Beto', [
        { market: 'Rey de la cancha', team: 'B', amount: 5 },
        { market: 'Racha más larga', option: 2, amount: 3 },
        { market: 'El más amonestado', player: 'Diego Guevara', amount: 2 },
        { market: 'Última amarilla', player: 'Manuel Tumi', amount: 1 },
        { market: 'Primer sextete', player: 'Adrian Ruiz', amount: 1 },
        { market: 'Gol número 28', player: 'David Málaga', amount: 1 },
      ], 'approved', 150);
      this.addTicket(id, 'Carla', [{ market: 'Primer gol de la noche', player: 'Paul Espinoza', amount: 5 }], 'pending', 140);
      this.addTicket(id, 'Dani', [{ market: 'Rey de la cancha', team: 'C', amount: 5 }], 'rejected', 135, 'No llegó el Plin');

      const T = (l: string) => `${id}-team-${l}`;
      const P = (n: string) => this.playerId(id, n);
      const script: Omit<EventRow, 'id' | 'match_id' | 'seq'>[] = [
        { type: 'goal', player_id: P('Victor Manuel Espino'), team_id: T('A'), is_own_goal: false, team_out_id: null, minute: 5 },
        { type: 'yellow', player_id: P('Diego Guevara'), team_id: null, is_own_goal: false, team_out_id: null, minute: 8 },
        { type: 'goal', player_id: P('Adrian Ruiz'), team_id: T('A'), is_own_goal: false, team_out_id: null, minute: 12 },
        { type: 'nutmeg', player_id: P('Paul Espinoza'), team_id: null, is_own_goal: false, team_out_id: null, minute: 15 },
        { type: 'goal', player_id: P('Nestor Rojas'), team_id: T('B'), is_own_goal: true, team_out_id: null, minute: 20 },
        { type: 'goal', player_id: P('Victor Manuel Espino'), team_id: T('B'), is_own_goal: false, team_out_id: null, minute: 26 },
        { type: 'yellow', player_id: P('Diego Guevara'), team_id: null, is_own_goal: false, team_out_id: null, minute: 30 },
        { type: 'rotation', player_id: null, team_id: null, is_own_goal: false, team_out_id: T('B'), minute: 35 },
        { type: 'goal', player_id: P('David Málaga'), team_id: T('C'), is_own_goal: false, team_out_id: null, minute: 41 },
        { type: 'yellow', player_id: P('Manuel Tumi'), team_id: null, is_own_goal: false, team_out_id: null, minute: 44 },
        // Solo en FINAL:
        { type: 'goal', player_id: P('David Málaga'), team_id: T('C'), is_own_goal: false, team_out_id: null, minute: 52 },
        { type: 'goal', player_id: P('Victor Manuel Espino'), team_id: T('B'), is_own_goal: false, team_out_id: null, minute: 60 },
        { type: 'goal', player_id: P('Victor Manuel Espino'), team_id: T('B'), is_own_goal: false, team_out_id: null, minute: 71 },
        { type: 'goal', player_id: P('Victor Manuel Espino'), team_id: T('B'), is_own_goal: false, team_out_id: null, minute: 80 },
      ];
      for (const e of script.slice(0, nEvents)) this.events.push({ ...e, id: uid(), match_id: id, seq: this.nextSeq() });
    }
  }
}

// ---------------------------------------------------------------------------
// Parte pública (demo)
// ---------------------------------------------------------------------------
@Injectable()
export class MockPublicApi extends PublicApi {
  readonly isDemo = true;
  private s = inject(MockStore);

  async getMatch(code: string): Promise<PublicMatchData | null> {
    await delay();
    const m = this.s.matches.find((x) => x.access_code === code.trim().toUpperCase());
    if (!m) return null;
    const types = new Map(MARKET_TYPES.map((t) => [t.type, t]));
    const approved = this.s.tickets
      .filter((t) => t.match_id === m.id && t.status === 'approved')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const { created_at: _c, ...match } = m;
    return clone({
      match,
      teams: this.s.teams.filter((t) => t.match_id === m.id).sort((a, b) => a.sort_order - b.sort_order),
      players: this.s.players
        .filter((p) => p.match_id === m.id)
        .sort((a, b) => Number(a.is_own_goal) - Number(b.is_own_goal) || a.sort_order - b.sort_order),
      markets: this.s.markets
        .filter((k) => k.match_id === m.id && k.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((k) => {
          const t = types.get(k.type)!;
          return { ...k, target: t.target, section: t.section, option_min: t.option_min, option_max: t.option_max, allows_own_goal: t.allows_own_goal };
        }),
      events: this.s.events.filter((e) => e.match_id === m.id).sort((a, b) => a.minute - b.minute || a.seq - b.seq),
      bets: approved.flatMap((t) =>
        t.bets.map((b) => ({
          id: b.id, ticket_id: t.id, bettor_name: t.bettor_name, market_id: b.market_id,
          player_id: b.player_id, team_id: b.team_id, option_value: b.option_value, amount: b.amount, created_at: t.created_at,
        })),
      ),
    });
  }

  async uploadReceipt(matchId: string, image: Blob): Promise<string> {
    await delay(300);
    const path = `${matchId}/${uid()}.jpg`;
    this.s.receipts.set(path, URL.createObjectURL(image));
    return path;
  }

  async submitTicket(code: string, bettorName: string, bets: SubmitBet[], receiptPath: string): Promise<string> {
    await delay(400);
    const m = this.s.matches.find((x) => x.access_code === code.toUpperCase());
    if (!m) throw new Error('Jornada no encontrada');
    if (m.status !== 'open') throw new Error('Las apuestas están cerradas');
    const name = bettorName.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 40) throw new Error('Escribe tu nombre (máximo 40 caracteres)');
    if (bets.length < 1 || bets.length > MAX_BETS_PER_TICKET) throw new Error('Cada ticket debe tener entre 1 y 20 apuestas');
    if (bets.some((b) => b.amount < 1 || b.amount > 5)) throw new Error('Cada apuesta debe ser de S/ 1 a S/ 5');
    const id = uid();
    this.s.tickets.push({
      id, match_id: m.id, bettor_name: name, total: bets.reduce((s, b) => s + b.amount, 0), receipt_path: receiptPath,
      status: 'pending', reject_reason: null, created_at: new Date().toISOString(), reviewed_at: null,
      bets: bets.map((b) => ({
        id: uid(), ticket_id: id, market_id: b.marketId, amount: b.amount,
        player_id: b.target === 'player' ? b.selection : null,
        team_id: b.target === 'team' ? b.selection : null,
        option_value: b.target === 'number' ? Number(b.selection) : null,
      })),
    });
    this.s.notify(m.id);
    return id;
  }

  subscribe(code: string, onChange: () => void) {
    return this.s.subscribe(code, onChange);
  }

  qrUrl(path: string | null) {
    return path ? (this.s.qrs.get(path) ?? null) : null;
  }
}

// ---------------------------------------------------------------------------
// Admin (demo)
// ---------------------------------------------------------------------------
@Injectable()
export class MockAdminApi extends AdminApi {
  readonly isDemo = true;
  private s = inject(MockStore);
  private email: string | null = readDemoSession();

  async currentEmail() {
    return this.email;
  }
  async signIn(email: string, password: string) {
    await delay();
    if (!email.trim() || !password) throw new Error('Escribe correo y contraseña');
    this.email = email.trim();
    writeDemoSession(this.email);
  }
  async signOut() {
    this.email = null;
    writeDemoSession(null);
  }
  async isAdmin() {
    return !!this.email;
  }

  async listMatches() {
    await delay();
    return clone(this.s.matches);
  }

  async getMatch(id: string): Promise<AdminMatchData | null> {
    await delay();
    const match = this.s.matches.find((m) => m.id === id);
    if (!match) return null;
    return clone({
      match,
      teams: this.s.teams.filter((t) => t.match_id === id).sort((a, b) => a.sort_order - b.sort_order),
      players: this.s.players.filter((p) => p.match_id === id).sort((a, b) => a.sort_order - b.sort_order),
      markets: this.s.markets.filter((m) => m.match_id === id).sort((a, b) => a.sort_order - b.sort_order),
      marketTypes: MARKET_TYPES,
      tickets: this.s.tickets.filter((t) => t.match_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      events: this.s.events.filter((e) => e.match_id === id).sort((a, b) => a.minute - b.minute || a.seq - b.seq),
      paid: this.s.paid.filter((p) => p.match_id === id),
    });
  }

  async saveMatch(input: MatchInput) {
    await delay();
    const code = input.access_code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Error('El código debe tener de 4 a 20 letras o números');
    if (this.s.matches.some((m) => m.access_code === code && m.id !== input.id)) throw new Error('Ese código ya lo usa otra jornada');
    const clean = { ...input, access_code: code, title: input.title.trim(), pay_method: input.pay_method?.trim() || 'Plin' };
    if (input.id) {
      const m = this.s.matches.find((x) => x.id === input.id)!;
      Object.assign(m, clean);
      this.s.notify(m.id);
      return clone(m);
    }
    return clone(this.s.createMatch(clean));
  }

  async setStatus(matchId: string, status: MatchStatus) {
    const m = this.s.matches.find((x) => x.id === matchId)!;
    if (status === 'closed' && m.status === 'open' && !m.closed_at) m.closed_at = new Date().toISOString();
    m.status = status;
    this.s.notify(matchId);
  }

  async setStartingTeams(matchId: string, teamIds: [string, string]) {
    this.s.matches.find((x) => x.id === matchId)!.starting_team_ids = teamIds;
    this.s.notify(matchId);
  }

  async uploadQr(matchId: string, file: Blob) {
    const path = `${matchId}/${uid()}.jpg`;
    this.s.qrs.set(path, URL.createObjectURL(file));
    this.s.matches.find((m) => m.id === matchId)!.pay_qr_path = path;
    this.s.notify(matchId);
  }

  async removeQr(matchId: string) {
    this.s.matches.find((m) => m.id === matchId)!.pay_qr_path = null;
    this.s.notify(matchId);
  }

  async addPlayers(matchId: string, names: string[]) {
    let order = Math.max(0, ...this.s.players.filter((p) => p.match_id === matchId && !p.is_own_goal).map((p) => p.sort_order));
    for (const name of names) this.s.players.push({ id: uid(), match_id: matchId, name, is_own_goal: false, sort_order: ++order });
    this.s.notify(matchId);
  }

  async renamePlayer(id: string, name: string) {
    const p = this.s.players.find((x) => x.id === id)!;
    p.name = name;
    this.s.notify(p.match_id);
  }

  async deletePlayer(id: string) {
    const p = this.s.players.find((x) => x.id === id)!;
    this.s.players = this.s.players.filter((x) => x.id !== id);
    this.s.events = this.s.events.filter((e) => e.player_id !== id);
    for (const t of this.s.tickets) t.bets = t.bets.filter((b) => b.player_id !== id);
    this.s.notify(p.match_id);
  }

  async saveMarket(m: Partial<MarketRow> & { match_id: string }) {
    if (m.rollover_to_market_id) {
      let next: string | null = m.rollover_to_market_id;
      for (let i = 0; next && i < 100; i++) {
        if (next === m.id) throw new Error('El arrastre forma un ciclo entre mercados');
        next = this.s.markets.find((x) => x.id === next)?.rollover_to_market_id ?? null;
      }
    }
    if (m.id) {
      Object.assign(this.s.markets.find((x) => x.id === m.id)!, m);
    } else {
      this.s.markets.push({
        id: uid(), name: 'Nuevo mercado', type: 'first_goal', param: null, sort_order: 99, is_active: true,
        rollover_to_market_id: null, initial_pot: 0, ...m,
      } as MarketRow);
    }
    this.s.notify(m.match_id);
  }

  async deleteMarket(id: string) {
    const m = this.s.markets.find((x) => x.id === id)!;
    this.s.markets = this.s.markets.filter((x) => x.id !== id);
    for (const x of this.s.markets) if (x.rollover_to_market_id === id) x.rollover_to_market_id = null;
    for (const t of this.s.tickets) t.bets = t.bets.filter((b) => b.market_id !== id);
    this.s.notify(m.match_id);
  }

  async setTicketStatus(id: string, status: TicketStatus, reason?: string | null) {
    await delay(150);
    const t = this.s.tickets.find((x) => x.id === id)!;
    t.status = status;
    t.reject_reason = status === 'rejected' ? reason?.trim() || null : null;
    t.reviewed_at = status === 'pending' ? null : new Date().toISOString();
    this.s.notify(t.match_id);
  }

  async receiptUrl(path: string) {
    return this.s.receipts.get(path) ?? null;
  }

  async addEvent(e: NewEvent) {
    this.s.events.push({ ...e, id: uid(), seq: this.s.nextSeq() });
    this.s.notify(e.match_id);
  }

  async updateEvent(id: string, patch: EventPatch) {
    const e = this.s.events.find((x) => x.id === id)!;
    Object.assign(e, patch);
    this.s.notify(e.match_id);
  }

  async deleteEvent(id: string) {
    const e = this.s.events.find((x) => x.id === id)!;
    this.s.events = this.s.events.filter((x) => x.id !== id);
    this.s.notify(e.match_id);
  }

  async setPaid(matchId: string, personKey: string, bettorName: string, paid: boolean) {
    this.s.paid = this.s.paid.filter((p) => !(p.match_id === matchId && p.person_key === personKey));
    if (paid) this.s.paid.push({ match_id: matchId, person_key: personKey, bettor_name: bettorName, paid_at: new Date().toISOString() });
  }
}

function readDemoSession(): string | null {
  try {
    return sessionStorage.getItem('apuestas:demo-admin');
  } catch {
    return null;
  }
}
function writeDemoSession(email: string | null) {
  try {
    if (email) sessionStorage.setItem('apuestas:demo-admin', email);
    else sessionStorage.removeItem('apuestas:demo-admin');
  } catch {
    /* sin almacenamiento */
  }
}
