// Genera src/environments/env.generated.ts a partir de .env (local) o de las
// variables de entorno del sistema (Vercel / Netlify). Ese archivo NO va a git.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const fromFile = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = (k) => process.env[k] ?? fromFile[k] ?? '';

// --mock: backend en memoria SOLO para pruebas locales (npm run start:mock / test:e2e). Nunca en el despliegue.
const mock = process.argv.includes('--mock');
const env = {
  supabaseUrl: mock ? '' : get('SUPABASE_URL'),
  supabaseAnonKey: mock ? '' : get('SUPABASE_ANON_KEY'),
  mock,
};

if (mock) {
  console.warn('[gen-env] Backend de PRUEBAS en memoria (--mock). No usar para desplegar.');
} else if (!env.supabaseUrl || !env.supabaseAnonKey) {
  console.warn('[gen-env] Falta SUPABASE_URL o SUPABASE_ANON_KEY (.env o variables de entorno). La app no podrá conectarse.');
}

writeFileSync(
  'src/environments/env.generated.ts',
  `// Archivo generado por scripts/gen-env.mjs. No editar ni subir a git.\nexport const ENV = ${JSON.stringify(env, null, 2)} as const;\n`,
);
