import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AmountSheetComponent } from './amount-sheet.component';
import { formatSoles, numberMaxOption } from '../domain/settlement';
import { makeSelectionLabel } from '../domain/adapt';
import { BetDraft, HOUSE_WARNING, Market, MarketSection, MAX_BETS_PER_TICKET, PublicMatchData, SECTIONS } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { WalletService } from '../core/wallet';
import { IconComponent } from '../ui/icon.component';
import { CountUpComponent } from '../ui/count-up.component';
import { confetti } from '../ui/confetti';

type Step = 'pick' | 'slip' | 'done';

interface Choice {
  selection: string;
  label: string;
}

/** Ícono de cada mercado (para que la lista se lea de un vistazo). */
const MARKET_ICON: Record<string, string> = {
  first_goal: '⚽', last_goal: '🏁', top_scorer: '👟', first_to_n_goals: '🎯', nth_goal: '🔢',
  most_wins: '👑', longest_streak: '🔥', most_exits: '🚪', best_team: '🏆', worst_team: '🐢',
  top_scoring_team: '💥', most_conceded_team: '🥅', game_winner: '🆚', game_first_goal: '⚽',
  first_yellow: '🟨', last_yellow: '🟨', most_yellows: '😤', first_red: '🟥',
  first_blooper: '🤦', first_penalty_conceded: '🚨', first_penalty_missed: '🙅', first_post: '🥅',
  first_golazo: '✨', first_dive: '🏊', total_posts: '🧮', first_own_goal: '🙈', first_nutmeg_victim: '🥜',
};

