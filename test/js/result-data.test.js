// Tabela de resultado: ordenar, filtrar e exportar sem perder nem corromper dado.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatValue,
  filterRows,
  sortRows,
  nextSort,
  toCsv,
  toMarkdownTable,
  toJson,
  numericColumns,
} from "../../js/result-data.js";

const COLUMNS = ["id", "name", "total"];
const ROWS = [
  [1, "Ana", "120.50"],
  [2, "bruno", null],
  [10, "Carla", "35.00"],
  [3, null, "99.90"],
];

test("filtro não diferencia maiúsculas e procura em todas as colunas", () => {
  assert.deepEqual(filterRows(ROWS, "BRU"), [ROWS[1]]);
  assert.deepEqual(filterRows(ROWS, "99."), [ROWS[3]]);
  assert.deepEqual(filterRows(ROWS, "null"), [ROWS[1], ROWS[3]]);
  assert.equal(filterRows(ROWS, "  "), ROWS);
});

test("ordena números como números e NULL sempre no fim", () => {
  assert.deepEqual(sortRows(ROWS, 0, "asc").map((r) => r[0]), [1, 2, 3, 10]);
  assert.deepEqual(sortRows(ROWS, 0, "desc").map((r) => r[0]), [10, 3, 2, 1]);
  assert.deepEqual(sortRows(ROWS, 1, "asc").map((r) => r[1]), ["Ana", "bruno", "Carla", null]);
  assert.deepEqual(sortRows(ROWS, 1, "desc").map((r) => r[1]), ["Carla", "bruno", "Ana", null]);
});

test("ordenar não muda o array original; sem direção devolve o original", () => {
  const copy = structuredClone(ROWS);
  sortRows(ROWS, 0, "desc");
  assert.deepEqual(ROWS, copy);
  assert.equal(sortRows(ROWS, 0, null), ROWS);
});

test("clique no cabeçalho alterna crescente → decrescente → sem ordem", () => {
  let s = { colIndex: null, direction: null };
  s = nextSort(s, 1);
  assert.deepEqual(s, { colIndex: 1, direction: "asc" });
  s = nextSort(s, 1);
  assert.deepEqual(s, { colIndex: 1, direction: "desc" });
  s = nextSort(s, 1);
  assert.deepEqual(s, { colIndex: null, direction: null });
  assert.deepEqual(nextSort({ colIndex: 1, direction: "desc" }, 2), { colIndex: 2, direction: "asc" });
});

test("CSV cita vírgula, aspas e quebra de linha; NULL vira vazio", () => {
  const csv = toCsv(["a", "b"], [["x,y", 'diz "oi"'], ["linha\nnova", null]]);
  assert.equal(csv, 'a,b\r\n"x,y","diz ""oi"""\r\n"linha\nnova",\r\n');
});

test("CSV neutraliza fórmula de planilha em texto, mas não em número", () => {
  const rows = [["=HYPERLINK(\"http://x\")", -5, "+cmd|' /C calc'!A0", "@SUM(A1)", "-2+3"]];
  const csv = toCsv(["a", "b", "c", "d", "e"], rows).split("\r\n")[1];
  assert.equal(csv, `"'=HYPERLINK(""http://x"")",-5,'+cmd|' /C calc'!A0,'@SUM(A1),'-2+3`);
});

test("tabela Markdown: cabeçalho, separador e numéricas alinhadas à direita", () => {
  assert.equal(
    toMarkdownTable(COLUMNS, ROWS.slice(0, 2)),
    ["| id | name | total |", "| ---: | --- | ---: |", "| 1 | Ana | 120.50 |", "| 2 | bruno | NULL |"].join("\n"),
  );
});

test("tabela Markdown escapa o que quebraria a tabela ou viraria formatação", () => {
  const md = toMarkdownTable(["col|x"], [["a|b"], ["**negrito** _it_ `code`"], ["<script>x</script>"], ["[l](javascript:x)"], ["linha1\nlinha2"], ["c:\\dir ~x~"]]);
  assert.deepEqual(md.split("\n"), [
    "| col\\|x |",
    "| --- |",
    "| a\\|b |",
    "| \\*\\*negrito\\*\\* \\_it\\_ \\`code\\` |",
    "| \\<script\\>x\\</script\\> |",
    "| \\[l\\](javascript:x) |",
    "| linha1 linha2 |",
    "| c:\\\\dir \\~x\\~ |",
  ]);
});

test("tabela Markdown sem linhas tem só cabeçalho e separador", () => {
  assert.equal(toMarkdownTable(["a"], []), "| a |\n| --- |");
});

test("número em texto (bigint/numeric do Postgres) não recebe o prefixo de fórmula", () => {
  const csv = toCsv(["a", "b", "c", "d"], [["-5.20", "-9000000000", "+3", "-1e5"]]).split("\r\n")[1];
  assert.equal(csv, "-5.20,-9000000000,+3,-1e5");
  assert.equal(toCsv(["a"], [["-5 abc"]]).split("\r\n")[1], "'-5 abc");
});

test("número em texto ordena como número", () => {
  const rows = [["-5"], ["3"], ["-10"], ["1.10"], ["1.9"]];
  assert.deepEqual(sortRows(rows, 0, "asc").map((r) => r[0]), ["-10", "-5", "1.10", "1.9", "3"]);
});

test("JSON vira lista de objetos com null explícito", () => {
  assert.deepEqual(JSON.parse(toJson(COLUMNS, ROWS.slice(0, 2))), [
    { id: 1, name: "Ana", total: "120.50" },
    { id: 2, name: "bruno", total: null },
  ]);
});

test("formatValue segue o formato da tabela", () => {
  assert.equal(formatValue(null), "NULL");
  assert.equal(formatValue({ a: 1 }), '{"a":1}');
  assert.equal(formatValue(5), "5");
});

test("colunas numéricas aceitam texto numérico e ignoram NULL", () => {
  assert.deepEqual(numericColumns(COLUMNS, ROWS), ["id", "total"]);
  assert.deepEqual(numericColumns(["x"], [[null]]), []);
});
