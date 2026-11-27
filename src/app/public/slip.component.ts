import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AMOUNTS, BetDraft, HOUSE_WARNING } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { SlipService } from '../core/slip';
import { WalletService } from '../core/wallet';
import { formatSoles } from '../domain/settlement';
import { MatchContext } from './match-context';
import { MARKET_ICON } from './market-utils';
import { IconComponent } from '../ui/icon.component';
import { CountUpComponent } from '../ui/count-up.component';
import { confetti } from '../ui/confetti';

/** Cupón: monto por selección, total, saldo y apostar. */
@Component({
  selector: 'app-slip',
  imports: [RouterLink, IconComponent, CountUpComponent],
  template: `
    @if (done().length) {
      <section class="glass text-center anim-pop">
        <div class="mx-auto grid h-20 w-20 place-items-center rounded-full bg-lime text-white shadow-[0_16px_40px_-10px_rgb(242_98_0/0.7)]">
          <svg class="draw-check" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 class="mt-4 font-display text-3xl font-extrabold">¡Apuesta hecha!</h2>
        <p class="mt-1 text-mute">Se descontó de tu saldo. Te quedan <b class="text-lime">{{ balanceText() }}</b>.</p>
        <ul class="mt-4 divide-y divide-ink/[0.06] text-left">
          @for (b of done(); track b.marketId + b.selection) {
            <li class="flex justify-between gap-2 py-2 text-sm">
              <span class="min-w-0"><b>{{ ctx.selectionLabel(b.marketId, b.selection) }}</b> <span class="text-mute">· {{ ctx.marketById().get(b.marketId)?.name }}</span></span>
              <span class="shrink-0 font-extrabold text-lime">S/ {{ b.amount }}</span>
            </li>
          }
        </ul>
      </section>
      <div class="mt-4 grid gap-2">
        <button type="button" class="btn w-full" (click)="viewAccount.emit()">Ver mis apuestas <app-icon name="ticket" [size]="18" /></button>
        <button type="button" class="btn-ghost h-12 w-full" (click)="done.set([]); goGames.emit()">Seguir apostando</button>
      </div>
    } @else if (slip.count() === 0) {
      <section class="mt-6 flex flex-col items-center px-6 text-center anim-in">
        <div class="grid h-20 w-20 place-items-center rounded-[28px] bg-night-3 text-lime"><app-icon name="ticket" [size]="38" /></div>
        <h2 class="mt-4 font-display text-2xl font-extrabold">Tu cupón está vacío</h2>
        <p class="mt-1 text-mute">Toca una cuota en Partidos o Especiales y aparece aquí.</p>
        <button type="button" class="btn mt-5" (click)="goGames.emit()">Ver partidos <app-icon name="next" [size]="18" /></button>
      </section>
    } @else {
      <div class="flex items-center justify-between px-1">
        <h2 class="font-display text-2xl font-extrabold">Cupón <span class="text-lime">({{ slip.count() }})</span></h2>
        <button type="button" class="text-sm font-bold text-mute hover:text-candy" (click)="slip.clear()">Vaciar</button>
      </div>

      <ul class="mt-3 space-y-2.5">
        @for (b of slip.bets(); track b.marketId + b.selection; let i = $index) {
          @let st = ctx.state(b.marketId);
          <li class="glass p-3.5 anim-in" [style.--i]="i" [class.border-candy/40]="!st.open">
            <div class="flex items-start gap-2.5">
              <span class="text-lg">{{ icon(b) }}</span>
              <div class="min-w-0 flex-1">
                <p class="font-bold leading-tight">{{ ctx.selectionLabel(b.marketId, b.selection) }}</p>
                <p class="truncate text-xs text-mute">{{ ctx.marketById().get(b.marketId)?.name }}</p>
                @if (!st.open) {
                  <p class="mt-1 text-xs font-bold text-candy">🔒 {{ st.reason }}: quítala para apostar</p>
                }
              </div>
              <span class="shrink-0 rounded-lg bg-ink/[0.05] px-2 py-1 text-[11px] font-bold text-mute">bote {{ pot(b.marketId) }}</span>
              <button type="button" class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-candy/10 hover:text-candy" (click)="slip.remove(b.marketId, b.selection)" aria-label="Quitar del cupón">
                <app-icon name="x" [size]="16" />
              </button>
            </div>
            <div class="mt-2.5 grid grid-cols-5 gap-1.5" role="group" [attr.aria-label]="'Monto para ' + ctx.selectionLabel(b.marketId, b.selection)">
              @for (a of amounts; track a) {
                <button
                  type="button"
                  class="h-10 rounded-xl border text-sm font-extrabold transition active:scale-95"
                  [class]="b.amount === a ? 'border-lime bg-lime text-white' : 'border-ink/10 bg-white'"
                  [attr.aria-pressed]="b.amount === a"
                  (click)="slip.setAmount(b.marketId, b.selection, a)"
                >
                  S/ {{ a }}
                </button>
              }
            </div>
          </li>
        }
      </ul>

      <section class="glass mt-3">
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-mute">Total del cupón</dt><dd class="font-display text-xl font-extrabold"><app-count-up [cents]="slip.totalCents()" /></dd></div>
          @if (auth.user()) {
            <div class="flex justify-between"><dt class="text-mute">Tu saldo</dt><dd class="font-bold">{{ balanceText() }}</dd></div>
          }
        </dl>
        <p class="mt-3 text-xs text-faint">Todo es por bote: lo que se apuesta a un mercado se reparte entre los que aciertan, en proporción a lo que apostaron. {{ warning }}</p>
      </section>

      @if (!auth.user()) {
        <section class="glass mt-3 text-center">
          <p class="font-bold">Entra para apostar</p>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <a [routerLink]="['/entrar']" [queryParams]="{ next: '/p/' + ctx.code() + '?tab=slip' }" class="btn-ghost h-12">Entrar</a>
            <a [routerLink]="['/registro']" [queryParams]="{ next: '/p/' + ctx.code() + '?tab=slip' }" class="btn h-12 text-[15px]">Registrarme</a>
          </div>
        </section>
      } @else if (shortfall() > 0) {
        <section class="mt-3 rounded-3xl border border-candy/20 bg-candy/5 p-4 text-center anim-pop" role="alert">
          <p class="font-bold text-candy">Te faltan {{ soles(shortfall() * 100) }} de saldo</p>
          <p class="mt-1 text-sm text-mute">Recarga plineando al QR. Cuando el organizador la confirme, el saldo aparece y apuestas.</p>
          <button type="button" class="btn mt-3 w-full" (click)="recharge.emit(shortfall())"><app-icon name="wallet" [size]="18" /> Recargar S/ {{ shortfall() }}</button>
        </section>
      } @else {
        @if (error()) {
          <p class="mt-3 rounded-2xl bg-candy/10 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
        }
        <button type="button" class="btn mt-4 w-full" [disabled]="sending() || hasClosed() || wallet.balance() === null" (click)="submit()">
          {{ sending() ? 'Apostando…' : 'Apostar ' + soles(slip.totalCents()) }} <app-icon name="check" [size]="18" [stroke]="2.6" />
        </button>
      }
    }
  `,
})
export class SlipComponent {
  readonly goGames = output<void>();
  readonly viewAccount = output<void>();
  readonly recharge = output<number>();

