import { precheckReadOnly } from '../sql-guard.js';
import { runQuery, missingSetting, ProxyError } from '../lib/api.js';
import { h, show } from '../lib/dom.js';
import { replaceVarsOf, toVarName } from './kernel-state.js';

const MISSING_MESSAGES = {
  connectionString: 'Configure a connection string em Configurações.',
  proxyUrl: 'Configure o Proxy URL em Configurações.',
};

// Resolve com true se a consulta deu certo; "Rodar tudo" para na primeira célula que der false.
// `signal` cancela o fetch, e o proxy então cancela a consulta no banco.
export async function runSqlCell({ sql, outputEl, statusEl, nameInput, id, signal }) {
  const check = precheckReadOnly(sql);
  if (!check.ok) {
    statusEl.textContent = 'Bloqueado';
    showError(outputEl, check.reason);
    return false;
  }

  const missing = missingSetting();
  if (missing) {
    showError(outputEl, MISSING_MESSAGES[missing]);
    return false;
  }

  statusEl.textContent = 'Executando…';
  const started = performance.now();

  try {
    const data = await runQuery(sql, { signal });
    const elapsed = Math.round(performance.now() - started);

    statusEl.textContent = `${data.rowCount} linha(s) em ${data.elapsedMs ?? elapsed}ms${data.truncated ? ' (truncado)' : ''}`;
    renderTable(outputEl, data.columns, data.rows);

    // Dona da variável é a célula: renomear e rodar de novo não deixa o nome antigo no kernel.
    // Célula já removida não grava: ninguém mais removeria a variável.
    if (outputEl.isConnected) replaceVarsOf(id, [[toVarName(nameInput?.value || id), {
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

function renderTable(container, columns, rows) {
  if (!rows.length) {
    show(container, h('div', { className: 'empty' }, 'Sem resultados.'));
    return;
  }
  show(
    container,
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', {}, c)))),
      h('tbody', {}, rows.map((row) => h('tr', {}, row.map((v) => h('td', {}, formatCell(v)))))),
    ),
  );
}

function formatCell(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
