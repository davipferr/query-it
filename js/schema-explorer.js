import { getSettings } from './settings.js';
import { INTROSPECTION, selectPreset } from './sql-preset.js';
import { runQuery, missingSetting } from './lib/api.js';
import { h, show, showMessage } from './lib/dom.js';
import { setSchemaTables, filterSchemaTables } from './notebook/sql-schema.js';

// Tabelas da última carga, para o filtro redesenhar sem consultar o banco de novo.
let loaded = [];
// Cada carga e cada troca de conexão incrementam: resposta de uma carga anterior é ignorada.
let loadGeneration = 0;

export function initSchemaExplorer({ container, onPickTable }) {
  const loadBtn = document.getElementById('load-schema');
  const filterEl = document.getElementById('schema-filter');
  loadBtn.addEventListener('click', () => loadSchema(container, filterEl, onPickTable));
  filterEl.addEventListener('input', () => {
    if (loaded.length) renderTree(container, filterEl.value, onPickTable);
  });
}

// Conexão trocada: o schema e o autocompletar eram do banco anterior. Esvaziar o schema também
// avisa os editores (onSchemaChange), que recarregam o SQL com o dialeto da conexão nova.
export function resetSchemaExplorer(container) {
  loadGeneration += 1;
  loaded = [];
  setSchemaTables([]);
  showMessage(container, 'Conexão trocada. Clique em "Carregar" para ver o schema.');
}

async function loadSchema(container, filterEl, onPickTable) {
  if (missingSetting()) {
    showMessage(container, 'Configure a conexão em Configurações primeiro.');
    return;
  }

  // Lida uma vez: se a conexão trocar durante a consulta, a resposta é de outro banco e é descartada.
  const settings = getSettings();
  const generation = ++loadGeneration;
  showMessage(container, 'Carregando schema…');

  try {
    const data = await runQuery(INTROSPECTION[settings.dbType], { settings });
    if (generation !== loadGeneration) return;
    loaded = groupTables(data.columns, data.rows);
    setSchemaTables(loaded);
    renderTree(container, filterEl.value, onPickTable);
  } catch (err) {
    if (generation !== loadGeneration) return;
    showMessage(container, err.message, 'hint error');
  }
}

function groupTables(columns, rows) {
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  const tables = new Map();
  for (const row of rows) {
    const schema = row[idx.table_schema];
    const table = row[idx.table_name];
    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, { schema, table, columns: [] });
    tables.get(key).columns.push({ name: row[idx.column_name], type: row[idx.data_type] });
  }
  return [...tables.values()];
}

function renderTree(container, filterText, onPickTable) {
  if (loaded.length === 0) {
    showMessage(container, 'Nenhuma tabela encontrada.');
    return;
  }
  const visible = filterSchemaTables(loaded, filterText);
  if (visible.length === 0) {
    showMessage(container, 'Nenhuma tabela ou coluna corresponde ao filtro.');
    return;
  }

  const { dbType } = getSettings();
  // Nomes de tabela/coluna e tipos vêm do banco: h() sempre os trata como texto.
  // Tabela que entrou pelo nome de uma coluna já abre, com a coluna destacada.
  show(
    container,
    visible.map(({ schema, table, columns: cols, matchedColumns }) =>
      h(
        'details',
        { open: matchedColumns.length > 0 },
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
        h(
          'ul',
          {},
          cols.map((c) =>
            h(
              'li',
              { className: matchedColumns.includes(c.name) ? 'match' : undefined },
              `${c.name} `,
              h('span', { className: 'col-type' }, c.type),
            ),
          ),
        ),
      ),
    ),
  );
}
