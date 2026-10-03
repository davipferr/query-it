// Sobe frontend (5500) e proxy (3000) juntos; Ctrl+C derruba os dois.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const processes = [
  { name: "frontend", cwd: ROOT },
  { name: "proxy", cwd: path.join(ROOT, "proxy") },
].map(({ name, cwd }) => {
  const child = spawn(process.execPath, ["server.js"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk) =>
    chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  child.stdout.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("exit", (code) => {
    console.log(`[${name}] saiu com código ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

function shutdown(code) {
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
