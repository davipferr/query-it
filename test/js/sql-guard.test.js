// Pré-checagem do cliente: é só UX, mas não pode recusar consultas válidas nem deixar passar o óbvio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { precheckReadOnly } from "../../js/sql-guard.js";

for (const sql of [
  "select 1",
  "  SELECT * FROM customers;  ",
  "with x as (select 1) select * from x",
]) {
  test(`aceita: ${sql.trim()}`, () => {
    assert.deepEqual(precheckReadOnly(sql), { ok: true });
  });
}

for (const [sql, reason] of [
  ["", /Escreva/],
  ["select 1; select 2", /um comando/],
  ["delete from customers", /SELECT/],
  ["show tables", /começar com SELECT/],
]) {
  test(`recusa: ${JSON.stringify(sql)}`, () => {
    const result = precheckReadOnly(sql);
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
  });
}

test("palavra proibida dentro de identificador não bloqueia", () => {
  assert.equal(precheckReadOnly("select updated_at, created_at from orders").ok, true);
});

test("palavra proibida dentro de string não bloqueia", () => {
  assert.equal(precheckReadOnly("select * from orders where status = 'delete'").ok, true);
});

for (const sql of [
  "select 'drop table x' as texto",
  "select 'it''s; delete' as texto",
  'select "delete" from t',
  "select `update` from t",
  "select [drop] from t",
  "select 1 -- delete tudo",
  "select /* ; drop */ 1",
  "/* comentário */ select 1",
  "-- relatório\nselect 1",
]) {
  test(`literal ou comentário não bloqueia: ${JSON.stringify(sql)}`, () => {
    assert.deepEqual(precheckReadOnly(sql), { ok: true });
  });
}

for (const [sql, reason] of [
  ["select 'a'; delete from customers", /um comando/],
  ["select 'x' from t where 1=1 or delete", /SELECT/],
  ["/* select */ delete from customers", /SELECT/],
  ["-- select\ndelete from customers", /SELECT/],
  ["select 1 /* fecha */; drop table t", /um comando/],
  ["'select' delete", /SELECT|começar/],
]) {
  test(`fora de literal continua bloqueando: ${JSON.stringify(sql)}`, () => {
    const result = precheckReadOnly(sql);
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
  });
}
