import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let child;
let port;

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

// http.get sem normalizar o caminho (equivale a curl --path-as-is).
function status(rawPath) {
  return new Promise((resolve) => {
    http
      .get({ host: "127.0.0.1", port, path: rawPath }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on("error", () => resolve(0));
  });
}

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: "" }, stdio: "ignore" });
  for (let i = 0; i < 50 && (await status("/")) === 0; i++) await new Promise((r) => setTimeout(r, 100));
});
after(() => child.kill());

for (const p of [
  "/js/..%5c.git/config",
  "/js/..%5cpackage.json",
  "/js/..%5c.claude%5csettings.json",
  "/css/..%5c..%5cpackage.json",
  "/js/%2e%2e%5c.git/config",
  "/js/app.js::$DATA",
  "/.git/config",
  "/package.json",
]) {
  test(`recusa ${p}`, async () => assert.equal(await status(p), 404));
}

for (const p of ["/", "/index.html", "/js/app.js", "/css/styles.css", "/js/lib/../app.js"]) {
  test(`entrega ${p}`, async () => assert.equal(await status(p), 200));
}
