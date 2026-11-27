import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const hasSupabaseConfig = (): boolean => !!environment.supabaseUrl && !!environment.supabaseAnonKey;
/** Backend en memoria: solo si se arrancó con --mock (pruebas locales). En producción siempre es Supabase. */
export const useMockBackend = (): boolean => environment.mock && !hasSupabaseConfig();

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private _client: SupabaseClient | null = null;

  get client(): SupabaseClient {
    if (!this._client) {
      if (!hasSupabaseConfig()) throw new Error('La app aún no está conectada: falta configurar SUPABASE_URL y SUPABASE_ANON_KEY.');
      this._client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return this._client;
  }
}
