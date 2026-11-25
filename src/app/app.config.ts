import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { PublicApi, SupabasePublicApi } from './core/public-api';
import { MockPublicApi } from './core/mock-public-api';
import { hasSupabaseConfig } from './core/supabase.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Sin claves de Supabase en el .env, la app usa datos de prueba en memoria.
    { provide: PublicApi, useClass: hasSupabaseConfig() ? SupabasePublicApi : MockPublicApi },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
