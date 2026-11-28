import { Component, computed, inject, output, signal } from '@angular/core';
import { GAME_MODES, GameModeId, SECTIONS } from '../core/models';
import { AuthApi } from '../core/auth';
import { SlipService } from '../core/slip';
import { LeagueGame } from '../domain/league';
import { MatchContext } from './match-context';
import { GameCardComponent } from './game-card.component';
import { MarketOptionsComponent } from './market-options.component';
import { LiveBoardComponent } from './live-board.component';
import { MARKET_ICON } from './market-utils';
import { IconComponent } from '../ui/icon.component';
import { KitComponent } from '../ui/kit.component';
import { Ball3dComponent } from '../ui/ball3d.component';
import { sound } from '../ui/sound';
import { formatSoles } from '../domain/settlement';

type View = 'games' | 'specials' | 'table';
type ModeFilter = 'all' | GameModeId;

const DRAFT_MEDALS = ['🥇', '🥈', '🥉'] as const;

/** Inicio de la pichanga: 3 modos de juego, Makanakis de la jornada y tabla + Draft. */
@Component({
  selector: 'app-lobby',
  imports: [GameCardComponent, MarketOptionsComponent, LiveBoardComponent, IconComponent, Ball3dComponent, KitComponent],
  template: `
    <!-- Banner compacto con pelota 3D -->
    <section class="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ff8a1f] via-lime to-[#d13f00] text-white shadow-[0_18px_38px_-18px_rgb(242_98_0/0.8)] anim-in">
      <div class="relative z-10 max-w-[66%] p-3.5 pr-0">
        <p class="text-[10px] font-extrabold tracking-[0.2em] text-white/80 uppercase">Copa Álvaro</p>
        <h2 class="mt-0.5 font-display text-[20px] leading-tight font-extrabold">La esférica no se mancha</h2>
        <p class="mt-1 text-xs text-white/90">{{ gameCount() }} partidos · {{ marketsCount() }} mercados · pozo total {{ totalPot() }}</p>
        <ul class="mt-1.5 flex flex-wrap gap-1" aria-label="Equipos">
          @for (t of ctx.orderedTeams(); track t.id) {
            <li class="flex items-center gap-1 rounded-full bg-white/90 py-0.5 pr-2 pl-1 text-[10.5px] font-extrabold text-ink">
              <app-kit class="h-4 w-4" [kit]="ctx.teamKit(t.id)" />{{ t.name }}
            </li>
          }
        </ul>
        @if (!auth.user()) {
          <p class="mt-1.5 inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold">Entra para meter tus fichas</p>
        }
      </div>
      <div class="pointer-events-none absolute -top-3 -right-6 h-36 w-40" aria-hidden="true"><app-ball3d class="h-full w-full" /></div>
    </section>

    <!-- Vistas -->
    <div class="sticky top-[calc(3.75rem+env(safe-area-inset-top))] z-20 -mx-4 mt-2 bg-night px-4 py-1.5 backdrop-blur-xl" role="tablist" aria-label="Vistas">
      <div class="grid grid-cols-3 rounded-2xl bg-ink/[0.05] p-1">
        @for (v of views; track v.id) {
          <button type="button" role="tab" class="h-9 rounded-xl text-sm font-bold transition" [class]="view() === v.id ? 'bg-white text-ink shadow-sm' : 'text-mute'" [attr.aria-selected]="view() === v.id" (click)="selectView(v.id)">
            {{ v.label }}
          </button>
        }
      </div>
    </div>

    @switch (view()) {
      @case ('games') {
        <!-- Selector de Modos (Todos · Modo 1 · Modo 2 · Modo 3 Draft) -->
        <div class="tab-scroller no-scrollbar -mx-4 mt-1.5 flex items-center gap-1.5 overflow-x-auto px-4 py-1" role="tablist" aria-label="Modos de juego">
          <button
            type="button"
            role="tab"
            class="h-9 shrink-0 rounded-full border px-3 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
            [class]="modeFilter() === 'all' ? 'border-ink bg-ink text-white shadow-sm' : 'border-ink/10 bg-white text-mute'"
            [attr.aria-selected]="modeFilter() === 'all'"
            (click)="modeFilter.set('all')"
          >
            Todos ({{ upcoming().length }})
          </button>
          @for (m of modes; track m.id) {
            @let cnt = modeGameCount(m.id);
            <button
              type="button"
              role="tab"
              class="h-9 shrink-0 rounded-full border px-3 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
              [class]="modeFilter() === m.id ? 'border-lime bg-lime text-white shadow-sm' : 'border-ink/10 bg-white text-mute'"
              [attr.aria-selected]="modeFilter() === m.id"
              (click)="modeFilter.set(m.id)"
            >
              {{ m.short }} · {{ modeChipLabel(m.id) }}@if (cnt > 0) { ({{ cnt }}) }
            </button>
          }
        </div>

        <!-- Partidos agrupados por modo -->
        @for (sec of visibleModeSections(); track sec.meta.id) {
          <section class="mt-3">
            <div class="mb-1.5 flex items-baseline justify-between gap-2 px-1">
              <h3 class="font-display text-base font-extrabold leading-tight">
                {{ sec.meta.short }} · {{ sec.meta.name }}
              </h3>
              @if (sec.meta.id === 3) {
                <span class="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-extrabold text-gold uppercase">Top 3 capitanes</span>
              } @else {
                <button
                  type="button"
                  class="text-xs font-bold text-lime-deep underline underline-offset-2"
                  (click)="toggleSquads(sec.meta.id)"
                >
                  {{ openSquadMode() === sec.meta.id ? 'Ocultar equipos' : 'Ver ' + ctx.orderedTeams().length + ' equipos' }}
                </button>
              }
            </div>

            <!-- Planteles de los 3 equipos de este modo (desplegable) -->
            @if (openSquadMode() === sec.meta.id) {
              <div class="mb-2.5 grid gap-1.5 anim-expand">
                @for (t of ctx.orderedTeams(); track t.id) {
                  <div class="glass flex items-start gap-2.5 p-2.5">
                    <app-kit class="h-5 w-5 shrink-0" [kit]="ctx.teamKit(t.id)" />
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-extrabold">{{ t.name }}</p>
                      <p class="text-[11.5px] leading-snug text-mute">{{ teamPlayerNames(t.id, sec.meta.id) || 'Por definir' }}</p>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Tarjeta del Draft de goleadores (Modo 3) -->
            @if (sec.meta.id === 3) {
              <div class="glass mb-2.5 border-gold/30 bg-gradient-to-br from-white to-night-3/80 p-3.5 anim-in">
                <p class="text-xs leading-snug text-mute">
                  Se suman los goles de <b class="text-ink">Modo 1 y Modo 2</b>. Los 3 máximos goleadores son capitanes y arman su equipo en vivo.
                </p>
                <ol class="mt-2.5 space-y-1.5">
                  @for (slot of [0, 1, 2]; track slot) {
                    @let cap = ctx.draftCaptains()[slot];
                    <li class="flex items-center gap-2.5 rounded-xl bg-white/90 px-3 py-2 text-sm ring-1 ring-ink/[0.06]">
                      <span class="text-base" aria-hidden="true">{{ medals[slot] }}</span>
                      <span class="min-w-0 flex-1 truncate font-bold" [class.text-faint]="!cap">
                        {{ cap ? cap.name : 'Capitán ' + (slot + 1) + ' por definirse' }}
                      </span>
                      <span class="shrink-0 font-display text-xs font-extrabold tabular-nums" [class]="cap ? 'text-lime-deep' : 'text-faint'">
                        {{ cap ? cap.goals + (cap.goals === 1 ? ' gol' : ' goles') : '0 goles' }} · elige {{ slot + 1 }}°
                      </span>
                    </li>
                  }
                </ol>
                @if (sec.games.length === 0) {
                  <p class="mt-2.5 text-center text-[11.5px] font-semibold text-mute">
                    Apenas terminen Modo 1 y 2, el organizador arma los equipos del Draft y abre los partidos aquí.
                  </p>
                }
              </div>
            }

            <!-- Lista de partidos del modo -->
            @if (sec.games.length) {
              <div class="space-y-2">
                @for (g of sec.games; track g.number; let i = $index) {
                  <app-game-card class="block anim-in" [style.--i]="i" [game]="g" (open)="ctx.sheetGame.set(g.number)" (full)="full.emit()" />
                }
              </div>
            }
          </section>
        }

        <!-- Equipo que descansa en el partido en vivo o actual -->
        @if (ctx.restingTeams().length && modeFilter() !== 3) {
          @for (rt of ctx.restingTeams(); track rt.id) {
            <section class="glass mt-3 flex items-start gap-3 p-3.5 anim-in">
              <app-kit class="h-6 w-6 shrink-0" [kit]="ctx.teamKit(rt.id)" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-extrabold tracking-wide text-mute uppercase">Calentando el asiento · espera al ganador</p>
                <p class="font-display text-base font-extrabold leading-tight">{{ rt.name }}</p>
                @if (teamPlayerNames(rt.id, activeSquadMode())) {
                  <p class="mt-1 text-xs leading-snug text-mute">{{ teamPlayerNames(rt.id, activeSquadMode()) }}</p>
                }
              </div>
            </section>
          }
        }

        @if (played().length) {
          <h3 class="mt-5 mb-1.5 px-1 text-sm font-extrabold tracking-wide text-mute uppercase">Finalizados</h3>
          <div class="space-y-2">
            @for (g of played(); track g.number) {
              <app-game-card class="block" [game]="g" (open)="ctx.sheetGame.set(g.number)" />
            }
          </div>
        }

        <button type="button" class="mt-3 flex w-full items-center gap-3 rounded-3xl border border-dashed border-lime/40 bg-lime/5 p-3 text-left" (click)="selectView('specials')">
          <span class="text-2xl">🏆</span>
          <span class="min-w-0 flex-1">
            <span class="block font-bold">Makanakis de la jornada</span>
            <span class="block text-xs text-mute">Campeón, goleador, leñeros, primera roja, primer palo, bloopers y huachas de toda la pichanga</span>
          </span>
          <app-icon name="next" class="text-lime" />
        </button>
      }

      @case ('specials') {
        @if (leagueClosed()) {
          <p class="mt-3 flex items-center gap-2 rounded-2xl bg-ink/[0.05] p-3 text-sm text-mute"><app-icon name="lock" [size]="16" /> Ya rodó el balón: los Makanakis de la jornada ya cerraron.</p>
        }
        @for (sec of sections(); track sec.id) {
          <h3 class="mt-5 mb-2 px-1 font-display text-lg font-extrabold">{{ sec.icon }} {{ sec.label }} <span class="block text-xs font-semibold text-faint">{{ sec.blurb }}</span></h3>
          <div class="space-y-2">
            @for (m of sec.markets; track m.id) {
              @let isOpen = open() === m.id;
              @let picked = countFor(m.id);
              <article class="glass p-0" [class.border-lime/40]="picked > 0">
                <button type="button" class="flex w-full items-center gap-3 p-3.5 text-left" (click)="open.set(isOpen ? null : m.id)" [attr.aria-expanded]="isOpen">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-3 text-lg">{{ icon(m.type) }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold leading-tight">{{ m.name }}</span>
                    <span class="block text-xs text-mute">{{ ctx.potLabel(m.id) }}</span>
                  </span>
                  @if (picked) {
                    <span class="grid h-6 min-w-6 place-items-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-white anim-pop">{{ picked }}</span>
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

      @case ('table') {
        <div class="mt-3"><app-live-board [data]="ctx.data()!" [me]="auth.user()?.username ?? null" /></div>
      }
    }
  `,
})
export class LobbyComponent {
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly auth = inject(AuthApi);
  private readonly slip = inject(SlipService);
  protected readonly modes = GAME_MODES;
  protected readonly medals = DRAFT_MEDALS;
  protected readonly views: { id: View; label: string }[] = [
    { id: 'games', label: 'Partidos' },
    { id: 'specials', label: 'Makanakis' },
    { id: 'table', label: 'Tabla' },
  ];
  protected readonly view = signal<View>('games');
  protected readonly modeFilter = signal<ModeFilter>('all');
  protected readonly openSquadMode = signal<GameModeId | null>(null);
  protected readonly open = signal<string | null>(null);

