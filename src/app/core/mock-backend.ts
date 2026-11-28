/**
 * Backend falso en memoria para probar la app SIN Supabase (cuando el .env
 * está vacío). La parte pública y el admin comparten los mismos datos.
 *
 * Solo para pruebas locales (npm run start:mock / test:e2e): una jornada "COPA" sin jugar.
 * Admin local: cualquier correo y contraseña.
 */
import { inject, Injectable } from '@angular/core';
import { AdminApi, EventPatch, NewEvent, PlayerPatch } from './admin-api';
import { AuthApi } from './auth';
import { league, marketOpen } from '../domain/league';
import { GAME_MARKETS } from '../domain/game-markets';
import { numberMaxOption } from '../domain/settlement';
import { teamOrder, toTimelineEvents } from '../domain/adapt';
import { uuid } from './uid';
import { DEFAULT_TEAM_KITS, KIT_BY_ID, kitAccent } from './kits';
import {
  AdminMatchData,
  ChatMessage,
  DEFAULT_PAY_HOLDER,
  BalanceRow,
  CreditRow,
  DEFAULT_PAY_METHOD,
  DepositRow,
  SettlementRow,
  MyTicket,
  Wallet,
  EventRow,
  GameModeId,
  MarketRow,
  MarketType,
  MatchInput,
  MatchRow,
  MatchStatus,
  MAX_BETS_PER_TICKET,
  PaidRow,
  PlayerPosition,
  PlayerRow,
  PublicMatchData,
  ScheduledGame,
  TeamRow,
  TicketRow,
  TicketStatus,
} from './models';
import { PublicApi, SubmitBet } from './public-api';

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => structuredClone(x);
const uid = (): string => uuid();

