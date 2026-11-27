export type MatchStatus = 'open' | 'closed' | 'finished';
export type MarketTarget = 'player' | 'team' | 'number';
export type MarketSection = 'partidos' | 'goles' | 'equipos' | 'amarillas' | 'pichanga' | 'show';
/** Eventos de un solo jugador (se registran con dos toques). */
export type PlayerEventType = 'yellow' | 'red' | 'nutmeg' | 'blooper' | 'penalty' | 'penalty_miss' | 'post' | 'golazo' | 'dive';
export type EventType = 'goal' | 'rotation' | PlayerEventType;
export type TicketStatus = 'pending' | 'approved' | 'rejected';

export interface PublicMatch {
  id: string;
  title: string;
  starts_at: string | null;
  access_code: string;
  status: MatchStatus;
  closed_at: string | null;
  starting_team_ids: string[] | null;
  /** Partido actual de la liga (1–6; 7 = todos terminados). */
  current_game: number;
  /** El partido actual está en vivo. */
  game_live: boolean;
  pay_method: string;
  pay_number: string | null;
  pay_holder: string | null;
  pay_qr_path: string | null;
}

export interface Team {
  id: string;
  name: string;
  sort_order: number;
  color: string | null;
}

export interface Player {
  id: string;
  name: string;
  is_own_goal: boolean;
  sort_order: number;
}

export interface Market {
  id: string;
  name: string;
  type: string;
  param: number | null;
  sort_order: number;
  is_active: boolean;
  rollover_to_market_id: string | null;
  initial_pot: number;
  target: MarketTarget;
  section: MarketSection;
  option_min: number | null;
  option_max: number | null;
  allows_own_goal: boolean;
  /** El organizador ya liquidó este mercado (no recibe más apuestas). */
  settled?: boolean;
}

export interface MatchEvent {
  id: string;
  type: EventType;
  player_id: string | null;
  team_id: string | null;
  is_own_goal: boolean;
  team_out_id: string | null;
  minute: number;
  seq: number;
  /** Partido de la liga (1–6). */
  game: number | null;
}

export interface PublicBet {
  id: string;
  ticket_id: string;
  bettor_name: string;
  market_id: string;
  player_id: string | null;
  team_id: string | null;
  option_value: number | null;
  amount: number;
  created_at: string;
}

export interface PublicMatchData {
  match: PublicMatch;
  teams: Team[];
  players: Player[];
  markets: Market[];
  events: MatchEvent[];
  bets: PublicBet[];
}

/** Apuesta en armado: `selection` es id de jugador, id de equipo o número como texto. */
export interface BetDraft {
  marketId: string;
  selection: string;
  amount: number;
}

export const MAX_BETS_PER_TICKET = 20;
export const AMOUNTS = [1, 2, 3, 4, 5] as const;

export const STATUS_LABEL: Record<MatchStatus, string> = {
  open: 'Apuestas abiertas',
  closed: 'En juego',
  finished: 'Finalizada',
};

export const SECTIONS: { id: MarketSection; label: string; icon: string; blurb: string }[] = [
  { id: 'partidos', label: 'Partidos', icon: '🆚', blurb: 'Ganador y primer gol de cada partido' },
  { id: 'goles', label: 'Goles', icon: '⚽', blurb: 'Quién la mete y cuándo (toda la liga)' },
  { id: 'equipos', label: 'Liga', icon: '🏆', blurb: 'Campeón, último, más goleador y más goleado' },
  { id: 'amarillas', label: 'Tarjetas', icon: '🟨', blurb: 'Amarillas y rojas' },
  { id: 'show', label: 'Show', icon: '🎬', blurb: 'Palos, golazos, penales y bloopers' },
  { id: 'pichanga', label: 'Pichanga', icon: '🤡', blurb: 'Autogoles y huachas' },
];

