import { expect, Page, test } from '@playwright/test';

/**
 * Flujos completos de Copa Álvaro en modo demo (datos en el navegador).
 * Corren en celular (Pixel 7 / iPhone 13) y escritorio.
 */

const RECEIPT = 'public/brand/logo-512.png';
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/${test.info().project.name}/${name}.png`, fullPage: true, animations: 'disabled' });

/** Sin scroll horizontal (lo más típico que se rompe en celular). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(1);
}

/** Navega dentro de la app sin recargar (el modo demo guarda los datos en memoria). */
async function goInApp(page: Page, url: string) {
  await page.evaluate((u) => {
    history.pushState({}, '', u);
    dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, url);
}

async function signUpAndConfirm(page: Page, from = '/p/ABIERTA') {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const user = { email: `hincha${id}@correo.pe`, username: `hincha_${id}`.slice(0, 20), password: 'Golazo2026!' };
  await page.goto(from);
  await page.getByRole('link', { name: /Crear cuenta/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
  await page.getByLabel('Correo').fill(user.email);
  await page.getByLabel('Usuario').fill(user.username);
  await expect(page.getByText('✓ Disponible')).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByLabel('Repite la contraseña').fill(user.password);
  await page.getByRole('button', { name: /Crear cuenta/ }).click();

  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: `¡Listo, ${user.username}!` })).toBeVisible();
  await page.getByRole('button', { name: /Ir a la jornada/ }).click();
  await expect(page).toHaveURL(new RegExp(from.replace('/', '\\/')));
  return user;
}

test('inicio: marca, 3D, código y sin scroll horizontal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /La esférica no se mancha/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Copa Álvaro, inicio/ })).toBeVisible();
  await expect(page.locator('app-ball3d canvas')).toBeAttached();
  await expectNoHorizontalScroll(page);
  await shot(page, '01-inicio');

  await page.getByLabel('Código de la jornada').fill('abierta');
  await page.getByRole('button', { name: /Entrar a la jornada/ }).click();
  await expect(page).toHaveURL(/\/p\/ABIERTA/);
  await expect(page.getByRole('heading', { name: 'Entra para seguir' })).toBeVisible();
  await shot(page, '02-jornada-sin-login');
});

test('cuenta: registro con correo de confirmación y validaciones', async ({ page }) => {
  await page.goto('/registro');
  await page.getByLabel('Correo').fill('malo');
  await page.getByLabel('Usuario').fill('ab');
  await expect(page.getByText('3 a 20 caracteres: letras, números, punto o guion bajo')).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill('123');
  await page.getByLabel('Repite la contraseña').fill('123');
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await expect(page.getByRole('alert')).toContainText('correo válido');
  await expectNoHorizontalScroll(page);
  await shot(page, '03-registro');

  const user = await signUpAndConfirm(page);
  await expect(page.getByRole('button', { name: new RegExp(user.username) })).toBeVisible();

  // Usuario repetido
  await page.getByRole('button', { name: new RegExp(user.username) }).click();
  await page.getByRole('menuitem', { name: /Cerrar sesión/ }).click();
  await page.goto('/registro');
  await page.getByLabel('Usuario').fill(user.username.toUpperCase());
  await expect(page.getByText('✕ Ya está tomado, prueba otro')).toBeVisible();
});

test('cuenta: entrar, contraseña incorrecta y recuperar contraseña', async ({ page }) => {
  const user = await signUpAndConfirm(page);
  await page.getByRole('button', { name: new RegExp(user.username) }).click();
  await page.getByRole('menuitem', { name: /Cerrar sesión/ }).click();

  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('equivocada123');
  await page.getByRole('button', { name: /^Entrar/ }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await shot(page, '04-entrar-error');

  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  await page.getByLabel('Correo').fill(user.email);
  await page.getByRole('button', { name: /Enviar link/ }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear contraseña nueva' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva contraseña' })).toBeVisible();
  await page.getByLabel('Contraseña nueva').fill('NuevaClave2026');
  await page.getByLabel('Repítela').fill('NuevaClave2026');
  await page.getByRole('button', { name: /Guardar contraseña/ }).click();
  await expect(page.getByText('¡Contraseña cambiada!')).toBeVisible();

  // Con la nueva sí entra
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByRole('button', { name: new RegExp(user.username) }).click();
  await page.getByRole('menuitem', { name: /Cerrar sesión/ }).click();
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('NuevaClave2026');
  await page.getByRole('button', { name: /^Entrar/ }).click();
  await expect(page).toHaveURL(/localhost:4200\/$/);
  await expect(page.getByRole('button', { name: new RegExp(user.username) })).toBeVisible();
});

test('saldo: recarga por Plin, el admin la acredita y se apuesta con el saldo', async ({ page }) => {
  const user = await signUpAndConfirm(page);
  await expect(page.getByRole('heading', { name: 'Arma tu ticket' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saldo y recargar' })).toContainText('S/ 0');
  await expectNoHorizontalScroll(page);
  await shot(page, '05-apostar');

  // Primera roja → jugador con nombre completo, S/ 3
  await page.getByRole('button', { name: /Primera roja/ }).click();
  await expect(page.getByRole('button', { name: 'Alvaro Fabrizzio Salazar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Diego Guevara', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, '06-monto');
  await page.getByRole('button', { name: 'S/ 3', exact: true }).click();

  // Mejor equipo → Equipo 4, S/ 2
  await page.getByRole('button', { name: /Mejor equipo/ }).click();
  for (const n of [1, 2, 3, 4]) await expect(page.getByRole('button', { name: `Equipo ${n}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Equipo 4', exact: true }).click();
  await page.getByRole('button', { name: 'S/ 2', exact: true }).click();

  // ¿Cuántos palos? → 0
  await page.getByRole('button', { name: /Cuántos palos/ }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: 'S/ 1', exact: true }).click();

  // Cupón sin saldo → pide recargar lo que falta
  await page.getByRole('button', { name: /Ver cupón/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu cupón' })).toBeVisible();
  await expect(page.getByText('Te faltan S/ 6.00 de saldo')).toBeVisible();
  await shot(page, '07-cupon-sin-saldo');
  await page.getByRole('button', { name: /Recargar S\/ 6/ }).click();

  // Recarga por Plin en "Mi cuenta"
  await expect(page.getByRole('heading', { name: 'Recargar por Plin' })).toBeVisible();
  await expect(page.getByLabel('Otro monto')).toHaveValue('6');
  await page.setInputFiles('input[type=file]', RECEIPT);
  await expect(page.getByAltText('Tu captura')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '08-recarga-plin');
  await page.getByRole('button', { name: /Ya pliné S\/ 6/ }).click();
  await expect(page.getByText('Recarga de S/ 6 enviada')).toBeVisible();
  await expect(page.getByText('S/ 6 por confirmar')).toBeVisible();
  await expect(page.getByText('Por confirmar', { exact: true })).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveText(/S\/ 0\.00/);

  // Social
  await page.getByRole('tab', { name: /Social/ }).click();
  await expect(page.getByText('La esférica no se mancha, que gane el mejor')).toBeVisible();
  await page.getByLabel('Mensaje').fill('¡Vamos Equipo 4! 🔥');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('¡Vamos Equipo 4! 🔥')).toBeVisible();
  await page.getByRole('button', { name: '⚪ ¡La esférica no se mancha!' }).click();
  await expect(page.getByText('⚪ ¡La esférica no se mancha!').last()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '09-social');

  // El organizador acredita la recarga desde su vista de Pagos
  await goInApp(page, '/admin/login');
  await page.getByLabel('Correo').fill('organizador@copa.pe');
  await page.getByLabel('Contraseña').fill('demo');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Jornadas' })).toBeVisible();
  await page.getByRole('link', { name: /Pagos/ }).click();
  await expect(page.getByRole('heading', { name: /Recargas por Plin/ })).toBeVisible();
  const card = page.locator('li').filter({ hasText: user.username });
  await expect(card).toContainText('S/ 6.00');
  await expectNoHorizontalScroll(page);
  await shot(page, '10-admin-pagos');
  await card.getByRole('button', { name: /Aceptar/ }).click();
  await expect(page.getByText(`✓ Acreditado: ${user.username}`)).toBeVisible();
  await expect(card).toHaveCount(0);

  // Recién ahora hay saldo: se apuesta y se descuenta al instante
  await goInApp(page, '/p/ABIERTA?tab=mine');
  await expect(page.getByTestId('balance')).toHaveText(/S\/ 6\.00/);
  await expect(page.getByText('Acreditada', { exact: true })).toBeVisible();
  await shot(page, '11-mi-cuenta');
  await page.getByRole('button', { name: /^Apostar$/ }).first().click();
  await page.getByRole('button', { name: /Ver cupón/ }).click();
  await expect(page.getByText('Te queda')).toBeVisible();
  await page.getByRole('button', { name: /Apostar S\/ 6\.00/ }).click();
  await expect(page.getByRole('heading', { name: '¡Apuesta hecha!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saldo y recargar' })).toContainText('S/ 0');
  await shot(page, '12-apuesta-hecha');
  await page.getByRole('button', { name: /Ver mi cuenta/ }).click();
  await expect(page.getByText('En juego', { exact: true })).toBeVisible();
  await expect(page.getByText('Diego Guevara').first()).toBeVisible();

  // Cuenta en el bote en vivo
  await page.getByRole('tab', { name: /En vivo/ }).click();
  await expect(page.locator('li', { hasText: user.username }).first()).toBeVisible();
});

