# Polla del Partido ⚽

App web para organizar apuestas entre amigos en un partido de fútbol: cada quien
apuesta de S/ 1 a S/ 5 a un jugador en cada mercado (primer gol, último gol,
primera amarilla…), paga por Yape y el organizador aprueba. El bote de cada mercado
se reparte en proporción entre los que acertaron.

- **Frontend:** Angular 21 (standalone + signals), Tailwind, PWA.
- **Backend:** Supabase (Postgres + RLS, Auth para el admin, Storage, Realtime).
- **Hosting:** Vercel o Netlify (ya configurados).

> Estado: fase 4 de 5 (reparto, base de datos, apostador, pantalla en vivo y panel del organizador listos; falta desplegar y la revisión final).
>
> **Modo demo:** si el `.env` no tiene claves de Supabase, la app usa datos de prueba en memoria. Prueba `/p/DEMO26` (abierto), `/p/ENVIVO` (en juego) y `/p/FINAL` (finalizado). En `/admin` entras con cualquier correo y contraseña; los cambios se pierden al recargar.

---

## Reglas de la polla

| Regla | Detalle |
|---|---|
| Monto | S/ 1 a S/ 5 (enteros) por jugador y mercado; máximo 20 apuestas por ticket. |
| Reparto | El bote del mercado se reparte entre los que le apostaron al ganador, en proporción a lo apostado. Redondeo a céntimos: el último ganador absorbe la diferencia. |
| Arrastre | Si nadie acierta, el bote pasa al mercado de `rollover_to` (por defecto Primer gol → Último gol). Sin `rollover_to`, queda **acumulado** para el próximo partido (se carga como *pozo inicial*). |
| 0-0 | Se devuelve lo apostado en los mercados de goles. El pozo inicial y lo arrastrado quedan acumulados. |
| Sin amarillas | Se devuelve lo apostado en ese mercado. |
| Un solo gol | Ese jugador es primer y último goleador. |
| Autogol | Jugador especial “Autogol” (solo en mercados de goles). |
| Desempate | Orden por minuto → tiempo añadido (45+2 va antes de 46) → orden de registro. |
| Misma persona | Se identifica por nombre (sin importar mayúsculas, tildes ni espacios). Usen nombre y apellido o apodo para no mezclarse. |

La lógica está en [`src/app/domain/settlement.ts`](src/app/domain/settlement.ts)
(función pura, en céntimos) con sus tests en `settlement.spec.ts`.

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
2. **Base de datos:** abre **SQL Editor** → *New query*, pega todo el contenido de
   [`supabase/migrations/20261124000000_init.sql`](supabase/migrations/20261124000000_init.sql)
   y dale **Run**.
   - Alternativa con la CLI: `npx supabase link --project-ref TU_REF` y `npx supabase db push`.
3. **Datos de prueba (opcional):** en el SQL Editor corre
   [`supabase/seed.sql`](supabase/seed.sql). Crea el partido de ejemplo con código **DEMO26**.
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

- Apostar en el partido demo: <http://localhost:4200/p/DEMO26>
- Admin: <http://localhost:4200/admin>

## 6. Tests

```bash
npm test -- --watch=false   # lógica de reparto (Vitest)
npm run test:db             # migración + seguridad en un Postgres embebido (PGlite)
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

Después del deploy, comparte el link `https://tu-app.vercel.app/p/CODIGO` del partido.

---

## Panel del organizador (`/admin`)

| Pestaña | Para qué |
|---|---|
| Tickets | Ver la captura en grande, aprobar o rechazar (con motivo). Filtros por estado. |
| Eventos | Registrar gol o amarilla con dos toques: elige tipo y toca al jugador (el minuto queda arriba). Editar o borrar. |
| Liquidación | Ganador por mercado, reparto por persona, acumulado, check de "pagado" y botón para copiar el resumen para WhatsApp. Se recalcula solo. |
| Jugadores | Pegar la lista de cada equipo (uno por línea). "Autogol" se crea solo. |
| Mercados | Activar, ordenar, renombrar, tipo, a dónde va el arrastre y pozo inicial. |
| Datos | Equipos, fecha, código, Yape y QR. |

Arriba están los botones de estado: **Cerrar apuestas** (al empezar el partido) → **Finalizar partido**.

## Seguridad (resumen)

- **RLS activada en todas las tablas.** El público no tiene acceso directo a ninguna.
- El público solo usa dos funciones RPC que exigen el código del partido:
  - `get_public_match(code)`: partido, jugadores, mercados, eventos y apuestas
    **aprobadas** (vista `public_bets`, sin ruta de la captura).
  - `submit_ticket(code, nombre, apuestas, captura)`: valida en la base de datos que el
    partido esté abierto, montos 1–5, máximo 20 apuestas, que jugadores y mercados sean
    del partido, que la captura exista y no esté repetida. El estado siempre es `pending`
    y el total lo calcula el servidor.
- **Storage:** `receipts` es privado (el público solo puede subir a la carpeta de un
  partido abierto; solo el admin ve, con URL firmada). `yape-qr` es público.
- **Realtime:** cada cambio emite un *broadcast* en el canal `match:<CODIGO>` y la
  pantalla vuelve a pedir los datos con la RPC.

## Agregar un tipo de mercado nuevo

1. Inserta una fila en `market_types` (por ejemplo `first_red`).
2. Agrega su resolver en `RESOLVERS` dentro de `settlement.ts` (recibe los eventos y
   devuelve el ganador, una devolución o “sin resolver”).
3. Si necesita un tipo de evento nuevo, amplía el `check` de `events.type`.

## Estructura

```
supabase/migrations/   esquema, RLS, RPC, storage, triggers
supabase/seed.sql      partido de ejemplo DEMO26
supabase/tests/        prueba de la BD con PGlite
scripts/gen-env.mjs    .env → env.generated.ts
src/app/domain/        lógica de reparto (pura) + tests
```
