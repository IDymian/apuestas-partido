import { Component, computed, input } from '@angular/core';
import { EVENT_ICON, HOUSE_WARNING, MatchEvent, PublicMatchData, SECTIONS } from '../core/models';
import { makeSelectionLabel, publicToSettleInput, teamOrder, toTimelineEvents } from '../domain/adapt';
import { jornadaStats, PlayerCount } from '../domain/jornada-stats';
import { formatSoles, MarketResult, personKey, settle } from '../domain/settlement';

/** Pantalla pública: cancha, tabla de equipos, estadísticas, botes en vivo y resultados. */
@Component({
  selector: 'app-live-board',
  template: `
    @let d = data();
    @let finished = d.match.status === 'finished';
    @let t = result().timeline;

    @if (d.match.status !== 'open') {
      <!-- Cancha -->
      <section class="card">
        @if (!finished) {
          <div class="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3">
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">En cancha</p>
              <p class="truncate font-bold text-emerald-950">{{ team(t.onCourt[0]) }} vs {{ team(t.onCourt[1]) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Espera</p>
              <p class="font-semibold text-slate-700">{{ waiting() }}</p>
            </div>
          </div>
        }
        <div class="mt-3 flex items-baseline justify-between">
          <p class="text-3xl font-extrabold text-slate-900">⚽ {{ stats().totalGoals }} <span class="text-base font-semibold text-slate-500">goles</span></p>
          @if (stats().nextMilestone; as nm) {
            <p class="text-right text-sm text-slate-600">faltan <b>{{ nm.remaining }}</b> para el gol {{ nm.n }}</p>
          }
        </div>

        <table class="mt-3 w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-500">
              <th class="py-1 font-medium">Equipo</th>
              <th class="py-1 text-center font-medium">Ganados</th>
              <th class="py-1 text-center font-medium">Salidas</th>
              <th class="py-1 text-center font-medium">Racha</th>
              <th class="py-1 text-center font-medium">Máx.</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (id of teamIds(); track id) {
              @let s = t.stats[id];
              <tr>
                <td class="py-1.5 font-semibold">{{ team(id) }}</td>
                <td class="py-1.5 text-center font-bold">{{ s.wins }}</td>
                <td class="py-1.5 text-center">{{ s.exits }}</td>
                <td class="py-1.5 text-center">{{ s.currentStreak }}</td>
                <td class="py-1.5 text-center">{{ s.maxStreak }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <!-- Estadísticas de jugadores -->
      <section class="card mt-4">
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          @for (box of statBoxes(); track box.title) {
            <div class="min-w-0">
              <p class="text-xs font-semibold text-slate-500">{{ box.title }}</p>
              @for (r of box.rows.slice(0, 5); track r.playerId) {
                <p class="flex justify-between gap-1"><span class="truncate">{{ player(r.playerId) }}</span><b>{{ r.count }}</b></p>
              } @empty {
                <p class="text-slate-400">—</p>
              }
            </div>
          }
        </div>
      </section>
    }

    <!-- Botes por sección -->
    <p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">⚠️ {{ warning }}</p>
    @for (sec of sections(); track sec.id) {
      <h2 class="mt-4 mb-2 px-1 text-sm font-bold text-slate-700">{{ sec.icon }} Bote {{ sec.label }} · {{ soles(sec.total) }}</h2>
      <div class="grid gap-2">
        @for (r of sec.markets; track r.marketId) {
          <section class="card">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="font-bold text-slate-900">{{ r.name }}</h3>
                <p class="text-xs text-slate-500">{{ betCount().get(r.marketId) ?? 0 }} apuestas</p>
              </div>
              <p class="shrink-0 text-xl font-extrabold text-emerald-700">{{ soles(r.totalPotCents) }}</p>
            </div>
            @if (r.initialPotCents > 0 || r.rolledInCents > 0) {
              <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
                @if (r.initialPotCents > 0) {
                  <span class="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">+ {{ soles(r.initialPotCents) }} pozo inicial</span>
                }
                @if (r.rolledInCents > 0) {
                  <span class="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800">+ {{ soles(r.rolledInCents) }} arrastrado</span>
                }
              </div>
            }
            @switch (r.outcome) {
              @case ('winners') {
                <div class="mt-2 rounded-xl bg-emerald-50 p-2.5 text-sm">
                  <p class="text-emerald-900">{{ finished ? 'Ganó' : 'Va ganando' }}: <b>{{ label(r) }}</b></p>
                  @for (p of r.payouts; track p.personKey) {
                    <p class="flex justify-between"><span>{{ p.bettorName }}</span><b>{{ soles(p.amountCents) }}</b></p>
                  }
                </div>
              }
              @case ('no_winner') {
                <p class="mt-2 rounded-xl bg-slate-50 p-2.5 text-sm text-slate-700">
                  {{ finished ? 'Ganó' : 'Va' }}: <b>{{ label(r) }}</b> · nadie le apostó.
                  {{ r.rolledToMarketId ? 'El bote pasa a ' + marketName(r.rolledToMarketId) + '.' : finished ? 'El bote es del organizador.' : '' }}
                </p>
              }
              @case ('refund') {
                @if (finished) {
                  <p class="mt-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">{{ r.reason }}: se devuelve lo apostado.</p>
                }
              }
            }
          </section>
        }
      </div>
    }

    <!-- Resultados por persona -->
    @if (finished && result().people.length > 0) {
      <section class="card mt-4">
        <h2 class="font-bold text-slate-900">🏆 Cuánto cobra cada uno</h2>
        <table class="mt-2 w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-500">
              <th class="py-1 font-medium">Nombre</th>
              <th class="py-1 text-right font-medium">Apostó</th>
              <th class="py-1 text-right font-medium">Cobra</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (p of result().people; track p.personKey) {
              <tr [class.text-slate-400]="p.totalCents === 0">
                <td class="py-1.5">{{ p.bettorName }}</td>
                <td class="py-1.5 text-right">{{ soles(p.stakedCents) }}</td>
                <td class="py-1.5 text-right font-bold" [class.text-emerald-700]="p.totalCents > 0">{{ soles(p.totalCents) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }

    <!-- Eventos -->
    <section class="card mt-4">
      <h2 class="font-bold text-slate-900">Eventos</h2>
      @if (events().length === 0) {
        <p class="mt-1 text-sm text-slate-500">{{ d.match.status === 'open' ? 'La jornada aún no empieza.' : 'Sin eventos por ahora.' }}</p>
      } @else {
        <ul class="mt-2 space-y-1.5">
          @for (e of events(); track e.id) {
            <li class="flex items-start gap-2 text-sm">
              <span class="w-9 shrink-0 font-mono text-slate-500">{{ e.minute }}'</span>
              <span>{{ e.icon }}</span>
              <span class="min-w-0 flex-1">{{ e.text }}</span>
            </li>
          }
        </ul>
      }
    </section>

    <!-- Apuestas aprobadas -->
    <section class="card mt-4">
      <div class="flex items-baseline justify-between">
        <h2 class="font-bold text-slate-900">Apuestas aprobadas</h2>
        <span class="text-xs text-slate-500">{{ byPerson().length }} personas</span>
      </div>
      @if (byPerson().length === 0) {
        <p class="mt-1 text-sm text-slate-500">Todavía no hay apuestas aprobadas.</p>
      } @else {
        <ul class="mt-2 divide-y divide-slate-100">
          @for (p of byPerson(); track p.name) {
            <li class="py-2.5">
              <div class="flex justify-between">
                <span class="font-semibold text-slate-900">{{ p.name }}</span>
                <span class="text-sm font-semibold text-slate-600">{{ soles(p.total) }}</span>
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                @for (b of p.bets; track b.id) {
                  <span class="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{{ b.market }} · {{ b.choice }} · S/ {{ b.amount }}</span>
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
  protected readonly soles = formatSoles;
  protected readonly warning = HOUSE_WARNING;

  protected readonly result = computed(() => settle(publicToSettleInput(this.data())));
  private readonly timelineEvents = computed(() => toTimelineEvents(this.data().events));
  protected readonly stats = computed(() =>
    jornadaStats(this.timelineEvents(), this.data().markets.filter((m) => m.type === 'nth_goal' && m.param).map((m) => m.param!)),
  );
  protected readonly teamIds = computed(() => teamOrder(this.data().teams));
  private readonly players = computed(() => new Map(this.data().players.map((p) => [p.id, p.name])));
  private readonly teams = computed(() => new Map(this.data().teams.map((t) => [t.id, t.name])));
  private readonly markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  private readonly labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams));
  protected readonly waiting = computed(() => this.result().timeline.waiting.map((t) => this.team(t)).join(', ') || '—');

  protected readonly statBoxes = computed((): { title: string; rows: PlayerCount[] }[] => [
    { title: '⚽ Goleadores', rows: this.stats().scorers },
    { title: '🟨 Amarillas', rows: this.stats().yellows },
    { title: '🙈 Autogoles', rows: this.stats().ownGoals },
    { title: '🥜 Huachas recibidas', rows: this.stats().nutmegVictims },
  ]);

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
    [...this.data().events].sort((a, b) => a.minute - b.minute || a.seq - b.seq).map((e) => ({ id: e.id, minute: e.minute, icon: e.is_own_goal ? '🙈' : EVENT_ICON[e.type], text: this.describe(e) })),
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
        choice: this.labeler()(m?.target, b.player_id ?? b.team_id ?? String(b.option_value), m?.type),
        amount: b.amount,
      });
      map.set(key, entry);
    }
    return [...map.values()];
  });

  protected player(id: string | null) {
    return (id && this.players().get(id)) || '¿?';
  }
  protected team(id: string | null) {
    return (id && this.teams().get(id)) || '¿?';
  }
  protected label(r: MarketResult) {
    const m = this.markets().get(r.marketId);
    return this.labeler()(m?.target, r.winnerSelection, r.type);
  }
  protected marketName(id: string) {
    return this.markets().get(id)?.name ?? '';
  }

  private describe(e: MatchEvent): string {
    switch (e.type) {
      case 'goal':
        return e.is_own_goal ? `Autogol de ${this.player(e.player_id)} (para ${this.team(e.team_id)})` : `${this.player(e.player_id)} (para ${this.team(e.team_id)})`;
      case 'yellow':
        return `Amarilla a ${this.player(e.player_id)}`;
      case 'nutmeg':
        return `Huacha a ${this.player(e.player_id)}`;
      case 'rotation':
        return `Rotación: sale ${this.team(e.team_out_id)}`;
    }
  }
}
