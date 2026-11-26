# Apuestas del Partido ⚽

App web para organizar apuestas entre amigos en una **jornada de triangulares** (pichanga):
3 equipos, dos en cancha y uno esperando, partiditos a un gol. Cada quien apuesta de S/ 1 a S/ 5
a un jugador, a un equipo o a un número en 15 mercados, paga por **Plin** y el organizador aprueba.
El bote de cada mercado se reparte en proporción entre los que acertaron.

- **Frontend:** Angular 21 (standalone + signals), Tailwind, PWA.
- **Backend:** Supabase (Postgres + RLS, Auth para el admin, Storage, Realtime).
- **Hosting:** Vercel (cada push a `main` se despliega solo).
- **En línea:** <https://apuestas-partido.vercel.app>

> **Modo demo:** si el `.env` no tiene claves de Supabase, la app usa datos de prueba en memoria.
> Prueba `/p/DEMO26` (en vivo), `/p/ABIERTA` (apuestas abiertas) y `/p/FINAL` (terminada).
> En `/admin` entras con cualquier correo y contraseña; los cambios se pierden al recargar.

---

## Cómo es la jornada

- Hay **3 equipos**: Equipo A, B y C (se arman ese día; en la app son genéricos).
- **Los jugadores no tienen equipo.** Es una sola lista de nombres; cada gol registra a qué equipo le cuenta.
- **Dos equipos en cancha y uno esperando.** Cada partidito es a un gol: el que recibe el gol **sale** y entra el que esperaba.
- Al empezar, el admin elige qué dos equipos arrancan.
- **Rotación sin gol** (se cansaron, lesión…): sale el equipo que elija el admin y entra el que esperaba. No cuenta como partidito ganado ni como salida, y corta la racha del que sale.
- El **minuto** se autocompleta con el tiempo desde que se cerraron las apuestas (0–300) y se puede editar. Los eventos se ordenan por minuto y, si empatan, por orden de registro.
- Si un gol queda registrado para un equipo que no estaba en cancha (por ejemplo, tras editar un evento viejo), se marca en rojo en el admin y se ignora en los mercados de equipos hasta corregirlo.

## Apuestas (cada mercado tiene su bote; se agrupan en 4 secciones)

### ⚽ Goles — a un jugador

| Mercado | `type` | Gana | Si no ocurre |
|---|---|---|---|
| Primer gol de la noche | `first_goal` | El primer gol | Sin goles → devolución |
| Último gol de la noche | `last_goal` | El último gol | Sin goles → devolución |
| Pichichi de la noche | `top_scorer` | El que mete más goles | Sin goles → devolución |
| Primer cuartete | `first_to_n_goals` (N = 4) | El primero en llegar a 4 goles | Nadie llega → devolución |
| Primer sextete | `first_to_n_goals` (N = 6) | El primero en llegar a 6 goles | Nadie llega → devolución |
| Gol número 15 | `nth_goal` (N = 15) | El que mete el gol 15 | No hay 15 goles → devolución |
| Gol número 28 | `nth_goal` (N = 28) | El que mete el gol 28 | No hay 28 goles → devolución |

### 🛡️ Equipos — a un equipo o a un número

| Mercado | `type` | Se apuesta a | Gana |
|---|---|---|---|
| Rey de la cancha | `most_wins` | Equipo | El que gana más partiditos |
| Racha más larga | `longest_streak` | Número 1–10 (10 = "10 o más") | La mayor cantidad de partiditos seguidos que ganó cualquier equipo |
| Equipo que más sale | `most_exits` | Equipo | El que sale más veces por gol |

Sin goles → devolución.

### 🟨 Amarillas — a un jugador

| Mercado | `type` | Gana |
|---|---|---|
| Primera amarilla | `first_yellow` | El primer amonestado |
| Última amarilla | `last_yellow` | El último amonestado |
| El más amonestado | `most_yellows` | El que recibe más amarillas |

Sin amarillas → devolución.

### 🤡 Pichanga — a un jugador

| Mercado | `type` | Gana |
|---|---|---|
| Primer autogol | `first_own_goal` | El primero que la mete en su propio arco |
| Primera huacha | `first_nutmeg_victim` | El primero al que **le hacen** una huacha (lo decide el organizador) |

