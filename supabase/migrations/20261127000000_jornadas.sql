-- =============================================================================
-- Apuestas del Partido — jornadas de triangulares
--
-- Rehace el esquema de juego (partidos, jugadores, mercados, tickets, apuestas,
-- eventos). Conserva la tabla `admins` y la función `is_admin()`.
-- Los datos anteriores eran solo de prueba y se borran.
--
--   * Una jornada tiene 3 equipos (Equipo A, B, C). Los jugadores NO tienen
--     equipo: cada gol registra a qué equipo le cuenta.
--   * Las apuestas pueden ser a un jugador, a un equipo o a un número.
--   * Si nadie acierta, el bote se lo queda el organizador (salvo arrastre
--     configurado a mano).
--   * Pago por Plin (número y QR configurables por jornada).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Borrar el esquema anterior (menos admins)
-- -----------------------------------------------------------------------------
drop policy if exists receipts_public_upload on storage.objects;
drop policy if exists receipts_admin_read on storage.objects;
drop policy if exists receipts_admin_delete on storage.objects;
drop policy if exists yapeqr_admin_insert on storage.objects;
drop policy if exists yapeqr_admin_update on storage.objects;
drop policy if exists yapeqr_admin_delete on storage.objects;

drop view if exists public.public_bets;
drop table if exists public.payouts_paid, public.events, public.bets, public.tickets,
  public.markets, public.players, public.matches, public.market_types cascade;

drop function if exists public.get_public_match(text);
drop function if exists public.submit_ticket(text, text, jsonb, text);
drop function if exists public.match_is_open(text);
drop function if exists public.tg_match_defaults() cascade;
drop function if exists public.tg_market_rollover_check() cascade;
drop function if exists public.tg_event_player_check() cascade;
drop function if exists public.tg_ticket_reviewed() cascade;
drop function if exists public.tg_broadcast_match_change() cascade;

-- -----------------------------------------------------------------------------
-- 2. Tipos de mercado
-- -----------------------------------------------------------------------------
create table public.market_types (
  type text primary key,
  label text not null,
  -- ¿A qué se apuesta?
  target text not null check (target in ('player', 'team', 'number')),
  -- Bote / sección donde se muestra
  section text not null check (section in ('goles', 'equipos', 'amarillas', 'pichanga')),
  -- ¿Usa `markets.param`? (4 / 6 goles, gol número 15 / 28)
  has_param boolean not null default false,
  -- Rango de opciones para target = number
  option_min int,
  option_max int,
  -- ¿Se puede apostar a la opción especial "Autogol"?
  allows_own_goal boolean not null default false
);

insert into public.market_types (type, label, target, section, has_param, option_min, option_max, allows_own_goal) values
  ('first_goal',          'Primer gol',                 'player', 'goles',     false, null, null, true),
  ('last_goal',           'Último gol',                 'player', 'goles',     false, null, null, true),
  ('top_scorer',          'Pichichi (más goles)',       'player', 'goles',     false, null, null, false),
  ('first_to_n_goals',    'Primero en llegar a N goles','player', 'goles',     true,  null, null, false),
  ('nth_goal',            'Gol número N',               'player', 'goles',     true,  null, null, true),
  ('most_wins',           'Rey de la cancha',           'team',   'equipos',   false, null, null, false),
  ('longest_streak',      'Racha más larga',            'number', 'equipos',   false, 1,    10,   false),
  ('most_exits',          'Equipo que más sale',        'team',   'equipos',   false, null, null, false),
  ('first_yellow',        'Primera amarilla',           'player', 'amarillas', false, null, null, false),
  ('last_yellow',         'Última amarilla',            'player', 'amarillas', false, null, null, false),
  ('most_yellows',        'El más amonestado',          'player', 'amarillas', false, null, null, false),
  ('first_own_goal',      'Primer autogol',             'player', 'pichanga',  false, null, null, false),
  ('first_nutmeg_victim', 'Primera huacha',             'player', 'pichanga',  false, null, null, false);

