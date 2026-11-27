import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import { formatSoles } from '../domain/settlement';

/** Muestra soles (en céntimos) y anima el cambio de valor. */
@Component({
  selector: 'app-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block tabular-nums' },
  template: `<span [class.anim-bump]="bump()">{{ text() }}</span>`,
})
export class CountUpComponent {
  readonly cents = input.required<number>();
  readonly duration = input(700);
  protected readonly text = signal('');
  protected readonly bump = signal(false);
  private shown: number | null = null;
  private raf = 0;

  constructor() {
    effect(() => {
      const target = this.cents();
      untracked(() => this.animateTo(target));
    });
  }

  private animateTo(target: number) {
    cancelAnimationFrame(this.raf);
    const from = this.shown;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (from === null || from === target || reduce) {
      this.shown = target;
      this.text.set(formatSoles(target));
      return;
    }
    this.bump.set(false);
    requestAnimationFrame(() => this.bump.set(true));
    const start = performance.now();
    const dur = this.duration();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 4);
      const v = Math.round(from + (target - from) * eased);
      this.shown = v;
      this.text.set(formatSoles(v));
      if (k < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
