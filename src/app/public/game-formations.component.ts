import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AvatarService } from '../core/avatars';
import { Kit } from '../core/kits';
import { Market, Player, PlayerPosition } from '../core/models';
import { SlipService } from '../core/slip';
import { BADGE_META, playerBadges } from '../domain/badges';
import { GAME_MARKET_BY_TYPE } from '../domain/game-markets';
import { LeagueGame } from '../domain/league';
import { formatSoles } from '../domain/settlement';
import { IconComponent } from '../ui/icon.component';
import { KitComponent } from '../ui/kit.component';
import { MatchContext } from './match-context';

interface PitchRow {
  key: PlayerPosition;
  players: Player[];
}

interface Half {
  id: string;
  name: string;
  formation: string;
  kit: Kit;
  ring: string;
  gkKit: Kit;
  /** Filas de arriba hacia abajo (visitante: arco arriba; local: arco abajo). */
  rows: PitchRow[];
}

/** Arquero de magenta (salvo que la camiseta ya sea magenta). */
const gkKitFor = (accent: string): Kit => {
  const c = accent.toLowerCase();
  const primary = c === '#d946ef' || c === '#c026d3' ? '#f59e0b' : '#c026d3';
  return { id: 'gk', name: 'Arquero', primary, secondary: '#ffffff', pattern: 'solid' };
};

/** Frases del tablero rotativo (glosario de la Copa). */
const BOARD_LINES = ['¡Eso, tilín!', 'Qué lechero', 'Al toque, causa', 'Se murió el payaso'];

/**
 * Vista "Formaciones" de un partido: los dos equipos en la misma cancha (6 vs 6),
 * visitante arriba y local abajo. 12 chips sin scroll horizontal en 390 px.
 */
