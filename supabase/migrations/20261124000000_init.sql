-- =============================================================================
-- Apuestas del Partido — esquema inicial
--
-- Modelo de seguridad:
--   * RLS activada en TODAS las tablas.
--   * El público (anon) NO tiene políticas sobre las tablas: todo lo que ve o
--     envía pasa por funciones RPC (security definer) que exigen el código de
--     acceso del partido. Así "solo ve el partido quien conoce el código".
--   * El admin (usuario en la tabla `admins`) puede leer y modificar todo.
--   * El bote en vivo se notifica por Realtime Broadcast en el canal
--     `match:<CODIGO>`; el cliente vuelve a pedir los datos con la RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Admins
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Tipos de mercado (catálogo extensible: agrega una fila + un resolver en TS)
-- -----------------------------------------------------------------------------
create table public.market_types (
  type text primary key,
  label text not null,
  -- ¿Se puede apostar al jugador especial "Autogol" en este tipo?
  allows_own_goal boolean not null default false,
  -- Tipo de evento que mira el resolver (solo informativo para la UI)
  event_type text check (event_type in ('goal', 'yellow'))
);

insert into public.market_types (type, label, allows_own_goal, event_type) values
  ('first_goal',   'Primer gol',               true,  'goal'),
  ('last_goal',    'Último gol',               true,  'goal'),
  ('first_yellow', 'Primera tarjeta amarilla', false, 'yellow');

-- -----------------------------------------------------------------------------
-- Partidos
-- -----------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null check (char_length(btrim(home_team)) between 1 and 60),
  away_team text not null check (char_length(btrim(away_team)) between 1 and 60),
  starts_at timestamptz,
  access_code text not null unique check (access_code ~ '^[A-Z0-9]{4,20}$'),
  status text not null default 'open' check (status in ('open', 'closed', 'finished')),
  yape_number text,
  yape_holder text,
  yape_qr_path text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Jugadores ("Autogol" se crea solo, uno por partido, sin equipo)
-- -----------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  team text check (team in ('home', 'away')),
  is_own_goal boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint players_team_ck check (
    (is_own_goal and team is null) or (not is_own_goal and team is not null)
  )
);
create index players_match_idx on public.players (match_id);
create unique index players_one_own_goal on public.players (match_id) where is_own_goal;

-- -----------------------------------------------------------------------------
-- Mercados
-- -----------------------------------------------------------------------------
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null references public.market_types (type),
  sort_order int not null default 0,
  is_active boolean not null default true,
  rollover_to_market_id uuid references public.markets (id) on delete set null,
  initial_pot numeric(10, 2) not null default 0 check (initial_pot >= 0),
  created_at timestamptz not null default now(),
  constraint markets_no_self_rollover check (rollover_to_market_id is distinct from id)
);
create index markets_match_idx on public.markets (match_id);

-- -----------------------------------------------------------------------------
-- Tickets (uno por envío del apostador, con una captura de Yape)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Apuestas (una por jugador y mercado dentro de un ticket)
-- -----------------------------------------------------------------------------
create table public.bets (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  amount int not null check (amount between 1 and 5),
  unique (ticket_id, market_id, player_id)
);
create index bets_ticket_idx on public.bets (ticket_id);
create index bets_market_idx on public.bets (market_id);

-- -----------------------------------------------------------------------------
-- Eventos (goles y amarillas). `seq` desempata eventos del mismo minuto.
-- -----------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  type text not null check (type in ('goal', 'yellow')),
  player_id uuid not null references public.players (id) on delete cascade,
  minute int not null check (minute between 0 and 130),
  stoppage int not null default 0 check (stoppage between 0 and 30),
  seq bigint generated always as identity,
  created_at timestamptz not null default now()
);
create index events_match_idx on public.events (match_id, minute, stoppage, seq);

-- -----------------------------------------------------------------------------
-- Pagos realizados por persona (person_key = nombre normalizado)
-- -----------------------------------------------------------------------------
create table public.payouts_paid (
  match_id uuid not null references public.matches (id) on delete cascade,
  person_key text not null,
  bettor_name text not null,
  paid_at timestamptz not null default now(),
  primary key (match_id, person_key)
);