@Component({
  selector: 'app-bet-flow',
  imports: [AmountSheetComponent, IconComponent, CountUpComponent],
  template: `
    @switch (step()) {
      <!-- ====================== 1. Elegir apuestas ====================== -->
      @case ('pick') {
        <section class="anim-in">
          <p class="eyebrow">Hola, {{ auth.user()?.username }} 👋</p>
          <h2 class="mt-1 font-display text-3xl font-extrabold">Arma tu ticket</h2>
          <p class="mt-1 text-sm text-mute">Toca una apuesta, elige y ponle de S/ 1 a S/ 5.</p>
        </section>

        <p class="mt-4 flex gap-2.5 rounded-2xl border border-gold/25 bg-gold/10 p-3 text-sm text-gold anim-in" style="--i: 1">
          <app-icon name="alert" [size]="18" class="mt-0.5" /> {{ warning }}
        </p>

        <!-- Saltar a una sección -->
        <nav class="sticky top-[60px] z-20 -mx-4 mt-4 bg-night/80 px-4 py-2 backdrop-blur-xl anim-in" style="--i: 2" aria-label="Secciones de apuestas">
          <div class="no-scrollbar flex gap-2 overflow-x-auto">
            @for (sec of sections(); track sec.id) {
              <button type="button" class="pick shrink-0" [class.pick-on]="activeSection() === sec.id" (click)="jump(sec.id)">
                {{ sec.icon }} {{ sec.label }}
                @if (countBySection().get(sec.id); as n) {
                  <span class="rounded-full bg-white/25 px-1.5 text-xs font-extrabold" [class.bg-lime]="activeSection() !== sec.id" [class.text-white]="activeSection() !== sec.id">{{ n }}</span>
                }
              </button>
            }
          </div>
        </nav>

        @for (sec of sections(); track sec.id; let si = $index) {
          <section [id]="'sec-' + sec.id" class="scroll-mt-32">
            <div class="mt-6 mb-2.5 flex items-end justify-between px-1">
              <div>
                <h3 class="font-display text-xl font-extrabold">{{ sec.icon }} {{ sec.label }}</h3>
                <p class="text-xs text-mute">{{ sec.blurb }}</p>
              </div>
            </div>
            <div class="space-y-2.5">
              @for (m of sec.markets; track m.id; let mi = $index) {
                @let mine = countFor(m.id);
                @let isOpen = open() === m.id;
                <article class="glass overflow-hidden p-0 transition-colors duration-300 anim-in" [class.border-lime/40]="mine > 0" [style.--i]="mi % 6">
                  <button type="button" class="flex w-full items-center gap-3 p-4 text-left" (click)="toggle(m.id)" [attr.aria-expanded]="isOpen">
                    <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink/[0.06] text-xl">{{ icon(m) }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block font-bold leading-tight">{{ m.name }}</span>
                      <span class="mt-0.5 block text-xs text-mute">{{ hint(m) }} · bote <b class="text-ink">{{ soles(potByMarket().get(m.id) ?? 0) }}</b></span>
                    </span>
                    @if (mine) {
                      <span class="grid h-7 min-w-7 place-items-center rounded-full bg-lime px-2 text-xs font-extrabold text-white anim-pop">{{ mine }}</span>
                    }
                    <app-icon name="chevron" [size]="18" class="text-faint transition-transform duration-300" [class.rotate-180]="isOpen" />
                  </button>
                  @if (isOpen) {
                    <div class="flex flex-wrap gap-2 border-t border-ink/[0.06] p-4 anim-expand">
                      @for (c of choices(m); track c.selection) {
                        @let amt = amountFor(m.id, c.selection);
                        <button type="button" class="pick" [class.pick-on]="amt" [attr.aria-pressed]="!!amt" (click)="openSheet(m, c)">
                          {{ c.label }}
                          @if (amt) {
                            <span class="rounded-full bg-white px-1.5 text-xs font-extrabold text-lime">S/ {{ amt }}</span>
                          }
                        </button>
                      }
                    </div>
                  }
                </article>
              }
            </div>
          </section>
        }

        <!-- Resumen -->
        <section class="glass mt-6">
          <div class="flex items-center justify-between">
            <h3 class="font-display text-lg font-extrabold">Tu ticket</h3>
            <span class="tag">{{ bets().length }} / {{ maxBets }}</span>
          </div>
          @if (bets().length === 0) {
            <p class="mt-2 text-sm text-mute">Aún no elegiste nada. Empieza por el primer gol 😉</p>
          } @else {
            <ul class="mt-2 divide-y divide-ink/[0.06]">
              @for (b of bets(); track b.marketId + b.selection) {
                <li class="flex items-center gap-2 py-2.5 anim-in">
                  <span class="text-lg">{{ icon(marketById().get(b.marketId)) }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold">{{ choiceLabel(b) }}</p>
                    <p class="truncate text-xs text-mute">{{ marketById().get(b.marketId)?.name }}</p>
                  </div>
                  <button type="button" class="rounded-xl bg-lime/15 px-3 py-1.5 text-sm font-extrabold text-lime" (click)="editBet(b)" aria-label="Cambiar monto">S/ {{ b.amount }}</button>
                  <button type="button" class="grid h-9 w-9 place-items-center rounded-xl text-faint hover:bg-candy/15 hover:text-candy" (click)="remove(b.marketId, b.selection)" aria-label="Quitar apuesta">
                    <app-icon name="x" [size]="16" />
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        <!-- Barra de total -->
        @if (bets().length > 0) {
          <div class="fixed inset-x-0 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md px-3 anim-sheet">
            <div class="flex items-center justify-between gap-3 rounded-3xl border border-lime/30 bg-white/95 p-2.5 pl-4 shadow-[0_20px_50px_-12px_rgb(120_55_10/0.3)] backdrop-blur-xl">
              <div class="min-w-0">
                <p class="text-[11px] font-bold text-mute uppercase">Cupón · {{ bets().length }} {{ bets().length === 1 ? 'apuesta' : 'apuestas' }}</p>
                <p class="font-display text-2xl leading-none font-extrabold"><app-count-up [cents]="totalCents()" /></p>
                <p class="mt-0.5 text-[11px] text-mute">Saldo {{ balanceText() }}</p>
              </div>
              <button type="button" class="btn h-12 px-5" (click)="goSlip()">Ver cupón <app-icon name="next" [size]="18" /></button>
            </div>
          </div>
        }
      }

      <!-- ====================== 2. Cupón (se paga con el saldo) ====================== -->
      @case ('slip') {
        <button type="button" class="btn-ghost mb-4 h-10 anim-in" (click)="step.set('pick')"><app-icon name="back" [size]="18" /> Seguir eligiendo</button>

        <section class="glass anim-in">
          <div class="flex items-center justify-between">
            <h2 class="font-display text-2xl font-extrabold">Tu cupón</h2>
            <span class="tag">{{ bets().length }} {{ bets().length === 1 ? 'apuesta' : 'apuestas' }}</span>
          </div>
          <ul class="mt-2 divide-y divide-ink/[0.06]">
            @for (b of bets(); track b.marketId + b.selection; let i = $index) {
              <li class="flex items-center gap-2 py-2.5 anim-in" [style.--i]="i">
                <span class="text-lg">{{ icon(marketById().get(b.marketId)) }}</span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-bold">{{ choiceLabel(b) }}</p>
                  <p class="truncate text-xs text-mute">{{ marketById().get(b.marketId)?.name }}</p>
                </div>
                <button type="button" class="rounded-xl bg-lime/10 px-3 py-1.5 text-sm font-extrabold text-lime" (click)="editBet(b)" aria-label="Cambiar monto">S/ {{ b.amount }}</button>
              </li>
            }
          </ul>
        </section>

        <section class="glass mt-3 anim-in" style="--i: 1">
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-mute">Tu saldo</dt><dd class="font-bold">{{ balanceText() }}</dd></div>
            <div class="flex justify-between"><dt class="text-mute">Este cupón</dt><dd class="font-bold">− {{ soles(totalCents()) }}</dd></div>
            <div class="flex justify-between border-t border-ink/[0.07] pt-2 text-base">
              <dt class="font-bold">Te queda</dt>
              <dd class="font-display text-xl font-extrabold" [class.text-candy]="shortfall() > 0" [class.text-lime]="shortfall() === 0">
                {{ shortfall() > 0 ? '− ' + soles(shortfall() * 100) : soles(remainingCents()) }}
              </dd>
            </div>
          </dl>
          @if (wallet.pendingTotal() > 0) {
            <p class="mt-3 flex items-center gap-1.5 text-xs text-mute"><app-icon name="clock" [size]="14" /> Tienes S/ {{ wallet.pendingTotal() }} en recargas por confirmar.</p>
          }
        </section>

        @if (shortfall() > 0) {
          <section class="mt-3 rounded-3xl border border-candy/20 bg-candy/5 p-4 text-center anim-pop" role="alert">
            <p class="font-bold text-candy">Te faltan {{ soles(shortfall() * 100) }} de saldo</p>
            <p class="mt-1 text-sm text-mute">Recarga plineando al QR. Cuando el organizador la confirme, el saldo aparece y apuestas.</p>
            <button type="button" class="btn mt-3 w-full" (click)="recharge.emit(shortfall())"><app-icon name="wallet" [size]="18" /> Recargar S/ {{ shortfall() }}</button>
          </section>
        } @else {
          @if (error()) {
            <p class="mt-3 rounded-2xl bg-candy/10 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
          }
          <button type="button" class="btn mt-4 w-full" [disabled]="sending() || wallet.balance() === null" (click)="submit()">
            {{ sending() ? 'Apostando…' : 'Apostar ' + soles(totalCents()) }} <app-icon name="check" [size]="18" [stroke]="2.6" />
          </button>
          <p class="mt-2 text-center text-xs text-faint">Se descuenta de tu saldo al instante. Si nadie acierta un mercado, ese bote es del organizador.</p>
        }
      }

      <!-- ====================== 3. Confirmación ====================== -->
      @case ('done') {
        <section class="glass text-center anim-pop">
          <div class="mx-auto grid h-20 w-20 place-items-center rounded-full bg-lime text-white shadow-[0_16px_40px_-10px_rgb(242_98_0/0.7)]">
            <svg class="draw-check" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h2 class="mt-4 font-display text-3xl font-extrabold">¡Apuesta hecha!</h2>
          <p class="mt-1 text-mute">Ya está en juego y se descontó de tu saldo. Te quedan <b class="text-lime">{{ balanceText() }}</b>.</p>
          <ul class="mt-4 divide-y divide-ink/[0.06] text-left">
            @for (b of sent(); track b.marketId + b.selection; let i = $index) {
              <li class="flex justify-between gap-2 py-2 text-sm anim-in" [style.--i]="i">
                <span class="min-w-0"><b>{{ choiceLabel(b) }}</b> <span class="text-mute">· {{ marketById().get(b.marketId)?.name }}</span></span>
                <span class="shrink-0 font-extrabold text-lime">S/ {{ b.amount }}</span>
              </li>
            }
          </ul>
          <p class="mt-3 text-right font-display text-xl font-extrabold">Total {{ soles(sentTotal()) }}</p>
        </section>
        <div class="mt-4 grid gap-2">
          <button type="button" class="btn w-full" (click)="viewMine.emit()">Ver mi cuenta <app-icon name="wallet" [size]="18" /></button>
          <button type="button" class="btn-ghost h-12 w-full" (click)="viewLive.emit()">Ver el bote en vivo</button>
          <button type="button" class="h-11 w-full text-sm font-bold text-lime" (click)="again()">Hacer otra apuesta</button>
        </div>
      }
    }

    @if (sheet(); as s) {
      <app-amount-sheet
        [marketName]="s.market.name"
        [choiceName]="s.choice.label"
        [current]="amountFor(s.market.id, s.choice.selection)"
        (picked)="setAmount(s.market.id, s.choice.selection, $event)"
        (removed)="remove(s.market.id, s.choice.selection); sheet.set(null)"
        (closed)="sheet.set(null)"
      />
    }
    @if (toast()) {
      <div class="fixed inset-x-4 bottom-44 z-50 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm font-bold text-white shadow-lg anim-pop" role="status">{{ toast() }}</div>
    }
  `,
})
export class BetFlowComponent {
  readonly data = input.required<PublicMatchData>();
  readonly code = input.required<string>();
  readonly viewLive = output<void>();
  readonly viewMine = output<void>();
  /** Pide recargar (monto que falta). */
  readonly recharge = output<number>();

