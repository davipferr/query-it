// Kernel: cada variável tem dona, e remover ou rodar de novo uma célula limpa só o que é dela.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getState, toVarName, replaceVarsOf, removeVarsOf } from "../../js/notebook/kernel-state.js";

beforeEach(() => {
  for (const owner of ["a", "b"]) removeVarsOf(owner);
});

test("rodar de novo troca as variáveis da célula, sem deixar o nome antigo", () => {
  replaceVarsOf("a", [["clientes", 1]]);
  replaceVarsOf("a", [["customers", 2]]);
  assert.deepEqual({ ...getState() }, { customers: 2 });
});

test("remover a célula apaga só as variáveis que ainda são dela", () => {
  replaceVarsOf("a", [["x", 1], ["y", 2]]);
  replaceVarsOf("b", [["y", 3]]);
  removeVarsOf("a");
  assert.deepEqual({ ...getState() }, { y: 3 });
});

test("__proto__ vira uma variável comum", () => {
  replaceVarsOf("a", [["__proto__", { hacked: true }]]);
  assert.equal(getState().hacked, undefined);
  assert.deepEqual(Object.keys(getState()), ["__proto__"]);
});

test("toVarName gera identificadores válidos", () => {
  assert.equal(toVarName("minha tabela"), "minha_tabela");
  assert.equal(toVarName("1st"), "_1st");
  assert.equal(toVarName(" ok "), "ok");
});
