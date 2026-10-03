import { getState } from "./kernel-state.js";
import * as charts from "../charts.js";
import { h, show } from "../lib/dom.js";

// Executa o código da célula com acesso direto às variáveis de células SQL/JS
// anteriores (via kernel-state), ao utilitário `charts` e ao elemento de saída (`el`).
export function runJsCell({ code, outputEl, statusEl }) {
  show(outputEl);
  const state = getState();
  const names = Object.keys(state);
  const values = Object.values(state);

  const started = performance.now();
  try {
    // `vars` vem antes das variáveis para que uma célula chamada "vars" a sobrescreva.
    // É uma cópia rasa: reatribuir uma chave dentro da célula não altera o kernel.
    const fn = new Function("charts", "el", "console", "vars", ...names, code);
    const result = fn(charts, outputEl, console, { ...state }, ...values);
    const elapsed = Math.round(performance.now() - started);
    statusEl.textContent = `OK em ${elapsed}ms`;

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
  } catch (err) {
    statusEl.textContent = "Erro";
    show(outputEl, h("div", { className: "error" }, err.message));
  }
}
