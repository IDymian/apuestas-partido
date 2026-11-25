import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData } from '../core/models';
import { friendlyError } from '../core/public-api';
import { adminToSettleInput } from '../domain/adapt';
import { formatSoles, PersonResult, settle } from '../domain/settlement';
import { whatsappSummary } from '../domain/whatsapp';

@Component({
  selector: 'app-settlement-tab',
  template: `
    @if (data().match.status !== 'finished') {
      <p class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Resultado <b>parcial</b>: el partido no ha terminado. Se recalcula solo con cada evento.
      </p>
    }
    @if (pendingCount() > 0) {
      <p class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Hay {{ pendingCount() }} ticket(s) pendiente(s) que <b>no</b> cuentan hasta que los apruebes.
      </p>
    }

    <!-- Por mercado -->
    <div class="space-y-3">
      @for (m of result().markets; track m.marketId) {
        <section class="card">
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="font-bold">{{ m.name }}</h2>
            <span class="text-lg font-extrabold text-emerald-700">{{ soles(m.totalPotCents) }}</span>
          </div>
          <p class="text-xs text-slate-500">
            Apuestas {{ soles(m.betsPotCents) }}
            @if (m.initialPotCents) {
              · pozo inicial {{ soles(m.initialPotCents) }}
            }
            @if (m.rolledInCents) {
              · arrastre {{ soles(m.rolledInCents) }}
            }
          </p>
          <div class="mt-2 text-sm">
            @switch (m.outcome) {
              @case ('winners') {
                <p>Ganador: <b>{{ playerName(m.winnerPlayerId) }}</b></p>
                <ul class="mt-1">
                  @for (p of m.payouts; track p.personKey) {
                    <li class="flex justify-between">
                      <span>{{ p.bettorName }} <span class="text-xs text-slate-500">(S/ {{ p.stakeCents / 100 }})</span></span>
                      <b>{{ soles(p.amountCents) }}</b>
                    </li>
                  }
                </ul>
              }
              @case ('no_winner') {
                <p>
                  Ganador: <b>{{ playerName(m.winnerPlayerId) }}</b> · nadie acertó →
                  {{ m.rolledToMarketId ? 'pasa a ' + marketName(m.rolledToMarketId) : 'queda acumulado' }}
                </p>
              }
              @case ('refund') {
                <p>{{ m.reason }}: se devuelve lo apostado{{ m.accumulatedCents ? '; ' + soles(m.accumulatedCents) + ' acumulado' : '' }}.</p>
              }
              @default {
                <p class="text-slate-500">{{ m.reason ?? 'Sin resolver' }}</p>
              }
            }
          </div>
        </section>
      }
    </div>

    <!-- Por persona -->
    <section class="card mt-4">
      <div class="flex items-baseline justify-between">
        <h2 class="font-bold">A pagar por persona</h2>
        <span class="text-xs text-slate-500">{{ paidCount() }}/{{ toPay().length }} pagados</span>
      </div>
      <ul class="mt-2 divide-y divide-slate-100">
        @for (p of toPay(); track p.personKey) {
          <li class="flex items-center gap-3 py-2.5">
            <input
              type="checkbox"
              class="h-6 w-6 shrink-0 accent-emerald-600"
              [checked]="paid().has(p.personKey)"
              [disabled]="busy() === p.personKey"
              (change)="togglePaid(p, $any($event.target).checked)"
              [attr.aria-label]="'Pagado a ' + p.bettorName"
            />
            <div class="min-w-0 flex-1" [class.line-through]="paid().has(p.personKey)" [class.text-slate-400]="paid().has(p.personKey)">
              <p class="truncate font-semibold">{{ p.bettorName }}</p>
              <p class="text-xs text-slate-500">
                apostó {{ soles(p.stakedCents) }}
                @if (p.refundedCents) {
                  · devolución {{ soles(p.refundedCents) }}
                }
              </p>
            </div>
            <span class="text-lg font-bold">{{ soles(p.totalCents) }}</span>
          </li>
        } @empty {
          <li class="py-3 text-sm text-slate-500">Por ahora nadie cobra.</li>
        }
      </ul>
      <div class="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
        <div class="rounded-xl bg-slate-50 p-2">
          <p class="text-xs text-slate-500">Total a pagar</p>
          <p class="font-bold">{{ soles(totalToPay()) }}</p>
        </div>
        <div class="rounded-xl bg-amber-50 p-2">
          <p class="text-xs text-amber-800">Acumulado</p>
          <p class="font-bold text-amber-900">{{ soles(result().accumulatedCents) }}</p>
        </div>
      </div>
      @if (result().accumulatedCents > 0) {
        <p class="mt-2 text-xs text-slate-500">Cárgalo como "Pozo inicial" en un mercado del próximo partido.</p>
      }
    </section>

    @if (error()) {
      <p class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
    }

    <button type="button" class="btn-primary mt-4 w-full bg-[#25D366]" (click)="copy()">
      {{ copied() ? '¡Copiado! Pégalo en WhatsApp' : '📋 Copiar resumen para WhatsApp' }}
    </button>
    <details class="mt-2">
      <summary class="cursor-pointer text-center text-xs text-slate-500">Ver texto</summary>
      <pre class="mt-2 rounded-xl bg-white p-3 text-xs whitespace-pre-wrap ring-1 ring-slate-200">{{ summary() }}</pre>
    </details>
  `,
})
export class SettlementTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected soles = formatSoles;
  protected busy = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected copied = signal(false);

  protected result = computed(() => settle(adminToSettleInput(this.data())));
  private players = computed(() => new Map(this.data().players.map((p) => [p.id, p.name])));
  private markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m.name])));
  protected paid = computed(() => new Set(this.data().paid.map((p) => p.person_key)));
  protected toPay = computed(() => this.result().people.filter((p) => p.totalCents > 0));
  protected paidCount = computed(() => this.toPay().filter((p) => this.paid().has(p.personKey)).length);
  protected totalToPay = computed(() => this.toPay().reduce((s, p) => s + p.totalCents, 0));
  protected pendingCount = computed(() => this.data().tickets.filter((t) => t.status === 'pending').length);

  protected summary = computed(() =>
    whatsappSummary(this.result(), {
      title: `${this.data().match.home_team} vs ${this.data().match.away_team}`,
      playerName: (id) => this.playerName(id),
      marketName: (id) => this.marketName(id),
      paidKeys: this.paid(),
    }),
  );

  playerName(id: string | null) {
    return (id && this.players().get(id)) || '¿?';
  }
  marketName(id: string) {
    return this.markets().get(id) ?? '¿?';
  }

  async togglePaid(p: PersonResult, paid: boolean) {
    this.busy.set(p.personKey);
    this.error.set(null);
    try {
      await this.api.setPaid(this.data().match.id, p.personKey, p.bettorName, paid);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(null);
    }
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.summary());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.error.set('No se pudo copiar. Abre "Ver texto" y cópialo a mano.');
    }
  }
}
