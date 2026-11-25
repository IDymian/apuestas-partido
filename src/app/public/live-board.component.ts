import { Component, computed, input } from '@angular/core';
import { minuteLabel, PublicMatchData, teamName } from '../core/models';
import { publicToSettleInput } from '../domain/adapt';
import { formatSoles, personKey, settle } from '../domain/settlement';

/** Pantalla pública: botes en vivo, eventos, apuestas aprobadas y resultados. */
@Component({
  selector: 'app-live-board',
  template: `
    @let d = data();
    @let finished = d.match.status === 'finished';

    <!-- Botes -->
    <div class="grid gap-3">
      @for (r of result().markets; track r.marketId) {
        <section class="card">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-bold text-slate-900">{{ r.name }}</h2>
              <p class="text-xs text-slate-500">
                {{ betCount().get(r.marketId) ?? 0 }} apuestas · {{ soles(r.betsPotCents) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bote</p>
              <p class="text-2xl font-extrabold text-emerald-700">{{ soles(r.totalPotCents) }}</p>
            </div>
          </div>

          @if (r.initialPotCents > 0 || r.rolledInCents > 0) {
            <div class="mt-2 flex flex-wrap gap-1.5 text-xs">
              @if (r.initialPotCents > 0) {
                <span class="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                  + {{ soles(r.initialPotCents) }} pozo inicial
                </span>
              }
              @if (r.rolledInCents > 0) {
                <span class="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800">
                  + {{ soles(r.rolledInCents) }} arrastrado de {{ marketNames(r.rolledInFrom) }}
                </span>
              }
            </div>
          }

          <!-- Resultado del mercado -->
          @switch (r.outcome) {
            @case ('winners') {
              <div class="mt-3 rounded-xl bg-emerald-50 p-3">
                <p class="text-sm text-emerald-900">
                  {{ finished ? 'Ganador' : 'Va ganando' }}: <b>{{ playerName(r.winnerPlayerId) }}</b>
                </p>
                <ul class="mt-1 text-sm">
                  @for (p of r.payouts; track p.personKey) {
                    <li class="flex justify-between">
                      <span>{{ p.bettorName }} <span class="text-xs text-slate-500">(apostó S/ {{ p.stakeCents / 100 }})</span></span>
                      <b>{{ soles(p.amountCents) }}</b>
                    </li>
                  }
                </ul>
              </div>
            }
            @case ('no_winner') {
              <div class="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                {{ finished ? 'Ganador' : 'Va' }}: <b>{{ playerName(r.winnerPlayerId) }}</b> · nadie le apostó.
                @if (r.rolledToMarketId) {
                  El bote pasa a <b>{{ marketNames([r.rolledToMarketId]) }}</b>.
                } @else {
                  @if (finished) {
                    El bote queda acumulado para el próximo partido.
                  } @else {
                    Si termina así, el bote queda acumulado.
                  }
                }
              </div>
            }
            @case ('refund') {
              @if (finished) {
                <div class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  {{ r.reason }}: se devuelve lo apostado.
                  @if (r.accumulatedCents > 0) {
                    {{ soles(r.accumulatedCents) }} quedan acumulados.
                  }
                </div>
              }
            }
          }
        </section>
      }
    </div>

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
        @if (result().accumulatedCents > 0) {
          <p class="mt-3 rounded-xl bg-amber-50 p-2 text-center text-sm text-amber-900">
            Acumulado para el próximo partido: <b>{{ soles(result().accumulatedCents) }}</b>
          </p>
        }
      </section>
    }

    <!-- Eventos -->
    <section class="card mt-4">
      <h2 class="font-bold text-slate-900">Eventos</h2>
      @if (events().length === 0) {
        <p class="mt-1 text-sm text-slate-500">
          {{ d.match.status === 'open' ? 'El partido aún no empieza.' : 'Sin goles ni amarillas por ahora.' }}
        </p>
      } @else {
        <ul class="mt-2 space-y-1.5">
          @for (e of events(); track e.id) {
            <li class="flex items-center gap-3 text-sm">
              <span class="w-12 shrink-0 font-mono text-slate-500">{{ e.minute }}</span>
              <span>{{ e.icon }}</span>
              <span class="min-w-0 flex-1 truncate"><b>{{ e.player }}</b><span class="ml-1.5 text-slate-500">{{ e.team }}</span></span>
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
                  <span class="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                    {{ b.market }} · {{ b.player }} · S/ {{ b.amount }}
                  </span>
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

  protected readonly result = computed(() => settle(publicToSettleInput(this.data())));
  private readonly players = computed(() => new Map(this.data().players.map((p) => [p.id, p])));
  private readonly markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));

  protected readonly betCount = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.data().bets) map.set(b.market_id, (map.get(b.market_id) ?? 0) + 1);
    return map;
  });

  protected readonly events = computed(() =>
    this.data().events.map((e) => {
      const p = this.players().get(e.player_id);
      return {
        id: e.id,
        minute: minuteLabel(e),
        icon: e.type === 'goal' ? '⚽' : '🟨',
        player: p?.name ?? '¿?',
        team: p ? teamName(this.data().match, p.team) : '',
      };
    }),
  );

  protected readonly byPerson = computed(() => {
    const map = new Map<string, { name: string; total: number; bets: { id: string; market: string; player: string; amount: number }[] }>();
    for (const b of this.data().bets) {
      const key = personKey(b.bettor_name);
      const entry = map.get(key) ?? { name: b.bettor_name, total: 0, bets: [] };
      entry.total += b.amount * 100;
      entry.bets.push({
        id: b.id,
        market: this.markets().get(b.market_id)?.name ?? '',
        player: this.players().get(b.player_id)?.name ?? '',
        amount: b.amount,
      });
      map.set(key, entry);
    }
    return [...map.values()];
  });

  protected playerName(id: string | null): string {
    return (id && this.players().get(id)?.name) || '¿?';
  }

  protected marketNames(ids: string[]): string {
    return ids.map((id) => this.markets().get(id)?.name ?? '').join(' y ');
  }
}
