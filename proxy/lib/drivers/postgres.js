import pg from 'pg';

export async function runQuery(connectionString, sql) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8000,
    statement_timeout: 10000,
  });

  await client.connect();
  try {
    const result = await client.query(sql);
    const columns = result.fields.map((f) => f.name);
    return {
      columns,
      rows: result.rows.map((row) => columns.map((c) => row[c])),
    };
  } finally {
    await client.end();
  }
}

export function extractHost(connectionString) {
  const url = new URL(connectionString);
  return url.hostname;
}
