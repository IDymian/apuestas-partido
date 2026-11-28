import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AvatarService } from '../core/avatars';

/** ERRORR, la mascota de los errores (usa el avatar especial `errorr`; sin él queda solo el texto). */
@Component({
  selector: 'app-errorr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let src = avatars.url('errorr');
    <div class="flex items-center gap-3" [class.flex-col]="big()" [class.text-center]="big()">
      @if (src) {
        <img
          [src]="src"
          alt=""
          [width]="big() ? 128 : 44"
          [height]="big() ? 128 : 44"
          class="shrink-0 rounded-full bg-night-3 ring-2 ring-candy/30"
          [class]="big() ? 'h-32 w-32' : 'h-11 w-11'"
          (error)="avatars.markBroken(src)"
        />
      }
      <div class="min-w-0">
        <p class="font-display font-extrabold tracking-wide text-candy" [class]="big() ? 'text-3xl' : 'text-sm'">ERRORR</p>
        <p class="text-sm" [class]="big() ? 'mt-1 text-mute' : 'text-candy'"><ng-content /></p>
      </div>
    </div>
  `,
})
export class ErrorrComponent {
  readonly big = input(false);
  protected readonly avatars = inject(AvatarService);
}
