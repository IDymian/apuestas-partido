import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicApi } from '../core/public-api';
import { lastMatch } from '../core/last-match';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  template: `
    <main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <p class="text-center text-6xl">⚽</p>
      <h1 class="mt-3 text-center text-3xl font-extrabold text-slate-900">Apuestas del Partido</h1>
      <p class="mt-1 text-center text-slate-600">Apuesta con tus amigos en la pichanga: goles, equipos, amarillas y más.</p>

      @if (last; as l) {
        <a [routerLink]="['/p', l.code]" class="card mt-8 flex items-center gap-3 active:bg-slate-50">
          <span class="text-2xl">🏟️</span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs text-slate-500">Volver a</span>
            <span class="block truncate font-bold text-slate-900">{{ l.title }}</span>
          </span>
          <span class="text-emerald-700">→</span>
        </a>
      }

      <form class="card" [class.mt-8]="!last" [class.mt-3]="!!last" (submit)="$event.preventDefault(); go()">
        <label for="code" class="text-sm font-semibold text-slate-700">Código de la jornada</label>
        <input
          id="code"
          class="mt-2 h-14 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-2xl tracking-[0.3em] uppercase outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="ABC123"
          autocomplete="off"
          autocapitalize="characters"
          maxlength="20"
          [value]="code()"
          (input)="code.set($any($event.target).value)"
        />
        <button type="submit" class="btn-primary mt-3 w-full" [disabled]="code().trim().length < 4">Entrar</button>
      </form>

      @if (isDemo) {
        <p class="mt-4 text-center text-xs text-slate-500">
          Modo demo · prueba con
          <a routerLink="/p/DEMO26" class="font-semibold text-emerald-700">DEMO26</a> (en vivo),
          <a routerLink="/p/ABIERTA" class="font-semibold text-emerald-700">ABIERTA</a> o
          <a routerLink="/p/FINAL" class="font-semibold text-emerald-700">FINAL</a>
        </p>
      }
      <a routerLink="/admin" class="mt-10 text-center text-xs text-slate-400">Soy el organizador</a>
    </main>
  `,
})
export class HomePage {
  private router = inject(Router);
  protected readonly isDemo = inject(PublicApi).isDemo;
  protected readonly code = signal('');
  protected readonly last = lastMatch();

  go() {
    const c = this.code().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length >= 4) this.router.navigate(['/p', c]);
  }
}
