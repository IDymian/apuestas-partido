import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BetFlowComponent } from './bet-flow.component';
import { LiveBoardComponent } from './live-board.component';
import { SocialComponent } from './social.component';
import { AccountComponent } from './account.component';
import { WalletService } from '../core/wallet';
import { PublicMatchData, STATUS_LABEL } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { rememberMatch } from '../core/last-match';
import { BrandComponent } from '../ui/brand.component';
import { IconComponent, IconName } from '../ui/icon.component';
import { AccountChipComponent } from '../ui/account-chip.component';

type Tab = 'bet' | 'live' | 'social' | 'mine';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'bet', label: 'Apostar', icon: 'ticket' },
  { id: 'live', label: 'En vivo', icon: 'live' },
  { id: 'social', label: 'Social', icon: 'chat' },
  { id: 'mine', label: 'Mi cuenta', icon: 'wallet' },
];

@Component({
  selector: 'app-public-match-page',
  imports: [NgTemplateOutlet, BetFlowComponent, LiveBoardComponent, SocialComponent, AccountComponent, RouterLink, BrandComponent, IconComponent, AccountChipComponent],
  template: `
    @if (loading() && !data()) {
      <div class="mx-auto max-w-md px-4 pt-6" aria-busy="true" aria-label="Cargando jornada">
        <div class="h-10 w-40 animate-pulse rounded-2xl bg-ink/[0.06]"></div>
        <div class="mt-6 h-36 animate-pulse rounded-3xl bg-ink/[0.06]"></div>
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="mt-3 h-20 animate-pulse rounded-3xl bg-ink/[0.05]" [style.animation-delay.ms]="i * 120"></div>
        }
      </div>
    } @else if (loadError() && !data()) {
      <div class="mx-auto max-w-md p-6 text-center">
        <p class="mt-20 text-5xl">📡</p>
        <p class="mt-3 text-mute">{{ loadError() }}</p>
        <button type="button" class="btn mt-5" (click)="load()"><app-icon name="refresh" /> Reintentar</button>
      </div>
    } @else if (!data()) {
      <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center anim-in">
        <p class="text-6xl">🔒</p>
        <h1 class="mt-4 font-display text-3xl font-extrabold">Código no válido</h1>
        <p class="mt-1 text-mute">Revisa el link que te pasaron o pide el código al organizador.</p>
        <a routerLink="/" class="btn mt-6">Ingresar otro código</a>
      </div>
    } @else {
      @let d = data()!;
      <header class="sticky top-0 z-30 border-b border-ink/[0.06] bg-night/85 backdrop-blur-xl">
        <div class="mx-auto flex max-w-md items-center justify-between gap-3 px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2.5 md:max-w-2xl">
          <app-brand [size]="34" [showName]="false" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-display text-[17px] leading-tight font-extrabold">{{ d.match.title }}</p>
            <p class="flex min-w-0 items-center gap-1.5 text-xs font-bold whitespace-nowrap" [class]="statusTone()">
              @if (d.match.status === 'closed') {
                <span class="live-dot shrink-0"></span>
              }
              <span class="shrink-0">{{ statusLabel() }}</span>
              @if (startsAt()) {
                <span class="truncate font-medium text-faint">· {{ startsAt() }}</span>
              }
            </p>
          </div>
          @if (auth.user()) {
            <button
              type="button"
              class="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-lime pr-1 pl-3 font-display text-[15px] font-extrabold text-white shadow-[0_8px_20px_-8px_rgb(242_98_0/0.7)] active:scale-95"
              (click)="openRecharge(null)"
              aria-label="Saldo y recargar"
            >
              {{ wallet.balance() === null ? '…' : 'S/ ' + wallet.balance() }}
              <span class="grid h-8 w-8 place-items-center rounded-full bg-white/25"><app-icon name="wallet" [size]="16" /></span>
            </button>
          }
          <app-account-chip [next]="'/p/' + code()" [compact]="!!auth.user()" />
        </div>
      </header>

      @if (isDemo) {
        <p class="mx-auto mt-2 max-w-md px-4 text-center text-[11px] font-semibold text-gold/90 md:max-w-2xl">Modo demo: datos de prueba guardados solo en este navegador.</p>
      }

      <main class="mx-auto max-w-md px-4 pt-4 pb-36 md:max-w-2xl">
        @switch (tab()) {
          @case ('bet') {
            <div class="anim-tab" style="--from-x: -12px">
              @if (d.match.status === 'open') {
                @if (auth.user()) {
                  <app-bet-flow [data]="d" [code]="code()" (viewLive)="setTab('live')" (viewMine)="setTab('mine')" (recharge)="openRecharge($event)" />
                } @else {
                  <ng-container *ngTemplateOutlet="needLogin; context: { $implicit: 'Para apostar necesitas una cuenta. Así tu ticket queda a tu nombre y ves si lo aprobaron.' }" />
                }
              } @else {
                <section class="glass text-center">
                  <p class="text-5xl">⏱️</p>
                  <h2 class="mt-3 font-display text-2xl font-extrabold">Apuestas cerradas</h2>
                  <p class="mt-1 text-mute">{{ d.match.status === 'closed' ? 'La pelota ya rueda.' : 'La jornada terminó.' }} Mira el bote y los resultados en vivo.</p>
                  <button type="button" class="btn mt-5" (click)="setTab('live')">Ver en vivo <app-icon name="live" /></button>
                </section>
              }
            </div>
          }
          @case ('live') {
            <div class="anim-tab"><app-live-board [data]="d" [me]="auth.user()?.username ?? null" /></div>
          }
          @case ('social') {
            <div class="anim-tab">
              @if (auth.user()) {
                <app-social [code]="code()" />
              } @else {
                <ng-container *ngTemplateOutlet="needLogin; context: { $implicit: 'Entra para leer y escribir en el chat de la jornada.' }" />
              }
            </div>
          }
          @case ('mine') {
            <div class="anim-tab" style="--from-x: 12px">
              @if (auth.user()) {
                <app-account [code]="code()" [data]="d" [suggest]="rechargeAsk()" (goBet)="setTab('bet')" />
              } @else {
                <ng-container *ngTemplateOutlet="needLogin; context: { $implicit: 'Entra para ver tus tickets y si ya los aprobaron.' }" />
              }
            </div>
          }
        }
      </main>

      <ng-template #needLogin let-text>
        <section class="glass text-center anim-in">
          <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-lime to-gold text-white"><app-icon name="lock" [size]="28" /></div>
          <h2 class="mt-4 font-display text-2xl font-extrabold">Entra para seguir</h2>
          <p class="mt-1 text-mute">{{ text }}</p>
          <div class="mt-5 grid gap-2">
            <a [routerLink]="['/registro']" [queryParams]="{ next: '/p/' + code() }" class="btn">Crear cuenta <app-icon name="sparkles" /></a>
            <a [routerLink]="['/entrar']" [queryParams]="{ next: '/p/' + code() }" class="btn-ghost h-12">Ya tengo cuenta</a>
          </div>
        </section>
      </ng-template>

      <nav class="nav-bar" aria-label="Secciones de la jornada">
        <div class="nav-inner relative" role="tablist">
          <span
            class="absolute top-1.5 bottom-1.5 left-1.5 rounded-[20px] bg-lime shadow-[0_8px_24px_-6px_rgb(242_98_0/0.6)] transition-transform duration-500 ease-[var(--ease-spring)]"
            [style.width]="'calc((100% - 0.75rem) / 4)'"
            [style.transform]="'translateX(' + tabIndex() * 100 + '%)'"
            aria-hidden="true"
          ></span>
          @for (t of tabs; track t.id) {
            <button
              type="button"
              role="tab"
              class="nav-item z-10"
              [class.nav-item-on]="tab() === t.id"
              [attr.aria-selected]="tab() === t.id"
              (click)="setTab(t.id)"
            >
              <span class="relative">
                <app-icon [name]="t.icon" [size]="21" [stroke]="tab() === t.id ? 2.4 : 2" />
                @if (t.id === 'live' && d.match.status === 'closed' && tab() !== 'live') {
                  <span class="live-dot absolute -top-0.5 -right-1"></span>
                }
              </span>
              {{ t.label }}
            </button>
          }
        </div>
      </nav>
    }
  `,
})
export class PublicMatchPage implements OnDestroy {
  /** Viene de la ruta /p/:code */
  readonly code = input.required<string>();
  /** ?tab=social, etc. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });

  private api = inject(PublicApi);
  private router = inject(Router);
  protected readonly auth = inject(AuthApi);
  protected readonly wallet = inject(WalletService);
  /** Pedido de abrir la recarga en "Mi cuenta" (objeto nuevo cada vez). */
  protected readonly rechargeAsk = signal<{ amount: number | null } | null>(null);
  protected readonly isDemo = this.api.isDemo;
  protected readonly tabs = TABS;
  protected readonly data = signal<PublicMatchData | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly tab = signal<Tab>('bet');
  protected readonly tabIndex = computed(() => TABS.findIndex((t) => t.id === this.tab()));
  private unsubscribe: (() => void) | null = null;
  private firstLoad = true;

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.data()?.match.status ?? 'open']);
  protected readonly statusTone = computed(() => {
    const s = this.data()?.match.status;
    return s === 'open' ? 'text-lime' : s === 'closed' ? 'text-candy' : 'text-mute';
  });
  protected readonly startsAt = computed(() => {
    const iso = this.data()?.match.starts_at;
    if (!iso) return '';
    return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  });

  constructor() {
    effect(() => {
      const code = this.code();
      untracked(() => {
        this.unsubscribe?.();
        this.firstLoad = true;
        this.load();
        this.unsubscribe = this.api.subscribe(code, () => this.load());
      });
    });
    effect(() => {
      const t = this.tabParam();
      if (t && TABS.some((x) => x.id === t)) untracked(() => this.tab.set(t as Tab));
    });
    // Al volver a la pestaña del navegador, refresca (por si se perdió algún aviso).
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.load();
  };

  protected openRecharge(amount: number | null) {
    this.rechargeAsk.set({ amount });
    this.setTab('mine');
  }

  protected setTab(t: Tab) {
    if (t === this.tab()) return;
    const apply = () => this.tab.set(t);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply);
    else apply();
    this.router.navigate([], { queryParams: { tab: t === 'bet' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const d = await this.api.getMatch(this.code());
      this.data.set(d);
      if (d && this.firstLoad) {
        if (!this.tabParam()) this.tab.set(d.match.status === 'open' ? 'bet' : 'live');
        document.title = `${d.match.title} · Copa Álvaro`;
        rememberMatch(d.match.access_code, d.match.title);
      }
      this.firstLoad = false;
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
