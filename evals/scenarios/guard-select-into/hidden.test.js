import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReadOnly } from "../../proxy/lib/sql-guard.js";

for (const [db, sql] of [
  ["postgres", "select * into backup_customers from customers"],
  ["postgres", "SELECT * INTO backup FROM customers WHERE id > 1"],
  ["postgres", "select 1 union select * into copia from customers"],
  ["mysql", "select * from customers into outfile '/tmp/x'"],
  ["mysql", "select * into dumpfile '/tmp/x' from customers"],
]) {
  test(`bloqueia ${db}: ${sql}`, () => assert.throws(() => assertReadOnly(sql, db)));
}

for (const [db, sql] of [
  ["postgres", "select into_date, intolerance from agenda"],
  ["postgres", "select 1 union select 2"],
  ["postgres", "select * from customers where name = 'into'"],
  ["mysql", "select * from customers"],
]) {
  test(`permite ${db}: ${sql}`, () => assert.doesNotThrow(() => assertReadOnly(sql, db)));
}
