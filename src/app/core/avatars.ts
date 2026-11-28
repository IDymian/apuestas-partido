import { inject, Injectable, signal } from '@angular/core';
import { Player } from './models';
import { PublicApi } from './public-api';

export interface AvatarEntry {
  id: string;
  tipo: 'base' | 'especial' | 'foto';
  archivo: string;
}

/**
 * Catálogo de avatares (`/avatares/manifest.json`, cargado una vez) + fotos subidas desde el admin.
 * Si el manifiesto o una imagen fallan, no hay avatar y la cancha usa la camiseta.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly api = inject(PublicApi);
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

  /** Especiales que se pueden elegir como disfraz. */
  costumes() {
    return this.list().filter((e) => e.tipo === 'especial');
  }

  url(id: string | null | undefined): string | null {
    const e = id ? this.list().find((x) => x.id === id) : undefined;
    return e ? this.ok(`/avatares/${e.archivo}`) : null;
  }

  /** Disfraz > foto (del manifiesto o subida) > base determinístico por id de jugador. */
  urlFor(p: Pick<Player, 'id' | 'photo_id' | 'costume_id'>): string | null {
    const own = this.url(p.costume_id) ?? this.url(p.photo_id) ?? (p.photo_id ? this.ok(this.api.photoUrl(p.photo_id)) : null);
    if (own) return own;
    const bases = this.list().filter((e) => e.tipo === 'base' && this.url(e.id));
    return bases.length ? this.url(bases[hash(p.id) % bases.length].id) : null;
  }

  /** La imagen no cargó: se deja de usar (vuelve otra base o la camiseta). */
  markBroken(url: string) {
    this.broken.update((s) => new Set(s).add(url));
  }

  private ok(url: string | null) {
    return url && !this.broken().has(url) ? url : null;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
