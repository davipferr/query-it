// Lint mínimo até a Fase 3 (ESLint): garante que todo .js do projeto ao menos faz parse.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", ".claude"]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}

let failed = 0;
let checked = 0;
for (const file of walk(ROOT)) {
  checked++;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed++;
    process.stderr.write(result.stderr);
  }
}

console.log(`${checked} arquivos verificados, ${failed} com erro de sintaxe.`);
process.exitCode = failed ? 1 : 0;
