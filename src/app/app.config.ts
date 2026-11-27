import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { PublicApi, SupabasePublicApi } from './core/public-api';
import { MockAdminApi, MockPublicApi } from './core/mock-backend';
import { AdminApi, SupabaseAdminApi } from './core/admin-api';
import { AuthApi, MockAuthApi, SupabaseAuthApi } from './core/auth';
import { hasSupabaseConfig } from './core/supabase.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    // Sin claves de Supabase en el .env, la app usa datos de prueba en memoria.
    { provide: PublicApi, useClass: hasSupabaseConfig() ? SupabasePublicApi : MockPublicApi },
    { provide: AdminApi, useClass: hasSupabaseConfig() ? SupabaseAdminApi : MockAdminApi },
    { provide: AuthApi, useClass: hasSupabaseConfig() ? SupabaseAuthApi : MockAuthApi },
    // Lee la sesión (y el link del correo de confirmación/recuperación) antes de mostrar la app.
    provideAppInitializer(() => {
      const auth = inject(AuthApi);
      return auth.init().catch(() => auth.ready.set(true));
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
