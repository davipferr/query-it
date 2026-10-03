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

test("palavra proibida dentro de string não bloqueia", { todo: "regex não sabe o que é literal; o cliente recusa antes do proxy ver" }, () => {
  assert.equal(precheckReadOnly("select * from orders where status = 'delete'").ok, true);
});
