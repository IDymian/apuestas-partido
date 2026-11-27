import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { lastMatch } from '../core/last-match';
import { Ball3dComponent } from '../ui/ball3d.component';
import { BrandComponent } from '../ui/brand.component';
import { IconComponent } from '../ui/icon.component';
import { AccountChipComponent } from '../ui/account-chip.component';

const MARQUEE = [
  '⚽ Primer gol', '🟥 Primera roja', '🥅 Primer palo', '✨ Primer golazo', '🤦 Primer blooper', '🚨 Penal cometido',
  '🙅 Falla penal', '👑 Rey de la cancha', '🏆 Mejor equipo', '🐢 Peor equipo', '🏊 Piscinazo', '🥜 Huacha', '🙈 Autogol',
];

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, Ball3dComponent, BrandComponent, IconComponent, AccountChipComponent],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-10 md:max-w-5xl md:px-8">
      <header class="relative z-30 flex items-center justify-between anim-in">
        <app-brand />
        <app-account-chip />
      </header>

      <div class="md:mt-8 md:grid md:grid-cols-2 md:items-center md:gap-12">
      <!-- Hero -->
      <section class="relative -mx-4 mt-2 md:mx-0">
        <app-ball3d class="h-[300px] w-full md:h-[520px]" />
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-night to-transparent md:hidden"></div>
      </section>

      <div>
      <div class="-mt-6 text-center md:mt-0 md:text-left">
        <p class="eyebrow anim-in" style="--i: 1"><span class="live-dot mr-1.5 align-middle"></span>Copa Álvaro · Lima</p>
        <h1 class="mt-2 font-display text-[40px] leading-[0.95] font-extrabold md:text-6xl anim-in" style="--i: 2">
          La esférica<br /><span class="text-gradient">no se mancha</span>
        </h1>
        <p class="mx-auto mt-3 max-w-xs text-[15px] text-mute md:mx-0 md:max-w-md md:text-lg anim-in" style="--i: 3">
          Recarga saldo plineando al QR, apuesta de S/ 1 a S/ 5 con tus amigos y mira el bote subir en vivo.
        </p>
      </div>

      @if (last; as l) {
        <a [routerLink]="['/p', l.code]" class="glass mt-6 flex items-center gap-3 transition hover:border-lime/40 active:scale-[0.99] anim-in" style="--i: 4">
          <span class="grid h-11 w-11 place-items-center rounded-2xl bg-lime/15 text-lime"><app-icon name="live" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-bold text-mute">Volver a</span>
            <span class="block truncate font-display text-lg font-extrabold">{{ l.title }}</span>
          </span>
          <app-icon name="next" class="text-lime" />
        </a>
      }

      <form class="glass mt-4 anim-in" style="--i: 5" (submit)="$event.preventDefault(); go()">
        <label for="code" class="field-label">Código de la jornada</label>
        <input
          id="code"
          class="field h-16 text-center font-display text-3xl font-extrabold tracking-[0.35em] uppercase"
          placeholder="COPA26"
          autocomplete="off"
          autocapitalize="characters"
          maxlength="20"
          [value]="code()"
          (input)="code.set($any($event.target).value)"
        />
        <button type="submit" class="btn mt-3 w-full" [disabled]="code().trim().length < 4">
          Entrar a la jornada <app-icon name="next" />
        </button>
        @if (isDemo) {
          <p class="mt-3 text-center text-xs text-mute">
            Modo demo · prueba
            <a routerLink="/p/ABIERTA" class="font-bold text-lime underline-offset-2 hover:underline">ABIERTA</a>,
            <a routerLink="/p/DEMO26" class="font-bold text-lime underline-offset-2 hover:underline">DEMO26</a> (en vivo) o
            <a routerLink="/p/FINAL" class="font-bold text-lime underline-offset-2 hover:underline">FINAL</a>
          </p>
        }
      </form>
      </div>
      </div>

      <!-- Mercados -->
      <div class="relative -mx-4 mt-8 overflow-hidden py-1 anim-in" style="--i: 6" aria-label="Algunas apuestas">
        <div class="flex w-max animate-marquee gap-2 hover:[animation-play-state:paused]">
          @for (m of marquee; track $index) {
            <span class="rounded-full border border-ink/10 bg-ink/[0.04] px-3.5 py-2 text-sm font-semibold whitespace-nowrap">{{ m }}</span>
          }
        </div>
        <div class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-night"></div>
        <div class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-night"></div>
      </div>

      <!-- Cómo funciona -->
      <section class="mt-8">
        <h2 class="font-display text-2xl font-extrabold anim-in" style="--i: 7">Cómo se juega</h2>
        <ol class="mt-3 space-y-2.5 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
          @for (s of steps; track s.title; let i = $index) {
            <li class="glass flex gap-3.5 anim-in" [style.--i]="8 + i">
              <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-extrabold" [class]="s.tone">{{ i + 1 }}</span>
              <span>
                <span class="block font-bold">{{ s.title }}</span>
                <span class="block text-sm text-mute">{{ s.text }}</span>
              </span>
            </li>
          }
        </ol>
      </section>

      <footer class="mt-auto pt-10 text-center text-xs text-faint">
        <p>Copa Álvaro · La esférica no se mancha. Juega con responsabilidad, es entre amigos.</p>
        <a routerLink="/admin" class="mt-2 inline-block font-semibold text-mute hover:text-ink">Soy el organizador</a>
      </footer>
    </div>
  `,
})
export class HomePage {
  private router = inject(Router);
  protected readonly auth = inject(AuthApi);
  protected readonly isDemo = inject(PublicApi).isDemo;
  protected readonly code = signal('');
  protected readonly last = lastMatch();
  protected readonly marquee = [...MARQUEE, ...MARQUEE];
  protected readonly steps = [
    { title: 'Crea tu cuenta', text: 'Correo, usuario y contraseña. Te llega un correo para confirmarla.', tone: 'bg-lime text-white' },
    { title: 'Recarga saldo por Plin', text: 'Plineas al QR y subes la captura. Cuando el organizador lo confirma, el saldo aparece en tu cuenta.', tone: 'bg-candy text-white' },
    { title: 'Apuesta y vive el partido', text: '25 apuestas: goles, rojas, palos, golazos, bloopers… Se descuentan de tu saldo. El bote sube en vivo y en Social comentan todos.', tone: 'bg-gold text-white' },
  ];

  go() {
    const c = this.code().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length >= 4) this.router.navigate(['/p', c]);
  }
}
