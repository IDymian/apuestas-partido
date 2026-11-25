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
