-- =============================================================================
-- Copa Álvaro — cuentas, Yape/Plin, social y mercados de show
--
--   * Cada apostador tiene cuenta (correo + usuario + contraseña). Supabase Auth
--     envía el correo de confirmación y el de recuperar contraseña.
--   * `profiles`: usuario único por cuenta. Los tickets se guardan con el usuario
--     logueado; el nombre del ticket es su usuario (así nadie apuesta por otro).
--   * `messages`: chat "Social" por jornada, con aviso por Realtime en `chat:<CODIGO>`.
--   * Mercados nuevos: roja, blooper, penal cometido / fallado, palo, golazo,
--     piscinazo, cuántos palos, mejor y peor equipo.
--   * 4 equipos (Equipo 1, 2, 3 y 4) y los 20 jugadores de siempre por defecto.
--   * Liga todos contra todos: 6 partidos uno por uno (1v2, 3v4, 1v3, 2v4, 1v4, 2v3).
--     `matches.current_game` es el partido en juego y cada evento guarda su `game`.
--     Mercados por partido (primer gol y ganador) y de la liga (campeón, último…).
--   * Billetera: cada usuario recarga saldo plineando al QR (`deposits`). El
--     organizador acepta el depósito en su vista de Pagos y recién ahí se suma
--     al saldo. Con el saldo se apuesta: cada ticket se descuenta al instante.
--     Si el organizador rechaza un ticket, el monto vuelve al saldo.
--   * Liquidación: el organizador da por cerrado un mercado cuando quiere; a los
--     ganadores se les acredita su parte del bote (y las devoluciones) en el saldo.
--     Puede volver a liquidar o deshacer, y los saldos se actualizan.
--   * Solo se juega con plata depositada: lo acreditado nunca supera lo apostado
--     en la jornada, y al final el organizador devuelve los saldos por Plin
--     (`withdrawals`), así todo cuadra.
-- =============================================================================

-- Las funciones se crean antes que algunas tablas que usan (se validan al ejecutarse).
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Eventos y mercados nuevos
-- -----------------------------------------------------------------------------
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (
  type in ('goal', 'yellow', 'nutmeg', 'rotation', 'red', 'blooper', 'penalty', 'penalty_miss', 'post', 'golazo', 'dive')
);
alter table public.events drop constraint if exists events_shape;
alter table public.events add constraint events_shape check (
  (type = 'goal' and player_id is not null and team_id is not null and team_out_id is null)
  or (type in ('yellow', 'nutmeg', 'red', 'blooper', 'penalty', 'penalty_miss', 'post', 'golazo', 'dive')
      and player_id is not null and team_id is null and team_out_id is null and not is_own_goal)
  or (type = 'rotation' and team_out_id is not null and player_id is null and team_id is null and not is_own_goal)
);

alter table public.events add column if not exists game int check (game is null or game between 1 and 20);
alter table public.matches add column if not exists current_game int not null default 1 check (current_game between 1 and 21);
-- El partido actual está en vivo (lo prende y apaga el organizador). current_game = último + 1: todos terminados.
alter table public.matches add column if not exists game_live boolean not null default false;

-- Equipos de un partido de la liga (orden de los equipos: sort_order, nombre). Null si no son 4 equipos.
create or replace function public.fixture_pair(p_match uuid, p_game int)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select array_agg(id order by sort_order, name) ids from teams where match_id = p_match
  ), f(game, h, a) as (
    values (1, 1, 2), (2, 3, 4), (3, 1, 3), (4, 2, 4), (5, 1, 4), (6, 2, 3)
  )
  select array[t.ids[f.h], t.ids[f.a]] from t, f
  where f.game = p_game and cardinality(t.ids) = 4;
$$;
revoke execute on function public.fixture_pair(uuid, int) from public, anon, authenticated;

-- Un gol de la liga debe ser de uno de los dos equipos de ese partido.
create or replace function public.tg_event_game_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair uuid[];
begin
  if new.type = 'goal' and new.game is not null then
    v_pair := public.fixture_pair(new.match_id, new.game);
    if v_pair is not null and not (new.team_id = any (v_pair)) then
      raise exception 'Ese equipo no juega el partido %', new.game;
    end if;
  end if;
  return new;
end;
$$;
create trigger events_game_check
before insert or update on public.events
for each row execute function public.tg_event_game_check();

