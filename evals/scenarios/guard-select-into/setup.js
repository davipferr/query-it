// Planta o bug: o guard volta a aceitar SELECT ... INTO, e os testes que pegariam isso somem.
export default function setup(ws) {
  ws.replace(
    "proxy/lib/sql-guard.js",
    `    // SELECT ... INTO cria tabela (Postgres/SQL Server) ou grava arquivo (MySQL INTO OUTFILE).
    if (node.type === 'into' && (node.expr || node.keyword)) {
      throw new Error('SELECT ... INTO não é permitido.');
    }
`,
    "",
  );
  ws.replace(
    "proxy/test/sql-guard.test.js",
    `    ['postgres', 'select * into copia from customers'],
    ['postgres', 'select 1 union select * into copia from customers'],
    ['mysql', "select * from customers into outfile '/tmp/x'"],
    ['mysql', "select * into dumpfile '/tmp/x' from customers"],
`,
    "",
  );
}
