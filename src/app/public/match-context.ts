import { computed, Injectable, signal } from '@angular/core';
import { GAME_MODES, GameModeId, Market, Player, PublicMatchData, Team } from '../core/models';
import { makeSelectionLabel, publicToSettleInput } from '../domain/adapt';
import { LeagueGame } from '../domain/league';
import { GAME_MARKETS, isGameMarket } from '../domain/game-markets';
import { formatSoles, settle } from '../domain/settlement';
import { choicesFor, leagueOf, marketStates, potsOf } from './market-utils';

const GAME_ORDER = new Map(GAME_MARKETS.map((d, i) => [d.type, i]));
const FALLBACK_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#e38a00'];

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
    return makeSelectionLabel(d?.players ?? [], d?.teams ?? [], d?.match.games ?? null);
  });
  readonly marketById = computed(() => new Map((this.data()?.markets ?? []).map((m) => [m.id, m])));
  readonly teamById = computed(() => new Map((this.data()?.teams ?? []).map((t) => [t.id, t])));
  readonly teamName = computed(() => new Map((this.data()?.teams ?? []).map((t) => [t.id, t.name])));
  readonly orderedTeams = computed(() => [...(this.data()?.teams ?? [])].sort((a, b) => a.sort_order - b.sort_order));
  readonly liveGame = computed(() => this.league()?.games.find((g) => g.status === 'live') ?? null);
  /** Equipo(s) que descansan respecto al partido en vivo o al último partido programado. */
  readonly restingTeams = computed<Team[]>(() => {
    const teams = this.orderedTeams();
    if (teams.length < 3) return [];
    const lg = this.league();
    const active = lg?.games.find((g) => g.status === 'live') ?? lg?.games.find((g) => g.status === 'pending') ?? lg?.games.at(-1);
    if (!active) return [];
    return teams.filter((t) => t.id !== active.home && t.id !== active.away);
  });
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

  /** Jugadores asignados a un equipo en el modo dado (devuelve la posición/dorsal de ese modo). */
  teamPlayers(teamId: string, mode: GameModeId = 1): Player[] {
    const out: Player[] = [];
    for (const p of this.data()?.players ?? []) {
      if (p.is_own_goal) continue;
      const ms = p.modes?.[mode];
      const tid = ms ? ms.team_id : mode === 1 ? p.team_id : null;
      if (tid !== teamId) continue;
      out.push(
        ms
          ? { ...p, team_id: ms.team_id, position: ms.position, shirt_number: ms.shirt_number, slot: ms.slot }
          : p,
      );
    }
    return out.sort((a, b) => (a.slot ?? a.sort_order) - (b.slot ?? b.sort_order));
  }

  /** Etiqueta corta del modo ("Modo 1", "Modo 2", "Modo 3"). */
  modeMeta(mode: GameModeId = 1) {
    return GAME_MODES.find((m) => m.id === mode) ?? GAME_MODES[0];
  }

  /**
   * Top goleadores acumulados de Modo 1 + Modo 2 (regla del Formato 3: Draft de goleadores).
   * Los 3 primeros son los capitanes que eligen 1°, 2° y 3°.
   */
  readonly draftCaptains = computed(() => {
    const d = this.data();
    const lg = this.league();
    if (!d || !lg) return [];
    const eligibleGames = new Set(lg.games.filter((g) => (g.mode ?? 1) === 1 || (g.mode ?? 1) === 2).map((g) => g.number));
    const counts = new Map<string, { count: number; firstSeq: number }>();
    for (const e of d.events) {
      if (e.type !== 'goal' || e.is_own_goal || !e.player_id) continue;
      if (e.game != null && !eligibleGames.has(e.game)) continue;
      const cur = counts.get(e.player_id) ?? { count: 0, firstSeq: e.seq };
      cur.count++;
      counts.set(e.player_id, cur);
    }
    const nameMap = new Map(d.players.map((p) => [p.id, p.name]));
    return [...counts.entries()]
      .map(([playerId, v]) => ({ playerId, name: nameMap.get(playerId) ?? '¿?', goals: v.count, firstSeq: v.firstSeq }))
      .sort((a, b) => b.goals - a.goals || a.firstSeq - b.firstSeq);
  });

  /** Color del equipo (hex para puntos, escudos y camisetas). */
  teamColor(id: string): string {
    const t = this.teamById().get(id);
    if (t?.color) return t.color;
    const idx = Math.max(0, this.orderedTeams().findIndex((x) => x.id === id));
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
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

  /**
   * Multiplicador estimado por S/ 1 en apuestas por bote:
   * - Si el bote del mercado es 0 → null (nadie ha apostado aún).
   * - Si hay apuestas en esta opción → bote / apostado a esta opción.
   * - Si hay bote en el mercado pero S/ 0 en esta opción → (bote + S/ 1) / S/ 1.
   */
  estimatedMultiplier(marketId: string, selection: string): number | null {
    const entry = this.pots().get(marketId);
    if (!entry || entry.pot <= 0) return null;
    const sel = entry.bySel.get(selection) ?? 0;
    const mult = sel > 0 ? entry.pot / sel : (entry.pot + 100) / 100;
    return Math.max(1, mult);
  }

  /** Texto corto para mostrar en botones de cuota/formación: "x2.4" o "Apostar" (sin S/ 0 vacío). */
  oddText(marketId: string, selection: string, emptyLabel = 'Apostar'): string {
    const mult = this.estimatedMultiplier(marketId, selection);
    if (mult === null) return emptyLabel;
    return mult >= 10 ? `x${mult.toFixed(0)}` : `x${mult.toFixed(1)}`;
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
