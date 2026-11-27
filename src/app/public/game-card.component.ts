import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LeagueGame } from '../domain/league';
import { formatSoles } from '../domain/settlement';
import { MatchContext } from './match-context';
import { MarketOptionsComponent } from './market-options.component';
import { IconComponent } from '../ui/icon.component';

/** Tarjeta de un partido (estilo casa de apuestas): equipos, marcador y 1 / X / 2. */
@Component({
  selector: 'app-game-card',
  imports: [MarketOptionsComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let g = game();
    <article class="glass p-0" [class.border-lime/50]="g.status === 'live'">
      <button type="button" class="flex w-full items-center gap-3 px-4 pt-3.5 pb-2 text-left" (click)="open.emit()" [attr.aria-label]="'Ver mercados del partido ' + g.number">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide uppercase" [class]="tone()">
            @if (g.status === 'live') {
              <span class="live-dot"></span>
            }
            Partido {{ g.number }} · {{ statusText() }}
          </p>
          <div class="mt-1.5 space-y-1">
            <p class="flex items-center justify-between gap-2 font-bold">
              <span class="flex min-w-0 items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" [class]="dot(0)"></span><span class="truncate">{{ ctx.team(g.home) }}</span></span>
              @if (g.status !== 'pending') {
                <span class="font-display text-lg font-extrabold tabular-nums">{{ g.homeGoals }}</span>
              }
            </p>
            <p class="flex items-center justify-between gap-2 font-bold">
              <span class="flex min-w-0 items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" [class]="dot(1)"></span><span class="truncate">{{ ctx.team(g.away) }}</span></span>
              @if (g.status !== 'pending') {
                <span class="font-display text-lg font-extrabold tabular-nums">{{ g.awayGoals }}</span>
              }
            </p>
          </div>
        </div>
        <span class="flex shrink-0 flex-col items-end gap-1">
          <span class="flex items-center gap-0.5 rounded-lg bg-lime/10 px-2 py-1 text-xs font-extrabold text-lime">
            +{{ ctx.gameMarkets(g).length }} apuestas <app-icon name="chevron" [size]="14" class="-rotate-90" />
          </span>
          <span class="text-[11px] font-semibold text-mute">bote {{ gamePot() }}</span>
        </span>
      </button>
      @if (winner(); as w) {
        <div class="px-3 pb-3">
          <app-market-options [market]="w" [compact]="true" (full)="full.emit()" />
        </div>
      }
    </article>
  `,
})
export class GameCardComponent {
  readonly game = input.required<LeagueGame>();
  readonly open = output<void>();
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly winner = computed(() => this.ctx.winnerMarket(this.game()));
  /** Suma de los botes de todas las apuestas del partido. */
  protected readonly gamePot = computed(() =>
    formatSoles(this.ctx.gameMarkets(this.game()).reduce((s, m) => s + (this.ctx.pots().get(m.id)?.pot ?? 0), 0)),
  );
  protected readonly statusText = computed(() => ({ pending: 'Próximo', live: 'En vivo', played: 'Finalizado' })[this.game().status]);
  protected readonly tone = computed(() => ({ pending: 'text-mute', live: 'text-candy', played: 'text-faint' })[this.game().status]);
  private readonly order = computed(() => (this.ctx.data()?.teams ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map((t) => t.id));

  protected dot(side: 0 | 1) {
    const id = side === 0 ? this.game().home : this.game().away;
    return ['bg-lime', 'bg-ink', 'bg-gold', 'bg-sky'][Math.max(0, this.order().indexOf(id)) % 4];
  }
}
