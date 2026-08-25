import { precheckReadOnly } from '../sql-guard.js';
import { getSettings } from '../settings.js';
import { setVar } from './kernel-state.js';

export async function runSqlCell({ sql, outputEl, statusEl, nameInput, id }) {
  const check = precheckReadOnly(sql);
  if (!check.ok) {
    statusEl.textContent = 'Bloqueado';
    outputEl.innerHTML = `<div class="error">${escapeHtml(check.reason)}</div>`;
    return;
  }

  const settings = getSettings();
  if (!settings.connectionString) {
    outputEl.innerHTML = '<div class="error">Configure a connection string em Configurações.</div>';
    return;
  }
  if (!settings.proxyUrl) {
    outputEl.innerHTML = '<div class="error">Configure o Proxy URL em Configurações.</div>';
    return;
  }

  statusEl.textContent = 'Executando…';
  const started = performance.now();

  try {
    const res = await fetch(settings.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbType: settings.dbType,
        connectionString: settings.connectionString,
        sql,
      }),
    });

    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);

    if (!res.ok) {
      statusEl.textContent = `Erro (${elapsed}ms)`;
      outputEl.innerHTML = `<div class="error">${escapeHtml(data.error || 'Falha desconhecida.')}</div>`;
      return;
    }

    statusEl.textContent = `${data.rowCount} linha(s) em ${data.elapsedMs ?? elapsed}ms${data.truncated ? ' (truncado)' : ''}`;
    renderTable(outputEl, data.columns, data.rows);

    const varName = sanitizeVarName(nameInput?.value || id);
    setVar(varName, {
      columns: data.columns,
      rows: data.rows.map((row) => toObjectRow(data.columns, row)),
    });
  } catch (err) {
    statusEl.textContent = 'Erro de rede';
    outputEl.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
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
    container.innerHTML = '<div class="empty">Sem resultados.</div>';
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
  const tbody = document.createElement('tbody');
  tbody.innerHTML = rows
    .map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(formatCell(v))}</td>`).join('')}</tr>`)
    .join('');
  table.append(thead, tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

function formatCell(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