  private api = inject(PublicApi);
  protected readonly auth = inject(AuthApi);
  protected readonly wallet = inject(WalletService);
  protected readonly maxBets = MAX_BETS_PER_TICKET;
  protected readonly soles = formatSoles;
  protected readonly warning = HOUSE_WARNING;

  protected readonly step = signal<Step>('pick');
  protected readonly bets = signal<BetDraft[]>([]);
  protected readonly open = signal<string | null>(null);
  protected readonly activeSection = signal<MarketSection | null>(null);
  protected readonly sheet = signal<{ market: Market; choice: Choice } | null>(null);
  protected readonly toast = signal<string | null>(null);

  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal<BetDraft[]>([]);
  private draftLoadedFor = '';

  protected readonly marketById = computed(() => new Map(this.data().markets.map((m) => [m.id, m])));
  private readonly labeler = computed(() => makeSelectionLabel(this.data().players, this.data().teams));

  protected readonly sections = computed(() => {
    const markets = [...this.data().markets].sort((a, b) => a.sort_order - b.sort_order);
    return SECTIONS.map((s) => ({ ...s, markets: markets.filter((m) => m.section === s.id) })).filter((s) => s.markets.length);
  });

  protected readonly countBySection = computed(() => {
    const map = new Map<MarketSection, number>();
    for (const b of this.bets()) {
      const s = this.marketById().get(b.marketId)?.section;
      if (s) map.set(s, (map.get(s) ?? 0) + 1);
    }
    return map;
  });

