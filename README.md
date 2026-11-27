# Copa Álvaro ⚽🎂

> **La esférica no se mancha.**

App web (PWA) para el partido de la Copa Álvaro: cada amigo crea su cuenta, **recarga saldo por Plin**,
apuesta de S/ 1 a S/ 5 en **138 mercados** (por partido y de toda la liga: goles, rojas, palos, golazos, penales, bloopers, campeón…),
mira el **bote en vivo** y comenta en **Social**. Se usa sobre todo en el celular.

- **Frontend:** Angular 21 (standalone + signals), Tailwind 4, three.js (escena 3D del inicio), PWA.
- **Backend:** Supabase (Postgres + RLS, Auth con correo, Storage, Realtime).
- **Diseño:** blanco y naranja. Ver [DESIGN.md](DESIGN.md).

> La app necesita **Supabase** (ver "Supabase" más abajo). Para probar en tu PC sin Supabase existe
> `npm run start:mock` (datos en memoria, solo para desarrollo y pruebas; nunca se despliega).

## Cómo se ve (estilo casa de apuestas)

- **Partidos:** al abrir la app aparece la jornada activa con los 6 partidos como "Próximos", cada uno con botones
  **1 · X · 2** que muestran **cuánto se le ha apostado** a cada opción. **Todo es por bote:** lo apostado a un mercado se
  reparte entre los que aciertan, en proporción a lo que apostaron. Tocando el partido se abren sus **19 apuestas**.
- **Especiales:** las apuestas de toda la liga (campeón, último, primera roja, palo, golazo, penales, bloopers…).
- **Tabla:** marcadores, fixture, tabla de posiciones, botes y apuestas de todos.
- **Cupón:** tocar una cuota la agrega (S/ 1); en el cupón eliges S/ 1–5 por selección y apuestas con tu saldo.
- **En vivo:** vacío hasta que el organizador pone un partido en vivo (Admin → Eventos → "Poner en vivo"). Ahí aparecen
  el marcador, las jugadas y las apuestas de ese partido que siguen abiertas.
- Encabezado con **saldo** y botón **Depositar** (recarga por Plin) siempre a la vista.

**Apuestas de cada partido (19):** ganador (1 · X · 2), goles en el partido (0–5+), primer gol, último gol, primer autogol,
primera amarilla, primera roja, primer palo, primer golazo, primer penal cometido, primer penal fallado, primer blooper,
primer piscinazo, primera huacha y ¿habrá palo / penal / roja / golazo / autogol? (Sí / No). Más las 24 generales de la jornada.

**Cuándo se cierra cada apuesta:** las de un partido, cuando termina; en vivo, los "primer…" y "¿habrá…?" se cierran apenas
pasa ese evento. Las de toda la jornada (especiales), cuando empieza el primer partido. Lo valida la base de datos.

---

## Cómo funciona

### 1. Cuenta (correo + usuario + contraseña)

1. **Crear cuenta** (`/registro`): correo, usuario único (3–20 letras, números, `.` o `_`) y contraseña de 8 o más caracteres.
   El usuario se valida en vivo ("✓ Disponible").
2. Llega un **correo de confirmación**. El link abre `/cuenta-confirmada` con la sesión iniciada.
3. **Entrar** (`/entrar`) con correo y contraseña. Si no confirmó el correo, aparece "Reenviar correo".
4. **Recuperar contraseña** (`/recuperar`): llega un link que abre `/nueva-clave` para escribir una contraseña nueva.

El usuario es el nombre con el que apuestas y comentas. Nadie puede apostar a nombre de otro.

### 2. Saldo por Plin (billetera)

1. En **Mi cuenta → Recargar**: eliges el monto (10, 20, 30, 50 u otro hasta S/ 500), **plineas al QR**
   y subes la captura → la recarga queda **"Por confirmar"**.
2. Al organizador le llega el aviso en **`/admin/pagos`** (sonido, vibración y notificación del navegador).
   Compara la captura con su app de Plin y toca **Aceptar** (o Rechazar con motivo; tiene "Deshacer").
