import { inject, Injectable } from '@angular/core';
import { BetDraft, PublicMatchData } from './models';
import { SupabaseService } from './supabase.service';

/** Lo que la parte pública (sin login) necesita del backend. */
export abstract class PublicApi {
  abstract readonly isDemo: boolean;
  abstract getMatch(code: string): Promise<PublicMatchData | null>;
  abstract uploadReceipt(matchId: string, image: Blob): Promise<string>;
  abstract submitTicket(code: string, bettorName: string, bets: BetDraft[], receiptPath: string): Promise<string>;
  /** Avisa cuando algo del partido cambió. Devuelve la función para desuscribirse. */
  abstract subscribe(code: string, onChange: () => void): () => void;
  abstract qrUrl(path: string | null): string | null;
}

/** Traduce errores de Postgres/Supabase a un mensaje legible. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
  return msg;
}

@Injectable()
export class SupabasePublicApi extends PublicApi {
  readonly isDemo = false;
  private sb = inject(SupabaseService);

  async getMatch(code: string): Promise<PublicMatchData | null> {
    const { data, error } = await this.sb.client.rpc('get_public_match', { p_code: code });
    if (error) throw error;
    return (data as PublicMatchData | null) ?? null;
  }

  async uploadReceipt(matchId: string, image: Blob): Promise<string> {
    const path = `${matchId}/${crypto.randomUUID()}.jpg`;
    const { error } = await this.sb.client.storage
      .from('receipts')
      .upload(path, image, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  }

  async submitTicket(code: string, bettorName: string, bets: BetDraft[], receiptPath: string): Promise<string> {
    const { data, error } = await this.sb.client.rpc('submit_ticket', {
      p_code: code,
      p_bettor_name: bettorName,
      p_bets: bets.map((b) => ({ market_id: b.marketId, player_id: b.playerId, amount: b.amount })),
      p_receipt_path: receiptPath,
    });
    if (error) throw error;
    return data as string;
  }

  subscribe(code: string, onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = this.sb.client
      .channel(`match:${code.toUpperCase()}`)
      .on('broadcast', { event: 'changed' }, () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 300); // agrupa ráfagas de cambios
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      this.sb.client.removeChannel(channel);
    };
  }

  qrUrl(path: string | null): string | null {
    return path ? this.sb.client.storage.from('yape-qr').getPublicUrl(path).data.publicUrl : null;
  }
}
