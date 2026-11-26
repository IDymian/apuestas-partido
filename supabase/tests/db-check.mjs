// Prueba la migración y el seed en un Postgres embebido (PGlite) con stubs
// mínimos de Supabase (auth, storage, realtime). Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const db = new PGlite();

// --- Stubs mínimos de Supabase ---
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage; create schema realtime;
grant usage on schema public, auth, storage, realtime to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table realtime.log (topic text, payload jsonb);
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.log values (topic, payload) $$;
-- sin privilegios por defecto: la migración debe dar los suyos

`);

await db.exec(readFileSync(root + 'migrations/20261124000000_init.sql', 'utf8'));
console.log('migración OK');
await db.exec(readFileSync(root + 'seed.sql', 'utf8'));
await db.exec(readFileSync(root + 'seed.sql', 'utf8'));
console.log('seed OK (2 veces)');

const q = async (sql, params) => (await db.query(sql, params)).rows;
let fails = 0;
const expectErr = async (label, fn, pattern) => {
  try { await fn(); fails++; console.log('FALLO (no lanzó):', label); }
  catch (e) {
    const ok = pattern.test(e.message);
    if (!ok) fails++;
    console.log(ok ? 'ok   ' : 'FALLO', label, '→', e.message);
  }
};

const [m] = await q(`select id from matches where access_code='DEMO26'`);
const players = await q(`select id, name, is_own_goal from players where match_id=$1`, [m.id]);
const mk = Object.fromEntries((await q(`select type, id from markets where match_id=$1`, [m.id])).map((r) => [r.type, r.id]));
const pid = (n) => players.find((p) => p.name === n).id;
const og = players.find((p) => p.is_own_goal).id;
console.log('jugadores', players.length, 'mercados', Object.keys(mk));
// receipt object (subida como anon)
await db.exec(`set role anon`);
await db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${m.id}/r1.jpg`]);
await expectErr('anon no puede subir a partido inexistente', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', 'xx/r.jpg')`), /row-level/);
console.log('anon lee storage:', (await q(`select count(*)::int c from storage.objects`))[0].c);

// lecturas como anon
await expectErr('anon no lee tickets', () => q(`select count(*)::int c from tickets`), /permission/);
await expectErr('anon no lee eventos directo', () => q(`select * from events`), /permission/);
console.log('anon lee market_types:', (await q(`select count(*)::int c from market_types`))[0].c);
await expectErr('anon no lee public_bets', () => q(`select * from public_bets`), /permission/);
const pub = (await q(`select get_public_match('demo26') j`))[0].j;
console.log('público: bets', pub.bets.length, 'players', pub.players.length, 'markets', pub.markets.length, 'receipt?', JSON.stringify(pub).includes('receipt'));
console.log('código malo →', (await q(`select get_public_match('NOPE') j`))[0].j);

const bets = (arr) => JSON.stringify(arr);
const t = (await q(`select submit_ticket('DEMO26','  Pepe   Lucho ', $1::jsonb, $2) id`, [bets([
  { market_id: mk.first_goal, player_id: pid('Diego Salas'), amount: 3 },
  { market_id: mk.last_goal, player_id: og, amount: 1 },
]), `${m.id}/r1.jpg`]))[0].id;
console.log('ticket creado', !!t);
await expectErr('captura reutilizada', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets([{ market_id: mk.first_goal, player_id: og, amount: 1 }]), `${m.id}/r1.jpg`]), /usada/);
await db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${m.id}/r2.jpg`]);
await expectErr('monto 6', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets([{ market_id: mk.first_goal, player_id: og, amount: 6 }]), `${m.id}/r2.jpg`]), /S\/ 1 a S\/ 5/);
await expectErr('autogol en amarilla', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets([{ market_id: mk.first_yellow, player_id: og, amount: 2 }]), `${m.id}/r2.jpg`]), /Autogol/);
await expectErr('duplicada', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets([{ market_id: mk.first_goal, player_id: og, amount: 2 }, { market_id: mk.first_goal, player_id: og, amount: 3 }]), `${m.id}/r2.jpg`]), /mismo jugador/);
await expectErr('21 apuestas', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets(Array.from({ length: 21 }, () => ({ market_id: mk.first_goal, player_id: og, amount: 1 }))), `${m.id}/r2.jpg`]), /entre 1 y 20/);
await expectErr('sin captura subida', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets([{ market_id: mk.first_goal, player_id: og, amount: 1 }]), `${m.id}/nada.jpg`]), /No se encontró/);
await expectErr('nombre vacío', () => q(`select submit_ticket('DEMO26','   ',$1::jsonb,$2)`, [bets([{ market_id: mk.first_goal, player_id: og, amount: 1 }]), `${m.id}/r2.jpg`]), /nombre/);
await expectErr('anon no inserta directo', () => q(`insert into tickets (match_id, bettor_name, status) values ($1,'x','approved')`, [m.id]), /row-level|permission/);
await expectErr('anon no aprueba', async () => { const r = await db.query(`update tickets set status='approved'`); if (r.affectedRows === 0) throw new Error('row-level: 0 filas'); }, /row-level|permission/);
await db.exec(`reset role`);
const [tk] = await q(`select bettor_name, total, status from tickets where id=$1`, [t]);
console.log('ticket guardado', tk);

// cerrar partido
await db.query(`update matches set status='closed' where id=$1`, [m.id]);
await db.exec(`set role anon`);
await expectErr('partido cerrado', () => q(`select submit_ticket('DEMO26','X',$1::jsonb,$2)`, [bets([{ market_id: mk.first_goal, player_id: og, amount: 1 }]), `${m.id}/r2.jpg`]), /cerrado/);
await expectErr('subir captura con partido cerrado', () => db.query(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${m.id}/r3.jpg`]), /row-level/);
await db.exec(`reset role`);

// admin
await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001','admin@x.pe'); insert into admins values ('00000000-0000-0000-0000-000000000001')`);
await db.exec(`set test.uid = '00000000-0000-0000-0000-000000000001'; set role authenticated`);
console.log('admin ve tickets:', (await q(`select count(*)::int c from tickets`))[0].c, 'storage:', (await q(`select count(*)::int c from storage.objects`))[0].c);
await db.query(`update tickets set status='approved' where id=$1`, [t]);
await expectErr('ciclo de arrastre', () => db.query(`update markets set rollover_to_market_id=$1 where id=$2`, [mk.first_goal, mk.last_goal]), /ciclo/);
await db.query(`insert into events (match_id, type, player_id, minute) values ($1,'goal',$2,30)`, [m.id, pid('Fulanito Díaz')]);
await db.exec(`reset role; set test.uid = '00000000-0000-0000-0000-000000000002'; set role authenticated`);
console.log('otro usuario ve tickets:', (await q(`select count(*)::int c from tickets`))[0].c);
await db.exec(`reset role`);
console.log('broadcasts:', (await q(`select topic, count(*)::int c from realtime.log group by 1`)));

console.log(fails === 0 ? '\nTodas las pruebas de BD pasaron' : `\n${fails} prueba(s) de BD fallaron`);
process.exit(fails === 0 ? 0 : 1);
