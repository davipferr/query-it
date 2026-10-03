// Sem build step, as dependências do frontend vêm de CDN pelo index.html. Versão solta
// ("@4", "@latest") muda o app sem nenhum commit; por isso toda URL externa precisa de
// versão exata, e todo import "bare" do frontend precisa estar no import map.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const EXACT = /@\d+\.\d+\.\d+(?:[/?#]|$)/;

const problems = [];

const externalUrls = [
  ...[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map(([, url]) => url),
];
const importMap = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{"imports":{}}');
externalUrls.push(...Object.values(importMap.imports));

for (const url of externalUrls) {
  // Google Fonts e afins não têm versão; hoje não há nenhum, então qualquer URL sem versão é erro.
  if (!EXACT.test(url)) problems.push(`versão não fixada: ${url}`);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(rel);
    else if (entry.name.endsWith(".js")) yield rel;
  }
}

for (const file of walk("js")) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const staticImports = source.matchAll(/(?:^|\n)\s*import\b[^'"]*['"]([^'"]+)['"]/g);
  const dynamicImports = source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const [, spec] of [...staticImports, ...dynamicImports]) {
    if (!spec.startsWith(".") && !importMap.imports[spec]) {
      problems.push(`${file} importa "${spec}", que não está no import map do index.html`);
    }
  }
}

if (problems.length) {
  console.error(`Dependências do frontend:\n  - ${problems.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log(`${externalUrls.length} URLs externas com versão exata; imports do frontend cobertos pelo import map.`);
}
