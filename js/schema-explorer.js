import { getSettings } from './settings.js';
import { INTROSPECTION, selectPreset } from './sql-preset.js';
import { runQuery, missingSetting } from './lib/api.js';
import { h, show, showMessage } from './lib/dom.js';

export function initSchemaExplorer({ container, onPickTable }) {
  const loadBtn = document.getElementById('load-schema');
  loadBtn.addEventListener('click', () => loadSchema(container, onPickTable));
}

async function loadSchema(container, onPickTable) {
  if (missingSetting()) {
    showMessage(container, 'Configure a conexão em Configurações primeiro.');
    return;
  }

  const { dbType } = getSettings();
  showMessage(container, 'Carregando schema…');

  try {
    const data = await runQuery(INTROSPECTION[dbType]);
    renderTree(container, data.columns, data.rows, onPickTable, dbType);
  } catch (err) {
    showMessage(container, err.message, 'hint error');
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

  if (tables.size === 0) {
    showMessage(container, 'Nenhuma tabela encontrada.');
    return;
  }

  // Nomes de tabela/coluna e tipos vêm do banco: h() sempre os trata como texto.
  show(
    container,
    [...tables.values()].map(({ schema, table, columns: cols }) =>
      h(
        'details',
        {},
        h(
          'summary',
          {},
          h('span', { className: 'table-name' }, `${schema}.${table}`),
          ' ',
          h(
            'button',
            {
              type: 'button',
              className: 'insert-select-btn',
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onPickTable(selectPreset(dbType, schema, table));
              },
            },
            'SELECT',
          ),
        ),
        h('ul', {}, cols.map((c) => h('li', {}, `${c.name} `, h('span', { className: 'col-type' }, c.type)))),
      ),
    ),
  );
}
