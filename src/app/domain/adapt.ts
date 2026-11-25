import { PublicMatchData } from '../core/models';
import { SettleInput } from './settlement';

/** Convierte los datos públicos (solo apuestas aprobadas) al formato de settle(). */
export function publicToSettleInput(d: PublicMatchData): SettleInput {
  return {
    markets: d.markets.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      sortOrder: m.sort_order,
      isActive: m.is_active,
      rolloverToMarketId: m.rollover_to_market_id,
      initialPot: Number(m.initial_pot) || 0,
    })),
    events: d.events.map((e) => ({
      id: e.id,
      type: e.type,
      playerId: e.player_id,
      minute: e.minute,
      stoppage: e.stoppage,
      seq: e.seq,
    })),
    bets: d.bets.map((b) => ({
      ticketId: b.ticket_id,
      ticketStatus: 'approved',
      bettorName: b.bettor_name,
      marketId: b.market_id,
      playerId: b.player_id,
      amount: b.amount,
    })),
  };
}
