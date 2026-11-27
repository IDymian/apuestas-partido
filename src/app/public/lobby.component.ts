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
import { Ball3dComponent } from '../ui/ball3d.component';
import { formatSoles } from '../domain/settlement';

type View = 'games' | 'specials' | 'table';

/** Inicio de la jornada: partidos, especiales de la liga y tabla. */
@Component({
  selector: 'app-lobby',
  imports: [GameCardComponent, MarketOptionsComponent, LiveBoardComponent, IconComponent, Ball3dComponent],
  template: `
    <!-- Banner -->
    <section class="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#ff8a1f] via-lime to-[#d13f00] text-white shadow-[0_20px_44px_-20px_rgb(242_98_0/0.8)] anim-in">
      <div class="relative z-10 max-w-[62%] p-4 pr-0">
        <p class="text-[10px] font-extrabold tracking-[0.2em] text-white/80 uppercase">Copa Álvaro</p>
        <h2 class="mt-1 font-display text-[22px] leading-tight font-extrabold">La esférica no se mancha</h2>
        <p class="mt-1 text-xs text-white/85">{{ ctx.league()?.games?.length ?? 6 }} partidos · {{ marketsCount() }} mercados · bote total {{ totalPot() }}</p>
        @if (!auth.user()) {
          <p class="mt-2 inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold">Entra para apostar</p>
        }
      </div>
      <div class="pointer-events-none absolute -top-4 -right-8 h-44 w-48" aria-hidden="true"><app-ball3d class="h-full w-full" /></div>
    </section>

    <!-- Vistas -->
    <div class="sticky top-[60px] z-20 -mx-4 mt-3 bg-night/90 px-4 py-2 backdrop-blur-xl" role="tablist" aria-label="Vistas">
      <div class="grid grid-cols-3 rounded-2xl bg-ink/[0.05] p-1">
        @for (v of views; track v.id) {
          <button type="button" role="tab" class="h-10 rounded-xl text-sm font-bold transition" [class]="view() === v.id ? 'bg-white text-ink shadow-sm' : 'text-mute'" [attr.aria-selected]="view() === v.id" (click)="view.set(v.id)">
            {{ v.label }}
          </button>
        }
      </div>
    </div>

    @switch (view()) {
      @case ('games') {
        @if (upcoming().length) {
          <h3 class="mt-3 mb-2 px-1 text-sm font-extrabold tracking-wide text-mute uppercase">{{ ctx.liveGame() ? 'En vivo y próximos' : 'Próximos partidos' }}</h3>
          <div class="space-y-2.5">
            @for (g of upcoming(); track g.number; let i = $index) {
              <app-game-card class="block anim-in" [style.--i]="i" [game]="g" (open)="ctx.sheetGame.set(g.number)" (full)="full.emit()" />
            }
          </div>
        }
        @if (played().length) {
          <h3 class="mt-6 mb-2 px-1 text-sm font-extrabold tracking-wide text-mute uppercase">Finalizados</h3>
          <div class="space-y-2.5">
            @for (g of played(); track g.number) {
              <app-game-card class="block" [game]="g" (open)="ctx.sheetGame.set(g.number)" />
            }
          </div>
        }
        <button type="button" class="mt-4 flex w-full items-center gap-3 rounded-3xl border border-dashed border-lime/40 bg-lime/5 p-4 text-left" (click)="view.set('specials')">
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
