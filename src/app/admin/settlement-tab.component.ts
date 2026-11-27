import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, SECTIONS } from '../core/models';
import { friendlyError } from '../core/public-api';
import { adminToSettleInput, makeSelectionLabel } from '../domain/adapt';
import { formatSoles, MarketResult, PersonResult, personKey, settle } from '../domain/settlement';
import { isGameMarket } from '../domain/game-markets';
import { whatsappSummary } from '../domain/whatsapp';

@Component({
  selector: 'app-settlement-tab',
  template: `
    <section class="card mb-3">
      <h2 class="font-bold">💰 Acreditar resultados al saldo</h2>
      <p class="mt-1 text-sm text-slate-600">
        Cuando quieras, da por cerrado un mercado: a los ganadores se les suma su parte del bote a su saldo (y a quien
        corresponda, la devolución). Si corriges un evento, puedes volver a liquidar y los saldos se actualizan.
      </p>
      <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div class="rounded-xl bg-emerald-50 p-2"><p class="text-emerald-800">Acreditados</p><p class="text-lg font-extrabold text-emerald-900">{{ settledCount() }}</p></div>
        <div class="rounded-xl bg-amber-50 p-2"><p class="text-amber-800">Listos</p><p class="text-lg font-extrabold text-amber-900">{{ ready().length }}</p></div>
        <div class="rounded-xl bg-red-50 p-2"><p class="text-red-700">Cambiaron</p><p class="text-lg font-extrabold text-red-800">{{ stale().length }}</p></div>
      </div>
      <button type="button" class="btn-primary mt-3 w-full" [disabled]="busy() !== null || ready().length + stale().length === 0" (click)="settleAll()">
        ✓ Acreditar todos los listos ({{ ready().length + stale().length }})
      </button>
      <p class="mt-1 text-xs text-slate-500">"Listos" = partidos terminados y, para las apuestas de toda la jornada, la liga terminada.</p>
    </section>

    @if (data().match.status !== 'finished') {
      <p class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Resultado <b>parcial</b>: la jornada no ha terminado. Se recalcula solo con cada evento.
      </p>
    }
    @if (pendingCount() > 0) {
      <p class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Hay {{ pendingCount() }} ticket(s) pendiente(s) que <b>no</b> cuentan hasta que los apruebes.
      </p>
    }

    @for (sec of sections(); track sec.id) {
      <h2 class="mt-4 mb-2 px-1 text-sm font-bold text-slate-700">{{ sec.icon }} Bote {{ sec.label }}</h2>
      <div class="space-y-3">
        @for (m of sec.markets; track m.marketId) {
          <section class="card">
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="font-bold">{{ m.name }}</h3>
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
                  <p>Ganó: <b>{{ label(m) }}</b></p>
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
                    Ganó: <b>{{ label(m) }}</b> · nadie acertó →
                    {{ m.rolledToMarketId ? 'pasa a ' + marketName(m.rolledToMarketId) : 'se lo queda el organizador' }}
                  </p>
                }
                @case ('refund') {
                  <p>{{ m.reason }}: se devuelve lo apostado.</p>
                }
                @default {
                  <p class="text-slate-500">{{ m.reason ?? 'Sin resolver' }}</p>
                }
              }
            </div>

            <!-- Liquidación -->
            @let st = settledOf(m.marketId);
            <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              @if (st) {
                @if (isStale(m)) {
                  <span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">⚠ Cambió desde que liquidaste</span>
                } @else {
                  <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">✓ Acreditado · {{ time(st.settled_at) }}</span>
                }
                <span class="flex-1"></span>
                @if (isStale(m) && m.outcome !== 'unresolved') {
                  <button type="button" class="btn-primary h-9 text-xs" [disabled]="busy() !== null" (click)="settleOne(m)">Re-liquidar</button>
                }
                <button type="button" class="btn-secondary h-9 text-xs" [disabled]="busy() !== null" (click)="unsettle(m)">Deshacer</button>
              } @else if (m.outcome === 'unresolved') {
                <span class="text-xs text-slate-500">Sin resultado todavía</span>
              } @else {
                <span class="text-xs" [class]="isFinal(m) ? 'text-emerald-700 font-semibold' : 'text-amber-700'">{{ isFinal(m) ? 'Listo para acreditar' : 'Aún en juego (va así)' }}</span>
                <span class="flex-1"></span>
                <button type="button" class="btn-primary h-9 text-xs" [disabled]="busy() !== null" (click)="settleOne(m)">✓ Dar resultado y acreditar</button>
              }
            </div>
            @if (noAccount(m).length) {
              <p class="mt-1 text-xs text-amber-700">Sin cuenta (págales a mano): {{ noAccount(m).join(', ') }}</p>
            }
          </section>
        }
      </div>
    }

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
          <p class="text-xs text-amber-800">Para el organizador</p>
          <p class="font-bold text-amber-900">{{ soles(result().houseCents) }}</p>
        </div>
      </div>
      <p class="mt-2 text-xs text-slate-500">"Para el organizador" = botes donde nadie acertó y pozos iniciales no repartidos.</p>
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
  private markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  private types = computed(() => new Map(this.data().marketTypes.map((t) => [t.type, t])));
  private labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams));
  private paramOf(marketId: string) {
    return this.data().markets.find((x) => x.id === marketId)?.param ?? null;
  }
  protected sections = computed(() =>
    SECTIONS.map((s) => ({ ...s, markets: this.result().markets.filter((m) => this.types().get(m.type)?.section === s.id) })).filter(
      (s) => s.markets.length,
    ),
  );
  protected paid = computed(() => new Set(this.data().paid.map((p) => p.person_key)));
  protected toPay = computed(() => this.result().people.filter((p) => p.totalCents > 0));
  protected paidCount = computed(() => this.toPay().filter((p) => this.paid().has(p.personKey)).length);
  protected totalToPay = computed(() => this.toPay().reduce((s, p) => s + p.totalCents, 0));
  protected pendingCount = computed(() => this.data().tickets.filter((t) => t.status === 'pending').length);

  // ---------------------------------------------------------------- liquidación
  /** personKey → cuenta (user_id) a partir de los tickets. */
  private userByPerson = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.data().tickets) if (t.user_id) map.set(personKey(t.bettor_name), t.user_id);
    return map;
  });
  private settledMap = computed(() => new Map(this.data().settlements.map((x) => [x.market_id, x])));
  private storedCredits = computed(() => {
    const map = new Map<string, string>();
    for (const c of [...this.data().credits].sort((a, b) => (a.user_id + a.kind).localeCompare(b.user_id + b.kind))) {
      map.set(c.market_id, (map.get(c.market_id) ?? '') + `${c.user_id}:${c.kind}:${c.amount_cents};`);
    }
    return map;
  });
  protected settledCount = computed(() => this.data().settlements.length);
  /** Resueltos, terminados y aún sin liquidar. */
  protected ready = computed(() => this.result().markets.filter((m) => m.outcome !== 'unresolved' && !this.settledOf(m.marketId) && this.isFinal(m)));
  /** Liquidados cuyo resultado cambió después. */
  protected stale = computed(() => this.result().markets.filter((m) => this.settledOf(m.marketId) && this.isStale(m) && m.outcome !== 'unresolved'));

  protected settledOf(marketId: string) {
    return this.settledMap().get(marketId) ?? null;
  }

  /** Lo que hay que acreditar en un mercado (ganadores y devoluciones con cuenta). */
  private creditsFor(m: MarketResult) {
    const users = this.userByPerson();
    return [
      ...m.payouts.map((p) => ({ user_id: users.get(p.personKey) ?? '', username: p.bettorName, kind: 'win' as const, amount_cents: p.amountCents })),
      ...m.refunds.map((p) => ({ user_id: users.get(p.personKey) ?? '', username: p.bettorName, kind: 'refund' as const, amount_cents: p.amountCents })),
    ].filter((c) => c.user_id && c.amount_cents > 0);
  }

  protected noAccount(m: MarketResult) {
    const users = this.userByPerson();
    return [...m.payouts, ...m.refunds].filter((p) => p.amountCents > 0 && !users.has(p.personKey)).map((p) => p.bettorName);
  }

  protected isStale(m: MarketResult) {
    const st = this.settledOf(m.marketId);
    if (!st) return false;
    const now = this.creditsFor(m)
      .sort((a, b) => (a.user_id + a.kind).localeCompare(b.user_id + b.kind))
      .map((c) => `${c.user_id}:${c.kind}:${c.amount_cents};`)
      .join('');
    return now !== (this.storedCredits().get(m.marketId) ?? '') || st.outcome !== m.outcome || (st.winner_selection ?? null) !== (m.winnerSelection ?? null);
  }

  /** ¿Terminó lo que decide este mercado? (partido terminado / liga terminada) */
  protected isFinal(m: MarketResult) {
    if (this.data().match.status === 'finished') return true;
    const lg = this.result().league;
    if (isGameMarket(m.type)) return lg.games.find((g) => g.number === this.paramOf(m.marketId))?.status === 'played';
    return lg.games.every((g) => g.status === 'played');
  }

  protected time(iso: string) {
    return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }

  async settleOne(m: MarketResult) {
    if (!this.isFinal(m) && !confirm(`"${m.name}" todavía no termina. ¿Acreditar con el resultado de ahora?`)) return;
    await this.runSettle([m]);
  }

  async settleAll() {
    const list = [...this.ready(), ...this.stale()];
    if (!list.length || !confirm(`¿Acreditar ${list.length} mercado(s) al saldo de los ganadores?`)) return;
    await this.runSettle(list);
  }

  private async runSettle(list: MarketResult[]) {
    this.busy.set('settle');
    this.error.set(null);
    try {
      for (const m of list) {
        if (m.outcome === 'unresolved') continue;
        await this.api.settleMarket(m.marketId, m.outcome, m.winnerSelection, this.creditsFor(m));
      }
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(null);
    }
  }

  async unsettle(m: MarketResult) {
    if (!confirm(`¿Deshacer la liquidación de "${m.name}"? Se quita lo acreditado a los ganadores.`)) return;
    this.busy.set('settle');
    try {
      await this.api.unsettleMarket(m.marketId);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected summary = computed(() =>
    whatsappSummary(this.result(), {
      title: this.data().match.title,
      selectionLabel: (m, s) => this.labeler()(this.types().get(m.type)?.target, s, m.type, this.paramOf(m.marketId)),
      marketName: (id) => this.marketName(id),
      paidKeys: this.paid(),
    }),
  );

  label(m: MarketResult) {
    return this.labeler()(this.types().get(m.type)?.target, m.winnerSelection, m.type, this.paramOf(m.marketId));
  }
  marketName(id: string) {
    return this.markets().get(id)?.name ?? '¿?';
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
