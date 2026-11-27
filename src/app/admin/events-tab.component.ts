import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, elapsedMinutes, EventRow, EventType, isPlayerEvent, PLAYER_EVENT_TYPES, PLAYER_EVENTS, PlayerEventType, PlayerRow } from '../core/models';
import { friendlyError } from '../core/public-api';
import { teamOrder, toTimelineEvents } from '../domain/adapt';
import { courtTimeline } from '../domain/timeline';

type Action = 'goal' | 'own_goal' | 'rotation' | PlayerEventType;

const ACTIONS: { id: Action; label: string; icon: string }[] = [
  { id: 'goal', label: 'Gol', icon: '⚽' },
  { id: 'own_goal', label: 'Autogol', icon: '🙈' },
  ...PLAYER_EVENT_TYPES.map((t) => ({ id: t, label: PLAYER_EVENTS[t].label, icon: PLAYER_EVENTS[t].icon })),
  { id: 'rotation', label: 'Rotación', icon: '🔄' },
];

/** Registro rápido de la jornada: cancha, goles por equipo, tarjetas, show (palo, golazo, penal, blooper…) y rotaciones. */
@Component({
  selector: 'app-events-tab',
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    <!-- Cancha -->
    <section class="card">
      @if (data().events.length === 0) {
        <p class="label">¿Quiénes arrancan en cancha?</p>
        <div class="mt-2 flex flex-wrap gap-2">
          @for (t of teams(); track t.id) {
            <button type="button" class="chip" [class.chip-on]="starting().includes(t.id)" (click)="toggleStarting(t.id)">{{ t.name }}</button>
          }
        </div>
        <p class="mt-1 text-xs text-slate-500">Toca dos equipos. Se puede cambiar hasta el primer evento.</p>
      }
      <div class="mt-2 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3">
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">En cancha</p>
          <p class="truncate font-bold text-emerald-950">{{ teamName(court().onCourt[0]) }} vs {{ teamName(court().onCourt[1]) }}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Espera</p>
          <p class="font-semibold text-slate-700">{{ waitingNames() }}</p>
        </div>
      </div>
      @if (court().invalidEventIds.length) {
        <p class="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          ⚠️ Hay {{ court().invalidEventIds.length }} evento(s) con un equipo que no estaba en cancha. Corrígelos abajo (en rojo).
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
        @case ('rotation') {
          <p class="mt-3 text-sm text-slate-600">¿Qué equipo sale sin gol? (no cuenta como partidito ganado ni como salida)</p>
          <div class="mt-2 grid grid-cols-2 gap-2">
            @for (t of court().onCourt; track t) {
              <button type="button" class="h-14 rounded-2xl bg-slate-800 font-bold text-white disabled:opacity-50" [disabled]="busy()" (click)="addRotation(t)">
                Sale {{ teamName(t) }}
              </button>
            }
          </div>
        }
        @case ('goal') {
          <ng-container *ngTemplateOutlet="goalSteps" />
        }
        @case ('own_goal') {
          <ng-container *ngTemplateOutlet="goalSteps" />
        }
        @default {
          <p class="mt-3 text-sm text-slate-600">{{ askFor(action()) }} (minuto {{ minute ?? 0 }}):</p>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (p of players(); track p.id) {
              <button type="button" class="chip" [disabled]="busy()" (click)="addPlayerEvent(p)">{{ p.name }}</button>
            }
          </div>
        }
      }

      <ng-template #goalSteps>
        <p class="mt-3 text-sm text-slate-600">1. ¿Para qué equipo cuenta el {{ action() === 'own_goal' ? 'autogol' : 'gol' }}?</p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          @for (t of court().onCourt; track t) {
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
      @if (lastGoal(); as lg) {
        <button type="button" class="btn-secondary mt-2 w-full bg-amber-50 text-amber-800" [disabled]="busy()" (click)="markGolazo(lg)">
          ✨ ¿Fue golazo? Marcar golazo de {{ lg.name }}
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
                    <option value="rotation">🔄 Rotación</option>
                  </select>
                  <input class="input w-24 text-center" type="number" min="0" max="300" [(ngModel)]="edit.minute" name="emin" />
                </div>
                @if (edit.type === 'rotation') {
                  <select class="input" [(ngModel)]="edit.team_out_id" name="eout">
                    @for (t of teams(); track t.id) {
                      <option [value]="t.id">Sale {{ t.name }}</option>
                    }
                  </select>
                } @else {
                  <select class="input" [(ngModel)]="edit.player_id" name="eplayer">
                    @for (p of players(); track p.id) {
                      <option [value]="p.id">{{ p.name }}</option>
                    }
                  </select>
                }
                @if (edit.type === 'goal') {
                  <div class="flex items-center gap-2">
                    <select class="input" [(ngModel)]="edit.team_id" name="eteam">
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
                <span class="w-10 shrink-0 font-mono text-sm text-slate-500">{{ e.minute }}'</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">{{ describe(e) }}</span>
                  @if (gameNote(e); as note) {
                    <span class="block truncate text-xs text-slate-500">{{ note }}</span>
                  }
                  @if (isInvalid(e)) {
                    <span class="block text-xs font-semibold text-red-700">⚠️ Ese equipo no estaba en cancha</span>
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
      <p class="mt-2 text-xs text-slate-400">Orden: por minuto y, si empatan, por orden de registro. La liquidación se recalcula sola.</p>
    </section>
  `,
})
export class EventsTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);

  protected actions = ACTIONS;
  protected playerEvents = PLAYER_EVENTS;
  protected playerEventTypes = PLAYER_EVENT_TYPES;
  /** Último gol registrado desde aquí (para marcarlo como golazo con un toque). */
  protected lastGoal = signal<{ playerId: string; name: string; minute: number } | null>(null);
  protected minute: number | null = null;
  protected action = signal<Action>('goal');
  protected goalTeam = signal<string | null>(null);
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected flash = signal<string | null>(null);
  protected editing = signal<string | null>(null);
  protected edit = { type: 'goal' as EventType, minute: 0, player_id: '', team_id: '', is_own_goal: false, team_out_id: '' };

  protected teams = computed(() => [...this.data().teams].sort((a, b) => a.sort_order - b.sort_order));
  protected players = computed(() => this.data().players.filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order));
  private playerMap = computed(() => new Map(this.data().players.map((p) => [p.id, p.name])));
  private teamMap = computed(() => new Map(this.data().teams.map((t) => [t.id, t.name])));
  protected starting = computed(() => this.data().match.starting_team_ids ?? []);
  protected sorted = computed(() => [...this.data().events].sort((a, b) => a.minute - b.minute || a.seq - b.seq));
  protected court = computed(() => courtTimeline(toTimelineEvents(this.data().events), teamOrder(this.data().teams), this.starting()));
  protected waitingNames = computed(() => this.court().waiting.map((t) => this.teamName(t)).join(', ') || '—');
  private gamesByEvent = computed(() => new Map(this.court().games.map((g) => [g.eventId, g])));
  private invalid = computed(() => new Set(this.court().invalidEventIds));
  private pendingStart: string[] = [];

  constructor() {
    // Minuto inicial = tiempo desde que se cerraron las apuestas.
    effect(() => {
      const closed = this.data().match.closed_at;
      untracked(() => {
        if (this.minute === null) this.minute = elapsedMinutes(closed);
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

  gameNote(e: EventRow): string | null {
    const g = this.gamesByEvent().get(e.id);
    return g ? `Partidito ${g.number}: gana ${this.teamName(g.winnerTeamId)}, sale ${this.teamName(g.loserTeamId)}, entra ${this.teamName(g.enteringTeamId)}` : null;
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

  async toggleStarting(teamId: string) {
    const cur = this.pendingStart.length ? this.pendingStart : [...this.starting()];
    const next = cur.includes(teamId) ? cur.filter((t) => t !== teamId) : [...cur, teamId].slice(-2);
    this.pendingStart = next;
    if (next.length === 2) {
      await this.run(() => this.api.setStartingTeams(this.data().match.id, [next[0], next[1]]), `Arrancan ${this.teamName(next[0])} y ${this.teamName(next[1])}`);
      this.pendingStart = [];
    }
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
    if (!team || minute === null) return;
    const own = this.action() === 'own_goal';
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type: 'goal', player_id: p.id, team_id: team, is_own_goal: own, team_out_id: null, minute }),
      `${own ? '🙈 Autogol de' : '⚽ Gol de'} ${p.name} para ${this.teamName(team)} (${minute}')`,
    );
    this.goalTeam.set(null);
    this.lastGoal.set(own ? null : { playerId: p.id, name: p.name, minute });
  }

  async markGolazo(g: { playerId: string; name: string; minute: number }) {
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type: 'golazo', player_id: g.playerId, team_id: null, is_own_goal: false, team_out_id: null, minute: g.minute }),
      `✨ Golazo de ${g.name} (${g.minute}')`,
    );
    this.lastGoal.set(null);
  }

  async addPlayerEvent(p: PlayerRow) {
    const minute = this.validMinute();
    const type = this.action() as PlayerEventType;
    if (minute === null || !isPlayerEvent(type)) return;
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type, player_id: p.id, team_id: null, is_own_goal: false, team_out_id: null, minute }),
      `${PLAYER_EVENTS[type].icon} ${PLAYER_EVENTS[type].text(p.name)} (${minute}')`,
    );
  }

  async addRotation(teamOut: string) {
    const minute = this.validMinute();
    if (minute === null) return;
    if (!confirm(`¿Rotación sin gol? Sale ${this.teamName(teamOut)} y entra ${this.waitingNames()}.`)) return;
    await this.run(
      () => this.api.addEvent({ match_id: this.data().match.id, type: 'rotation', player_id: null, team_id: null, is_own_goal: false, team_out_id: teamOut, minute }),
      `🔄 Sale ${this.teamName(teamOut)} (${minute}')`,
    );
  }

  startEdit(e: EventRow) {
    this.edit = {
      type: e.type,
      minute: e.minute,
      player_id: e.player_id ?? this.players()[0]?.id ?? '',
      team_id: e.team_id ?? this.teams()[0]?.id ?? '',
      is_own_goal: e.is_own_goal,
      team_out_id: e.team_out_id ?? this.teams()[0]?.id ?? '',
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
        player_id: t === 'rotation' ? null : this.edit.player_id,
        team_id: t === 'goal' ? this.edit.team_id : null,
        is_own_goal: t === 'goal' ? this.edit.is_own_goal : false,
        team_out_id: t === 'rotation' ? this.edit.team_out_id : null,
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
