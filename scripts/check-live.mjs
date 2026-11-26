// Revisa la seguridad del Supabase real como usuario anónimo (sin login).
// Uso: npm run check:live   (lee SUPABASE_URL y SUPABASE_ANON_KEY del .env)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').trim().split(/\r?\n/).map((l) => l.split('=')));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pub = await sb.rpc('get_public_match', { p_code: 'demo26' });
console.log('RPC público:', pub.error?.message ?? `ok · ${pub.data.match.title} · ${pub.data.teams.length} equipos · ${pub.data.bets.length} apuestas aprobadas · ${pub.data.players.length} jugadores`);
console.log('código malo →', (await sb.rpc('get_public_match', { p_code: 'NOPE99' })).data);
for (const t of ['tickets', 'bets', 'events', 'matches', 'teams', 'players', 'admins']) {
  const r = await sb.from(t).select('*').limit(1);
  console.log(`anon lee ${t}:`, r.error ? `bloqueado (${r.error.message})` : `${r.data.length} filas`);
}
const ins = await sb.from('tickets').insert({ match_id: pub.data.match.id, bettor_name: 'hack', status: 'approved' });
console.log('anon inserta ticket directo:', ins.error ? `bloqueado (${ins.error.message})` : 'PERMITIDO ⚠️');
const list = await sb.storage.from('receipts').list(pub.data.match.id);
console.log('anon lista capturas:', list.error ? `bloqueado (${list.error.message})` : `${list.data.length} archivos`);
const bad = await sb.rpc('submit_ticket', { p_code: 'DEMO26', p_bettor_name: 'x', p_bets: [], p_receipt_path: 'x' });
console.log('submit sin apuestas →', bad.error?.message);
