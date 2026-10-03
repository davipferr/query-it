import { getSettings } from './settings.js';
import { selectPreset } from './sql-preset.js';

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
      showError(container, data.error || 'Falha desconhecida.');
      return;
    }

    renderTree(container, data.columns, data.rows, onPickTable, settings.dbType);
  } catch (err) {
    showError(container, err.message);
  }
}

function renderTree(container, columns, rows, onPickTable, dbType) {
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
    const name = document.createElement('span');
    name.className = 'table-name';
    name.textContent = `${schema}.${table}`;
    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'insert-select-btn';
    insertBtn.textContent = 'SELECT';
    summary.append(name, ' ', insertBtn);

    insertBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPickTable(selectPreset(dbType, schema, table));
    });

    const ul = document.createElement('ul');
    for (const c of cols) {
      const li = document.createElement('li');
      const type = document.createElement('span');
      type.className = 'col-type';
      type.textContent = c.type;
      li.append(`${c.name} `, type);
      ul.appendChild(li);
    }

    details.append(summary, ul);
    container.appendChild(details);
  }
}

// Nomes de tabela/coluna e mensagens de erro vêm do banco: sempre como texto, nunca HTML.
function showError(container, message) {
  const p = document.createElement('p');
  p.className = 'hint error';
  p.textContent = message;
  container.replaceChildren(p);
}
