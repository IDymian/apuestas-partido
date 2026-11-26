import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AmountSheetComponent } from './amount-sheet.component';
import { formatSoles, STREAK_MAX_OPTION } from '../domain/settlement';
import { makeSelectionLabel } from '../domain/adapt';
import { BetDraft, HOUSE_WARNING, Market, MAX_BETS_PER_TICKET, PublicMatchData, SECTIONS } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { prepareReceipt } from '../core/receipt-image';

type Step = 'pick' | 'pay' | 'done';

interface Choice {
  selection: string;
  label: string;
}

@Component({
  selector: 'app-bet-flow',
  imports: [AmountSheetComponent],
  template: `
    @switch (step()) {
      <!-- ====================== 1-3. Nombre, apuestas y resumen ====================== -->
      @case ('pick') {
        <section class="card">
          <label for="bettor" class="text-sm font-semibold text-slate-700">1. Tu nombre</label>
          <input
            id="bettor"
            class="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            placeholder="Nombre y apellido o apodo"
            maxlength="40"
            autocomplete="name"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
          @if (showErrors() && !name().trim()) {
            <p class="mt-1 text-sm text-red-600">Escribe tu nombre para apostar.</p>
          }
        </section>

        <p class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">⚠️ {{ warning }}</p>

        <p class="mt-5 px-1 text-sm font-semibold text-slate-700">2. Elige tus apuestas</p>
        <p class="px-1 text-xs text-slate-500">Toca una apuesta para ver las opciones. De S/ 1 a S/ 5 cada una.</p>

        @for (sec of sections(); track sec.id) {
          <h2 class="mt-4 mb-2 px-1 text-sm font-bold text-slate-700">{{ sec.icon }} Bote {{ sec.label }}</h2>
          <div class="space-y-2">
            @for (m of sec.markets; track m.id) {
              @let mine = countFor(m.id);
              <section class="card p-0">
                <button type="button" class="flex w-full items-center gap-3 p-4 text-left" (click)="toggle(m.id)" [attr.aria-expanded]="open() === m.id">
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold text-slate-900">{{ m.name }}</span>
                    <span class="block text-xs text-slate-500">{{ hint(m) }} · Bote {{ soles(potByMarket().get(m.id) ?? 0) }}</span>
                  </span>
                  @if (mine) {
                    <span class="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{{ mine }}</span>
                  }
                  <span class="shrink-0 text-slate-400">{{ open() === m.id ? '▲' : '▼' }}</span>
                </button>
                @if (open() === m.id) {
                  <div class="flex flex-wrap gap-2 border-t border-slate-100 p-4">
                    @for (c of choices(m); track c.selection) {
                      @let amt = amountFor(m.id, c.selection);
                      <button type="button" class="chip" [class.chip-on]="amt" [attr.aria-pressed]="!!amt" (click)="openSheet(m, c)">
                        {{ c.label }}
                        @if (amt) {
                          <span class="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs font-bold">S/ {{ amt }}</span>
                        }
                      </button>
                    }
                  </div>
                }
              </section>
            }
          </div>
        }

        <section class="card mt-5">
          <h2 class="text-sm font-semibold text-slate-700">3. Tus apuestas</h2>
          @if (bets().length === 0) {
            <p class="mt-2 text-sm text-slate-500">Aún no elegiste nada.</p>
            @if (showErrors()) {
              <p class="mt-1 text-sm text-red-600">Elige al menos una apuesta.</p>
            }
          } @else {
            <ul class="mt-2 divide-y divide-slate-100">
              @for (b of bets(); track b.marketId + b.selection) {
                <li class="flex items-center gap-2 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold text-slate-900">{{ choiceLabel(b) }}</p>
                    <p class="text-xs text-slate-500">{{ marketById().get(b.marketId)?.name }}</p>
                  </div>
                  <button type="button" class="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800" (click)="editBet(b)" aria-label="Cambiar monto">
                    S/ {{ b.amount }} ✎
                  </button>
                  <button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" (click)="remove(b.marketId, b.selection)" aria-label="Quitar apuesta">✕</button>
                </li>
              }
            </ul>
            <p class="mt-2 text-xs text-slate-400">{{ bets().length }} de {{ maxBets }} apuestas</p>
          }
        </section>

        <div class="h-24"></div>
        <div class="bottom-bar">
          <div class="min-w-0">
            <p class="text-xs text-slate-500">Total a pagar</p>
            <p class="text-xl font-extrabold text-slate-900">{{ soles(totalCents()) }}</p>
          </div>
          <button type="button" class="btn-primary" (click)="goPay()">Continuar al pago →</button>
        </div>
      }

      <!-- ====================== 4. Pago ====================== -->
      @case ('pay') {
        @let mt = data().match;
        <button type="button" class="mb-3 text-sm font-semibold text-emerald-700" (click)="step.set('pick')">← Cambiar apuestas</button>

        <section class="card text-center">
          <p class="text-sm text-slate-600">{{ name().trim() }}, deposita por {{ mt.pay_method }}</p>
          <p class="text-4xl font-extrabold text-slate-900">{{ soles(totalCents()) }}</p>
          <p class="text-xs text-slate-500">{{ bets().length }} {{ bets().length === 1 ? 'apuesta' : 'apuestas' }}</p>

          @if (qr()) {
            <img [src]="qr()" [alt]="'QR de ' + mt.pay_method" class="mx-auto mt-4 w-56 max-w-full rounded-xl border border-slate-200" />
          }
          @if (mt.pay_number) {
            <div class="mt-4 rounded-2xl bg-cyan-50 p-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-cyan-800">{{ mt.pay_method }}</p>
              <p class="text-2xl font-bold tracking-wide text-cyan-950">{{ mt.pay_number }}</p>
              @if (mt.pay_holder) {
                <p class="text-sm text-cyan-900">{{ mt.pay_holder }}</p>
              }
              <button type="button" class="mt-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white" (click)="copyNumber()">
                {{ copied() ? '¡Copiado!' : 'Copiar número' }}
              </button>
            </div>
          }
        </section>

        <section class="card mt-3">
          <h2 class="text-sm font-semibold text-slate-700">Sube la captura de tu {{ mt.pay_method }}</h2>
          <label class="mt-3 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center active:bg-slate-50" [class.border-emerald-500]="preview()">
            @if (preparing()) {
              <span class="text-sm text-slate-600">Procesando imagen…</span>
            } @else if (preview()) {
              <img [src]="preview()" alt="Tu captura" class="max-h-72 rounded-lg" />
              <span class="mt-2 text-xs font-semibold text-emerald-700">Toca para cambiarla</span>
            } @else {
              <span class="text-3xl">📷</span>
              <span class="mt-1 font-semibold text-slate-800">Elegir captura</span>
              <span class="text-xs text-slate-500">JPG, PNG o HEIC · máx. 10 MB</span>
            }
            <input type="file" class="sr-only" accept="image/*,.heic,.heif" (change)="onFile($event)" />
          </label>
        </section>

        @if (error()) {
          <p class="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{{ error() }}</p>
        }

        <button type="button" class="btn-primary mt-4 w-full" [disabled]="!receipt() || sending() || preparing()" (click)="submit()">
          {{ sending() ? 'Enviando…' : 'Enviar apuesta' }}
        </button>
        <p class="mt-2 text-center text-xs text-slate-500">Tu apuesta queda pendiente hasta que el organizador verifique tu pago.</p>
      }

      <!-- ====================== 5. Confirmación ====================== -->
      @case ('done') {
        <section class="card text-center">
          <div class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✓</div>
          <h2 class="mt-3 text-xl font-bold text-slate-900">¡Apuesta enviada!</h2>
          <p class="mt-1 text-slate-600">Tu apuesta se aprobará cuando el organizador verifique tu {{ data().match.pay_method }}.</p>
          <ul class="mt-4 divide-y divide-slate-100 text-left">
            @for (b of sent(); track b.marketId + b.selection) {
              <li class="flex justify-between gap-2 py-2 text-sm">
                <span><b>{{ choiceLabel(b) }}</b> · {{ marketById().get(b.marketId)?.name }}</span>
                <span class="shrink-0 font-semibold">S/ {{ b.amount }}</span>
              </li>
            }
          </ul>
          <p class="mt-2 text-right font-bold">Total {{ soles(sentTotal()) }}</p>
        </section>
        <button type="button" class="btn-primary mt-4 w-full" (click)="viewLive.emit()">Ver el bote en vivo</button>
        <button type="button" class="mt-2 h-12 w-full rounded-2xl font-semibold text-emerald-700" (click)="again()">Hacer otra apuesta</button>
      }
    }

    @if (sheet(); as s) {
      <app-amount-sheet
        [marketName]="s.market.name"
        [choiceName]="s.choice.label"
        [current]="amountFor(s.market.id, s.choice.selection)"
        (picked)="setAmount(s.market.id, s.choice.selection, $event)"
        (removed)="remove(s.market.id, s.choice.selection); sheet.set(null)"
        (closed)="sheet.set(null)"
      />
    }
    @if (toast()) {
      <div class="fixed inset-x-4 bottom-28 z-50 mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg">{{ toast() }}</div>
    }
  `,
})
export class BetFlowComponent {
  readonly data = input.required<PublicMatchData>();
  readonly code = input.required<string>();
  readonly viewLive = output<void>();

