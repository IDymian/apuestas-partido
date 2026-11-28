-- =============================================================================
-- Formaciones 6v6, 3 modos y equipos dinámicos
--
--   * Plantel canónico: los 18 alias de la app (mock) en 3 equipos de 6 (Equipo 1,
--     Equipo 2 e Equipo 3, con su camiseta en `kit_id`), con su
--     lugar en Modo 1 y Modo 2. El 4º equipo (o más) se crea desde el admin.
--   * `matches.games`: lista de partidos { number, home, away, mode }. Los 6 base
--     (3 de Modo 1 + 3 de Modo 2) se crean con la jornada; el resto, con admin_add_game.
--   * Jugador: equipo, dorsal, posición, slot, modos, foto y disfraz.
--   * fixture_pair para N equipos (y para los partidos de `games`).
--   * get_public_match con todo lo que dibuja la cancha.
-- =============================================================================

set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Columnas
-- -----------------------------------------------------------------------------
alter table public.teams
  add column if not exists formation text default '2-2-1',
  add column if not exists kit_id text;

alter table public.matches
  add column if not exists games jsonb;

alter table public.players
  add column if not exists team_id uuid references public.teams (id) on delete set null,
  add column if not exists shirt_number int,
  add column if not exists position text,
  add column if not exists slot int,
  add column if not exists modes jsonb,
  add column if not exists photo_id text,
  add column if not exists costume_id text;

alter table public.players drop constraint if exists players_position_check;
alter table public.players add constraint players_position_check
  check (position is null or position in ('GK', 'DEF', 'MID', 'FWD'));

-- Nadie queda en un equipo de otro partido.
create or replace function public.tg_player_team_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is not null and not exists (
    select 1 from teams where id = new.team_id and match_id = new.match_id
  ) then
    raise exception 'Ese equipo no pertenece al partido';
  end if;
  return new;
end $$;
revoke execute on function public.tg_player_team_check() from public, anon, authenticated;

drop trigger if exists players_team_check on public.players;
create trigger players_team_check
  before insert or update of team_id on public.players
  for each row execute function public.tg_player_team_check();

-- -----------------------------------------------------------------------------
-- 2. Partidos: pares para N equipos y mercados por partido
-- -----------------------------------------------------------------------------

-- Equipos del partido N. Si la jornada tiene `games`, sale de ahí; si no, del
-- fixture automático, igual que fixture() en league.ts: con 4 equipos el orden
-- fijo de siempre, con otro número todos contra todos (pares i < j por sort_order).
create or replace function public.fixture_pair(p_match uuid, p_game int)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_games jsonb;
  v_ids uuid[];
  v_n int;
  v_fx4 int[] := '{{1,2},{3,4},{1,3},{2,4},{1,4},{2,3}}';
  k int := 0;
begin
  select games into v_games from matches where id = p_match;
  if jsonb_typeof(v_games) = 'array' and jsonb_array_length(v_games) > 0 then
    return (select array[(x ->> 'home')::uuid, (x ->> 'away')::uuid]
            from jsonb_array_elements(v_games) x where (x ->> 'number')::int = p_game limit 1);
  end if;

  select array_agg(id order by sort_order, name) into v_ids from teams where match_id = p_match;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 4 then
    if p_game between 1 and 6 then return array[v_ids[v_fx4[p_game][1]], v_ids[v_fx4[p_game][2]]]; end if;
    return null;
  end if;
  for i in 1 .. v_n loop
    for j in i + 1 .. v_n loop
      k := k + 1;
      if k = p_game then return array[v_ids[i], v_ids[j]]; end if;
    end loop;
  end loop;
  return null;
end;
$$;
revoke execute on function public.fixture_pair(uuid, int) from public, anon, authenticated;

