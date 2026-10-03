// Planta a primeira versão da allowlist do server.js (decide sobre a string normalizada
// em POSIX, mas o path.join do Windows trata "\" como separador) e tira os testes do bypass.
import fs from "node:fs";
import path from "node:path";

const BUGGY = [
  "function resolvePublicFile(urlPath) {",
  "  let pathname;",
  "  try {",
  '    pathname = decodeURIComponent(new URL(urlPath, "http://x").pathname);',
  "  } catch {",
  "    return null;",
  "  }",
  '  const relative = path.posix.normalize(pathname === "/" ? "index.html" : pathname.replace(/^\\/+/, ""));',
  '  if (relative.startsWith("..") || relative.includes("\\0")) return null;',
  "",
  "  const isPublic =",
  "    PUBLIC_FILES.has(relative) ||",
  "    PUBLIC_DIRS.some((dir) => relative.startsWith(`${dir}/`));",
  "  if (!isPublic) return null;",
  "",
  "  const file = path.join(ROOT, relative);",
  "  return file.startsWith(ROOT + path.sep) ? file : null;",
  "}",
].join("\n");

export default function setup(ws) {
  const serverFile = path.join(ws.workspace, "server.js");
  const text = fs.readFileSync(serverFile, "utf8");
  const start = text.indexOf("function resolvePublicFile(urlPath) {");
  const end = text.indexOf("\n}\n", start);
  if (start === -1 || end === -1) throw new Error("setup: resolvePublicFile não encontrado");
  fs.writeFileSync(serverFile, text.slice(0, start) + BUGGY + text.slice(end + 2));

  ws.replace(
    "test/servers.test.js",
    `    // Windows: "\\" codificado vira separador no path.join e escapava da allowlist (achado do reviewer).
    "/js/..%5c.git/config",
    "/js/..%5cpackage.json",
    "/js/..%5c.claude%5csettings.json",
    "/css/..%5c..%5cpackage.json",
    "/js/app.js::$DATA",
`,
    "",
  );
}
