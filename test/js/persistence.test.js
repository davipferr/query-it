// Persistência do notebook: o que entra no storage tem que voltar igual, e lixo não pode quebrar o app.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  CORRUPT_KEY,
  serialize,
  parse,
  maxCellNumber,
  loadNotebook,
  saveNotebook,
} from "../../js/notebook/persistence.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const CELLS = [
  { id: "cell_1", type: "sql", name: "customers", language: "sql", source: "select * from customers" },
  { id: "cell_3", type: "js", language: "js", source: "return customers.rows.length" },
];

test("save e load devolvem as mesmas células, na mesma ordem", () => {
  const storage = memoryStorage();
  assert.equal(saveNotebook(CELLS, storage), true);
  assert.deepEqual(loadNotebook(storage), { cells: CELLS, problem: null, backupKey: null });
  assert.equal(CORRUPT_KEY in storage.data, false);
});

test("storage vazio vira notebook vazio", () => {
  assert.deepEqual(loadNotebook(memoryStorage()), { cells: [], problem: null, backupKey: null });
});

test("storage inacessível vira notebook vazio, sem problema a reportar", () => {
  const storage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
  };
  assert.deepEqual(loadNotebook(storage), { cells: [], problem: null, backupKey: null });
});

test("JSON corrompido não quebra e vai para o backup", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
  assert.deepEqual(loadNotebook(storage), { cells: [], problem: "unreadable", backupKey: CORRUPT_KEY });
  assert.equal(storage.data[CORRUPT_KEY], "{not json");
});

test("versão desconhecida é recusada e guardada no backup", () => {
  const raw = JSON.stringify({ version: 99, cells: CELLS });
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  assert.equal(loadNotebook(storage).problem, "unreadable");
  assert.equal(storage.data[CORRUPT_KEY], raw);
});

test("nota (md) é salva e restaurada como as outras células", () => {
  const raw = JSON.stringify({ version: 1, cells: [{ id: "cell_4", type: "md", language: "markdown", source: "# Notas" }] });
  assert.deepEqual(parse(raw).cells, [{ id: "cell_4", type: "md", language: "markdown", source: "# Notas" }]);
});

test("célula descartada faz backup do notebook inteiro antes de ser perdida", () => {
  const raw = JSON.stringify({ version: 1, cells: [...CELLS, { id: "cell_9", type: "python", source: "print(1)" }] });
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  const result = loadNotebook(storage);
  assert.equal(result.problem, "partial");
  assert.deepEqual(result.cells, CELLS);
  assert.equal(storage.data[result.backupKey], raw);
});

test("um backup anterior diferente não é sobrescrito", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{novo lixo", [CORRUPT_KEY]: "{lixo antigo" });
  const { backupKey } = loadNotebook(storage);
  assert.notEqual(backupKey, CORRUPT_KEY);
  assert.equal(storage.data[CORRUPT_KEY], "{lixo antigo");
  assert.equal(storage.data[backupKey], "{novo lixo");
});

test("backup que falha volta sem backupKey, para o app não salvar por cima", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.deepEqual(loadNotebook(storage), { cells: [], problem: "unreadable", backupKey: null });
});

test("ids fora do padrão, repetidos ou enormes ficam vazios para receber um id novo", () => {
  const raw = JSON.stringify({
    version: 1,
    cells: [
      { id: "cell_1", type: "sql", source: "a" },
      { id: "cell_1", type: "sql", source: "b" },
      { id: "__proto__", type: "sql", source: "c" },
      { id: "cell_99999999999999999999", type: "js", source: "d" },
    ],
  });
  assert.deepEqual(
    parse(raw).cells.map((c) => c.id),
    ["cell_1", "", "", ""],
  );
});

test("tipos desconhecidos e campos inválidos são descartados ou corrigidos", () => {
  const raw = JSON.stringify({
    version: 1,
    cells: [
      null,
      { type: "python", source: "x" },
      { id: 5, type: "sql", name: { a: 1 }, source: ["select 1"] },
      { id: "cell_2", type: "js", name: "ignorado", source: "1" },
    ],
  });
  const result = parse(raw);
  assert.equal(result.dropped, 2);
  assert.deepEqual(result.cells, [
    { id: "", type: "sql", name: "", language: "sql", source: "" },
    { id: "cell_2", type: "js", language: "js", source: "1" },
  ]);
});

test("maxCellNumber ignora ids fora do padrão", () => {
  assert.equal(maxCellNumber(CELLS), 3);
  assert.equal(maxCellNumber([{ id: "minha" }, { id: "cell_x" }, { id: "cell_99999999999999999999" }]), 0);
  assert.equal(maxCellNumber([]), 0);
});

test("saveNotebook retorna false quando o storage recusa a escrita", () => {
  const storage = {
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(saveNotebook(CELLS, storage), false);
});

test("serialize grava a versão", () => {
  assert.equal(JSON.parse(serialize([])).version, 1);
});
