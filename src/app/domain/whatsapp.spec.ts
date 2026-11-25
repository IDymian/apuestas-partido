import { describe, expect, it } from 'vitest';
import { settle } from './settlement';
import { whatsappSummary } from './whatsapp';

describe('whatsappSummary()', () => {
  it('lista ganadores, arrastre, pagados y acumulado', () => {
    const r = settle({
      markets: [
        { id: 'fg', name: 'Primer gol', type: 'first_goal', sortOrder: 1, isActive: true, rolloverToMarketId: 'lg', initialPot: 0 },
        { id: 'lg', name: 'Último gol', type: 'last_goal', sortOrder: 2, isActive: true, rolloverToMarketId: null, initialPot: 0 },
        { id: 'fy', name: 'Primera amarilla', type: 'first_yellow', sortOrder: 3, isActive: true, rolloverToMarketId: null, initialPot: 0 },
      ],
      events: [{ id: 'e1', type: 'goal', playerId: 'ful', minute: 30, stoppage: 0, seq: 1 }],
      bets: [
        { ticketId: 't1', ticketStatus: 'approved', bettorName: 'Ana', marketId: 'fg', playerId: 'pep', amount: 4 },
        { ticketId: 't2', ticketStatus: 'approved', bettorName: 'Rosa', marketId: 'lg', playerId: 'ful', amount: 3 },
        { ticketId: 't3', ticketStatus: 'approved', bettorName: 'Beto', marketId: 'fy', playerId: 'x', amount: 2 },
      ],
    });
    const text = whatsappSummary(r, {
      title: 'A vs B',
      playerName: (id) => ({ ful: 'Fulanito', pep: 'Pepito' })[id ?? ''] ?? '¿?',
      marketName: (id) => ({ lg: 'Último gol' })[id] ?? id,
      paidKeys: new Set(['rosa']),
    });
    expect(text).toContain('*A vs B*');
    expect(text).toContain('nadie le apostó → pasa a Último gol');
    expect(text).toContain('• Rosa: S/ 7.00 ✅');
    expect(text).toContain('No hubo tarjetas amarillas: se devuelve lo apostado');
    expect(text).toContain('• Beto: S/ 2.00');
  });
});
