import { computed, Injectable, signal } from '@angular/core';
import { Market, PublicMatchData } from '../core/models';
import { makeSelectionLabel, publicToSettleInput } from '../domain/adapt';
import { LeagueGame } from '../domain/league';
import { GAME_MARKETS, isGameMarket } from '../domain/game-markets';
import { formatSoles, settle } from '../domain/settlement';
import { choicesFor, leagueOf, marketStates, potsOf } from './market-utils';

const GAME_ORDER = new Map(GAME_MARKETS.map((d, i) => [d.type, i]));

/** Datos de la jornada abierta y lo que se calcula de ellos (lo comparten todas las pestañas). */
@Injectable()
export class MatchContext {
  readonly data = signal<PublicMatchData | null>(null);
  readonly code = signal('');

  readonly league = computed(() => {
    const d = this.data();
    return d ? leagueOf(d) : null;
  });
  /** Liquidación en vivo de la jornada (botes, ganadores, cuánto cobra cada uno). */
  readonly result = computed(() => {
    const d = this.data();
    return d ? settle(publicToSettleInput(d)) : null;
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
  /** Perfil de apostador abierto (usuario). */
  readonly profileOf = signal<string | null>(null);
  /** Hoja de depósito abierta (monto sugerido, o 0 si no hay). */
  readonly depositAsk = signal<{ amount: number | null } | null>(null);
  /** Partido abierto en la hoja de apuestas (número). */
  readonly sheetGame = signal<number | null>(null);
  readonly openSheet = computed(() => this.league()?.games.find((g) => g.number === this.sheetGame()) ?? null);

  /** Mercados de un partido, en el orden del catálogo (ganador primero). */
  gameMarkets(g: LeagueGame): Market[] {
    return (this.data()?.markets ?? [])
      .filter((m) => isGameMarket(m.type) && m.param === g.number)
      .sort((a, b) => (GAME_ORDER.get(a.type) ?? 99) - (GAME_ORDER.get(b.type) ?? 99));
  }

  /**
   * ¿Ya está decidido este mercado? Liquidado por el organizador, jornada terminada,
   * su partido terminado (por partido) o todos los partidos terminados (de la jornada).
   */
  isFinal(marketId: string): boolean {
    const m = this.marketById().get(marketId);
    const d = this.data();
    const lg = this.league();
    if (!m || !d || !lg) return false;
    if (m.settled || d.match.status === 'finished') return true;
    if (isGameMarket(m.type)) return lg.games.find((g) => g.number === m.param)?.status === 'played';
    return lg.games.every((g) => g.status === 'played');
  }

  winnerMarket(g: LeagueGame): Market | undefined {
    return this.gameMarkets(g).find((m) => m.type === 'game_winner');
  }

  choices(m: Market) {
    const d = this.data();
    return d ? choicesFor(m, d, this.labeler()) : [];
  }

  /** Lo apostado a una opción (todo es por bote). */
  staked(marketId: string, selection: string) {
    return this.pots().get(marketId)?.bySel.get(selection) ?? 0;
  }
  stakedText(marketId: string, selection: string) {
    const c = this.staked(marketId, selection);
    return c ? formatSoles(c).replace('.00', '') : 'S/ 0';
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