  private readonly playerChoices = computed(() =>
    this.data().players.filter((p) => !p.is_own_goal).sort((a, b) => a.sort_order - b.sort_order).map((p) => ({ selection: p.id, label: p.name })),
  );
  private readonly ownGoalChoice = computed(() => {
    const og = this.data().players.find((p) => p.is_own_goal);
    return og ? [{ selection: og.id, label: '🙈 Autogol' }] : [];
  });
  private readonly teamChoices = computed(() =>
    [...this.data().teams].sort((a, b) => a.sort_order - b.sort_order).map((t) => ({ selection: t.id, label: t.name })),
  );

  protected readonly potByMarket = computed(() => {
    const map = new Map<string, number>();
    for (const m of this.data().markets) map.set(m.id, Math.round(Number(m.initial_pot || 0) * 100));
    for (const b of this.data().bets) map.set(b.market_id, (map.get(b.market_id) ?? 0) + b.amount * 100);
    return map;
  });

  protected readonly totalCents = computed(() => this.bets().reduce((s, b) => s + b.amount * 100, 0));
  protected readonly sentTotal = computed(() => this.sent().reduce((s, b) => s + b.amount * 100, 0));
  /** Soles que faltan para pagar el cupón con el saldo (0 si alcanza). */
  protected readonly shortfall = computed(() => Math.max(0, this.totalCents() / 100 - (this.wallet.balance() ?? 0)));
  protected readonly remainingCents = computed(() => (this.wallet.balance() ?? 0) * 100 - this.totalCents());
  protected readonly balanceText = computed(() => (this.wallet.balance() === null ? '…' : formatSoles((this.wallet.balance() ?? 0) * 100)));

  constructor() {
    effect(() => {
      const code = this.code();
      const saved = readDraft(code);
      if (saved) this.bets.set(saved);
      this.draftLoadedFor = code;
    });
    effect(() => {
      const code = this.code();
      const draft = this.bets();
      if (this.draftLoadedFor === code) writeDraft(code, draft);
    });
    // Quita apuestas a opciones o mercados que ya no existen.
    effect(() => {
      const valid = this.bets().filter((b) => {
        const m = this.marketById().get(b.marketId);
        return m && this.choices(m).some((c) => c.selection === b.selection);
      });
      if (valid.length !== this.bets().length) this.bets.set(valid);
    });
  }

