// Markdown das notas: o parser gera árvore (nunca HTML) e só aceita links que não executam nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, parseInline, safeHref } from "../../js/markdown.js";

test("títulos, parágrafo, listas, citação, código e linha", () => {
  const blocks = parse(
    [
      "# Título",
      "",
      "linha um",
      "linha dois",
      "",
      "- a",
      "- b",
      "1. x",
      "2. y",
      "> citado",
      "```",
      "select <b>1</b>",
      "```",
      "---",
    ].join("\n"),
  );
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "paragraph", "list", "list", "quote", "code", "rule"]);
  assert.equal(blocks[0].level, 1);
  assert.deepEqual(blocks[1].children, [{ type: "text", text: "linha um linha dois" }]);
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[3].ordered, true);
  assert.equal(blocks[5].text, "select <b>1</b>");
});

test("inline: código, negrito, itálico e link", () => {
  assert.deepEqual(parseInline("a `x` **b** *c* _d_ [e](https://example.com)"), [
    { type: "text", text: "a " },
    { type: "code", text: "x" },
    { type: "text", text: " " },
    { type: "strong", children: [{ type: "text", text: "b" }] },
    { type: "text", text: " " },
    { type: "em", children: [{ type: "text", text: "c" }] },
    { type: "text", text: " " },
    { type: "em", children: [{ type: "text", text: "d" }] },
    { type: "text", text: " " },
    { type: "link", href: "https://example.com", children: [{ type: "text", text: "e" }] },
  ]);
});

test("HTML no texto continua texto", () => {
  assert.deepEqual(parseInline('<img src=x onerror="alert(1)">'), [
    { type: "text", text: '<img src=x onerror="alert(1)">' },
  ]);
});

for (const href of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "/relativo", "file:///etc/passwd"]) {
  test(`link perigoso vira texto: ${href}`, () => {
    assert.equal(safeHref(href), null);
    const [node] = parseInline(`[clique](${href.trim()})`);
    assert.equal(node.type, "text");
  });
}

for (const href of ["https://example.com/a?b=1", "http://localhost:5500", "mailto:a@b.com"]) {
  test(`link permitido: ${href}`, () => {
    assert.equal(safeHref(href), href);
  });
}

test("sublinhado dentro de palavra (snake_case) não vira itálico", () => {
  assert.deepEqual(parseInline("tabela order_items_total e my__var__x"), [
    { type: "text", text: "tabela order_items_total e my__var__x" },
  ]);
  assert.deepEqual(parseInline("_sim_ e __forte__"), [
    { type: "em", children: [{ type: "text", text: "sim" }] },
    { type: "text", text: " e " },
    { type: "strong", children: [{ type: "text", text: "forte" }] },
  ]);
});

test("asterisco solto não vira itálico", () => {
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ type: "text", text: "2 * 3 * 4" }]);
});
