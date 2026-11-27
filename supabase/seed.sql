-- =============================================================================
-- Datos de prueba: una jornada de triangulares EN VIVO con código DEMO26.
-- Link para apostar en local: http://localhost:4200/p/DEMO26
-- Se puede correr varias veces: borra la jornada demo y la vuelve a crear.
-- El número de pago es de mentira: cámbialo en el admin (pestaña Datos).
-- =============================================================================

delete from public.matches where access_code = 'DEMO26';

-- Helpers temporales (solo existen durante esta sesión)
create or replace function pg_temp.pid(m uuid, n text) returns uuid language sql as
$$ select id from public.players where match_id = m and name = n $$;
create or replace function pg_temp.tid(m uuid, n text) returns uuid language sql as
$$ select id from public.teams where match_id = m and name = n $$;
create or replace function pg_temp.mid(m uuid, n text) returns uuid language sql as
$$ select id from public.markets where match_id = m and name = n $$;

do $$
declare
  m uuid;
  t uuid;
  a uuid; b uuid; c uuid;
  names text[] := array[
    'Victor Manuel Espino', 'Oscar Fernando Vara', 'Mate Italo Loechle', 'Angel Jose Pariona',
    'Alexis Encalada', 'Adrian Ruiz', 'Iker Gabriel Barturen', 'Braden García',
    'Victor Nicolas Ortiz', 'Diego Guevara', 'Nestor Rojas', 'Paul Espinoza',
    'Fabian Jesus Sandoval', 'Manuel Tumi', 'Bryan Eduardo Barba', 'David Málaga',
    'Lorenzo Balicco', 'Andreow Jomark Santiago', 'David Ignacio Vivar', 'Alvaro Fabrizzio Salazar'
  ];
begin
  insert into public.matches (title, starts_at, access_code, status, pay_method, pay_number, pay_holder)
  values ('Pichanga de prueba', now() - interval '2 hours', 'DEMO26', 'open', 'Plin', '999 888 777', 'Organizador Demo')
  returning id into m;

  -- La jornada ya trae los 20 jugadores por defecto; solo agrega los que falten.
  for i in 1 .. array_length(names, 1) loop
    insert into public.players (match_id, name, sort_order)
    select m, names[i], i where not exists (select 1 from public.players where match_id = m and name = names[i]);
  end loop;

  a := pg_temp.tid(m, 'Equipo 1');
  b := pg_temp.tid(m, 'Equipo 2');
  c := pg_temp.tid(m, 'Equipo 3');

  -- ---------------- Apuestas (antes de cerrar) ----------------
  -- Ana
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Ana', 0, 'approved', now() - interval '3 hours') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Primer gol de la noche'), pg_temp.pid(m, 'Victor Manuel Espino'), null, null, 4),
    (t, pg_temp.mid(m, 'Rey de la cancha'), null, a, null, 3),
    (t, pg_temp.mid(m, 'Primera amarilla'), pg_temp.pid(m, 'Diego Guevara'), null, null, 2),
    (t, pg_temp.mid(m, 'Racha más larga'), null, null, 3, 2);
  -- Luis
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Luis', 0, 'approved', now() - interval '170 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Primer gol de la noche'), pg_temp.pid(m, 'Adrian Ruiz'), null, null, 2),
    (t, pg_temp.mid(m, 'Pichichi de la noche'), pg_temp.pid(m, 'Victor Manuel Espino'), null, null, 5),
    (t, pg_temp.mid(m, 'Equipo que más sale'), null, c, null, 3),
    (t, pg_temp.mid(m, 'Primer autogol'), pg_temp.pid(m, 'Nestor Rojas'), null, null, 1);
  -- Rosa
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Rosa', 0, 'approved', now() - interval '160 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Último gol de la noche'), pg_temp.pid(m, 'David Málaga'), null, null, 3),
    (t, pg_temp.mid(m, 'Primer cuartete'), pg_temp.pid(m, 'Victor Manuel Espino'), null, null, 2),
    (t, pg_temp.mid(m, 'Gol número 15'), pg_temp.pid(m, 'Autogol'), null, null, 1),
    (t, pg_temp.mid(m, 'Primera huacha'), pg_temp.pid(m, 'Paul Espinoza'), null, null, 4);
  -- Beto
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Beto', 0, 'approved', now() - interval '150 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Rey de la cancha'), null, b, null, 5),
    (t, pg_temp.mid(m, 'Racha más larga'), null, null, 2, 3),
    (t, pg_temp.mid(m, 'El más amonestado'), pg_temp.pid(m, 'Diego Guevara'), null, null, 2),
    (t, pg_temp.mid(m, 'Última amarilla'), pg_temp.pid(m, 'Manuel Tumi'), null, null, 1),
    (t, pg_temp.mid(m, 'Primer sextete'), pg_temp.pid(m, 'Adrian Ruiz'), null, null, 1),
    (t, pg_temp.mid(m, 'Gol número 28'), pg_temp.pid(m, 'David Málaga'), null, null, 1);
  -- Carla (pendiente: no cuenta)
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Carla', 0, 'pending', now() - interval '140 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Primer gol de la noche'), pg_temp.pid(m, 'Paul Espinoza'), null, null, 5);
  -- Dani (rechazado: no cuenta)
  insert into public.tickets (match_id, bettor_name, total, status, reject_reason, created_at)
  values (m, 'Dani', 0, 'rejected', 'No llegó el Plin', now() - interval '135 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Rey de la cancha'), null, c, null, 5);

  update public.tickets tk set total = (select sum(amount) from public.bets where ticket_id = tk.id) where match_id = m;

  -- ---------------- Se cierra y arranca la jornada (A vs B, C espera) ----------------
  update public.matches set status = 'closed', closed_at = now() - interval '90 minutes', starting_team_ids = array[a, b] where id = m;

  insert into public.events (match_id, type, player_id, team_id, is_own_goal, team_out_id, minute) values
    (m, 'goal',     pg_temp.pid(m, 'Victor Manuel Espino'), a, false, null, 5),   -- A gana, sale B, entra C
    (m, 'yellow',   pg_temp.pid(m, 'Diego Guevara'),        null, false, null, 8),
    (m, 'goal',     pg_temp.pid(m, 'Adrian Ruiz'),          a, false, null, 12),  -- A gana, sale C, entra B
    (m, 'nutmeg',   pg_temp.pid(m, 'Paul Espinoza'),        null, false, null, 15),
    (m, 'goal',     pg_temp.pid(m, 'Nestor Rojas'),         b, true,  null, 20),  -- autogol: gol para B, sale A, entra C
    (m, 'goal',     pg_temp.pid(m, 'Victor Manuel Espino'), b, false, null, 26),  -- B gana, sale C, entra A
    (m, 'yellow',   pg_temp.pid(m, 'Diego Guevara'),        null, false, null, 30),
    (m, 'rotation', null,                                   null, false, b,    35),  -- rotación: sale B, entra C
    (m, 'goal',     pg_temp.pid(m, 'David Málaga'),         c, false, null, 41),  -- C gana, sale A, entra B
    (m, 'yellow',   pg_temp.pid(m, 'Manuel Tumi'),          null, false, null, 44);
end $$;
