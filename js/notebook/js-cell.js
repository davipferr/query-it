import { getState } from "./kernel-state.js";
import * as charts from "../charts.js";

// Executa o código da célula com acesso direto às variáveis de células SQL/JS
// anteriores (via kernel-state), ao utilitário `charts` e ao elemento de saída (`el`).
export function runJsCell({ code, outputEl, statusEl }) {
  outputEl.innerHTML = "";
  const state = getState();
  const names = Object.keys(state);
  const values = Object.values(state);

  const started = performance.now();
  try {
    const fn = new Function("charts", "el", "console", ...names, code);
    const result = fn(charts, outputEl, console, ...values);
    const elapsed = Math.round(performance.now() - started);
    statusEl.textContent = `OK em ${elapsed}ms`;

    if (result !== undefined) {
      const pre = document.createElement("pre");
      pre.textContent =
        typeof result === "object"
          ? JSON.stringify(result, null, 2)
          : String(result);
      outputEl.appendChild(pre);
    }
  } catch (err) {
    statusEl.textContent = "Erro";
    outputEl.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
