// Onde estamos na curva de confiança, com dados (não impressão). Critérios em docs/workflow.md.
// Uso: npm run trust:report
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "");
const CORE_SKILLS = ["proxy-change", "repro-bug", "investigate"];
const MIN_RUNS = 3;
const MIN_MEAN = 90;

// Evals
const results = read("evals/results.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const scenarios = fs
  .readdirSync(path.join(ROOT, "evals/scenarios"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => JSON.parse(read(`evals/scenarios/${e.name}/scenario.json`)));
const evalRows = scenarios.map((s) => {
  const runs = results.filter((r) => r.scenario === s.id);
  const mean = runs.length ? Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length) : null;
  return { scenario: s.id, skill: s.skill, runs: runs.length, mean, last: runs.at(-1)?.score ?? null };
});

// Agent log: linhas sem "Became" são itens abertos.
const logRows = read("docs/agent-log.md")
  .split("\n")
  .filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l))
  .map((l) => l.split("|").map((c) => c.trim()));
const openItems = logRows.filter((cells) => !cells[3]);

// Git (30 dias)
const since = "30.days";
const commits = execFileSync("git", ["log", `--since=${since}`, "--format=%H%x1f%B%x1e"], { cwd: ROOT, encoding: "utf8" })
  .split("\x1e")
  .map((c) => c.trim())
  .filter(Boolean);
const byAgent = commits.filter((c) => /Co-Authored-By: Claude/i.test(c)).length;
const harnessApproved = commits.filter((c) => /^Harness-Change: approved by/m.test(c)).length;

// Gate atual
const check = spawnSync("npm run check --silent", { cwd: ROOT, encoding: "utf8", shell: true });

// Critérios
const coreEvals = evalRows.filter((r) => CORE_SKILLS.includes(r.skill));
const criteria = [
  ["npm run check verde agora", check.status === 0],
  ["agent log sem itens abertos", openItems.length === 0],
  [
    `evals dos skills centrais com ≥${MIN_RUNS} execuções e média ≥${MIN_MEAN} em todos os cenários`,
    coreEvals.length > 0 && coreEvals.every((r) => r.runs >= MIN_RUNS && r.mean >= MIN_MEAN),
  ],
];
const readyForB = criteria.every(([, ok]) => ok);

const pad = (s, n) => String(s).padEnd(n);
console.log("QueryIt: relatório de confiança\n");
console.log("Evals por cenário");
console.log(`  ${pad("cenário", 26)}${pad("skill", 15)}${pad("execuções", 11)}${pad("média", 7)}última`);
for (const r of evalRows) {
  console.log(`  ${pad(r.scenario, 26)}${pad(r.skill, 15)}${pad(r.runs, 11)}${pad(r.mean ?? "-", 7)}${r.last ?? "-"}`);
}
console.log(`\nAgent log: ${logRows.length} entradas, ${openItems.length} abertas${openItems.length ? `:\n${openItems.map((c) => `  - ${c[1]} ${c[2].slice(0, 90)}`).join("\n")}` : ""}`);
console.log(`Git (${since.replace(".", " ")}): ${commits.length} commits, ${byAgent} com agente, ${harnessApproved} com mudança de harness aprovada`);
console.log("\nCritérios para o estágio B (docs/workflow.md)");
for (const [label, ok] of criteria) console.log(`  ${ok ? "✔" : "✖"} ${label}`);
console.log(`\nEstágio sustentado pelos dados: ${readyForB ? "B (revisar resultados, não cada diff)" : "A (revisar cada diff)"}`);
