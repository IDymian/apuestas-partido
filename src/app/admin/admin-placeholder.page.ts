import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-placeholder',
  imports: [RouterLink],
  template: `
    <main class="mx-auto max-w-md p-6 text-center">
      <p class="mt-20 text-5xl">🛠️</p>
      <h1 class="mt-3 text-xl font-bold">Panel del organizador</h1>
      <p class="mt-1 text-slate-600">Disponible en la siguiente fase.</p>
      <a routerLink="/" class="btn-primary mt-6 inline-flex">Volver</a>
    </main>
  `,
})
export class AdminPlaceholderPage {}
