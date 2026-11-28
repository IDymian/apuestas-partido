// Prueba las migraciones y el seed en un Postgres embebido (PGlite) con stubs
// mínimos de Supabase (auth, storage, realtime). Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const db = new PGlite();

// --- Stubs mínimos de Supabase (sin permisos por defecto: la migración da los suyos) ---
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage; create schema realtime;
grant usage on schema auth, storage, realtime to anon, authenticated;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table realtime.log (topic text, payload jsonb);
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.log values (topic, payload) $$;
`);

for (const f of readdirSync(root + 'migrations').sort()) {
  await db.exec(readFileSync(root + 'migrations/' + f, 'utf8'));
  console.log('migración OK:', f);
}
await db.exec(readFileSync(root + 'seed.sql', 'utf8'));
await db.exec(readFileSync(root + 'seed.sql', 'utf8'));
console.log('seed OK (2 veces)');

const q = async (sql, params) => (await db.query(sql, params)).rows;
let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(ok ? 'ok   ' : 'FALLO', label, detail);
};
const expectErr = async (label, fn, pattern) => {
  try {
    await fn();
    fails++;
    console.log('FALLO (no lanzó):', label);
  } catch (e) {
    check(label, pattern.test(e.message), '→ ' + e.message);
  }
};

// --- Seed ---
const [seedMatch] = await q(`select id, status, closed_at from matches where access_code='PRUEBA'`);
const count = async (t) => (await q(`select count(*)::int c from ${t} where match_id=$1`, [seedMatch.id]))[0].c;
check('seed: 3 equipos', (await count('teams')) === 3);
check('seed: 19 jugadores (18 + Autogol)', (await count('players')) === 19);
check('seed: 138 mercados (24 de la jornada + 19 × 6 por partido)', (await count('markets')) === 138, `(${await count('markets')})`);
check('seed: partido en juego = 3', (await q(`select current_game from matches where id=$1`, [seedMatch.id]))[0].current_game === 3);
check('seed: 10 eventos', (await count('events')) === 10);
check('seed: jornada cerrada con closed_at', seedMatch.status === 'closed' && !!seedMatch.closed_at);

// --- Jornada abierta para probar submit_ticket ---
const [{ id: mid }] = await q(`insert into matches (title, access_code) values ('Test', 'TEST01') returning id`);
const teams = await q(`select id, name from teams where match_id=$1 order by sort_order`, [mid]);
const [m2] = await q(`select starting_team_ids from matches where id=$1`, [mid]);
check('defaults: Equipo 1, 2 y 3', teams.map((t) => t.name).join() === 'Equipo 1,Equipo 2,Equipo 3');
check('defaults: 18 jugadores + Autogol', (await q(`select count(*)::int c from players where match_id=$1`, [mid]))[0].c === 19);
check('defaults: arrancan A y B', m2.starting_team_ids.join() === [teams[0].id, teams[1].id].join());
await q(`insert into players (match_id, name, sort_order) values ($1,'Pepe',1), ($1,'Lucho',2)`, [mid]);
const pl = Object.fromEntries((await q(`select name, id from players where match_id=$1`, [mid])).map((r) => [r.name, r.id]));
const mk = Object.fromEntries((await q(`select name, id from markets where match_id=$1`, [mid])).map((r) => [r.name, r.id]));
const otherTeam = (await q(`select id from teams where match_id=$1 limit 1`, [seedMatch.id]))[0].id;

// --- Cuentas ---
const U1 = '00000000-0000-0000-0000-0000000000a1', U2 = '00000000-0000-0000-0000-0000000000a2', U3 = '00000000-0000-0000-0000-0000000000a3';
await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'pepe@x.pe', '{"username":"Pepe.Lucho"}')`, [U1]);
await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'otro@x.pe', '{"username":"pepe.lucho"}')`, [U2]);
await q(`insert into auth.users (id, email) values ($1, 'zz@x.pe')`, [U3]);
const prof = Object.fromEntries((await q(`select id, username from profiles`)).map((r) => [r.id, r.username]));
check('perfil con el usuario elegido', prof[U1] === 'Pepe.Lucho');
check('usuario repetido → se genera otro', !!prof[U2] && prof[U2].toLowerCase() !== 'pepe.lucho', `(${prof[U2]})`);
check('sin usuario → sale del correo', /^zz|^hincha/.test(prof[U3] ?? ''), `(${prof[U3]})`);

// --- Como anónimo ---
await db.exec(`set role anon`);
await expectErr('anon no sube capturas', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${mid}/r0.jpg`]), /row-level/);
check('anon no ve capturas', (await q(`select count(*)::int c from storage.objects`))[0].c === 0);
for (const t of ['tickets', 'bets', 'events', 'matches', 'teams', 'players', 'admins', 'public_bets', 'profiles', 'messages']) {
  await expectErr(`anon no lee ${t}`, () => q(`select * from ${t} limit 1`), /permission/);
}
check('anon lee market_types', (await q(`select count(*)::int c from market_types`))[0].c === 44);
check('username_available: libre', (await q(`select username_available('nuevo_hincha') ok`))[0].ok === true);
check('username_available: ocupado (sin importar mayúsculas)', (await q(`select username_available('PEPE.LUCHO') ok`))[0].ok === false);
check('username_available: inválido', (await q(`select username_available('a b') ok`))[0].ok === false);
await expectErr('anon no puede apostar', () => q(`select submit_ticket('TEST01', '[]'::jsonb)`), /permission/);
await expectErr('anon no recarga', () => q(`select request_deposit(10, 'x')`), /permission/);
await expectErr('anon no ve billetera', () => q(`select get_wallet()`), /permission/);
await expectErr('anon no lee deposits', () => q(`select * from deposits limit 1`), /permission/);
await expectErr('anon no lee el chat', () => q(`select get_messages('TEST01')`), /permission/);
await expectErr('anon no escribe en el chat', () => q(`select post_message('TEST01', 'hola')`), /permission/);
await expectErr('anon no inserta tickets directo', () => q(`insert into tickets (match_id, bettor_name, status) values ($1,'x','approved')`, [mid]), /permission/);

