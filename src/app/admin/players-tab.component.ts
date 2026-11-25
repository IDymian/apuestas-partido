import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, PlayerRow, Team } from '../core/models';
import { friendlyError } from '../core/public-api';

@Component({
  selector: 'app-players-tab',
  imports: [FormsModule],
  template: `
    @if (error()) {
      <p class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
    }
    @for (t of teams(); track t.team) {
      <section class="card mb-4">
        <h2 class="font-bold">{{ t.label }} <span class="text-sm font-normal text-slate-500">({{ t.players.length }})</span></h2>

        <ul class="mt-2 divide-y divide-slate-100">
          @for (p of t.players; track p.id) {
            <li class="flex items-center gap-2 py-1.5">
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

        <label class="mt-3 block">
          <span class="label">Agregar jugadores (uno por línea, puedes pegar la lista)</span>
          <textarea
            class="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            rows="4"
            [placeholder]="'Gallese\\nAdvíncula\\nZambrano'"
            [(ngModel)]="paste[t.team]"
            [name]="'paste-' + t.team"
          ></textarea>
        </label>
        <button type="button" class="btn-primary mt-2 h-11 w-full" [disabled]="busy() || !lines(t.team).length" (click)="add(t.team)">
          Agregar {{ lines(t.team).length || '' }} {{ lines(t.team).length === 1 ? 'jugador' : 'jugadores' }}
        </button>
      </section>
    }
    <p class="text-center text-xs text-slate-500">"Autogol" se crea solo y siempre aparece en los mercados de goles.</p>
  `,
})
export class PlayersTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected paste: Record<Team, string> = { home: '', away: '' };
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected renaming = signal<string | null>(null);
  protected newName = '';

  protected teams = computed(() => {
    const d = this.data();
    const list = [...d.players].filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order);
    return (['home', 'away'] as Team[]).map((team) => ({
      team,
      label: team === 'home' ? d.match.home_team : d.match.away_team,
      players: list.filter((p) => p.team === team),
    }));
  });

  lines(team: Team): string[] {
    const existing = new Set(this.data().players.filter((p) => p.team === team).map((p) => p.name.toLowerCase()));
    const seen = new Set<string>();
    return this.paste[team]
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(\d+[.)-]?\s*)?/, '').trim().replace(/\s+/g, ' ').slice(0, 60))
      .filter((l) => {
        const k = l.toLowerCase();
        if (!l || existing.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  async add(team: Team) {
    const names = this.lines(team);
    if (!names.length) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.addPlayers(this.data().match.id, team, names);
      this.paste[team] = '';
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