  protected selectView(v: View) {
    if (v === 'specials' && this.view() !== 'specials') sound.makanaki();
    this.view.set(v);
  }

  protected toggleSquads(mode: GameModeId) {
    this.openSquadMode.update((cur) => (cur === mode ? null : mode));
  }

  protected modeChipLabel(id: GameModeId) {
    return id === 1 ? 'Chocolateados' : id === 2 ? 'Cumpleañero' : 'Draft 👑';
  }

  protected readonly upcoming = computed(() =>
    (this.ctx.league()?.games ?? [])
      .filter((g) => g.status !== 'played')
      .sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || a.number - b.number),
  );
  protected readonly played = computed(() => {
    const f = this.modeFilter();
    return (this.ctx.league()?.games ?? []).filter((g) => g.status === 'played' && (f === 'all' || (g.mode ?? 1) === f));
  });

  protected readonly visibleModeSections = computed(() => {
    const f = this.modeFilter();
    const list = this.upcoming();
    const targetModes = f === 'all' ? GAME_MODES : GAME_MODES.filter((m) => m.id === f);
    return targetModes
      .map((meta) => ({
        meta,
        games: list.filter((g) => (g.mode ?? 1) === meta.id),
      }))
      .filter((sec) => sec.games.length > 0 || sec.meta.id === 3 || f === sec.meta.id);
  });

  protected readonly activeSquadMode = computed<GameModeId>(() => {
    const f = this.modeFilter();
    if (f !== 'all') return f;
    const active = this.ctx.liveGame() ?? this.upcoming()[0];
    return (active?.mode ?? 1) as GameModeId;
  });

  protected readonly marketsCount = computed(() => this.ctx.data()?.markets.length ?? 0);
  protected readonly gameCount = computed(() => this.ctx.league()?.games?.length ?? 0);
  protected readonly totalPot = computed(() => formatSoles([...this.ctx.pots().values()].reduce((s, p) => s + p.pot, 0)));
  protected readonly leagueClosed = computed(() => (this.ctx.league()?.games ?? []).some((g) => g.status !== 'pending'));

  protected readonly sections = computed(() => {
    const markets = [...(this.ctx.data()?.markets ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    return SECTIONS.filter((s) => s.id !== 'partidos')
      .map((s) => ({ ...s, markets: markets.filter((m) => m.section === s.id) }))
      .filter((s) => s.markets.length);
  });

  protected modeGameCount(id: GameModeId) {
    return this.upcoming().filter((g) => (g.mode ?? 1) === id).length;
  }

  protected countFor(marketId: string) {
    return this.slip.bets().filter((b) => b.marketId === marketId).length;
  }
  protected icon(type: string) {
    return MARKET_ICON[type] ?? '🎲';
  }
  protected teamPlayerNames(teamId: string, mode: GameModeId = 1) {
    return this.ctx
      .teamPlayers(teamId, mode)
      .map((p) => (p.position === 'GK' ? `${p.name} (ARQ)` : p.name))
      .join(' · ');
  }
}
