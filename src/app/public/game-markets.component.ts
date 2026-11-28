import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Market, Player } from '../core/models';
import { GAME_MARKET_BY_TYPE } from '../domain/game-markets';
import { LeagueGame } from '../domain/league';
import { formatSoles } from '../domain/settlement';
import { SlipService } from '../core/slip';
import { MatchContext } from './match-context';
import { MarketOptionsComponent } from './market-options.component';
import { GameFormationsComponent } from './game-formations.component';
import { IconComponent } from '../ui/icon.component';
import { KitComponent } from '../ui/kit.component';

type MarketTab = 'popular' | 'formations' | 'players' | 'goles' | 'tarjetas' | 'show';
type PlayerSubGroup = 'goles' | 'tarjetas' | 'show';

const MATCH_TABS: { id: MarketTab; label: string }[] = [
  { id: 'popular', label: 'Fijas' },
  { id: 'formations', label: 'Formaciones' },
  { id: 'players', label: 'Jugadores' },
  { id: 'goles', label: 'Goles' },
  { id: 'tarjetas', label: 'Tarjetas' },
  { id: 'show', label: 'Show' },
];

const PLAYER_SUBGROUPS: { id: PlayerSubGroup; label: string }[] = [
  { id: 'goles', label: 'Goles' },
  { id: 'tarjetas', label: 'Tarjetas' },
  { id: 'show', label: 'Show' },
];

/**
 * Mercados de un partido con pestañas horizontales (estilo casa de apuestas):
 * Populares · Formaciones (cancha 6v6) · Jugadores (tabla) · Goles · Tarjetas · Show.
 */
