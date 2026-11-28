import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Market, Player, PlayerPosition } from '../core/models';
import { SlipService } from '../core/slip';
import { GAME_MARKET_BY_TYPE } from '../domain/game-markets';
import { LeagueGame } from '../domain/league';
import { formatSoles } from '../domain/settlement';
import { IconComponent } from '../ui/icon.component';
import { MatchContext } from './match-context';

interface PitchRow {
  key: string;
  label: string;
  players: Player[];
}

/**
 * Vista "Formaciones" de un partido (6 vs 6: 5 de campo + 1 arquero),
 * inspirada en casas de apuestas y adaptada a la Copa Álvaro.
 */
@Component({
  selector: 'app-game-formations',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let mk = activeMarket();
    @let st = mk ? ctx.state(mk.id) : { open: false, reason: null };

    <section class="overflow-hidden rounded-[26px] border border-[#14532d]/40 bg-[#0d331c] text-white shadow-[0_18px_40px_-18px_rgb(13_51_28/0.75)]">
      <!-- Aviso de arquero asignado al azar + link de reclamo por WhatsApp (arriba del todo) -->
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#092414] px-3.5 py-2.5 text-[11.5px] text-emerald-100/85">
        <p class="min-w-0 flex-1 leading-snug">
          <b class="text-white">¿Te mandaron al arco y eres manos de mantequilla?</b> Si vas a llorar, pasa por el libro de reclamaciones:
        </p>
        <a
          [href]="whatsappComplaintUrl()"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-extrabold text-[#062111] shadow-sm transition active:scale-95"
        >
          Reclamar en WhatsApp
          <app-icon name="external" [size]="13" [stroke]="2.5" />
        </a>
      </div>

      <!-- Selector de equipo (2 equipos del partido) -->
      <div class="grid grid-cols-2 gap-2 p-3 pb-2" role="tablist" aria-label="Equipos del partido">
        @for (side of sides(); track side.id) {
          @let selected = selectedTeamId() === side.id;
          <button
            type="button"
            role="tab"
            class="flex min-h-13 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition duration-150 active:scale-[0.98]"
            [class]="selected ? 'border-white/50 bg-[#17512e] text-white shadow-sm' : 'border-white/10 bg-black/20 text-white/75'"
            [attr.aria-selected]="selected"
            (click)="selectTeam(side.id)"
          >
            <span
              class="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/25 font-display text-xs font-extrabold text-white shadow-inner"
              [style.background]="side.color"
              aria-hidden="true"
            >
              {{ side.badge }}
            </span>
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate text-[13px] font-extrabold">{{ side.name }}</span>
              <span class="block text-[11px] font-semibold text-emerald-100/75">{{ side.formation }} · 6v6</span>
            </span>
          </button>
        }
      </div>

      <!-- Selector horizontal de mercado a jugador -->
      @if (playerMarkets().length) {
        <div
          class="tab-scroller no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-white/10 px-3"
          role="tablist"
          aria-label="Mercado en cancha"
        >
          @for (m of playerMarkets(); track m.id) {
            @let active = mk?.id === m.id;
            @let picks = countFor(m.id);
            <button
              type="button"
              role="tab"
              class="pitch-market-tab relative flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-xs font-bold whitespace-nowrap transition-colors"
              [class]="active ? 'text-white' : 'text-emerald-100/70'"
              [attr.aria-selected]="active"
              (click)="selectMarket(m.id, $event)"
            >
              <span>{{ shortLabel(m.type) }}</span>
              @if (picks > 0) {
                <span class="grid h-4 min-w-4 place-items-center rounded-full bg-lime px-1 text-[10px] font-extrabold text-white tabular-nums">{{ picks }}</span>
              }
            </button>
          }
        </div>
      }

      <!-- Barra informativa del mercado seleccionado -->
      @if (mk) {
        <div class="flex flex-wrap items-center justify-between gap-2 bg-black/20 px-3.5 py-2 text-[11px]">
          <span class="font-semibold text-emerald-100/85">
            Pozo <b class="font-display text-xs text-white tabular-nums">{{ potText(mk.id) }}</b>
            @if (!st.open && st.reason) {
              <span class="ml-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                <app-icon name="lock" [size]="10" /> {{ st.reason }}
              </span>
            } @else {
              <span class="text-emerald-100/65"> · pago estimado por pozo</span>
            }
          </span>
          <span class="rounded-full bg-black/35 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-emerald-100/90 uppercase">
            Alineación al ojo
          </span>
        </div>
      }

      <!-- Cancha verde vertical (6 vs 6: FWD / MID / DEF / GK) -->
      <div class="pitch-surface relative px-2 pt-3 pb-3.5">
        <!-- Líneas de cancha (SVG decorativo) -->
        <svg
          class="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 360 440"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <!-- Marco exterior -->
          <rect x="12" y="10" width="336" height="420" rx="6" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" />
          <!-- Línea de mediocampo arriba + semicírculo -->
          <line x1="12" y1="58" x2="348" y2="58" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" />
          <circle cx="180" cy="58" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
          <circle cx="180" cy="58" r="3" fill="rgba(255,255,255,0.22)" />
          <!-- Área grande y área chica del arquero abajo -->
          <rect x="76" y="334" width="208" height="96" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" />
          <rect x="126" y="388" width="108" height="42" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" />
          <path d="M 136 334 A 50 30 0 0 1 224 334" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" />
        </svg>

        @if (rows().length === 0) {
          <div class="relative z-10 py-10 text-center text-sm text-emerald-100/80">
            No hay jugadores asignados a este equipo todavía.
          </div>
        } @else {
          <div class="relative z-10 flex flex-col gap-3">
            @for (row of rows(); track row.key) {
              <div
                class="grid items-start justify-items-center gap-2"
                [class]="row.players.length === 1 ? 'grid-cols-1' : row.players.length === 2 ? 'grid-cols-2 px-3' : 'grid-cols-3'"
              >
                @for (p of row.players; track p.id) {
                  @let picked = mk ? slip.has(mk.id, p.id) : false;
                  @let isGk = row.key === 'GK';
                  @let staked = mk ? ctx.staked(mk.id, p.id) : 0;
                  <button
                    type="button"
                    class="group flex min-h-11 w-full max-w-[118px] flex-col items-center rounded-2xl px-1 py-0.5 text-center transition duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55"
                    [disabled]="!mk || !st.open"
                    [attr.aria-pressed]="picked"
                    [attr.aria-label]="p.name + (isGk ? ' (Arquero)' : '') + (mk ? ' · ' + shortLabel(mk.type) + ' · apostado ' + ctx.stakedText(mk.id, p.id) : '')"
                    (click)="mk && pick(mk.id, p.id)"
                  >
                    <!-- Camiseta SVG con dorsal -->
                    <span class="relative inline-flex items-center justify-center drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]">
                      <svg class="h-9 w-10" viewBox="0 0 48 44" aria-hidden="true">
                        <path
                          d="M15 4 L20 7 Q24 9 28 7 L33 4 L44 12 L39 21 L34 18 L34 40 L14 40 L14 18 L9 21 L4 12 Z"
                          [attr.fill]="isGk ? gkKitColor() : activeTeamColor()"
                          stroke="rgba(255,255,255,0.9)"
                          stroke-width="1.8"
                          stroke-linejoin="round"
                        />
                        <path d="M19 6 Q24 11 29 6" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.6" />
                      </svg>
                      <span
                        class="pointer-events-none absolute inset-0 flex items-center justify-center pt-1 font-display text-[12px] font-extrabold text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]"
                      >
                        {{ p.shirt_number ?? '•' }}
                      </span>
                      @if (isGk) {
                        <span class="absolute -top-1 -right-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-ink shadow">
                          ARQ
                        </span>
                      }
                    </span>

                    <!-- Nombre del jugador -->
                    <span class="mt-0.5 line-clamp-1 max-w-full rounded-full bg-black/35 px-2 py-0.5 text-[11px] leading-tight font-bold text-white">
                      {{ p.name }}
                    </span>

                    <!-- Píldora de apuesta / multiplicador estimado -->
                    @if (mk) {
                      <span
                        class="mt-1 flex min-h-8 w-full max-w-[90px] flex-col items-center justify-center rounded-xl border px-2 py-1 leading-none transition"
                        [class]="
                          picked
                            ? 'border-white/50 bg-lime text-white shadow-[0_6px_16px_-4px_rgb(242_98_0/0.9)] anim-pop'
                            : 'border-white/15 bg-[#1b2434]/95 text-amber-300'
                        "
                      >
                        <span class="flex items-center gap-1 font-display text-[12.5px] font-extrabold tabular-nums">
                          @if (picked) {
                            <app-icon name="check" [size]="12" [stroke]="3" />
                          }
                          {{ ctx.oddText(mk.id, p.id) }}
                        </span>
                        @if (staked > 0) {
                          <span class="mt-0.5 text-[9.5px] font-semibold tabular-nums" [class]="picked ? 'text-white/90' : 'text-slate-300'">
                            {{ ctx.stakedText(mk.id, p.id) }}
                          </span>
                        }
                      </span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>

      <!-- Opción Autogol (cuando el mercado la permite) -->
      @if (mk && mk.allows_own_goal && ownGoalPlayer(); as og) {
        @let ogOn = slip.has(mk.id, og.id);
        <div class="flex items-center justify-between gap-2 border-t border-white/10 bg-black/25 px-3.5 py-2.5">
          <div class="min-w-0">
            <p class="text-xs font-bold text-white">¿{{ shortLabel(mk.type) }} por autogol?</p>
            <p class="text-[11px] text-emerald-100/70">Opción especial del partido · apostado {{ ctx.stakedText(mk.id, og.id) }}</p>
          </div>
          <button
            type="button"
            class="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 font-display text-xs font-extrabold transition active:scale-95 disabled:opacity-45"
            [class]="ogOn ? 'border-white/50 bg-lime text-white' : 'border-white/15 bg-[#1b2434] text-amber-300'"
            [disabled]="!st.open"
            [attr.aria-pressed]="ogOn"
            (click)="pick(mk.id, og.id)"
          >
            @if (ogOn) {
              <app-icon name="check" [size]="12" [stroke]="3" />
            }
            Autogol · {{ ctx.oddText(mk.id, og.id) }}
          </button>
        </div>
      }
    </section>
  `,
})
export class GameFormationsComponent {
  readonly game = input.required<LeagueGame>();
  readonly full = output<void>();

  protected readonly ctx = inject(MatchContext);
  protected readonly slip = inject(SlipService);

  private readonly selectedTeamOverride = signal<string | null>(null);
  private readonly selectedMarketId = signal<string | null>(null);

  protected readonly sides = computed(() => {
    const g = this.game();
    return [g.home, g.away].map((id, i) => {
      const t = this.ctx.teamById().get(id);
      const name = t?.name ?? this.ctx.team(id);
      return {
        id,
        name,
        color: this.ctx.teamColor(id),
        formation: t?.formation || '2-2-1',
        badge: `E${t?.sort_order ?? i + 1}`,
      };
    });
  });

  protected readonly selectedTeamId = computed(() => {
    const g = this.game();
    const chosen = this.selectedTeamOverride();
    if (chosen === g.home || chosen === g.away) return chosen;
    return g.home;
  });

  protected readonly activeTeamColor = computed(() => this.ctx.teamColor(this.selectedTeamId()));

  /** Color contrastante para el arquero (magenta vivo, salvo si la camiseta ya es muy similar). */
  protected readonly gkKitColor = computed(() => {
    const c = this.activeTeamColor().toLowerCase();
    return c === '#d946ef' || c === '#c026d3' ? '#f59e0b' : '#c026d3';
  });

  protected readonly playerMarkets = computed(() =>
    this.ctx.gameMarkets(this.game()).filter((m) => m.target === 'player'),
  );

  protected readonly activeMarket = computed<Market | null>(() => {
    const list = this.playerMarkets();
    if (!list.length) return null;
    const id = this.selectedMarketId();
    return list.find((m) => m.id === id) ?? list[0];
  });

  protected readonly ownGoalPlayer = computed(() => this.ctx.data()?.players.find((p) => p.is_own_goal) ?? null);

  /** Distribuye los 6 jugadores del equipo (en el modo de este partido) en filas tácticas: FWD → MID → DEF → GK. */
  protected readonly rows = computed<PitchRow[]>(() => {
    const mode = this.game().mode ?? 1;
    const teamPlayers = this.ctx.teamPlayers(this.selectedTeamId(), mode);
    if (!teamPlayers.length) return [];

    const hasExplicitPositions = teamPlayers.some((p) => !!p.position);
    const byPos = new Map<PlayerPosition, Player[]>([
      ['FWD', []],
      ['MID', []],
      ['DEF', []],
      ['GK', []],
    ]);

    if (hasExplicitPositions) {
      const unassigned: Player[] = [];
      for (const p of teamPlayers) {
        if (p.position && byPos.has(p.position)) byPos.get(p.position)!.push(p);
        else unassigned.push(p);
      }
      // Ubica jugadores nuevos sin posición en la línea con menos gente
      for (const p of unassigned) {
        if (byPos.get('GK')!.length === 0) byPos.get('GK')!.push(p);
        else if (byPos.get('DEF')!.length < 2) byPos.get('DEF')!.push(p);
        else if (byPos.get('MID')!.length < 2) byPos.get('MID')!.push(p);
        else byPos.get('FWD')!.push(p);
      }
    } else {
      // Distribución automática 6v6 (2-2-1 + GK) si aún no tienen posición guardada
      const list = [...teamPlayers];
      const gk = list.pop();
      if (gk) byPos.get('GK')!.push(gk);
      if (list.length) byPos.get('FWD')!.push(list.pop()!);
      while (list.length > 2) byPos.get('MID')!.push(list.pop()!);
      while (list.length) byPos.get('DEF')!.push(list.shift()!);
    }

    const order: { key: PlayerPosition; label: string }[] = [
      { key: 'FWD', label: 'Delantero' },
      { key: 'MID', label: 'Mediocampo' },
      { key: 'DEF', label: 'Defensa' },
      { key: 'GK', label: 'Arquero' },
    ];
    return order
      .map((r) => ({ key: r.key, label: r.label, players: byPos.get(r.key)! }))
      .filter((r) => r.players.length > 0);
  });

  protected readonly whatsappComplaintUrl = computed(() => {
    const raw = (this.ctx.data()?.match.pay_number ?? '').replace(/\D+/g, '');
    const phone = raw.length === 9 ? `51${raw}` : raw;
    const team = this.ctx.team(this.selectedTeamId());
    const modeMeta = this.ctx.modeMeta(this.game().mode ?? 1);
    const gk = this.rows().find((r) => r.key === 'GK')?.players[0]?.name;
    const text = gk
      ? `Oye, reclamo de la Copa Álvaro (${modeMeta.short}): pusieron a ${gk} de arquero en ${team} y ya están llorando 😅🧤`
      : `Oye, tengo un reclamo con mi posición en ${team} (${modeMeta.short}) en la Copa Álvaro 😅🧤`;
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(text)}`;
  });

  constructor() {
    effect(() => {
      const g = this.game();
      untracked(() => {
        if (this.selectedTeamOverride() !== g.home && this.selectedTeamOverride() !== g.away) {
          this.selectedTeamOverride.set(g.home);
        }
      });
    });
  }

  protected selectTeam(teamId: string) {
    this.selectedTeamOverride.set(teamId);
  }

  protected selectMarket(marketId: string, ev: Event) {
    this.selectedMarketId.set(marketId);
    const el = ev.currentTarget as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  protected pick(marketId: string, playerId: string) {
    if (!this.slip.toggle(marketId, playerId)) this.full.emit();
  }

  protected shortLabel(type: string) {
    return GAME_MARKET_BY_TYPE.get(type)?.label ?? type;
  }

  protected potText(marketId: string) {
    return formatSoles(this.ctx.pots().get(marketId)?.pot ?? 0);
  }

  protected countFor(marketId: string) {
    return this.slip.bets().filter((b) => b.marketId === marketId).length;
  }
}
