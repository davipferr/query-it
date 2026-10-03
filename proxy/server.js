// Servidor do proxy: recebe o SQL do frontend e executa no banco.
import http from "node:http";

// Rodando na própria máquina, o caso de uso é justamente o banco local.
process.env.ALLOW_PRIVATE_HOSTS ??= "true";

const { default: handler } = await import("./api/query.js");

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname !== "/api/query") {
    res.writeHead(404).end("Not found");
    return;
  }

  adaptResponse(res);
  try {
    req.body = await readJson(req);
  } catch {
    res.status(400).json({ error: "JSON inválido." });
    return;
  }
  await handler(req, res);
});

server.listen(PORT, () => {
  console.log(`Proxy rodando em http://localhost:${PORT}/api/query`);
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