-- -----------------------------------------------------------------------------
-- 3. Jornadas, equipos y jugadores
-- -----------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at timestamptz,
  access_code text not null unique check (access_code ~ '^[A-Z0-9]{4,20}$'),
  status text not null default 'open' check (status in ('open', 'closed', 'finished')),
  -- Se llena solo al cerrar las apuestas; sirve para autocompletar el minuto.
  closed_at timestamptz,
  -- Los dos equipos que arrancan en cancha.
  starting_team_ids uuid[] check (starting_team_ids is null or cardinality(starting_team_ids) = 2),
  pay_method text not null default 'Plin' check (char_length(pay_method) between 1 and 20),
  pay_number text,
  pay_holder text,
  pay_qr_path text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order int not null default 0,
  color text
);
create index teams_match_idx on public.teams (match_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  is_own_goal boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index players_match_idx on public.players (match_id);
create unique index players_one_own_goal on public.players (match_id) where is_own_goal;

-- -----------------------------------------------------------------------------
-- 4. Mercados, tickets y apuestas
-- -----------------------------------------------------------------------------
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null references public.market_types (type),
  param int check (param is null or param between 1 and 200),
  sort_order int not null default 0,
  is_active boolean not null default true,
  rollover_to_market_id uuid references public.markets (id) on delete set null,
  initial_pot numeric(10, 2) not null default 0 check (initial_pot >= 0),
  created_at timestamptz not null default now(),
  constraint markets_no_self_rollover check (rollover_to_market_id is distinct from id)
);
create index markets_match_idx on public.markets (match_id);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  bettor_name text not null check (char_length(bettor_name) between 1 and 40),
  total int not null default 0 check (total >= 0),
  receipt_path text unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (char_length(reject_reason) <= 200),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index tickets_match_idx on public.tickets (match_id, status, created_at);

-- Cada apuesta va a UN jugador, UN equipo o UN número.
create table public.bets (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  option_value int,
  amount int not null check (amount between 1 and 5),
  constraint bets_one_target check (num_nonnulls(player_id, team_id, option_value) = 1),
  constraint bets_unique_choice unique nulls not distinct (ticket_id, market_id, player_id, team_id, option_value)
);
create index bets_ticket_idx on public.bets (ticket_id);
create index bets_market_idx on public.bets (market_id);

-- -----------------------------------------------------------------------------
-- 5. Eventos de la jornada
-- -----------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  type text not null check (type in ('goal', 'yellow', 'nutmeg', 'rotation')),
  -- goal: goleador real (también en autogol) · yellow: amonestado · nutmeg: víctima
  player_id uuid references public.players (id) on delete cascade,
  -- goal: equipo al que le cuenta el gol
  team_id uuid references public.teams (id) on delete cascade,
  is_own_goal boolean not null default false,
  -- rotation: equipo que sale
  team_out_id uuid references public.teams (id) on delete cascade,
  minute int not null check (minute between 0 and 300),
  seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  constraint events_shape check (
    (type = 'goal' and player_id is not null and team_id is not null and team_out_id is null)
    or (type in ('yellow', 'nutmeg') and player_id is not null and team_id is null and team_out_id is null and not is_own_goal)
    or (type = 'rotation' and team_out_id is not null and player_id is null and team_id is null and not is_own_goal)
  )
);
create index events_match_idx on public.events (match_id, minute, seq);

create table public.payouts_paid (
  match_id uuid not null references public.matches (id) on delete cascade,
  person_key text not null,
  bettor_name text not null,
  paid_at timestamptz not null default now(),
  primary key (match_id, person_key)
);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Al crear una jornada: Equipo A/B/C, jugador "Autogol" y los 15 mercados.
create or replace function public.tg_match_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid; v_b uuid;
begin
  insert into teams (match_id, name, sort_order) values (new.id, 'Equipo A', 1) returning id into v_a;
  insert into teams (match_id, name, sort_order) values (new.id, 'Equipo B', 2) returning id into v_b;
  insert into teams (match_id, name, sort_order) values (new.id, 'Equipo C', 3);
  update matches set starting_team_ids = array[v_a, v_b] where id = new.id and starting_team_ids is null;

  insert into players (match_id, name, is_own_goal, sort_order) values (new.id, 'Autogol', true, 9999);

  -- Sin arrastres por defecto: si nadie acierta, el bote es del organizador.
  insert into markets (match_id, name, type, param, sort_order) values
    (new.id, 'Primer gol de la noche',  'first_goal',          null, 1),
    (new.id, 'Último gol de la noche',  'last_goal',           null, 2),
    (new.id, 'Pichichi de la noche',    'top_scorer',          null, 3),
    (new.id, 'Primer cuartete',         'first_to_n_goals',    4,    4),
    (new.id, 'Primer sextete',          'first_to_n_goals',    6,    5),
    (new.id, 'Gol número 15',           'nth_goal',            15,   6),
    (new.id, 'Gol número 28',           'nth_goal',            28,   7),
    (new.id, 'Rey de la cancha',        'most_wins',           null, 8),
    (new.id, 'Racha más larga',         'longest_streak',      null, 9),
    (new.id, 'Equipo que más sale',     'most_exits',          null, 10),
    (new.id, 'Primera amarilla',        'first_yellow',        null, 11),
    (new.id, 'Última amarilla',         'last_yellow',         null, 12),
    (new.id, 'El más amonestado',       'most_yellows',        null, 13),
    (new.id, 'Primer autogol',          'first_own_goal',      null, 14),
    (new.id, 'Primera huacha',          'first_nutmeg_victim', null, 15);
  return new;