export const MARKET_TYPES: MarketType[] = [
  { type: 'first_goal', label: 'Primer gol', target: 'player', section: 'goles', has_param: false, option_min: null, option_max: null, allows_own_goal: true },
  { type: 'last_goal', label: 'Último gol', target: 'player', section: 'goles', has_param: false, option_min: null, option_max: null, allows_own_goal: true },
  { type: 'top_scorer', label: 'Goleador (más goles)', target: 'player', section: 'goles', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_to_n_goals', label: 'Primero en llegar a N goles', target: 'player', section: 'goles', has_param: true, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'nth_goal', label: 'Gol número N', target: 'player', section: 'goles', has_param: true, option_min: null, option_max: null, allows_own_goal: true },
  { type: 'first_yellow', label: 'Primera amarilla', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'last_yellow', label: 'Última amarilla', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'most_yellows', label: 'El más amonestado', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_own_goal', label: 'Primer autogol', target: 'player', section: 'pichanga', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_nutmeg_victim', label: 'Primera huacha', target: 'player', section: 'pichanga', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'best_team', label: 'Campeón de la liga', target: 'team', section: 'equipos', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'worst_team', label: 'Último de la tabla', target: 'team', section: 'equipos', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'top_scoring_team', label: 'Equipo más goleador', target: 'team', section: 'equipos', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'most_conceded_team', label: 'Equipo más goleado', target: 'team', section: 'equipos', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  ...GAME_MARKETS.map((d) => ({
    type: d.type, label: `${d.label} (partido N)`, target: d.target, section: 'partidos' as const, has_param: true,
    option_min: d.target === 'number' ? 0 : null, option_max: d.target === 'number' ? numberMaxOption(d.type) : null, allows_own_goal: !!d.allowsOwnGoal,
  })),
  { type: 'first_red', label: 'Primera roja', target: 'player', section: 'amarillas', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_blooper', label: 'Primer blooper', target: 'player', section: 'show', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_penalty_conceded', label: 'Primer penal cometido', target: 'player', section: 'show', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_penalty_missed', label: 'Primer penal fallado', target: 'player', section: 'show', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_post', label: 'Primer palo', target: 'player', section: 'show', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_golazo', label: 'Primer golazo', target: 'player', section: 'show', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'first_dive', label: 'Primer piscinazo', target: 'player', section: 'show', has_param: false, option_min: null, option_max: null, allows_own_goal: false },
  { type: 'total_posts', label: '¿Cuántos palos?', target: 'number', section: 'show', has_param: false, option_min: 0, option_max: 5, allows_own_goal: false },
];

/** Igual que los triggers de la BD: los mercados de toda la jornada (los de cada partido se agregan aparte). */
const DEFAULT_MARKETS: [string, string, number | null][] = [
  ['Goleador de la noche', 'top_scorer', null],
  ['Primero en meter 4', 'first_to_n_goals', 4],
  ['Primero en meter 6', 'first_to_n_goals', 6],
  ['Gol número 15', 'nth_goal', 15],
  ['Gol número 28', 'nth_goal', 28],
  ['El más leñero (más amarillas)', 'most_yellows', null],
  ['Campeón de la liga', 'best_team', null],
  ['El colero (peor equipo)', 'worst_team', null],
  ['Equipo más goleador', 'top_scoring_team', null],
  ['Equipo más goleado', 'most_conceded_team', null],
  ['¿Cuántos palos habrá?', 'total_posts', null],
];

/** Jornada y cuenta de las pruebas automáticas. */
export const TEST_CODE = 'COPA';
export const TEST_USER_ID = 'prueba-user';

interface SeedSlot {
  team: 1 | 2 | 3;
  shirt: number;
  position: PlayerPosition;
  slot: number;
}

interface SeedPlayer {
  name: string;
  m1: SeedSlot;
  m2: SeedSlot;
  m3: SeedSlot;
}

const DEFAULT_TEAMS = DEFAULT_TEAM_KITS.map((t, i) => ({
  key: String(i + 1),
  name: t.name,
  kit_id: t.kit,
  color: kitAccent(KIT_BY_ID.get(t.kit)!),
  formation: '2-2-1',
}));

/**
 * Plantel confirmado (20). Modo 1 = Ronda 1; Modo 2 = Ronda 2; Modo 3 = Ronda 3 (Equipo 1 de Álvaro).
 * Equipos de 7 y 6: en cada equipo el orden es ARQ, DEF, DEF, MED, MED, DEL y el 7º al banco (SUB).
 * Posiciones, equipos y dorsales son editables desde el admin por modo.
 */
export const DEFAULT_ROSTER: SeedPlayer[] = [
  // Ronda 1 · Equipo 1
  { name: 'Diego', m1: { team: 1, shirt: 1, position: 'GK', slot: 0 }, m2: { team: 2, shirt: 1, position: 'GK', slot: 0 }, m3: { team: 2, shirt: 8, position: 'MID', slot: 0 } },
  { name: 'Mate', m1: { team: 1, shirt: 4, position: 'DEF', slot: 0 }, m2: { team: 2, shirt: 4, position: 'DEF', slot: 0 }, m3: { team: 2, shirt: 10, position: 'MID', slot: 1 } },
  { name: 'Angel', m1: { team: 1, shirt: 5, position: 'DEF', slot: 1 }, m2: { team: 1, shirt: 5, position: 'DEF', slot: 1 }, m3: { team: 3, shirt: 10, position: 'MID', slot: 1 } },
  { name: 'Victor', m1: { team: 1, shirt: 8, position: 'MID', slot: 0 }, m2: { team: 1, shirt: 8, position: 'MID', slot: 0 }, m3: { team: 3, shirt: 1, position: 'GK', slot: 0 } },
  { name: 'Manuel', m1: { team: 1, shirt: 10, position: 'MID', slot: 1 }, m2: { team: 3, shirt: 10, position: 'MID', slot: 1 }, m3: { team: 1, shirt: 9, position: 'FWD', slot: 0 } },
  { name: 'Iker', m1: { team: 1, shirt: 9, position: 'FWD', slot: 0 }, m2: { team: 2, shirt: 8, position: 'MID', slot: 0 }, m3: { team: 3, shirt: 5, position: 'DEF', slot: 1 } },
  { name: 'Nestor', m1: { team: 1, shirt: 12, position: 'SUB', slot: 0 }, m2: { team: 3, shirt: 4, position: 'DEF', slot: 0 }, m3: { team: 1, shirt: 4, position: 'DEF', slot: 0 } },
  // Ronda 1 · Equipo 2
  { name: 'Paul', m1: { team: 2, shirt: 1, position: 'GK', slot: 0 }, m2: { team: 3, shirt: 5, position: 'DEF', slot: 1 }, m3: { team: 2, shirt: 1, position: 'GK', slot: 0 } },
  { name: 'Nicolas', m1: { team: 2, shirt: 4, position: 'DEF', slot: 0 }, m2: { team: 2, shirt: 5, position: 'DEF', slot: 1 }, m3: { team: 2, shirt: 4, position: 'DEF', slot: 0 } },
  { name: 'Oscar', m1: { team: 2, shirt: 5, position: 'DEF', slot: 1 }, m2: { team: 1, shirt: 10, position: 'MID', slot: 1 }, m3: { team: 3, shirt: 9, position: 'FWD', slot: 0 } },
  { name: 'Braden', m1: { team: 2, shirt: 8, position: 'MID', slot: 0 }, m2: { team: 1, shirt: 9, position: 'FWD', slot: 0 }, m3: { team: 2, shirt: 9, position: 'FWD', slot: 0 } },
  { name: 'Adrian', m1: { team: 2, shirt: 10, position: 'MID', slot: 1 }, m2: { team: 3, shirt: 1, position: 'GK', slot: 0 }, m3: { team: 1, shirt: 12, position: 'SUB', slot: 0 } },
  { name: 'David Vivar', m1: { team: 2, shirt: 9, position: 'FWD', slot: 0 }, m2: { team: 1, shirt: 12, position: 'SUB', slot: 0 }, m3: { team: 2, shirt: 5, position: 'DEF', slot: 1 } },
  { name: 'David Málaga', m1: { team: 2, shirt: 12, position: 'SUB', slot: 0 }, m2: { team: 2, shirt: 10, position: 'MID', slot: 1 }, m3: { team: 3, shirt: 4, position: 'DEF', slot: 0 } },
  // Ronda 1 · Equipo 3
  { name: 'Andreow', m1: { team: 3, shirt: 1, position: 'GK', slot: 0 }, m2: { team: 3, shirt: 12, position: 'SUB', slot: 0 }, m3: { team: 1, shirt: 8, position: 'MID', slot: 0 } },
  { name: 'Fabian', m1: { team: 3, shirt: 4, position: 'DEF', slot: 0 }, m2: { team: 3, shirt: 8, position: 'MID', slot: 0 }, m3: { team: 2, shirt: 12, position: 'SUB', slot: 0 } },
  { name: 'Álvaro', m1: { team: 3, shirt: 5, position: 'DEF', slot: 1 }, m2: { team: 1, shirt: 1, position: 'GK', slot: 0 }, m3: { team: 1, shirt: 1, position: 'GK', slot: 0 } },
  { name: 'Alexis', m1: { team: 3, shirt: 8, position: 'MID', slot: 0 }, m2: { team: 2, shirt: 9, position: 'FWD', slot: 0 }, m3: { team: 3, shirt: 8, position: 'MID', slot: 0 } },
  { name: 'Balicco', m1: { team: 3, shirt: 10, position: 'MID', slot: 1 }, m2: { team: 3, shirt: 9, position: 'FWD', slot: 0 }, m3: { team: 1, shirt: 5, position: 'DEF', slot: 1 } },
  { name: 'Bryan', m1: { team: 3, shirt: 9, position: 'FWD', slot: 0 }, m2: { team: 1, shirt: 4, position: 'DEF', slot: 0 }, m3: { team: 1, shirt: 10, position: 'MID', slot: 1 } },
];

export const DEFAULT_PLAYERS = DEFAULT_ROSTER.map((p) => p.name);

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
  /** Dueño (cuenta) de cada ticket enviado desde la app. */
  ticketOwner = new Map<string, string>();
  messages = new Map<string, ChatMessage[]>();
  deposits: DepositRow[] = [];
  settlements: (SettlementRow & { match_id: string })[] = [];
  credits: (CreditRow & { match_id: string; created_at: string })[] = [];
  withdrawals: { user_id: string; username: string; amount_cents: number }[] = [];
  private bus = new Map<string, Set<() => void>>();
  private chatListeners = new Map<string, Set<() => void>>();
  qrs = new Map<string, string>();
  /** Fotos de jugadores subidas desde el admin (player_id → blob URL). */
  photos = new Map<string, string>();
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

  /** Avisos genéricos (recargas y billeteras), como los canales de Realtime. */
  on(topic: string, fn: () => void) {
    const set = this.bus.get(topic) ?? new Set();
    set.add(fn);
    this.bus.set(topic, set);
    return () => set.delete(fn);
  }

  emit(topic: string) {
    setTimeout(() => this.bus.get(topic)?.forEach((fn) => fn()), 30);
  }

  /** Igual que wallet_balance() de la BD. */
  balance(userId: string): number {
    const dep = this.deposits.filter((d) => d.user_id === userId && d.status === 'approved').reduce((s, d) => s + d.amount, 0);
    const spent = this.tickets
      .filter((t) => this.ticketOwner.get(t.id) === userId && t.status !== 'rejected')
      .reduce((s, t) => s + t.total, 0);
    const won = this.credits.filter((c) => c.user_id === userId).reduce((s, c) => s + c.amount_cents, 0);
    const out = this.withdrawals.filter((w) => w.user_id === userId).reduce((s, w) => s + w.amount_cents, 0);
    return Math.round(dep * 100 - spent * 100 + won - out) / 100;
  }

  subscribeChat(code: string, fn: () => void) {
    const key = code.toUpperCase();
    const set = this.chatListeners.get(key) ?? new Set();
    set.add(fn);
    this.chatListeners.set(key, set);
    return () => set.delete(fn);
  }

  notifyChat(code: string) {
    setTimeout(() => this.chatListeners.get(code.toUpperCase())?.forEach((fn) => fn()), 30);
  }

  notify(matchId: string) {
    const code = this.matches.find((m) => m.id === matchId)?.access_code;
    if (code) setTimeout(() => this.listeners.get(code)?.forEach((fn) => fn()), 50);
  }

  /** Crea la jornada con 3 equipos 6v6, planteles para Rondas 1, 2 y 3, y los 9 partidos base (3+3+3). */
  createMatch(input: MatchInput, status: MatchStatus = 'open', id = uid()): MatchRow {
    const teamIds = DEFAULT_TEAMS.map((def, i) => {
      const t: TeamRow = {
        id: `${id}-team-${def.key}`,
        match_id: id,
        name: def.name,
        sort_order: i + 1,
        color: def.color,
        formation: def.formation,
        kit_id: def.kit_id,
      };
      this.teams.push(t);
      return t.id;
    });
    const initialGames: ScheduledGame[] = [
      // Modo 1: Ronda 1 – Equipos al azar
      { number: 1, home: teamIds[0], away: teamIds[1], mode: 1 },
      { number: 2, home: teamIds[0], away: teamIds[2], mode: 1 },
      { number: 3, home: teamIds[1], away: teamIds[2], mode: 1 },
      // Modo 2: Ronda 2
      { number: 4, home: teamIds[0], away: teamIds[1], mode: 2 },
      { number: 5, home: teamIds[0], away: teamIds[2], mode: 2 },
      { number: 6, home: teamIds[1], away: teamIds[2], mode: 2 },
      // Modo 3: Ronda 3 – Equipo de Álvaro
      { number: 7, home: teamIds[0], away: teamIds[1], mode: 3 },
      { number: 8, home: teamIds[0], away: teamIds[2], mode: 3 },
      { number: 9, home: teamIds[1], away: teamIds[2], mode: 3 },
    ];
    const m: MatchRow = {
      id,
      title: input.title,
      starts_at: input.starts_at,
      access_code: input.access_code.toUpperCase(),
      status,
      closed_at: null,
      starting_team_ids: [teamIds[0], teamIds[1]],
      games: initialGames,
      current_game: 1,
      game_live: false,
      pay_method: input.pay_method || DEFAULT_PAY_METHOD,
      pay_number: input.pay_number,
      pay_holder: input.pay_holder,
      pay_qr_path: null,
      created_at: new Date().toISOString(),
    };
    this.matches.unshift(m);
    this.players.push({ id: `${id}-og`, match_id: id, name: 'Autogol', is_own_goal: true, sort_order: 9999 });
    DEFAULT_ROSTER.forEach((p, i) =>
      this.players.push({
        id: `${id}-p${i + 1}`,
        match_id: id,
        name: p.name,
        is_own_goal: false,
        sort_order: i + 1,
        team_id: teamIds[p.m1.team - 1],
        shirt_number: p.m1.shirt,
        position: p.m1.position,
        slot: p.m1.slot,
        modes: {
          1: { team_id: teamIds[p.m1.team - 1], shirt_number: p.m1.shirt, position: p.m1.position, slot: p.m1.slot },
          2: { team_id: teamIds[p.m2.team - 1], shirt_number: p.m2.shirt, position: p.m2.position, slot: p.m2.slot },
          3: { team_id: teamIds[p.m3.team - 1], shirt_number: p.m3.shirt, position: p.m3.position, slot: p.m3.slot },
        },
      }),
    );
    DEFAULT_MARKETS.forEach(([name, type, param], i) =>
      this.markets.push({ id: `${id}-m${i + 1}`, match_id: id, name, type, param, sort_order: i + 1, is_active: true, rollover_to_market_id: null, initial_pot: 0 }),
    );
    for (const g of initialGames) this.createGameMarkets(id, g.number, g.home, g.away, g.mode ?? 1);
    return m;
  }

  /** Crea los 19 mercados del partido N para el cruce `home` vs `away`. */
  createGameMarkets(matchId: string, gameNumber: number, homeTeamId: string, awayTeamId: string, mode: GameModeId = 1) {
    const homeName = this.teams.find((t) => t.id === homeTeamId)?.name ?? 'Equipo A';
    const awayName = this.teams.find((t) => t.id === awayTeamId)?.name ?? 'Equipo B';
    const vs = `M${mode} · ${homeName} vs ${awayName}`;
    GAME_MARKETS.forEach((d, i) =>
      this.markets.push({
        id: `${matchId}-${d.type}-${gameNumber}`,
        match_id: matchId,
        name: `${d.label} · ${vs}`,
        type: d.type,
        param: gameNumber,
        sort_order: 100 + gameNumber * 30 + i,
        is_active: true,
        rollover_to_market_id: null,
        initial_pot: 0,
      }),
    );
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
    // Cuenta de las pruebas automáticas: S/ 50 de saldo ya acreditado.
    this.deposits.push({
      id: uid(), user_id: TEST_USER_ID, username: 'prueba', amount: 50, receipt_path: null, status: 'approved',
      reject_reason: null, created_at: new Date(Date.now() - 30 * 60_000).toISOString(), reviewed_at: new Date().toISOString(),
    });
    // Una jornada, antes del primer partido (nada en vivo todavía).
    const code = TEST_CODE;
    this.createMatch(
      { title: 'Copa Álvaro', starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(), access_code: code, pay_method: DEFAULT_PAY_METHOD, pay_number: '999 888 777', pay_holder: DEFAULT_PAY_HOLDER },
      'open',
      `local-${code}`,
    );
  }


}

// ---------------------------------------------------------------------------
// Parte pública (pruebas locales)
// ---------------------------------------------------------------------------
@Injectable()
export class MockPublicApi extends PublicApi {
  readonly isTestBackend = true;
  private s = inject(MockStore);
  private auth = inject(AuthApi);

  private me() {
    const u = this.auth.user();
    if (!u) throw new Error('Inicia sesión para continuar');
    return u;
  }

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
          return {
            ...k, target: t.target, section: t.section, option_min: t.option_min, option_max: t.option_max, allows_own_goal: t.allows_own_goal,
            settled: this.s.settlements.some((x) => x.market_id === k.id),
          };
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

  async submitTicket(code: string, bets: SubmitBet[]): Promise<string> {
    await delay(400);
    const user = this.me();
    const m = this.s.matches.find((x) => x.access_code === code.toUpperCase());
    if (!m) throw new Error('Jornada no encontrada');
    if (m.status !== 'open') throw new Error('Las apuestas están cerradas');
    const name = user.username;
    if (bets.length < 1 || bets.length > MAX_BETS_PER_TICKET) throw new Error('Cada ticket debe tener entre 1 y 20 apuestas');
    if (bets.some((b) => b.amount < 1 || b.amount > 5)) throw new Error('Cada apuesta debe ser de S/ 1 a S/ 5');
    const lg = league(
      toTimelineEvents(this.s.events.filter((e) => e.match_id === m.id)),
      teamOrder(this.s.teams.filter((t) => t.match_id === m.id)),
      m.current_game,
      false,
      m.game_live,
      m.games ?? null,
    );
    for (const b of bets) {
      const mk = this.s.markets.find((x) => x.id === b.marketId);
      const st = mk && marketOpen(mk, lg, true);
      const settled = !!mk && this.s.settlements.some((x) => x.market_id === mk.id);
      if (settled) throw new Error(`${mk!.name} ya se liquidó`);
      if (!mk || !st?.open) throw new Error(`${mk?.name ?? 'Mercado'}: ${st?.reason ?? 'no recibe apuestas'}`);
    }
    const total = bets.reduce((s, b) => s + b.amount, 0);
    const balance = this.s.balance(user.id);
    if (total > balance) throw new Error(`Saldo insuficiente: tienes S/ ${Math.max(balance, 0)} y el ticket es de S/ ${total}. Recarga por Plin`);
    const id = uid();
    const now = new Date().toISOString();
    this.s.tickets.push({
      id, match_id: m.id, bettor_name: name, total, receipt_path: null,
      status: 'approved', reject_reason: null, created_at: now, reviewed_at: now,
      bets: bets.map((b) => ({
        id: uid(), ticket_id: id, market_id: b.marketId, amount: b.amount,
        player_id: b.target === 'player' ? b.selection : null,
        team_id: b.target === 'team' ? b.selection : null,
        option_value: b.target === 'number' ? Number(b.selection) : null,
      })),
    });
    this.s.ticketOwner.set(id, user.id);
    this.s.notify(m.id);
    this.s.emit('wallet:' + user.id);
    return id;
  }

  async getWallet(): Promise<Wallet> {
    await delay(120);
    const user = this.me();
    return clone({
      balance: this.s.balance(user.id),
      deposits: this.s.deposits
        .filter((d) => d.user_id === user.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(({ id, amount, status, reject_reason, created_at, reviewed_at }) => ({ id, amount, status, reject_reason, created_at, reviewed_at })),
      credits: this.s.credits
        .filter((c) => c.user_id === user.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((c, i) => ({ id: `${c.market_id}-${i}`, kind: c.kind, amount_cents: c.amount_cents, market_name: this.s.markets.find((m) => m.id === c.market_id)?.name ?? '', created_at: c.created_at })),
    });
  }

  async requestDeposit(userId: string, amount: number, image: Blob): Promise<void> {
    await delay(400);
    const user = this.me();
    if (user.id !== userId) throw new Error('Falta la captura del Plin');
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) throw new Error('La recarga va de S/ 1 a S/ 500');
    if (this.s.deposits.filter((d) => d.user_id === user.id && d.status === 'pending').length >= 5) {
      throw new Error('Tienes muchas recargas por confirmar. Espera a que el organizador las revise');
    }
    const path = `deposits/${user.id}/${uid()}.jpg`;
    this.s.receipts.set(path, URL.createObjectURL(image));
    this.s.deposits.push({
      id: uid(), user_id: user.id, username: user.username, amount, receipt_path: path, status: 'pending',
      reject_reason: null, created_at: new Date().toISOString(), reviewed_at: null,
    });
    this.s.emit('deposits');
    this.s.emit('wallet:' + user.id);
  }

  subscribeWallet(userId: string, onChange: () => void) {
    return this.s.on('wallet:' + userId, onChange);
  }

  async activeMatchCode(): Promise<string | null> {
    return this.s.matches.find((m) => m.status !== 'finished')?.access_code ?? null;
  }

  async getMyTickets(code: string): Promise<MyTicket[]> {
    await delay(150);
    const user = this.me();
    const m = this.s.matches.find((x) => x.access_code === code.toUpperCase());
    if (!m) return [];
    return clone(
      this.s.tickets
        .filter((t) => t.match_id === m.id && this.s.ticketOwner.get(t.id) === user.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((t) => ({ id: t.id, total: t.total, status: t.status, reject_reason: t.reject_reason, created_at: t.created_at, bets: t.bets })),
    );
  }

  subscribe(code: string, onChange: () => void) {
    return this.s.subscribe(code, onChange);
  }

  async getMessages(code: string): Promise<ChatMessage[]> {
    await delay(120);
    this.me();
    return clone(this.s.messages.get(code.toUpperCase()) ?? []);
  }

  async postMessage(code: string, body: string): Promise<void> {
    await delay(120);
    const user = this.me();
    const key = code.toUpperCase();
    if (!this.s.matches.some((m) => m.access_code === key)) throw new Error('Jornada no encontrada');
    const text = body.trim();
    if (text.length < 1 || text.length > 500) throw new Error('El mensaje debe tener de 1 a 500 caracteres');
    const list = this.s.messages.get(key) ?? [];
    const recent = list.filter((x) => x.user_id === user.id && Date.now() - new Date(x.created_at).getTime() < 15_000);
    if (recent.length >= 6) throw new Error('Vas muy rápido, espera unos segundos');
    this.s.messages.set(key, [...list, { id: uid(), user_id: user.id, username: user.username, body: text, created_at: new Date().toISOString() }]);
    this.s.notifyChat(key);
  }

  subscribeChat(code: string, onChange: () => void) {
    return this.s.subscribeChat(code, onChange);
  }

  qrUrl(path: string | null) {
    return path ? (this.s.qrs.get(path) ?? null) : null;
  }

  photoUrl(photoId: string) {
    return this.s.photos.get(photoId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Admin (pruebas locales)
// ---------------------------------------------------------------------------
@Injectable()
export class MockAdminApi extends AdminApi {
  readonly isTestBackend = true;
  private s = inject(MockStore);
  private email: string | null = readLocalAdmin();

  async currentEmail() {
    return this.email;
  }
  async signIn(email: string, password: string) {
    await delay();
    if (!email.trim() || !password) throw new Error('Escribe correo y contraseña');
    this.email = email.trim();
    writeLocalAdmin(this.email);
  }
  async signOut() {
    this.email = null;
    writeLocalAdmin(null);
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
      tickets: this.s.tickets
        .filter((t) => t.match_id === id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((t) => ({ ...t, user_id: this.s.ticketOwner.get(t.id) ?? null })),
      events: this.s.events.filter((e) => e.match_id === id).sort((a, b) => a.minute - b.minute || a.seq - b.seq),
      paid: this.s.paid.filter((p) => p.match_id === id),
      settlements: this.s.settlements.filter((x) => x.match_id === id),
      credits: this.s.credits.filter((c) => c.match_id === id),
    });
  }

  async saveMatch(input: MatchInput) {
    await delay();
    const code = input.access_code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Error('El código debe tener de 4 a 20 letras o números');
    if (this.s.matches.some((m) => m.access_code === code && m.id !== input.id)) throw new Error('Ese código ya lo usa otra jornada');
    const clean = { ...input, access_code: code, title: input.title.trim(), pay_method: input.pay_method?.trim() || DEFAULT_PAY_METHOD };
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

  async setCurrentGame(matchId: string, game: number, live = false) {
    const m = this.s.matches.find((x) => x.id === matchId)!;
    m.current_game = game;
    m.game_live = live;
    this.s.notify(matchId);
  }

  async setGameLive(matchId: string, live: boolean) {
    this.s.matches.find((x) => x.id === matchId)!.game_live = live;
    this.s.notify(matchId);
  }

  async addGame(matchId: string, homeTeamId: string, awayTeamId: string, goLive = false, mode: GameModeId = 1): Promise<number> {
    // Mismas reglas que admin_add_game en la BD.
    if (homeTeamId === awayTeamId) throw new Error('Elige dos equipos distintos');
    if (![1, 2, 3].includes(mode)) throw new Error('Modo inválido');
    const m = this.s.matches.find((x) => x.id === matchId);
    if (!m) throw new Error('Jornada no encontrada');
    if (m.status === 'finished') throw new Error('La jornada ya terminó');
    const own = (id: string) => this.s.teams.some((t) => t.id === id && t.match_id === matchId);
    if (!own(homeTeamId) || !own(awayTeamId)) throw new Error('Los equipos tienen que ser del partido');
    const list = m.games ? [...m.games] : [];
    const nextNumber = list.reduce((max, g) => Math.max(max, g.number), 0) + 1;
    if (nextNumber > 20) throw new Error('Máximo 20 partidos por jornada');
    list.push({ number: nextNumber, home: homeTeamId, away: awayTeamId, mode });
    m.games = list;
    // Mover current_game marcaría como jugados todos los anteriores: solo si arranca en vivo.
    if (goLive) {
      m.current_game = nextNumber;
      m.game_live = true;
    }
    this.s.createGameMarkets(matchId, nextNumber, homeTeamId, awayTeamId, mode);
    this.s.notify(matchId);
    return nextNumber;
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

  async addTeam(matchId: string, name: string, color?: string, kitId: string | null = null): Promise<string> {
    await delay();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('El equipo necesita nombre');
    if (!this.s.matches.some((m) => m.id === matchId)) throw new Error('Jornada no encontrada');
    const order = Math.max(0, ...this.s.teams.filter((t) => t.match_id === matchId).map((t) => t.sort_order)) + 1;
    const id = uid();
    this.s.teams.push({ id, match_id: matchId, name: clean.slice(0, 30), sort_order: order, color: color?.trim() || '#64748b', formation: '2-2-1', kit_id: kitId });
    this.s.notify(matchId);
    return id;
  }

  async addPlayers(matchId: string, names: string[]) {
    let order = Math.max(0, ...this.s.players.filter((p) => p.match_id === matchId && !p.is_own_goal).map((p) => p.sort_order));
    for (const name of names) this.s.players.push({ id: uid(), match_id: matchId, name, is_own_goal: false, sort_order: ++order });
    this.s.notify(matchId);
  }

  async uploadPlayerPhoto(playerId: string, file: Blob) {
    const p = this.s.players.find((x) => x.id === playerId);
    if (!p) throw new Error('Jugador no encontrado');
    this.s.photos.set(playerId, URL.createObjectURL(file));
    p.photo_id = playerId;
    this.s.notify(p.match_id);
  }

  async renamePlayer(id: string, name: string) {
    const p = this.s.players.find((x) => x.id === id)!;
    p.name = name;
    this.s.notify(p.match_id);
  }

  async updatePlayer(id: string, patch: PlayerPatch) {
    const p = this.s.players.find((x) => x.id === id)!;
    Object.assign(p, patch);
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
    const owner = this.s.ticketOwner.get(t.id);
    if (owner) this.s.emit('wallet:' + owner);
  }

  async settleMarket(marketId: string, outcome: SettlementRow['outcome'], winner: string | null, credits: Omit<CreditRow, 'market_id'>[]) {
    await delay(120);
    const m = this.s.markets.find((x) => x.id === marketId)!;
    const touched = new Set(this.s.credits.filter((c) => c.market_id === marketId).map((c) => c.user_id));
    this.s.credits = this.s.credits.filter((c) => c.market_id !== marketId);
    this.s.settlements = this.s.settlements.filter((x) => x.market_id !== marketId);
    this.s.settlements.push({ market_id: marketId, match_id: m.match_id, outcome, winner_selection: winner, settled_at: new Date().toISOString() });
    for (const c of credits) {
      if (!c.user_id || c.amount_cents <= 0) continue;
      this.s.credits.push({ ...c, market_id: marketId, match_id: m.match_id, created_at: new Date().toISOString() });
      touched.add(c.user_id);
    }
    touched.forEach((u) => this.s.emit('wallet:' + u));
    this.s.notify(m.match_id);
  }

  async unsettleMarket(marketId: string) {
    const m = this.s.markets.find((x) => x.id === marketId)!;
    const touched = new Set(this.s.credits.filter((c) => c.market_id === marketId).map((c) => c.user_id));
    this.s.credits = this.s.credits.filter((c) => c.market_id !== marketId);
    this.s.settlements = this.s.settlements.filter((x) => x.market_id !== marketId);
    touched.forEach((u) => this.s.emit('wallet:' + u));
    this.s.notify(m.match_id);
  }

  async balances(): Promise<BalanceRow[]> {
    await delay(100);
    const users = new Map<string, string>();
    for (const d of this.s.deposits) if (d.status === 'approved') users.set(d.user_id, d.username);
    for (const c of this.s.credits) users.set(c.user_id, c.username);
    return [...users].map(([user_id, username]) => ({ user_id, username, balance: this.s.balance(user_id) })).sort((a, b) => b.balance - a.balance);
  }

  async payout(userId: string, amountCents: number) {
    if (amountCents <= 0) throw new Error('Monto inválido');
    if (amountCents > Math.round(this.s.balance(userId) * 100)) throw new Error('No puede retirar más que su saldo');
    const name = this.s.deposits.find((d) => d.user_id === userId)?.username ?? '¿?';
    this.s.withdrawals.push({ user_id: userId, username: name, amount_cents: amountCents });
    this.s.emit('wallet:' + userId);
  }

  async pendingDeposits(): Promise<DepositRow[]> {
    await delay(150);
    return clone(this.s.deposits.filter((d) => d.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }

  async setDepositStatus(id: string, status: TicketStatus, reason?: string | null) {
    await delay(150);
    const d = this.s.deposits.find((x) => x.id === id)!;
    d.status = status;
    d.reject_reason = status === 'rejected' ? reason?.trim() || null : null;
    d.reviewed_at = status === 'pending' ? null : new Date().toISOString();
    this.s.emit('deposits');
    this.s.emit('wallet:' + d.user_id);
  }

  subscribeDeposits(onChange: () => void) {
    return this.s.on('deposits', onChange);
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

function readLocalAdmin(): string | null {
  try {
    return sessionStorage.getItem('copa:local-admin');
  } catch {
    return null;
  }
}
function writeLocalAdmin(email: string | null) {
  try {
    if (email) sessionStorage.setItem('copa:local-admin', email);
    else sessionStorage.removeItem('copa:local-admin');
  } catch {
    /* sin almacenamiento */
  }
}