  private api = inject(PublicApi);
  protected readonly ctx = inject(MatchContext);
  protected readonly slip = inject(SlipService);
  protected readonly auth = inject(AuthApi);
  protected readonly wallet = inject(WalletService);
  protected readonly amounts = AMOUNTS;
  protected readonly soles = formatSoles;
  protected readonly warning = HOUSE_WARNING;
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<BetDraft[]>([]);

  protected readonly shortfall = computed(() => Math.max(0, this.slip.totalCents() / 100 - (this.wallet.balance() ?? 0)));
  protected readonly hasClosed = computed(() => this.slip.bets().some((b) => !this.ctx.state(b.marketId).open));
  protected readonly balanceText = computed(() => (this.wallet.balance() === null ? '…' : formatSoles((this.wallet.balance() ?? 0) * 100)));

  protected pot(marketId: string) {
    return formatSoles(this.ctx.pots().get(marketId)?.pot ?? 0);
  }

  protected icon(b: BetDraft) {
    return MARKET_ICON[this.ctx.marketById().get(b.marketId)?.type ?? ''] ?? '🎲';
  }

  protected async submit() {
    if (this.sending() || this.shortfall() > 0 || this.hasClosed()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      const bets = this.slip.bets().map((b) => ({ ...b, target: this.ctx.marketById().get(b.marketId)!.target }));
      await this.api.submitTicket(this.ctx.code(), bets);
      this.done.set(this.slip.bets());
      this.slip.clear();
      await this.wallet.refresh();
      window.scrollTo({ top: 0 });
      setTimeout(() => confetti(), 150);
    } catch (e) {
      this.error.set(friendlyError(e));
      this.wallet.refresh();
    } finally {
      this.sending.set(false);
    }
  }
}