-- Los 19 mercados de un partido (mismos nombres que el mock: "Ganador · M1 · Equipo 1 vs Equipo 2").
create or replace function public.copa_game_markets(p_match uuid, p_game int, p_home uuid, p_away uuid, p_mode int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vs text;
begin
  v_vs := 'M' || p_mode || ' · '
       || coalesce((select name from teams where id = p_home), 'Equipo A') || ' vs '
       || coalesce((select name from teams where id = p_away), 'Equipo B');
  insert into markets (match_id, name, type, param, sort_order)
  select p_match, x.label || ' · ' || v_vs, x.type, p_game, 100 + p_game * 30 + x.ord
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
  where not exists (select 1 from markets k where k.match_id = p_match and k.type = x.type and k.param = p_game);
end;
$$;
revoke execute on function public.copa_game_markets(uuid, int, uuid, uuid, int) from public, anon, authenticated;

-- Mercados de liga y show, y los de cada partido de `games` (ya no depende de 4 equipos).
create or replace function public.copa_extra_markets(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g jsonb;
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

  for g in select jsonb_array_elements(coalesce(games, '[]'::jsonb)) from matches where id = p_match loop
    perform copa_game_markets(p_match, (g ->> 'number')::int, (g ->> 'home')::uuid, (g ->> 'away')::uuid,
                              coalesce((g ->> 'mode')::int, 1));
  end loop;
end;
$$;
revoke execute on function public.copa_extra_markets(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Jornada por defecto: 3 equipos, los 18 alias y los 6 partidos base
-- -----------------------------------------------------------------------------
create or replace function public.tg_match_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t uuid[];
begin
  -- Mismos equipos, kits y colores que el mock (DEFAULT_TEAM_KITS en src/app/core/kits.ts).
  -- Los Camotito (kit 'u') y cualquier otro se crean desde el admin.
  with ins as (
    insert into teams (match_id, name, sort_order, color, formation, kit_id) values
      (new.id, 'Equipo 1', 1, '#004d98', '2-2-1', 'barca'),
      (new.id, 'Equipo 2', 2, '#111827', '2-2-1', 'madrid'),
      (new.id, 'Equipo 3', 3, '#1e3a8a', '2-2-1', 'alianza')
    returning id, sort_order
  )
  select array_agg(id order by sort_order) into v_t from ins;

  update matches set
    starting_team_ids = coalesce(starting_team_ids, array[v_t[1], v_t[2]]),
    games = coalesce(games, jsonb_build_array(
      jsonb_build_object('number', 1, 'home', v_t[1], 'away', v_t[2], 'mode', 1),
      jsonb_build_object('number', 2, 'home', v_t[1], 'away', v_t[3], 'mode', 1),
      jsonb_build_object('number', 3, 'home', v_t[2], 'away', v_t[3], 'mode', 1),
      jsonb_build_object('number', 4, 'home', v_t[1], 'away', v_t[2], 'mode', 2),
      jsonb_build_object('number', 5, 'home', v_t[1], 'away', v_t[3], 'mode', 2),
      jsonb_build_object('number', 6, 'home', v_t[2], 'away', v_t[3], 'mode', 2)
    ))
  where id = new.id;

  insert into players (match_id, name, is_own_goal, sort_order) values (new.id, 'Autogol', true, 9999);

  -- Plantel canónico = DEFAULT_ROSTER de src/app/core/mock-backend.ts (mismo orden).
  insert into players (match_id, name, sort_order, team_id, shirt_number, position, slot, modes)
  select new.id, r.name, r.ord, v_t[r.t1], r.n1, r.p1, r.s1,
         jsonb_build_object(
           '1', jsonb_build_object('team_id', v_t[r.t1], 'shirt_number', r.n1, 'position', r.p1, 'slot', r.s1),
           '2', jsonb_build_object('team_id', v_t[r.t2], 'shirt_number', r.n2, 'position', r.p2, 'slot', r.s2))
  from (values
    (1,  'Krul',          1, 1,  'GK',  0, 3, 5,  'DEF', 1),
    (2,  'Manuel',        1, 4,  'DEF', 0, 3, 4,  'DEF', 0),
    (3,  'David Vivar',   1, 5,  'DEF', 1, 2, 3,  'DEF', 0),
    (4,  'Fabian',        1, 8,  'MID', 0, 2, 8,  'MID', 0),
    (5,  'Alexis',        1, 10, 'MID', 1, 2, 10, 'FWD', 0),
    (6,  'Nicolas',       1, 9,  'FWD', 0, 3, 9,  'FWD', 0),
    (7,  'Balicco',       2, 1,  'GK',  0, 2, 6,  'DEF', 1),
    (8,  'Braden',        2, 3,  'DEF', 0, 1, 1,  'GK',  0),
    (9,  'Victor',        2, 6,  'DEF', 1, 1, 4,  'DEF', 0),
    (10, 'Iker',          2, 7,  'MID', 0, 3, 7,  'MID', 1),
    (11, 'Angel',         2, 11, 'MID', 1, 1, 8,  'MID', 0),
    (12, 'Álvaro',        2, 10, 'FWD', 0, 1, 10, 'FWD', 0),
    (13, 'David Arquero', 3, 1,  'GK',  0, 3, 1,  'GK',  0),
    (14, 'Adrix',         3, 2,  'DEF', 0, 2, 1,  'GK',  0),
    (15, 'Oscar',         3, 4,  'DEF', 1, 1, 5,  'DEF', 1),
    (16, 'Digetto',       3, 8,  'MID', 0, 3, 8,  'MID', 0),
    (17, 'Andreow',       3, 11, 'MID', 1, 2, 11, 'MID', 1),
    (18, 'Bryan',         3, 9,  'FWD', 0, 1, 9,  'MID', 1)
  ) as r(ord, name, t1, n1, p1, s1, t2, n2, p2, s2);

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

-- -----------------------------------------------------------------------------
-- 4. RPC del admin: crear partido y crear equipo
-- -----------------------------------------------------------------------------

-- Agrega el siguiente partido. Si no arranca en vivo, `current_game` no se toca:
-- moverlo marcaría como jugados todos los partidos anteriores.
create or replace function public.admin_add_game(
  p_match uuid, p_home uuid, p_away uuid, p_live boolean default false, p_mode int default 1
) returns int
language plpgsql security definer set search_path = public as $$
declare v_list jsonb; v_next int; v_status text;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_home = p_away then raise exception 'Elige dos equipos distintos'; end if;
  if p_mode not between 1 and 3 then raise exception 'Modo inválido'; end if;
  if not exists (select 1 from teams where id = p_home and match_id = p_match)
     or not exists (select 1 from teams where id = p_away and match_id = p_match) then
    raise exception 'Los equipos tienen que ser del partido';
  end if;

  select coalesce(games, '[]'::jsonb), status into v_list, v_status from matches where id = p_match for update;
  if v_status is null then raise exception 'Jornada no encontrada'; end if;
  if v_status = 'finished' then raise exception 'La jornada ya terminó'; end if;
  v_next := coalesce((select max((x ->> 'number')::int) from jsonb_array_elements(v_list) x), 0) + 1;
  if v_next > 20 then raise exception 'Máximo 20 partidos por jornada'; end if;
  v_list := v_list || jsonb_build_object('number', v_next, 'home', p_home, 'away', p_away, 'mode', p_mode);

  update matches
     set games = v_list,
         current_game = case when p_live then v_next else current_game end,
         game_live = case when p_live then true else game_live end
   where id = p_match;

  perform copa_game_markets(p_match, v_next, p_home, p_away, p_mode);
  return v_next;
end $$;
revoke execute on function public.admin_add_game(uuid, uuid, uuid, boolean, int) from public, anon;
grant execute on function public.admin_add_game(uuid, uuid, uuid, boolean, int) to authenticated;

create or replace function public.admin_add_team(
  p_match uuid, p_name text, p_color text default '#64748b', p_kit text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'El equipo necesita nombre'; end if;
  if not exists (select 1 from matches where id = p_match) then raise exception 'Jornada no encontrada'; end if;
  if p_kit is not null and p_kit !~ '^[a-z0-9-]{1,30}$' then raise exception 'Camiseta inválida'; end if;

  insert into teams (match_id, name, sort_order, color, kit_id)
  values (p_match, btrim(p_name),
          coalesce((select max(sort_order) from teams where match_id = p_match), 0) + 1,
          coalesce(nullif(btrim(p_color), ''), '#64748b'), p_kit)
  returning id into v_id;

  return v_id;
end $$;
revoke execute on function public.admin_add_team(uuid, text, text, text) from public, anon;
grant execute on function public.admin_add_team(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Lo público: partidos, formación y lugar de cada jugador
-- -----------------------------------------------------------------------------
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
      'games', coalesce(to_jsonb(m.games), '[]'::jsonb),
      'pay_method', m.pay_method, 'pay_number', m.pay_number, 'pay_holder', m.pay_holder, 'pay_qr_path', m.pay_qr_path
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'sort_order', t.sort_order, 'color', t.color,
        'formation', t.formation, 'kit_id', t.kit_id
      ) order by t.sort_order, t.name)
      from teams t where t.match_id = m.id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'is_own_goal', p.is_own_goal, 'sort_order', p.sort_order,
        'team_id', p.team_id, 'shirt_number', p.shirt_number, 'position', p.position, 'slot', p.slot,
        'modes', coalesce(p.modes, '{}'::jsonb), 'photo_id', p.photo_id, 'costume_id', p.costume_id
      ) order by p.is_own_goal, p.sort_order, p.name)
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
grant execute on function public.get_public_match(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Fotos de jugadores (con su permiso): las sube el organizador
--    a `avatares/jugadores/<player_id>.webp`; `players.photo_id` guarda el player_id.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 102400, array['image/webp'])
on conflict (id) do nothing;

drop policy if exists avatares_admin_insert on storage.objects;
drop policy if exists avatares_admin_update on storage.objects;
drop policy if exists avatares_admin_delete on storage.objects;
create policy avatares_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'avatares' and public.is_admin());
create policy avatares_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'avatares' and public.is_admin());
create policy avatares_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'avatares' and public.is_admin());
