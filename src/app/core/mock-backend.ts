/**
 * Backend falso en memoria para probar la app SIN Supabase (cuando el .env
 * está vacío). La parte pública y el admin comparten los mismos datos, así que
 * lo que apruebas en /admin aparece en el bote en vivo.
 *
 * Partidos de ejemplo: DEMO26 (abierto), ENVIVO (en juego), FINAL (finalizado).
 * Login admin en modo demo: cualquier correo y contraseña.
 */
import { inject, Injectable } from '@angular/core';
import { AdminApi, EventPatch, NewEvent } from './admin-api';
import {
  AdminMatchData,
  BetDraft,
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
  Team,
  TicketRow,
  TicketStatus,
} from './models';
import { PublicApi } from './public-api';

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => structuredClone(x);
const uid = (): string => crypto.randomUUID();

const MARKET_TYPES: MarketType[] = [
  { type: 'first_goal', label: 'Primer gol', allows_own_goal: true, event_type: 'goal' },
  { type: 'last_goal', label: 'Último gol', allows_own_goal: true, event_type: 'goal' },
  { type: 'first_yellow', label: 'Primera tarjeta amarilla', allows_own_goal: false, event_type: 'yellow' },
];

@Injectable({ providedIn: 'root' })
export class MockStore {
  matches: MatchRow[] = [];
  players: PlayerRow[] = [];
  markets: MarketRow[] = [];
  tickets: TicketRow[] = [];
  events: EventRow[] = [];
  paid: PaidRow[] = [];
  /** ruta de captura → URL local de la imagen subida */
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

  /** Igual que el trigger de la BD: crea Autogol y los 3 mercados por defecto. */
  createMatch(input: MatchInput, status: MatchStatus = 'open', id = uid()): MatchRow {
    const m: MatchRow = {
      id,
      home_team: input.home_team,
      away_team: input.away_team,
      starts_at: input.starts_at,
      access_code: input.access_code.toUpperCase(),
      status,
      yape_number: input.yape_number,
      yape_holder: input.yape_holder,
      yape_qr_path: null,
      created_at: new Date().toISOString(),
    };
    this.matches.unshift(m);
    this.players.push({ id: `${id}-og`, match_id: id, name: 'Autogol', team: null, is_own_goal: true, sort_order: 9999 });
    const base = { match_id: id, is_active: true, initial_pot: 0 };
    this.markets.push(
      { ...base, id: `${id}-fg`, name: 'Primer gol', type: 'first_goal', sort_order: 1, rollover_to_market_id: `${id}-lg` },
      { ...base, id: `${id}-lg`, name: 'Último gol', type: 'last_goal', sort_order: 2, rollover_to_market_id: null },
      { ...base, id: `${id}-fy`, name: 'Primera amarilla', type: 'first_yellow', sort_order: 3, rollover_to_market_id: null },
    );
    return m;
  }

