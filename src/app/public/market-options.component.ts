import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Market } from '../core/models';
import { SlipService } from '../core/slip';
import { MatchContext } from './match-context';
import { IconComponent } from '../ui/icon.component';

/** Botones de cuota de un mercado: tocar agrega o quita la opción del cupón. */
@Component({
  selector: 'app-market-options',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = ctx.state(market().id);
    @if (!st.open) {
      <p class="mb-2 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-bold text-mute">
        <app-icon name="lock" [size]="12" /> {{ st.reason }}
      </p>
    }
    <div class="grid gap-1.5" [class]="cols()">
      @for (c of ctx.choices(market()); track c.selection) {
        @let on = slip.has(market().id, c.selection);
        <button
          type="button"
          class="odd"
          [class.odd-on]="on"
          [disabled]="!st.open"
          [attr.aria-pressed]="on"
          [attr.aria-label]="c.label + ' · apostado ' + ctx.stakedText(market().id, c.selection)"
          (click)="pick(c.selection)"
        >
          <span class="odd-label">{{ compact() && c.short ? c.short : c.label }}</span>
          <span class="odd-value">{{ ctx.oddText(market().id, c.selection, compact() ? '—' : 'Apostar') }}</span>
        </button>
      }
    </div>
  `,
})
export class MarketOptionsComponent {
  readonly market = input.required<Market>();
  /** Botones 1 / X / 2 cortos (tarjetas de partido). */
  readonly compact = input(false);
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly slip = inject(SlipService);

  protected readonly cols = computed(() => {
    const m = this.market();
    if (m.type === 'game_winner') return 'grid-cols-3';
    if (m.target === 'number') return 'grid-cols-3 sm:grid-cols-6';
    return 'grid-cols-2';
  });

  protected pick(selection: string) {
    if (!this.slip.toggle(this.market().id, selection)) this.full.emit();
  }
}