alter table public.market_types drop constraint if exists market_types_section_check;
alter table public.market_types add constraint market_types_section_check
  check (section in ('goles', 'equipos', 'amarillas', 'pichanga', 'show', 'partidos'));

insert into public.market_types (type, label, target, section, has_param, option_min, option_max, allows_own_goal) values
  ('best_team',              'Campeón de la liga',          'team',   'equipos',   false, null, null, false),
  ('worst_team',             'Último de la tabla',          'team',   'equipos',   false, null, null, false),
  ('top_scoring_team',       'Equipo más goleador',         'team',   'equipos',   false, null, null, false),
  ('most_conceded_team',     'Equipo más goleado',          'team',   'equipos',   false, null, null, false),
  ('game_winner', 'Ganador (partido N)', 'number', 'partidos', true, 0, 2, false),
  ('game_goals', 'Goles en el partido (partido N)', 'number', 'partidos', true, 0, 5, false),
  ('game_first_goal', 'Primer gol (partido N)', 'player', 'partidos', true, null, null, true),
  ('game_last_goal', 'Último gol (partido N)', 'player', 'partidos', true, null, null, true),
  ('game_first_own_goal', 'Primer autogol (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_yellow', 'Primera amarilla (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_red', 'Primera roja (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_post', 'Primer palo (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_golazo', 'Primer golazo (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_penalty', 'Primer penal cometido (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_penalty_miss', 'Primer penal fallado (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_blooper', 'Primer blooper (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_dive', 'Primer piscinazo (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_first_nutmeg', 'Primera huacha (partido N)', 'player', 'partidos', true, null, null, false),
  ('game_has_post', '¿Habrá palo? (partido N)', 'number', 'partidos', true, 0, 1, false),
  ('game_has_penalty', '¿Habrá penal? (partido N)', 'number', 'partidos', true, 0, 1, false),
  ('game_has_red', '¿Habrá roja? (partido N)', 'number', 'partidos', true, 0, 1, false),
  ('game_has_golazo', '¿Habrá golazo? (partido N)', 'number', 'partidos', true, 0, 1, false),
  ('game_has_own_goal', '¿Habrá autogol? (partido N)', 'number', 'partidos', true, 0, 1, false),
  ('first_red',              'Primera roja',                'player', 'amarillas', false, null, null, false),
  ('first_blooper',          'Primer blooper',              'player', 'show',      false, null, null, false),
  ('first_penalty_conceded', 'Primer penal cometido',       'player', 'show',      false, null, null, false),
  ('first_penalty_missed',   'Primer penal fallado',        'player', 'show',      false, null, null, false),
  ('first_post',             'Primer palo',                 'player', 'show',      false, null, null, false),
  ('first_golazo',           'Primer golazo',               'player', 'show',      false, null, null, false),
  ('first_dive',             'Primer piscinazo',            'player', 'show',      false, null, null, false),
  ('total_posts',            '¿Cuántos palos?',             'number', 'show',      false, 0,    5,    false)
on conflict (type) do nothing;

