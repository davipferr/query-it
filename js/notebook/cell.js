import { runSqlCell } from './sql-cell.js';
import { runJsCell } from './js-cell.js';
import { createEditor, LANGUAGES } from './editor.js';
import { h } from '../lib/dom.js';

let counter = 0;

export function createCell(type) {
  counter += 1;
  const id = `cell_${counter}`;

  const outputEl = h('div', { className: 'cell-output' });
  const statusEl = h('span', { className: 'cell-status' });
  const runBtn = h('button', { type: 'button', className: 'run-btn' }, '▶ Run');
  const removeBtn = h('button', { type: 'button', className: 'remove-btn', title: 'Remover célula' }, '✕');
  const nameInput =
    type === 'sql' ? h('input', { className: 'cell-name', placeholder: 'nome da variável (opcional)', value: id }) : null;
  const languageSelect = h(
    'select',
    { className: 'cell-language', title: 'Linguagem do destaque de sintaxe' },
    Object.entries(LANGUAGES).map(([key, { label }]) => h('option', { value: key, selected: key === type }, label)),
  );
  const sourceEl = h('div', { className: 'cell-source' });

  const el = h(
    'div',
    { className: 'cell' },
    h(
      'div',
      { className: 'cell-header' },
      h('span', { className: 'cell-type' }, type.toUpperCase()),
      nameInput ?? h('span', { style: { flex: '1' } }),
      languageSelect,
      runBtn,
      statusEl,
      removeBtn,
    ),
    sourceEl,
    outputEl,
  );

  // A linguagem do editor muda só o destaque de sintaxe; a execução segue o tipo da célula.
  const editor = createEditor({
    parent: sourceEl,
    language: type,
    placeholderText:
      type === 'sql'
        ? 'SELECT * FROM ...'
        : '// use as variáveis das células SQL/JS anteriores, ex: charts.createBarChart(el, minhaTabela.rows, {x:"nome", y:"total"})',
    onRun: () => runBtn.click(),
  });

  languageSelect.addEventListener('change', () => editor.setLanguage(languageSelect.value));

  runBtn.addEventListener('click', () => {
    if (type === 'sql') {
      runSqlCell({ sql: editor.getValue(), outputEl, statusEl, nameInput, id });
    } else {
      runJsCell({ code: editor.getValue(), outputEl, statusEl });
    }
  });

  removeBtn.addEventListener('click', () => {
    editor.destroy();
    el.remove();
  });

  return { id, type, el, editor, outputEl, statusEl, nameInput };
}

export function insertSqlPreset(container, sqlText) {
  const cell = createCell('sql');
  cell.editor.setValue(sqlText);
  container.appendChild(cell.el);
  cell.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
