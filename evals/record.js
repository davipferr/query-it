// Junta checagens objetivas + nota do juiz e grava uma linha em evals/results.jsonl.
// Uso: node evals/record.js <runId> <judge.json> [--agent-model X] [--judge-model Y] [--keep]
// judge.json: { "scores": { "<criterio>": 0|1|2, ... }, "notes": "..." }
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cleanup, loadRun, loadScenario, REPO } from "./lib/workspace.js";

const [runId, judgeFile, ...flags] = process.argv.slice(2);
if (!runId || !judgeFile) {
  console.error("Uso: node evals/record.js <runId> <judge.json> [--agent-model X] [--judge-model Y] [--keep]");
  process.exit(1);
}
const flag = (name) => {
  const i = flags.indexOf(name);
  return i === -1 ? undefined : flags[i + 1];
};

const { runDir, meta } = loadRun(runId);
const scenario = loadScenario(meta.scenario);
const checks = JSON.parse(fs.readFileSync(path.join(runDir, "checks.json"), "utf8"));
const judge = JSON.parse(fs.readFileSync(judgeFile, "utf8"));
fs.copyFileSync(judgeFile, path.join(runDir, "judge.json"));

const rubricMax = scenario.rubric.length * 2;
const rubricScore = scenario.rubric.reduce((sum, r) => sum + Math.max(0, Math.min(2, Number(judge.scores?.[r.id] ?? 0))), 0);
// Sem testes escondidos (cenário de pergunta), a nota é só a rubrica.
const hasHidden = checks.hidden.total > 0;
const hiddenRatio = hasHidden ? checks.hidden.passed / checks.hidden.total : 0;
const hiddenWeight = hasHidden ? 0.5 : 0;

// Falhas objetivas zeram a nota: não importa quão bom o relatório pareça.
const disqualified = [];
if (checks.touchedRealRepo) disqualified.push("mexeu no repositório real");
if (checks.forbiddenChanges.length) disqualified.push(`mudou caminhos proibidos: ${checks.forbiddenChanges.join(", ")}`);

const score = disqualified.length
  ? 0
  : Math.round(100 * (hiddenWeight * hiddenRatio + (1 - hiddenWeight) * (rubricScore / rubricMax)));

// Versão do skill avaliado = hash do arquivo em HEAD, para comparar antes/depois de mudar o skill.
const skillPath = `.claude/skills/${scenario.skill}/SKILL.md`;
let skillVersion = null;
try {
  skillVersion = execFileSync("git", ["log", "-1", "--format=%h", "--", skillPath], { cwd: REPO, encoding: "utf8" }).trim();
} catch {
  // skill fora do git
}

const row = {
  date: new Date().toISOString(),
  runId,
  scenario: scenario.id,
  skill: scenario.skill,
  skillVersion,
  repoHead: meta.repoHead,
  agentModel: flag("--agent-model") ?? null,
  judgeModel: flag("--judge-model") ?? null,
  hidden: `${checks.hidden.passed}/${checks.hidden.total}`,
  rubric: `${rubricScore}/${rubricMax}`,
  scores: judge.scores,
  disqualified,
  score,
};
fs.appendFileSync(path.join(REPO, "evals", "results.jsonl"), `${JSON.stringify(row)}\n`);

if (!flags.includes("--keep")) cleanup(meta);
console.log(JSON.stringify(row, null, 2));
