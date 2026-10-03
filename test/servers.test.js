// Os dois servidores locais (frontend 5500, proxy 3000) só podem ser alcançados desta máquina,
// e o frontend só entrega os arquivos do app (nada de .git/, .claude/, docs/...).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1000 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function startServer(script, cwd) {
  const port = await freePort();
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, PORT: String(port), HOST: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50 && !(await canConnect("127.0.0.1", port)); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return { port, stop: () => child.kill() };
}

for (const [name, script, cwd] of [
  ["frontend", "server.js", ROOT],
  ["proxy", "server.js", path.join(ROOT, "proxy")],
]) {
  describe(`servidor ${name}`, () => {
    let server;
    before(async () => {
      server = await startServer(script, cwd);
    });
    after(() => server.stop());

    test("responde em 127.0.0.1", async () => {
      assert.equal(await canConnect("127.0.0.1", server.port), true);
    });

    test("não é alcançável pela rede local", { skip: lanAddress ? false : "sem interface de rede" }, async () => {
      assert.equal(await canConnect(lanAddress, server.port), false, `${lanAddress}:${server.port} aceitou conexão`);
    });
  });
}

describe("servidor frontend: só entrega o app", () => {
  let server;
  before(async () => {
    server = await startServer("server.js", ROOT);
  });
  after(() => server.stop());

  const get = (p) => fetch(`http://127.0.0.1:${server.port}${p}`).then((r) => r.status);

  for (const p of ["/", "/index.html", "/css/styles.css", "/js/app.js", "/js/lib/dom.js"]) {
    test(`entrega ${p}`, async () => assert.equal(await get(p), 200));
  }
  test("URL malformada não derruba o servidor", async () => {
    assert.equal(await get("/%E0%A4%A"), 404);
    assert.equal(await get("/index.html"), 200);
  });

  for (const p of [
    "/.git/config",
    "/.claude/settings.json",
    "/docs/feature-map.md",
    "/package.json",
    "/docker-compose.yml",
    "/proxy/api/query.js",
    "/node_modules/eslint/package.json",
    "/js/../.git/config",
    "/js/%2e%2e/.git/config",
    // Windows: "\" codificado vira separador no path.join e escapava da allowlist (achado do reviewer).
    "/js/..%5c.git/config",
    "/js/..%5cpackage.json",
    "/js/..%5c.claude%5csettings.json",
    "/css/..%5c..%5cpackage.json",
    "/js/app.js::$DATA",
  ]) {
    test(`recusa ${p}`, async () => assert.equal(await get(p), 404));
  }
});
