import { Component, computed, HostListener, inject, input, output } from '@angular/core';
import { LeagueGame } from '../domain/league';
import { MatchContext } from './match-context';
import { GameMarketsComponent } from './game-markets.component';
import { IconComponent } from '../ui/icon.component';

/**
 * Hoja con todas las apuestas de un partido. Se dibuja al nivel de la página
 * (no dentro de tarjetas con animaciones) para que siempre quede pegada abajo
 * y ocupe la pantalla como corresponde.
 */
@Component({
  selector: 'app-game-sheet',
  imports: [GameMarketsComponent, IconComponent],
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
        <div class="shrink-0 border-b border-ink/[0.06] bg-white px-5 pt-2.5 pb-4">
          <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink/15 md:hidden"></div>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="eyebrow">Partido {{ g.number }} · {{ status() }}</p>
              <h3 class="mt-1 font-display text-2xl leading-tight font-extrabold">{{ ctx.team(g.home) }} <span class="text-faint">vs</span> {{ ctx.team(g.away) }}</h3>
              @if (g.status !== 'pending') {
                <p class="font-display text-3xl font-extrabold text-lime tabular-nums">{{ g.homeGoals }} - {{ g.awayGoals }}</p>
              }
              <p class="mt-1 text-xs text-mute">{{ count() }} apuestas de este partido · todo es por bote</p>
            </div>
            <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink/[0.05]" (click)="closed.emit()" aria-label="Cerrar">
              <app-icon name="x" [size]="18" />
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <app-game-markets [game]="g" (full)="full.emit()" />
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
  protected readonly count = computed(() => this.ctx.gameMarkets(this.game()).length);
  protected readonly status = computed(() => ({ pending: 'Próximo', live: 'En vivo', played: 'Finalizado' })[this.game().status]);

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }
}
