// Planta o bug original: o guard checa o hostname da URL, mas o pg recebe a string crua
// (e obedece ?host=). Os testes de parseConnection do Postgres somem.
import fs from "node:fs";
import path from "node:path";

export default function setup(ws) {
  ws.replace(
    "proxy/lib/drivers/postgres.js",
    `// Monta a config só com os campos da URL. Parâmetros como ?host=, ?sslcert= ou
// ?options= são ignorados de propósito: o pg os respeitaria e conectaria num host
// diferente do que o ssrf-guard checou (ou leria arquivos do servidor do proxy).
export function parseConnection(connectionString) {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('A connection string do Postgres deve começar com postgres://');
  }
  return {
    host: url.hostname.replace(/^\\[|\\]$/g, ''),
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: sslFromMode(url.searchParams.get('sslmode')),
  };
}

function sslFromMode(mode) {
  if (!mode || mode === 'disable') return false;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  return true;
}
`,
    `// O host vai para o ssrf-guard; o pg recebe a connection string inteira (porta, ssl etc.).
export function parseConnection(connectionString) {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('A connection string do Postgres deve começar com postgres://');
  }
  return { host: url.hostname.replace(/^\\[|\\]$/g, ''), connectionString };
}
`,
  );
  ws.replace(
    "proxy/lib/drivers/postgres.js",
    `  const client = new pg.Client({
    ...config,`,
    `  const client = new pg.Client({
    connectionString: config.connectionString,`,
  );

  const testFile = path.join(ws.workspace, "proxy/test/drivers.test.js");
  const text = fs.readFileSync(testFile, "utf8");
  const start = text.indexOf("describe('postgres.parseConnection'");
  const end = text.indexOf("describe('mysql.parseConnection'");
  if (start === -1 || end === -1) throw new Error("setup: blocos de teste do postgres não encontrados");
  fs.writeFileSync(testFile, text.slice(0, start) + text.slice(end));
  // Sem os testes do Postgres, o import ficaria sem uso e o lint denunciaria o cenário.
  ws.replace("proxy/test/drivers.test.js", "import * as postgres from '../lib/drivers/postgres.js';\n", "");
}
