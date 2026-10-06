// Conexões salvas: migrar o formato antigo, nunca ficar sem conexão ativa, histórico por conexão.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSettings,
  flatten,
  newConnectionId,
  upsertConnection,
  removeConnection,
  setActive,
  DEFAULT_NAME,
} from "../../js/connections.js";
import { connectionKey, getHistory, addToHistory, HISTORY_KEY, MAX_PER_CONNECTION, MAX_CONNECTIONS } from "../../js/history.js";

const DEFAULTS = { dbType: "postgres", proxyUrl: "http://localhost:3000/api/query" };
const PG = "postgres://u:p@localhost:55432/db";

test("formato antigo vira uma conexão Padrão ativa", () => {
  const s = normalizeSettings({ dbType: "mysql", connectionString: "mysql://x", proxyUrl: "http://p" }, DEFAULTS);
  assert.deepEqual(s, {
    proxyUrl: "http://p",
    activeId: "conn_1",
    connections: [{ id: "conn_1", name: DEFAULT_NAME, dbType: "mysql", connectionString: "mysql://x" }],
  });
  assert.deepEqual(
    { dbType: flatten(s).dbType, connectionString: flatten(s).connectionString, proxyUrl: flatten(s).proxyUrl },
    { dbType: "mysql", connectionString: "mysql://x", proxyUrl: "http://p" },
  );
});

test("nada salvo ou lixo vira uma conexão vazia com os padrões", () => {
  for (const raw of [null, "x", [], { connections: [] }, { connections: [null, 5, { id: "" }] }]) {
    const s = normalizeSettings(raw, DEFAULTS);
    assert.equal(s.connections.length, 1);
    assert.equal(flatten(s).dbType, "postgres");
    assert.equal(flatten(s).connectionString, "");
    assert.equal(s.proxyUrl, DEFAULTS.proxyUrl);
  }
});

test("ids repetidos são descartados e activeId desconhecido cai na primeira", () => {
  const s = normalizeSettings(
    {
      activeId: "nao-existe",
      connections: [
        { id: "conn_1", name: "A", dbType: "postgres", connectionString: PG },
        { id: "conn_1", name: "B", dbType: "mysql", connectionString: "x" },
        { id: "conn_2", name: " ", dbType: 5, connectionString: null },
      ],
    },
    DEFAULTS,
  );
  assert.deepEqual(s.connections.map((c) => c.name), ["A", DEFAULT_NAME]);
  assert.equal(s.connections[1].dbType, "postgres");
  assert.equal(s.connections[1].connectionString, "");
  assert.equal(s.activeId, "conn_1");
});

test("criar, trocar a ativa e remover", () => {
  let s = normalizeSettings({ connectionString: PG }, DEFAULTS);
  const id = newConnectionId(s.connections);
  assert.equal(id, "conn_2");
  s = upsertConnection(s, { id, name: "Produção", dbType: "mssql", connectionString: "Server=x" });
  s = setActive(s, id);
  assert.equal(flatten(s).connectionName, "Produção");
  assert.equal(flatten(s).dbType, "mssql");
  assert.equal(setActive(s, "nao-existe"), s);

  s = removeConnection(s, id);
  assert.equal(s.connections.length, 1);
  assert.equal(s.activeId, "conn_1");
  assert.equal(removeConnection(s, "conn_1"), s, "a última conexão não sai");
});

function memoryStorage() {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test("a chave do histórico não contém a connection string", async () => {
  const key = await connectionKey({ dbType: "postgres", connectionString: PG });
  assert.match(key, /^[0-9a-f]{24}$/);
  assert.notEqual(key, await connectionKey({ dbType: "mysql", connectionString: PG }));
  assert.equal(key, await connectionKey({ dbType: "postgres", connectionString: PG }));
});

test("histórico: mais recente primeiro, sem duplicar, limitado", () => {
  const storage = memoryStorage();
  addToHistory("k", "select 1", storage);
  addToHistory("k", "select 2", storage);
  addToHistory("k", "  select 1  ", storage);
  addToHistory("k", "   ", storage);
  assert.deepEqual(getHistory("k", storage), ["select 1", "select 2"]);
  assert.deepEqual(getHistory("outra", storage), []);

  for (let i = 0; i < MAX_PER_CONNECTION + 5; i++) addToHistory("k", `select ${i}`, storage);
  assert.equal(getHistory("k", storage).length, MAX_PER_CONNECTION);
});

test("histórico guarda só as conexões usadas mais recentemente", () => {
  const storage = memoryStorage();
  for (let i = 0; i <= MAX_CONNECTIONS; i++) addToHistory(`k${i}`, "select 1", storage);
  const keys = Object.keys(JSON.parse(storage.data[HISTORY_KEY]));
  assert.equal(keys.length, MAX_CONNECTIONS);
  assert.equal(keys.includes("k0"), false);
});

test("histórico corrompido não quebra", () => {
  const storage = memoryStorage();
  storage.setItem(HISTORY_KEY, "{lixo");
  assert.deepEqual(getHistory("k", storage), []);
  storage.setItem(HISTORY_KEY, JSON.stringify({ k: ["ok", 5, null] }));
  assert.deepEqual(getHistory("k", storage), ["ok"]);
});
