-- =============================================================================
-- Datos de prueba: un partido de ejemplo con código DEMO26
-- Link para apostar en local: http://localhost:4200/p/DEMO26
-- Se puede correr varias veces: borra el partido demo y lo vuelve a crear.
-- =============================================================================

delete from public.matches where access_code = 'DEMO26';

do $$
declare
  v_match uuid;
  v_fg uuid; v_lg uuid; v_fy uuid;
  v_t uuid;
  p record;
  i int := 0;
begin
  insert into public.matches (home_team, away_team, starts_at, access_code, status, yape_number, yape_holder)
  values ('Los Tigres', 'Las Águilas', now() + interval '2 hours', 'DEMO26', 'open', '999 888 777', 'Organizador Demo')
  returning id into v_match;

  -- Jugadores (el "Autogol" lo crea el trigger)
  for p in
    select * from (values
      ('home', 'Pepito Ramírez'), ('home', 'Juanito Torres'), ('home', 'Fulanito Díaz'),
      ('home', 'Carlos Medina'),  ('home', 'Raúl Paredes'),   ('home', 'Mario Quispe'),
      ('away', 'Diego Salas'),    ('away', 'Andrés Rojas'),   ('away', 'Hugo Vargas'),
      ('away', 'Kevin Flores'),   ('away', 'Óscar Huamán'),   ('away', 'Bruno Chávez')
    ) as t(team, name)
  loop
    i := i + 1;
    insert into public.players (match_id, name, team, sort_order) values (v_match, p.name, p.team, i);
  end loop;

  select id into v_fg from public.markets where match_id = v_match and type = 'first_goal';
  select id into v_lg from public.markets where match_id = v_match and type = 'last_goal';
  select id into v_fy from public.markets where match_id = v_match and type = 'first_yellow';

  -- Tickets aprobados
  insert into public.tickets (match_id, bettor_name, total, status) values (v_match, 'Ana', 6, 'approved') returning id into v_t;
  insert into public.bets (ticket_id, market_id, player_id, amount)
  select v_t, v_fg, id, 4 from public.players where match_id = v_match and name = 'Pepito Ramírez'
  union all
  select v_t, v_fy, id, 2 from public.players where match_id = v_match and name = 'Hugo Vargas';

  insert into public.tickets (match_id, bettor_name, total, status) values (v_match, 'Luis', 2, 'approved') returning id into v_t;
  insert into public.bets (ticket_id, market_id, player_id, amount)
  select v_t, v_fg, id, 2 from public.players where match_id = v_match and name = 'Juanito Torres';

  insert into public.tickets (match_id, bettor_name, total, status) values (v_match, 'Rosa', 3, 'approved') returning id into v_t;
  insert into public.bets (ticket_id, market_id, player_id, amount)
  select v_t, v_lg, id, 3 from public.players where match_id = v_match and name = 'Fulanito Díaz';

  insert into public.tickets (match_id, bettor_name, total, status) values (v_match, 'Beto', 4, 'approved') returning id into v_t;
  insert into public.bets (ticket_id, market_id, player_id, amount)
  select v_t, v_lg, id, 1 from public.players where match_id = v_match and name = 'Fulanito Díaz'
  union all
  select v_t, v_fy, id, 3 from public.players where match_id = v_match and name = 'Diego Salas';

  -- Un ticket pendiente y uno rechazado (no cuentan para el bote)
  insert into public.tickets (match_id, bettor_name, total, status) values (v_match, 'Carla', 5, 'pending') returning id into v_t;
  insert into public.bets (ticket_id, market_id, player_id, amount)
  select v_t, v_lg, id, 5 from public.players where match_id = v_match and name = 'Diego Salas';

  insert into public.tickets (match_id, bettor_name, total, status, reject_reason)
  values (v_match, 'Dani', 5, 'rejected', 'No llegó el Yape') returning id into v_t;
  insert into public.bets (ticket_id, market_id, player_id, amount)
  select v_t, v_fg, id, 5 from public.players where match_id = v_match and name = 'Kevin Flores';
end $$;