  protected icon(m: Market | undefined): string {
    return (m && MARKET_ICON[m.type]) || '🎲';
  }

  protected choices(m: Market): Choice[] {
    if (m.target === 'team') return this.teamChoices();
    if (m.type === 'game_winner') {
      return ['1', '0', '2'].map((s) => ({ selection: s, label: this.labeler()('number', s, 'game_winner', m.param) }));
    }
    if (m.target === 'number') {
      const min = m.option_min ?? 1;
      const max = m.option_max ?? numberMaxOption(m.type);
      return Array.from({ length: max - min + 1 }, (_, i) => {
        const n = min + i;
        return { selection: String(n), label: n === max ? `${n}+` : String(n) };
      });
    }
    return [...this.playerChoices(), ...(m.allows_own_goal ? this.ownGoalChoice() : [])];
  }

  protected hint(m: Market): string {
    if (m.type === 'game_winner') return `Partido ${m.param} · 1X2`;
    if (m.type === 'game_first_goal') return `Partido ${m.param} · a un jugador`;
    if (m.target === 'team') return 'A un equipo';
    if (m.target === 'number') return 'A un número';
    return 'A un jugador';
  }

  protected choiceLabel(b: BetDraft): string {
    const m = this.marketById().get(b.marketId);
    return this.labeler()(m?.target, b.selection, m?.type, m?.param);
  }

  protected countFor(marketId: string) {
    return this.bets().filter((b) => b.marketId === marketId).length;
  }

  protected amountFor(marketId: string, selection: string): number | null {
    return this.bets().find((b) => b.marketId === marketId && b.selection === selection)?.amount ?? null;
  }

  protected toggle(marketId: string) {
    this.open.set(this.open() === marketId ? null : marketId);
  }

  protected jump(id: MarketSection) {
    this.activeSection.set(id);
    document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected openSheet(market: Market, choice: Choice) {
    this.sheet.set({ market, choice });
  }

  protected editBet(b: BetDraft) {
    const market = this.marketById().get(b.marketId);
    const choice = market && this.choices(market).find((c) => c.selection === b.selection);
    if (market && choice) this.sheet.set({ market, choice });
  }

  protected setAmount(marketId: string, selection: string, amount: number) {
    const list = this.bets();
    const i = list.findIndex((b) => b.marketId === marketId && b.selection === selection);
    if (i >= 0) {
      this.bets.set(list.map((b, j) => (j === i ? { ...b, amount } : b)));
    } else if (list.length >= MAX_BETS_PER_TICKET) {
      this.flash(`Máximo ${MAX_BETS_PER_TICKET} apuestas por ticket`);
    } else {
      this.bets.set([...list, { marketId, selection, amount }]);
      navigator.vibrate?.(12);
    }
    this.sheet.set(null);
  }

  protected remove(marketId: string, selection: string) {
    this.bets.set(this.bets().filter((b) => !(b.marketId === marketId && b.selection === selection)));
  }

  protected goSlip() {
    if (this.bets().length === 0) return this.flash('Elige al menos una apuesta');
    this.error.set(null);
    this.wallet.refresh();
    this.step.set('slip');
    window.scrollTo({ top: 0 });
  }

  protected async submit() {
    if (this.sending() || this.shortfall() > 0) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      const withTarget = this.bets().map((b) => ({ ...b, target: this.marketById().get(b.marketId)!.target }));
      await this.api.submitTicket(this.code(), withTarget);
      this.sent.set(this.bets());
      this.bets.set([]);
      await this.wallet.refresh();
      this.step.set('done');
      window.scrollTo({ top: 0 });
      setTimeout(() => confetti(), 150);
    } catch (e) {
      this.error.set(friendlyError(e));
      this.wallet.refresh();
    } finally {
      this.sending.set(false);
    }
  }

  protected again() {
    this.sent.set([]);
    this.step.set('pick');
  }

  private flash(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

// --- Borrador en el navegador (comodidad, puede no estar disponible) ---
const draftKey = (code: string) => `copa:draft3:${code.toUpperCase()}`;
function readDraft(code: string): BetDraft[] | null {
  try {
    const raw = localStorage.getItem(draftKey(code));
    const d = raw ? (JSON.parse(raw) as BetDraft[]) : null;
    return Array.isArray(d) && d.every((b) => typeof b.selection === 'string' && typeof b.marketId === 'string') ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(code: string, d: BetDraft[]) {
  try {
    localStorage.setItem(draftKey(code), JSON.stringify(d));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
