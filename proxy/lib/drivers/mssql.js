import sql from 'mssql';

// Formato ADO.NET: "Server=host,porta;Database=db;User Id=usuario;Password=senha;"
// Chaves repetidas e apelidos de Server são recusados: com eles, o host checado pelo
// ssrf-guard podia ser diferente do host em que a conexão realmente acontece.
const SERVER_ALIASES = ['data source', 'address', 'addr', 'network address'];

export function parseConnection(connectionString) {
  const parts = {};
  for (const pair of connectionString.split(';')) {
    if (!pair.trim()) continue;
    const idx = pair.indexOf('=');
    if (idx === -1) throw new Error('Connection string do SQL Server malformada.');
    const key = pair.slice(0, idx).trim().toLowerCase();
    if (key in parts) throw new Error(`Chave repetida na connection string: ${key}.`);
    parts[key] = pair.slice(idx + 1).trim();
  }

  if (SERVER_ALIASES.some((alias) => alias in parts)) {
    throw new Error('Use "Server=" para indicar o host do SQL Server.');
  }
  if (!parts.server) {
    throw new Error('Não foi possível extrair o host da connection string do SQL Server.');
  }

  const [host, port] = parts.server.split(',');
  return {
    host: host.trim(),
    port: port ? Number(port) : 1433,
    database: parts.database,
    user: parts['user id'] || parts.uid,
    password: parts.password || parts.pwd,
  };
}

export async function runQuery({ host, ...config }, sqlText, { maxRows, signal }) {
  signal?.throwIfAborted();
  // Pool próprio por consulta: sql.connect() devolve um pool global, compartilhado entre
  // requisições simultâneas com connection strings diferentes.
  const pool = await new sql.ConnectionPool({
    ...config,
    server: host,
    options: { trustServerCertificate: true },
    connectionTimeout: 8000,
    requestTimeout: 10000,
  }).connect();

  try {
    // SQL Server não tem transação read-only: tudo roda numa transação que sempre leva rollback.
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Teto de linhas no servidor, sem reescrever a consulta (vale também com TOP/DISTINCT/CTE).
      await new sql.Request(transaction).query(`SET ROWCOUNT ${Number(maxRows)}`);
      signal?.throwIfAborted();
      // cancel() manda um "attention" ao servidor na mesma conexão: não precisa de outra.
      const request = new sql.Request(transaction);
      const cancel = () => request.cancel();
      signal?.addEventListener('abort', cancel, { once: true });
      let result;
      try {
        result = await request.query(sqlText);
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
      const recordset = result.recordset || [];
      const columns = Object.keys(recordset.columns || recordset[0] || {});
      return {
        columns,
        rows: recordset.map((row) => columns.map((c) => row[c])),
      };
    } finally {
      await transaction.rollback().catch(() => {});
    }
  } finally {
    await pool.close();
  }
}
