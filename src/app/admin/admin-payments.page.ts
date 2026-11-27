import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../core/admin-api';
import { BalanceRow, DepositRow } from '../core/models';
import { friendlyError } from '../core/public-api';
import { formatSoles } from '../domain/settlement';

/**
 * Vista única del organizador para las recargas de saldo por Plin.
 * Avisa (sonido, vibración y notificación del navegador) cuando alguien plinea;
 * el organizador revisa la captura contra su app de Plin y acepta o rechaza.
 * Recién al aceptar, el monto se suma al saldo de esa persona.
 */
@Component({
  selector: 'app-admin-payments',
  imports: [RouterLink],
  template: `
    <header class="sticky top-0 z-30 bg-emerald-600 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-3">
          <a routerLink="/admin" class="grid h-10 w-10 place-items-center rounded-xl bg-white/15" aria-label="Volver a jornadas">←</a>
          <div class="min-w-0">
            <p class="text-xs text-white/80">Organizador</p>
            <h1 class="flex items-center gap-2 text-xl font-extrabold">
              Recargas por Plin
              @if (items().length) {
                <span class="rounded-full bg-white px-2 py-0.5 text-sm text-emerald-700">{{ items().length }}</span>
              }
            </h1>
          </div>
        </div>
        @if (notifState() !== 'granted' && notifState() !== 'unsupported') {
          <button type="button" class="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-900" (click)="enableAlerts()">🔔 Activar avisos</button>
        } @else {
          <span class="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold">🔔 Avisos activos</span>
        }
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-4">
      <p class="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
        Abre tu app de Plin, busca el depósito con el mismo monto y acéptalo aquí. Recién ahí se suma al saldo de la persona para que apueste.
      </p>
      @if (items().length > 1) {
        <p class="mt-2 text-right text-sm text-slate-600">Por confirmar: <b>{{ soles(total() * 100) }}</b></p>
      }

      @if (error()) {
        <p class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
      }

      <ul class="mt-4 space-y-3">
        @for (d of items(); track d.id) {
          <li class="card overflow-hidden" [class.ring-2]="fresh().has(d.id)" [class.ring-emerald-500]="fresh().has(d.id)">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-lg font-extrabold text-slate-900">{{ d.username }}</p>
                <p class="text-xs text-slate-500">Recarga de saldo · {{ ago(d.created_at) }}</p>
              </div>
              <p class="shrink-0 text-3xl font-extrabold text-slate-900">{{ soles(d.amount * 100) }}</p>
            </div>

            @if (d.receipt_path) {
              @if (urls()[d.id]; as url) {
                <button type="button" class="mt-3 block w-full" (click)="zoom.set(url)" aria-label="Ver captura en grande">
                  <img [src]="url" alt="Captura del Plin" class="max-h-80 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" loading="lazy" />
                </button>
              } @else {
                <p class="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Cargando captura…</p>
              }
            } @else {
              <p class="mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">Sin captura (dato de prueba)</p>
            }

            <div class="mt-3 grid grid-cols-2 gap-2">
              <button type="button" class="h-14 rounded-2xl bg-emerald-600 text-lg font-extrabold text-white active:scale-[0.98] disabled:opacity-50" [disabled]="busy() === d.id" (click)="accept(d)">
                ✓ Aceptar
              </button>
              <button type="button" class="h-14 rounded-2xl bg-red-50 text-lg font-bold text-red-700 active:scale-[0.98] disabled:opacity-50" [disabled]="busy() === d.id" (click)="reject(d)">
                ✕ Rechazar
              </button>
            </div>
          </li>
        } @empty {
          @if (!loading()) {
            <li class="py-16 text-center">
              <p class="text-5xl">✅</p>
              <p class="mt-2 font-bold text-slate-800">No hay recargas por revisar</p>
              <p class="text-sm text-slate-500">Deja esta pantalla abierta: te avisamos cuando alguien plinee.</p>
            </li>
          }
        }
      </ul>
    </main>

    <section class="mx-auto max-w-2xl px-4 pb-10">
      <div class="card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-bold">💵 Saldos (para devolver al final)</h2>
          <button type="button" class="btn-secondary h-9 text-xs" (click)="loadBalances()">Actualizar</button>
        </div>
        <p class="mt-1 text-sm text-slate-600">Cuando termine todo, plinea a cada uno su saldo y marca "Pagué". Así su saldo queda en 0 y todo cuadra.</p>
        <ul class="mt-2 divide-y divide-slate-100">
          @for (b of balances(); track b.user_id) {
            <li class="flex items-center gap-3 py-2.5">
              <span class="min-w-0 flex-1 truncate font-semibold">{{ b.username }}</span>
              <span class="font-bold tabular-nums" [class.text-slate-400]="b.balance <= 0">{{ soles(cents(b.balance)) }}</span>
              <button type="button" class="btn-primary h-9 text-xs" [disabled]="b.balance <= 0 || busy() === b.user_id" (click)="paid(b.user_id, b.username, b.balance)">Pagué</button>
            </li>
          } @empty {
            <li class="py-4 text-center text-sm text-slate-500">Nadie tiene saldo todavía.</li>
          }
        </ul>
        @if (balances().length) {
          <p class="mt-2 text-right text-sm text-slate-600">Total en saldos: <b>{{ soles(balancesTotal()) }}</b></p>
        }
      </div>
    </section>

    @if (undo(); as u) {
      <div class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl" role="status">
        <span>{{ u.text }}</span>
        <button type="button" class="font-bold text-emerald-300" (click)="revert(u.id)">Deshacer</button>
      </div>
    }

    @if (zoom()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2" (click)="zoom.set(null)">
        <img [src]="zoom()" alt="Captura del Plin" class="max-h-full max-w-full object-contain" />
      </div>
    }
  `,
})
export class AdminPaymentsPage implements OnInit, OnDestroy {
  protected api = inject(AdminApi);
  protected readonly soles = formatSoles;
  protected readonly items = signal<DepositRow[]>([]);
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly zoom = signal<string | null>(null);
  protected readonly fresh = signal<Set<string>>(new Set());
  protected readonly undo = signal<{ id: string; text: string } | null>(null);
  protected readonly notifState = signal<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  protected readonly total = computed(() => this.items().reduce((s, d) => s + d.amount, 0));
  protected readonly balances = signal<BalanceRow[]>([]);
  protected readonly balancesTotal = computed(() => this.balances().reduce((s, b) => s + this.cents(b.balance), 0));

