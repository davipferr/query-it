import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPreset } from "../../js/sql-preset.js";
import { precheckReadOnly } from "../../js/sql-guard.js";
import { assertReadOnly } from "../../proxy/lib/sql-guard.js";

const passesGuards = (dbType, sql) => {
  assert.deepEqual(precheckReadOnly(sql), { ok: true }, sql);
  assert.doesNotThrow(() => assertReadOnly(sql, dbType), sql);
};

for (const dbType of ["postgres", "mysql", "mssql"]) {
  for (const table of ["order items", "select", "Clientes", "customers"]) {
    test(`${dbType}: "${table}" gera SQL válido para os guards`, () => {
      const sql = selectPreset(dbType, dbType === "mssql" ? "dbo" : "public", table);
      passesGuards(dbType, sql);
      assert.ok(sql.includes(table), `nome da tabela preservado: ${sql}`);
    });
  }
}

test("postgres preserva maiúsculas citando o nome", () => {
  assert.match(selectPreset("postgres", "public", "Clientes"), /"Clientes"/);
});

test("SQL Server não usa LIMIT", () => {
  const sql = selectPreset("mssql", "dbo", "customers");
  assert.doesNotMatch(sql, /\bLIMIT\b/i);
  assert.match(sql, /\bTOP\b/i);
});

test("aspas dentro do nome são escapadas (postgres)", () => {
  const sql = selectPreset("postgres", "public", 'a"b');
  passesGuards("postgres", sql);
  assert.match(sql, /"a""b"/);
});
