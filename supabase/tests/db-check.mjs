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
create table auth.users (id uuid primary key, email text);
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
const [demo] = await q(`select id, status, closed_at from matches where access_code='DEMO26'`);
const count = async (t) => (await q(`select count(*)::int c from ${t} where match_id=$1`, [demo.id]))[0].c;
check('seed: 3 equipos', (await count('teams')) === 3);
check('seed: 21 jugadores (20 + Autogol)', (await count('players')) === 21);
check('seed: 15 mercados', (await count('markets')) === 15);
check('seed: 10 eventos', (await count('events')) === 10);
check('seed: jornada cerrada con closed_at', demo.status === 'closed' && !!demo.closed_at);

// --- Jornada abierta para probar submit_ticket ---
const [{ id: mid }] = await q(`insert into matches (title, access_code) values ('Test', 'TEST01') returning id`);
const teams = await q(`select id, name from teams where match_id=$1 order by sort_order`, [mid]);
const [m2] = await q(`select starting_team_ids from matches where id=$1`, [mid]);
check('defaults: Equipo A, B, C', teams.map((t) => t.name).join() === 'Equipo A,Equipo B,Equipo C');
check('defaults: arrancan A y B', m2.starting_team_ids.join() === [teams[0].id, teams[1].id].join());
await q(`insert into players (match_id, name, sort_order) values ($1,'Pepe',1), ($1,'Lucho',2)`, [mid]);
const pl = Object.fromEntries((await q(`select name, id from players where match_id=$1`, [mid])).map((r) => [r.name, r.id]));
const mk = Object.fromEntries((await q(`select name, id from markets where match_id=$1`, [mid])).map((r) => [r.name, r.id]));
const otherTeam = (await q(`select id from teams where match_id=$1 limit 1`, [demo.id]))[0].id;

