import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    // El panel del organizador usa un tema claro; el resto, el tema noche.
    const sub = inject(Router)
      .events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => document.body.classList.toggle('theme-admin', e.urlAfterRedirects.startsWith('/admin')));
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
