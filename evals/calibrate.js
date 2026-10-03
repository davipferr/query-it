// Testa os próprios cenários, sem agente: o bug plantado precisa fazer os testes escondidos
// falharem, e o código atual (HEAD) precisa passar neles. Cenário que não discrimina dá nota
// enganosa. Também mostra se o `npm run check` do workspace plantado já denuncia o bug.
// Uso: node evals/calibrate.js [cenario...]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cleanup, listScenarios, loadScenario, prepare, REPO } from "./lib/workspace.js";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : listScenarios();

function runHidden(scenario, root) {
  const hiddenFile = path.join(scenario.dir, "hidden.test.js");
  if (!fs.existsSync(hiddenFile)) return null;
  const target = path.join(root, "test", "hidden", `calibrate-${scenario.id}.test.js`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(hiddenFile, target);
  try {
    const r = spawnSync(process.execPath, ["--test", target], { cwd: root, encoding: "utf8" });
    const n = (k) => Number((r.stdout.match(new RegExp(`^ℹ ${k} (\\d+)$`, "m")) || [])[1] || 0);
    return { total: n("tests"), passed: n("pass") };
  } finally {
    fs.rmSync(target);
    if (!fs.readdirSync(path.dirname(target)).length) fs.rmdirSync(path.dirname(target));
  }
}

let ok = true;
for (const id of ids) {
  const scenario = loadScenario(id);
  const { meta } = await prepare(id);
  try {
    const planted = runHidden(scenario, meta.workspace);
    const head = runHidden(scenario, REPO);
    const check = spawnSync("npm", ["run", "check", "--silent"], { cwd: meta.workspace, encoding: "utf8", shell: process.platform === "win32" });

    const problems = [];
    if (planted && planted.passed === planted.total) problems.push("bug plantado não faz nenhum teste escondido falhar");
    if (head && head.passed !== head.total) problems.push(`HEAD falha em testes escondidos (${head.passed}/${head.total})`);
    if (problems.length) ok = false;

    console.log(
      `${problems.length ? "✖" : "✔"} ${id}: escondidos plantado ${planted ? `${planted.passed}/${planted.total}` : "-"}, ` +
        `HEAD ${head ? `${head.passed}/${head.total}` : "-"}; npm run check no plantado: ${check.status === 0 ? "verde (bug invisível ao gate)" : "vermelho"}` +
        (problems.length ? `\n    ${problems.join("\n    ")}` : ""),
    );
  } finally {
    cleanup(meta);
    fs.rmSync(path.join(REPO, "evals", "runs", meta.runId), { recursive: true, force: true });
  }
}
process.exitCode = ok ? 0 : 1;
