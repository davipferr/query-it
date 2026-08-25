import mysql from 'mysql2/promise';

export async function runQuery(connectionString, sql) {
  const connection = await mysql.createConnection({
    uri: connectionString,
    connectTimeout: 8000,
  });

  try {
    await connection.query('SET SESSION MAX_EXECUTION_TIME = 10000');
    const [rows, fields] = await connection.query(sql);
    const columns = fields.map((f) => f.name);
    return {
      columns,
      rows: rows.map((row) => columns.map((c) => row[c])),
    };
  } finally {
    await connection.end();
  }
}

export function extractHost(connectionString) {
  const url = new URL(connectionString);
  return url.hostname;
}
