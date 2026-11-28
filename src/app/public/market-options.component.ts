import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AvatarService } from '../core/avatars';
import { Market } from '../core/models';
import { SlipService } from '../core/slip';
import { IconComponent } from '../ui/icon.component';
import { KitComponent } from '../ui/kit.component';
import { MatchContext } from './match-context';
import { Choice } from './market-utils';

/**
 * Botones de un mercado: tocar agrega o quita la opción del cupón.
 * Jugadores agrupados por equipo (con su cara); el multiplicador solo aparece cuando hay plata.
 */
@Component({
  selector: 'app-market-options',
  imports: [IconComponent, KitComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = ctx.state(market().id);
    @if (!st.open) {
      <p class="mb-2 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-bold text-mute">
        <app-icon name="lock" [size]="12" /> {{ st.reason }}
      </p>
    }

    <ng-template #btn let-c>
      @let on = slip.has(market().id, c.selection);
      @let odd = ctx.oddText(market().id, c.selection);
      <button
        type="button"
        class="odd"
        [class]="c.player ? 'flex-row! justify-start! gap-2! text-left' : ''"
        [class.odd-on]="on"
        [disabled]="!st.open"
        [attr.aria-pressed]="on"
        [attr.aria-label]="c.label + ' · apostado ' + ctx.stakedText(market().id, c.selection)"
        (click)="pick(c.selection)"
      >
        @if (c.player) {
          @let av = c.label !== 'Autogol' ? avatars.urlFor(player(c.selection)) : null;
          @if (av) {
            <img
              [src]="av"
              alt=""
              width="28"
              height="28"
              loading="lazy"
              class="h-7 w-7 shrink-0 rounded-full border-2 bg-white object-cover"
              [style.border-color]="c.teamId ? ctx.teamColor(c.teamId) : '#a8968a'"
              (error)="avatars.markBroken(av)"
            />
          } @else {
            <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-night-4 text-sm" aria-hidden="true">{{ c.label === 'Autogol' ? '🙈' : '⚽' }}</span>
          }
          <span class="odd-label min-w-0 flex-1 truncate">{{ c.label }}</span>
        } @else {
          <span class="odd-label inline-flex items-center gap-1">
            @if (c.teamId) {
              <app-kit class="h-3.5 w-4 shrink-0" [kit]="ctx.teamKit(c.teamId)" />
            }
            {{ compact() && c.short ? c.short : c.label }}
          </span>
        }
        @if (odd) {
          <span class="odd-value">{{ odd }}</span>
        }
      </button>
    </ng-template>

    @let groups = playerGroups();
    @if (groups) {
      <div class="grid gap-3" [class.grid-cols-2]="groups.length === 2">
        @for (g of groups; track g.teamId) {
          <div class="min-w-0">
            @if (g.teamId) {
              <p class="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-mute">
                <app-kit class="h-4 w-4 shrink-0" [kit]="ctx.teamKit(g.teamId)" /> {{ ctx.team(g.teamId) }}
              </p>
            }
            <div class="grid gap-1.5" [class]="groups.length === 2 ? 'grid-cols-1' : 'grid-cols-2'">
              @for (c of g.choices; track c.selection) {
                <ng-container *ngTemplateOutlet="btn; context: { $implicit: c }" />
              }
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="grid gap-1.5" [class]="cols()">
        @for (c of choices(); track c.selection) {
          <ng-container *ngTemplateOutlet="btn; context: { $implicit: c }" />
        }
      </div>
    }
  `,
})
export class MarketOptionsComponent {
  readonly market = input.required<Market>();
  /** Botones 1 / X / 2 cortos (tarjetas de partido). */
  readonly compact = input(false);
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly slip = inject(SlipService);
  protected readonly avatars = inject(AvatarService);

  protected readonly choices = computed(() => this.ctx.choices(this.market()));

  /** Jugadores por equipo, en el orden de los equipos (sin equipo y Autogol al final). Null si no es de jugadores. */
  protected readonly playerGroups = computed(() => {
    const list = this.choices();
    if (!list.length || !list.every((c) => c.player)) return null;
    const order = this.ctx.orderedTeams().map((t) => t.id);
    const groups = new Map<string | null, Choice[]>();
    for (const c of list) {
      const key = c.teamId && order.includes(c.teamId) ? c.teamId : null;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const teams = order.filter((id) => groups.has(id)).map((teamId) => ({ teamId, choices: groups.get(teamId)! }));
    const rest = groups.get(null);
    if (!teams.length) return [{ teamId: null, choices: list }];
    // Autogol y los sin equipo van con el último grupo para no romper las dos columnas.
    if (rest) teams[teams.length - 1] = { ...teams.at(-1)!, choices: [...teams.at(-1)!.choices, ...rest] };
    return teams as { teamId: string | null; choices: Choice[] }[];
  });

  protected readonly cols = computed(() => {
    const m = this.market();
    if (m.type === 'game_winner') return 'grid-cols-3';
    if (m.target === 'number') return 'grid-cols-3 sm:grid-cols-6';
    return 'grid-cols-2';
  });

  protected player(id: string) {
    return this.ctx.data()?.players.find((p) => p.id === id) ?? { id, photo_id: null, costume_id: null };
  }

  protected pick(selection: string) {
    if (!this.slip.toggle(this.market().id, selection)) this.full.emit();
  }
}
