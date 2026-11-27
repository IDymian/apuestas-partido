import { inject, Injectable } from '@angular/core';
import { BetDraft, ChatMessage, MarketTarget, MyTicket, PublicMatchData, selectionPayload, Wallet } from './models';
import { SupabaseService } from './supabase.service';
import { uuid } from './uid';

export type SubmitBet = BetDraft & { target: MarketTarget };

/** Lo que la parte pública necesita del backend. Apostar y el chat requieren login. */
export abstract class PublicApi {
  abstract readonly isDemo: boolean;
  abstract getMatch(code: string): Promise<PublicMatchData | null>;
  /** Código de la jornada activa (la app abre directo en ella). */
  abstract activeMatchCode(): Promise<string | null>;
  /** Se paga con el saldo. El nombre del ticket es el usuario logueado (lo pone el servidor). */
  abstract submitTicket(code: string, bets: SubmitBet[]): Promise<string>;
  abstract getMyTickets(code: string): Promise<MyTicket[]>;
  /** Avisa cuando algo de la jornada cambió. Devuelve la función para desuscribirse. */
  abstract subscribe(code: string, onChange: () => void): () => void;
  abstract qrUrl(path: string | null): string | null;

  // Billetera
  abstract getWallet(): Promise<Wallet>;
  /** Sube la captura del Plin y pide la recarga (queda por confirmar). */
  abstract requestDeposit(userId: string, amount: number, image: Blob): Promise<void>;
  abstract subscribeWallet(userId: string, onChange: () => void): () => void;

  // Social
  abstract getMessages(code: string): Promise<ChatMessage[]>;
  abstract postMessage(code: string, body: string): Promise<void>;
  abstract subscribeChat(code: string, onChange: () => void): () => void;
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

  async submitTicket(code: string, bets: SubmitBet[]): Promise<string> {
    const { data, error } = await this.sb.client.rpc('submit_ticket', {
      p_code: code,
      p_bets: bets.map((b) => ({ market_id: b.marketId, amount: b.amount, ...selectionPayload(b.target, b.selection) })),
    });
    if (error) throw error;
    return data as string;
  }

  async getWallet(): Promise<Wallet> {
    const { data, error } = await this.sb.client.rpc('get_wallet');
    if (error) throw error;
    return (data as Wallet | null) ?? { balance: 0, deposits: [] };
  }

  async requestDeposit(userId: string, amount: number, image: Blob): Promise<void> {
    const path = `deposits/${userId}/${uuid()}.jpg`;
    const up = await this.sb.client.storage.from('receipts').upload(path, image, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    const { error } = await this.sb.client.rpc('request_deposit', { p_amount: amount, p_receipt_path: path });
    if (error) throw error;
  }

  subscribeWallet(userId: string, onChange: () => void): () => void {
    return this.listen(`wallet:${userId}`, 'changed', onChange, 200);
  }

  async activeMatchCode(): Promise<string | null> {
    const { data, error } = await this.sb.client.rpc('get_active_match_code');
    if (error) throw error;
    return (data as string | null) ?? null;
  }

  async getMyTickets(code: string): Promise<MyTicket[]> {
    const { data, error } = await this.sb.client.rpc('get_my_tickets', { p_code: code });
    if (error) throw error;
    return (data as MyTicket[] | null) ?? [];
  }

  async getMessages(code: string): Promise<ChatMessage[]> {
    const { data, error } = await this.sb.client.rpc('get_messages', { p_code: code, p_limit: 150 });
    if (error) throw error;
    return (data as ChatMessage[] | null) ?? [];
  }

  async postMessage(code: string, body: string): Promise<void> {
    const { error } = await this.sb.client.rpc('post_message', { p_code: code, p_body: body });
    if (error) throw error;
  }

  subscribeChat(code: string, onChange: () => void): () => void {
    return this.listen(`chat:${code.toUpperCase()}`, 'chat', onChange, 120);
  }

  subscribe(code: string, onChange: () => void): () => void {
    return this.listen(`match:${code.toUpperCase()}`, 'changed', onChange, 300);
  }

  /** Escucha un Broadcast y agrupa ráfagas de avisos. */
  private listen(topic: string, event: string, onChange: () => void, waitMs: number): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = this.sb.client
      .channel(topic)
      .on('broadcast', { event }, () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, waitMs);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      this.sb.client.removeChannel(channel);
    };
  }

  qrUrl(path: string | null): string | null {
    return path ? this.sb.client.storage.from('pay-qr').getPublicUrl(path).data.publicUrl : null;
  }
}
