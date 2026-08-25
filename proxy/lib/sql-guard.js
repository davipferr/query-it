// node-sql-parser é CommonJS puro — sob ESM, precisa importar o default e
// desestruturar, "import { Parser }" direto quebra em runtime no Node.
import pkg from 'node-sql-parser';
const { Parser } = pkg;

// Camada 2 de defesa (a que realmente decide): parser de AST, não regex.
// Regex é bypassável com comentários/case/statements empilhados; AST não.
const DIALECTS = {
  postgres: 'postgresql',
  mysql: 'mysql',
  mssql: 'transactsql',
};

const parser = new Parser();

export function assertReadOnly(sql, dbType) {
  const dialect = DIALECTS[dbType];
  if (!dialect) {
    throw new Error(`Tipo de banco não suportado: ${dbType}`);
  }

  let ast;
  try {
    ast = parser.astify(sql, { database: dialect });
  } catch (err) {
    throw new Error(`SQL inválido: ${err.message}`);
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) {
    throw new Error('Apenas um comando por execução é permitido.');
  }

  const [stmt] = statements;
  if (stmt.type !== 'select') {
    throw new Error(`Somente consultas SELECT são permitidas (recebido: ${stmt.type}).`);
  }
}

// Aplica um teto de linhas caso a query não tenha um limite explícito.
// Abordagem pragmática por regex — cobre o caso comum; não tenta reescrever
// a AST inteira para casos exóticos (subqueries com LIMIT próprio, etc.).
export function applyRowLimit(sql, dbType, maxRows) {
  const trimmed = sql.trim().replace(/;$/, '');

  if (dbType === 'mssql') {
    if (/\btop\s+\d+/i.test(trimmed)) return trimmed;
    return trimmed.replace(/^select/i, `SELECT TOP ${maxRows}`);
  }

  if (/\blimit\s+\d+/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${maxRows}`;
}
