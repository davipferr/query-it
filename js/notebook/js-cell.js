import { getState, replaceVarsOf, toVarName } from "./kernel-state.js";
import * as charts from "../charts.js";
import { h, show } from "../lib/dom.js";

// Construtor de funções async: o código da célula pode usar `await` no topo.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Executa o código da célula com acesso direto às variáveis de células SQL/JS
// anteriores (via kernel-state), ao utilitário `charts` e ao elemento de saída (`el`).
// Resolve com true se a célula terminou sem erro; "Rodar tudo" para no primeiro false.
export async function runJsCell({ code, outputEl, statusEl, id }) {
  show(outputEl);
  const state = getState();
  const names = Object.keys(state);
  const values = Object.values(state);

  // setVar só vale se a célula terminar sem erro: uma célula que falha no meio não deixa
  // metade das variáveis gravadas, igual à célula SQL que só grava com sucesso.
  const pending = new Map();
  const setVar = (name, value) => {
    pending.set(toVarName(name), value);
  };

  statusEl.textContent = "Executando…";
  const started = performance.now();
  try {
    // `vars` e `setVar` vêm antes das variáveis para que uma célula com o mesmo nome os sobrescreva.
    // `vars` é uma cópia rasa: reatribuir uma chave dentro da célula não altera o kernel.
    const fn = new AsyncFunction("charts", "el", "console", "vars", "setVar", ...names, code);
    const result = await fn(charts, outputEl, console, { ...state }, setVar, ...values);
    const elapsed = Math.round(performance.now() - started);
    statusEl.textContent = `OK em ${elapsed}ms`;
    // Célula removida durante um await: gravar agora deixaria variáveis que ninguém mais remove.
    if (outputEl.isConnected) replaceVarsOf(id, [...pending]);

    if (result !== undefined) {
      outputEl.appendChild(
        h(
          "pre",
          {},
          typeof result === "object"
            ? JSON.stringify(result, null, 2)
            : String(result),
        ),
      );
    }
    return true;
  } catch (err) {
    statusEl.textContent = "Erro";
    show(outputEl, h("div", { className: "error" }, err?.message ?? String(err)));
    return false;
  }
}