### Reglas generales

| Regla | Detalle |
|---|---|
| Monto | S/ 1 a S/ 5 (enteros) por opción y mercado; máximo 20 apuestas por ticket. |
| Reparto | El bote se reparte entre los que acertaron, en proporción a lo apostado. Redondeo a céntimos: el último ganador absorbe la diferencia. |
| **Nadie acierta** | **El bote se lo queda el organizador.** Se avisa a los apostadores. (Opcional: en Mercados se puede configurar que pase a otro mercado.) |
| No ocurre | Se devuelve lo apostado. El pozo inicial y lo arrastrado quedan para el organizador. |
| Empates en "el que más…" | Gana el que **llegó primero** a esa cantidad. |
| Autogoles | Se registran con el jugador real y el equipo al que le cuenta el gol. **Sí** cuentan para Primer/Último gol y Gol N (ahí gana la opción especial "Autogol"). **No** cuentan para Pichichi ni cuartete/sextete. En Primer autogol gana el jugador real. |
| Misma persona | Se identifica por nombre (sin importar mayúsculas, tildes ni espacios). |

La lógica está en [`src/app/domain/timeline.ts`](src/app/domain/timeline.ts) (cancha, partiditos, rachas)
y [`src/app/domain/settlement.ts`](src/app/domain/settlement.ts) (resolvers y reparto, en céntimos), con tests.

---

## 1. Requisitos

- Node.js 22.12+ (o 24+).
- Si `npm install` falla con `Cannot read properties of null (reading 'edgesOut')`
  (bug de npm 10.9), usa npm 11: `npx npm@11 install`.

```bash
npm install            # o: npx npm@11 install
```

## 2. Crear el proyecto en Supabase

1. Entra a <https://supabase.com>, crea un proyecto (región São Paulo es la más cercana a Lima).
2. **Base de datos:** abre **SQL Editor** → *New query* y corre, **en orden**, cada archivo de
   [`supabase/migrations/`](supabase/migrations/) (primero `…_init.sql`, luego `…_jornadas.sql`).
   - Alternativa con la CLI: `npx supabase link --project-ref TU_REF` y `npx supabase db push`.
3. **Datos de prueba (opcional):** en el SQL Editor corre
   [`supabase/seed.sql`](supabase/seed.sql). Crea una jornada de ejemplo en vivo con código **DEMO26**.
4. **Auth:** en **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up*
   (solo el admin entra, y lo creas tú a mano).

## 3. Crear el usuario administrador

1. **Authentication → Users → Add user → Create new user**: tu correo y una contraseña
   (marca *Auto Confirm User*).
2. En el **SQL Editor**, dale permisos de admin (cambia el correo):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com';
   ```

Solo los usuarios que estén en la tabla `admins` pueden administrar.

## 4. Configurar el `.env`

```bash
cp .env.example .env
```

Completa con los datos de **Project Settings → API**:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...   # anon public / publishable key
```

El `.env` está en `.gitignore`. El script `scripts/gen-env.mjs` lo convierte en
`src/environments/env.generated.ts` (también ignorado) antes de `start`, `build` y `test`.

> La anon key es pública por diseño (va en el navegador). La seguridad la dan las
> políticas RLS. **Nunca** pongas la `service_role` key en la app.

## 5. Correr en local

```bash
npm start              # http://localhost:4200
```

- Jornada demo: <http://localhost:4200/p/DEMO26>
- Admin: <http://localhost:4200/admin>

## 6. Tests

```bash
npm test -- --watch=false   # cancha, mercados y reparto (Vitest)
npm run test:db             # migraciones + seguridad en un Postgres embebido (PGlite)
npm run check:live          # seguridad del Supabase real como usuario anónimo (lee el .env)
```

## 7. Desplegar

### Vercel

1. <https://vercel.com> → *Add New → Project* → importa el repo de GitHub.
2. En *Environment Variables* agrega `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
3. *Deploy*. `vercel.json` ya define el build y las rutas (SPA).

### Netlify

1. <https://app.netlify.com> → *Add new site → Import an existing project*.
2. En *Site configuration → Environment variables* agrega las mismas dos variables.
3. *Deploy*. `netlify.toml` ya define el build y las rutas.

Después del deploy, comparte el link `https://tu-app.vercel.app/p/CODIGO` de la jornada.

