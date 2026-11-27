# Copa Álvaro: sistema de diseño

> **La esférica no se mancha.** App de apuestas entre amigos para el partido de la Copa Álvaro.
> Se usa sobre todo en el **celular**, el día del partido, muchas veces al sol y con una sola mano.

## Dirección creativa

- **Fiesta en la cancha:** blanco limpio con naranja como protagonista, confeti y una pelota con gorro de fiesta.
- Patrones de casa de apuestas (inspirados en apps como Betano, sin copiar su marca): el **saldo y el botón "Recargar" siempre a la vista**, los **mercados agrupados por sección**, un **cupón flotante** con contador y total, y botones de selección grandes.
- Una pantalla, una tarea: elegir, revisar el cupón, apostar. Sin pasos de más.

## Paleta (tokens en `src/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `night` | `#fffaf5` | Fondo de la app (blanco cálido) |
| `night-2` | `#ffffff` | Tarjetas (`.glass`) |
| `night-3` | `#fff1e6` | Superficies tintadas, burbujas |
| `ink` | `#1f140d` | Texto principal |
| `mute` / `faint` | `#6e5d52` / `#a8968a` | Texto secundario / terciario |
| `lime` (naranja de marca) | `#f26200` | Botones, selección, acentos, saldo |
| `gold` | `#e38a00` | Avisos y "por confirmar" |
| `candy` | `#e11d48` | Errores, "en vivo", rechazos |

> Los nombres `night`, `ink` y `lime` vienen del primer tema oscuro. Se mantuvieron para no tocar cada plantilla: hoy `lime` **es el naranja**.
> El panel del organizador usa las clases `emerald-*` de Tailwind, remapeadas al naranja en el mismo archivo.

## Tipografía

- **Bricolage Grotesque** 600/800: títulos, montos y números (`font-display`).
- **Manrope** 400–800: texto y botones.
- Montos siempre con `tabular-nums` y animados con `<app-count-up>`.

## Componentes

| Clase / componente | Para qué |
|---|---|
| `.glass` | Tarjeta blanca con borde suave |
| `.btn` | Acción principal (naranja, 52 px de alto) |
| `.btn-ghost` | Acción secundaria |
| `.pick` / `.pick-on` | Opción de apuesta (jugador, equipo, número) |
| `.field` / `.field-label` | Campos de formulario |
| `.nav-bar` | Barra inferior con indicador deslizante (Apostar · En vivo · Social · Mi cuenta) |
| `<app-icon>` | Íconos de trazo (basados en Lucide, ISC) |
| `<app-ball3d>` | Escena 3D del inicio (three.js, se carga aparte) |
| `<app-count-up>` | Soles animados |
| `confetti()` | Celebración al apostar, recargar o confirmar la cuenta |

## Movimiento

- Entradas escalonadas (`.anim-in` + `--i`), la hoja de monto sube con resorte, el indicador de la barra inferior se desliza, los montos cuentan y hay confeti en los éxitos.
- Cambios de pantalla con View Transitions.
- Todo respeta `prefers-reduced-motion`: sin animaciones, la escena 3D queda quieta.

## Responsive

- Primero el celular: columna de 448 px, objetivos táctiles de 44 px o más, zonas seguras (`env(safe-area-inset-*)`) y barra inferior al alcance del pulgar.
- Escritorio: el inicio pasa a 2 columnas y la jornada se ensancha a 672 px.
- Las pruebas fallan si alguna pantalla tiene scroll horizontal (`e2e/copa.spec.ts`).

## Marca

- Logo: `public/brand/mark.svg` (sin fondo) e `icon.svg` (ícono de la app). Se generan con `python scripts/brand/make-logo.py`.
- Íconos PNG de la PWA y favicon: `npm i --no-save sharp png-to-ico && node scripts/brand/rasterize.mjs`.
