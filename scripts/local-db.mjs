import './sites-env.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['migrate', 'check'].includes(mode)) {
  throw new Error('Usage: node scripts/local-db.mjs migrate|check');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const config = fileURLToPath(new URL('../wrangler.local.json', import.meta.url));
const state = fileURLToPath(new URL('../.wrangler/state', import.meta.url));
const args = mode === 'migrate'
  ? ['d1', 'migrations', 'apply', 'DB']
  : ['d1', 'execute', 'DB', '--command', 'SELECT COUNT(*) AS tournament_count FROM tournaments'];
console.log(`Courtside local database: ${state}`);
console.log('Local only. No Cloudflare login or remote database credentials required.');
const result = spawnSync(process.execPath, [wrangler, ...args, '--local', '--config', config, '--persist-to', state], {
  cwd: root, stdio: 'inherit', shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
