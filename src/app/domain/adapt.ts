import { AdminMatchData, betSelection, MatchEvent, MarketTarget, Player, PublicMatchData, Team } from '../core/models';
import { numberMaxOption, SettleInput, SettleMarket } from './settlement';
import { sortEvents, TimelineEvent } from './timeline';

export function toTimelineEvents(events: MatchEvent[]): TimelineEvent[] {
  return sortEvents(
    events.map((e) => ({
      id: e.id,
      type: e.type,
      playerId: e.player_id,
      teamId: e.team_id,
      isOwnGoal: e.is_own_goal,
      teamOutId: e.team_out_id,
      minute: e.minute,
      seq: e.seq,
    })),
  );
}

export function teamOrder(teams: Team[]): string[] {
  return [...teams].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map((t) => t.id);
}

const settleMarket = (m: {
  id: string; name: string; type: string; sort_order: number; is_active: boolean;
  rollover_to_market_id: string | null; initial_pot: number; param: number | null;
}): SettleMarket => ({
  id: m.id,
  name: m.name,
  type: m.type,
  sortOrder: m.sort_order,
  isActive: m.is_active,
  rolloverToMarketId: m.rollover_to_market_id,
  initialPot: Number(m.initial_pot) || 0,
  param: m.param,
});

/** Datos públicos (solo apuestas aprobadas) → settle(). */
export function publicToSettleInput(d: PublicMatchData): SettleInput {
  return {
    markets: d.markets.map(settleMarket),
    events: toTimelineEvents(d.events),
    teamIds: teamOrder(d.teams),
    startingTeamIds: d.match.starting_team_ids ?? [],
    ownGoalOptionId: d.players.find((p) => p.is_own_goal)?.id ?? null,
    bets: d.bets.map((b) => ({
      ticketId: b.ticket_id,
      ticketStatus: 'approved',
      bettorName: b.bettor_name,
      marketId: b.market_id,
      selection: betSelection(b),
      amount: b.amount,
    })),
  };
}

/** Datos del admin: incluye todos los tickets (settle() ignora los no aprobados). */
export function adminToSettleInput(d: AdminMatchData): SettleInput {
  const tickets = [...d.tickets].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return {
    markets: d.markets.map(settleMarket),
    events: toTimelineEvents(d.events),
    teamIds: teamOrder(d.teams),
    startingTeamIds: d.match.starting_team_ids ?? [],
    ownGoalOptionId: d.players.find((p) => p.is_own_goal)?.id ?? null,
    bets: tickets.flatMap((t) =>
      t.bets.map((b) => ({
        ticketId: t.id,
        ticketStatus: t.status,
        bettorName: t.bettor_name,
        marketId: b.market_id,
        selection: betSelection(b),
        amount: b.amount,
      })),
    ),
  };
}

/** Nombre legible de una selección: jugador, equipo o número ("racha de 3"). */
export function makeSelectionLabel(players: Player[], teams: Team[]) {
  const p = new Map(players.map((x) => [x.id, x.name]));
  const t = new Map(teams.map((x) => [x.id, x.name]));
  return (target: MarketTarget | undefined, selection: string | null, type?: string): string => {
    if (selection == null) return '¿?';
    if (target === 'team') return t.get(selection) ?? '¿?';
    if (target === 'number') {
      const n = Number(selection);
      const max = numberMaxOption(type);
      const txt = n >= max ? `${max} o más` : String(n);
      if (type === 'longest_streak') return `racha de ${txt}`;
      if (type === 'total_posts') return n === 1 ? '1 palo' : `${txt} palos`;
      return txt;
    }
    return p.get(selection) ?? t.get(selection) ?? '¿?';
  };
}