3. Recién al aceptar, el monto **se suma al saldo**, y la persona lo ve al instante (tiempo real).
4. Con el saldo se hacen **todas las apuestas que quieras**: cada cupón se descuenta al momento y entra al bote.
   Si el cupón cuesta más que el saldo, la app muestra cuánto falta y un botón **"Recargar S/ X"**.
5. Si el organizador **anula un ticket** (pestaña Tickets), el monto vuelve al saldo.

> ¿Por qué no una pasarela de pago? Plin y Yape entre personas no tienen una API pública. Pasarelas como Culqi,
> Izipay o Mercado Pago piden RUC o cuenta de negocio, cobran comisión y necesitan un backend propio.
> Para un partido entre amigos, la recarga con un toque del organizador es lo más simple y seguro.

**Saldo = recargas aceptadas − tickets no anulados.** Lo calcula la base de datos (`wallet_balance`) y
`submit_ticket` lo verifica con un bloqueo por usuario, así no se puede gastar dos veces el mismo saldo.
Los premios los paga el organizador al final (Liquidación → "pagado" y resumen para WhatsApp).

### 3. Social

Chat por jornada en tiempo real (canal `chat:<CODIGO>`), con reacciones rápidas
("⚪ ¡La esférica no se mancha!", "🥅 ¡Palo!", "🔥 Golazo"…). Tiene anti-spam
(máximo 6 mensajes cada 15 segundos). Si hace falta moderar, el organizador puede borrar mensajes desde la tabla `messages` en Supabase.

### 4. La liga

- **4 equipos** (Equipo 1, 2, 3 y 4, de 5 jugadores) y los **20 jugadores de siempre**, que se cargan solos al crear una jornada.
  En las apuestas a jugador aparece el **nombre completo**.
- **Todos contra todos, uno por uno (6 partidos):** 1) E1 vs E2 · 2) E3 vs E4 · 3) E1 vs E3 · 4) E2 vs E4 · 5) E1 vs E4 · 6) E2 vs E3.
- **Tabla:** 3 puntos por ganar y 1 por empatar. Desempate: diferencia de gol, goles a favor y el orden de los equipos.
- En **Eventos** el organizador ve el partido actual: **"▶ Poner en vivo"** cuando empieza y **"⏹ Terminar partido"**
  cuando acaba (pasa al siguiente). Cada gol, tarjeta, palo, etc. queda en ese partido.

## Mercados de toda la jornada (24; cada uno tiene su bote)

| Sección | Mercados |
|---|---|
| ⚽ Goles de la liga (jugador) | Primer gol · Último gol · Pichichi · Primer cuartete (4) · Primer sextete (6) · Gol 15 · Gol 28 |
| 🏆 Liga (equipo) | **Campeón** (más puntos) · **Último de la tabla** · **Más goleador** · **Más goleado** |
| 🟨 Tarjetas (jugador) | Primera amarilla · Última amarilla · El más amonestado · **Primera roja** |
| 🎬 Show | **Primer blooper** · **Primer penal cometido** · **Primer penal fallado** · **Primer palo** · **Primer golazo** · **Primer piscinazo** (jugador) · **¿Cuántos palos habrá?** (número 0–5+) |
| 🤡 Pichanga (jugador) | Primer autogol · Primera huacha |

- **Campeón / último / más goleador / más goleado:** si hay empate exacto (puntos, diferencia y goles) → se devuelve.
- **Primer gol del partido:** si el partido termina 0-0 → se devuelve.
- **"Primer X" del show:** gana el primer jugador con ese evento en la liga. Si no ocurre → se devuelve.
- **¿Cuántos palos?:** siempre se resuelve (0 también es un resultado). 5 = "5 o más".
- **Golazo:** después de registrar un gol, el admin toca **"✨ ¿Fue golazo?"** (o lo registra aparte).

