import { Component, HostListener, input, output } from '@angular/core';
import { AMOUNTS } from '../core/models';

/** Hoja inferior para elegir el monto de una apuesta (S/ 1 a S/ 5). */
@Component({
  selector: 'app-amount-sheet',
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 backdrop-blur-sm anim-backdrop" (click)="closed.emit()">
      <div
        class="w-full max-w-md rounded-t-[32px] border-t border-ink/10 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl anim-sheet"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Monto para ' + choiceName()"
        (click)="$event.stopPropagation()"
      >
        <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink/15"></div>
        <p class="eyebrow text-lime">{{ marketName() }}</p>
        <h3 class="mt-1 font-display text-2xl font-extrabold">{{ choiceName() }}</h3>
        <p class="mt-3 text-sm text-mute">¿Cuánto le apuestas?</p>
        <div class="mt-3 grid grid-cols-5 gap-2">
          @for (a of amounts; track a; let i = $index) {
            <button
              type="button"
              class="flex h-16 flex-col items-center justify-center rounded-2xl border-2 font-display text-2xl font-extrabold transition duration-200 active:scale-90 anim-pop"
              [style.animation-delay.ms]="i * 40"
              [class]="a === current() ? 'border-lime bg-lime text-white shadow-[0_10px_24px_-8px_rgb(242_98_0/0.7)]' : 'border-ink/10 bg-ink/[0.04] text-ink hover:border-ink/30'"
              [attr.aria-label]="'S/ ' + a"
              (click)="picked.emit(a)"
            >
              <span class="text-[10px] font-bold opacity-60">S/</span>{{ a }}
            </button>
          }
        </div>
        <div class="mt-5 flex gap-2">
          @if (current()) {
            <button type="button" class="h-12 flex-1 rounded-2xl bg-candy/15 font-bold text-candy active:scale-95" (click)="removed.emit()">Quitar</button>
          }
          <button type="button" class="btn-ghost h-12 flex-1" (click)="closed.emit()">Cancelar</button>
        </div>
      </div>
    </div>
  `,
})
export class AmountSheetComponent {
  readonly marketName = input.required<string>();
  readonly choiceName = input.required<string>();
  readonly current = input<number | null>(null);
  readonly picked = output<number>();
  readonly removed = output<void>();
  readonly closed = output<void>();
  protected readonly amounts = AMOUNTS;

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }
}
