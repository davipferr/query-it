import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnly } from '../lib/sql-guard.js';

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
      'select upper(name), count(*), now() from customers group by name',
      'select into_date from agenda',
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

describe('assertReadOnly: SELECT INTO e funções com efeito colateral são bloqueados', () => {
  const cases = [
    ['postgres', 'select * into copia from customers'],
    ['postgres', 'select 1 union select * into copia from customers'],
    ['mysql', "select * from customers into outfile '/tmp/x'"],
    ['mysql', "select * into dumpfile '/tmp/x' from customers"],
    ['postgres', "select set_config('search_path', 'x', false)"],
    ['postgres', "select pg_catalog.set_config('search_path', 'x', false)"],
    ['postgres', 'select pg_terminate_backend(1)'],
    ['postgres', "select lo_import('/etc/passwd')"],
    ['postgres', "select pg_read_file('/etc/passwd')"],
    ['postgres', "select dblink_exec('x', 'drop table y')"],
    ['postgres', "select * from customers where exists (select dblink('x', 'select 1'))"],
    ['postgres', "with x as (select query_to_xml('select 1', true, true, '')) select * from x"],
    ['postgres', 'select pg_advisory_lock(1)'],
    ['mysql', "select load_file('/etc/passwd')"],
  ];
  for (const [db, sql] of cases) test(`${db}: ${sql}`, () => blocks(sql, db));
});