end;
$$;

create trigger matches_defaults
after insert on public.matches
for each row execute function public.tg_match_defaults();

-- Al cerrar las apuestas se guarda la hora (para autocompletar minutos).
create or replace function public.tg_match_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'closed' and old.status = 'open' and new.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger matches_closed_at
before update of status on public.matches
for each row execute function public.tg_match_closed_at();

-- Los equipos que arrancan deben ser de la jornada.
create or replace function public.tg_match_starting_teams()
returns trigger
language plpgsql
as $$
begin
  if new.starting_team_ids is not null and (
    new.starting_team_ids[1] = new.starting_team_ids[2]
    or (select count(*) from public.teams where match_id = new.id and id = any (new.starting_team_ids)) <> 2
  ) then
    raise exception 'Los equipos que arrancan deben ser dos equipos distintos de la jornada';
  end if;
  return new;
end;
$$;

create trigger matches_starting_teams
before update of starting_team_ids on public.matches
for each row execute function public.tg_match_starting_teams();

-- El arrastre debe ir a un mercado de la misma jornada y sin ciclos.
create or replace function public.tg_market_rollover_check()
returns trigger
language plpgsql
as $$
declare
  v_next uuid := new.rollover_to_market_id;
  v_hops int := 0;
begin
  if v_next is null then
    return new;
  end if;
  if not exists (select 1 from public.markets where id = v_next and match_id = new.match_id) then
    raise exception 'El arrastre debe apuntar a un mercado de la misma jornada';
  end if;
  while v_next is not null and v_hops < 100 loop
    if v_next = new.id then
      raise exception 'El arrastre forma un ciclo entre mercados';
    end if;
    select rollover_to_market_id into v_next from public.markets where id = v_next;
    v_hops := v_hops + 1;
  end loop;
  return new;
end;
$$;

create trigger markets_rollover_check
before insert or update of rollover_to_market_id, match_id on public.markets
for each row execute function public.tg_market_rollover_check();

-- Jugador y equipos de un evento deben ser de la misma jornada.
create or replace function public.tg_event_check()
returns trigger
language plpgsql
as $$
begin
  if new.player_id is not null and not exists (
    select 1 from public.players where id = new.player_id and match_id = new.match_id and not is_own_goal
  ) then
    raise exception 'El jugador no pertenece a esta jornada';
  end if;
  if exists (
    select 1 from unnest(array[new.team_id, new.team_out_id]) t(id)
    where t.id is not null and not exists (select 1 from public.teams where id = t.id and match_id = new.match_id)
  ) then
    raise exception 'El equipo no pertenece a esta jornada';
  end if;
  return new;
end;
$$;

create trigger events_check
before insert or update on public.events
for each row execute function public.tg_event_check();

-- Al revisar un ticket se guarda la fecha.
create or replace function public.tg_ticket_reviewed()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_at := case when new.status = 'pending' then null else now() end;
    if new.status <> 'rejected' then
      new.reject_reason := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger tickets_reviewed
before update on public.tickets
for each row execute function public.tg_ticket_reviewed();

-- Realtime: aviso por Broadcast en el canal `match:<CODIGO>`.
create or replace function public.tg_broadcast_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record := coalesce(new, old);
  v_match uuid;
  v_code text;
begin
  if tg_table_name = 'matches' then
    v_match := v_row.id;
  else
    v_match := v_row.match_id;
  end if;
  select access_code into v_code from matches where id = v_match;
  if v_code is null then
    return null;
  end if;
  begin
    perform realtime.send(jsonb_build_object('table', tg_table_name, 'op', tg_op), 'changed', 'match:' || v_code, false);
  exception when others then
    null; -- si Realtime no está disponible no se bloquea la escritura
  end;
  return null;
end;
$$;

create trigger broadcast_matches after insert or update on public.matches
for each row execute function public.tg_broadcast_match_change();
create trigger broadcast_tickets after insert or update or delete on public.tickets
for each row execute function public.tg_broadcast_match_change();
create trigger broadcast_events after insert or update or delete on public.events
for each row execute function public.tg_broadcast_match_change();
create trigger broadcast_markets after insert or update or delete on public.markets
for each row execute function public.tg_broadcast_match_change();
create trigger broadcast_players after insert or update or delete on public.players
for each row execute function public.tg_broadcast_match_change();
create trigger broadcast_teams after insert or update or delete on public.teams
for each row execute function public.tg_broadcast_match_change();