| Regla | Detalle |
|---|---|
| Monto | S/ 1 a S/ 5 por opción y mercado; máximo 20 apuestas por ticket. |
| Reparto | El bote se reparte entre los que acertaron, en proporción a lo apostado (en céntimos; el último ganador absorbe el redondeo). |
| **Nadie acierta** | **El bote se lo queda el organizador.** (Opcional: arrastre a otro mercado.) |
| No ocurre | Se devuelve lo apostado. |
| Empates en "el que más…" | Gana el que **llegó primero** a esa cantidad. |
| Autogoles | Cuentan para Primer/Último gol y Gol N (gana la opción "Autogol"); no cuentan para Pichichi ni cuartete/sextete. |

La lógica está en [`src/app/domain/settlement.ts`](src/app/domain/settlement.ts) y [`timeline.ts`](src/app/domain/timeline.ts), con tests.

---

## El QR de Plin

La app muestra el QR en **Recargar**. Hay dos formas de ponerlo:

1. **Recomendada (con Supabase):** en `/admin` → la jornada → pestaña **Datos** → **QR de Plin** → elige la imagen.
   Se guarda en Supabase (bucket `pay-qr`) y queda en esa jornada; las jornadas nuevas heredan número y titular.
2. **Por defecto para todas las jornadas:** guarda la imagen del QR como **`public/pago/qr.png`**.
   Funciona también en modo demo. Si la jornada tiene un QR subido, se usa ese.
   Ojo: si el repositorio es público, la imagen también lo será.

---

## 1. Requisitos

- Node.js 22.12+ (o 24+) y npm 11.

```bash
npm install
```

## 2. Supabase

1. Crea un proyecto en <https://supabase.com> (São Paulo es la región más cercana a Lima).
2. **SQL Editor:** corre en orden los archivos de [`supabase/migrations/`](supabase/migrations/):
   `…_init.sql`, `…_jornadas.sql` y `…_copa_alvaro.sql` (o `npx supabase db push`).
3. Datos de prueba (opcional): [`supabase/seed.sql`](supabase/seed.sql) crea la jornada **DEMO26**.
4. **Authentication → Sign In / Providers → Email:** activa *Allow new users to sign up* y *Confirm email*.
5. **Authentication → URL Configuration:**
   - *Site URL*: `https://tu-app.vercel.app`
   - *Redirect URLs*: `https://tu-app.vercel.app/cuenta-confirmada`, `https://tu-app.vercel.app/nueva-clave`
     (y `http://localhost:4200/**` para probar en local).
