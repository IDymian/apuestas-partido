import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi, MIN_PASSWORD, MockAuthApi, USERNAME_RE, validateSignUp } from '../core/auth';
import { BrandComponent } from '../ui/brand.component';
import { IconComponent } from '../ui/icon.component';
import { confetti } from '../ui/confetti';

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'confirmed';
type Sent = { kind: 'confirm' | 'reset'; email: string; testToken?: string } | null;

const NEXT_KEY = 'copa:next';
/** Solo rutas internas (evita redirecciones a otros sitios). */
const safeNext = (v: string | null | undefined) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null);
function rememberNext(v: string | null) {
  try {
    if (v) localStorage.setItem(NEXT_KEY, v);
  } catch {
    /* sin almacenamiento */
  }
}
function takeNext(): string | null {
  try {
    const v = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return safeNext(v);
  } catch {
    return null;
  }
}

/** Entrar, crear cuenta, recuperar contraseña, nueva contraseña y cuenta confirmada. */
@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, BrandComponent, IconComponent],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-10">
      <header class="flex items-center justify-between">
        <app-brand />
        <a routerLink="/" class="btn-ghost h-10 rounded-full" aria-label="Volver al inicio"><app-icon name="home" [size]="18" /></a>
      </header>

      <main class="my-auto py-8">
        @if (sent(); as s) {
          <!-- ============ Correo enviado ============ -->
          <section class="glass text-center anim-in">
            <div class="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-grape to-candy text-white shadow-[0_16px_40px_-10px_rgb(242_98_0/0.6)] animate-float">
              <app-icon name="mail" [size]="36" />
            </div>
            <h1 class="mt-5 font-display text-3xl font-extrabold">Revisa tu correo</h1>
            <p class="mt-2 text-mute">
              @if (s.kind === 'confirm') {
                Te enviamos un link a <b class="text-ink">{{ s.email }}</b> para confirmar tu cuenta.
              } @else {
                Si <b class="text-ink">{{ s.email }}</b> tiene cuenta, te llegará un link para crear una contraseña nueva.
              }
            </p>
            <p class="mt-2 text-sm text-faint">¿No aparece? Mira en spam o promociones.</p>

            @if (auth.isTestBackend) {
              <div class="mt-5 rounded-2xl border border-dashed border-gold/50 bg-gold/10 p-4 text-left">
                <p class="text-xs font-extrabold tracking-wider text-gold uppercase">📬 Bandeja de prueba (pruebas locales)</p>
                @if (s.testToken) {
                  <p class="mt-1 text-sm text-ink">
                    {{ s.kind === 'confirm' ? 'Copa Álvaro: confirma tu cuenta' : 'Copa Álvaro: crea tu nueva contraseña' }}
                  </p>
                  <button type="button" class="btn mt-3 h-11 w-full text-[15px]" (click)="openTestMail(s)">
                    {{ s.kind === 'confirm' ? 'Confirmar mi cuenta' : 'Crear contraseña nueva' }}
                  </button>
                } @else {
                  <p class="mt-1 text-sm text-mute">No hay cuenta con ese correo, así que no llegó nada.</p>
                }
              </div>
            }

            @if (s.kind === 'confirm') {
              <button type="button" class="btn-ghost mt-5 w-full" [disabled]="busy() || cooldown() > 0" (click)="resend(s.email)">
                <app-icon name="refresh" [size]="18" />
                {{ cooldown() > 0 ? 'Reenviar en ' + cooldown() + ' s' : 'Reenviar correo' }}
              </button>
            }
            @if (info()) {
              <p class="mt-3 text-sm font-semibold text-lime">{{ info() }}</p>
            }
            @if (error()) {
              <p class="mt-3 rounded-2xl bg-candy/15 p-3 text-sm text-candy" role="alert">{{ error() }}</p>
            }
            <a [routerLink]="['/entrar']" [queryParams]="nextParams()" class="mt-4 inline-block text-sm font-bold text-lime">Ya confirmé, quiero entrar →</a>
          </section>
        } @else {
          @switch (mode()) {
            <!-- ============ Entrar ============ -->
            @case ('login') {
              <section class="anim-in">
                <p class="eyebrow">Bienvenido de vuelta</p>
                <h1 class="mt-1 font-display text-4xl font-extrabold">Entrar</h1>
                <p class="mt-1 text-mute">Para apostar, ver tus tickets y escribir en Social.</p>
              </section>
              <form class="glass mt-5 space-y-4 anim-in" style="--i: 1" (ngSubmit)="login()">
                <label class="block">
                  <span class="field-label">{{ auth.loginWithUsername ? 'Correo o usuario' : 'Correo' }}</span>
                  <input
                    class="field"
                    [type]="auth.loginWithUsername ? 'text' : 'email'"
                    name="email"
                    autocomplete="username"
                    autocapitalize="none"
                    [attr.inputmode]="auth.loginWithUsername ? null : 'email'"
                    required
                    [(ngModel)]="email"
                    placeholder="tucorreo@gmail.com"
                  />
                </label>
                <label class="block">
                  <span class="field-label">Contraseña</span>
                  <span class="relative block">
                    <input class="field pr-12" aria-label="Contraseña" [type]="showPass() ? 'text' : 'password'" name="password" autocomplete="current-password" required [(ngModel)]="password" />
                    <button type="button" class="absolute inset-y-0 right-1 grid w-11 place-items-center text-mute hover:text-ink" (click)="showPass.set(!showPass())" [attr.aria-label]="showPass() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                      <app-icon [name]="showPass() ? 'eyeOff' : 'eye'" [size]="18" />
                    </button>
                  </span>
                </label>
                <div class="flex justify-end">
                  <a [routerLink]="['/recuperar']" [queryParams]="nextParams()" class="text-sm font-bold text-lime">¿Olvidaste tu contraseña?</a>
                </div>
                @if (error()) {
                  <p class="rounded-2xl bg-candy/15 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
                  @if (needsConfirm()) {
                    <button type="button" class="btn-ghost w-full" [disabled]="busy()" (click)="resend(email)">Reenviar correo de confirmación</button>
                  }
                }
                @if (info()) {
                  <p class="text-sm font-semibold text-lime">{{ info() }}</p>
                }
                <button class="btn w-full" [disabled]="busy()">{{ busy() ? 'Entrando…' : 'Entrar' }} <app-icon name="next" /></button>
              </form>
              <p class="mt-5 text-center text-sm text-mute anim-in" style="--i: 2">
                ¿Primera vez?
                <a [routerLink]="['/registro']" [queryParams]="nextParams()" class="font-bold text-lime">Crea tu cuenta</a>
              </p>
            }

            <!-- ============ Crear cuenta ============ -->
            @case ('signup') {
              <section class="anim-in">
                <p class="eyebrow">Únete a la Copa</p>
                <h1 class="mt-1 font-display text-4xl font-extrabold">Crea tu cuenta</h1>
                <p class="mt-1 text-mute">Tu usuario es el nombre con el que apuestas y comentas.</p>
              </section>
              <form class="glass mt-5 space-y-4 anim-in" style="--i: 1" (ngSubmit)="signup()">
                <label class="block">
                  <span class="field-label">Correo</span>
                  <input class="field" type="email" name="email" autocomplete="email" inputmode="email" required [(ngModel)]="email" placeholder="tucorreo@gmail.com" />
                </label>
                <label class="block">
                  <span class="field-label">Usuario</span>
                  <span class="relative block">
                    <span class="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-faint"><app-icon name="at" [size]="18" /></span>
                    <input
                      class="field pl-11"
                      name="username"
                      autocomplete="username"
                      autocapitalize="none"
                      maxlength="20"
                      required
                      [ngModel]="username()"
                      (ngModelChange)="onUsername($event)"
                      placeholder="el_pichichi"
                    />
                  </span>
                  <span class="mt-1.5 block text-xs" [class]="userHint().tone">{{ userHint().text }}</span>
                </label>
                <label class="block">
                  <span class="field-label">Contraseña</span>
                  <span class="relative block">
                    <input class="field pr-12" aria-label="Contraseña" [type]="showPass() ? 'text' : 'password'" name="password" autocomplete="new-password" required [ngModel]="pass()" (ngModelChange)="pass.set($event)" />
                    <button type="button" class="absolute inset-y-0 right-1 grid w-11 place-items-center text-mute hover:text-ink" (click)="showPass.set(!showPass())" [attr.aria-label]="showPass() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                      <app-icon [name]="showPass() ? 'eyeOff' : 'eye'" [size]="18" />
                    </button>
                  </span>
                  <span class="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
                    @for (i of [0, 1, 2, 3]; track i) {
                      <span class="h-1.5 rounded-full transition-colors duration-300" [class]="i < strength().score ? strength().bar : 'bg-ink/10'"></span>
                    }
                  </span>
                  <span class="mt-1 block text-xs text-mute">{{ strength().label }}</span>
                </label>
                <label class="block">
                  <span class="field-label">Repite la contraseña</span>
                  <input class="field" [type]="showPass() ? 'text' : 'password'" name="confirm" autocomplete="new-password" required [(ngModel)]="confirm" />
                </label>
                @if (error()) {
                  <p class="rounded-2xl bg-candy/15 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
                }
                <button class="btn w-full" [disabled]="busy()">{{ busy() ? 'Creando…' : 'Crear cuenta' }} <app-icon name="sparkles" /></button>
              </form>
              <p class="mt-5 text-center text-sm text-mute anim-in" style="--i: 2">
                ¿Ya tienes cuenta?
                <a [routerLink]="['/entrar']" [queryParams]="nextParams()" class="font-bold text-lime">Entrar</a>
              </p>
            }

            <!-- ============ Recuperar ============ -->
            @case ('forgot') {
              <section class="anim-in">
                <p class="eyebrow">Tranqui, pasa</p>
                <h1 class="mt-1 font-display text-4xl font-extrabold">Recuperar contraseña</h1>
                <p class="mt-1 text-mute">Escribe tu correo y te mandamos un link para crear una nueva.</p>
              </section>
              <form class="glass mt-5 space-y-4 anim-in" style="--i: 1" (ngSubmit)="forgot()">
                <label class="block">
                  <span class="field-label">Correo</span>
                  <input class="field" type="email" name="email" autocomplete="email" inputmode="email" required [(ngModel)]="email" placeholder="tucorreo@gmail.com" />
                </label>
                @if (error()) {
                  <p class="rounded-2xl bg-candy/15 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
                }
                <button class="btn w-full" [disabled]="busy()">{{ busy() ? 'Enviando…' : 'Enviar link' }} <app-icon name="send" [size]="18" /></button>
              </form>
              <p class="mt-5 text-center text-sm anim-in" style="--i: 2">
                <a [routerLink]="['/entrar']" [queryParams]="nextParams()" class="font-bold text-lime">← Volver a entrar</a>
              </p>
            }

            <!-- ============ Nueva contraseña ============ -->
            @case ('reset') {
              @if (auth.recovery() || auth.user()) {
                <section class="anim-in">
                  <p class="eyebrow">Último paso</p>
                  <h1 class="mt-1 font-display text-4xl font-extrabold">Nueva contraseña</h1>
                  <p class="mt-1 text-mute">Para la cuenta <b class="text-ink">{{ auth.user()?.email }}</b>.</p>
                </section>
                @if (done()) {
                  <section class="glass mt-5 text-center anim-pop">
                    <div class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime text-white"><app-icon name="check" [size]="32" [stroke]="3" /></div>
                    <p class="mt-3 font-display text-2xl font-extrabold">¡Contraseña cambiada!</p>
                    <button type="button" class="btn mt-4 w-full" (click)="goNext()">Continuar <app-icon name="next" /></button>
                  </section>
                } @else {
                  <form class="glass mt-5 space-y-4 anim-in" style="--i: 1" (ngSubmit)="reset()">
                    <label class="block">
                      <span class="field-label">Contraseña nueva</span>
                      <input class="field" type="password" name="password" autocomplete="new-password" required [ngModel]="pass()" (ngModelChange)="pass.set($event)" />
                      <span class="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
                        @for (i of [0, 1, 2, 3]; track i) {
                          <span class="h-1.5 rounded-full transition-colors duration-300" [class]="i < strength().score ? strength().bar : 'bg-ink/10'"></span>
                        }
                      </span>
                    </label>
                    <label class="block">
                      <span class="field-label">Repítela</span>
                      <input class="field" type="password" name="confirm" autocomplete="new-password" required [(ngModel)]="confirm" />
                    </label>
                    @if (error()) {
                      <p class="rounded-2xl bg-candy/15 p-3 text-sm text-candy anim-pop" role="alert">{{ error() }}</p>
                    }
                    <button class="btn w-full" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar contraseña' }} <app-icon name="key" [size]="18" /></button>
                  </form>
                }
              } @else {
                <section class="glass text-center anim-in">
                  <p class="text-5xl">⌛</p>
                  <h1 class="mt-3 font-display text-2xl font-extrabold">El link venció o no es válido</h1>
                  <p class="mt-1 text-mute">Pide otro correo para crear tu contraseña.</p>
                  <a routerLink="/recuperar" class="btn mt-5 w-full">Pedir otro link</a>
                </section>
              }
            }

            <!-- ============ Cuenta confirmada ============ -->
            @case ('confirmed') {
              <section class="glass text-center anim-pop">
                <div class="mx-auto grid h-20 w-20 place-items-center rounded-full bg-lime text-white shadow-[0_16px_40px_-10px_rgb(242_98_0/0.7)]">
                  <svg class="draw-check" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                @if (auth.user(); as u) {
                  <h1 class="mt-5 font-display text-3xl font-extrabold">¡Listo, {{ u.username }}!</h1>
                  <p class="mt-2 text-mute">Tu cuenta está confirmada. Ya puedes apostar y comentar.</p>
                  <button type="button" class="btn mt-6 w-full" (click)="goNext()">Ir a la jornada <app-icon name="next" /></button>
                } @else {
                  <h1 class="mt-5 font-display text-3xl font-extrabold">¡Correo confirmado!</h1>
                  <p class="mt-2 text-mute">Ahora entra con tu correo y contraseña.</p>
                  <a [routerLink]="['/entrar']" class="btn mt-6 w-full">Entrar</a>
                }
              </section>
            }
          }
        }
      </main>
    </div>
  `,
})
export class AuthPage implements OnDestroy {
  /** Viene de `data.mode` de la ruta. */
  readonly modeInput = input<Mode>('login', { alias: 'mode' });
  /** ?next=/p/CODIGO para volver después de entrar. */
  readonly nextInput = input<string | undefined>(undefined, { alias: 'next' });

  protected readonly auth = inject(AuthApi);
  private router = inject(Router);

  protected readonly mode = computed(() => this.modeInput());
  protected readonly next = computed(() => safeNext(this.nextInput()));
  protected readonly nextParams = computed(() => (this.next() ? { next: this.next() } : {}));

  protected email = '';
  protected password = '';
  protected confirm = '';
  protected readonly username = signal('');
  protected readonly pass = signal('');
  protected readonly showPass = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly needsConfirm = signal(false);
  protected readonly sent = signal<Sent>(null);
  protected readonly done = signal(false);
  protected readonly cooldown = signal(0);
  protected readonly userState = signal<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle');
  private userTimer: ReturnType<typeof setTimeout> | undefined;
  /** true mientras se pasa a otra pantalla de cuenta (no redirigir a la jornada). */
  private handoff = false;
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;

  protected readonly userHint = computed(() => {
    switch (this.userState()) {
      case 'checking':
        return { text: 'Revisando…', tone: 'text-mute' };
      case 'free':
        return { text: '✓ Disponible', tone: 'text-lime font-bold' };
      case 'taken':
        return { text: '✕ Ya está tomado, prueba otro', tone: 'text-candy font-bold' };
      case 'invalid':
        return { text: '3 a 20 caracteres: letras, números, punto o guion bajo', tone: 'text-candy' };
      default:
        return { text: '3 a 20 caracteres: letras, números, punto o guion bajo', tone: 'text-faint' };
    }
  });

  protected readonly strength = computed(() => {
    const p = this.pass();
    let score = 0;
    if (p.length >= MIN_PASSWORD) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
    if (p.length < MIN_PASSWORD) score = Math.min(score, 1);
    const labels = [`Mínimo ${MIN_PASSWORD} caracteres`, 'Floja', 'Aceptable', 'Buena', 'Golazo 🔥'];
    const bars = ['bg-candy', 'bg-candy', 'bg-gold', 'bg-sky', 'bg-lime'];
    return { score, label: p ? labels[score] : labels[0], bar: bars[score] };
  });

  constructor() {
    effect(() => {
      const m = this.mode();
      untracked(() => {
        this.error.set(null);
        this.info.set(null);
        this.sent.set(null);
        this.done.set(false);
        if (m === 'confirmed' && this.auth.user()) setTimeout(() => confetti(), 250);
      });
    });
    // Si ya hay sesión en "Entrar"/"Crear cuenta", sigue de largo.
    effect(() => {
      if ((this.mode() === 'login' || this.mode() === 'signup') && this.auth.user() && !this.sent() && !this.handoff) {
        untracked(() => this.router.navigateByUrl(this.next() ?? '/', { replaceUrl: true }));
      }
    });
  }

  protected onUsername(v: string) {
    this.username.set(v);
    clearTimeout(this.userTimer);
    const name = v.trim();
    if (!name) return this.userState.set('idle');
    if (!USERNAME_RE.test(name)) return this.userState.set('invalid');
    this.userState.set('checking');
    this.userTimer = setTimeout(async () => {
      try {
        const free = await this.auth.usernameAvailable(name);
        if (this.username().trim() === name) this.userState.set(free ? 'free' : 'taken');
      } catch {
        this.userState.set('idle');
      }
    }, 400);
  }

  async login() {
    this.handoff = true;
    await this.run(async () => {
      this.needsConfirm.set(false);
      try {
        await this.auth.signIn(this.email, this.password);
      } catch (e) {
        if (/confirma tu correo/i.test((e as Error).message)) this.needsConfirm.set(true);
        this.handoff = false;
        throw e;
      }
      this.router.navigateByUrl(this.next() ?? '/', { replaceUrl: true });
    });
  }

  async signup() {
    const invalid = validateSignUp(this.email, this.username(), this.pass(), this.confirm);
    if (invalid) return this.error.set(invalid);
    if (this.userState() === 'taken') return this.error.set('Ese usuario ya está tomado. Prueba con otro.');
    await this.run(async () => {
      const r = await this.auth.signUp(this.email, this.username(), this.pass());
      rememberNext(this.next());
      if (!r.needsConfirm) {
        await this.router.navigateByUrl(this.next() ?? '/', { replaceUrl: true });
        return;
      }
      this.sent.set({ kind: 'confirm', email: this.email.trim(), testToken: r.testToken });
      this.startCooldown();
    });
  }

  async forgot() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) return this.error.set('Escribe un correo válido.');
    await this.run(async () => {
      const token = await this.auth.sendReset(this.email);
      rememberNext(this.next());
      this.sent.set({ kind: 'reset', email: this.email.trim(), testToken: token });
    });
  }

  async reset() {
    if (this.pass().length < MIN_PASSWORD) return this.error.set(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (this.pass() !== this.confirm) return this.error.set('Las contraseñas no coinciden.');
    await this.run(async () => {
      await this.auth.updatePassword(this.pass());
      this.done.set(true);
      confetti({ count: 80 });
    });
  }

  async resend(email: string) {
    await this.run(async () => {
      await this.auth.resendConfirmation(email);
      this.info.set('Listo, te reenviamos el correo.');
      this.startCooldown();
    });
  }

  /** Solo pruebas locales: simula abrir el correo. */
  protected openTestMail(s: NonNullable<Sent>) {
    const mock = this.auth as MockAuthApi;
    if (!s.testToken) return;
    this.handoff = true;
    if (s.kind === 'confirm') {
      mock.confirmTestMail(s.testToken);
      this.sent.set(null);
      this.router.navigateByUrl('/cuenta-confirmada');
    } else {
      mock.startTestRecovery(s.testToken);
      this.sent.set(null);
      this.router.navigateByUrl('/nueva-clave');
    }
  }

  protected goNext() {
    this.router.navigateByUrl(takeNext() ?? this.next() ?? '/', { replaceUrl: true });
  }

  private startCooldown() {
    clearInterval(this.cooldownTimer);
    this.cooldown.set(45);
    this.cooldownTimer = setInterval(() => {
      this.cooldown.update((c) => Math.max(0, c - 1));
      if (this.cooldown() === 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }

  private async run(fn: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set((e as Error)?.message ?? String(e));
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy() {
    clearTimeout(this.userTimer);
    clearInterval(this.cooldownTimer);
  }
}
