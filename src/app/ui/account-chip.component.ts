import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../core/auth';
import { IconComponent } from './icon.component';

/** Botón de cuenta: "Entrar" o el usuario con menú para salir. */
@Component({
  selector: 'app-account-chip',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative' },
  template: `
    @if (auth.user(); as u) {
      <button type="button" class="btn-ghost h-10 rounded-full pl-1.5" [class.pr-3]="!compact()" [class.pr-1.5]="compact()" (click)="open.set(!open())" [attr.aria-expanded]="open()" [attr.aria-label]="'Cuenta de ' + u.username">
        <span class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-lime to-gold font-display text-sm font-extrabold text-white">
          {{ u.username.charAt(0).toUpperCase() }}
        </span>
        @if (!compact()) {
          <span class="max-w-24 truncate">{{ u.username }}</span>
        }
      </button>
      @if (open()) {
        <div class="glass-raised absolute top-12 right-0 z-50 w-56 p-2 anim-pop" role="menu">
          <p class="px-3 pt-1 text-sm font-bold">{{ u.username }}</p>
          <p class="px-3 pb-2 text-xs text-mute">{{ u.email }}</p>
          <button type="button" class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-ink/[0.06]" role="menuitem" (click)="logout()">
            <app-icon name="logout" [size]="18" /> Cerrar sesión
          </button>
        </div>
      }
    } @else {
      <a [routerLink]="['/entrar']" [queryParams]="next() ? { next: next() } : {}" class="btn-ghost h-10 rounded-full">
        <app-icon name="user" [size]="18" /> Entrar
      </a>
    }
  `,
})
export class AccountChipComponent {
  readonly next = input<string | null>(null);
  /** Solo la inicial (para encabezados angostos). */
  readonly compact = input(false);
  protected readonly auth = inject(AuthApi);
  private router = inject(Router);
  protected readonly open = signal(false);

  async logout() {
    this.open.set(false);
    await this.auth.signOut();
    this.router.navigateByUrl(this.router.url);
  }
}
