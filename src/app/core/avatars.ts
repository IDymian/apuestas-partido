import { Injectable, signal } from '@angular/core';
import { Player } from './models';

export interface AvatarEntry {
  id: string;
  tipo: 'base' | 'especial' | 'foto';
  archivo: string;
}

/**
 * Catálogo de avatares (`/avatares/manifest.json`), cargado una vez.
 * Si el manifiesto o una imagen fallan, no hay avatar y la cancha usa la camiseta.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  readonly list = signal<AvatarEntry[]>([]);
  private readonly broken = signal<ReadonlySet<string>>(new Set());

  constructor() {
    fetch('/avatares/manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data)) this.list.set(data.filter((e): e is AvatarEntry => typeof e?.id === 'string' && typeof e?.archivo === 'string'));
      })
      .catch(() => {});
  }

  url(id: string | null | undefined): string | null {
    const e = id ? this.list().find((x) => x.id === id) : undefined;
    return e && !this.broken().has(e.id) ? `/avatares/${e.archivo}` : null;
  }

  /** Disfraz > foto > base determinístico por id de jugador. */
  urlFor(p: Pick<Player, 'id' | 'photo_id' | 'costume_id'>): string | null {
    const own = this.url(p.costume_id) ?? this.url(p.photo_id);
    if (own) return own;
    const bases = this.list().filter((e) => e.tipo === 'base' && !this.broken().has(e.id));
    return bases.length ? this.url(bases[hash(p.id) % bases.length].id) : null;
  }

  /** La imagen no cargó: se deja de usar (la cancha vuelve a la camiseta o a otra base). */
  markBroken(url: string) {
    const e = this.list().find((x) => url.endsWith(`/avatares/${x.archivo}`));
    if (e) this.broken.update((s) => new Set(s).add(e.id));
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
