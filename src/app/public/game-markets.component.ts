import { Component, computed, inject, input, output, signal } from '@angular/core';
import { GAME_GROUPS, GAME_MARKET_BY_TYPE } from '../domain/game-markets';
import { LeagueGame } from '../domain/league';
import { formatSoles } from '../domain/settlement';
import { SlipService } from '../core/slip';
import { MatchContext } from './match-context';
import { MarketOptionsComponent } from './market-options.component';
import { IconComponent } from '../ui/icon.component';

/** Todas las apuestas de un partido, agrupadas (Resultado, Goles, Tarjetas, Show, ¿Pasará?). */
@Component({
  selector: 'app-game-markets',
  imports: [MarketOptionsComponent, IconComponent],
  template: `
    @for (grp of groups(); track grp.id) {
      <h4 class="mt-4 mb-2 px-1 text-xs font-extrabold tracking-wider text-mute uppercase first:mt-0">{{ grp.label }}</h4>
      <div class="space-y-2">
        @for (m of grp.markets; track m.id) {
          @let isOpen = expanded().has(m.id);
          @let picked = countFor(m.id);
          <article class="rounded-2xl border border-ink/[0.07] bg-white" [class.border-lime/50]="picked > 0">
            <button type="button" class="flex w-full items-center gap-3 px-3.5 py-3 text-left" (click)="toggle(m.id)" [attr.aria-expanded]="isOpen">
              <span class="min-w-0 flex-1">
                <span class="block font-bold leading-tight">{{ label(m.type) }}</span>
                <span class="block text-xs text-mute">bote {{ pot(m.id) }}{{ ctx.state(m.id).open ? '' : ' · ' + ctx.state(m.id).reason }}</span>
              </span>
              @if (picked) {
                <span class="grid h-6 min-w-6 place-items-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-white">{{ picked }}</span>
              }
              <app-icon name="chevron" [size]="18" class="text-faint transition-transform duration-300" [class.rotate-180]="isOpen" />
            </button>
            @if (isOpen) {
              <div class="border-t border-ink/[0.06] p-3 anim-expand">
                <app-market-options [market]="m" (full)="full.emit()" />
              </div>
            }
          </article>
        }
      </div>
    }
  `,
})
export class GameMarketsComponent {
  readonly game = input.required<LeagueGame>();
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  private readonly slip = inject(SlipService);
  /** Abiertos: el ganador por defecto. */
  protected readonly expanded = signal<Set<string>>(new Set());
  private initFor = 0;

  protected readonly groups = computed(() => {
    const markets = this.ctx.gameMarkets(this.game());
    if (this.initFor !== this.game().number) {
      this.initFor = this.game().number;
      const w = markets.find((m) => m.type === 'game_winner');
      queueMicrotask(() => this.expanded.set(new Set(w ? [w.id] : [])));
    }
    return GAME_GROUPS.map((g) => ({ ...g, markets: markets.filter((m) => GAME_MARKET_BY_TYPE.get(m.type)?.group === g.id) })).filter((g) => g.markets.length);
  });

  protected toggle(id: string) {
    this.expanded.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  protected label(type: string) {
    return GAME_MARKET_BY_TYPE.get(type)?.label ?? type;
  }
  protected pot(id: string) {
    return formatSoles(this.ctx.pots().get(id)?.pot ?? 0);
  }
  protected countFor(id: string) {
    return this.slip.bets().filter((b) => b.marketId === id).length;
  }
}