const pub = (await q(`select get_public_match('prueba') j`))[0].j;
check('público: jornada de prueba', pub.match.title === 'Copa Álvaro · En vivo' && pub.teams.length === 3 && pub.markets.length === 138 && pub.match.current_game === 3 && pub.events.every((e) => 'game' in e) && pub.events.length === 10);
check('público: solo apuestas aprobadas (18)', pub.bets.length === 18, `(${pub.bets.length})`);
check('público: sin rutas de captura', !JSON.stringify(pub).includes('receipt'));
check('público: Plin y titular', pub.match.pay_method === 'Plin');
check('código malo → null', (await q(`select get_public_match('NOPE') j`))[0].j === null);
check('jornada activa para abrir directo', typeof (await q(`select get_active_match_code() c`))[0].c === 'string');
await db.exec(`reset role`);

// --- Como usuario logueado ---
const asUser = async (uid) => db.exec(`reset role; set test.uid = '${uid}'; set role authenticated`);
const ADM = '00000000-0000-0000-0000-0000000000ad';
await q(`insert into auth.users (id, email) values ($1, 'organiza@x.pe')`, [ADM]);
await q(`insert into admins values ($1)`, [ADM]);
const wallet = async () => (await q(`select get_wallet() j`))[0].j;

// Billetera: recarga por Plin
await asUser(U1);
const dep = (n) => `deposits/${U1}/${n}.jpg`;
await db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [dep('d1')]);
await db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [dep('d2')]);
await expectErr('no sube capturas a la carpeta de otro', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`deposits/${U2}/x.jpg`]), /row-level/);
await expectErr('no sube capturas fuera de deposits/', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${mid}/r.jpg`]), /row-level/);
check('billetera nueva en S/ 0', Number((await wallet()).balance) === 0);

const submit = (bets) => q(`select submit_ticket('TEST01', $1::jsonb) id`, [JSON.stringify(bets)]);
await expectErr('sin saldo no se apuesta', () => submit([{ market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 1 }]), /Saldo insuficiente: tienes S\/ 0/);

const [{ id: d1 }] = await q(`select request_deposit(20, $1) id`, [dep('d1')]);
await expectErr('recarga con captura repetida', () => q(`select request_deposit(5, $1)`, [dep('d1')]), /ya fue usada/);
await expectErr('recarga sin captura subida', () => q(`select request_deposit(5, $1)`, [dep('nada')]), /No se encontró/);
await expectErr('recarga con captura de otro', () => q(`select request_deposit(5, $1)`, [`deposits/${U2}/x.jpg`]), /Falta la captura/);
await expectErr('recarga de S/ 0', () => q(`select request_deposit(0, $1)`, [dep('d2')]), /S\/ 1 a S\/ 500/);
await expectErr('usuario no se aprueba su recarga', () => q(`update deposits set status='approved'`).then((r) => { if (!r.length) throw new Error('0 filas (RLS)'); }), /RLS|0 filas/);
let w = await wallet();
check('recarga pendiente no suma saldo', Number(w.balance) === 0 && w.deposits.length === 1 && w.deposits[0].status === 'pending' && w.deposits[0].amount === 20);
check('broadcast de recarga al organizador', (await (async () => { await db.exec('reset role'); const c = (await q(`select count(*)::int c from realtime.log where topic='deposits'`))[0].c; await asUser(U1); return c; })()) > 0);

// El organizador acepta la recarga
await asUser(ADM);
check('organizador ve la recarga pendiente', (await q(`select count(*)::int c from deposits where status='pending'`))[0].c === 1);
await q(`update deposits set status='approved' where id=$1`, [d1]);
check('recarga aceptada guarda la fecha', !!(await q(`select reviewed_at from deposits where id=$1`, [d1]))[0].reviewed_at);
await asUser(U1);
check('saldo S/ 20 tras aceptar', Number((await wallet()).balance) === 20);

const ok = await submit([
  { market_id: mk['Primer gol de la noche'], player_id: pl['Autogol'], amount: 2 },
  { market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 3 },
  { market_id: mk['Ganador · M1 · Equipo 1 vs Equipo 2'], option: 0, amount: 1 },
]);
check('ticket con jugador, equipo y número', !!ok[0].id);
check('el ticket descuenta del saldo (20 − 6 = 14)', Number((await wallet()).balance) === 14);
await expectErr('jugador en mercado de equipo', () => submit([{ market_id: mk['Campeón de la liga'], player_id: pl['Pepe'], amount: 1 }]), /se apuesta a un equipo/);
await expectErr('equipo en mercado de jugador', () => submit([{ market_id: mk['Pichichi de la noche'], team_id: teams[0].id, amount: 1 }]), /se apuesta a un jugador/);
await expectErr('ganador: opción 3 fuera de 0–2', () => submit([{ market_id: mk['Ganador · M1 · Equipo 1 vs Equipo 2'], option: 3, amount: 1 }]), /va de 0 a 2/);
await expectErr('ganador: opción -1', () => submit([{ market_id: mk['Ganador · M1 · Equipo 1 vs Equipo 2'], option: -1, amount: 1 }]), /va de 0 a 2/);
check('mercados por partido creados con los nombres de los equipos', !!mk['Primer gol · M1 · Equipo 2 vs Equipo 3'] && !!mk['Ganador · M2 · Equipo 1 vs Equipo 3'] && !!mk['¿Habrá palo? · M2 · Equipo 2 vs Equipo 3'] && !!mk['Último gol · M1 · Equipo 1 vs Equipo 3']);
await expectErr('sí/no: opción 2 fuera de 0–1', () => submit([{ market_id: mk['¿Habrá penal? · M1 · Equipo 1 vs Equipo 2'], option: 2, amount: 1 }]), /va de 0 a 1/);
await expectErr('palos: 6 fuera de 0–5', () => submit([{ market_id: mk['¿Cuántos palos habrá?'], option: 6, amount: 1 }]), /va de 0 a 5/);
await expectErr('equipo de otra jornada', () => submit([{ market_id: mk['Campeón de la liga'], team_id: otherTeam, amount: 1 }]), /Equipo inválido/);
await expectErr('"Autogol" en Primer autogol', () => submit([{ market_id: mk['Primer autogol'], player_id: pl['Autogol'], amount: 1 }]), /Autogol/);
await expectErr('dos destinos a la vez', () => submit([{ market_id: mk['Campeón de la liga'], team_id: teams[0].id, player_id: pl['Pepe'], amount: 1 }]), /se apuesta a un equipo/);
await expectErr('monto 6', () => submit([{ market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 6 }]), /S\/ 1 a S\/ 5/);
await expectErr('apuesta repetida', () => submit([{ market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 1 }, { market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 2 }]), /iguales/);
await expectErr('21 apuestas', () => submit(Array.from({ length: 21 }, (_, i) => ({ market_id: mk['Primer gol de la noche'], player_id: pl['Pepe'], amount: 1 }))), /entre 1 y 20/);
const ok2 = await submit([
  { market_id: mk['¿Cuántos palos habrá?'], option: 0, amount: 2 },
  { market_id: mk['Primer golazo'], player_id: pl['Pepe'], amount: 1 },
  { market_id: mk['Campeón de la liga'], team_id: teams[1].id, amount: 1 },
]);
check('mercados de show (palos 0, golazo, mejor equipo)', !!ok2[0].id);
check('saldo 14 − 4 = 10', Number((await wallet()).balance) === 10);
await expectErr('ticket mayor al saldo', () => submit([
  { market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 5 },
  { market_id: mk['Campeón de la liga'], team_id: teams[1].id, amount: 5 },
  { market_id: mk['Campeón de la liga'], team_id: teams[2].id, amount: 1 },
]), /Saldo insuficiente: tienes S\/ 10(\.00)? y el ticket es de S\/ 11/);
check('un ticket rechazado por saldo no deja rastro', Number((await wallet()).balance) === 10);
const mine = (await q(`select get_my_tickets('TEST01') j`))[0].j;
check('mis tickets: 2 aprobados con sus apuestas', mine.length === 2 && mine.every((t) => t.status === 'approved') && mine.some((t) => t.bets.length === 3));
check('usuario no lee tickets directo', (await q(`select count(*)::int c from tickets`))[0].c === 0);

// En vivo: el organizador pone el partido 1 en vivo
await asUser(ADM);
await q(`update matches set game_live = true where id=$1`, [mid]);
await asUser(U1);
await expectErr('liga empezada: mercado de toda la liga cerrado', () => submit([{ market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 1 }]), /La liga ya empezó/);
const okLive = await submit([{ market_id: mk['Ganador · M1 · Equipo 1 vs Equipo 2'], option: 1, amount: 1 }]);
check('en vivo: se apuesta al ganador del partido en juego', !!okLive[0].id);
await asUser(ADM);
await q(`insert into events (match_id, type, player_id, team_id, minute, game) values ($1,'goal',$2,$3,2,1)`, [mid, pl['Pepe'], teams[0].id]);
await asUser(U1);
await expectErr('en vivo con gol: primer gol del partido cerrado', () => submit([{ market_id: mk['Primer gol · M1 · Equipo 1 vs Equipo 2'], player_id: pl['Pepe'], amount: 1 }]), /ya pasó/);
await asUser(ADM);
await q(`update matches set current_game = 2, game_live = false where id=$1`, [mid]);
await asUser(U1);
await expectErr('partido terminado: sus mercados cerrados', () => submit([{ market_id: mk['Ganador · M1 · Equipo 1 vs Equipo 2'], option: 2, amount: 1 }]), /ya terminó/);
check('público: game_live y partido actual', (await q(`select get_public_match('TEST01') j`))[0].j.match.current_game === 2);
await asUser(ADM);
await q(`update matches set current_game = 1, game_live = false where id=$1`, [mid]);
await q(`delete from events where match_id=$1`, [mid]);
await asUser(U1);

// Chat
await q(`select post_message('TEST01', '  ¡Feliz cumple Álvaro! 🎂 ')`);
const msgs = (await q(`select get_messages('test01') j`))[0].j;
check('chat: mensaje con mi usuario', msgs.length === 1 && msgs[0].username === 'Pepe.Lucho' && msgs[0].body === '¡Feliz cumple Álvaro! 🎂');
await expectErr('chat: mensaje vacío', () => q(`select post_message('TEST01', '   ')`), /1 a 500/);
await expectErr('chat: jornada inexistente', () => q(`select post_message('NOPE', 'hola')`), /no encontrada/);
await expectErr('chat: usuario no inserta directo', () => q(`insert into messages (match_id, username, body) values ($1,'admin','x')`, [mid]), /row-level/);
for (let i = 0; i < 5; i++) await q(`select post_message('TEST01', 'spam ${i}')`);
await expectErr('chat: anti-spam', () => q(`select post_message('TEST01', 'uno más')`), /muy rápido/);
await asUser(U2);
check('mis tickets: otro usuario no ve los míos', (await q(`select get_my_tickets('TEST01') j`))[0].j.length === 0);
check('perfil: solo veo el mío', (await q(`select count(*)::int c from profiles`))[0].c === 1);
await db.exec(`reset role`);
check('broadcast del chat en chat:<código>', (await q(`select count(*)::int c from realtime.log where topic='chat:TEST01'`))[0].c >= 6);

const [tk] = await q(`select bettor_name, total, status, user_id, receipt_path from tickets where id=$1`, [ok[0].id]);
check('ticket aprobado con usuario, total del servidor y sin captura', tk.bettor_name === 'Pepe.Lucho' && tk.total === 6 && tk.status === 'approved' && tk.user_id === U1 && tk.receipt_path === null);

// --- Reglas del admin / integridad ---
await expectErr('arrancan equipos de otra jornada', () => q(`update matches set starting_team_ids = array[$1::uuid, $2::uuid] where id=$3`, [teams[0].id, otherTeam, mid]), /dos equipos distintos/);
await expectErr('gol sin equipo', () => q(`insert into events (match_id, type, player_id, minute) values ($1,'goal',$2,1)`, [mid, pl['Pepe']]), /events_shape/);
await expectErr('gol de la opción "Autogol" (debe ser el jugador real)', () => q(`insert into events (match_id, type, player_id, team_id, minute) values ($1,'goal',$2,$3,1)`, [mid, pl['Autogol'], teams[0].id]), /no pertenece/);
await expectErr('rotación con jugador', () => q(`insert into events (match_id, type, player_id, team_out_id, minute) values ($1,'rotation',$2,$3,1)`, [mid, pl['Pepe'], teams[0].id]), /events_shape/);
for (const t of ['red', 'blooper', 'penalty', 'penalty_miss', 'post', 'golazo', 'dive']) {
  await q(`insert into events (match_id, type, player_id, minute) values ($1,$2,$3,5)`, [mid, t, pl['Pepe']]);
}
check('eventos nuevos (roja, blooper, penal, palo, golazo, piscinazo)', (await q(`select count(*)::int c from events where match_id=$1 and type <> 'goal'`, [mid]))[0].c === 7);
await expectErr('gol de un equipo que no juega ese partido', () => q(`insert into events (match_id, type, player_id, team_id, minute, game) values ($1,'goal',$2,$3,1,1)`, [mid, pl['Pepe'], teams[2].id]), /no juega el partido 1/);
await q(`insert into events (match_id, type, player_id, team_id, minute, game) values ($1,'goal',$2,$3,1,2)`, [mid, pl['Pepe'], teams[2].id]);
check('gol del partido 2 (Equipo 1 vs Equipo 3) válido', true);
await expectErr('palo con equipo', () => q(`insert into events (match_id, type, player_id, team_id, minute) values ($1,'post',$2,$3,1)`, [mid, pl['Pepe'], teams[0].id]), /events_shape/);
await expectErr('evento de tipo inventado', () => q(`insert into events (match_id, type, player_id, minute) values ($1,'baile',$2,1)`, [mid, pl['Pepe']]), /events_type_check|events_shape/);
await expectErr('minuto 301', () => q(`insert into events (match_id, type, player_id, minute) values ($1,'yellow',$2,301)`, [mid, pl['Pepe']]), /check/);

await q(`update matches set status='closed' where id=$1`, [mid]);
check('closed_at se llena al cerrar', !!(await q(`select closed_at from matches where id=$1`, [mid]))[0].closed_at);
await asUser(U1);
await expectErr('apostar con la jornada cerrada', () => submit([{ market_id: mk['Campeón de la liga'], team_id: teams[0].id, amount: 1 }]), /cerradas/);
// Liquidación: el organizador acredita ganancias al saldo (y puede re-liquidar o deshacer)
await asUser(U1);
const before = Number((await wallet()).balance);
await expectErr('usuario no puede liquidar', () => q(`select admin_settle_market($1, 'winners', 'x', '[]'::jsonb)`, [mk['Primer gol de la noche']]), /Solo el organizador/);
await asUser(ADM);
await q(`select admin_settle_market($1, 'winners', $2, $3::jsonb)`, [mk['Primer gol de la noche'], pl['Autogol'], JSON.stringify([{ user_id: U1, username: 'Pepe.Lucho', kind: 'win', amount_cents: 450 }])]);
await asUser(U1);
let wl = await wallet();
check('ganancia acreditada al saldo (+4.50)', Math.abs(Number(wl.balance) - (before + 4.5)) < 0.001, `(${wl.balance})`);
check('mi cuenta muestra la ganancia', wl.credits.length === 1 && wl.credits[0].kind === 'win' && wl.credits[0].amount_cents === 450);
await asUser(ADM);
await q(`update matches set status='open' where id=$1`, [mid]);
await asUser(U1);
await expectErr('no se apuesta a un mercado liquidado', () => submit([{ market_id: mk['Primer gol de la noche'], player_id: pl['Pepe'], amount: 1 }]), /ya se liquidó/);
await asUser(ADM);
await q(`update matches set status='closed' where id=$1`, [mid]);
await asUser(U1);
check('público: mercado liquidado', (await q(`select get_public_match('TEST01') j`))[0].j.markets.find((m) => m.id === mk['Primer gol de la noche']).settled === true);
await asUser(ADM);
await q(`select admin_settle_market($1, 'winners', $2, $3::jsonb)`, [mk['Primer gol de la noche'], pl['Autogol'], JSON.stringify([{ user_id: U1, username: 'Pepe.Lucho', kind: 'win', amount_cents: 300 }])]);
await asUser(U1);
check('re-liquidar reemplaza lo acreditado (+3.00)', Math.abs(Number((await wallet()).balance) - (before + 3)) < 0.001);
await asUser(ADM);
await q(`select admin_unsettle_market($1)`, [mk['Primer gol de la noche']]);
await asUser(U1);
check('deshacer la liquidación devuelve el saldo', Math.abs(Number((await wallet()).balance) - before) < 0.001);

// El bote es solo plata apostada: no se puede acreditar más de lo que se apostó
await asUser(ADM);
await expectErr('no se acredita más de lo apostado en la jornada', () => q(`select admin_settle_market($1, 'winners', 'x', $2::jsonb)`, [mk['Primer gol de la noche'], JSON.stringify([{ user_id: U1, username: 'Pepe.Lucho', kind: 'win', amount_cents: 999999 }])]), /supera lo apostado/);
await asUser(U1);
check('el intento fallido no cambió el saldo', Math.abs(Number((await wallet()).balance) - before) < 0.001);

// Retiros: el organizador devuelve el saldo por Plin al final
await expectErr('usuario no ve saldos de todos', () => q(`select admin_balances()`), /Solo el organizador/);
await expectErr('usuario no se paga a sí mismo', () => q(`select admin_payout($1, 100)`, [U1]), /Solo el organizador/);
await asUser(ADM);
const bal = (await q(`select admin_balances() j`))[0].j;
check('admin ve el saldo de cada uno', bal.some((b) => b.username === 'Pepe.Lucho' && Math.abs(Number(b.balance) - before) < 0.001));
await expectErr('no se retira más que el saldo', () => q(`select admin_payout($1, $2)`, [U1, Math.round(before * 100) + 1]), /más que su saldo/);
await q(`select admin_payout($1, 200)`, [U1]);
await asUser(U1);
const afterPayout = await wallet();
check('retiro de S/ 2 baja el saldo y queda registrado', Math.abs(Number(afterPayout.balance) - (before - 2)) < 0.001 && afterPayout.withdrawn_cents === 200);
await asUser(ADM);
await q(`delete from withdrawals where user_id=$1`, [U1]);
await asUser(U1);

// Si el organizador anula un ticket, el monto vuelve al saldo.
await asUser(ADM);
await q(`update tickets set status='rejected', reject_reason='Apuesta repetida' where id=$1`, [ok2[0].id]);
await asUser(U1);
check('ticket rechazado devuelve el saldo (9 + 4 = 13)', Number((await wallet()).balance) === 13);
await db.exec(`reset role`);

// --- Admin vs otro usuario ---
await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001','admin@x.pe'); insert into admins values ('00000000-0000-0000-0000-000000000001')`);
await db.exec(`set test.uid = '00000000-0000-0000-0000-000000000001'; set role authenticated`);
check('admin ve tickets y capturas', (await q(`select count(*)::int c from tickets`))[0].c > 0 && (await q(`select count(*)::int c from storage.objects`))[0].c === 2);
await q(`insert into events (match_id, type, player_id, team_id, is_own_goal, minute) values ($1,'goal',$2,$3,true,3)`, [mid, pl['Pepe'], teams[0].id]);
await expectErr('ciclo de arrastre', async () => {
  await q(`update markets set rollover_to_market_id=$1 where id=$2`, [mk['Primer sextete'], mk['Primer cuartete']]);
  await q(`update markets set rollover_to_market_id=$1 where id=$2`, [mk['Primer cuartete'], mk['Primer sextete']]);
}, /ciclo/);
await db.exec(`reset role; set test.uid = '00000000-0000-0000-0000-000000000002'; set role authenticated`);
check('otro usuario logueado no ve nada', (await q(`select count(*)::int c from tickets`))[0].c === 0);
check('otro usuario no ve recargas ajenas', (await q(`select count(*)::int c from deposits`))[0].c === 0);
await db.exec(`reset role`);
check('broadcasts en match:<código>', (await q(`select count(*)::int c from realtime.log where topic='match:TEST01'`))[0].c > 0);

