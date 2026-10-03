import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { callHandler } from './helpers/call-handler.js';
import { DATABASES, MANY_ROWS, isReachable, seed } from './helpers/databases.js';
import { selectPreset } from '../../js/sql-preset.js';

describe('POST /api/query: validação (sem banco)', () => {
  test('OPTIONS responde 204 (preflight CORS)', async () => {
    const { status } = await callHandler(undefined, { method: 'OPTIONS' });
    assert.equal(status, 204);
  });

  test('GET é recusado', async () => {
    const { status } = await callHandler(undefined, { method: 'GET' });
    assert.equal(status, 405);
  });

  for (const [name, body, pattern] of [
    ['dbType inválido', { dbType: 'oracle', connectionString: 'x', sql: 'select 1' }, /dbType/],
    ['sem connectionString', { dbType: 'postgres', sql: 'select 1' }, /connectionString/],
    ['sem sql', { dbType: 'postgres', connectionString: 'postgres://u@h/d' }, /sql/],
  ]) {
    test(name, async () => {
      const { status, body: res } = await callHandler(body);
      assert.equal(status, 400);
      assert.match(res.error, pattern);
    });
  }

  test('escrita é bloqueada antes de conectar', async () => {
    const { status, body } = await callHandler({
      dbType: 'postgres',
      connectionString: 'postgres://u:p@host-que-nao-existe.invalid/db',
      sql: 'drop table customers',
    });
    assert.equal(status, 400);
    assert.match(body.error, /SELECT/);
  });

  test('erro nunca devolve a senha da connection string', async () => {
    const { body } = await callHandler({
      dbType: 'postgres',
      connectionString: 'postgres://usuario:senha-secreta@127.0.0.1:1/db',
      sql: 'select 1',
    });
    assert.doesNotMatch(JSON.stringify(body), /senha-secreta/);
  });
});

// Cada banco só roda se estiver de pé (npm run db:up); senão os testes aparecem como skipped.
for (const dbType of Object.keys(DATABASES)) {
  const reachable = await isReachable(dbType);
  const skip = reachable ? false : `${dbType} fora do ar (npm run db:up)`;

  describe(`POST /api/query contra ${dbType}`, { skip }, () => {
    const run = (sql) => callHandler({ dbType, connectionString: DATABASES[dbType], sql });

    before(async () => {
      process.env.ALLOW_PRIVATE_HOSTS = 'true';
      await seed(dbType);
    });

    test('devolve colunas e linhas', async () => {
      const { status, body } = await run('select id, name from customers order by id');
      assert.equal(status, 200, body.error);
      assert.deepEqual(body.columns, ['id', 'name']);
      assert.equal(body.rowCount, 4);
      assert.deepEqual(body.rows[0], [1, 'Ana Souza']);
      assert.equal(body.truncated, false);
    });

    test('tabela com espaço no nome', async () => {
      const q = { postgres: '"order items"', mysql: '`order items`', mssql: '[order items]' }[dbType];
      const { status, body } = await run(`select count(*) as n from ${q}`);
      assert.equal(status, 200, body.error);
      assert.equal(Number(body.rows[0][0]), 3);
    });

    test('SELECT gerado pelo schema explorer roda em tabela com espaço', async () => {
      const schema = { postgres: 'public', mysql: 'queryit', mssql: 'dbo' }[dbType];
      const { status, body } = await run(selectPreset(dbType, schema, 'order items'));
      assert.equal(status, 200, body.error);
      assert.equal(body.rowCount, 3);
    });

    test('consulta de introspecção do schema explorer', async () => {
      const { status, body } = await run(
        "select table_name, column_name from information_schema.columns where table_name = 'customers'",
      );
      assert.equal(status, 200, body.error);
      assert.ok(body.rowCount >= 4);
    });

    test('escrita é bloqueada e o dado continua lá', async () => {
      const { status } = await run('delete from customers');
      assert.equal(status, 400);
      const after = await run('select count(*) from customers');
      assert.equal(Number(after.body.rows[0][0]), 4);
    });

    test('teto de 1000 linhas e flag truncated', async () => {
      const { status, body } = await run(MANY_ROWS[dbType]);
      assert.equal(status, 200, body.error);
      assert.equal(body.rowCount, 1000);
      assert.equal(body.truncated, true);
    });

    test('teto vale com comentário de linha no fim', async () => {
      const { status, body } = await run(`${MANY_ROWS[dbType]} -- fim`);
      assert.equal(status, 200, body.error);
      assert.equal(body.rowCount, 1000);
    });

    test('teto vale com LIMIT/TOP só numa subquery', async () => {
      const inner = {
        postgres: 'select * from (select n from generate_series(1, 5000) as n limit 4000) x',
        mysql: `select * from (${MANY_ROWS.mysql} limit 1500) x`,
        mssql: 'select * from (select top 1500 a.object_id from sys.all_objects a cross join (select 1 as x union all select 2) b) t',
      }[dbType];
      const { status, body } = await run(inner);
      assert.equal(status, 200, body.error);
      assert.equal(body.rowCount, 1000);
    });

    test('limite menor do usuário é respeitado', async () => {
      const sql = dbType === 'mssql' ? 'select top 2 * from customers' : 'select * from customers limit 2';
      const { status, body } = await run(sql);
      assert.equal(status, 200, body.error);
      assert.equal(body.rowCount, 2);
    });

    test('DISTINCT continua funcionando', async () => {
      const { status, body } = await run('select distinct country from customers');
      assert.equal(status, 200, body.error);
      assert.equal(body.rowCount, 3);
    });

    test('ponto e vírgula no fim é aceito', async () => {
      const { status, body } = await run('select count(*) from customers;');
      assert.equal(status, 200, body.error);
    });

    test('erro de SQL volta como 400 com mensagem', async () => {
      const { status, body } = await run('select * from tabela_que_nao_existe');
      assert.equal(status, 400);
      assert.ok(body.error);
    });

    if (dbType === 'postgres') {
      test('transação read-only segura escrita que o guard não reconhece', async () => {
        const { status, body } = await run("select nextval('order_seq')");
        assert.equal(status, 400);
        assert.match(body.error, /read-only/);
      });
    }
  });
}
