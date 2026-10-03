import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { selectPreset } from "../../js/sql-preset.js";
import { precheckReadOnly } from "../../js/sql-guard.js";
import { assertReadOnly } from "../../proxy/lib/sql-guard.js";

describe("selectPreset", () => {
  test("postgres cita com aspas duplas e usa LIMIT", () => {
    assert.equal(
      selectPreset("postgres", "public", "order items"),
      'SELECT * FROM "public"."order items" LIMIT 100',
    );
  });

  test("mysql cita com crase e usa LIMIT", () => {
    assert.equal(
      selectPreset("mysql", "queryit", "order items"),
      "SELECT * FROM `queryit`.`order items` LIMIT 100",
    );
  });

  test("mssql cita com colchetes e usa TOP", () => {
    assert.equal(
      selectPreset("mssql", "dbo", "order items"),
      "SELECT TOP 100 * FROM [dbo].[order items]",
    );
  });

  test("escapa o caractere de citação dentro do nome", () => {
    assert.equal(selectPreset("postgres", "public", 'a"b'), 'SELECT * FROM "public"."a""b" LIMIT 100');
    assert.equal(selectPreset("mysql", "db", "a`b"), "SELECT * FROM `db`.`a``b` LIMIT 100");
    assert.equal(selectPreset("mssql", "dbo", "a]b"), 'SELECT TOP 100 * FROM [dbo]."a]b"');
    assert.equal(selectPreset("mssql", "dbo", 'a"]b'), 'SELECT TOP 100 * FROM [dbo]."a""]b"');
  });

  test("preserva maiúsculas (Postgres diferencia nomes citados)", () => {
    assert.equal(selectPreset("postgres", "public", "Clientes"), 'SELECT * FROM "public"."Clientes" LIMIT 100');
  });

  // O preset precisa passar pelas duas checagens que vêm depois do clique.
  const names = ["customers", "order items", "Clientes", 'a"b', "a`b", "a]b", "select", "user"];
  for (const dbType of ["postgres", "mysql", "mssql"]) {
    for (const table of names) {
      test(`${dbType}: "${table}" passa pelo pré-check do cliente e pelo guard do proxy`, () => {
        const sql = selectPreset(dbType, "s", table);
        assert.deepEqual(precheckReadOnly(sql), { ok: true }, sql);
        assert.doesNotThrow(() => assertReadOnly(sql, dbType), sql);
      });
    }
  }
});
