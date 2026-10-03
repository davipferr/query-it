// Planta o bug original do botão SELECT (sem citar nomes, LIMIT até no SQL Server) e tira
// os testes que pegariam isso.
import fs from "node:fs";
import path from "node:path";

const ORIGINAL_BUG = [
  "// SQL inserido pelo botão SELECT do schema explorer.",
  "export function selectPreset(dbType, schema, table, limit = 100) {",
  "  return `SELECT * FROM ${schema}.${table} LIMIT ${limit}`;",
  "}",
  "",
].join("\n");

export default function setup(ws) {
  const presetFile = path.join(ws.workspace, "js/sql-preset.js");
  const text = fs.readFileSync(presetFile, "utf8");
  const start = text.indexOf("// SQL inserido pelo botão SELECT do schema explorer.");
  if (start === -1) throw new Error("setup: selectPreset não encontrado");
  fs.writeFileSync(presetFile, text.slice(0, start) + ORIGINAL_BUG);

  ws.remove("test/js/sql-preset.test.js");

  const queryTest = path.join(ws.workspace, "proxy/test/query.test.js");
  let q = fs.readFileSync(queryTest, "utf8");
  const importLine = "import { selectPreset } from '../../js/sql-preset.js';\n";
  const blockStart = q.indexOf("    test('SELECT gerado pelo schema explorer");
  const blockEnd = q.indexOf("    test('consulta de introspecção do schema explorer'");
  if (!q.includes(importLine) || blockStart === -1 || blockEnd === -1) {
    throw new Error("setup: trechos de query.test.js não encontrados");
  }
  // Corta o bloco antes de tirar o import: os índices acima valem para o texto original.
  q = q.slice(0, blockStart) + q.slice(blockEnd);
  q = q.replace(importLine, "");
  fs.writeFileSync(queryTest, q);
}
