# Avatares · entrega v5 (19 base + 6 especiales = 25 avatares)

Entrega lista para integración en `public/avatares/` + `manifest.json`.
No se modificó código de Angular (`.ts`, `.html`, `.css`).
`hombros.svg` y `NOTA.md` están fuera de `public/avatares/` para no publicarse como assets en producción.

## Contenido en `public/avatares/`

- `manifest.json` — **25 entradas** (19 `base` + 6 `especial`).
- `base/base-01.webp` … `base/base-19.webp`
- `especiales/makanaky.webp`, `errorr.webp`, `sideral.webp`, `paletazo-1.webp`, `paletazo-2.webp`, `pantera.webp`

*(El `paletazo.webp` combinado de dos cabezas quedó descartado y fuera del manifiesto; se reemplazó por `paletazo-1` y `paletazo-2`.)*

## Especificación técnica

- Formato: **WebP RGBA 512×512** con transparencia real (`corner_alpha_max = 0`), peso `< 40 KB`.
- Torso transparente: las imágenes traen solo cabeza, cuello curvo (y mano/capucha/bufanda/burbuja en los casos correspondientes).
- Encuadre alineado para asentar sobre los hombros embebidos por la app.

## Hombros para embeber en la app

`viewBox="0 0 512 512"`, dibujado **detrás** de la `<img>` del avatar con `fill="currentColor"` del kit del equipo:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M40 512 C48 460 120 428 196 420 Q256 474 316 420 C392 428 464 460 472 512 Z"
        fill="currentColor" stroke="#1b1210" stroke-width="12" stroke-linejoin="round"/>
</svg>
```

## Catálogo incluido (25 avatares)

| id | tipo | archivo | rasgos | peso |
|---|---|---|---|---|
| `base-01` | `base` | `base/base-01.webp` | Trigueño, degradado con rayita, ceja partida, palillo en boca. | 20.8 KB |
| `base-02` | `base` | `base/base-02.webp` | Clarito, gorra al revés, ojo morado, chimuelo. | 25.7 KB |
| `base-03` | `base` | `base/base-03.webp` | Oscuro, rapado, barba tupida, cadena dorada, reventado y sudando. | 24.6 KB |
| `base-04` | `base` | `base/base-04.webp` | Rulos voluminosos, vincha blanca deportiva, sonrisa amplia. | 30.2 KB |
| `base-05` | `base` | `base/base-05.webp` | Veterano con entradas, canas, bigote y ceño serio de defensa. | 26.2 KB |
| `base-06` | `base` | `base/base-06.webp` | Man-bun con degradado, barba de 3 días, guiño confiado. | 25.4 KB |
| `base-07` | `base` | `base/base-07.webp` | Moreno con trenzas cornrows, grito eufórico de gol. | 26.2 KB |
| `base-08` | `base` | `base/base-08.webp` | Lentes negros gruesos, expresión nerviosa. | 26.4 KB |
| `base-09` | `base` | `base/base-09.webp` | Calvo, barba candado negra, mirada ruda competitiva. | 22.6 KB |
| `base-10` | `base` | `base/base-10.webp` | Mullet retro, arete de argolla, burbuja de chicle rosa. | 26.5 KB |
| `base-11` | `base` | `base/base-11.webp` | Cachetón de pelo corto puntiagudo, sonrisa bonachona. | 22.7 KB |
| `base-12` | `base` | `base/base-12.webp` | Gorra negra hacia adelante, barba corta, media sonrisa. | 25.0 KB |
| `base-13` | `base` | `base/base-13.webp` | Moreno oscuro afro corto, lentes de sol deportivos. | 16.8 KB |
| `base-14` | `base` | `base/base-14.webp` | Veterano canoso en sienes, silbando cansado. | 28.0 KB |
| `base-15` | `base` | `base/base-15.webp` | Pelo corto rubio platinado, ceja levantada burlona. | 24.3 KB |
| `base-16` | `base` | `base/base-16.webp` | Moreno oscuro pelado, lentes redondos finos, bigote, serio. | 20.1 KB |
| `base-17` | `base` | `base/base-17.webp` | Pelirrojo rizado con pecas, risa abierta eufórica. | 34.4 KB |
| `base-18` | `base` | `base/base-18.webp` | Pelo largo a los hombros con vincha negra, relajado. | 26.8 KB |
| `base-19` | `base` | `base/base-19.webp` | Tío pichanguero cachetón, pelo engominado, bigote grueso. | 26.4 KB |
| `makanaky` | `especial` | `especiales/makanaky.webp` | Copete turquesa neón, ojos abiertos, lengua afuera traviesa. | 26.2 KB |
| `errorr` | `especial` | `especiales/errorr.webp` | Cerquillo recto, ceja partida, sonrisa abierta + saludo en "V" en mejilla. | 27.0 KB |
| `sideral` | `especial` | `especiales/sideral.webp` | Puntas rubias, expresión seria, arete y capucha verde de lagartija. | 32.1 KB |
| `paletazo-1` | `especial` | `especiales/paletazo-1.webp` | Gemelo 1: copete alto puntiagudo, cejas altas, lentes, 3/4 derecha. | 23.9 KB |
| `paletazo-2` | `especial` | `especiales/paletazo-2.webp` | Gemelo 2: peinado engominado de lado, cejas altas, lentes, 3/4 izquierda. | 24.2 KB |
| `pantera` | `especial` | `especiales/pantera.webp` | Botarga rosada de pantera hincha + bufanda rosa/negra sin escudo. | 34.5 KB |

## Plan B (5 arquetipos base restantes)

Si luego hicieran falta más base (`base-20`…`base-24`), sus prompts ya están listos en el repo principal (ignorado por git) en `docs/agentes/avatares-arte/PROMPTS-FASE4.md`.
