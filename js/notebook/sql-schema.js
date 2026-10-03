// Schema carregado pelo explorer, reaproveitado no autocompletar do editor SQL.
// Sem dependência de DOM nem de CodeMirror, para ser testável no Node.

let tables = [];
const listeners = new Set();

// tables: [{ schema, table, columns: [{ name, type }] }], o mesmo formato da árvore do sidebar.
export function setSchemaTables(next) {
  tables = next;
  for (const fn of listeners) fn(tables);
}

export function getSchemaTables() {
  return tables;
}

export function onSchemaChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// O lang-sql trata "." na chave como separador de namespace; nomes com ponto precisam de escape.
const escapeDots = (name) => name.replaceAll('.', '\\.');

// Namespace aninhado { schema: { tabela: [colunas] } } no formato que o sql() do lang-sql aceita.
// Colunas vão como string para o lang-sql citar sozinho os nomes que precisam de aspas.
export function buildNamespace(list) {
  const namespace = {};
  for (const { schema, table, columns } of list) {
    const tablesOfSchema = (namespace[escapeDots(schema)] ??= {});
    tablesOfSchema[escapeDots(table)] = columns.map((c) => c.name);
  }
  return namespace;
}

// Schema cujas tabelas aparecem sem prefixo. MySQL não tem um padrão fixo (o schema é o banco),
// então só há default quando existe um schema só.
const DEFAULT_SCHEMA = { postgres: 'public', mssql: 'dbo' };

export function pickDefaultSchema(list, dbType) {
  const schemas = new Set(list.map((t) => t.schema));
  const preferred = DEFAULT_SCHEMA[dbType];
  if (preferred && schemas.has(preferred)) return preferred;
  return schemas.size === 1 ? [...schemas][0] : undefined;
}

// Mesmas regras de citação do lang-sql: Postgres diferencia maiúsculas, MySQL e SQL Server não.
const QUOTES = { postgres: ['"', '"'], mysql: ['`', '`'], mssql: ['[', ']'] };

export function quoteIfNeeded(dbType, name) {
  const plain = dbType === 'postgres' ? /^[a-z_][a-z_\d]*$/ : /^[a-z_][a-z_\d]*$/i;
  if (plain.test(name)) return name;
  const [open, close] = QUOTES[dbType] || QUOTES.postgres;
  return open + name.replaceAll(close, close + close) + close;
}

// Colunas sugeridas sem qualificação: as das tabelas citadas no texto da consulta.
// O lang-sql só completa colunas depois de "tabela." ou "alias.", o que não cobre "SELECT na|".
export function columnsInQuery(list, sql) {
  const text = sql.toLowerCase();
  const seen = new Map();
  for (const { table, columns } of list) {
    if (!mentions(text, table.toLowerCase())) continue;
    for (const c of columns) {
      if (!seen.has(c.name)) seen.set(c.name, { name: c.name, type: c.type, table });
    }
  }
  return [...seen.values()];
}

function mentions(text, name) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at === -1) return false;
    const before = text[at - 1];
    const after = text[at + name.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

const isWordChar = (ch) => ch !== undefined && /[\w$]/.test(ch);
