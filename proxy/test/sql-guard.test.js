import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnly, applyRowLimit } from '../lib/sql-guard.js';

const allows = (sql, db = 'postgres') => assert.doesNotThrow(() => assertReadOnly(sql, db), sql);
const blocks = (sql, db = 'postgres') => assert.throws(() => assertReadOnly(sql, db), Error, sql);

describe('assertReadOnly: consultas legítimas passam', () => {
  const cases = {
    postgres: [
      'select 1',
      'SELECT * FROM customers',
      'SeLeCt id FROM customers',
      'with paid as (select * from orders where status = \'paid\') select * from paid',
      'select 1 union select 2',
      'select 1;',
      '/* comentário */ select 1',
      'select 1 -- ; drop table customers',
      'select * from "order items"',
    ],
    mysql: ['select 1', 'select * from `order items`', 'select count(*) from orders group by status'],
    mssql: ['select 1', 'select top 5 * from customers', 'select * from [order items]'],
  };
  for (const [db, list] of Object.entries(cases)) {
    for (const sql of list) test(`${db}: ${sql}`, () => allows(sql, db));
  }
});

describe('assertReadOnly: escrita e comandos empilhados são bloqueados', () => {
  const cases = {
    postgres: [
      '',
      'delete from customers',
      'update customers set name = \'x\'',
      'insert into customers values (9, \'x\', null, null)',
      'drop table customers',
      'truncate customers',
      'select 1; drop table customers',
      'select 1;drop table customers',
      'begin',
      'set role postgres',
      'copy customers to \'/tmp/x\'',
      'explain analyze delete from customers',
      'with d as (delete from customers returning *) select * from d',
      'select * from customers for update',
    ],
    mysql: ['select 1; drop table x', 'delete from customers', 'handler customers open'],
    mssql: [
      'select 1; exec sp_who',
      'exec xp_cmdshell \'dir\'',
      'waitfor delay \'00:01\'',
      'select * into copia from customers',
    ],
  };
  for (const [db, list] of Object.entries(cases)) {
    for (const sql of list) test(`${db}: ${JSON.stringify(sql)}`, () => blocks(sql, db));
  }

  test('dbType desconhecido', () => blocks('select 1', 'oracle'));
});

// Brechas conhecidas: o parser aceita como "select", mas o comando escreve ou tem efeito colateral.
// Ficam como todo até a correção; quando corrigidas, removam o `todo`.
describe('assertReadOnly: brechas conhecidas', () => {
  const gaps = [
    ['postgres', 'select * into copia from customers', 'SELECT INTO cria tabela'],
    ['mysql', 'select * from customers into outfile \'/tmp/x\'', 'INTO OUTFILE grava arquivo no servidor'],
    ['postgres', 'select set_config(\'search_path\', \'x\', false)', 'função com efeito colateral'],
    ['postgres', 'select pg_terminate_backend(1)', 'função com efeito colateral'],
    ['postgres', 'select lo_import(\'/etc/passwd\')', 'função com efeito colateral'],
    ['postgres', 'select dblink_exec(\'x\', \'drop table y\')', 'escreve por outra conexão'],
  ];
  for (const [db, sql, why] of gaps) {
    test(`${db}: ${sql}`, { todo: why }, () => blocks(sql, db));
  }
});

describe('applyRowLimit', () => {
  test('adiciona LIMIT quando não há', () => {
    assert.equal(applyRowLimit('select * from t', 'postgres', 10), 'select * from t LIMIT 10');
  });
  test('mantém LIMIT explícito', () => {
    assert.equal(applyRowLimit('select * from t limit 5', 'mysql', 10), 'select * from t limit 5');
  });
  test('remove ponto e vírgula final', () => {
    assert.equal(applyRowLimit('select * from t;', 'postgres', 10), 'select * from t LIMIT 10');
  });
  test('mssql usa TOP', () => {
    assert.equal(applyRowLimit('select * from t', 'mssql', 10), 'SELECT TOP 10 * from t');
  });
  test('mssql mantém TOP explícito', () => {
    assert.equal(applyRowLimit('select top 5 * from t', 'mssql', 10), 'select top 5 * from t');
  });

  test('comentário de linha no fim não engole o LIMIT', { todo: 'LIMIT vai parar dentro do comentário' }, () => {
    assert.match(applyRowLimit('select * from t -- fim', 'postgres', 10), /\n.*LIMIT 10|LIMIT 10[^]*--/);
  });
  test('LIMIT de subquery não dispensa o limite externo', { todo: 'regex vê o LIMIT interno' }, () => {
    assert.match(applyRowLimit('select * from (select * from t limit 5) x', 'postgres', 10), /x LIMIT 10$/);
  });
  test('mssql: DISTINCT vem antes do TOP', { todo: 'gera "SELECT TOP 10 distinct", inválido em T-SQL' }, () => {
    assert.match(applyRowLimit('select distinct a from t', 'mssql', 10), /^select distinct top 10/i);
  });
});
