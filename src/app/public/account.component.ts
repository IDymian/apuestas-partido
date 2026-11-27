import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { betSelection, DEFAULT_PAY_QR, DEPOSIT_AMOUNTS, MAX_DEPOSIT, MyTicket, PublicMatchData, TicketStatus } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { WalletService } from '../core/wallet';
import { prepareReceipt } from '../core/receipt-image';
import { makeSelectionLabel, publicToSettleInput } from '../domain/adapt';
import { formatSoles, personKey, settle } from '../domain/settlement';
import { IconComponent, IconName } from '../ui/icon.component';
import { CountUpComponent } from '../ui/count-up.component';
import { confetti } from '../ui/confetti';

const DEPOSIT_STATUS: Record<TicketStatus, { label: string; icon: IconName; tone: string }> = {
  pending: { label: 'Por confirmar', icon: 'clock', tone: 'bg-gold/15 text-gold' },
  approved: { label: 'Acreditada', icon: 'check', tone: 'bg-lime/15 text-lime' },
  rejected: { label: 'Rechazada', icon: 'x', tone: 'bg-candy/15 text-candy' },
};
const TICKET_STATUS: Record<TicketStatus, { label: string; icon: IconName; tone: string }> = {
  pending: { label: 'En revisión', icon: 'clock', tone: 'bg-gold/15 text-gold' },
  approved: { label: 'En juego', icon: 'check', tone: 'bg-lime/15 text-lime' },
  rejected: { label: 'Anulado · devuelto', icon: 'x', tone: 'bg-candy/15 text-candy' },
};

