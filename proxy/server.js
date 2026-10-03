// Servidor Node: sobe o frontend e o proxy juntos.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Rodando na própria máquina, o caso de uso é justamente o banco local.
process.env.ALLOW_PRIVATE_HOSTS ??= "true";

const { default: handler } = await import("./api/query.js");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

  if (pathname === "/api/query") {
    adaptResponse(res);
    try {
      req.body = await readJson(req);
    } catch {
      res.status(400).json({ error: "JSON inválido." });
      return;
    }
    await handler(req, res);
    return;
  }

  await serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log(`QueryIt rodando em http://localhost:${PORT}`);
  console.log(`Proxy em http://localhost:${PORT}/api/query`);
});

// O handler usa a API estilo Express (res.status().json()).
function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  };
}

async function readJson(req) {
  if (req.method !== "POST") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

async function serveStatic(pathname, res) {
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
}
