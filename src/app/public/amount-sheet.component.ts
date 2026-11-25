import { Component, input, output } from '@angular/core';
import { AMOUNTS } from '../core/models';

/** Hoja inferior para elegir el monto de una apuesta (S/ 1 a S/ 5). */
@Component({
  selector: 'app-amount-sheet',
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40" (click)="closed.emit()">
      <div
        class="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Monto para ' + playerName()"
        (click)="$event.stopPropagation()"
      >
        <div class="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200"></div>
        <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">{{ marketName() }}</p>
        <h3 class="mt-0.5 text-xl font-bold text-slate-900">{{ playerName() }}</h3>
        <p class="mt-3 text-sm text-slate-600">¿Cuánto le apuestas?</p>
        <div class="mt-2 grid grid-cols-5 gap-2">
          @for (a of amounts; track a) {
            <button
              type="button"
              class="h-14 rounded-2xl border-2 text-lg font-bold transition active:scale-95"
              [class]="a === current() ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-800'"
              [attr.aria-label]="'S/ ' + a"
              (click)="picked.emit(a)"
            >
              <span class="text-xs font-semibold opacity-70">S/</span>{{ a }}
            </button>
          }
        </div>
        <div class="mt-4 flex gap-2">
          @if (current()) {
            <button type="button" class="h-12 flex-1 rounded-2xl bg-red-50 font-semibold text-red-700" (click)="removed.emit()">
              Quitar apuesta
            </button>
          }
          <button type="button" class="h-12 flex-1 rounded-2xl bg-slate-100 font-semibold text-slate-700" (click)="closed.emit()">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AmountSheetComponent {
  readonly marketName = input.required<string>();
  readonly playerName = input.required<string>();
  readonly current = input<number | null>(null);
  readonly picked = output<number>();
  readonly removed = output<void>();
  readonly closed = output<void>();
  protected readonly amounts = AMOUNTS;
}
