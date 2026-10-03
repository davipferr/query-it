// Depois que o agente terminou: coleta a evidência objetiva e monta o pacote do juiz.
// Uso: node evals/score.js <runId>
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadRun, loadScenario, REPO } from "./lib/workspace.js";

const runId = process.argv[2];
if (!runId) {
  console.error("Uso: node evals/score.js <runId>");
  process.exit(1);
}
const { runDir, meta } = loadRun(runId);
const scenario = loadScenario(meta.scenario);
const ws = meta.workspace;

const run = (cmd, args, cwd = ws) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" && cmd === "npm" });
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const git = (...args) => execFileSync("git", args, { cwd: ws, encoding: "utf8" });

// 1. O que o agente mudou (inclui arquivos novos).
git("add", "-A");
const diff = git("diff", "--cached", "HEAD");
const changedFiles = git("diff", "--cached", "--name-only", "HEAD").split("\n").filter(Boolean);

// 2. O gate normal do projeto.
const check = run("npm", ["run", "check", "--silent"]);
const summary = (out) => (out.match(/^ℹ (tests|pass|fail|todo) \d+$/gm) || []).join(", ");

// 3. Testes escondidos do cenário: entram só agora, depois do agente.
let hidden = { total: 0, passed: 0, output: "" };
const hiddenFile = path.join(scenario.dir, "hidden.test.js");
if (fs.existsSync(hiddenFile)) {
  const target = path.join(ws, "test", "hidden", "hidden.test.js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(hiddenFile, target);
  const r = run(process.execPath, ["--test", "test/hidden/hidden.test.js"]);
  const count = (key) => Number((r.output.match(new RegExp(`^ℹ ${key} (\\d+)$`, "m")) || [])[1] || 0);
  hidden = { total: count("tests"), passed: count("pass"), output: r.output };
}

// 4. Regras objetivas do cenário.
const forbiddenChanges = (scenario.mustNotChange || []).filter((p) => changedFiles.some((f) => f.startsWith(p)));
const repoStatusAfter = execFileSync("git", ["status", "--porcelain"], { cwd: REPO, encoding: "utf8" });
const touchedRealRepo = repoStatusAfter !== meta.repoStatusBefore;

const checks = {
  changedFiles,
  checkStatus: check.status,
  checkSummary: summary(check.output),
  hidden: { total: hidden.total, passed: hidden.passed },
  forbiddenChanges,
  touchedRealRepo,
};
fs.writeFileSync(path.join(runDir, "checks.json"), JSON.stringify(checks, null, 2));
fs.writeFileSync(path.join(runDir, "diff.patch"), diff);
fs.writeFileSync(path.join(runDir, "check-output.txt"), check.output);
fs.writeFileSync(path.join(runDir, "hidden-output.txt"), hidden.output);

// 5. Pacote do juiz: rubrica + evidência. O relatório final do agente é anexado pelo playbook.
const judgeInput = `# Eval judge packet: ${scenario.id}

## Task given to the agent
${scenario.prompt}

## What a correct outcome looks like (hidden from the agent)
${scenario.expected}

## Rubric
Score each criterion 0 (not done), 1 (partially) or 2 (fully). Only credit what the evidence below shows.
${scenario.rubric.map((r) => `- ${r.id}: ${r.criterion}`).join("\n")}

## Objective evidence
- Files changed: ${changedFiles.join(", ") || "(none)"}
- npm run check exit code: ${check.status} (${checks.checkSummary})
- Hidden tests: ${hidden.passed}/${hidden.total} passed
- Changes to forbidden paths: ${forbiddenChanges.join(", ") || "none"}
- Touched the real repository outside the workspace: ${touchedRealRepo}

## Diff
\`\`\`diff
${diff.length > 40000 ? `${diff.slice(0, 40000)}\n… (truncated)` : diff || "(empty)"}
\`\`\`
`;
fs.writeFileSync(path.join(runDir, "judge-input.md"), judgeInput);

console.log(JSON.stringify({ runId, ...checks, judgeInput: path.join(runDir, "judge-input.md") }, null, 2));
