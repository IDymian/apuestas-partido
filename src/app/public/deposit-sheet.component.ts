import { Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { DEFAULT_PAY_QR, DEPOSIT_AMOUNTS, MAX_DEPOSIT, TicketStatus } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { WalletService } from '../core/wallet';
import { prepareReceipt } from '../core/receipt-image';
import { formatSoles } from '../domain/settlement';
import { MatchContext } from './match-context';
import { IconComponent, IconName } from '../ui/icon.component';
import { confetti } from '../ui/confetti';
import { sound } from '../ui/sound';

const DEPOSIT_STATUS: Record<TicketStatus, { label: string; icon: IconName; tone: string }> = {
  pending: { label: 'Por confirmar', icon: 'clock', tone: 'bg-gold/15 text-gold' },
  approved: { label: 'Acreditada', icon: 'check', tone: 'bg-lime/15 text-lime' },
  rejected: { label: 'Rechazada', icon: 'x', tone: 'bg-candy/15 text-candy' },
};

/** Depositar saldo por Plin (hoja propia, se abre con "Depositar"). */
@Component({
  selector: 'app-deposit-sheet',
  imports: [IconComponent],
  template: `
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 backdrop-blur-sm anim-backdrop md:items-center md:p-6" (click)="closed.emit()">
      <div
        class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-night shadow-2xl anim-sheet md:max-w-xl md:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        aria-label="Depositar por Plin"
        (click)="$event.stopPropagation()"
      >
        <div class="flex shrink-0 items-center justify-between border-b border-ink/[0.06] bg-white px-5 pt-2.5 pb-3">
          <div>
            <div class="mx-auto mb-2 h-1.5 w-12 rounded-full bg-ink/15 md:hidden"></div>
            <h2 class="font-display text-2xl font-extrabold">Depositar por Plin</h2>
            <p class="text-xs text-mute">Saldo actual: <b class="text-ink">{{ balance() }}</b></p>
          </div>
          <button type="button" class="grid h-10 w-10 place-items-center rounded-xl bg-ink/[0.05]" (click)="closed.emit()" aria-label="Cerrar">
            <app-icon name="x" [size]="18" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          @if (done()) {
            <section class="py-6 text-center anim-pop">
              <div class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime text-white"><app-icon name="check" [size]="30" [stroke]="3" /></div>
              <p class="mt-3 font-display text-2xl font-extrabold">¡Depósito enviado!</p>
              <p class="mt-1 text-sm text-mute">S/ {{ done() }} se suman a tu saldo cuando el organizador confirme el Plin. Te avisamos con un sonido.</p>
              <button type="button" class="btn mt-5 w-full" (click)="closed.emit()">Listo</button>
            </section>
          } @else {
            <p class="field-label">1. ¿Cuánto depositas?</p>
            <div class="grid grid-cols-4 gap-2">
              @for (a of amounts; track a) {
                <button type="button" class="h-12 rounded-2xl border-2 font-display text-lg font-extrabold transition active:scale-95" [class]="amount() === a ? 'border-lime bg-lime text-white' : 'border-ink/10 bg-white'" (click)="amount.set(a)">
                  {{ a }}
                </button>
              }
            </div>
            <label class="mt-2 flex items-center gap-2">
              <span class="text-sm font-semibold text-mute">Otro monto: S/</span>
              <input class="field h-11 w-28 text-center font-bold" type="number" inputmode="numeric" min="1" [max]="maxDeposit" aria-label="Otro monto" [value]="amount() ?? ''" (input)="setCustom($event)" />
            </label>

            <p class="field-label mt-5">2. Plinea S/ {{ amount() ?? '…' }} a este QR</p>
            <div class="rounded-3xl border border-ink/[0.07] bg-white p-4 text-center">
              @if (!qrFailed()) {
                <img [src]="qr()" alt="QR de Plin para depositar" class="mx-auto w-56 max-w-full rounded-2xl bg-white p-2 shadow" (error)="qrFailed.set(true)" />
              } @else {
                <p class="rounded-2xl bg-gold/10 p-3 text-sm text-gold">El organizador aún no subió el QR. Usa el número.</p>
              }
              <p class="mt-2 text-sm font-bold">{{ ctx.data()?.match?.pay_holder || 'Organizador' }}</p>
              @if (ctx.data()?.match?.pay_number; as num) {
                <button type="button" class="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-night-3 px-3 text-sm font-bold active:scale-95" (click)="copy(num)">
                  <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16" /> {{ num }} {{ copied() ? '· copiado' : '' }}
                </button>
              }
            </div>

            <p class="field-label mt-5">3. Sube la captura del Plin</p>
            <label class="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-white p-4 text-center transition" [class]="preview() ? 'border-lime/60' : 'border-ink/15 hover:border-ink/30'">
              @if (preparing()) {
                <span class="text-sm text-mute">Procesando imagen…</span>
              } @else if (preview()) {
                <img [src]="preview()" alt="Tu captura" class="max-h-60 rounded-2xl anim-pop" />
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
            <p class="mt-2 text-center text-xs text-faint">Se juega solo con lo que depositas: el organizador confirma tu Plin y recién ahí se suma a tu saldo.</p>
          }

          @if (wallet.deposits().length) {
            <h3 class="mt-6 font-display text-lg font-extrabold">Mis depósitos</h3>
            <ul class="mt-1 divide-y divide-ink/[0.06]">
              @for (d of wallet.deposits(); track d.id) {
                @let st = status[d.status];
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
          }
        </div>
      </div>
    </div>
  `,
})
export class DepositSheetComponent {
  /** Monto sugerido (lo que falta para el cupón). */
  readonly suggest = input<number | null>(null);
  readonly closed = output<void>();

  private api = inject(PublicApi);
  protected readonly ctx = inject(MatchContext);
  protected readonly wallet = inject(WalletService);
  protected readonly status = DEPOSIT_STATUS;
  protected readonly amounts = DEPOSIT_AMOUNTS;
  protected readonly maxDeposit = MAX_DEPOSIT;

  protected readonly amount = signal<number | null>(20);
  protected readonly receipt = signal<Blob | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly preparing = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly qrFailed = signal(false);
  protected readonly done = signal<number | null>(null);

  protected readonly qr = computed(() => this.api.qrUrl(this.ctx.data()?.match.pay_qr_path ?? null) ?? DEFAULT_PAY_QR);
  protected readonly balance = computed(() => (this.wallet.balance() === null ? '…' : formatSoles(Math.round((this.wallet.balance() ?? 0) * 100))));
  protected readonly canSend = computed(() => {
    const a = this.amount();
    return !!this.receipt() && !this.preparing() && a !== null && Number.isInteger(a) && a >= 1 && a <= MAX_DEPOSIT;
  });

  ngOnInit() {
    const s = this.suggest();
    if (s) this.amount.set(Math.min(MAX_DEPOSIT, Math.max(1, Math.ceil(s))));
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
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
      this.done.set(a);
      sound.message();
      confetti({ count: 60 });
    } catch (e) {
      this.error.set(friendlyError(e));
      sound.error();
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

  protected when(iso: string) {
    return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
}
