import { Component, computed, HostListener, inject, input, output } from '@angular/core';
import { LeagueGame } from '../domain/league';
import { MatchContext } from './match-context';
import { MarketOptionsComponent } from './market-options.component';
import { IconComponent } from '../ui/icon.component';

/** Hoja con todos los mercados de un partido. */
@Component({
  selector: 'app-game-sheet',
  imports: [MarketOptionsComponent, IconComponent],
  template: `
    @let g = game();
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 backdrop-blur-sm anim-backdrop" (click)="closed.emit()">
      <div
        class="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[32px] bg-white shadow-2xl anim-sheet md:max-w-2xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Partido ' + g.number"
        (click)="$event.stopPropagation()"
      >
        <div class="shrink-0 border-b border-ink/[0.06] px-5 pt-3 pb-4">
          <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink/15"></div>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="eyebrow">Partido {{ g.number }} · {{ status() }}</p>
              <h3 class="mt-1 font-display text-2xl font-extrabold">{{ ctx.team(g.home) }} <span class="text-faint">vs</span> {{ ctx.team(g.away) }}</h3>
              @if (g.status !== 'pending') {
                <p class="font-display text-3xl font-extrabold text-lime tabular-nums">{{ g.homeGoals }} - {{ g.awayGoals }}</p>
              }
            </div>
            <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink/[0.05]" (click)="closed.emit()" aria-label="Cerrar">
              <app-icon name="x" [size]="18" />
            </button>
          </div>
        </div>
        <div class="overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          @for (m of markets(); track m.id) {
            <section class="mb-5">
              <h4 class="mb-2 font-bold">{{ m.type === 'game_winner' ? 'Resultado (1 · X · 2)' : 'Primer gol del partido' }}</h4>
              <app-market-options [market]="m" (full)="full.emit()" />
            </section>
          }
          <p class="text-xs text-faint">Cuota estimada = bote ÷ lo apostado a esa opción. Cambia con cada apuesta.</p>
        </div>
      </div>
    </div>
  `,
})
export class GameSheetComponent {
  readonly game = input.required<LeagueGame>();
  readonly closed = output<void>();
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly markets = computed(() => this.ctx.gameMarkets(this.game()));
  protected readonly status = computed(() => ({ pending: 'Próximo', live: 'En vivo', played: 'Finalizado' })[this.game().status]);

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }
}
