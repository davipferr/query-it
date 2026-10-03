import { initSettingsUI, getSettings } from './settings.js';
import { createCell, insertSqlPreset } from './notebook/cell.js';
import { initSchemaExplorer } from './schema-explorer.js';

const cellsContainer = document.getElementById('cells');

document.getElementById('add-sql-cell').addEventListener('click', () => {
  const cell = createCell('sql');
  cellsContainer.appendChild(cell.el);
  cell.editor.focus();
});

document.getElementById('add-js-cell').addEventListener('click', () => {
  const cell = createCell('js');
  cellsContainer.appendChild(cell.el);
  cell.editor.focus();
});

const settingsUI = initSettingsUI();

initSchemaExplorer({
  container: document.getElementById('schema-tree'),
  onPickTable: (sql) => insertSqlPreset(cellsContainer, sql),
});

if (!getSettings().connectionString) {
  settingsUI.open();
}
