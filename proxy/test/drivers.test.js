// parseConnection define o host que o ssrf-guard checa E o host em que o driver conecta.
// Estes testes garantem que não existe jeito de os dois divergirem.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as postgres from '../lib/drivers/postgres.js';
import * as mysql from '../lib/drivers/mysql.js';
import * as mssql from '../lib/drivers/mssql.js';

describe('postgres.parseConnection', () => {
  test('lê os campos da URL', () => {
    assert.deepEqual(postgres.parseConnection('postgres://ana:s%40nha@db.example.com:6543/vendas'), {
      host: 'db.example.com',
      port: 6543,
      user: 'ana',
      password: 's@nha',
      database: 'vendas',
      ssl: false,
    });
  });

  test('ignora ?host= (pg conectaria nele no lugar do host checado)', () => {
    const config = postgres.parseConnection('postgres://u:p@db.example.com/d?host=127.0.0.1');
    assert.equal(config.host, 'db.example.com');
  });

  test('ignora socket unix e opções de arquivo', () => {
    const config = postgres.parseConnection(
      'postgres://u:p@db.example.com/d?host=/var/run/postgresql&sslcert=/etc/passwd&options=-c%20x=y',
    );
    assert.equal(config.host, 'db.example.com');
    assert.equal(Object.keys(config).some((k) => /sslcert|options/.test(k)), false);
  });

  test('IPv6 sem colchetes', () => {
    assert.equal(postgres.parseConnection('postgres://u:p@[::1]:5432/d').host, '::1');
  });

  test('sslmode', () => {
    assert.equal(postgres.parseConnection('postgres://u@h/d?sslmode=require').ssl, true);
    assert.deepEqual(postgres.parseConnection('postgres://u@h/d?sslmode=no-verify').ssl, { rejectUnauthorized: false });
    assert.equal(postgres.parseConnection('postgres://u@h/d?sslmode=disable').ssl, false);
  });

  test('recusa outro protocolo', () => {
    assert.throws(() => postgres.parseConnection('mysql://u@h/d'), /postgres:\/\//);
  });
});

describe('mysql.parseConnection', () => {
  test('lê os campos da URL', () => {
    assert.deepEqual(mysql.parseConnection('mysql://ana:pw@db.example.com/vendas'), {
      host: 'db.example.com',
      port: 3306,
      user: 'ana',
      password: 'pw',
      database: 'vendas',
      ssl: undefined,
    });
  });

  test('ignora socketPath, multipleStatements e outras opções da query string', () => {
    const config = mysql.parseConnection(
      'mysql://u:p@db.example.com/d?socketPath=/tmp/mysql.sock&multipleStatements=true&localAddress=10.0.0.1',
    );
    assert.equal(config.host, 'db.example.com');
    assert.equal(Object.keys(config).some((k) => /socketPath|multipleStatements|localAddress/.test(k)), false);
  });

  test('ssl', () => {
    assert.deepEqual(mysql.parseConnection('mysql://u@h/d?ssl=true').ssl, { rejectUnauthorized: true });
    assert.deepEqual(mysql.parseConnection('mysql://u@h/d?ssl={"rejectUnauthorized":false}').ssl, {
      rejectUnauthorized: false,
    });
  });
});

describe('mssql.parseConnection', () => {
  test('lê o formato ADO.NET', () => {
    assert.deepEqual(mssql.parseConnection('Server=db.example.com,1444;Database=vendas;User Id=ana;Password=pw;'), {
      host: 'db.example.com',
      port: 1444,
      database: 'vendas',
      user: 'ana',
      password: 'pw',
    });
  });

  test('recusa Server repetido (o driver usaria o último, o guard checava o primeiro)', () => {
    assert.throws(() => mssql.parseConnection('Server=8.8.8.8;Server=127.0.0.1;'), /repetida/);
  });

  test('recusa apelidos de Server', () => {
    assert.throws(() => mssql.parseConnection('Server=8.8.8.8;Data Source=127.0.0.1;'), /Server=/);
    assert.throws(() => mssql.parseConnection('Address=127.0.0.1;'), /Server=/);
  });

  test('sem Server', () => {
    assert.throws(() => mssql.parseConnection('Database=x;'), /host/);
  });
});