/** Mi cuenta: saldo, recargas por Plin y mis tickets de la jornada. */
@Component({
  selector: 'app-account',
  imports: [IconComponent, CountUpComponent],
  template: `
    <!-- Saldo -->
    <section class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ff8a1f] via-lime to-[#d13f00] p-5 text-white shadow-[0_24px_50px_-20px_rgb(242_98_0/0.7)] anim-in">
      <div class="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/25 blur-3xl"></div>
      <p class="eyebrow text-white/85">{{ auth.user()?.username }} · tu saldo</p>
      <p class="mt-1 font-display text-5xl font-extrabold tracking-tight" data-testid="balance">
        @if (wallet.balance() === null) {
          …
        } @else {
          <app-count-up [cents]="(wallet.balance() ?? 0) * 100" />
        }
      </p>
      @if (pending() > 0) {
        <p class="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
          <app-icon name="clock" [size]="14" /> S/ {{ pending() }} por confirmar
        </p>
      }
      <div class="mt-4 grid grid-cols-2 gap-2">
        <button type="button" class="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-white font-display text-[16px] font-extrabold text-lime shadow-lg active:scale-95" (click)="openRecharge()">
          <app-icon name="wallet" [size]="18" /> Recargar
        </button>
        <button type="button" class="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-white/20 font-bold active:scale-95" (click)="goBet.emit()">
          <app-icon name="ticket" [size]="18" /> Apostar
        </button>
      </div>
    </section>

    <!-- Recargar -->
    @if (recharging()) {
      <section class="glass mt-4 anim-expand" id="recargar">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-xl font-extrabold">Recargar por Plin</h2>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-xl text-faint hover:bg-ink/[0.05]" (click)="recharging.set(false)" aria-label="Cerrar recarga">
            <app-icon name="x" [size]="18" />
          </button>
        </div>

        <p class="field-label mt-4">1. ¿Cuánto recargas?</p>
        <div class="grid grid-cols-4 gap-2">
          @for (a of amounts; track a) {
            <button type="button" class="h-12 rounded-2xl border-2 font-display text-lg font-extrabold transition active:scale-95" [class]="amount() === a ? 'border-lime bg-lime text-white' : 'border-ink/10 bg-white'" (click)="amount.set(a)">
              {{ a }}
            </button>
          }
        </div>
        <label class="mt-2 flex items-center gap-2">
          <span class="text-sm font-semibold text-mute">Otro monto: S/</span>
          <input
            class="field h-11 w-28 text-center font-bold"
            type="number"
            inputmode="numeric"
            min="1"
            [max]="maxDeposit"
            aria-label="Otro monto"
            [value]="amount() ?? ''"
            (input)="setCustom($event)"
          />
        </label>

        <p class="field-label mt-5">2. Plinea S/ {{ amount() ?? '…' }} a este QR</p>
        <div class="rounded-3xl border border-ink/[0.07] bg-night p-4 text-center">
          @if (!qrFailed()) {
            <img [src]="qr()" alt="QR de Plin para recargar" class="mx-auto w-56 max-w-full rounded-2xl bg-white p-2 shadow" (error)="qrFailed.set(true)" />
          } @else {
            <p class="rounded-2xl bg-gold/10 p-3 text-sm text-gold">El organizador aún no subió el QR. Usa el número.</p>
          }
          <p class="mt-2 text-sm font-bold">{{ data().match.pay_holder || 'Organizador' }}</p>
          @if (data().match.pay_number) {
            <button type="button" class="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold shadow-sm active:scale-95" (click)="copy(data().match.pay_number!)">
              <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16" /> {{ data().match.pay_number }} {{ copied() ? '· copiado' : '' }}
            </button>
          }
        </div>

        <p class="field-label mt-5">3. Sube la captura del Plin</p>
        <label class="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-4 text-center transition" [class]="preview() ? 'border-lime/60 bg-lime/5' : 'border-ink/15 hover:border-ink/30'">
          @if (preparing()) {
            <span class="text-sm text-mute">Procesando imagen…</span>
          } @else if (preview()) {
            <img [src]="preview()" alt="Tu captura" class="max-h-64 rounded-2xl anim-pop" />
            <span class="mt-2 text-xs font-bold text-lime">Toca para cambiarla</span>
          } @else {
            <span class="grid h-12 w-12 place-items-center rounded-2xl bg-night-3 text-lime"><app-icon name="camera" [size]="24" /></span>
            <span class="mt-2 font-bold">Elegir captura</span>
            <span class="text-xs text-faint">JPG, PNG o HEIC · máx. 10 MB</span>
          }
          <input type="file" class="sr-only" accept="image/*,.heic,.heif" (change)="onFile($event)" />
        </label>

        @if (error()) {
          <p class="mt-3 rounded-2xl bg-candy/10 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
        }
        <button type="button" class="btn mt-4 w-full" [disabled]="!canSend() || sending()" (click)="send()">
          {{ sending() ? 'Enviando…' : 'Ya pliné S/ ' + (amount() ?? 0) }} <app-icon name="send" [size]="18" />
        </button>
        <p class="mt-2 text-center text-xs text-faint">Se suma a tu saldo cuando el organizador confirme tu Plin.</p>
      </section>
    }

    @if (notice()) {
      <p class="mt-4 flex items-center gap-2 rounded-2xl bg-lime/10 p-3 text-sm font-semibold text-lime anim-pop" role="status">
        <app-icon name="check" [size]="18" /> {{ notice() }}
      </p>
    }

    <!-- Lo que voy ganando -->
    <div class="mt-4 grid grid-cols-2 gap-2.5">
      <div class="glass">
        <p class="eyebrow">Aposté aquí</p>
        <p class="mt-1 font-display text-2xl font-extrabold"><app-count-up [cents]="stakedCents()" /></p>
      </div>
      <div class="glass">
        <p class="eyebrow">{{ data().match.status === 'finished' ? 'Cobro' : 'Voy cobrando' }}</p>
        <p class="mt-1 font-display text-2xl font-extrabold text-lime"><app-count-up [cents]="winningCents()" /></p>
      </div>
    </div>

    <!-- Recargas -->
    @if (wallet.deposits().length) {
      <section class="glass mt-4">
        <h2 class="font-display text-lg font-extrabold">Mis recargas</h2>
        <ul class="mt-2 divide-y divide-ink/[0.06]">
          @for (d of wallet.deposits(); track d.id) {
            @let st = depositStatus[d.status];
            <li class="flex items-center gap-3 py-2.5">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl" [class]="st.tone"><app-icon [name]="st.icon" [size]="16" [stroke]="2.6" /></span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold">{{ st.label }}</span>
                <span class="block truncate text-xs text-mute">{{ when(d.created_at) }}{{ d.reject_reason ? ' · ' + d.reject_reason : '' }}</span>
              </span>
              <span class="font-display text-lg font-extrabold" [class.line-through]="d.status === 'rejected'" [class.text-faint]="d.status === 'rejected'">+ S/ {{ d.amount }}</span>
            </li>
          }
        </ul>
      </section>
    }

    <!-- Tickets -->
    <h2 class="mt-6 px-1 font-display text-xl font-extrabold">Mis tickets</h2>
    @if (loading() && tickets().length === 0) {
      <div class="mt-3 h-28 animate-pulse rounded-3xl bg-ink/[0.05]"></div>
    } @else if (tickets().length === 0) {
      <section class="glass mt-3 py-8 text-center">
        <p class="text-4xl">🎟️</p>
        <p class="mt-2 font-bold">Todavía no tienes tickets en esta jornada</p>
        @if (data().match.status === 'open') {
          <button type="button" class="btn mt-4" (click)="goBet.emit()">Apostar ahora <app-icon name="next" /></button>
        }
      </section>
    } @else {
      <div class="mt-3 space-y-3">
        @for (t of tickets(); track t.id; let i = $index) {
          @let st = ticketStatus[t.status];
          <article class="glass anim-in" [style.--i]="i">
            <div class="flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold" [class]="st.tone">
                <app-icon [name]="st.icon" [size]="14" [stroke]="2.6" /> {{ st.label }}
              </span>
              <span class="text-xs text-faint">{{ when(t.created_at) }}</span>
            </div>
            @if (t.status === 'rejected' && t.reject_reason) {
              <p class="mt-2 rounded-2xl bg-candy/10 p-2.5 text-sm text-candy">Motivo: {{ t.reject_reason }}</p>
            }
            <ul class="mt-2 divide-y divide-ink/[0.06]">
              @for (b of t.bets; track b.id) {
                <li class="flex justify-between gap-2 py-2 text-sm">
                  <span class="min-w-0"><b>{{ label(b) }}</b> <span class="text-mute">· {{ marketName(b.market_id) }}</span></span>
                  <span class="shrink-0 font-extrabold">S/ {{ b.amount }}</span>
                </li>
              }
            </ul>
            <p class="mt-1 text-right font-display text-lg font-extrabold">Total {{ soles(t.total * 100) }}</p>
          </article>
        }
      </div>
    }
  `,
})
export class AccountComponent {
  readonly code = input.required<string>();
  readonly data = input.required<PublicMatchData>();
  /** Si llega un monto, abre la recarga con ese monto (viene del cupón sin saldo). */
  readonly suggest = input<{ amount: number | null } | null>(null);
  readonly goBet = output<void>();

