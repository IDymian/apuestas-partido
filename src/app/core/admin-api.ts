import { inject, Injectable } from '@angular/core';
import {
  BalanceRow,
  CreditRow,
  DEFAULT_PAY_METHOD,
  DepositRow,
  SettlementRow,
  AdminMatchData,
  EventRow,
  MarketRow,
  MarketType,
  MatchInput,
  MatchRow,
  MatchStatus,
  PaidRow,
  TicketRow,
  TicketStatus,
} from './models';
import { SupabaseService } from './supabase.service';
import { uuid } from './uid';


export type NewEvent = Pick<EventRow, 'match_id' | 'type' | 'player_id' | 'team_id' | 'is_own_goal' | 'team_out_id' | 'minute' | 'game'>;
export type EventPatch = Partial<Pick<EventRow, 'type' | 'player_id' | 'team_id' | 'is_own_goal' | 'team_out_id' | 'minute' | 'game'>>;

/** Operaciones del organizador (requieren login de admin). */
export abstract class AdminApi {
  abstract readonly isTestBackend: boolean;

  abstract currentEmail(): Promise<string | null>;
  abstract signIn(email: string, password: string): Promise<void>;
  abstract signOut(): Promise<void>;
  abstract isAdmin(): Promise<boolean>;

  abstract listMatches(): Promise<MatchRow[]>;
  abstract getMatch(id: string): Promise<AdminMatchData | null>;
  abstract saveMatch(m: MatchInput): Promise<MatchRow>;
  abstract setStatus(matchId: string, status: MatchStatus): Promise<void>;
  abstract setStartingTeams(matchId: string, teamIds: [string, string]): Promise<void>;
  /** Partido actual de la liga (y si queda en vivo). */
  abstract setCurrentGame(matchId: string, game: number, live?: boolean): Promise<void>;
  /** Prende o apaga "en vivo" para el partido actual. */
  abstract setGameLive(matchId: string, live: boolean): Promise<void>;
  abstract uploadQr(matchId: string, file: Blob): Promise<void>;
  abstract removeQr(matchId: string): Promise<void>;

  abstract addPlayers(matchId: string, names: string[]): Promise<void>;
  abstract renamePlayer(id: string, name: string): Promise<void>;
  abstract deletePlayer(id: string): Promise<void>;

  abstract saveMarket(m: Partial<MarketRow> & { match_id: string }): Promise<void>;
  abstract deleteMarket(id: string): Promise<void>;

  abstract setTicketStatus(id: string, status: TicketStatus, reason?: string | null): Promise<void>;
  /** Liquida un mercado y acredita a cada ganador (o devuelve). Reemplaza una liquidación anterior. */
  abstract settleMarket(marketId: string, outcome: SettlementRow['outcome'], winner: string | null, credits: Omit<CreditRow, 'market_id'>[]): Promise<void>;
  /** Deshace la liquidación (los saldos vuelven a como estaban). */
  abstract unsettleMarket(marketId: string): Promise<void>;
  /** Saldos de todos (para devolverlos por Plin al final). */
  abstract balances(): Promise<BalanceRow[]>;
  /** Registra que se le devolvió plata por Plin a alguien (baja su saldo). */
  abstract payout(userId: string, amountCents: number): Promise<void>;
  /** Recargas de saldo por confirmar (más antiguas primero). */
  abstract pendingDeposits(): Promise<DepositRow[]>;
  abstract setDepositStatus(id: string, status: TicketStatus, reason?: string | null): Promise<void>;
  /** Avisa cuando llega o cambia una recarga. */
  abstract subscribeDeposits(onChange: () => void): () => void;
  abstract receiptUrl(path: string): Promise<string | null>;

  abstract addEvent(e: NewEvent): Promise<void>;
  abstract updateEvent(id: string, patch: EventPatch): Promise<void>;
  abstract deleteEvent(id: string): Promise<void>;

  abstract setPaid(matchId: string, personKey: string, bettorName: string, paid: boolean): Promise<void>;
}

@Injectable()
export class SupabaseAdminApi extends AdminApi {
  readonly isTestBackend = false;
  private sb = inject(SupabaseService);
  private get db() {
    return this.sb.client;
  }

