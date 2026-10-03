// Servidor do frontend: só entrega os arquivos estáticos.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 5500;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const relative =
    pathname === "/" ? "index.html" : decodeURIComponent(pathname);
  const file = path.join(ROOT, relative);

  // Não servir nada fora do projeto nem a pasta do proxy.
  if (
    !file.startsWith(ROOT + path.sep) ||
    file.startsWith(path.join(ROOT, "proxy"))
  ) {
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

server.listen(PORT, () => {
  console.log(`QueryIt rodando em http://localhost:${PORT}`);
});