// --- Formaciones: plantel canónico, cancha pública, partidos y equipos dinámicos ---
const mockSrc = readFileSync(root + '../src/app/core/mock-backend.ts', 'utf8');
const mockRoster = [...mockSrc.slice(mockSrc.indexOf('DEFAULT_ROSTER: SeedPlayer[]'), mockSrc.indexOf('DEFAULT_PLAYERS')).matchAll(/name: '([^']+)'/g)].map((x) => x[1]);
const sqlRoster = (await q(`select name from players where match_id=$1 and not is_own_goal and name not in ('Pepe','Lucho') order by sort_order`, [mid])).map((r) => r.name);
check('T1: mismos 18 alias que el mock', mockRoster.length === 18 && sqlRoster.join() === mockRoster.join(), `(${sqlRoster.length})`);

const pubT = (await q(`select get_public_match('TEST01') j`))[0].j;
const krul = pubT.players.find((p) => p.name === 'Krul');
const fields = ['team_id', 'shirt_number', 'position', 'slot', 'modes', 'photo_id', 'costume_id'];
check('T2: jugador con los 7 campos nuevos', fields.every((k) => k in krul), JSON.stringify(Object.keys(krul)));
check('T2: Krul arquero del Equipo 1 en Modo 1, defensa del 3 en Modo 2',
  krul.team_id === teams[0].id && krul.position === 'GK' && krul.shirt_number === 1 && krul.modes['1'].team_id === teams[0].id && krul.modes['2'].team_id === teams[2].id && krul.modes['2'].position === 'DEF');