  private api = inject(PublicApi);
  protected readonly maxBets = MAX_BETS_PER_TICKET;
  protected readonly soles = formatSoles;
  protected readonly warning = HOUSE_WARNING;

  protected readonly step = signal<Step>('pick');
  protected readonly name = signal('');
  protected readonly bets = signal<BetDraft[]>([]);
  protected readonly open = signal<string | null>(null);
  protected readonly sheet = signal<{ market: Market; choice: Choice } | null>(null);
  protected readonly showErrors = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly receipt = signal<Blob | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly preparing = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly sent = signal<BetDraft[]>([]);
  private uploadedPath: string | null = null;
  private draftLoadedFor = '';

  protected readonly marketById = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  protected readonly qr = computed(() => this.api.qrUrl(this.data().match.pay_qr_path));
  private readonly labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams));

  protected readonly sections = computed(() => {
    const markets = [...this.data().markets].sort((a, b) => a.sort_order - b.sort_order);
    return SECTIONS.map((s) => ({ ...s, markets: markets.filter((m) => m.section === s.id) })).filter((s) => s.markets.length);
  });

  private readonly playerChoices = computed(() =>
    this.data().players.filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order).map((p) => ({ selection: p.id, label: p.name })),
  );
  private readonly ownGoalChoice = computed(() => {
    const og = this.data().players.find((p) => p.is_own_goal);
    return og ? [{ selection: og.id, label: '🙈 Autogol' }] : [];
  });
  private readonly teamChoices = computed(() =>
    [...this.data().teams].sort((a, b) => a.sort_order - b.sort_order).map((t) => ({ selection: t.id, label: t.name })),
  );

  protected readonly potByMarket = computed(() => {
    const map = new Map<string, number>();
    for (const m of this.data().markets) map.set(m.id, Math.round(Number(m.initial_pot || 0) * 100));
    for (const b of this.data().bets) map.set(b.market_id, (map.get(b.market_id) ?? 0) + b.amount * 100);
    return map;
  });

  protected readonly totalCents = computed(() => this.bets().reduce((s, b) => s + b.amount * 100, 0));
  protected readonly sentTotal = computed(() => this.sent().reduce((s, b) => s + b.amount * 100, 0));

  constructor() {
    effect(() => {
      const code = this.code();
      const saved = readDraft(code);
      if (saved) {
        this.name.set(saved.name);
        this.bets.set(saved.bets);
      }
      this.draftLoadedFor = code;
    });
    effect(() => {
      const code = this.code();
      const draft = { name: this.name(), bets: this.bets() };
      if (this.draftLoadedFor === code) writeDraft(code, draft);
    });
    // Quita apuestas a opciones o mercados que ya no existen.
    effect(() => {
      const valid = this.bets().filter((b) => {
        const m = this.marketById().get(b.marketId);
        return m && this.choices(m).some((c) => c.selection === b.selection);
      });
      if (valid.length !== this.bets().length) this.bets.set(valid);
    });
  }

  protected choices(m: Market): Choice[] {
    if (m.target === 'team') return this.teamChoices();
    if (m.target === 'number') {
      const min = m.option_min ?? 1;
      const max = m.option_max ?? STREAK_MAX_OPTION;
      return Array.from({ length: max - min + 1 }, (_, i) => {
        const n = min + i;
        return { selection: String(n), label: n === max ? `${n}+` : String(n) };
      });
    }
    return [...this.playerChoices(), ...(m.allows_own_goal ? this.ownGoalChoice() : [])];
  }

  protected hint(m: Market): string {
    if (m.target === 'team') return 'A un equipo';
    if (m.target === 'number') return 'A un número';
    return 'A un jugador';
  }

  protected choiceLabel(b: BetDraft): string {
    const m = this.marketById().get(b.marketId);
    return this.labeler()(m?.target, b.selection, m?.type);
  }

  protected countFor(marketId: string) {
    return this.bets().filter((b) => b.marketId === marketId).length;
  }

  protected amountFor(marketId: string, selection: string): number | null {
    return this.bets().find((b) => b.marketId === marketId && b.selection === selection)?.amount ?? null;
  }

  protected toggle(marketId: string) {
    this.open.set(this.open() === marketId ? null : marketId);
  }

  protected openSheet(market: Market, choice: Choice) {
    this.sheet.set({ market, choice });
  }

  protected editBet(b: BetDraft) {
    const market = this.marketById().get(b.marketId);
    const choice = market && this.choices(market).find((c) => c.selection === b.selection);
    if (market && choice) this.sheet.set({ market, choice });
  }

  protected setAmount(marketId: string, selection: string, amount: number) {
    const list = this.bets();
    const i = list.findIndex((b) => b.marketId === marketId && b.selection === selection);
    if (i >= 0) {
      this.bets.set(list.map((b, j) => (j === i ? { ...b, amount } : b)));
    } else if (list.length >= MAX_BETS_PER_TICKET) {
      this.flash(`Máximo ${MAX_BETS_PER_TICKET} apuestas por ticket`);
    } else {
      this.bets.set([...list, { marketId, selection, amount }]);
    }
    this.sheet.set(null);
  }

  protected remove(marketId: string, selection: string) {
    this.bets.set(this.bets().filter((b) => !(b.marketId === marketId && b.selection === selection)));
  }

  protected goPay() {
    this.showErrors.set(true);
    if (!this.name().trim() || this.bets().length === 0) {
      this.flash(!this.name().trim() ? 'Falta tu nombre' : 'Elige al menos una apuesta');
      if (!this.name().trim()) document.getElementById('bettor')?.focus();
      return;
    }
    this.error.set(null);
    this.step.set('pay');
    window.scrollTo({ top: 0 });
  }

  protected async onFile(ev: Event) {
    const inputEl = ev.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    this.error.set(null);
    this.preparing.set(true);
    try {
      const blob = await prepareReceipt(file);
      if (this.preview()) URL.revokeObjectURL(this.preview()!);
      this.receipt.set(blob);
      this.preview.set(URL.createObjectURL(blob));
      this.uploadedPath = null;
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.preparing.set(false);
    }
  }

  protected async copyNumber() {
    try {
      await navigator.clipboard.writeText((this.data().match.pay_number ?? '').replace(/\s/g, ''));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.flash('No se pudo copiar');
    }
  }

  protected async submit() {
    const blob = this.receipt();
    if (!blob || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      this.uploadedPath ??= await this.api.uploadReceipt(this.data().match.id, blob);
      const withTarget = this.bets().map((b) => ({ ...b, target: this.marketById().get(b.marketId)!.target }));
      await this.api.submitTicket(this.code(), this.name().trim(), withTarget, this.uploadedPath);
      this.sent.set(this.bets());
      this.bets.set([]);
      this.receipt.set(null);
      if (this.preview()) URL.revokeObjectURL(this.preview()!);
      this.preview.set(null);
      this.uploadedPath = null;
      this.showErrors.set(false);
      this.step.set('done');
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.sending.set(false);
    }
  }

  protected again() {
    this.sent.set([]);
    this.step.set('pick');
  }

  private flash(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

// --- Borrador en el navegador (comodidad, puede no estar disponible) ---
interface Draft {
  name: string;
  bets: BetDraft[];
}
const draftKey = (code: string) => `apuestas:draft2:${code.toUpperCase()}`;
function readDraft(code: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(code));
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && typeof d.name === 'string' && Array.isArray(d.bets) && d.bets.every((b) => typeof b.selection === 'string') ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(code: string, d: Draft) {
  try {
    localStorage.setItem(draftKey(code), JSON.stringify(d));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
