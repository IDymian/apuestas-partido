import { Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BetFlowComponent } from './bet-flow.component';
import { LiveBoardComponent } from './live-board.component';
import { PublicMatchData, STATUS_LABEL } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { rememberMatch } from '../core/last-match';

type Tab = 'bet' | 'live';

@Component({
  selector: 'app-public-match-page',
  imports: [BetFlowComponent, LiveBoardComponent, RouterLink],
  template: `
    @if (loading() && !data()) {
      <div class="grid min-h-dvh place-items-center text-slate-500">Cargando jornada…</div>
    } @else if (loadError() && !data()) {
      <div class="mx-auto max-w-md p-6 text-center">
        <p class="mt-20 text-slate-700">{{ loadError() }}</p>
        <button type="button" class="btn-primary mt-4" (click)="load()">Reintentar</button>
      </div>
    } @else if (!data()) {
      <div class="mx-auto max-w-md p-6 text-center">
        <p class="mt-20 text-5xl">🔒</p>
        <h1 class="mt-3 text-xl font-bold text-slate-900">Código no válido</h1>
        <p class="mt-1 text-slate-600">Revisa el link que te pasaron o pide el código al organizador.</p>
        <a routerLink="/" class="btn-primary mt-6 inline-flex">Ingresar otro código</a>
      </div>
    } @else {
      @let d = data()!;
      <header class="bg-emerald-700 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-0 text-white">
        <div class="mx-auto max-w-md">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold uppercase tracking-wider text-emerald-100">⚽ Apuestas</span>
            <span class="rounded-full px-2 py-0.5 font-semibold" [class]="statusClass()">{{ statusLabel() }}</span>
          </div>
          <h1 class="mt-2 text-2xl leading-tight font-extrabold">
            {{ d.match.title }}
          </h1>
          @if (startsAt()) {
            <p class="text-sm text-emerald-100">{{ startsAt() }}</p>
          }
          <nav class="mt-4 grid grid-cols-2 text-sm font-semibold" role="tablist">
            <button type="button" role="tab" class="tab" [class.tab-on]="tab() === 'bet'" [attr.aria-selected]="tab() === 'bet'" (click)="tab.set('bet')">
              Apostar
            </button>
            <button type="button" role="tab" class="tab" [class.tab-on]="tab() === 'live'" [attr.aria-selected]="tab() === 'live'" (click)="tab.set('live')">
              En vivo
            </button>
          </nav>
        </div>
      </header>

      @if (isDemo) {
        <p class="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">Modo demo: sin Supabase configurado, los datos son de prueba.</p>
      }

      <main class="mx-auto max-w-md px-4 py-4">
        @if (tab() === 'bet') {
          @if (d.match.status === 'open') {
            <app-bet-flow [data]="d" [code]="code()" (viewLive)="tab.set('live')" />
          } @else {
            <section class="card text-center">
              <p class="text-4xl">⏱️</p>
              <h2 class="mt-2 text-lg font-bold">Apuestas cerradas</h2>
              <p class="mt-1 text-slate-600">
                {{ d.match.status === 'closed' ? 'La jornada ya empezó.' : 'La jornada terminó.' }} Mira el bote y los resultados en vivo.
              </p>
              <button type="button" class="btn-primary mt-4" (click)="tab.set('live')">Ver bote en vivo</button>
            </section>
          }
        } @else {
          <app-live-board [data]="d" />
        }
      </main>
    }
  `,
})
export class PublicMatchPage implements OnDestroy {
  /** Viene de la ruta /p/:code */
  readonly code = input.required<string>();

  private api = inject(PublicApi);
  protected readonly isDemo = this.api.isDemo;
  protected readonly data = signal<PublicMatchData | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly tab = signal<Tab>('bet');
  private unsubscribe: (() => void) | null = null;
  private firstLoad = true;

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.data()?.match.status ?? 'open']);
  protected readonly statusClass = computed(() => {
    const s = this.data()?.match.status;
    return s === 'open' ? 'bg-white text-emerald-800' : s === 'closed' ? 'bg-red-500 text-white' : 'bg-slate-800 text-white';
  });
  protected readonly startsAt = computed(() => {
    const iso = this.data()?.match.starts_at;
    if (!iso) return '';
    return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  });

  constructor() {
    effect(() => {
      const code = this.code();
      this.unsubscribe?.();
      this.firstLoad = true;
      this.load();
      this.unsubscribe = this.api.subscribe(code, () => this.load());
    });
    // Al volver a la pestaña del navegador, refresca (por si se perdió algún aviso).
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.load();
  };

  async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const d = await this.api.getMatch(this.code());
      this.data.set(d);
      if (d && this.firstLoad) {
        this.tab.set(d.match.status === 'open' ? 'bet' : 'live');
        document.title = `${d.match.title} · Apuestas`;
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
