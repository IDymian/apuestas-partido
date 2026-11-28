import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LeagueGame } from '../domain/league';
import { formatSoles } from '../domain/settlement';
import { MatchContext } from './match-context';
import { MarketOptionsComponent } from './market-options.component';
import { IconComponent } from '../ui/icon.component';
import { KitComponent } from '../ui/kit.component';

/** Tarjeta de un partido (estilo casa de apuestas): equipos, marcador y 1 / X / 2. */
@Component({
  selector: 'app-game-card',
  imports: [MarketOptionsComponent, IconComponent, KitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let g = game();
    <article class="glass p-0" [class.border-lime/50]="g.status === 'live'">
      <button type="button" class="flex w-full items-center gap-2.5 px-3.5 pt-2 pb-1 text-left" (click)="open.emit()" [attr.aria-label]="'Ver mercados del partido ' + g.number">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide uppercase" [class]="tone()">
            @if (g.status === 'live') {
              <span class="live-dot"></span>
            }
            @if (g.mode) {
              <span class="rounded bg-ink/[0.06] px-1.5 py-0.5 text-[10px] text-ink">M{{ g.mode }}</span>
            }
            Partido {{ g.number }} · {{ statusText() }}
          </p>
          <div class="mt-1 space-y-0.5">
            <p class="flex items-center justify-between gap-2 leading-tight font-bold">
              <span class="flex min-w-0 items-center gap-2"><app-kit class="h-4 w-4 shrink-0" [kit]="ctx.teamKit(g.home)" /><span class="truncate">{{ ctx.team(g.home) }}</span></span>
              @if (g.status !== 'pending') {
                <span class="font-display text-base font-extrabold tabular-nums">{{ g.homeGoals }}</span>
              }
            </p>
            <p class="flex items-center justify-between gap-2 leading-tight font-bold">
              <span class="flex min-w-0 items-center gap-2"><app-kit class="h-4 w-4 shrink-0" [kit]="ctx.teamKit(g.away)" /><span class="truncate">{{ ctx.team(g.away) }}</span></span>
              @if (g.status !== 'pending') {
                <span class="font-display text-base font-extrabold tabular-nums">{{ g.awayGoals }}</span>
              }
            </p>
          </div>
        </div>
        <span class="flex shrink-0 flex-col items-end gap-1">
          <span class="flex items-center gap-0.5 rounded-lg bg-lime/10 px-1.5 py-0.5 text-[11px] font-extrabold text-lime-deep">
            Formaciones · +{{ ctx.gameMarkets(g).length }} <app-icon name="chevron" [size]="14" class="-rotate-90" />
          </span>
          <span class="text-[11px] font-semibold text-mute">pozo {{ gamePot() }}</span>
        </span>
      </button>
      @if (winner(); as w) {
        <div class="px-2.5 pb-2">
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
}