-- Mercados que se agregan a cada jornada (nuevas y las que aún no terminan).
create or replace function public.copa_extra_markets(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teams text[];
  v_h int[] := array[1, 3, 1, 2, 1, 2];
  v_a int[] := array[2, 4, 3, 4, 4, 3];
  i int;
begin
  insert into markets (match_id, name, type, param, sort_order)
  select p_match, x.name, x.type, null, x.ord
  from (values
    ('Campeón de la liga',     'best_team',              16),
    ('Último de la tabla',     'worst_team',             17),
    ('Equipo más goleador',    'top_scoring_team',       18),
    ('Equipo más goleado',     'most_conceded_team',     19),
    ('Primera roja',           'first_red',              20),
    ('Primer blooper',         'first_blooper',          21),
    ('Primer penal cometido',  'first_penalty_conceded', 22),
    ('Primer penal fallado',   'first_penalty_missed',   23),
    ('Primer palo',            'first_post',             24),
    ('Primer golazo',          'first_golazo',           25),
    ('Primer piscinazo',       'first_dive',             26),
    ('¿Cuántos palos habrá?',  'total_posts',            27)
  ) as x(name, type, ord)
  where not exists (select 1 from markets k where k.match_id = p_match and k.type = x.type);

  -- Por partido: todas las apuestas del catálogo (ganador, goles, primer…, último gol, ¿habrá…?).
  select array_agg(name order by sort_order, name) into v_teams from teams where match_id = p_match;
  if coalesce(cardinality(v_teams), 0) = 4 then
    for i in 1 .. 6 loop
      insert into markets (match_id, name, type, param, sort_order)
      select p_match, x.label || ' · ' || v_teams[v_h[i]] || ' vs ' || v_teams[v_a[i]], x.type, i, 100 + i * 30 + x.ord
      from (values
        ('game_winner', 'Ganador', 0),
        ('game_goals', 'Goles en el partido', 1),
        ('game_first_goal', 'Primer gol', 2),
        ('game_last_goal', 'Último gol', 3),
        ('game_first_own_goal', 'Primer autogol', 4),
        ('game_first_yellow', 'Primera amarilla', 5),
        ('game_first_red', 'Primera roja', 6),
        ('game_first_post', 'Primer palo', 7),
        ('game_first_golazo', 'Primer golazo', 8),
        ('game_first_penalty', 'Primer penal cometido', 9),
        ('game_first_penalty_miss', 'Primer penal fallado', 10),
        ('game_first_blooper', 'Primer blooper', 11),
        ('game_first_dive', 'Primer piscinazo', 12),
        ('game_first_nutmeg', 'Primera huacha', 13),
        ('game_has_post', '¿Habrá palo?', 14),
        ('game_has_penalty', '¿Habrá penal?', 15),
        ('game_has_red', '¿Habrá roja?', 16),
        ('game_has_golazo', '¿Habrá golazo?', 17),
        ('game_has_own_goal', '¿Habrá autogol?', 18)
      ) as x(type, label, ord)
      where not exists (select 1 from markets k where k.match_id = p_match and k.type = x.type and k.param = i);
    end loop;
  end if;
end;
$$;
revoke execute on function public.copa_extra_markets(uuid) from public, anon, authenticated;

create or replace function public.tg_match_extra_markets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform copa_extra_markets(new.id);
  return new;
end;
$$;
revoke execute on function public.tg_match_extra_markets() from public, anon, authenticated;

-- Corre después de `matches_defaults` (orden alfabético de triggers).
create trigger matches_extra_markets
after insert on public.matches
for each row execute function public.tg_match_extra_markets();


-- -----------------------------------------------------------------------------
-- 2. Jornada por defecto: 4 equipos, 20 jugadores, 15 mercados base y pago por Plin
-- -----------------------------------------------------------------------------
alter table public.matches alter column pay_method set default 'Plin';
alter table public.matches alter column pay_holder set default 'Alvaro Fabrizzio Salazar';

create or replace function public.tg_match_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_1 uuid; v_2 uuid;
  v_names text[] := array[
    'Victor Manuel Espino', 'Oscar Fernando Vara', 'Mate Italo Loechle', 'Angel Jose Pariona',
    'Alexis Encalada', 'Adrian Ruiz', 'Iker Gabriel Barturen', 'Braden García',
    'Victor Nicolas Ortiz', 'Diego Guevara', 'Nestor Rojas', 'Paul Espinoza',
    'Fabian Jesus Sandoval', 'Manuel Tumi', 'Bryan Eduardo Barba', 'David Málaga',
    'Lorenzo Balicco', 'Andreow Jomark Santiago', 'David Ignacio Vivar', 'Alvaro Fabrizzio Salazar'
  ];
begin
  insert into teams (match_id, name, sort_order) values (new.id, 'Equipo 1', 1) returning id into v_1;
  insert into teams (match_id, name, sort_order) values (new.id, 'Equipo 2', 2) returning id into v_2;
  insert into teams (match_id, name, sort_order) values (new.id, 'Equipo 3', 3), (new.id, 'Equipo 4', 4);
  update matches set starting_team_ids = array[v_1, v_2] where id = new.id and starting_team_ids is null;

  insert into players (match_id, name, is_own_goal, sort_order) values (new.id, 'Autogol', true, 9999);
  insert into players (match_id, name, sort_order)
  select new.id, n, i from unnest(v_names) with ordinality as x(n, i);

  -- Sin arrastres por defecto: si nadie acierta, el bote es del organizador.
  insert into markets (match_id, name, type, param, sort_order) values
    (new.id, 'Primer gol de la noche',  'first_goal',          null, 1),
    (new.id, 'Último gol de la noche',  'last_goal',           null, 2),
    (new.id, 'Pichichi de la noche',    'top_scorer',          null, 3),
    (new.id, 'Primer cuartete',         'first_to_n_goals',    4,    4),
    (new.id, 'Primer sextete',          'first_to_n_goals',    6,    5),
    (new.id, 'Gol número 15',           'nth_goal',            15,   6),
    (new.id, 'Gol número 28',           'nth_goal',            28,   7),
    (new.id, 'Primera amarilla',        'first_yellow',        null, 11),
    (new.id, 'Última amarilla',         'last_yellow',         null, 12),
    (new.id, 'El más amonestado',       'most_yellows',        null, 13),
    (new.id, 'Primer autogol',          'first_own_goal',      null, 14),
    (new.id, 'Primera huacha',          'first_nutmeg_victim', null, 15);
  return new;
end;
$$;
revoke execute on function public.tg_match_defaults() from public, anon, authenticated;

-- Jornadas que aún no terminan: Equipo A/B/C → Equipo 1/2/3 y se agrega el Equipo 4.
update public.teams t set name = 'Equipo ' || (ascii(right(t.name, 1)) - 64)::text
from public.matches m
where m.id = t.match_id and m.status <> 'finished' and t.name in ('Equipo A', 'Equipo B', 'Equipo C');
insert into public.teams (match_id, name, sort_order)
select m.id, 'Equipo 4', 4 from public.matches m
where m.status <> 'finished' and not exists (select 1 from public.teams t where t.match_id = m.id and t.name = 'Equipo 4');

-- Mercados de liga y por partido; los de "ganador se queda" se apagan si nadie apostó.
select public.copa_extra_markets(id) from public.matches where status <> 'finished';
update public.markets k set is_active = false
from public.matches m
where m.id = k.match_id and m.status <> 'finished'
  and k.type in ('most_wins', 'longest_streak', 'most_exits')
  and not exists (select 1 from public.bets b where b.market_id = k.id);

-- Lo público incluye el partido en juego y el partido de cada evento.
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
      'current_game', m.current_game, 'game_live', m.game_live,
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
        'allows_own_goal', mt.allows_own_goal,
        'settled', exists (select 1 from market_settlements s where s.market_id = k.id)
      ) order by k.sort_order, k.created_at)
      from markets k join market_types mt on mt.type = k.type
      where k.match_id = m.id and k.is_active
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'player_id', e.player_id, 'team_id', e.team_id,
        'is_own_goal', e.is_own_goal, 'team_out_id', e.team_out_id, 'minute', e.minute, 'seq', e.seq, 'game', e.game
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

