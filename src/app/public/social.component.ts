import { Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { ChatMessage, QUICK_REACTIONS } from '../core/models';
import { friendlyError, PublicApi } from '../core/public-api';
import { AuthApi } from '../core/auth';
import { IconComponent } from '../ui/icon.component';

const AVATAR_TONES = ['from-lime to-gold', 'from-gold to-[#ffc266]', 'from-[#ff8a1f] to-[#d13f00]', 'from-ink to-ink/70', 'from-lime to-[#ffb27a]'];
const tone = (name: string) => AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];

/** Chat "Social" de la jornada, en tiempo real. */
@Component({
  selector: 'app-social',
  imports: [IconComponent],
  template: `
    <section class="anim-in">
      <p class="eyebrow">La tribuna</p>
      <h2 class="mt-1 font-display text-3xl font-extrabold">Social</h2>
      <p class="mt-1 text-sm text-mute">Comenta el partido y pica a tus amigos.</p>
    </section>

    <div class="mt-4 space-y-1" aria-live="polite">
      @if (loading() && messages().length === 0) {
        @for (i of [1, 2, 3]; track i) {
          <div class="h-14 animate-pulse rounded-3xl bg-ink/[0.05]" [class.ml-12]="i % 2 === 0"></div>
        }
      } @else if (messages().length === 0) {
        <div class="glass py-10 text-center">
          <p class="text-5xl">⚽</p>
          <p class="mt-2 font-bold">Nadie ha escrito todavía</p>
          <p class="text-sm text-mute">Rompe el hielo.</p>
        </div>
      }
      @for (g of groups(); track g.key) {
        @if (g.day) {
          <p class="py-3 text-center text-[11px] font-bold tracking-wider text-faint uppercase">{{ g.day }}</p>
        }
        <div class="flex items-end gap-2 pt-2" [class.flex-row-reverse]="g.mine">
          @if (!g.mine) {
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br font-display text-sm font-extrabold text-white" [class]="g.tone">
              {{ g.username.charAt(0).toUpperCase() }}
            </span>
          }
          <div class="flex min-w-0 max-w-[80%] flex-col gap-1" [class.items-end]="g.mine">
            @if (!g.mine) {
              <span class="px-3 text-xs font-bold text-mute">{{ g.username }}</span>
            }
            @for (m of g.items; track m.id) {
              <p
                class="w-fit max-w-full rounded-3xl px-4 py-2.5 text-[15px] leading-snug break-words whitespace-pre-wrap anim-msg"
                [class]="g.mine ? 'rounded-br-lg bg-lime text-white font-semibold' : 'rounded-bl-lg border border-ink/[0.06] bg-white text-ink'"
                [class.text-3xl]="isEmojiOnly(m.body)"
                [class.bg-transparent]="isEmojiOnly(m.body)"
                [title]="time(m.created_at)"
              >{{ m.body }}</p>
            }
            <span class="px-3 text-[10px] text-faint">{{ time(g.items[g.items.length - 1].created_at) }}</span>
          </div>
        </div>
      }
      <div #end class="h-2"></div>
    </div>

    <!-- Escribir -->
    <div class="fixed inset-x-0 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md px-3">
      <div class="no-scrollbar -mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3">
        @for (r of reactions; track r) {
          <button type="button" class="shrink-0 rounded-full border border-ink/10 bg-white/95 px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur-xl transition hover:border-lime/50 active:scale-95" [disabled]="sending()" (click)="send(r)">
            {{ r }}
          </button>
        }
      </div>
      <form class="flex items-end gap-2 rounded-3xl border border-ink/10 bg-white/95 p-1.5 shadow-[0_20px_50px_-12px_rgb(120_55_10/0.3)] backdrop-blur-xl" (submit)="$event.preventDefault(); send(draft())">
        <label for="chat-input" class="sr-only">Mensaje</label>
        <textarea
          id="chat-input"
          rows="1"
          maxlength="500"
          class="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint"
          placeholder="Escribe algo, {{ auth.user()?.username }}…"
          [value]="draft()"
          (input)="onInput($event)"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button type="submit" class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-lime text-white transition active:scale-90 disabled:bg-night-4 disabled:text-faint" [disabled]="!draft().trim() || sending()" aria-label="Enviar">
          <app-icon name="send" [size]="18" [stroke]="2.4" />
        </button>
      </form>
      @if (error()) {
        <p class="mt-2 rounded-2xl bg-candy/90 px-3 py-2 text-center text-xs font-bold text-white anim-pop" role="alert">{{ error() }}</p>
      }
    </div>
    <div class="h-20"></div>
  `,
})
export class SocialComponent implements OnDestroy {
  readonly code = input.required<string>();
  private api = inject(PublicApi);
  protected readonly auth = inject(AuthApi);
  private end = viewChild<ElementRef<HTMLElement>>('end');