test('en vivo: 4 equipos, eventos de show y estadísticas', async ({ page }) => {
  await page.goto('/p/DEMO26');
  await expect(page.getByText('Minuto a minuto')).toBeVisible();
  await expect(page.getByText('Equipo 4').first()).toBeVisible();
  await expect(page.getByText('Golazo de Victor Manuel Espino')).toBeVisible();
  await expect(page.getByText('Palo de Adrian Ruiz')).toBeVisible();
  await expect(page.getByText('Blooper de Manuel Tumi')).toBeVisible();
  await expect(page.getByText('🥅 Palos')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '13-en-vivo');

  await page.goto('/p/FINAL');
  await expect(page.getByText('🏆 Cuánto cobra cada uno')).toBeVisible();
  await expect(page.getByText('Roja a Diego Guevara')).toBeVisible();
  await expect(page.getByText('Penal fallado por Alvaro Fabrizzio Salazar')).toBeVisible();
  await shot(page, '14-final');
});

test('admin: registrar roja, palo y golazo desde Eventos', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill('organizador@copa.pe');
  await page.getByLabel('Contraseña').fill('demo');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /En vivo/ }).click();
  await page.getByRole('button', { name: /^Eventos/ }).click();
  await page.getByRole('button', { name: /🥅\s*Palo/ }).click();
  await expect(page.getByText('¿Quién la estrelló en el palo?')).toBeVisible();
  await page.getByRole('button', { name: 'Braden García', exact: true }).click();
  await expect(page.getByText('Palo de Braden García').first()).toBeVisible();

  await page.getByRole('button', { name: /⚽\s*Gol$/ }).click();
  await page.getByRole('button', { name: /Gol para Equipo/ }).first().click();
  await page.getByRole('button', { name: 'Alvaro Fabrizzio Salazar', exact: true }).click();
  await page.getByRole('button', { name: /¿Fue golazo\?/ }).click();
  await expect(page.getByText('Golazo de Alvaro Fabrizzio Salazar').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '15-admin-eventos');
});
