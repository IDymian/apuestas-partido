import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LobbyComponent } from './lobby.component';
import { LiveTabComponent } from './live-tab.component';
import { SlipComponent } from './slip.component';
import { SocialComponent } from './social.component';
import { AccountComponent } from './account.component';
import { MatchContext } from './match-context';
import { DepositSheetComponent } from './deposit-sheet.component';
import { ProfileSheetComponent } from './profile-sheet.component';
import { sound } from '../ui/sound';
import { GameSheetComponent } from './game-sheet.component';
import { balanceLabel, STATUS_LABEL } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { WalletService } from '../core/wallet';
import { SlipService } from '../core/slip';
import { rememberMatch } from '../core/last-match';
import { BrandComponent } from '../ui/brand.component';
import { IconComponent, IconName } from '../ui/icon.component';
import { AccountChipComponent } from '../ui/account-chip.component';

type Tab = 'games' | 'live' | 'slip' | 'social' | 'mine';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'games', label: 'Partidos', icon: 'home' },
  { id: 'live', label: 'En vivo', icon: 'live' },
  { id: 'slip', label: 'Cupón', icon: 'ticket' },
  { id: 'social', label: 'Social', icon: 'chat' },
  { id: 'mine', label: 'Mi perfil', icon: 'user' },
];

