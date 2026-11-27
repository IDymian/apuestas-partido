import { Component, computed, inject, output, signal } from '@angular/core';
import { SECTIONS } from '../core/models';
import { AuthApi } from '../core/auth';
import { SlipService } from '../core/slip';
import { MatchContext } from './match-context';
import { GameCardComponent } from './game-card.component';
import { MarketOptionsComponent } from './market-options.component';
import { LiveBoardComponent } from './live-board.component';
import { MARKET_ICON } from './market-utils';
import { IconComponent } from '../ui/icon.component';
import { formatSoles } from '../domain/settlement';

type View = 'games' | 'specials' | 'table';

/** Inicio de la jornada: partidos, especiales de la liga y tabla. */
@Component({
  selector: 'app-lobby',
  imports: [GameCardComponent, MarketOptionsComponent, LiveBoardComponent, IconComponent],
  template: `
    <!-- Barra de estado de la jornada: reemplaza el hero para dejar ver más partidos -->
    <section class="anim-in">
      @let lg = ctx.liveGame();
      <div class="glass flex items-center gap-3 px-3 py-2">
        <span class="grid h-9 shrink-0 place-items-center rounded-xl bg-night-3 px-2 font-display text-[11px] font-extrabold tracking-[0.12em] text-lime">{{ ctx.code() || 'COPA' }}</span>
        <div class="min-w-0 flex-1 leading-tight">
          <p class="flex items-center gap-1.5 truncate text-[13px] font-extrabold">
            @if (lg) {
              <span class="live-dot"></span>
              En vivo · Partido {{ lg.number }}
            } @else {
              Próximos partidos
            }
          </p>
          <p class="truncate text-[11px] text-mute">{{ gameCount() }} partidos · {{ marketsCount() }} mercados</p>
        </div>
        <div class="shrink-0 text-right leading-tight">
          <p class="text-[11px] font-bold tracking-wide text-mute uppercase">Bote</p>
          <p class="font-display text-[15px] font-extrabold tabular-nums">{{ totalPot() }}</p>
        </div>
      </div>
    </section>

    <!-- Vistas -->
    <div class="sticky top-[calc(3.75rem+env(safe-area-inset-top))] z-20 -mx-4 mt-2.5 bg-night px-4 py-1.5 backdrop-blur-xl" role="tablist" aria-label="Vistas">
      <div class="grid grid-cols-3 rounded-2xl bg-ink/[0.05] p-1">
        @for (v of views; track v.id) {
          <button type="button" role="tab" class="h-9 rounded-xl text-sm font-bold transition" [class]="view() === v.id ? 'bg-white text-ink shadow-sm' : 'text-mute'" [attr.aria-selected]="view() === v.id" (click)="view.set(v.id)">
            {{ v.label }}
          </button>
        }
      </div>
    </div>

    @switch (view()) {
      @case ('games') {
        @if (upcoming().length) {
          <div class="mt-1 space-y-2">
            @for (g of upcoming(); track g.number; let i = $index) {
              <app-game-card class="block anim-in" [style.--i]="i" [game]="g" (open)="ctx.sheetGame.set(g.number)" (full)="full.emit()" />
            }
          </div>
        }
        @if (played().length) {
          <h3 class="mt-5 mb-1.5 px-1 text-sm font-extrabold tracking-wide text-mute uppercase">Finalizados</h3>
          <div class="space-y-2">
            @for (g of played(); track g.number) {
              <app-game-card class="block" [game]="g" (open)="ctx.sheetGame.set(g.number)" />
            }
          </div>
        }
        <button type="button" class="mt-3 flex w-full items-center gap-3 rounded-3xl border border-dashed border-lime/40 bg-lime/5 p-3 text-left" (click)="view.set('specials')">
          <span class="text-2xl">🏆</span>
          <span class="min-w-0 flex-1">
            <span class="block font-bold">Especiales de la liga</span>
            <span class="block text-xs text-mute">Toda la jornada: campeón, primera roja, primer palo, golazo, penales y más</span>
          </span>
          <app-icon name="next" class="text-lime" />
        </button>
      }

      @case ('specials') {
        @if (leagueClosed()) {
          <p class="mt-3 flex items-center gap-2 rounded-2xl bg-ink/[0.05] p-3 text-sm text-mute"><app-icon name="lock" [size]="16" /> La liga ya empezó: los especiales ya no reciben apuestas.</p>
        }
        @for (sec of sections(); track sec.id) {
          <h3 class="mt-5 mb-2 px-1 font-display text-lg font-extrabold">{{ sec.icon }} {{ sec.label }} <span class="text-xs font-semibold text-faint">· {{ sec.blurb }}</span></h3>
          <div class="space-y-2">
            @for (m of sec.markets; track m.id) {
              @let isOpen = open() === m.id;
              @let picked = countFor(m.id);
              <article class="glass p-0" [class.border-lime/40]="picked > 0">
                <button type="button" class="flex w-full items-center gap-3 p-3.5 text-left" (click)="open.set(isOpen ? null : m.id)" [attr.aria-expanded]="isOpen">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-3 text-lg">{{ icon(m.type) }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold leading-tight">{{ m.name }}</span>
                    <span class="block text-xs text-mute">bote {{ pot(m.id) }}</span>
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
  protected readonly views: { id: View; label: string }[] = [
    { id: 'games', label: 'Partidos' },
    { id: 'specials', label: 'Especiales' },
    { id: 'table', label: 'Tabla' },
  ];
  protected readonly view = signal<View>('games');
  protected readonly open = signal<string | null>(null);

  protected readonly upcoming = computed(() => (this.ctx.league()?.games ?? []).filter((g) => g.status !== 'played').sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || a.number - b.number));
  protected readonly played = computed(() => (this.ctx.league()?.games ?? []).filter((g) => g.status === 'played'));
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

  protected countFor(marketId: string) {
    return this.slip.bets().filter((b) => b.marketId === marketId).length;
  }
  protected icon(type: string) {
    return MARKET_ICON[type] ?? '🎲';
  }
  protected pot(marketId: string) {
    return formatSoles(this.ctx.pots().get(marketId)?.pot ?? 0);
  }
}