/** Cómo se muestra y se registra cada evento de un jugador. */
export const PLAYER_EVENTS: Record<PlayerEventType, { label: string; icon: string; ask: string; text: (name: string) => string; stat: string }> = {
  yellow: { label: 'Amarilla', icon: '🟨', ask: '¿A quién amonestaron?', text: (n) => `Amarilla a ${n}`, stat: 'Amarillas' },
  red: { label: 'Roja', icon: '🟥', ask: '¿A quién expulsaron?', text: (n) => `Roja a ${n}`, stat: 'Rojas' },
  nutmeg: { label: 'Huacha', icon: '🥜', ask: '¿A quién le hicieron la huacha?', text: (n) => `Huacha a ${n}`, stat: 'Huachas recibidas' },
  golazo: { label: 'Golazo', icon: '✨', ask: '¿Quién metió el golazo?', text: (n) => `Golazo de ${n}`, stat: 'Golazos' },
  post: { label: 'Palo', icon: '🥅', ask: '¿Quién la estrelló en el palo?', text: (n) => `Palo de ${n}`, stat: 'Palos' },
  penalty: { label: 'Penal', icon: '🚨', ask: '¿Quién cometió el penal?', text: (n) => `Penal cometido por ${n}`, stat: 'Penales cometidos' },
  penalty_miss: { label: 'Falla penal', icon: '🙅', ask: '¿Quién falló el penal?', text: (n) => `Penal fallado por ${n}`, stat: 'Penales fallados' },
  blooper: { label: 'Blooper', icon: '🤦', ask: '¿Quién hizo el blooper?', text: (n) => `Blooper de ${n}`, stat: 'Bloopers' },
  dive: { label: 'Piscinazo', icon: '🏊', ask: '¿Quién se tiró a la piscina?', text: (n) => `Piscinazo de ${n}`, stat: 'Piscinazos' },
};
export const PLAYER_EVENT_TYPES = Object.keys(PLAYER_EVENTS) as PlayerEventType[];
export const isPlayerEvent = (t: EventType): t is PlayerEventType => t in PLAYER_EVENTS;

export const EVENT_ICON: Record<EventType, string> = {
  goal: '⚽',
  rotation: '🔄',
  ...(Object.fromEntries(PLAYER_EVENT_TYPES.map((t) => [t, PLAYER_EVENTS[t].icon])) as Record<PlayerEventType, string>),
};

/** Método de pago: depósito por Plin al QR (el organizador lo acepta a mano). */
export const DEFAULT_PAY_METHOD = 'Plin';
/** Titular por defecto del Plin (organizador). */
export const DEFAULT_PAY_HOLDER = 'Alvaro Fabrizzio Salazar';
/** QR por defecto si la jornada no tiene uno subido: guarda la imagen en public/pago/qr.png. */
export const DEFAULT_PAY_QR = 'pago/qr.png';

// ---------------------------------------------------------------------------
// Cuentas, mis tickets y social
// ---------------------------------------------------------------------------
export interface AppUser {
  id: string;
  email: string;
  username: string;
}

export interface MyBet {
  id: string;
  market_id: string;
  player_id: string | null;
  team_id: string | null;
  option_value: number | null;
  amount: number;
}

export interface MyTicket {
  id: string;
  total: number;
  status: TicketStatus;
  reject_reason: string | null;
  created_at: string;
  bets: MyBet[];
}

