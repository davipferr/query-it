import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildNamespace,
  pickDefaultSchema,
  quoteIfNeeded,
  columnsInQuery,
  setSchemaTables,
  getSchemaTables,
  onSchemaChange,
} from "../../js/notebook/sql-schema.js";

const TABLES = [
  { schema: "public", table: "customers", columns: [{ name: "id", type: "integer" }, { name: "email", type: "text" }] },
  { schema: "public", table: "order items", columns: [{ name: "id", type: "integer" }, { name: "Qty", type: "integer" }] },
  { schema: "sales", table: "orders", columns: [{ name: "total", type: "numeric" }] },
];

describe("buildNamespace", () => {
  test("aninha schema > tabela > colunas", () => {
    assert.deepEqual(buildNamespace(TABLES), {
      public: { customers: ["id", "email"], "order items": ["id", "Qty"] },
      sales: { orders: ["total"] },
    });
  });

  test("escapa pontos no nome para o lang-sql não quebrar o namespace", () => {
    const ns = buildNamespace([{ schema: "a.b", table: "c.d", columns: [{ name: "x", type: "int" }] }]);
    assert.deepEqual(ns, { "a\\.b": { "c\\.d": ["x"] } });
  });
});

describe("pickDefaultSchema", () => {
  test("postgres prefere public", () => assert.equal(pickDefaultSchema(TABLES, "postgres"), "public"));
  test("mssql sem dbo e com vários schemas não tem default", () =>
    assert.equal(pickDefaultSchema(TABLES, "mssql"), undefined));
  test("mysql com um schema só usa esse", () =>
    assert.equal(pickDefaultSchema([{ schema: "queryit", table: "t", columns: [] }], "mysql"), "queryit"));
});

describe("quoteIfNeeded", () => {
  test("nome simples fica sem aspas", () => assert.equal(quoteIfNeeded("postgres", "email"), "email"));
  test("postgres cita maiúsculas e espaços", () => {
    assert.equal(quoteIfNeeded("postgres", "Qty"), '"Qty"');
    assert.equal(quoteIfNeeded("postgres", 'a"b'), '"a""b"');
  });
  test("mysql não cita maiúsculas, mas cita espaço com crase", () => {
    assert.equal(quoteIfNeeded("mysql", "Qty"), "Qty");
    assert.equal(quoteIfNeeded("mysql", "order items"), "`order items`");
  });
  test("mssql usa colchetes", () => assert.equal(quoteIfNeeded("mssql", "a]b"), "[a]]b]"));
});

describe("columnsInQuery", () => {
  test("só colunas das tabelas citadas, sem repetir nomes", () => {
    const cols = columnsInQuery(TABLES, 'select  from customers c join "order items" oi on true');
    assert.deepEqual(cols.map((c) => c.name), ["id", "email", "Qty"]);
    assert.equal(cols[0].table, "customers");
  });

  test("ignora nome de tabela dentro de outra palavra", () => {
    assert.deepEqual(columnsInQuery(TABLES, "select * from customers_old"), []);
  });

  test("não diferencia maiúsculas", () => {
    assert.deepEqual(columnsInQuery(TABLES, "SELECT * FROM ORDERS").map((c) => c.name), ["total"]);
  });
});

test("setSchemaTables avisa os inscritos e para depois do unsubscribe", () => {
  const seen = [];
  const off = onSchemaChange((t) => seen.push(t.length));
  setSchemaTables(TABLES);
  off();
  setSchemaTables([]);
  assert.deepEqual(seen, [3]);
  assert.deepEqual(getSchemaTables(), []);
});
