import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ErrorrComponent } from './ui/errorr.component';

/** Frases de ERRORR cuando aparece de sorpresa. */
const PEEKS = ['Pasaba por acá nomás, causa.', '¿Y esa apuesta? Qué palta.', 'Ojo que el árbitro está comprado (floro).'];

/** ¿Ya apareció ERRORR en esta pantalla durante la sesión? (si no hay storage, no aparece). */
function peekAllowed(path: string): boolean {
  try {
    const key = 'errorr-peek:' + path;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ErrorrComponent],
  template: `
    @if (offline()) {
      <div class="fixed inset-x-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-[70] rounded-2xl bg-white p-3 shadow-lg ring-1 ring-candy/20" role="status">
        <app-errorr>Te quedaste sin señal, causa. Apenas vuelva el internet, seguimos.</app-errorr>
      </div>
    }
    <router-outlet />
    @if (peek(); as text) {
      <div class="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 z-[60] max-w-[16rem] rounded-2xl bg-white/95 p-2.5 shadow-lg ring-1 ring-ink/10 anim-pop" aria-hidden="true">
        <app-errorr>{{ text }}</app-errorr>
      </div>
    }
  `,
})
export class App {
  protected readonly offline = signal(typeof navigator !== 'undefined' && navigator.onLine === false);
  protected readonly peek = signal<string | null>(null);

  constructor() {
    addEventListener('online', () => this.offline.set(false));
    addEventListener('offline', () => this.offline.set(true));
    // El panel del organizador usa un tema claro; el resto, el tema noche.
    const sub = inject(Router)
      .events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = e.urlAfterRedirects;
        document.body.classList.toggle('theme-admin', url.startsWith('/admin'));
        // ERRORR aparece de sorpresa, sin abusar: 1 de cada 8 pantallas, máximo una vez por pantalla y por sesión.
        const path = url.split('?')[0];
        if (!url.startsWith('/admin') && Math.random() < 0.125 && peekAllowed(path)) {
          this.peek.set(PEEKS[Math.floor(Math.random() * PEEKS.length)]);
          setTimeout(() => this.peek.set(null), 4000);
        }
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());

    // PWA: cuando hay una versión nueva publicada, recarga para usarla
    // (si no, quien tiene la app instalada seguiría viendo la anterior).
    const sw = inject(SwUpdate);
    if (!sw.isEnabled) return;
    sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') document.location.reload();
    });
    const check = () => sw.checkForUpdate().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 10 * 60_000);
  }
}