check('T2: 6 partidos base (3 Modo 1 + 3 Modo 2)', pubT.match.games.length === 6 && pubT.match.games.filter((g) => g.mode === 2).length === 3 && pubT.match.games[2].home === teams[1].id);
check('T2: equipos con formación', pubT.teams.every((t) => t.formation === '2-2-1' && 'kit_id' in t));
check('T2: 6 por equipo en Modo 1', teams.every((t) => pubT.players.filter((p) => p.team_id === t.id).length === 6));
await expectErr('T2: jugador en un equipo de otra jornada', () => q(`update players set team_id=$1 where id=$2`, [otherTeam, pl['Pepe']]), /no pertenece al partido/);

await asUser(U1);
await expectErr('T3: usuario no crea partidos', () => q(`select admin_add_game($1,$2,$3)`, [mid, teams[0].id, teams[1].id]), /No autorizado/);
await expectErr('T4: usuario no crea equipos', () => q(`select admin_add_team($1,'X')`, [mid]), /No autorizado/);
await asUser(ADM);
await q(`update matches set status='open', current_game=2, game_live=false where id=$1`, [mid]);
const marketsBefore = await q(`select count(*)::int c from markets where match_id=$1`, [mid]);
const [{ n: g7 }] = await q(`select admin_add_game($1,$2,$3,false,2) n`, [mid, teams[1].id, teams[0].id]);
const afterAdd = (await q(`select current_game, game_live, games from matches where id=$1`, [mid]))[0];
check('T3: partido 7 creado sin mover current_game', g7 === 7 && afterAdd.current_game === 2 && afterAdd.game_live === false && afterAdd.games.length === 7 && afterAdd.games[6].mode === 2);
check('T3: 19 mercados del partido nuevo', (await q(`select count(*)::int c from markets where match_id=$1`, [mid]))[0].c === marketsBefore[0].c + 19 && !!(await q(`select 1 from markets where match_id=$1 and name='Ganador · M2 · Equipo 2 vs Equipo 1'`, [mid])).length);
await expectErr('T3: mismo equipo', () => q(`select admin_add_game($1,$2,$2)`, [mid, teams[0].id]), /distintos/);
await expectErr('T3: equipo de otra jornada', () => q(`select admin_add_game($1,$2,$3)`, [mid, teams[0].id, otherTeam]), /del partido/);
const [{ n: g8 }] = await q(`select admin_add_game($1,$2,$3,true,1) n`, [mid, teams[0].id, teams[2].id]);
check('T3: en vivo mueve current_game', (await q(`select current_game, game_live from matches where id=$1`, [mid]))[0].current_game === g8 && g8 === 8);