-- =============================================================================
-- Triggers de integridad
-- =============================================================================

-- Al crear un partido: jugador "Autogol" + mercados por defecto.
create or replace function public.tg_match_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last uuid;
begin
  insert into players (match_id, name, team, is_own_goal, sort_order)
  values (new.id, 'Autogol', null, true, 9999);

  insert into markets (match_id, name, type, sort_order)
  values (new.id, 'Último gol', 'last_goal', 2)
  returning id into v_last;

  insert into markets (match_id, name, type, sort_order, rollover_to_market_id)
  values (new.id, 'Primer gol', 'first_goal', 1, v_last);

  insert into markets (match_id, name, type, sort_order)
  values (new.id, 'Primera amarilla', 'first_yellow', 3);

  return new;
end;
$$;

create trigger matches_defaults
after insert on public.matches
for each row execute function public.tg_match_defaults();

-- El arrastre debe ir a un mercado del mismo partido y sin ciclos.
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
    raise exception 'El arrastre debe apuntar a un mercado del mismo partido';
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

-- El jugador de un evento debe ser del mismo partido.
create or replace function public.tg_event_player_check()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.players where id = new.player_id and match_id = new.match_id) then
    raise exception 'El jugador no pertenece a este partido';
  end if;
  return new;
end;
$$;

create trigger events_player_check
before insert or update on public.events
for each row execute function public.tg_event_player_check();

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

-- =============================================================================
-- Realtime: aviso por Broadcast en el canal `match:<CODIGO>`
-- =============================================================================
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
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op),
      'changed',
      'match:' || v_code,
      false
    );
  exception when others then
    -- Si Realtime no está disponible no se debe bloquear la escritura.
    null;
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

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.admins       enable row level security;
alter table public.market_types enable row level security;
alter table public.matches      enable row level security;
alter table public.players      enable row level security;
alter table public.markets      enable row level security;
alter table public.tickets      enable row level security;
alter table public.bets         enable row level security;
alter table public.events       enable row level security;
alter table public.payouts_paid enable row level security;

-- Permisos explícitos (no dependemos de "Grant API access to new tables
-- automatically"). Lo que cada rol ve realmente lo deciden las políticas RLS.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.market_types to anon;

-- El admin puede ver su propia fila (para saber que es admin).
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Catálogo de tipos: lectura para todos (no es sensible).
create policy market_types_read on public.market_types
  for select to anon, authenticated using (true);
create policy market_types_admin on public.market_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Resto de tablas: solo el admin. El público usa las RPC de abajo.
create policy matches_admin on public.matches
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

-- =============================================================================
-- Vista pública de apuestas aprobadas (sin ruta de la captura)
-- =============================================================================
create or replace view public.public_bets
with (security_invoker = true)
as
select
  b.id,
  b.ticket_id,
  t.match_id,
  t.bettor_name,
  t.created_at as ticket_created_at,
  b.market_id,
  b.player_id,
  b.amount
from public.bets b
join public.tickets t on t.id = b.ticket_id
where t.status = 'approved';

revoke all on public.public_bets from anon;

-- =============================================================================
-- RPC públicas
-- =============================================================================

-- Todo lo que la pantalla pública necesita, si el código es válido.
create or replace function public.get_public_match(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id,
      'home_team', m.home_team,
      'away_team', m.away_team,
      'starts_at', m.starts_at,
      'access_code', m.access_code,
      'status', m.status,
      'yape_number', m.yape_number,
      'yape_holder', m.yape_holder,
      'yape_qr_path', m.yape_qr_path
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'team', p.team,
        'is_own_goal', p.is_own_goal, 'sort_order', p.sort_order
      ) order by p.is_own_goal, p.team, p.sort_order, p.name)
      from players p where p.match_id = m.id
    ), '[]'::jsonb),
    'markets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'type', k.type, 'sort_order', k.sort_order,
        'is_active', k.is_active, 'rollover_to_market_id', k.rollover_to_market_id,
        'initial_pot', k.initial_pot, 'allows_own_goal', mt.allows_own_goal
      ) order by k.sort_order, k.created_at)
      from markets k join market_types mt on mt.type = k.type
      where k.match_id = m.id and k.is_active
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'player_id', e.player_id,
        'minute', e.minute, 'stoppage', e.stoppage, 'seq', e.seq
      ) order by e.minute, e.stoppage, e.seq)
      from events e where e.match_id = m.id
    ), '[]'::jsonb),
    'bets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'ticket_id', b.ticket_id, 'bettor_name', b.bettor_name,
        'market_id', b.market_id, 'player_id', b.player_id, 'amount', b.amount,
        'created_at', b.ticket_created_at
      ) order by b.ticket_created_at, b.ticket_id, b.id)
      from public_bets b where b.match_id = m.id
    ), '[]'::jsonb)
  )
  from matches m
  where m.access_code = upper(btrim(p_code));
