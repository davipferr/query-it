// Monta e desmonta o workspace "disfarçado" de um cenário de eval.
// O agente avaliado não pode saber que é teste (muda o comportamento) nem achar a resposta:
// a cópia não tem evals/, nem docs/agent-log.md, nem o histórico do git (os commits de
// correção são o gabarito).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RUNS_DIR = path.join(REPO, "evals", "runs");
const HIDDEN_FROM_AGENT = [/^evals\//, /^docs\/agent-log\.md$/];

export function loadScenario(id) {
  const dir = path.join(REPO, "evals", "scenarios", id);
  const scenario = JSON.parse(fs.readFileSync(path.join(dir, "scenario.json"), "utf8"));
  return { ...scenario, dir };
}

export function listScenarios() {
  return fs
    .readdirSync(path.join(REPO, "evals", "scenarios"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export async function prepare(id) {
  const scenario = loadScenario(id);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}`;
  // Nome neutro: nada de "eval", "test" ou o id do cenário no caminho.
  const workspace = path.join(os.tmpdir(), `queryit-${crypto.randomBytes(4).toString("hex")}`);

  // Conteúdo de HEAD, não da working tree: o eval mede a versão commitada dos skills,
  // e o resultado é reproduzível (results.jsonl guarda o repoHead).
  const files = git(REPO, "ls-tree", "-r", "--name-only", "-z", "HEAD").split("\0").filter(Boolean);
  for (const rel of files) {
    if (HIDDEN_FROM_AGENT.some((re) => re.test(rel))) continue;
    const target = path.join(workspace, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, execFileSync("git", ["show", `HEAD:${rel}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }));
  }
  for (const nm of ["node_modules", "proxy/node_modules"]) {
    if (fs.existsSync(path.join(REPO, nm))) {
      fs.symlinkSync(path.join(REPO, nm), path.join(workspace, nm), "junction");
    }
  }

  const setupFile = path.join(scenario.dir, "setup.js");
  if (fs.existsSync(setupFile)) {
    const { default: setup } = await import(`file:///${setupFile.replace(/\\/g, "/")}`);
    await setup(createEditor(workspace));
  }

  // Histórico novo de um commit só: o agente pode usar git diff/status normalmente.
  git(workspace, "init", "-q");
  git(workspace, "add", "-A");
  git(workspace, "-c", "user.name=dev", "-c", "user.email=dev@example.com", "commit", "-q", "-m", "snapshot");

  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const meta = {
    runId,
    scenario: id,
    skill: scenario.skill,
    workspace,
    repoHead: git(REPO, "rev-parse", "--short", "HEAD").trim(),
    repoStatusBefore: git(REPO, "status", "--porcelain"),
    preparedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta, null, 2));
  return { meta, prompt: renderPrompt(scenario, workspace) };
}

// O prompt é escrito como um pedido normal de usuário, com o caminho do projeto.
function renderPrompt(scenario, workspace) {
  return [
    `You're working on the QueryIt project, checked out at ${workspace}.`,
    "Work only inside that folder (use absolute paths; run shell commands from that directory).",
    "Its CLAUDE.md, docs/feature-map.md and .claude/skills/ apply to this task.",
    "",
    scenario.prompt,
  ].join("\n");
}

// Edições do setup falham alto se o trecho esperado mudou: cenário quebrado é melhor que
// cenário que não planta o bug e dá nota alta por engano.
function createEditor(workspace) {
  const file = (rel) => path.join(workspace, rel);
  return {
    workspace,
    replace(rel, from, to) {
      const text = fs.readFileSync(file(rel), "utf8");
      const count = text.split(from).length - 1;
      if (count !== 1) throw new Error(`setup: esperava 1 ocorrência em ${rel}, achei ${count}:\n${from}`);
      fs.writeFileSync(file(rel), text.replace(from, to));
    },
    remove(rel) {
      fs.rmSync(file(rel));
    },
  };
}

export function loadRun(runId) {
  const runDir = path.join(RUNS_DIR, runId);
  return { runDir, meta: JSON.parse(fs.readFileSync(path.join(runDir, "meta.json"), "utf8")) };
}

export function cleanup(meta) {
  // Remove as junctions primeiro: rmSync recursivo não pode seguir para o node_modules real.
  for (const nm of ["node_modules", "proxy/node_modules"]) {
    const link = path.join(meta.workspace, nm);
    if (fs.existsSync(link)) fs.unlinkSync(link);
  }
  fs.rmSync(meta.workspace, { recursive: true, force: true });
}
