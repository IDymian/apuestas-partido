import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, EventRow, minuteLabel, PlayerRow, teamName } from '../core/models';
import { friendlyError } from '../core/public-api';

type EvType = 'goal' | 'yellow';

/** Registro rápido: elige Gol/Amarilla y toca al jugador (dos toques). */
@Component({
  selector: 'app-events-tab',
  imports: [FormsModule],
  template: `
    <section class="card">
      <div class="flex items-end gap-2">
        <label class="block flex-1">
          <span class="label">Minuto</span>
          <div class="mt-1 flex items-center gap-1">
            <button type="button" class="btn-secondary h-11 w-11 text-lg" (click)="bump(-1)" aria-label="Restar un minuto">−</button>
            <input class="input text-center text-lg font-bold" type="number" inputmode="numeric" min="0" max="130" [(ngModel)]="minute" name="minute" />
            <button type="button" class="btn-secondary h-11 w-11 text-lg" (click)="bump(1)" aria-label="Sumar un minuto">+</button>
          </div>
        </label>
        <label class="block w-20">
          <span class="label">Añadido</span>
          <input class="input mt-1 text-center" type="number" inputmode="numeric" min="0" max="30" [(ngModel)]="stoppage" name="stoppage" placeholder="+0" />
        </label>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="h-14 rounded-2xl border-2 text-lg font-bold"
          [class]="type() === 'goal' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white'"
          (click)="type.set('goal')"
        >
          ⚽ Gol
        </button>
        <button
          type="button"
          class="h-14 rounded-2xl border-2 text-lg font-bold"
          [class]="type() === 'yellow' ? 'border-yellow-400 bg-yellow-300 text-slate-900' : 'border-slate-200 bg-white'"
          (click)="type.set('yellow')"
        >
          🟨 Amarilla
        </button>
      </div>

      <p class="mt-3 text-xs text-slate-500">Toca al jugador para registrar {{ type() === 'goal' ? 'el gol' : 'la amarilla' }} en el minuto {{ minuteText() }}:</p>
      @for (g of groups(); track g.label) {
        <p class="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ g.label }}</p>
        <div class="flex flex-wrap gap-2">
          @for (p of g.players; track p.id) {
            <button type="button" class="chip" [disabled]="busy()" (click)="add(p)">{{ p.name }}</button>
          }
        </div>
      }
      @if (flash()) {
        <p class="mt-3 rounded-lg bg-emerald-50 p-2 text-center text-sm font-semibold text-emerald-800">{{ flash() }}</p>
      }
      @if (error()) {
        <p class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
      }
    </section>

    <section class="card mt-4">
      <h2 class="font-bold">Eventos registrados</h2>
      <ul class="mt-2 divide-y divide-slate-100">
        @for (e of data().events; track e.id) {
          <li class="py-2">
            @if (editing() === e.id) {
              <div class="space-y-2">
                <div class="flex gap-2">
                  <select class="input" [(ngModel)]="edit.type" name="etype">
                    <option value="goal">⚽ Gol</option>
                    <option value="yellow">🟨 Amarilla</option>
                  </select>
                  <input class="input w-20 text-center" type="number" [(ngModel)]="edit.minute" name="emin" />
                  <input class="input w-16 text-center" type="number" [(ngModel)]="edit.stoppage" name="estop" placeholder="+0" />
                </div>
                <select class="input" [(ngModel)]="edit.player_id" name="eplayer">
                  @for (p of data().players; track p.id) {
                    <option [value]="p.id">{{ p.name }}{{ p.team ? ' (' + team(p) + ')' : '' }}</option>
                  }
                </select>
                <div class="flex gap-2">
                  <button type="button" class="btn-primary h-10 flex-1" (click)="saveEdit(e)">Guardar</button>
                  <button type="button" class="btn-secondary flex-1" (click)="editing.set(null)">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="flex items-center gap-2">
                <span class="w-12 shrink-0 font-mono text-sm text-slate-500">{{ label(e) }}</span>
                <span>{{ e.type === 'goal' ? '⚽' : '🟨' }}</span>
                <span class="min-w-0 flex-1 truncate font-semibold">{{ playerName(e.player_id) }}</span>
                <button type="button" class="btn-secondary h-9" (click)="startEdit(e)" aria-label="Editar evento">✎</button>
                <button type="button" class="btn-danger h-9" (click)="remove(e)" aria-label="Borrar evento">🗑</button>
              </div>
            }
          </li>
        } @empty {
          <li class="py-4 text-center text-sm text-slate-500">Sin eventos todavía.</li>
        }
      </ul>
      <p class="mt-2 text-xs text-slate-400">La liquidación se recalcula sola con cada cambio.</p>
    </section>
  `,
})
export class EventsTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected minute: number | null = null;
  protected stoppage: number | null = null;
  protected type = signal<EvType>('goal');
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected flash = signal<string | null>(null);
  protected editing = signal<string | null>(null);
  protected edit = { type: 'goal' as EvType, minute: 0, stoppage: 0, player_id: '' };

  private players = computed(() => new Map(this.data().players.map((p) => [p.id, p])));
  protected groups = computed(() => {
    const d = this.data();
    const list = [...d.players].sort((a, b) => a.sort_order - b.sort_order);
    const g = [
      { label: d.match.home_team, players: list.filter((p) => p.team === 'home') },
      { label: d.match.away_team, players: list.filter((p) => p.team === 'away') },
    ];
    if (this.type() === 'goal') g.push({ label: 'En contra', players: list.filter((p) => p.is_own_goal) });
    return g.filter((x) => x.players.length);
  });

  constructor() {
    // Arranca en el minuto del último evento registrado (o 0).
    effect(() => {
      const evs = this.data().events;
      untracked(() => {
        if (this.minute === null) this.minute = evs.length ? Math.max(...evs.map((e) => e.minute)) : 0;
      });
    });
  }

  minuteText() {
    const m = this.minute ?? 0;
    return this.stoppage ? `${m}+${this.stoppage}` : String(m);
  }
  bump(d: number) {
    this.minute = Math.max(0, Math.min(130, (this.minute ?? 0) + d));
  }
  label(e: EventRow) {
    return minuteLabel(e);
  }
  team(p: PlayerRow) {
    return teamName(this.data().match, p.team);
  }
  playerName(id: string) {
    const p = this.players().get(id);
    return p ? `${p.name}${p.team ? ' · ' + this.team(p) : ''}` : '¿?';
  }

  async add(p: PlayerRow) {
    const minute = Math.round(this.minute ?? NaN);
    if (!Number.isFinite(minute) || minute < 0 || minute > 130) {
      this.error.set('Escribe el minuto (0 a 130).');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.addEvent({
        match_id: this.data().match.id,
        type: this.type(),
        player_id: p.id,
        minute,
        stoppage: Math.max(0, Math.min(30, Math.round(this.stoppage ?? 0))),
      });
      this.flash.set(`${this.type() === 'goal' ? '⚽ Gol' : '🟨 Amarilla'} de ${p.name} (${this.minuteText()}') registrado`);
      setTimeout(() => this.flash.set(null), 2500);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(false);
    }
  }

  startEdit(e: EventRow) {
    this.edit = { type: e.type, minute: e.minute, stoppage: e.stoppage, player_id: e.player_id };
    this.editing.set(e.id);
  }

  async saveEdit(e: EventRow) {
    try {
      await this.api.updateEvent(e.id, {
        type: this.edit.type,
        minute: Math.round(Number(this.edit.minute)),
        stoppage: Math.round(Number(this.edit.stoppage) || 0),
        player_id: this.edit.player_id,
      });
      this.editing.set(null);
      this.changed.emit();
    } catch (err) {
      this.error.set(friendlyError(err));
    }
  }

  async remove(e: EventRow) {
    if (!confirm(`¿Borrar ${e.type === 'goal' ? 'el gol' : 'la amarilla'} de ${this.playerName(e.player_id)} (${minuteLabel(e)})?`)) return;
    try {
      await this.api.deleteEvent(e.id);
      this.changed.emit();
    } catch (err) {
      this.error.set(friendlyError(err));
    }
  }
}