/** Recarga de saldo por Plin (la acepta el organizador). */
export interface Deposit {
  id: string;
  amount: number;
  status: TicketStatus;
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** Depósito visto por el organizador (con dueño y captura). */
export interface DepositRow extends Deposit {
  user_id: string;
  username: string;
  receipt_path: string | null;
}

/** Ganancia o devolución acreditada al saldo al liquidar un mercado. */
export interface Credit {
  id: string;
  kind: 'win' | 'refund';
  amount_cents: number;
  market_name: string;
  created_at: string;
}

export interface Wallet {
  /** Saldo en soles (con céntimos): recargas aceptadas − tickets no anulados + ganancias acreditadas. */
  balance: number;
  deposits: Deposit[];
  credits: Credit[];
}

/** Liquidación guardada de un mercado (admin). */
export interface SettlementRow {
  market_id: string;
  outcome: 'winners' | 'refund' | 'no_winner';
  winner_selection: string | null;
  settled_at: string;
}

/** Lo acreditado a una persona en un mercado (admin). */
export interface CreditRow {
  market_id: string;
  user_id: string;
  username: string;
  kind: 'win' | 'refund';
  amount_cents: number;
}

/** Saldo para mostrar: "S/ 14" o "S/ 14.50". */
export function balanceLabel(soles: number | null): string {
  if (soles === null) return '…';
  return Number.isInteger(soles) ? `S/ ${soles}` : `S/ ${soles.toFixed(2)}`;
}

/** Montos rápidos para recargar. */
export const DEPOSIT_AMOUNTS = [10, 20, 30, 50] as const;
export const MAX_DEPOSIT = 500;

export interface ChatMessage {
  id: string;
  user_id: string | null;
  username: string;
  body: string;
  created_at: string;
}

/** Respuestas rápidas del chat Social. */
export const QUICK_REACTIONS = ['⚽ ¡GOOOL!', '⚪ ¡La esférica no se mancha!', '🔥 Golazo', '🤡 Qué blooper', '🥅 ¡Palo!', '🟥 ¡Roja!', '💸 Ya plineé'];

/** Mensaje que ve todo apostador. */
export const HOUSE_WARNING = 'Si nadie acierta en una apuesta, ese bote se lo queda el organizador.';

/** Selección guardada en una apuesta (jugador, equipo o número). */
export function betSelection(b: { player_id: string | null; team_id: string | null; option_value: number | null }): string {
  return b.player_id ?? b.team_id ?? String(b.option_value);
}

/** Convierte una selección al formato que espera `submit_ticket`. */
export function selectionPayload(target: MarketTarget, selection: string) {
  return target === 'player'
    ? { player_id: selection }
    : target === 'team'
      ? { team_id: selection }
      : { option: Number(selection) };
}

export function minuteLabel(e: { minute: number }): string {
  return `${e.minute}'`;
}

/** Minutos desde que se cerraron las apuestas (para autocompletar eventos). */
export function elapsedMinutes(closedAt: string | null, now = Date.now()): number {
  if (!closedAt) return 0;
  return Math.max(0, Math.min(300, Math.floor((now - new Date(closedAt).getTime()) / 60_000)));
}

// ---------------------------------------------------------------------------
// Modelos del administrador (filas completas de la base de datos)
// ---------------------------------------------------------------------------
export interface MatchRow extends PublicMatch {
  created_at: string;
}

export interface MarketType {
  type: string;
  label: string;
  target: MarketTarget;
  section: MarketSection;
  has_param: boolean;
  option_min: number | null;
  option_max: number | null;
  allows_own_goal: boolean;
}

export interface MarketRow {
  id: string;
  match_id: string;
  name: string;
  type: string;
  param: number | null;
  sort_order: number;
  is_active: boolean;
  rollover_to_market_id: string | null;
  initial_pot: number;
}

export interface TeamRow extends Team {
  match_id: string;
}

export interface PlayerRow extends Player {
  match_id: string;
}

export interface EventRow extends MatchEvent {
  match_id: string;
}

export interface BetRow {
  id: string;
  ticket_id: string;
  market_id: string;
  player_id: string | null;
  team_id: string | null;
  option_value: number | null;
  amount: number;
}

export interface TicketRow {
  id: string;
  match_id: string;
  bettor_name: string;
  total: number;
  receipt_path: string | null;
  status: TicketStatus;
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  /** Dueño (cuenta) del ticket; null en tickets antiguos sin cuenta. */
  user_id?: string | null;
  bets: BetRow[];
}

export interface PaidRow {
  match_id: string;
  person_key: string;
  bettor_name: string;
  paid_at: string;
}

export interface AdminMatchData {
  match: MatchRow;
  teams: TeamRow[];
  players: PlayerRow[];
  markets: MarketRow[];
  marketTypes: MarketType[];
  tickets: TicketRow[];
  events: EventRow[];
  paid: PaidRow[];
  settlements: SettlementRow[];
  credits: CreditRow[];
}

export type MatchInput = Pick<MatchRow, 'title' | 'starts_at' | 'access_code' | 'pay_method' | 'pay_number' | 'pay_holder'> & {
  id?: string;
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 6): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
}
