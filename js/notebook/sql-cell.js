import { precheckReadOnly } from '../sql-guard.js';
import { runQuery, missingSetting, ProxyError } from '../lib/api.js';
import { h, show } from '../lib/dom.js';
import { replaceVarsOf, toVarName } from './kernel-state.js';
import { renderResult, destroyResult } from './result-view.js';
import { getSettings } from '../settings.js';
import { addToHistory, connectionKey } from '../history.js';

const MISSING_MESSAGES = {
  connectionString: 'Configure a connection string em Configurações.',
  proxyUrl: 'Configure o Proxy URL em Configurações.',
};

// Resolve com true se a consulta deu certo; "Rodar tudo" para na primeira célula que der false.
// `signal` cancela o fetch, e o proxy então cancela a consulta no banco.
export async function runSqlCell({ sql, outputEl, statusEl, nameInput, id, signal }) {
  // A saída anterior vai ser trocada (resultado novo ou erro): solta o gráfico dela antes.
  destroyResult(outputEl);
  const check = precheckReadOnly(sql);
  if (!check.ok) {
    statusEl.textContent = 'Bloqueado';
    showError(outputEl, check.reason);
    return false;
  }

  // Lidas uma vez: trocar de conexão durante a consulta não muda para onde ela foi
  // nem em qual histórico ela entra.
  const settings = getSettings();
  const missing = missingSetting(settings);
  if (missing) {
    showError(outputEl, MISSING_MESSAGES[missing]);
    return false;
  }

  statusEl.textContent = 'Executando…';
  const started = performance.now();

  try {
    const data = await runQuery(sql, { settings, signal });
    const elapsed = Math.round(performance.now() - started);
    const varName = toVarName(nameInput?.value || id);

    statusEl.textContent = `${data.rowCount} linha(s) em ${data.elapsedMs ?? elapsed}ms${data.truncated ? ' (truncado)' : ''}`;
    renderResult(outputEl, { columns: data.columns, rows: data.rows, name: varName });
    recordHistory(settings, sql);

    // Dona da variável é a célula: renomear e rodar de novo não deixa o nome antigo no kernel.
    // Célula já removida não grava: ninguém mais removeria a variável.
    if (outputEl.isConnected) replaceVarsOf(id, [[varName, {
      columns: data.columns,
      rows: data.rows.map((row) => toObjectRow(data.columns, row)),
    }]]);
    return true;
  } catch (err) {
    const elapsed = Math.round(performance.now() - started);
    if (signal?.aborted) {
      statusEl.textContent = `Cancelada (${elapsed}ms)`;
      showError(outputEl, 'Consulta cancelada.');
      return false;
    }
    statusEl.textContent = err instanceof ProxyError ? `Erro (${elapsed}ms)` : 'Erro de rede';
    showError(outputEl, err.message);
    return false;
  }
}

// Em segundo plano e sem erro visível: crypto.subtle só existe em origem segura (https ou
// localhost), e o histórico é conveniência; falhar nele não pode marcar a consulta como erro.
function recordHistory(settings, sql) {
  connectionKey(settings)
    .then((key) => addToHistory(key, sql))
    .catch(() => {});
}

function showError(outputEl, message) {
  show(outputEl, h('div', { className: 'error' }, message));
}

function toObjectRow(columns, row) {
  const obj = {};
  columns.forEach((c, i) => {
    obj[c] = row[i];
  });
  return obj;
}
