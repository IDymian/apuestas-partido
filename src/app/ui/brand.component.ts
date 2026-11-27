import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Logo + nombre: "Copa Álvaro". */
@Component({
  selector: 'app-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/" class="group inline-flex items-center gap-2.5" aria-label="Copa Álvaro, inicio">
      <img
        src="brand/mark.svg"
        alt=""
        [width]="size()"
        [height]="size()"
        class="transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-rotate-12 group-hover:scale-110"
      />
      @if (showName()) {
        <span class="leading-none">
          <span class="block font-display text-[19px] font-extrabold tracking-tight text-ink">Copa Álvaro</span>
          <span class="block text-[10px] font-extrabold tracking-[0.22em] text-lime uppercase">la esférica no se mancha</span>
        </span>
      }
    </a>
  `,
})
export class BrandComponent {
  readonly size = input(40);
  readonly showName = input(true);
}