// --- Como anónimo ---
await db.exec(`set role anon`);
await db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${mid}/r1.jpg`]);
await db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${mid}/r2.jpg`]);
await expectErr('anon no sube a jornada inexistente', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', 'xx/r.jpg')`), /row-level/);
check('anon no ve capturas', (await q(`select count(*)::int c from storage.objects`))[0].c === 0);
for (const t of ['tickets', 'bets', 'events', 'matches', 'teams', 'players', 'admins', 'public_bets']) {
  await expectErr(`anon no lee ${t}`, () => q(`select * from ${t} limit 1`), /permission/);
}
check('anon lee market_types', (await q(`select count(*)::int c from market_types`))[0].c === 13);

const pub = (await q(`select get_public_match('demo26') j`))[0].j;
check('público: jornada demo', pub.match.title === 'Pichanga de prueba' && pub.teams.length === 3 && pub.markets.length === 15 && pub.events.length === 10);
check('público: solo apuestas aprobadas (18)', pub.bets.length === 18, `(${pub.bets.length})`);
check('público: sin rutas de captura', !JSON.stringify(pub).includes('receipt'));
check('público: Plin', pub.match.pay_method === 'Plin');
check('código malo → null', (await q(`select get_public_match('NOPE') j`))[0].j === null);

const submit = (bets, path = `${mid}/r2.jpg`, name = 'X') =>
  q(`select submit_ticket('TEST01', $1, $2::jsonb, $3) id`, [name, JSON.stringify(bets), path]);
const ok = await submit(
  [
    { market_id: mk['Primer gol de la noche'], player_id: pl['Autogol'], amount: 2 },
    { market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 3 },
    { market_id: mk['Racha más larga'], option: 10, amount: 1 },
  ],
  `${mid}/r1.jpg`,
  '  Pepe   Lucho ',
);
check('ticket con jugador, equipo y número', !!ok[0].id);
await expectErr('captura reutilizada', () => submit([{ market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 1 }], `${mid}/r1.jpg`), /usada/);
await expectErr('jugador en mercado de equipo', () => submit([{ market_id: mk['Rey de la cancha'], player_id: pl['Pepe'], amount: 1 }]), /se apuesta a un equipo/);
await expectErr('equipo en mercado de jugador', () => submit([{ market_id: mk['Pichichi de la noche'], team_id: teams[0].id, amount: 1 }]), /se apuesta a un jugador/);
await expectErr('número fuera de 1–10', () => submit([{ market_id: mk['Racha más larga'], option: 11, amount: 1 }]), /va de 1 a 10/);
await expectErr('número 0', () => submit([{ market_id: mk['Racha más larga'], option: 0, amount: 1 }]), /va de 1 a 10/);
await expectErr('equipo de otra jornada', () => submit([{ market_id: mk['Rey de la cancha'], team_id: otherTeam, amount: 1 }]), /Equipo inválido/);
await expectErr('"Autogol" en Primer autogol', () => submit([{ market_id: mk['Primer autogol'], player_id: pl['Autogol'], amount: 1 }]), /Autogol/);
await expectErr('dos destinos a la vez', () => submit([{ market_id: mk['Rey de la cancha'], team_id: teams[0].id, player_id: pl['Pepe'], amount: 1 }]), /se apuesta a un equipo/);
await expectErr('monto 6', () => submit([{ market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 6 }]), /S\/ 1 a S\/ 5/);
await expectErr('apuesta repetida', () => submit([{ market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 1 }, { market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 2 }]), /iguales/);
await expectErr('21 apuestas', () => submit(Array.from({ length: 21 }, (_, i) => ({ market_id: mk['Racha más larga'], option: (i % 10) + 1, amount: 1 }))), /entre 1 y 20/);
await expectErr('sin captura subida', () => submit([{ market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 1 }], `${mid}/nada.jpg`), /No se encontró/);
await expectErr('anon no inserta tickets directo', () => q(`insert into tickets (match_id, bettor_name, status) values ($1,'x','approved')`, [mid]), /permission/);
await db.exec(`reset role`);

const [tk] = await q(`select bettor_name, total, status from tickets where id=$1`, [ok[0].id]);
check('ticket guardado pendiente con total del servidor', tk.bettor_name === 'Pepe Lucho' && tk.total === 6 && tk.status === 'pending');

// --- Reglas del admin / integridad ---
await expectErr('arrancan equipos de otra jornada', () => q(`update matches set starting_team_ids = array[$1::uuid, $2::uuid] where id=$3`, [teams[0].id, otherTeam, mid]), /dos equipos distintos/);
await expectErr('gol sin equipo', () => q(`insert into events (match_id, type, player_id, minute) values ($1,'goal',$2,1)`, [mid, pl['Pepe']]), /events_shape/);
await expectErr('gol de la opción "Autogol" (debe ser el jugador real)', () => q(`insert into events (match_id, type, player_id, team_id, minute) values ($1,'goal',$2,$3,1)`, [mid, pl['Autogol'], teams[0].id]), /no pertenece/);
await expectErr('rotación con jugador', () => q(`insert into events (match_id, type, player_id, team_out_id, minute) values ($1,'rotation',$2,$3,1)`, [mid, pl['Pepe'], teams[0].id]), /events_shape/);
await expectErr('minuto 301', () => q(`insert into events (match_id, type, player_id, minute) values ($1,'yellow',$2,301)`, [mid, pl['Pepe']]), /check/);

await q(`update matches set status='closed' where id=$1`, [mid]);
check('closed_at se llena al cerrar', !!(await q(`select closed_at from matches where id=$1`, [mid]))[0].closed_at);
await db.exec(`set role anon`);
await expectErr('apostar con la jornada cerrada', () => submit([{ market_id: mk['Rey de la cancha'], team_id: teams[0].id, amount: 1 }]), /cerradas/);
await expectErr('subir captura con la jornada cerrada', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${mid}/r3.jpg`]), /row-level/);
await db.exec(`reset role`);

// --- Admin vs otro usuario ---
await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001','admin@x.pe'); insert into admins values ('00000000-0000-0000-0000-000000000001')`);
await db.exec(`set test.uid = '00000000-0000-0000-0000-000000000001'; set role authenticated`);
check('admin ve tickets y capturas', (await q(`select count(*)::int c from tickets`))[0].c > 0 && (await q(`select count(*)::int c from storage.objects`))[0].c === 2);
await q(`update tickets set status='approved' where id=$1`, [ok[0].id]);
await q(`insert into events (match_id, type, player_id, team_id, is_own_goal, minute) values ($1,'goal',$2,$3,true,3)`, [mid, pl['Pepe'], teams[0].id]);
await expectErr('ciclo de arrastre', async () => {
  await q(`update markets set rollover_to_market_id=$1 where id=$2`, [mk['Primer sextete'], mk['Primer cuartete']]);
  await q(`update markets set rollover_to_market_id=$1 where id=$2`, [mk['Primer cuartete'], mk['Primer sextete']]);
}, /ciclo/);
await db.exec(`reset role; set test.uid = '00000000-0000-0000-0000-000000000002'; set role authenticated`);
check('otro usuario logueado no ve nada', (await q(`select count(*)::int c from tickets`))[0].c === 0);
await db.exec(`reset role`);
check('broadcasts en match:<código>', (await q(`select count(*)::int c from realtime.log where topic='match:TEST01'`))[0].c > 0);

console.log(fails === 0 ? '\nTodas las pruebas de BD pasaron' : `\n${fails} prueba(s) de BD fallaron`);
process.exit(fails === 0 ? 0 : 1);
