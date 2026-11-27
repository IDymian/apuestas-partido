import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de flujo y de diseño en el navegador (modo demo, sin Supabase).
 * Uso: npm run test:e2e   (levanta `npm start` si no está corriendo)
 * Capturas de pantalla: e2e/screenshots/<proyecto>/
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
