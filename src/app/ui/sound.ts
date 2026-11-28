/**
 * Efectos de sonido cortos, sintetizados con Web Audio (sin archivos).
 * Se pueden apagar desde "Mi perfil" (se recuerda en este navegador).
 */
const MUTE_KEY = 'copa:sonido-apagado';
let ctx: AudioContext | null = null;
let muted = readMuted();
let makanakiClip: HTMLAudioElement | null = null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Una nota corta con envolvente suave. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.16, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sound = {
  get muted() {
    return muted;
  },
  setMuted(v: boolean) {
    muted = v;
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  },
  /** Agregar al cupón. */
  add: () => tone(660, 0, 0.09, 'triangle', 0.14, 990),
  /** Quitar del cupón. */
  remove: () => tone(520, 0, 0.08, 'triangle', 0.1, 330),
  /** Apuesta hecha: acorde que sube. */
  bet: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.22, 'triangle', 0.13)),
  /** Saldo que entra (recarga aceptada, ganancia): monedas. */
  coin: () => {
    tone(988, 0, 0.08, 'square', 0.07);
    tone(1319, 0.08, 0.22, 'square', 0.07);
  },
  /** Mensaje enviado. */
  message: () => tone(880, 0, 0.07, 'sine', 0.12, 1240),
  /** Error. */
  error: () => {
    tone(220, 0, 0.12, 'sawtooth', 0.06);
    tone(180, 0.1, 0.16, 'sawtooth', 0.06);
  },
  /** ¡Gol! (en vivo). */
  goal: () => [392, 523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.18, 'triangle', 0.12)),
  /**
   * Al entrar a la pestaña "Makanakis".
   * Si existe `public/sounds/makanaki.mp3`, reproduce ese audio; si aún no se subió,
   * suena una fanfarria sintetizada de respaldo.
   */
  makanaki: () => {
    if (muted || typeof window === 'undefined') return;
    const fallback = () => {
      tone(330, 0, 0.09, 'square', 0.08, 440);
      tone(440, 0.09, 0.09, 'square', 0.08, 554);
      tone(659, 0.18, 0.24, 'triangle', 0.14, 880);
    };
    try {
      makanakiClip ??= new Audio('sounds/makanaki.mp3');
      makanakiClip.currentTime = 0;
      void makanakiClip.play().catch(fallback);
    } catch {
      fallback();
    }
  },
};
