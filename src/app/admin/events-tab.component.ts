import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, elapsedMinutes, EventRow, EventType, GAME_MODES, GameModeId, isPlayerEvent, PLAYER_EVENT_TYPES, PLAYER_EVENTS, PlayerEventType, PlayerRow } from '../core/models';
import { friendlyError } from '../core/public-api';
import { teamOrder, toTimelineEvents } from '../domain/adapt';
import { league, nextRotationMatchup } from '../domain/league';

type Action = 'goal' | 'own_goal' | PlayerEventType;

const ACTIONS: { id: Action; label: string; icon: string }[] = [
  { id: 'goal', label: 'Gol', icon: '⚽' },
  { id: 'own_goal', label: 'Autogol', icon: '🙈' },
  ...PLAYER_EVENT_TYPES.map((t) => ({ id: t, label: PLAYER_EVENTS[t].label, icon: PLAYER_EVENTS[t].icon })),
];

/** Registro de la liga: partido en juego, goles por equipo, tarjetas y show (palo, golazo, penal, blooper…). */
@Component({
  selector: 'app-events-tab',
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    @let lg = liga();
    @let cur = currentGame();

    <!-- Partido en juego -->
    <section class="card">
      <div class="flex items-center justify-between">
        <p class="label">{{ cur ? 'Partido actual · ' + cur.number + ' de ' + lg.games.length : 'Liga terminada' }}</p>
        @if (cur) {
          <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="cur.status === 'live' ? 'bg-red-100 text-red-700' : cur.status === 'played' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'">
            {{ cur.status === 'live' ? '● En vivo' : cur.status === 'played' ? 'Terminado' : 'Por empezar' }}
          </span>
        }
      </div>
      @if (cur) {
        <div class="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-center">
          <p class="truncate font-bold text-emerald-950">{{ teamName(cur.home) }}</p>
          <p class="font-mono text-3xl font-extrabold text-emerald-900">{{ cur.homeGoals }} - {{ cur.awayGoals }}</p>
          <p class="truncate font-bold text-emerald-950">{{ teamName(cur.away) }}</p>
        </div>
      }
      @if (cur && cur.status === 'pending') {
        <button type="button" class="btn-primary mt-2 h-14 w-full text-base" [disabled]="busy() || data().match.status === 'finished'" (click)="goLive()">
          ▶ Poner en vivo el partido {{ cur.number }}
        </button>
        <p class="mt-1 text-xs text-slate-500">Mientras ningún partido esté en vivo, la pestaña "En vivo" de los apostadores queda vacía.</p>
      } @else if (cur && cur.status === 'live') {
        <button type="button" class="mt-2 h-14 w-full rounded-2xl bg-slate-900 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50" [disabled]="busy()" (click)="endGame()">
          ⏹ Terminar partido {{ cur.number }}
        </button>
        <p class="mt-1 text-xs text-slate-500">Al terminar se cierran sus apuestas y queda listo el siguiente partido.</p>
      }
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button type="button" class="btn-secondary h-10 text-xs" [disabled]="busy() || data().match.current_game <= 1" (click)="setGame(data().match.current_game - 1)">◀ Volver al partido anterior</button>
        @if (cur?.status === 'live') {
          <button type="button" class="btn-secondary h-10 text-xs" [disabled]="busy()" (click)="pauseLive()">Quitar de en vivo</button>
        }
      </div>

      <!-- Rotación rey de la cancha: crear e iniciar el siguiente partido según quién ganó -->
      @if (teams().length >= 2 && data().match.status !== 'finished') {
        <div class="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-extrabold text-emerald-950 uppercase">Siguiente partido (rey de la cancha)</p>
            @if (suggested(); as sug) {
              <span class="text-[11px] font-semibold text-emerald-800">
                {{ sug.tied ? 'Empate: elige quién se queda' : 'Sugerido por ganador' }}
              </span>
            }
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            @for (m of modes; track m.id) {
              <button
                type="button"
                class="rounded-xl border px-2.5 py-1 text-xs font-bold transition"
                [class]="nextMode() === m.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-white text-emerald-950'"
                (click)="pickNextMode(m.id)"
              >
                {{ m.short }} · {{ m.id === 1 ? 'Chocolateados' : m.id === 2 ? 'Cumpleañero' : 'Draft 👑' }}
              </button>
            }
          </div>
          <div class="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <select class="input h-10 text-sm font-semibold" [(ngModel)]="nextHome" name="nextHome" aria-label="Equipo local del siguiente partido">
              @for (t of teams(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
            <span class="text-xs font-bold text-slate-400">vs</span>
            <select class="input h-10 text-sm font-semibold" [(ngModel)]="nextAway" name="nextAway" aria-label="Equipo visitante del siguiente partido">
              @for (t of teams(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button type="button" class="btn-secondary h-10 text-xs" [disabled]="busy() || !nextHome || !nextAway || nextHome === nextAway" (click)="createNextGame(false)">
              + Crear partido {{ lg.games.length + 1 }}
            </button>
            <button type="button" class="btn-primary h-10 text-xs" [disabled]="busy() || !nextHome || !nextAway || nextHome === nextAway" (click)="createNextGame(true)">
              ▶ Crear y poner en vivo
            </button>
          </div>
        </div>
      }

      <ul class="mt-3 divide-y divide-slate-100 text-sm">
        @for (g of lg.games; track g.number) {
          <li>
            <button type="button" class="flex w-full items-center gap-2 py-2 text-left" [class.font-bold]="g.number === data().match.current_game" (click)="setGame(g.number)">
              <span class="w-11 shrink-0 text-xs text-slate-400">{{ g.mode ? 'M' + g.mode + '·' : '' }}P{{ g.number }}</span>
              <span class="min-w-0 flex-1 truncate">{{ teamName(g.home) }} vs {{ teamName(g.away) }}</span>
              <span class="shrink-0 font-mono">{{ g.status === 'pending' ? '—' : g.homeGoals + ' - ' + g.awayGoals }}</span>
              <span class="w-16 shrink-0 text-right text-[11px]" [class]="g.status === 'live' ? 'text-emerald-700' : 'text-slate-400'">
                {{ g.status === 'live' ? '● en juego' : g.status === 'played' ? 'final' : 'pendiente' }}
              </span>
            </button>
          </li>
        }
      </ul>

      <table class="mt-3 w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500">
            <th class="py-1 font-medium">Tabla</th>
            <th class="py-1 text-center font-medium">PJ</th>
            <th class="py-1 text-center font-medium">DG</th>
            <th class="py-1 text-center font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          @for (r of lg.table; track r.teamId; let i = $index) {
            <tr class="border-t border-slate-100">
              <td class="py-1 font-semibold">{{ i + 1 }}. {{ teamName(r.teamId) }}</td>
              <td class="py-1 text-center">{{ r.played }}</td>
              <td class="py-1 text-center">{{ r.gd > 0 ? '+' + r.gd : r.gd }}</td>
              <td class="py-1 text-center font-bold">{{ r.points }}</td>
            </tr>
          }
        </tbody>
      </table>
      @if (lg.invalidEventIds.length) {
        <p class="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          ⚠️ Hay {{ lg.invalidEventIds.length }} gol(es) sin partido o con un equipo que no jugaba ese partido. Corrígelos abajo (en rojo).
        </p>
      }
    </section>

    <!-- Registro -->
    <section class="card mt-3">
      <div class="flex items-end gap-2">
        <label class="block flex-1">
          <span class="label">Minuto (desde que se cerraron las apuestas)</span>
          <div class="mt-1 flex items-center gap-1">
            <button type="button" class="btn-secondary h-11 w-11 text-lg" (click)="bump(-1)" aria-label="Restar un minuto">−</button>
            <input class="input text-center text-lg font-bold" type="number" inputmode="numeric" min="0" max="300" [(ngModel)]="minute" name="minute" />
            <button type="button" class="btn-secondary h-11 w-11 text-lg" (click)="bump(1)" aria-label="Sumar un minuto">+</button>
          </div>
        </label>
        <button type="button" class="btn-secondary h-11 shrink-0" (click)="refreshMinute()" title="Usar el tiempo transcurrido">⏱ Ahora</button>
      </div>

      <div class="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        @for (a of actions; track a.id) {
          <button
            type="button"
            class="flex h-16 flex-col items-center justify-center rounded-2xl border-2 text-[11px] leading-tight font-bold"
            [class]="action() === a.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700'"
            (click)="pick(a.id)"
          >
            <span class="text-xl">{{ a.icon }}</span>{{ a.label }}
          </button>
        }
      </div>

      @switch (action()) {
        @case ('goal') {
          <ng-container *ngTemplateOutlet="goalSteps" />
        }
        @case ('own_goal') {
          <ng-container *ngTemplateOutlet="goalSteps" />
        }
        @default {
          <p class="mt-3 text-sm text-slate-600">{{ askFor(action()) }} (partido {{ data().match.current_game }}, minuto {{ minute ?? 0 }}):</p>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (p of players(); track p.id) {
              <button type="button" class="chip" [disabled]="busy()" (click)="addPlayerEvent(p)">{{ p.name }}</button>
            }
          </div>
        }
      }

      <ng-template #goalSteps>
        <p class="mt-3 text-sm text-slate-600">1. ¿Para qué equipo cuenta el {{ action() === 'own_goal' ? 'autogol' : 'gol' }}? (partido {{ cur?.number }})</p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          @for (t of curTeams(); track t) {
            <button
              type="button"
              class="h-14 rounded-2xl border-2 font-bold"
              [class]="goalTeam() === t ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white'"
              (click)="goalTeam.set(t)"
            >
              Gol para {{ teamName(t) }}
            </button>
          }
        </div>
        @if (goalTeam()) {
          <p class="mt-3 text-sm text-slate-600">
            2. {{ action() === 'own_goal' ? '¿Quién la metió en su propio arco?' : '¿Quién metió el gol?' }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (p of players(); track p.id) {
              <button type="button" class="chip" [disabled]="busy()" (click)="addGoal(p)">{{ p.name }}</button>
            }
          </div>
        }
      </ng-template>

      @if (flash()) {
        <p class="mt-3 rounded-lg bg-emerald-50 p-2 text-center text-sm font-semibold text-emerald-800">{{ flash() }}</p>
      }
      @if (lastGoal(); as lg2) {
        <button type="button" class="btn-secondary mt-2 w-full bg-amber-50 text-amber-800" [disabled]="busy()" (click)="markGolazo(lg2)">
          ✨ ¿Fue golazo? Marcar golazo de {{ lg2.name }}
        </button>
      }
      @if (error()) {
        <p class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
      }
    </section>

    <!-- Lista -->
    <section class="card mt-4">
      <h2 class="font-bold">Eventos registrados <span class="text-sm font-normal text-slate-500">({{ data().events.length }})</span></h2>
      <ul class="mt-2 divide-y divide-slate-100">
        @for (e of sorted(); track e.id) {
          <li class="py-2" [class.bg-red-50]="isInvalid(e)">
            @if (editing() === e.id) {
              <div class="space-y-2">
                <div class="flex gap-2">
                  <select class="input" [(ngModel)]="edit.type" name="etype">
                    <option value="goal">⚽ Gol</option>
                    @for (t of playerEventTypes; track t) {
                      <option [value]="t">{{ playerEvents[t].icon }} {{ playerEvents[t].label }}</option>
                    }
                  </select>
                  <input class="input w-20 text-center" type="number" min="0" max="300" [(ngModel)]="edit.minute" name="emin" aria-label="Minuto" />
                </div>
                <select class="input" [(ngModel)]="edit.game" name="egame" aria-label="Partido">
                  @for (g of lg.games; track g.number) {
                    <option [ngValue]="g.number">Partido {{ g.number }}: {{ teamName(g.home) }} vs {{ teamName(g.away) }}</option>
                  }
                </select>
                <select class="input" [(ngModel)]="edit.player_id" name="eplayer" aria-label="Jugador">
                  @for (p of players(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
                @if (edit.type === 'goal') {
                  <div class="flex items-center gap-2">
                    <select class="input" [(ngModel)]="edit.team_id" name="eteam" aria-label="Equipo">
                      @for (t of teams(); track t.id) {
                        <option [value]="t.id">Para {{ t.name }}</option>
                      }
                    </select>
                    <label class="flex shrink-0 items-center gap-1.5 text-sm">
                      <input type="checkbox" class="h-5 w-5 accent-emerald-600" [(ngModel)]="edit.is_own_goal" name="eog" /> Autogol
                    </label>
                  </div>
                }
                <div class="flex gap-2">
                  <button type="button" class="btn-primary h-10 flex-1" (click)="saveEdit(e)">Guardar</button>
                  <button type="button" class="btn-secondary flex-1" (click)="editing.set(null)">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="flex items-center gap-2">
                <span class="w-9 shrink-0 font-mono text-sm text-slate-500">{{ e.minute }}'</span>
                <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{{ e.game ? 'P' + e.game : '—' }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">{{ describe(e) }}</span>
                  @if (isInvalid(e)) {
                    <span class="block text-xs font-semibold text-red-700">⚠️ Ese equipo no jugaba ese partido</span>
                  }
                </span>
                <button type="button" class="btn-secondary h-9" (click)="startEdit(e)" aria-label="Editar evento">✎</button>
                <button type="button" class="btn-danger h-9" (click)="remove(e)" aria-label="Borrar evento">🗑</button>
              </div>
            }
          </li>
        } @empty {
          <li class="py-4 text-center text-sm text-slate-500">Sin eventos todavía.</li>
        }
      </ul>
      <p class="mt-2 text-xs text-slate-400">Cada evento queda en el partido en juego. La tabla y la liquidación se recalculan solas.</p>
    </section>
  `,
})
export class EventsTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected actions = ACTIONS;
  protected modes = GAME_MODES;
  protected playerEvents = PLAYER_EVENTS;
  protected playerEventTypes = PLAYER_EVENT_TYPES;
  protected minute: number | null = null;
  protected action = signal<Action>('goal');
  protected goalTeam = signal<string | null>(null);
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected flash = signal<string | null>(null);
  protected editing = signal<string | null>(null);
  /** Último gol registrado desde aquí (para marcarlo como golazo con un toque). */
  protected lastGoal = signal<{ playerId: string; name: string; minute: number; game: number } | null>(null);
  protected edit = { type: 'goal' as EventType, minute: 0, game: 1, player_id: '', team_id: '', is_own_goal: false };
  protected nextMode = signal<GameModeId>(1);
  protected nextHome = '';
  protected nextAway = '';

  protected teams = computed(() => [...this.data().teams].sort((a, b) => a.sort_order - b.sort_order));
  protected players = computed(() => this.data().players.filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order));
  private playerMap = computed(() => new Map(this.data().players.map((p) => [p.id, p.name])));
  private teamMap = computed(() => new Map(this.data().teams.map((t) => [t.id, t.name])));
  protected sorted = computed(() => [...this.data().events].sort((a, b) => a.minute - b.minute || a.seq - b.seq));
  protected liga = computed(() =>
    league(
      toTimelineEvents(this.data().events),
      teamOrder(this.data().teams),
      this.data().match.current_game ?? 1,
      this.data().match.status === 'finished',
      !!this.data().match.game_live,
      this.data().match.games ?? null,
    ),
  );
  protected suggested = computed(() => nextRotationMatchup(this.liga().games, teamOrder(this.data().teams), this.nextMode()));
  protected currentGame = computed(() => this.liga().games.find((g) => g.number === (this.data().match.current_game ?? 1)) ?? null);
  protected curTeams = computed(() => {
    const g = this.currentGame();
    return g ? [g.home, g.away] : [];
  });
  private invalid = computed(() => new Set(this.liga().invalidEventIds));

  constructor() {
    // Minuto inicial = tiempo desde que se cerraron las apuestas.
    effect(() => {
      const closed = this.data().match.closed_at;
      untracked(() => {
        if (this.minute === null) this.minute = elapsedMinutes(closed);
      });
    });
    // Pre-sugiere el cruce siguiente según el ganador del último partido.
    effect(() => {
      const sug = this.suggested();
      untracked(() => {
        if (sug) {
          this.nextHome = sug.home;
          this.nextAway = sug.away;
        }
      });
    });
  }

  teamName(id: string | null | undefined) {
    return (id && this.teamMap().get(id)) || '¿?';
  }
  private playerName(id: string | null) {
    return (id && this.playerMap().get(id)) || '¿?';
  }
  protected isInvalid(e: EventRow) {
    return this.invalid().has(e.id);
  }

  describe(e: EventRow): string {
    if (e.type === 'goal') {
      return e.is_own_goal
        ? `🙈 Autogol de ${this.playerName(e.player_id)} (para ${this.teamName(e.team_id)})`
        : `⚽ ${this.playerName(e.player_id)} (para ${this.teamName(e.team_id)})`;
    }
    if (e.type === 'rotation') return `🔄 Rotación: sale ${this.teamName(e.team_out_id)}`;
    const meta = PLAYER_EVENTS[e.type];
    return `${meta.icon} ${meta.text(this.playerName(e.player_id))}`;
  }

  askFor(a: Action): string {
    return isPlayerEvent(a as EventType) ? PLAYER_EVENTS[a as PlayerEventType].ask : '';
  }

  pick(a: Action) {
    this.action.set(a);
    this.lastGoal.set(null);
    this.goalTeam.set(null);
    this.error.set(null);
  }

  bump(d: number) {
    this.minute = Math.max(0, Math.min(300, (this.minute ?? 0) + d));
  }

  refreshMinute() {
    this.minute = elapsedMinutes(this.data().match.closed_at);
  }

  async setGame(n: number) {
    if (n < 1 || n > this.liga().games.length + 1 || n === this.data().match.current_game) return;
    const g = this.liga().games.find((x) => x.number === n);
    await this.run(() => this.api.setCurrentGame(this.data().match.id, n, false), g ? `Partido ${n}: ${this.teamName(g.home)} vs ${this.teamName(g.away)}` : 'Liga terminada');
    this.goalTeam.set(null);
    this.lastGoal.set(null);
  }

  async goLive() {
    const g = this.currentGame();
    if (!g) return;
    await this.run(() => this.api.setGameLive(this.data().match.id, true), `● En vivo: ${this.teamName(g.home)} vs ${this.teamName(g.away)}`);
    this.refreshMinute();
  }

  async pauseLive() {
    await this.run(() => this.api.setGameLive(this.data().match.id, false), 'Partido quitado de en vivo');
  }

  async endGame() {
    const g = this.currentGame();
    if (!g) return;
    if (!confirm(`¿Terminar el partido ${g.number}? Queda ${this.teamName(g.home)} ${g.homeGoals} - ${g.awayGoals} ${this.teamName(g.away)}.`)) return;
    // current_game = siguiente; si era el último, queda "todos terminados" hasta que el admin cree el siguiente.
    await this.run(() => this.api.setCurrentGame(this.data().match.id, g.number + 1, false), `🏁 Terminó el partido ${g.number}`);
    this.goalTeam.set(null);
    this.lastGoal.set(null);
  }

  pickNextMode(m: GameModeId) {
    this.nextMode.set(m);
  }

  async createNextGame(goLive: boolean) {
    if (!this.nextHome || !this.nextAway || this.nextHome === this.nextAway) return;
    const mode = this.nextMode();
    const label = `M${mode} · ${this.teamName(this.nextHome)} vs ${this.teamName(this.nextAway)}`;
    await this.run(
      () => this.api.addGame(this.data().match.id, this.nextHome, this.nextAway, goLive, mode),
      goLive ? `▶ En vivo: ${label}` : `✓ Creado siguiente partido: ${label}`,
    );
    this.goalTeam.set(null);
    this.lastGoal.set(null);
    if (goLive) this.refreshMinute();
  }

  private validMinute(): number | null {
    const m = Math.round(this.minute ?? NaN);
    if (!Number.isFinite(m) || m < 0 || m > 300) {
      this.error.set('El minuto debe estar entre 0 y 300.');
      return null;
    }
    return m;
  }

  async addGoal(p: PlayerRow) {
    const team = this.goalTeam();
    const minute = this.validMinute();
    const game = this.data().match.current_game ?? 1;
    if (!team || minute === null) return;
    const own = this.action() === 'own_goal';
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type: 'goal', player_id: p.id, team_id: team, is_own_goal: own, team_out_id: null, minute, game }),
      `${own ? '🙈 Autogol de' : '⚽ Gol de'} ${p.name} para ${this.teamName(team)} (P${game}, ${minute}')`,
    );
    this.goalTeam.set(null);
    this.lastGoal.set(own ? null : { playerId: p.id, name: p.name, minute, game });
  }

  async markGolazo(g: { playerId: string; name: string; minute: number; game: number }) {
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type: 'golazo', player_id: g.playerId, team_id: null, is_own_goal: false, team_out_id: null, minute: g.minute, game: g.game }),
      `✨ Golazo de ${g.name} (${g.minute}')`,
    );
    this.lastGoal.set(null);
  }

  async addPlayerEvent(p: PlayerRow) {
    const minute = this.validMinute();
    const type = this.action() as PlayerEventType;
    const game = this.data().match.current_game ?? 1;
    if (minute === null || !isPlayerEvent(type)) return;
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type, player_id: p.id, team_id: null, is_own_goal: false, team_out_id: null, minute, game }),
      `${PLAYER_EVENTS[type].icon} ${PLAYER_EVENTS[type].text(p.name)} (P${game}, ${minute}')`,
    );
  }

  startEdit(e: EventRow) {
    this.edit = {
      type: e.type === 'rotation' ? 'goal' : e.type,
      minute: e.minute,
      game: e.game ?? this.data().match.current_game ?? 1,
      player_id: e.player_id ?? this.players()[0]?.id ?? '',
      team_id: e.team_id ?? this.teams()[0]?.id ?? '',
      is_own_goal: e.is_own_goal,
    };
    this.editing.set(e.id);
  }

  async saveEdit(e: EventRow) {
    const t = this.edit.type;
    const minute = Math.round(Number(this.edit.minute));
    if (!Number.isFinite(minute) || minute < 0 || minute > 300) return this.error.set('El minuto debe estar entre 0 y 300.');
    await this.run(() =>
      this.api.updateEvent(e.id, {
        type: t,
        minute,
        game: Number(this.edit.game),
        player_id: this.edit.player_id,
        team_id: t === 'goal' ? this.edit.team_id : null,
        is_own_goal: t === 'goal' ? this.edit.is_own_goal : false,
        team_out_id: null,
      }),
    );
    this.editing.set(null);
  }

  async remove(e: EventRow) {
    if (!confirm(`¿Borrar "${this.describe(e)}" (${e.minute}')?`)) return;
    await this.run(() => this.api.deleteEvent(e.id));
  }

  private async run(fn: () => Promise<unknown>, ok?: string) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      if (ok) {
        this.flash.set(ok);
        setTimeout(() => this.flash.set(null), 2500);
      }
      this.changed.emit();
    } catch (err) {
      this.error.set(friendlyError(err));
    } finally {
      this.busy.set(false);
    }
  }
}
