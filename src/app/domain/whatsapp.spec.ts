import { describe, expect, it } from 'vitest';
import { settle, SettleMarket } from './settlement';
import { whatsappSummary } from './whatsapp';

const m = (id: string, type: string, sortOrder: number, extra: Partial<SettleMarket> = {}): SettleMarket => ({
  id, name: id, type, sortOrder, isActive: true, rolloverToMarketId: null, initialPot: 0, param: null, ...extra,
});

describe('whatsappSummary()', () => {
  it('muestra ganadores (jugador o número), devoluciones, pagados y lo del organizador', () => {
    const r = settle({
      markets: [m('Primer gol', 'first_goal', 1), m('Racha más larga', 'longest_streak', 2), m('Primera amarilla', 'first_yellow', 3)],
      teamIds: ['a', 'b', 'c'],
      startingTeamIds: ['a', 'b'],
      ownGoalOptionId: 'og',
      events: [{ id: 'e1', type: 'goal', playerId: 'ful', teamId: 'a', isOwnGoal: false, teamOutId: null, minute: 5, seq: 1 }],
      bets: [
        { ticketId: 't1', ticketStatus: 'approved', bettorName: 'Ana', marketId: 'Primer gol', selection: 'pep', amount: 4 },
        { ticketId: 't2', ticketStatus: 'approved', bettorName: 'Rosa', marketId: 'Racha más larga', selection: '1', amount: 3 },
        { ticketId: 't3', ticketStatus: 'approved', bettorName: 'Beto', marketId: 'Primera amarilla', selection: 'x', amount: 2 },
      ],
    });
    const text = whatsappSummary(r, {
      title: 'Álvaro Fest',
      selectionLabel: (mk, s) => (mk.type === 'longest_streak' ? `racha de ${s}` : ({ ful: 'Fulanito' } as Record<string, string>)[s ?? ''] ?? '¿?'),
      marketName: (id) => id,
      paidKeys: new Set(['rosa']),
    });
    expect(text).toContain('*Álvaro Fest*');
    expect(text).toContain('Ganó: Fulanito, nadie le apostó → se lo queda el organizador');
    expect(text).toContain('Ganó: racha de 1');
    expect(text).toContain('• Rosa: S/ 3.00 ✅');
    expect(text).toContain('No hubo amarillas: se devuelve lo apostado');
    expect(text).toContain('Para el organizador (nadie acertó): S/ 4.00');
  });
});
