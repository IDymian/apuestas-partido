import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Credit, Deposit } from './models';
import { friendlyError, PublicApi } from './public-api';
import { AuthApi } from './auth';

/**
 * Saldo del usuario logueado, compartido por toda la app (encabezado, cupón y
 * "Mi cuenta"). Se actualiza solo cuando el organizador acepta una recarga o
 * anula un ticket (aviso en tiempo real `wallet:<id>`).
 */
@Injectable({ providedIn: 'root' })
export class WalletService {
  private api = inject(PublicApi);
  private auth = inject(AuthApi);

  /** Saldo en soles enteros (null = aún no se cargó). */
  readonly balance = signal<number | null>(null);
  readonly deposits = signal<Deposit[]>([]);
  readonly credits = signal<Credit[]>([]);
  readonly error = signal<string | null>(null);
  private off: (() => void) | null = null;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        this.off?.();
        this.off = null;
        this.balance.set(null);
        this.deposits.set([]);
        this.credits.set([]);
        if (!user) return;
        this.refresh();
        this.off = this.api.subscribeWallet(user.id, () => this.refresh());
      });
    });
  }

  async refresh() {
    if (!this.auth.user()) return;
    try {
      const w = await this.api.getWallet();
      this.balance.set(Number(w.balance));
      this.deposits.set(w.deposits);
      this.credits.set(w.credits ?? []);
      this.error.set(null);
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  async deposit(amount: number, image: Blob) {
    const user = this.auth.user();
    if (!user) throw new Error('Inicia sesión para recargar');
    await this.api.requestDeposit(user.id, amount, image);
    await this.refresh();
  }

  /** Recargas por confirmar (suma en soles). */
  pendingTotal(): number {
    return this.deposits()
      .filter((d) => d.status === 'pending')
      .reduce((s, d) => s + d.amount, 0);
  }
}
