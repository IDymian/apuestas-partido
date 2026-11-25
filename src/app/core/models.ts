export type MatchStatus = 'open' | 'closed' | 'finished';
export type Team = 'home' | 'away';

export interface PublicMatch {
  id: string;
  home_team: string;
  away_team: string;
  starts_at: string | null;
  access_code: string;
  status: MatchStatus;
  yape_number: string | null;
  yape_holder: string | null;
  yape_qr_path: string | null;
}

export interface Player {
  id: string;
  name: string;
  team: Team | null;
  is_own_goal: boolean;
  sort_order: number;
}

export interface Market {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  is_active: boolean;
  rollover_to_market_id: string | null;
  initial_pot: number;
  allows_own_goal: boolean;
}

export interface MatchEvent {
  id: string;
  type: 'goal' | 'yellow';
  player_id: string;
  minute: number;
  stoppage: number;
  seq: number;
}

export interface PublicBet {
  id: string;
  ticket_id: string;
  bettor_name: string;
  market_id: string;
  player_id: string;
  amount: number;
  created_at: string;
}

export interface PublicMatchData {
  match: PublicMatch;
  players: Player[];
  markets: Market[];
  events: MatchEvent[];
  bets: PublicBet[];
}

export interface BetDraft {
  marketId: string;
  playerId: string;
  amount: number;
}

export const MAX_BETS_PER_TICKET = 20;
export const AMOUNTS = [1, 2, 3, 4, 5] as const;

export const STATUS_LABEL: Record<MatchStatus, string> = {
  open: 'Abierto',
  closed: 'En juego · cerrado',
  finished: 'Finalizado',
};

export function minuteLabel(e: { minute: number; stoppage: number }): string {
  return e.stoppage > 0 ? `${e.minute}+${e.stoppage}'` : `${e.minute}'`;
}

export function teamName(match: PublicMatch, team: Team | null): string {
  return team === 'home' ? match.home_team : team === 'away' ? match.away_team : '';
}

// ---------------------------------------------------------------------------
// Modelos del administrador (filas completas de la base de datos)
// ---------------------------------------------------------------------------
export type TicketStatus = 'pending' | 'approved' | 'rejected';

export interface MatchRow extends PublicMatch {
  created_at: string;
}

export interface MarketType {
  type: string;
  label: string;
  allows_own_goal: boolean;
  event_type: 'goal' | 'yellow' | null;
}

export interface MarketRow {
  id: string;
  match_id: string;
  name: string;
  type: string;
  sort_order: number;
  is_active: boolean;
  rollover_to_market_id: string | null;
  initial_pot: number;
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
  player_id: string;
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
  players: PlayerRow[];
  markets: MarketRow[];
  marketTypes: MarketType[];
  tickets: TicketRow[];
  events: EventRow[];
  paid: PaidRow[];
}

export type MatchInput = Pick<MatchRow, 'home_team' | 'away_team' | 'starts_at' | 'access_code' | 'yape_number' | 'yape_holder'> & {
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