-- -----------------------------------------------------------------------------
-- 3. Cuentas: perfiles con usuario único
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

-- Al registrarse se crea el perfil con el usuario elegido. Si viene vacío,
-- inválido o repetido, se genera uno (nunca se bloquea el registro).
create or replace function public.tg_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wanted text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_base text;
  v_name text;
  i int := 0;
begin
  if v_wanted !~ '^[A-Za-z0-9_.]{3,20}$' then
    v_wanted := left(regexp_replace(split_part(coalesce(new.email, 'hincha'), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), 14);
    if char_length(v_wanted) < 3 then
      v_wanted := 'hincha';
    end if;
  end if;
  v_base := left(v_wanted, 15);
  v_name := v_wanted;
  while exists (select 1 from profiles where lower(username) = lower(v_name)) loop
    i := i + 1;
    v_name := v_base || floor(random() * 9000 + 1000)::int;
    exit when i > 20;
  end loop;
  insert into profiles (id, username) values (new.id, v_name) on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.tg_new_user_profile() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.tg_new_user_profile();

-- ¿Está libre un usuario? (para validar el registro antes de enviarlo)
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select btrim(coalesce(p_username, '')) ~ '^[A-Za-z0-9_.]{3,20}$'
     and not exists (select 1 from profiles where lower(username) = lower(btrim(p_username)));
$$;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
create policy profiles_own_read on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. Tickets con dueño
-- -----------------------------------------------------------------------------
alter table public.tickets add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists tickets_user_idx on public.tickets (user_id, match_id);

-- Las capturas son de depósitos: cada usuario sube solo a deposits/<su id>/.
drop policy if exists receipts_public_upload on storage.objects;
create policy receipts_deposit_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'deposits'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- El envío anónimo con nombre libre deja de existir.
drop function if exists public.submit_ticket(text, text, jsonb, text);

-- -----------------------------------------------------------------------------
-- 4b. Billetera: depósitos por Plin y saldo
-- -----------------------------------------------------------------------------
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  amount int not null check (amount between 1 and 500),
  receipt_path text unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (char_length(reject_reason) <= 200),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index deposits_user_idx on public.deposits (user_id, created_at desc);
create index deposits_status_idx on public.deposits (status, created_at);

alter table public.deposits enable row level security;
grant select, insert, update, delete on public.deposits to authenticated;
-- Solo el admin toca la tabla directo (aceptar/rechazar). El resto usa las RPC.
create policy deposits_admin on public.deposits
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Misma regla que los tickets: guarda la fecha de revisión y limpia el motivo.
create trigger deposits_reviewed
before update on public.deposits
for each row execute function public.tg_ticket_reviewed();

-- -----------------------------------------------------------------------------
-- 4c. Liquidación: mercados cerrados por el organizador y lo acreditado al saldo
-- -----------------------------------------------------------------------------
create table public.market_settlements (
  market_id uuid primary key references public.markets (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  outcome text not null check (outcome in ('winners', 'refund', 'no_winner')),
  winner_selection text,
  settled_at timestamptz not null default now()
);
create index market_settlements_match_idx on public.market_settlements (match_id);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  kind text not null check (kind in ('win', 'refund')),
  amount_cents int not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (market_id, user_id, kind)
);
create index credits_user_idx on public.credits (user_id, created_at desc);

alter table public.market_settlements enable row level security;
alter table public.credits enable row level security;
grant select, insert, update, delete on public.market_settlements, public.credits to authenticated;
create policy market_settlements_admin on public.market_settlements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy credits_admin on public.credits
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Retiros: lo que el organizador ya devolvió por Plin a cada persona.
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  amount_cents int not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
create index withdrawals_user_idx on public.withdrawals (user_id);
alter table public.withdrawals enable row level security;
grant select, insert, update, delete on public.withdrawals to authenticated;
create policy withdrawals_admin on public.withdrawals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Saldo (soles, con céntimos) = recargas aceptadas − tickets no anulados + ganancias acreditadas − retiros.
create or replace function public.wallet_balance(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round((
      coalesce((select sum(amount) from deposits where user_id = p_uid and status = 'approved'), 0) * 100
    - coalesce((select sum(total) from tickets where user_id = p_uid and status <> 'rejected'), 0) * 100
    + coalesce((select sum(amount_cents) from credits where user_id = p_uid), 0)
    - coalesce((select sum(amount_cents) from withdrawals where user_id = p_uid), 0)
  )::numeric / 100, 2);
$$;
revoke execute on function public.wallet_balance(uuid) from public, anon, authenticated;

-- Mi billetera: saldo y últimos depósitos.
create or replace function public.get_wallet()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'balance', wallet_balance(auth.uid()),
    'withdrawn_cents', coalesce((select sum(amount_cents) from withdrawals where user_id = auth.uid()), 0),
    'credits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'amount_cents', c.amount_cents, 'market_name', k.name, 'created_at', c.created_at
      ) order by c.created_at desc)
      from (select * from credits where user_id = auth.uid() order by created_at desc limit 50) c
      join markets k on k.id = c.market_id
    ), '[]'::jsonb),
    'deposits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'amount', d.amount, 'status', d.status, 'reject_reason', d.reject_reason,
        'created_at', d.created_at, 'reviewed_at', d.reviewed_at
      ) order by d.created_at desc)
      from (select * from deposits where user_id = auth.uid() order by created_at desc limit 50) d
    ), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

