import { assertReadOnly } from "../lib/sql-guard.js";
import { assertHostIsSafe } from "../lib/ssrf-guard.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { DRIVERS } from "../lib/drivers/index.js";

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 12000;

export default async function handler(req, res) {
  // Qualquer site aberto no navegador consegue mandar requisição para o proxy local;
  // origem desconhecida é recusada antes de qualquer outra coisa.
  if (!applyCors(req, res)) {
    res.status(403).json({ error: "Origem não permitida." });
    return;
  }

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

  // Um sinal só para "cliente desistiu" (req.signal, montado no server.js) e "tempo esgotado":
  // o driver usa para interromper a consulta no próprio banco, não só parar de esperar.
  const controller = new AbortController();
  const abortFromClient = () => controller.abort(new Error("Consulta cancelada."));
  if (req.signal?.aborted) abortFromClient();
  req.signal?.addEventListener("abort", abortFromClient, { once: true });

  try {
    // Cliente que já desistiu não justifica abrir conexão. Só encurta: nenhum guard é pulado.
    controller.signal.throwIfAborted();

    // Camada 2: só SELECT/WITH, um único statement (validação real via AST).
    assertReadOnly(sql, dbType);

    // Proteção SSRF: nunca conectar em IP privado/loopback/link-local/metadata.
    // O driver conecta com exatamente esta config, então o host checado é o host usado.
    const config = driver.parseConnection(connectionString);
    await assertHostIsSafe(config.host);

    // Camada 3: o driver roda em transação read-only e limita as linhas no servidor.
    const started = Date.now();
    const { columns, rows } = await withAbort(
      driver.runQuery(config, sql, { maxRows: MAX_ROWS, signal: controller.signal }),
      controller,
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
    // Cancelada ou esgotada, o erro do driver ("canceling statement…") importa menos que o motivo.
    const reason = controller.signal.aborted ? controller.signal.reason : err;
    res.status(400).json({ error: sanitizeError(reason) });
  } finally {
    req.signal?.removeEventListener("abort", abortFromClient);
  }
}

// Origens aceitas: as locais (o próprio QueryIt rodando na máquina) e as listadas em
// ALLOWED_ORIGINS, ex. em produção ALLOWED_ORIGINS="https://seu-usuario.github.io".
// Lista vazia NÃO libera tudo: o padrão é só local.
// Sem cabeçalho Origin (curl, servidor) não é navegador, então CORS não se aplica; o que
// protege esse caso é o proxy local escutar só em 127.0.0.1 (proxy/server.js).
// Devolve false quando a origem deve ser recusada.
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin) && !isLocalOrigin(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
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

// Responde assim que o sinal dispara (cancelamento ou tempo limite), sem esperar o driver
// terminar de limpar; o tempo limite também dispara o sinal, para o driver parar o banco.
function withAbort(promise, controller, ms) {
  const timer = setTimeout(
    () => controller.abort(new Error("Tempo limite da consulta excedido.")),
    ms,
  );
  const aborted = new Promise((_, reject) => {
    const { signal } = controller;
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  // O driver ainda rejeita depois (consulta cancelada); sem este catch seria unhandled rejection.
  promise.catch(() => {});
  return Promise.race([promise, aborted]).finally(() => clearTimeout(timer));
}

// Nunca deixar uma connection string vazar em uma mensagem de erro devolvida ao cliente.
function sanitizeError(err) {
  const message = String(err?.message || "Erro desconhecido.");
  return message.replace(/:\/\/[^@\s]+@/g, "://***:***@");
}
