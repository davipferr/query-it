import { runSqlCell } from './sql-cell.js';
import { runJsCell } from './js-cell.js';
import { createEditor, LANGUAGES } from './editor.js';

let counter = 0;

export function createCell(type) {
  counter += 1;
  const id = `cell_${counter}`;

  const languageOptions = Object.entries(LANGUAGES)
    .map(([key, { label }]) => `<option value="${key}"${key === type ? ' selected' : ''}>${label}</option>`)
    .join('');

  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `
    <div class="cell-header">
      <span class="cell-type">${type.toUpperCase()}</span>
      ${type === 'sql' ? `<input class="cell-name" placeholder="nome da variável (opcional)" value="${id}">` : '<span style="flex:1"></span>'}
      <select class="cell-language" title="Linguagem do destaque de sintaxe">${languageOptions}</select>
      <button type="button" class="run-btn">▶ Run</button>
      <span class="cell-status"></span>
      <button type="button" class="remove-btn" title="Remover célula">✕</button>
    </div>
    <div class="cell-source"></div>
    <div class="cell-output"></div>
  `;

  const outputEl = el.querySelector('.cell-output');
  const statusEl = el.querySelector('.cell-status');
  const runBtn = el.querySelector('.run-btn');
  const removeBtn = el.querySelector('.remove-btn');
  const nameInput = el.querySelector('.cell-name');
  const languageSelect = el.querySelector('.cell-language');

  // A linguagem do editor muda só o destaque de sintaxe; a execução segue o tipo da célula.
  const editor = createEditor({
    parent: el.querySelector('.cell-source'),
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
    editor.view.destroy();
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
