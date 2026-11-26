/** Recuerda el último partido abierto, para volver rápido desde la app instalada. */
const KEY = 'apuestas:last-match';

export function rememberMatch(code: string, title: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, title }));
  } catch {
    /* sin almacenamiento */
  }
}

export function lastMatch(): { code: string; title: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.code === 'string' && typeof v.title === 'string' ? v : null;
  } catch {
    return null;
  }
}
