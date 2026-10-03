// Prepara (ou desmonta) um git worktree para um agente trabalhar em paralelo com outros.
// Uso, de dentro do worktree: npm run agent:setup | npm run agent:teardown
//  - node_modules: junction para os do checkout principal (sem reinstalar nada);
//  - banco Postgres próprio (queryit_wt_<nome>) no mesmo container, com seed;
//  - .env.test com a connection string, lido pelos testes e pelo db:seed.
// Teardown ANTES de `git worktree remove`: remove o banco e as junctions (apagar a pasta
// seguindo uma junction apagaria o node_modules do checkout principal).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const action = process.argv[2];
if (action !== 'setup' && action !== 'teardown') {
  console.error('Uso: node proxy/scripts/worktree.js setup|teardown');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const root = path.resolve(git('rev-parse', '--show-toplevel'));
const mainRoot = path.resolve(path.dirname(path.resolve(root, git('rev-parse', '--git-common-dir'))));
if (root === mainRoot) {
  console.error('Isto é o checkout principal. Rode dentro de um worktree (git worktree add ...).');
  process.exit(1);
}

const slug = path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const dbName = `queryit_wt_${slug}`;
const ENV_FILE = path.join(root, '.env.test');
const LINKS = ['node_modules', 'proxy/node_modules'];

if (action === 'setup') {
  for (const rel of LINKS) {
    const link = path.join(root, rel);
    const target = path.join(mainRoot, rel);
    if (!fs.existsSync(link) && fs.existsSync(target)) fs.symlinkSync(target, link, 'junction');
  }
}

// Só agora o pg resolve (o proxy/node_modules acabou de ser ligado).
const { default: pg } = await import('pg');
const { DATABASES: defaults } = await import('../test/helpers/databases.js');
const adminUrl = new URL(defaults.postgres);
if (adminUrl.pathname.slice(1).startsWith('queryit_wt_')) adminUrl.pathname = '/queryit';
const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 3000 });

try {
  await admin.connect();
} catch (err) {
  console.error(`Postgres de teste fora do ar (${err.message}). Rode \`npm run db:up\` no checkout principal.`);
  process.exit(1);
}

try {
  const exists = (await admin.query('select 1 from pg_database where datname = $1', [dbName])).rowCount > 0;
  if (action === 'setup') {
    if (!exists) await admin.query(`create database ${dbName}`);
    const url = new URL(adminUrl);
    url.pathname = `/${dbName}`;
    fs.writeFileSync(ENV_FILE, `# Gerado por npm run agent:setup: banco exclusivo deste worktree.\nQUERYIT_TEST_POSTGRES=${url.href}\n`);
    const { seed } = await import('../test/helpers/databases.js');
    await seed('postgres', url.href);
    console.log(`Worktree pronto: banco ${dbName} (${url.href}), node_modules ligados ao checkout principal.`);
    console.log('Navegador: um agente por vez (portas 5500/3000 são fixas no .claude/launch.json).');
  } else {
    if (exists) await admin.query(`drop database ${dbName} with (force)`);
    fs.rmSync(ENV_FILE, { force: true });
    for (const rel of LINKS) {
      const link = path.join(root, rel);
      if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
    }
    console.log(`Worktree desmontado: banco ${dbName} removido, junctions apagadas. Agora: git worktree remove ${root}`);
  }
} finally {
  await admin.end();
}
