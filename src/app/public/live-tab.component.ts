import { Component, computed, inject, output } from '@angular/core';
import { isPlayerEvent, PLAYER_EVENTS } from '../core/models';
import { MatchContext } from './match-context';
import { GameMarketsComponent } from './game-markets.component';
import { IconComponent } from '../ui/icon.component';

/** En vivo: vacío hasta que el organizador ponga un partido en vivo. */
@Component({
  selector: 'app-live-tab',
  imports: [GameMarketsComponent, IconComponent],
  template: `
    @if (ctx.liveGame(); as g) {
      <section class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ff8a1f] via-lime to-[#d13f00] p-5 text-white shadow-[0_24px_50px_-20px_rgb(242_98_0/0.7)] anim-in">
        <p class="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.2em] text-white/85 uppercase"><span class="live-dot"></span> En vivo · Partido {{ g.number }}</p>
        <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <p class="font-display text-lg leading-tight font-extrabold">{{ ctx.team(g.home) }}</p>
          <p class="font-display text-5xl font-extrabold tabular-nums">{{ g.homeGoals }}<span class="text-white/60">-</span>{{ g.awayGoals }}</p>
          <p class="font-display text-lg leading-tight font-extrabold">{{ ctx.team(g.away) }}</p>
        </div>
      </section>

      <section class="mt-3 anim-in" style="--i: 1">
        <app-game-markets [game]="g" (full)="full.emit()" />
      </section>

      <section class="glass mt-3">
        <h3 class="font-display text-lg font-extrabold">Minuto a minuto</h3>
        @if (events().length === 0) {
          <p class="mt-1 text-sm text-mute">Sin jugadas todavía. Pura marca por ahora.</p>
        } @else {
          <ol class="mt-2 space-y-2">
            @for (e of events(); track e.id) {
              <li class="flex items-center gap-3 text-sm anim-in">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-night-3 text-lg">{{ e.icon }}</span>
                <span class="min-w-0 flex-1">{{ e.text }}</span>
                <span class="font-mono text-xs font-bold text-faint">{{ e.minute }}'</span>
              </li>
            }
          </ol>
        }
      </section>
    } @else {
      <section class="mt-6 flex flex-col items-center px-6 text-center anim-in">
        <div class="grid h-20 w-20 place-items-center rounded-[28px] bg-night-3 text-lime"><app-icon name="live" [size]="38" /></div>
        <h2 class="mt-4 font-display text-2xl font-extrabold">Todavía no sueltan el balón</h2>
        <p class="mt-1 text-mute">Apenas el organizador dé el pitazo, el marcador y las jugadas aparecen aquí en vivo.</p>
        @if (next(); as n) {
          <div class="glass mt-5 w-full text-left">
            <p class="eyebrow">Próximo · Partido {{ n.number }}</p>
            <p class="mt-1 font-display text-xl font-extrabold">{{ ctx.team(n.home) }} <span class="text-faint">vs</span> {{ ctx.team(n.away) }}</p>
          </div>
        }
        <button type="button" class="btn mt-5" (click)="goGames.emit()">Meter fichas antes del pitazo <app-icon name="next" [size]="18" /></button>
      </section>
    }
  `,
})
export class LiveTabComponent {
  readonly goGames = output<void>();
  readonly full = output<void>();
  protected readonly ctx = inject(MatchContext);
  protected readonly next = computed(() => this.ctx.league()?.games.find((g) => g.status === 'pending') ?? null);
  protected readonly events = computed(() => {
    const g = this.ctx.liveGame();
    const d = this.ctx.data();
    if (!g || !d) return [];
    const players = new Map(d.players.map((p) => [p.id, p.name]));
    const name = (id: string | null) => (id && players.get(id)) || '¿?';
    return d.events
      .filter((e) => e.game === g.number)
      .sort((a, b) => b.minute - a.minute || b.seq - a.seq)
      .map((e) => ({
        id: e.id,
        minute: e.minute,
        icon: e.type === 'goal' ? (e.is_own_goal ? '🙈' : '⚽') : isPlayerEvent(e.type) ? PLAYER_EVENTS[e.type].icon : '🔄',
        text:
          e.type === 'goal'
            ? `${e.is_own_goal ? 'Autogol de' : 'Gol de'} ${name(e.player_id)} (${this.ctx.team(e.team_id ?? '')})`
            : isPlayerEvent(e.type)
              ? PLAYER_EVENTS[e.type].text(name(e.player_id))
              : 'Rotación',
      }));
  });
}
