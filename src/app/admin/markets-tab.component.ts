import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, MarketRow } from '../core/models';
import { friendlyError } from '../core/public-api';

/** Activar/desactivar, ordenar, renombrar, tipo, arrastre y pozo inicial. */
@Component({
  selector: 'app-markets-tab',
  imports: [FormsModule],
  template: `
    @if (error()) {
      <p class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{{ error() }}</p>
    }
    <div class="space-y-3">
      @for (m of drafts(); track m.id; let i = $index; let last = $last) {
        <section class="card" [class.opacity-60]="!m.is_active">
          <div class="flex items-center gap-2">
            <div class="flex flex-col">
              <button type="button" class="px-1 text-slate-400 disabled:opacity-30" [disabled]="i === 0" (click)="move(i, -1)" aria-label="Subir">▲</button>
              <button type="button" class="px-1 text-slate-400 disabled:opacity-30" [disabled]="last" (click)="move(i, 1)" aria-label="Bajar">▼</button>
            </div>
            <input class="input font-bold" [(ngModel)]="m.name" [name]="'name' + m.id" maxlength="60" />
            <label class="flex shrink-0 items-center gap-1.5 text-sm">
              <input type="checkbox" class="h-5 w-5 accent-emerald-600" [(ngModel)]="m.is_active" [name]="'active' + m.id" />
              Activo
            </label>
          </div>

          <div class="mt-3 grid grid-cols-3 gap-2">
            <label class="col-span-2 block">
              <span class="label">Tipo</span>
              <select class="input mt-1" [(ngModel)]="m.type" [name]="'type' + m.id">
                @for (t of data().marketTypes; track t.type) {
                  <option [value]="t.type">{{ t.label }}</option>
                }
              </select>
            </label>
            @if (hasParam(m.type)) {
              <label class="block">
                <span class="label">N</span>
                <input class="input mt-1" type="number" min="1" max="200" inputmode="numeric" [(ngModel)]="m.param" [name]="'param' + m.id" />
              </label>
            } @else {
              <span></span>
            }
            <label class="col-span-3 block">
              <span class="label">Pozo inicial (S/)</span>
              <input class="input mt-1" type="number" min="0" step="0.01" inputmode="decimal" [(ngModel)]="m.initial_pot" [name]="'pot' + m.id" />
            </label>
          </div>
          <label class="mt-2 block">
            <span class="label">Si nadie acierta, el bote pasa a…</span>
            <select class="input mt-1" [(ngModel)]="m.rollover_to_market_id" [name]="'roll' + m.id">
              <option [ngValue]="null">Se lo queda el organizador</option>
              @for (o of drafts(); track o.id) {
                @if (o.id !== m.id) {
                  <option [ngValue]="o.id">{{ o.name }}</option>
                }
              }
            </select>
          </label>

          <div class="mt-3 flex gap-2">
            <button type="button" class="btn-primary h-10 flex-1" [disabled]="busy()" (click)="save(m)">Guardar</button>
            <button type="button" class="btn-danger" [disabled]="busy()" (click)="remove(m)">Borrar</button>
          </div>
        </section>
      }
    </div>

    <button type="button" class="btn-secondary mt-4 h-12 w-full" [disabled]="busy()" (click)="addMarket()">+ Agregar mercado</button>
    <p class="mt-3 text-xs text-slate-500">
      Si nadie acierta un mercado, su bote se lo queda el organizador (salvo que elijas pasarlo a otro mercado).
      "N" es la cantidad de goles (cuartete = 4, sextete = 6) o el número de gol (15, 28). Para un tipo nuevo hay que agregarlo en
      <code>market_types</code> y en la lógica de reparto (ver README).
    </p>
  `,
})
export class MarketsTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  /** Copias editables de los mercados. */
  protected drafts = signal<MarketRow[]>([]);
  private sorted = computed(() => [...this.data().markets].sort((a, b) => a.sort_order - b.sort_order));

  constructor() {
    effect(() => this.drafts.set(this.sorted().map((m) => ({ ...m }))));
  }

  protected hasParam(type: string) {
    return this.data().marketTypes.find((t) => t.type === type)?.has_param ?? false;
  }

  async save(m: MarketRow) {
    if (!m.name.trim()) return this.error.set('El mercado necesita un nombre.');
    const pot = Number(m.initial_pot);
    if (!Number.isFinite(pot) || pot < 0) return this.error.set('El pozo inicial no puede ser negativo.');
    const param = this.hasParam(m.type) ? Math.round(Number(m.param)) : null;
    if (param !== null && !(param >= 1 && param <= 200)) return this.error.set('N debe estar entre 1 y 200.');
    await this.run(() =>
      this.api.saveMarket({
        id: m.id,
        match_id: m.match_id,
        name: m.name.trim(),
        type: m.type,
        param,
        is_active: m.is_active,
        rollover_to_market_id: m.rollover_to_market_id,
        initial_pot: Math.round(pot * 100) / 100,
      }),
    );
  }

  async move(i: number, dir: -1 | 1) {
    const list = this.drafts();
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    await this.run(async () => {
      // Reasigna órdenes consecutivos para evitar empates.
      const reordered = [...list];
      reordered[i] = b;
      reordered[i + dir] = a;
      await Promise.all(
        reordered.map((m, idx) =>
          m.sort_order === idx + 1 ? null : this.api.saveMarket({ id: m.id, match_id: m.match_id, sort_order: idx + 1 }),
        ),
      );
    });
  }

  async addMarket() {
    const d = this.data();
    await this.run(() =>
      this.api.saveMarket({
        match_id: d.match.id,
        name: 'Nuevo mercado',
        type: d.marketTypes[0]?.type ?? 'first_goal',
        sort_order: (this.drafts().at(-1)?.sort_order ?? 0) + 1,
        is_active: false,
        rollover_to_market_id: null,
        param: null,
        initial_pot: 0,
      }),
    );
  }

  async remove(m: MarketRow) {
    const bets = this.data().tickets.reduce((n, t) => n + t.bets.filter((b) => b.market_id === m.id).length, 0);
    const warn = bets ? `\n\nOJO: se borrarán ${bets} apuesta(s) de este mercado. Si solo quieres ocultarlo, desmarca "Activo".` : '';
    if (!confirm(`¿Borrar el mercado "${m.name}"?${warn}`)) return;
    await this.run(() => this.api.deleteMarket(m.id));
  }

  private async run(fn: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
