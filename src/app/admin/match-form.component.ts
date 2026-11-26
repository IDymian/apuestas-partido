import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { MatchInput, MatchRow, randomCode } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { prepareReceipt } from '../core/receipt-image';

/** Crear o editar los datos de una jornada (título, fecha, código, Plin, QR). */
@Component({
  selector: 'app-match-form',
  imports: [FormsModule],
  template: `
    <form class="space-y-3" (ngSubmit)="save()">
      <label class="block">
        <span class="label">Nombre de la jornada</span>
        <input class="input mt-1" name="title" required maxlength="80" [(ngModel)]="f.title" placeholder="Álvaro Fest, Pichanga del jueves…" />
      </label>
      <label class="block">
        <span class="label">Fecha y hora</span>
        <input class="input mt-1" type="datetime-local" name="starts" [(ngModel)]="startsLocal" />
      </label>
      <label class="block">
        <span class="label">Código de acceso (va en el link)</span>
        <div class="mt-1 flex gap-2">
          <input class="input font-mono tracking-widest uppercase" name="code" required maxlength="20" [(ngModel)]="f.access_code" />
          <button type="button" class="btn-secondary shrink-0" (click)="f.access_code = newCode()" aria-label="Generar código">🎲</button>
        </div>
      </label>

      <fieldset class="rounded-xl border border-slate-200 p-3">
        <legend class="px-1 text-xs font-semibold text-slate-600">Dónde depositan</legend>
        <div class="grid grid-cols-3 gap-2">
          <label class="block">
            <span class="label">App</span>
            <input class="input mt-1" name="method" maxlength="20" [(ngModel)]="f.pay_method" placeholder="Plin" />
          </label>
          <label class="col-span-2 block">
            <span class="label">Número</span>
            <input class="input mt-1" name="number" inputmode="tel" maxlength="20" [(ngModel)]="f.pay_number" placeholder="999 888 777" />
          </label>
        </div>
        <label class="mt-2 block">
          <span class="label">Titular</span>
          <input class="input mt-1" name="holder" maxlength="60" [(ngModel)]="f.pay_holder" placeholder="Tu nombre" />
        </label>
        <p class="mt-2 text-xs text-slate-500">Solo lo ve quien tiene el link de la jornada.</p>
      </fieldset>

      @if (match(); as m) {
        <div>
          <span class="label">QR de {{ f.pay_method || 'Plin' }}</span>
          <div class="mt-1 flex items-center gap-3">
            @if (qrUrl()) {
              <img [src]="qrUrl()" alt="QR de pago" class="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
            }
            <label class="btn-secondary cursor-pointer">
              {{ busyQr() ? 'Subiendo…' : qrUrl() ? 'Cambiar QR' : 'Subir QR' }}
              <input type="file" class="sr-only" accept="image/*,.heic,.heif" (change)="onQr($event)" />
            </label>
            @if (m.pay_qr_path) {
              <button type="button" class="btn-danger" (click)="removeQr()">Quitar</button>
            }
          </div>
        </div>
      } @else {
        <p class="text-xs text-slate-500">
          Se crean solos los equipos A, B y C, la opción "Autogol" y los 15 mercados. El QR lo subes después de crearla.
        </p>
      }

      @if (error()) {
        <p class="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{{ error() }}</p>
      }
      <div class="flex gap-2">
        <button class="btn-primary flex-1" [disabled]="busy()">{{ busy() ? 'Guardando…' : match() ? 'Guardar cambios' : 'Crear jornada' }}</button>
        @if (cancellable()) {
          <button type="button" class="btn-secondary h-12" (click)="cancelled.emit()">Cancelar</button>
        }
      </div>
    </form>
  `,
})
export class MatchFormComponent {
  readonly match = input<MatchRow | null>(null);
  /** Para una jornada nueva: datos de pago de la jornada anterior. */
  readonly defaults = input<Partial<MatchInput> | null>(null);
  readonly cancellable = input(false);
  readonly saved = output<MatchRow>();
  readonly cancelled = output<void>();

  private api = inject(AdminApi);
  private publicApi = inject(PublicApi);
  protected f: MatchInput = emptyMatch();
  protected startsLocal = '';
  protected busy = signal(false);
  protected busyQr = signal(false);
  protected error = signal<string | null>(null);
  protected qrUrl = signal<string | null>(null);
  protected newCode = () => randomCode();

  constructor() {
    effect(() => {
      const m = this.match();
      this.f = m
        ? { id: m.id, title: m.title, starts_at: m.starts_at, access_code: m.access_code, pay_method: m.pay_method, pay_number: m.pay_number, pay_holder: m.pay_holder }
        : { ...emptyMatch(), ...(this.defaults() ?? {}) };
      this.startsLocal = toLocalInput(this.f.starts_at);
      this.qrUrl.set(this.publicApi.qrUrl(m?.pay_qr_path ?? null));
    });
  }

  async save() {
    this.error.set(null);
    if (!this.f.title?.trim()) return this.error.set('Ponle un nombre a la jornada.');
    if (!/^[A-Za-z0-9]{4,20}$/.test(this.f.access_code ?? '')) return this.error.set('El código debe tener de 4 a 20 letras o números, sin espacios.');
    this.busy.set(true);
    try {
      const row = await this.api.saveMatch({ ...this.f, starts_at: fromLocalInput(this.startsLocal) });
      this.saved.emit(row);
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(false);
    }
  }

  async onQr(ev: Event) {
    const el = ev.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    const m = this.match();
    if (!file || !m) return;
    this.busyQr.set(true);
    this.error.set(null);
    try {
      const blob = await prepareReceipt(file);
      await this.api.uploadQr(m.id, blob);
      this.qrUrl.set(URL.createObjectURL(blob));
      this.saved.emit({ ...m });
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busyQr.set(false);
    }
  }

  async removeQr() {
    const m = this.match();
    if (!m) return;
    await this.api.removeQr(m.id);
    this.qrUrl.set(null);
    this.saved.emit({ ...m, pay_qr_path: null });
  }
}

function emptyMatch(): MatchInput {
  return { title: '', starts_at: null, access_code: randomCode(), pay_method: 'Plin', pay_number: '', pay_holder: '' };
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}
