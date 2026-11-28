import { Component, computed, input } from '@angular/core';
import { EVENT_ICON, GAME_MODES, GameModeId, HOUSE_WARNING, isPlayerEvent, MatchEvent, PLAYER_EVENTS, PublicMatchData, SECTIONS } from '../core/models';
import { makeSelectionLabel, publicToSettleInput, teamOrder, toTimelineEvents } from '../domain/adapt';
import { jornadaStats, PlayerCount } from '../domain/jornada-stats';
import { tableForMode } from '../domain/league';
import { formatSoles, MarketResult, personKey, settle } from '../domain/settlement';
import { CountUpComponent } from '../ui/count-up.component';
import { IconComponent } from '../ui/icon.component';

const TEAM_TONES = ['from-lime to-[#ff9a4d] text-white', 'from-ink to-ink/70 text-white', 'from-gold to-[#ffc266] text-white', 'from-[#ffd9bd] to-[#ffeadb] text-ink'];

/** Pantalla pública: cancha, tabla de equipos, estadísticas, botes en vivo y resultados. */
@Component({
  selector: 'app-live-board',
  imports: [CountUpComponent, IconComponent],
  template: `
    @let d = data();
    @let finished = d.match.status === 'finished';

    <!-- Bote total -->
    <section class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ff8a1f] via-lime to-[#d13f00] p-5 text-white shadow-[0_24px_50px_-20px_rgb(242_98_0/0.7)] anim-in">
      <div class="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/25 blur-3xl"></div>
      <p class="eyebrow flex items-center gap-2 text-white/85">
        @if (result().league.games.some(g => g.status === 'live')) {
          <span class="live-dot"></span> En vivo
        } @else if (finished || result().league.games.every(g => g.status === 'played')) {
          🏁 Final
        } @else {
          ⏳ Calentando motores
        }
      </p>
      <p class="mt-1 text-sm text-white/85">Pozo total de la pichanga</p>
      <p class="font-display text-5xl font-extrabold tracking-tight"><app-count-up [cents]="totalPot()" /></p>
      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="tag bg-white/20 text-white">👥 {{ byPerson().length }} apostadores</span>
        <span class="tag bg-white/20 text-white">🎟️ {{ d.bets.length }} apuestas</span>
        <span class="tag bg-white/20 text-white">⚽ {{ stats().totalGoals }} goles</span>
      </div>
    </section>

    @if (true) {
      <!-- Partido en juego -->
      @let lg = result().league;
      @let cur = currentGame();
      @if (cur && cur.status === 'live') {
        <section class="glass mt-4 anim-in" style="--i: 1">
          <p class="eyebrow flex items-center gap-2">
            @if (cur.status === 'live') {
              <span class="live-dot"></span> Partido {{ cur.number }} de {{ lg.games.length }} · en juego
            } @else {
              🏁 Partido {{ cur.number }} de {{ lg.games.length }} · final
            }
          </p>
          <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="rounded-2xl bg-gradient-to-br p-3 text-center font-display text-lg font-extrabold" [class]="teamTone(cur.home)">{{ team(cur.home) }}</div>
            <p class="px-1 font-display text-4xl font-extrabold tabular-nums">{{ cur.homeGoals }}<span class="text-faint">-</span>{{ cur.awayGoals }}</p>
            <div class="rounded-2xl bg-gradient-to-br p-3 text-center font-display text-lg font-extrabold" [class]="teamTone(cur.away)">{{ team(cur.away) }}</div>
          </div>
          @if (stats().nextMilestone; as nm) {
            <div class="mt-4">
              <div class="flex justify-between text-xs font-bold text-mute">
                <span>{{ stats().totalGoals }} goles en la liga · hacia el gol {{ nm.n }}</span><span>faltan {{ nm.remaining }}</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-[width] duration-700" [style.width.%]="(stats().totalGoals / nm.n) * 100"></div>
              </div>
            </div>
          }
        </section>
      }

      <!-- Rumbo al Draft (Top 3 goleadores acumulados de Modo 1 + Modo 2) -->
      <section class="glass mt-4 border-gold/30 anim-in" style="--i: 2">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="font-display text-xl font-extrabold">👑 Rumbo al Draft</h2>
          <span class="text-xs font-bold text-mute">Modo 1 + Modo 2</span>
        </div>
        <p class="mt-0.5 text-xs text-mute">Los 3 máximos goleadores serán los capitanes del Modo 3.</p>
        <ol class="mt-2.5 space-y-1.5">
          @for (slot of [0, 1, 2]; track slot) {
            @let row = draftTop()[slot];
            <li class="flex items-center gap-2.5 rounded-xl bg-night-3/70 px-3 py-2 text-sm">
              <span class="text-base">{{ ['🥇', '🥈', '🥉'][slot] }}</span>
              <span class="min-w-0 flex-1 truncate font-bold" [class.text-faint]="!row">{{ row ? player(row.playerId) : 'Por definirse' }}</span>
              <span class="shrink-0 font-display text-xs font-extrabold tabular-nums" [class]="row ? 'text-lime-deep' : 'text-faint'">
                {{ row ? row.count + (row.count === 1 ? ' gol' : ' goles') : '0 goles' }} · elige {{ slot + 1 }}°
              </span>
            </li>
          }
        </ol>
      </section>

      <!-- Fixture -->
      <section class="glass mt-4 anim-in" style="--i: 2">
        <h2 class="font-display text-xl font-extrabold">🆚 Partidos</h2>
        <ol class="mt-2 divide-y divide-ink/[0.06]">
          @for (g of lg.games; track g.number) {
            <li class="flex items-center gap-2 py-2.5 text-sm" [class.font-bold]="g.status === 'live'">
              <span class="w-12 shrink-0 text-xs font-bold text-faint">{{ g.mode ? 'M' + g.mode + '·' : '' }}P{{ g.number }}</span>
              <span class="min-w-0 flex-1 truncate text-right">{{ team(g.home) }}</span>
              <span class="w-14 shrink-0 rounded-lg py-0.5 text-center font-display font-extrabold tabular-nums" [class]="g.status === 'live' ? 'bg-lime text-white' : g.status === 'played' ? 'bg-ink/[0.06]' : 'text-faint'">
                {{ g.status === 'pending' ? 'vs' : g.homeGoals + '-' + g.awayGoals }}
              </span>
              <span class="min-w-0 flex-1 truncate">{{ team(g.away) }}</span>
            </li>
          }
        </ol>
      </section>

      <!-- Tabla(s) por modo -->
      @for (tb of modeTables(); track tb.id) {
        <section class="glass mt-4 anim-in" style="--i: 3">
          <h2 class="font-display text-xl font-extrabold">🏆 Tabla{{ tb.title ? ' · ' + tb.title : '' }}</h2>
          <table class="mt-2 w-full text-sm">
            <thead>
              <tr class="text-left text-[11px] text-mute uppercase">
                <th class="py-1 font-bold">Equipo</th>
                <th class="py-1 text-center font-bold">PJ</th>
                <th class="py-1 text-center font-bold">G</th>
                <th class="py-1 text-center font-bold">E</th>
                <th class="py-1 text-center font-bold">P</th>
                <th class="py-1 text-center font-bold">DG</th>
                <th class="py-1 text-center font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              @for (r of tb.rows; track r.teamId; let i = $index) {
                <tr class="border-t border-ink/[0.06]" [class.bg-lime/10]="i === 0 && r.played > 0">
                  <td class="py-2 font-bold"><span class="mr-1 text-faint">{{ i + 1 }}</span> {{ team(r.teamId) }}</td>
                  <td class="py-2 text-center">{{ r.played }}</td>
                  <td class="py-2 text-center">{{ r.won }}</td>
                  <td class="py-2 text-center">{{ r.drawn }}</td>
                  <td class="py-2 text-center">{{ r.lost }}</td>
                  <td class="py-2 text-center">{{ r.gd > 0 ? '+' + r.gd : r.gd }}</td>
                  <td class="py-2 text-center font-display text-base font-extrabold">{{ r.points }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="mt-2 text-[11px] text-faint">3 puntos por ganar, 1 por empatar. Desempate: diferencia de gol y goles a favor.</p>
        </section>
      }

      <!-- Estadísticas de jugadores -->
      <section class="mt-4 grid grid-cols-2 gap-2.5">
        @for (box of statBoxes(); track box.title; let i = $index) {
          <div class="glass p-3.5 anim-in" [style.--i]="i + 2">
            <p class="text-xs font-extrabold text-mute">{{ box.title }}</p>
            @for (r of box.rows.slice(0, 3); track r.playerId; let k = $index) {
              <p class="mt-1 flex items-center justify-between gap-1 text-sm">
                <span class="truncate" [class.font-bold]="k === 0">{{ player(r.playerId) }}</span>
                <b [class.text-lime]="k === 0">{{ r.count }}</b>
              </p>
            } @empty {
              <p class="mt-1 text-sm text-faint">—</p>
            }
          </div>
        }
      </section>
    }

    <!-- Botes por sección -->
    <p class="mt-5 flex gap-2.5 rounded-2xl border border-gold/25 bg-gold/10 p-3 text-sm text-gold">
      <app-icon name="alert" [size]="18" class="mt-0.5" /> {{ warning }}
    </p>
    @for (sec of sections(); track sec.id) {
      <div class="mt-6 mb-2.5 flex items-end justify-between px-1">
        <h2 class="font-display text-xl font-extrabold">{{ sec.icon }} {{ sec.label }}</h2>
        <span class="font-display text-lg font-extrabold text-lime"><app-count-up [cents]="sec.total" /></span>
      </div>
      <div class="grid gap-2.5">
        @for (r of sec.markets; track r.marketId; let i = $index) {
          <article class="glass anim-in" [style.--i]="i % 6" [class.border-lime/40]="r.outcome === 'winners'">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="font-bold leading-tight">{{ r.name }}</h3>
                <p class="text-xs text-mute">{{ betCount().get(r.marketId) ?? 0 }} apuestas</p>
              </div>
              <p class="shrink-0 font-display text-xl font-extrabold"><app-count-up [cents]="r.totalPotCents" /></p>
            </div>
            @if (r.initialPotCents > 0 || r.rolledInCents > 0) {
              <div class="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                @if (r.initialPotCents > 0) {
                  <span class="rounded-full bg-gold/15 px-2 py-0.5 font-bold text-gold">+ {{ soles(r.initialPotCents) }} pozo inicial</span>
                }
                @if (r.rolledInCents > 0) {
                  <span class="rounded-full bg-sky/15 px-2 py-0.5 font-bold text-sky">+ {{ soles(r.rolledInCents) }} arrastrado</span>
                }
              </div>
            }
            @switch (r.outcome) {
              @case ('winners') {
                <div class="mt-2.5 rounded-2xl bg-lime/10 p-3 text-sm">
                  <p class="text-lime">{{ finished ? '🏆 Ganó' : '🔥 Va ganando' }}: <b>{{ label(r) }}</b></p>
                  @for (p of r.payouts; track p.personKey) {
                    <p class="mt-1 flex justify-between" [class.font-extrabold]="isMe(p.personKey)">
                      <span>{{ p.bettorName }}{{ isMe(p.personKey) ? ' (tú)' : '' }}</span><b>{{ soles(p.amountCents) }}</b>
                    </p>
                  }
                </div>
              }
              @case ('no_winner') {
                <p class="mt-2.5 rounded-2xl bg-ink/[0.04] p-3 text-sm text-mute">
                  {{ finished ? 'Ganó' : 'Va' }}: <b class="text-ink">{{ label(r) }}</b> · nadie le atinó.
                  {{ r.rolledToMarketId ? 'El pozo pasa a ' + marketName(r.rolledToMarketId) + '.' : finished ? 'El pozo auspicia el fullvaso de Álvaro.' : '' }}
                </p>
              }
              @case ('refund') {
                @if (finished) {
                  <p class="mt-2.5 rounded-2xl bg-gold/10 p-3 text-sm text-gold">{{ r.reason }}: se devuelve lo apostado.</p>
                }
              }
            }
          </article>
        }
      </div>
    }

    <!-- Resultados por persona -->
    @if (finished && result().people.length > 0) {
      <section class="glass mt-6">
        <h2 class="font-display text-xl font-extrabold">🏆 Cuánto cobra cada uno</h2>
        <ol class="mt-3 space-y-1.5">
          @for (p of result().people; track p.personKey; let i = $index) {
            <li class="flex items-center gap-3 rounded-2xl px-2 py-2" [class.bg-lime/10]="isMe(p.personKey)" [class.opacity-50]="p.totalCents === 0">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold" [class]="i === 0 && p.totalCents > 0 ? 'bg-gold text-white' : 'bg-ink/[0.06]'">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate font-semibold">{{ p.bettorName }}</span>
              <span class="text-xs text-mute">apostó {{ soles(p.stakedCents) }}</span>
              <b class="w-20 text-right" [class.text-lime]="p.totalCents > 0">{{ soles(p.totalCents) }}</b>
            </li>
          }
        </ol>
      </section>
    }

    <!-- Eventos -->
    <section class="glass mt-6">
      <h2 class="font-display text-xl font-extrabold">Minuto a minuto</h2>
      @if (events().length === 0) {
        <p class="mt-1 text-sm text-mute">{{ d.match.status === 'open' ? 'La pichanga aún no arranca.' : 'Sin jugadas por ahora.' }}</p>
      } @else {
        <ol class="relative mt-3 space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[1.35rem] before:w-px before:bg-white/10">
          @for (e of events(); track e.id; let i = $index) {
            <li class="relative flex items-center gap-3 anim-in" [style.--i]="i % 8">
              <span class="z-10 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-ink/10 bg-night-3 text-xl">{{ e.icon }}</span>
              <span class="min-w-0 flex-1 text-sm">{{ e.text }}</span>
              <span class="shrink-0 text-right font-mono text-xs font-bold text-faint">{{ e.game ? 'P' + e.game + ' · ' : '' }}{{ e.minute }}'</span>
            </li>
          }
        </ol>
      }
    </section>

    <!-- Apuestas aprobadas -->
    <section class="glass mt-4">
      <div class="flex items-baseline justify-between">
        <h2 class="font-display text-xl font-extrabold">Apuestas aprobadas</h2>
        <span class="tag">{{ byPerson().length }} personas</span>
      </div>
      @if (byPerson().length === 0) {
        <p class="mt-1 text-sm text-mute">Puro chihuán por acá. Nadie suelta ni una luca todavía.</p>
      } @else {
        <ul class="mt-2 divide-y divide-ink/[0.06]">
          @for (p of byPerson(); track p.name) {
            <li class="py-3">
              <div class="flex justify-between">
                <span class="font-bold">{{ p.name }}</span>
                <span class="text-sm font-bold text-mute">{{ soles(p.total) }}</span>
              </div>
              <div class="mt-1.5 flex flex-wrap gap-1">
                @for (b of p.bets; track b.id) {
                  <span class="rounded-lg bg-ink/[0.05] px-2 py-1 text-xs text-mute">{{ b.market }} · <b class="text-ink">{{ b.choice }}</b> · S/ {{ b.amount }}</span>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class LiveBoardComponent {
  readonly data = input.required<PublicMatchData>();
  /** Usuario logueado (para resaltar "tú"). */
  readonly me = input<string | null>(null);
  protected readonly soles = formatSoles;
  protected readonly warning = HOUSE_WARNING;
  protected readonly Math = Math;

  protected readonly result = computed(() => settle(publicToSettleInput(this.data())));
  private readonly timelineEvents = computed(() => toTimelineEvents(this.data().events));
  protected readonly stats = computed(() =>
    jornadaStats(this.timelineEvents(), this.data().markets.filter((m) => m.type === 'nth_goal' && m.param).map((m) => m.param!)),
  );
  protected readonly teamIds = computed(() => teamOrder(this.data().teams));
  private readonly players = computed(() => new Map(this.data().players.map((p) => [p.id, p.name])));
  private readonly teams = computed(() => new Map(this.data().teams.map((t) => [t.id, t.name])));
  private readonly markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  private readonly labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams, this.data().match.games ?? null));
  protected readonly currentGame = computed(() => this.result().league.games.find((g) => g.number === (this.data().match.current_game ?? 1)) ?? null);
  protected readonly totalPot = computed(() => this.result().markets.reduce((s, r) => s + r.totalPotCents, 0));

  /** Goleadores acumulados solo de Modo 1 + Modo 2 (para definir los 3 capitanes del Draft). */
  protected readonly draftTop = computed(() => {
    const eligible = new Set(
      this.result()
        .league.games.filter((g) => (g.mode ?? 1) === 1 || (g.mode ?? 1) === 2)
        .map((g) => g.number),
    );
    const counts = new Map<string, { count: number; firstSeq: number }>();
    for (const e of this.data().events) {
      if (e.type !== 'goal' || e.is_own_goal || !e.player_id) continue;
      if (e.game != null && !eligible.has(e.game)) continue;
      const cur = counts.get(e.player_id) ?? { count: 0, firstSeq: e.seq };
      cur.count++;
      counts.set(e.player_id, cur);
    }
    return [...counts.entries()]
      .map(([playerId, v]) => ({ playerId, count: v.count, firstSeq: v.firstSeq }))
      .sort((a, b) => b.count - a.count || a.firstSeq - b.firstSeq);
  });

  /** Tablas separadas por modo cuando hay más de un modo en la jornada. */
  protected readonly modeTables = computed(() => {
    const lg = this.result().league;
    const present = [...new Set(lg.games.map((g) => (g.mode ?? 1) as GameModeId))].sort();
    if (present.length <= 1) return [{ id: 0, title: '', rows: lg.table }];
    return present.map((m) => {
      const meta = GAME_MODES.find((x) => x.id === m);
      return {
        id: m,
        title: meta ? `${meta.short} · ${meta.name}` : `Modo ${m}`,
        rows: tableForMode(lg.games, this.teamIds(), m),
      };
    });
  });

  protected readonly statBoxes = computed((): { title: string; rows: PlayerCount[] }[] => {
    const s = this.stats();
    const extra = (['red', 'golazo', 'post', 'blooper', 'penalty', 'penalty_miss', 'dive'] as const)
      .filter((t) => s.byType[t]?.length)
      .map((t) => ({ title: `${PLAYER_EVENTS[t].icon} ${PLAYER_EVENTS[t].stat}`, rows: s.byType[t] }));
    return [
      { title: '⚽ Goleadores', rows: s.scorers },
      { title: '🟨 Amarillas', rows: s.yellows },
      ...extra,
      { title: '🙈 Autogoles', rows: s.ownGoals },
      { title: '🥜 Huachas recibidas', rows: s.nutmegVictims },
    ];
  });

  protected readonly sections = computed(() =>
    SECTIONS.map((s) => {
      const markets = this.result().markets.filter((r) => this.markets().get(r.marketId)?.section === s.id);
      return { ...s, markets, total: markets.reduce((sum, r) => sum + r.totalPotCents, 0) };
    }).filter((s) => s.markets.length),
  );

  protected readonly betCount = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.data().bets) map.set(b.market_id, (map.get(b.market_id) ?? 0) + 1);
    return map;
  });

  protected readonly events = computed(() =>
    [...this.data().events]
      .sort((a, b) => b.minute - a.minute || b.seq - a.seq)
      .map((e) => ({ id: e.id, minute: e.minute, game: e.game, icon: e.is_own_goal ? '🙈' : EVENT_ICON[e.type], text: this.describe(e) })),
  );

  protected readonly byPerson = computed(() => {
    const map = new Map<string, { name: string; total: number; bets: { id: string; market: string; choice: string; amount: number }[] }>();
    for (const b of this.data().bets) {
      const key = personKey(b.bettor_name);
      const entry = map.get(key) ?? { name: b.bettor_name, total: 0, bets: [] };
      const m = this.markets().get(b.market_id);
      entry.total += b.amount * 100;
      entry.bets.push({
        id: b.id,
        market: m?.name ?? '',
        choice: this.labeler()(m?.target, b.player_id ?? b.team_id ?? String(b.option_value), m?.type, m?.param),
        amount: b.amount,
      });
      map.set(key, entry);
    }
    return [...map.values()];
  });

  protected isMe(key: string) {
    const me = this.me();
    return !!me && personKey(me) === key;
  }
  protected teamTone(id: string) {
    return TEAM_TONES[Math.max(0, this.teamIds().indexOf(id)) % TEAM_TONES.length];
  }
  protected player(id: string | null) {
    return (id && this.players().get(id)) || '¿?';
  }
  protected team(id: string | null) {
    return (id && this.teams().get(id)) || '¿?';
  }
  protected label(r: MarketResult) {
    const m = this.markets().get(r.marketId);
    return this.labeler()(m?.target, r.winnerSelection, r.type, m?.param);
  }
  protected marketName(id: string) {
    return this.markets().get(id)?.name ?? '';
  }

  private describe(e: MatchEvent): string {
    if (e.type === 'goal') {
      return e.is_own_goal ? `Autogol de ${this.player(e.player_id)} (para ${this.team(e.team_id)})` : `Gol de ${this.player(e.player_id)} para ${this.team(e.team_id)}`;
    }
    if (e.type === 'rotation') return `Rotación: sale ${this.team(e.team_out_id)}`;
    return isPlayerEvent(e.type) ? PLAYER_EVENTS[e.type].text(this.player(e.player_id)) : '';
  }
}
