// Capturas rápidas del tamaño de la pantalla para revisar el diseño (celular y escritorio).
// Uso: node e2e/visual.mjs  (con `npm start` corriendo) → e2e/screenshots/visual/
import { chromium, devices } from '@playwright/test';

const out = 'e2e/screenshots/visual';
const browser = await chromium.launch();
const shots = [
  ['inicio', '/'],
  ['vivo', '/p/COPA?tab=live'],
  ['entrar', '/entrar'],
  ['registro', '/registro'],
];
for (const [device, ctxOpts] of [
  ['celular', devices['Pixel 7']],
  ['escritorio', { viewport: { width: 1366, height: 900 } }],
]) {
  const ctx = await browser.newContext({ ...ctxOpts, locale: 'es-PE' });
  const page = await ctx.newPage();
  for (const [name, url] of shots) {
    await page.goto('http://localhost:4200' + url);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${device}-${name}.png` });
  }
  // Admin: Pagos
  await page.goto('http://localhost:4200/admin/login');
  await page.getByLabel('Correo').fill('organizador@copa.pe');
  await page.getByLabel('Contraseña').fill('admin123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /Pagos/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${device}-admin-pagos.png` });
  await ctx.close();
}
await browser.close();
console.log('capturas en', out);
