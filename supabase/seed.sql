-- =============================================================================
-- Datos de prueba: Copa Álvaro EN VIVO con código DEMO26 (liga de 4 equipos).
-- Link para apostar en local: http://localhost:4200/p/DEMO26
-- Se puede correr varias veces: borra la jornada demo y la vuelve a crear.
-- El número de pago es de mentira: cámbialo en el admin (pestaña Datos).
--
-- Partido 1: Equipo 1 2-1 Equipo 2 · Partido 2: Equipo 3 1-0 Equipo 4
-- Partido 3 (en juego): Equipo 1 vs Equipo 3
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
  e1 uuid; e2 uuid; e3 uuid; e4 uuid;
begin
  -- La jornada trae sola los 4 equipos, los 20 jugadores y todos los mercados.
  insert into public.matches (title, starts_at, access_code, status, pay_method, pay_number, pay_holder)
  values ('Copa Álvaro · En vivo', now() - interval '2 hours', 'DEMO26', 'open', 'Plin', '999 888 777', 'Alvaro Fabrizzio Salazar')
  returning id into m;

  e1 := pg_temp.tid(m, 'Equipo 1');
  e2 := pg_temp.tid(m, 'Equipo 2');
  e3 := pg_temp.tid(m, 'Equipo 3');
  e4 := pg_temp.tid(m, 'Equipo 4');

  -- ---------------- Apuestas (antes de cerrar) ----------------
  -- Ana
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Ana', 0, 'approved', now() - interval '3 hours') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Primer gol de la noche'), pg_temp.pid(m, 'Victor Manuel Espino'), null, null, 4),
    (t, pg_temp.mid(m, 'Campeón de la liga'), null, e1, null, 3),
    (t, pg_temp.mid(m, 'Primera amarilla'), pg_temp.pid(m, 'Diego Guevara'), null, null, 2),
    (t, pg_temp.mid(m, 'Ganador · Equipo 1 vs Equipo 2'), null, null, 1, 2);
  -- Luis
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Luis', 0, 'approved', now() - interval '170 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Primer gol de la noche'), pg_temp.pid(m, 'Adrian Ruiz'), null, null, 2),
    (t, pg_temp.mid(m, 'Pichichi de la noche'), pg_temp.pid(m, 'Victor Manuel Espino'), null, null, 5),
    (t, pg_temp.mid(m, 'Equipo más goleado'), null, e4, null, 3),
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
    (t, pg_temp.mid(m, 'Campeón de la liga'), null, e2, null, 5),
    (t, pg_temp.mid(m, 'Primer gol · Equipo 3 vs Equipo 4'), pg_temp.pid(m, 'David Málaga'), null, null, 3),
    (t, pg_temp.mid(m, 'El más amonestado'), pg_temp.pid(m, 'Diego Guevara'), null, null, 2),
    (t, pg_temp.mid(m, 'Última amarilla'), pg_temp.pid(m, 'Manuel Tumi'), null, null, 1),
    (t, pg_temp.mid(m, 'Primer sextete'), pg_temp.pid(m, 'Adrian Ruiz'), null, null, 1),
    (t, pg_temp.mid(m, 'Gol número 28'), pg_temp.pid(m, 'David Málaga'), null, null, 1);
  -- Carla (pendiente: no cuenta)
  insert into public.tickets (match_id, bettor_name, total, status, created_at)
  values (m, 'Carla', 0, 'pending', now() - interval '140 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Primer gol de la noche'), pg_temp.pid(m, 'Paul Espinoza'), null, null, 5);
  -- Dani (anulado: no cuenta)
  insert into public.tickets (match_id, bettor_name, total, status, reject_reason, created_at)
  values (m, 'Dani', 0, 'rejected', 'Apuesta repetida', now() - interval '135 minutes') returning id into t;
  insert into public.bets (ticket_id, market_id, player_id, team_id, option_value, amount) values
    (t, pg_temp.mid(m, 'Campeón de la liga'), null, e3, null, 5);

  update public.tickets tk set total = (select sum(amount) from public.bets where ticket_id = tk.id) where match_id = m;

  -- ---------------- Se cierra y arranca la liga ----------------
  update public.matches set status = 'closed', closed_at = now() - interval '90 minutes', current_game = 3 where id = m;

  insert into public.events (match_id, type, player_id, team_id, is_own_goal, team_out_id, minute, game) values
    (m, 'goal',   pg_temp.pid(m, 'Victor Manuel Espino'), e1,   false, null, 5,  1),
    (m, 'golazo', pg_temp.pid(m, 'Victor Manuel Espino'), null, false, null, 5,  1),
    (m, 'yellow', pg_temp.pid(m, 'Diego Guevara'),        null, false, null, 8,  1),
    (m, 'goal',   pg_temp.pid(m, 'Adrian Ruiz'),          e1,   false, null, 12, 1),
    (m, 'goal',   pg_temp.pid(m, 'Nestor Rojas'),         e2,   true,  null, 20, 1),  -- autogol: gol para Equipo 2
    (m, 'post',   pg_temp.pid(m, 'Adrian Ruiz'),          null, false, null, 24, 2),
    (m, 'goal',   pg_temp.pid(m, 'David Málaga'),         e3,   false, null, 31, 2),
    (m, 'nutmeg', pg_temp.pid(m, 'Paul Espinoza'),        null, false, null, 36, 2),
    (m, 'yellow', pg_temp.pid(m, 'Diego Guevara'),        null, false, null, 44, 3),
    (m, 'yellow', pg_temp.pid(m, 'Manuel Tumi'),          null, false, null, 47, 3);
end $$;
