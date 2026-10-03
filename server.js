// Servidor do frontend: só entrega os arquivos estáticos do app.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 5500;
// Só esta máquina: escutando na rede, qualquer vizinho leria os arquivos do projeto.
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Lista do que é público. Todo o resto (.git/, .claude/, docs/, proxy/, node_modules/,
// package.json...) fica de fora, inclusive pasta nova que alguém criar no futuro.
const PUBLIC_FILES = new Set(["index.html"]);
const PUBLIC_DIRS = ["css", "js"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function resolvePublicFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, "http://x").pathname);
  } catch {
    return null;
  }
  // Nenhuma URL legítima do app tem "\", ":" ou NUL. No Windows, "\" vira separador e ":"
  // abre alternate data streams, ambos já serviram para escapar da allowlist.
  if (/[\\:\0]/.test(pathname)) return null;

  // A decisão é tomada sobre o caminho JÁ resolvido pelo sistema, nunca sobre a string da URL.
  const file = path.resolve(ROOT, pathname === "/" ? "index.html" : `.${pathname}`);
  const parts = path.relative(ROOT, file).split(path.sep);
  if (parts[0] === ".." || path.isAbsolute(parts[0])) return null;

  const isPublic =
    (parts.length === 1 && PUBLIC_FILES.has(parts[0])) ||
    (parts.length > 1 && PUBLIC_DIRS.includes(parts[0]));
  return isPublic ? file : null;
}

const server = http.createServer(async (req, res) => {
  const file = resolvePublicFile(req.url);
  if (!file) {
    res.writeHead(404).end("Not found");
    return;
  }

  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`QueryIt rodando em http://${HOST === "127.0.0.1" ? "localhost" : HOST}:${PORT}`);
});