6. **Correos (importante):** el correo integrado de Supabase solo envía a los miembros del equipo y tiene un límite bajo.
   Para que les llegue a todos tus amigos configura un SMTP propio en **Authentication → Emails → SMTP Settings**.
   Por ejemplo, [Resend](https://resend.com) tiene plan gratis: host `smtp.resend.com`, puerto `465`, usuario `resend`
   y como contraseña tu API key de Resend.
   Opcional: traduce las plantillas *Confirm signup* y *Reset password* al español.
7. **Admin:** crea tu usuario (regístrate en la app o en *Authentication → Users*) y dale permisos:

   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'tu-correo@ejemplo.com';
   ```

## 3. `.env`

```bash
cp .env.example .env    # SUPABASE_URL y SUPABASE_ANON_KEY (Project Settings → API)
```

La anon key es pública por diseño; la seguridad la dan las políticas RLS. **Nunca** pongas la `service_role` key en la app.

## 4. Correr en local

```bash
npm start                                  # http://localhost:4200
npx ng serve --host 0.0.0.0 --port 4200    # para probar desde el celular en la misma red Wi-Fi
npm run start:mock                         # sin Supabase: datos en memoria solo para desarrollo/pruebas
```

Desde el celular abre `http://<IP-de-tu-PC>:4200` (la IP la ves con `ipconfig`). Si Windows pregunta, permite Node.js en redes privadas.

## 5. Pruebas

```bash
npm test -- --watch=false   # lógica de mercados, cancha y reparto (Vitest)
npm run test:db             # migraciones, RLS, billetera, chat y RPC en un Postgres embebido (PGlite)
npm run test:e2e            # flujos en Chrome (celular Android, iPhone y escritorio) con el backend de pruebas en memoria
node e2e/visual.mjs         # capturas de diseño (celular y escritorio) en e2e/screenshots/visual
npm run check:live          # seguridad del Supabase real como usuario anónimo
```

Las pruebas e2e cubren: inicio sin scroll horizontal, registro con confirmación por correo, validaciones, entrar con
contraseña incorrecta, recuperar contraseña, apostar sin saldo → recargar por Plin → el admin acredita → apostar con
saldo, Social, en vivo con 4 equipos y eventos de show, y el registro de palo y golazo desde el admin.

## 6. Desplegar

Vercel o Netlify (ya configurados): agrega `SUPABASE_URL` y `SUPABASE_ANON_KEY` en las variables de entorno y despliega.
Recuerda correr la migración `…_copa_alvaro.sql` en Supabase **antes** de publicar esta versión.

---

## Panel del organizador (`/admin`)

| Vista / pestaña | Para qué |
|---|---|
| **💸 Pagos** (`/admin/pagos`) | Recargas por Plin por confirmar, con aviso en tiempo real, captura, **Aceptar / Rechazar** y "Deshacer". |
| Tickets | Ver los tickets y **anularlos** (el monto vuelve al saldo). |
| Eventos | Partido en juego (marcador, fixture y tabla; "Terminar y pasar al siguiente"), ⚽ Gol, 🙈 Autogol, 🟨 Amarilla, 🟥 Roja, ✨ Golazo, 🥅 Palo, 🚨 Penal, 🙅 Falla penal, 🤦 Blooper, 🏊 Piscinazo, y 🥜 Huacha. Cada evento queda en el partido en juego. Todo se edita o borra. |
| Liquidación | Ganador por mercado, reparto por persona, lo que queda para el organizador, "pagado" y resumen para WhatsApp. |
| Jugadores | Ya vienen los 20; se pueden agregar, renombrar o quitar. |
| Mercados | Activar, ordenar, renombrar, N, arrastre y pozo inicial. |
| Datos | Nombre, fecha, código, Plin (número, titular y **QR**). |

## Seguridad (resumen)

- **RLS en todas las tablas.** El público no lee ninguna tabla directo; usa funciones RPC que validan todo en la base de datos.
- `submit_ticket(code, apuestas)`: exige login, jornada abierta, montos de 1 a 5, máximo 20 apuestas, el tipo correcto por
  mercado y **saldo suficiente** (con bloqueo por usuario). El nombre y el total los pone el servidor.
- `request_deposit(monto, captura)`: exige login, monto de 1 a 500, una captura propia (`deposits/<usuario>/…`) y no repetida, y
  como máximo 5 recargas pendientes. Solo el admin puede aceptarla.
- `post_message`: login, de 1 a 500 caracteres y anti-spam. `get_messages` y `get_my_tickets` solo devuelven lo tuyo o lo de tu jornada.
- **Storage:** `receipts` es privado: cada usuario sube solo a su carpeta y solo el admin ve las capturas (URL firmada).
- **Realtime:** avisos por *broadcast* (`match:`, `chat:`, `deposits`, `wallet:<id>`) que solo dicen "algo cambió";
  los datos se vuelven a pedir por RPC.
- Contraseñas, confirmación y recuperación: Supabase Auth (incluye límite de intentos).

## Estructura

```
supabase/migrations/   esquema, RLS, RPC, storage, triggers (…_copa_alvaro.sql: cuentas, billetera, chat, mercados)
supabase/tests/        prueba de la BD con PGlite
src/app/domain/        cancha, mercados y reparto (funciones puras) + tests
src/app/core/          APIs (Supabase y demo), auth, billetera
src/app/auth/          entrar, registro, recuperar, nueva contraseña
src/app/public/        inicio, jornada: apostar, en vivo, social, mi cuenta
src/app/admin/         panel del organizador y Pagos
src/app/ui/            íconos, marca, pelota 3D, confeti, contador
e2e/                   pruebas de flujo y capturas (Playwright)
scripts/brand/         generador del logo e íconos
```
