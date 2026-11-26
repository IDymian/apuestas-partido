import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, BetRow, betSelection, TICKET_STATUS_LABEL, TicketRow, TicketStatus } from '../core/models';
import { makeSelectionLabel } from '../domain/adapt';
import { friendlyError } from '../core/public-api';
import { formatSoles } from '../domain/settlement';

type Filter = TicketStatus | 'all';

@Component({
  selector: 'app-tickets-tab',
  template: `
    <div class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      @for (f of filters; track f.id) {
        <button type="button" class="chip shrink-0" [class.chip-on]="filter() === f.id" (click)="filter.set(f.id)">
          {{ f.label }} <span class="ml-1 opacity-70">{{ count(f.id) }}</span>
        </button>
      }
    </div>

    @if (error()) {
      <p class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
    }

    <ul class="mt-3 space-y-3">
      @for (t of visible(); track t.id) {
        <li class="card">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-lg font-bold text-slate-900">{{ t.bettor_name }}</p>
              <p class="text-xs text-slate-500">{{ time(t.created_at) }}</p>
            </div>
            <div class="text-right">
              <p class="text-xl font-extrabold">{{ soles(t.total * 100) }}</p>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" [class]="badge(t.status)">{{ statusLabel[t.status] }}</span>
            </div>
          </div>

          <ul class="mt-2 space-y-0.5 text-sm">
            @for (b of t.bets; track b.id) {
              <li class="flex justify-between gap-2">
                <span class="min-w-0 truncate"><b>{{ choice(b) }}</b> · <span class="text-slate-500">{{ market(b.market_id) }}</span></span>
                <span class="shrink-0 font-semibold">S/ {{ b.amount }}</span>
              </li>
            }
          </ul>

          @if (t.receipt_path) {
            @if (urls()[t.id]; as url) {
              <button type="button" class="mt-3 block w-full" (click)="zoom.set(url)" aria-label="Ver captura en grande">
                <img [src]="url" alt="Captura del pago" class="max-h-96 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" loading="lazy" />
              </button>
            } @else {
              <p class="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Cargando captura…</p>
            }
          } @else {
            <p class="mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">Sin captura (dato de prueba)</p>
          }

          @if (t.status === 'rejected' && t.reject_reason) {
            <p class="mt-2 text-sm text-red-700">Motivo: {{ t.reject_reason }}</p>
          }

          <div class="mt-3 flex gap-2">
            @if (t.status === 'pending') {
              <button type="button" class="btn-primary h-12 flex-1" [disabled]="busy() === t.id" (click)="set(t, 'approved')">✓ Aprobar</button>
              <button type="button" class="btn-danger h-12 flex-1" [disabled]="busy() === t.id" (click)="reject(t)">✕ Rechazar</button>
            } @else {
              <button type="button" class="btn-secondary flex-1" [disabled]="busy() === t.id" (click)="set(t, 'pending')">Volver a pendiente</button>
            }
          </div>
        </li>
      } @empty {
        <li class="py-10 text-center text-slate-500">{{ emptyText() }}</li>
      }
    </ul>

    @if (zoom()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2" (click)="zoom.set(null)">
        <img [src]="zoom()" alt="Captura del pago" class="max-h-full max-w-full object-contain" />
        <button type="button" class="absolute top-4 right-4 rounded-full bg-white/20 px-3 py-1 text-white">Cerrar ✕</button>
      </div>
    }
  `,
})
export class TicketsTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();

  private api = inject(AdminApi);
  protected soles = formatSoles;
  protected statusLabel = TICKET_STATUS_LABEL;
  protected filter = signal<Filter>('pending');
  protected busy = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected zoom = signal<string | null>(null);
  protected urls = signal<Record<string, string>>({});
  private requested = new Set<string>();
  protected filters: { id: Filter; label: string }[] = [
    { id: 'pending', label: 'Pendientes' },
    { id: 'approved', label: 'Aprobados' },
    { id: 'rejected', label: 'Rechazados' },
    { id: 'all', label: 'Todos' },
  ];

  private labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams));
  private marketTarget = computed(() => new Map(this.data().markets.map((m) => [m.id, this.data().marketTypes.find((t) => t.type === m.type)])));
  private markets = computed(() => new Map(this.data().markets.map((m) => [m.id, m.name])));
  protected visible = computed(() => {
    const f = this.filter();
    const list = this.data().tickets.filter((t) => f === 'all' || t.status === f);
    // Pendientes: el más antiguo primero. Resto: el más reciente primero.
    return f === 'pending' ? list : [...list].reverse();
  });

  constructor() {
    // Pide URLs firmadas de las capturas visibles que aún no tenemos.
    effect(() => {
      for (const t of this.visible()) {
        if (t.receipt_path && !this.requested.has(t.id)) {
          this.requested.add(t.id);
          this.api.receiptUrl(t.receipt_path).then((url) => {
            if (url) this.urls.update((u) => ({ ...u, [t.id]: url }));
          });
        }
      }
    });
  }

  emptyText() {
    const f = this.filter();
    return f === 'all' ? 'No hay tickets todavía.' : `No hay tickets ${this.statusLabel[f].toLowerCase()}s.`;
  }

  count(f: Filter) {
    return this.data().tickets.filter((t) => f === 'all' || t.status === f).length;
  }
  choice(b: BetRow) {
    const t = this.marketTarget().get(b.market_id);
    return this.labeler()(t?.target, betSelection(b), t?.type);
  }
  market(id: string) {
    return this.markets().get(id) ?? '¿?';
  }
  time(iso: string) {
    return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
  badge(s: TicketStatus) {
    return s === 'pending' ? 'bg-amber-100 text-amber-800' : s === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
  }

  reject(t: TicketRow) {
    const reason = prompt(`Rechazar el ticket de ${t.bettor_name}.\nMotivo (opcional):`, '');
    if (reason === null) return;
    this.set(t, 'rejected', reason);
  }

  async set(t: TicketRow, status: TicketStatus, reason?: string) {
    this.busy.set(t.id);
    this.error.set(null);
    try {
      await this.api.setTicketStatus(t.id, status, reason);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(null);
    }
  }
}