-- Pedir una recarga: la captura ya debe estar subida en deposits/<mi id>/.
create or replace function public.request_deposit(p_amount int, p_receipt_path text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para recargar';
  end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null then
    raise exception 'Tu cuenta no tiene usuario todavía';
  end if;
  if p_amount is null or p_amount not between 1 and 500 then
    raise exception 'La recarga va de S/ 1 a S/ 500';
  end if;
  if p_receipt_path is null or p_receipt_path not like 'deposits/' || v_uid::text || '/%' then
    raise exception 'Falta la captura del Plin';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = p_receipt_path) then
    raise exception 'No se encontró la captura del Plin, vuelve a subirla';
  end if;
  if exists (select 1 from deposits where receipt_path = p_receipt_path) then
    raise exception 'Esa captura ya fue usada en otra recarga';
  end if;
  if (select count(*) from deposits where user_id = v_uid and status = 'pending') >= 5 then
    raise exception 'Tienes muchas recargas por confirmar. Espera a que el organizador las revise';
  end if;
  insert into deposits (user_id, username, amount, receipt_path)
  values (v_uid, v_name, p_amount, p_receipt_path)
  returning id into v_id;
  return v_id;
end;
$$;

-- Realtime: aviso al organizador (canal `deposits`) y al dueño (canal `wallet:<id>`).
create or replace function public.tg_broadcast_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record := coalesce(new, old);
begin
  begin
    perform realtime.send(jsonb_build_object('op', tg_op), 'changed', 'deposits', false);
    perform realtime.send(jsonb_build_object('op', tg_op), 'changed', 'wallet:' || v_row.user_id::text, false);
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.tg_broadcast_deposit() from public, anon, authenticated;

