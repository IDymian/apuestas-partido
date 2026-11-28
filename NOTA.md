# Avatares · entrega v5 (3 base + 6 especiales)

Entrega lista para integración en `public/avatares/` + `manifest.json`.
No se modificó código de Angular (`.ts`, `.html`, `.css`).
`hombros.svg` y `NOTA.md` se retiraron de `public/avatares/` para no publicarse como assets en producción.

## Contenido en `public/avatares/`

- `manifest.json` — **9 entradas** (3 `base` + 6 `especial`).
- `base/base-01.webp` … `base/base-03.webp`
- `especiales/makanaky.webp`, `errorr.webp`, `sideral.webp`, `paletazo-1.webp`, `paletazo-2.webp`, `pantera.webp`

*(El `paletazo.webp` combinado de dos cabezas quedó descartado y fuera del manifiesto; se reemplazó por `paletazo-1` y `paletazo-2`.)*

## Especificación técnica

- Formato: **WebP RGBA 512×512** con transparencia real (`corner_alpha_max = 0`), peso `< 40 KB`.
- Torso transparente: las imágenes traen solo cabeza, cuello curvo (y mano/capucha/bufanda en los especiales correspondientes).
- Encuadre alineado para asentar sobre los hombros embebidos por la app.

## Hombros para embeber en la app

`viewBox="0 0 512 512"`, dibujado **detrás** de la `<img>` del avatar con `fill="currentColor"` del kit del equipo:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M40 512 C48 460 120 428 196 420 Q256 474 316 420 C392 428 464 460 472 512 Z"
        fill="currentColor" stroke="#1b1210" stroke-width="12" stroke-linejoin="round"/>
</svg>
```

## Catálogo incluido

| id | tipo | archivo | rasgos | peso |
|---|---|---|---|---|
| `base-01` | `base` | `base/base-01.webp` | Trigueño, degradado con rayita, ceja partida, palillo en boca. | 20.8 KB |
| `base-02` | `base` | `base/base-02.webp` | Clarito, gorra al revés, ojo morado, chimuelo. | 25.7 KB |
| `base-03` | `base` | `base/base-03.webp` | Oscuro, rapado, barba tupida, cadena dorada, reventado y sudando. | 24.6 KB |
| `makanaky` | `especial` | `especiales/makanaky.webp` | Copete turquesa neón, ojos abiertos, lengua afuera traviesa. | 26.2 KB |
| `errorr` | `especial` | `especiales/errorr.webp` | Cerquillo recto, ceja partida, sonrisa abierta + saludo en "V" en mejilla. | 27.0 KB |
| `sideral` | `especial` | `especiales/sideral.webp` | Puntas rubias, expresión seria, arete y capucha verde de lagartija. | 32.1 KB |
| `paletazo-1` | `especial` | `especiales/paletazo-1.webp` | Gemelo 1: copete alto puntiagudo, cejas altas, lentes, 3/4 derecha. | 23.9 KB |
| `paletazo-2` | `especial` | `especiales/paletazo-2.webp` | Gemelo 2: peinado engominado de lado, cejas altas, lentes, 3/4 izquierda. | 24.2 KB |
| `pantera` | `especial` | `especiales/pantera.webp` | Botarga rosada de pantera hincha + bufanda rosa/negra sin escudo. | 34.5 KB |

## Plan B (21 arquetipos base adicionales)

Los 21 arquetipos base adicionales (`base-04`…`base-24`) quedaron pospuestos por si faltan fotos reales de jugadores. Sus prompts en grilla `2×2` y el pipeline de procesamiento local permanecen conservados en el repo principal (ignorado por git) en `docs/agentes/avatares-arte/PROMPTS-FASE4.md`.