  protected readonly reactions = QUICK_REACTIONS;
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly draft = signal('');
  private unsubscribe: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;

  /** Mensajes seguidos de la misma persona se agrupan. */
  protected readonly groups = computed(() => {
    const me = this.auth.user()?.id;
    const out: { key: string; username: string; mine: boolean; tone: string; day: string | null; items: ChatMessage[] }[] = [];
    let lastDay = '';
    for (const m of this.messages()) {
      const day = new Date(m.created_at).toDateString();
      const prev = out.at(-1);
      const sameAuthor = prev && prev.username === m.username && day === lastDay;
      const closeInTime = prev && new Date(m.created_at).getTime() - new Date(prev.items.at(-1)!.created_at).getTime() < 5 * 60_000;
      if (sameAuthor && closeInTime) {
        prev.items.push(m);
      } else {
        out.push({
          key: m.id,
          username: m.username,
          mine: !!me && m.user_id === me,
          tone: tone(m.username),
          day: day !== lastDay ? this.dayLabel(m.created_at) : null,
          items: [m],
        });
      }
      lastDay = day;
    }
    return out;
  });

  constructor() {
    effect(() => {
      const code = this.code();
      untracked(() => {
        this.unsubscribe?.();
        this.load(true);
        this.unsubscribe = this.api.subscribeChat(code, () => this.load());
      });
    });
    // Respaldo por si se pierde algún aviso en tiempo real.
    this.poll = setInterval(() => document.visibilityState === 'visible' && this.load(), 20_000);
  }

  async load(first = false) {
    try {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
      const list = await this.api.getMessages(this.code());
      const grew = list.length !== this.messages().length;
      this.messages.set(list);
      if (first || (grew && nearBottom)) this.scrollToEnd(first ? 'auto' : 'smooth');
    } catch (e) {
      this.error.set(friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async send(text: string) {
    const body = text.trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      await this.api.postMessage(this.code(), body);
      if (text === this.draft()) this.draft.set('');
      await this.load();
      this.scrollToEnd('smooth');
      navigator.vibrate?.(8);
    } catch (e) {
      this.error.set(friendlyError(e));
      setTimeout(() => this.error.set(null), 3500);
    } finally {
      this.sending.set(false);
    }
  }

  protected onInput(ev: Event) {
    const el = ev.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 112) + 'px';
  }

  protected onEnter(ev: Event) {
    const k = ev as KeyboardEvent;
    // En computadora Enter envía; Shift+Enter hace salto de línea. En celular Enter es salto de línea.
    if (k.shiftKey || matchMedia('(pointer: coarse)').matches) return;
    k.preventDefault();
    this.send(this.draft());
  }

  protected isEmojiOnly(text: string) {
    return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,6}$/u.test(text) && !/[A-Za-z0-9]/.test(text);
  }

  protected time(iso: string) {
    return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }

  private dayLabel(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'short' }).format(d);
  }

  private scrollToEnd(behavior: ScrollBehavior) {
    setTimeout(() => this.end()?.nativeElement.scrollIntoView({ behavior, block: 'end' }), 30);
  }

  ngOnDestroy() {
    this.unsubscribe?.();
    clearInterval(this.poll);
  }
}
