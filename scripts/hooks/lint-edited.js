// Hook PostToolUse do Claude Code (Edit/Write): checa o arquivo recém-editado e devolve os
// erros ao agente na mesma hora (exit 2 + stderr), em vez de ele descobrir só no npm run check.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let input = "";
for await (const chunk of process.stdin) input += chunk;

const filePath = JSON.parse(input || "{}").tool_input?.file_path;
if (!filePath) process.exit(0);

// No Windows o caminho pode chegar como C:\... ou no formato do Git Bash (/c/...).
const normalized = process.platform === "win32" ? filePath.replace(/^\/([a-z])\//i, "$1:/") : filePath;
const rel = path.relative(ROOT, path.resolve(normalized)).split(path.sep).join("/");
if (rel.startsWith("..") || rel.includes("node_modules/")) process.exit(0);

const checks = [];
if (rel.endsWith(".js")) checks.push(["node", ["node_modules/eslint/bin/eslint.js", "--no-warn-ignored", rel]]);
if (rel === "index.html" || rel === "docs/feature-map.md" || rel.endsWith(".js")) {
  checks.push(["node", ["scripts/check-feature-map.js"]]);
}
if (rel === "index.html" || rel.startsWith("js/")) checks.push(["node", ["scripts/check-pins.js"]]);

const failures = [];
for (const [, args] of checks) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) failures.push(`${result.stdout}${result.stderr}`.trim());
}

if (failures.length) {
  process.stderr.write(`Checagens falharam para ${rel}:\n${failures.join("\n\n")}\n`);
  process.exit(2);
}