  addTicket(matchId: string, name: string, bets: BetDraft[], status: TicketStatus, minutesAgo: number, reason: string | null = null) {
    const id = uid();
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
      bets: bets.map((b) => ({ id: uid(), ticket_id: id, market_id: b.marketId, player_id: b.playerId, amount: b.amount })),
    });
    return id;
  }

  private seed() {
    const names: [string, Team][] = [
      ['Pepito Ramírez', 'home'], ['Juanito Torres', 'home'], ['Fulanito Díaz', 'home'],
      ['Carlos Medina', 'home'], ['Raúl Paredes', 'home'], ['Mario Quispe', 'home'],
      ['Diego Salas', 'away'], ['Andrés Rojas', 'away'], ['Hugo Vargas', 'away'],
      ['Kevin Flores', 'away'], ['Óscar Huamán', 'away'], ['Bruno Chávez', 'away'],
    ];
    const scenarios: [string, MatchStatus, [string, 'goal' | 'yellow', number, number][]][] = [
      ['FINAL', 'finished', [['p9', 'yellow', 12, 0], ['p3', 'goal', 45, 2]]],
      ['ENVIVO', 'closed', [['p9', 'yellow', 12, 0]]],
      ['DEMO26', 'open', []],
    ];
    for (const [code, status, evs] of scenarios) {
      const id = `demo-${code}`;
      this.createMatch(
        {
          home_team: 'Los Tigres',
          away_team: 'Las Águilas',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          access_code: code,
          yape_number: '999 888 777',
          yape_holder: 'Organizador Demo',
        },
        status,
        id,
      );
      names.forEach(([name, team], i) =>
        this.players.push({ id: `${id}-p${i + 1}`, match_id: id, name, team, is_own_goal: false, sort_order: i + 1 }),
      );
      this.markets.find((m) => m.id === `${id}-lg`)!.initial_pot = 5;
      const p = (n: string) => `${id}-${n}`;
      const fg = p('fg'), lg = p('lg'), fy = p('fy');
      this.addTicket(id, 'Ana', [{ marketId: fg, playerId: p('p1'), amount: 4 }, { marketId: fy, playerId: p('p9'), amount: 2 }], 'approved', 90);
      this.addTicket(id, 'Luis', [{ marketId: fg, playerId: p('p2'), amount: 2 }], 'approved', 80);
      this.addTicket(id, 'Rosa', [{ marketId: lg, playerId: p('p3'), amount: 3 }], 'approved', 70);
      this.addTicket(id, 'Beto', [{ marketId: lg, playerId: p('p3'), amount: 1 }, { marketId: fy, playerId: p('p7'), amount: 3 }], 'approved', 60);
      this.addTicket(id, 'Carla Mendoza', [{ marketId: fy, playerId: p('p9'), amount: 5 }, { marketId: lg, playerId: p('p7'), amount: 2 }], 'approved', 50);
      if (status === 'open') {
        this.addTicket(id, 'Jorge', [{ marketId: lg, playerId: p('p8'), amount: 5 }, { marketId: fg, playerId: p('og'), amount: 1 }], 'pending', 10);
        this.addTicket(id, 'Dani', [{ marketId: fg, playerId: p('p10'), amount: 5 }], 'rejected', 30, 'No llegó el Yape');
      }
      for (const [pl, type, minute, stoppage] of evs) {
        this.events.push({ id: uid(), match_id: id, type, player_id: p(pl), minute, stoppage, seq: this.nextSeq() });
      }
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
    return clone({
      match: {
        id: m.id, home_team: m.home_team, away_team: m.away_team, starts_at: m.starts_at, access_code: m.access_code,
        status: m.status, yape_number: m.yape_number, yape_holder: m.yape_holder, yape_qr_path: m.yape_qr_path,
      },
      players: this.s.players
        .filter((p) => p.match_id === m.id)
        .sort((a, b) => Number(a.is_own_goal) - Number(b.is_own_goal) || a.sort_order - b.sort_order),
      markets: this.s.markets
        .filter((k) => k.match_id === m.id && k.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((k) => ({ ...k, allows_own_goal: types.get(k.type)?.allows_own_goal ?? false })),
      events: this.s.events
        .filter((e) => e.match_id === m.id)
        .sort((a, b) => a.minute - b.minute || a.stoppage - b.stoppage || a.seq - b.seq),
      bets: approved.flatMap((t) =>
        t.bets.map((b) => ({ id: b.id, ticket_id: t.id, bettor_name: t.bettor_name, market_id: b.market_id, player_id: b.player_id, amount: b.amount, created_at: t.created_at })),
      ),
    });
  }

  async uploadReceipt(matchId: string, image: Blob): Promise<string> {
    await delay(300);
    const path = `${matchId}/${uid()}.jpg`;
    this.s.receipts.set(path, URL.createObjectURL(image));
    return path;
  }

  async submitTicket(code: string, bettorName: string, bets: BetDraft[], receiptPath: string): Promise<string> {
    await delay(400);
    const m = this.s.matches.find((x) => x.access_code === code.toUpperCase());
    if (!m) throw new Error('Partido no encontrado');
    if (m.status !== 'open') throw new Error('El partido está cerrado, ya no se aceptan apuestas');
    const name = bettorName.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 40) throw new Error('Escribe tu nombre (máximo 40 caracteres)');
    if (bets.length < 1 || bets.length > MAX_BETS_PER_TICKET) throw new Error('Cada ticket debe tener entre 1 y 20 apuestas');
    if (bets.some((b) => b.amount < 1 || b.amount > 5)) throw new Error('Cada apuesta debe ser de S/ 1 a S/ 5');
    const id = this.s.addTicket(m.id, name, bets, 'pending', 0);
    this.s.tickets.find((t) => t.id === id)!.receipt_path = receiptPath;
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
      players: this.s.players.filter((p) => p.match_id === id).sort((a, b) => a.sort_order - b.sort_order),
      markets: this.s.markets.filter((m) => m.match_id === id).sort((a, b) => a.sort_order - b.sort_order),
      marketTypes: MARKET_TYPES,
      tickets: this.s.tickets.filter((t) => t.match_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      events: this.s.events
        .filter((e) => e.match_id === id)
        .sort((a, b) => a.minute - b.minute || a.stoppage - b.stoppage || a.seq - b.seq),
      paid: this.s.paid.filter((p) => p.match_id === id),
    });
  }

  async saveMatch(input: MatchInput) {
    await delay();
    const code = input.access_code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Error('El código debe tener de 4 a 20 letras o números');
    if (this.s.matches.some((m) => m.access_code === code && m.id !== input.id)) throw new Error('Ese código ya lo usa otro partido');
    const clean = { ...input, access_code: code, home_team: input.home_team.trim(), away_team: input.away_team.trim() };
    if (input.id) {
      const m = this.s.matches.find((x) => x.id === input.id)!;
      Object.assign(m, clean);
      this.s.notify(m.id);
      return clone(m);
    }
    return clone(this.s.createMatch(clean));
  }

  async setStatus(matchId: string, status: MatchStatus) {
    this.s.matches.find((m) => m.id === matchId)!.status = status;
    this.s.notify(matchId);
  }

  async uploadQr(matchId: string, file: Blob) {
    const path = `${matchId}/${uid()}.jpg`;
    this.s.qrs.set(path, URL.createObjectURL(file));
    this.s.matches.find((m) => m.id === matchId)!.yape_qr_path = path;
    this.s.notify(matchId);
  }

  async removeQr(matchId: string) {
    this.s.matches.find((m) => m.id === matchId)!.yape_qr_path = null;
    this.s.notify(matchId);
  }

  async addPlayers(matchId: string, team: Team, names: string[]) {
    let order = Math.max(0, ...this.s.players.filter((p) => p.match_id === matchId && !p.is_own_goal).map((p) => p.sort_order));
    for (const name of names) {
      this.s.players.push({ id: uid(), match_id: matchId, name, team, is_own_goal: false, sort_order: ++order });
    }
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
        id: uid(), name: 'Nuevo mercado', type: 'first_goal', sort_order: 99, is_active: true,
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
    return sessionStorage.getItem('polla:demo-admin');
  } catch {
    return null;
  }
}
function writeDemoSession(email: string | null) {
  try {
    if (email) sessionStorage.setItem('polla:demo-admin', email);
    else sessionStorage.removeItem('polla:demo-admin');
  } catch {
    /* sin almacenamiento */
  }
}
