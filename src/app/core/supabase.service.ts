import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const hasSupabaseConfig = (): boolean => !!environment.supabaseUrl && !!environment.supabaseAnonKey;

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private _client: SupabaseClient | null = null;

  get client(): SupabaseClient {
    if (!this._client) {
      if (!hasSupabaseConfig()) throw new Error('Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en el .env');
      this._client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return this._client;
  }
}
