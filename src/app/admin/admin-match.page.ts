import { Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EventsTabComponent } from './events-tab.component';
import { MarketsTabComponent } from './markets-tab.component';
import { MatchFormComponent } from './match-form.component';
import { PlayersTabComponent } from './players-tab.component';
import { SettlementTabComponent } from './settlement-tab.component';
import { TicketsTabComponent } from './tickets-tab.component';
import { AdminApi } from '../core/admin-api';
import { AdminMatchData, MatchStatus, STATUS_LABEL } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';

type Tab = 'tickets' | 'events' | 'settle' | 'players' | 'markets' | 'info';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'events', label: 'Eventos' },
  { id: 'settle', label: 'Liquidación' },
  { id: 'players', label: 'Jugadores' },
  { id: 'markets', label: 'Mercados' },
  { id: 'info', label: 'Datos' },
];

@Component({
  selector: 'app-admin-match',
  imports: [RouterLink, MatchFormComponent, TicketsTabComponent, EventsTabComponent, SettlementTabComponent, PlayersTabComponent, MarketsTabComponent],
  template: `
    @if (!data()) {
      <div class="grid min-h-dvh place-items-center text-slate-500">
        @if (error()) {
          <div class="text-center">
            <p>{{ error() }}</p>
            <a routerLink="/admin" class="btn-secondary mt-3">Volver</a>
          </div>
        } @else {
          Cargando…
        }
      </div>
    } @else {
      @let d = data()!;
      <header class="bg-slate-900 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div class="mx-auto max-w-2xl">
          <div class="flex items-center justify-between gap-2">
            <a routerLink="/admin" class="text-sm text-slate-300">← Partidos</a>
            <span class="rounded-full px-2 py-0.5 text-xs font-semibold" [class]="statusBadge()">{{ statusLabel[d.match.status] }}</span>
          </div>
          <h1 class="mt-1 text-xl leading-tight font-extrabold">{{ d.match.home_team }} vs {{ d.match.away_team }}</h1>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span class="font-mono tracking-wider text-slate-300">{{ d.match.access_code }}</span>
            <button type="button" class="rounded-md bg-white/10 px-2 py-0.5 text-xs" (click)="copyLink()">{{ copied() ? '¡Link copiado!' : 'Copiar link' }}</button>
            <a [routerLink]="['/p', d.match.access_code]" target="_blank" class="rounded-md bg-white/10 px-2 py-0.5 text-xs">Ver pública ↗</a>
          </div>

          <!-- Cambio de estado -->
          <div class="mt-3 flex gap-2">
            @switch (d.match.status) {
              @case ('open') {
                <button type="button" class="flex-1 rounded-xl bg-red-500 py-2 text-sm font-bold" (click)="setStatus('closed')">🔒 Cerrar apuestas</button>
              }
              @case ('closed') {
                <button type="button" class="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-bold" (click)="setStatus('finished')">🏁 Finalizar partido</button>
                <button type="button" class="rounded-xl bg-white/10 px-3 py-2 text-sm" (click)="setStatus('open')">Reabrir</button>
              }
              @case ('finished') {
                <button type="button" class="flex-1 rounded-xl bg-white/10 py-2 text-sm" (click)="setStatus('closed')">Volver a "en juego"</button>
              }
            }
          </div>

          <nav class="no-scrollbar -mx-4 mt-3 flex overflow-x-auto px-4 text-sm font-semibold">
            @for (t of tabs; track t.id) {
              <button
                type="button"
                class="shrink-0 rounded-t-xl px-3 py-2.5"
                [class]="tab() === t.id ? 'bg-slate-100 text-slate-900' : 'text-slate-300'"
                (click)="selectTab(t.id)"
              >
                {{ t.label }}
                @if (t.id === 'tickets' && pendingCount() > 0) {
                  <span class="ml-1 rounded-full bg-amber-400 px-1.5 text-xs text-slate-900">{{ pendingCount() }}</span>
                }
              </button>
            }
          </nav>
        </div>
      </header>

      @if (error()) {
        <p class="mx-auto mt-3 max-w-2xl rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
      }

      <main class="mx-auto max-w-2xl px-4 py-4">
        @switch (tab()) {
          @case ('tickets') {
            <app-tickets-tab [data]="d" (changed)="load()" />
          }
          @case ('events') {
            <app-events-tab [data]="d" (changed)="load()" />
          }
          @case ('settle') {
            <app-settlement-tab [data]="d" (changed)="load()" />
          }
          @case ('players') {
            <app-players-tab [data]="d" (changed)="load()" />
          }
          @case ('markets') {
            <app-markets-tab [data]="d" (changed)="load()" />
          }
          @case ('info') {
            <section class="card">
              <app-match-form [match]="d.match" (saved)="load()" />
            </section>
          }
        }
      </main>
    }
  `,
})
export class AdminMatchPage implements OnDestroy {
  readonly id = input.required<string>();
  /** ?tab=… */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });

  private api = inject(AdminApi);
  private publicApi = inject(PublicApi);
  private router = inject(Router);
  protected tabs = TABS;
  protected statusLabel = STATUS_LABEL;
  protected data = signal<AdminMatchData | null>(null);
  protected error = signal<string | null>(null);
  protected copied = signal(false);
  protected tab = signal<Tab>('tickets');
  private unsubscribe: (() => void) | null = null;
  private subscribedCode = '';

  protected pendingCount = computed(() => this.data()?.tickets.filter((t) => t.status === 'pending').length ?? 0);
  protected statusBadge = computed(() => {
    const s = this.data()?.match.status;
    return s === 'open' ? 'bg-emerald-400 text-slate-900' : s === 'closed' ? 'bg-red-500' : 'bg-slate-600';
  });

  constructor() {
    effect(() => {
      const t = this.tabParam();
      if (t && TABS.some((x) => x.id === t)) this.tab.set(t as Tab);
    });
    effect(() => {
      this.id();
      this.load();
    });
  }

  async load() {
    try {
      const d = await this.api.getMatch(this.id());
      if (!d) {
        this.error.set('Partido no encontrado');
        return;
      }
      this.error.set(null);
      this.data.set(d);
      if (d.match.access_code !== this.subscribedCode) {
        this.unsubscribe?.();
        this.subscribedCode = d.match.access_code;
        this.unsubscribe = this.publicApi.subscribe(d.match.access_code, () => this.load());
      }
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  selectTab(t: Tab) {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
  }

  async setStatus(status: MatchStatus) {
    const msg: Record<MatchStatus, string> = {
      closed: '¿Cerrar las apuestas? Nadie más podrá apostar.',
      finished: '¿Finalizar el partido? Se mostrarán los resultados a todos.',
      open: '¿Reabrir las apuestas?',
    };
    if (!confirm(msg[status])) return;
    try {
      await this.api.setStatus(this.id(), status);
      await this.load();
      if (status === 'finished') this.selectTab('settle');
      if (status === 'closed' && this.tab() === 'tickets' && this.pendingCount() === 0) this.selectTab('events');
    } catch (e) {
      this.error.set(friendlyError(e));
    }
  }

  async copyLink() {
    const code = this.data()?.match.access_code;
    try {
      await navigator.clipboard.writeText(`${location.origin}/p/${code}`);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* sin portapapeles */
    }
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }
}