@Component({
  selector: 'app-game-markets',
  imports: [MarketOptionsComponent, GameFormationsComponent, IconComponent, KitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Pestañas horizontales del partido (una sola fila con scroll táctil y fade en bordes) -->
    <div
      class="tab-scroller no-scrollbar -mx-4 mb-3 flex items-center gap-1 overflow-x-auto border-b border-ink/[0.08] px-4"
      role="tablist"
      aria-label="Secciones del partido"
      (keydown)="onTabKey($event)"
    >
      @for (t of tabs; track t.id) {
        @let on = tab() === t.id;
        <button
          type="button"
          role="tab"
          [id]="'gm-tab-' + t.id"
          class="match-tab relative flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-bold whitespace-nowrap transition-colors"
          [class]="on ? 'text-ink' : 'text-mute'"
          [attr.aria-selected]="on"
          [attr.tabindex]="on ? 0 : -1"
          (click)="selectTab(t.id, $event)"
        >
          {{ t.label }}
        </button>
      }
    </div>

    <div role="tabpanel" [attr.aria-labelledby]="'gm-tab-' + tab()">
      @switch (tab()) {
        @case ('popular') {
          <p class="mb-2.5 flex items-center justify-between gap-2 rounded-2xl bg-night-3/80 px-3 py-2 text-xs text-mute">
            <span>Todo es por pozo: el multiplicador sube o baja hasta que cierre el mercado.</span>
            <button
              type="button"
              class="shrink-0 font-extrabold text-lime-deep underline underline-offset-2"
              (click)="selectTab('formations')"
            >
              Ver cancha
            </button>
          </p>

          <div class="space-y-2.5">
            @for (m of popularMain(); track m.id) {
              @let picked = countFor(m.id);
              <article class="rounded-2xl border border-ink/[0.07] bg-white p-3.5" [class.border-lime/50]="picked > 0">
                <div class="mb-2.5 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <h4 class="font-bold leading-tight">{{ label(m.type) }}</h4>
                    <p class="text-xs text-mute">{{ ctx.potLabel(m.id) }}{{ ctx.state(m.id).open ? '' : ' · ' + ctx.state(m.id).reason }}</p>
                  </div>
                  @if (picked) {
                    <span class="grid h-6 min-w-6 place-items-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-white tabular-nums">{{ picked }}</span>
                  }
                </div>
                <app-market-options [market]="m" (full)="full.emit()" />
              </article>
            }

            @if (popularYesNo().length) {
              <section class="rounded-2xl border border-ink/[0.07] bg-white p-3.5">
                <h4 class="mb-2.5 text-xs font-extrabold tracking-wider text-mute uppercase">¿Pasará en este choque?</h4>
                <div class="divide-y divide-ink/[0.06]">
                  @for (m of popularYesNo(); track m.id) {
                    @let st = ctx.state(m.id);
                    <div class="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-bold">{{ label(m.type) }}</p>
                        <p class="text-[11px] text-mute">{{ ctx.potLabel(m.id) }}{{ st.open ? '' : ' · ' + st.reason }}</p>
                      </div>
                      <div class="grid w-36 shrink-0 grid-cols-2 gap-1.5">
                        @for (c of ctx.choices(m); track c.selection) {
                          @let on = slip.has(m.id, c.selection);
                          <button
                            type="button"
                            class="odd min-h-10 px-1.5 py-1"
                            [class.odd-on]="on"
                            [disabled]="!st.open"
                            [attr.aria-pressed]="on"
                            [attr.aria-label]="label(m.type) + ' · ' + c.label + ' · apostado ' + ctx.stakedText(m.id, c.selection)"
                            (click)="pick(m.id, c.selection)"
                          >
                            <span class="odd-label text-[11px]">{{ c.label }}</span>
                            @if (ctx.oddText(m.id, c.selection); as odd) {
                              <span class="odd-value text-[12.5px]">{{ odd }}</span>
                            }
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>
        }

        @case ('formations') {
          <app-game-formations [game]="game()" (full)="full.emit()" />
        }

        @case ('players') {
          <div class="mb-2.5 flex items-center justify-between gap-2">
            <div class="inline-flex rounded-xl bg-ink/[0.06] p-1" role="tablist" aria-label="Tipo de apuesta a jugador">
              @for (sg of playerSubgroups; track sg.id) {
                <button
                  type="button"
                  role="tab"
                  class="min-h-9 rounded-lg px-3 text-xs font-bold transition"
                  [class]="playerGroup() === sg.id ? 'bg-white text-ink shadow-sm' : 'text-mute'"
                  [attr.aria-selected]="playerGroup() === sg.id"
                  (click)="playerGroup.set(sg.id)"
                >
                  {{ sg.label }}
                </button>
              }
            </div>
            <span class="text-[11px] font-semibold text-mute">{{ matchPlayers().length }} jugadores</span>
          </div>

          <!-- Tabla responsiva con cabecera fija y primera columna fija (nombre del jugador) -->
          <div
            tabindex="0"
            role="region"
            aria-label="Apuestas por jugador del partido"
            class="player-table-wrap overflow-x-auto rounded-2xl border border-ink/[0.08] bg-white shadow-xs"
          >
            <table class="w-full border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr class="bg-night-3/90 text-[11px] font-extrabold text-mute">
                  <th scope="col" class="sticky left-0 z-20 min-w-[136px] border-b border-ink/[0.08] bg-night-3 px-3 py-2.5">Jugador</th>
                  @for (m of playerTableMarkets(); track m.id) {
                    <th scope="col" class="min-w-[82px] border-b border-ink/[0.08] px-1.5 py-2.5 text-center leading-tight">
                      <span class="block text-ink">{{ compactCol(m.type) }}</span>
                      <span class="block text-[10px] font-semibold text-mute tabular-nums">{{ pot(m.id) }}</span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (p of visiblePlayers(); track p.id) {
                  <tr class="group">
                    <th scope="row" class="sticky left-0 z-10 border-b border-ink/[0.06] bg-white px-3 py-2 font-bold text-ink">
                      <span class="flex items-center gap-2">
                        @if (p.team_id) {
                          <app-kit class="h-4 w-4 shrink-0" [kit]="ctx.teamKit(p.team_id)" />
                        } @else {
                          <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-faint" aria-hidden="true"></span>
                        }
                        <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
                        @if (p.position === 'GK') {
                          <span class="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-extrabold text-amber-900">ARQ</span>
                        }
                      </span>
                    </th>
                    @for (m of playerTableMarkets(); track m.id) {
                      @let st = ctx.state(m.id);
                      @let on = slip.has(m.id, p.id);
                      <td class="border-b border-ink/[0.06] px-1 py-1.5 text-center">
                        <button
                          type="button"
                          class="odd min-h-11 w-full px-1.5 py-1"
                          [class.odd-on]="on"
                          [disabled]="!st.open"
                          [attr.aria-pressed]="on"
                          [attr.aria-label]="p.name + ' · ' + label(m.type) + ' · apostado ' + ctx.stakedText(m.id, p.id)"
                          (click)="pick(m.id, p.id)"
                        >
                          <span class="odd-value text-[12.5px]">{{ ctx.oddText(m.id, p.id, '—') }}</span>
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (matchPlayers().length > 6) {
            <button
              type="button"
              class="btn-ghost mt-2.5 h-10 w-full text-xs"
              (click)="showAllPlayers.set(!showAllPlayers())"
            >
              {{ showAllPlayers() ? 'Mostrar menos' : 'Mostrar todos (' + matchPlayers().length + ')' }}
            </button>
          }
        }

        @default {
          <div class="space-y-2">
            @for (m of groupMarkets(); track m.id; let i = $index) {
              @let isOpen = isAccordionOpen(m.id, i);
              @let picked = countFor(m.id);
              <article class="rounded-2xl border border-ink/[0.07] bg-white" [class.border-lime/50]="picked > 0">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                  (click)="toggle(m.id, i)"
                  [attr.aria-expanded]="isOpen"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold leading-tight">{{ label(m.type) }}</span>
                    <span class="block text-xs text-mute">{{ ctx.potLabel(m.id) }}{{ ctx.state(m.id).open ? '' : ' · ' + ctx.state(m.id).reason }}</span>
                  </span>
                  @if (picked) {
                    <span class="grid h-6 min-w-6 place-items-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-white tabular-nums">{{ picked }}</span>
                  }
                  <app-icon name="chevron" [size]="18" class="text-faint transition-transform duration-300" [class.rotate-180]="isOpen" />
                </button>
                @if (isOpen) {
                  <div class="border-t border-ink/[0.06] p-3 anim-expand">
                    <app-market-options [market]="m" (full)="full.emit()" />
                  </div>
                }
              </article>
            }
          </div>
        }
      }
    </div>
  `,
})
export class GameMarketsComponent {
  readonly game = input.required<LeagueGame>();
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly slip = inject(SlipService);

  protected readonly tabs = MATCH_TABS;
  protected readonly playerSubgroups = PLAYER_SUBGROUPS;
  protected readonly tab = signal<MarketTab>('popular');
  protected readonly playerGroup = signal<PlayerSubGroup>('goles');
  protected readonly showAllPlayers = signal(false);
  /** Acordeones abiertos/cerrados explícitamente en pestañas de grupo. */
  private readonly toggled = signal<Map<string, boolean>>(new Map());

  private readonly allMarkets = computed(() => this.ctx.gameMarkets(this.game()));

  protected readonly popularMain = computed(() =>
    this.allMarkets().filter((m) => m.type === 'game_winner' || m.type === 'game_goals' || m.type === 'game_first_goal'),
  );

  protected readonly popularYesNo = computed(() =>
    this.allMarkets().filter((m) => GAME_MARKET_BY_TYPE.get(m.type)?.group === 'si_no'),
  );

  protected readonly groupMarkets = computed<Market[]>(() => {
    const t = this.tab();
    if (t !== 'goles' && t !== 'tarjetas' && t !== 'show') return [];
    return this.allMarkets().filter((m) => GAME_MARKET_BY_TYPE.get(m.type)?.group === t);
  });

  protected readonly playerTableMarkets = computed<Market[]>(() => {
    const g = this.playerGroup();
    return this.allMarkets().filter((m) => m.target === 'player' && GAME_MARKET_BY_TYPE.get(m.type)?.group === g);
  });

  /** Solo los jugadores de los 2 equipos del partido en su modo actual (si tienen equipo asignado). */
  protected readonly matchPlayers = computed<Player[]>(() => {
    const g = this.game();
    const mode = g.mode ?? 1;
    const home = this.ctx.teamPlayers(g.home, mode);
    const away = this.ctx.teamPlayers(g.away, mode);
    if (home.length || away.length) return [...home, ...away];
    return (this.ctx.data()?.players ?? []).filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order);
  });

  protected readonly visiblePlayers = computed(() =>
    this.showAllPlayers() ? this.matchPlayers() : this.matchPlayers().slice(0, 6),
  );

  protected selectTab(id: MarketTab, ev?: Event) {
    this.tab.set(id);
    const el = ev?.currentTarget as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  protected onTabKey(ev: KeyboardEvent) {
    const idx = this.tabs.findIndex((t) => t.id === this.tab());
    let next = -1;
    if (ev.key === 'ArrowRight') next = (idx + 1) % this.tabs.length;
    else if (ev.key === 'ArrowLeft') next = (idx - 1 + this.tabs.length) % this.tabs.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = this.tabs.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    const target = this.tabs[next];
    this.tab.set(target.id);
    const btn = document.getElementById(`gm-tab-${target.id}`);
    btn?.focus();
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  protected isAccordionOpen(id: string, index: number) {
    const explicit = this.toggled().get(id);
    return explicit !== undefined ? explicit : index === 0;
  }

  protected toggle(id: string, index: number) {
    const currentlyOpen = this.isAccordionOpen(id, index);
    this.toggled.update((m) => {
      const next = new Map(m);
      next.set(id, !currentlyOpen);
      return next;
    });
  }

  protected pick(marketId: string, selection: string) {
    if (!this.slip.toggle(marketId, selection)) this.full.emit();
  }

  protected label(type: string) {
    return GAME_MARKET_BY_TYPE.get(type)?.label ?? type;
  }

  protected compactCol(type: string) {
    const map: Record<string, string> = {
      game_first_goal: '1° gol',
      game_last_goal: 'Últ. gol',
      game_first_own_goal: 'Autogol',
      game_first_yellow: '1ª amar.',
      game_first_red: '1ª roja',
      game_first_post: '1° palo',
      game_first_golazo: 'Golazo',
      game_first_penalty: 'Penal',
      game_first_penalty_miss: 'Falla pen.',
      game_first_blooper: 'Blooper',
      game_first_dive: 'Piscinazo',
      game_first_nutmeg: 'Huacha',
    };
    return map[type] ?? this.label(type);
  }

  protected pot(id: string) {
    return formatSoles(this.ctx.pots().get(id)?.pot ?? 0);
  }

  protected countFor(id: string) {
    return this.slip.bets().filter((b) => b.marketId === id).length;
  }
}
