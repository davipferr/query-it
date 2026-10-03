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

  walk(stmt, (node) => {
    // SELECT ... INTO cria tabela (Postgres/SQL Server) ou grava arquivo (MySQL INTO OUTFILE).
    if (node.type === 'into' && (node.expr || node.keyword)) {
      throw new Error('SELECT ... INTO não é permitido.');
    }
    if (node.type === 'function') {
      const name = functionName(node);
      if (FORBIDDEN_FUNCTIONS.has(name) || FORBIDDEN_PREFIXES.some((p) => name.startsWith(p))) {
        throw new Error(`Função não permitida: ${name}.`);
      }
    }
  });
}

// Funções que escrevem, leem arquivos do servidor, mexem em outras sessões ou rodam SQL por
// outra conexão. É defesa em profundidade, não a barreira final: lista negra sempre deixa
// algo de fora. O que realmente segura escrita é a transação read-only nos drivers e, em
// produção, um usuário de banco só com SELECT.
const FORBIDDEN_FUNCTIONS = new Set([
  // Postgres
  'set_config',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_rotate_logfile',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'query_to_xml',
  'query_to_xmlschema',
  'query_to_xml_and_xmlschema',
  // MySQL
  'load_file',
  'sys_exec',
  'sys_eval',
  // SQL Server
  'openrowset',
  'opendatasource',
  'openquery',
]);
const FORBIDDEN_PREFIXES = ['dblink', 'lo_', 'pg_advisory', 'xp_', 'sp_'];

// O nome vem como string ou como { name: [{ value }] } dependendo da versão/dialeto do parser;
// "pg_catalog.set_config" precisa cair na mesma regra que "set_config".
function functionName(node) {
  const raw = typeof node.name === 'string'
    ? node.name
    : (node.name?.name || []).map((part) => part.value).join('.');
  return raw.toLowerCase().split('.').pop().replace(/^["`[]|["`\]]$/g, '');
}

function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}