create trigger broadcast_deposits after insert or update or delete on public.deposits
for each row execute function public.tg_broadcast_deposit();
create trigger broadcast_credits after insert or delete on public.credits
for each row execute function public.tg_broadcast_deposit();
create trigger broadcast_withdrawals after insert or delete on public.withdrawals
for each row execute function public.tg_broadcast_deposit();

-- Liquidar un mercado (solo admin): reemplaza lo acreditado antes (se puede volver a liquidar).
-- p_credits: [{user_id, username, kind: 'win'|'refund', amount_cents}]
create or replace function public.admin_settle_market(p_market uuid, p_outcome text, p_winner text, p_credits jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_match uuid;
  v_c jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo el organizador puede liquidar';
  end if;
  select match_id into v_match from markets where id = p_market;
  if v_match is null then
    raise exception 'Mercado no encontrado';
  end if;
  if p_outcome not in ('winners', 'refund', 'no_winner') then
    raise exception 'Resultado inválido';
  end if;
  delete from credits where market_id = p_market;
  insert into market_settlements (market_id, match_id, outcome, winner_selection, settled_at)
  values (p_market, v_match, p_outcome, p_winner, now())
  on conflict (market_id) do update set outcome = excluded.outcome, winner_selection = excluded.winner_selection, settled_at = now();
  for v_c in select value from jsonb_array_elements(coalesce(p_credits, '[]'::jsonb)) loop
    if (v_c ->> 'user_id') is null or coalesce((v_c ->> 'amount_cents')::int, 0) <= 0 then
      continue;
    end if;
    insert into credits (match_id, market_id, user_id, username, kind, amount_cents)
    values (v_match, p_market, (v_c ->> 'user_id')::uuid, coalesce(v_c ->> 'username', '¿?'), v_c ->> 'kind', (v_c ->> 'amount_cents')::int);
  end loop;
  -- Solo se reparte plata apostada: lo acreditado en la jornada no puede superar
  -- lo apostado (tickets en juego) más los pozos iniciales que puso el organizador.
  if (select coalesce(sum(amount_cents), 0) from credits where match_id = v_match)
     > (select coalesce(sum(total), 0) * 100 from tickets where match_id = v_match and status = 'approved')
       + (select coalesce(sum(initial_pot), 0) * 100 from markets where match_id = v_match) then
    raise exception 'Lo acreditado supera lo apostado en la jornada';
  end if;
end;
$$;

-- Saldos de todos (para devolverlos por Plin al final).
create or replace function public.admin_balances()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el organizador';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', p.id, 'username', p.username, 'balance', wallet_balance(p.id)) order by wallet_balance(p.id) desc, p.username)
    from profiles p
    where exists (select 1 from deposits d where d.user_id = p.id and d.status = 'approved')
       or exists (select 1 from credits c where c.user_id = p.id)
  ), '[]'::jsonb);
end;
$$;

-- El organizador le devolvió plata a alguien por Plin (no más que su saldo).
create or replace function public.admin_payout(p_user uuid, p_amount_cents int)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Solo el organizador';
  end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_user::text));
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Monto inválido';
  end if;
  if p_amount_cents > round(wallet_balance(p_user) * 100) then
    raise exception 'No puede retirar más que su saldo';
  end if;
  select username into v_name from profiles where id = p_user;
  insert into withdrawals (user_id, username, amount_cents) values (p_user, coalesce(v_name, '¿?'), p_amount_cents);
end;
$$;

