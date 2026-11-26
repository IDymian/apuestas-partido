export type MatchStatus = 'open' | 'closed' | 'finished';
export type MarketTarget = 'player' | 'team' | 'number';
export type MarketSection = 'goles' | 'equipos' | 'amarillas' | 'pichanga';
export type EventType = 'goal' | 'yellow' | 'nutmeg' | 'rotation';
export type TicketStatus = 'pending' | 'approved' | 'rejected';

export interface PublicMatch {
  id: string;
  title: string;
  starts_at: string | null;
  access_code: string;
  status: MatchStatus;
  closed_at: string | null;
  starting_team_ids: string[] | null;
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
  closed: 'En juego · cerrado',
  finished: 'Finalizada',
};

export const SECTIONS: { id: MarketSection; label: string; icon: string }[] = [
  { id: 'goles', label: 'Goles', icon: '⚽' },
  { id: 'equipos', label: 'Equipos', icon: '🛡️' },
  { id: 'amarillas', label: 'Amarillas', icon: '🟨' },
  { id: 'pichanga', label: 'Pichanga', icon: '🤡' },
];

export const EVENT_ICON: Record<EventType, string> = { goal: '⚽', yellow: '🟨', nutmeg: '🥜', rotation: '🔄' };

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
