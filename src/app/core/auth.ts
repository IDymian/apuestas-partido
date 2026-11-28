/**
 * Cuentas de los apostadores: registro con correo + usuario + contraseña,
 * confirmación por correo, inicio de sesión y recuperar contraseña.
 *
 * Con Supabase, los correos (confirmación y recuperación) los envía Supabase
 * Auth. Con el backend de pruebas local todo vive en este navegador y los "correos" se abren
 * desde la misma pantalla.
 */
import { inject, Injectable, signal } from '@angular/core';
import { AppUser } from './models';
import { SupabaseService } from './supabase.service';
import { uuid } from './uid';

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const MIN_PASSWORD = 8;

export interface SignUpResult {
  /** true si hay que confirmar el correo antes de entrar. */
  needsConfirm: boolean;
  /** Solo en pruebas locales: id para "abrir" el correo de prueba. */
  testToken?: string;
}

export abstract class AuthApi {
  abstract readonly isTestBackend: boolean;
  /** ¿Se puede entrar con el usuario además del correo? (solo pruebas locales) */
  readonly loginWithUsername: boolean = false;
  /** Usuario logueado (null si no hay sesión). */
  readonly user = signal<AppUser | null>(null);
  /** true cuando ya se leyó la sesión guardada. */
  readonly ready = signal(false);
  /** true si se entró con el link de "recuperar contraseña". */
  readonly recovery = signal(false);

  abstract init(): Promise<void>;
  abstract signUp(email: string, username: string, password: string): Promise<SignUpResult>;
  abstract signIn(email: string, password: string): Promise<void>;
  abstract signOut(): Promise<void>;
  /** Envía el correo para crear una contraseña nueva. Devuelve un token solo en pruebas locales. */
  abstract sendReset(email: string): Promise<string | undefined>;
  abstract updatePassword(password: string): Promise<void>;
  abstract resendConfirmation(email: string): Promise<void>;
  abstract usernameAvailable(username: string): Promise<boolean>;
}

/** Mensajes de Supabase Auth en español. */
export function authError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Se cayó la señal, causa. Revisa tu internet y dale otra vez.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'Primero confirma tu correo: revisa tu bandeja (y la carpeta de spam).';
  if (/already registered|already been registered/i.test(msg)) return 'Ese correo ya tiene cuenta. Inicia sesión o recupera tu contraseña.';
  if (/Password should be at least|weak.?password/i.test(msg)) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (/rate limit|security purposes|only request this/i.test(msg)) return 'Muchos intentos seguidos. Espera un minuto y vuelve a probar.';
  if (/Unable to validate email|invalid.*email/i.test(msg)) return 'Ese correo no es válido.';
  if (/same.*password|different from the old/i.test(msg)) return 'La contraseña nueva debe ser distinta a la anterior.';
  return msg;
}

/** Valida los datos del registro antes de enviarlos. */
export function validateSignUp(email: string, username: string, password: string, confirm: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Escribe un correo válido.';
  if (!USERNAME_RE.test(username.trim())) return 'El usuario va de 3 a 20 caracteres: letras, números, punto o guion bajo.';
  if (password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}

const origin = () => window.location.origin;

@Injectable()
export class SupabaseAuthApi extends AuthApi {
  readonly isTestBackend = false;
  private sb = inject(SupabaseService);

  async init() {
    const db = this.sb.client; // crea el cliente: lee la sesión del link del correo (#access_token…)
    db.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.recovery.set(true);
      // Fuera del callback para no bloquear el cliente de auth.
      setTimeout(() => this.loadUser(session?.user ?? null), 0);
    });
    const { data } = await db.auth.getSession();
    await this.loadUser(data.session?.user ?? null);
    this.ready.set(true);
  }

  private async loadUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) {
    if (!u) {
      this.user.set(null);
      return;
    }
    if (this.user()?.id === u.id) return;
    const { data } = await this.sb.client.from('profiles').select('username').eq('id', u.id).maybeSingle();
    const username = (data?.username as string | undefined) ?? (u.user_metadata?.['username'] as string | undefined) ?? (u.email ?? '').split('@')[0];
    this.user.set({ id: u.id, email: u.email ?? '', username });
  }

  async signUp(email: string, username: string, password: string): Promise<SignUpResult> {
    if (!(await this.usernameAvailable(username))) throw new Error('Ese usuario ya está tomado. Prueba con otro.');
    const { data, error } = await this.sb.client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() }, emailRedirectTo: `${origin()}/cuenta-confirmada` },
    });
    if (error) throw new Error(authError(error));
    // Supabase no avisa que el correo ya existe: devuelve un usuario sin identidades.
    if (data.user && data.user.identities?.length === 0) throw new Error(authError('already registered'));
    return { needsConfirm: !data.session };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(authError(error));
    await this.loadUser(data.user);
  }

  async signOut() {
    await this.sb.client.auth.signOut();
    this.user.set(null);
    this.recovery.set(false);
  }

  async sendReset(email: string) {
    const { error } = await this.sb.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/nueva-clave` });
    if (error) throw new Error(authError(error));
    return undefined;
  }

  async updatePassword(password: string) {
    const { error } = await this.sb.client.auth.updateUser({ password });
    if (error) throw new Error(authError(error));
    this.recovery.set(false);
  }

  async resendConfirmation(email: string) {
    const { error } = await this.sb.client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${origin()}/cuenta-confirmada` },
    });
    if (error) throw new Error(authError(error));
  }

  async usernameAvailable(username: string) {
    const { data, error } = await this.sb.client.rpc('username_available', { p_username: username.trim() });
    if (error) throw new Error(authError(error));
    return data === true;
  }
}