-- Deshacer la liquidación (los saldos vuelven a como estaban).
create or replace function public.admin_unsettle_market(p_market uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el organizador puede liquidar';
  end if;
  delete from credits where market_id = p_market;
  delete from market_settlements where market_id = p_market;
end;
$$;

-- Ticket del usuario logueado, pagado con su saldo. Cada apuesta: {market_id, player_id | team_id | option, amount}.
create or replace function public.submit_ticket(p_code text, p_bets jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_match matches%rowtype;
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
  v_balance numeric;
  v_event text;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para apostar';
  end if;
  -- Un ticket a la vez por persona (evita gastar el mismo saldo dos veces).
  perform pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));
  select username into v_name from profiles where id = v_uid;
  if v_name is null then
    raise exception 'Tu cuenta no tiene usuario todavía';
  end if;
  select * into v_match from matches where access_code = upper(btrim(p_code)) for share;
  if not found then
    raise exception 'Jornada no encontrada';
  end if;
  if v_match.status <> 'open' then
    raise exception 'Las apuestas están cerradas';
  end if;
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' then
    raise exception 'Apuestas inválidas';
  end if;
  v_count := jsonb_array_length(p_bets);
  if v_count < 1 or v_count > 20 then
    raise exception 'Cada ticket debe tener entre 1 y 20 apuestas';
  end if;
  v_balance := wallet_balance(v_uid);

  -- Pagado con saldo: entra aprobado (el depósito ya lo aceptó el organizador).
  insert into tickets (match_id, bettor_name, total, receipt_path, status, user_id)
  values (v_match.id, v_name, 0, null, 'approved', v_uid)
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

    if exists (select 1 from market_settlements where market_id = v_market.id) then
      raise exception '% ya se liquidó', v_market.name;
    end if;

    -- ¿Sigue abierto? Por partido: hasta que termina (en vivo, "primer gol" solo mientras va 0-0).
    -- De toda la liga: solo antes de que empiece el primer partido.
    if v_market.type like 'game\_%' then
      if v_market.param < v_match.current_game then
        raise exception '% ya terminó', v_market.name;
      end if;
      -- En vivo, los "primer…" y "¿habrá…?" se cierran apenas pasa ese evento.
      v_event := case v_market.type
        when 'game_first_goal' then 'goal'
        when 'game_first_own_goal' then 'own_goal'
        when 'game_first_yellow' then 'yellow'
        when 'game_first_red' then 'red'
        when 'game_first_post' then 'post'
        when 'game_first_golazo' then 'golazo'
        when 'game_first_penalty' then 'penalty'
        when 'game_first_penalty_miss' then 'penalty_miss'
        when 'game_first_blooper' then 'blooper'
        when 'game_first_dive' then 'dive'
        when 'game_first_nutmeg' then 'nutmeg'
        when 'game_has_post' then 'post'
        when 'game_has_penalty' then 'penalty'
        when 'game_has_red' then 'red'
        when 'game_has_golazo' then 'golazo'
        when 'game_has_own_goal' then 'own_goal'
        else null end;
      if v_event is not null and v_market.param = v_match.current_game and v_match.game_live
         and exists (
           select 1 from events
           where match_id = v_match.id and game = v_market.param
             and ((v_event = 'own_goal' and type = 'goal' and is_own_goal) or (v_event <> 'own_goal' and type = v_event))
         ) then
        raise exception '% ya pasó', v_market.name;
      end if;
    elsif v_match.current_game > 1 or v_match.game_live then
      raise exception 'La liga ya empezó: % ya no recibe apuestas', v_market.name;
    end if;

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

  if v_total > v_balance then
    raise exception 'Saldo insuficiente: tienes S/ % y el ticket es de S/ %. Recarga por Plin', to_char(greatest(v_balance, 0), 'FM999990.00'), v_total;
  end if;
  update tickets set total = v_total where id = v_ticket;
  return v_ticket;
exception
  when unique_violation then
    raise exception 'Hay dos apuestas iguales en el mismo mercado';
end;
$$;

