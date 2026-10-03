import pg from 'pg';

// Monta a config só com os campos da URL. Parâmetros como ?host=, ?sslcert= ou
// ?options= são ignorados de propósito: o pg os respeitaria e conectaria num host
// diferente do que o ssrf-guard checou (ou leria arquivos do servidor do proxy).
export function parseConnection(connectionString) {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('A connection string do Postgres deve começar com postgres://');
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: sslFromMode(url.searchParams.get('sslmode')),
  };
}

function sslFromMode(mode) {
  if (!mode || mode === 'disable') return false;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  return true;
}

export async function runQuery(config, sql, { maxRows }) {
  const client = new pg.Client({
    ...config,
    connectionTimeoutMillis: 8000,
    statement_timeout: 10000,
  });

  await client.connect();
  try {
    // Transação read-only: mesmo que algo passe pelo sql-guard, o Postgres recusa escrita.
    await client.query('begin read only');
    // Cursor + FETCH limita as linhas no servidor sem reescrever a consulta do usuário.
    // O modo extended faz o Postgres recusar mais de um comando na mesma string.
    await client.query({
      text: `declare queryit_cursor no scroll cursor for ${sql.trim().replace(/;\s*$/, '')}`,
      queryMode: 'extended',
    });
    const result = await client.query(`fetch ${Number(maxRows)} from queryit_cursor`);
    const columns = result.fields.map((f) => f.name);
    return {
      columns,
      rows: result.rows.map((row) => columns.map((c) => row[c])),
    };
  } finally {
    // Fechar a conexão descarta a transação; nada é commitado.
    await client.end();
  }
}