@Component({
  selector: 'app-game-formations',
  imports: [IconComponent, KitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .grass {
      background: repeating-linear-gradient(180deg, #17602f 0 44px, #145529 44px 88px);
    }
    .worn {
      border-color: rgb(255 255 255 / 0.22);
    }
    .board-rot span {
      grid-area: 1 / 1;
      opacity: 0;
      animation: board-rot 12s infinite;
    }
    .board-rot span:nth-child(2) { animation-delay: 3s; }
    .board-rot span:nth-child(3) { animation-delay: 6s; }
    .board-rot span:nth-child(4) { animation-delay: 9s; }
    @keyframes board-rot {
      0%, 22% { opacity: 1; }
      27%, 100% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .board-rot span { animation: none; }
      .board-rot span:first-child { opacity: 1; }
    }
  `,
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

      <!-- Equipos del partido: camiseta, nombre y formación (toca para ir a su mitad) -->
      <div class="grid grid-cols-2 gap-2 p-3 pb-2" aria-label="Equipos del partido">
        @for (h of halvesByRole(); track h.id) {
          <button
            type="button"
            class="flex min-h-13 items-center gap-2.5 rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-left text-white transition duration-150 active:scale-[0.98]"
            [attr.aria-label]="'Ver ' + h.name + ' en la cancha'"
            (click)="scrollTo(h.id)"
          >
            <app-kit class="h-8 w-9 shrink-0" [kit]="h.kit" outline="rgba(255,255,255,0.9)" />
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate text-[13px] font-extrabold">{{ h.name }}</span>
              <span class="block text-[11px] font-semibold text-emerald-100/75">{{ h.formation }} · 6v6</span>
            </span>
          </button>
        }
      </div>

      <!-- Selector horizontal de mercado a jugador -->
      @if (playerMarkets().length) {
        <div class="tab-scroller no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-white/10 px-3" role="tablist" aria-label="Mercado en cancha">
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

      <!-- Tableros de publicidad al 70%: un tablero por equipo de la jornada + uno rotativo -->
      <div class="flex gap-1 overflow-hidden bg-[#092414] px-2 py-1.5 opacity-70" aria-hidden="true">
        @for (b of boards(); track b) {
          <span class="min-w-0 flex-1 truncate rounded bg-white px-1 py-0.5 text-center font-display text-[10px] font-extrabold tracking-wider text-[#0d331c]">
            {{ b }}
          </span>
        }
        <span class="board-rot grid min-w-0 flex-1 rounded bg-lime px-1 py-0.5 text-center font-display text-[10px] font-extrabold tracking-wide text-white">
          @for (l of boardLines; track l) {
            <span class="truncate">{{ l }}</span>
          }
        </span>
      </div>

      <!-- Cancha completa: grass de dos tonos y líneas gastadas (HTML: el círculo central nunca se ovala) -->
      <div class="grass relative px-1.5 py-2">
        <div class="worn pointer-events-none absolute inset-1.5 rounded-md border-[1.5px]" aria-hidden="true"></div>
        <div class="worn pointer-events-none absolute top-1.5 left-1/2 h-11 w-[52%] -translate-x-1/2 border-x-[1.5px] border-b-[1.5px]" aria-hidden="true"></div>
        <div class="worn pointer-events-none absolute bottom-1.5 left-1/2 h-11 w-[52%] -translate-x-1/2 border-x-[1.5px] border-t-[1.5px]" aria-hidden="true"></div>
        <div class="worn pointer-events-none absolute inset-x-1.5 top-1/2 border-t-[1.5px] border-dashed" aria-hidden="true"></div>
        <!-- Sello de la Copa en el círculo central -->
        <div
          class="worn pointer-events-none absolute top-1/2 left-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[1.5px] bg-[#0d331c]/40"
          aria-hidden="true"
        >
          <span class="text-center font-display text-[9px] leading-tight font-extrabold tracking-[0.15em] text-white/45 uppercase">Copa<br />Álvaro</span>
        </div>

        @if (!halves().length) {
          <div class="relative z-10 py-10 text-center text-sm text-emerald-100/80">Todavía no arman los equipos, causa. Paciencia.</div>
        } @else {
          @for (h of halves(); track h.id; let top = $first) {
            <div class="relative z-10 flex flex-col gap-2 py-1.5" [class.pb-12]="top" [class.pt-12]="!top" [attr.id]="anchorId(h.id)" [attr.aria-label]="h.name">
              @if (!h.rows.length) {
                <p class="py-6 text-center text-xs text-emerald-100/80">{{ h.name }} sin jugadores asignados todavía.</p>
              }
              @for (row of h.rows; track row.key) {
                <div class="grid items-start justify-items-center gap-1" [class]="row.players.length === 1 ? 'grid-cols-1' : row.players.length === 2 ? 'grid-cols-2 px-8' : 'grid-cols-3'">
                  @for (p of row.players; track p.id) {
                    @let picked = mk ? slip.has(mk.id, p.id) : false;
                    @let isGk = row.key === 'GK';
                    @let staked = mk ? ctx.staked(mk.id, p.id) : 0;
                    @let kit = isGk ? h.gkKit : h.kit;
                    @let ring = isGk ? h.gkKit.primary : h.ring;
                    @let badge = badges().get(p.id);
                    <button
                      type="button"
                      class="group flex min-h-11 w-full max-w-[112px] flex-col items-center rounded-2xl px-0.5 py-0.5 text-center transition duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55"
                      [disabled]="!mk || !st.open"
                      [attr.aria-pressed]="picked"
                      [attr.aria-label]="
                        p.name + (isGk ? ' (Arquero)' : '') + (badge ? ' · ' + badgeMeta[badge].label : '') + (mk ? ' · ' + shortLabel(mk.type) + ' · apostado ' + ctx.stakedText(mk.id, p.id) : '')
                      "
                      (click)="mk && pick(mk.id, p.id)"
                    >
                      @let av = avatars.urlFor(p);
                      <span class="relative inline-flex drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]">
                        @if (av) {
                          <!-- Avatar: círculo de 44 px, anillo del equipo y hombros con su camiseta -->
                          <span class="relative block h-11 w-11 overflow-hidden rounded-full border-2 bg-night-3" [style.border-color]="ring">
                            <app-kit class="absolute inset-0 h-full w-full" shape="shoulders" [kit]="kit" outline="#1b1210" />
                            <img
                              class="absolute inset-0 h-full w-full object-cover"
                              [src]="av"
                              alt=""
                              width="44"
                              height="44"
                              loading="lazy"
                              decoding="async"
                              (error)="avatars.markBroken(av)"
                            />
                          </span>
                          <span
                            class="absolute -right-1.5 -bottom-1 grid h-4 min-w-4 place-items-center rounded-full border border-white/80 px-1 font-display text-[9.5px] font-extrabold text-white tabular-nums shadow"
                            [style.background]="ring"
                          >
                            {{ p.shirt_number ?? '•' }}
                          </span>
                        } @else {
                          <!-- Camiseta con dorsal (sin avatar o si el manifiesto no carga) -->
                          <app-kit class="h-9 w-10" [kit]="kit" outline="rgba(255,255,255,0.9)" />
                          <span
                            class="pointer-events-none absolute inset-0 flex items-center justify-center pt-1 font-display text-[12px] font-extrabold text-white tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]"
                          >
                            {{ p.shirt_number ?? '•' }}
                          </span>
                        }
                        @if (isGk) {
                          <span class="absolute -top-1 -right-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-ink shadow">ARQ</span>
                        }
                        @if (badge) {
                          <span class="absolute -top-1 -left-2 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] shadow" [attr.title]="badgeMeta[badge].label">
                            {{ badgeMeta[badge].emoji }}
                          </span>
                        }
                      </span>

                      <span class="mt-0.5 line-clamp-1 max-w-full rounded-full bg-black/40 px-1.5 py-0.5 text-[10.5px] leading-tight font-bold text-white">
                        {{ p.name }}
                      </span>

                      <!-- Pago estimado -->
                      @if (mk) {
                        <span
                          class="mt-0.5 flex min-h-7 w-full max-w-[84px] flex-col items-center justify-center rounded-xl border px-1.5 py-0.5 leading-none transition"
                          [class]="picked ? 'border-white/50 bg-lime text-white shadow-[0_6px_16px_-4px_rgb(242_98_0/0.9)] anim-pop' : 'border-white/15 bg-[#1b2434]/95 text-amber-300'"
                        >
                          <span class="flex items-center gap-1 font-display text-[12px] font-extrabold tabular-nums">
                            @if (picked) {
                              <app-icon name="check" [size]="11" [stroke]="3" />
                            }
                            {{ ctx.oddText(mk.id, p.id) }}
                          </span>
                          @if (staked > 0) {
                            <span class="mt-0.5 text-[9px] font-semibold tabular-nums" [class]="picked ? 'text-white/90' : 'text-slate-300'">
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
  protected readonly avatars = inject(AvatarService);
  protected readonly badgeMeta = BADGE_META;
  protected readonly boardLines = BOARD_LINES;
  private readonly uid = Math.random().toString(36).slice(2, 8);

  private readonly selectedMarketId = signal<string | null>(null);

  /** Local y visitante, en ese orden (para las tarjetas de arriba). */
  protected readonly halvesByRole = computed<Half[]>(() => {
    const g = this.game();
    const mode = g.mode ?? 1;
    return [g.home, g.away].map((id, i) => {
      const t = this.ctx.teamById().get(id);
      const ring = this.ctx.teamColor(id);
      const rows = this.rowsOf(this.ctx.teamPlayers(id, mode));
      return {
        id,
        name: t?.name ?? this.ctx.team(id),
        formation: t?.formation || '2-2-1',
        kit: this.ctx.teamKit(id),
        ring,
        gkKit: gkKitFor(ring),
        // Local (i = 0) ataca hacia arriba: delanteros arriba, arquero abajo. Visitante al revés.
        rows: i === 0 ? rows : [...rows].reverse(),
      };
    });
  });

  /** Mitades de la cancha de arriba hacia abajo: visitante, local. */
  protected readonly halves = computed(() => {
    const [home, away] = this.halvesByRole();
    return home.rows.length || away.rows.length ? [away, home] : [];
  });

  protected readonly boards = computed(() => this.ctx.orderedTeams().slice(0, 3).map((t) => t.name.replace(/\s*FC$/i, '').toUpperCase()));

  protected readonly badges = computed(() => playerBadges(this.ctx.data()?.events ?? []));

  protected readonly playerMarkets = computed(() => this.ctx.gameMarkets(this.game()).filter((m) => m.target === 'player'));

  protected readonly activeMarket = computed<Market | null>(() => {
    const list = this.playerMarkets();
    if (!list.length) return null;
    const id = this.selectedMarketId();
    return list.find((m) => m.id === id) ?? list[0];
  });

  protected readonly ownGoalPlayer = computed(() => this.ctx.data()?.players.find((p) => p.is_own_goal) ?? null);

  protected readonly whatsappComplaintUrl = computed(() => {
    const raw = (this.ctx.data()?.match.pay_number ?? '').replace(/\D+/g, '');
    const phone = raw.length === 9 ? `51${raw}` : raw;
    const modeMeta = this.ctx.modeMeta(this.game().mode ?? 1);
    const gks = this.halvesByRole()
      .map((h) => {
        const gk = h.rows.find((r) => r.key === 'GK')?.players[0]?.name;
        return gk ? `${gk} en ${h.name}` : null;
      })
      .filter(Boolean);
    const text = gks.length
      ? `Oye, reclamo de la Copa Álvaro (${modeMeta.short}): pusieron de arquero a ${gks.join(' y a ')} y ya están llorando 😅🧤`
      : `Oye, tengo un reclamo con mi posición en la Copa Álvaro (${modeMeta.short}) 😅🧤`;
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(text)}`;
  });

  /** Filas tácticas de un equipo, de delanteros a arquero. */
  private rowsOf(teamPlayers: Player[]): PitchRow[] {
    if (!teamPlayers.length) return [];
    const byPos = new Map<PlayerPosition, Player[]>([
      ['FWD', []],
      ['MID', []],
      ['DEF', []],
      ['GK', []],
    ]);
    if (teamPlayers.some((p) => !!p.position)) {
      for (const p of teamPlayers) {
        if (p.position && byPos.has(p.position)) byPos.get(p.position)!.push(p);
        // Sin posición: a la línea con menos gente
        else if (!byPos.get('GK')!.length) byPos.get('GK')!.push(p);
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
    return (['FWD', 'MID', 'DEF', 'GK'] as const).map((key) => ({ key, players: byPos.get(key)! })).filter((r) => r.players.length > 0);
  }

  protected anchorId(teamId: string) {
    return `pitch-${this.uid}-${teamId}`;
  }

  protected scrollTo(teamId: string) {
    document.getElementById(this.anchorId(teamId))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  protected selectMarket(marketId: string, ev: Event) {
    this.selectedMarketId.set(marketId);
    (ev.currentTarget as HTMLElement | null)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
