// Prepara o workspace disfarçado de um cenário e imprime o runId e o prompt do agente.
// Uso: node evals/prepare.js <cenario>   (sem argumento: lista os cenários)
import { listScenarios, prepare } from "./lib/workspace.js";

const id = process.argv[2];
if (!id) {
  console.log(listScenarios().join("\n"));
  process.exit(0);
}

const { meta, prompt } = await prepare(id);
console.log(JSON.stringify({ runId: meta.runId, workspace: meta.workspace, prompt }, null, 2));
