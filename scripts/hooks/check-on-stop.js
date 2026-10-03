// Hook Stop do Claude Code: com mudanças de código não commitadas, o agente não encerra o
// turno com `npm run check` vermelho sem ao menos ver a falha. Devolve a saída (exit 2) uma
// vez; se o agente parar de novo (stop_hook_active), deixa: ele pode ter explicado a falha.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CODE = /^(js\/|css\/|proxy\/|scripts\/|evals\/|test\/|index\.html$|server\.js$|eslint\.config\.js$|package\.json$)/;

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (JSON.parse(input || "{}").stop_hook_active) process.exit(0);

const changed = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^"|"$/g, ""))
  .filter((file) => CODE.test(file));
if (!changed.length) process.exit(0);

const result = spawnSync("npm run check --silent", { cwd: ROOT, encoding: "utf8", shell: true });
if (result.status === 0) process.exit(0);

const output = `${result.stdout}${result.stderr}`
  .split("\n")
  .filter((l) => /error|✖|Faltando| {2}- |falharam|Dependências/.test(l) && !/# todo/.test(l))
  .slice(0, 30)
  .join("\n");
process.stderr.write(
  `npm run check está vermelho com mudanças não commitadas em: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? "…" : ""}\n` +
    `Corrija antes de encerrar, ou diga ao usuário exatamente o que está quebrado e por quê.\n\n${output}\n`,
);
process.exit(2);
