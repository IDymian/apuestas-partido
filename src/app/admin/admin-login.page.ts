import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi } from '../core/admin-api';
import { friendlyError } from '../core/public-api';

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p class="text-center text-5xl">🛠️</p>
      <h1 class="mt-2 text-center text-2xl font-extrabold text-slate-900">Organizador</h1>
      <form class="card mt-6 space-y-3" (ngSubmit)="submit()">
        <label class="block">
          <span class="text-sm font-semibold text-slate-700">Correo</span>
          <input class="input mt-1" type="email" name="email" autocomplete="username" required [(ngModel)]="email" />
        </label>
        <label class="block">
          <span class="text-sm font-semibold text-slate-700">Contraseña</span>
          <input class="input mt-1" type="password" name="password" autocomplete="current-password" required [(ngModel)]="password" />
        </label>
        @if (error()) {
          <p class="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
        <button class="btn-primary w-full" [disabled]="busy()">{{ busy() ? 'Entrando…' : 'Entrar' }}</button>
      </form>
      @if (api.isDemo) {
        <p class="mt-3 text-center text-xs text-amber-800">Modo demo: entra con cualquier correo y contraseña.</p>
      }
      <a routerLink="/" class="mt-8 text-center text-sm text-slate-500">← Volver</a>
    </main>
  `,
})
export class AdminLoginPage {
  protected api = inject(AdminApi);
  private router = inject(Router);
  protected email = '';
  protected password = '';
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  async submit() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.signIn(this.email, this.password);
      if (!(await this.api.isAdmin())) {
        await this.api.signOut();
        throw new Error('Este usuario no es administrador.');
      }
      this.router.navigateByUrl('/admin');
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
