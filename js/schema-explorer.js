import { getSettings } from './settings.js';

const INTROSPECTION = {
  postgres: `
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name, ordinal_position
  `,
  mysql: `
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema not in ('mysql', 'information_schema', 'performance_schema', 'sys')
    order by table_schema, table_name, ordinal_position
  `,
  mssql: `
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    order by table_schema, table_name, ordinal_position
  `,
};

export function initSchemaExplorer({ container, onPickTable }) {
  const loadBtn = document.getElementById('load-schema');
  loadBtn.addEventListener('click', () => loadSchema(container, onPickTable));
}

async function loadSchema(container, onPickTable) {
  const settings = getSettings();

  if (!settings.connectionString || !settings.proxyUrl) {
    container.innerHTML = '<p class="hint">Configure a conexão em Configurações primeiro.</p>';
    return;
  }

  const sql = INTROSPECTION[settings.dbType];
  container.innerHTML = '<p class="hint">Carregando schema…</p>';

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

    if (!res.ok) {
      container.innerHTML = `<p class="hint error">${data.error}</p>`;
      return;
    }

    renderTree(container, data.columns, data.rows, onPickTable);
  } catch (err) {
    container.innerHTML = `<p class="hint error">${err.message}</p>`;
  }
}

function renderTree(container, columns, rows, onPickTable) {
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  const tables = new Map();

  for (const row of rows) {
    const schema = row[idx.table_schema];
    const table = row[idx.table_name];
    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, { schema, table, columns: [] });
    tables.get(key).columns.push({ name: row[idx.column_name], type: row[idx.data_type] });
  }

  container.innerHTML = '';

  if (tables.size === 0) {
    container.innerHTML = '<p class="hint">Nenhuma tabela encontrada.</p>';
    return;
  }

  for (const { schema, table, columns: cols } of tables.values()) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="table-name">${schema}.${table}</span>
      <button type="button" class="insert-select-btn">SELECT</button>`;

    summary.querySelector('.insert-select-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPickTable(`SELECT * FROM ${schema}.${table} LIMIT 100`);
    });

    const ul = document.createElement('ul');
    ul.innerHTML = cols.map((c) => `<li>${c.name} <span class="col-type">${c.type}</span></li>`).join('');

    details.append(summary, ul);
    container.appendChild(details);
  }
}
