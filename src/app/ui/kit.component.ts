import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Kit } from '../core/kits';

let seq = 0;

const SHAPES = {
  shirt: { w: 48, h: 44, d: 'M15 4 L20 7 Q24 9 28 7 L33 4 L44 12 L39 21 L34 18 L34 40 L14 40 L14 18 L9 21 L4 12 Z', stroke: 1.8 },
  // hombros.svg del agente de arte: va detrás del avatar ilustrado (que viene sin torso).
  shoulders: { w: 512, h: 512, d: 'M40 512 C48 460 120 428 196 420 Q256 474 316 420 C392 428 464 460 472 512 Z', stroke: 12 },
};

/** Camiseta de equipo dibujada con SVG (patrón del kit, sin escudo). El tamaño lo pone la clase del host. */
@Component({
  selector: 'app-kit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block', 'aria-hidden': 'true' },
  template: `
    @let s = shape();
    @let k = kit();
    <svg class="block h-full w-full" [attr.viewBox]="'0 0 ' + s.w + ' ' + s.h">
      <defs>
        <clipPath [attr.id]="clipId"><path [attr.d]="s.d" /></clipPath>
      </defs>
      <g [attr.clip-path]="'url(#' + clipId + ')'">
        <rect [attr.width]="s.w" [attr.height]="s.h" [attr.fill]="k.pattern === 'wide' ? k.secondary : k.primary" />
        @switch (k.pattern) {
          @case ('stripes') {
            @for (i of [1, 3, 5, 7]; track i) {
              <rect [attr.x]="(s.w * i) / 8" [attr.width]="s.w / 8" [attr.height]="s.h" [attr.fill]="k.secondary" />
            }
          }
          @case ('wide') {
            <rect [attr.x]="s.w * 0.18" [attr.width]="s.w * 0.22" [attr.height]="s.h" [attr.fill]="k.primary" />
            <rect [attr.x]="s.w * 0.6" [attr.width]="s.w * 0.22" [attr.height]="s.h" [attr.fill]="k.primary" />
          }
          @case ('diagonal') {
            <rect
              [attr.x]="-s.w * 0.3"
              [attr.y]="s.h * 0.42"
              [attr.width]="s.w * 1.6"
              [attr.height]="s.h * 0.16"
              [attr.fill]="k.secondary"
              [attr.transform]="'rotate(-32 ' + s.w / 2 + ' ' + s.h / 2 + ')'"
            />
          }
          @case ('sleeves') {
            <rect [attr.width]="s.w * 0.29" [attr.height]="s.h" [attr.fill]="k.secondary" />
            <rect [attr.x]="s.w * 0.71" [attr.width]="s.w * 0.29" [attr.height]="s.h" [attr.fill]="k.secondary" />
          }
          @case ('center') {
            <rect [attr.x]="s.w * 0.4" [attr.width]="s.w * 0.2" [attr.height]="s.h" [attr.fill]="k.secondary" />
          }
        }
      </g>
      <path [attr.d]="s.d" fill="none" [attr.stroke]="outline()" [attr.stroke-width]="s.stroke" stroke-linejoin="round" />
      @if (shapeName() === 'shirt') {
        <path d="M19 6 Q24 11 29 6" fill="none" [attr.stroke]="k.pattern === 'solid' ? k.secondary : outline()" stroke-width="1.6" />
      }
    </svg>
  `,
})
export class KitComponent {
  readonly kit = input.required<Kit>();
  readonly shapeName = input<keyof typeof SHAPES>('shirt', { alias: 'shape' });
  readonly outline = input('rgba(31,20,13,0.55)');
  protected readonly shape = computed(() => SHAPES[this.shapeName()]);
  protected readonly clipId = `kit-clip-${++seq}`;
}
