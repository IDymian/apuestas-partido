import { computed, Injectable, signal } from '@angular/core';
import { Market, PublicMatchData } from '../core/models';
import { makeSelectionLabel } from '../domain/adapt';
import { LeagueGame } from '../domain/league';
import { choicesFor, leagueOf, marketStates, oddsOf, potsOf } from './market-utils';

/** Datos de la jornada abierta y lo que se calcula de ellos (lo comparten todas las pestañas). */
@Injectable()
export class MatchContext {
  readonly data = signal<PublicMatchData | null>(null);
  readonly code = signal('');

  readonly league = computed(() => {
    const d = this.data();
    return d ? leagueOf(d) : null;
  });
  readonly states = computed(() => {
    const d = this.data();
    const l = this.league();
    return d && l ? marketStates(d, l) : new Map();
  });
  readonly pots = computed(() => {
    const d = this.data();
    return d ? potsOf(d) : new Map();
  });
  readonly labeler = computed(() => {
    const d = this.data();
    return makeSelectionLabel(d?.players ?? [], d?.teams ?? []);
  });
  readonly marketById = computed(() => new Map((this.data()?.markets ?? []).map((m) => [m.id, m])));
  readonly teamName = computed(() => new Map((this.data()?.teams ?? []).map((t) => [t.id, t.name])));
  readonly liveGame = computed(() => this.league()?.games.find((g) => g.status === 'live') ?? null);

  /** Mercados de un partido (ganador primero). */
  gameMarkets(g: LeagueGame): Market[] {
    return (this.data()?.markets ?? [])
      .filter((m) => (m.type === 'game_winner' || m.type === 'game_first_goal') && m.param === g.number)
      .sort((a, b) => (a.type === 'game_winner' ? -1 : 1) - (b.type === 'game_winner' ? -1 : 1));
  }

  winnerMarket(g: LeagueGame): Market | undefined {
    return this.gameMarkets(g).find((m) => m.type === 'game_winner');
  }

  choices(m: Market) {
    const d = this.data();
    return d ? choicesFor(m, d, this.labeler()) : [];
  }

  odds(marketId: string, selection: string) {
    return oddsOf(this.pots(), marketId, selection);
  }

  state(marketId: string) {
    return this.states().get(marketId) ?? { open: false, reason: null };
  }

  team(id: string) {
    return this.teamName().get(id) ?? '¿?';
  }

  /** Texto de la opción elegida, para el cupón. */
  selectionLabel(marketId: string, selection: string) {
    const m = this.marketById().get(marketId);
    return this.labeler()(m?.target, selection, m?.type, m?.param);
  }
}
