import { Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { balanceLabel } from '../core/models';
import { AuthApi } from '../core/auth';
import { AvatarService } from '../core/avatars';
import { WalletService } from '../core/wallet';
import { formatSoles } from '../domain/settlement';
import { MatchContext } from './match-context';
import { PlayerProfileComponent } from './player-profile.component';
import { IconComponent } from '../ui/icon.component';
import { sound } from '../ui/sound';

/** Mi perfil: datos básicos, saldo, mis apuestas y estadísticas. Depositar está en su propia hoja. */
@Component({
  selector: 'app-account',
  imports: [PlayerProfileComponent, IconComponent],
  template: `
    @if (auth.user(); as u) {
      <section class="glass flex items-center gap-3.5 anim-in">
        <span class="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime to-gold font-display text-3xl font-extrabold text-white">{{ u.username.charAt(0).toUpperCase() }}</span>
        <div class="min-w-0 flex-1">
          <p class="eyebrow">Mi perfil</p>
          <h2 class="truncate font-display text-2xl font-extrabold">{{ u.username }}</h2>
          <p class="truncate text-sm text-mute">{{ u.email }}</p>
        </div>
      </section>

      <section class="mt-3 flex items-center gap-3 rounded-[24px] bg-gradient-to-br from-[#ff8a1f] via-lime to-[#d13f00] p-4 text-white shadow-[0_20px_44px_-20px_rgb(242_98_0/0.7)] anim-in" style="--i: 1">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-extrabold tracking-[0.18em] text-white/85 uppercase">Saldo</p>
          <p class="font-display text-3xl font-extrabold tabular-nums" data-testid="balance">{{ balanceText() }}</p>
          @if (pending() > 0) {
            <p class="text-xs font-semibold text-white/90">S/ {{ pending() }} por confirmar</p>
          } @else if ((wallet.balance() ?? 1) < 1) {
            <p class="text-xs font-semibold text-white/90">Estás misio, causa. Recarga y vuelve a la cancha.</p>
          }
        </div>
        <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-white px-4 font-extrabold text-lime active:scale-95" (click)="ctx.depositAsk.set({ amount: null })">
          <app-icon name="wallet" [size]="18" /> Depositar
        </button>
      </section>

      @if (wallet.credits().length) {
        <p class="mt-3 rounded-2xl bg-lime/10 p-3 text-sm font-semibold text-lime">
          🏆 ¡Eso, tilín! Te cayeron {{ soles(creditsTotal()) }} al saldo.
        </p>
      }

      <!-- Especiales: los asigna el organizador; acá solo se ven y se avisa que primero hay que recargar -->
      @if (avatars.costumes().length) {
        <section class="glass mt-3 p-3.5">
          <p class="font-bold">Avatares especiales</p>
          <p class="text-xs text-mute">Toca uno para pedirlo.</p>
          <div class="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 py-0.5">
            @for (c of avatars.costumes(); track c.id) {
              <button
                type="button"
                class="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 bg-white transition active:scale-95"
                [class]="wanted() === c.id ? 'border-lime' : 'border-ink/10'"
                [attr.aria-label]="'Quiero el especial ' + c.id"
                [attr.aria-pressed]="wanted() === c.id"
                (click)="wanted.set(c.id)"
              >
                <img [src]="avatars.url(c.id)" alt="" width="56" height="56" loading="lazy" class="h-full w-full object-cover" />
              </button>
            }
          </div>
          @if (wanted()) {
            <div class="mt-3 flex items-center gap-3 rounded-2xl bg-lime/10 p-3 anim-in">
              <p class="min-w-0 flex-1 text-sm font-semibold text-ink">Para tener un especial, primero recarga tu saldo. Después el organizador te lo pone.</p>
              <button type="button" class="btn-primary h-10 shrink-0 px-3 text-sm" (click)="ctx.depositAsk.set({ amount: null })">Recargar</button>
            </div>
          }
        </section>
      }

      <div class="mt-5 anim-in" style="--i: 2">
        <app-player-profile [username]="u.username" />
      </div>

      <section class="glass mt-5 space-y-1 p-2">
        <button type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-ink/[0.04]" (click)="toggleSound()">
          <span class="text-lg">{{ muted() ? '🔇' : '🔊' }}</span>
          <span class="flex-1 font-semibold">Efectos de sonido</span>
          <span class="text-sm font-bold" [class]="muted() ? 'text-faint' : 'text-lime'">{{ muted() ? 'Apagados' : 'Encendidos' }}</span>
        </button>
        <button type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-ink/[0.04]" (click)="goBet.emit()">
          <span class="text-lg">🎟️</span><span class="flex-1 font-semibold">Seguir apostando</span><app-icon name="next" [size]="18" class="text-faint" />
        </button>
        <button type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-candy hover:bg-candy/5" (click)="logout()">
          <app-icon name="logout" [size]="18" /><span class="flex-1 font-semibold">Cerrar sesión</span>
        </button>
      </section>
    }
  `,
})
export class AccountComponent {
  readonly goBet = output<void>();
  protected readonly auth = inject(AuthApi);
  protected readonly wallet = inject(WalletService);
  protected readonly ctx = inject(MatchContext);
  protected readonly avatars = inject(AvatarService);
  protected readonly wanted = signal<string | null>(null);
  private router = inject(Router);
  protected readonly soles = formatSoles;
  protected readonly muted = signal(sound.muted);

  protected readonly balanceText = computed(() => balanceLabel(this.wallet.balance()));
  protected readonly pending = computed(() => this.wallet.deposits().filter((d) => d.status === 'pending').reduce((s, d) => s + d.amount, 0));
  protected readonly creditsTotal = computed(() => this.wallet.credits().reduce((s, c) => s + c.amount_cents, 0));

  protected toggleSound() {
    sound.setMuted(!sound.muted);
    this.muted.set(sound.muted);
    sound.add();
  }

  async logout() {
    await this.auth.signOut();
    this.router.navigateByUrl(this.router.url);
  }
}