// ---------------------------------------------------------------------------
// Backend de pruebas local: cuentas en este navegador (nunca en producción)
// ---------------------------------------------------------------------------
interface LocalUser {
  id: string;
  email: string;
  username: string;
  passHash: string;
  confirmed: boolean;
}

const USERS_KEY = 'copa:local-users';
const SESSION_KEY = 'copa:local-session';
const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sin almacenamiento */
    }
  },
};

/** Solo para pruebas locales (las contraseñas reales las guarda Supabase Auth). */
async function hash(text: string): Promise<string> {
  const data = new TextEncoder().encode('copa-alvaro:' + text);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Sin HTTPS (celular en la red local) no hay crypto.subtle: FNV-1a de 64 bits.
  let h = 0xcbf29ce484222325n;
  for (const b of data) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return 'fnv:' + h.toString(16);
}

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/** Cuenta de las pruebas automáticas (solo en el backend en memoria). */
export const TEST_ACCOUNT = { id: 'prueba-user', username: 'prueba', email: 'prueba@copaalvaro.pe', password: 'prueba123' };

@Injectable()
export class MockAuthApi extends AuthApi {
  readonly isTestBackend = true;

  private users(): LocalUser[] {
    return store.get<LocalUser[]>(USERS_KEY, []);
  }
  private saveUsers(list: LocalUser[]) {
    store.set(USERS_KEY, list);
  }
  private login(u: LocalUser) {
    store.set(SESSION_KEY, u.id);
    this.user.set({ id: u.id, email: u.email, username: u.username });
  }

  async init() {
    // Cuenta de las pruebas automáticas.
    const list = this.users();
    if (!list.some((u) => u.id === TEST_ACCOUNT.id)) {
      this.saveUsers([
        ...list,
        { id: TEST_ACCOUNT.id, email: TEST_ACCOUNT.email, username: TEST_ACCOUNT.username, passHash: await hash(TEST_ACCOUNT.password), confirmed: true },
      ]);
    }
    const id = store.get<string | null>(SESSION_KEY, null);
    const u = this.users().find((x) => x.id === id && x.confirmed);
    if (u) this.user.set({ id: u.id, email: u.email, username: u.username });
    this.ready.set(true);
  }

  async signUp(email: string, username: string, password: string): Promise<SignUpResult> {
    await delay();
    const list = this.users();
    const e = email.trim().toLowerCase();
    if (list.some((u) => u.email === e)) throw new Error(authError('already registered'));
    if (!(await this.usernameAvailable(username))) throw new Error('Ese usuario ya está tomado. Prueba con otro.');
    const u: LocalUser = { id: uuid(), email: e, username: username.trim(), passHash: await hash(password), confirmed: true };
    this.saveUsers([...list, u]);
    // Sin confirmación por correo (igual que Supabase con "Confirm email" apagado): entra directo.
    this.login(u);
    return { needsConfirm: false };
  }

  /** "Abrir" el correo de confirmación de prueba. */
  confirmTestMail(token: string): boolean {
    const list = this.users();
    const u = list.find((x) => x.id === token);
    if (!u) return false;
    u.confirmed = true;
    this.saveUsers(list);
    this.login(u);
    return true;
  }

  /** "Abrir" el correo de recuperar contraseña de prueba. */
  startTestRecovery(token: string): boolean {
    const u = this.users().find((x) => x.id === token);
    if (!u) return false;
    this.login(u);
    this.recovery.set(true);
    return true;
  }

  async signIn(email: string, password: string) {
    await delay();
    const key = email.trim().toLowerCase();
    const u = this.users().find((x) => x.email === key || x.username.toLowerCase() === key);
    if (!u || u.passHash !== (await hash(password))) throw new Error(authError('Invalid login credentials'));
    if (!u.confirmed) throw new Error(authError('Email not confirmed'));
    this.login(u);
  }

  async signOut() {
    store.set(SESSION_KEY, null);
    this.user.set(null);
    this.recovery.set(false);
  }

  async sendReset(email: string) {
    await delay();
    // Igual que Supabase: no revela si el correo existe.
    return this.users().find((x) => x.email === email.trim().toLowerCase())?.id;
  }

  async updatePassword(password: string) {
    await delay();
    const me = this.user();
    if (!me) throw new Error('El link ya venció. Pide otro correo.');
    const list = this.users();
    const u = list.find((x) => x.id === me.id)!;
    u.passHash = await hash(password);
    this.saveUsers(list);
    this.recovery.set(false);
  }

  async resendConfirmation() {
    await delay();
  }

  async usernameAvailable(username: string) {
    const n = username.trim().toLowerCase();
    return USERNAME_RE.test(username.trim()) && !this.users().some((u) => u.username.toLowerCase() === n);
  }
}