@Component({
  selector: 'app-public-match-page',
  providers: [MatchContext],
  imports: [GameSheetComponent, DepositSheetComponent, ProfileSheetComponent, LobbyComponent, LiveTabComponent, SlipComponent, SocialComponent, AccountComponent, RouterLink, BrandComponent, IconComponent, AccountChipComponent],
  template: `
    @if (loading() && !ctx.data()) {
      <div class="mx-auto max-w-md px-4 pt-6" aria-busy="true" aria-label="Cargando">
        <div class="h-10 w-40 animate-pulse rounded-2xl bg-ink/[0.06]"></div>
        <div class="mt-5 h-32 animate-pulse rounded-3xl bg-ink/[0.06]"></div>
        @for (i of [1, 2, 3]; track i) {
          <div class="mt-3 h-28 animate-pulse rounded-3xl bg-ink/[0.05]" [style.animation-delay.ms]="i * 120"></div>
        }
      </div>
    } @else if (loadError() && !ctx.data()) {
      <div class="mx-auto max-w-md p-6 text-center">
        <p class="mt-20 text-5xl">📡</p>
        <p class="mt-3 text-mute">{{ loadError() }}</p>
        <button type="button" class="btn mt-5" (click)="load()"><app-icon name="refresh" /> Reintentar</button>
      </div>
    } @else if (!ctx.data()) {
      <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center anim-in">
        <p class="text-6xl">🔒</p>
        <h1 class="mt-4 font-display text-3xl font-extrabold">Código no válido</h1>
        <p class="mt-1 text-mute">Revisa el link que te pasaron o pide el código al organizador.</p>
        <a routerLink="/" class="btn mt-6">Volver al inicio</a>
      </div>
    } @else {
      @let d = ctx.data()!;
      <header class="sticky top-0 z-30 border-b border-ink/[0.06] bg-white/90 backdrop-blur-xl">
        <div class="mx-auto flex max-w-md items-center justify-between gap-2 px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2.5 md:max-w-2xl">
          <app-brand [size]="34" [showName]="!auth.user()" [slogan]="false" />
          @if (auth.user()) {
            <div class="flex items-center gap-1.5">
              <button type="button" class="flex h-10 flex-col items-end justify-center rounded-xl px-2 leading-none" (click)="setTab('mine')" aria-label="Mi saldo">
                <span class="text-[10px] font-bold text-mute uppercase">Saldo</span>
                <span class="font-display text-[17px] font-extrabold tabular-nums">{{ balanceLabel(wallet.balance()) }}</span>
              </button>
              <button type="button" class="inline-flex h-10 items-center gap-1 rounded-xl bg-lime px-3 text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_rgb(242_98_0/0.7)] active:scale-95" (click)="openRecharge(null)">
                <app-icon name="wallet" [size]="16" /> Depositar
              </button>
              <app-account-chip [next]="'/p/' + code()" [compact]="true" />
            </div>
          } @else {
            <div class="flex items-center gap-1.5">
              <a [routerLink]="['/entrar']" [queryParams]="{ next: '/p/' + code() }" class="btn-ghost h-10 px-3">Entrar</a>
              <a [routerLink]="['/registro']" [queryParams]="{ next: '/p/' + code() }" class="inline-flex h-10 items-center rounded-xl bg-lime px-3 text-sm font-extrabold text-white">Registrarme</a>
            </div>
          }
        </div>
      </header>

      @if (d.match.status !== 'open') {
        <p class="mx-auto mt-2 max-w-md px-4 text-center text-xs font-bold text-candy md:max-w-2xl">{{ statusLabel() }}: las apuestas están cerradas.</p>
      }

      <main class="mx-auto max-w-md px-4 pt-3 pb-40 md:max-w-2xl">
        @switch (tab()) {
          @case ('games') {
            <div class="anim-tab"><app-lobby (full)="flash('Máximo 20 apuestas por cupón')" /></div>
          }
          @case ('live') {
            <div class="anim-tab"><app-live-tab (goGames)="setTab('games')" (full)="flash('Máximo 20 apuestas por cupón')" /></div>
          }
          @case ('slip') {
            <div class="anim-tab"><app-slip (goGames)="setTab('games')" (viewAccount)="setTab('mine')" (recharge)="openRecharge($event)" /></div>
          }
          @case ('social') {
            <div class="anim-tab">
              @if (auth.user()) {
                <app-social [code]="code()" />
              } @else {
                <section class="mt-6 flex flex-col items-center px-6 text-center anim-in">
                  <div class="grid h-20 w-20 place-items-center rounded-[28px] bg-night-3 text-lime"><app-icon name="chat" [size]="36" /></div>
                  <h2 class="mt-4 font-display text-2xl font-extrabold">Entra para comentar</h2>
                  <p class="mt-1 text-mute">El chat de la Copa es para los que tienen cuenta.</p>
                  <a [routerLink]="['/entrar']" [queryParams]="{ next: '/p/' + code() + '?tab=social' }" class="btn mt-5">Entrar</a>
                </section>
              }
            </div>
          }
          @case ('mine') {
            <div class="anim-tab">
              @if (auth.user()) {
                <app-account (goBet)="setTab('games')" />
              } @else {
                <section class="mt-6 flex flex-col items-center px-6 text-center anim-in">
                  <div class="grid h-20 w-20 place-items-center rounded-[28px] bg-night-3 text-lime"><app-icon name="user" [size]="36" /></div>
                  <h2 class="mt-4 font-display text-2xl font-extrabold">Tu cuenta</h2>
                  <p class="mt-1 text-mute">Entra para ver tu saldo, recargar por Plin y ver tus apuestas.</p>
                  <div class="mt-5 grid w-full grid-cols-2 gap-2">
                    <a [routerLink]="['/entrar']" [queryParams]="{ next: '/p/' + code() + '?tab=mine' }" class="btn-ghost h-12">Entrar</a>
                    <a [routerLink]="['/registro']" [queryParams]="{ next: '/p/' + code() + '?tab=mine' }" class="btn h-12 text-[15px]">Registrarme</a>
                  </div>
                </section>
              }
            </div>
          }
        }
      </main>

      <!-- Cupón flotante -->
      @if (slip.count() > 0 && tab() !== 'slip') {
        <button
          type="button"
          class="fixed inset-x-3 bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[26rem] items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-white shadow-[0_18px_40px_-12px_rgb(31_20_13/0.6)] anim-sheet"
          (click)="setTab('slip')"
        >
          <span class="grid h-8 min-w-8 place-items-center rounded-full bg-lime px-2 font-display font-extrabold" [class.anim-bump]="bumping()">{{ slip.count() }}</span>
          <span class="min-w-0 flex-1 text-sm font-bold">Ver cupón</span>
          <span class="font-display text-lg font-extrabold">S/ {{ slip.totalCents() / 100 }}</span>
          <app-icon name="next" [size]="18" />
        </button>
      }

      <nav class="nav-bar" aria-label="Secciones">
        <div class="nav-inner relative !grid-cols-5" role="tablist">
          <span
            class="absolute top-1.5 bottom-1.5 left-1.5 rounded-[20px] bg-lime shadow-[0_8px_24px_-6px_rgb(242_98_0/0.6)] transition-transform duration-500 ease-[var(--ease-spring)]"
            [style.width]="'calc((100% - 0.75rem) / 5)'"
            [style.transform]="'translateX(' + tabIndex() * 100 + '%)'"
            aria-hidden="true"
          ></span>
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" class="nav-item z-10 text-[10.5px]" [class.nav-item-on]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="setTab(t.id)">
              <span class="relative">
                <app-icon [name]="t.icon" [size]="21" [stroke]="tab() === t.id ? 2.4 : 2" />
                @if (t.id === 'live' && ctx.liveGame() && tab() !== 'live') {
                  <span class="live-dot absolute -top-0.5 -right-1"></span>
                }
                @if (t.id === 'slip' && slip.count() > 0) {
                  <span class="absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-candy px-1 text-[10px] font-extrabold text-white">{{ slip.count() }}</span>
                }
              </span>
              {{ t.label }}
            </button>
          }
        </div>
      </nav>

      @if (ctx.openSheet(); as g) {
        <app-game-sheet [game]="g" (closed)="ctx.sheetGame.set(null)" (full)="flash('Máximo 20 apuestas por cupón')" />
      }
      @if (ctx.profileOf(); as who) {
        <app-profile-sheet [username]="who" (closed)="ctx.profileOf.set(null)" />
      }
      @if (ctx.depositAsk(); as ask) {
        @if (auth.user()) {
          <app-deposit-sheet [suggest]="ask.amount" (closed)="ctx.depositAsk.set(null)" />
        }
      }

      @if (toast()) {
        <div class="fixed inset-x-4 bottom-44 z-50 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm font-bold text-white shadow-lg anim-pop" role="status">{{ toast() }}</div>
      }
    }
  `,
})
export class PublicMatchPage implements OnDestroy {
  /** Viene de la ruta /p/:code */
  readonly code = input.required<string>();
  /** ?tab=live, etc. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });

  private api = inject(PublicApi);
  private router = inject(Router);
  protected readonly ctx = inject(MatchContext);
  protected readonly auth = inject(AuthApi);
  protected readonly wallet = inject(WalletService);
  protected readonly slip = inject(SlipService);
  protected readonly tabs = TABS;
  protected readonly balanceLabel = balanceLabel;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly tab = signal<Tab>('games');
  protected readonly tabIndex = computed(() => TABS.findIndex((t) => t.id === this.tab()));
  protected readonly toast = signal<string | null>(null);
  protected readonly bumping = signal(false);
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.ctx.data()?.match.status ?? 'open']);
  private unsubscribe: (() => void) | null = null;

  constructor() {
    effect(() => {
      const code = this.code().toUpperCase();
      untracked(() => {
        this.ctx.code.set(code);
        this.slip.load(code);
        this.unsubscribe?.();
        this.load();
        this.unsubscribe = this.api.subscribe(code, () => this.load());
      });
    });
    effect(() => {
      const t = this.tabParam();
      if (t && TABS.some((x) => x.id === t)) untracked(() => this.tab.set(t as Tab));
    });
    effect(() => {
      if (this.slip.bump() > 0) {
        untracked(() => {
          this.bumping.set(false);
          requestAnimationFrame(() => this.bumping.set(true));
        });
      }
    });
    // ¡Gol! en el partido en vivo
    let lastGoals: number | null = null;
    effect(() => {
      const g = this.ctx.liveGame();
      const goals = g ? g.homeGoals + g.awayGoals : null;
      if (goals !== null && lastGoals !== null && goals > lastGoals) sound.goal();
      lastGoals = goals;
    });
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.load();
  };

  protected openRecharge(amount: number | null) {
    this.ctx.depositAsk.set({ amount });
  }

  protected setTab(t: Tab) {
    if (t === this.tab()) return;
    const apply = () => this.tab.set(t);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply);
    else apply();
    this.router.navigate([], { queryParams: { tab: t === 'games' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected flash(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2200);
  }

  async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const d = await this.api.getMatch(this.code());
      const first = !this.ctx.data();
      this.ctx.data.set(d);
      if (d && first) {
        document.title = `${d.match.title} · La esférica no se mancha`;
        rememberMatch(d.match.access_code, d.match.title);
      }
    } catch (e) {
      this.loadError.set(friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.unsubscribe?.();
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
