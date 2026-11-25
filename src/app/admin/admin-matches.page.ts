import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatchFormComponent } from './match-form.component';
import { AdminApi } from '../core/admin-api';
import { MatchRow, STATUS_LABEL } from '../core/models';
import { friendlyError } from '../core/public-api';

@Component({
  selector: 'app-admin-matches',
  imports: [MatchFormComponent, RouterLink],
  template: `
    <header class="bg-slate-900 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs text-slate-400">Organizador{{ api.isDemo ? ' · demo' : '' }}</p>
          <h1 class="text-xl font-extrabold">Partidos</h1>
        </div>
        <button type="button" class="rounded-lg bg-white/10 px-3 py-1.5 text-sm" (click)="logout()">Salir</button>
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-4">
      @if (creating()) {
        <section class="card">
          <h2 class="mb-3 font-bold">Nuevo partido</h2>
          <app-match-form [cancellable]="true" (saved)="created($event)" (cancelled)="creating.set(false)" />
        </section>
      } @else {
        <button type="button" class="btn-primary w-full" (click)="creating.set(true)">+ Nuevo partido</button>
      }

      @if (error()) {
        <p class="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
      }

      <ul class="mt-4 space-y-2">
        @for (m of matches(); track m.id) {
          <li>
            <a [routerLink]="['/admin/m', m.id]" class="card flex items-center gap-3 active:bg-slate-50">
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-slate-900">{{ m.home_team }} vs {{ m.away_team }}</p>
                <p class="text-xs text-slate-500">
                  <span class="font-mono">{{ m.access_code }}</span>
                  @if (m.starts_at) {
                    · {{ fmt(m.starts_at) }}
                  }
                </p>
              </div>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" [class]="badge(m.status)">{{ label[m.status] }}</span>
            </a>
          </li>
        } @empty {
          @if (!loading()) {
            <li class="py-10 text-center text-slate-500">Aún no hay partidos. Crea el primero.</li>
          }
        }
      </ul>
    </main>
  `,
})
export class AdminMatchesPage implements OnInit {
  protected api = inject(AdminApi);
  private router = inject(Router);
  protected matches = signal<MatchRow[]>([]);
  protected loading = signal(true);
  protected creating = signal(false);
  protected error = signal<string | null>(null);
  protected label = STATUS_LABEL;

  async ngOnInit() {
    try {
      this.matches.set(await this.api.listMatches());
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  created(m: MatchRow) {
    this.router.navigate(['/admin/m', m.id], { queryParams: { tab: 'players' } });
  }

  async logout() {
    await this.api.signOut();
    this.router.navigateByUrl('/admin/login');
  }

  fmt(iso: string) {
    return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }

  badge(s: string) {
    return s === 'open' ? 'bg-emerald-100 text-emerald-800' : s === 'closed' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-700';
  }
}
