import { Component, computed, inject, input } from '@angular/core';
import { betSelection } from '../core/models';
import { formatSoles, personKey } from '../domain/settlement';
import { MatchContext } from './match-context';
import { MARKET_ICON } from './market-utils';

type BetState = 'won' | 'lost' | 'refund' | 'open';
const STATE: Record<BetState, { label: string; tone: string }> = {
  won: { label: '✓ Ganó', tone: 'bg-lime/15 text-lime' },
  lost: { label: '✗ Perdió', tone: 'bg-candy/10 text-candy' },
  refund: { label: '↩ Devuelto', tone: 'bg-ink/[0.06] text-mute' },
  open: { label: '⏳ En juego', tone: 'bg-gold/15 text-gold' },
};

/** Estadísticas de un apostador en la jornada (lo ve cualquiera: solo apuestas en juego, sin datos privados). */
@Component({
  selector: 'app-player-profile',
  template: `
    @let s = stats();
    <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div class="glass p-3"><p class="eyebrow">Apuestas</p><p class="mt-1 font-display text-2xl font-extrabold">{{ s.count }}</p></div>
      <div class="glass p-3"><p class="eyebrow">Apostado</p><p class="mt-1 font-display text-2xl font-extrabold">{{ soles(s.staked) }}</p></div>
      <div class="glass p-3"><p class="eyebrow">Aciertos</p><p class="mt-1 font-display text-2xl font-extrabold">{{ s.won }}<span class="text-base text-faint">/{{ s.decided }}</span></p></div>
      <div class="glass p-3"><p class="eyebrow">{{ s.allFinal ? 'Ganó' : 'Cobra' }}</p><p class="mt-1 font-display text-2xl font-extrabold text-lime">{{ soles(s.collect) }}</p></div>
    </div>

    <h3 class="mt-5 mb-2 px-1 font-display text-lg font-extrabold">Apuestas</h3>
    @if (s.rows.length === 0) {
      <p class="glass py-6 text-center text-sm text-mute">Todavía no tiene apuestas en esta jornada.</p>
    } @else {
      <ul class="space-y-2">
        @for (r of s.rows; track r.id) {
          <li class="glass flex items-center gap-3 p-3">
            <span class="text-lg">{{ r.icon }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold">{{ r.choice }}</span>
              <span class="block truncate text-xs text-mute">{{ r.market }}</span>
            </span>
            <span class="shrink-0 text-right">
              <span class="block font-extrabold">S/ {{ r.amount }}</span>
              <span class="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold" [class]="state[r.state].tone">{{ r.state === 'won' && !r.final ? 'Va ganando' : state[r.state].label }}</span>
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class PlayerProfileComponent {
  readonly username = input.required<string>();
  private readonly ctx = inject(MatchContext);
  protected readonly soles = formatSoles;
  protected readonly state = STATE;

  protected readonly stats = computed(() => {
    const d = this.ctx.data();
    const result = this.ctx.result();
    const key = personKey(this.username());
    const byMarket = new Map((result?.markets ?? []).map((r) => [r.marketId, r]));
    const rows = (d?.bets ?? [])
      .filter((b) => personKey(b.bettor_name) === key)
      .map((b) => {
        const m = this.ctx.marketById().get(b.market_id);
        const r = byMarket.get(b.market_id);
        const sel = betSelection(b);
        const final = this.ctx.isFinal(b.market_id);
        // Lo que no está decidido todavía queda "en juego" (salvo un partido en vivo que ya va ganando).
        const state: BetState =
          !r || r.outcome === 'unresolved'
            ? 'open'
            : r.outcome === 'refund'
              ? final ? 'refund' : 'open'
              : r.winnerSelection === sel
                ? 'won'
                : final ? 'lost' : 'open';
        return {
          id: b.id,
          icon: MARKET_ICON[m?.type ?? ''] ?? '🎲',
          market: m?.name ?? '',
          choice: this.ctx.selectionLabel(b.market_id, sel),
          amount: b.amount,
          state,
          final,
        };
      })
      .reverse();
    // Solo cuenta lo de mercados ya decididos.
    let collect = 0;
    for (const r of result?.markets ?? []) {
      if (!this.ctx.isFinal(r.marketId)) continue;
      for (const p of [...r.payouts, ...r.refunds]) if (p.personKey === key) collect += p.amountCents;
    }
    return {
      rows,
      count: rows.length,
      staked: rows.reduce((s, r) => s + r.amount * 100, 0),
      won: rows.filter((r) => r.state === 'won').length,
      decided: rows.filter((r) => r.state === 'won' || r.state === 'lost').length,
      collect,
      allFinal: rows.length > 0 && rows.every((r) => r.final),
    };
  });
}