  private api = inject(PublicApi);
  protected readonly auth = inject(AuthApi);
  protected readonly wallet = inject(WalletService);
  protected readonly depositStatus = DEPOSIT_STATUS;
  protected readonly ticketStatus = TICKET_STATUS;
  protected readonly amounts = DEPOSIT_AMOUNTS;
  protected readonly maxDeposit = MAX_DEPOSIT;
  protected readonly soles = formatSoles;

  protected readonly tickets = signal<MyTicket[]>([]);
  protected readonly loading = signal(true);
  protected readonly recharging = signal(false);
  protected readonly amount = signal<number | null>(20);
  protected readonly receipt = signal<Blob | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly preparing = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly qrFailed = signal(false);

  protected readonly qr = computed(() => this.api.qrUrl(this.data().match.pay_qr_path) ?? DEFAULT_PAY_QR);
  protected readonly pending = computed(() => this.wallet.deposits().filter((d) => d.status === 'pending').reduce((s, d) => s + d.amount, 0));
  protected readonly canSend = computed(() => {
    const a = this.amount();
    return !!this.receipt() && !this.preparing() && a !== null && Number.isInteger(a) && a >= 1 && a <= MAX_DEPOSIT;
  });
  private readonly markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  private readonly labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams));
  protected readonly stakedCents = computed(() => this.tickets().filter((t) => t.status !== 'rejected').reduce((s, t) => s + t.total * 100, 0));
  protected readonly winningCents = computed(() => {
    const me = this.auth.user();
    if (!me) return 0;
    return settle(publicToSettleInput(this.data())).people.find((p) => p.personKey === personKey(me.username))?.totalCents ?? 0;
  });

  constructor() {
    effect(() => {
      this.data();
      const code = this.code();
      untracked(() => this.load(code));
    });
    effect(() => {
      const s = this.suggest();
      if (s) untracked(() => this.openRecharge(s.amount ?? undefined));
    });
  }

  private async load(code: string) {
    try {
      this.tickets.set(await this.api.getMyTickets(code));
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected openRecharge(amount?: number) {
    if (amount) this.amount.set(Math.min(MAX_DEPOSIT, Math.max(1, Math.ceil(amount))));
    this.recharging.set(true);
    this.notice.set(null);
    this.qrFailed.set(false);
    setTimeout(() => document.getElementById('recargar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  protected setCustom(ev: Event) {
    const v = Math.floor(Number((ev.target as HTMLInputElement).value));
    this.amount.set(Number.isFinite(v) && v > 0 ? v : null);
  }

  protected async onFile(ev: Event) {
    const el = ev.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.error.set(null);
    this.preparing.set(true);
    try {
      const blob = await prepareReceipt(file);
      if (this.preview()) URL.revokeObjectURL(this.preview()!);
      this.receipt.set(blob);
      this.preview.set(URL.createObjectURL(blob));
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.preparing.set(false);
    }
  }

  protected async send() {
    const blob = this.receipt();
    const a = this.amount();
    if (!blob || !a || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      await this.wallet.deposit(a, blob);
      if (this.preview()) URL.revokeObjectURL(this.preview()!);
      this.preview.set(null);
      this.receipt.set(null);
      this.recharging.set(false);
      this.notice.set(`Recarga de S/ ${a} enviada. Se suma a tu saldo cuando el organizador confirme el Plin.`);
      confetti({ count: 60 });
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.sending.set(false);
    }
  }

  protected async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text.replace(/\s/g, ''));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* sin portapapeles (http en la red local) */
    }
  }

  protected label(b: MyTicket['bets'][number]) {
    const m = this.markets().get(b.market_id);
    return this.labeler()(m?.target, betSelection(b), m?.type);
  }
  protected marketName(id: string) {
    return this.markets().get(id)?.name ?? 'Mercado';
  }
  protected when(iso: string) {
    return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
}
