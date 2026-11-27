import { computed, effect, Injectable, signal } from '@angular/core';
import { BetDraft, MAX_BETS_PER_TICKET } from './models';

/**
 * Cupón de apuestas (como en las casas de apuestas): tocar una opción la agrega
 * con S/ 1; en el cupón se cambia el monto y se apuesta. Se guarda por jornada
 * en este navegador.
 */
@Injectable({ providedIn: 'root' })
export class SlipService {
  readonly code = signal('');
  readonly bets = signal<BetDraft[]>([]);
  readonly count = computed(() => this.bets().length);
  readonly totalCents = computed(() => this.bets().reduce((s, b) => s + b.amount * 100, 0));
  /** Sube cada vez que se agrega algo (para animar el contador). */
  readonly bump = signal(0);
  private loaded = '';

  constructor() {
    effect(() => {
      const code = this.code();
      const bets = this.bets();
      if (code && this.loaded === code) write(code, bets);
    });
  }

  load(code: string) {
    const c = code.toUpperCase();
    if (this.loaded === c) return;
    this.bets.set(read(c) ?? []);
    this.loaded = c;
    this.code.set(c);
  }

  has(marketId: string, selection: string) {
    return this.bets().some((b) => b.marketId === marketId && b.selection === selection);
  }

  amountOf(marketId: string, selection: string) {
    return this.bets().find((b) => b.marketId === marketId && b.selection === selection)?.amount ?? null;
  }

  /** Agrega (S/ 1) o quita. Devuelve false si el cupón está lleno. */
  toggle(marketId: string, selection: string): boolean {
    if (this.has(marketId, selection)) {
      this.remove(marketId, selection);
      return true;
    }
    if (this.bets().length >= MAX_BETS_PER_TICKET) return false;
    this.bets.update((list) => [...list, { marketId, selection, amount: 1 }]);
    this.bump.update((n) => n + 1);
    navigator.vibrate?.(10);
    return true;
  }

  setAmount(marketId: string, selection: string, amount: number) {
    this.bets.update((list) => list.map((b) => (b.marketId === marketId && b.selection === selection ? { ...b, amount } : b)));
  }

  remove(marketId: string, selection: string) {
    this.bets.update((list) => list.filter((b) => !(b.marketId === marketId && b.selection === selection)));
  }

  clear() {
    this.bets.set([]);
  }
}

const key = (code: string) => `copa:slip:${code}`;
function read(code: string): BetDraft[] | null {
  try {
    const raw = localStorage.getItem(key(code));
    const d = raw ? (JSON.parse(raw) as BetDraft[]) : null;
    return Array.isArray(d) && d.every((b) => typeof b.marketId === 'string' && typeof b.selection === 'string' && typeof b.amount === 'number') ? d : null;
  } catch {
    return null;
  }
}
function write(code: string, bets: BetDraft[]) {
  try {
    localStorage.setItem(key(code), JSON.stringify(bets));
  } catch {
    /* sin almacenamiento */
  }
}
