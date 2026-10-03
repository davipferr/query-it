// Verifica onde o pg realmente conectaria, interceptando o pg.Client: independe de como o
// agente estruturou a correção.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../proxy/package.json", import.meta.url));
const pg = require("pg");
const { parse } = require("pg-connection-string");
const postgres = await import("../../proxy/lib/drivers/postgres.js");

async function connectedTarget(connectionString) {
  const config = postgres.parseConnection(connectionString);
  let captured;
  const Original = pg.Client;
  pg.Client = class {
    constructor(c) {
      captured = c;
    }
    async connect() {
      throw new Error("stop");
    }
    async end() {}
  };
  try {
    await postgres.runQuery(config, "select 1", { maxRows: 1 });
  } catch {
    // esperado: o fake recusa conectar
  } finally {
    pg.Client = Original;
  }
  // pg aplica a connection string por cima da config solta.
  const fromString = captured.connectionString ? parse(captured.connectionString) : {};
  return { checked: config.host, host: fromString.host ?? captured.host, port: Number(fromString.port ?? captured.port), user: fromString.user ?? captured.user, password: fromString.password ?? captured.password, database: fromString.database ?? captured.database };
}

for (const attack of [
  "postgres://u:p@db.example.com:5432/d?host=127.0.0.1",
  "postgres://u:p@db.example.com/d?host=/var/run/postgresql",
  "postgresql://u:p@db.example.com/d?host=localhost&port=5432",
]) {
  test(`host checado = host conectado: ${attack}`, async () => {
    const t = await connectedTarget(attack);
    assert.equal(t.checked, "db.example.com");
    assert.equal(t.host, "db.example.com");
  });
}

test("connection string normal continua funcionando", async () => {
  const t = await connectedTarget("postgres://ana:s%40nha@db.example.com:6543/vendas");
  assert.deepEqual(
    { host: t.host, port: t.port, user: t.user, password: t.password, database: t.database },
    { host: "db.example.com", port: 6543, user: "ana", password: "s@nha", database: "vendas" },
  );
});

test("porta padrão 5432", async () => {
  const t = await connectedTarget("postgres://u:p@db.example.com/d");
  assert.equal(t.port || 5432, 5432);
});
