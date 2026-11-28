import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ErrorrComponent } from '../ui/errorr.component';

/** 404 con ERRORR. */
@Component({
  selector: 'app-not-found',
  imports: [ErrorrComponent, RouterLink],
  template: `
    <main class="mx-auto grid min-h-dvh max-w-md place-items-center bg-night px-4 py-10">
      <section class="glass w-full p-6 anim-in">
        <app-errorr [big]="true">Esta página es bamba, causa: no existe. Te mandaron cualquier floro.</app-errorr>
        <a routerLink="/" class="btn mt-6 w-full">Al toque, a la portada</a>
      </section>
    </main>
  `,
})
export class NotFoundPage {}
