import { assertReadOnly } from "../lib/sql-guard.js";
import { assertHostIsSafe } from "../lib/ssrf-guard.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { DRIVERS } from "../lib/drivers/index.js";

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 12000;

// Em produção: ALLOWED_ORIGINS="https://seu-usuario.github.io"
// Deixe vazio em dev para liberar qualquer origem.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    res
      .status(429)
      .json({ error: "Muitas requisições. Tente novamente em instantes." });
    return;
  }

  const { dbType, connectionString, sql } = req.body || {};

  if (!dbType || !DRIVERS[dbType]) {
    res
      .status(400)
      .json({ error: `dbType inválido. Use um destes: ${Object.keys(DRIVERS).map((k) => `"${k}"`).join(", ")}.` });
    return;
  }
  if (!connectionString || typeof connectionString !== "string") {
    res.status(400).json({ error: "connectionString é obrigatório." });
    return;
  }
  if (!sql || typeof sql !== "string") {
    res.status(400).json({ error: "sql é obrigatório." });
    return;
  }

  const driver = DRIVERS[dbType];

  try {
    // Camada 2: só SELECT/WITH, um único statement (validação real via AST).
    assertReadOnly(sql, dbType);

    // Proteção SSRF: nunca conectar em IP privado/loopback/link-local/metadata.
    // O driver conecta com exatamente esta config, então o host checado é o host usado.
    const config = driver.parseConnection(connectionString);
    await assertHostIsSafe(config.host);

    // Camada 3: o driver roda em transação read-only e limita as linhas no servidor.
    const started = Date.now();
    const { columns, rows } = await withTimeout(
      driver.runQuery(config, sql, { maxRows: MAX_ROWS }),
      QUERY_TIMEOUT_MS,
    );
    const elapsedMs = Date.now() - started;

    res.status(200).json({
      columns,
      rows,
      rowCount: rows.length,
      elapsedMs,
      truncated: rows.length >= MAX_ROWS,
    });
  } catch (err) {
    res.status(400).json({ error: sanitizeError(err) });
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed =
    ALLOWED_ORIGINS.length === 0 ||
    (origin && ALLOWED_ORIGINS.includes(origin)) ||
    (origin && isLocalOrigin(origin));

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Tempo limite da consulta excedido.")),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Nunca deixar uma connection string vazar em uma mensagem de erro devolvida ao cliente.
function sanitizeError(err) {
  const message = String(err?.message || "Erro desconhecido.");
  return message.replace(/:\/\/[^@\s]+@/g, "://***:***@");
}