  protected cents(soles: number) {
    return Math.round(soles * 100);
  }

  async loadBalances() {
    try {
      this.balances.set(await this.api.balances());
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  async paid(userId: string, username: string, balance: number) {
    if (!confirm(`¿Ya le plineaste ${formatSoles(this.cents(balance))} a ${username}? Su saldo quedará en S/ 0.`)) return;
    this.busy.set(userId);
    try {
      await this.api.payout(userId, this.cents(balance));
      await this.loadBalances();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(null);
    }
  }

  private seen: Set<string> | null = null;
  private off: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;
  private undoTimer: ReturnType<typeof setTimeout> | undefined;
  private audio: AudioContext | null = null;
  private baseTitle = document.title;

  ngOnInit() {
    this.refresh();
    this.loadBalances();
    this.off = this.api.subscribeDeposits(() => this.refresh());
    // Respaldo por si se pierde un aviso en tiempo real.
    this.poll = setInterval(() => this.refresh(), 15_000);
  }

  async refresh() {
    try {
      const list = await this.api.pendingDeposits();
      if (this.seen) {
        const nuevos = list.filter((d) => !this.seen!.has(d.id));
        if (nuevos.length) this.alert(nuevos);
      }
      this.seen = new Set(list.map((d) => d.id));
      this.items.set(list);
      document.title = list.length ? `(${list.length}) Recargas · Copa Álvaro` : this.baseTitle;
      for (const d of list) {
        if (d.receipt_path && !this.urls()[d.id]) {
          const url = await this.api.receiptUrl(d.receipt_path);
          if (url) this.urls.update((u) => ({ ...u, [d.id]: url }));
        }
      }
      this.error.set(null);
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async enableAlerts() {
    this.beep(); // desbloquea el audio con este toque
    if (typeof Notification === 'undefined') return this.notifState.set('unsupported');
    this.notifState.set(await Notification.requestPermission());
  }

  private alert(nuevos: DepositRow[]) {
    this.fresh.update((s) => new Set([...s, ...nuevos.map((d) => d.id)]));
    setTimeout(() => this.fresh.update((s) => new Set([...s].filter((id) => !nuevos.some((d) => d.id === id)))), 8000);
    this.beep();
    navigator.vibrate?.([120, 60, 120]);
    if (this.notifState() === 'granted') {
      for (const d of nuevos) {
        try {
          new Notification(`💸 ${d.username} plineó ${formatSoles(d.amount * 100)}`, {
            body: 'Recarga de saldo por confirmar. Toca para revisar.',
            icon: 'icons/icon-192x192.png',
            tag: d.id,
          });
        } catch {
          /* algunos navegadores móviles solo permiten avisos desde el service worker */
        }
      }
    }
  }

  private beep() {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      [880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t0 = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
        o.start(t0);
        o.stop(t0 + 0.16);
      });
    } catch {
      /* sin audio */
    }
  }

  async accept(d: DepositRow) {
    await this.setStatus(d, 'approved', null, `✓ Acreditado: ${d.username} ${formatSoles(d.amount * 100)}`);
  }

  async reject(d: DepositRow) {
    const reason = prompt(`¿Por qué rechazas la recarga de ${d.username}?`, 'No llegó el Plin');
    if (reason === null) return;
    await this.setStatus(d, 'rejected', reason, `✕ Rechazada: ${d.username}`);
  }

  async revert(id: string) {
    clearTimeout(this.undoTimer);
    this.undo.set(null);
    try {
      await this.api.setDepositStatus(id, 'pending');
      await this.refresh();
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  private async setStatus(d: DepositRow, status: 'approved' | 'rejected', reason: string | null, text: string) {
    this.busy.set(d.id);
    try {
      await this.api.setDepositStatus(d.id, status, reason);
      this.loadBalances();
      this.seen?.delete(d.id);
      this.items.update((list) => list.filter((x) => x.id !== d.id));
      clearTimeout(this.undoTimer);
      this.undo.set({ id: d.id, text });
      this.undoTimer = setTimeout(() => this.undo.set(null), 6000);
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected ago(iso: string) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }

  ngOnDestroy() {
    clearInterval(this.poll);
    clearTimeout(this.undoTimer);
    this.off?.();
    document.title = this.baseTitle;
    this.audio?.close();
  }
}