-- =============================================================================
-- RLS y permisos
-- =============================================================================
alter table public.market_types enable row level security;
alter table public.matches      enable row level security;
alter table public.teams        enable row level security;
alter table public.players      enable row level security;
alter table public.markets      enable row level security;
alter table public.tickets      enable row level security;
alter table public.bets         enable row level security;
alter table public.events       enable row level security;
alter table public.payouts_paid enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.market_types, public.matches, public.teams, public.players, public.markets,
  public.tickets, public.bets, public.events, public.payouts_paid
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.market_types to anon;

create policy market_types_read on public.market_types
  for select to anon, authenticated using (true);
create policy market_types_admin on public.market_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy matches_admin on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy teams_admin on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy players_admin on public.players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy markets_admin on public.markets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tickets_admin on public.tickets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bets_admin on public.bets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy events_admin on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payouts_paid_admin on public.payouts_paid
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Vista de apuestas aprobadas, sin ruta de la captura.
create or replace view public.public_bets
with (security_invoker = true)
as
select b.id, b.ticket_id, t.match_id, t.bettor_name, t.created_at as ticket_created_at,
       b.market_id, b.player_id, b.team_id, b.option_value, b.amount
from public.bets b
join public.tickets t on t.id = b.ticket_id
where t.status = 'approved';

revoke all on public.public_bets from anon;
grant select on public.public_bets to authenticated;

-- =============================================================================
-- RPC públicas
-- =============================================================================

create or replace function public.get_public_match(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id, 'title', m.title, 'starts_at', m.starts_at, 'access_code', m.access_code,
      'status', m.status, 'closed_at', m.closed_at, 'starting_team_ids', to_jsonb(m.starting_team_ids),
      'pay_method', m.pay_method, 'pay_number', m.pay_number, 'pay_holder', m.pay_holder, 'pay_qr_path', m.pay_qr_path
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sort_order', t.sort_order, 'color', t.color) order by t.sort_order, t.name)
      from teams t where t.match_id = m.id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'is_own_goal', p.is_own_goal, 'sort_order', p.sort_order)
                       order by p.is_own_goal, p.sort_order, p.name)
      from players p where p.match_id = m.id
    ), '[]'::jsonb),
    'markets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'type', k.type, 'param', k.param, 'sort_order', k.sort_order,
        'is_active', k.is_active, 'rollover_to_market_id', k.rollover_to_market_id, 'initial_pot', k.initial_pot,
        'target', mt.target, 'section', mt.section, 'option_min', mt.option_min, 'option_max', mt.option_max,
        'allows_own_goal', mt.allows_own_goal
      ) order by k.sort_order, k.created_at)
      from markets k join market_types mt on mt.type = k.type
      where k.match_id = m.id and k.is_active
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'player_id', e.player_id, 'team_id', e.team_id,
        'is_own_goal', e.is_own_goal, 'team_out_id', e.team_out_id, 'minute', e.minute, 'seq', e.seq
      ) order by e.minute, e.seq)
      from events e where e.match_id = m.id
    ), '[]'::jsonb),
    'bets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'ticket_id', b.ticket_id, 'bettor_name', b.bettor_name, 'market_id', b.market_id,
        'player_id', b.player_id, 'team_id', b.team_id, 'option_value', b.option_value,
        'amount', b.amount, 'created_at', b.ticket_created_at
      ) order by b.ticket_created_at, b.ticket_id, b.id)
      from public_bets b where b.match_id = m.id
    ), '[]'::jsonb)
  )
  from matches m
  where m.access_code = upper(btrim(p_code));
$$;

create or replace function public.match_is_open(p_match_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from matches where id::text = p_match_id and status = 'open');
$$;

