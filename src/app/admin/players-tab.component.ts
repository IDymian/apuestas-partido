import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi, PlayerPatch } from '../core/admin-api';
import { AdminMatchData, GAME_MODES, GameModeId, PlayerModeSlot, PlayerPosition, PlayerRow } from '../core/models';
import { friendlyError } from '../core/public-api';
import { KIT_BY_ID, kitAccent, KITS } from '../core/kits';
import { AvatarService } from '../core/avatars';
import { PHOTO_OPTIONS, prepareReceipt } from '../core/receipt-image';

const POSITIONS: { id: PlayerPosition; label: string }[] = [
  { id: 'GK', label: 'ARQ' },
  { id: 'DEF', label: 'DEF' },
  { id: 'MID', label: 'MED' },
  { id: 'FWD', label: 'DEL' },
];

/** Plantel de la jornada: agregar jugadores y asignar equipo, dorsal y posición para Formaciones. */
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
          rows="4"
          [placeholder]="'Mateo\\nAndrés'"
          [(ngModel)]="paste"
          name="paste"
        ></textarea>
      </label>
      <button type="button" class="btn-primary mt-2 h-11 w-full" [disabled]="busy() || !lines().length" (click)="add()">
        Agregar {{ lines().length || '' }} {{ lines().length === 1 ? 'jugador' : 'jugadores' }}
      </button>
    </section>

    <section class="card mt-4">
      <span class="label">Nuevo equipo ({{ teams().length }} en la jornada)</span>
      <div class="mt-1 flex gap-2">
        <input class="input h-11 flex-1" maxlength="30" placeholder="Equipo {{ teams().length + 1 }}" [(ngModel)]="teamName" name="teamName" aria-label="Nombre del equipo nuevo" />
        <select class="input h-11 w-32 shrink-0 text-sm" [(ngModel)]="teamKit" name="teamKit" aria-label="Camiseta del equipo nuevo">
          <option value="">Color libre</option>
          @for (k of kits; track k.id) {
            <option [value]="k.id">{{ k.name }}</option>
          }
        </select>
        @if (!teamKit) {
          <input type="color" class="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300" [(ngModel)]="teamColor" name="teamColor" aria-label="Color del equipo nuevo" />
        }
        <button type="button" class="btn-primary h-11 px-4" [disabled]="busy() || !teamName.trim()" (click)="addTeam()">Nuevo equipo</button>
      </div>
    </section>

    <section class="card mt-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-bold">Jugadores y formaciones <span class="text-sm font-normal text-slate-500">({{ list().length }})</span></h2>
        <div class="flex gap-1">
          @for (m of modes; track m.id) {
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-bold transition"
              [class]="editMode() === m.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'"
              (click)="editMode.set(m.id)"
            >
              {{ m.short }}
            </button>
          }
        </div>
      </div>
      <p class="mt-1 text-xs text-slate-500">
        Editando asignaciones de <b>{{ activeModeMeta().short }} · {{ activeModeMeta().name }}</b>.
      </p>
      <ul class="mt-2 divide-y divide-slate-100">
        @for (p of list(); track p.id; let i = $index) {
          @let sl = slotOf(p);
          <li class="py-2">
            <div class="flex items-center gap-2">
              <span class="w-5 shrink-0 text-right text-xs text-slate-400">{{ i + 1 }}</span>
              @if (renaming() === p.id) {
                <input class="input h-9" [(ngModel)]="newName" name="rename" (keydown.enter)="saveRename(p)" />
                <button type="button" class="btn-primary h-9 px-3 text-sm" (click)="saveRename(p)">OK</button>
              } @else {
                <span class="min-w-0 flex-1 truncate font-semibold">{{ p.name }}</span>
                <button type="button" class="btn-secondary h-8 px-2" (click)="startRename(p)" aria-label="Renombrar">✎</button>
                <button type="button" class="btn-danger h-8 px-2" (click)="remove(p)" aria-label="Quitar jugador">✕</button>
              }
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7">
              <select
                class="input h-8 w-auto flex-1 min-w-[115px] py-0 text-xs"
                [ngModel]="sl.team_id ?? ''"
                (ngModelChange)="patchMode(p, { team_id: $event || null })"
                [attr.aria-label]="'Equipo de ' + p.name"
              >
                <option value="">Sin equipo</option>
                @for (t of teams(); track t.id) {
                  <option [value]="t.id">{{ t.name }}</option>
                }
              </select>
              <select
                class="input h-8 w-20 py-0 text-xs"
                [ngModel]="sl.position ?? ''"
                (ngModelChange)="patchMode(p, { position: $event || null })"
                [attr.aria-label]="'Posición de ' + p.name"
              >
                <option value="">Pos.</option>
                @for (pos of positions; track pos.id) {
                  <option [value]="pos.id">{{ pos.label }}</option>
                }
              </select>
              <input
                type="number"
                min="1"
                max="99"
                inputmode="numeric"
                class="input h-8 w-16 py-0 text-center text-xs"
                placeholder="#"
                [ngModel]="sl.shirt_number ?? ''"
                (change)="onShirt(p, $event)"
                [attr.aria-label]="'Dorsal de ' + p.name"
              />
            </div>
            <!-- Avatar: disfraz (especial) o foto del jugador, con su permiso -->
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7">
              @let av = avatars.urlFor(p);
              @if (av) {
                <img [src]="av" alt="" width="32" height="32" class="h-8 w-8 shrink-0 rounded-full border border-slate-300 bg-orange-50 object-cover" />
              }
              <select
                class="input h-8 w-auto flex-1 min-w-[115px] py-0 text-xs"
                [ngModel]="p.costume_id ?? ''"
                (ngModelChange)="patch(p, { costume_id: $event || null })"
                [attr.aria-label]="'Disfraz de ' + p.name"
              >
                <option value="">Sin disfraz</option>
                @for (c of avatars.costumes(); track c.id) {
                  <option [value]="c.id">{{ c.id }}</option>
                }
              </select>
              <label class="btn-secondary h-8 cursor-pointer px-2 text-xs leading-8">
                {{ p.photo_id ? 'Cambiar foto' : 'Subir foto' }}
                <input type="file" accept="image/*" class="sr-only" (change)="onPhoto(p, $event)" [attr.aria-label]="'Foto de ' + p.name" />
              </label>
              @if (p.photo_id) {
                <button type="button" class="btn-danger h-8 px-2 text-xs" (click)="patch(p, { photo_id: null })" [attr.aria-label]="'Quitar foto de ' + p.name">Quitar foto</button>
              }
            </div>
          </li>
        } @empty {
          <li class="py-2 text-sm text-slate-500">Sin jugadores todavía.</li>
        }
      </ul>
    </section>
    <p class="mt-3 text-center text-xs text-slate-500">
      El equipo, posición (ARQ/DEF/MED/DEL) y dorsal alimentan la cancha en la pestaña Formaciones.
    </p>
  `,
})
export class PlayersTabComponent {
  readonly data = input.required<AdminMatchData>();
  readonly changed = output<void>();
  private api = inject(AdminApi);
  protected readonly avatars = inject(AvatarService);

  protected readonly positions = POSITIONS;
  protected readonly modes = GAME_MODES;
  protected readonly editMode = signal<GameModeId>(1);
  protected readonly activeModeMeta = computed(() => GAME_MODES.find((m) => m.id === this.editMode()) ?? GAME_MODES[0]);
  protected paste = '';
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected renaming = signal<string | null>(null);
  protected newName = '';
  protected teamName = '';
  protected teamColor = '#64748b';
  protected teamKit = '';
  protected readonly kits = KITS;

  protected teams = computed(() => [...this.data().teams].sort((a, b) => a.sort_order - b.sort_order));
  protected list = computed(() => this.data().players.filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order));

  protected slotOf(p: PlayerRow): PlayerModeSlot {
    const mode = this.editMode();
    const ms = p.modes?.[mode];
    if (ms) return ms;
    if (mode === 1) {
      return { team_id: p.team_id ?? null, position: p.position ?? null, shirt_number: p.shirt_number ?? null, slot: p.slot ?? null };
    }
    return { team_id: null, position: null, shirt_number: p.shirt_number ?? null, slot: null };
  }

  async patchMode(p: PlayerRow, update: Partial<PlayerModeSlot>) {
    const mode = this.editMode();
    const merged: PlayerModeSlot = { ...this.slotOf(p), ...update };
    const modes = { ...(p.modes ?? {}), [mode]: merged };
    try {
      await this.api.updatePlayer(
        p.id,
        mode === 1
          ? { modes, team_id: merged.team_id, position: merged.position, shirt_number: merged.shirt_number, slot: merged.slot }
          : { modes },
      );
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  async patch(p: PlayerRow, patch: PlayerPatch) {
    try {
      await this.api.updatePlayer(p.id, patch);
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  /** Solo fotos del propio jugador y con su permiso (reglas de contenido). */
  async onPhoto(p: PlayerRow, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    if (!confirm(`¿${p.name} te dio permiso para usar su foto? Solo su cara, sin otras personas ni texto.`)) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.uploadPlayerPhoto(p.id, await prepareReceipt(file, PHOTO_OPTIONS));
      this.changed.emit();
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(false);
    }
  }

  onShirt(p: PlayerRow, ev: Event) {
    const raw = (ev.target as HTMLInputElement).value.trim();
    const num = raw === '' ? null : Math.max(1, Math.min(99, Math.round(Number(raw))));
    this.patchMode(p, { shirt_number: Number.isFinite(num as number) ? num : null });
  }

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

  async addTeam() {
    const name = this.teamName.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const kit = KIT_BY_ID.get(this.teamKit);
      await this.api.addTeam(this.data().match.id, name, kit ? kitAccent(kit) : this.teamColor, kit?.id ?? null);
      this.teamName = '';
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
