import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AmountSheetComponent } from './amount-sheet.component';
import { formatSoles } from '../domain/settlement';
import { BetDraft, MAX_BETS_PER_TICKET, Market, Player, PublicMatchData, teamName } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { prepareReceipt } from '../core/receipt-image';

type Step = 'pick' | 'pay' | 'done';

interface PlayerGroup {
  key: string;
  label: string;
  players: Player[];
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

        <p class="mt-5 px-1 text-sm font-semibold text-slate-700">2. Elige tus jugadores</p>
        <p class="px-1 text-xs text-slate-500">Toca un jugador para apostarle de S/ 1 a S/ 5. Puedes apostar en varios mercados.</p>

        @for (mg of marketGroups(); track mg.market.id) {
          <section class="card mt-3">
            <div class="flex items-baseline justify-between gap-2">
              <h2 class="text-lg font-bold text-slate-900">{{ mg.market.name }}</h2>
              <span class="shrink-0 text-xs font-medium text-slate-500">Bote {{ soles(potByMarket().get(mg.market.id) ?? 0) }}</span>
            </div>
            @for (g of mg.groups; track g.key) {
              <p class="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ g.label }}</p>
              <div class="flex flex-wrap gap-2">
                @for (p of g.players; track p.id) {
                  @let amt = amountFor(mg.market.id, p.id);
                  <button
                    type="button"
                    class="chip"
                    [class.chip-on]="amt"
                    [attr.aria-pressed]="!!amt"
                    (click)="openSheet(mg.market, p)"
                  >
                    {{ p.name }}
                    @if (amt) {
                      <span class="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs font-bold">S/ {{ amt }}</span>
                    }
                  </button>
                }
              </div>
            }
          </section>
        }

