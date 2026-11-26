import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, PlayerRow } from '../core/models';
import { friendlyError } from '../core/public-api';

/** Lista única de jugadores (sin equipo): se pegan los nombres, uno por línea. */
@Component({
  selector: 'app-players-tab',
  imports: [FormsModule],
  template: `
    @if (error()) {
      <p class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
    }
    <section class="card">
      <label class="block">
        <span class="label">Agregar jugadores (uno por línea, puedes pegar la lista)</span>
        <textarea
          class="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          rows="5"
          [placeholder]="'Victor Manuel Espino\\nAdrian Ruiz\\nDiego Guevara'"
          [(ngModel)]="paste"
          name="paste"
        ></textarea>
      </label>
      <button type="button" class="btn-primary mt-2 h-11 w-full" [disabled]="busy() || !lines().length" (click)="add()">
        Agregar {{ lines().length || '' }} {{ lines().length === 1 ? 'jugador' : 'jugadores' }}
      </button>
    </section>

    <section class="card mt-4">
      <h2 class="font-bold">Jugadores <span class="text-sm font-normal text-slate-500">({{ list().length }})</span></h2>
      <ul class="mt-2 divide-y divide-slate-100">
        @for (p of list(); track p.id; let i = $index) {
          <li class="flex items-center gap-2 py-1.5">
            <span class="w-6 shrink-0 text-right text-xs text-slate-400">{{ i + 1 }}</span>
            @if (renaming() === p.id) {
              <input class="input h-9" [(ngModel)]="newName" name="rename" (keydown.enter)="saveRename(p)" />
              <button type="button" class="btn-primary h-9 px-3 text-sm" (click)="saveRename(p)">OK</button>
            } @else {
              <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
              <button type="button" class="btn-secondary h-8 px-2" (click)="startRename(p)" aria-label="Renombrar">✎</button>
              <button type="button" class="btn-danger h-8 px-2" (click)="remove(p)" aria-label="Quitar jugador">✕</button>
            }
          </li>
        } @empty {
          <li class="py-2 text-sm text-slate-500">Sin jugadores todavía.</li>
        }
      </ul>
    </section>
    <p class="mt-3 text-center text-xs text-slate-500">
      Los jugadores no tienen equipo: cada gol se registra para el equipo al que le cuenta. "Autogol" existe solo como opción de apuesta.
    </p>
  `,
})
export class PlayersTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected paste = '';
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected renaming = signal<string | null>(null);
  protected newName = '';

  protected list = computed(() => this.data().players.filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order));

  lines(): string[] {
    const existing = new Set(this.list().map((p) => p.name.toLowerCase()));
    const seen = new Set<string>();
    return this.paste
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(\d+[.)-]?\s*)?/, '').trim().replace(/\s+/g, ' ').slice(0, 60))
      .filter((l) => {
        const k = l.toLowerCase();
        if (!l || k === 'autogol' || existing.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  async add() {
    const names = this.lines();
    if (!names.length) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.addPlayers(this.data().match.id, names);
      this.paste = '';
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(false);
    }
  }

  startRename(p: PlayerRow) {
    this.newName = p.name;
    this.renaming.set(p.id);
  }

  async saveRename(p: PlayerRow) {
    const name = this.newName.trim();
    if (!name) return;
    try {
      await this.api.renamePlayer(p.id, name);
      this.renaming.set(null);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  async remove(p: PlayerRow) {
    const bets = this.data().tickets.reduce((n, t) => n + t.bets.filter((b) => b.player_id === p.id).length, 0);
    const events = this.data().events.filter((e) => e.player_id === p.id).length;
    const warn = bets || events ? `\n\nOJO: se borrarán también ${bets} apuesta(s) y ${events} evento(s) de este jugador.` : '';
    if (!confirm(`¿Quitar a ${p.name}?${warn}`)) return;
    try {
      await this.api.deletePlayer(p.id);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }
}
