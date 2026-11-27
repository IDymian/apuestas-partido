import { Component, HostListener, inject, input, output } from '@angular/core';
import { MatchContext } from './match-context';
import { PlayerProfileComponent } from './player-profile.component';
import { IconComponent } from '../ui/icon.component';

const TONES = ['from-lime to-gold', 'from-gold to-[#ffc266]', 'from-[#ff8a1f] to-[#d13f00]', 'from-ink to-ink/70', 'from-lime to-[#ffb27a]'];

/** Perfil de otro apostador (desde Social o el buscador). */
@Component({
  selector: 'app-profile-sheet',
  imports: [PlayerProfileComponent, IconComponent],
  template: `
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 backdrop-blur-sm anim-backdrop md:items-center md:p-6" (click)="closed.emit()">
      <div
        class="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-night shadow-2xl anim-sheet md:max-w-xl md:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Perfil de ' + username()"
        (click)="$event.stopPropagation()"
      >
        <div class="flex shrink-0 items-center gap-3 border-b border-ink/[0.06] bg-white px-5 pt-4 pb-4">
          <span class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br font-display text-2xl font-extrabold text-white" [class]="tone()">{{ username().charAt(0).toUpperCase() }}</span>
          <div class="min-w-0 flex-1">
            <p class="eyebrow">Apostador</p>
            <h2 class="truncate font-display text-2xl font-extrabold">{{ username() }}</h2>
          </div>
          <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink/[0.05]" (click)="closed.emit()" aria-label="Cerrar">
            <app-icon name="x" [size]="18" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <app-player-profile [username]="username()" />
        </div>
      </div>
    </div>
  `,
})
export class ProfileSheetComponent {
  readonly username = input.required<string>();
  readonly closed = output<void>();
  protected readonly ctx = inject(MatchContext);

  protected tone() {
    return TONES[[...this.username()].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }
}