        <section class="card mt-5">
          <h2 class="text-sm font-semibold text-slate-700">3. Tus apuestas</h2>
          @if (bets().length === 0) {
            <p class="mt-2 text-sm text-slate-500">Aún no elegiste ningún jugador.</p>
            @if (showErrors()) {
              <p class="mt-1 text-sm text-red-600">Elige al menos un jugador.</p>
            }
          } @else {
            <ul class="mt-2 divide-y divide-slate-100">
              @for (b of bets(); track b.marketId + b.playerId) {
                <li class="flex items-center gap-2 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold text-slate-900">{{ playerById().get(b.playerId)?.name }}</p>
                    <p class="text-xs text-slate-500">{{ marketById().get(b.marketId)?.name }}</p>
                  </div>
                  <button
                    type="button"
                    class="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800"
                    (click)="openSheetById(b.marketId, b.playerId)"
                    aria-label="Cambiar monto"
                  >
                    S/ {{ b.amount }} ✎
                  </button>
                  <button
                    type="button"
                    class="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    (click)="remove(b.marketId, b.playerId)"
                    aria-label="Quitar apuesta"
                  >
                    ✕
                  </button>
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
        <button type="button" class="mb-3 text-sm font-semibold text-emerald-700" (click)="step.set('pick')">← Cambiar apuestas</button>

        <section class="card text-center">
          <p class="text-sm text-slate-600">{{ name().trim() }}, yapea</p>
          <p class="text-4xl font-extrabold text-slate-900">{{ soles(totalCents()) }}</p>
          <p class="text-xs text-slate-500">{{ bets().length }} {{ bets().length === 1 ? 'apuesta' : 'apuestas' }}</p>

          @if (qr()) {
            <img [src]="qr()" alt="QR de Yape del organizador" class="mx-auto mt-4 w-56 max-w-full rounded-xl border border-slate-200" />
          }
          @if (data().match.yape_number) {
            <div class="mt-4 rounded-2xl bg-violet-50 p-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-violet-700">Yape</p>
              <p class="text-2xl font-bold tracking-wide text-violet-900">{{ data().match.yape_number }}</p>
              @if (data().match.yape_holder) {
                <p class="text-sm text-violet-800">{{ data().match.yape_holder }}</p>
              }
              <button type="button" class="mt-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white" (click)="copyYape()">
                {{ copied() ? '¡Copiado!' : 'Copiar número' }}
              </button>
            </div>
          }
        </section>

        <section class="card mt-3">
          <h2 class="text-sm font-semibold text-slate-700">Sube la captura de tu Yape</h2>
          <label
            class="mt-3 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center active:bg-slate-50"
            [class.border-emerald-500]="preview()"
          >
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

        <button
          type="button"
          class="btn-primary mt-4 w-full"
          [disabled]="!receipt() || sending() || preparing()"
          (click)="submit()"
        >
          {{ sending() ? 'Enviando…' : 'Enviar apuesta' }}
        </button>
        <p class="mt-2 text-center text-xs text-slate-500">Tu apuesta queda pendiente hasta que el organizador verifique tu Yape.</p>
      }

      <!-- ====================== 5. Confirmación ====================== -->
      @case ('done') {
        <section class="card text-center">
          <div class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✓</div>
          <h2 class="mt-3 text-xl font-bold text-slate-900">¡Apuesta enviada!</h2>
          <p class="mt-1 text-slate-600">Tu apuesta se aprobará cuando el organizador verifique tu Yape.</p>
          <ul class="mt-4 divide-y divide-slate-100 text-left">
            @for (b of sent(); track b.marketId + b.playerId) {
              <li class="flex justify-between gap-2 py-2 text-sm">
                <span><b>{{ playerById().get(b.playerId)?.name }}</b> · {{ marketById().get(b.marketId)?.name }}</span>
                <span class="font-semibold">S/ {{ b.amount }}</span>
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
        [playerName]="s.player.name"
        [current]="amountFor(s.market.id, s.player.id)"
        (picked)="setAmount(s.market.id, s.player.id, $event)"
        (removed)="remove(s.market.id, s.player.id); sheet.set(null)"
        (closed)="sheet.set(null)"
      />
    }
    @if (toast()) {
      <div class="fixed inset-x-4 bottom-28 z-50 mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg">
        {{ toast() }}
      </div>
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

  protected readonly step = signal<Step>('pick');
  protected readonly name = signal('');
  protected readonly bets = signal<BetDraft[]>([]);
  protected readonly sheet = signal<{ market: Market; player: Player } | null>(null);
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

  protected readonly playerById = computed(() => new Map(this.data().players.map((p) => [p.id, p])));
  protected readonly marketById = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  protected readonly qr = computed(() => this.api.qrUrl(this.data().match.yape_qr_path));

  protected readonly potByMarket = computed(() => {
    const map = new Map<string, number>();
    for (const m of this.data().markets) map.set(m.id, Math.round(Number(m.initial_pot || 0) * 100));
    for (const b of this.data().bets) map.set(b.market_id, (map.get(b.market_id) ?? 0) + b.amount * 100);
    return map;
  });

  protected readonly marketGroups = computed(() => {
    const d = this.data();
    const sorted = [...d.players].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return [...d.markets]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((market) => {
        const groups: PlayerGroup[] = [
          { key: 'home', label: teamName(d.match, 'home'), players: sorted.filter((p) => p.team === 'home') },
          { key: 'away', label: teamName(d.match, 'away'), players: sorted.filter((p) => p.team === 'away') },
        ];
        if (market.allows_own_goal) {
          groups.push({ key: 'og', label: 'Especial', players: sorted.filter((p) => p.is_own_goal) });
        }
        return { market, groups: groups.filter((g) => g.players.length > 0) };
      });
  });

  protected readonly totalCents = computed(() => this.bets().reduce((s, b) => s + b.amount * 100, 0));
  protected readonly sentTotal = computed(() => this.sent().reduce((s, b) => s + b.amount * 100, 0));

  constructor() {
    // Recupera el borrador (nombre + apuestas) si recargan la página.
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
    // Quita apuestas a jugadores o mercados que ya no existen.
    effect(() => {
      const p = this.playerById();
      const m = this.marketById();
      const valid = this.bets().filter((b) => p.has(b.playerId) && m.has(b.marketId));
      if (valid.length !== this.bets().length) this.bets.set(valid);
    });
  }

  protected amountFor(marketId: string, playerId: string): number | null {
    return this.bets().find((b) => b.marketId === marketId && b.playerId === playerId)?.amount ?? null;
  }

  protected openSheet(market: Market, player: Player) {
    this.sheet.set({ market, player });
  }

  protected openSheetById(marketId: string, playerId: string) {
    const market = this.marketById().get(marketId);
    const player = this.playerById().get(playerId);
    if (market && player) this.sheet.set({ market, player });
  }

  protected setAmount(marketId: string, playerId: string, amount: number) {
    const list = this.bets();
    const i = list.findIndex((b) => b.marketId === marketId && b.playerId === playerId);
    if (i >= 0) {
      this.bets.set(list.map((b, j) => (j === i ? { ...b, amount } : b)));
    } else if (list.length >= MAX_BETS_PER_TICKET) {
      this.flash(`Máximo ${MAX_BETS_PER_TICKET} apuestas por ticket`);
    } else {
      this.bets.set([...list, { marketId, playerId, amount }]);
    }
    this.sheet.set(null);
  }

  protected remove(marketId: string, playerId: string) {
    this.bets.set(this.bets().filter((b) => !(b.marketId === marketId && b.playerId === playerId)));
  }

  protected goPay() {
    this.showErrors.set(true);
    if (!this.name().trim() || this.bets().length === 0) {
      this.flash(!this.name().trim() ? 'Falta tu nombre' : 'Elige al menos un jugador');
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

  protected async copyYape() {
    try {
      await navigator.clipboard.writeText((this.data().match.yape_number ?? '').replace(/\s/g, ''));
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
      await this.api.submitTicket(this.code(), this.name().trim(), this.bets(), this.uploadedPath);
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
const draftKey = (code: string) => `apuestas:draft:${code.toUpperCase()}`;
function readDraft(code: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(code));
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && typeof d.name === 'string' && Array.isArray(d.bets) ? d : null;
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
