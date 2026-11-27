import { expect, Page, test } from '@playwright/test';

/**
 * Flujos de Copa Álvaro en modo demo (una jornada "COPA", nada jugado todavía).
 * Corren en celular (Pixel 7 / iPhone 13) y escritorio.
 */

const RECEIPT = 'public/brand/logo-512.png';
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/${test.info().project.name}/${name}.png`, animations: 'disabled' });

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

const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

async function loginDemo(page: Page) {
  await page.goto('/entrar?next=/p/COPA');
  await page.getByRole('button', { name: 'Entrar con la cuenta demo' }).click();
  await expect(page).toHaveURL(/\/p\/COPA/);
  await expect(page.getByRole('button', { name: 'Mi saldo' })).toContainText('S/ 50');
}

async function adminLogin(page: Page) {
  await goInApp(page, '/admin/login');
  await page.getByLabel('Correo').fill('organizador@copa.pe');
  await page.getByLabel('Contraseña').fill('demo');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Jornadas' })).toBeVisible();
}

test('inicio: abre la jornada con los 6 partidos y "En vivo" vacío', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/p\/COPA/);
  await expect(page.getByText('La esférica no se mancha').first()).toBeVisible();
  for (const n of [1, 2, 3, 4, 5, 6]) await expect(page.getByText(`Partido ${n} · Próximo`)).toBeVisible();
  await expect(page.getByRole('button', { name: /Equipo 1 · cuota/ }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '01-partidos');

  await tab(page, /En vivo/).click();
  await expect(page.getByRole('heading', { name: 'No hay partidos en vivo' })).toBeVisible();
  await shot(page, '02-en-vivo-vacio');
});

test('demo: entrar con demo/demo, armar el cupón y apostar con el saldo', async ({ page }) => {
  await loginDemo(page);

  // 1 / X / 2 del partido 1 y un especial
  await page.getByRole('button', { name: /^Gana Equipo 1 · cuota/ }).first().click();
  await page.getByRole('button', { name: 'Ver mercados del partido 1' }).click();
  await expect(page.getByRole('dialog')).toContainText('Primer gol del partido');
  await page.getByRole('dialog').getByRole('button', { name: /^Adrian Ruiz · cuota/ }).click();
  await shot(page, '03-mercados-partido');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByRole('tab', { name: 'Especiales' }).click();
  await page.getByRole('button', { name: /Primera roja/ }).click();
  await page.getByRole('button', { name: /^Diego Guevara · cuota/ }).click();
  await shot(page, '04-especiales');

  // Cupón: 3 selecciones, subo una a S/ 3 → total S/ 5
  await page.getByRole('button', { name: /Ver cupón/ }).click();
  await expect(page.getByRole('heading', { name: /Cupón \(3\)/ })).toBeVisible();
  await page.getByRole('group', { name: /Monto para Diego Guevara/ }).getByRole('button', { name: 'S/ 3' }).click();
  await expect(page.getByRole('button', { name: /Apostar S\/ 5\.00/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '05-cupon');
  await page.getByRole('button', { name: /Apostar S\/ 5\.00/ }).click();
  await expect(page.getByRole('heading', { name: '¡Apuesta hecha!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mi saldo' })).toContainText('S/ 45');

  await page.getByRole('button', { name: /Ver mis apuestas/ }).click();
  await expect(page.getByText('En juego', { exact: true })).toBeVisible();
  await expect(page.getByText('Gana Equipo 1').first()).toBeVisible();
});

test('registro con correo de confirmación, recarga por Plin y el admin la acredita', async ({ page }) => {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const user = { email: `hincha${id}@correo.pe`, username: `hincha_${id}`.slice(0, 20), password: 'Golazo2026!' };
  await page.goto('/registro?next=/p/COPA');
  await page.getByLabel('Correo').fill(user.email);
  await page.getByLabel('Usuario').fill(user.username);
  await expect(page.getByText('✓ Disponible')).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByLabel('Repite la contraseña').fill(user.password);
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: `¡Listo, ${user.username}!` })).toBeVisible();
  await page.getByRole('button', { name: /Ir a la jornada/ }).click();

  // Sin saldo: el cupón pide recargar
  await page.getByRole('button', { name: /^Empate · cuota/ }).first().click();
  await tab(page, /Cupón/).click();
  await expect(page.getByText('Te faltan S/ 1.00 de saldo')).toBeVisible();
  await page.getByRole('button', { name: /Recargar S\/ 1/ }).click();
  await expect(page.getByRole('heading', { name: 'Recargar por Plin' })).toBeVisible();
  await page.getByRole('button', { name: '20', exact: true }).click();
  await page.setInputFiles('input[type=file]', RECEIPT);
  await page.getByRole('button', { name: /Ya pliné S\/ 20/ }).click();
  await expect(page.getByText('S/ 20 por confirmar')).toBeVisible();
  await shot(page, '06-recarga');

  // El organizador acredita
  await adminLogin(page);
  await page.getByRole('link', { name: /Pagos/ }).click();
  const card = page.locator('li').filter({ hasText: user.username });
  await expect(card).toContainText('S/ 20.00');
  await shot(page, '07-admin-pagos');
  await card.getByRole('button', { name: /Aceptar/ }).click();
  await expect(page.getByText(`✓ Acreditado: ${user.username}`)).toBeVisible();

  await goInApp(page, '/p/COPA?tab=mine');
  await expect(page.getByTestId('balance')).toHaveText(/S\/ 20\.00/);
});

test('admin pone en vivo el partido 1: aparece en "En vivo" y se cierran los especiales', async ({ page }) => {
  await page.goto('/p/COPA');
  await adminLogin(page);
  await page.getByRole('link', { name: /Copa Álvaro/ }).click();
  await page.getByRole('button', { name: /^Eventos/ }).click();
  await expect(page.getByText('Por empezar')).toBeVisible();
  await page.getByRole('button', { name: /Poner en vivo el partido 1/ }).click();
  await expect(page.getByText('● En vivo').first()).toBeVisible();
  await page.getByRole('button', { name: /Gol para Equipo 1/ }).click();
  await page.getByRole('button', { name: 'Victor Manuel Espino', exact: true }).click();
  await expect(page.getByText(/Gol de Victor Manuel Espino para Equipo 1/)).toBeVisible();
  await shot(page, '08-admin-en-vivo');

  await goInApp(page, '/p/COPA?tab=live');
  await expect(page.getByText(/En vivo · Partido 1/)).toBeVisible();
  await expect(page.getByText('Gol de Victor Manuel Espino (Equipo 1)')).toBeVisible();
  await expect(page.getByText('Ya hubo gol')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '09-en-vivo');

  await tab(page, /Partidos/).click();
  await page.getByRole('tab', { name: 'Especiales' }).click();
  await expect(page.getByText('La liga ya empezó: los especiales ya no reciben apuestas.')).toBeVisible();
});

test('cuenta: contraseña incorrecta y recuperar contraseña', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('Correo o usuario').fill('demo');
  await page.getByLabel('Contraseña', { exact: true }).fill('mala');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  await page.getByLabel('Correo').fill('demo@copaalvaro.pe');
  await page.getByRole('button', { name: /Enviar link/ }).click();
  await page.getByRole('button', { name: 'Crear contraseña nueva' }).click();
  await page.getByLabel('Contraseña nueva').fill('NuevaClave2026');
  await page.getByLabel('Repítela').fill('NuevaClave2026');
  await page.getByRole('button', { name: /Guardar contraseña/ }).click();
  await expect(page.getByText('¡Contraseña cambiada!')).toBeVisible();
});
