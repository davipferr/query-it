import { precheckReadOnly } from '../sql-guard.js';
import { runQuery, missingSetting, ProxyError } from '../lib/api.js';
import { h, show } from '../lib/dom.js';
import { setVar } from './kernel-state.js';

const MISSING_MESSAGES = {
  connectionString: 'Configure a connection string em Configurações.',
  proxyUrl: 'Configure o Proxy URL em Configurações.',
};

export async function runSqlCell({ sql, outputEl, statusEl, nameInput, id }) {
  const check = precheckReadOnly(sql);
  if (!check.ok) {
    statusEl.textContent = 'Bloqueado';
    showError(outputEl, check.reason);
    return;
  }

  const missing = missingSetting();
  if (missing) {
    showError(outputEl, MISSING_MESSAGES[missing]);
    return;
  }

  statusEl.textContent = 'Executando…';
  const started = performance.now();

  try {
    const data = await runQuery(sql);
    const elapsed = Math.round(performance.now() - started);

    statusEl.textContent = `${data.rowCount} linha(s) em ${data.elapsedMs ?? elapsed}ms${data.truncated ? ' (truncado)' : ''}`;
    renderTable(outputEl, data.columns, data.rows);

    const varName = sanitizeVarName(nameInput?.value || id);
    setVar(varName, {
      columns: data.columns,
      rows: data.rows.map((row) => toObjectRow(data.columns, row)),
    });
  } catch (err) {
    const elapsed = Math.round(performance.now() - started);
    statusEl.textContent = err instanceof ProxyError ? `Erro (${elapsed}ms)` : 'Erro de rede';
    showError(outputEl, err.message);
  }
}

function showError(outputEl, message) {
  show(outputEl, h('div', { className: 'error' }, message));
}

function sanitizeVarName(name) {
  const clean = String(name).trim().replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(clean) ? clean : `_${clean}`;
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
