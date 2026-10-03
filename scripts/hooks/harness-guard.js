// commit-msg: commit que toca arquivos do harness precisa da linha
//   Harness-Change: approved by <nome da pessoa>
// Agentes só escrevem essa linha quando a pessoa aprovou a mudança na conversa (CLAUDE.md).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const HARNESS = [
  /^eslint\.config\.js$/,
  /^\.githooks\//,
  /^scripts\/hooks\//,
  /^scripts\/check-[\w-]+\.js$/,
  /^\.claude\/(settings\.json|agents\/|skills\/)/,
  /^CLAUDE\.md$/,
  /^evals\/(scenarios\/|lib\/|calibrate\.js|score\.js|record\.js)/,
  /^\.gitattributes$/,
];
const TRAILER = /^Harness-Change: approved by \S.*$/m;

const messageFile = process.argv[2];
if (!messageFile) process.exit(0);

const message = fs.readFileSync(messageFile, "utf8");
const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const touched = staged.filter((f) => HARNESS.some((re) => re.test(f)));

if (touched.length && !TRAILER.test(message)) {
  console.error(
    [
      "Commit recusado: muda o harness sem aprovação humana registrada.",
      ...touched.map((f) => `  - ${f}`),
      "",
      "Se uma pessoa revisou e aprovou essa mudança, adicione ao fim da mensagem:",
      "  Harness-Change: approved by <nome>",
      "Agentes: só adicionem essa linha quando o usuário aprovou a mudança na conversa.",
    ].join("\n"),
  );
  process.exit(1);
}
