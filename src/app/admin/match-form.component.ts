import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { MatchInput, MatchRow, randomCode } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { prepareReceipt } from '../core/receipt-image';

/** Crear o editar los datos de un partido (equipos, fecha, código, Yape, QR). */
@Component({
  selector: 'app-match-form',
  imports: [FormsModule],
  template: `
    <form class="space-y-3" (ngSubmit)="save()">
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="label">Local</span>
          <input class="input mt-1" name="home" required maxlength="60" [(ngModel)]="f.home_team" placeholder="Perú" />
        </label>
        <label class="block">
          <span class="label">Visitante</span>
          <input class="input mt-1" name="away" required maxlength="60" [(ngModel)]="f.away_team" placeholder="Brasil" />
        </label>
      </div>
      <label class="block">
        <span class="label">Fecha y hora</span>
        <input class="input mt-1" type="datetime-local" name="starts" [(ngModel)]="startsLocal" />
      </label>
      <label class="block">
        <span class="label">Código de acceso (va en el link)</span>
        <div class="mt-1 flex gap-2">
          <input
            class="input font-mono tracking-widest uppercase"
            name="code"
            required
            maxlength="20"
            pattern="[A-Za-z0-9]{4,20}"
            [(ngModel)]="f.access_code"
          />
          <button type="button" class="btn-secondary shrink-0" (click)="f.access_code = newCode()" aria-label="Generar código">🎲</button>
        </div>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="label">Número de Yape</span>
          <input class="input mt-1" name="yape" inputmode="tel" maxlength="20" [(ngModel)]="f.yape_number" placeholder="999 888 777" />
        </label>
        <label class="block">
          <span class="label">Titular del Yape</span>
          <input class="input mt-1" name="holder" maxlength="60" [(ngModel)]="f.yape_holder" placeholder="Tu nombre" />
        </label>
      </div>

      @if (match(); as m) {
        <div>
          <span class="label">QR de Yape</span>
          <div class="mt-1 flex items-center gap-3">
            @if (qrUrl()) {
              <img [src]="qrUrl()" alt="QR de Yape" class="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
            }
            <label class="btn-secondary cursor-pointer">
              {{ busyQr() ? 'Subiendo…' : qrUrl() ? 'Cambiar QR' : 'Subir QR' }}
              <input type="file" class="sr-only" accept="image/*,.heic,.heif" (change)="onQr($event)" />
            </label>
            @if (m.yape_qr_path) {
              <button type="button" class="btn-danger" (click)="removeQr()">Quitar</button>
            }
          </div>
        </div>
      } @else {
        <p class="text-xs text-slate-500">Podrás subir el QR de Yape después de crear el partido. Se crean solos el jugador "Autogol" y los mercados Primer gol, Último gol y Primera amarilla.</p>
      }

      @if (error()) {
        <p class="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{{ error() }}</p>
      }
      <div class="flex gap-2">
        <button class="btn-primary flex-1" [disabled]="busy()">{{ busy() ? 'Guardando…' : match() ? 'Guardar cambios' : 'Crear partido' }}</button>
        @if (cancellable()) {
          <button type="button" class="btn-secondary h-12" (click)="cancelled.emit()">Cancelar</button>
        }
      </div>
    </form>
  `,
})
export class MatchFormComponent {
  readonly match = input<MatchRow | null>(null);
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
        ? { id: m.id, home_team: m.home_team, away_team: m.away_team, starts_at: m.starts_at, access_code: m.access_code, yape_number: m.yape_number, yape_holder: m.yape_holder }
        : emptyMatch();
      this.startsLocal = toLocalInput(this.f.starts_at);
      this.qrUrl.set(this.publicApi.qrUrl(m?.yape_qr_path ?? null));
    });
  }

  async save() {
    this.error.set(null);
    if (!this.f.home_team?.trim() || !this.f.away_team?.trim()) return this.error.set('Escribe los dos equipos.');
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
    this.saved.emit({ ...m, yape_qr_path: null });
  }
}

function emptyMatch(): MatchInput {
  return { home_team: '', away_team: '', starts_at: null, access_code: randomCode(), yape_number: '', yape_holder: '' };
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
