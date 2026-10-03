// SQL inserido pelo botão SELECT do schema explorer.
// Os nomes vêm do information_schema exatamente como estão no banco, então são sempre
// citados: espaços, palavras reservadas e maiúsculas (Postgres) funcionam sem adivinhação.
const QUOTE = {
  postgres: (name) => `"${name.replaceAll('"', '""')}"`,
  mysql: (name) => `\`${name.replaceAll("`", "``")}\``,
  // "]]" é válido no SQL Server, mas o parser do proxy (node-sql-parser) não entende e
  // recusaria a consulta. Aspas duplas valem no SQL Server (QUOTED_IDENTIFIER, ligado por
  // padrão no driver) e o parser aceita.
  mssql: (name) => (name.includes("]") ? `"${name.replaceAll('"', '""')}"` : `[${name}]`),
};

export function selectPreset(dbType, schema, table, limit = 100) {
  const quote = QUOTE[dbType] || QUOTE.postgres;
  const target = `${quote(schema)}.${quote(table)}`;
  if (dbType === "mssql") return `SELECT TOP ${limit} * FROM ${target}`;
  return `SELECT * FROM ${target} LIMIT ${limit}`;
}
