"""Genera el logo de Copa Álvaro (pelota con gorro de cumpleaños) en SVG.

Uso: python scripts/brand/make-logo.py  →  public/brand/mark.svg (sin fondo)
                                          public/brand/icon.svg (con fondo, para PWA/favicon)
Luego: node scripts/brand/rasterize.mjs  →  PNG de los íconos.
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'public' / 'brand'
OUT.mkdir(parents=True, exist_ok=True)

CX, CY, R = 64, 78, 34
NIGHT = '#2a1608'


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def poly(points):
    return ' '.join(f'{x:.2f},{y:.2f}' for x, y in points)


def pentagon(cx, cy, r, rot):
    return [pt(cx, cy, r, rot + 72 * k) for k in range(5)]


def ball():
    parts = []
    parts.append(f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#ballG)"/>')
    parts.append('<g clip-path="url(#ballClip)">')
    center = pentagon(CX, CY, 11.5, -90)
    parts.append(f'<polygon points="{poly(center)}" fill="{NIGHT}"/>')
    for k in range(5):
        ang = -90 + 72 * k
        vx, vy = center[k]
        ox, oy = pt(CX, CY, 31, ang)
        outer = pentagon(ox, oy, 11, ang + 180)
        ix, iy = outer[0]
        parts.append(f'<line x1="{vx:.2f}" y1="{vy:.2f}" x2="{ix:.2f}" y2="{iy:.2f}" stroke="{NIGHT}" stroke-width="2.2" stroke-linecap="round"/>')
        parts.append(f'<polygon points="{poly(outer)}" fill="{NIGHT}"/>')
        # costura entre pentágonos vecinos
        nx, ny = pt(CX, CY, 31, ang + 72)
        n_outer = pentagon(nx, ny, 11, ang + 72 + 180)
        a1 = outer[2]
        b1 = n_outer[3]
        mx, my = pt(CX, CY, 24, ang + 36)
        parts.append(f'<polyline points="{a1[0]:.2f},{a1[1]:.2f} {mx:.2f},{my:.2f} {b1[0]:.2f},{b1[1]:.2f}" fill="none" stroke="{NIGHT}" stroke-width="2" stroke-linejoin="round"/>')
    # brillo
    parts.append(f'<ellipse cx="{CX - 13}" cy="{CY - 15}" rx="11" ry="6.5" fill="white" opacity="0.55" transform="rotate(-35 {CX - 13} {CY - 15})"/>')
    parts.append('</g>')
    parts.append(f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="{NIGHT}" stroke-width="2.5"/>')
    return '\n    '.join(parts)


def hat():
    # gorro en coordenadas locales, luego se inclina
    base_y, tip_y = 50, 6
    left, right = 47, 81
    tip_x = 64
    tri = f'{left},{base_y} {right},{base_y} {tip_x},{tip_y}'
    stripes = []
    for i, y in enumerate(range(12, 50, 9)):
        color = '#ffffff' if i % 2 == 0 else '#ffb648'
        stripes.append(f'<rect x="30" y="{y}" width="70" height="4.5" fill="{color}" transform="rotate(-14 64 {y})"/>')
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="1.6" fill="white" opacity="0.9"/>' for x, y in [(60, 28), (69, 38), (56, 42), (66, 20)])
    return f'''<g transform="rotate(-16 64 44)">
      <clipPath id="hatClip"><polygon points="{tri}"/></clipPath>
      <polygon points="{tri}" fill="#f26200" stroke="{NIGHT}" stroke-width="2.5" stroke-linejoin="round"/>
      <g clip-path="url(#hatClip)">{''.join(stripes)}{dots}</g>
      <polygon points="{tri}" fill="none" stroke="{NIGHT}" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="{left - 3}" y="{base_y - 3}" width="{right - left + 6}" height="7" rx="3.5" fill="#ffb648" stroke="{NIGHT}" stroke-width="2.5"/>
      <circle cx="{tip_x}" cy="{tip_y}" r="6" fill="#ffffff" stroke="{NIGHT}" stroke-width="2.5"/>
    </g>'''


CONFETTI = '''<g>
      <rect x="14" y="30" width="7" height="3.5" rx="1.5" fill="#ffd089" transform="rotate(-30 17 31)"/>
      <rect x="104" y="24" width="7" height="3.5" rx="1.5" fill="#ffffff" transform="rotate(40 107 25)"/>
      <rect x="108" y="70" width="7" height="3.5" rx="1.5" fill="#ffe1c2" transform="rotate(-20 111 71)"/>
      <circle cx="20" cy="66" r="3" fill="#ffffff"/>
      <circle cx="98" cy="46" r="2.4" fill="#ffe1c2"/>
      <circle cx="26" cy="14" r="2.2" fill="#ffffff"/>
      <path d="M100 100 l4 -6 l4 6" fill="none" stroke="#ffd089" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>'''

DEFS = f'''<defs>
    <radialGradient id="ballG" cx="38%" cy="30%" r="75%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.7" stop-color="#fbf4ee"/>
      <stop offset="1" stop-color="#e9d9cc"/>
    </radialGradient>
    <linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff9a3d"/>
      <stop offset="0.55" stop-color="#f26200"/>
      <stop offset="1" stop-color="#c94400"/>
    </linearGradient>
    <clipPath id="ballClip"><circle cx="{CX}" cy="{CY}" r="{R}"/></clipPath>
  </defs>'''


def svg(with_bg: bool, pad: float = 0) -> str:
    bg = ''
    if with_bg:
        bg = '<rect width="128" height="128" rx="30" fill="url(#bgG)"/>\n    <rect x="1.5" y="1.5" width="125" height="125" rx="28.5" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="3"/>'
    inner = f'<g transform="translate({pad} {pad}) scale({(128 - 2 * pad) / 128})">\n    {CONFETTI}\n    {ball()}\n    {hat()}\n  </g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Copa Álvaro">
  <title>Copa Álvaro</title>
  {DEFS}
  {bg}
  {inner}
</svg>
'''


(OUT / 'mark.svg').write_text(svg(False), encoding='utf8')
(OUT / 'icon.svg').write_text(svg(True, pad=8), encoding='utf8')
# Íconos "maskable" de Android: más aire alrededor.
(OUT / 'icon-maskable.svg').write_text(svg(True, pad=22), encoding='utf8')
print('logo listo en', OUT)
