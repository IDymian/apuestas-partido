import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de flujo y de diseño en el navegador con el backend en memoria (sin Supabase).
 * Uso: npm run test:e2e   (levanta `npm run start:mock` en el puerto 4300)
 * Capturas de pantalla: e2e/screenshots/<proyecto>/
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4300',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  // Backend en memoria solo para pruebas (--mock); puerto aparte del servidor de desarrollo.
  webServer: {
    command: 'npm run start:mock -- --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