$$;

-- Usado por la política de Storage: ¿se puede subir una captura a este partido?
create or replace function public.match_is_open(p_match_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from matches where id::text = p_match_id and status = 'open'
  );
$$;

-- Envío de un ticket con sus apuestas. Valida TODO en la base de datos.
create or replace function public.submit_ticket(
  p_code text,
  p_bettor_name text,
  p_bets jsonb,
  p_receipt_path text
)
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
  v_player players%rowtype;
  v_allows_og boolean;
begin
  -- Bloquea el partido para que no se cierre a mitad del envío.
  select * into v_match from matches where access_code = upper(btrim(p_code)) for share;
  if not found then
    raise exception 'Partido no encontrado';
  end if;
  if v_match.status <> 'open' then
    raise exception 'El partido está cerrado, ya no se aceptan apuestas';
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
    raise exception 'Falta la captura del Yape';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = p_receipt_path) then
    raise exception 'No se encontró la captura del Yape, vuelve a subirla';
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
    exception when others then
      raise exception 'Monto inválido';
    end;
    if v_amount is null or v_amount not between 1 and 5 then
      raise exception 'Cada apuesta debe ser de S/ 1 a S/ 5';
    end if;

    select * into v_market from markets
    where id = (v_bet ->> 'market_id')::uuid and match_id = v_match.id and is_active;
    if not found then
      raise exception 'Mercado inválido';
    end if;

    select * into v_player from players
    where id = (v_bet ->> 'player_id')::uuid and match_id = v_match.id;
    if not found then
      raise exception 'Jugador inválido';
    end if;

    if v_player.is_own_goal then
      select allows_own_goal into v_allows_og from market_types where type = v_market.type;
      if not coalesce(v_allows_og, false) then
        raise exception 'No se puede apostar a Autogol en %', v_market.name;
      end if;
    end if;

    insert into bets (ticket_id, market_id, player_id, amount)
    values (v_ticket, v_market.id, v_player.id, v_amount);
    v_total := v_total + v_amount;
  end loop;

  update tickets set total = v_total where id = v_ticket;
  return v_ticket;
exception
  when unique_violation then
    raise exception 'Hay dos apuestas al mismo jugador en el mismo mercado';
end;
$$;

-- Permisos de ejecución
revoke execute on function public.get_public_match(text) from public;
revoke execute on function public.submit_ticket(text, text, jsonb, text) from public;
revoke execute on function public.match_is_open(text) from public;
revoke execute on function public.is_admin() from public;
grant execute on function public.get_public_match(text) to anon, authenticated;
grant execute on function public.submit_ticket(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.match_is_open(text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Las funciones de trigger no se llaman por la API.
revoke execute on function public.tg_match_defaults() from public, anon, authenticated;
revoke execute on function public.tg_broadcast_match_change() from public, anon, authenticated;

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('yape-qr',  'yape-qr',  true,  2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- receipts: cualquiera puede SUBIR a la carpeta de un partido abierto,
-- nadie salvo el admin puede ver, cambiar ni borrar.
create policy receipts_public_upload on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'receipts'
    and public.match_is_open((storage.foldername(name))[1])
  );

create policy receipts_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

create policy receipts_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

-- yape-qr: bucket público (lectura por URL pública); solo el admin escribe.
create policy yapeqr_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'yape-qr' and public.is_admin());

create policy yapeqr_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'yape-qr' and public.is_admin());

create policy yapeqr_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'yape-qr' and public.is_admin());
