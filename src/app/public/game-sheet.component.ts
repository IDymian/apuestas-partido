import { Component, computed, HostListener, inject, input, output } from '@angular/core';
import { SlipService } from '../core/slip';
import { LeagueGame } from '../domain/league';
import { MatchContext } from './match-context';
import { GameMarketsComponent } from './game-markets.component';
import { IconComponent } from '../ui/icon.component';
import { KitComponent } from '../ui/kit.component';

/**
 * Hoja con todas las apuestas de un partido. Se dibuja al nivel de la página
 * (no dentro de tarjetas con animaciones) para que siempre quede pegada abajo
 * y ocupe la pantalla como corresponde.
 */
@Component({
  selector: 'app-game-sheet',
  imports: [GameMarketsComponent, IconComponent, KitComponent],
  template: `
    @let g = game();
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 backdrop-blur-sm anim-backdrop md:items-center md:p-6" (click)="closed.emit()">
      <div
        class="flex h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-night shadow-2xl anim-sheet md:h-[85dvh] md:max-w-2xl md:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Partido ' + g.number"
        (click)="$event.stopPropagation()"
      >
        <div class="shrink-0 border-b border-ink/[0.06] bg-white px-5 pt-2.5 pb-3.5">
          <div class="mx-auto mb-2.5 h-1.5 w-12 rounded-full bg-ink/15 md:hidden"></div>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5 rounded-full bg-night-3 px-2.5 py-0.5 text-[11px] font-extrabold text-ink">
                  @if (g.status === 'live') {
                    <span class="live-dot"></span>
                  }
                  {{ g.mode ? ctx.modeMeta(g.mode).short + ' · ' : '' }}Partido {{ g.number }} · {{ status() }}
                </span>
                <span class="text-xs font-semibold text-mute">{{ count() }} mercados · por pozo</span>
              </div>
              <h3 class="mt-1.5 flex flex-wrap items-center gap-1.5 font-display text-xl leading-tight font-extrabold">
                <span class="inline-flex items-center gap-1.5">
                  <app-kit class="h-5 w-5 shrink-0" [kit]="ctx.teamKit(g.home)" />
                  {{ ctx.team(g.home) }}
                </span>
                <span class="text-sm font-bold text-faint">vs</span>
                <span class="inline-flex items-center gap-1.5">
                  <app-kit class="h-5 w-5 shrink-0" [kit]="ctx.teamKit(g.away)" />
                  {{ ctx.team(g.away) }}
                </span>
              </h3>
              @if (g.status !== 'pending') {
                <p class="mt-0.5 font-display text-3xl font-extrabold text-lime tabular-nums">{{ g.homeGoals }} - {{ g.awayGoals }}</p>
              }
            </div>
            <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink/[0.05] active:scale-95" (click)="closed.emit()" aria-label="Cerrar">
              <app-icon name="x" [size]="18" />
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <app-game-markets [game]="g" (full)="full.emit()" />
        </div>
        @if (slip.count() > 0) {
          <div class="shrink-0 border-t border-ink/[0.08] bg-white px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-white shadow-[0_12px_28px_-10px_rgb(31_20_13/0.55)] active:scale-[0.98]"
              (click)="openSlip.emit()"
            >
              <span class="grid h-7 min-w-7 place-items-center rounded-full bg-lime px-2 font-display text-sm font-extrabold tabular-nums">{{ slip.count() }}</span>
              <span class="min-w-0 flex-1 text-sm font-bold">Ir al ticket</span>
              <span class="font-display text-base font-extrabold tabular-nums">S/ {{ slip.totalCents() / 100 }}</span>
              <app-icon name="next" [size]="18" />
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class GameSheetComponent {
  readonly game = input.required<LeagueGame>();
  readonly closed = output<void>();
  readonly full = output<void>();
  readonly openSlip = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly slip = inject(SlipService);
  protected readonly count = computed(() => this.ctx.gameMarkets(this.game()).length);
  protected readonly status = computed(() => ({ pending: 'Próximo', live: 'En vivo', played: 'Finalizado' })[this.game().status]);

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }
}
