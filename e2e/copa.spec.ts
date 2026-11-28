import { expect, Page, test } from '@playwright/test';

/**
 * Flujos de Copa Álvaro con el backend de pruebas en memoria (una jornada "COPA", nada jugado todavía).
 * Corren en celular (Pixel 7 / iPhone 13) y escritorio.
 */

const RECEIPT = 'public/brand/logo-512.png';
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/${test.info().project.name}/${name}.png`, animations: 'disabled' });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(1);
}

/** Navega dentro de la app sin recargar (el backend de pruebas guarda los datos en memoria). */
async function goInApp(page: Page, url: string) {
  await page.evaluate((u) => {
    history.pushState({}, '', u);
    dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, url);
}

const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

/** Cuenta de prueba con S/ 50 de saldo. */
async function loginTest(page: Page) {
  await page.goto('/entrar?next=/p/COPA');
  await page.getByLabel('Correo').fill('prueba@copaalvaro.pe');
  await page.getByLabel('Contraseña', { exact: true }).fill('prueba123');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page).toHaveURL(/\/p\/COPA/);
  await expect(page.getByRole('button', { name: 'Mi saldo' })).toContainText('S/ 50');
}

async function adminLogin(page: Page) {
  await goInApp(page, '/admin/login');
  await page.getByLabel('Correo').fill('organizador@copa.pe');
  await page.getByLabel('Contraseña').fill('admin123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Jornadas' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Los confirm() del panel del organizador se aceptan.
  page.on('dialog', (d) => d.accept());
});

test('inicio: portada, entra a la jornada con Partido 1, descanso y "En vivo" vacío', async ({ page }) => {
  await page.goto('/');
  // La portada es la landing (no salta sola); se entra con el botón.
  await expect(page.getByRole('heading', { name: 'La esférica no se mancha' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '00-portada');
  await page.getByRole('link', { name: /Entrar a la Copa/ }).click();
  await expect(page).toHaveURL(/\/p\/COPA/);
  await expect(page.getByText('6 partidos · 125 mercados')).toBeVisible();
  await expect(page.getByText('Partido 1 · Próximo')).toBeVisible();
  await expect(page.getByText('Partido 4 · Próximo')).toBeVisible();
  await expect(page.getByText('Modo 3 · Draft de goleadores')).toBeVisible();
  await expect(page.getByText('Calentando el asiento · espera al ganador')).toBeVisible();
  // Todo es por bote: cada opción conserva el apostado accesible
  await expect(page.getByRole('button', { name: /^Gana Equipo 1 · apostado S\/ 0/ }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, '01-partidos');

  await tab(page, /En vivo/).click();
  await expect(page.getByRole('heading', { name: 'Todavía no sueltan el balón' })).toBeVisible();
});

test('cupón con apuestas desde Formaciones, Populares y Especiales; se ve en Mi perfil', async ({ page }) => {
  await loginTest(page);
  await page.getByRole('button', { name: /^Gana Equipo 1 · apostado/ }).first().click();
  await page.getByRole('button', { name: 'Ver mercados del partido 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('¿Habrá palo?');
  await dialog.getByRole('button', { name: /¿Habrá penal\? · Sí · apostado/ }).click();

  // Pestaña Formaciones (cancha 6v6 + link WhatsApp de reclamo)
  await dialog.getByRole('tab', { name: 'Formaciones' }).click();
  await expect(dialog.getByText('Alineación al ojo')).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Reclamar en WhatsApp/ })).toBeVisible();
  // Los dos equipos en la misma cancha: 12 chips, sin scroll horizontal
  await expect(dialog.getByRole('button', { name: / · Primer gol · apostado/ })).toHaveCount(12);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: /^Nicolas · Primer gol/ }).click();
  await shot(page, '02-formaciones');

  // Pestaña Jugadores (tabla responsiva)
  await dialog.getByRole('tab', { name: 'Jugadores' }).click();
  await expect(dialog.getByRole('region', { name: 'Apuestas por jugador del partido' })).toBeVisible();
  await shot(page, '02b-jugadores');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByRole('tab', { name: 'Makanakis' }).click();
  await page.getByRole('button', { name: /El más leñero/ }).click();
  await page.getByRole('button', { name: /^Digetto · apostado/ }).click();

  await page.getByRole('button', { name: /Ver ticket/ }).click();
  await expect(page.getByRole('heading', { name: /Ticket \(4\)/ })).toBeVisible();
  await page.getByRole('group', { name: /Monto para Digetto/ }).getByRole('button', { name: 'S/ 3' }).click();
  await expectNoHorizontalScroll(page);
  await shot(page, '03-cupon');
  await page.getByRole('button', { name: /Apostar S\/ 6\.00/ }).click();
  await expect(page.getByRole('heading', { name: '¡Ticket adentro!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mi saldo' })).toContainText('S/ 44');

  // El bote se actualiza con lo apostado
  await tab(page, /Partidos/).click();
  await expect(page.getByRole('button', { name: /^Gana Equipo 1 · apostado S\/ 1/ }).first()).toBeVisible();

  // Mi perfil: datos básicos y mis apuestas (no el depósito)
  await tab(page, /Mi perfil/).click();
  await expect(page.getByText('prueba@copaalvaro.pe')).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveText('S/ 44');
  await expect(page.getByText('Gana Equipo 1').first()).toBeVisible();
  await expect(page.getByText('⏳ En juego').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Depositar por Plin' })).toHaveCount(0);
  await shot(page, '04-mi-perfil');
});

test('Social: la barra de escribir no tapa los mensajes y se puede ver el perfil de otro', async ({ page }) => {
  await loginTest(page);
  await tab(page, /Social/).click();
  for (let i = 1; i <= 6; i++) {
    await page.getByLabel('Mensaje').fill(`Mensaje ${i} de prueba`);
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(`Mensaje ${i} de prueba`)).toBeVisible();
  }
  await page.waitForTimeout(1200);
  const last = await page.getByText('Mensaje 6 de prueba').boundingBox();
  const composer = await page.getByTestId('composer').boundingBox();
  expect(last && composer && last.y + last.height <= composer.y + 1, 'el último mensaje queda por encima de la barra').toBeTruthy();
  await expectNoHorizontalScroll(page);
  await shot(page, '05-social');

  // Buscar apostador por usuario y abrir su perfil
  await page.getByLabel('Sapear apostador por usuario').fill('prue');
  await page.getByRole('button', { name: /^P\s*prueba$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Perfil de prueba' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Apuestas');
  await page.getByRole('button', { name: 'Cerrar' }).click();
});

test('registro con correo, depósito por Plin y el admin lo acredita', async ({ page }) => {
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
  await page.getByRole('button', { name: /Ir a la jornada/ }).click();

  // Sin saldo: el ticket pide depositar lo que falta
  await page.getByRole('button', { name: /^Empate · apostado/ }).first().click();
  await tab(page, /Ticket/).click();
  await expect(page.getByText('Estás misio: te faltan S/ 1.00')).toBeVisible();
  await page.getByRole('button', { name: /Recargar S\/ 1/ }).click();
  await expect(page.getByRole('heading', { name: 'Depositar por Plin' })).toBeVisible();
  await page.getByRole('button', { name: '20', exact: true }).click();
  await page.setInputFiles('input[type=file]', RECEIPT);
  await shot(page, '06-deposito');
  await page.getByRole('button', { name: /Ya pliné S\/ 20/ }).click();
  await expect(page.getByText('¡Captura enviada!')).toBeVisible();
  await page.getByRole('button', { name: 'De una' }).click();

  await adminLogin(page);
  await page.getByRole('link', { name: /Pagos/ }).click();
  const card = page.locator('li').filter({ hasText: user.username }).filter({ has: page.getByRole('button', { name: /Aceptar/ }) });
  await expect(card).toContainText('S/ 20.00');
  await card.getByRole('button', { name: /Aceptar/ }).click();
  await expect(page.getByText(`✓ Acreditado: ${user.username}`)).toBeVisible();

  await goInApp(page, '/p/COPA?tab=mine');
  await expect(page.getByTestId('balance')).toHaveText('S/ 20');
});

test('bote: en vivo, liquidar acredita la ganancia al saldo y el admin devuelve el saldo', async ({ page }) => {
  await loginTest(page);
  // Única apuesta del partido 1: S/ 5 a que gana el Equipo 1 → el bote es S/ 5
  await page.getByRole('button', { name: /^Gana Equipo 1 · apostado/ }).first().click();
  await tab(page, /Ticket/).click();
  await page.getByRole('group', { name: /Monto para Gana Equipo 1/ }).getByRole('button', { name: 'S/ 5' }).click();
  await page.getByRole('button', { name: /Apostar S\/ 5\.00/ }).click();
  await expect(page.getByRole('button', { name: 'Mi saldo' })).toContainText('S/ 45');

  // El organizador: partido 1 en vivo, gol del Equipo 1, terminar y crear partido 2 (rey de la cancha)
  await adminLogin(page);
  await page.getByRole('link', { name: /Copa Álvaro/ }).click();
  await page.getByRole('button', { name: /^Eventos/ }).click();
  await page.getByRole('button', { name: /Poner en vivo el partido 1/ }).click();
  await page.getByRole('button', { name: /Gol para Equipo 1/ }).click();
  await page.getByRole('button', { name: 'Nicolas', exact: true }).click();
  await expect(page.getByText(/Gol de Nicolas para Equipo 1/)).toBeVisible();

  await goInApp(page, '/p/COPA?tab=live');
  await expect(page.getByText(/En vivo · Partido 1/)).toBeVisible();
  await expect(page.getByText(/Ya pasó/).first()).toBeVisible();
  await shot(page, '07-en-vivo');

  await goInApp(page, '/admin');
  await page.getByRole('link', { name: /Copa Álvaro/ }).click();
  await page.getByRole('button', { name: /^Eventos/ }).click();
  await page.getByRole('button', { name: /Terminar partido 1/ }).click();
  await page.getByRole('button', { name: /\+ Crear partido 7/ }).click();
  // Crear el 7 sin ponerlo en vivo no da por jugados los pendientes (2 a 6).
  await expect(page.getByText('Partido actual · 2 de 7')).toBeVisible();

  // Liquidar: se acredita al saldo del ganador
  await page.getByRole('button', { name: /^Liquidación/ }).click();
  await page.getByRole('button', { name: /Acreditar todos los listos/ }).click();
  await expect(page.getByText(/✓ Acreditado/).first()).toBeVisible();
  await shot(page, '08-liquidacion');

  await goInApp(page, '/p/COPA?tab=mine');
  await expect(page.getByTestId('balance')).toHaveText('S/ 50');
  await expect(page.getByText(/¡Eso, tilín! Te cayeron S\/ 5\.00/)).toBeVisible();
  await expect(page.getByText('✓ ¡Eso, tilín!').first()).toBeVisible();

  // Al final, el organizador devuelve el saldo por Plin
  await goInApp(page, '/admin/pagos');
  const row = page.locator('li').filter({ hasText: 'prueba' }).filter({ has: page.getByRole('button', { name: 'Pagué' }) });
  await expect(row).toContainText('S/ 50.00');
  await row.getByRole('button', { name: 'Pagué' }).click();
  await expect(row).toContainText('S/ 0.00');
  await goInApp(page, '/p/COPA?tab=mine');
  await expect(page.getByTestId('balance')).toHaveText('S/ 0');
});

test('cuenta: contraseña incorrecta y recuperar contraseña', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill('prueba@copaalvaro.pe');
  await page.getByLabel('Contraseña', { exact: true }).fill('mala');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  await page.getByLabel('Correo').fill('prueba@copaalvaro.pe');
  await page.getByRole('button', { name: /Enviar link/ }).click();
  await page.getByRole('button', { name: 'Crear contraseña nueva' }).click();
  await page.getByLabel('Contraseña nueva').fill('NuevaClave2026');
  await page.getByLabel('Repítela').fill('NuevaClave2026');
  await page.getByRole('button', { name: /Guardar contraseña/ }).click();
  await expect(page.getByText('¡Contraseña cambiada!')).toBeVisible();
});