  async currentEmail() {
    const { data } = await this.db.auth.getSession();
    return data.session?.user.email ?? null;
  }

  async signIn(email: string, password: string) {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message);
  }

  async signOut() {
    await this.db.auth.signOut();
  }

  async isAdmin() {
    const { data, error } = await this.db.rpc('is_admin');
    if (error) throw error;
    return data === true;
  }

  async settleMarket(marketId: string, outcome: SettlementRow['outcome'], winner: string | null, credits: Omit<CreditRow, 'market_id'>[]) {
    const { error } = await this.db.rpc('admin_settle_market', { p_market: marketId, p_outcome: outcome, p_winner: winner, p_credits: credits });
    if (error) throw error;
  }

  async unsettleMarket(marketId: string) {
    const { error } = await this.db.rpc('admin_unsettle_market', { p_market: marketId });
    if (error) throw error;
  }

  async balances(): Promise<BalanceRow[]> {
    const { data, error } = await this.db.rpc('admin_balances');
    if (error) throw error;
    return ((data as BalanceRow[] | null) ?? []).map((b) => ({ ...b, balance: Number(b.balance) }));
  }

  async payout(userId: string, amountCents: number) {
    const { error } = await this.db.rpc('admin_payout', { p_user: userId, p_amount_cents: amountCents });
    if (error) throw error;
  }

  async pendingDeposits(): Promise<DepositRow[]> {
    const { data, error } = await this.db.from('deposits').select('*').eq('status', 'pending').order('created_at');
    if (error) throw error;
    return data as DepositRow[];
  }

  async setDepositStatus(id: string, status: TicketStatus, reason?: string | null) {
    const { error } = await this.db
      .from('deposits')
      .update({ status, reject_reason: status === 'rejected' ? reason?.trim() || null : null })
      .eq('id', id);
    if (error) throw error;
  }

  subscribeDeposits(onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = this.db
      .channel('deposits')
      .on('broadcast', { event: 'changed' }, () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 250);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      this.db.removeChannel(channel);
    };
  }

  async listMatches() {
    const { data, error } = await this.db.from('matches').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data as MatchRow[];
  }

  async getMatch(id: string): Promise<AdminMatchData | null> {
    const [match, teams, players, markets, types, tickets, events, paid, settlements, credits] = await Promise.all([
      this.db.from('matches').select('*').eq('id', id).maybeSingle(),
      this.db.from('teams').select('*').eq('match_id', id).order('sort_order'),
      this.db.from('players').select('*').eq('match_id', id).order('sort_order').order('name'),
      this.db.from('markets').select('*').eq('match_id', id).order('sort_order').order('created_at'),
      this.db.from('market_types').select('*').order('type'),
      this.db.from('tickets').select('*, bets(*)').eq('match_id', id).order('created_at').order('id'),
      this.db.from('events').select('*').eq('match_id', id).order('minute').order('seq'),
      this.db.from('payouts_paid').select('*').eq('match_id', id),
      this.db.from('market_settlements').select('*').eq('match_id', id),
      this.db.from('credits').select('market_id, user_id, username, kind, amount_cents').eq('match_id', id),
    ]);
    for (const r of [match, teams, players, markets, types, tickets, events, paid, settlements, credits]) if (r.error) throw r.error;
    if (!match.data) return null;
    return {
      match: match.data as MatchRow,
      teams: teams.data!,
      players: players.data!,
      markets: (markets.data as MarketRow[]).map((m) => ({ ...m, initial_pot: Number(m.initial_pot) })),
      marketTypes: types.data as MarketType[],
      tickets: tickets.data!,
      events: events.data!,
      paid: paid.data as PaidRow[],
      settlements: settlements.data as SettlementRow[],
      credits: credits.data as CreditRow[],
    };
  }

  async saveMatch(m: MatchInput) {
    const row = {
      title: m.title.trim(),
      starts_at: m.starts_at,
      access_code: m.access_code.trim().toUpperCase(),
      pay_method: m.pay_method?.trim() || DEFAULT_PAY_METHOD,
      pay_number: m.pay_number?.trim() || null,
      pay_holder: m.pay_holder?.trim() || null,
    };
    const q = m.id
      ? this.db.from('matches').update(row).eq('id', m.id).select().single()
      : this.db.from('matches').insert(row).select().single();
    const { data, error } = await q;
    if (error) throw new Error(error.code === '23505' ? 'Ese código ya lo usa otra jornada' : error.message);
    return data as MatchRow;
  }

  async setStatus(matchId: string, status: MatchStatus) {
    const { error } = await this.db.from('matches').update({ status }).eq('id', matchId);
    if (error) throw error;
  }

  async setCurrentGame(matchId: string, game: number, live = false) {
    const { error } = await this.db.from('matches').update({ current_game: game, game_live: live }).eq('id', matchId);
    if (error) throw error;
  }

  async setGameLive(matchId: string, live: boolean) {
    const { error } = await this.db.from('matches').update({ game_live: live }).eq('id', matchId);
    if (error) throw error;
  }

  async setStartingTeams(matchId: string, teamIds: [string, string]) {
    const { error } = await this.db.from('matches').update({ starting_team_ids: teamIds }).eq('id', matchId);
    if (error) throw error;
  }

  async uploadQr(matchId: string, file: Blob) {
    const path = `${matchId}/${uuid()}.jpg`;
    const up = await this.db.storage.from('pay-qr').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (up.error) throw up.error;
    const { error } = await this.db.from('matches').update({ pay_qr_path: path }).eq('id', matchId);
    if (error) throw error;
  }

  async removeQr(matchId: string) {
    const { error } = await this.db.from('matches').update({ pay_qr_path: null }).eq('id', matchId);
    if (error) throw error;
  }

  async addPlayers(matchId: string, names: string[]) {
    const { data: last } = await this.db
      .from('players')
      .select('sort_order')
      .eq('match_id', matchId)
      .eq('is_own_goal', false)
      .order('sort_order', { ascending: false })
      .limit(1);
    let order = last?.[0]?.sort_order ?? 0;
    const rows = names.map((name) => ({ match_id: matchId, name, sort_order: ++order }));
    const { error } = await this.db.from('players').insert(rows);
    if (error) throw error;
  }

  async renamePlayer(id: string, name: string) {
    const { error } = await this.db.from('players').update({ name }).eq('id', id);
    if (error) throw error;
  }

  async deletePlayer(id: string) {
    const { error } = await this.db.from('players').delete().eq('id', id);
    if (error) throw error;
  }

  async saveMarket(m: Partial<MarketRow> & { match_id: string }) {
    const { id, ...rest } = m;
    const { error } = id ? await this.db.from('markets').update(rest).eq('id', id) : await this.db.from('markets').insert(rest);
    if (error) throw error;
  }

  async deleteMarket(id: string) {
    const { error } = await this.db.from('markets').delete().eq('id', id);
    if (error) throw error;
  }

  async setTicketStatus(id: string, status: TicketStatus, reason?: string | null) {
    const { error } = await this.db
      .from('tickets')
      .update({ status, reject_reason: status === 'rejected' ? reason?.trim() || null : null })
      .eq('id', id);
    if (error) throw error;
  }

  async receiptUrl(path: string) {
    const { data, error } = await this.db.storage.from('receipts').createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  async addEvent(e: NewEvent) {
    const { error } = await this.db.from('events').insert(e);
    if (error) throw error;
  }

  async updateEvent(id: string, patch: EventPatch) {
    const { error } = await this.db.from('events').update(patch).eq('id', id);
    if (error) throw error;
  }

  async deleteEvent(id: string) {
    const { error } = await this.db.from('events').delete().eq('id', id);
    if (error) throw error;
  }

  async setPaid(matchId: string, personKey: string, bettorName: string, paid: boolean) {
    const { error } = paid
      ? await this.db.from('payouts_paid').upsert({ match_id: matchId, person_key: personKey, bettor_name: bettorName })
      : await this.db.from('payouts_paid').delete().eq('match_id', matchId).eq('person_key', personKey);
    if (error) throw error;
  }
}