const [{ id: t4 }] = await q(`select admin_add_team($1, '  Equipo 4 ', null) id`, [mid]);
const t4row = (await q(`select name, sort_order, color from teams where id=$1`, [t4]))[0];
check('T4: equipo nuevo al final y con color por defecto', t4row.name === 'Equipo 4' && t4row.sort_order === 4 && t4row.color === '#64748b');
await q(`update players set team_id=$1 where id=$2`, [t4, pl['Pepe']]);
check('T4: se le asigna un jugador', (await q(`select team_id from players where id=$1`, [pl['Pepe']]))[0].team_id === t4);
await expectErr('T4: sin nombre', () => q(`select admin_add_team($1, '  ')`, [mid]), /necesita nombre/);
await db.exec(`reset role`);

// fixture_pair = fixture() de league.ts para 3, 4 y 5 equipos (sin `games`)
const [{ id: fx }] = await q(`insert into matches (title, access_code) values ('FX', 'FIXT01') returning id`);
await q(`update matches set games = null where id=$1`, [fx]);
const fxPairs = async (n) => {
  const ids = (await q(`select id from teams where match_id=$1 order by sort_order, name`, [fx])).map((r) => r.id);
  const exp = n === 4 ? [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]] : [];
  if (n !== 4) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) exp.push([i, j]);
  let ok = true;
  for (let k = 1; k <= exp.length; k++) {
    const got = (await q(`select fixture_pair($1, $2) p`, [fx, k]))[0].p;
    ok &&= got?.join() === [ids[exp[k - 1][0]], ids[exp[k - 1][1]]].join();
  }
  ok &&= (await q(`select fixture_pair($1, $2) p`, [fx, exp.length + 1]))[0].p === null;
  return ok;
};
check('T5: fixture_pair con 3 equipos', await fxPairs(3));
await q(`insert into teams (match_id, name, sort_order) values ($1, 'Equipo 4', 4)`, [fx]);
check('T5: fixture_pair con 4 equipos', await fxPairs(4));
await q(`insert into teams (match_id, name, sort_order) values ($1, 'Equipo 5', 5)`, [fx]);
check('T5: fixture_pair con 5 equipos', await fxPairs(5));
check('T5: con games manda la lista', (await q(`select fixture_pair($1, 7) p`, [mid]))[0].p.join() === [teams[1].id, teams[0].id].join());

console.log(fails === 0 ? '\nTodas las pruebas de BD pasaron' : `\n${fails} prueba(s) de BD fallaron`);
process.exit(fails === 0 ? 0 : 1);
