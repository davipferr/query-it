import sql from 'mssql';

export async function runQuery(connectionString, sqlText) {
  const pool = await sql.connect({
    ...parseAdoConnectionString(connectionString),
    options: { trustServerCertificate: true },
    connectionTimeout: 8000,
    requestTimeout: 10000,
  });

  try {
    const result = await pool.request().query(sqlText);
    const first = result.recordset[0];
    const columns = first ? Object.keys(first) : [];
    return {
      columns,
      rows: result.recordset.map((row) => columns.map((c) => row[c])),
    };
  } finally {
    await pool.close();
  }
}

export function extractHost(connectionString) {
  const match = /Server=([^,;]+)/i.exec(connectionString);
  if (!match) {
    throw new Error('Não foi possível extrair o host da connection string do SQL Server.');
  }
  return match[1].trim();
}

// Parser simples de connection string no formato ADO.NET:
// "Server=host,porta;Database=db;User Id=usuario;Password=senha;"
function parseAdoConnectionString(connectionString) {
  const parts = Object.fromEntries(
    connectionString
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf('=');
        return [pair.slice(0, idx).trim().toLowerCase(), pair.slice(idx + 1).trim()];
      }),
  );

  const [host, port] = String(parts.server || '').split(',');
  return {
    server: host,
    port: port ? Number(port) : 1433,
    database: parts.database,
    user: parts['user id'] || parts.uid,
    password: parts.password || parts.pwd,
  };
}