> **Deploy de prueba:** si despliegas sin las variables de entorno, la app sale en **modo demo**
> (datos falsos en memoria, admin con cualquier correo). Sirve para mostrarla a tus amigos antes
> de la jornada real. Cuando agregues las variables, vuelve a desplegar (*Redeploy*).

### Instalar en el celular (PWA)

- **Android (Chrome):** abre el link → menú ⋮ → *Agregar a la pantalla principal*.
- **iPhone (Safari):** abre el link → botón compartir → *Agregar a inicio*.

La app instalada abre en la pantalla de inicio, que ofrece volver a la última jornada vista, y se actualiza sola cuando hay una versión nueva.

---

## Panel del organizador (`/admin`)

| Pestaña | Para qué |
|---|---|
| Tickets | Ver la captura en grande, aprobar o rechazar (con motivo). Filtros por estado. |
| Eventos | Arriba: quién está en cancha y quién espera (y, antes del primer evento, quiénes arrancan). Botones ⚽ Gol, 🙈 Autogol, 🟨 Amarilla, 🥜 Huacha y 🔄 Rotación. Gol/Autogol: primero el equipo al que le cuenta, luego el jugador. Amarilla/Huacha: dos toques. Todo se edita o borra. |
| Liquidación | Ganador por mercado (jugador, equipo o número), reparto por persona, lo que queda para el organizador, check de "pagado" y resumen para WhatsApp. Se recalcula solo. |
| Jugadores | Una sola lista: pegar nombres, uno por línea. |
| Mercados | Activar, ordenar, renombrar, tipo, N (4, 6, 15, 28…), arrastre opcional y pozo inicial. |
| Datos | Nombre de la jornada, fecha, código y Plin (número, titular y QR). Una jornada nueva hereda el Plin de la anterior. |

Arriba están los botones de estado: **Cerrar apuestas** (al empezar la jornada) → **Finalizar jornada**.

## Seguridad (resumen)

- **RLS activada en todas las tablas.** El público no tiene acceso directo a ninguna.
- El público solo usa dos funciones RPC que exigen el código de la jornada:
  - `get_public_match(code)`: jornada, equipos, jugadores, mercados, eventos y apuestas
    **aprobadas** (vista `public_bets`, sin ruta de la captura).
  - `submit_ticket(code, nombre, apuestas, captura)`: valida en la base de datos que el
    jornada esté abierta, montos 1–5, máximo 20 apuestas, que cada apuesta vaya al tipo
    correcto (jugador, equipo o número 1–10) y sea de esa jornada, que no se apueste a
    "Autogol" donde no corresponde, y que la captura exista y no esté repetida. El estado siempre es `pending`
    y el total lo calcula el servidor.
- **Storage:** `receipts` es privado (el público solo puede subir a la carpeta de un
  jornada abierta; solo el admin ve, con URL firmada). `pay-qr` (QR de Plin) es público.
- **Realtime:** cada cambio emite un *broadcast* en el canal `match:<CODIGO>` y la
  pantalla vuelve a pedir los datos con la RPC.

## Agregar un tipo de mercado nuevo

1. Inserta una fila en `market_types` (por ejemplo `first_red`) con su `target`
   (`player | team | number`), `section` y, si aplica, `has_param` u opciones.
2. Agrega su resolver en `RESOLVERS` dentro de `settlement.ts` (recibe eventos, línea de
   tiempo de la cancha y `param`; devuelve el ganador, una devolución o “sin resolver”).
3. Si necesita un tipo de evento nuevo, amplía el `check` de `events.type`.

## Estructura

```
supabase/migrations/   esquema, RLS, RPC, storage, triggers
supabase/seed.sql      jornada de ejemplo DEMO26 (en vivo)
supabase/tests/        prueba de la BD con PGlite
scripts/gen-env.mjs    .env → env.generated.ts
src/app/domain/        cancha, mercados y reparto (funciones puras) + tests
```