-- Mis tickets en una jornada (estado, motivo de rechazo y apuestas).
create or replace function public.get_my_tickets(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'total', t.total, 'status', t.status, 'reject_reason', t.reject_reason, 'created_at', t.created_at,
    'bets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'market_id', b.market_id, 'player_id', b.player_id, 'team_id', b.team_id,
        'option_value', b.option_value, 'amount', b.amount
      ) order by b.id)
      from bets b where b.ticket_id = t.id
    ), '[]'::jsonb)
  ) order by t.created_at desc), '[]'::jsonb)
  from tickets t
  join matches m on m.id = t.match_id
  where m.access_code = upper(btrim(p_code)) and t.user_id = auth.uid() and auth.uid() is not null;
$$;

-- -----------------------------------------------------------------------------
-- 5. Social: chat por jornada
-- -----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  username text not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_match_idx on public.messages (match_id, created_at desc);

alter table public.messages enable row level security;
grant select, insert, update, delete on public.messages to authenticated;
-- Solo el admin toca la tabla directo (moderar). El resto usa las RPC.
create policy messages_admin on public.messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.get_messages(p_code text, p_limit int default 150)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'user_id', x.user_id, 'username', x.username, 'body', x.body, 'created_at', x.created_at
  ) order by x.created_at, x.id), '[]'::jsonb)
  from (
    select g.* from messages g
    join matches m on m.id = g.match_id
    where m.access_code = upper(btrim(p_code)) and auth.uid() is not null
    order by g.created_at desc
    limit least(greatest(coalesce(p_limit, 150), 1), 300)
  ) x;
$$;

create or replace function public.post_message(p_code text, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_match uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para escribir';
  end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null then
    raise exception 'Tu cuenta no tiene usuario todavía';
  end if;
  select id into v_match from matches where access_code = upper(btrim(p_code));
  if v_match is null then
    raise exception 'Jornada no encontrada';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'El mensaje debe tener de 1 a 500 caracteres';
  end if;
  -- Anti-spam: máximo 6 mensajes cada 15 segundos por persona.
  if (select count(*) from messages where user_id = v_uid and created_at > now() - interval '15 seconds') >= 6 then
    raise exception 'Vas muy rápido, espera unos segundos';
  end if;
  insert into messages (match_id, user_id, username, body) values (v_match, v_uid, v_name, v_body) returning id into v_id;
  return v_id;
end;
$$;

-- Realtime: aviso en el canal `chat:<CODIGO>` (aparte del de la jornada).
create or replace function public.tg_broadcast_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record := coalesce(new, old);
  v_code text;
begin
  select access_code into v_code from matches where id = v_row.match_id;
  if v_code is not null then
    begin
      perform realtime.send(jsonb_build_object('op', tg_op), 'chat', 'chat:' || v_code, false);
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_broadcast_chat() from public, anon, authenticated;

create trigger broadcast_messages after insert or delete on public.messages
for each row execute function public.tg_broadcast_chat();

-- -----------------------------------------------------------------------------
-- 5b. Jornada activa: la más reciente que no terminó (la app abre directo en ella)
-- -----------------------------------------------------------------------------
create or replace function public.get_active_match_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access_code from matches where status <> 'finished' order by created_at desc limit 1;
$$;
revoke execute on function public.get_active_match_code() from public;
grant execute on function public.get_active_match_code() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Permisos de las RPC
-- -----------------------------------------------------------------------------
revoke execute on function public.submit_ticket(text, jsonb) from public, anon;
revoke execute on function public.get_wallet() from public, anon;
revoke execute on function public.request_deposit(int, text) from public, anon;
revoke execute on function public.get_my_tickets(text) from public, anon;
revoke execute on function public.get_messages(text, int) from public, anon;
revoke execute on function public.post_message(text, text) from public, anon;
revoke execute on function public.username_available(text) from public;
grant execute on function public.submit_ticket(text, jsonb) to authenticated;
grant execute on function public.get_wallet() to authenticated;
revoke execute on function public.admin_settle_market(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.admin_unsettle_market(uuid) from public, anon;
grant execute on function public.admin_settle_market(uuid, text, text, jsonb) to authenticated;
grant execute on function public.admin_unsettle_market(uuid) to authenticated;
revoke execute on function public.admin_balances() from public, anon;
revoke execute on function public.admin_payout(uuid, int) from public, anon;
grant execute on function public.admin_balances() to authenticated;
grant execute on function public.admin_payout(uuid, int) to authenticated;
grant execute on function public.request_deposit(int, text) to authenticated;
grant execute on function public.get_my_tickets(text) to authenticated;
grant execute on function public.get_messages(text, int) to authenticated;
grant execute on function public.post_message(text, text) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
