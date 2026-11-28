import { bettorBadges, playerBadges } from './badges';

const e = (type: string, player_id: string, is_own_goal = false) => ({ type, player_id, is_own_goal });

describe('insignias', () => {
  it('jugador: una sola insignia, la más fuerte', () => {
    const b = playerBadges([
      e('goal', 'a'), e('goal', 'a'), e('post', 'a'),
      e('goal', 'b'), e('post', 'b'),
      e('goal', 'c', true), e('blooper', 'c'),
      e('nutmeg', 'd'),
      e('goal', 'f'),
    ]);
    expect(Object.fromEntries(b)).toEqual({ a: 'lechero', b: 'pina', c: 'pina', d: 'donatello' });
  });

  it('apostador: vitrina según lo ganado y perdido', () => {
    expect(bettorBadges([])).toEqual([]);
    expect(bettorBadges(['won', 'won', 'lost'])).toEqual(['lechero']);
    expect(bettorBadges(['lost', 'lost'])).toEqual(['pina', 'donatello']);
    expect(bettorBadges(['lost', 'won'])).toEqual([]);
  });
});
