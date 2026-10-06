import mysql from 'mysql2/promise';

// Monta a config só com os campos da URL. O mysql2 aceitaria qualquer opção via
// query string (?socketPath=, ?multipleStatements=, ?localAddress=...), o que deixaria
// a conexão ir para um lugar diferente do que o ssrf-guard checou.
export function parseConnection(connectionString) {
  const url = new URL(connectionString);
  if (url.protocol !== 'mysql:') {
    throw new Error('A connection string do MySQL deve começar com mysql://');
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: sslFromParam(url.searchParams.get('ssl')),
  };
}

// Aceita ?ssl=true ou ?ssl={"rejectUnauthorized":false} (formato comum de provedores).
function sslFromParam(value) {
  if (!value || value === 'false') return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return { rejectUnauthorized: parsed.rejectUnauthorized !== false };
    }
  } catch {
    // valor não-JSON: trata como "ligado"
  }
  return { rejectUnauthorized: true };
}

// Interrompe a consulta em andamento da conexão `threadId`. Precisa de outra conexão porque a
// primeira está ocupada; usa a mesma config já checada pelo ssrf-guard. É SQL do driver, não do usuário.
async function killQuery(config, threadId) {
  let killer;
  try {
    killer = await mysql.createConnection({ ...config, connectTimeout: 8000 });
    await killer.query(`KILL QUERY ${Number(threadId)}`);
  } catch {
    // Melhor esforço: se falhar, o MAX_EXECUTION_TIME ainda encerra a consulta.
  } finally {
    await killer?.end().catch(() => {});
  }
}

export async function runQuery(config, sql, { maxRows, signal }) {
  signal?.throwIfAborted();
  const connection = await mysql.createConnection({
    ...config,
    connectTimeout: 8000,
    multipleStatements: false,
  });
  const cancel = () => killQuery(config, connection.threadId);
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    signal?.throwIfAborted();
    await connection.query('SET SESSION MAX_EXECUTION_TIME = 10000');
    // Teto de linhas aplicado pelo servidor ao SELECT de topo (um LIMIT explícito do usuário prevalece).
    await connection.query('SET SESSION sql_select_limit = ?', [Number(maxRows)]);
    await connection.query('START TRANSACTION READ ONLY');
    // Um KILL QUERY entre comandos acha a conexão ociosa e não para nada: checa antes da consulta.
    signal?.throwIfAborted();
    const [rows, fields] = await connection.query(sql);
    const columns = fields.map((f) => f.name);
    return {
      columns,
      rows: rows.slice(0, maxRows).map((row) => columns.map((c) => row[c])),
    };
  } finally {
    signal?.removeEventListener('abort', cancel);
    // Fechar a conexão descarta a transação; nada é commitado.
    await connection.end();
  }
}
