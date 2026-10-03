// O feature map (docs/feature-map.md) só ajuda agentes se estiver em dia:
// todo id do index.html e todo arquivo-fonte precisa aparecer nele.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAP = "docs/feature-map.md";
const SOURCE_DIRS = ["js", "proxy/api", "proxy/lib"];
const SOURCE_FILES = ["index.html", "server.js", "proxy/server.js"];

const map = fs.readFileSync(path.join(ROOT, MAP), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function* walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(rel);
    else if (entry.name.endsWith(".js")) yield rel;
  }
}

const missing = [];

for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
  // "#cell" não pode contar como documentado só porque o mapa cita "#cells".
  const documented = [...map.matchAll(/#([\w-]+)/g)].some(([, word]) => word === id);
  if (!documented) missing.push(`id #${id} (index.html)`);
}

for (const file of [...SOURCE_FILES, ...SOURCE_DIRS.flatMap((d) => [...walk(d)])]) {
  if (!map.includes(`\`${file}\``)) missing.push(`arquivo ${file}`);
}

if (missing.length) {
  console.error(`${MAP} está desatualizado. Faltando:\n  - ${missing.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log(`${MAP} cobre todos os ids e arquivos-fonte.`);
}