-- Envío de un ticket. Cada apuesta: {market_id, player_id | team_id | option, amount}.
create or replace function public.submit_ticket(p_code text, p_bettor_name text, p_bets jsonb, p_receipt_path text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_name text := regexp_replace(btrim(coalesce(p_bettor_name, '')), '\s+', ' ', 'g');
  v_count int;
  v_ticket uuid;
  v_total int := 0;
  v_bet jsonb;
  v_amount int;
  v_market markets%rowtype;
  v_type market_types%rowtype;
  v_player uuid;
  v_team uuid;
  v_option int;
  v_is_og boolean;
begin
  select * into v_match from matches where access_code = upper(btrim(p_code)) for share;
  if not found then
    raise exception 'Jornada no encontrada';
  end if;
  if v_match.status <> 'open' then
    raise exception 'Las apuestas están cerradas';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Escribe tu nombre (máximo 40 caracteres)';
  end if;
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' then
    raise exception 'Apuestas inválidas';
  end if;
  v_count := jsonb_array_length(p_bets);
  if v_count < 1 or v_count > 20 then
    raise exception 'Cada ticket debe tener entre 1 y 20 apuestas';
  end if;
  if p_receipt_path is null or split_part(p_receipt_path, '/', 1) <> v_match.id::text then
    raise exception 'Falta la captura del pago';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = p_receipt_path) then
    raise exception 'No se encontró la captura del pago, vuelve a subirla';
  end if;
  if exists (select 1 from tickets where receipt_path = p_receipt_path) then
    raise exception 'Esa captura ya fue usada en otro ticket';
  end if;

  insert into tickets (match_id, bettor_name, total, receipt_path, status)
  values (v_match.id, v_name, 0, p_receipt_path, 'pending')
  returning id into v_ticket;

  for v_bet in select value from jsonb_array_elements(p_bets) loop
    begin
      v_amount := (v_bet ->> 'amount')::int;
      v_player := nullif(v_bet ->> 'player_id', '')::uuid;
      v_team := nullif(v_bet ->> 'team_id', '')::uuid;
      v_option := nullif(v_bet ->> 'option', '')::int;
    exception when others then
      raise exception 'Apuesta inválida';
    end;
    if v_amount is null or v_amount not between 1 and 5 then
      raise exception 'Cada apuesta debe ser de S/ 1 a S/ 5';
    end if;

    select * into v_market from markets
    where id = nullif(v_bet ->> 'market_id', '')::uuid and match_id = v_match.id and is_active;
    if not found then
      raise exception 'Mercado inválido';
    end if;
    select * into v_type from market_types where type = v_market.type;

    if v_type.target = 'player' then
      if v_player is null or v_team is not null or v_option is not null then
        raise exception 'En % se apuesta a un jugador', v_market.name;
      end if;
      select is_own_goal into v_is_og from players where id = v_player and match_id = v_match.id;
      if not found then
        raise exception 'Jugador inválido';
      end if;
      if v_is_og and not v_type.allows_own_goal then
        raise exception 'No se puede apostar a "Autogol" en %', v_market.name;
      end if;
    elsif v_type.target = 'team' then
      if v_team is null or v_player is not null or v_option is not null then
        raise exception 'En % se apuesta a un equipo', v_market.name;
      end if;
      if not exists (select 1 from teams where id = v_team and match_id = v_match.id) then
        raise exception 'Equipo inválido';
      end if;
    else
      if v_option is null or v_player is not null or v_team is not null then
        raise exception 'En % se apuesta a un número', v_market.name;
      end if;
      if v_option not between coalesce(v_type.option_min, 1) and coalesce(v_type.option_max, 10) then
        raise exception 'En % el número va de % a %', v_market.name, coalesce(v_type.option_min, 1), coalesce(v_type.option_max, 10);
      end if;
    end if;

    insert into bets (ticket_id, market_id, player_id, team_id, option_value, amount)
    values (v_ticket, v_market.id, v_player, v_team, v_option, v_amount);
    v_total := v_total + v_amount;
  end loop;

  update tickets set total = v_total where id = v_ticket;
  return v_ticket;
exception
  when unique_violation then
    raise exception 'Hay dos apuestas iguales en el mismo mercado';
end;
$$;

revoke execute on function public.get_public_match(text) from public;
revoke execute on function public.submit_ticket(text, text, jsonb, text) from public;
revoke execute on function public.match_is_open(text) from public;
grant execute on function public.get_public_match(text) to anon, authenticated;
grant execute on function public.submit_ticket(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.match_is_open(text) to anon, authenticated;
revoke execute on function public.tg_match_defaults() from public, anon, authenticated;
revoke execute on function public.tg_broadcast_match_change() from public, anon, authenticated;

-- =============================================================================
-- Storage: capturas (privado) y QR de pago (público)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pay-qr', 'pay-qr', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy receipts_public_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'receipts' and public.match_is_open((storage.foldername(name))[1]));
create policy receipts_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'receipts' and public.is_admin());
create policy receipts_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'receipts' and public.is_admin());

create policy payqr_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'pay-qr' and public.is_admin());
create policy payqr_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'pay-qr' and public.is_admin());
create policy payqr_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'pay-qr' and public.is_admin());
