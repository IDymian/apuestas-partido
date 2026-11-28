/** Camisetas de equipo (sin escudos: solo colores y patrón). Se guardan como `teams.kit_id`. */
export type KitPattern = 'solid' | 'stripes' | 'wide' | 'diagonal' | 'sleeves' | 'center';

export interface Kit {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  pattern: KitPattern;
}

// Ningún kit verde: se pierde en el grass.
export const KITS: Kit[] = [
  { id: 'barca', name: 'Azulgrana', primary: '#004d98', secondary: '#a50044', pattern: 'stripes' },
  { id: 'madrid', name: 'Blanca', primary: '#ffffff', secondary: '#111827', pattern: 'sleeves' },
  { id: 'alianza', name: 'Blanquiazul', primary: '#1e3a8a', secondary: '#ffffff', pattern: 'wide' },
  { id: 'u', name: 'Crema', primary: '#f3e5c0', secondary: '#b91c1c', pattern: 'diagonal' },
  { id: 'psg-pe', name: 'Perú San Germán', primary: '#0b1f5e', secondary: '#c8102e', pattern: 'center' },
  { id: 'cristal', name: 'Celeste', primary: '#7dd3fc', secondary: '#ffffff', pattern: 'solid' },
  { id: 'boys', name: 'Rosado', primary: '#f472b6', secondary: '#111827', pattern: 'solid' },
  { id: 'chifa', name: 'Rojo chino', primary: '#b91c1c', secondary: '#fbbf24', pattern: 'solid' },
  { id: 'pollo', name: 'Ámbar', primary: '#f59e0b', secondary: '#7c2d12', pattern: 'solid' },
  { id: 'inca', name: 'Amarillo', primary: '#facc15', secondary: '#1d4ed8', pattern: 'solid' },
  { id: 'fullvaso', name: 'Ámbar oscuro', primary: '#b45309', secondary: '#fef3c7', pattern: 'solid' },
];

export const KIT_BY_ID = new Map(KITS.map((k) => [k.id, k]));

/** Kits de los equipos por defecto. Más equipos (y su camiseta) se crean desde el admin. */
export const DEFAULT_TEAM_KITS = [
  { name: 'Equipo 1', kit: 'barca' },
  { name: 'Equipo 2', kit: 'madrid' },
  { name: 'Equipo 3', kit: 'alianza' },
] as const;

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** Color plano del kit (puntos, badges, anillo del avatar): el primario, salvo que sea casi blanco o crema. */
export const kitAccent = (k: Kit) => (luminance(k.primary) > 0.75 ? k.secondary : k.primary);

/** Kit del equipo; sin `kit_id` (jornadas viejas o equipo nuevo) es una camiseta lisa de su color. */
export function kitOf(team: { kit_id?: string | null; color?: string | null } | undefined, fallbackColor: string): Kit {
  const k = team?.kit_id ? KIT_BY_ID.get(team.kit_id) : undefined;
  return k ?? { id: '', name: '', primary: team?.color || fallbackColor, secondary: '#ffffff', pattern: 'solid' };
}
